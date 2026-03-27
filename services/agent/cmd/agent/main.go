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
