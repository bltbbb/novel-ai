# 全书大纲 + 卷大纲功能实现计划

## Context

当前系统中"卷"只是章节上的 `volumeTitle?: string` 标签，没有独立实体。`AIPlanRequest` 中已预留 `volumeOutline?: string` 字段但从未被填充。生成 prompt 中缺乏全局视角，AI 不知道整本书要讲什么、当前卷的弧线是什么，导致长篇写作时方向容易偏移。

本次改动将：
1. 把"卷"升级为一等实体
2. 新增 BookOutline（全书大纲）和 VolumeOutline（卷大纲）结构化数据
3. 支持 AI 一键生成大纲 + 人工在结构化表单上修改
4. 将大纲注入所有生成步骤的 prompt 中
5. 提供 UI 编辑界面

---

## Phase 1 — 数据层

### 1.1 新增类型定义 `app/src/types/domain.ts`

```typescript
export interface Volume {
  id: Id;
  projectId: Id;
  title: string;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BookOutline {
  id: Id;
  projectId: Id;
  premise: string;            // 核心前提（1-2句话）
  centralConflict: string;    // 贯穿全书的主冲突
  protagonistArc: string;     // 主角成长弧线
  thematicCore: string;       // 主题内核
  worldRules: string[];       // 不可违反的世界规则
  endgameHint: string;        // 结局方向
  toneGuide: string;          // 整体基调
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VolumeOutline {
  id: Id;
  projectId: Id;
  volumeId: Id;
  goal: string;               // 本卷目标
  keyConflict: string;        // 本卷核心冲突
  arcSummary: string;         // 本卷弧线概述
  entryState: string;         // 卷初状态
  exitState: string;          // 卷末状态
  keyEvents: string[];        // 关键事件
  foreshadowSeeds: string[];  // 本卷埋/收的伏笔
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 1.2 Dexie 迁移 `app/src/lib/db.ts`

- 新增 `volumes`, `bookOutlines`, `volumeOutlines` 三个表声明
- 添加 version(6) 迁移：
  - 新表索引：`volumes: 'id, projectId, [projectId+order]'`、`bookOutlines: 'id, projectId'`、`volumeOutlines: 'id, projectId, volumeId, [projectId+volumeId]'`
  - 数据迁移：遍历现有 chapters，按 distinct `volumeTitle` 创建 Volume 记录，给每个 chapter 写入 `volumeId`
  - **孤儿章节兜底**：`volumeTitle` 为空/undefined 的章节自动归入一个"未分卷"默认 Volume
- Chapter 接口新增 `volumeId?: Id`（保留 `volumeTitle` 兼容）
- `deleteProjectCascade` 增加三个新表的级联删除

### 1.3 新增 Zustand Store

**`app/src/stores/volume-store.ts`** — Volume CRUD（参照 lore-store 模式）
- `loadVolumes(projectId)`, `createVolume(...)`, `updateVolume(...)`, `deleteVolume(...)`

**`app/src/stores/outline-store.ts`** — BookOutline + VolumeOutline 管理
- `loadOutlines(projectId)`, `saveBookOutline(...)`, `saveVolumeOutline(...)`, `getVolumeOutline(volumeId)`

注册到 `app/src/stores/index.ts`

---

## Phase 2 — 服务端类型对齐 + AI 大纲生成接口

### 2.1 章节生成请求类型 `server/src/types/ai.ts` + `app/src/types/ai.ts`

在以下 5 个请求接口中添加 `bookOutline?: string`（`volumeOutline` 已在 AIPlanRequest 中存在，需补到其余 4 个）：
- `AIPlanRequest` — 加 `bookOutline`
- `AIWriteRequest` — 加 `bookOutline` + `volumeOutline`
- `AIReviewRequest` — 加 `bookOutline` + `volumeOutline`
- `AIStyleRequest` — 加 `bookOutline` + `volumeOutline`
- `AIPolishRequest` — 加 `bookOutline` + `volumeOutline`

`AIExtractRequest` 不需要（只从正文提取，不生成新内容）。

### 2.2 新增大纲生成请求/响应类型

```typescript
// 全书大纲生成
export interface AIBookOutlineRequest {
  projectTitle: string;
  projectDescription: string;
  genre: string[];
  // 用户可选提供的种子信息（部分字段已填，AI 补全其余）
  seedOutline?: Partial<BookOutlineFields>;
  hint?: string;                    // 用户临时输入的灵感提示词（不入库）
  model: string;
  temperature: number;
}
export interface AIBookOutlineResponse {
  premise: string;
  centralConflict: string;
  protagonistArc: string;
  thematicCore: string;
  worldRules: string[];
  endgameHint: string;
  toneGuide: string;
}

// 卷大纲生成
export interface AIVolumeOutlineRequest {
  projectTitle: string;
  projectDescription: string;
  bookOutline: string;              // 序列化后的全书大纲
  previousVolumeOutline?: string;   // 上一卷大纲（避免全量 Token 爆炸）
  volumeRecaps?: string;            // 已有卷的 volume recaps 摘要池（复用现有长期记忆）
  volumeTitle: string;
  volumeOrder: number;
  hint?: string;                    // 用户临时输入的灵感提示词（不入库）
  model: string;
  temperature: number;
}
export interface AIVolumeOutlineResponse {
  goal: string;
  keyConflict: string;
  arcSummary: string;
  entryState: string;
  exitState: string;
  keyEvents: string[];
  foreshadowSeeds: string[];
}
```

### 2.3 新增服务端路由

- `POST /api/ai/book-outline` — 生成全书大纲
- `POST /api/ai/volume-outline` — 生成卷大纲

在 `server/src/services/generation.ts` 中新增：
- `buildBookOutlinePrompt(request)` — 组装全书大纲生成 prompt
- `buildVolumeOutlinePrompt(request)` — 组装卷大纲生成 prompt
- `generateBookOutline(env, request)` — 调用 AI 并解析 JSON 响应
- `generateVolumeOutline(env, request)` — 调用 AI 并解析 JSON 响应

在 `server/src/routes/` 中新增路由注册。

### 2.4 新增前端 API 客户端

在 `app/src/lib/generation-client.ts` 中新增：
- `createBookOutline(serverUrl, request)` — 调用全书大纲生成 API
- `createVolumeOutline(serverUrl, request)` — 调用卷大纲生成 API

---

## Phase 3 — 生成管线注入

### 3.1 序列化函数 `app/src/lib/outline-serializer.ts`（新文件）

```typescript
export function serializeBookOutline(o: BookOutline): string
export function serializeVolumeOutline(o: VolumeOutline): string
```

将结构化字段格式化为 prompt 可用的文本块。

### 3.2 Prompt 注入 `server/src/services/generation.ts`

在以下 5 个 `build*Prompt` 函数的 `项目简介` 之后插入：

```typescript
request.bookOutline ? `【全书大纲】\n${request.bookOutline}` : '',
request.volumeOutline ? `【当前卷大纲】\n${request.volumeOutline}` : '',
```

涉及函数及注入策略：
- `buildPlanPrompt` (~L244) — 注入完整 bookOutline + volumeOutline
- `buildWritePrompt` (~L285) — 注入完整 bookOutline + volumeOutline
- `buildReviewPrompt` (~L325) — 注入完整 bookOutline + volumeOutline（一致性校验需要）
- `buildStylePrompt` (~L371) — **仅注入 toneGuide 字段**（文风转译不需要剧情细节，避免稀释注意力）
- `buildPolishPrompt` (~L397) — **不注入大纲**（润色层只关注文本质量，不需要宏观约束）

### 3.3 前端请求构建 `app/src/components/GenerationLabDialog.tsx`

在 dialog 初始化时从 outline-store 加载 BookOutline 和当前卷的 VolumeOutline。在所有 5 个 handler（handleGeneratePlan / handleWriteDraft / handleStyle / handleReview / handlePolish）中传入序列化后的 `bookOutline` 和 `volumeOutline` 字段。

---

## Phase 4 — UI 全面重构

### 设计原则

当前工作流是**"AI 写，人审核"**，不是"人写 AI 辅助"。UI 重心从文本编辑器转向：
1. **大纲规划**（创作输入）→ 2. **一键生成**（执行）→ 3. **审核确认**（质量把关）

### 4.0 新主布局 `app/src/components/WorkspaceLayout.tsx`（新文件）

替代当前 EditorWorkspace 作为主界面入口。顶部 Tab 切换三个核心视图：

```
┌─────────────────────────────────────────────────────────┐
│  [大纲]    [生成]    [编辑]           ⚙ 设置            │
├────────┬────────────────────────────────────────────────┤
│        │                                                │
│ 侧边栏  │              主内容区                          │
│(章节树) │        （随 Tab 切换）                          │
│        │                                                │
└────────┴────────────────────────────────────────────────┘
```

**三个 Tab：**

#### Tab 1: 大纲（OutlineView）
- 全书大纲编辑 + AI 生成按钮
- 卷列表：每卷可展开编辑 VolumeOutline + AI 生成按钮
- 卷管理：新建/重命名/排序

#### Tab 2: 生成（GenerationView）— 核心工作区
- 选中章节后的**简化生成面板**：
  - 一个大按钮"生成本章"（内部自动跑 Plan→Write→Style→Review→Polish→Extract）
  - 生成过程中显示当前步骤进度条（Plan ✓ → Write ● → Style → ...）
  - 生成完成后直接显示**审核视图**：
    - 左侧：生成的正文（可滚动阅读）
    - 右侧：精简摘要卡片（章节契约、审查结果严重度、状态变更列表）
    - 底部：两个按钮 **"通过"** / **"重新生成"**
  - "通过"后自动保存到章节，进入下一章
- **高级选项**折叠区（默认收起）：
  - 单步执行（6 个步骤按钮）
  - 门控参数调整
  - 上下文预览

#### Tab 3: 编辑（EditorView）
- 保留现有的 TipTap 富文本编辑器
- 用于人工微调 AI 生成的内容
- 弱化入口：不再是主界面

### 4.1 侧边栏（全局共享）

按卷分组的章节树，三个 Tab 共用：
```
▼ 第一卷：废墟苏醒          [编辑卷大纲]
    第1章：废墟苏醒          ✅ 已确认
    第3章：古井微光          ✅ 已确认
    第8章：黑铁片异响        🔄 待审核
▼ 第二卷：归炉井            [编辑卷大纲]
    第21章：归炉井残图       ⏳ 待生成
    第24章：归炉前夜         ⏳ 待生成
▶ 未分卷
```
- 每章显示状态图标（待生成/生成中/待审核/已确认）
- 卷标题旁有快捷编辑按钮
- 顶部：**"收起已确认卷"开关**——聚焦创作前沿，已完成的卷折叠不占视线
- 底部：+ 新建章节 / + 新建卷

### 4.2 大纲视图 `app/src/components/OutlineView.tsx`（新文件）

**全书大纲区：**
- 结构化表单：premise / centralConflict / protagonistArc / thematicCore / worldRules / endgameHint / toneGuide
- "AI 生成" 按钮 → 弹出 hint 输入框 → AI 填充 → 用户修改 → 保存
- 数组字段（worldRules）用动态列表

**卷大纲区：**
- 按卷展开的手风琴
- 每卷：goal / keyConflict / arcSummary / entryState / exitState / keyEvents / foreshadowSeeds
- 每卷有独立的 "AI 生成" 按钮 + hint 输入框
- seedOutline：已填字段作为种子传给 AI

### 4.3 生成视图 `app/src/components/GenerationView.tsx`（新文件）

**状态机驱动的简化界面：**

状态 1 — **待生成**：
- 显示本章基本信息（标题、所属卷、前一章摘要）
- 一个大按钮："生成本章"
- 可选：hint 输入框（"本章想要什么效果"）

状态 2 — **生成中**：
- 步骤进度条（Plan ✓ → Write ● → Style → Review → Polish → Extract）
- 当前步骤的实时状态文字

状态 3 — **待审核**（生成结果临时持久化到 IndexedDB，浏览器崩溃后刷新可恢复）：
- 左栏：生成正文（全文可读，**支持内联编辑**——改错别字不需要跳 Tab）
- 右栏精简信息卡：
  - 章节契约（goal / obstacle / cost，一行显示）
  - 审查结果（severity badge + 关键 issue 列表）
  - 状态变更（entity → field: old → new）
  - 伏笔变动（新埋/回收的伏笔）
- 底部操作栏：
  - "通过并进入下一章" 按钮（主要动作）
  - "重新生成" 按钮
  - "在编辑器中深度修改" → 跳转到编辑 Tab（大幅调整时用）

状态 4 — **已确认**：
- 显示已确认的正文 + 摘要信息
- "撤回确认" 按钮

**高级选项（折叠，默认隐藏）：**
- 单步执行模式
- 门控参数
- 上下文预览 / 检索调试

### 4.4 编辑视图

基本复用现有 EditorWorkspace 的编辑器部分，去掉独立工具栏中的生成相关按钮（已移到 GenerationView）。保留：
- TipTap 编辑器
- 导出
- 快照/记录
- 伏笔标记

### 4.5 设置简化

SettingsDialog 分为两层：
- **基础设置**（默认显示）：服务端地址、模型、温度、文风 prompt
- **高级设置**（折叠）：门控参数、检索权重、调试选项

去掉 GenerationWorkspace 中的重复门控控件。

### 4.6 废弃/合并的组件

| 原组件 | 处理 |
|--------|------|
| `EditorWorkspace.tsx` | 拆分为 WorkspaceLayout + EditorView，大部分逻辑迁移 |
| `GenerationLabDialog.tsx` | 合并进 GenerationView，不再是独立 dialog |
| `GenerationWorkspace.tsx` | 队列管理 + 调试面板移入 GenerationView 的"高级选项"折叠区 |

---

## Phase 5 — 收尾

- 更新 `ProjectArchive` 类型，导出/导入包含 volumes + bookOutlines + volumeOutlines
- demo seed data 中加入示例 BookOutline 和 VolumeOutline
- 类型导出更新

---

## 实现顺序

### 第一轮：数据层 + 服务端（不涉及 UI）— ✅ 已完成（Codex 实现）
| 步骤 | 内容 | 状态 |
|------|------|------|
| 1 | Volume / BookOutline / VolumeOutline 类型定义 | ✅ `app/src/types/domain.ts` |
| 2 | Dexie version(6) 迁移 + 级联删除 + 孤儿兜底 | ✅ `app/src/lib/db.ts` |
| 3 | volume-store + outline-store | ✅ `app/src/stores/` |
| 4 | 服务端类型（章节生成 + 大纲生成请求/响应） | ✅ 双端 `ai.ts` |
| 5 | 序列化函数 | ✅ `app/src/lib/outline-serializer.ts` |
| 6 | AI 大纲生成服务 + 路由 | ✅ `server/src/services/generation.ts` + `routes/` |
| 7 | 前端大纲生成 API 客户端 | ✅ `app/src/lib/generation-client.ts` |
| 8 | 章节生成 Prompt 注入 bookOutline/volumeOutline | ✅ 5 个 build*Prompt 已注入 |
| - | GenerationLabDialog + GenerationWorkspace 已接线 | ✅ 自动读取并传入大纲 |

### 第二轮：UI 全面重构 — 🔶 主骨架已完成，剩余收尾
| 步骤 | 内容 | 状态 |
|------|------|------|
| 9 | WorkspaceLayout（Tab 框架 + 侧边栏） | ✅ `WorkspaceLayout.tsx` |
| 9b | WorkspaceSidebar（卷分组 + 折叠 + 状态图标） | ✅ `WorkspaceSidebar.tsx` |
| 10 | OutlineView（全书/卷大纲编辑 + AI 生成） | ✅ `OutlineView.tsx` |
| 11 | GenerationView — 当前为过渡版（展示契约/摘要 + 入口到旧实验室） | ✅ 已可用 |
| 11b | GenerationView — 内联审核状态机（idle/generating/reviewing/approved） | ✅ 已完成 |
| 12 | EditorView（精简后的富文本编辑器） | ✅ `EditorView.tsx` |
| 13 | 设置简化（基础/高级分层） | ⏳ 待做 |
| - | AppShell 入口切换 + EditorWorkspace 嵌入模式 | ✅ 已接线 |
| - | editor-store 支持 volumeId + project-store 自动建默认卷 | ✅ 已补底座 |

### 第三轮：收尾（含 Archive 兼容性）

#### 步骤 11b — GenerationView 内联审核状态机（核心改动）

当前 GenerationView.tsx 是过渡版：展示契约/摘要 + 按钮打开 GenerationLabDialog。
需要升级为单向状态机，**不再弹出 dialog，所有生成和审核都在 GenerationView 内完成**。

**状态机定义：**

```
idle → generating → reviewing → approved
  ↑                    │
  └────── retrying ←───┘
```

**idle（待生成）：**
- 显示本章信息卡（卷、前序、现有契约、状态变更）
- 一个大按钮"生成本章"
- 可选 hint 输入框
- 点击"生成本章"→ 向服务端提交生成任务（复用现有 generation-client 的单步 API 或队列入队）→ 转 generating

**generating（生成中）：**
- 进度条显示当前步骤：Plan ✓ → Write ● → Style → Review → Polish → Extract
- 需要轮询/SSE 获取服务端 job 状态（复用 GenerationWorkspace 的队列查询逻辑）
- 每完成一步更新进度条
- 全部完成 → 转 reviewing
- 出错 → 显示错误信息 + "重试"按钮

**reviewing（待审核）— 核心界面：**
- **生成结果临时持久化到 IndexedDB**（generationQueue 或新的 generationDraft 表），浏览器崩溃后刷新可恢复到此状态
- 左栏：生成正文（**支持内联编辑**，用 contentEditable 或轻量编辑器，改错别字不用跳 Tab）
- 右栏精简摘要卡片：
  - 章节契约（goal / obstacle / cost 一行显示）
  - 审查结果（severity badge + issue 列表）
  - 状态变更（entity → field: old → new）
- 底部操作栏：
  - "通过并进入下一章"（主按钮）→ 调用 editor-store.saveChapterContent 将正文 merge 到章节主干 → 更新章节 status → 选中下一章 → 转 idle
  - "重新生成" → 清空本次草稿 → 转 generating（不离开界面）
  - "在编辑器中深度修改" → 跳转编辑 Tab

**approved（已确认）：**
- 显示已保存的正文预览 + 摘要
- "撤回确认"按钮

**高级选项（折叠区，默认隐藏）：**
- 单步执行模式（复用 GenerationLabDialog 的 6 个按钮逻辑）
- 门控参数调整
- 上下文预览

**实现要点：**
- 从 GenerationLabDialog 中提取生成逻辑（handleGeneratePlan/Write/Style/Review/Polish/Extract）到独立的 `app/src/lib/generation-pipeline.ts` 工具函数，供 GenerationView 和 GenerationLabDialog 共用
- 进度追踪：如果走队列模式（服务端 job），轮询 `GET /api/generation/jobs/:id`；如果走本地模式（逐步调用），直接在前端推进状态
- 关键文件：`app/src/components/GenerationView.tsx`、`app/src/lib/generation-pipeline.ts`（新）

#### 步骤 14 — Archive 更新（导出/导入含大纲和卷）

**当前状态：** `project-archive.ts` 的 `PROJECT_ARCHIVE_SCHEMA_VERSION = 1`，不含 volumes/bookOutlines/volumeOutlines。

**改动：**

1. **ProjectArchive 类型扩展**（`domain.ts`）：
```typescript
export interface ProjectArchive {
  schemaVersion: number;  // 升级为 2
  exportedAt: Timestamp;
  project: Project;
  chapters: Chapter[];
  entities: LoreEntity[];
  foreshadows: Foreshadow[];
  snapshots: Snapshot[];
  ideaCards: IdeaCard[];
  // v2 新增，可选（向下兼容）
  volumes?: Volume[];
  bookOutlines?: BookOutline[];
  volumeOutlines?: VolumeOutline[];
}
```

2. **导出**（`buildProjectArchive`）：查询并包含 volumes、bookOutlines、volumeOutlines

3. **导入向下兼容**（`importProjectArchive`）：
   - 读到 `schemaVersion === 1`（旧版，无 volumes）→ **内存中实时迁移**：
     - 从 chapters 的 volumeTitle 提取 distinct 卷名
     - 创建 Volume 记录
     - 给 chapters 分配 volumeId
     - 没有 volumeTitle 的章节归入默认卷
   - 读到 `schemaVersion === 2` → 直接使用 volumes/bookOutlines/volumeOutlines
   - `assertProjectArchiveShape` 中 schemaVersion 校验改为 `<= 2`
   - 新增 `remapVolumes`、`remapBookOutlines`、`remapVolumeOutlines` 函数

4. **关键文件：** `app/src/lib/project-archive.ts`、`app/src/types/domain.ts`

| 步骤 | 内容 | 状态 |
|------|------|------|
| 11b | GenerationView 内联审核状态机 | ✅ 已完成 |
| 13 | 设置简化（基础/高级分层） | ✅ 已完成 |
| 14 | Archive v2（导出含卷/大纲 + 导入向下兼容 v1） | ✅ 已完成 |
| 15 | Demo seed data 更新 | ✅ 已在第一轮完成 |
| 16 | 旧组件清理 + GenerationLabDialog 去重 | ⏳ 待做 |

## 验证方式

1. 启动前端 `npm run dev`，确认 Dexie 迁移无报错，demo 数据含 Volume + BookOutline + VolumeOutline
2. 大纲 Tab：编辑全书大纲和卷大纲，刷新后数据持久
3. 大纲 Tab：AI 生成全书大纲 → 结构化 JSON 正确填入表单
4. 大纲 Tab：AI 生成卷大纲 → 基于全书大纲 + 上一卷信息生成合理内容
5. 生成 Tab：选中章节 → 点击"生成本章"→ 进度条正常推进 → 显示审核视图
6. 生成 Tab：审核视图中 → 点击"通过"→ 正文写入章节 → 自动跳转下一章
7. 生成 Tab：高级选项展开后可见单步执行和门控参数
8. 编辑 Tab：可手动修改生成的正文
9. 侧边栏：章节按卷分组 + 状态图标正确
10. 服务端日志：章节生成 prompt 包含 `【全书大纲】` 和 `【当前卷大纲】`
11. 导出/导入 archive 包含大纲和卷数据
