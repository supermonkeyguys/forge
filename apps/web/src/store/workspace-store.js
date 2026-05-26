/**
 * Workspace store — single source of truth for the WorkspacePage.
 *
 * Three panels (left, center, right) all read from this store.
 * Agent events from SSE stream in via addEvent().
 *
 * Zustand rules (from AGENTS.md):
 *   - Selectors return primitives or stable references
 *   - Export named selector functions, not inline lambdas
 */
import { create } from 'zustand';
// ── Initial agent cards ───────────────────────────────────────────
const AGENT_ROLES = ['pm', 'architect', 'schema', 'logic', 'api', 'ui', 'page', 'test'];
function initialCards() {
    return Object.fromEntries(AGENT_ROLES.map((role) => [
        role,
        { role, status: 'idle', currentAction: '', filesWritten: [], startedAt: null, finishedAt: null },
    ]));
}
const initialState = {
    userInput: '',
    phase: 'input',
    projectId: null,
    orchestratorState: null,
    previewUrl: null,
    draftSpec: null,
    confirmedSpec: null,
    events: [],
    agentCards: initialCards(),
    waitingReason: null,
    agentJobId: null,
};
// ── Store ─────────────────────────────────────────────────────────
export const useWorkspaceStore = create()((set, get) => ({
    ...initialState,
    setUserInput: (v) => set({ userInput: v }),
    setPhase: (p) => set({ phase: p }),
    setDraftSpec: (d) => set({ draftSpec: d }),
    setConfirmedSpec: (s) => set({ confirmedSpec: s }),
    setAgentJobId: (jobId) => set({ agentJobId: jobId }),
    startGeneration: (projectId) => set({ projectId, phase: 'running', agentCards: initialCards(), events: [] }),
    setPreviewUrl: (url) => set({ previewUrl: url, phase: 'done' }),
    setWaiting: (reason) => set({ phase: 'waiting', waitingReason: reason }),
    reset: () => set({ ...initialState, agentCards: initialCards() }),
    addEvent: (event) => {
        set((s) => {
            const events = [...s.events, event];
            const cards = { ...s.agentCards };
            const role = event.agent ?? 'orchestrator';
            const card = cards[role] ?? { role, status: 'idle', currentAction: '', filesWritten: [], startedAt: null, finishedAt: null };
            switch (event.type) {
                case 'agent_start':
                    cards[role] = { ...card, status: 'running', currentAction: event.message ?? '', startedAt: Date.now() };
                    break;
                case 'agent_thinking':
                    cards[role] = { ...card, status: 'running', currentAction: event.content ?? '' };
                    break;
                case 'agent_file_write':
                    cards[role] = {
                        ...card,
                        currentAction: `writing ${event.file}`,
                        filesWritten: [...card.filesWritten, event.file ?? ''].filter(Boolean),
                    };
                    break;
                case 'agent_done':
                    cards[role] = { ...card, status: 'done', currentAction: event.summary ?? 'Done', finishedAt: Date.now() };
                    break;
                case 'agent_error':
                    cards[role] = { ...card, status: 'error', currentAction: event.error ?? 'Error' };
                    break;
                case 'state_change':
                    return { events, agentCards: cards, orchestratorState: event.state ?? s.orchestratorState };
            }
            return { events, agentCards: cards };
        });
    },
}));
// ── Stable selectors ──────────────────────────────────────────────
// Always use these instead of inline lambdas to prevent re-render loops.
export const selectPhase = (s) => s.phase;
export const selectUserInput = (s) => s.userInput;
export const selectProjectId = (s) => s.projectId;
export const selectDraftSpec = (s) => s.draftSpec;
export const selectConfirmedSpec = (s) => s.confirmedSpec;
export const selectPreviewUrl = (s) => s.previewUrl;
export const selectAgentCards = (s) => s.agentCards;
export const selectEvents = (s) => s.events;
export const selectOrchestratorState = (s) => s.orchestratorState;
export const selectWaitingReason = (s) => s.waitingReason;
export const selectAgentJobId = (s) => s.agentJobId;
