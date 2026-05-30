export async function notifyGoAPI(
  taskId: string,
  status: string,
  extras?: { previewUrl?: string; errorMsg?: string },
): Promise<void> {
  const apiUrl = process.env['FORGE_API_URL']
  if (!apiUrl) return

  const token = process.env['INTERNAL_TOKEN'] ?? ''
  const body = JSON.stringify({
    status,
    previewUrl: extras?.previewUrl ?? '',
    errorMsg: extras?.errorMsg ?? '',
  })

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
