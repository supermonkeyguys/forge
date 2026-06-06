package domain

import (
	"context"
	"encoding/json"
	"time"
)

type ToolCallEntry struct {
	Tool  string          `json:"tool"`
	Input json.RawMessage `json:"input"`
}

type TaskStep struct {
	ID         string          `json:"id"`
	TaskID     string          `json:"taskId"`
	SeqNo      int             `json:"seqNo"`
	Agent      string          `json:"agent"`
	Summary    string          `json:"summary"`
	ToolCalls  []ToolCallEntry `json:"toolCalls"`
	DurationMs int             `json:"durationMs"`
	Status     string          `json:"status"`
	CreatedAt  time.Time       `json:"createdAt"`
}

type TaskStepRepository interface {
	Create(ctx context.Context, step TaskStep) (TaskStep, error)
	ListByTaskID(ctx context.Context, taskID string) ([]TaskStep, error)
}
