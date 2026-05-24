/**
 * Shared types for all agents.
 * Each agent receives a RunContext and returns an AgentResult.
 */

import type { OrchestratorContext, ValidationError } from "../orchestrator/state-machine.js";

export interface AgentRunContext {
  orchestrator: OrchestratorContext;
  sandboxId: string;
  // Emit progress events back to the platform (streamed to frontend via SSE)
  emit: (event: ProgressEvent) => void;
}

export type ProgressEvent =
  | { type: "agent_start"; agent: AgentRole; message: string }
  | { type: "agent_thinking"; agent: AgentRole; content: string }
  | { type: "agent_tool_use"; agent: AgentRole; tool: string; input: unknown }
  | { type: "agent_file_write"; agent: AgentRole; file: string }
  | { type: "agent_done"; agent: AgentRole; summary: string }
  | { type: "agent_error"; agent: AgentRole; error: string };

export type AgentRole =
  | "pm"
  | "architect"
  | "schema"
  | "logic"
  | "api"
  | "ui"
  | "page"
  | "test"
  | "review"
  | "orchestrator";

export interface AgentResult {
  success: boolean;
  summary: string;
  errors?: ValidationError[];
}

// Each agent implements this interface
export interface Agent {
  role: AgentRole;
  run(ctx: AgentRunContext): Promise<AgentResult>;
}
