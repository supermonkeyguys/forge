// Auth
export { useAuthStore, selectToken, selectUser, selectIsAuthed, selectSetToken } from './auth/auth-store.ts'
export { useLogin } from './auth/use-login.ts'
export { useDevLogin } from './auth/use-dev-login.ts'
export { useMe } from './auth/use-me.ts'

// Project
export { useProjects, useProject, useCreateProject, useDeleteProject } from './project/use-projects.ts'

// Task / Agent events
export { useAgentEvents } from './task/use-agent-events.ts'
export { useTask, useCreateTask } from './task/use-tasks.ts'
export { useTaskSteps, type TaskStep } from './task/use-task-steps.ts'

// Workspace store (moved from apps/web to packages/core)
export {
  useWorkspaceStore,
  selectPhase,
  selectUserInput,
  selectProjectId,
  selectDraftSpec,
  selectConfirmedSpec,
  selectPreviewUrl,
  selectAgentCards,
  selectEvents,
  selectOrchestratorState,
  selectWaitingReason,
  selectAgentJobId,
} from './task/workspace-store.ts'
export type {
  WorkspacePhase,
  AgentCardState,
  DraftSpec,
  DraftFeature,
} from './task/workspace-store.ts'

// Agent management
export { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent } from './agent/index.ts'
export type { UserAgent, AgentInput } from './agent/index.ts'

// Knowledge Base (project-scoped)
export {
  useKBEntries,
  useCreateKBEntry,
  useSetKBStatus,
  useDeleteKBEntry,
  useIngestKB,
} from './kb/index.ts'
export type { KBEntry, KBCreateInput } from './kb/index.ts'

// Settings
export { useGetSettings, useSaveSettings, useResetApiKey } from './settings/use-settings.ts'
export type { SettingsResponse } from './settings/settings-api.ts'

// API utilities
export { api, ApiError } from './api/client.ts'
export { parseWithFallback } from './api/schema.ts'

// Types
export type {
  Project,
  ProjectStatus,
  Task,
  TaskStatus,
  AgentEvent,
  AgentEventType,
  AgentRole,
  Spec,
  SpecFeature,
  User,
  AuthToken,
} from './types/index.ts'
