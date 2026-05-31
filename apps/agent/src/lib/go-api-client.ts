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
