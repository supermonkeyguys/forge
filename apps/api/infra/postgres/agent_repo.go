package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/forge-ai/forge/api/domain"
)

type agentRepo struct {
	pool *pgxpool.Pool
}

func NewAgentRepo(pool *pgxpool.Pool) domain.AgentRepository {
	return &agentRepo{pool: pool}
}

func (r *agentRepo) Create(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	const q = `
		INSERT INTO agents (user_id, name, description, instructions, tools, write_paths)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, user_id, name, description, instructions, tools, write_paths, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, a.UserID, a.Name, a.Description, a.Instructions, a.Tools, a.WritePaths)
	return scanAgent(row)
}

func (r *agentRepo) GetByID(ctx context.Context, id string) (domain.Agent, error) {
	const q = `
		SELECT id, user_id, name, description, instructions, tools, write_paths, created_at, updated_at
		FROM agents WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	a, err := scanAgent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Agent{}, fmt.Errorf("agentRepo.GetByID: %w", domain.ErrNotFound)
	}
	return a, err
}

func (r *agentRepo) ListByUserID(ctx context.Context, userID string) ([]domain.Agent, error) {
	const q = `
		SELECT id, user_id, name, description, instructions, tools, write_paths, created_at, updated_at
		FROM agents WHERE user_id = $1
		ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.Agent
	for rows.Next() {
		a, err := scanAgent(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, rows.Err()
}

func (r *agentRepo) Update(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	const q = `
		UPDATE agents
		SET name=$1, description=$2, instructions=$3, tools=$4, write_paths=$5, updated_at=now()
		WHERE id=$6 AND user_id=$7
		RETURNING id, user_id, name, description, instructions, tools, write_paths, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, a.Name, a.Description, a.Instructions, a.Tools, a.WritePaths, a.ID, a.UserID)
	result, err := scanAgent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Agent{}, fmt.Errorf("agentRepo.Update: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *agentRepo) Delete(ctx context.Context, id, userID string) error {
	const q = `DELETE FROM agents WHERE id=$1 AND user_id=$2`
	tag, err := r.pool.Exec(ctx, q, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("agentRepo.Delete: %w", domain.ErrNotFound)
	}
	return nil
}

type agentScanner interface {
	Scan(dest ...any) error
}

func scanAgent(row agentScanner) (domain.Agent, error) {
	var a domain.Agent
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&a.ID, &a.UserID, &a.Name, &a.Description, &a.Instructions,
		&a.Tools, &a.WritePaths, &createdAt, &updatedAt,
	)
	if err != nil {
		return domain.Agent{}, err
	}
	a.CreatedAt = createdAt
	a.UpdatedAt = updatedAt
	return a, nil
}
