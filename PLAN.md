# AI Novel Studio - 总体规划与分层实施计划

## 1. 文档目的

这份文档同时承担 3 个角色：

1. **长期路线图**：保留产品完整形态与中长期演进方向。
2. **MVP 范围定义**：明确首个可发布版本到底做到哪里。
3. **当前执行清单**：把大计划拆成可以逐步落地的小计划，避免一开始就陷入大集成。

原则是：**长远规划不丢，当前实施收敛。**

---

## 2. 当前状态判断

### 2.1 已完成

- `原型/ai-novel-studio/` 已完成高保真原型：
  - 项目列表
  - 三栏工作台
  - 灵感发散区
  - 智能编辑器
  - 设定库
  - 伏笔追踪
  - AI 监控面板
  - Toast / 暗色主题 / 基础交互

### 2.2 未完成

- 原型中的数据仍然是硬编码 mock。
- 正式前端已完成 `M0-M2` 与 `M3` 的大部分基础层，最小 AI 续写闭环已验证可用。
- `server/` 已切到用户提供的 OpenAI 兼容地址 `http://localhost:8317/v1`，并可返回真实流式输出。
- 当前最关键的剩余工作是：继续打磨 MVP 发布体验，并在适当时机处理前端拆包与更完整的发布文档。

### 2.3 结论

项目目前处于：

> **“正式前端与最小后端骨架已建立，本地数据流已跑通，AI 联调尚未开始”**

因此接下来的开发顺序必须是：

> **先数据地基，再迁移界面，再接 AI，最后补高级能力。**

---

## 3. 不变决策

以下决策在本计划中视为默认前提，不再反复摇摆。

### 3.1 项目结构

```text
novel-ai/
  原型/ai-novel-studio/        # 原型参考，不作为正式工程
  app/                         # 正式前端
    src/
      components/
      hooks/
      lib/
      stores/
      types/
  server/                      # 正式后端（后续新增）
    src/
      routes/
      services/
      db/
```

### 3.2 技术主线

- 前端：`Vite + React + TypeScript`
- 本地存储：`IndexedDB (Dexie)`
- 状态管理：`Zustand`
- 编辑器：`TipTap`
- 后端：`Node.js + Fastify`
- AI 优先接入：`OpenAI`
- 长记忆检索：`pgvector + PostgreSQL`

### 3.3 架构原则

1. **前端本地优先**：项目、章节、设定等核心数据默认存在前端 IndexedDB。
2. **后端无状态**：后端只负责 AI 代理与向量检索，不持有项目主数据。
3. **组件不直接持久化**：组件只与 Store 交互，Store 再落数据库。
4. **先单一真相，再做派生能力**：先把数据结构、保存策略、导出路径定稳，再加 RAG、伏笔、图谱等增强功能。

### 3.4 数据真相约定

1. 实体 ID 统一为**字符串 ID**，避免后续导入导出、复制项目、同步时受限。
2. 章节正文以 **TipTap JSON** 作为唯一正式存储格式。
3. Markdown 仅作为导出格式，不作为运行时主数据。
4. 章节检索、embedding、字数统计所需纯文本，由正文内容派生。
5. 设定实体使用统一基类 `LoreEntity`，按分类扩展字段。

---

## 4. 分层规划模型

为了兼顾长期与当前执行，整体计划分为 4 层：

| 层级 | 名称 | 作用 |
|---|---|---|
| L0 | 北极星目标 | 定义产品最终要成为什么 |
| L1 | 完整路线图 | 保留全量能力的阶段规划 |
| L2 | MVP 版本范围 | 明确首个可发布版本边界 |
| L3 | 当前实施清单 | 将 MVP 拆成逐步可交付的小里程碑 |

---

## 5. L0：北极星目标

AI Novel Studio 的长期目标不是“一个带 AI 的编辑器”，而是：

> **一个面向长篇小说创作的 AI 原生工作台。**

它需要同时解决 5 个核心问题：

1. **写作连续性**：多章节、多卷、多项目管理。
2. **世界观一致性**：角色、势力、规则、物品、事件有结构化管理。
3. **AI 可控性**：作者知道 AI 看到了什么、为何这样续写。
4. **长文记忆能力**：AI 不只记近期上下文，还能检索历史章节。
5. **剧情工程化**：伏笔、快照、灵感、冲突检测都能成为工作流的一部分。

---

## 6. L1：完整路线图

## Phase 0：原型验证（已完成）

### 目标

验证产品结构、页面布局、核心交互与视觉基调。

### 已有产物

- 项目列表页
- 工作台三栏布局
- 编辑器原型
- 设定库原型
- 伏笔页原型
- AI 监控面板原型
- 灵感发散对话区原型

### 当前限制

- 全部是 mock 数据
- 无数据库
- 无真实 AI
- 无正式工程结构

---

## Phase 1：MVP 数据底座

### 目标

先让“项目、章节、设定”从静态原型变成真正可保存、可读取、可切换的数据系统。

### 范围

- 正式前端工程骨架
- 共享类型定义
- Dexie 数据库
- Zustand Store
- 项目与章节基本 CRUD
- 设定库基本 CRUD
- 设置项存储

### 结果

即使没有 AI，也应当先成为一个可以本地稳定写作的原型应用。

---

## Phase 2：MVP 编辑器与 AI 闭环

### 目标

让应用形成第一个真正可用闭环：

> 创建项目 → 建章节 → 写正文 → AI 续写 → 自动保存

### 范围

- TipTap 编辑器接入
- Slash Command 最小可用版
- 后端 AI 代理
- 流式续写
- Context Assembler Lite
- Context Inspector 真数据化

### 结果

首个真正体现“AI 原生写作”的版本成形。

---

## Phase 3：MVP 收尾与发布准备

### 目标

把可用闭环补成可发布版本。

### 范围

- Markdown 导出
- 基础离线策略
- AI 不可用时降级提示
- 基础设置面板
- 首次引导与空状态优化

### 结果

获得第一个可实际试用的 MVP。

---

## Phase 4：Post-MVP 一致性增强

### 目标

补强“结构化创作管理”能力，让项目不只是能写，而是能管。

### 范围

- 伏笔系统正式数据化
- Brainstorming 对话持久化
- 灵感卡片 CRUD
- 基础快照与回退
- 设定冲突检测基础版

### 结果

产品从“AI 编辑器”升级为“小说创作工作台”。

---

## Phase 5：长记忆与知识网络

### 目标

解决长篇写作中最核心的 AI 失忆问题。

### 范围

- embedding 管线
- 向量检索
- 长记忆注入
- 检索命中可视化
- 角色状态时间线
- 章节历史状态查询

### 结果

真正具备长文写作的 AI 上下文优势。

---

## Phase 6：高级产品化与扩展

### 目标

把单点可用能力扩展成完整产品能力。

### 范围

- 关系图谱可视化
- 模板库
- 多格式导出（DOCX / EPUB）
- 项目导入导出（JSON）
- 多模型路由
- 多 Provider 支持
- 云端部署与同步策略

### 结果

进入正式产品化阶段。

---

## 7. L2：MVP 版本定义

## 7.1 MVP 必须包含

### 核心工作流

- 项目创建、打开、删除
- 章节创建、切换、保存
- 富文本正文编辑
- 自动保存
- AI 续写当前段落
- 导出 Markdown

### 世界观基础能力

- 设定库基础分类
  - 人物
  - 势力
  - 力量体系
- 实体增删改查
- 正文命中实体的基础识别

### AI 可控性基础能力

- Context Assembler Lite
  - 当前章节内容
  - 当前命中的设定实体
  - 用户手动 pinned 设定
- 右侧 AI 监控面板真数据化
  - Token 估算
  - 当前命中实体
  - Prompt 参考依据

### 技术底座

- IndexedDB 持久化
- Zustand 状态管理
- 后端 OpenAI 代理
- 前后端基础类型约定

## 7.2 MVP 暂不包含

- 伏笔完整生命周期系统
- 向量检索与 RAG
- 关系图谱
- 版本 Diff
- 多模型自动路由
- Brainstorming 完整持久化
- 设定模板库
- DOCX / EPUB 导出

## 7.3 MVP 可预留但不强做

- 快照表结构
- 伏笔表结构
- 灵感卡片表结构
- embedding 相关接口占位

原则：

> **结构可预留，功能不抢跑。**

---

## 8. L3：当前实施清单（小步计划）

以下是从“空工程”走到“MVP 可用”的建议执行顺序。

---

## M0：工程骨架与统一约定

### 目标

先把正式工程的边界定清楚，避免后面边写边改架构。

### 任务拆分

#### M0.1 建立正式入口文件

- 初始化 `app/src/main.tsx`
- 初始化 `app/src/App.tsx`
- 初始化全局样式与基础布局入口

#### M0.2 定义共享类型

- `Project`
- `Chapter`
- `LoreEntity`
- `AppSettings`
- 基础 AI 请求/响应类型

#### M0.3 定义目录职责

- `lib/` 放数据库、AI Client、导出、上下文组装
- `stores/` 放状态
- `components/` 放迁移后的 UI
- `types/` 放共享类型

#### M0.4 定义环境变量契约

- 前端只知道 `serverUrl`
- 后端持有 `OPENAI_API_KEY`

### 里程碑验收

- 正式工程目录能承载后续开发
- 类型定义稳定
- 原型和正式工程职责清晰分离

---

## M1：数据底座

### 目标

让“保存”和“读取”先成立。

### 任务拆分

#### M1.1 建立 Dexie 数据库

首批正式表：

- `projects`
- `chapters`
- `entities`
- `settings`

预留但先不强启用：

- `foreshadows`
- `snapshots`
- `ideaCards`

#### M1.2 建立基础 Store

- `projectStore`
- `editorStore`
- `loreStore`
- `settingsStore`

#### M1.3 建立初始化与空状态策略

- 首次启动无数据时展示空状态
- 可选 `seedDemoData()`，仅开发使用

#### M1.4 确定自动保存策略

- 编辑器内容 debounce 保存
- 切换章节前强制落盘
- 删除项目时级联删除相关章节与实体

### 里程碑验收

- 刷新页面后数据仍在
- 项目、章节、设定基础数据可增删改查
- 页面不依赖 mock 才能展示

---

## M2：工作台数据化

### 目标

先把原型界面迁移成“读真实数据”的应用。

### 任务拆分

#### M2.1 迁移基础 UI

- `Toast`
- `Layout`
- 全局暗色样式

#### M2.2 项目列表接真实数据

- 读取项目列表
- 新建项目
- 删除项目
- 进入项目

#### M2.3 编辑器外壳接真实数据

- 章节树读取 `editorStore`
- 标题读取当前章节
- 正文读取当前章节

#### M2.4 设定库接真实数据

- 人物
- 势力
- 力量体系

#### M2.5 暂时保留占位页

以下页面先保留视觉原型或空状态，不进入 MVP 主流程：

- 伏笔追踪页
- Brainstorming 持久化能力

### 里程碑验收

- 用户能从项目列表进入项目
- 用户能创建章节并编辑正文
- 用户能创建和维护基础设定

---

## M3：编辑器升级与 AI 基础接入

### 目标

让产品第一次具备真正的 AI 写作能力。

### 任务拆分

#### M3.1 替换编辑器内核

- `textarea` → `TipTap`
- 支持标题与正文分离
- 支持 placeholder

#### M3.2 建立后端最小服务

先只做一个真正可用接口：

- `POST /api/ai/chat`

后续预留接口：

- `POST /api/ai/embed`
- `POST /api/search`

#### M3.3 建立前端 AI Client

- 流式请求封装
- 错误处理
- 超时与中断处理

#### M3.4 建立 Context Assembler Lite

MVP 只组装：

1. 当前章节内容
2. 当前命中的设定实体
3. pinned 设定
4. 全局风格 prompt

**此阶段不做向量检索。**

#### M3.5 打通 Slash Command 最小闭环

先只实现 1 个真实命令：

- `续写当前段落`

其他命令先保留 UI 占位：

- 扩展大纲
- 润色段落
- 逻辑检查

#### M3.6 让 Context Inspector 真数据化

- Token 估算
- 当前命中实体
- Prompt 组成展示
- pinned 上下文展示

### 里程碑验收

- AI 可在当前章节流式续写
- 续写结果写回编辑器
- AI 面板展示的内容与实际 prompt 基本一致

---

## M4：MVP 收尾

### 目标

把“能跑”补成“能交付试用”。

### 任务拆分

#### M4.1 导出 Markdown

- 单章节导出
- 项目整书导出

#### M4.2 设置面板

- `serverUrl`
- 模型名
- 温度值
- 全局文风 prompt

#### M4.3 离线与异常降级

- 后端不可用时禁用 AI 操作
- 保持本地写作不受影响
- Toast 提示明确可理解

#### M4.4 空状态与首次引导

- 无项目引导
- 无章节引导
- AI 未连接引导

#### M4.5 文档收尾

- 更新 README
- 整理环境变量示例
- 清理原型遗留的 Gemini / AI Studio 文案

### 里程碑验收

- 用户能从零开始创建项目并完成一轮写作
- AI 可用时能续写，不可用时不影响本地编辑
- 能导出可阅读的 Markdown

---

## 9. MVP 之后的继续拆分

为了避免长期规划丢失，下面把 Post-MVP 也继续拆成可落地的小计划。

---

## P1：伏笔与灵感系统

### 目标

把“写作过程中的结构化管理”补上。

### 子计划

#### P1.1 伏笔数据化

- `foreshadows` 表落地
- 埋设 / 激活 / 回收 / 超期状态流转

#### P1.2 正文快速标记伏笔

- 选中文本后快速创建伏笔
- 自动关联章节来源

#### P1.3 灵感卡片持久化

- AI 对话保存为灵感卡片
- 卡片标签分类

#### P1.4 基础快照

- AI 操作前自动快照
- 允许快速回退

---

## P2：长记忆与 RAG

### 目标

真正解决长篇小说创作的“AI 遗忘”问题。

### 子计划

#### P2.1 embedding 管线

- 章节按块切分
- 文本向量化
- 更新时删旧插新

#### P2.2 向量检索

- `POST /api/search`
- Top-K 相似片段返回

#### P2.3 Prompt 注入升级

- Context Assembler 从 Lite 升级为 RAG 版
- 注入历史命中片段

#### P2.4 检索结果可视化

- 在 Inspector 中显示命中来源
- 支持用户理解 AI 为何引用这些历史内容

---

## P3：设定一致性增强

### 目标

从“存设定”走向“用设定约束创作”。

### 子计划

#### P3.1 设定冲突检测

- 规则注入 Prompt
- 输出基础冲突提示

#### P3.2 角色状态时间线

- 人物状态随章节变化
- 指定章节查看角色快照

#### P3.3 物品 / 事件 / 地点完善

- 完整设定类型补全
- 支持跨实体关联

---

## P4：高级产品化

### 目标

增强可扩展性与发布能力。

### 子计划

#### P4.1 图谱视图

- 人物关系图
- 势力关系图
- 伏笔因果图

#### P4.2 导入导出增强

- JSON 项目导入导出
- DOCX / EPUB 导出

#### P4.3 模板体系

- 仙侠
- 赛博朋克
- 克苏鲁
- 西幻

#### P4.4 多模型与多 Provider

- OpenAI
- Anthropic
- Gemini
- 路由规则配置

---

## 10. 风险与控制策略

## 10.1 编辑器复杂度风险

TipTap 接入后，选择区、Slash Menu、流式插入、自动保存之间容易互相打架。

**控制策略：**

- 先做最小闭环，不同时上所有编辑能力
- AI 续写只先支持一个入口
- 自动保存与 AI 写入期间要有状态隔离

## 10.2 数据结构返工风险

如果正文格式、ID 规则、Store 边界不稳定，后面会反复返工。

**控制策略：**

- 先定类型再迁移 UI
- 章节主格式只保留一种真相
- 所有组件通过 Store 取数

## 10.3 RAG 过早接入风险

向量检索链路一旦提前上，会放大后端、部署、调试复杂度。

**控制策略：**

- MVP 只做 Context Lite
- RAG 放到 Post-MVP 独立推进

## 10.4 范围失控风险

如果一开始同时做原型里所有页面的正式功能，周期会迅速失控。

**控制策略：**

- 只围绕 MVP 主工作流排优先级
- 视觉可保留，占位功能不抢跑

---

## 11. 当前优先级排序

如果只看“下一阶段该做什么”，优先级如下：

1. `M0` 工程骨架与统一约定
2. `M1` 数据底座
3. `M2` 工作台数据化
4. `M3` 编辑器升级与 AI 接入
5. `M4` MVP 收尾
6. `P1-P4` Post-MVP 增强

一句话总结：

> **先把“能稳定写、能保存、能 AI 续写”做出来，再补“能记很久、能管很细、能扩很广”。**

---

## 12. 近期执行建议

下一轮开发建议严格从 `M0` 开始，不跨阶段抢跑。

### 建议的第一批落地顺序

1. 建 `app/src` 正式入口与类型文件
2. 建 `db.ts`
3. 建 4 个基础 Store
4. 迁移 `ProjectList` 与 `Layout`
5. 接章节真实数据

等这 5 步完成后，再进入 TipTap 和 AI。

---

## 13. 执行记录

### 2026-03-30

- [x] `M0.1` 建立正式入口文件：新增 `app/index.html`、`app/vite.config.ts`、`app/src/main.tsx`、`app/src/App.tsx`、`app/src/index.css`、`app/src/components/AppShell.tsx`。
- [x] `M0.2` 定义共享类型：新增 `app/src/types/domain.ts`、`app/src/types/editor.ts`、`app/src/types/ai.ts`、`app/src/types/index.ts`。
- [x] `M0.3` 定义目录职责：正式前端开始以 `components / lib / stores / types` 结构承载开发，当前已落下首批入口与类型文件。
- [x] `M0.4` 定义环境变量契约：新增 `app/src/lib/runtime-config.ts`，明确前端只感知 `serverUrl`，`OPENAI_API_KEY` 仅在后端持有。
- [x] `M1.1` 建立 Dexie 数据库：新增 `app/src/lib/db.ts`，落下 `projects / chapters / entities / settings` 四张正式表，并预留种子数据函数。
- [x] `M1.2` 建立基础 Store：新增 `project-store`、`editor-store`、`lore-store`、`settings-store` 四个基础状态模块。
- [x] `M1.3` 建立初始化与空状态策略：在数据库层加入 `seedDemoData()`，为首次启动和开发调试保留演示数据入口。
- [x] `M1.4` 确定保存底层约定：补充 `markDirty / clearDirty / lastSavedAt` 状态、项目级联删除和字数回写逻辑，为后续 debounce 自动保存做准备。
- [x] `M2.1` 迁移基础 UI：新增 `Toast`，正式入口切换为“项目列表 / 工作台”结构，补齐工作台基础样式。
- [x] `M2.2` 项目列表接真实数据：新增 `ProjectList.tsx`，已接入项目创建、选择、删除与本地持久化。
- [x] `M2.3` 编辑器外壳接真实数据：新增 `EditorWorkspace.tsx`，章节列表、标题、正文均改为读取 `editorStore`，并接入基础自动保存。
- [x] `M2.4` 设定库接真实数据：新增 `LoreWorkspace.tsx`，已接入设定列表、新建、删除、钉选与筛选。
- [x] `M2.5` 暂时保留占位页：在正式工作台中明确将伏笔追踪、灵感发散保留为后续阶段能力，不纳入当前 MVP 主流程。
- [x] 构建验证：执行 `app/npm run build`，补充 `app/src/vite-env.d.ts` 后构建通过，当前正式前端可产出 `dist/`。
- [x] `M3.1` 替换编辑器内核：新增 `RichTextEditor.tsx`，正式接入 TipTap + StarterKit + Placeholder，编辑区已从 `textarea` 切换为富文本内核。
- [x] `M3.1` 构建验证：再次执行 `app/npm run build` 通过；接入 TipTap 后主包约 638 kB，后续可在 AI 接入阶段统一做拆包优化。
- [x] `M3.2` 建立后端最小服务：新增 `server/` 工程骨架、`.env.example`、`package.json`、`tsconfig.json`、`src/server.ts`、健康检查路由与 `POST /api/ai/chat` OpenAI 流式代理。
- [x] `M3.2` 类型与环境约定：在 `server/src/types/ai.ts` 复刻最小 AI 请求结构，并通过 `server/src/config/env.ts` 固化 `OPENAI_API_KEY / PORT / HOST / CORS_ORIGIN / OPENAI_MODEL`。
- [x] `M3.2` 运行验证：已执行 `server/npm install`、后台启动 `npm run dev`，并验证 `GET /api/health` 返回正常。
- [x] `M3.2` 编译验证：执行 `server/npm run build` 通过。
- [x] `M3.2` 真实 AI 验证：根据用户更正后的 `baseurl=http://localhost:8317/v1` 与 `apikey=123456`，已确认 `/v1/models` 可访问并返回模型列表。
- [x] `M3.3` 建立前端 AI Client：新增 `app/src/lib/ai-client.ts`，已封装 `/api/ai/chat` 的 SSE 流式读取、错误解析与 chunk 解析逻辑。
- [x] `M3.4` 建立 Context Assembler Lite：新增 `app/src/lib/context-assembler.ts` 与 `app/src/lib/token-counter.ts`，已沉淀 pinned 实体、命中文本实体、system prompt 组装与 token 估算逻辑。
- [x] `M3.5` 打通 Slash Command 最小闭环：在 `RichTextEditor.tsx` 中补充最小 Slash Menu，在 `EditorWorkspace.tsx` 中接入“续写当前段落”命令、AI 续写按钮与流式写回逻辑。
- [x] `M3.5` 联调验证（服务端）：通过 `POST /api/ai/chat` 验证到本地兼容服务的真实流式响应，`gpt-5.4-mini` 可正常返回 `联调成功`。
- [x] `M3.5` 默认模型修正：将前后端默认模型从 `gpt-4o-mini` 调整为当前服务可用的 `gpt-5.4-mini`，并在 `loadAppSettings()` 中加入早期默认值迁移。
- [x] `M3.5` 联调修复：发现 SSE 路由使用 `reply.hijack()` 后未自动带上 CORS 响应头，已在 `server/src/routes/ai.ts` 手动补充 `Access-Control-Allow-Origin`，浏览器现可读取流式响应。
- [x] `M3.5` 浏览器级验证：安装 `@playwright/test` 与 Chromium，执行 `npx playwright test .tmp/verify-ai.spec.js --reporter=line --workers=1` 通过，确认“进入项目 → 点击 AI 续写 → 正文内容变长 → 按钮恢复”闭环成立。
- [x] `M3.6` 让 Context Inspector 真数据化：新增 `ContextInspector.tsx`，已接入模型、服务端地址、token 预估、命中设定与参考依据预览。
- [x] `M3.6` 请求对齐：监控面板已改为复用与“AI 续写”相同的请求构造逻辑，`System Prompt` 与 `User Prompt` 预览现在来自真实将要发送的 payload。
- [x] `M3.6` 联调验证：重新执行浏览器级验证后，确认“点击 AI 续写”闭环仍然可用，监控面板展示与实际请求构造已共享同一入口。
- [x] `M4.1` Markdown 导出：新增 `app/src/lib/export.ts`，已支持 TipTap 文档导出为 Markdown，并接入“导出章节 / 导出整书”下载能力。
- [x] `M4.1` 工作台接入：在 `EditorWorkspace.tsx` 中新增导出按钮，支持当前章节与整书导出，文件名会按项目名和章节名自动生成。
- [x] `M4.1` 浏览器级验证：执行 `npx playwright test .tmp/verify-export.spec.js --reporter=line --workers=1` 通过，已确认 Markdown 文件可真实下载且内容结构正确。
- [x] `M4.2` 设置面板：新增 `SettingsDialog.tsx`，已接入 `serverUrl / modelName / temperature / stylePrompt` 的查看、编辑、保存、恢复默认与连接测试。
- [x] `M4.2` 工作台入口：在 `AppShell.tsx` 的侧栏与顶部区域新增“设置”入口，可在项目工作台内直接打开系统设置。
- [x] `M4.2` 回归验证：重新执行 `app/npm run build` 与浏览器级续写测试均通过；设置面板未破坏现有 AI 续写闭环。
- [x] `M4.3` 离线降级：新增 `app/src/lib/server-health.ts` 与 `server-status-store.ts`，工作台现在会周期检测后端状态，并在服务不可用时将 AI 功能标记为离线。
- [x] `M4.3` 交互收口：`EditorWorkspace.tsx` 已在后端不可用时禁用 AI 续写按钮、隐藏 Slash AI 指令、展示离线提示，并保留本地写作、自动保存与 Markdown 导出能力。
- [x] `M4.3` 设置联动：`SettingsDialog.tsx` 的连接测试、保存设置和恢复默认都会同步刷新全局服务状态，避免设置与工作台状态脱节。
- [ ] `M4.3` 本地验证：本轮按当前执行规范未主动进行本地构建或运行验证，待后续需要时可结合现有 Playwright 与健康检查链路补测。
- [x] `M4.4` 首次引导与空状态：新增 `EmptyState.tsx` 与 `OnboardingChecklist.tsx`，统一了无项目、无章节与 AI 未连接时的提示布局与行动入口。
- [x] `M4.4` 无项目引导：`ProjectList.tsx` 现在会在空项目状态下展示推荐起步顺序、创建第一个项目按钮与开发环境提示。
- [x] `M4.4` 无章节引导：`EditorWorkspace.tsx` 在没有章节时会展示“创建第一章 / 检查 AI 设置”入口，并给出明确的起步步骤。
- [x] `M4.4` AI 未连接引导：`EditorWorkspace.tsx` 在 AI 离线时会展示更明确的说明卡片，并提供直接打开设置的入口。
- [ ] `M4.4` 本地验证：本轮按当前执行规范未主动进行本地构建或运行验证，待后续需要时可沿用现有 Playwright 链路补测。
- [x] `M4.5` 文档收尾：新增根目录 `README.md`，统一了当前正式工程的启动方式、目录说明和 e2e 验证入口。
- [x] `M4.5` 验证脚本整理：将临时 `.tmp` 回归脚本迁移到 `app/e2e/`，新增 `playwright.config.ts` 与 `package.json` 中的 `test:e2e*` 命令。
- [x] `M4.5` 忽略规则整理：新增 `app/.gitignore`，并补充 `server/.gitignore` 中的 `.logs`，避免构建产物、日志和报告文件污染工作区。
- [x] `M4.5` 根目录整理：新增根级 `.gitignore`，统一忽略 `app/` 与 `server/` 下的 `node_modules / dist / .logs / test-results` 等运行产物。
- [x] `M4.5` 原型文案清理：更新 `原型/ai-novel-studio/README.md` 与 `.env.example`，明确原型目录仅供参考，不再沿用旧的 AI Studio / Gemini 运行说明。
- [x] `M4.5` 本地验证：已执行 `app/npm run build`、`server/npm run build`、`npm run test:e2e:ai`、`npm run test:e2e:export`，README、验证脚本与当前工程状态一致。
- [ ] `M4.5` 运行痕迹清理：当前环境策略拦截了目录删除命令，现有 `dist / .logs / test-results` 未直接删除，但后续已被 `.gitignore` 统一忽略。
- [x] 性能收尾：`AppShell.tsx` 已将项目列表、编辑器、设定库和设置弹窗改为懒加载，降低主入口同步依赖。
- [x] 性能收尾：`EditorWorkspace.tsx` 已将 `RichTextEditor` 和 `ContextInspector` 改为懒加载，`vite.config.ts` 已补充 `react / editor / data / icons` 的手动分包策略。
- [x] 性能收尾验证：重新执行 `app/npm run build` 后，主入口 chunk 降至约 `19.29 kB`，编辑器相关 chunk 独立为约 `305.16 kB`，拆包已实际生效。
- [x] 性能收尾回归：执行 `npm run test:e2e:ai` 与 `npm run test:e2e:export` 均通过，懒加载与分包调整未破坏 AI 续写和 Markdown 导出闭环。
- [x] 最新验证结果：前端构建、后端构建、AI 续写 e2e、Markdown 导出 e2e 均通过；当前已形成可交付的 MVP 闭环。

### 2026-03-31

- [x] 最终验收：确认 `http://127.0.0.1:3001/api/health` 与 `http://127.0.0.1:5173` 当前可访问。
- [x] 最终验收：执行 `app/npm run build` 通过，拆包结果维持为多 chunk 结构，主入口约 `19.29 kB`。
- [x] 最终验收：执行 `server/npm run build` 通过。
- [x] 最终验收：执行 `npm run test:e2e:ai` 通过，真实 AI 续写闭环仍然可用。
- [x] 最终验收：执行 `npm run test:e2e:export` 通过，章节与整书 Markdown 导出仍然可用。
- [x] 交付判断：当前仓库已具备可交付的 MVP 闭环。
- [x] 发布说明：新增根目录 `RELEASE.md`，已整理版本定位、运行前提、验证命令、已知限制与交接建议。
