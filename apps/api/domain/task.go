package domain

import "time"

// TaskStatus mirrors the Orchestrator state machine in the agent service.
type TaskStatus string

const (
	TaskStatusIdle       TaskStatus = "idle"
	TaskStatusAnalyzing  TaskStatus = "analyzing"
	TaskStatusPlanning   TaskStatus = "planning"
	TaskStatusBuilding   TaskStatus = "building"
	TaskStatusValidating TaskStatus = "validating"
	TaskStatusFixing     TaskStatus = "fixing"
	TaskStatusWaiting    TaskStatus = "waiting"
	TaskStatusDone       TaskStatus = "done"
	TaskStatusFailed     TaskStatus = "failed"
)

type Task struct {
	ID         string     `json:"id"`
	ProjectID  string     `json:"projectId"`
	UserID     string     `json:"userId"`
	Prompt     string     `json:"prompt"`
	Status     TaskStatus `json:"status"`
	PreviewURL string     `json:"previewUrl"`
	ErrorMsg   string     `json:"errorMsg"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// Pure business functions — no DB calls, directly testable.

func (t *Task) IsActive() bool {
	switch t.Status {
	case TaskStatusAnalyzing, TaskStatusPlanning,
		TaskStatusBuilding, TaskStatusValidating,
		TaskStatusFixing:
		return true
	}
	return false
}

func (t *Task) CanRetry() bool {
	return t.Status == TaskStatusFailed || t.Status == TaskStatusWaiting
}

func (t *Task) IsTerminal() bool {
	return t.Status == TaskStatusDone || t.Status == TaskStatusFailed
}

func ValidTaskStatus(s string) bool {
	switch TaskStatus(s) {
	case TaskStatusIdle, TaskStatusAnalyzing, TaskStatusPlanning,
		TaskStatusBuilding, TaskStatusValidating, TaskStatusFixing,
		TaskStatusWaiting, TaskStatusDone, TaskStatusFailed:
		return true
	}
	return false
}
