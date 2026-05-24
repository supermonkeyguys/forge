// Auth
export { useAuthStore, selectToken, selectUser, selectIsAuthed } from './auth/auth-store.js'
export { useLogin } from './auth/use-login.js'

// Project
export { useProjects, useProject, useCreateProject } from './project/use-projects.js'

// Task / Agent events
export { useAgentEvents } from './task/use-agent-events.js'

// API utilities
export { api, ApiError } from './api/client.js'
export { parseWithFallback } from './api/schema.js'

// Types
export type {
  Project,
  ProjectStatus,
  AgentEvent,
  AgentEventType,
  AgentRole,
  Spec,
  SpecFeature,
  User,
  AuthToken,
} from './types/index.js'
