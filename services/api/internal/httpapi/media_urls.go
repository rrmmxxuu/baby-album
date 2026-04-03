package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

const (
	previewURLKind       = "preview"
	screenPreviewURLKind = "screen_preview"
	originalURLKind      = "original"
	avatarURLKind        = "avatar"
)

func (s *Server) decorateAppState(value store.AppState) store.AppState {
	for index := range value.Albums {
		if value.Albums[index].Baby != nil {
			baby := s.decorateBaby(*value.Albums[index].Baby)
			value.Albums[index].Baby = &baby
		}
	}
	if value.ActiveAlbum != nil {
		workspace := s.decorateAlbumWorkspace(*value.ActiveAlbum)
		value.ActiveAlbum = &workspace
	}
	return value
}

func (s *Server) decorateAlbumWorkspace(value store.AlbumWorkspace) store.AlbumWorkspace {
	if value.Baby != nil {
		baby := s.decorateBaby(*value.Baby)
		value.Baby = &baby
	}
	for index := range value.Babies {
		value.Babies[index] = s.decorateBaby(value.Babies[index])
	}
	value.Timeline = s.decorateTimelineEntries(value.Timeline)
	return value
}

func (s *Server) decorateTimelinePage(value store.TimelinePage) store.TimelinePage {
	value.Items = s.decorateTimelineEntries(value.Items)
	return value
}

func (s *Server) decorateTimelineEntries(items []domain.TimelineEntry) []domain.TimelineEntry {
	for entryIndex := range items {
		for itemIndex := range items[entryIndex].Items {
			items[entryIndex].Items[itemIndex] = s.decorateMediaAsset(items[entryIndex].Items[itemIndex])
		}
	}
	return items
}

func (s *Server) decorateMediaAsset(item domain.MediaAsset) domain.MediaAsset {
	if item.PreviewStatus == domain.PreviewReady && strings.TrimSpace(item.PreviewBlobKey) != "" {
		item.PreviewURL = s.signedMediaURL(mediaPublicPath("media", item.ID, "preview"), previewURLKind, mediaVersion(item), s.previewURLExpiry())
	}
	if item.ScreenPreviewStatus == domain.PreviewReady && strings.TrimSpace(item.ScreenPreviewObjectKey) != "" {
		item.ScreenPreviewURL = s.signedMediaURL(mediaPublicPath("media", item.ID, "screen-preview"), screenPreviewURLKind, mediaVersion(item), s.previewURLExpiry())
	}
	item.OriginalAvail = mediaOriginalAvailability(item)
	if item.OriginalAvail == domain.OriginalHot || item.OriginalAvail == domain.OriginalWarm {
		item.OriginalURL = s.signedMediaURL(mediaPublicPath("media", item.ID, "original"), originalURLKind, mediaVersion(item), time.Now().UTC().Add(5*time.Minute))
	}
	return item
}

func (s *Server) decorateBaby(item domain.BabyProfile) domain.BabyProfile {
	if item.HasAvatar && strings.TrimSpace(item.AvatarKey) != "" {
		version := item.CreatedAt
		if item.AvatarUpdatedAt != nil {
			version = item.AvatarUpdatedAt.UTC()
		}
		item.AvatarURL = s.signedMediaURL(mediaPublicPath("babies", item.ID, "avatar"), avatarURLKind, version.Format(time.RFC3339Nano), s.previewURLExpiry())
	}
	return item
}

func mediaOriginalAvailability(item domain.MediaAsset) domain.OriginalAvailability {
	switch {
	case item.OriginalLocalState == "online" && strings.TrimSpace(item.OriginalBlobKey) != "":
		return domain.OriginalHot
	case item.OriginalR2State == "online" && strings.TrimSpace(item.OriginalR2Key) != "":
		return domain.OriginalWarm
	case item.OriginalRestoreState == "pending":
		return domain.OriginalRestoring
	case item.Status == domain.MediaReady && strings.TrimSpace(item.OriginalPath) != "":
		return domain.OriginalCold
	default:
		return domain.OriginalUnavailable
	}
}

func mediaPublicPath(resource, id, action string) string {
	return fmt.Sprintf("/api/v1/%s/%s/%s", resource, url.PathEscape(strings.TrimSpace(id)), action)
}

func mediaVersion(item domain.MediaAsset) string {
	switch {
	case item.ProcessedAt != nil:
		return item.ProcessedAt.UTC().Format(time.RFC3339Nano)
	default:
		return item.UploadedAt.UTC().Format(time.RFC3339Nano)
	}
}

func (s *Server) previewURLExpiry() time.Time {
	dayStart := time.Now().UTC().Truncate(24 * time.Hour)
	return dayStart.Add(48 * time.Hour)
}

func (s *Server) signedMediaURL(path, kind, version string, expiresAt time.Time) string {
	query := url.Values{}
	query.Set("exp", strconv.FormatInt(expiresAt.UTC().Unix(), 10))
	if strings.TrimSpace(version) != "" {
		query.Set("v", version)
	}
	query.Set("sig", s.signMediaPath(path, kind, version, expiresAt.UTC().Unix()))
	return s.publicBaseURL + path + "?" + query.Encode()
}

func (s *Server) signMediaPath(path, kind, version string, unixExpiry int64) string {
	mac := hmac.New(sha256.New, s.signingSecret)
	mac.Write([]byte(path))
	mac.Write([]byte{'\n'})
	mac.Write([]byte(kind))
	mac.Write([]byte{'\n'})
	mac.Write([]byte(version))
	mac.Write([]byte{'\n'})
	mac.Write([]byte(strconv.FormatInt(unixExpiry, 10)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) verifySignedMediaRequest(r *http.Request, expectedKind string) bool {
	signature := strings.TrimSpace(r.URL.Query().Get("sig"))
	if signature == "" {
		return false
	}
	expiry, err := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("exp")), 10, 64)
	if err != nil || expiry <= 0 {
		return false
	}
	if time.Now().UTC().Unix() > expiry {
		return false
	}
	version := r.URL.Query().Get("v")
	expected := s.signMediaPath(r.URL.Path, expectedKind, version, expiry)
	return hmac.Equal([]byte(signature), []byte(expected))
}

func mediaETag(kind string, item domain.MediaAsset) string {
	base := strings.Join([]string{
		kind,
		item.ID,
		strings.TrimSpace(item.PreviewBlobKey),
		strings.TrimSpace(item.OriginalBlobKey),
		strings.TrimSpace(item.OriginalR2Key),
		filepath.Base(strings.TrimSpace(item.FileName)),
	}, "|")
	sum := sha256.Sum256([]byte(base))
	return `"` + hex.EncodeToString(sum[:]) + `"`
}
