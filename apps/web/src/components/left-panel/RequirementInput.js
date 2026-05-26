import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * RequirementInput — the first thing the user sees.
 * A textarea + send button. On submit, calls the API to create a project
 * and transitions to pm-review phase.
 */
import { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore, selectUserInput } from '../../store/workspace-store.js';
const PLACEHOLDER_EXAMPLES = [
    '我需要一个报销申请系统',
    '做一个任务管理 App',
    '我想要一个预约系统',
    '帮我做一个简单的电商后台',
];
export function RequirementInput() {
    const userInput = useWorkspaceStore(selectUserInput);
    const setUserInput = useWorkspaceStore((s) => s.setUserInput);
    const setPhase = useWorkspaceStore((s) => s.setPhase);
    const setDraftSpec = useWorkspaceStore((s) => s.setDraftSpec);
    const [placeholder, setPlaceholder] = useState(PLACEHOLDER_EXAMPLES[0]);
    const [isLoading, setIsLoading] = useState(false);
    const textareaRef = useRef(null);
    // Cycle placeholder examples
    useEffect(() => {
        let i = 0;
        const id = setInterval(() => {
            i = (i + 1) % PLACEHOLDER_EXAMPLES.length;
            setPlaceholder(PLACEHOLDER_EXAMPLES[i]);
        }, 3000);
        return () => clearInterval(id);
    }, []);
    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el)
            return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }, [userInput]);
    const handleSubmit = async () => {
        if (!userInput.trim() || isLoading)
            return;
        setIsLoading(true);
        try {
            // In Phase 1 (no Go API yet): mock the PM draft response
            // This will be replaced with a real API call once Go API is ready
            await new Promise((r) => setTimeout(r, 800)); // simulate network
            const mockDraft = {
                title: userInput.length > 20 ? userInput.slice(0, 20) + '...' : userInput,
                description: userInput,
                business_domain: 'custom-app',
                constraints: { auth: true, database: true, file_upload: false, email: false, payments: false },
                clarifying_questions: [],
                features: [
                    {
                        id: 'F001',
                        name: '用户认证',
                        confidence: 'high',
                        acceptance_criteria: ['支持邮箱+密码登录', '错误提示清晰', '登录成功跳转首页'],
                        out_of_scope: [],
                        selected: true,
                    },
                    {
                        id: 'F002',
                        name: '核心功能',
                        confidence: 'high',
                        acceptance_criteria: ['用户可以创建记录', '支持编辑和删除', '列表分页展示'],
                        out_of_scope: [],
                        selected: true,
                    },
                    {
                        id: 'F003',
                        name: '数据导出',
                        confidence: 'medium',
                        acceptance_criteria: ['支持导出为 CSV', '导出范围可筛选'],
                        out_of_scope: [],
                        selected: true,
                    },
                    {
                        id: 'F004',
                        name: '高级分析报表',
                        confidence: 'low',
                        acceptance_criteria: ['图表展示趋势数据'],
                        out_of_scope: [],
                        selected: false,
                    },
                ],
            };
            setDraftSpec(mockDraft);
            setPhase('pm-review');
        }
        catch {
            // TODO: error state
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };
    return (_jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 20px', gap: 24 }, children: [_jsxs("div", { children: [_jsx("h2", { style: { fontSize: 20, fontWeight: 600, marginBottom: 8 }, children: "\u63CF\u8FF0\u4F60\u60F3\u505A\u7684 App" }), _jsx("p", { style: { color: 'var(--text-muted)', fontSize: 13 }, children: "AI \u4F1A\u5E2E\u4F60\u8865\u5168\u7EC6\u8282\uFF0C\u518D\u7531 Agent \u56E2\u961F\u534F\u4F5C\u751F\u6210" })] }), _jsx("div", { style: { position: 'relative' }, children: _jsx("textarea", { ref: textareaRef, value: userInput, onChange: (e) => setUserInput(e.target.value), onKeyDown: handleKeyDown, placeholder: placeholder, rows: 4, style: {
                        width: '100%',
                        minHeight: 120,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--text)',
                        fontSize: 14,
                        lineHeight: 1.6,
                        padding: '12px 14px',
                        resize: 'none',
                        outline: 'none',
                        transition: 'border-color 0.15s',
                    }, onFocus: (e) => e.currentTarget.style.borderColor = 'var(--accent)', onBlur: (e) => e.currentTarget.style.borderColor = 'var(--border)' }) }), _jsx("button", { onClick: handleSubmit, disabled: !userInput.trim() || isLoading, style: {
                    background: userInput.trim() && !isLoading ? 'var(--accent)' : 'var(--bg-card)',
                    color: userInput.trim() && !isLoading ? '#fff' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '10px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.15s',
                    cursor: userInput.trim() && !isLoading ? 'pointer' : 'not-allowed',
                }, children: isLoading ? (_jsxs(_Fragment, { children: [_jsx(Spinner, {}), " \u5206\u6790\u9700\u6C42\u4E2D..."] })) : (_jsxs(_Fragment, { children: ["\u751F\u6210\u5E94\u7528 ", _jsx("kbd", { style: { fontSize: 11, opacity: 0.6 }, children: "\u2318\u21B5" })] })) }), _jsxs("div", { children: [_jsx("p", { style: { fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }, children: "\u8BD5\u8BD5\u8FD9\u4E9B\uFF1A" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 4 }, children: PLACEHOLDER_EXAMPLES.map((ex) => (_jsxs("button", { onClick: () => setUserInput(ex), style: {
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                fontSize: 12,
                                textAlign: 'left',
                                padding: '4px 0',
                                cursor: 'pointer',
                            }, onMouseEnter: (e) => e.currentTarget.style.color = 'var(--text)', onMouseLeave: (e) => e.currentTarget.style.color = 'var(--text-muted)', children: ["\u2192 ", ex] }, ex))) })] })] }));
}
function Spinner() {
    return (_jsx("span", { style: {
            width: 14,
            height: 14,
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
        } }));
}
