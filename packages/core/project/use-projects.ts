import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.ts'
import { parseWithFallback } from '../api/schema.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import type { Project } from '../types/index.ts'

const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  status: z.enum(['idle', 'analyzing', 'planning', 'building', 'validating', 'fixing', 'waiting', 'done', 'failed']),
  previewUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const ProjectListResponseSchema = z.object({
  data: z.array(ProjectSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export function useProjects() {
  const token = useAuthStore(selectToken)

  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const raw = await api.getList<Project>('/api/v1/projects', token ?? undefined)
      return parseWithFallback(ProjectListResponseSchema, raw, {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      })
    },
    enabled: token !== null,
  })
}

export function useProject(projectId: string) {
  const token = useAuthStore(selectToken)

  return useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => {
      const raw = await api.get<Project>(`/api/v1/projects/${projectId}`, token ?? undefined)
      return parseWithFallback(
        z.object({ data: ProjectSchema }),
        raw,
        // Return a minimal fallback so UI can show an error state
        null,
      )
    },
    enabled: token !== null && projectId !== '',
  })
}

export function useCreateProject() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      const raw = await api.post<Project>('/api/v1/projects', { name }, token ?? undefined)
      return parseWithFallback(z.object({ data: ProjectSchema }), raw, null)
    },
    onSettled: () => {
      // Always invalidate on settle (success or error), not just onSuccess
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useDeleteProject() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/api/v1/projects/${projectId}`, token ?? undefined)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
