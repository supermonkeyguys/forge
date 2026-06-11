import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import type { Capability } from '../types/index.ts'

export function useCapabilities() {
  const token = useAuthStore(selectToken)
  return useQuery<Capability[]>({
    queryKey: ['capabilities'],
    queryFn:  async () => {
      const res = await api.get<Capability[]>('/api/v1/capabilities', token ?? undefined)
      return res.data ?? []
    },
    enabled: !!token,
  })
}

export function useCreateCapability() {
  const token = useAuthStore(selectToken)
  const qc    = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Capability, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
      const res = await api.post<Capability>('/api/v1/capabilities', input, token ?? undefined)
      return res.data!
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capabilities'] }),
  })
}
