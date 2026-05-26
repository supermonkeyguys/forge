import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { useWorkspaceStore, selectPhase, selectOrchestratorState, selectWaitingReason, selectEvents, } from '../../store/workspace-store';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
export function ConversationHistory() {
    const phase = useWorkspaceStore(selectPhase);
    const orchState = useWorkspaceStore(selectOrchestratorState);
    const waitingReason = useWorkspaceStore(selectWaitingReason);
    const events = useWorkspaceStore(selectEvents);
    const [iterationInput, setIterationInput] = useState('');
    const bottomRef = useRef(null);
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
    return (_jsxs("div", { className: "flex flex-1 flex-col overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-border/50 px-5 py-3", children: [phase === 'running' && (_jsx("span", { className: "h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" })), phase === 'done' && (_jsx("span", { className: "h-2 w-2 shrink-0 rounded-full bg-green-500" })), phase === 'waiting' && (_jsx("span", { className: "h-2 w-2 shrink-0 rounded-full bg-yellow-500" })), _jsx("span", { className: "text-sm text-muted-foreground", children: orchState ? stateLabel[orchState] ?? orchState : '启动中...' })] }), _jsx(ScrollArea, { className: "flex-1 px-5 py-3", children: _jsxs("div", { className: "flex flex-col gap-1.5", children: [events
                            .filter((e) => ['state_change', 'agent_done', 'agent_error', 'waiting'].includes(e.type))
                            .map((event, i) => (_jsx(EventLine, { event: event }, i))), phase === 'waiting' && waitingReason && (_jsxs("div", { className: "mt-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5", children: [_jsx("p", { className: "mb-1 text-xs font-medium text-yellow-500", children: "AI \u5361\u4F4F\u4E86\uFF0C\u9700\u8981\u4F60\u7684\u5E2E\u52A9" }), _jsx("p", { className: "text-xs text-muted-foreground", children: waitingReason })] })), _jsx("div", { ref: bottomRef })] }) }), (phase === 'done' || phase === 'waiting') && (_jsx("div", { className: "border-t border-border/50 px-5 py-3", children: _jsxs("div", { className: "flex gap-2", children: [_jsx(Input, { value: iterationInput, onChange: (e) => setIterationInput(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleIteration(), placeholder: phase === 'waiting' ? '告诉 AI 怎么解决...' : '继续迭代，例如：把按钮改成蓝色', className: "flex-1 text-sm" }), _jsx(Button, { onClick: handleIteration, disabled: !iterationInput.trim(), size: "sm", children: "\u53D1\u9001" })] }) }))] }));
}
function EventLine({ event }) {
    if (event.type === 'state_change') {
        const dotClass = cn('h-1.5 w-1.5 shrink-0 rounded-full', event.state === 'done' ? 'bg-green-500' :
            event.state === 'waiting' ? 'bg-yellow-500' :
                event.state === 'failed' ? 'bg-destructive' :
                    'bg-primary');
        return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: dotClass }), _jsx("span", { className: "text-xs text-muted-foreground", children: event.state })] }));
    }
    if (event.type === 'agent_done') {
        return (_jsxs("div", { className: "flex gap-2", children: [_jsx("span", { className: "shrink-0 text-xs text-green-500", children: "\u2713" }), _jsxs("span", { className: "text-xs text-muted-foreground", children: [_jsx("strong", { className: "text-foreground", children: event.agent }), ": ", event.summary] })] }));
    }
    if (event.type === 'agent_error') {
        return (_jsxs("div", { className: "flex gap-2", children: [_jsx("span", { className: "shrink-0 text-xs text-destructive", children: "\u2717" }), _jsxs("span", { className: "text-xs text-muted-foreground", children: [_jsx("strong", { className: "text-destructive", children: event.agent }), ": ", event.error] })] }));
    }
    return null;
}
