import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore, selectUserInput } from '../../store/workspace-store';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
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
    useEffect(() => {
        let i = 0;
        const id = setInterval(() => {
            i = (i + 1) % PLACEHOLDER_EXAMPLES.length;
            setPlaceholder(PLACEHOLDER_EXAMPLES[i]);
        }, 3000);
        return () => clearInterval(id);
    }, []);
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
            await new Promise((r) => setTimeout(r, 800));
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
    return (_jsxs("div", { className: "flex flex-1 flex-col gap-6 px-5 py-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "mb-2 text-xl font-semibold", children: "\u63CF\u8FF0\u4F60\u60F3\u505A\u7684 App" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "AI \u4F1A\u5E2E\u4F60\u8865\u5168\u7EC6\u8282\uFF0C\u518D\u7531 Agent \u56E2\u961F\u534F\u4F5C\u751F\u6210" })] }), _jsx(Textarea, { ref: textareaRef, value: userInput, onChange: (e) => setUserInput(e.target.value), onKeyDown: handleKeyDown, placeholder: placeholder, rows: 4, className: "min-h-[120px] resize-none text-sm leading-relaxed" }), _jsx(Button, { onClick: handleSubmit, disabled: !userInput.trim() || isLoading, className: "w-full", children: isLoading ? (_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" }), "\u5206\u6790\u9700\u6C42\u4E2D..."] })) : (_jsxs("span", { children: ["\u751F\u6210\u5E94\u7528 ", _jsx("kbd", { className: "ml-1 text-xs opacity-60", children: "\u2318\u21B5" })] })) }), _jsxs("div", { children: [_jsx("p", { className: "mb-2 text-xs text-muted-foreground/60", children: "\u8BD5\u8BD5\u8FD9\u4E9B\uFF1A" }), _jsx("div", { className: "flex flex-col gap-1", children: PLACEHOLDER_EXAMPLES.map((ex) => (_jsxs("button", { onClick: () => setUserInput(ex), className: "py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground", children: ["\u2192 ", ex] }, ex))) })] })] }));
}
