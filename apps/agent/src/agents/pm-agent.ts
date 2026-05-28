/**
 * PM Agent — Tier 0
 *
 * Responsibilities:
 *   1. Identify the business domain from user input
 *   2. Amplify implicit requirements (demand amplification)
 *   3. Output a structured DraftSpec for user review
 *   4. Finalize spec.json after user confirms
 *
 * Two-phase design:
 *   draft()    → returns DraftSpec for frontend review UI
 *   finalize() → takes user-reviewed DraftSpec → writes spec.json to sandbox
 */

import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { SpecSchema, type Spec, type Feature } from '../contracts/spec.js'
import type { Agent, AgentRunContext, AgentResult } from './types.js'

// ── Draft Spec (before user review) ─────────────────────────────

export interface ClarifyingQuestion {
  id: string
  question: string
  type: 'single' | 'multiple' | 'text'
  options?: string[]   // only for single/multiple
  required: boolean
}

export interface DraftSpec {
  title: string
  description: string
  business_domain: string
  features: DraftFeature[]
  constraints: Spec['constraints']
  clarifying_questions: ClarifyingQuestion[]
}

export interface DraftFeature {
  id: string
  name: string
  confidence: 'high' | 'medium' | 'low'
  acceptance_criteria: string[]
  out_of_scope: string[]
  // UI state — not persisted to spec.json
  selected: boolean
}

// ── LLM Schema ───────────────────────────────────────────────────

const LLMDraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  business_domain: z.string(),
  features: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
      acceptance_criteria: z.array(z.string()),
      out_of_scope: z.array(z.string()).optional().default([]),
    }),
  ),
  constraints: z.object({
    auth: z.boolean(),
    database: z.boolean(),
    file_upload: z.boolean(),
    email: z.boolean(),
    payments: z.boolean(),
  }),
  clarifying_questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      type: z.enum(['single', 'multiple', 'text']),
      options: z.array(z.string()).optional(),
      required: z.boolean(),
    })
  ).optional().default([]),
})

// ── System prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a product manager for Forge, an AI application factory.
Your job is to turn a user's vague app description into a structured, buildable specification.

Key principles:
1. AMPLIFY implicit requirements — most users don't think to mention things like "loading states",
   "error messages", "empty states", or domain-specific logic. Surface these.
2. PRIORITIZE by confidence:
   - high: every app of this type needs it (form validation, responsive layout, success/error feedback)
   - medium: most apps of this type need it (pagination, search, filters)
   - low: optional or complex (advanced analytics, multi-tenant, real-time collaboration)
3. ACCEPTANCE CRITERIA must be concrete and independently testable.
   Bad:  "User can log in"
   Good: "User can submit email+password, see error on wrong credentials, redirect to /dashboard on success"
4. For clarifying_questions: only ask genuine architectural blockers.
   For each question, also generate 2-4 concrete options the user can pick.
   Use type="single" for mutually exclusive choices, type="multiple" for
   "check all that apply", type="text" only when free input is truly needed.
   Mark required=true only if the answer changes core architecture.
   Example:
   {
     "id": "Q001",
     "question": "Do users need real-time collaboration?",
     "type": "single",
     "options": ["Yes, multiple users edit simultaneously", "No, single-user only"],
     "required": true
   }
5. Mark features as selected=true by default for high/medium confidence,
   selected=false for low confidence.`

// ── PM Agent ─────────────────────────────────────────────────────

export class PMAgent implements Agent {
  role = 'pm' as const

  /** Phase 1: generate draft spec for user review */
  async draft(userInput: string, emit: AgentRunContext['emit']): Promise<DraftSpec> {
    emit({ type: 'agent_start', agent: 'pm', message: 'Analyzing your requirements...' })
    emit({ type: 'agent_thinking', agent: 'pm', content: 'Identifying business domain and implicit requirements...' })

    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: LLMDraftSchema,
      system: SYSTEM_PROMPT,
      prompt: buildDraftPrompt(userInput),
    })

    const draft: DraftSpec = {
      title: object.title,
      description: object.description,
      business_domain: object.business_domain,
      constraints: object.constraints,
      clarifying_questions: object.clarifying_questions as ClarifyingQuestion[],
      features: object.features.map((f) => ({
        ...f,
        out_of_scope: f.out_of_scope ?? [],
        // Auto-select high and medium confidence features
        selected: f.confidence !== 'low',
      })),
    }

    emit({
      type: 'agent_done',
      agent: 'pm',
      summary: `Identified ${draft.features.length} features in ${draft.business_domain} domain`,
    })

    return draft
  }

  /** Phase 2: user has reviewed draft, produce final spec.json */
  finalize(draft: DraftSpec, userSupplementInput?: string): Spec {
    const selectedFeatures = draft.features.filter((f) => f.selected)

    if (selectedFeatures.length === 0) {
      throw new Error('At least one feature must be selected to generate a spec')
    }

    const spec: Spec = {
      id: randomUUID(),
      title: draft.title,
      description: draft.description,
      business_domain: draft.business_domain,
      features: selectedFeatures.map((f, i) => ({
        id: f.id || `F${String(i + 1).padStart(3, '0')}`,
        name: f.name,
        confidence: f.confidence,
        acceptance_criteria: f.acceptance_criteria,
        out_of_scope: f.out_of_scope.length > 0 ? f.out_of_scope : undefined,
      })),
      constraints: draft.constraints,
      clarifying_questions: userSupplementInput
        ? [`User supplement: ${userSupplementInput}`]
        : undefined,
    }

    // Validate the final spec against the schema before returning
    return SpecSchema.parse(spec)
  }

  /** Full run: used by orchestrator when resuming a WAITING task with user input */
  async run(ctx: AgentRunContext): Promise<AgentResult> {
    try {
      const draft = await this.draft(ctx.orchestrator.userInput, ctx.emit)
      // In the full orchestrator flow, after draft() the orchestrator
      // pauses and sends the draft to the frontend for user review.
      // finalize() is called separately after user confirms.
      // Here we just validate the draft shape.
      return {
        success: true,
        summary: `Draft ready: ${draft.features.length} features, domain: ${draft.business_domain}`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      ctx.emit({ type: 'agent_error', agent: 'pm', error: msg })
      return {
        success: false,
        summary: 'PM Agent failed',
        errors: [{ type: 'e2e', agent: 'unknown', message: msg }],
      }
    }
  }
}

// ── Prompt builders ───────────────────────────────────────────────

function buildDraftPrompt(userInput: string): string {
  return `The user wants to build the following app:

"${userInput}"

Generate a comprehensive spec. Include implicit requirements the user likely needs
but didn't mention — things standard for this type of app.

For the business_domain field, use a short hyphenated identifier like:
expense-management, e-commerce, project-management, appointment-booking,
inventory-management, crm, blog-platform, todo-app, etc.

Ensure acceptance_criteria are specific enough that a developer and an automated
test could independently verify them. Avoid vague language.`
}
