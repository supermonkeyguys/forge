// Package mock provides hand-written test doubles for domain repositories.
// Use these in api/handler tests — never in production code.
package mock

import (
	"context"

	"github.com/forge-ai/forge/api/domain"
)

// ProjectRepo is a configurable mock for domain.ProjectRepository.
// Set the *Fn fields in each test to control behavior.
type ProjectRepo struct {
	CreateFn      func(ctx context.Context, p domain.Project) (domain.Project, error)
	GetByIDFn     func(ctx context.Context, id string) (domain.Project, error)
	ListByUserIDFn func(ctx context.Context, userID string) ([]domain.Project, error)
	UpdateStatusFn func(ctx context.Context, id string, status domain.ProjectStatus, previewURL string) (domain.Project, error)
	DeleteFn      func(ctx context.Context, id string) error
}

func (m *ProjectRepo) Create(ctx context.Context, p domain.Project) (domain.Project, error) {
	return m.CreateFn(ctx, p)
}

func (m *ProjectRepo) GetByID(ctx context.Context, id string) (domain.Project, error) {
	return m.GetByIDFn(ctx, id)
}

func (m *ProjectRepo) ListByUserID(ctx context.Context, userID string) ([]domain.Project, error) {
	return m.ListByUserIDFn(ctx, userID)
}

func (m *ProjectRepo) UpdateStatus(ctx context.Context, id string, status domain.ProjectStatus, previewURL string) (domain.Project, error) {
	return m.UpdateStatusFn(ctx, id, status, previewURL)
}

func (m *ProjectRepo) Delete(ctx context.Context, id string) error {
	return m.DeleteFn(ctx, id)
}

// UserRepo is a configurable mock for domain.UserRepository.
type UserRepo struct {
	CreateFn     func(ctx context.Context, u domain.User) (domain.User, error)
	GetByIDFn    func(ctx context.Context, id string) (domain.User, error)
	GetByEmailFn func(ctx context.Context, email string) (domain.User, error)
}

func (m *UserRepo) Create(ctx context.Context, u domain.User) (domain.User, error) {
	return m.CreateFn(ctx, u)
}

func (m *UserRepo) GetByID(ctx context.Context, id string) (domain.User, error) {
	return m.GetByIDFn(ctx, id)
}

func (m *UserRepo) GetByEmail(ctx context.Context, email string) (domain.User, error) {
	return m.GetByEmailFn(ctx, email)
}
