import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuthStore, selectIsAuthed } from '@forge/core'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ui/error-boundary'

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

function E({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/projects"         element={<E><ProjectsPage /></E>} />
              <Route path="/projects/:id"     element={<E><WorkspacePage /></E>} />
              <Route path="/agents"           element={<E><AgentsPage /></E>} />
              <Route path="/knowledge"        element={<E><KnowledgePage /></E>} />
              <Route path="/workflows"        element={<E><WorkflowsPage /></E>} />
              <Route path="/workflows/:id"    element={<E><WorkflowDetailPage /></E>} />
              <Route path="/workflows/:id/run"  element={<E><WorkflowRunPage /></E>} />
              <Route path="/workflows/:id/edit" element={<E><WorkflowEditorPage /></E>} />
              <Route path="/capabilities"     element={<E><CapabilitiesPage /></E>} />
              <Route path="/settings"         element={<E><SettingsPage /></E>} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
