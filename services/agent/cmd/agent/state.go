package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

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

func loadAgentState(statePath string) (agentState, error) {
	file, err := os.Open(statePath)
	if err != nil {
		return agentState{}, err
	}
	defer file.Close()
	if err := tightenPrivateFile(statePath); err != nil {
		return agentState{}, err
	}
	var state agentState
	if err := json.NewDecoder(file).Decode(&state); err != nil {
		return agentState{}, err
	}
	return state, nil
}

func loadLegacyAgentState(libraryRoot string) (agentState, error) {
	if strings.TrimSpace(libraryRoot) == "" {
		return agentState{}, errors.New("library root is empty")
	}
	return loadAgentState(filepath.Join(libraryRoot, ".agent-state.json"))
}

func saveAgentState(statePath string, state agentState) error {
	file, err := openPrivateFile(statePath)
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
