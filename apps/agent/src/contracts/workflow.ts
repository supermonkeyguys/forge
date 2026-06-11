import { z } from 'zod'

export const WorkflowStepSchema = z.object({
  id:           z.string(),
  name:         z.string(),
  capability:   z.enum(['browser', 'http', 'llm', 'notify', 'code', 'file']),
  instructions: z.string().describe('自然语言描述这步要做什么'),
  depends_on:   z.array(z.string()).default([]),
  config:       z.record(z.unknown()).optional(),
})

export const WorkflowDefinitionSchema = z.object({
  steps: z.array(WorkflowStepSchema).min(1),
})

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>

export interface StepResult {
  stepId:   string
  status:   'done' | 'failed'
  output:   string
  data?:    Record<string, unknown>
  error?:   string
}
