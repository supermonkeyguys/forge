import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'

const KBEntrySchema = z.object({
  id: z.string(),
  projectId: z.string().nullable().optional(),
  userId: z.string(),
  isGlobal: z.boolean(),
  type: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  inputType: z.string(),
  sourceRef: z.string(),
  sourceAgent: z.string(),
  status: z.string(),
  confidence: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type KBEntry = z.infer<typeof KBEntrySchema>
export type KBCreateInput = { title: string; content: string; type?: string; tags?: string[] }

export function useKBEntries(projectId: string, opts?: { type?: string; status?: string }) {
  const token = useAuthStore(selectToken)
  return useQuery({
    queryKey: ['kb', projectId, opts?.type ?? '', opts?.status ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (opts?.type) params.set('type', opts.type)
      if (opts?.status) params.set('status', opts.status)
      const qs = params.size ? '?' + params.toString() : ''
      const raw = await api.getList<KBEntry>(`/api/v1/projects/${projectId}/kb${qs}`, token ?? undefined)
      return z.array(KBEntrySchema).parse(raw.data)
    },
    enabled: !!token && !!projectId,
  })
}

export function useCreateKBEntry(projectId: string) {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: KBCreateInput) =>
      api.post<KBEntry>(`/api/v1/projects/${projectId}/kb`, body, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  })
}

export function useSetKBStatus(projectId: string) {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'verify' | 'deprecate' }) =>
      api.put<KBEntry>(`/api/v1/projects/${projectId}/kb/${id}/${action}`, {}, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  })
}

export function useDeleteKBEntry(projectId: string) {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/v1/projects/${projectId}/kb/${id}`, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  })
}

export function useIngestKB(projectId: string) {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { type: 'url'; url: string } | { type: 'file'; file: File }) => {
      const formData = new FormData()
      formData.append('inputType', input.type)
      if (input.type === 'url') {
        formData.append('sourceRef', input.url)
        formData.append('title', (() => {
          try { return new URL(input.url).hostname } catch { return input.url }
        })())
      } else {
        formData.append('file', input.file)
        formData.append('title', input.file.name)
      }
      const res = await fetch(`/api/v1/projects/${projectId}/kb/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error('Ingest request failed')
      return res.json()
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  })
}
