# Blueberry

[![Version](https://img.shields.io/github/v/release/qinzheng93/Blueberry?color=blue&label=version)](https://github.com/qinzheng93/Blueberry/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/qinzheng93/Blueberry/releases)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-blue.svg)](https://www.electronjs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

一款桌面应用，用于抓取、过滤和分析 arXiv 论文及会议论文。支持 LLM 驱动的论文总结与深度分析，并可导出至 Zotero。

## 功能

### arXiv 模式

- 从 arXiv API 抓取论文，支持按日期范围、分类筛选
- 按自定义话题关键词自动匹配论文，支持增量更新
- LLM 生成论文总结（基于标题和摘要）
- LLM 深度分析论文（基于全文 PDF 提取）
- 批量总结/分析，队列管理，进度查看与取消

### 会议模式

- 内置会议论文数据库，支持导入外部 .db 文件
- 会议冲突检测与覆盖策略（保留/清除已有分析）
- 按 Track 和话题关键词筛选
- 同样支持 LLM 总结与深度分析

### 通用功能

- 多选论文批量操作
- 论文摘要 LaTeX 公式渲染
- 导出论文至 Zotero（支持选择集合）
- 浅色/暗色主题，跟随系统偏好
- PDF 下载与本地缓存
- BibTeX 复制
- 自定义数据目录

## 截图

<!-- TODO: 添加截图 -->

## 快速开始

### 1. 安装

从 [Releases](https://github.com/qinzheng93/Blueberry/releases) 下载对应平台的安装包。

- **macOS**: `.dmg`
- **Linux**: `.AppImage`
- **Windows**: portable 可执行文件

### 2. 配置 LLM

在设置页面填入 LLM 的 API Key、Base URL 和模型名称。支持所有 OpenAI 兼容 API。

### 3. arXiv 模式

- 点击侧边栏「获取论文」按日期或分类抓取
- 在「设置 → 话题管理」中添加研究方向及关键词，系统会自动匹配论文
- 选中论文后点击「论文总结」或「论文分析」

### 4. 会议模式

- 点击顶部切换至会议模式
- 点击「导入会议」选择外部 .db 文件导入会议数据（[数据库格式说明](docs/conference-db-format.md)）
- 选择会议后浏览论文列表
- 按 Track 或话题筛选感兴趣的论文

### 5. 导出 Zotero

- 在设置页面配置 Zotero API Key 和 User ID
- 论文详情页点击「导出到 Zotero」并选择目标集合

## 架构

### 设计原则

- **SSOT**: 每类数据存储在独立数据库中，避免冗余
- **原子写入**: 通过 write-to-temp + rename 模式防止数据损坏
- **双模式架构**: arXiv 模式和会议模式共享队列与 UI 框架，通过 mode 切换
- **文件分析存储**: 总结与分析结果存储为 Markdown 文件，不依赖数据库

### 数据库布局

| 数据库 | 表 | 说明 |
|---|---|---|
| `arxiv_papers.db` | papers, categories | arXiv 论文与分类 |
| `conference_papers.db` | conferences, papers | 会议论文（可导入） |
| `paper_topics.db` | topics, arxiv_paper_topics, conference_paper_topics | 话题与论文关联 |
| `settings.db` | app_config | 应用配置 |

### 关键组件

- **Database 层**: sql.js 内存数据库 + 原子写入持久化，按职责拆分为 4 个数据库
- **Commands 层**: 数据库操作封装（paper, config, fetch, summary, analysis, conference-*）
- **Services 层**: 外部服务封装（arXiv API, LLM 客户端, Zotero API, PDF 提取）
- **Processing Queue**: 通用异步队列（createProcessingQueue），管理总结/分析/下载任务
- **Topic 关联**: junction table 多对多关系，增删改时只做增量更新

## 开发

### 环境要求

- Node.js >= 18
- npm

### 常用命令

```bash
npm install            # 安装依赖
npm run build          # 构建前端和主进程
npx electron .         # 启动应用（需先 build）
npm run test           # 运行测试（含覆盖率）
npm run package        # 构建并打包为安装程序
```

> 每次修改代码后需要重新 `npm run build` 再启动。

### 项目结构

```
src/
├── main/                          # Electron 主进程
│   ├── index.ts                   # 应用入口、窗口创建、数据库初始化与迁移
│   ├── preload.ts                 # preload 脚本（IPC 桥接）
│   ├── ipc-handlers.ts            # IPC handler 注册
│   ├── database/
│   │   ├── connection.ts          # arxiv_papers.db
│   │   ├── paper-topics.ts        # paper_topics.db（话题与论文关联）
│   │   ├── settings.ts            # settings.db（应用配置）
│   │   └── migrations/            # SQL 迁移脚本
│   ├── commands/                  # 数据库操作层
│   │   ├── paper.ts               # arXiv 论文查询
│   │   ├── paper-shared.ts        # 论文查询共用逻辑
│   │   ├── summary.ts / analysis.ts  # 总结与分析
│   │   ├── fetch.ts               # arXiv 抓取
│   │   ├── config.ts              # 配置 CRUD
│   │   ├── conference-import.ts   # 会议导入
│   │   ├── conference-*.ts        # 会议论文相关
│   │   └── rebuild-*-topics.ts    # 话题关联重建
│   └── services/                  # 外部服务封装
│       ├── arxiv-api.ts           # arXiv API
│       ├── llm-client.ts          # LLM 客户端
│       ├── zotero-client.ts       # Zotero API
│       ├── analysis-files.ts      # 分析文件读写
│       └── pdf-extractor.ts       # PDF 文本提取
└── renderer/                      # Vue 前端
    ├── stores/                    # Pinia 状态管理
    ├── components/
    │   ├── paper/                 # 论文卡片、列表、详情
    │   ├── conference/            # 会议论文、导入弹窗
    │   ├── config/                # 设置页面组件
    │   └── layout/                # 布局（侧边栏、顶栏）
    ├── views/                     # 页面（首页、设置）
    └── assets/theme.css           # 主题变量
```

### 技术栈

**框架**: Electron + Vue 3 + TypeScript

**构建**: Vite + electron-builder

**状态管理**: Pinia

**数据库**: sql.js（SQLite WASM，内存模式 + 原子写入持久化）

**渲染**: KaTeX（数学公式）| marked + DOMPurify（Markdown）| lucide-vue-next（图标）

**测试**: Vitest + @vitest/coverage-v8

## 许可

MIT
