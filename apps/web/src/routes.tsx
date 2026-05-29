import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuthStore, selectIsAuthed } from '@forge/core'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { WorkspacePage } from './pages/WorkspacePage'
import { SettingsPage } from './pages/SettingsPage'

function ProtectedRoute() {
  const isAuthed = useAuthStore(selectIsAuthed)
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<WorkspacePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
