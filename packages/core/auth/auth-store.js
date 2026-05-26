/**
 * Auth store — holds token + current user.
 *
 * Rules:
 * - Selectors must return primitives, not objects (prevents infinite renders)
 * - Token persisted to localStorage via zustand persist middleware
 * - On page refresh, token is restored automatically; ProtectedRoute still
 *   checks for token existence before rendering protected pages
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const useAuthStore = create()(persist((set) => ({
    token: null,
    user: null,
    setToken: (token, user) => set({ token, user }),
    logout: () => set({ token: null, user: null }),
}), {
    name: 'forge-auth',
    partialize: (s) => ({ token: s.token, user: s.user }),
}));
// Stable selector helpers — use these to avoid re-render issues
export const selectToken = (s) => s.token;
export const selectUser = (s) => s.user;
export const selectIsAuthed = (s) => s.token !== null;
export const selectSetToken = (s) => s.setToken;
