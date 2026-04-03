package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const agentJobLongPollSeconds = 25

type workerHooks interface {
	onPendingJobs(items []job)
	allowJobStart() bool
	onJobStart(item job, remaining []job)
	onJobStage(stage string)
	onJobCompleted(report processingReport)
}

func processJobs(ctx context.Context, controlClient, transferClient *http.Client, cfg config, hooks workerHooks) error {
	jobsURL := fmt.Sprintf("%s/api/v1/agents/jobs?nodeId=%s&waitSeconds=%d", cfg.apiBaseURL, url.QueryEscape(cfg.nodeID), agentJobLongPollSeconds)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, jobsURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Node-Token", cfg.nodeToken)
	resp, err := controlClient.Do(req)
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
	if hooks != nil {
		hooks.onPendingJobs(result.Items)
	}
	for index, item := range result.Items {
		if hooks != nil && !hooks.allowJobStart() {
			return nil
		}
		log.Printf("processing job=%s media=%s file=%s type=%s", item.ID, item.MediaID, item.FileName, item.Type)
		if hooks != nil {
			hooks.onJobStart(item, result.Items[index+1:])
		}
		jobCtx, cancel := context.WithTimeout(ctx, cfg.jobTimeout)
		report, err := processJob(jobCtx, transferClient, cfg, item, hooks)
		cancel()
		if err != nil {
			return err
		}
		completeURL := fmt.Sprintf("%s/api/v1/agents/jobs/%s/complete", cfg.apiBaseURL, item.ID)
		payload := map[string]any{"nodeId": cfg.nodeID, "report": report}
		if hooks != nil {
			hooks.onJobStage("completing")
		}
		if err := postJSON(ctx, controlClient, completeURL, cfg.nodeToken, payload, nil); err != nil {
			return err
		}
		log.Printf("completed job=%s media=%s size=%dx%d", item.ID, item.MediaID, report.Width, report.Height)
		if hooks != nil {
			hooks.onJobCompleted(report)
		}
	}
	return nil
}

func processJob(ctx context.Context, client *http.Client, cfg config, item job, hooks workerHooks) (processingReport, error) {
	switch item.Type {
	case "delete_media":
		return deleteMedia(ctx, cfg, item, hooks)
	case "restore_original":
		return restoreOriginal(ctx, client, cfg, item, hooks)
	case "rehydrate_media":
		return rehydrateMedia(ctx, client, cfg, item, hooks)
	default:
		return ingestMedia(ctx, client, cfg, item, hooks)
	}
}

func ingestMedia(ctx context.Context, client *http.Client, cfg config, item job, hooks workerHooks) (processingReport, error) {
	report := processingReport{}
	targetPath, err := downloadOriginalToLibrary(ctx, client, cfg, item, hooks)
	if err != nil {
		return report, err
	}
	report.OriginalPath = targetPath
	return report, nil
}

func rehydrateMedia(ctx context.Context, client *http.Client, cfg config, item job, hooks workerHooks) (processingReport, error) {
	report := processingReport{}
	targetPath, err := downloadOriginalToLibrary(ctx, client, cfg, item, hooks)
	if err != nil {
		return report, err
	}
	report.OriginalPath = targetPath
	return report, nil
}

func restoreOriginal(ctx context.Context, client *http.Client, cfg config, item job, hooks workerHooks) (processingReport, error) {
	report := processingReport{OriginalPath: item.OriginalPath}
	if strings.TrimSpace(item.OriginalPath) == "" {
		return report, fmt.Errorf("job %s missing original path", item.ID)
	}
	if _, err := os.Stat(item.OriginalPath); err != nil {
		return report, err
	}
	if hooks != nil {
		hooks.onJobStage("uploading_restore")
	}
	blobKey, err := uploadRestoredOriginal(ctx, client, cfg, item.ID, item.OriginalPath)
	if err != nil {
		return report, err
	}
	report.RestoredBlobKey = blobKey
	return report, nil
}

func deleteMedia(_ context.Context, cfg config, item job, hooks workerHooks) (processingReport, error) {
	report := processingReport{OriginalPath: item.OriginalPath}
	if strings.TrimSpace(item.OriginalPath) == "" {
		return report, nil
	}
	targetDir := filepath.Dir(item.OriginalPath)
	relativeDir, err := filepath.Rel(cfg.libraryRoot, targetDir)
	if err != nil {
		return report, err
	}
	if relativeDir == "." || strings.HasPrefix(relativeDir, "..") {
		return report, fmt.Errorf("refusing to delete path outside library root: %s", targetDir)
	}
	if hooks != nil {
		hooks.onJobStage("deleting_media")
	}
	if err := os.RemoveAll(targetDir); err != nil && !os.IsNotExist(err) {
		return report, err
	}
	return report, nil
}

func downloadOriginalToLibrary(ctx context.Context, client *http.Client, cfg config, item job, hooks workerHooks) (string, error) {
	downloadURL := fmt.Sprintf("%s/api/v1/agents/jobs/%s/blob?nodeId=%s", cfg.apiBaseURL, item.ID, cfg.nodeID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-Node-Token", cfg.nodeToken)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("download blob status=%s", resp.Status)
	}
	targetDir := filepath.Join(cfg.libraryRoot, item.FamilyID, item.MediaID)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return "", err
	}
	targetPath := filepath.Join(targetDir, sanitizeName(item.FileName))
	log.Printf("downloading media=%s to %s", item.MediaID, targetPath)
	if hooks != nil {
		hooks.onJobStage("downloading")
	}
	out, err := os.Create(targetPath)
	if err != nil {
		return "", err
	}
	keepFile := false
	defer func() {
		if keepFile {
			return
		}
		_ = out.Close()
		_ = os.Remove(targetPath)
	}()
	if _, err := io.Copy(out, resp.Body); err != nil {
		_ = out.Close()
		return "", err
	}
	if err := out.Close(); err != nil {
		return "", err
	}
	keepFile = true
	return targetPath, nil
}
