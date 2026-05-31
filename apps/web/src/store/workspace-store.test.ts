import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore, selectPhase, selectAgentCards } from './workspace-store'
import type { AgentEvent } from '@forge/core'

beforeEach(() => {
  useWorkspaceStore.getState().reset()
})

describe('workspace-store', () => {

  describe('initial state', () => {
    it('starts in input phase', () => {
      expect(useWorkspaceStore.getState().phase).toBe('input')
    })

    it('has no projectId', () => {
      expect(useWorkspaceStore.getState().projectId).toBeNull()
    })

    it('all agent cards start idle', () => {
      const cards = useWorkspaceStore.getState().agentCards
      Object.values(cards).forEach((card) => {
        expect(card.status).toBe('idle')
        expect(card.filesWritten).toHaveLength(0)
      })
    })
  })

  describe('startGeneration()', () => {
    it('sets projectId and switches to running phase', () => {
      useWorkspaceStore.getState().startGeneration('proj-123')
      const s = useWorkspaceStore.getState()
      expect(s.projectId).toBe('proj-123')
      expect(s.phase).toBe('running')
    })

    it('resets events and agent cards', () => {
      // Add some events first
      useWorkspaceStore.getState().addEvent({ type: 'agent_start', agent: 'pm', message: 'hi' })
      useWorkspaceStore.getState().startGeneration('proj-456')
      expect(useWorkspaceStore.getState().events).toHaveLength(0)
    })
  })

  describe('addEvent() — agent_start', () => {
    it('sets agent card to running', () => {
      const e: AgentEvent = { type: 'agent_start', agent: 'pm', message: 'Analyzing...' }
      useWorkspaceStore.getState().addEvent(e)
      const card = useWorkspaceStore.getState().agentCards['pm']!
      expect(card.status).toBe('running')
      expect(card.currentAction).toBe('Analyzing...')
      expect(card.startedAt).not.toBeNull()
    })
  })

  describe('addEvent() — agent_file_write', () => {
    it('appends file to filesWritten', () => {
      useWorkspaceStore.getState().addEvent({ type: 'agent_start', agent: 'schema', message: 'start' })
      useWorkspaceStore.getState().addEvent({
        type: 'agent_file_write', agent: 'schema',
        file: 'prisma/schema.prisma', action: 'create',
      })
      const card = useWorkspaceStore.getState().agentCards['schema']!
      expect(card.filesWritten).toContain('prisma/schema.prisma')
    })

    it('accumulates multiple different files', () => {
      useWorkspaceStore.getState().addEvent({ type: 'agent_start', agent: 'logic', message: 'start' })
      useWorkspaceStore.getState().addEvent({ type: 'agent_file_write', agent: 'logic', file: 'a.ts', action: 'create' })
      useWorkspaceStore.getState().addEvent({ type: 'agent_file_write', agent: 'logic', file: 'b.ts', action: 'create' })
      const card = useWorkspaceStore.getState().agentCards['logic']!
      expect(card.filesWritten).toHaveLength(2)
      expect(card.filesWritten).toEqual(['a.ts', 'b.ts'])
    })

    it('deduplicates when same file is written twice (create then patch)', () => {
      useWorkspaceStore.getState().addEvent({ type: 'agent_start', agent: 'api', message: 'start' })
      useWorkspaceStore.getState().addEvent({ type: 'agent_file_write', agent: 'api', file: 'src/routes.ts', action: 'create' })
      useWorkspaceStore.getState().addEvent({ type: 'agent_file_write', agent: 'api', file: 'src/routes.ts', action: 'modify' })
      const card = useWorkspaceStore.getState().agentCards['api']!
      // Should appear only once — prevents React duplicate key warning
      expect(card.filesWritten).toHaveLength(1)
      expect(card.filesWritten).toEqual(['src/routes.ts'])
    })

    it('deduplicates when same file appears many times', () => {
      useWorkspaceStore.getState().addEvent({ type: 'agent_start', agent: 'ui', message: 'start' })
      for (let i = 0; i < 5; i++) {
        useWorkspaceStore.getState().addEvent({ type: 'agent_file_write', agent: 'ui', file: 'src/Button.tsx', action: 'modify' })
      }
      const card = useWorkspaceStore.getState().agentCards['ui']!
      expect(card.filesWritten).toHaveLength(1)
    })

    it('does not deduplicate across different agents', () => {
      useWorkspaceStore.getState().addEvent({ type: 'agent_start', agent: 'logic', message: 'start' })
      useWorkspaceStore.getState().addEvent({ type: 'agent_start', agent: 'api', message: 'start' })
      // Both agents write the same file path (possible in real scenarios)
      useWorkspaceStore.getState().addEvent({ type: 'agent_file_write', agent: 'logic', file: 'src/types.ts', action: 'create' })
      useWorkspaceStore.getState().addEvent({ type: 'agent_file_write', agent: 'api', file: 'src/types.ts', action: 'create' })
      const logicCard = useWorkspaceStore.getState().agentCards['logic']!
      const apiCard = useWorkspaceStore.getState().agentCards['api']!
      expect(logicCard.filesWritten).toHaveLength(1)
      expect(apiCard.filesWritten).toHaveLength(1)
    })

    it('ignores empty file path', () => {
      useWorkspaceStore.getState().addEvent({ type: 'agent_start', agent: 'schema', message: 'start' })
      useWorkspaceStore.getState().addEvent({ type: 'agent_file_write', agent: 'schema', file: '', action: 'create' })
      const card = useWorkspaceStore.getState().agentCards['schema']!
      expect(card.filesWritten).toHaveLength(0)
    })
  })

  describe('addEvent() — agent_done', () => {
    it('sets agent card to done with summary', () => {
      useWorkspaceStore.getState().addEvent({ type: 'agent_start', agent: 'architect', message: 'start' })
      useWorkspaceStore.getState().addEvent({
        type: 'agent_done', agent: 'architect', summary: 'Plan ready: 10 tasks',
      })
      const card = useWorkspaceStore.getState().agentCards['architect']!
      expect(card.status).toBe('done')
      expect(card.currentAction).toBe('Plan ready: 10 tasks')
      expect(card.finishedAt).not.toBeNull()
    })
  })

  describe('addEvent() — agent_error', () => {
    it('sets agent card to error', () => {
      useWorkspaceStore.getState().addEvent({
        type: 'agent_error', agent: 'api', error: 'Route file failed to compile',
      })
      const card = useWorkspaceStore.getState().agentCards['api']!
      expect(card.status).toBe('error')
      expect(card.currentAction).toBe('Route file failed to compile')
    })
  })

  describe('addEvent() — state_change', () => {
    it('updates orchestratorState', () => {
      useWorkspaceStore.getState().addEvent({ type: 'state_change', state: 'building' as any })
      expect(useWorkspaceStore.getState().orchestratorState).toBe('building')
    })
  })

  describe('setPreviewUrl()', () => {
    it('sets previewUrl and switches to done phase', () => {
      useWorkspaceStore.getState().setPreviewUrl('https://abc.e2b.app')
      const s = useWorkspaceStore.getState()
      expect(s.previewUrl).toBe('https://abc.e2b.app')
      expect(s.phase).toBe('done')
    })
  })

  describe('setWaiting()', () => {
    it('sets phase to waiting with reason', () => {
      useWorkspaceStore.getState().setWaiting('3 retries exhausted')
      const s = useWorkspaceStore.getState()
      expect(s.phase).toBe('waiting')
      expect(s.waitingReason).toBe('3 retries exhausted')
    })
  })

  describe('reset()', () => {
    it('restores initial state', () => {
      useWorkspaceStore.getState().startGeneration('proj-1')
      useWorkspaceStore.getState().setPreviewUrl('https://x.e2b.app')
      useWorkspaceStore.getState().reset()
      const s = useWorkspaceStore.getState()
      expect(s.phase).toBe('input')
      expect(s.projectId).toBeNull()
      expect(s.previewUrl).toBeNull()
    })
  })

  describe('selectors are stable primitives', () => {
    it('selectPhase returns a string', () => {
      expect(typeof selectPhase(useWorkspaceStore.getState())).toBe('string')
    })

    it('selectAgentCards returns the same object reference when unchanged', () => {
      const a = selectAgentCards(useWorkspaceStore.getState())
      const b = selectAgentCards(useWorkspaceStore.getState())
      expect(a).toBe(b) // same reference — no re-render
    })
  })
})
