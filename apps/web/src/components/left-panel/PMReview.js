import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * PMReview — shows the AI-amplified feature list for user confirmation.
 *
 * Three confidence tiers:
 *   high   → auto-selected, shown first
 *   medium → auto-selected, shown second
 *   low    → deselected by default, shown last (grayed)
 *
 * User can toggle each feature, edit threshold params (future), and confirm.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProject } from '@forge/core';
import { useWorkspaceStore, selectDraftSpec, } from '../../store/workspace-store.js';
const CONFIDENCE_LABEL = {
    high: '必需',
    medium: '常见',
    low: '可选',
};
const CONFIDENCE_COLOR = {
    high: 'var(--green)',
    medium: 'var(--accent)',
    low: 'var(--text-dim)',
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
    const handleBack = () => {
        setPhase('input');
    };
    const byConfidence = (tier) => draft.features.filter((f) => f.confidence === tier);
    return (_jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }, children: [_jsxs("div", { style: { padding: '16px 20px 12px', borderBottom: '1px solid var(--border-soft)' }, children: [_jsx("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }, children: _jsx("button", { onClick: handleBack, style: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, padding: 0, cursor: 'pointer' }, children: "\u2190 \u8FD4\u56DE" }) }), _jsxs("h3", { style: { fontSize: 15, fontWeight: 600 }, children: ["\u6211\u7406\u89E3\u4F60\u60F3\u505A\u300C", draft.title, "\u300D"] }), _jsx("p", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }, children: "\u4EE5\u4E0B\u529F\u80FD\u7531 AI \u63A8\u5BFC\uFF0C\u786E\u8BA4\u540E\u5F00\u59CB\u751F\u6210" })] }), _jsxs("div", { style: { flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: [draft.constraints.auth && _jsx(ConstraintBadge, { label: "\u9700\u8981\u767B\u5F55" }), draft.constraints.database && _jsx(ConstraintBadge, { label: "\u9700\u8981\u6570\u636E\u5E93" }), draft.constraints.file_upload && _jsx(ConstraintBadge, { label: "\u6587\u4EF6\u4E0A\u4F20" }), draft.constraints.email && _jsx(ConstraintBadge, { label: "\u90AE\u4EF6\u901A\u77E5" }), draft.constraints.payments && _jsx(ConstraintBadge, { label: "\u652F\u4ED8\u529F\u80FD" })] }), ['high', 'medium', 'low'].map((tier) => {
                        const features = byConfidence(tier);
                        if (features.length === 0)
                            return null;
                        return (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, color: CONFIDENCE_COLOR[tier], marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }, children: CONFIDENCE_LABEL[tier] }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 4 }, children: features.map((f) => (_jsx(FeatureRow, { feature: f, onToggle: () => toggleFeature(f.id) }, f.id))) })] }, tier));
                    }), draft.clarifying_questions.length > 0 && (_jsxs("div", { style: { background: 'var(--yellow-soft)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 'var(--radius)', padding: '10px 12px' }, children: [_jsx("p", { style: { fontSize: 12, color: 'var(--yellow)', marginBottom: 6 }, children: "\u26A0 AI \u6709\u51E0\u4E2A\u7591\u95EE" }), draft.clarifying_questions.map((q, i) => (_jsxs("p", { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }, children: ["\u2022 ", q] }, i)))] })), _jsxs("div", { children: [_jsx("p", { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }, children: "\u8FD8\u6709\u4EC0\u4E48\u8981\u8865\u5145\u7684\uFF1F" }), _jsx("textarea", { value: supplement, onChange: (e) => setSupplement(e.target.value), placeholder: "\u4F8B\u5982\uFF1A\u9700\u8981\u652F\u6301\u591A\u8BED\u8A00\u3001\u8981\u6709\u9ED1\u6697\u6A21\u5F0F...", rows: 2, style: {
                                    width: '100%',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text)',
                                    fontSize: 13,
                                    padding: '8px 10px',
                                    resize: 'none',
                                    outline: 'none',
                                } })] })] }), _jsx("div", { style: { padding: '12px 20px', borderTop: '1px solid var(--border-soft)' }, children: _jsx("button", { onClick: handleConfirm, disabled: selectedCount === 0 || isStarting || isCreating, style: {
                        width: '100%',
                        background: selectedCount > 0 && !isStarting && !isCreating ? 'var(--accent)' : 'var(--bg-card)',
                        color: selectedCount > 0 && !isStarting && !isCreating ? '#fff' : 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '10px',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: selectedCount > 0 && !isStarting && !isCreating ? 'pointer' : 'not-allowed',
                        transition: 'all 0.15s',
                    }, children: isStarting || isCreating
                        ? '启动中...'
                        : `确认并生成 (${selectedCount} 个功能)` }) })] }));
}
function FeatureRow({ feature, onToggle }) {
    const [expanded, setExpanded] = useState(false);
    return (_jsxs("div", { style: {
            background: feature.selected ? 'var(--bg-card)' : 'transparent',
            border: `1px solid ${feature.selected ? 'var(--border)' : 'var(--border-soft)'}`,
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            opacity: feature.selected ? 1 : 0.5,
            transition: 'all 0.15s',
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer' }, onClick: () => setExpanded(!expanded), children: [_jsx("div", { onClick: (e) => { e.stopPropagation(); onToggle(); }, style: {
                            width: 16,
                            height: 16,
                            borderRadius: 3,
                            border: `2px solid ${feature.selected ? 'var(--accent)' : 'var(--border)'}`,
                            background: feature.selected ? 'var(--accent)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.1s',
                        }, children: feature.selected && _jsx("span", { style: { color: '#fff', fontSize: 10 }, children: "\u2713" }) }), _jsx("span", { style: { flex: 1, fontSize: 13, fontWeight: 500 }, children: feature.name }), _jsx("span", { style: { fontSize: 11, color: 'var(--text-dim)' }, children: expanded ? '▲' : '▼' })] }), expanded && (_jsx("div", { style: { padding: '0 12px 10px 38px', display: 'flex', flexDirection: 'column', gap: 3 }, children: feature.acceptance_criteria.map((c, i) => (_jsxs("p", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: ["\u2022 ", c] }, i))) }))] }));
}
function ConstraintBadge({ label }) {
    return (_jsx("span", { style: {
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            border: '1px solid rgba(91,110,245,0.2)',
            borderRadius: 4,
            fontSize: 11,
            padding: '2px 7px',
            fontWeight: 500,
        }, children: label }));
}
