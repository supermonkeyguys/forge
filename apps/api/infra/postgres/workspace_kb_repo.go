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

type workspaceKBRepo struct{ pool *pgxpool.Pool }

func NewWorkspaceKBRepo(pool *pgxpool.Pool) domain.WorkspaceKBRepository {
	return &workspaceKBRepo{pool: pool}
}

const kbSelect = `id, user_id, title, content, tags, source_agent, source_task, verified, confidence, stale_at, created_at, updated_at`

func (r *workspaceKBRepo) Create(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
	q := fmt.Sprintf(`
		INSERT INTO workspace_kb (user_id, title, content, tags, source_agent, source_task, verified, confidence)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING %s`, kbSelect)
	row := r.pool.QueryRow(ctx, q, e.UserID, e.Title, e.Content, e.Tags, e.SourceAgent, e.SourceTask, e.Verified, e.Confidence)
	return scanKB(row)
}

func (r *workspaceKBRepo) GetByID(ctx context.Context, id string) (domain.WorkspaceKBEntry, error) {
	row := r.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM workspace_kb WHERE id=$1`, kbSelect), id)
	e, err := scanKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkspaceKBEntry{}, fmt.Errorf("workspaceKBRepo.GetByID: %w", domain.ErrNotFound)
	}
	return e, err
}

func (r *workspaceKBRepo) Search(ctx context.Context, userID, query string, limit int) ([]domain.WorkspaceKBEntry, error) {
	if limit <= 0 || limit > 20 {
		limit = 5
	}
	q := fmt.Sprintf(`
		SELECT %s FROM workspace_kb
		WHERE user_id=$1
		  AND (title ILIKE $2 OR content ILIKE $2)
		  AND verified=true
		  AND (stale_at IS NULL OR stale_at > now())
		ORDER BY confidence DESC
		LIMIT $3`, kbSelect)
	rows, err := r.pool.Query(ctx, q, userID, "%"+query+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectKBRows(rows)
}

func (r *workspaceKBRepo) List(ctx context.Context, userID string) ([]domain.WorkspaceKBEntry, error) {
	q := fmt.Sprintf(`SELECT %s FROM workspace_kb WHERE user_id=$1 ORDER BY created_at DESC`, kbSelect)
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectKBRows(rows)
}

func (r *workspaceKBRepo) Update(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
	q := fmt.Sprintf(`
		UPDATE workspace_kb
		SET title=$1, content=$2, tags=$3, confidence=$4, updated_at=now()
		WHERE id=$5 AND user_id=$6
		RETURNING %s`, kbSelect)
	row := r.pool.QueryRow(ctx, q, e.Title, e.Content, e.Tags, e.Confidence, e.ID, e.UserID)
	result, err := scanKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkspaceKBEntry{}, fmt.Errorf("workspaceKBRepo.Update: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *workspaceKBRepo) Verify(ctx context.Context, id, userID string) (domain.WorkspaceKBEntry, error) {
	q := fmt.Sprintf(`
		UPDATE workspace_kb SET verified=true, updated_at=now()
		WHERE id=$1 AND user_id=$2
		RETURNING %s`, kbSelect)
	row := r.pool.QueryRow(ctx, q, id, userID)
	result, err := scanKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkspaceKBEntry{}, fmt.Errorf("workspaceKBRepo.Verify: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *workspaceKBRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM workspace_kb WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("workspaceKBRepo.Delete: %w", domain.ErrNotFound)
	}
	return nil
}

type kbRowScanner interface {
	Next() bool
	Scan(...any) error
	Err() error
}

func collectKBRows(rows kbRowScanner) ([]domain.WorkspaceKBEntry, error) {
	var result []domain.WorkspaceKBEntry
	for rows.Next() {
		e, err := scanKB(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}

type kbScanner interface{ Scan(dest ...any) error }

func scanKB(row kbScanner) (domain.WorkspaceKBEntry, error) {
	var e domain.WorkspaceKBEntry
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&e.ID, &e.UserID, &e.Title, &e.Content, &e.Tags,
		&e.SourceAgent, &e.SourceTask, &e.Verified, &e.Confidence,
		&e.StaleAt, &createdAt, &updatedAt,
	)
	e.CreatedAt, e.UpdatedAt = createdAt, updatedAt
	return e, err
}
