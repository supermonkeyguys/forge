import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.js'
import { parseWithFallback } from '../api/schema.js'
import { useAuthStore, selectToken } from '../auth/auth-store.js'
import type { Task } from '../types/index.js'

const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  prompt: z.string(),
  status: z.enum(['idle','analyzing','planning','building','validating','fixing','waiting','done','failed']),
  previewUrl: z.string(),
  errorMsg: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export function useTask(projectId: string, taskId: string) {
  const token = useAuthStore(selectToken)

  return useQuery({
    queryKey: ['projects', projectId, 'tasks', taskId],
    queryFn: async () => {
      const raw = await api.get<Task>(`/api/v1/projects/${projectId}/tasks/${taskId}`, token ?? undefined)
      return parseWithFallback(z.object({ data: TaskSchema }), raw, null)?.data ?? null
    },
    enabled: token !== null && !!projectId && !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return 2000
      return ['done', 'failed'].includes(status) ? false : 2000
    },
  })
}

export function useCreateTask(projectId: string) {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (prompt: string) => {
      const raw = await api.post<Task>(
        `/api/v1/projects/${projectId}/tasks`,
        { prompt },
        token ?? undefined,
      )
      return parseWithFallback(z.object({ data: TaskSchema }), raw, null)?.data ?? null
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] })
    },
  })
}
