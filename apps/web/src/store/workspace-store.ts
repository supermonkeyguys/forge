/**
 * Workspace store — single source of truth for the WorkspacePage.
 *
 * Three panels (left, center, right) all read from this store.
 * Agent events from SSE stream in via addEvent().
 *
 * Zustand rules (from AGENTS.md):
 *   - Selectors return primitives or stable references
 *   - Export named selector functions, not inline lambdas
 */

import { create } from 'zustand'
import type { AgentEvent, ProjectStatus, Spec } from '@forge/core'

// DraftSpec mirrors the PM Agent output shape — defined here to avoid
// cross-package imports from the agent service into the frontend.
export interface DraftFeature {
  id: string
  name: string
  confidence: 'high' | 'medium' | 'low'
  acceptance_criteria: string[]
  out_of_scope: string[]
  selected: boolean
}

export interface DraftSpec {
  title: string
  description: string
  business_domain: string
  constraints: {
    auth: boolean
    database: boolean
    file_upload: boolean
    email: boolean
    payments: boolean
  }
  clarifying_questions: string[]
  features: DraftFeature[]
}

// ── Types ─────────────────────────────────────────────────────────

export type WorkspacePhase =
  | 'input'       // user is typing their requirement
  | 'pm-review'   // PM draft is ready, user is reviewing features
  | 'running'     // Orchestrator is running (building → validating)
  | 'waiting'     // Orchestrator hit retry limit, needs user input
  | 'done'        // generation complete, preview available
  | 'error'       // unrecoverable error

export interface AgentCardState {
  role: string
  status: 'idle' | 'running' | 'done' | 'error'
  currentAction: string
  filesWritten: string[]
  startedAt: number | null
  finishedAt: number | null
}

// ── Store state ───────────────────────────────────────────────────

interface WorkspaceState {
  // ── Input ────────────────────────────────────────────────────
  userInput: string
  setUserInput: (v: string) => void

  // ── Phase ────────────────────────────────────────────────────
  phase: WorkspacePhase
  setPhase: (p: WorkspacePhase) => void

  // ── Project ──────────────────────────────────────────────────
  projectId: string | null
  orchestratorState: ProjectStatus | null
  previewUrl: string | null

  // ── PM Review ────────────────────────────────────────────────
  draftSpec: DraftSpec | null
  setDraftSpec: (d: DraftSpec | null) => void
  confirmedSpec: Spec | null
  setConfirmedSpec: (s: Spec | null) => void

  // ── Agent events ──────────────────────────────────────────────
  events: AgentEvent[]
  agentCards: Record<string, AgentCardState>
  addEvent: (e: AgentEvent) => void

  // ── Waiting state ────────────────────────────────────────────
  waitingReason: string | null

  // ── Actions ──────────────────────────────────────────────────
  startGeneration: (projectId: string) => void
  setPreviewUrl: (url: string) => void
  setWaiting: (reason: string) => void
  reset: () => void
}

// ── Initial agent cards ───────────────────────────────────────────

const AGENT_ROLES = ['pm', 'architect', 'schema', 'logic', 'api', 'ui', 'page', 'test']

function initialCards(): Record<string, AgentCardState> {
  return Object.fromEntries(
    AGENT_ROLES.map((role) => [
      role,
      { role, status: 'idle', currentAction: '', filesWritten: [], startedAt: null, finishedAt: null },
    ]),
  )
}

const initialState = {
  userInput: '',
  phase: 'input' as WorkspacePhase,
  projectId: null,
  orchestratorState: null,
  previewUrl: null,
  draftSpec: null,
  confirmedSpec: null,
  events: [],
  agentCards: initialCards(),
  waitingReason: null,
}

// ── Store ─────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...initialState,

  setUserInput: (v) => set({ userInput: v }),
  setPhase: (p) => set({ phase: p }),
  setDraftSpec: (d) => set({ draftSpec: d }),
  setConfirmedSpec: (s) => set({ confirmedSpec: s }),

  startGeneration: (projectId) =>
    set({ projectId, phase: 'running', agentCards: initialCards(), events: [] }),

  setPreviewUrl: (url) => set({ previewUrl: url, phase: 'done' }),

  setWaiting: (reason) => set({ phase: 'waiting', waitingReason: reason }),

  reset: () => set({ ...initialState, agentCards: initialCards() }),

  addEvent: (event) => {
    set((s) => {
      const events = [...s.events, event]
      const cards = { ...s.agentCards }
      const role = event.agent ?? 'orchestrator'
      const card = cards[role] ?? { role, status: 'idle', currentAction: '', filesWritten: [], startedAt: null, finishedAt: null }

      switch (event.type) {
        case 'agent_start':
          cards[role] = { ...card, status: 'running', currentAction: event.message ?? '', startedAt: Date.now() }
          break
        case 'agent_thinking':
          cards[role] = { ...card, status: 'running', currentAction: event.content ?? '' }
          break
        case 'agent_file_write':
          cards[role] = {
            ...card,
            currentAction: `writing ${event.file}`,
            filesWritten: [...card.filesWritten, event.file ?? ''].filter(Boolean),
          }
          break
        case 'agent_done':
          cards[role] = { ...card, status: 'done', currentAction: event.summary ?? 'Done', finishedAt: Date.now() }
          break
        case 'agent_error':
          cards[role] = { ...card, status: 'error', currentAction: event.error ?? 'Error' }
          break
        case 'state_change':
          return { events, agentCards: cards, orchestratorState: event.state as ProjectStatus ?? s.orchestratorState }
      }

      return { events, agentCards: cards }
    })
  },
}))

// ── Stable selectors ──────────────────────────────────────────────
// Always use these instead of inline lambdas to prevent re-render loops.

export const selectPhase = (s: WorkspaceState) => s.phase
export const selectUserInput = (s: WorkspaceState) => s.userInput
export const selectProjectId = (s: WorkspaceState) => s.projectId
export const selectDraftSpec = (s: WorkspaceState) => s.draftSpec
export const selectConfirmedSpec = (s: WorkspaceState) => s.confirmedSpec
export const selectPreviewUrl = (s: WorkspaceState) => s.previewUrl
export const selectAgentCards = (s: WorkspaceState) => s.agentCards
export const selectEvents = (s: WorkspaceState) => s.events
export const selectOrchestratorState = (s: WorkspaceState) => s.orchestratorState
export const selectWaitingReason = (s: WorkspaceState) => s.waitingReason
