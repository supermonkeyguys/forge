/**
 * Auth store — holds token + current user.
 *
 * Rules:
 * - Selectors must return primitives, not objects (prevents infinite renders)
 * - Token is kept in memory only (not localStorage) — persisted via httpOnly cookie
 */

import { create } from 'zustand'
import type { User } from '../types/index.js'

interface AuthState {
  token: string | null
  user: User | null
  setToken: (token: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,

  setToken: (token, user) => set({ token, user }),

  logout: () => set({ token: null, user: null }),
}))

// Stable selector helpers — use these to avoid re-render issues
export const selectToken = (s: AuthState) => s.token
export const selectUser = (s: AuthState) => s.user
export const selectIsAuthed = (s: AuthState) => s.token !== null
export const selectSetToken = (s: AuthState) => s.setToken
