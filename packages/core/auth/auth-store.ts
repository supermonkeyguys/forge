/**
 * Auth store — holds token + current user.
 *
 * Rules:
 * - Selectors must return primitives, not objects (prevents infinite renders)
 * - Token persisted to localStorage via zustand persist middleware
 * - On page refresh, token is restored automatically; ProtectedRoute still
 *   checks for token existence before rendering protected pages
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types/index.ts'

interface AuthState {
  token: string | null
  user: User | null
  setToken: (token: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setToken: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'forge-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
)

// Stable selector helpers — use these to avoid re-render issues
export const selectToken = (s: AuthState) => s.token
export const selectUser = (s: AuthState) => s.user
export const selectIsAuthed = (s: AuthState) => s.token !== null
export const selectSetToken = (s: AuthState) => s.setToken
