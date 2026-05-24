-- name: CreateProject :one
INSERT INTO projects (id, name, user_id, status, preview_url, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, now(), now())
RETURNING *;

-- name: GetProject :one
SELECT * FROM projects
WHERE id = $1
LIMIT 1;

-- name: ListProjectsByUser :many
SELECT * FROM projects
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: UpdateProjectStatus :one
UPDATE projects
SET status = $2, preview_url = $3, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteProject :exec
DELETE FROM projects
WHERE id = $1;
