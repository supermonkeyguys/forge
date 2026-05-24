/**
 * Shared TypeScript types — aligned with contracts/*.schema.json
 * These are the runtime types used across all packages.
 */

// ── Project ──────────────────────────────────────────────────────

export type ProjectStatus =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'building'
  | 'validating'
  | 'fixing'
  | 'waiting'
  | 'done'
  | 'failed'

export interface Project {
  id: string
  name: string
  userId: string
  status: ProjectStatus
  previewUrl: string | null
  createdAt: string
  updatedAt: string
}

// ── Task ─────────────────────────────────────────────────────────

export type AgentRole =
  | 'pm'
  | 'architect'
  | 'schema'
  | 'logic'
  | 'api'
  | 'ui'
  | 'page'
  | 'test'
  | 'review'
  | 'orchestrator'

export type AgentEventType =
  | 'agent_start'
  | 'agent_thinking'
  | 'agent_tool_use'
  | 'agent_file_write'
  | 'agent_done'
  | 'agent_error'
  | 'state_change'
  | 'waiting'

export interface AgentEvent {
  type: AgentEventType
  agent?: AgentRole
  message?: string
  content?: string
  tool?: string
  file?: string
  action?: 'create' | 'modify'
  summary?: string
  error?: string
  state?: ProjectStatus
  reason?: string
}

// ── Spec (PM Agent output) ────────────────────────────────────────

export interface SpecFeature {
  id: string
  name: string
  confidence: 'high' | 'medium' | 'low'
  acceptance_criteria: string[]
  out_of_scope?: string[]
}

export interface Spec {
  id: string
  title: string
  description: string
  features: SpecFeature[]
  constraints: {
    auth: boolean
    database: boolean
    file_upload: boolean
    email: boolean
    payments: boolean
  }
}

// ── Auth ─────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
}

export interface AuthToken {
  token: string
  user: User
}

// ── Task ─────────────────────────────────────────────────────────

export type TaskStatus =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'building'
  | 'validating'
  | 'fixing'
  | 'waiting'
  | 'done'
  | 'failed'

export interface Task {
  id: string
  projectId: string
  userId: string
  prompt: string
  status: TaskStatus
  previewUrl: string | null
  errorMsg: string | null
  createdAt: string
  updatedAt: string
}
