import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.ts'
import { parseWithFallback } from '../api/schema.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'

const AgentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  tools: z.array(z.string()),
  writePaths: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const AgentListResponseSchema = z.object({
  data: z.array(AgentSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export type UserAgent = z.infer<typeof AgentSchema>

export type AgentInput = Pick<UserAgent, 'name' | 'description' | 'instructions' | 'tools' | 'writePaths'>

export function useAgents() {
  const token = useAuthStore(selectToken)

  return useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const raw = await api.getList<UserAgent>('/api/v1/agents', token ?? undefined)
      return parseWithFallback(AgentListResponseSchema, raw, {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      })
    },
    enabled: token !== null,
  })
}

export function useCreateAgent() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: AgentInput) => {
      const raw = await api.post<UserAgent>('/api/v1/agents', body, token ?? undefined)
      return parseWithFallback(z.object({ data: AgentSchema }), raw, null)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useUpdateAgent() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Partial<AgentInput>) => {
      const raw = await api.put<UserAgent>(`/api/v1/agents/${id}`, body, token ?? undefined)
      return parseWithFallback(z.object({ data: AgentSchema }), raw, null)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useDeleteAgent() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/agents/${id}`, token ?? undefined)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}
