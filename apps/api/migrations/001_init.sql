-- 001_init.sql
-- Initial schema for Forge platform

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email       TEXT        NOT NULL UNIQUE,
    name        TEXT        NOT NULL,
    password    TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TYPE project_status AS ENUM (
    'idle',
    'analyzing',
    'planning',
    'building',
    'validating',
    'fixing',
    'waiting',
    'done',
    'failed'
);

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT           PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        TEXT           NOT NULL,
    user_id     TEXT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      project_status NOT NULL DEFAULT 'idle',
    preview_url TEXT           NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

CREATE TYPE task_status AS ENUM (
    'idle',
    'analyzing',
    'planning',
    'building',
    'validating',
    'fixing',
    'waiting',
    'done',
    'failed'
);

CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id  TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt      TEXT        NOT NULL,
    status      task_status NOT NULL DEFAULT 'idle',
    preview_url TEXT        NOT NULL DEFAULT '',
    error_msg   TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id    ON tasks(user_id);
