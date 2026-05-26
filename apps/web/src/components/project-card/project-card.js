import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
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
const STATUS_COLOR = {
    done: 'var(--green)',
    failed: 'var(--red)',
    waiting: 'var(--yellow)',
    building: 'var(--accent)',
    analyzing: 'var(--accent)',
    planning: 'var(--accent)',
    validating: 'var(--accent)',
    fixing: 'var(--accent)',
    idle: 'var(--text-dim)',
};
const IN_PROGRESS = new Set(['building', 'analyzing', 'planning', 'validating', 'fixing']);
export function ProjectCard({ project, onDelete }) {
    const navigate = useNavigate();
    const color = STATUS_COLOR[project.status];
    const label = STATUS_LABEL[project.status];
    return (_jsxs("div", { style: {
            background: 'var(--bg-card)',
            border: `1px solid ${IN_PROGRESS.has(project.status) ? 'rgba(91,110,245,0.3)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            padding: 16,
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, flex: 1, marginRight: 8 }, children: project.name }), _jsx("span", { style: {
                            background: color + '20',
                            color,
                            border: `1px solid ${color}40`,
                            borderRadius: 4,
                            fontSize: 11,
                            padding: '2px 7px',
                            whiteSpace: 'nowrap',
                        }, children: label })] }), _jsx("div", { style: { fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }, children: new Date(project.createdAt).toLocaleDateString('zh-CN') }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [project.status === 'done' && (_jsxs(_Fragment, { children: [project.previewUrl && (_jsx(ActionButton, { onClick: () => window.open(project.previewUrl, '_blank'), label: "\u9884\u89C8" })), _jsx(ActionButton, { onClick: () => navigate(`/projects/${project.id}`), label: "\u6253\u5F00" })] })), IN_PROGRESS.has(project.status) && (_jsx(ActionButton, { onClick: () => navigate(`/projects/${project.id}`), label: "\u67E5\u770B\u8FDB\u5EA6", primary: true })), (project.status === 'idle' || project.status === 'waiting') && (_jsx(ActionButton, { onClick: () => navigate(`/projects/${project.id}`), label: "\u6253\u5F00" })), project.status === 'failed' && (_jsxs(_Fragment, { children: [_jsx(ActionButton, { onClick: () => navigate(`/projects/${project.id}`), label: "\u91CD\u8BD5" }), _jsx(ActionButton, { onClick: () => onDelete(project.id), label: "\u5220\u9664" })] }))] })] }));
}
function ActionButton({ onClick, label, primary }) {
    return (_jsx("button", { onClick: onClick, style: {
            flex: 1,
            background: 'var(--bg-hover)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: primary ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 11,
            padding: '6px 0',
            cursor: 'pointer',
        }, children: label }));
}
