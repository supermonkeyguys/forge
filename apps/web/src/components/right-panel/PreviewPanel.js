import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useWorkspaceStore, selectPreviewUrl, selectPhase, selectOrchestratorState, } from '../../store/workspace-store';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
export function PreviewPanel() {
    const previewUrl = useWorkspaceStore(selectPreviewUrl);
    const phase = useWorkspaceStore(selectPhase);
    const orchState = useWorkspaceStore(selectOrchestratorState);
    const [iframeKey, setIframeKey] = useState(0);
    return (_jsxs("div", { className: "flex h-full flex-col border-l border-border bg-card", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-border px-3.5 py-2.5", children: [_jsx("div", { className: cn('flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded border border-border bg-background px-2.5 py-1.5 font-mono text-xs', previewUrl ? 'text-foreground' : 'text-muted-foreground'), children: previewUrl ?? 'https://waiting...' }), previewUrl && (_jsx(Button, { variant: "outline", size: "icon", className: "h-7 w-7 shrink-0", title: "\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00", onClick: () => window.open(previewUrl, '_blank'), children: "\u2197" })), previewUrl && (_jsx(Button, { variant: "outline", size: "icon", className: "h-7 w-7 shrink-0", title: "\u5237\u65B0\u9884\u89C8", onClick: () => setIframeKey((k) => k + 1), children: "\u21BB" }))] }), _jsx("div", { className: "relative flex-1 overflow-hidden", children: previewUrl ? (_jsx("iframe", { src: previewUrl, className: "h-full w-full border-none bg-white", title: "App Preview", sandbox: "allow-scripts allow-same-origin allow-forms allow-popups" }, iframeKey)) : (_jsx(BuildingPlaceholder, { phase: phase, orchState: orchState })) })] }));
}
function BuildingPlaceholder({ phase, orchState }) {
    const steps = [
        { state: 'analyzing', label: '分析需求' },
        { state: 'planning', label: '规划架构' },
        { state: 'building', label: '生成代码' },
        { state: 'validating', label: '验证功能' },
    ];
    const stateOrder = ['analyzing', 'planning', 'building', 'validating', 'done'];
    const currentIdx = stateOrder.indexOf(orchState ?? '');
    return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-8 p-6", children: [_jsx("div", { className: "text-5xl opacity-30", children: phase === 'input' ? '🖥' : phase === 'pm-review' ? '📋' : '⚙️' }), _jsxs("div", { className: "text-center", children: [_jsxs("p", { className: "mb-1.5 text-sm text-muted-foreground", children: [phase === 'input' && '输入需求后预览将出现在这里', phase === 'pm-review' && '确认需求后开始生成', (phase === 'running' || phase === 'fixing') && '应用正在生成中...', phase === 'waiting' && '等待你的指示', phase === 'error' && '生成遇到问题'] }), orchState && phase === 'running' && (_jsx("p", { className: "text-xs text-muted-foreground/60", children: orchState }))] }), (phase === 'running' || phase === 'done') && (_jsx("div", { className: "flex w-full max-w-[200px] flex-col gap-2", children: steps.map((step, i) => {
                    const isDone = i < currentIdx;
                    const isActive = stateOrder[currentIdx] === step.state;
                    return (_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsxs("div", { className: cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', isDone ? 'border-green-500 bg-green-500' :
                                    isActive ? 'border-primary' :
                                        'border-border'), children: [isDone && _jsx("span", { className: "text-[10px] text-black", children: "\u2713" }), isActive && _jsx("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full bg-primary" })] }), _jsx("span", { className: cn('text-xs', isDone ? 'text-green-500' :
                                    isActive ? 'text-foreground' :
                                        'text-muted-foreground'), children: step.label })] }, step.state));
                }) }))] }));
}
