import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuthStore, selectIsAuthed } from '@forge/core'
import { AppShell } from './components/layout/AppShell'

const LoginPage = lazy(() => import('./pages/login').then(m => ({ default: m.LoginPage })))
const ProjectsPage = lazy(() => import('./pages/projects').then(m => ({ default: m.ProjectsPage })))
const WorkspacePage = lazy(() => import('./pages/workspace').then(m => ({ default: m.WorkspacePage })))
const AgentsPage = lazy(() => import('./pages/agents').then(m => ({ default: m.AgentsPage })))
const SettingsPage = lazy(() => import('./pages/settings').then(m => ({ default: m.SettingsPage })))

function ProtectedRoute() {
  const isAuthed = useAuthStore(selectIsAuthed)
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />
}

export function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<WorkspacePage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
