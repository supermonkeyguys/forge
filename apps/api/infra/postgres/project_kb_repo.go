package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/forge-ai/forge/api/domain"
)

type projectKBRepo struct{ pool *pgxpool.Pool }

func NewProjectKBRepo(pool *pgxpool.Pool) domain.ProjectKBRepository {
	return &projectKBRepo{pool: pool}
}

const pkbSelect = `id, project_id, user_id, is_global, type, title, content, tags,
	input_type, source_ref, source_agent, source_task, status, confidence, created_at, updated_at`

func (r *projectKBRepo) Create(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
	q := fmt.Sprintf(`INSERT INTO project_kb
		(project_id, user_id, is_global, type, title, content, tags,
		 input_type, source_ref, source_agent, source_task, status, confidence)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING %s`, pkbSelect)
	row := r.pool.QueryRow(ctx, q,
		e.ProjectID, e.UserID, e.IsGlobal, e.Type, e.Title, e.Content, e.Tags,
		e.InputType, e.SourceRef, e.SourceAgent, e.SourceTask, e.Status, e.Confidence)
	return scanPKB(row)
}

func (r *projectKBRepo) GetByID(ctx context.Context, id string) (domain.ProjectKBEntry, error) {
	row := r.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM project_kb WHERE id=$1`, pkbSelect), id)
	e, err := scanPKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ProjectKBEntry{}, fmt.Errorf("projectKBRepo.GetByID: %w", domain.ErrNotFound)
	}
	return e, err
}

func (r *projectKBRepo) List(ctx context.Context, projectID, userID, entryType, status string) ([]domain.ProjectKBEntry, error) {
	var args []any
	var where []string
	args = append(args, userID)
	where = append(where, "user_id = $1")
	if projectID != "" {
		args = append(args, projectID)
		where = append(where, fmt.Sprintf("(project_id = $%d OR is_global = true)", len(args)))
	} else {
		where = append(where, "is_global = true")
	}
	if entryType != "" {
		args = append(args, entryType)
		where = append(where, fmt.Sprintf("type = $%d", len(args)))
	}
	if status != "" {
		args = append(args, status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}
	q := fmt.Sprintf(`SELECT %s FROM project_kb WHERE %s ORDER BY created_at DESC`,
		pkbSelect, strings.Join(where, " AND "))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectPKBRows(rows)
}

func (r *projectKBRepo) Search(ctx context.Context, projectID, userID, query, entryType string, limit int) ([]domain.ProjectKBEntry, error) {
	if limit <= 0 || limit > 20 {
		limit = 5
	}
	var args []any
	var where []string
	args = append(args, userID)
	where = append(where, "user_id = $1")
	if projectID != "" {
		args = append(args, projectID)
		where = append(where, fmt.Sprintf("(project_id = $%d OR is_global = true)", len(args)))
	}
	if entryType != "" {
		args = append(args, entryType)
		where = append(where, fmt.Sprintf("type = $%d", len(args)))
	}
	where = append(where, "status = 'verified'")
	if query != "" {
		args = append(args, "%"+query+"%")
		where = append(where, fmt.Sprintf("(title ILIKE $%d OR content ILIKE $%d)", len(args), len(args)))
	}
	args = append(args, limit)
	q := fmt.Sprintf(`SELECT %s FROM project_kb WHERE %s ORDER BY confidence DESC LIMIT $%d`,
		pkbSelect, strings.Join(where, " AND "), len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectPKBRows(rows)
}

func (r *projectKBRepo) Update(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
	q := fmt.Sprintf(`UPDATE project_kb SET title=$1, content=$2, tags=$3, updated_at=now()
		WHERE id=$4 AND user_id=$5 RETURNING %s`, pkbSelect)
	row := r.pool.QueryRow(ctx, q, e.Title, e.Content, e.Tags, e.ID, e.UserID)
	result, err := scanPKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ProjectKBEntry{}, fmt.Errorf("projectKBRepo.Update: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *projectKBRepo) SetStatus(ctx context.Context, id, userID, status string) (domain.ProjectKBEntry, error) {
	q := fmt.Sprintf(`UPDATE project_kb SET status=$1, updated_at=now()
		WHERE id=$2 AND user_id=$3 RETURNING %s`, pkbSelect)
	row := r.pool.QueryRow(ctx, q, status, id, userID)
	result, err := scanPKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ProjectKBEntry{}, fmt.Errorf("projectKBRepo.SetStatus: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *projectKBRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM project_kb WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("projectKBRepo.Delete: %w", domain.ErrNotFound)
	}
	return nil
}

func (r *projectKBRepo) UpdateContent(ctx context.Context, id, content, status string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE project_kb SET content=$1, status=$2, updated_at=now() WHERE id=$3`,
		content, status, id)
	return err
}

type pkbRowsIface interface {
	Next() bool
	Scan(...any) error
	Err() error
}

func collectPKBRows(rows pkbRowsIface) ([]domain.ProjectKBEntry, error) {
	var result []domain.ProjectKBEntry
	for rows.Next() {
		e, err := scanPKB(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}

type pkbScanner interface{ Scan(dest ...any) error }

func scanPKB(row pkbScanner) (domain.ProjectKBEntry, error) {
	var e domain.ProjectKBEntry
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&e.ID, &e.ProjectID, &e.UserID, &e.IsGlobal, &e.Type, &e.Title, &e.Content, &e.Tags,
		&e.InputType, &e.SourceRef, &e.SourceAgent, &e.SourceTask, &e.Status, &e.Confidence,
		&createdAt, &updatedAt,
	)
	e.CreatedAt, e.UpdatedAt = createdAt, updatedAt
	return e, err
}
