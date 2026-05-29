-- name: CreateTask :one
INSERT INTO tasks (id, project_id, user_id, prompt, status, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, now(), now())
RETURNING *;

-- name: GetTask :one
SELECT * FROM tasks
WHERE id = $1
LIMIT 1;

-- name: ListTasksByProject :many
SELECT * FROM tasks
WHERE project_id = $1
ORDER BY created_at DESC;

-- name: UpdateTaskStatus :one
UPDATE tasks
SET status = $2, preview_url = $3, error_msg = $4, updated_at = now()
WHERE id = $1
RETURNING *;
