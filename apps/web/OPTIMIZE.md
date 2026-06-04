# 首屏性能优化任务

## 目标
将首屏 JS 体积（最大 chunk，gzip 前）降低 30% 以上。

## 允许修改的文件
- `apps/web/src/routes.tsx` — 路由懒加载
- `apps/web/vite.config.ts` — 分包策略（manualChunks）

## 禁止修改
- `apps/web/src/pages/` 内的任何实现文件
- `apps/web/src/store/`
- `apps/web/src/hooks/`
- `packages/` 下任何文件
- 任何 `*.test.*` / `*.spec.*` 文件

## 成功标准（必须全部满足）
1. `npm run build` 在 `apps/web` 目录无报错无 TS 错误
2. `npm run test` 通过
3. `dist/assets/` 中无单个 JS chunk 超过 300KB（gzip 前）

## 工作流程
1. 运行 `./scripts/check-bundle.sh` 记录基线数据
2. 每次只改一处，改完立即重新运行验证脚本
3. 如果 build 失败或 chunk 变大，立即回滚该改动
4. 完成后输出改动摘要：文件、改前/改后 chunk 大小
