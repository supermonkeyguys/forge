package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// InternalHandler handles /internal/* routes — service-to-service only, no JWT.
type InternalHandler struct {
	taskRepo    domain.TaskRepository
	agentRepo   domain.AgentRepository
	memoryRepo  domain.AgentMemoryRepository
	contextRepo domain.ProjectContextRepository
	kbRepo      domain.WorkspaceKBRepository
}

func NewInternalHandler(
	taskRepo domain.TaskRepository,
	agentRepo domain.AgentRepository,
	memoryRepo domain.AgentMemoryRepository,
	contextRepo domain.ProjectContextRepository,
	kbRepo domain.WorkspaceKBRepository,
) *InternalHandler {
	return &InternalHandler{taskRepo: taskRepo, agentRepo: agentRepo, memoryRepo: memoryRepo, contextRepo: contextRepo, kbRepo: kbRepo}
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

// PUT /internal/projects/{projectID}/context/{heading}
func (h *InternalHandler) UpsertSection(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	heading, _ := url.PathUnescape(chi.URLParam(r, "heading"))
	var body struct {
		Content   string `json:"content"`
		AgentRole string `json:"agentRole"`
		TaskID    string `json:"taskId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	section, err := h.contextRepo.UpsertSection(r.Context(), domain.ProjectContextSection{
		ProjectID: projectID,
		Heading:   heading,
		Content:   body.Content,
		AgentRole: body.AgentRole,
		TaskID:    body.TaskID,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, section)
}

// GET /internal/projects/{projectID}/context
func (h *InternalHandler) GetSections(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	sections, err := h.contextRepo.ListByProjectID(r.Context(), projectID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if sections == nil {
		sections = []domain.ProjectContextSection{}
	}
	if r.URL.Query().Get("format") == "markdown" {
		var sb strings.Builder
		for _, s := range sections {
			sb.WriteString("## " + s.Heading + "\n\n" + s.Content + "\n\n")
		}
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(sb.String())) //nolint:errcheck
		return
	}
	middleware.WriteJSONList(w, sections, len(sections), 1, 100)
}

// GET /internal/kb?userid=&q=&limit=
func (h *InternalHandler) SearchKB(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userid")
	q := r.URL.Query().Get("q")
	if userID == "" {
		middleware.WriteFieldError(w, "userid", "userid is required")
		return
	}
	entries, err := h.kbRepo.Search(r.Context(), userID, q, 5)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if entries == nil {
		entries = []domain.WorkspaceKBEntry{}
	}
	middleware.WriteJSONList(w, entries, len(entries), 1, 5)
}

// POST /internal/kb
func (h *InternalHandler) CreateKBEntry(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID      string   `json:"userId"`
		Title       string   `json:"title"`
		Content     string   `json:"content"`
		Tags        []string `json:"tags"`
		SourceAgent string   `json:"sourceAgent"`
		SourceTask  string   `json:"sourceTask"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Tags == nil {
		body.Tags = []string{}
	}
	entry, err := h.kbRepo.Create(r.Context(), domain.WorkspaceKBEntry{
		UserID:      body.UserID,
		Title:       body.Title,
		Content:     body.Content,
		Tags:        body.Tags,
		SourceAgent: body.SourceAgent,
		SourceTask:  body.SourceTask,
		Verified:    false,
		Confidence:  0.8,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, entry)
}
