package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type AgentHandler struct {
	repo domain.AgentRepository
}

func NewAgentHandler(repo domain.AgentRepository) *AgentHandler {
	return &AgentHandler{repo: repo}
}

// GET /api/v1/agents
func (h *AgentHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	agents, err := h.repo.ListByUserID(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if agents == nil {
		agents = []domain.Agent{}
	}
	middleware.WriteJSONList(w, agents, len(agents), 1, 100)
}

// POST /api/v1/agents
func (h *AgentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Name         string   `json:"name"`
		Description  string   `json:"description"`
		Instructions string   `json:"instructions"`
		Tools        []string `json:"tools"`
		WritePaths   []string `json:"writePaths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}
	for _, t := range body.Tools {
		if !domain.ValidAgentTool(t) {
			middleware.WriteFieldError(w, "tools", "unknown tool: "+t)
			return
		}
	}
	if body.Tools == nil {
		body.Tools = []string{}
	}
	if body.WritePaths == nil {
		body.WritePaths = []string{}
	}
	agent, err := h.repo.Create(r.Context(), domain.Agent{
		UserID:       userID,
		Name:         body.Name,
		Description:  body.Description,
		Instructions: body.Instructions,
		Tools:        body.Tools,
		WritePaths:   body.WritePaths,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, agent)
}

// GET /api/v1/agents/{agentID}
func (h *AgentHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "agentID")
	userID := middleware.UserIDFromContext(r.Context())
	agent, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if agent.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, agent)
}

// PUT /api/v1/agents/{agentID}
func (h *AgentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "agentID")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Name         string   `json:"name"`
		Description  string   `json:"description"`
		Instructions string   `json:"instructions"`
		Tools        []string `json:"tools"`
		WritePaths   []string `json:"writePaths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}
	for _, t := range body.Tools {
		if !domain.ValidAgentTool(t) {
			middleware.WriteFieldError(w, "tools", "unknown tool: "+t)
			return
		}
	}
	if body.Tools == nil {
		body.Tools = []string{}
	}
	if body.WritePaths == nil {
		body.WritePaths = []string{}
	}
	agent, err := h.repo.Update(r.Context(), domain.Agent{
		ID:           id,
		UserID:       userID,
		Name:         body.Name,
		Description:  body.Description,
		Instructions: body.Instructions,
		Tools:        body.Tools,
		WritePaths:   body.WritePaths,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, agent)
}

// DELETE /api/v1/agents/{agentID}
func (h *AgentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "agentID")
	userID := middleware.UserIDFromContext(r.Context())
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		middleware.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
