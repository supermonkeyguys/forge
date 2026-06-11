import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateWorkflow, useGenerateWorkflow } from '@forge/core'
import type { WorkflowDefinition } from '@forge/core'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'

interface Props { onClose: () => void }

export function CreateWorkflowModal({ onClose }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState<'describe' | 'generating' | 'confirm' | 'error'>('describe')
  const [input, setInput] = useState('')
  const [generatedDef, setGeneratedDef] = useState<WorkflowDefinition | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const { mutateAsync: generate, isPending: isGenerating } = useGenerateWorkflow()
  const { mutate: create, isPending: isSaving } = useCreateWorkflow()

  const handleGenerate = async () => {
    setStep('generating')
    try {
      const definition = await generate({ userInput: input })
      setGeneratedDef(definition)
      setStep('confirm')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI 生成失败，请重试')
      setStep('error')
    }
  }

  const handleConfirm = () => {
    if (!generatedDef) return
    create(
      { name: input.slice(0, 40), description: input, definition: generatedDef },
      { onSuccess: (workflow) => {
          onClose()
          navigate(`/workflows/${workflow.id}/edit`)
        }
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-base font-semibold mb-4">新建工作流</h2>

        {step === 'describe' && (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              描述你想自动化的工作流程，AI 会帮你生成执行步骤
            </p>
            <Input
              placeholder="例如：每天从邮件提取发票信息，核对金额后发送通知"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && input.trim() && handleGenerate()}
              className="mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={handleGenerate} disabled={!input.trim() || isGenerating}>
                生成流程
              </Button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <div className="flex items-center gap-3 py-8 justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <span className="text-sm text-muted-foreground">AI 正在生成工作流...</span>
          </div>
        )}

        {step === 'error' && (
          <>
            <p className="text-sm text-destructive mb-4">{errorMsg}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={() => setStep('describe')}>重新描述</Button>
            </div>
          </>
        )}

        {step === 'confirm' && generatedDef && (
          <>
            <p className="text-sm text-muted-foreground mb-3">生成的流程步骤：</p>
            <div className="flex flex-col gap-2 mb-4 max-h-64 overflow-y-auto">
              {generatedDef.steps.map((s, i) => (
                <div key={s.id} className="flex items-start gap-3 rounded-lg border border-border/40 p-3">
                  <span className="text-xs text-muted-foreground mt-0.5">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.capability} · {s.instructions.slice(0, 80)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setStep('describe')}>重新生成</Button>
              <Button onClick={handleConfirm} disabled={isSaving}>
                {isSaving ? '保存中...' : '确认创建'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
