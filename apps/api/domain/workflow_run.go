package domain

import (
	"context"
	"time"
)

type WorkflowRunStatus string

const (
	WorkflowRunStatusQueued  WorkflowRunStatus = "queued"
	WorkflowRunStatusRunning WorkflowRunStatus = "running"
	WorkflowRunStatusDone    WorkflowRunStatus = "done"
	WorkflowRunStatusFailed  WorkflowRunStatus = "failed"
)

type WorkflowRun struct {
	ID         string            `json:"id"`
	WorkflowID string            `json:"workflowId"`
	UserID     string            `json:"userId"`
	Status     WorkflowRunStatus `json:"status"`
	Error      string            `json:"error"`
	AgentJobID string            `json:"agentJobId"`
	CreatedAt  time.Time         `json:"createdAt"`
	FinishedAt *time.Time        `json:"finishedAt"`
}

type WorkflowRunRepository interface {
	Create(ctx context.Context, run WorkflowRun) (WorkflowRun, error)
	GetByID(ctx context.Context, id string) (WorkflowRun, error)
	UpdateStatus(ctx context.Context, id string, status WorkflowRunStatus, errMsg string, finishedAt *time.Time) error
	UpdateAgentJobID(ctx context.Context, id string, agentJobID string) error
}
