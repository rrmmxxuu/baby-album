package main

import (
	"bufio"
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
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/image/draw"
)

type config struct {
	configFile        string
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

type persistentConfig struct {
	APIBaseURL        string `json:"apiBaseURL"`
	NodeName          string `json:"nodeName"`
	PairingCode       string `json:"pairingCode"`
	HeartbeatInterval string `json:"heartbeatInterval,omitempty"`
	LibraryRoot       string `json:"libraryRoot,omitempty"`
}

type storageCapacity struct {
	TotalBytes     int64 `json:"totalBytes"`
	FreeBytes      int64 `json:"freeBytes"`
	AvailableBytes int64 `json:"availableBytes"`
}

type job struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	MediaID   string `json:"mediaId"`
	FamilyID  string `json:"familyId"`
	FileName  string `json:"fileName"`
	MediaType string `json:"mediaType"`
	ByteSize  int64  `json:"byteSize"`
	BlobKey   string `json:"blobKey"`
}

type processingReport struct {
	OriginalPath   string `json:"originalPath"`
	PreviewBlobKey string `json:"previewBlobKey,omitempty"`
	Width          int    `json:"width"`
	Height         int    `json:"height"`
	PreviewStatus  string `json:"previewStatus"`
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		panic(err)
	}
	if len(os.Args) > 1 && os.Args[1] == "setup" {
		fmt.Printf("agent setup saved to %s\n", cfg.configFile)
		return
	}
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
	log.Printf("agent online node=%s api=%s library=%s", cfg.nodeID, cfg.apiBaseURL, cfg.libraryRoot)
	for {
		select {
		case <-ctx.Done():
			log.Print("agent shutting down")
			return
		case <-heartbeatTicker.C:
			if err := heartbeat(ctx, client, cfg); err != nil {
				log.Printf("heartbeat failed: %v", err)
			}
		case <-jobTicker.C:
			if err := processJobs(ctx, client, cfg); err != nil {
				log.Printf("process jobs failed: %v", err)
			}
		}
	}
}

func loadConfig() (config, error) {
	cfg := config{
		configFile:        envOrDefault("AGENT_CONFIG_FILE", "tmp/agent/config.json"),
		apiBaseURL:        "http://localhost:8080",
		nodeName:          fallbackHostname(),
		heartbeatInterval: 15 * time.Second,
		libraryRoot:       envOrDefault("AGENT_LIBRARY_ROOT", "tmp/library"),
		nodeID:            strings.TrimSpace(os.Getenv("AGENT_NODE_ID")),
		pairingCode:       strings.TrimSpace(os.Getenv("AGENT_PAIRING_CODE")),
	}
	if cfg.nodeName == "" {
		cfg.nodeName = "Living Room NAS"
	}
	cfg.nodeToken = strings.TrimSpace(os.Getenv("AGENT_NODE_TOKEN"))
	if cfg.nodeToken == "" {
		cfg.nodeToken = strings.TrimSpace(os.Getenv("AGENT_REGISTRATION_TOKEN"))
	}
	if saved, err := loadPersistentConfig(cfg.configFile); err == nil {
		if saved.APIBaseURL != "" {
			cfg.apiBaseURL = strings.TrimRight(saved.APIBaseURL, "/")
		}
		if saved.NodeName != "" {
			cfg.nodeName = saved.NodeName
		}
		if saved.PairingCode != "" && cfg.pairingCode == "" {
			cfg.pairingCode = saved.PairingCode
		}
		if saved.HeartbeatInterval != "" {
			if parsed, err := time.ParseDuration(saved.HeartbeatInterval); err == nil {
				cfg.heartbeatInterval = parsed
			}
		}
		if saved.LibraryRoot != "" && os.Getenv("AGENT_LIBRARY_ROOT") == "" {
			cfg.libraryRoot = saved.LibraryRoot
		}
	}
	if raw := strings.TrimSpace(os.Getenv("AGENT_API_BASE_URL")); raw != "" {
		cfg.apiBaseURL = strings.TrimRight(raw, "/")
	}
	if raw := strings.TrimSpace(os.Getenv("AGENT_NODE_NAME")); raw != "" {
		cfg.nodeName = raw
	}
	if raw := strings.TrimSpace(os.Getenv("AGENT_HEARTBEAT_INTERVAL")); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil {
			cfg.heartbeatInterval = parsed
		}
	}
	if raw := strings.TrimSpace(os.Getenv("AGENT_LIBRARY_ROOT")); raw != "" {
		cfg.libraryRoot = raw
	}
	if state, err := loadAgentState(cfg.libraryRoot); err == nil {
		if cfg.nodeID == "" {
			cfg.nodeID = state.NodeID
		}
		if cfg.nodeToken == "" {
			cfg.nodeToken = state.NodeToken
		}
	}
	if len(os.Args) > 1 && os.Args[1] == "setup" {
		return runSetupWizard(cfg)
	}
	if needsSetup(cfg) {
		if !isInteractiveTerminal() {
			return config{}, fmt.Errorf("agent is not configured; run `agent setup` or start the container once with an attached terminal to create %s", cfg.configFile)
		}
		return runSetupWizard(cfg)
	}
	return cfg, nil
}

func registerNode(ctx context.Context, client *http.Client, cfg config) (config, error) {
	capacity, err := detectStorageCapacity(cfg.libraryRoot)
	if err != nil {
		return cfg, err
	}
	log.Printf("registering node name=%s api=%s pairing=%t existing_state=%t", cfg.nodeName, cfg.apiBaseURL, cfg.pairingCode != "", cfg.nodeID != "" && cfg.nodeToken != "")
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
	log.Printf("node registered node=%s", cfg.nodeID)
	if err := saveAgentState(cfg.libraryRoot, agentState{NodeID: cfg.nodeID, NodeToken: cfg.nodeToken}); err != nil {
		return cfg, err
	}
	if cfg.configFile != "" {
		_ = savePersistentConfig(cfg.configFile, persistentConfig{
			APIBaseURL:        cfg.apiBaseURL,
			NodeName:          cfg.nodeName,
			PairingCode:       "",
			HeartbeatInterval: cfg.heartbeatInterval.String(),
			LibraryRoot:       cfg.libraryRoot,
		})
	}
	return cfg, nil
}

func heartbeat(ctx context.Context, client *http.Client, cfg config) error {
	capacity, err := detectStorageCapacity(cfg.libraryRoot)
	if err != nil {
		return err
	}
	log.Printf("heartbeat node=%s free=%d available=%d total=%d", cfg.nodeID, capacity.FreeBytes, capacity.AvailableBytes, capacity.TotalBytes)
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
	if len(result.Items) > 0 {
		log.Printf("received %d pending jobs", len(result.Items))
	}
	for _, item := range result.Items {
		log.Printf("processing job=%s media=%s file=%s type=%s", item.ID, item.MediaID, item.FileName, item.MediaType)
		report, err := ingestFile(ctx, client, cfg, item)
		if err != nil {
			return err
		}
		completeURL := fmt.Sprintf("%s/api/v1/agents/jobs/%s/complete", cfg.apiBaseURL, item.ID)
		payload := map[string]any{"nodeId": cfg.nodeID, "report": report}
		if err := postJSON(ctx, client, completeURL, cfg.nodeToken, payload, nil); err != nil {
			return err
		}
		log.Printf("completed job=%s media=%s preview=%s size=%dx%d", item.ID, item.MediaID, report.PreviewStatus, report.Width, report.Height)
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
	log.Printf("downloading media=%s to %s", item.MediaID, targetPath)
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
	width, height, thumbPath, err := generatePreview(targetPath, targetDir, item.MediaType)
	if err == nil {
		log.Printf("generated preview media=%s preview=%s size=%dx%d", item.MediaID, thumbPath, width, height)
		report.Width = width
		report.Height = height
		blobKey, err := uploadPreview(ctx, client, cfg, item.ID, thumbPath)
		if err == nil {
			report.PreviewBlobKey = blobKey
			report.PreviewStatus = "ready"
			log.Printf("uploaded preview media=%s blob=%s", item.MediaID, blobKey)
		} else {
			report.PreviewStatus = "unavailable"
			log.Printf("preview upload failed media=%s err=%v", item.MediaID, err)
		}
	} else {
		log.Printf("preview unavailable media=%s err=%v", item.MediaID, err)
		if width, height, sizeErr := probeImageSize(targetPath); sizeErr == nil {
			report.Width = width
			report.Height = height
		}
	}
	return report, nil
}

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
	log.Printf("running ffmpeg thumbnail source=%s", sourcePath)
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

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func fallbackHostname() string {
	name, err := os.Hostname()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(name)
}

func needsSetup(cfg config) bool {
	if cfg.apiBaseURL == "" || cfg.nodeName == "" || cfg.libraryRoot == "" {
		return true
	}
	if cfg.nodeID != "" && cfg.nodeToken != "" {
		return false
	}
	return cfg.pairingCode == ""
}

func isInteractiveTerminal() bool {
	info, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return (info.Mode() & os.ModeCharDevice) != 0
}

func loadPersistentConfig(path string) (persistentConfig, error) {
	file, err := os.Open(path)
	if err != nil {
		return persistentConfig{}, err
	}
	defer file.Close()
	var item persistentConfig
	if err := json.NewDecoder(file).Decode(&item); err != nil {
		return persistentConfig{}, err
	}
	return item, nil
}

func savePersistentConfig(path string, item persistentConfig) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(item)
}

func runSetupWizard(cfg config) (config, error) {
	reader := bufio.NewReader(os.Stdin)
	fmt.Println("Agent setup")
	fmt.Println("Press Enter to keep the suggested value.")
	cfg.apiBaseURL = promptValue(reader, "Control plane URL", cfg.apiBaseURL)
	cfg.nodeName = promptValue(reader, "Node name", cfg.nodeName)
	cfg.pairingCode = promptValue(reader, "Pairing code", cfg.pairingCode)
	cfg.libraryRoot = promptValue(reader, "Library root", cfg.libraryRoot)
	heartbeatValue := promptValue(reader, "Heartbeat interval", cfg.heartbeatInterval.String())
	if parsed, err := time.ParseDuration(strings.TrimSpace(heartbeatValue)); err == nil {
		cfg.heartbeatInterval = parsed
	}
	if cfg.apiBaseURL == "" || cfg.nodeName == "" || cfg.pairingCode == "" || cfg.libraryRoot == "" {
		return config{}, fmt.Errorf("setup incomplete")
	}
	if err := savePersistentConfig(cfg.configFile, persistentConfig{
		APIBaseURL:        strings.TrimRight(cfg.apiBaseURL, "/"),
		NodeName:          cfg.nodeName,
		PairingCode:       cfg.pairingCode,
		HeartbeatInterval: cfg.heartbeatInterval.String(),
		LibraryRoot:       cfg.libraryRoot,
	}); err != nil {
		return config{}, err
	}
	cfg.apiBaseURL = strings.TrimRight(cfg.apiBaseURL, "/")
	return cfg, nil
}

func promptValue(reader *bufio.Reader, label, fallback string) string {
	if fallback != "" {
		fmt.Printf("%s [%s]: ", label, fallback)
	} else {
		fmt.Printf("%s: ", label)
	}
	line, err := reader.ReadString('\n')
	if err != nil && err != io.EOF {
		return fallback
	}
	value := strings.TrimSpace(line)
	if value == "" {
		return fallback
	}
	return value
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
