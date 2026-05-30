import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { notifyGoAPI } from './lib/go-api-client.js'

describe('notifyGoAPI', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('skips HTTP call when FORGE_API_URL is not set', async () => {
    delete process.env['FORGE_API_URL']
    await notifyGoAPI('task-1', 'analyzing')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('sends PATCH to correct URL with status in body', async () => {
    process.env['FORGE_API_URL'] = 'http://go-api:8080'
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))

    await notifyGoAPI('task-abc', 'building')

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'http://go-api:8080/internal/tasks/task-abc/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'building', previewUrl: '', errorMsg: '' }),
      }),
    )
  })

  it('includes X-Internal-Token header when INTERNAL_TOKEN is set', async () => {
    process.env['FORGE_API_URL'] = 'http://go-api:8080'
    process.env['INTERNAL_TOKEN'] = 'my-secret'
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))

    await notifyGoAPI('task-abc', 'analyzing')

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Internal-Token': 'my-secret' }),
      }),
    )
  })

  it('omits X-Internal-Token header when INTERNAL_TOKEN is not set', async () => {
    process.env['FORGE_API_URL'] = 'http://go-api:8080'
    delete process.env['INTERNAL_TOKEN']
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))

    await notifyGoAPI('task-abc', 'analyzing')

    const callArgs = vi.mocked(fetch).mock.calls[0]![1] as RequestInit
    const headers = callArgs.headers as Record<string, string>
    expect(headers['X-Internal-Token']).toBeUndefined()
  })

  it('includes previewUrl in extras for done state', async () => {
    process.env['FORGE_API_URL'] = 'http://go-api:8080'
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))

    await notifyGoAPI('task-abc', 'done', { previewUrl: 'https://preview.example.com' })

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ status: 'done', previewUrl: 'https://preview.example.com', errorMsg: '' }),
      }),
    )
  })

  it('includes errorMsg in extras when error occurs', async () => {
    process.env['FORGE_API_URL'] = 'http://go-api:8080'
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))

    await notifyGoAPI('task-abc', 'aborted', { errorMsg: 'sandbox timed out' })

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ status: 'aborted', previewUrl: '', errorMsg: 'sandbox timed out' }),
      }),
    )
  })

  it('logs error and does not throw when fetch fails', async () => {
    process.env['FORGE_API_URL'] = 'http://go-api:8080'
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(notifyGoAPI('task-abc', 'analyzing')).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
