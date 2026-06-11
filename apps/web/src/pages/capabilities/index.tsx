import { useCapabilities } from '@forge/core'
import { Icons } from '../../components/ui/icons'

type BuiltInCap = {
  type: string
  name: string
  desc: string
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement
}

const BUILT_IN: BuiltInCap[] = [
  { type: 'browser', name: '浏览器操作', desc: '自动打开网页、填写表单、点击按钮', icon: Icons.Monitor },
  { type: 'http',    name: 'HTTP 调用',  desc: '调用任意 REST API 接口',          icon: Icons.Plug },
  { type: 'llm',     name: 'AI 分析',    desc: '文本提取、分析、生成',             icon: Icons.Bot },
  { type: 'notify',  name: '发送通知',   desc: 'Webhook / 邮件 / 钉钉通知',       icon: Icons.Bell },
  { type: 'file',    name: '文件处理',   desc: '读取 Excel、PDF、CSV',            icon: Icons.Database },
  { type: 'code',    name: '代码生成',   desc: '生成完整的 Web 应用',             icon: Icons.Blocks },
]

export function CapabilitiesPage() {
  const { data: capabilities, isLoading } = useCapabilities()

  return (
    <div className="flex flex-1 overflow-hidden"><div className="flex flex-1 flex-col gap-6 p-8 overflow-y-auto">
      <div>
        <h1 className="text-xl font-semibold">能力</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agent 可以调用的工具和集成
        </p>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">内置能力</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT_IN.map(cap => (
            <div key={cap.type} className="flex gap-3 rounded-xl border border-border/40 bg-card/60 p-4">
              <cap.icon className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{cap.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{cap.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isLoading
        ? <p className="text-sm text-muted-foreground">加载中...</p>
        : (capabilities && capabilities.length > 0) && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">自定义能力</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map(cap => (
                <div key={cap.id} className="flex gap-3 rounded-xl border border-border/40 bg-card/60 p-4">
                  <Icons.Zap className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{cap.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{cap.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }
    </div>
    </div>
  )
}