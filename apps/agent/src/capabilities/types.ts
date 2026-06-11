export interface RunContext {
  projectId:  string
  jobId:      string
  stepId:     string
  emit:       (event: { type: string; agent: string; content: string }) => void
  previousOutputs: Record<string, string>
}

export interface CapabilityResult {
  status:  'done' | 'failed'
  output:  string
  data?:   Record<string, unknown>
  error?:  string
}

export interface Capability {
  type: string
  execute(
    instructions: string,
    config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult>
}
