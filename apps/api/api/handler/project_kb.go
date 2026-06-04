package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type ProjectKBHandler struct {
	repo     domain.ProjectKBRepository
	agentURL string // Agent Service base URL, e.g. "http://localhost:3001"
}

func NewProjectKBHandler(repo domain.ProjectKBRepository) *ProjectKBHandler {
	return &ProjectKBHandler{repo: repo}
}

func NewProjectKBHandlerWithAgent(repo domain.ProjectKBRepository, agentURL string) *ProjectKBHandler {
	return &ProjectKBHandler{repo: repo, agentURL: agentURL}
}

// GET /api/v1/projects/{projectID}/kb?type=&status=
func (h *ProjectKBHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())
	entries, err := h.repo.List(r.Context(), projectID, userID,
		r.URL.Query().Get("type"), r.URL.Query().Get("status"))
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if entries == nil {
		entries = []domain.ProjectKBEntry{}
	}
	middleware.WriteJSONList(w, entries, len(entries), 1, 100)
}

// POST /api/v1/projects/{projectID}/kb
func (h *ProjectKBHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Title   string   `json:"title"`
		Content string   `json:"content"`
		Type    string   `json:"type"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Title == "" {
		middleware.WriteFieldError(w, "title", "title is required")
		return
	}
	if body.Content == "" {
		middleware.WriteFieldError(w, "content", "content is required")
		return
	}
	if body.Type == "" {
		body.Type = "spec"
	}
	if !domain.ValidKBTypes[body.Type] {
		middleware.WriteFieldError(w, "type", "invalid type")
		return
	}
	if body.Tags == nil {
		body.Tags = []string{}
	}
	pid := projectID
	entry, err := h.repo.Create(r.Context(), domain.ProjectKBEntry{
		ProjectID: &pid, UserID: userID, Type: body.Type,
		Title: body.Title, Content: body.Content, Tags: body.Tags,
		InputType: "text", Status: "verified", Confidence: 1.0,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, entry)
}

// PUT /api/v1/projects/{projectID}/kb/{id}
func (h *ProjectKBHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Title   string   `json:"title"`
		Content string   `json:"content"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Tags == nil {
		body.Tags = []string{}
	}
	entry, err := h.repo.Update(r.Context(), domain.ProjectKBEntry{
		ID: id, UserID: userID, Title: body.Title, Content: body.Content, Tags: body.Tags,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// PUT /api/v1/projects/{projectID}/kb/{id}/verify
func (h *ProjectKBHandler) Verify(w http.ResponseWriter, r *http.Request) {
	id, userID := chi.URLParam(r, "id"), middleware.UserIDFromContext(r.Context())
	entry, err := h.repo.SetStatus(r.Context(), id, userID, "verified")
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// PUT /api/v1/projects/{projectID}/kb/{id}/deprecate
func (h *ProjectKBHandler) Deprecate(w http.ResponseWriter, r *http.Request) {
	id, userID := chi.URLParam(r, "id"), middleware.UserIDFromContext(r.Context())
	entry, err := h.repo.SetStatus(r.Context(), id, userID, "deprecated")
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// DELETE /api/v1/projects/{projectID}/kb/{id}
func (h *ProjectKBHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, userID := chi.URLParam(r, "id"), middleware.UserIDFromContext(r.Context())
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		middleware.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/projects/{projectID}/kb/ingest
// Accepts multipart/form-data with fields: inputType (url|file), sourceRef (url), file (upload), title
func (h *ProjectKBHandler) Ingest(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB max
		middleware.WriteFieldError(w, "body", "invalid multipart form")
		return
	}

	inputType := r.FormValue("inputType")
	if inputType != "url" && inputType != "file" {
		middleware.WriteFieldError(w, "inputType", "must be 'url' or 'file'")
		return
	}

	title := r.FormValue("title")
	if title == "" {
		title = "Untitled"
	}

	sourceRef := ""
	if inputType == "url" {
		sourceRef = r.FormValue("sourceRef")
		if sourceRef == "" {
			middleware.WriteFieldError(w, "sourceRef", "sourceRef is required for url input")
			return
		}
	} else {
		// Save uploaded file to temp dir
		file, header, err := r.FormFile("file")
		if err != nil {
			middleware.WriteFieldError(w, "file", "file is required")
			return
		}
		defer file.Close()

		tmpDir := os.TempDir()
		tmpPath := filepath.Join(tmpDir, "kb_"+header.Filename)
		f, err := os.Create(tmpPath)
		if err != nil {
			middleware.WriteError(w, fmt.Errorf("save file: %w", err))
			return
		}
		defer f.Close()
		if _, err := io.Copy(f, file); err != nil {
			middleware.WriteError(w, fmt.Errorf("write file: %w", err))
			return
		}
		sourceRef = tmpPath
		if title == "Untitled" {
			title = header.Filename
		}
	}

	// Create KB entry with status: processing
	pid := projectID
	entry, err := h.repo.Create(r.Context(), domain.ProjectKBEntry{
		ProjectID: &pid, UserID: userID, Type: "spec",
		Title: title, Content: "(processing…)", Tags: []string{},
		InputType: inputType, SourceRef: sourceRef,
		Status: "processing", Confidence: 0.8,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	// Fire-and-forget: call agent service to process
	if h.agentURL != "" {
		go func() {
			body, _ := json.Marshal(map[string]string{
				"kbEntryId":   entry.ID,
				"kbInputType": inputType,
				"kbSourceRef": sourceRef,
			})
			req, _ := http.NewRequest(http.MethodPost, h.agentURL+"/run-kb-ingest", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			agentHTTPClient.Do(req) //nolint:errcheck
		}()
	}

	middleware.WriteJSON(w, http.StatusAccepted, entry)
}
