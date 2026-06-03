package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/forge-ai/forge/api/domain"
)

type agentMemoryRepo struct{ pool *pgxpool.Pool }

func NewAgentMemoryRepo(pool *pgxpool.Pool) domain.AgentMemoryRepository {
	return &agentMemoryRepo{pool: pool}
}

func (r *agentMemoryRepo) Create(ctx context.Context, m domain.AgentMemory) (domain.AgentMemory, error) {
	const q = `
		INSERT INTO agent_memories (agent_key, user_id, memory_key, content)
		VALUES ($1, $2, $3, $4)
		RETURNING id, agent_key, user_id, memory_key, content, weight, access_count, last_accessed, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, m.AgentKey, m.UserID, m.MemoryKey, m.Content)
	return scanMemory(row)
}

func (r *agentMemoryRepo) ListByAgentKey(ctx context.Context, agentKey, userID, query string, limit int) ([]domain.AgentMemory, error) {
	var args []any
	var where []string
	args = append(args, agentKey, userID)
	where = append(where, "agent_key = $1", "user_id = $2")
	if query != "" {
		args = append(args, "%"+query+"%")
		where = append(where, fmt.Sprintf("content ILIKE $%d", len(args)))
	}
	if limit <= 0 || limit > 20 {
		limit = 5
	}
	args = append(args, limit)
	q := fmt.Sprintf(`
		SELECT id, agent_key, user_id, memory_key, content, weight, access_count, last_accessed, created_at, updated_at
		FROM agent_memories
		WHERE %s
		ORDER BY weight DESC
		LIMIT $%d`, strings.Join(where, " AND "), len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.AgentMemory
	for rows.Next() {
		m, err := scanMemory(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, m)
	}
	return result, rows.Err()
}

func (r *agentMemoryRepo) Delete(ctx context.Context, id, userID string) error {
	const q = `DELETE FROM agent_memories WHERE id = $1 AND user_id = $2`
	tag, err := r.pool.Exec(ctx, q, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("agentMemoryRepo.Delete: %w", domain.ErrNotFound)
	}
	return nil
}

func (r *agentMemoryRepo) DecayWeights(ctx context.Context, userID string) error {
	const q = `
		UPDATE agent_memories
		SET weight = GREATEST(weight * 0.9, 0.1), updated_at = now()
		WHERE user_id = $1
		  AND last_accessed < now() - interval '30 days'
		  AND weight > 0.1`
	_, err := r.pool.Exec(ctx, q, userID)
	return err
}

type memoryScanner interface{ Scan(dest ...any) error }

func scanMemory(row memoryScanner) (domain.AgentMemory, error) {
	var m domain.AgentMemory
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&m.ID, &m.AgentKey, &m.UserID, &m.MemoryKey, &m.Content,
		&m.Weight, &m.AccessCount, &m.LastAccessed, &createdAt, &updatedAt,
	)
	m.CreatedAt = createdAt
	m.UpdatedAt = updatedAt
	return m, err
}
