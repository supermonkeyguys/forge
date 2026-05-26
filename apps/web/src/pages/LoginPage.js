import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin, useDevLogin, ApiError } from '@forge/core';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
export function LoginPage() {
    const navigate = useNavigate();
    const { mutate: login, isPending: loginPending } = useLogin();
    const { mutate: devLogin, isPending: devPending } = useDevLogin();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const handleLogin = () => {
        if (!email || !password) {
            setError('请输入邮箱和密码');
            return;
        }
        setError('');
        login({ email, password }, {
            onSuccess: () => navigate('/projects'),
            onError: (err) => {
                if (err instanceof ApiError && err.status === 401) {
                    setError('邮箱或密码错误');
                }
                else {
                    setError('登录失败，请稍后重试');
                }
            },
        });
    };
    const handleDevLogin = () => {
        setError('');
        devLogin(undefined, {
            onSuccess: () => navigate('/projects'),
            onError: () => setError('快速登录失败，请检查后端服务是否启动'),
        });
    };
    const isPending = loginPending || devPending;
    return (_jsx("div", { className: "flex h-screen items-center justify-center bg-background", children: _jsx(Card, { className: "w-80", children: _jsxs(CardContent, { className: "pt-6", children: [_jsxs("div", { className: "mb-6 flex flex-col items-center gap-2 text-center", children: [_jsx("div", { className: "text-4xl", children: "\uD83D\uDD28" }), _jsx("h1", { className: "text-xl font-bold", children: "Forge" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "AI \u5E94\u7528\u751F\u6210\u5E73\u53F0" })] }), _jsxs("div", { className: "flex flex-col gap-3", children: [_jsx(Input, { value: email, onChange: (e) => setEmail(e.target.value), placeholder: "\u90AE\u7BB1", type: "email", disabled: isPending, onKeyDown: (e) => e.key === 'Enter' && handleLogin(), className: error ? 'border-destructive' : '' }), _jsx(Input, { value: password, onChange: (e) => setPassword(e.target.value), placeholder: "\u5BC6\u7801", type: "password", disabled: isPending, onKeyDown: (e) => e.key === 'Enter' && handleLogin(), className: error ? 'border-destructive' : '' }), error && (_jsx("p", { className: "text-xs text-destructive", children: error })), _jsx(Button, { onClick: handleLogin, disabled: isPending, className: "w-full", children: loginPending ? '登录中...' : '登录' }), _jsx(Button, { variant: "outline", onClick: handleDevLogin, disabled: isPending, className: "w-full border-dashed", children: devPending ? '登录中...' : '→ 快速登录（开发模式）' })] })] }) }) }));
}
