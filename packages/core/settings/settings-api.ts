import { api } from '../api/client.ts'

export interface SettingsResponse {
  baseUrl: string
  hasApiKey: boolean
}

export const settingsApi = {
  get(token: string) {
    return api.get<SettingsResponse>('/api/v1/settings', token)
  },
  save(token: string, baseUrl: string, apiKey: string) {
    return api.put<SettingsResponse>('/api/v1/settings', { baseUrl, apiKey }, token)
  },
  deleteApiKey(token: string) {
    return api.delete('/api/v1/settings/api-key', token)
  },
}
