/**
 * useDevLogin — dev-mode auto login.
 *
 * Tries to register a fixed dev account, then logs in.
 * If registration returns 409 (already exists), falls back straight to login.
 * Returns the same shape as useLogin's mutate.
 */

import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.js'
import { parseWithFallback } from '../api/schema.js'
import { useAuthStore } from './auth-store.js'
import type { AuthToken } from '../types/index.js'

const DEV_EMAIL = 'dev@forge.local'
const DEV_PASSWORD = 'devpassword123'
const DEV_NAME = 'Dev User'

const AuthTokenSchema = z.object({
  data: z.object({
    token: z.string(),
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      createdAt: z.string(),
    }),
  }),
})

async function devLogin(): Promise<AuthToken> {
  // Try register first; ignore 409 (user already exists)
  try {
    await api.post('/api/v1/auth/register', {
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      name: DEV_NAME,
    })
  } catch {
    // 409 or any error — proceed to login
  }

  const raw = await api.post<AuthToken>('/api/v1/auth/login', {
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  })

  return parseWithFallback(
    AuthTokenSchema,
    raw,
    { data: { token: '', user: { id: '', email: '', name: '', createdAt: '' } } },
  ).data
}

export function useDevLogin() {
  const setToken = useAuthStore((s) => s.setToken)

  return useMutation({
    mutationFn: devLogin,
    onSuccess: (data) => {
      if (data.token) {
        setToken(data.token, data.user)
      }
    },
  })
}
