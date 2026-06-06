package mock

import (
	"context"

	"github.com/forge-ai/forge/api/domain"
)

type TaskStepRepo struct {
	CreateFn       func(ctx context.Context, step domain.TaskStep) (domain.TaskStep, error)
	ListByTaskIDFn func(ctx context.Context, taskID string) ([]domain.TaskStep, error)
}

func (m *TaskStepRepo) Create(ctx context.Context, step domain.TaskStep) (domain.TaskStep, error) {
	if m.CreateFn != nil {
		return m.CreateFn(ctx, step)
	}
	return domain.TaskStep{}, nil
}

func (m *TaskStepRepo) ListByTaskID(ctx context.Context, taskID string) ([]domain.TaskStep, error) {
	if m.ListByTaskIDFn != nil {
		return m.ListByTaskIDFn(ctx, taskID)
	}
	return []domain.TaskStep{}, nil
}
