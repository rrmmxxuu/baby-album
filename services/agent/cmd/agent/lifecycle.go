package main

import (
	"context"
	"log"
	"net/http"
)

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
	if err := saveAgentState(cfg.stateFile, agentState{NodeID: cfg.nodeID, NodeToken: cfg.nodeToken}); err != nil {
		return cfg, err
	}
	if cfg.configFile != "" {
		_ = savePersistentConfig(cfg.configFile, persistentConfig{
			APIBaseURL:        cfg.apiBaseURL,
			NodeName:          cfg.nodeName,
			PairingCode:       "",
			HeartbeatInterval: cfg.heartbeatInterval.String(),
			JobTimeout:        cfg.jobTimeout.String(),
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
	return postJSON(ctx, client, cfg.apiBaseURL+"/api/v1/storage-nodes/heartbeat", "", map[string]any{
		"nodeId":   cfg.nodeID,
		"token":    cfg.nodeToken,
		"capacity": capacity,
	}, nil)
}
