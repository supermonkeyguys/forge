import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
const STATUS_LABEL = {
    done: '完成',
    building: '生成中',
    analyzing: '生成中',
    planning: '生成中',
    validating: '生成中',
    fixing: '生成中',
    failed: '失败',
    waiting: '等待',
    idle: '待机',
};
const IN_PROGRESS = new Set(['building', 'analyzing', 'planning', 'validating', 'fixing']);
function statusVariant(status) {
    if (status === 'done')
        return { variant: 'outline', className: 'border-green-500 text-green-400' };
    if (status === 'failed')
        return { variant: 'destructive' };
    if (status === 'waiting')
        return { variant: 'outline', className: 'border-yellow-500 text-yellow-400' };
    if (IN_PROGRESS.has(status))
        return { variant: 'secondary' };
    return { variant: 'outline' };
}
export function ProjectCard({ project, onDelete }) {
    const navigate = useNavigate();
    const { variant, className } = statusVariant(project.status);
    return (_jsx(Card, { className: cn(IN_PROGRESS.has(project.status) && 'border-primary/30'), children: _jsxs(CardContent, { className: "p-4", children: [_jsxs("div", { className: "mb-2 flex items-start justify-between gap-2", children: [_jsx("div", { className: "flex-1 text-sm font-semibold", children: project.name }), _jsx(Badge, { variant: variant, className: cn('shrink-0 text-[11px]', className), children: STATUS_LABEL[project.status] })] }), _jsx("div", { className: "mb-3 text-[11px] text-muted-foreground", children: new Date(project.createdAt).toLocaleDateString('zh-CN') }), _jsxs("div", { className: "flex gap-1.5", children: [project.status === 'done' && (_jsxs(_Fragment, { children: [project.previewUrl && (_jsx(Button, { variant: "ghost", size: "sm", className: "flex-1 h-7 text-xs", onClick: () => window.open(project.previewUrl, '_blank'), children: "\u9884\u89C8" })), _jsx(Button, { variant: "ghost", size: "sm", className: "flex-1 h-7 text-xs", onClick: () => navigate(`/projects/${project.id}`), children: "\u6253\u5F00" })] })), IN_PROGRESS.has(project.status) && (_jsx(Button, { variant: "ghost", size: "sm", className: "flex-1 h-7 text-xs text-primary", onClick: () => navigate(`/projects/${project.id}`), children: "\u67E5\u770B\u8FDB\u5EA6" })), (project.status === 'idle' || project.status === 'waiting') && (_jsx(Button, { variant: "ghost", size: "sm", className: "flex-1 h-7 text-xs", onClick: () => navigate(`/projects/${project.id}`), children: "\u6253\u5F00" })), project.status === 'failed' && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", size: "sm", className: "flex-1 h-7 text-xs", onClick: () => navigate(`/projects/${project.id}`), children: "\u91CD\u8BD5" }), _jsx(Button, { variant: "ghost", size: "sm", className: "flex-1 h-7 text-xs text-destructive", onClick: () => onDelete(project.id), children: "\u5220\u9664" })] }))] })] }) }));
}
