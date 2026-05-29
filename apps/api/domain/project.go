package domain

import "time"

// ProjectStatus mirrors the Orchestrator state machine in the agent service.
type ProjectStatus string

const (
	ProjectStatusIdle       ProjectStatus = "idle"
	ProjectStatusAnalyzing  ProjectStatus = "analyzing"
	ProjectStatusPlanning   ProjectStatus = "planning"
	ProjectStatusBuilding   ProjectStatus = "building"
	ProjectStatusValidating ProjectStatus = "validating"
	ProjectStatusFixing     ProjectStatus = "fixing"
	ProjectStatusWaiting    ProjectStatus = "waiting"
	ProjectStatusDone       ProjectStatus = "done"
	ProjectStatusFailed     ProjectStatus = "failed"
)

type Project struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	UserID     string        `json:"userId"`
	Status     ProjectStatus `json:"status"`
	PreviewURL string        `json:"previewUrl"`
	CreatedAt  time.Time     `json:"createdAt"`
	UpdatedAt  time.Time     `json:"updatedAt"`
}

// Pure business functions — no DB calls, directly testable.

func (p *Project) IsActive() bool {
	switch p.Status {
	case ProjectStatusAnalyzing, ProjectStatusPlanning,
		ProjectStatusBuilding, ProjectStatusValidating,
		ProjectStatusFixing:
		return true
	}
	return false
}

func (p *Project) CanRetry() bool {
	return p.Status == ProjectStatusFailed || p.Status == ProjectStatusWaiting
}

func (p *Project) IsTerminal() bool {
	return p.Status == ProjectStatusDone || p.Status == ProjectStatusFailed
}

// ValidStatus returns true if s is a known ProjectStatus value.
func ValidStatus(s string) bool {
	switch ProjectStatus(s) {
	case ProjectStatusIdle, ProjectStatusAnalyzing, ProjectStatusPlanning,
		ProjectStatusBuilding, ProjectStatusValidating, ProjectStatusFixing,
		ProjectStatusWaiting, ProjectStatusDone, ProjectStatusFailed:
		return true
	}
	return false
}
