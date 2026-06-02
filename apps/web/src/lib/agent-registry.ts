export type AgentTool = 'read_file' | 'write_file' | 'str_replace' | 'tsc_check' | 'spawn_task'

export const ALL_TOOLS: AgentTool[] = [
  'read_file', 'write_file', 'str_replace', 'tsc_check', 'spawn_task',
]

export interface SystemAgentDef {
  role: string
  label: string
  tier: 1 | 2 | 3
  color: string
  tools: AgentTool[]
  writePaths: string[]
  instructionsFile: string
}

export const SYSTEM_AGENTS: SystemAgentDef[] = [
  { role: 'pm',        label: 'PM',        tier: 1, color: '#6366f1', tools: [],        writePaths: [],                                   instructionsFile: 'pm' },
  { role: 'architect', label: 'Architect', tier: 1, color: '#10b981', tools: [],        writePaths: [],                                   instructionsFile: 'architect' },
  { role: 'logic',     label: 'Logic',     tier: 2, color: '#3b82f6', tools: ALL_TOOLS, writePaths: ['packages/core/', 'server/domain/'], instructionsFile: 'logic' },
  { role: 'schema',    label: 'Schema',    tier: 2, color: '#f59e0b', tools: ALL_TOOLS, writePaths: ['prisma/'],                          instructionsFile: 'schema' },
  { role: 'api',       label: 'API',       tier: 2, color: '#06b6d4', tools: ALL_TOOLS, writePaths: ['app/api/', 'server/infra/'],         instructionsFile: 'api' },
  { role: 'ui',        label: 'UI',        tier: 2, color: '#ec4899', tools: ALL_TOOLS, writePaths: ['packages/ui/'],                     instructionsFile: 'ui' },
  { role: 'page',      label: 'Page',      tier: 2, color: '#8b5cf6', tools: ALL_TOOLS, writePaths: ['app/'],                             instructionsFile: 'page' },
  { role: 'test',      label: 'Test',      tier: 3, color: '#ef4444', tools: [],        writePaths: [],                                   instructionsFile: 'test' },
]
