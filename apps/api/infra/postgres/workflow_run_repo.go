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

type workflowRunRepo struct {
	pool *pgxpool.Pool
}

func NewWorkflowRunRepo(pool *pgxpool.Pool) domain.WorkflowRunRepository {
	return &workflowRunRepo{pool: pool}
}

func (r *workflowRunRepo) Create(ctx context.Context, run domain.WorkflowRun) (domain.WorkflowRun, error) {
	const q = `
		INSERT INTO workflow_runs (workflow_id, user_id, status, error, agent_job_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, workflow_id, user_id, status, error, agent_job_id, created_at, finished_at`
	row := r.pool.QueryRow(ctx, q,
		run.WorkflowID, run.UserID,
		string(run.Status), run.Error, run.AgentJobID)
	return scanWorkflowRun(row)
}

func (r *workflowRunRepo) GetByID(ctx context.Context, id string) (domain.WorkflowRun, error) {
	const q = `
		SELECT id, workflow_id, user_id, status, error, agent_job_id, created_at, finished_at
		FROM workflow_runs WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	run, err := scanWorkflowRun(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkflowRun{}, fmt.Errorf("workflowRunRepo.GetByID: %w", domain.ErrNotFound)
	}
	return run, err
}

func (r *workflowRunRepo) UpdateStatus(ctx context.Context, id string, status domain.WorkflowRunStatus, errMsg string, finishedAt *time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE workflow_runs SET status=$1, error=$2, finished_at=$3 WHERE id=$4`,
		string(status), errMsg, finishedAt, id)
	return err
}

func (r *workflowRunRepo) UpdateAgentJobID(ctx context.Context, id string, agentJobID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE workflow_runs SET agent_job_id=$1 WHERE id=$2`,
		agentJobID, id)
	return err
}

func scanWorkflowRun(row interface{ Scan(dest ...any) error }) (domain.WorkflowRun, error) {
	var run domain.WorkflowRun
	var status string
	err := row.Scan(&run.ID, &run.WorkflowID, &run.UserID,
		&status, &run.Error, &run.AgentJobID,
		&run.CreatedAt, &run.FinishedAt)
	if err != nil {
		return domain.WorkflowRun{}, err
	}
	run.Status = domain.WorkflowRunStatus(status)
	return run, nil
}
