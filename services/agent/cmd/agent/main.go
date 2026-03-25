package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/image/draw"
)

type config struct {
	apiBaseURL        string
	nodeID            string
	nodeName          string
	registrationToken string
	heartbeatInterval time.Duration
	libraryRoot       string
}

type job struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	MediaID  string `json:"mediaId"`
	FamilyID string `json:"familyId"`
	FileName string `json:"fileName"`
	ByteSize int64  `json:"byteSize"`
	BlobKey  string `json:"blobKey"`
}

type processingReport struct {
	OriginalPath   string `json:"originalPath"`
	PreviewBlobKey string `json:"previewBlobKey,omitempty"`
	Width          int    `json:"width"`
	Height         int    `json:"height"`
	PreviewStatus  string `json:"previewStatus"`
}

func main() {
	cfg := loadConfig()
	client := &http.Client{Timeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := registerNode(ctx, client, cfg); err != nil {
		panic(err)
	}
	heartbeatTicker := time.NewTicker(cfg.heartbeatInterval)
	jobTicker := time.NewTicker(8 * time.Second)
	defer heartbeatTicker.Stop()
	defer jobTicker.Stop()
	fmt.Printf("agent online for node=%s api=%s library=%s\n", cfg.nodeID, cfg.apiBaseURL, cfg.libraryRoot)
	for {
		select {
		case <-ctx.Done():
			fmt.Println("agent shutting down")
			return
		case <-heartbeatTicker.C:
			_ = heartbeat(ctx, client, cfg)
		case <-jobTicker.C:
			_ = processJobs(ctx, client, cfg)
		}
	}
}

func loadConfig() config {
	interval := 15 * time.Second
	if raw := os.Getenv("AGENT_HEARTBEAT_INTERVAL"); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil {
			interval = parsed
		}
	}
	apiBaseURL := os.Getenv("AGENT_API_BASE_URL")
	if apiBaseURL == "" {
		apiBaseURL = "http://localhost:8080"
	}
	nodeID := os.Getenv("AGENT_NODE_ID")
	if nodeID == "" {
		nodeID = "node-demo"
	}
	nodeName := os.Getenv("AGENT_NODE_NAME")
	if nodeName == "" {
		nodeName = "Living Room NAS"
	}
	token := os.Getenv("AGENT_REGISTRATION_TOKEN")
	if token == "" {
		token = "demo-registration-token"
	}
	libraryRoot := os.Getenv("AGENT_LIBRARY_ROOT")
	if libraryRoot == "" {
		libraryRoot = "tmp/library"
	}
	return config{apiBaseURL: strings.TrimRight(apiBaseURL, "/"), nodeID: nodeID, nodeName: nodeName, registrationToken: token, heartbeatInterval: interval, libraryRoot: libraryRoot}
}

func registerNode(ctx context.Context, client *http.Client, cfg config) error {
	return postJSON(ctx, client, cfg.apiBaseURL+"/api/v1/storage-nodes/register", "", map[string]string{"nodeId": cfg.nodeID, "name": cfg.nodeName, "token": cfg.registrationToken}, nil)
}
func heartbeat(ctx context.Context, client *http.Client, cfg config) error {
	return postJSON(ctx, client, cfg.apiBaseURL+"/api/v1/storage-nodes/heartbeat", "", map[string]string{"nodeId": cfg.nodeID, "token": cfg.registrationToken}, nil)
}

func processJobs(ctx context.Context, client *http.Client, cfg config) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/v1/agents/jobs?nodeId=%s", cfg.apiBaseURL, cfg.nodeID), nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Node-Token", cfg.registrationToken)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("poll jobs status=%s", resp.Status)
	}
	var result struct {
		Items []job `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}
	for _, item := range result.Items {
		report, err := ingestFile(ctx, client, cfg, item)
		if err != nil {
			return err
		}
		completeURL := fmt.Sprintf("%s/api/v1/agents/jobs/%s/complete", cfg.apiBaseURL, item.ID)
		payload := map[string]any{"nodeId": cfg.nodeID, "report": report}
		if err := postJSON(ctx, client, completeURL, cfg.registrationToken, payload, nil); err != nil {
			return err
		}
	}
	return nil
}

func ingestFile(ctx context.Context, client *http.Client, cfg config, item job) (processingReport, error) {
	report := processingReport{PreviewStatus: "unavailable"}
	if item.BlobKey == "" {
		return report, fmt.Errorf("job %s missing blob key", item.ID)
	}
	downloadURL := fmt.Sprintf("%s/api/v1/agents/jobs/%s/blob?nodeId=%s", cfg.apiBaseURL, item.ID, cfg.nodeID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return report, err
	}
	req.Header.Set("X-Node-Token", cfg.registrationToken)
	resp, err := client.Do(req)
	if err != nil {
		return report, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return report, fmt.Errorf("download blob status=%s", resp.Status)
	}
	targetDir := filepath.Join(cfg.libraryRoot, item.FamilyID, item.MediaID)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return report, err
	}
	targetPath := filepath.Join(targetDir, sanitizeName(item.FileName))
	out, err := os.Create(targetPath)
	if err != nil {
		return report, err
	}
	if _, err := io.Copy(out, resp.Body); err != nil {
		_ = out.Close()
		return report, err
	}
	if err := out.Close(); err != nil {
		return report, err
	}
	report.OriginalPath = targetPath
	width, height, thumbPath, err := generateThumbnail(targetPath, targetDir)
	if err == nil {
		report.Width = width
		report.Height = height
		blobKey, err := uploadPreview(ctx, client, cfg, item.ID, thumbPath)
		if err == nil {
			report.PreviewBlobKey = blobKey
			report.PreviewStatus = "ready"
		} else {
			report.PreviewStatus = "unavailable"
		}
	} else {
		if width, height, sizeErr := probeImageSize(targetPath); sizeErr == nil {
			report.Width = width
			report.Height = height
		}
	}
	return report, nil
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
	req.Header.Set("X-Node-Token", cfg.registrationToken)
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

func sanitizeName(name string) string {
	replacer := strings.NewReplacer("..", "", "/", "-", `\\`, "-", ":", "-", " ", "-")
	cleaned := replacer.Replace(name)
	if cleaned == "" {
		return "upload.bin"
	}
	return cleaned
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func postJSON(ctx context.Context, client *http.Client, url string, nodeToken string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if nodeToken != "" {
		req.Header.Set("X-Node-Token", nodeToken)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("post %s failed: %s", url, resp.Status)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}
