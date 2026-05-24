import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore, selectToken, selectUser, selectIsAuthed } from './auth-store.js'

// Reset store between tests
beforeEach(() => {
  useAuthStore.setState({ token: null, user: null })
})

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: '2024-01-01T00:00:00Z',
}

describe('auth-store', () => {
  it('starts unauthenticated', () => {
    const state = useAuthStore.getState()
    expect(selectToken(state)).toBeNull()
    expect(selectUser(state)).toBeNull()
    expect(selectIsAuthed(state)).toBe(false)
  })

  it('setToken stores token and user', () => {
    useAuthStore.getState().setToken('tok_123', mockUser)
    const state = useAuthStore.getState()
    expect(selectToken(state)).toBe('tok_123')
    expect(selectUser(state)).toEqual(mockUser)
    expect(selectIsAuthed(state)).toBe(true)
  })

  it('logout clears token and user', () => {
    useAuthStore.getState().setToken('tok_123', mockUser)
    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(selectToken(state)).toBeNull()
    expect(selectIsAuthed(state)).toBe(false)
  })
})
