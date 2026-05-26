import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useWorkspaceStore, selectPhase } from '../../store/workspace-store';
import { RequirementInput } from './RequirementInput';
import { PMReview } from './PMReview';
import { ConversationHistory } from './ConversationHistory';
import { Separator } from '../ui/separator';
export function ConversationPanel() {
    const phase = useWorkspaceStore(selectPhase);
    return (_jsxs("div", { className: "flex h-full flex-col border-r border-border bg-card", children: [_jsx("div", { className: "flex items-center gap-2 px-5 py-4", children: _jsx("span", { className: "text-lg font-bold tracking-tight", children: "\uD83D\uDD28 Forge" }) }), _jsx(Separator, {}), _jsxs("div", { className: "flex flex-1 flex-col overflow-hidden", children: [phase === 'input' && _jsx(RequirementInput, {}), phase === 'pm-review' && _jsx(PMReview, {}), (phase === 'running' || phase === 'done' || phase === 'waiting' || phase === 'error') && (_jsx(ConversationHistory, {}))] })] }));
}
