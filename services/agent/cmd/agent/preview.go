package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	_ "image/gif"
	_ "image/png"

	"golang.org/x/image/draw"
)

func generatePreview(sourcePath, targetDir, mediaType string) (int, int, string, error) {
	if strings.HasPrefix(mediaType, "video/") {
		return generateVideoPreview(sourcePath, targetDir)
	}
	return generateThumbnail(sourcePath, targetDir)
}

func generateThumbnail(sourcePath, targetDir string) (int, int, string, error) {
	width, height, err := probeImageSize(sourcePath)
	if err != nil {
		return 0, 0, "", err
	}
	file, err := os.Open(sourcePath)
	if err != nil {
		return width, height, "", err
	}
	defer file.Close()
	img, _, err := image.Decode(file)
	if err != nil {
		return width, height, "", err
	}
	if _, err := file.Seek(0, io.SeekStart); err == nil {
		if orientation, orientErr := readJPEGOrientation(file); orientErr == nil {
			img = applyOrientation(img, orientation)
			bounds := img.Bounds()
			width = bounds.Dx()
			height = bounds.Dy()
		}
	}
	maxSide := 480
	dstW, dstH := fitWithin(width, height, maxSide)
	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Over, nil)
	thumbPath := filepath.Join(targetDir, "thumb.jpg")
	out, err := os.Create(thumbPath)
	if err != nil {
		return width, height, "", err
	}
	defer out.Close()
	if err := jpeg.Encode(out, dst, &jpeg.Options{Quality: 82}); err != nil {
		return width, height, "", err
	}
	return width, height, thumbPath, nil
}

func generateVideoPreview(sourcePath, targetDir string) (int, int, string, error) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return 0, 0, "", fmt.Errorf("ffmpeg not found")
	}
	thumbPath := filepath.Join(targetDir, "thumb.jpg")
	cmd := exec.Command(
		"ffmpeg",
		"-y",
		"-i", sourcePath,
		"-vf", "thumbnail,scale=480:-1",
		"-frames:v", "1",
		thumbPath,
	)
	if output, err := cmd.CombinedOutput(); err != nil {
		return 0, 0, "", fmt.Errorf("ffmpeg thumbnail failed: %v (%s)", err, strings.TrimSpace(string(output)))
	}
	width, height, err := probeVideoSize(sourcePath)
	if err != nil {
		width, height = 0, 0
	}
	return width, height, thumbPath, nil
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
		return maxSide, max(1, height*maxSide/width)
	}
	return max(1, width*maxSide/height), maxSide
}

func uploadPreview(ctx context.Context, client *http.Client, cfg config, jobID, previewPath string) (string, error) {
	file, err := os.Open(previewPath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filepath.Base(previewPath))
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, file); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	url := fmt.Sprintf("%s/api/v1/agents/jobs/%s/preview?nodeId=%s", cfg.apiBaseURL, jobID, cfg.nodeID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("X-Node-Token", cfg.nodeToken)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("preview upload status=%s", resp.Status)
	}
	var payload struct {
		BlobKey string `json:"blobKey"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", err
	}
	return payload.BlobKey, nil
}
