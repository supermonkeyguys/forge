package mock

import (
	"context"
	"fmt"

	"github.com/forge-ai/forge/api/domain"
)

// AgentRepo is a configurable mock for domain.AgentRepository.
// Set the *Fn fields in each test to control behavior.
type AgentRepo struct {
	CreateFn       func(ctx context.Context, a domain.Agent) (domain.Agent, error)
	GetByIDFn      func(ctx context.Context, id string) (domain.Agent, error)
	ListByUserIDFn func(ctx context.Context, userID string) ([]domain.Agent, error)
	UpdateFn       func(ctx context.Context, a domain.Agent) (domain.Agent, error)
	DeleteFn       func(ctx context.Context, id, userID string) error
}

func (m *AgentRepo) Create(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	if m.CreateFn == nil {
		return domain.Agent{}, fmt.Errorf("mock: CreateFn not set")
	}
	return m.CreateFn(ctx, a)
}

func (m *AgentRepo) GetByID(ctx context.Context, id string) (domain.Agent, error) {
	if m.GetByIDFn == nil {
		return domain.Agent{}, fmt.Errorf("mock: GetByIDFn not set")
	}
	return m.GetByIDFn(ctx, id)
}

func (m *AgentRepo) ListByUserID(ctx context.Context, userID string) ([]domain.Agent, error) {
	if m.ListByUserIDFn == nil {
		return nil, fmt.Errorf("mock: ListByUserIDFn not set")
	}
	return m.ListByUserIDFn(ctx, userID)
}

func (m *AgentRepo) Update(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	if m.UpdateFn == nil {
		return domain.Agent{}, fmt.Errorf("mock: UpdateFn not set")
	}
	return m.UpdateFn(ctx, a)
}

func (m *AgentRepo) Delete(ctx context.Context, id, userID string) error {
	if m.DeleteFn == nil {
		return fmt.Errorf("mock: DeleteFn not set")
	}
	return m.DeleteFn(ctx, id, userID)
}
