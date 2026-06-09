export async function notifyGoAPI(
  taskId: string,
  status: string,
  extras?: { previewUrl?: string; errorMsg?: string; events?: unknown[] },
): Promise<void> {
  const apiUrl = process.env['FORGE_API_URL']
  if (!apiUrl) return

  const token = process.env['INTERNAL_TOKEN'] ?? ''
  const payload: Record<string, unknown> = {
    status,
    previewUrl: extras?.previewUrl ?? '',
    errorMsg: extras?.errorMsg ?? '',
  }
  // Only send events on terminal states — keeps intermediate PATCH payloads small
  if (extras?.events) payload.events = extras.events
  const body = JSON.stringify(payload)

  try {
    await fetch(`${apiUrl}/internal/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Internal-Token': token } : {}),
      },
      body,
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    console.error(`[notifyGoAPI] failed to update task ${taskId} status to ${status}:`, err)
  }
}

interface TaskStepPayload {
  taskId: string
  seqNo: number
  agent: string
  summary: string
  toolCalls: { tool: string; input: Record<string, unknown> }[]
  durationMs: number
  status: 'done' | 'failed'
}

export async function writeTaskStep(step: TaskStepPayload, retries = 3): Promise<void> {
  const apiUrl = process.env['FORGE_API_URL']
  if (!apiUrl) return

  const token = process.env['INTERNAL_TOKEN'] ?? ''
  const { taskId, ...body } = step

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${apiUrl}/internal/tasks/${taskId}/steps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Internal-Token': token } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return
      if (attempt === retries - 1) {
        console.error(`[writeTaskStep] HTTP ${res.status} after ${retries} attempts for task ${taskId}`)
      }
    } catch (err) {
      if (attempt === retries - 1) {
        console.error(`[writeTaskStep] failed after ${retries} attempts for task ${taskId}:`, err)
      } else {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
      }
    }
  }
}

export async function notifyWorkflowRun(
  runId: string,
  status: string,
  errMsg?: string,
): Promise<void> {
  const apiUrl = process.env['FORGE_API_URL']
  if (!apiUrl) return

  const token = process.env['INTERNAL_TOKEN'] ?? ''
  const body = JSON.stringify({ status, errorMsg: errMsg ?? '' })

  try {
    const res = await fetch(`${apiUrl}/internal/workflow-runs/${runId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': token,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      console.error(`[notifyWorkflowRun] HTTP ${res.status} for run ${runId}`)
    }
  } catch (err) {
    console.error(`[notifyWorkflowRun] failed for run ${runId}:`, err)
  }
}
