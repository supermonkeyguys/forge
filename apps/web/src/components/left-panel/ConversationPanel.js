import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Left panel — three phases:
 *   input     → RequirementInput (user types what they want)
 *   pm-review → PMReview (user reviews AI-amplified features)
 *   running / done / waiting → ConversationHistory (shows progress + allows iteration)
 */
import { useWorkspaceStore, selectPhase } from '../../store/workspace-store.js';
import { RequirementInput } from './RequirementInput.js';
import { PMReview } from './PMReview.js';
import { ConversationHistory } from './ConversationHistory.js';
export function ConversationPanel() {
    const phase = useWorkspaceStore(selectPhase);
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-panel)',
        }, children: [_jsx("div", { style: {
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }, children: _jsx("span", { style: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px' }, children: "\uD83D\uDD28 Forge" }) }), _jsxs("div", { style: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }, children: [phase === 'input' && _jsx(RequirementInput, {}), phase === 'pm-review' && _jsx(PMReview, {}), (phase === 'running' || phase === 'done' || phase === 'waiting' || phase === 'error') && (_jsx(ConversationHistory, {}))] })] }));
}
