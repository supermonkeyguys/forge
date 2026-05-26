import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useWorkspaceStore, selectAgentCards, selectOrchestratorState, selectPhase, selectEvents, } from '../../store/workspace-store';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
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
    return (_jsxs("div", { className: "flex h-full flex-col bg-background", children: [_jsx(OrchestratorBar, { state: orchState, phase: phase }), _jsx("div", { className: "flex-1 overflow-y-auto p-5", children: phase === 'input' || phase === 'pm-review' ? (_jsx(IdleState, {})) : (_jsx("div", { className: "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3", children: Object.values(agentCards).map((card) => (_jsx(AgentCard, { card: card }, card.role))) })) }), thinkingEvents.length > 0 && (_jsxs("div", { className: "border-t border-border", children: [_jsxs("button", { onClick: () => setLogOpen(!logOpen), className: "flex w-full items-center gap-1.5 bg-card px-5 py-2 text-left text-xs text-muted-foreground hover:text-foreground", children: [_jsx("span", { children: logOpen ? '▼' : '▲' }), "AI \u601D\u8003\u65E5\u5FD7 (", thinkingEvents.length, " \u6761)"] }), logOpen && (_jsx(ScrollArea, { className: "max-h-[200px] bg-card px-5 pb-2", children: thinkingEvents.map((e, i) => (_jsxs("p", { className: "mb-0.5 font-mono text-[11px] text-muted-foreground/60", children: ["[", e.agent, "] ", e.type === 'agent_thinking' ? e.content : `tool: ${e.tool}`] }, i))) }))] }))] }));
}
function OrchestratorBar({ state, phase }) {
    const stateConfig = {
        analyzing: { variant: 'secondary', label: '分析需求' },
        planning: { variant: 'secondary', label: '规划架构' },
        building: { variant: 'secondary', label: '生成代码' },
        validating: { variant: 'outline', label: '验证功能', className: 'border-yellow-500 text-yellow-500' },
        fixing: { variant: 'outline', label: '修复问题', className: 'border-yellow-500 text-yellow-500' },
        waiting: { variant: 'outline', label: '等待介入', className: 'border-yellow-500 text-yellow-500' },
        done: { variant: 'outline', label: '生成完成', className: 'border-green-500 text-green-500' },
    };
    const config = state ? stateConfig[state] : null;
    return (_jsxs("div", { className: "flex items-center gap-2.5 border-b border-border px-5 py-3", children: [_jsx("span", { className: "text-sm font-medium text-muted-foreground", children: "Agent \u534F\u4F5C\u6D41\u7A0B" }), config && (_jsx(Badge, { variant: config.variant, className: cn('text-[11px]', config.className), children: config.label }))] }));
}
function AgentCard({ card }) {
    const meta = AGENT_META[card.role] ?? { label: card.role, icon: '🤖', description: '' };
    const elapsed = card.startedAt && card.finishedAt
        ? ((card.finishedAt - card.startedAt) / 1000).toFixed(1) + 's'
        : card.startedAt
            ? Math.floor((Date.now() - card.startedAt) / 1000) + 's'
            : null;
    return (_jsx(Card, { className: cn('transition-colors', card.status === 'running' && 'border-primary/40', card.status === 'error' && 'border-destructive/40'), children: _jsxs(CardContent, { className: "p-3.5", children: [_jsxs("div", { className: "mb-2.5 flex items-center gap-2.5", children: [_jsx("span", { className: "text-xl", children: meta.icon }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "text-sm font-semibold", children: meta.label }), _jsx("div", { className: "text-[11px] text-muted-foreground", children: meta.description })] }), _jsxs("div", { className: "flex items-center gap-1", children: [card.status === 'running' && (_jsx("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full bg-primary" })), card.status === 'done' && _jsx("span", { className: "text-xs text-green-500", children: "\u2713" }), card.status === 'error' && _jsx("span", { className: "text-xs text-destructive", children: "\u2717" }), elapsed && _jsx("span", { className: "text-[10px] text-muted-foreground", children: elapsed })] })] }), _jsx(ProgressDots, { status: card.status }), card.currentAction && (_jsx("p", { className: cn('mt-2 truncate text-[11px]', card.status === 'running' ? 'text-primary' :
                        card.status === 'done' ? 'text-green-500' :
                            card.status === 'error' ? 'text-destructive' :
                                'text-muted-foreground'), children: card.currentAction })), card.filesWritten.length > 0 && (_jsxs("div", { className: "mt-2 flex flex-col gap-0.5", children: [card.filesWritten.slice(-3).map((f) => (_jsxs("p", { className: "truncate font-mono text-[10px] text-muted-foreground", children: ["+ ", f.split('/').pop()] }, f))), card.filesWritten.length > 3 && (_jsxs("p", { className: "text-[10px] text-muted-foreground", children: ["+", card.filesWritten.length - 3, " \u66F4\u591A\u6587\u4EF6"] }))] }))] }) }));
}
function ProgressDots({ status }) {
    const filled = { idle: 0, running: 2, done: 5, error: 1 }[status];
    return (_jsx("div", { className: "flex gap-1", children: Array.from({ length: 5 }).map((_, i) => (_jsx("span", { className: cn('h-1.5 w-1.5 rounded-full transition-colors duration-300', i < filled ? 'bg-primary' : 'bg-border') }, i))) }));
}
function IdleState() {
    return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-4 text-muted-foreground", children: [_jsx("div", { className: "text-5xl opacity-30", children: "\uD83E\uDD16" }), _jsx("p", { className: "text-sm", children: "Agent \u56E2\u961F\u5F85\u547D\u4E2D" }), _jsx("p", { className: "text-xs", children: "\u8F93\u5165\u9700\u6C42\u540E\uFF0C\u8FD9\u91CC\u4F1A\u5C55\u793A\u6BCF\u4E2A Agent \u7684\u5B9E\u65F6\u8FDB\u5EA6" })] }));
}
