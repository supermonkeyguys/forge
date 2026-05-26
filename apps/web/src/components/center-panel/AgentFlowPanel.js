import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Center panel — Agent collaboration visualizer.
 *
 * Shows:
 *   - Orchestrator state bar at top
 *   - Agent cards grid (one per agent role)
 *   - Collapsible log drawer at bottom
 */
import { useState } from 'react';
import { useWorkspaceStore, selectAgentCards, selectOrchestratorState, selectPhase, selectEvents, } from '../../store/workspace-store.js';
const AGENT_META = {
    pm: { label: 'PM Agent', icon: '📋', description: '需求分析与放大' },
    architect: { label: 'Architect', icon: '🏗', description: '技术架构规划' },
    schema: { label: 'Schema Agent', icon: '🗄', description: '数据库 Schema' },
    logic: { label: 'Logic Agent', icon: '⚙️', description: '业务逻辑 + 单测' },
    api: { label: 'API Agent', icon: '🔌', description: 'HTTP 接口层' },
    ui: { label: 'UI Agent', icon: '🎨', description: 'UI 组件 + Stories' },
    page: { label: 'Page Agent', icon: '📄', description: '页面组装' },
    test: { label: 'Test Agent', icon: '✅', description: '验证 + E2E 检查' },
};
export function AgentFlowPanel() {
    const phase = useWorkspaceStore(selectPhase);
    const orchState = useWorkspaceStore(selectOrchestratorState);
    const agentCards = useWorkspaceStore(selectAgentCards);
    const events = useWorkspaceStore(selectEvents);
    const [logOpen, setLogOpen] = useState(false);
    const thinkingEvents = events
        .filter((e) => e.type === 'agent_thinking' || e.type === 'agent_tool_use')
        .slice(-50);
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--bg)',
        }, children: [_jsx(OrchestratorBar, { state: orchState, phase: phase }), _jsx("div", { style: { flex: 1, overflowY: 'auto', padding: '20px' }, children: phase === 'input' || phase === 'pm-review' ? (_jsx(IdleState, {})) : (_jsx("div", { style: {
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: 12,
                    }, children: Object.values(agentCards).map((card) => (_jsx(AgentCard, { card: card }, card.role))) })) }), thinkingEvents.length > 0 && (_jsxs("div", { style: { borderTop: '1px solid var(--border)' }, children: [_jsxs("button", { onClick: () => setLogOpen(!logOpen), style: {
                            width: '100%',
                            background: 'var(--bg-panel)',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: 12,
                            padding: '8px 20px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }, children: [_jsx("span", { children: logOpen ? '▼' : '▲' }), "AI \u601D\u8003\u65E5\u5FD7 (", thinkingEvents.length, " \u6761)"] }), logOpen && (_jsx("div", { style: {
                            maxHeight: 200,
                            overflowY: 'auto',
                            padding: '8px 20px',
                            background: 'var(--bg-panel)',
                        }, children: thinkingEvents.map((e, i) => (_jsxs("p", { style: { fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 2 }, children: ["[", e.agent, "] ", e.type === 'agent_thinking' ? e.content : `tool: ${e.tool}`] }, i))) }))] }))] }));
}
// ── Sub-components ────────────────────────────────────────────────
function OrchestratorBar({ state, phase }) {
    const stateConfig = {
        analyzing: { color: 'var(--accent)', label: '分析需求' },
        planning: { color: 'var(--accent)', label: '规划架构' },
        building: { color: 'var(--accent)', label: '生成代码' },
        validating: { color: 'var(--yellow)', label: '验证功能' },
        fixing: { color: 'var(--yellow)', label: '修复问题' },
        waiting: { color: 'var(--yellow)', label: '等待介入' },
        done: { color: 'var(--green)', label: '生成完成' },
    };
    const config = state ? stateConfig[state] : null;
    return (_jsxs("div", { style: {
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
        }, children: [_jsx("span", { style: { fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }, children: "Agent \u534F\u4F5C\u6D41\u7A0B" }), config && (_jsx("span", { style: {
                    background: config.color + '20',
                    color: config.color,
                    border: `1px solid ${config.color}40`,
                    borderRadius: 4,
                    fontSize: 11,
                    padding: '2px 8px',
                    fontWeight: 500,
                }, children: config.label }))] }));
}
function AgentCard({ card }) {
    const meta = AGENT_META[card.role] ?? { label: card.role, icon: '🤖', description: '' };
    const statusColor = {
        idle: 'var(--text-dim)',
        running: 'var(--accent)',
        done: 'var(--green)',
        error: 'var(--red)',
    }[card.status];
    const elapsed = card.startedAt && card.finishedAt
        ? ((card.finishedAt - card.startedAt) / 1000).toFixed(1) + 's'
        : card.startedAt
            ? Math.floor((Date.now() - card.startedAt) / 1000) + 's'
            : null;
    return (_jsxs("div", { style: {
            background: 'var(--bg-card)',
            border: `1px solid ${card.status === 'running' ? 'var(--accent)40' : card.status === 'error' ? 'var(--red)40' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            padding: '14px',
            transition: 'border-color 0.2s',
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }, children: [_jsx("span", { style: { fontSize: 20 }, children: meta.icon }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600 }, children: meta.label }), _jsx("div", { style: { fontSize: 11, color: 'var(--text-dim)' }, children: meta.description })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [card.status === 'running' && (_jsx("span", { style: {
                                    width: 7, height: 7, borderRadius: '50%',
                                    background: 'var(--accent)',
                                    animation: 'pulse 1.2s ease infinite',
                                } })), card.status === 'done' && _jsx("span", { style: { fontSize: 12, color: 'var(--green)' }, children: "\u2713" }), card.status === 'error' && _jsx("span", { style: { fontSize: 12, color: 'var(--red)' }, children: "\u2717" }), elapsed && (_jsx("span", { style: { fontSize: 10, color: 'var(--text-dim)' }, children: elapsed }))] })] }), _jsx(ProgressDots, { status: card.status }), card.currentAction && (_jsx("p", { style: {
                    fontSize: 11,
                    color: statusColor,
                    marginTop: 8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }, children: card.currentAction })), card.filesWritten.length > 0 && (_jsxs("div", { style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }, children: [card.filesWritten.slice(-3).map((f) => (_jsxs("p", { style: { fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: ["+ ", f.split('/').pop()] }, f))), card.filesWritten.length > 3 && (_jsxs("p", { style: { fontSize: 10, color: 'var(--text-dim)' }, children: ["+", card.filesWritten.length - 3, " \u66F4\u591A\u6587\u4EF6"] }))] }))] }));
}
function ProgressDots({ status }) {
    const filled = { idle: 0, running: 2, done: 5, error: 1 }[status];
    return (_jsx("div", { style: { display: 'flex', gap: 4 }, children: Array.from({ length: 5 }).map((_, i) => (_jsx("span", { style: {
                width: 6, height: 6, borderRadius: '50%',
                background: i < filled ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.3s',
            } }, i))) }));
}
function IdleState() {
    return (_jsxs("div", { style: {
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            color: 'var(--text-dim)',
        }, children: [_jsx("div", { style: { fontSize: 48, opacity: 0.3 }, children: "\uD83E\uDD16" }), _jsx("p", { style: { fontSize: 14 }, children: "Agent \u56E2\u961F\u5F85\u547D\u4E2D" }), _jsx("p", { style: { fontSize: 12 }, children: "\u8F93\u5165\u9700\u6C42\u540E\uFF0C\u8FD9\u91CC\u4F1A\u5C55\u793A\u6BCF\u4E2A Agent \u7684\u5B9E\u65F6\u8FDB\u5EA6" })] }));
}
