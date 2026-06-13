import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePWA } from './usePWA'

describe('usePWA', () => {
  beforeEach(() => {
    // Mock serviceWorker
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          update: vi.fn(),
        } as unknown as ServiceWorkerRegistration),
        addEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial state', async () => {
    const { result } = renderHook(() => usePWA())

    // Wait for useEffect to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    })

    expect(result.current.needRefresh).toBe(false)
    expect(typeof result.current.updateServiceWorker).toBe('function')
  })

  it('handles browsers without serviceWorker', () => {
    // Remove serviceWorker
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => usePWA())
    expect(result.current.needRefresh).toBe(false)
    expect(result.current.offlineReady).toBe(false)
  })
})
