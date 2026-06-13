import { Icons } from '@/components/ui/icons'
import type { StepDef, AgentMeta } from './types'

export const DEFAULT_STEPS: StepDef[] = [
  { id: 'pm',        name: 'PM Agent',       subtitle: '需求分析与放大' },
  { id: 'architect', name: 'Architect',      subtitle: '技术架构规划' },
  { id: 'schema',    name: 'Schema Agent',   subtitle: '数据库 Schema' },
  { id: 'logic',     name: 'Logic Agent',    subtitle: '业务逻辑 + 单测' },
  { id: 'api',       name: 'API Agent',      subtitle: 'HTTP 接口层' },
  { id: 'ui',        name: 'UI Agent',       subtitle: 'UI 组件 + Stories' },
  { id: 'page',      name: 'Page Agent',     subtitle: '页面组装' },
  { id: 'test',      name: 'Test Agent',     subtitle: '验证 + E2E 检查' },
]

export const AGENT_META: Record<string, AgentMeta> = {
  pm:         { label: 'PM Agent',        icon: Icons.Clipboard,   description: '需求分析与放大' },
  architect:  { label: 'Architect',       icon: Icons.Blocks,      description: '技术架构规划' },
  schema:     { label: 'Schema Agent',    icon: Icons.Database,    description: '数据库 Schema' },
  logic:      { label: 'Logic Agent',     icon: Icons.Cog,         description: '业务逻辑 + 单测' },
  api:        { label: 'API Agent',       icon: Icons.Plug,        description: 'HTTP 接口层' },
  ui:         { label: 'UI Agent',        icon: Icons.Palette,     description: 'UI 组件 + Stories' },
  page:       { label: 'Page Agent',      icon: Icons.Layout,      description: '页面组装' },
  test:       { label: 'Test Agent',      icon: Icons.CheckCircle, description: '验证 + E2E 检查' },
}

export const STATE_CONFIG: Record<string, { label: string; color: string; dotClass: string }> = {
  analyzing:  { label: '分析需求', color: 'text-primary', dotClass: 'bg-primary animate-pulse' },
  planning:   { label: '规划架构', color: 'text-primary', dotClass: 'bg-primary animate-pulse' },
  building:   { label: '生成代码', color: 'text-primary', dotClass: 'bg-primary animate-pulse' },
  validating: { label: '验证功能', color: 'text-yellow-400', dotClass: 'bg-yellow-400 animate-pulse' },
  fixing:     { label: '修复问题', color: 'text-yellow-400', dotClass: 'bg-yellow-400 animate-pulse' },
  waiting:    { label: '等待介入', color: 'text-yellow-400', dotClass: 'bg-yellow-400' },
  done:       { label: '锻造完成', color: 'text-green-400', dotClass: 'bg-green-400' },
}
