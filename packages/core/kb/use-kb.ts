import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'

const KBEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  sourceAgent: z.string(),
  sourceTask: z.string(),
  verified: z.boolean(),
  confidence: z.number(),
  staleAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type KBEntry = z.infer<typeof KBEntrySchema>
export type KBInput = Pick<KBEntry, 'title' | 'content' | 'tags'>

export function useKBEntries(q?: string) {
  const token = useAuthStore(selectToken)
  return useQuery({
    queryKey: ['kb', q ?? ''],
    queryFn: async () => {
      const path = q ? `/api/v1/kb?q=${encodeURIComponent(q)}` : '/api/v1/kb'
      const raw = await api.getList<KBEntry>(path, token ?? undefined)
      return z.array(KBEntrySchema).parse(raw.data)
    },
    enabled: token !== null,
  })
}

export function useCreateKBEntry() {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: KBInput) =>
      api.post<KBEntry>('/api/v1/kb', body, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  })
}

export function useVerifyKBEntry() {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.put<KBEntry>(`/api/v1/kb/${id}/verify`, {}, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  })
}

export function useDeleteKBEntry() {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/kb/${id}`, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  })
}
