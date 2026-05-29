package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/forge-ai/forge/api/api/middleware"
)

// DBPinger abstracts the database ping operation for health checks.
type DBPinger interface {
	Ping(ctx context.Context) error
}

// HealthHandler handles health check endpoints.
type HealthHandler struct {
	db DBPinger
}

func NewHealthHandler(db DBPinger) *HealthHandler {
	return &HealthHandler{db: db}
}

// GET /health
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if err := h.db.Ping(ctx); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"status":"unhealthy","db":"unreachable"}`)) //nolint:errcheck
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok", "db": "ok"})
}
