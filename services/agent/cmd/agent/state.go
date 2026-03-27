package main

import (
	"encoding/json"
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
