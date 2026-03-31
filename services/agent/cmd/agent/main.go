package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
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
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	controller, err := newAgentController(cfg)
	if err != nil {
		panic(err)
	}
	defer func() {
		if closeErr := controller.Close(); closeErr != nil {
			log.Printf("close controller failed: %v", closeErr)
		}
	}()
	log.Printf("agent panel online addr=%s config=%s library=%s", cfg.panelAddr, cfg.configDir, cfg.libraryRoot)
	if err := controller.Run(ctx); err != nil && ctx.Err() == nil {
		panic(err)
	}
}
