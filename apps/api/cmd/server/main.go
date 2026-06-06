package main

import (
	"context"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	apiPkg "github.com/forge-ai/forge/api/api"
	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/infra/postgres"
)

func main() {
	// Load .env in development (no-op if file doesn't exist)
	_ = godotenv.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := loadConfig()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	// 1. Initialize infrastructure
	pool, err := postgres.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}

	// 2. Build repositories (infra concrete types)
	projectRepo := postgres.NewProjectRepo(pool)
	userRepo := postgres.NewUserRepo(pool)
	taskRepo := postgres.NewTaskRepo(pool)
	settingsRepo := postgres.NewSettingsRepo(pool)
	agentRepo := postgres.NewAgentRepo(pool)
	memoryRepo := postgres.NewAgentMemoryRepo(pool)
	pkbRepo := postgres.NewProjectKBRepo(pool)
	taskStepRepo := postgres.NewTaskStepRepo(pool)

	// 3. Build handlers (receive domain interfaces)
	hasher := handler.BcryptHasher{}
	authHandler := handler.NewAuthHandler(userRepo, cfg.JWTSecret, hasher)
	projectHandler := handler.NewProjectHandler(projectRepo)
	taskHandler := handler.NewTaskHandler(taskRepo, projectRepo, cfg.AgentServiceURL)
	healthHandler := handler.NewHealthHandler(pool)
	internalHandler := handler.NewInternalHandler(taskRepo, agentRepo, memoryRepo, pkbRepo, taskStepRepo)
	settingsHandler := handler.NewSettingsHandler(settingsRepo, cfg.SettingsEncryptionKey)
	agentHandler := handler.NewAgentHandler(agentRepo)
	memoryHandler := handler.NewAgentMemoryHandler(memoryRepo)
	pkbHandler := handler.NewProjectKBHandlerWithAgent(pkbRepo, cfg.AgentServiceURL)

	// 4. Assemble router
	router := apiPkg.NewRouter(apiPkg.RouterDeps{
		Auth:          authHandler,
		Project:       projectHandler,
		Task:          taskHandler,
		Health:        healthHandler,
		Internal:      internalHandler,
		Settings:      settingsHandler,
		Agent:         agentHandler,
		Memory:        memoryHandler,
		KB:            pkbHandler,
		TaskStep:      handler.NewTaskStepHandler(taskRepo, taskStepRepo),
		InternalToken: cfg.InternalToken,
		JWTSecret:     cfg.JWTSecret,
		Logger:        logger,
	})

	// 5. Start server with graceful shutdown
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second, // SSE needs longer write timeout
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Info("forge api server starting", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("server forced to shutdown", "error", err)
	}

	pool.Close()
	logger.Info("server exited")
}

type config struct {
	Port                  string
	DatabaseURL           string
	AgentServiceURL       string
	JWTSecret             string
	InternalToken         string
	SettingsEncryptionKey []byte
}

func loadConfig() (config, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return config{}, errors.New("DATABASE_URL environment variable is required")
	}
	agentURL := os.Getenv("AGENT_SERVICE_URL")
	if agentURL == "" {
		agentURL = "http://localhost:3001"
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return config{}, errors.New("JWT_SECRET environment variable is required")
	}
	encKeyB64 := os.Getenv("SETTINGS_ENCRYPTION_KEY")
	if encKeyB64 == "" {
		return config{}, errors.New("SETTINGS_ENCRYPTION_KEY environment variable is required")
	}
	encKey, err := base64.StdEncoding.DecodeString(encKeyB64)
	if err != nil || len(encKey) != 32 {
		return config{}, errors.New("SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
	}
	return config{
		Port:                  port,
		DatabaseURL:           dbURL,
		AgentServiceURL:       agentURL,
		JWTSecret:             jwtSecret,
		InternalToken:         os.Getenv("INTERNAL_TOKEN"),
		SettingsEncryptionKey: encKey,
	}, nil
}
