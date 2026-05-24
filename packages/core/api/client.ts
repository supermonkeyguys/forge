/**
 * HTTP client — the ONLY place in packages/core that calls fetch.
 * All other files must go through this module.
 */

const BASE_URL = (typeof process !== 'undefined' && process.env?.VITE_API_URL)
  ?? (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_API_URL : '')
  ?? 'http://localhost:8080'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ApiResponse<T> {
  data: T
}

interface ApiListResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

interface ApiErrorResponse {
  error: {
    code: string
    message: string
    field?: string
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...fetchOptions } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers })

  if (!res.ok) {
    const body: ApiErrorResponse = await res.json().catch(() => ({
      error: { code: 'UNKNOWN', message: res.statusText },
    }))
    throw new ApiError(
      res.status,
      body.error.code,
      body.error.message,
      body.error.field,
    )
  }

  return res.json() as Promise<T>
}

export const api = {
  get<T>(path: string, token?: string) {
    return request<ApiResponse<T>>(path, { method: 'GET', token })
  },
  getList<T>(path: string, token?: string) {
    return request<ApiListResponse<T>>(path, { method: 'GET', token })
  },
  post<T>(path: string, body: unknown, token?: string) {
    return request<ApiResponse<T>>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      token,
    })
  },
  put<T>(path: string, body: unknown, token?: string) {
    return request<ApiResponse<T>>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
      token,
    })
  },
  delete(path: string, token?: string) {
    return request<void>(path, { method: 'DELETE', token })
  },
}
