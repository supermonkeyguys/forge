package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/forge-ai/forge/api/domain"
)

type workflowRepo struct {
	pool *pgxpool.Pool
}

func NewWorkflowRepo(pool *pgxpool.Pool) domain.WorkflowRepository {
	return &workflowRepo{pool: pool}
}

func (r *workflowRepo) Create(ctx context.Context, w domain.Workflow) (domain.Workflow, error) {
	defJSON, _ := json.Marshal(w.Definition)
	trigJSON, _ := json.Marshal(w.Trigger)
	const q = `
		INSERT INTO workflows (user_id, name, description, definition, trigger, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now(), now())
		RETURNING id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at`
	row := r.pool.QueryRow(ctx, q, w.UserID, w.Name, w.Description, defJSON, trigJSON, string(w.Status))
	result, err := scanWorkflow(row)
	if err != nil {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.Create: %w", err)
	}
	return result, nil
}

func (r *workflowRepo) GetByID(ctx context.Context, id string) (domain.Workflow, error) {
	const q = `
		SELECT id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at
		FROM workflows WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	w, err := scanWorkflow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.GetByID: %w", domain.ErrNotFound)
	}
	if err != nil {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.GetByID: %w", err)
	}
	return w, nil
}

func (r *workflowRepo) ListByUserID(ctx context.Context, userID string) ([]domain.Workflow, error) {
	const q = `
		SELECT id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at
		FROM workflows WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("workflowRepo.ListByUserID: %w", err)
	}
	defer rows.Close()
	var list []domain.Workflow
	for rows.Next() {
		w, err := scanWorkflow(rows)
		if err != nil {
			return nil, fmt.Errorf("workflowRepo.ListByUserID scan: %w", err)
		}
		list = append(list, w)
	}
	return list, rows.Err()
}

func (r *workflowRepo) Update(ctx context.Context, w domain.Workflow) (domain.Workflow, error) {
	defJSON, _ := json.Marshal(w.Definition)
	trigJSON, _ := json.Marshal(w.Trigger)
	const q = `
		UPDATE workflows
		SET name=$1, description=$2, definition=$3, trigger=$4, status=$5, updated_at=now()
		WHERE id=$6
		RETURNING id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at`
	row := r.pool.QueryRow(ctx, q, w.Name, w.Description, defJSON, trigJSON, string(w.Status), w.ID)
	result, err := scanWorkflow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.Update: %w", domain.ErrNotFound)
	}
	if err != nil {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.Update: %w", err)
	}
	return result, nil
}

func (r *workflowRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM workflows WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("workflowRepo.Delete: %w", err)
	}
	return nil
}

func (r *workflowRepo) ListActiveScheduled(ctx context.Context) ([]domain.Workflow, error) {
	const q = `
		SELECT id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at
		FROM workflows
		WHERE status = 'active' AND trigger->>'type' = 'schedule'
		ORDER BY created_at`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("workflowRepo.ListActiveScheduled: %w", err)
	}
	defer rows.Close()
	var list []domain.Workflow
	for rows.Next() {
		w, err := scanWorkflow(rows)
		if err != nil {
			return nil, fmt.Errorf("workflowRepo.ListActiveScheduled scan: %w", err)
		}
		list = append(list, w)
	}
	return list, rows.Err()
}

func (r *workflowRepo) UpdateLastTriggered(ctx context.Context, id string, t time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE workflows SET last_triggered_at=$1 WHERE id=$2`, t, id)
	return err
}

func scanWorkflow(row interface{ Scan(dest ...any) error }) (domain.Workflow, error) {
	var w domain.Workflow
	var defJSON, trigJSON []byte
	var status string
	err := row.Scan(&w.ID, &w.UserID, &w.Name, &w.Description,
		&defJSON, &trigJSON, &status, &w.CreatedAt, &w.UpdatedAt, &w.LastTriggeredAt)
	if err != nil {
		return domain.Workflow{}, err
	}
	w.Status = domain.WorkflowStatus(status)
	_ = json.Unmarshal(defJSON, &w.Definition)
	_ = json.Unmarshal(trigJSON, &w.Trigger)
	return w, nil
}
