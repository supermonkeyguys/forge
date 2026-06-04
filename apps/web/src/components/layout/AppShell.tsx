import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useProjects } from '@forge/core'
import { cn } from '../../lib/utils'
import { Icons } from '../ui/icons'

function useProjectsWarmup() {
  useProjects()
}

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  exact?: boolean
  onPrefetch?: () => void
}

function NavItem({ to, icon, label, exact, onPrefetch }: NavItemProps) {
  const location = useLocation()
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)
  return (
    <NavLink
      to={to}
      title={label}
      onMouseEnter={onPrefetch}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        isActive
          ? 'bg-primary/[0.13] text-primary'
          : 'text-white/30 hover:bg-white/[0.06] hover:text-white/65',
      )}
    >
      {isActive && (
        <span className="absolute -left-px top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-sm bg-primary" />
      )}
      {icon}
    </NavLink>
  )
}

function BackButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(-1)}
      title="返回"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/65"
    >
      <Icons.ChevronLeft className="h-[17px] w-[17px]" />
    </button>
  )
}

export function AppShell() {
  useProjectsWarmup()
  const location = useLocation()
  // Show back button when inside a project workspace (/projects/:id)
  const isWorkspace = /^\/projects\/.+/.test(location.pathname)

  const prefetchProjects = () => import('../../pages/projects')
  const prefetchAgents = () => import('../../pages/agents')
  const prefetchKnowledge = () => import('../../pages/knowledge')
  const prefetchSettings = () => import('../../pages/settings')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Fixed 52px global sidebar */}
      <nav
        className="flex w-[52px] flex-shrink-0 flex-col items-center gap-0.5 border-r border-white/[0.05] py-2"
        style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(24px)' }}
      >
        {/* Top: back button when in workspace, otherwise projects icon */}
        {isWorkspace ? (
          <>
            <BackButton />
            <div className="my-0.5 h-px w-7 bg-white/[0.06]" />
          </>
        ) : (
          <NavItem
            to="/projects"
            exact
            icon={<Icons.LayoutGrid className="h-[17px] w-[17px]" />}
            label="项目"
            onPrefetch={prefetchProjects}
          />
        )}

        <NavItem to="/conversations" icon={<Icons.MessageSquare className="h-[17px] w-[17px]" />} label="对话" />
        <NavItem
          to="/agents"
          icon={<Icons.Bot className="h-[17px] w-[17px]" />}
          label="Agents"
          onPrefetch={prefetchAgents}
        />
        <NavItem
          to="/knowledge"
          icon={<Icons.BookOpen className="h-[17px] w-[17px]" />}
          label="知识库"
          onPrefetch={prefetchKnowledge}
        />
        <div className="flex-1" />
        <div className="mb-1 h-px w-7 bg-white/[0.06]" />
        <NavItem
          to="/settings"
          icon={<Icons.Cog className="h-[17px] w-[17px]" />}
          label="设置"
          onPrefetch={prefetchSettings}
        />
      </nav>

      {/* Page content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
