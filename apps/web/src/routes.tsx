import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuthStore, selectIsAuthed } from '@forge/core'
import { LoginPage } from './pages/LoginPage.js'
import { ProjectsPage } from './pages/ProjectsPage.js'
import { WorkspacePage } from './pages/WorkspacePage.js'

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
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<WorkspacePage />} />
      </Route>
    </Routes>
  )
}
