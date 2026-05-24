# Frontend Pages Design

**Date:** 2026-05-24  
**Scope:** 补完缺失页面（LoginPage + ProjectsPage + 路由）

---

## 1. 目标

当前 `apps/web` 直接渲染 `WorkspacePage`，没有路由、没有登录页、没有项目列表页。本次交付：

- `routes.tsx` — 路由定义 + 路由守卫
- `LoginPage` — skip 模式（开发阶段绕过 auth）
- `ProjectsPage` — 项目列表 + 空状态 + 新建入口
- `main.tsx` 改造为挂载 Router

**不在范围内：** WorkspacePage 视觉打磨、动效、error boundary。

---

## 2. 路由结构

```
/                     → redirect to /projects
/login                → LoginPage
/projects             → ProjectsPage  （需要 token，否则跳 /login）
/projects/:id         → WorkspacePage （需要 token，否则跳 /login）
```

**路由守卫实现：**  
`ProtectedRoute` 组件检查 `useAuthStore` 的 `token`。  
skip 登录时写入 mock token `"dev-token"` + mock user，绕过守卫。

---

## 3. 文件清单

### 新建文件

| 文件 | 职责 |
|------|------|
| `apps/web/src/routes.tsx` | 路由定义，`ProtectedRoute` 守卫 |
| `apps/web/src/pages/LoginPage.tsx` | 登录页，skip 按钮 |
| `apps/web/src/pages/ProjectsPage.tsx` | 项目列表页 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `apps/web/src/main.tsx` | 包裹 `<BrowserRouter>`，渲染 `<Routes>` |
| `apps/web/src/pages/WorkspacePage.tsx` | 从路由参数读取 `projectId`（`useParams`），不再从 store 初始化 |

---

## 4. 各页面设计

### 4.1 LoginPage

- 布局：全屏居中，宽 320px 卡片
- 内容：品牌名、两个 disabled 输入框（邮箱/密码）、一个「跳过登录（开发模式）」按钮
- 行为：点击 skip → `useAuthStore.setToken("dev-token", mockUser)` → navigate to `/projects`
- 文件：`apps/web/src/pages/LoginPage.tsx`，< 60 行

### 4.2 ProjectsPage

**有项目时（卡片列表）：**
- 顶部：标题「我的项目」+ 项目数量 + 「+ 新建项目」按钮
- 卡片网格：`grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`
- 每张卡片展示：
  - 项目名称
  - 状态 badge（完成绿/生成中蓝/失败红/其他灰）
  - 创建时间
  - 操作按钮（按状态变化，见下表）

| 状态 | 按钮 |
|------|------|
| `done` | 预览（open previewUrl）+ 打开（navigate to `/projects/:id`） |
| `building` / `analyzing` / `planning` / `validating` / `fixing` | 查看进度（navigate to `/projects/:id`） |
| `failed` | 重试 + 删除 |
| `idle` / `waiting` | 打开 |

**空状态：**
- 居中图标 + 标题「还没有项目」+ 副标题 + 「创建第一个项目」按钮

**数据来源：**  
`useProjects()` hook（已在 `packages/core` 实现），带 loading / error 状态处理。

**新建项目：**  
点击「新建项目」按钮 → navigate to `/projects/new`，WorkspacePage 初始为 `input` phase（projectId 为 null）。  
实际上 `/projects/new` 就是 WorkspacePage 的一个变体，projectId 从 `useParams` 读；当 `id === 'new'` 时，phase 初始为 `input`。

### 4.3 routes.tsx

```tsx
// 结构示意（不是最终代码）
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Navigate to="/projects" />} />
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<WorkspacePage />} />
    </Route>
  </Routes>
</BrowserRouter>
```

---

## 5. 约束

- `LoginPage` 和 `ProjectsPage` 页面文件均 ≤ 100 行（超过提取到 components/）
- 不在页面内直接 fetch，通过 `@forge/core` hooks
- 不新增 npm 依赖（`react-router-dom` 已在 `package.json`）

---

## 6. 成功标准

1. 访问 `http://localhost:5173` → 重定向到 `/projects`
2. 无 token → 跳转到 `/login`，点击 skip → 进入 `/projects`
3. `/projects` 展示项目列表（mock 数据），点击项目 → 进入 `/projects/:id`
4. 空状态时展示引导页，点击「创建第一个项目」→ 进入 `/projects/new`
5. `tsc --noEmit` 无报错
