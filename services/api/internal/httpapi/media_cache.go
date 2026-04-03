package httpapi

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/objectstore"
	"babyalbum/api/internal/store"
)

var errInsufficientLocalStorage = errors.New("insufficient local storage")

type mediaStateStore interface {
	MediaByPublicID(mediaID string) (domain.MediaAsset, error)
	BabyByPublicID(babyID string) (domain.BabyProfile, error)
	ResolveOriginalStatus(userID, albumID, mediaID string, triggerRestore bool) (domain.MediaAsset, error)
	RecordOriginalAccess(mediaID string, accessedAt time.Time) error
	ReferencedBlobKeys() ([]string, error)
	PreviewBlobAssets(limit int) ([]domain.MediaAsset, error)
	LocalOriginalBlobAssets(limit int) ([]domain.MediaAsset, error)
	AvatarBabies(limit int) ([]domain.BabyProfile, error)
	MarkPreviewMissing(mediaID string) error
	AttachPreviewBlob(mediaID string, input store.PreviewBlobAttachmentInput) error
	MarkScreenPreviewMissing(mediaID string) error
	AttachScreenPreview(mediaID string, input store.ScreenPreviewAttachmentInput) error
	LocalOriginalEvictionCandidates(limit int, processedBefore time.Time) ([]domain.MediaAsset, error)
	MarkOriginalEvicted(mediaID string, evictedAt time.Time) error
	AttachLocalOriginalBlob(mediaID, blobKey string, accessedAt time.Time) error
	MarkOriginalBlobMissing(mediaID string) error
	ClearBabyAvatar(babyID string) error
}

type mediaCacheController struct {
	store               mediaStateStore
	blob                *blob.Storage
	screenPreviews      objectstore.Store
	localMaxBytes       int64
	localTargetBytes    int64
	localMinRetention   time.Duration
	maintenanceInterval time.Duration
	mu                  sync.Mutex
}

func newMediaCacheController(store mediaStateStore, blobStore *blob.Storage, screenPreviews objectstore.Store, options Options) *mediaCacheController {
	localMaxBytes := options.LocalStorageMaxBytes
	if localMaxBytes <= 0 {
		localMaxBytes = 50 << 30
	}
	localTargetBytes := options.LocalStorageTargetBytes
	if localTargetBytes <= 0 || localTargetBytes > localMaxBytes {
		localTargetBytes = 35 << 30
	}
	localMinRetention := options.LocalOriginalMinRetention
	if localMinRetention <= 0 {
		localMinRetention = 30 * 24 * time.Hour
	}
	maintenanceInterval := options.LocalMaintenanceInterval
	if maintenanceInterval <= 0 {
		maintenanceInterval = 15 * time.Minute
	}
	return &mediaCacheController{
		store:               store,
		blob:                blobStore,
		screenPreviews:      screenPreviews,
		localMaxBytes:       localMaxBytes,
		localTargetBytes:    localTargetBytes,
		localMinRetention:   localMinRetention,
		maintenanceInterval: maintenanceInterval,
	}
}

func (c *mediaCacheController) Run() {
	c.runMaintenance()
	ticker := time.NewTicker(c.maintenanceInterval)
	defer ticker.Stop()
	for range ticker.C {
		c.runMaintenance()
	}
}

func (c *mediaCacheController) RunNow() {
	go c.runMaintenance()
}

func (c *mediaCacheController) EnsureSpace(expectedBytes int64) error {
	if expectedBytes <= 0 || c.localMaxBytes <= 0 {
		return nil
	}
	used, err := c.blob.UsedBytes()
	if err != nil {
		return err
	}
	if used+expectedBytes <= c.localMaxBytes {
		return nil
	}
	c.runMaintenance()
	used, err = c.blob.UsedBytes()
	if err != nil {
		return err
	}
	if used+expectedBytes > c.localMaxBytes {
		return errInsufficientLocalStorage
	}
	return nil
}

func (c *mediaCacheController) RepairMissingPreview(item domain.MediaAsset) {
	c.mu.Lock()
	defer c.mu.Unlock()
	_, _ = c.ensureMediaPreviewsLocked(context.Background(), item)
}

func (c *mediaCacheController) EnsureMediaPreviews(ctx context.Context, item domain.MediaAsset) (domain.MediaAsset, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ensureMediaPreviewsLocked(ctx, item)
}

func (c *mediaCacheController) DeleteWarmObject(ctx context.Context, key string) error {
	if c.screenPreviews == nil || !c.screenPreviews.Enabled() || strings.TrimSpace(key) == "" {
		return nil
	}
	return c.screenPreviews.Delete(ctx, key)
}

func (c *mediaCacheController) runMaintenance() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.reconcileMissingBlobReferences()
	c.cleanupOrphanBlobs()
	c.evictLocalOriginals()
}

func (c *mediaCacheController) reconcileMissingBlobReferences() {
	previews, err := c.store.PreviewBlobAssets(1024)
	if err == nil {
		for _, item := range previews {
			if item.PreviewStatus == domain.PreviewReady && c.localBlobExists(item.PreviewBlobKey) && item.ScreenPreviewStatus == domain.PreviewReady && c.screenPreviewExists(context.Background(), item.ScreenPreviewObjectKey) {
				continue
			}
			_, _ = c.ensureMediaPreviewsLocked(context.Background(), item)
		}
	}

	originals, err := c.store.LocalOriginalBlobAssets(1024)
	if err == nil {
		for _, item := range originals {
			if c.localBlobExists(item.OriginalBlobKey) {
				continue
			}
			_ = c.store.MarkOriginalBlobMissing(item.ID)
		}
	}

	babies, err := c.store.AvatarBabies(1024)
	if err == nil {
		for _, baby := range babies {
			if c.localBlobExists(baby.AvatarKey) {
				continue
			}
			_ = c.store.ClearBabyAvatar(baby.ID)
		}
	}
}

func (c *mediaCacheController) ensureMediaPreviewsLocked(ctx context.Context, item domain.MediaAsset) (domain.MediaAsset, error) {
	if item.ScreenPreviewStatus != domain.PreviewReady || !c.screenPreviewExists(ctx, item.ScreenPreviewObjectKey) {
		_ = c.store.MarkScreenPreviewMissing(item.ID)
		item.ScreenPreviewStatus = domain.PreviewUnavailable
		item.ScreenPreviewObjectKey = ""
		if updated, err := c.attachScreenPreviewFromBestSourceLocked(ctx, item); err == nil {
			item = updated
		}
	}

	if item.PreviewStatus != domain.PreviewReady || !c.localBlobExists(item.PreviewBlobKey) {
		_ = c.store.MarkPreviewMissing(item.ID)
		item.PreviewStatus = domain.PreviewUnavailable
		item.PreviewBlobKey = ""
		if updated, err := c.attachThumbFromBestSourceLocked(ctx, item); err == nil {
			item = updated
		}
	}

	return item, nil
}

func (c *mediaCacheController) attachScreenPreviewFromBestSourceLocked(ctx context.Context, item domain.MediaAsset) (domain.MediaAsset, error) {
	if strings.TrimSpace(item.OriginalBlobKey) != "" && c.localBlobExists(item.OriginalBlobKey) {
		if updated, err := c.attachScreenPreviewFromSourcePathLocked(ctx, item, filepath.Join(c.blob.Root(), strings.TrimSpace(item.OriginalBlobKey)), item.OriginalBlobKey); err == nil {
			return updated, nil
		}
	}
	return item, store.ErrNotFound
}

func (c *mediaCacheController) attachScreenPreviewFromSourcePathLocked(ctx context.Context, item domain.MediaAsset, sourcePath, sourceBlobKey string) (domain.MediaAsset, error) {
	if width, height, encoded, err := generateBestStillImagePreview(sourcePath, item.MediaType, item.FileName, 1600, 84); err == nil {
		objectKey, saveErr := c.saveScreenPreviewObject(ctx, sourceBlobKey, item.FileName, encoded)
		if saveErr != nil {
			return item, saveErr
		}
		if err := c.store.AttachScreenPreview(item.ID, store.ScreenPreviewAttachmentInput{ObjectKey: objectKey}); err != nil {
			return item, err
		}
		item.ScreenPreviewStatus = domain.PreviewReady
		item.ScreenPreviewObjectKey = objectKey
		if width > 0 {
			item.Width = width
		}
		if height > 0 {
			item.Height = height
		}
		return item, nil
	}
	if width, height, encoded, err := generateVideoPreview(sourcePath, 1600, 84); err == nil {
		objectKey, saveErr := c.saveScreenPreviewObject(ctx, sourceBlobKey, item.FileName, encoded)
		if saveErr != nil {
			return item, saveErr
		}
		if err := c.store.AttachScreenPreview(item.ID, store.ScreenPreviewAttachmentInput{ObjectKey: objectKey}); err != nil {
			return item, err
		}
		item.ScreenPreviewStatus = domain.PreviewReady
		item.ScreenPreviewObjectKey = objectKey
		if width > 0 {
			item.Width = width
		}
		if height > 0 {
			item.Height = height
		}
		return item, nil
	}
	return item, store.ErrNotFound
}

func (c *mediaCacheController) attachThumbFromBestSourceLocked(ctx context.Context, item domain.MediaAsset) (domain.MediaAsset, error) {
	if strings.TrimSpace(item.ScreenPreviewObjectKey) != "" && c.screenPreviewExists(ctx, item.ScreenPreviewObjectKey) {
		return c.attachThumbFromScreenPreviewLocked(ctx, item)
	}
	updated, err := c.attachScreenPreviewFromBestSourceLocked(ctx, item)
	if err != nil {
		return item, err
	}
	return c.attachThumbFromScreenPreviewLocked(ctx, updated)
}

func (c *mediaCacheController) attachThumbFromScreenPreviewLocked(ctx context.Context, item domain.MediaAsset) (domain.MediaAsset, error) {
	result, err := c.screenPreviews.Get(ctx, item.ScreenPreviewObjectKey)
	if err != nil {
		return item, err
	}
	defer result.Body.Close()

	sourcePath, cleanup, err := c.copyReaderToTempFile(item.FileName, result.Body)
	if err != nil {
		return item, err
	}
	defer cleanup()
	return c.attachThumbFromSourcePathLocked(item, sourcePath, firstNonEmptyBlobKey(item.ScreenPreviewObjectKey, item.ID))
}

func (c *mediaCacheController) attachThumbFromSourcePathLocked(item domain.MediaAsset, sourcePath, sourceBlobKey string) (domain.MediaAsset, error) {
	if width, height, encoded, err := generateBestStillImagePreview(sourcePath, item.MediaType, item.FileName, 480, 82); err == nil {
		blobKey, saveErr := c.savePreviewBlob(sourceBlobKey, item.FileName, encoded)
		if saveErr != nil {
			return item, saveErr
		}
		if err := c.store.AttachPreviewBlob(item.ID, store.PreviewBlobAttachmentInput{BlobKey: blobKey, Width: width, Height: height}); err != nil {
			return item, err
		}
		item.PreviewStatus = domain.PreviewReady
		item.PreviewBlobKey = blobKey
		return item, nil
	}
	if width, height, encoded, err := generateVideoPreview(sourcePath, 480, 82); err == nil {
		blobKey, saveErr := c.savePreviewBlob(sourceBlobKey, item.FileName, encoded)
		if saveErr != nil {
			return item, saveErr
		}
		if err := c.store.AttachPreviewBlob(item.ID, store.PreviewBlobAttachmentInput{BlobKey: blobKey, Width: width, Height: height}); err != nil {
			return item, err
		}
		item.PreviewStatus = domain.PreviewReady
		item.PreviewBlobKey = blobKey
		return item, nil
	}
	return item, store.ErrNotFound
}

func (c *mediaCacheController) savePreviewBlob(sourceBlobKey, originalName string, data []byte) (string, error) {
	if len(data) == 0 {
		return "", store.ErrNotFound
	}
	if c.localMaxBytes > 0 {
		used, err := c.blob.UsedBytes()
		if err != nil {
			return "", err
		}
		if used+int64(len(data)) > c.localMaxBytes {
			return "", errInsufficientLocalStorage
		}
	}
	prefix := strings.TrimSuffix(filepath.Base(strings.TrimSpace(sourceBlobKey)), filepath.Ext(strings.TrimSpace(sourceBlobKey))) + "-preview"
	if strings.TrimSpace(prefix) == "" {
		prefix = "preview"
	}
	saved, err := c.blob.SaveBytes(prefix, previewFileName(originalName), data)
	if err != nil {
		return "", err
	}
	return saved.Key, nil
}

func (c *mediaCacheController) saveScreenPreviewObject(ctx context.Context, sourceBlobKey, originalName string, data []byte) (string, error) {
	if len(data) == 0 {
		return "", store.ErrNotFound
	}
	if c.screenPreviews == nil || !c.screenPreviews.Enabled() {
		return "", store.ErrNotFound
	}
	key := screenPreviewObjectKey(sourceBlobKey, originalName)
	saved, err := c.screenPreviews.PutBytes(ctx, key, data, "image/jpeg")
	if err != nil {
		return "", err
	}
	return saved.Key, nil
}

func (c *mediaCacheController) localBlobExists(key string) bool {
	if strings.TrimSpace(key) == "" {
		return false
	}
	file, err := c.blob.Open(key)
	if err != nil {
		return false
	}
	_ = file.Close()
	return true
}

func (c *mediaCacheController) screenPreviewExists(ctx context.Context, key string) bool {
	if c.screenPreviews == nil || !c.screenPreviews.Enabled() || strings.TrimSpace(key) == "" {
		return false
	}
	result, err := c.screenPreviews.Get(ctx, key)
	if err != nil {
		return false
	}
	_ = result.Body.Close()
	return true
}

func (c *mediaCacheController) copyReaderToTempFile(fileName string, reader io.Reader) (string, func(), error) {
	tempDir, err := os.MkdirTemp("", "baby-album-preview-repair-*")
	if err != nil {
		return "", func() {}, err
	}
	cleanup := func() { _ = os.RemoveAll(tempDir) }
	sourcePath := filepath.Join(tempDir, filepath.Base(strings.TrimSpace(fileName)))
	file, err := os.Create(sourcePath)
	if err != nil {
		cleanup()
		return "", func() {}, err
	}
	if _, err := io.Copy(file, reader); err != nil {
		_ = file.Close()
		cleanup()
		return "", func() {}, err
	}
	if err := file.Close(); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return sourcePath, cleanup, nil
}

func firstNonEmptyBlobKey(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func (c *mediaCacheController) cleanupOrphanBlobs() {
	keys, err := c.store.ReferencedBlobKeys()
	if err != nil {
		return
	}
	referenced := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		referenced[strings.TrimSpace(key)] = struct{}{}
	}
	entries, err := os.ReadDir(c.blob.Root())
	if err != nil {
		if os.IsNotExist(err) {
			return
		}
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if _, ok := referenced[entry.Name()]; ok {
			continue
		}
		_ = os.Remove(filepath.Join(c.blob.Root(), entry.Name()))
	}
}

func (c *mediaCacheController) evictLocalOriginals() {
	usedBytes, err := c.blob.UsedBytes()
	if err != nil || usedBytes <= c.localMaxBytes {
		return
	}
	candidates, err := c.store.LocalOriginalEvictionCandidates(256, time.Now().UTC().Add(-c.localMinRetention))
	if err != nil {
		return
	}
	for _, item := range candidates {
		if usedBytes <= c.localTargetBytes {
			break
		}
		if err := c.blob.Delete(item.OriginalBlobKey); err != nil {
			continue
		}
		if err := c.store.MarkOriginalEvicted(item.ID, time.Now().UTC()); err != nil {
			continue
		}
		usedBytes -= item.ByteSize
	}
}
