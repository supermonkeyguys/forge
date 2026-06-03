package mock

import (
	"context"
	"fmt"
	"github.com/forge-ai/forge/api/domain"
)

type WorkspaceKBRepo struct {
	CreateFn  func(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error)
	GetByIDFn func(ctx context.Context, id string) (domain.WorkspaceKBEntry, error)
	SearchFn  func(ctx context.Context, userID, query string, limit int) ([]domain.WorkspaceKBEntry, error)
	ListFn    func(ctx context.Context, userID string) ([]domain.WorkspaceKBEntry, error)
	UpdateFn  func(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error)
	VerifyFn  func(ctx context.Context, id, userID string) (domain.WorkspaceKBEntry, error)
	DeleteFn  func(ctx context.Context, id, userID string) error
}

func (m *WorkspaceKBRepo) Create(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
	if m.CreateFn == nil { return domain.WorkspaceKBEntry{}, fmt.Errorf("mock: CreateFn not set") }
	return m.CreateFn(ctx, e)
}
func (m *WorkspaceKBRepo) GetByID(ctx context.Context, id string) (domain.WorkspaceKBEntry, error) {
	if m.GetByIDFn == nil { return domain.WorkspaceKBEntry{}, fmt.Errorf("mock: GetByIDFn not set") }
	return m.GetByIDFn(ctx, id)
}
func (m *WorkspaceKBRepo) Search(ctx context.Context, userID, query string, limit int) ([]domain.WorkspaceKBEntry, error) {
	if m.SearchFn == nil { return nil, fmt.Errorf("mock: SearchFn not set") }
	return m.SearchFn(ctx, userID, query, limit)
}
func (m *WorkspaceKBRepo) List(ctx context.Context, userID string) ([]domain.WorkspaceKBEntry, error) {
	if m.ListFn == nil { return nil, fmt.Errorf("mock: ListFn not set") }
	return m.ListFn(ctx, userID)
}
func (m *WorkspaceKBRepo) Update(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
	if m.UpdateFn == nil { return domain.WorkspaceKBEntry{}, fmt.Errorf("mock: UpdateFn not set") }
	return m.UpdateFn(ctx, e)
}
func (m *WorkspaceKBRepo) Verify(ctx context.Context, id, userID string) (domain.WorkspaceKBEntry, error) {
	if m.VerifyFn == nil { return domain.WorkspaceKBEntry{}, fmt.Errorf("mock: VerifyFn not set") }
	return m.VerifyFn(ctx, id, userID)
}
func (m *WorkspaceKBRepo) Delete(ctx context.Context, id, userID string) error {
	if m.DeleteFn == nil { return fmt.Errorf("mock: DeleteFn not set") }
	return m.DeleteFn(ctx, id, userID)
}
