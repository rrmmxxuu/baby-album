package main

import (
	"bytes"
	"context"
	"encoding/binary"
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
	nodeToken         string
	pairingCode       string
	heartbeatInterval time.Duration
	libraryRoot       string
}

type agentState struct {
	NodeID    string `json:"nodeId"`
	NodeToken string `json:"nodeToken"`
}

type storageCapacity struct {
	TotalBytes     int64 `json:"totalBytes"`
	FreeBytes      int64 `json:"freeBytes"`
	AvailableBytes int64 `json:"availableBytes"`
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
	registeredCfg, err := registerNode(ctx, client, cfg)
	if err != nil {
		panic(err)
	}
	cfg = registeredCfg
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
	nodeName := os.Getenv("AGENT_NODE_NAME")
	if nodeName == "" {
		nodeName = "Living Room NAS"
	}
	nodeToken := os.Getenv("AGENT_NODE_TOKEN")
	if nodeToken == "" {
		nodeToken = os.Getenv("AGENT_REGISTRATION_TOKEN")
	}
	pairingCode := os.Getenv("AGENT_PAIRING_CODE")
	libraryRoot := os.Getenv("AGENT_LIBRARY_ROOT")
	if libraryRoot == "" {
		libraryRoot = "tmp/library"
	}
	cfg := config{apiBaseURL: strings.TrimRight(apiBaseURL, "/"), nodeID: nodeID, nodeName: nodeName, nodeToken: nodeToken, pairingCode: pairingCode, heartbeatInterval: interval, libraryRoot: libraryRoot}
	if state, err := loadAgentState(libraryRoot); err == nil {
		if cfg.nodeID == "" {
			cfg.nodeID = state.NodeID
		}
		if cfg.nodeToken == "" {
			cfg.nodeToken = state.NodeToken
		}
	}
	return cfg
}

func registerNode(ctx context.Context, client *http.Client, cfg config) (config, error) {
	capacity, err := detectStorageCapacity(cfg.libraryRoot)
	if err != nil {
		return cfg, err
	}
	var result struct {
		NodeID    string `json:"nodeId"`
		NodeToken string `json:"nodeToken"`
	}
	payload := map[string]any{
		"nodeId":      cfg.nodeID,
		"name":        cfg.nodeName,
		"token":       cfg.nodeToken,
		"pairingCode": cfg.pairingCode,
		"capacity":    capacity,
	}
	if err := postJSON(ctx, client, cfg.apiBaseURL+"/api/v1/storage-nodes/register", "", payload, &result); err != nil {
		return cfg, err
	}
	cfg.nodeID = result.NodeID
	cfg.nodeToken = result.NodeToken
	if err := saveAgentState(cfg.libraryRoot, agentState{NodeID: cfg.nodeID, NodeToken: cfg.nodeToken}); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func heartbeat(ctx context.Context, client *http.Client, cfg config) error {
	capacity, err := detectStorageCapacity(cfg.libraryRoot)
	if err != nil {
		return err
	}
	return postJSON(ctx, client, cfg.apiBaseURL+"/api/v1/storage-nodes/heartbeat", "", map[string]any{"nodeId": cfg.nodeID, "token": cfg.nodeToken, "capacity": capacity}, nil)
}

func processJobs(ctx context.Context, client *http.Client, cfg config) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/v1/agents/jobs?nodeId=%s", cfg.apiBaseURL, cfg.nodeID), nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Node-Token", cfg.nodeToken)
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
		if err := postJSON(ctx, client, completeURL, cfg.nodeToken, payload, nil); err != nil {
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
	req.Header.Set("X-Node-Token", cfg.nodeToken)
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

func readJPEGOrientation(r io.Reader) (int, error) {
	data, err := io.ReadAll(io.LimitReader(r, 1<<20))
	if err != nil {
		return 1, err
	}
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return 1, fmt.Errorf("not jpeg")
	}
	offset := 2
	for offset+4 < len(data) {
		if data[offset] != 0xFF {
			break
		}
		marker := data[offset+1]
		offset += 2
		if marker == 0xDA || marker == 0xD9 {
			break
		}
		if offset+2 > len(data) {
			break
		}
		size := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		if size < 2 || offset+size > len(data) {
			break
		}
		segment := data[offset+2 : offset+size]
		if marker == 0xE1 && len(segment) > 6 && string(segment[:6]) == "Exif\x00\x00" {
			return parseExifOrientation(segment[6:])
		}
		offset += size
	}
	return 1, fmt.Errorf("orientation not found")
}

func parseExifOrientation(data []byte) (int, error) {
	if len(data) < 8 {
		return 1, fmt.Errorf("short exif")
	}
	var order binary.ByteOrder
	switch string(data[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1, fmt.Errorf("invalid byte order")
	}
	if order.Uint16(data[2:4]) != 0x2A {
		return 1, fmt.Errorf("invalid tiff header")
	}
	ifdOffset := int(order.Uint32(data[4:8]))
	if ifdOffset+2 > len(data) {
		return 1, fmt.Errorf("invalid ifd offset")
	}
	count := int(order.Uint16(data[ifdOffset : ifdOffset+2]))
	entryOffset := ifdOffset + 2
	for i := 0; i < count; i++ {
		entry := entryOffset + i*12
		if entry+12 > len(data) {
			break
		}
		tag := order.Uint16(data[entry : entry+2])
		if tag != 0x0112 {
			continue
		}
		value := order.Uint16(data[entry+8 : entry+10])
		if value < 1 || value > 8 {
			return 1, nil
		}
		return int(value), nil
	}
	return 1, fmt.Errorf("orientation tag missing")
}

func applyOrientation(src image.Image, orientation int) image.Image {
	switch orientation {
	case 3:
		return rotate180(src)
	case 6:
		return rotate90CW(src)
	case 8:
		return rotate90CCW(src)
	default:
		return src
	}
}

func rotate180(src image.Image) image.Image {
	bounds := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			dst.Set(bounds.Dx()-1-x, bounds.Dy()-1-y, src.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return dst
}

func rotate90CW(src image.Image) image.Image {
	bounds := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, bounds.Dy(), bounds.Dx()))
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			dst.Set(bounds.Dy()-1-y, x, src.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return dst
}

func rotate90CCW(src image.Image) image.Image {
	bounds := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, bounds.Dy(), bounds.Dx()))
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			dst.Set(y, bounds.Dx()-1-x, src.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return dst
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

func detectStorageCapacity(root string) (storageCapacity, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return storageCapacity{}, err
	}
	var stats syscall.Statfs_t
	if err := syscall.Statfs(root, &stats); err != nil {
		return storageCapacity{}, err
	}
	blockSize := int64(stats.Bsize)
	return storageCapacity{
		TotalBytes:     int64(stats.Blocks) * blockSize,
		FreeBytes:      int64(stats.Bfree) * blockSize,
		AvailableBytes: int64(stats.Bavail) * blockSize,
	}, nil
}

func loadAgentState(libraryRoot string) (agentState, error) {
	statePath := filepath.Join(libraryRoot, ".agent-state.json")
	file, err := os.Open(statePath)
	if err != nil {
		return agentState{}, err
	}
	defer file.Close()
	var state agentState
	if err := json.NewDecoder(file).Decode(&state); err != nil {
		return agentState{}, err
	}
	return state, nil
}

func saveAgentState(libraryRoot string, state agentState) error {
	if err := os.MkdirAll(libraryRoot, 0o755); err != nil {
		return err
	}
	statePath := filepath.Join(libraryRoot, ".agent-state.json")
	file, err := os.Create(statePath)
	if err != nil {
		return err
	}
	defer file.Close()
	return json.NewEncoder(file).Encode(state)
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
		var payload struct {
			Error string `json:"error"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err == nil && payload.Error != "" {
			return fmt.Errorf("post %s failed: %s (%s)", url, resp.Status, payload.Error)
		}
		return fmt.Errorf("post %s failed: %s", url, resp.Status)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}
