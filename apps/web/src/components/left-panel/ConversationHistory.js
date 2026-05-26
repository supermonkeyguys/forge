import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ConversationHistory — shown during running / done / waiting phases.
 * Displays a timeline of state changes and allows the user to send
 * follow-up messages (iteration).
 */
import { useState, useEffect, useRef } from 'react';
import { useWorkspaceStore, selectPhase, selectOrchestratorState, selectWaitingReason, selectEvents, } from '../../store/workspace-store.js';
export function ConversationHistory() {
    const phase = useWorkspaceStore(selectPhase);
    const orchState = useWorkspaceStore(selectOrchestratorState);
    const waitingReason = useWorkspaceStore(selectWaitingReason);
    const events = useWorkspaceStore(selectEvents);
    const [iterationInput, setIterationInput] = useState('');
    const bottomRef = useRef(null);
    // Auto-scroll to bottom when new events arrive
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events.length]);
    const handleIteration = () => {
        if (!iterationInput.trim())
            return;
        // TODO: call resume API
        setIterationInput('');
    };
    const stateLabel = {
        analyzing: '分析需求中...',
        planning: '规划架构中...',
        building: '生成代码中...',
        validating: '验证功能中...',
        fixing: '修复问题中...',
        done: '✓ 生成完成',
        waiting: '⚠ 需要你的介入',
    };
    return (_jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }, children: [_jsxs("div", { style: {
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }, children: [phase === 'running' && (_jsx("span", { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.5s ease infinite', flexShrink: 0 } })), phase === 'done' && (_jsx("span", { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 } })), phase === 'waiting' && (_jsx("span", { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--yellow)', flexShrink: 0 } })), _jsx("span", { style: { fontSize: 13, color: 'var(--text-muted)' }, children: orchState ? stateLabel[orchState] ?? orchState : '启动中...' })] }), _jsxs("div", { style: { flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }, children: [events
                        .filter((e) => ['state_change', 'agent_done', 'agent_error', 'waiting'].includes(e.type))
                        .map((event, i) => (_jsx(EventLine, { event: event }, i))), phase === 'waiting' && waitingReason && (_jsxs("div", { style: {
                            background: 'var(--yellow-soft)',
                            border: '1px solid rgba(251,191,36,0.2)',
                            borderRadius: 'var(--radius)',
                            padding: '10px 12px',
                            marginTop: 8,
                        }, children: [_jsx("p", { style: { fontSize: 12, color: 'var(--yellow)', fontWeight: 500, marginBottom: 4 }, children: "AI \u5361\u4F4F\u4E86\uFF0C\u9700\u8981\u4F60\u7684\u5E2E\u52A9" }), _jsx("p", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: waitingReason })] })), _jsx("div", { ref: bottomRef })] }), (phase === 'done' || phase === 'waiting') && (_jsx("div", { style: { padding: '12px 20px', borderTop: '1px solid var(--border-soft)' }, children: _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("input", { value: iterationInput, onChange: (e) => setIterationInput(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleIteration(), placeholder: phase === 'waiting' ? '告诉 AI 怎么解决...' : '继续迭代，例如：把按钮改成蓝色', style: {
                                flex: 1,
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text)',
                                fontSize: 13,
                                padding: '8px 10px',
                                outline: 'none',
                            }, onFocus: (e) => e.currentTarget.style.borderColor = 'var(--accent)', onBlur: (e) => e.currentTarget.style.borderColor = 'var(--border)' }), _jsx("button", { onClick: handleIteration, disabled: !iterationInput.trim(), style: {
                                background: 'var(--accent)',
                                border: 'none',
                                borderRadius: 'var(--radius-sm)',
                                color: '#fff',
                                padding: '0 14px',
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: iterationInput.trim() ? 'pointer' : 'not-allowed',
                                opacity: iterationInput.trim() ? 1 : 0.5,
                            }, children: "\u53D1\u9001" })] }) }))] }));
}
function EventLine({ event }) {
    const stateColors = {
        done: 'var(--green)',
        waiting: 'var(--yellow)',
        failed: 'var(--red)',
    };
    if (event.type === 'state_change') {
        return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: '50%', background: stateColors[event.state ?? ''] ?? 'var(--accent)', flexShrink: 0 } }), _jsx("span", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: event.state })] }));
    }
    if (event.type === 'agent_done') {
        return (_jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("span", { style: { fontSize: 12, color: 'var(--green)', flexShrink: 0 }, children: "\u2713" }), _jsxs("span", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: [_jsx("strong", { style: { color: 'var(--text)' }, children: event.agent }), ": ", event.summary] })] }));
    }
    if (event.type === 'agent_error') {
        return (_jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("span", { style: { fontSize: 12, color: 'var(--red)', flexShrink: 0 }, children: "\u2717" }), _jsxs("span", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: [_jsx("strong", { style: { color: 'var(--red)' }, children: event.agent }), ": ", event.error] })] }));
    }
    return null;
}
