/**
 * Orchestrator state machine — pure transition function + context types.
 * No side effects here, fully testable without any mocks.
 */

export type OrchestratorState =
  | 'idle'
  | 'analyzing'   // PM Agent: requirement → spec.json
  | 'planning'    // Architect Agent: spec.json → task_plan.json
  | 'building'    // Builder Agents: parallel code generation
  | 'validating'  // Test Agent: unit tests + E2E checks
  | 'fixing'      // Targeted re-run of failed Builder Agents
  | 'waiting'     // Retry limit hit — blocked on user input
  | 'done'        // All validations passed, preview URL available
  | 'aborted'     // User or system cancelled the run

export type OrchestratorEvent =
  | { type: 'START' }
  | { type: 'SPEC_READY' }            // PM Agent produced spec.json
  | { type: 'PLAN_READY' }            // Architect produced task_plan.json
  | { type: 'BUILD_DONE' }            // All builder tasks for this round complete
  | { type: 'VALIDATION_PASSED' }     // Test Agent: all checks green
  | { type: 'VALIDATION_FAILED' }     // Test Agent: at least one check failed
  | { type: 'USER_INPUT'; input: string } // User supplemented context during WAITING
  | { type: 'ABORT' }

export interface OrchestratorContext {
  projectId: string
  userInput: string           // original user requirement
  retryCount: number          // how many fixing rounds have been attempted
  maxRetries: number          // Orchestrator pauses at this limit
  state: OrchestratorState
  previewUrl: string | null   // set when done
  pendingUserInput: string | null // set when WAITING, cleared on USER_INPUT
  reviewUrl: string | null    // set after PM Agent generates review HTML
}

export function createContext(
  projectId: string,
  userInput: string,
  maxRetries = 3,
): OrchestratorContext {
  return {
    projectId,
    userInput,
    retryCount: 0,
    maxRetries,
    state: 'idle',
    previewUrl: null,
    pendingUserInput: null,
    reviewUrl: null,
  }
}

/**
 * Pure transition function.
 * Returns the new state given the current context + event.
 * Never mutates — caller applies the returned state.
 */
export function transition(
  ctx: OrchestratorContext,
  event: OrchestratorEvent,
): OrchestratorState {
  if (event.type === 'ABORT') return 'aborted'

  switch (ctx.state) {
    case 'idle':
      if (event.type === 'START') return 'analyzing'
      break

    case 'analyzing':
      if (event.type === 'SPEC_READY') return 'planning'
      break

    case 'planning':
      if (event.type === 'PLAN_READY') return 'building'
      break

    case 'building':
      if (event.type === 'BUILD_DONE') return 'validating'
      break

    case 'validating':
      if (event.type === 'VALIDATION_PASSED') return 'done'
      if (event.type === 'VALIDATION_FAILED') {
        // Still have retries left → go fix
        if (ctx.retryCount < ctx.maxRetries) return 'fixing'
        // Retries exhausted → wait for human
        return 'waiting'
      }
      break

    case 'fixing':
      if (event.type === 'BUILD_DONE') return 'validating'
      break

    case 'waiting':
      if (event.type === 'USER_INPUT') return 'analyzing'
      break

    case 'done':
    case 'aborted':
      break
  }

  return ctx.state // no-op for unhandled combinations
}

export function isTerminal(state: OrchestratorState): boolean {
  return state === 'done' || state === 'aborted'
}
