package mock

import (
	"context"
	"fmt"

	"github.com/forge-ai/forge/api/domain"
)

// TaskRepo is a configurable mock for domain.TaskRepository.
type TaskRepo struct {
	CreateFn                func(ctx context.Context, t domain.Task) (domain.Task, error)
	GetByIDFn               func(ctx context.Context, id string) (domain.Task, error)
	GetLatestByProjectIDFn          func(ctx context.Context, projectID string) (domain.Task, error)
	GetLatestSummaryByProjectIDFn   func(ctx context.Context, projectID string) (domain.Task, error)
	ListByProjectIDFn               func(ctx context.Context, projectID string, limit, offset int) ([]domain.Task, error)
	UpdateStatusFn          func(ctx context.Context, id string, status domain.TaskStatus, previewURL, errorMsg string) (domain.Task, error)
	SaveEventsFn            func(ctx context.Context, id string, eventsJSON string) error
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

func (m *TaskRepo) GetLatestByProjectID(ctx context.Context, projectID string) (domain.Task, error) {
	if m.GetLatestByProjectIDFn == nil {
		return domain.Task{}, fmt.Errorf("mock: GetLatestByProjectIDFn not set")
	}
	return m.GetLatestByProjectIDFn(ctx, projectID)
}

func (m *TaskRepo) GetLatestSummaryByProjectID(ctx context.Context, projectID string) (domain.Task, error) {
	if m.GetLatestSummaryByProjectIDFn == nil {
		return domain.Task{}, fmt.Errorf("mock: GetLatestSummaryByProjectIDFn not set")
	}
	return m.GetLatestSummaryByProjectIDFn(ctx, projectID)
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

func (m *TaskRepo) SaveEvents(ctx context.Context, id string, eventsJSON string) error {
	if m.SaveEventsFn == nil {
		return nil // no-op by default — tests that don't care about events pass silently
	}
	return m.SaveEventsFn(ctx, id, eventsJSON)
}
