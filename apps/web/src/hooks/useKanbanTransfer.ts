import { useState, useCallback } from 'react'

export type TransferState =
  | { phase: 'idle' }
  | { phase: 'falling'; cardId: string; fromCol: string }
  | { phase: 'entering'; cardId: string; toCol: string }

export function useKanbanTransfer() {
  const [state, setState] = useState<TransferState>({ phase: 'idle' })

  const startTransfer = useCallback((cardId: string, fromCol: string) => {
    setState({ phase: 'falling', cardId, fromCol })
  }, [])

  const completeExit = useCallback((cardId: string, toCol: string) => {
    setState({ phase: 'entering', cardId, toCol })
  }, [])

  const completeEnter = useCallback(() => {
    setState({ phase: 'idle' })
  }, [])

  return { state, startTransfer, completeExit, completeEnter }
}
