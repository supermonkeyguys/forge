package api

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/api/middleware"
)

// RouterDeps holds all handler dependencies for route assembly.
type RouterDeps struct {
	Auth          *handler.AuthHandler
	Project       *handler.ProjectHandler
	Task          *handler.TaskHandler
	Health        *handler.HealthHandler
	Internal      *handler.InternalHandler
	InternalToken string
	JWTSecret     string
	Logger        *slog.Logger
}

// NewRouter assembles all routes and returns the root http.Handler.
func NewRouter(deps RouterDeps) http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestSize(1 << 20)) // 1MB
	if deps.Logger != nil {
		r.Use(middleware.RequestLogger(deps.Logger))
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"http://localhost:5173"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
	}))

	// Health check (no auth)
	if deps.Health != nil {
		r.Get("/health", deps.Health.Health)
	} else {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`)) //nolint:errcheck
		})
	}

	// Auth routes (no auth middleware)
	r.Route("/api/v1/auth", func(r chi.Router) {
		r.With(middleware.IPRateLimit(5, 10)).Post("/register", deps.Auth.Register)
		r.With(middleware.IPRateLimit(5, 10)).Post("/login", deps.Auth.Login)
		r.With(middleware.RequireAuth(deps.JWTSecret)).Get("/me", deps.Auth.Me)
	})

	// Protected routes
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(middleware.RequireAuth(deps.JWTSecret))

		// Projects
		r.Route("/projects", func(r chi.Router) {
			r.Get("/", deps.Project.List)
			r.Post("/", deps.Project.Create)
			r.Route("/{projectID}", func(r chi.Router) {
				r.Get("/", deps.Project.Get)
				r.Delete("/", deps.Project.Delete)
				r.Get("/stream", deps.Task.ProjectStream)

				// Tasks nested under project
				r.Route("/tasks", func(r chi.Router) {
					r.Get("/", deps.Task.List)
					r.Post("/", deps.Task.Create)
					r.Get("/{taskID}", deps.Task.Get)
				})
			})
		})

		// SSE stream (task-level, not nested under project for simplicity)
		r.Get("/tasks/{taskID}/stream", deps.Task.Stream)
	})

	// Internal routes — service-to-service only, no JWT
	if deps.Internal != nil {
		r.Route("/internal", func(r chi.Router) {
			r.Use(middleware.RequireInternalToken(deps.InternalToken))
			r.Patch("/tasks/{taskID}/status", deps.Internal.UpdateTaskStatus)
		})
	}

	return r
}
