package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/forge-ai/forge/api/domain"
)

type taskRepo struct {
	pool *pgxpool.Pool
}

func NewTaskRepo(pool *pgxpool.Pool) domain.TaskRepository {
	return &taskRepo{pool: pool}
}

func (r *taskRepo) Create(ctx context.Context, t domain.Task) (domain.Task, error) {
	const q = `
		INSERT INTO tasks (id, project_id, user_id, prompt, status, preview_url, error_msg, created_at, updated_at)
		VALUES (gen_random_uuid()::text, $1, $2, $3, $4, '', '', now(), now())
		RETURNING id, project_id, user_id, prompt, status, preview_url, error_msg, events_json, created_at, updated_at`

	row := r.pool.QueryRow(ctx, q, t.ProjectID, t.UserID, t.Prompt, string(t.Status))
	result, err := scanTask(row)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.Task{}, fmt.Errorf("taskRepo.Create: %w", domain.ErrAlreadyExists)
		}
		return domain.Task{}, fmt.Errorf("taskRepo.Create: %w", err)
	}
	return result, nil
}

func (r *taskRepo) GetByID(ctx context.Context, id string) (domain.Task, error) {
	const q = `
		SELECT id, project_id, user_id, prompt, status, preview_url, error_msg, events_json, created_at, updated_at
		FROM tasks WHERE id = $1`

	row := r.pool.QueryRow(ctx, q, id)
	task, err := scanTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Task{}, fmt.Errorf("taskRepo.GetByID: %w", domain.ErrNotFound)
	}
	return task, err
}

func (r *taskRepo) GetLatestByProjectID(ctx context.Context, projectID string) (domain.Task, error) {
	const q = `
		SELECT id, project_id, user_id, prompt, status, preview_url, error_msg, events_json, created_at, updated_at
		FROM tasks WHERE project_id = $1
		ORDER BY created_at DESC LIMIT 1`

	row := r.pool.QueryRow(ctx, q, projectID)
	task, err := scanTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Task{}, fmt.Errorf("taskRepo.GetLatestByProjectID: %w", domain.ErrNotFound)
	}
	return task, err
}

func (r *taskRepo) GetLatestSummaryByProjectID(ctx context.Context, projectID string) (domain.Task, error) {
	const q = `
		SELECT id, project_id, user_id, prompt, status, preview_url, error_msg, created_at, updated_at
		FROM tasks WHERE project_id = $1
		ORDER BY created_at DESC LIMIT 1`

	row := r.pool.QueryRow(ctx, q, projectID)
	task, err := scanTaskSummary(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Task{}, fmt.Errorf("taskRepo.GetLatestSummaryByProjectID: %w", domain.ErrNotFound)
	}
	return task, err
}

func (r *taskRepo) ListByProjectID(ctx context.Context, projectID string, limit, offset int) ([]domain.Task, error) {
	const q = `
		SELECT id, project_id, user_id, prompt, status, preview_url, error_msg, events_json, created_at, updated_at
		FROM tasks WHERE project_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	rows, err := r.pool.Query(ctx, q, projectID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("taskRepo.ListByProjectID: %w", err)
	}
	defer rows.Close()

	var tasks []domain.Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

func (r *taskRepo) UpdateStatus(ctx context.Context, id string, status domain.TaskStatus, previewURL, errorMsg string) (domain.Task, error) {
	const q = `
		UPDATE tasks SET status = $2, preview_url = $3, error_msg = $4, updated_at = now()
		WHERE id = $1
		RETURNING id, project_id, user_id, prompt, status, preview_url, error_msg, events_json, created_at, updated_at`

	row := r.pool.QueryRow(ctx, q, id, string(status), previewURL, errorMsg)
	task, err := scanTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Task{}, fmt.Errorf("taskRepo.UpdateStatus: %w", domain.ErrNotFound)
	}
	return task, err
}

func (r *taskRepo) SaveEvents(ctx context.Context, id string, eventsJSON string) error {
	const q = `UPDATE tasks SET events_json = $2, updated_at = now() WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, id, eventsJSON)
	if err != nil {
		return fmt.Errorf("taskRepo.SaveEvents: %w", err)
	}
	return nil
}

func scanTask(row interface {
	Scan(dest ...any) error
}) (domain.Task, error) {
	var t domain.Task
	var status string
	err := row.Scan(
		&t.ID, &t.ProjectID, &t.UserID, &t.Prompt,
		&status, &t.PreviewURL, &t.ErrorMsg, &t.EventsJSON,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return domain.Task{}, err
	}
	t.Status = domain.TaskStatus(status)
	return t, nil
}

// scanTaskSummary scans a task row that does NOT include events_json.
func scanTaskSummary(row interface {
	Scan(dest ...any) error
}) (domain.Task, error) {
	var t domain.Task
	var status string
	err := row.Scan(
		&t.ID, &t.ProjectID, &t.UserID, &t.Prompt,
		&status, &t.PreviewURL, &t.ErrorMsg,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return domain.Task{}, err
	}
	t.Status = domain.TaskStatus(status)
	return t, nil
}
