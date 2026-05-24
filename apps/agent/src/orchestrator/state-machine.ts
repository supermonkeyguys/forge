/**
 * Orchestrator state machine.
 * Coordinates the agent team and drives the generation loop.
 */

export type OrchestratorState =
  | "idle"
  | "analyzing"    // PM Agent working
  | "planning"     // Architect Agent working
  | "building"     // Builder Agents working (parallel)
  | "validating"   // Test + Review Agents working
  | "fixing"       // Routing failures back to builder agents
  | "waiting"      // Retry limit reached — needs user input
  | "done";        // All validations passed

export interface OrchestratorContext {
  projectId: string;
  taskId: string;
  userInput: string;
  retryCount: number;
  maxRetries: number;
  state: OrchestratorState;
  // Contract file paths (relative to sandbox workdir)
  specPath: string;
  taskPlanPath: string;
  contextPath: string;
  validationReportPath: string;
  reviewReportPath: string;
}

export type OrchestratorEvent =
  | { type: "START" }
  | { type: "SPEC_DONE" }
  | { type: "PLAN_DONE" }
  | { type: "BUILD_DONE" }
  | { type: "VALIDATION_PASSED" }
  | { type: "VALIDATION_FAILED"; errors: ValidationError[] }
  | { type: "RETRY_LIMIT_REACHED" }
  | { type: "USER_INPUT"; input: string }
  | { type: "ABORT" };

export interface ValidationError {
  type: "unit_test" | "e2e" | "review_violation";
  agent: "schema" | "logic" | "api" | "ui" | "page" | "unknown";
  file?: string;
  message: string;
  suggestion?: string;
}

export function transition(
  ctx: OrchestratorContext,
  event: OrchestratorEvent
): OrchestratorState {
  switch (ctx.state) {
    case "idle":
      if (event.type === "START") return "analyzing";
      break;
    case "analyzing":
      if (event.type === "SPEC_DONE") return "planning";
      break;
    case "planning":
      if (event.type === "PLAN_DONE") return "building";
      break;
    case "building":
      if (event.type === "BUILD_DONE") return "validating";
      break;
    case "validating":
      if (event.type === "VALIDATION_PASSED") return "done";
      if (event.type === "VALIDATION_FAILED") {
        if (ctx.retryCount >= ctx.maxRetries) return "waiting";
        return "fixing";
      }
      break;
    case "fixing":
      if (event.type === "BUILD_DONE") return "validating";
      break;
    case "waiting":
      if (event.type === "USER_INPUT") return "analyzing";
      break;
  }
  return ctx.state;
}
