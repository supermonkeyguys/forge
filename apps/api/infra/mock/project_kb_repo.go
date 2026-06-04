package mock

import (
	"context"
	"fmt"
	"github.com/forge-ai/forge/api/domain"
)

type ProjectKBRepo struct {
	CreateFn        func(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error)
	GetByIDFn       func(ctx context.Context, id string) (domain.ProjectKBEntry, error)
	ListFn          func(ctx context.Context, projectID, userID, entryType, status string) ([]domain.ProjectKBEntry, error)
	SearchFn        func(ctx context.Context, projectID, userID, query, entryType string, limit int) ([]domain.ProjectKBEntry, error)
	UpdateFn        func(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error)
	SetStatusFn     func(ctx context.Context, id, userID, status string) (domain.ProjectKBEntry, error)
	DeleteFn        func(ctx context.Context, id, userID string) error
	UpdateContentFn func(ctx context.Context, id, content, status string) error
}

func (m *ProjectKBRepo) Create(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
	if m.CreateFn == nil {
		return domain.ProjectKBEntry{}, fmt.Errorf("mock: CreateFn not set")
	}
	return m.CreateFn(ctx, e)
}
func (m *ProjectKBRepo) GetByID(ctx context.Context, id string) (domain.ProjectKBEntry, error) {
	if m.GetByIDFn == nil {
		return domain.ProjectKBEntry{}, fmt.Errorf("mock: GetByIDFn not set")
	}
	return m.GetByIDFn(ctx, id)
}
func (m *ProjectKBRepo) List(ctx context.Context, projectID, userID, entryType, status string) ([]domain.ProjectKBEntry, error) {
	if m.ListFn == nil {
		return nil, fmt.Errorf("mock: ListFn not set")
	}
	return m.ListFn(ctx, projectID, userID, entryType, status)
}
func (m *ProjectKBRepo) Search(ctx context.Context, projectID, userID, query, entryType string, limit int) ([]domain.ProjectKBEntry, error) {
	if m.SearchFn == nil {
		return nil, fmt.Errorf("mock: SearchFn not set")
	}
	return m.SearchFn(ctx, projectID, userID, query, entryType, limit)
}
func (m *ProjectKBRepo) Update(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
	if m.UpdateFn == nil {
		return domain.ProjectKBEntry{}, fmt.Errorf("mock: UpdateFn not set")
	}
	return m.UpdateFn(ctx, e)
}
func (m *ProjectKBRepo) SetStatus(ctx context.Context, id, userID, status string) (domain.ProjectKBEntry, error) {
	if m.SetStatusFn == nil {
		return domain.ProjectKBEntry{}, fmt.Errorf("mock: SetStatusFn not set")
	}
	return m.SetStatusFn(ctx, id, userID, status)
}
func (m *ProjectKBRepo) Delete(ctx context.Context, id, userID string) error {
	if m.DeleteFn == nil {
		return fmt.Errorf("mock: DeleteFn not set")
	}
	return m.DeleteFn(ctx, id, userID)
}
func (m *ProjectKBRepo) UpdateContent(ctx context.Context, id, content, status string) error {
	if m.UpdateContentFn == nil {
		return fmt.Errorf("mock: UpdateContentFn not set")
	}
	return m.UpdateContentFn(ctx, id, content, status)
}
