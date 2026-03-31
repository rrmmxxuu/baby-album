package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg, err := loadConfig()
	if err != nil {
		panic(err)
	}
	if len(os.Args) > 1 && os.Args[1] == "setup" {
		log.Printf("agent setup saved to %s", cfg.configFile)
		return
	}
	controlClient := &http.Client{Timeout: 60 * time.Second}
	transferClient := &http.Client{}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	registeredCfg, err := registerNode(ctx, controlClient, cfg)
	if err != nil {
		panic(err)
	}
	cfg = registeredCfg

	heartbeatTicker := time.NewTicker(cfg.heartbeatInterval)
	jobTicker := time.NewTicker(8 * time.Second)
	jobResults := make(chan error, 1)
	jobRunning := false
	defer heartbeatTicker.Stop()
	defer jobTicker.Stop()

	log.Printf("agent online node=%s api=%s library=%s", cfg.nodeID, cfg.apiBaseURL, cfg.libraryRoot)
	for {
		select {
		case <-ctx.Done():
			log.Print("agent shutting down")
			return
		case err := <-jobResults:
			jobRunning = false
			if err != nil {
				log.Printf("process jobs failed: %v", err)
			}
		case <-heartbeatTicker.C:
			if err := heartbeat(ctx, controlClient, cfg); err != nil {
				log.Printf("heartbeat failed: %v", err)
			}
		case <-jobTicker.C:
			if jobRunning {
				continue
			}
			jobRunning = true
			go func() {
				jobResults <- processJobs(ctx, controlClient, transferClient, cfg)
			}()
		}
	}
}
