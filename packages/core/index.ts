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
