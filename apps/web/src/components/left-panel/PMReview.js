import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProject } from '@forge/core';
import { useWorkspaceStore, selectDraftSpec, } from '../../store/workspace-store';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
const CONFIDENCE_LABEL = {
    high: '必需',
    medium: '常见',
    low: '可选',
};
const CONFIDENCE_CLASS = {
    high: 'text-green-500',
    medium: 'text-primary',
    low: 'text-muted-foreground',
};
export function PMReview() {
    const draft = useWorkspaceStore(selectDraftSpec);
    const setDraftSpec = useWorkspaceStore((s) => s.setDraftSpec);
    const setPhase = useWorkspaceStore((s) => s.setPhase);
    const startGeneration = useWorkspaceStore((s) => s.startGeneration);
    const userInput = useWorkspaceStore((s) => s.userInput);
    const { mutate: createProject, isPending: isCreating } = useCreateProject();
    const navigate = useNavigate();
    const [supplement, setSupplement] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    if (!draft)
        return null;
    const selectedCount = draft.features.filter((f) => f.selected).length;
    const toggleFeature = (id) => {
        setDraftSpec({
            ...draft,
            features: draft.features.map((f) => f.id === id ? { ...f, selected: !f.selected } : f),
        });
    };
    const handleConfirm = () => {
        if (selectedCount === 0 || isStarting || isCreating)
            return;
        setIsStarting(true);
        createProject(draft.title || userInput.slice(0, 40), {
            onSuccess: (result) => {
                const projectId = result?.data?.id;
                if (!projectId) {
                    setIsStarting(false);
                    return;
                }
                startGeneration(projectId);
                navigate(`/projects/${projectId}`);
            },
            onError: () => {
                setIsStarting(false);
            },
        });
    };
    const byConfidence = (tier) => draft.features.filter((f) => f.confidence === tier);
    return (_jsxs("div", { className: "flex flex-1 flex-col overflow-hidden", children: [_jsxs("div", { className: "border-b border-border/50 px-5 pb-3 pt-4", children: [_jsx("button", { onClick: () => setPhase('input'), className: "mb-1 text-sm text-muted-foreground hover:text-foreground", children: "\u2190 \u8FD4\u56DE" }), _jsxs("h3", { className: "text-[15px] font-semibold", children: ["\u6211\u7406\u89E3\u4F60\u60F3\u505A\u300C", draft.title, "\u300D"] }), _jsx("p", { className: "mt-0.5 text-xs text-muted-foreground", children: "\u4EE5\u4E0B\u529F\u80FD\u7531 AI \u63A8\u5BFC\uFF0C\u786E\u8BA4\u540E\u5F00\u59CB\u751F\u6210" })] }), _jsx(ScrollArea, { className: "flex-1 px-5 py-3", children: _jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("div", { className: "flex flex-wrap gap-1.5", children: [draft.constraints.auth && _jsx(ConstraintBadge, { label: "\u9700\u8981\u767B\u5F55" }), draft.constraints.database && _jsx(ConstraintBadge, { label: "\u9700\u8981\u6570\u636E\u5E93" }), draft.constraints.file_upload && _jsx(ConstraintBadge, { label: "\u6587\u4EF6\u4E0A\u4F20" }), draft.constraints.email && _jsx(ConstraintBadge, { label: "\u90AE\u4EF6\u901A\u77E5" }), draft.constraints.payments && _jsx(ConstraintBadge, { label: "\u652F\u4ED8\u529F\u80FD" })] }), ['high', 'medium', 'low'].map((tier) => {
                            const features = byConfidence(tier);
                            if (features.length === 0)
                                return null;
                            return (_jsxs("div", { children: [_jsx("div", { className: cn('mb-1.5 text-[11px] font-semibold uppercase tracking-wide', CONFIDENCE_CLASS[tier]), children: CONFIDENCE_LABEL[tier] }), _jsx("div", { className: "flex flex-col gap-1", children: features.map((f) => (_jsx(FeatureRow, { feature: f, onToggle: () => toggleFeature(f.id) }, f.id))) })] }, tier));
                        }), draft.clarifying_questions.length > 0 && (_jsxs("div", { className: "rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5", children: [_jsx("p", { className: "mb-1.5 text-xs text-yellow-500", children: "\u26A0 AI \u6709\u51E0\u4E2A\u7591\u95EE" }), draft.clarifying_questions.map((q, i) => (_jsxs("p", { className: "mb-0.5 text-xs text-muted-foreground", children: ["\u2022 ", q] }, i)))] })), _jsxs("div", { children: [_jsx("p", { className: "mb-1.5 text-xs text-muted-foreground", children: "\u8FD8\u6709\u4EC0\u4E48\u8981\u8865\u5145\u7684\uFF1F" }), _jsx(Textarea, { value: supplement, onChange: (e) => setSupplement(e.target.value), placeholder: "\u4F8B\u5982\uFF1A\u9700\u8981\u652F\u6301\u591A\u8BED\u8A00\u3001\u8981\u6709\u9ED1\u6697\u6A21\u5F0F...", rows: 2, className: "resize-none text-sm" })] })] }) }), _jsx("div", { className: "border-t border-border/50 px-5 py-3", children: _jsx(Button, { onClick: handleConfirm, disabled: selectedCount === 0 || isStarting || isCreating, className: "w-full", children: isStarting || isCreating
                        ? '启动中...'
                        : `确认并生成 (${selectedCount} 个功能)` }) })] }));
}
function FeatureRow({ feature, onToggle }) {
    const [expanded, setExpanded] = useState(false);
    return (_jsxs("div", { className: cn('overflow-hidden rounded border transition-all', feature.selected ? 'border-border bg-card' : 'border-border/30 opacity-50'), children: [_jsxs("div", { className: "flex cursor-pointer items-center gap-2.5 px-3 py-2", onClick: () => setExpanded(!expanded), children: [_jsx(Checkbox, { checked: feature.selected, onCheckedChange: onToggle, onClick: (e) => e.stopPropagation() }), _jsx("span", { className: "flex-1 text-sm font-medium", children: feature.name }), _jsx("span", { className: "text-xs text-muted-foreground", children: expanded ? '▲' : '▼' })] }), expanded && (_jsx("div", { className: "flex flex-col gap-0.5 pb-2.5 pl-9 pr-3", children: feature.acceptance_criteria.map((c, i) => (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["\u2022 ", c] }, i))) }))] }));
}
function ConstraintBadge({ label }) {
    return (_jsx(Badge, { variant: "secondary", className: "text-[11px]", children: label }));
}
