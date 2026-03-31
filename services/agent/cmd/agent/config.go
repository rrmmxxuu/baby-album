package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func loadConfig() (config, error) {
	cfg := config{
		configFile:        envOrDefault("AGENT_CONFIG_FILE", "tmp/agent/config.json"),
		apiBaseURL:        "",
		nodeName:          fallbackHostname(),
		heartbeatInterval: 15 * time.Second,
		jobTimeout:        30 * time.Minute,
		libraryRoot:       envOrDefault("AGENT_LIBRARY_ROOT", "tmp/library"),
		panelAddr:         envOrDefault("AGENT_PANEL_ADDR", ":8091"),
		migrationTarget:   envOrDefault("AGENT_MIGRATION_TARGET_ROOT", "/data/migration-target"),
		nodeID:            strings.TrimSpace(os.Getenv("AGENT_NODE_ID")),
		pairingCode:       strings.TrimSpace(os.Getenv("AGENT_PAIRING_CODE")),
	}
	cfg.configDir = filepath.Dir(cfg.configFile)
	cfg.stateFile = filepath.Join(cfg.configDir, "node-state.json")
	cfg.authFile = filepath.Join(cfg.configDir, "panel-auth.json")
	cfg.runtimeFile = filepath.Join(cfg.configDir, "runtime.json")
	cfg.logFile = filepath.Join(cfg.configDir, "agent.log")
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
		if saved.JobTimeout != "" {
			if parsed, err := time.ParseDuration(saved.JobTimeout); err == nil {
				cfg.jobTimeout = parsed
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
	if raw := strings.TrimSpace(os.Getenv("AGENT_JOB_TIMEOUT")); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil {
			cfg.jobTimeout = parsed
		}
	}
	if raw := strings.TrimSpace(os.Getenv("AGENT_LIBRARY_ROOT")); raw != "" {
		cfg.libraryRoot = raw
	}
	if raw := strings.TrimSpace(os.Getenv("AGENT_PANEL_ADDR")); raw != "" {
		cfg.panelAddr = raw
	}
	if raw := strings.TrimSpace(os.Getenv("AGENT_MIGRATION_TARGET_ROOT")); raw != "" {
		cfg.migrationTarget = raw
	}
	if state, err := loadAgentState(cfg.stateFile); err == nil {
		if cfg.nodeID == "" {
			cfg.nodeID = state.NodeID
		}
		if cfg.nodeToken == "" {
			cfg.nodeToken = state.NodeToken
		}
	} else if legacy, legacyErr := loadLegacyAgentState(cfg.libraryRoot); legacyErr == nil {
		if cfg.nodeID == "" {
			cfg.nodeID = legacy.NodeID
		}
		if cfg.nodeToken == "" {
			cfg.nodeToken = legacy.NodeToken
		}
		_ = saveAgentState(cfg.stateFile, legacy)
	}
	if len(os.Args) > 1 && os.Args[1] == "setup" {
		return runSetupWizard(cfg)
	}
	return cfg, nil
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
		JobTimeout:        cfg.jobTimeout.String(),
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
