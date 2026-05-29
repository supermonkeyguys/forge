package mock

import (
	"context"
	"fmt"

	"github.com/forge-ai/forge/api/domain"
)

// TaskRepo is a configurable mock for domain.TaskRepository.
type TaskRepo struct {
	CreateFn          func(ctx context.Context, t domain.Task) (domain.Task, error)
	GetByIDFn         func(ctx context.Context, id string) (domain.Task, error)
	ListByProjectIDFn func(ctx context.Context, projectID string, limit, offset int) ([]domain.Task, error)
	UpdateStatusFn    func(ctx context.Context, id string, status domain.TaskStatus, previewURL, errorMsg string) (domain.Task, error)
}

func (m *TaskRepo) Create(ctx context.Context, t domain.Task) (domain.Task, error) {
	if m.CreateFn == nil {
		return domain.Task{}, fmt.Errorf("mock: CreateFn not set")
	}
	return m.CreateFn(ctx, t)
}

func (m *TaskRepo) GetByID(ctx context.Context, id string) (domain.Task, error) {
	if m.GetByIDFn == nil {
		return domain.Task{}, fmt.Errorf("mock: GetByIDFn not set")
	}
	return m.GetByIDFn(ctx, id)
}

func (m *TaskRepo) ListByProjectID(ctx context.Context, projectID string, limit, offset int) ([]domain.Task, error) {
	if m.ListByProjectIDFn == nil {
		return nil, fmt.Errorf("mock: ListByProjectIDFn not set")
	}
	return m.ListByProjectIDFn(ctx, projectID, limit, offset)
}

func (m *TaskRepo) UpdateStatus(ctx context.Context, id string, status domain.TaskStatus, previewURL, errorMsg string) (domain.Task, error) {
	if m.UpdateStatusFn == nil {
		return domain.Task{}, fmt.Errorf("mock: UpdateStatusFn not set")
	}
	return m.UpdateStatusFn(ctx, id, status, previewURL, errorMsg)
}
