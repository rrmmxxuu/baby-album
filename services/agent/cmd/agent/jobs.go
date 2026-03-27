package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

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
