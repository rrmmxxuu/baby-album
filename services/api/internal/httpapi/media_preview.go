package httpapi

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strconv"
	"strings"

	"babyalbum/api/internal/domain"

	_ "image/gif"
	_ "image/png"
)

type uploadedMediaPreview struct {
	Width                  int
	Height                 int
	Status                 domain.PreviewStatus
	BlobKey                string
	ScreenPreviewStatus    domain.PreviewStatus
	ScreenPreviewObjectKey string
}

type GeneratedMediaPreviewArtifacts struct {
	Width             int
	Height            int
	PreviewJPEG       []byte
	ScreenPreviewJPEG []byte
}

func (s *Server) generateUploadedMediaPreview(originalBlobKey, originalName, mediaType string) uploadedMediaPreview {
	result := uploadedMediaPreview{Status: domain.PreviewUnavailable, ScreenPreviewStatus: domain.PreviewUnavailable}
	sourceKey := strings.TrimSpace(originalBlobKey)
	if sourceKey == "" {
		return result
	}
	sourcePath := filepath.Join(s.blob.Root(), sourceKey)
	normalizedType := normalizedMediaType(mediaType)

	switch {
	case isTrustedStillImageMediaType(normalizedType):
		width, height, thumbEncoded, err := generateBestStillImagePreview(sourcePath, normalizedType, originalName, 480, 82)
		if err != nil {
			if width > 0 && height > 0 {
				result.Width = width
				result.Height = height
			}
			logEvent("error", "generate uploaded media preview failed", map[string]any{
				"blob_key":   sourceKey,
				"file_name":  originalName,
				"media_type": normalizedType,
				"error":      err.Error(),
			})
			return result
		}
		result.Width = width
		result.Height = height
		if blobKey, saveErr := s.savePreviewBlob(sourceKey, originalName, thumbEncoded); saveErr == nil {
			result.Status = domain.PreviewReady
			result.BlobKey = blobKey
		} else {
			logEvent("error", "save preview blob failed", map[string]any{
				"blob_key":  sourceKey,
				"file_name": originalName,
				"error":     saveErr.Error(),
			})
		}
		if _, _, screenEncoded, screenErr := generateBestStillImagePreview(sourcePath, normalizedType, originalName, 1600, 84); screenErr == nil {
			if objectKey, saveErr := s.saveScreenPreviewObject(context.Background(), sourceKey, originalName, screenEncoded); saveErr == nil {
				result.ScreenPreviewStatus = domain.PreviewReady
				result.ScreenPreviewObjectKey = objectKey
			} else {
				logEvent("error", "save screen preview failed", map[string]any{
					"blob_key":  sourceKey,
					"file_name": originalName,
					"error":     saveErr.Error(),
				})
			}
		}
	case isTrustedVideoMediaType(normalizedType):
		width, height, thumbEncoded, err := generateVideoPreview(sourcePath, 480, 82)
		if err != nil {
			if width > 0 && height > 0 {
				result.Width = width
				result.Height = height
			}
			logEvent("error", "generate uploaded media preview failed", map[string]any{
				"blob_key":   sourceKey,
				"file_name":  originalName,
				"media_type": normalizedType,
				"error":      err.Error(),
			})
			return result
		}
		result.Width = width
		result.Height = height
		if blobKey, saveErr := s.savePreviewBlob(sourceKey, originalName, thumbEncoded); saveErr == nil {
			result.Status = domain.PreviewReady
			result.BlobKey = blobKey
		} else {
			logEvent("error", "save preview blob failed", map[string]any{
				"blob_key":  sourceKey,
				"file_name": originalName,
				"error":     saveErr.Error(),
			})
		}
		if screenEncoded, screenErr := generateVideoPreviewBytes(sourcePath, 1600, 84); screenErr == nil {
			if objectKey, saveErr := s.saveScreenPreviewObject(context.Background(), sourceKey, originalName, screenEncoded); saveErr == nil {
				result.ScreenPreviewStatus = domain.PreviewReady
				result.ScreenPreviewObjectKey = objectKey
			} else {
				logEvent("error", "save screen preview failed", map[string]any{
					"blob_key":  sourceKey,
					"file_name": originalName,
					"error":     saveErr.Error(),
				})
			}
		}
	default:
		logEvent("warn", "skip preview for unsupported uploaded media type", map[string]any{
			"blob_key":   sourceKey,
			"file_name":  originalName,
			"media_type": normalizedType,
		})
	}

	return result
}

func (s *Server) savePreviewBlob(sourceBlobKey, originalName string, data []byte) (string, error) {
	if len(data) == 0 {
		return "", fmt.Errorf("preview payload is empty")
	}
	if s.cacheController != nil {
		if err := s.cacheController.EnsureSpace(int64(len(data))); err != nil {
			return "", err
		}
	}
	prefix := strings.TrimSuffix(filepath.Base(strings.TrimSpace(sourceBlobKey)), filepath.Ext(strings.TrimSpace(sourceBlobKey))) + "-preview"
	if strings.TrimSpace(prefix) == "" {
		prefix = "preview"
	}
	saved, err := s.blob.SaveBytes(prefix, previewFileName(originalName), data)
	if err != nil {
		return "", err
	}
	return saved.Key, nil
}

func (s *Server) saveScreenPreviewObject(ctx context.Context, sourceBlobKey, originalName string, data []byte) (string, error) {
	if len(data) == 0 {
		return "", fmt.Errorf("screen preview payload is empty")
	}
	if s.screenPreviews == nil || !s.screenPreviews.Enabled() {
		return "", fmt.Errorf("screen preview store is not configured")
	}
	key := screenPreviewObjectKey(sourceBlobKey, originalName)
	saved, err := s.screenPreviews.PutBytes(ctx, key, data, "image/jpeg")
	if err != nil {
		return "", err
	}
	return saved.Key, nil
}

func previewFileName(originalName string) string {
	base := strings.TrimSpace(filepath.Base(originalName))
	if base == "" {
		return "preview.jpg"
	}
	return strings.TrimSuffix(base, filepath.Ext(base)) + ".jpg"
}

func screenPreviewObjectKey(sourceBlobKey, originalName string) string {
	prefix := strings.TrimSuffix(filepath.Base(strings.TrimSpace(sourceBlobKey)), filepath.Ext(strings.TrimSpace(sourceBlobKey)))
	if strings.TrimSpace(prefix) == "" {
		prefix = "screen-preview"
	}
	return path.Join("screen-previews", prefix+"-"+previewFileName(originalName))
}

func generateImagePreview(sourcePath string, maxEdge, quality int) (int, int, []byte, error) {
	width, height, err := probeImageSize(sourcePath)
	if err != nil {
		return 0, 0, nil, err
	}
	file, err := os.Open(sourcePath)
	if err != nil {
		return width, height, nil, err
	}
	defer file.Close()
	img, _, err := image.Decode(file)
	if err != nil {
		return width, height, nil, err
	}
	if _, err := file.Seek(0, io.SeekStart); err == nil {
		if orientation, orientErr := readJPEGOrientation(file); orientErr == nil {
			img = applyOrientation(img, orientation)
			bounds := img.Bounds()
			width = bounds.Dx()
			height = bounds.Dy()
		}
	}
	dstW, dstH := fitWithin(width, height, maxEdge)
	preview := resizeImage(img, dstW, dstH)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, preview, &jpeg.Options{Quality: quality}); err != nil {
		return width, height, nil, err
	}
	return width, height, encoded.Bytes(), nil
}

func generateImagePreviewBytes(sourcePath string, maxEdge, quality int) ([]byte, error) {
	_, _, data, err := generateImagePreview(sourcePath, maxEdge, quality)
	return data, err
}

func GenerateMediaPreviewArtifacts(sourcePath, mediaType, originalName string) (GeneratedMediaPreviewArtifacts, error) {
	result := GeneratedMediaPreviewArtifacts{}
	normalizedType := normalizedMediaType(mediaType)

	if isTrustedStillImageMediaType(normalizedType) {
		width, height, preview, err := generateBestStillImagePreview(sourcePath, normalizedType, originalName, 480, 82)
		if err != nil {
			return result, err
		}
		result.Width = width
		result.Height = height
		result.PreviewJPEG = preview
		if screenWidth, screenHeight, screenPreview, screenErr := generateBestStillImagePreview(sourcePath, normalizedType, originalName, 1600, 84); screenErr == nil {
			if screenWidth > 0 {
				result.Width = screenWidth
			}
			if screenHeight > 0 {
				result.Height = screenHeight
			}
			result.ScreenPreviewJPEG = screenPreview
		}
		return result, nil
	}

	if isTrustedVideoMediaType(normalizedType) {
		width, height, preview, err := generateVideoPreview(sourcePath, 480, 82)
		if err != nil {
			return result, err
		}
		result.Width = width
		result.Height = height
		result.PreviewJPEG = preview
		screenPreview, screenErr := generateVideoPreviewBytes(sourcePath, 1600, 84)
		if screenErr == nil {
			result.ScreenPreviewJPEG = screenPreview
		}
		return result, nil
	}

	return result, fmt.Errorf("unsupported preview media type")
}

func generateBestStillImagePreview(sourcePath, mediaType, originalName string, maxEdge, quality int) (int, int, []byte, error) {
	width, height, encoded, err := generateImagePreview(sourcePath, maxEdge, quality)
	if err == nil {
		return width, height, encoded, nil
	}
	if isHEIFStillImageMediaType(mediaType) {
		if convertedWidth, convertedHeight, converted, convertedErr := generateHEIFStillImagePreview(sourcePath, maxEdge, quality); convertedErr == nil {
			return convertedWidth, convertedHeight, converted, nil
		}
	}
	if !allowsStillImageFFmpegFallback(mediaType, originalName) {
		return width, height, nil, err
	}
	return generateFFmpegStillImagePreview(sourcePath, maxEdge, quality)
}

func isHEIFStillImageMediaType(mediaType string) bool {
	switch strings.ToLower(strings.TrimSpace(mediaType)) {
	case "image/heic", "image/heif":
		return true
	default:
		return false
	}
}

func allowsStillImageFFmpegFallback(mediaType, originalName string) bool {
	mediaType = strings.ToLower(strings.TrimSpace(mediaType))
	switch mediaType {
	case "image/heic", "image/heif":
		return true
	default:
		_ = originalName
		return false
	}
}

func generateHEIFStillImagePreview(sourcePath string, maxEdge, quality int) (int, int, []byte, error) {
	if _, err := exec.LookPath("heif-convert"); err != nil {
		return 0, 0, nil, err
	}
	tempDir, err := os.MkdirTemp("", "baby-album-heif-preview-*")
	if err != nil {
		return 0, 0, nil, err
	}
	defer os.RemoveAll(tempDir)

	convertedPath := filepath.Join(tempDir, "source.jpg")
	cmd := exec.Command(
		"heif-convert",
		"--quiet",
		"-q", strconv.Itoa(maxInt(1, minInt(100, quality))),
		sourcePath,
		convertedPath,
	)
	if output, err := cmd.CombinedOutput(); err != nil {
		return 0, 0, nil, fmt.Errorf("heif-convert failed: %v (%s)", err, strings.TrimSpace(string(output)))
	}
	return generateImagePreview(convertedPath, maxEdge, quality)
}

func generateFFmpegStillImagePreview(sourcePath string, maxEdge, quality int) (int, int, []byte, error) {
	width, height, _ := probeVisualSize(sourcePath)
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		if width > 0 && height > 0 {
			return width, height, nil, err
		}
		return 0, 0, nil, err
	}

	tempDir, err := os.MkdirTemp("", "baby-album-still-preview-*")
	if err != nil {
		return width, height, nil, err
	}
	defer os.RemoveAll(tempDir)

	thumbPath := filepath.Join(tempDir, "thumb.jpg")
	cmd := exec.Command("ffmpeg", buildFFmpegReadArgs(
		sourcePath,
		"-vf", fmt.Sprintf("scale=%d:-1:force_original_aspect_ratio=decrease", maxEdge),
		"-frames:v", "1",
		"-q:v", strconv.Itoa(maxInt(2, 31-((quality*29)/100))),
		thumbPath,
	)...)
	if output, err := cmd.CombinedOutput(); err != nil {
		if width > 0 && height > 0 {
			return width, height, nil, fmt.Errorf("ffmpeg still preview failed: %v (%s)", err, strings.TrimSpace(string(output)))
		}
		return 0, 0, nil, fmt.Errorf("ffmpeg still preview failed: %v (%s)", err, strings.TrimSpace(string(output)))
	}
	encoded, err := os.ReadFile(thumbPath)
	if err != nil {
		return width, height, nil, err
	}
	if (width == 0 || height == 0) && len(encoded) > 0 {
		if thumbWidth, thumbHeight, sizeErr := probeImageSize(thumbPath); sizeErr == nil {
			width = thumbWidth
			height = thumbHeight
		}
	}
	return width, height, encoded, nil
}

func generateVideoPreview(sourcePath string, maxEdge, quality int) (int, int, []byte, error) {
	width, height, _ := probeVideoSize(sourcePath)
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		if width > 0 && height > 0 {
			return width, height, nil, err
		}
		return 0, 0, nil, err
	}
	tempDir, err := os.MkdirTemp("", "baby-album-preview-*")
	if err != nil {
		return width, height, nil, err
	}
	defer os.RemoveAll(tempDir)

	thumbPath := filepath.Join(tempDir, "thumb.jpg")
	cmd := exec.Command("ffmpeg", buildFFmpegReadArgs(
		sourcePath,
		"-vf", fmt.Sprintf("thumbnail,scale=%d:-1:force_original_aspect_ratio=decrease", maxEdge),
		"-frames:v", "1",
		"-q:v", strconv.Itoa(maxInt(2, 31-((quality*29)/100))),
		thumbPath,
	)...)
	if output, err := cmd.CombinedOutput(); err != nil {
		if width > 0 && height > 0 {
			return width, height, nil, fmt.Errorf("ffmpeg thumbnail failed: %v (%s)", err, strings.TrimSpace(string(output)))
		}
		return 0, 0, nil, fmt.Errorf("ffmpeg thumbnail failed: %v (%s)", err, strings.TrimSpace(string(output)))
	}
	encoded, err := os.ReadFile(thumbPath)
	if err != nil {
		return width, height, nil, err
	}
	if (width == 0 || height == 0) && len(encoded) > 0 {
		if thumbWidth, thumbHeight, sizeErr := probeImageSize(thumbPath); sizeErr == nil {
			width = thumbWidth
			height = thumbHeight
		}
	}
	return width, height, encoded, nil
}

func generateVideoPreviewBytes(sourcePath string, maxEdge, quality int) ([]byte, error) {
	_, _, data, err := generateVideoPreview(sourcePath, maxEdge, quality)
	return data, err
}

func resizeImage(src image.Image, targetWidth, targetHeight int) *image.RGBA {
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return image.NewRGBA(image.Rect(0, 0, maxInt(1, targetWidth), maxInt(1, targetHeight)))
	}
	targetWidth = maxInt(1, targetWidth)
	targetHeight = maxInt(1, targetHeight)
	dst := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	for y := 0; y < targetHeight; y++ {
		sourceY := bounds.Min.Y + y*height/targetHeight
		for x := 0; x < targetWidth; x++ {
			sourceX := bounds.Min.X + x*width/targetWidth
			dst.Set(x, y, src.At(sourceX, sourceY))
		}
	}
	return dst
}

func probeImageSize(path string) (int, int, error) {
	file, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()
	cfg, _, err := image.DecodeConfig(file)
	if err != nil {
		return 0, 0, err
	}
	return cfg.Width, cfg.Height, nil
}

func probeVideoSize(path string) (int, int, error) {
	if !isTrustedVideoMediaPath(path) {
		return 0, 0, fmt.Errorf("unsupported video media path")
	}
	return probeVisualSize(path)
}

func probeVisualSize(path string) (int, int, error) {
	if _, err := exec.LookPath("ffprobe"); err != nil {
		return 0, 0, err
	}
	cmd := exec.Command("ffprobe", buildFFprobeReadArgs(
		path,
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height",
		"-of", "csv=p=0:s=x",
	)...)
	output, err := cmd.Output()
	if err != nil {
		return 0, 0, err
	}
	parts := strings.Split(strings.TrimSpace(string(output)), "x")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid ffprobe output")
	}
	width, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, err
	}
	height, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, err
	}
	return width, height, nil
}

func isTrustedStillImageMediaType(mediaType string) bool {
	switch normalizedMediaType(mediaType) {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif":
		return true
	default:
		return false
	}
}

func isTrustedVideoMediaType(mediaType string) bool {
	switch normalizedMediaType(mediaType) {
	case "video/mp4", "video/quicktime":
		return true
	default:
		return false
	}
}

func isTrustedVideoMediaPath(sourcePath string) bool {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(sourcePath))) {
	case ".mp4", ".m4v", ".mov":
		return true
	default:
		return false
	}
}

func restrictedFFmpegInputArgs() []string {
	return []string{
		"-nostdin",
		"-protocol_whitelist", "file,pipe,data",
		"-protocol_blacklist", "async,bluray,cache,concat,concatf,crypto,ftp,gopher,gophers,http,https,icecast,ipfs,mmsh,mmst,rtmp,rtmpe,rtmps,rtmpt,rtmpte,rtmpts,rtp,rtsp,sap,sctp,srt,srtp,subfile,tcp,tls,udp,unix,amqp,rist,zmq",
	}
}

func buildFFprobeReadArgs(sourcePath string, extra ...string) []string {
	args := []string{"-v", "error"}
	args = append(args, restrictedFFmpegInputArgs()...)
	args = append(args, extra...)
	args = append(args, sourcePath)
	return args
}

func buildFFmpegReadArgs(sourcePath string, extra ...string) []string {
	args := []string{"-y"}
	args = append(args, restrictedFFmpegInputArgs()...)
	args = append(args, "-i", sourcePath)
	args = append(args, extra...)
	return args
}

func fitWithin(width, height, maxSide int) (int, int) {
	if width <= maxSide && height <= maxSide {
		return width, height
	}
	if width >= height {
		return maxSide, maxInt(1, height*maxSide/width)
	}
	return maxInt(1, width*maxSide/height), maxSide
}
