import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Right panel — app preview.
 *
 * Shows an iframe pointing to the E2B sandbox preview URL.
 * While the app is still being generated, shows a placeholder with
 * the current build phase.
 */
import { useState } from 'react';
import { useWorkspaceStore, selectPreviewUrl, selectPhase, selectOrchestratorState, } from '../../store/workspace-store.js';
export function PreviewPanel() {
    const previewUrl = useWorkspaceStore(selectPreviewUrl);
    const phase = useWorkspaceStore(selectPhase);
    const orchState = useWorkspaceStore(selectOrchestratorState);
    const [iframeKey, setIframeKey] = useState(0);
    const handleRefresh = () => setIframeKey((k) => k + 1);
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            borderLeft: '1px solid var(--border)',
            background: 'var(--bg-panel)',
        }, children: [_jsxs("div", { style: {
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }, children: [_jsx("div", { style: {
                            flex: 1,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '5px 10px',
                            fontSize: 12,
                            color: previewUrl ? 'var(--text)' : 'var(--text-dim)',
                            fontFamily: 'var(--font-mono)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }, children: previewUrl ?? 'https://waiting...' }), previewUrl && (_jsx("button", { onClick: () => window.open(previewUrl, '_blank'), title: "\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00", style: {
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-muted)',
                            width: 28,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: 13,
                            flexShrink: 0,
                        }, children: "\u2197" })), previewUrl && (_jsx("button", { onClick: handleRefresh, title: "\u5237\u65B0\u9884\u89C8", style: {
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-muted)',
                            width: 28,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: 13,
                            flexShrink: 0,
                        }, children: "\u21BB" }))] }), _jsx("div", { style: { flex: 1, position: 'relative', overflow: 'hidden' }, children: previewUrl ? (_jsx("iframe", { src: previewUrl, style: {
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: '#fff',
                    }, title: "App Preview", sandbox: "allow-scripts allow-same-origin allow-forms allow-popups" }, iframeKey)) : (_jsx(BuildingPlaceholder, { phase: phase, orchState: orchState })) })] }));
}
function BuildingPlaceholder({ phase, orchState, }) {
    const steps = [
        { state: 'analyzing', label: '分析需求', done: false },
        { state: 'planning', label: '规划架构', done: false },
        { state: 'building', label: '生成代码', done: false },
        { state: 'validating', label: '验证功能', done: false },
    ];
    const stateOrder = ['analyzing', 'planning', 'building', 'validating', 'done'];
    const currentIdx = stateOrder.indexOf(orchState ?? '');
    return (_jsxs("div", { style: {
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 32,
            padding: 24,
        }, children: [_jsx("div", { style: { fontSize: 48, opacity: 0.3 }, children: phase === 'input' ? '🖥' : phase === 'pm-review' ? '📋' : '⚙️' }), _jsxs("div", { style: { textAlign: 'center' }, children: [_jsxs("p", { style: { fontSize: 14, color: 'var(--text-muted)', marginBottom: 6 }, children: [phase === 'input' && '输入需求后预览将出现在这里', phase === 'pm-review' && '确认需求后开始生成', (phase === 'running' || phase === 'fixing') && '应用正在生成中...', phase === 'waiting' && '等待你的指示', phase === 'error' && '生成遇到问题'] }), orchState && phase === 'running' && (_jsx("p", { style: { fontSize: 12, color: 'var(--text-dim)' }, children: orchState }))] }), (phase === 'running' || phase === 'done') && (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 200 }, children: steps.map((step, i) => {
                    const isDone = i < currentIdx;
                    const isActive = stateOrder[currentIdx] === step.state;
                    return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsxs("div", { style: {
                                    width: 20, height: 20,
                                    borderRadius: '50%',
                                    border: `2px solid ${isDone ? 'var(--green)' : isActive ? 'var(--accent)' : 'var(--border)'}`,
                                    background: isDone ? 'var(--green)' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    fontSize: 10,
                                }, children: [isDone && _jsx("span", { style: { color: '#000' }, children: "\u2713" }), isActive && _jsx("span", { style: { width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s ease infinite', display: 'block' } })] }), _jsx("span", { style: {
                                    fontSize: 12,
                                    color: isDone ? 'var(--green)' : isActive ? 'var(--text)' : 'var(--text-dim)',
                                }, children: step.label })] }, step.state));
                }) }))] }));
}
