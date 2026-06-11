import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import type { Workflow, WorkflowDefinition, WorkflowTrigger, WorkflowStatus } from '../types/index.ts'


function normalizeWorkflow(w: Workflow): Workflow {
  return {
    ...w,
    definition: { steps: w.definition?.steps ?? [] },
    trigger:    w.trigger ?? { type: 'manual' },
  }
}

export function useWorkflows() {
  const token = useAuthStore(selectToken)
  return useQuery<Workflow[]>({
    queryKey: ['workflows'],
    queryFn:  async () => {
      const res = await api.get<Workflow[]>('/api/v1/workflows', token ?? undefined)
      return (res.data ?? []).map(normalizeWorkflow)
    },
    enabled: !!token,
  })
}

export function useCreateWorkflow() {
  const token = useAuthStore(selectToken)
  const qc    = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      description?: string
      definition: WorkflowDefinition
      trigger?: WorkflowTrigger
    }) => {
      const res = await api.post<Workflow>('/api/v1/workflows', {
        ...input,
        trigger: input.trigger ?? { type: 'manual' },
      }, token ?? undefined)
      return res.data!
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

export function useDeleteWorkflow() {
  const token = useAuthStore(selectToken)
  const qc    = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/workflows/${id}`, token ?? undefined)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

export function useUpdateWorkflow() {
  const token = useAuthStore(selectToken)
  const qc    = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      description?: string
      definition?: WorkflowDefinition
      trigger?: WorkflowTrigger
      status?: WorkflowStatus
    }) => {
      const { id, ...body } = input
      const res = await api.put<Workflow>(`/api/v1/workflows/${id}`, body, token ?? undefined)
      return res.data!
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}
