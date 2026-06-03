package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type AgentMemoryHandler struct{ repo domain.AgentMemoryRepository }

func NewAgentMemoryHandler(repo domain.AgentMemoryRepository) *AgentMemoryHandler {
	return &AgentMemoryHandler{repo: repo}
}

// GET /api/v1/agents/{agentKey}/memories?q=
func (h *AgentMemoryHandler) List(w http.ResponseWriter, r *http.Request) {
	agentKey := chi.URLParam(r, "agentKey")
	userID := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")
	memories, err := h.repo.ListByAgentKey(r.Context(), agentKey, userID, q, 5)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if memories == nil {
		memories = []domain.AgentMemory{}
	}
	middleware.WriteJSONList(w, memories, len(memories), 1, 5)
}

// POST /api/v1/agents/{agentKey}/memories
func (h *AgentMemoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	agentKey := chi.URLParam(r, "agentKey")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Content   string `json:"content"`
		MemoryKey string `json:"memoryKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Content == "" {
		middleware.WriteFieldError(w, "content", "content is required")
		return
	}
	mem, err := h.repo.Create(r.Context(), domain.AgentMemory{
		AgentKey:  agentKey,
		UserID:    userID,
		MemoryKey: body.MemoryKey,
		Content:   body.Content,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, mem)
}

// DELETE /api/v1/agents/{agentKey}/memories/{memoryID}
func (h *AgentMemoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "memoryID")
	userID := middleware.UserIDFromContext(r.Context())
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		middleware.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
