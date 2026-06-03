package mock

import (
	"context"
	"fmt"
	"github.com/forge-ai/forge/api/domain"
)

type ProjectContextRepo struct {
	UpsertSectionFn     func(ctx context.Context, s domain.ProjectContextSection) (domain.ProjectContextSection, error)
	ListByProjectIDFn   func(ctx context.Context, projectID string) ([]domain.ProjectContextSection, error)
	DeleteByProjectIDFn func(ctx context.Context, projectID string) error
}

func (m *ProjectContextRepo) UpsertSection(ctx context.Context, s domain.ProjectContextSection) (domain.ProjectContextSection, error) {
	if m.UpsertSectionFn == nil {
		return domain.ProjectContextSection{}, fmt.Errorf("mock: UpsertSectionFn not set")
	}
	return m.UpsertSectionFn(ctx, s)
}
func (m *ProjectContextRepo) ListByProjectID(ctx context.Context, projectID string) ([]domain.ProjectContextSection, error) {
	if m.ListByProjectIDFn == nil {
		return nil, fmt.Errorf("mock: ListByProjectIDFn not set")
	}
	return m.ListByProjectIDFn(ctx, projectID)
}
func (m *ProjectContextRepo) DeleteByProjectID(ctx context.Context, projectID string) error {
	if m.DeleteByProjectIDFn == nil {
		return fmt.Errorf("mock: DeleteByProjectIDFn not set")
	}
	return m.DeleteByProjectIDFn(ctx, projectID)
}
