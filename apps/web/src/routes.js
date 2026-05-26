import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuthStore, selectIsAuthed } from '@forge/core';
import { LoginPage } from './pages/LoginPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { WorkspacePage } from './pages/WorkspacePage.js';
function ProtectedRoute() {
    const isAuthed = useAuthStore(selectIsAuthed);
    return isAuthed ? _jsx(Outlet, {}) : _jsx(Navigate, { to: "/login", replace: true });
}
export function AppRoutes() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/projects", replace: true }) }), _jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsxs(Route, { element: _jsx(ProtectedRoute, {}), children: [_jsx(Route, { path: "/projects", element: _jsx(ProjectsPage, {}) }), _jsx(Route, { path: "/projects/:id", element: _jsx(WorkspacePage, {}) })] })] }));
}
