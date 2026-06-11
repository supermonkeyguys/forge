package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/robfig/cron/v3"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// WorkflowScheduler is the minimal interface WorkflowHandler needs from the scheduler.
type WorkflowScheduler interface {
	Refresh(workflowID string, trigger domain.WorkflowTrigger, status domain.WorkflowStatus)
	Remove(workflowID string)
}

type WorkflowHandler struct {
	repo      domain.WorkflowRepository
	scheduler WorkflowScheduler // may be nil in tests
}

func NewWorkflowHandler(repo domain.WorkflowRepository, scheduler WorkflowScheduler) *WorkflowHandler {
	return &WorkflowHandler{repo: repo, scheduler: scheduler}
}

// POST /api/v1/workflows
func (h *WorkflowHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var body struct {
		Name        string                    `json:"name"`
		Description string                    `json:"description"`
		Definition  domain.WorkflowDefinition `json:"definition"`
		Trigger     domain.WorkflowTrigger    `json:"trigger"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}
	if err := validateTrigger(body.Trigger); err != nil {
		middleware.WriteFieldError(w, "trigger", err.Error())
		return
	}

	wf, err := h.repo.Create(r.Context(), domain.Workflow{
		UserID:      userID,
		Name:        body.Name,
		Description: body.Description,
		Definition:  body.Definition,
		Trigger:     body.Trigger,
		Status:      domain.WorkflowStatusDraft,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if h.scheduler != nil {
		h.scheduler.Refresh(wf.ID, wf.Trigger, wf.Status)
	}
	middleware.WriteJSON(w, http.StatusCreated, wf)
}

// GET /api/v1/workflows
func (h *WorkflowHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	list, err := h.repo.ListByUserID(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if list == nil {
		list = []domain.Workflow{}
	}
	middleware.WriteJSON(w, http.StatusOK, list)
}

// GET /api/v1/workflows/{workflowID}
func (h *WorkflowHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "workflowID")

	wf, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if wf.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, wf)
}

// PUT /api/v1/workflows/{workflowID}
func (h *WorkflowHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "workflowID")

	existing, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if existing.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	var body struct {
		Name        string                    `json:"name"`
		Description string                    `json:"description"`
		Definition  domain.WorkflowDefinition `json:"definition"`
		Trigger     domain.WorkflowTrigger    `json:"trigger"`
		Status      domain.WorkflowStatus     `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		body.Name = existing.Name
	}
	if body.Status == "" {
		body.Status = existing.Status
	}
	if err := validateTrigger(body.Trigger); err != nil {
		middleware.WriteFieldError(w, "trigger", err.Error())
		return
	}

	updated, err := h.repo.Update(r.Context(), domain.Workflow{
		ID:          id,
		UserID:      userID,
		Name:        body.Name,
		Description: body.Description,
		Definition:  body.Definition,
		Trigger:     body.Trigger,
		Status:      body.Status,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if h.scheduler != nil {
		h.scheduler.Refresh(updated.ID, updated.Trigger, updated.Status)
	}
	middleware.WriteJSON(w, http.StatusOK, updated)
}

// DELETE /api/v1/workflows/{workflowID}
func (h *WorkflowHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "workflowID")

	existing, err := h.repo.GetByID(r.Context(), id)
	if errors.Is(err, domain.ErrNotFound) {
		middleware.WriteError(w, domain.ErrNotFound)
		return
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if existing.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	if err := h.repo.Delete(r.Context(), id); err != nil {
		middleware.WriteError(w, err)
		return
	}
	if h.scheduler != nil {
		h.scheduler.Remove(id)
	}
	w.WriteHeader(http.StatusNoContent)
}

// validateTrigger returns an error if a schedule trigger has an invalid cron expression.
func validateTrigger(t domain.WorkflowTrigger) error {
	if t.Type != "schedule" {
		return nil
	}
	cronExpr, _ := t.Config["cron"].(string)
	if cronExpr == "" {
		return fmt.Errorf("schedule trigger requires config.cron")
	}
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	if _, err := parser.Parse(cronExpr); err != nil {
		return fmt.Errorf("invalid cron expression: %w", err)
	}
	return nil
}
