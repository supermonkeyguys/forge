package domain

import "context"

// Repository interfaces are defined HERE in domain (ports),
// implemented in infra/postgres (adapters).
// api/handler/ only knows these interfaces, never the concrete postgres types.

type ProjectRepository interface {
	Create(ctx context.Context, p Project) (Project, error)
	GetByID(ctx context.Context, id string) (Project, error)
	ListByUserID(ctx context.Context, userID string) ([]Project, error)
	UpdateStatus(ctx context.Context, id string, status ProjectStatus, previewURL string) (Project, error)
	Delete(ctx context.Context, id string) error
}

type UserRepository interface {
	Create(ctx context.Context, u User) (User, error)
	GetByID(ctx context.Context, id string) (User, error)
	GetByEmail(ctx context.Context, email string) (User, error)
}
