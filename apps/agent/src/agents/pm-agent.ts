/**
 * PM Agent — Tier 0
 *
 * Responsibilities:
 * 1. Identify business domain from user input
 * 2. Amplify implicit requirements (demand amplification)
 * 3. Present structured suggestions for user review
 * 4. Produce spec.json after user confirms
 *
 * Output: spec.json written to sandbox contracts/
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { Agent, AgentRunContext, AgentResult } from "./types.js";

const FeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  acceptance_criteria: z.array(z.string()),
  out_of_scope: z.array(z.string()).optional(),
});

const SpecSchema = z.object({
  title: z.string(),
  description: z.string(),
  business_domain: z.string(),
  features: z.array(FeatureSchema),
  constraints: z.object({
    auth: z.boolean(),
    database: z.boolean(),
    file_upload: z.boolean(),
    email: z.boolean(),
    payments: z.boolean(),
  }),
  clarifying_questions: z.array(z.string()).optional(),
});

export type DraftSpec = z.infer<typeof SpecSchema>;

export class PMAgent implements Agent {
  role = "pm" as const;

  async run(ctx: AgentRunContext): Promise<AgentResult> {
    ctx.emit({ type: "agent_start", agent: "pm", message: "Analyzing your requirements..." });

    try {
      const draft = await this.amplifyRequirements(ctx.orchestrator.userInput, ctx);

      // Write draft spec to sandbox for user review
      // The orchestrator will pause here and send draft to frontend
      // User review happens in the platform UI, not in this agent
      // After user confirms, orchestrator calls finalize()

      ctx.emit({ type: "agent_done", agent: "pm", summary: `Identified ${draft.features.length} features across ${draft.business_domain} domain` });

      return { success: true, summary: `Draft spec ready: ${draft.features.length} features` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.emit({ type: "agent_error", agent: "pm", error: msg });
      return { success: false, summary: "PM Agent failed", errors: [{ type: "e2e", agent: "unknown", message: msg }] };
    }
  }

  private async amplifyRequirements(userInput: string, ctx: AgentRunContext): Promise<DraftSpec> {
    ctx.emit({ type: "agent_thinking", agent: "pm", content: "Inferring implicit requirements from business domain..." });

    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: SpecSchema,
      prompt: `You are a product manager analyzing a user's app request.

User input: "${userInput}"

Your job:
1. Identify the business domain (e.g., expense-management, e-commerce, appointment-booking)
2. Generate a comprehensive spec including IMPLICIT requirements the user didn't mention but would expect
3. Mark high-confidence features (every similar app has them) vs medium/low (common but optional)
4. Keep acceptance_criteria concrete and testable
5. Note anything genuinely ambiguous in clarifying_questions

Be opinionated about what's standard for this domain. Don't ask about things you can reasonably infer.`,
    });

    return object;
  }
}
