import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function PageShell({ children }) {
    return (_jsx("div", { style: { height: '100vh', background: 'var(--bg)', overflowY: 'auto' }, children: children }));
}
export function EmptyState({ onNew }) {
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            paddingTop: 80,
        }, children: [_jsx("div", { style: { fontSize: 56, opacity: 0.15 }, children: "\uD83D\uDD28" }), _jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("h2", { style: { fontSize: 16, fontWeight: 600, marginBottom: 6 }, children: "\u8FD8\u6CA1\u6709\u9879\u76EE" }), _jsx("p", { style: { fontSize: 13, color: 'var(--text-muted)' }, children: "\u7528\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\u4F60\u7684 App\uFF0CAgent \u56E2\u961F\u6765\u751F\u6210\u5B83" })] }), _jsx("button", { onClick: onNew, style: {
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 500,
                    padding: '10px 24px',
                    cursor: 'pointer',
                    marginTop: 8,
                }, children: "\u521B\u5EFA\u7B2C\u4E00\u4E2A\u9879\u76EE" })] }));
}
export function LoadingState() {
    return (_jsx("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)' }, children: "\u52A0\u8F7D\u4E2D..." }));
}
export function ErrorState() {
    return (_jsx("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--red)' }, children: "\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5" }));
}
