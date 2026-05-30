---
name: forge-frontend
description: Forge 项目前端 UI 开发规范。覆盖设计语言、组件模式、布局约定、动画规则和架构约束。在任何前端改动（新组件、新页面、样式调整）前必须读此文件。
---

# Forge 前端规范

## 设计语言

**主题**：Industrial Dark — 深色优先，毛玻璃分层，橙色主色调。

**背景色阶**（从底层到表面）：
```
#0d0f14  ← body 最底层背景（带橙/紫/绿光晕渐变）
bg-background  ← CSS variable, 约等于 hsl(225 15% 6%)
bg-card        ← 卡片底色
bg-white/[0.025~0.06]  ← 毛玻璃浮层
```

**主色**：`primary` = 橙色 `#f97316`，可动态通过 `--primary` CSS variable 切换。

**禁止行为**：
- ❌ 不用硬编码颜色 `#f97316`，用 `text-primary`、`bg-primary` 等 Tailwind token
- ❌ 不用 `bg-gray-*`、`text-gray-*`，用 `bg-white/[opacity]` 和 `text-white/[opacity]`
- ❌ 不引入新的 CSS 框架或 CSS-in-JS

---

## 毛玻璃（Glass Morphism）规则

毛玻璃是本项目的核心视觉语言，所有面板、卡片、sidebar 都使用此模式。

### 三个层级

| 用途 | background | backdropFilter | border |
|------|-----------|----------------|--------|
| 全局 sidebar / 轻量面板 | `rgba(255,255,255,0.02~0.03)` | `blur(24px)` | `border-white/[0.05~0.06]` |
| 内容列 / 次级面板 | `rgba(255,255,255,0.03~0.045)` | `blur(24px) saturate(160%)` | `border-white/[0.06~0.08]` |
| 卡片 / 强调块 | `rgba(255,255,255,0.045)` | `blur(24px) saturate(180%)` | `border-white/[0.08]` + 顶部高光 |

### GlassCard 组件（SettingsPage 已提取，可复用）
```tsx
function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] p-6',
        'shadow-[0_4px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]',
        className,
      )}
      style={{
        background: 'rgba(255,255,255,0.045)',
        backdropFilter: 'blur(24px) saturate(180%)',
      }}
    >
      {children}
    </div>
  )
}
```

**注意**：`backdropFilter` 必须用 inline style，不能用 Tailwind `backdrop-blur-*`（Tailwind v4 的 backdrop-filter 在某些情况下有 z-index 问题）。

---

## 布局规范

### AppShell（全局结构）

```
┌──────┬──────────────────────────────────┐
│ 52px │                                  │
│ nav  │   <Outlet />  (页面内容)          │
│      │                                  │
└──────┴──────────────────────────────────┘
```

- 所有 protected 路由都嵌套在 `AppShell` 内
- sidebar 宽度固定 `w-[52px]`，不可伸缩
- 页面内容区 `flex flex-1 flex-col overflow-hidden`
- **不要** 在页面组件里自己写外层 `h-screen` 或全局 layout，由 AppShell 控制

### 页面高度铺满
```tsx
// ✅ 正确：依赖 AppShell 的 flex 撑满
<div className="flex flex-1 flex-col overflow-hidden">
  <header className="flex-shrink-0 ...">...</header>
  <main className="flex flex-1 overflow-y-auto ...">...</main>
</div>

// ❌ 错误：自己写 h-screen
<div className="flex h-screen ...">
```

### 看板布局（ProjectsPage）
```
board: flex gap overflow-x-auto overflow-y-hidden px-7 py-5
  column: flex w-[236px] flex-shrink-0 flex-col gap-2
    header: flex items-center gap-1.5 px-0.5 (flex-shrink-0)
    lane: col-lane-inner flex flex-1 flex-col gap-2 overflow-y-auto
          rounded-[14px] border-[1.5px] border-dashed p-2.5
```

列容器 **必须用** `overflow-y-auto`（不是 `overflow-hidden`），否则卡片多时无法滚动。

### Settings 三列布局
```
┌──────┬───────────┬───────────────────────┐
│ 52px │  210px    │       flex-1          │
│AppShell│ SettingsNav│  content (overflow-y-auto) │
└──────┴───────────┴───────────────────────┘
```

---

## 颜色与透明度速查

### 文字透明度阶梯
```
text-white/88   ← 页面标题（最强）
text-white/80   ← 卡片正文
text-white/65   ← hover 状态文字
text-white/50   ← 次要按钮文字
text-white/38   ← 分组标签（UPPERCASE）
text-white/30   ← 副标题、描述
text-white/25   ← 占位文字
text-white/22   ← 日期等最弱信息
text-white/16   ← 空状态提示（italic）
```

### 背景透明度阶梯
```
bg-white/[0.065]  ← 卡片 hover 状态
bg-white/[0.045]  ← 卡片默认
bg-white/[0.06]   ← 次要按钮、计数 badge
bg-white/[0.03]   ← 面板背景
bg-white/[0.025]  ← sidebar 背景
bg-white/[0.02]   ← 最淡浮层
```

### 边框透明度
```
border-white/[0.15]  ← 卡片 hover
border-white/[0.08]  ← 卡片默认 / GlassCard
border-white/[0.06]  ← 面板边框
border-white/[0.05]  ← 页面分割线
border-white/[0.06]  ← sidebar 分割线（h-px）
```

---

## 组件模式

### 图标
- 全部使用 `apps/web/src/components/ui/icons.tsx` 里的 SVG 组件
- **禁止** emoji，**禁止** 引入 lucide-react 等外部图标库（已在 icons.tsx 手写）
- 尺寸约定：`h-[17px] w-[17px]`（sidebar）、`h-3.5 w-3.5`（内容区小图标）、`h-4 w-4`（操作按钮）
- 需要新图标时：在 `icons.tsx` 添加 SVG function，加入 `Icons` export

### 按钮层级
```tsx
// 主操作按钮（唯一一个 primary）
className="rounded-lg bg-gradient-to-br from-primary to-[#ea6d0e] px-4 py-1.5
           text-[12.5px] font-semibold text-primary-foreground
           shadow-[0_2px_10px_rgba(249,115,22,0.28)] transition-opacity hover:opacity-90"

// 次要按钮（ghost）
className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2
           text-[13px] text-white/50 transition-colors hover:text-white/75"

// 卡片内行为按钮
className="flex-1 rounded-md bg-white/[0.06] py-1 text-[11px] text-white/50
           transition-colors hover:bg-white/[0.1] hover:text-white/75"

// 危险操作按钮
className="rounded-md bg-destructive/[0.1] py-1 text-[11px] text-red-400
           transition-colors hover:bg-destructive/[0.2]"
```

### Hover 显隐元素（如卡片删除按钮）
```tsx
// 父容器加 group
<div className="group relative ...">
  {/* hover 才显示的元素 */}
  <button className="opacity-0 transition-opacity group-hover:opacity-100 ...">
    <Icons.X className="h-3 w-3" />
  </button>
</div>
```

### 输入框
```tsx
className="w-full rounded-lg border border-white/[0.08] bg-black/25
           px-3 py-2 font-mono text-[13px] text-white/65
           outline-none focus:border-primary/50"
```

### 分割线
```tsx
// 水平分割线
<div className="h-px bg-white/[0.05]" />         // 页面级（较强）
<div className="h-px w-7 bg-white/[0.06]" />     // sidebar 内（短）
```

---

## Sidebar 导航约定

### active 状态
```tsx
// 左侧橙色指示条 + 背景高亮
isActive ? 'bg-primary/[0.13] text-primary' : 'text-white/30 hover:bg-white/[0.06] hover:text-white/65'

// 指示条（绝对定位）
<span className="absolute -left-px top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-sm bg-primary" />
```

### 返回按钮规则
- 在 `/projects/:id`（WorkspacePage）路径下，sidebar 顶部显示 `←` 返回按钮
- 其他路由顶部显示项目列表图标
- 通过 `useLocation` + 正则 `/^\/projects\/.+/.test(pathname)` 判断

---

## 动画规范

所有卡片流转动画定义在 `global.css`，通过 CSS class 触发。

| Class | 用途 | 时长 |
|-------|------|------|
| `anim-fall-out` | 卡片从源列底部掉出 | 0.42s |
| `anim-slide-in` | 卡片从目标列顶部滑入 | 0.40s |
| `anim-nudge-down` | 目标列现有卡片被推下 | 0.38s |
| `anim-collapse-up` | 源列卡片离开后其他卡片收缩 | 0.30s |

**触发时机**：在 React `useEffect` 里监听 `project.status` 变化，用 DOM classList 操作触发。

**注意**：动画期间源列的 `overflow` 是 `overflow-y-auto`，下落动画会被裁剪在列容器边界内（这是预期效果）。

---

## 主题色切换

用户可以在设置页切换主题色。实现：
1. `settings-store.ts` 中调用 `applyThemeColor(hex)` 修改 `--primary`、`--accent`、`--ring` CSS variables
2. `main.tsx` 启动时从 `localStorage` 读取并提前应用（防止 FOUC）
3. 四个预设色：`#f97316`（橙）、`#3b82f6`（蓝）、`#10b981`（绿）、`#8b5cf6`（紫）

---

## 状态 badge 颜色映射（项目看板）

```tsx
colKey === 'draft'  → 'bg-white/[0.06] text-white/38'
colKey === 'active' → 'bg-primary/[0.14] text-[#fb923c]'
colKey === 'done'   → 'bg-emerald-500/[0.13] text-emerald-400'
colKey === 'failed' → 'bg-destructive/[0.13] text-red-400'
```

列容器虚线边框颜色：
```tsx
draft  → 'border-white/[0.09]'
active → 'border-primary/[0.22] bg-primary/[0.015]'
done   → 'border-emerald-500/[0.20] bg-emerald-500/[0.01]'
failed → 'border-destructive/[0.18] bg-destructive/[0.01]'
```

---

## 字体

```
正文：'Outfit', system-ui（--font-sans）
代码/输入框：'JetBrains Mono', ui-monospace（--font-mono）
```

字号不用 Tailwind 预设（`text-sm` 等），用精确像素值：
```
text-[10px]   ← badge 内文字
text-[10.5px] ← 日期、tooltip
text-[11px]   ← 分组标签（UPPERCASE）
text-[11.5px] ← 提示文字、副标题
text-[12.5px] ← 卡片标题
text-[13px]   ← 表单输入、按钮
text-[15px]   ← 二级页面标题
text-[17px]   ← 页面主标题
text-[20px]   ← 大标题（较少使用）
```

---

## 架构约束（简版，完整见 AGENTS.md）

```
pages/         ← 只组装，不写业务逻辑，不直接 fetch，不定义 store
components/    ← 纯 UI，不 import @forge/core
@forge/core    ← 所有 hooks、store、API 调用
```

页面文件超过 **150 行** 时，提取子组件到 `components/` 或逻辑到 `@forge/core`。

---

## 新增页面 Checklist

- [ ] 路由添加在 `routes.tsx` 的 `AppShell` 嵌套下（protected 路由）
- [ ] 外层结构用 `flex flex-1 flex-col overflow-hidden`，不写 `h-screen`
- [ ] 页头（header）用 `flex-shrink-0`，内容区用 `flex flex-1 overflow-y-auto`
- [ ] 无 emoji，图标全部用 `Icons.*`
- [ ] 背景色、文字色用白色透明度阶梯，不用灰色系

## 新增组件 Checklist

- [ ] 浮层/面板：用毛玻璃三层级之一，`backdropFilter` 写 inline style
- [ ] hover 交互：`transition-colors` 搭配对应的 hover 类
- [ ] 删除/危险操作：用 `group` + `group-hover:opacity-100` 模式隐藏，避免视觉干扰
- [ ] 图标尺寸：匹配使用场景，sidebar=`h-[17px]`，内容区=`h-3.5`，操作按钮=`h-4`
