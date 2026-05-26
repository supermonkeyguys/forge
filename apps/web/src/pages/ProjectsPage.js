import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useDeleteProject } from '@forge/core';
import { ProjectCard } from '../components/project-card/project-card';
import { PageShell, EmptyState, LoadingState, ErrorState } from '../components/project-card/project-page-states';
import { Button } from '../components/ui/button';
export function ProjectsPage() {
    const navigate = useNavigate();
    const { data, isLoading, isError } = useProjects();
    const { mutate: deleteProject } = useDeleteProject();
    const projects = data?.data ?? [];
    const [deleteError, setDeleteError] = useState(null);
    const handleDelete = (id) => {
        if (!window.confirm('确定删除这个项目？此操作不可撤销。'))
            return;
        deleteProject(id, {
            onError: () => setDeleteError('删除失败，请稍后重试'),
        });
    };
    if (isLoading) {
        return _jsx(PageShell, { children: _jsx(LoadingState, {}) });
    }
    if (isError) {
        return _jsx(PageShell, { children: _jsx(ErrorState, {}) });
    }
    return (_jsx(PageShell, { children: _jsxs("div", { className: "mx-auto max-w-[900px] px-6 py-8", children: [_jsxs("div", { className: "mb-6 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold", children: "\u6211\u7684\u9879\u76EE" }), projects.length > 0 && (_jsxs("p", { className: "mt-0.5 text-xs text-muted-foreground", children: [projects.length, " \u4E2A\u9879\u76EE"] }))] }), _jsx(Button, { onClick: () => navigate('/projects/new'), size: "sm", children: "+ \u65B0\u5EFA\u9879\u76EE" })] }), deleteError && (_jsx("p", { className: "mb-3 text-sm text-destructive", children: deleteError })), projects.length === 0 ? (_jsx(EmptyState, { onNew: () => navigate('/projects/new') })) : (_jsx("div", { className: "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3", children: projects.map((p) => (_jsx(ProjectCard, { project: p, onDelete: handleDelete }, p.id))) }))] }) }));
}
