import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import { settingsApi } from './settings-api.ts'

const SETTINGS_KEY = ['settings'] as const

export function useGetSettings() {
  const token = useAuthStore(selectToken)
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => settingsApi.get(token!).then((r) => r.data),
    enabled: !!token,
  })
}

export function useSaveSettings() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ baseUrl, apiKey }: { baseUrl: string; apiKey: string }) =>
      settingsApi.save(token!, baseUrl, apiKey).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_KEY, data)
    },
  })
}

export function useResetApiKey() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => settingsApi.deleteApiKey(token!),
    onSuccess: () => {
      queryClient.setQueryData(SETTINGS_KEY, (old: any) =>
        old ? { ...old, hasApiKey: false } : old,
      )
    },
  })
}
