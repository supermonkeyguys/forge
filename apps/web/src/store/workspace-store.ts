/**
 * workspace-store — re-exports from @forge/core.
 *
 * The store has been moved to packages/core/task/workspace-store.ts
 * so it can be shared across packages without cross-package imports.
 * This file remains as a compatibility shim for existing web-layer imports.
 */

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
  selectErrorMsg,
  selectTaskPrompt,
  selectAgentJobId,
} from '@forge/core'

export type {
  WorkspacePhase,
  AgentCardState,
  DraftSpec,
  DraftFeature,
} from '@forge/core'
