package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/forge-ai/forge/api/domain"
)

type projectContextRepo struct{ pool *pgxpool.Pool }

func NewProjectContextRepo(pool *pgxpool.Pool) domain.ProjectContextRepository {
	return &projectContextRepo{pool: pool}
}

func (r *projectContextRepo) UpsertSection(ctx context.Context, s domain.ProjectContextSection) (domain.ProjectContextSection, error) {
	const q = `
		INSERT INTO project_context_sections (project_id, heading, content, agent_role, task_id)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (project_id, heading)
		DO UPDATE SET
			content    = EXCLUDED.content,
			agent_role = EXCLUDED.agent_role,
			task_id    = EXCLUDED.task_id,
			version    = project_context_sections.version + 1,
			updated_at = now()
		RETURNING id, project_id, heading, content, agent_role, task_id, version, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, s.ProjectID, s.Heading, s.Content, s.AgentRole, s.TaskID)
	return scanSection(row)
}

func (r *projectContextRepo) ListByProjectID(ctx context.Context, projectID string) ([]domain.ProjectContextSection, error) {
	const q = `
		SELECT id, project_id, heading, content, agent_role, task_id, version, created_at, updated_at
		FROM project_context_sections
		WHERE project_id = $1
		ORDER BY created_at ASC`
	rows, err := r.pool.Query(ctx, q, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.ProjectContextSection
	for rows.Next() {
		s, err := scanSection(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

func (r *projectContextRepo) DeleteByProjectID(ctx context.Context, projectID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM project_context_sections WHERE project_id = $1`, projectID)
	return err
}

type sectionScanner interface{ Scan(dest ...any) error }

func scanSection(row sectionScanner) (domain.ProjectContextSection, error) {
	var s domain.ProjectContextSection
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&s.ID, &s.ProjectID, &s.Heading, &s.Content,
		&s.AgentRole, &s.TaskID, &s.Version, &createdAt, &updatedAt,
	)
	s.CreatedAt, s.UpdatedAt = createdAt, updatedAt
	return s, err
}
