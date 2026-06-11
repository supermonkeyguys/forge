import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuthStore, selectIsAuthed } from '@forge/core'
import { AppShell } from './components/layout/AppShell'

const LoginPage = lazy(() => import('./pages/login').then(m => ({ default: m.LoginPage })))
const ProjectsPage = lazy(() => import('./pages/projects').then(m => ({ default: m.ProjectsPage })))
const WorkspacePage = lazy(() => import('./pages/workspace').then(m => ({ default: m.WorkspacePage })))
const AgentsPage = lazy(() => import('./pages/agents').then(m => ({ default: m.AgentsPage })))
const KnowledgePage = lazy(() => import('./pages/knowledge').then(m => ({ default: m.KnowledgePage })))
const SettingsPage = lazy(() => import('./pages/settings').then(m => ({ default: m.SettingsPage })))
const WorkflowsPage = lazy(() => import('./pages/workflows').then(m => ({ default: m.WorkflowsPage })))
const WorkflowDetailPage = lazy(() =>
  import('./pages/workflows/[id]/index').then(m => ({ default: m.WorkflowDetailPage }))
)
const WorkflowRunPage = lazy(() =>
  import('./pages/workflows/[id]/run').then(m => ({ default: m.WorkflowRunPage }))
)
const WorkflowEditorPage = lazy(() =>
  import('./pages/workflows/[id]/edit').then(m => ({ default: m.WorkflowEditorPage }))
)
const CapabilitiesPage = lazy(() => import('./pages/capabilities').then(m => ({ default: m.CapabilitiesPage })))

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
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
            <Route path="/workflows/:id/run" element={<WorkflowRunPage />} />
            <Route path="/workflows/:id/edit" element={<WorkflowEditorPage />} />
            <Route path="/capabilities" element={<CapabilitiesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
