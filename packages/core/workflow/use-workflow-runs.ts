import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import type { WorkflowDefinition, WorkflowRun, WorkflowRunEvents, WorkflowRunStatus } from '../types/index.ts'

const TERMINAL: WorkflowRunStatus[] = ['done', 'failed']

export function useGenerateWorkflow() {
  const token = useAuthStore(selectToken)
  return useMutation({
    mutationFn: async (input: { userInput: string; clarifications?: string[] }) => {
      const res = await api.post<WorkflowDefinition>('/api/v1/workflows/generate', {
        userInput:      input.userInput,
        clarifications: input.clarifications ?? [],
      }, token ?? undefined)
      return res.data!
    },
  })
}

export function useRunWorkflow(workflowId: string) {
  const token = useAuthStore(selectToken)
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ runId: string; status: WorkflowRunStatus }>(
        `/api/v1/workflows/${workflowId}/runs`,
        {},
        token ?? undefined,
      )
      return res.data!
    },
  })
}

export function useWorkflowRunEvents(runId: string | null) {
  const token = useAuthStore(selectToken)
  return useQuery<WorkflowRunEvents>({
    queryKey:        ['workflow-run-events', runId],
    queryFn:         async () => {
      const res = await api.get<WorkflowRunEvents>(
        `/api/v1/workflow-runs/${runId}/events`,
        token ?? undefined,
      )
      return res.data ?? { status: 'queued', events: [] }
    },
    enabled:         !!runId && !!token,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL.includes(status) ? false : 500
    },
  })
}

export function useWorkflowRun(runId: string | null) {
  const token = useAuthStore(selectToken)
  return useQuery<WorkflowRun>({
    queryKey: ['workflow-run', runId],
    queryFn:  async () => {
      const res = await api.get<WorkflowRun>(
        `/api/v1/workflow-runs/${runId}`,
        token ?? undefined,
      )
      return res.data!
    },
    enabled: !!runId && !!token,
  })
}
