import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client.ts'

export interface TaskStep {
  id: string
  taskId: string
  seqNo: number
  agent: string
  summary: string
  toolCalls: { tool: string; input: { path?: string; [key: string]: unknown } }[]
  durationMs: number
  status: 'done' | 'failed'
  createdAt: string
}

export function useTaskSteps(projectId: string | null, enabled: boolean) {
  return useQuery<TaskStep[]>({
    queryKey: ['task-steps', projectId],
    queryFn: async (): Promise<TaskStep[]> => {
      const res = await api.get<TaskStep[]>(
        `/api/v1/projects/${projectId}/tasks/latest/steps`,
      )
      return res.data ?? []
    },
    enabled: !!projectId && enabled,
    staleTime: Infinity,
  })
}
