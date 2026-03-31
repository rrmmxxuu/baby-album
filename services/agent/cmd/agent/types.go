package main

import "time"

type config struct {
	configFile        string
	configDir         string
	stateFile         string
	authFile          string
	runtimeFile       string
	logFile           string
	apiBaseURL        string
	nodeID            string
	nodeName          string
	nodeToken         string
	pairingCode       string
	heartbeatInterval time.Duration
	jobTimeout        time.Duration
	libraryRoot       string
	panelAddr         string
	migrationTarget   string
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
	JobTimeout        string `json:"jobTimeout,omitempty"`
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
