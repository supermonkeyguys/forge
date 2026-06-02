package domain

import "context"

// Repository interfaces are defined HERE in domain (ports),
// implemented in infra/postgres (adapters).
// api/handler/ only knows these interfaces, never the concrete postgres types.

type ProjectRepository interface {
	Create(ctx context.Context, p Project) (Project, error)
	GetByID(ctx context.Context, id string) (Project, error)
	ListByUserID(ctx context.Context, userID string, limit, offset int) ([]Project, error)
	UpdateStatus(ctx context.Context, id string, status ProjectStatus, previewURL string) (Project, error)
	Delete(ctx context.Context, id string) error
}

type UserRepository interface {
	Create(ctx context.Context, u User) (User, error)
	GetByID(ctx context.Context, id string) (User, error)
	GetByEmail(ctx context.Context, email string) (User, error)
}

type TaskRepository interface {
	Create(ctx context.Context, t Task) (Task, error)
	GetByID(ctx context.Context, id string) (Task, error)
	GetLatestByProjectID(ctx context.Context, projectID string) (Task, error)
	GetLatestSummaryByProjectID(ctx context.Context, projectID string) (Task, error) // no eventsJson
	ListByProjectID(ctx context.Context, projectID string, limit, offset int) ([]Task, error)
	UpdateStatus(ctx context.Context, id string, status TaskStatus, previewURL, errorMsg string) (Task, error)
	SaveEvents(ctx context.Context, id string, eventsJSON string) error
}

type SettingsRepository interface {
	Get(ctx context.Context, userID string) (UserSettings, error)
	// Upsert stores baseURL and the already-encrypted apiKey.
	// Pass empty string for encryptedKey to leave the existing key unchanged.
	Upsert(ctx context.Context, userID, baseURL, encryptedKey string) error
	DeleteAPIKey(ctx context.Context, userID string) error
}

type AgentRepository interface {
	Create(ctx context.Context, a Agent) (Agent, error)
	GetByID(ctx context.Context, id string) (Agent, error)
	ListByUserID(ctx context.Context, userID string) ([]Agent, error)
	Update(ctx context.Context, a Agent) (Agent, error)
	Delete(ctx context.Context, id, userID string) error
}
