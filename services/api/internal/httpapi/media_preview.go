package httpapi

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"babyalbum/api/internal/domain"

	_ "image/gif"
	_ "image/png"
)

type uploadedMediaPreview struct {
	Width   int
	Height  int
	Status  domain.PreviewStatus
	BlobKey string
}

func (s *Server) generateUploadedMediaPreview(originalBlobKey, originalName string) uploadedMediaPreview {
	result := uploadedMediaPreview{Status: domain.PreviewUnavailable}
	sourceKey := strings.TrimSpace(originalBlobKey)
	if sourceKey == "" {
		return result
	}
	sourcePath := filepath.Join(s.blob.Root(), sourceKey)

	if width, height, encoded, err := generateImagePreview(sourcePath); err == nil {
		result.Width = width
		result.Height = height
		if blobKey, saveErr := s.savePreviewBlob(sourceKey, originalName, encoded); saveErr == nil {
			result.Status = domain.PreviewReady
			result.BlobKey = blobKey
		}
		return result
	} else if width > 0 && height > 0 {
		result.Width = width
		result.Height = height
	}

	if width, height, encoded, err := generateVideoPreview(sourcePath); err == nil {
		result.Width = width
		result.Height = height
		if blobKey, saveErr := s.savePreviewBlob(sourceKey, originalName, encoded); saveErr == nil {
			result.Status = domain.PreviewReady
			result.BlobKey = blobKey
		}
		return result
	} else if result.Width == 0 && result.Height == 0 && width > 0 && height > 0 {
		result.Width = width
		result.Height = height
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

func previewFileName(originalName string) string {
	base := strings.TrimSpace(filepath.Base(originalName))
	if base == "" {
		return "preview.jpg"
	}
	return strings.TrimSuffix(base, filepath.Ext(base)) + ".jpg"
}

func generateImagePreview(sourcePath string) (int, int, []byte, error) {
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
	dstW, dstH := fitWithin(width, height, 480)
	preview := resizeImage(img, dstW, dstH)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, preview, &jpeg.Options{Quality: 82}); err != nil {
		return width, height, nil, err
	}
	return width, height, encoded.Bytes(), nil
}

func generateVideoPreview(sourcePath string) (int, int, []byte, error) {
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
	cmd := exec.Command(
		"ffmpeg",
		"-y",
		"-i", sourcePath,
		"-vf", "thumbnail,scale=480:-1:force_original_aspect_ratio=decrease",
		"-frames:v", "1",
		thumbPath,
	)
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
	if _, err := exec.LookPath("ffprobe"); err != nil {
		return 0, 0, err
	}
	cmd := exec.Command(
		"ffprobe",
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height",
		"-of", "csv=p=0:s=x",
		path,
	)
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

func fitWithin(width, height, maxSide int) (int, int) {
	if width <= maxSide && height <= maxSide {
		return width, height
	}
	if width >= height {
		return maxSide, maxInt(1, height*maxSide/width)
	}
	return maxInt(1, width*maxSide/height), maxSide
}
