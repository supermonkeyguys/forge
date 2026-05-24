/**
 * parseWithFallback — safe API response parsing.
 *
 * Never use `as T` on API responses. Always go through this function.
 * On validation failure it logs a warning and returns the fallback,
 * so the UI degrades gracefully instead of white-screening.
 */

import { z, type ZodSchema } from 'zod'

export function parseWithFallback<T>(
  schema: ZodSchema<T>,
  data: unknown,
  fallback: T,
): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    console.warn('[forge] API response validation failed', {
      errors: result.error.flatten(),
      received: data,
    })
    return fallback
  }
  return result.data
}

// Common reusable schemas
export const PaginationSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})
