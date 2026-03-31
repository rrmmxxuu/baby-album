package httpapi

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/r2cache"
	"babyalbum/api/internal/store"
)

var errInsufficientLocalStorage = errors.New("insufficient local storage")

type mediaStateStore interface {
	MediaByPublicID(mediaID string) (domain.MediaAsset, error)
	BabyByPublicID(babyID string) (domain.BabyProfile, error)
	ResolveOriginalStatus(userID, albumID, mediaID string, triggerRestore bool) (domain.MediaAsset, error)
	RecordOriginalAccess(mediaID string, accessedAt time.Time) error
	ReferencedBlobKeys() ([]string, error)
	LocalOriginalEvictionCandidates(limit int, processedBefore time.Time) ([]domain.MediaAsset, error)
	MarkOriginalEvicted(mediaID string, evictedAt time.Time) error
	AttachLocalOriginalBlob(mediaID, blobKey string, accessedAt time.Time) error
	MarkOriginalR2Uploaded(mediaID, r2Key string) error
	MarkOriginalR2Missing(mediaID string) error
	CurrentMonthR2Usage(monthKey string) (int64, int64, error)
	AddR2Usage(monthKey string, classA, classB int64) error
	R2Footprint() (int64, error)
	R2EvictionCandidates(limit int) ([]domain.MediaAsset, error)
}

type mediaCacheController struct {
	store               mediaStateStore
	blob                *blob.Storage
	r2                  *r2cache.Client
	localMaxBytes       int64
	localTargetBytes    int64
	localMinRetention   time.Duration
	maintenanceInterval time.Duration
	r2MaxBytes          int64
	r2TargetBytes       int64
	r2ClassASoftLimit   int64
	r2ClassBSoftLimit   int64
	mu                  sync.Mutex
}

func newMediaCacheController(store mediaStateStore, blobStore *blob.Storage, options Options) *mediaCacheController {
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
	r2MaxBytes := options.R2MaxBytes
	if r2MaxBytes <= 0 {
		r2MaxBytes = 8 << 30
	}
	r2TargetBytes := options.R2TargetBytes
	if r2TargetBytes <= 0 || r2TargetBytes > r2MaxBytes {
		r2TargetBytes = 6 << 30
	}
	r2ClassASoftLimit := options.R2ClassASoftLimit
	if r2ClassASoftLimit <= 0 {
		r2ClassASoftLimit = 800_000
	}
	r2ClassBSoftLimit := options.R2ClassBSoftLimit
	if r2ClassBSoftLimit <= 0 {
		r2ClassBSoftLimit = 8_000_000
	}
	return &mediaCacheController{
		store:               store,
		blob:                blobStore,
		r2:                  r2cache.New(options.R2Config),
		localMaxBytes:       localMaxBytes,
		localTargetBytes:    localTargetBytes,
		localMinRetention:   localMinRetention,
		maintenanceInterval: maintenanceInterval,
		r2MaxBytes:          r2MaxBytes,
		r2TargetBytes:       r2TargetBytes,
		r2ClassASoftLimit:   r2ClassASoftLimit,
		r2ClassBSoftLimit:   r2ClassBSoftLimit,
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

func (c *mediaCacheController) PromoteOriginalToWarmCache(ctx context.Context, item domain.MediaAsset) error {
	if !c.r2.Enabled() || strings.TrimSpace(item.OriginalBlobKey) == "" {
		return nil
	}
	if !c.allowR2Usage(1, 0) {
		return nil
	}
	localPath := filepath.Join(c.blob.Root(), strings.TrimSpace(item.OriginalBlobKey))
	if _, err := os.Stat(localPath); err != nil {
		return err
	}
	r2Key := warmCacheKey(item)
	if _, err := c.r2.PutFile(ctx, r2Key, localPath, item.MediaType); err != nil {
		return err
	}
	if err := c.store.MarkOriginalR2Uploaded(item.ID, r2Key); err != nil {
		return err
	}
	return c.recordR2Usage(1, 0)
}

func (c *mediaCacheController) RestoreLocalOriginalFromWarmCache(ctx context.Context, item domain.MediaAsset) (domain.MediaAsset, error) {
	if !c.r2.Enabled() || item.OriginalR2State != "online" || strings.TrimSpace(item.OriginalR2Key) == "" {
		return item, store.ErrNotFound
	}
	if !c.allowR2Usage(0, 1) {
		return item, store.ErrNotFound
	}
	result, err := c.r2.Get(ctx, item.OriginalR2Key)
	if err != nil {
		if errors.Is(err, r2cache.ErrNotFound) {
			_ = c.store.MarkOriginalR2Missing(item.ID)
			item.OriginalR2State = "missing"
			item.OriginalR2Key = ""
			return item, store.ErrNotFound
		}
		return item, err
	}
	defer result.Body.Close()
	if result.ContentLength > 0 {
		if err := c.EnsureSpace(result.ContentLength); err != nil {
			return item, err
		}
	}
	saved, err := c.blob.SaveReader(item.ID, item.FileName, result.Body)
	if err != nil {
		return item, err
	}
	now := time.Now().UTC()
	if err := c.store.AttachLocalOriginalBlob(item.ID, saved.Key, now); err != nil {
		return item, err
	}
	if err := c.store.RecordOriginalAccess(item.ID, now); err != nil {
		return item, err
	}
	if err := c.recordR2Usage(0, 1); err != nil {
		return item, err
	}
	item.OriginalBlobKey = saved.Key
	item.OriginalLocalState = "online"
	item.OriginalLastAccessedAt = &now
	return item, nil
}

func (c *mediaCacheController) OpenWarmOriginal(ctx context.Context, item domain.MediaAsset) (r2cache.GetResult, error) {
	if !c.r2.Enabled() || item.OriginalR2State != "online" || strings.TrimSpace(item.OriginalR2Key) == "" {
		return r2cache.GetResult{}, store.ErrNotFound
	}
	if !c.allowR2Usage(0, 1) {
		return r2cache.GetResult{}, store.ErrNotFound
	}
	result, err := c.r2.Get(ctx, item.OriginalR2Key)
	if err != nil {
		if errors.Is(err, r2cache.ErrNotFound) {
			_ = c.store.MarkOriginalR2Missing(item.ID)
			return r2cache.GetResult{}, store.ErrNotFound
		}
		return r2cache.GetResult{}, err
	}
	_ = c.recordR2Usage(0, 1)
	return result, nil
}

func (c *mediaCacheController) DeleteWarmObject(ctx context.Context, key string) error {
	if !c.r2.Enabled() || strings.TrimSpace(key) == "" {
		return nil
	}
	return c.r2.Delete(ctx, key)
}

func (c *mediaCacheController) runMaintenance() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cleanupOrphanBlobs()
	c.evictLocalOriginals()
	c.trimWarmCache()
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
		if item.OriginalLastAccessedAt != nil {
			_ = c.PromoteOriginalToWarmCache(context.Background(), item)
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

func (c *mediaCacheController) trimWarmCache() {
	if !c.r2.Enabled() {
		return
	}
	usedBytes, err := c.store.R2Footprint()
	if err != nil || usedBytes <= c.r2MaxBytes {
		return
	}
	candidates, err := c.store.R2EvictionCandidates(256)
	if err != nil {
		return
	}
	for _, item := range candidates {
		if usedBytes <= c.r2TargetBytes {
			break
		}
		if strings.TrimSpace(item.OriginalR2Key) == "" {
			continue
		}
		if !c.allowR2Usage(1, 0) {
			return
		}
		if err := c.r2.Delete(context.Background(), item.OriginalR2Key); err != nil {
			continue
		}
		if err := c.store.MarkOriginalR2Missing(item.ID); err != nil {
			continue
		}
		_ = c.recordR2Usage(1, 0)
		usedBytes -= item.ByteSize
	}
}

func (c *mediaCacheController) allowR2Usage(classA, classB int64) bool {
	if !c.r2.Enabled() {
		return false
	}
	monthKey := time.Now().UTC().Format("2006-01")
	currentA, currentB, err := c.store.CurrentMonthR2Usage(monthKey)
	if err != nil {
		return false
	}
	return currentA+classA <= c.r2ClassASoftLimit && currentB+classB <= c.r2ClassBSoftLimit
}

func (c *mediaCacheController) recordR2Usage(classA, classB int64) error {
	if classA == 0 && classB == 0 {
		return nil
	}
	return c.store.AddR2Usage(time.Now().UTC().Format("2006-01"), classA, classB)
}

func warmCacheKey(item domain.MediaAsset) string {
	return strings.Join([]string{"media", item.ID, "original"}, "/")
}
