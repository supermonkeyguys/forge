package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// InternalHandler handles /internal/* routes — service-to-service only, no JWT.
type InternalHandler struct {
	taskRepo   domain.TaskRepository
	agentRepo  domain.AgentRepository
	memoryRepo domain.AgentMemoryRepository
	pkbRepo    domain.ProjectKBRepository
}

func NewInternalHandler(
	taskRepo   domain.TaskRepository,
	agentRepo  domain.AgentRepository,
	memoryRepo domain.AgentMemoryRepository,
	pkbRepo    domain.ProjectKBRepository,
) *InternalHandler {
	return &InternalHandler{taskRepo: taskRepo, agentRepo: agentRepo, memoryRepo: memoryRepo, pkbRepo: pkbRepo}
}

// PATCH /internal/tasks/{taskID}/status
func (h *InternalHandler) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	if taskID == "" {
		middleware.WriteFieldError(w, "taskID", "taskID is required")
		return
	}

	var body struct {
		Status     string          `json:"status"`
		PreviewURL string          `json:"previewUrl"`
		ErrorMsg   string          `json:"errorMsg"`
		Events     json.RawMessage `json:"events,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if !domain.ValidTaskStatus(body.Status) {
		middleware.WriteFieldError(w, "status", "invalid task status: "+body.Status)
		return
	}

	task, err := h.taskRepo.UpdateStatus(r.Context(), taskID, domain.TaskStatus(body.Status), body.PreviewURL, body.ErrorMsg)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	// Persist events when provided (sent on terminal states: done/failed)
	if len(body.Events) > 0 && string(body.Events) != "null" {
		if err := h.taskRepo.SaveEvents(r.Context(), taskID, string(body.Events)); err != nil {
			log.Printf("[UpdateTaskStatus] SaveEvents taskID=%s err=%v", taskID, err)
		}
	}

	middleware.WriteJSON(w, http.StatusOK, task)
}

// GET /internal/agents/{agentID}
func (h *InternalHandler) GetAgent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "agentID")
	agent, err := h.agentRepo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, agent)
}

// POST /internal/agents/{agentKey}/memories
func (h *InternalHandler) CreateAgentMemory(w http.ResponseWriter, r *http.Request) {
	agentKey := chi.URLParam(r, "agentKey")
	var body struct {
		UserID    string `json:"userId"`
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
	mem, err := h.memoryRepo.Create(r.Context(), domain.AgentMemory{
		AgentKey:  agentKey,
		UserID:    body.UserID,
		MemoryKey: body.MemoryKey,
		Content:   body.Content,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, mem)
}

// GET /internal/projects/{projectID}/kb?type=&userid=&q=&limit=
func (h *InternalHandler) SearchProjectKB(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := r.URL.Query().Get("userid")
	q := r.URL.Query().Get("q")
	entryType := r.URL.Query().Get("type")
	entries, err := h.pkbRepo.Search(r.Context(), projectID, userID, q, entryType, 10)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if entries == nil {
		entries = []domain.ProjectKBEntry{}
	}
	middleware.WriteJSONList(w, entries, len(entries), 1, 10)
}

// POST /internal/projects/{projectID}/kb
func (h *InternalHandler) CreateProjectKBEntry(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	var body struct {
		UserID      string   `json:"userId"`
		Type        string   `json:"type"`
		Title       string   `json:"title"`
		Content     string   `json:"content"`
		Tags        []string `json:"tags"`
		SourceAgent string   `json:"sourceAgent"`
		SourceTask  string   `json:"sourceTask"`
		Confidence  float64  `json:"confidence"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Tags == nil {
		body.Tags = []string{}
	}
	if body.Type == "" {
		body.Type = "spec"
	}
	if body.Confidence == 0 {
		body.Confidence = 0.8
	}
	pid := projectID
	entry, err := h.pkbRepo.Create(r.Context(), domain.ProjectKBEntry{
		ProjectID: &pid, UserID: body.UserID, Type: body.Type,
		Title: body.Title, Content: body.Content, Tags: body.Tags,
		SourceAgent: body.SourceAgent, SourceTask: body.SourceTask,
		InputType: "text", Status: "pending", Confidence: body.Confidence,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, entry)
}

// PATCH /internal/kb/{id}/content — used by ingest job
func (h *InternalHandler) UpdateKBContent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Content string `json:"content"`
		Status  string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Status == "" {
		body.Status = "pending"
	}
	if err := h.pkbRepo.UpdateContent(r.Context(), id, body.Content, body.Status); err != nil {
		middleware.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
