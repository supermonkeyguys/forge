# Frontend Migration: shadcn/ui + Tailwind CSS

**Date:** 2026-05-25  
**Scope:** `apps/web/` 全量迁移，11 个文件  
**Decision:** shadcn/ui + Tailwind v4，完全替换内联 style，采用 shadcn 标准暗色主题

---

## 目标

将 `apps/web/` 所有内联 `style={{}}` 替换为 Tailwind CSS class，引入 shadcn/ui 组件库替换手写的 button/input/card 等 UI 原语。视觉风格切换到 shadcn 标准暗色主题，废弃 `global.css` 现有 CSS 变量 token。

## 不在范围内

- `packages/ui/` — 现有组件未被前端使用，本次不动
- `apps/agent/`、`apps/api/` — 后端，不涉及
- 业务逻辑、store、hooks、路由 — 零改动

---

## 技术选型

| 技术 | 版本 | 说明 |
|------|------|------|
| Tailwind CSS | v4 | CSS-first 配置，无 `tailwind.config.js`，通过 `@import "tailwindcss"` 引入 |
| shadcn/ui | latest | 组件源码复制到项目，`components.json` 管理 |
| Radix UI | (shadcn 底层) | 无障碍 + 键盘导航保障 |
| clsx + tailwind-merge | latest | `cn()` 工具函数，条件类名合并 |

---

## 引入的 shadcn 组件

| 组件 | 使用位置 |
|------|---------|
| `Button` | LoginPage, ProjectsPage, RequirementInput, PMReview, ConversationHistory, PreviewPanel, ProjectCard |
| `Input` | LoginPage, ConversationHistory |
| `Textarea` | RequirementInput, PMReview |
| `Card / CardHeader / CardContent` | ProjectCard, AgentCard (AgentFlowPanel), LoginPage 表单容器 |
| `Badge` | ProjectCard 状态标签, PMReview ConstraintBadge, AgentFlowPanel 状态 tag |
| `Checkbox` | PMReview FeatureRow (替换手写 checkbox div) |
| `ScrollArea` | ConversationHistory 事件列表, AgentFlowPanel 日志抽屉 |
| `Separator` | 面板边界分隔线 |
| `cn()` (lib/utils.ts) | 所有组件 |

---

## 迁移架构

### 阶段 1：基础设施

1. 安装 `tailwindcss@4`、`@tailwindcss/vite` 插件
2. 修改 `vite.config.ts` 加入 Tailwind v4 插件
3. 初始化 shadcn：`npx shadcn@latest init`，选择 dark 主题
4. 重写 `global.css`：删除旧 CSS 变量，只保留 Tailwind 入口 + shadcn 主题 CSS 变量
5. 创建 `src/lib/utils.ts`（cn 工具函数）
6. `npx shadcn@latest add button input textarea card badge checkbox scroll-area separator`

### 阶段 2：页面层（3 个文件）

按顺序迁移，每个文件完成后可独立验证：

1. **`LoginPage.tsx`** — 最简单，一个表单卡片。`Input` × 2、`Button` × 2，Card 容器
2. **`ProjectsPage.tsx`** — 列表页，新建按钮用 `Button`，grid 布局换 Tailwind class
3. **`WorkspacePage.tsx`** — 三栏布局，grid 写法换 Tailwind，`<style>` 标签内的 keyframes 删除（用 Tailwind animate-*）

### 阶段 3：组件层（8 个文件）

按依赖顺序（叶子节点先）：

1. **`project-page-states.tsx`** — PageShell / EmptyState / LoadingState / ErrorState，纯布局
2. **`project-card/project-card.tsx`** — `Card` + `Badge` + `Button`，状态颜色用 Tailwind variant
3. **`left-panel/ConversationHistory.tsx`** — `ScrollArea` + `Input` + `Button`
4. **`left-panel/RequirementInput.tsx`** — `Textarea` + `Button`，移除 onFocus/onBlur 内联样式
5. **`left-panel/PMReview.tsx`** — `Checkbox` + `Button` + `Badge`，FeatureRow 手写 checkbox → shadcn Checkbox
6. **`left-panel/ConversationPanel.tsx`** — 容器布局，换 Tailwind flex class
7. **`center-panel/AgentFlowPanel.tsx`** — `Card` + `Badge` + `ScrollArea`，progress dots 保留 div（无 shadcn 对应组件）
8. **`right-panel/PreviewPanel.tsx`** — 工具栏 `Button`，布局换 Tailwind

---

## 关键迁移规则

### CSS 动画
```
animation: 'pulse 1.2s ease infinite'  →  className="animate-pulse"
animation: 'spin 0.7s linear infinite'  →  className="animate-spin"
```
WorkspacePage 内的 `<style>` keyframes 块完全删除。

### focus 状态
```
onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}  →  删除
// 改用 Tailwind: className="focus-visible:ring-2 focus-visible:ring-ring"
```
shadcn Input/Textarea 组件内置 focus ring，不需要手动处理。

### 状态颜色（Badge/ProjectCard）
现有硬编码颜色值（`var(--green)20`、`${color}40`）→ shadcn Badge variant：
- `done` → `variant="outline"` + `className="border-green-500 text-green-400"`
- `failed` → `variant="destructive"`
- `building/analyzing` 等 → `variant="secondary"`
- `waiting` → `variant="outline"` + `className="border-yellow-500 text-yellow-400"`

### Button variant 映射
| 现有写法 | shadcn variant |
|---------|---------------|
| 实心 accent 背景 | `default` |
| 透明 + border | `outline` |
| 虚线 border (dev login) | `outline` + `className="border-dashed"` |
| 悬停背景 bg-hover | `ghost` |
| 禁用状态 opacity 0.5 | shadcn Button 内置 `disabled:opacity-50` |

---

## global.css 迁移前后

**迁移前（现有）：**
```css
:root {
  --bg: #0f0f0f;
  --accent: #5b6ef5;
  /* ... 15 个自定义 token */
}
```

**迁移后：**
```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  /* shadcn 标准暗色主题 CSS 变量（由 shadcn init 生成） */
  --background: oklch(...);
  --foreground: oklch(...);
  --primary: oklch(...);
  /* ... shadcn 变量 */
}
```

---

## 文件清单

迁移后**修改**的文件（共 12 个）：

```
apps/web/
  package.json                          ← 添加 tailwindcss, @tailwindcss/vite
  vite.config.ts                        ← 添加 tailwindcss() 插件
  src/styles/global.css                 ← 替换为 shadcn 主题
  src/lib/utils.ts                      ← 新建，cn() 工具函数
  src/components/ui/                    ← shadcn add 生成的组件源码
  src/pages/LoginPage.tsx
  src/pages/ProjectsPage.tsx
  src/pages/WorkspacePage.tsx
  src/components/left-panel/ConversationPanel.tsx
  src/components/left-panel/RequirementInput.tsx
  src/components/left-panel/PMReview.tsx
  src/components/left-panel/ConversationHistory.tsx
  src/components/center-panel/AgentFlowPanel.tsx
  src/components/right-panel/PreviewPanel.tsx
  src/components/project-card/project-card.tsx
  src/components/project-card/project-page-states.tsx
```

**不改动的文件：**
- `src/routes.tsx`、`src/main.tsx`
- `src/store/`、`src/hooks/`
- `packages/core/`、`packages/ui/`

---

## 成功标准

- `pnpm run build` 无报错
- `pnpm run typecheck` 无报错
- 所有页面视觉正常，暗色主题一致
- 无残留内联 `style={{}}` 属性（除动态值：如 `iframeKey` 不涉及样式）
- e2e layer1 测试全部通过
