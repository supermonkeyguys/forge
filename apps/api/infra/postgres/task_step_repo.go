package postgres

import (
	"context"
	"encoding/json"

	"github.com/forge-ai/forge/api/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type taskStepRepo struct{ pool *pgxpool.Pool }

func NewTaskStepRepo(pool *pgxpool.Pool) domain.TaskStepRepository {
	return &taskStepRepo{pool: pool}
}

func (r *taskStepRepo) Create(ctx context.Context, step domain.TaskStep) (domain.TaskStep, error) {
	toolCallsJSON, err := json.Marshal(step.ToolCalls)
	if err != nil {
		return domain.TaskStep{}, err
	}

	var result domain.TaskStep
	var toolCallsRaw []byte
	err = r.pool.QueryRow(ctx,
		`INSERT INTO task_steps (task_id, seq_no, agent, summary, tool_calls, duration_ms, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)
		 RETURNING id, task_id, seq_no, agent, summary, tool_calls, duration_ms, status, created_at`,
		step.TaskID, step.SeqNo, step.Agent, step.Summary,
		toolCallsJSON, step.DurationMs, step.Status,
	).Scan(
		&result.ID, &result.TaskID, &result.SeqNo, &result.Agent,
		&result.Summary, &toolCallsRaw, &result.DurationMs,
		&result.Status, &result.CreatedAt,
	)
	if err != nil {
		return domain.TaskStep{}, err
	}
	if len(toolCallsRaw) > 0 {
		_ = json.Unmarshal(toolCallsRaw, &result.ToolCalls)
	}
	if result.ToolCalls == nil {
		result.ToolCalls = []domain.ToolCallEntry{}
	}
	return result, nil
}

func (r *taskStepRepo) ListByTaskID(ctx context.Context, taskID string) ([]domain.TaskStep, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, task_id, seq_no, agent, summary, tool_calls, duration_ms, status, created_at
		 FROM task_steps WHERE task_id = $1 ORDER BY seq_no ASC`,
		taskID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var steps []domain.TaskStep
	for rows.Next() {
		var s domain.TaskStep
		var toolCallsRaw []byte
		if err := rows.Scan(
			&s.ID, &s.TaskID, &s.SeqNo, &s.Agent,
			&s.Summary, &toolCallsRaw, &s.DurationMs,
			&s.Status, &s.CreatedAt,
		); err != nil {
			return nil, err
		}
		if len(toolCallsRaw) > 0 {
			_ = json.Unmarshal(toolCallsRaw, &s.ToolCalls)
		}
		if s.ToolCalls == nil {
			s.ToolCalls = []domain.ToolCallEntry{}
		}
		steps = append(steps, s)
	}
	if steps == nil {
		steps = []domain.TaskStep{}
	}
	return steps, rows.Err()
}
