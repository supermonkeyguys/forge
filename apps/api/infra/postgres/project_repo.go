package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/forge-ai/forge/api/domain"
)

type projectRepo struct {
	pool *pgxpool.Pool
}

func NewProjectRepo(pool *pgxpool.Pool) domain.ProjectRepository {
	return &projectRepo{pool: pool}
}

func (r *projectRepo) Create(ctx context.Context, p domain.Project) (domain.Project, error) {
	const q = `
		INSERT INTO projects (id, name, user_id, status, preview_url, created_at, updated_at)
		VALUES (gen_random_uuid()::text, $1, $2, $3, '', now(), now())
		RETURNING id, name, user_id, status, preview_url, created_at, updated_at`

	row := r.pool.QueryRow(ctx, q, p.Name, p.UserID, string(p.Status))
	result, err := scanProject(row)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.Project{}, fmt.Errorf("projectRepo.Create: %w", domain.ErrAlreadyExists)
		}
		if isForeignKeyViolation(err) {
			return domain.Project{}, fmt.Errorf("projectRepo.Create: %w", domain.ErrNotFound)
		}
		return domain.Project{}, fmt.Errorf("projectRepo.Create: %w", err)
	}
	return result, nil
}

func (r *projectRepo) GetByID(ctx context.Context, id string) (domain.Project, error) {
	const q = `
		SELECT id, name, user_id, status, preview_url, created_at, updated_at
		FROM projects WHERE id = $1`

	row := r.pool.QueryRow(ctx, q, id)
	proj, err := scanProject(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Project{}, fmt.Errorf("projectRepo.GetByID: %w", domain.ErrNotFound)
	}
	return proj, err
}

func (r *projectRepo) ListByUserID(ctx context.Context, userID string, limit, offset int) ([]domain.Project, error) {
	const q = `
		SELECT id, name, user_id, status, preview_url, created_at, updated_at
		FROM projects WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	rows, err := r.pool.Query(ctx, q, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("projectRepo.ListByUserID: %w", err)
	}
	defer rows.Close()

	var projects []domain.Project
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func (r *projectRepo) UpdateStatus(ctx context.Context, id string, status domain.ProjectStatus, previewURL string) (domain.Project, error) {
	const q = `
		UPDATE projects SET status = $2, preview_url = $3, updated_at = now()
		WHERE id = $1
		RETURNING id, name, user_id, status, preview_url, created_at, updated_at`

	row := r.pool.QueryRow(ctx, q, id, string(status), previewURL)
	proj, err := scanProject(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Project{}, fmt.Errorf("projectRepo.UpdateStatus: %w", domain.ErrNotFound)
	}
	return proj, err
}

func (r *projectRepo) Delete(ctx context.Context, id string) error {
	const q = `DELETE FROM projects WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("projectRepo.Delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("projectRepo.Delete: %w", domain.ErrNotFound)
	}
	return nil
}

// scanProject works with both pgx.Row and pgx.Rows via the pgx.CollectableRow interface.
func scanProject(row interface {
	Scan(dest ...any) error
}) (domain.Project, error) {
	var p domain.Project
	var status string
	err := row.Scan(
		&p.ID, &p.Name, &p.UserID, &status,
		&p.PreviewURL, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return domain.Project{}, err
	}
	p.Status = domain.ProjectStatus(status)
	return p, nil
}
