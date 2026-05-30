import { useState, useRef, useEffect } from 'react'
import { useGetSettings, useSaveSettings, useResetApiKey } from '@forge/core'
import { Icons } from '../../../components/ui/icons'
import { toast } from '../../../store/toast-store'
import { GlassCard } from '../../../components/ui/glass-card'
import { DarkInput } from '../../../components/ui/dark-input'
import { SettingSection } from './SettingSection'

export function APIConfigSection() {
  const { data, isLoading } = useGetSettings()
  const { mutate: save, isPending: isSaving } = useSaveSettings()
  const { mutate: resetKey, isPending: isResetting } = useResetApiKey()

  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const seededRef = useRef(false)

  useEffect(() => {
    if (data && !seededRef.current) {
      seededRef.current = true
      setBaseUrl(data.baseUrl)
    }
  }, [data])

  const handleSave = () => {
    save(
      { baseUrl, apiKey },
      {
        onSuccess: () => {
          toast.success('配置已保存')
          setApiKey('')
        },
        onError: () => toast.error('保存失败，请稍后重试'),
      },
    )
  }

  const handleReset = () => {
    resetKey(undefined, {
      onSuccess: () => toast.success('API Key 已清除'),
      onError: () => toast.error('操作失败'),
    })
  }

  return (
    <SettingSection title="API 配置">
      <GlassCard>
        <div className="mb-4">
          <label className="mb-1.5 block text-[11.5px] font-medium text-white/40">Base URL</label>
          <DarkInput
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full"
          />
        </div>

        <div className="mb-1">
          <label className="mb-1.5 block text-[11.5px] font-medium text-white/40">API Key</label>
          <div className="flex items-center gap-2">
            <DarkInput
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={data?.hasApiKey ? '输入新 Key 以覆盖' : 'sk-...'}
              className="flex-1"
            />
            {data?.hasApiKey && (
              <span className="flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-400 whitespace-nowrap">
                <Icons.Check className="h-3 w-3" />
                已配置
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-white/25">
            Key 加密存储于服务器，前端不可读取。如需更换请直接填入新值覆盖。
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.05] pt-5">
          {data?.hasApiKey && (
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-[13px] text-white/50 transition-colors hover:text-white/75 disabled:opacity-40"
            >
              重置
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-[0_2px_12px] shadow-primary/35 transition-opacity disabled:opacity-40"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </GlassCard>
    </SettingSection>
  )
}
