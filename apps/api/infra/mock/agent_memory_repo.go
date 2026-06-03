package mock

import (
	"context"
	"fmt"
	"github.com/forge-ai/forge/api/domain"
)

type AgentMemoryRepo struct {
	CreateFn         func(ctx context.Context, m domain.AgentMemory) (domain.AgentMemory, error)
	ListByAgentKeyFn func(ctx context.Context, agentKey, userID, query string, limit int) ([]domain.AgentMemory, error)
	DeleteFn         func(ctx context.Context, id, userID string) error
	DecayWeightsFn   func(ctx context.Context, userID string) error
}

func (m *AgentMemoryRepo) Create(ctx context.Context, mem domain.AgentMemory) (domain.AgentMemory, error) {
	if m.CreateFn == nil { return domain.AgentMemory{}, fmt.Errorf("mock: CreateFn not set") }
	return m.CreateFn(ctx, mem)
}
func (m *AgentMemoryRepo) ListByAgentKey(ctx context.Context, agentKey, userID, query string, limit int) ([]domain.AgentMemory, error) {
	if m.ListByAgentKeyFn == nil { return nil, fmt.Errorf("mock: ListByAgentKeyFn not set") }
	return m.ListByAgentKeyFn(ctx, agentKey, userID, query, limit)
}
func (m *AgentMemoryRepo) Delete(ctx context.Context, id, userID string) error {
	if m.DeleteFn == nil { return fmt.Errorf("mock: DeleteFn not set") }
	return m.DeleteFn(ctx, id, userID)
}
func (m *AgentMemoryRepo) DecayWeights(ctx context.Context, userID string) error {
	if m.DecayWeightsFn == nil { return fmt.Errorf("mock: DecayWeightsFn not set") }
	return m.DecayWeightsFn(ctx, userID)
}
