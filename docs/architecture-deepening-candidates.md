# 架构深化候选方案

基于 `/improve-codebase-architecture` 分析，2026-05-19。

## 1. ArXiv/会议命令对偶 — 待处理

- **Files**: `commands/arxiv-summary.ts` ↔ `conference-summary.ts`, `arxiv-analysis.ts` ↔ `conference-analysis.ts`, `arxiv-paper.ts` ↔ `conference-paper.ts`
- **Problem**: 三对几乎相同的命令文件，约 200 行重复逻辑。差异很小（arXiv 用常量类别字符串，会议需要查数据库获取类别）。
- **Solution**: 通过一个模式对象（或 category resolver 函数）参数化，每对命令合并为一个。共享的 `createAbortControllerManager` 和核心调用模式已从 `paper-shared.ts` 提取。
- **Benefits**: 变更的 **locality** — 一次修复同时影响两种模式。测试只针对一个接口。添加第三个论文来源时不需要 N 文件复制粘贴。

## 2. IPC Handler 内联逻辑 — 已完成 (v0.8.6)

- 提取 `buildArxivExportItem` / `buildConferenceExportItem` 到 `zotero-client.ts`
- IPC 导出 handler 从 ~35 行缩减到 ~10 行
- `buildConferenceCategory` 统一类别字符串计算

## 3. 模式依赖的 Store 访问 — 不改

- 当前的 `isConference` 分支模式清晰直接，队列文件已经很小（78-104 行）
- PaperDetail.vue 的条件渲染是合理的 UI 差异
- 强行引入 composable 层增加间接性，风险 > 收益
- 除非新增第三种论文来源，否则不需要改

## 4. 类型重复：ipc-api.ts ↔ api/index.ts — 已完成 (v0.8.6)

- 将 `PaginatedResult`, `FetchDate`, `ZoteroCollection`, `ArxivFetchPapersResult`, `ArxivFetchPapersByDateResult`, `FetchPapersByIdsResult` 移到 `ipc-api.ts`
- `api/index.ts` 改为 import + re-export

## 5. 浅层模块：filter.ts — 已完成 (v0.8.6)

- `filter.ts` 合并到 `paper-shared.ts`（唯一调用者）
- 删除 `services/filter.ts` 和 `services/__tests__/filter.test.ts`
- 测试合并到 `commands/__tests__/paper-shared.test.ts`

## 6. Category 字符串散落 — 已完成 (v0.8.6)

- `ARXIV_CATEGORY` 常量移到 `paper-shared.ts`
- 新增 `buildConferenceCategory(shortName, year)` 函数
- `conference-summary.ts`, `conference-import.ts`, `ipc-handlers.ts` 统一使用
