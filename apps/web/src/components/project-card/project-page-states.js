import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '../ui/button';
export function PageShell({ children }) {
    return (_jsx("div", { className: "h-screen overflow-y-auto bg-background", children: children }));
}
export function EmptyState({ onNew }) {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center gap-4 pt-20", children: [_jsx("div", { className: "text-5xl opacity-15", children: "\uD83D\uDD28" }), _jsxs("div", { className: "text-center", children: [_jsx("h2", { className: "mb-1.5 text-base font-semibold", children: "\u8FD8\u6CA1\u6709\u9879\u76EE" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u7528\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\u4F60\u7684 App\uFF0CAgent \u56E2\u961F\u6765\u751F\u6210\u5B83" })] }), _jsx(Button, { onClick: onNew, className: "mt-2", children: "\u521B\u5EFA\u7B2C\u4E00\u4E2A\u9879\u76EE" })] }));
}
export function LoadingState() {
    return (_jsx("div", { className: "flex h-full items-center justify-center text-muted-foreground", children: "\u52A0\u8F7D\u4E2D..." }));
}
export function ErrorState() {
    return (_jsx("div", { className: "flex h-full items-center justify-center text-destructive", children: "\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5" }));
}
