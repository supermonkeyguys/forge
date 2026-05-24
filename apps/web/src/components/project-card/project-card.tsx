import { useNavigate } from 'react-router-dom'
import type { Project } from '@forge/core'

const STATUS_LABEL: Record<string, string> = {
  done:       '完成',
  building:   '生成中',
  analyzing:  '生成中',
  planning:   '生成中',
  validating: '生成中',
  fixing:     '生成中',
  failed:     '失败',
  waiting:    '等待',
  idle:       '待机',
}

const STATUS_COLOR: Record<string, string> = {
  done:      'var(--green)',
  failed:    'var(--red)',
  waiting:   'var(--yellow)',
  building:  'var(--accent)',
  analyzing: 'var(--accent)',
  planning:  'var(--accent)',
  validating:'var(--accent)',
  fixing:    'var(--accent)',
  idle:      'var(--text-dim)',
}

const IN_PROGRESS = new Set(['building', 'analyzing', 'planning', 'validating', 'fixing'])

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const navigate = useNavigate()
  const color = STATUS_COLOR[project.status] ?? 'var(--text-dim)'
  const label = STATUS_LABEL[project.status] ?? project.status

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${IN_PROGRESS.has(project.status) ? 'rgba(91,110,245,0.3)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, flex: 1, marginRight: 8 }}>
          {project.name}
        </div>
        <span style={{
          background: color + '20',
          color,
          border: `1px solid ${color}40`,
          borderRadius: 4,
          fontSize: 11,
          padding: '2px 7px',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        {new Date(project.createdAt).toLocaleDateString('zh-CN')}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {project.status === 'done' && (
          <>
            {project.previewUrl && (
              <ActionButton onClick={() => window.open(project.previewUrl!, '_blank')} label="预览" />
            )}
            <ActionButton onClick={() => navigate(`/projects/${project.id}`)} label="打开" />
          </>
        )}
        {IN_PROGRESS.has(project.status) && (
          <ActionButton onClick={() => navigate(`/projects/${project.id}`)} label="查看进度" primary />
        )}
        {(project.status === 'idle' || project.status === 'waiting') && (
          <ActionButton onClick={() => navigate(`/projects/${project.id}`)} label="打开" />
        )}
        {project.status === 'failed' && (
          <>
            <ActionButton onClick={() => navigate(`/projects/${project.id}`)} label="重试" />
            <ActionButton onClick={() => onDelete(project.id)} label="删除" />
          </>
        )}
      </div>
    </div>
  )
}

function ActionButton({ onClick, label, primary }: { onClick: () => void; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: 'var(--bg-hover)',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: primary ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 11,
        padding: '6px 0',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
