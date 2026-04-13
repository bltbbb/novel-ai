Ready for review
Select text to add comments on the plan
全书大纲 + 卷大纲功能实现计划
Context
当前系统中"卷"只是章节上的 volumeTitle?: string 标签，没有独立实体。AIPlanRequest 中已预留 volumeOutline?: string 字段但从未被填充。生成 prompt 中缺乏全局视角，AI 不知道整本书要讲什么、当前卷的弧线是什么，导致长篇写作时方向容易偏移。

本次改动将：

把"卷"升级为一等实体
新增 BookOutline（全书大纲）和 VolumeOutline（卷大纲）结构化数据
支持 AI 一键生成大纲 + 人工在结构化表单上修改
将大纲注入所有生成步骤的 prompt 中
提供 UI 编辑界面
Phase 1 — 数据层
1.1 新增类型定义 app/src/types/domain.ts
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
1.2 Dexie 迁移 app/src/lib/db.ts
新增 volumes, bookOutlines, volumeOutlines 三个表声明
添加 version(6) 迁移：
新表索引：volumes: 'id, projectId, [projectId+order]'、bookOutlines: 'id, projectId'、volumeOutlines: 'id, projectId, volumeId, [projectId+volumeId]'
数据迁移：遍历现有 chapters，按 distinct volumeTitle 创建 Volume 记录，给每个 chapter 写入 volumeId
孤儿章节兜底：volumeTitle 为空/undefined 的章节自动归入一个"未分卷"默认 Volume
Chapter 接口新增 volumeId?: Id（保留 volumeTitle 兼容）
deleteProjectCascade 增加三个新表的级联删除
1.3 新增 Zustand Store
app/src/stores/volume-store.ts — Volume CRUD（参照 lore-store 模式）

loadVolumes(projectId), createVolume(...), updateVolume(...), deleteVolume(...)
app/src/stores/outline-store.ts — BookOutline + VolumeOutline 管理

loadOutlines(projectId), saveBookOutline(...), saveVolumeOutline(...), getVolumeOutline(volumeId)
注册到 app/src/stores/index.ts

Phase 2 — 服务端类型对齐 + AI 大纲生成接口
2.1 章节生成请求类型 server/src/types/ai.ts + app/src/types/ai.ts
在以下 5 个请求接口中添加 bookOutline?: string（volumeOutline 已在 AIPlanRequest 中存在，需补到其余 4 个）：

AIPlanRequest — 加 bookOutline
AIWriteRequest — 加 bookOutline + volumeOutline
AIReviewRequest — 加 bookOutline + volumeOutline
AIStyleRequest — 加 bookOutline + volumeOutline
AIPolishRequest — 加 bookOutline + volumeOutline
AIExtractRequest 不需要（只从正文提取，不生成新内容）。

2.2 新增大纲生成请求/响应类型
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
2.3 新增服务端路由
POST /api/ai/book-outline — 生成全书大纲
POST /api/ai/volume-outline — 生成卷大纲
在 server/src/services/generation.ts 中新增：

buildBookOutlinePrompt(request) — 组装全书大纲生成 prompt
buildVolumeOutlinePrompt(request) — 组装卷大纲生成 prompt
generateBookOutline(env, request) — 调用 AI 并解析 JSON 响应
generateVolumeOutline(env, request) — 调用 AI 并解析 JSON 响应
在 server/src/routes/ 中新增路由注册。

2.4 新增前端 API 客户端
在 app/src/lib/generation-client.ts 中新增：

createBookOutline(serverUrl, request) — 调用全书大纲生成 API
createVolumeOutline(serverUrl, request) — 调用卷大纲生成 API
Phase 3 — 生成管线注入
3.1 序列化函数 app/src/lib/outline-serializer.ts（新文件）
export function serializeBookOutline(o: BookOutline): string
export function serializeVolumeOutline(o: VolumeOutline): string
将结构化字段格式化为 prompt 可用的文本块。

3.2 Prompt 注入 server/src/services/generation.ts
在以下 5 个 build*Prompt 函数的 项目简介 之后插入：

request.bookOutline ? `【全书大纲】\n${request.bookOutline}` : '',
request.volumeOutline ? `【当前卷大纲】\n${request.volumeOutline}` : '',
涉及函数及注入策略：

buildPlanPrompt (~L244) — 注入完整 bookOutline + volumeOutline
buildWritePrompt (~L285) — 注入完整 bookOutline + volumeOutline
buildReviewPrompt (~L325) — 注入完整 bookOutline + volumeOutline（一致性校验需要）
buildStylePrompt (~L371) — 仅注入 toneGuide 字段（文风转译不需要剧情细节，避免稀释注意力）
buildPolishPrompt (~L397) — 不注入大纲（润色层只关注文本质量，不需要宏观约束）
3.3 前端请求构建 app/src/components/GenerationLabDialog.tsx
在 dialog 初始化时从 outline-store 加载 BookOutline 和当前卷的 VolumeOutline。在所有 5 个 handler（handleGeneratePlan / handleWriteDraft / handleStyle / handleReview / handlePolish）中传入序列化后的 bookOutline 和 volumeOutline 字段。

Phase 4 — UI 全面重构
设计原则
当前工作流是**"AI 写，人审核"**，不是"人写 AI 辅助"。UI 重心从文本编辑器转向：

大纲规划（创作输入）→ 2. 一键生成（执行）→ 3. 审核确认（质量把关）
4.0 新主布局 app/src/components/WorkspaceLayout.tsx（新文件）
替代当前 EditorWorkspace 作为主界面入口。顶部 Tab 切换三个核心视图：

┌─────────────────────────────────────────────────────────┐
│  [大纲]    [生成]    [编辑]           ⚙ 设置            │
├────────┬────────────────────────────────────────────────┤
│        │                                                │
│ 侧边栏  │              主内容区                          │
│(章节树) │        （随 Tab 切换）                          │
│        │                                                │
└────────┴────────────────────────────────────────────────┘
三个 Tab：

Tab 1: 大纲（OutlineView）
全书大纲编辑 + AI 生成按钮
卷列表：每卷可展开编辑 VolumeOutline + AI 生成按钮
卷管理：新建/重命名/排序
Tab 2: 生成（GenerationView）— 核心工作区
选中章节后的简化生成面板：
一个大按钮"生成本章"（内部自动跑 Plan→Write→Style→Review→Polish→Extract）
生成过程中显示当前步骤进度条（Plan ✓ → Write ● → Style → ...）
生成完成后直接显示审核视图：
左侧：生成的正文（可滚动阅读）
右侧：精简摘要卡片（章节契约、审查结果严重度、状态变更列表）
底部：两个按钮 "通过" / "重新生成"
"通过"后自动保存到章节，进入下一章
高级选项折叠区（默认收起）：
单步执行（6 个步骤按钮）
门控参数调整
上下文预览
Tab 3: 编辑（EditorView）
保留现有的 TipTap 富文本编辑器
用于人工微调 AI 生成的内容
弱化入口：不再是主界面
4.1 侧边栏（全局共享）
按卷分组的章节树，三个 Tab 共用：

▼ 第一卷：废墟苏醒          [编辑卷大纲]
    第1章：废墟苏醒          ✅ 已确认
    第3章：古井微光          ✅ 已确认
    第8章：黑铁片异响        🔄 待审核
▼ 第二卷：归炉井            [编辑卷大纲]
    第21章：归炉井残图       ⏳ 待生成
    第24章：归炉前夜         ⏳ 待生成
▶ 未分卷
每章显示状态图标（待生成/生成中/待审核/已确认）
卷标题旁有快捷编辑按钮
顶部："收起已确认卷"开关——聚焦创作前沿，已完成的卷折叠不占视线
底部：+ 新建章节 / + 新建卷
4.2 大纲视图 app/src/components/OutlineView.tsx（新文件）
全书大纲区：

结构化表单：premise / centralConflict / protagonistArc / thematicCore / worldRules / endgameHint / toneGuide
"AI 生成" 按钮 → 弹出 hint 输入框 → AI 填充 → 用户修改 → 保存
数组字段（worldRules）用动态列表
卷大纲区：

按卷展开的手风琴
每卷：goal / keyConflict / arcSummary / entryState / exitState / keyEvents / foreshadowSeeds
每卷有独立的 "AI 生成" 按钮 + hint 输入框
seedOutline：已填字段作为种子传给 AI
4.3 生成视图 app/src/components/GenerationView.tsx（新文件）
状态机驱动的简化界面：

状态 1 — 待生成：

显示本章基本信息（标题、所属卷、前一章摘要）
一个大按钮："生成本章"
可选：hint 输入框（"本章想要什么效果"）
状态 2 — 生成中：

步骤进度条（Plan ✓ → Write ● → Style → Review → Polish → Extract）
当前步骤的实时状态文字
状态 3 — 待审核（生成结果临时持久化到 IndexedDB，浏览器崩溃后刷新可恢复）：

左栏：生成正文（全文可读，支持内联编辑——改错别字不需要跳 Tab）
右栏精简信息卡：
章节契约（goal / obstacle / cost，一行显示）
审查结果（severity badge + 关键 issue 列表）
状态变更（entity → field: old → new）
伏笔变动（新埋/回收的伏笔）
底部操作栏：
"通过并进入下一章" 按钮（主要动作）
"重新生成" 按钮
"在编辑器中深度修改" → 跳转到编辑 Tab（大幅调整时用）
状态 4 — 已确认：

显示已确认的正文 + 摘要信息
"撤回确认" 按钮
高级选项（折叠，默认隐藏）：

单步执行模式
门控参数
上下文预览 / 检索调试
4.4 编辑视图
基本复用现有 EditorWorkspace 的编辑器部分，去掉独立工具栏中的生成相关按钮（已移到 GenerationView）。保留：

TipTap 编辑器
导出
快照/记录
伏笔标记
4.5 设置简化
SettingsDialog 分为两层：

基础设置（默认显示）：服务端地址、模型、温度、文风 prompt
高级设置（折叠）：门控参数、检索权重、调试选项
去掉 GenerationWorkspace 中的重复门控控件。

4.6 废弃/合并的组件
原组件	处理
EditorWorkspace.tsx	拆分为 WorkspaceLayout + EditorView，大部分逻辑迁移
GenerationLabDialog.tsx	合并进 GenerationView，不再是独立 dialog
GenerationWorkspace.tsx	队列管理 + 调试面板移入 GenerationView 的"高级选项"折叠区
Phase 5 — 收尾
更新 ProjectArchive 类型，导出/导入包含 volumes + bookOutlines + volumeOutlines
demo seed data 中加入示例 BookOutline 和 VolumeOutline
类型导出更新
实现顺序
第一轮：数据层 + 服务端（不涉及 UI）— ✅ 已完成（Codex 实现）
步骤	内容	状态
1	Volume / BookOutline / VolumeOutline 类型定义	✅ app/src/types/domain.ts
2	Dexie version(6) 迁移 + 级联删除 + 孤儿兜底	✅ app/src/lib/db.ts
3	volume-store + outline-store	✅ app/src/stores/
4	服务端类型（章节生成 + 大纲生成请求/响应）	✅ 双端 ai.ts
5	序列化函数	✅ app/src/lib/outline-serializer.ts
6	AI 大纲生成服务 + 路由	✅ server/src/services/generation.ts + routes/
7	前端大纲生成 API 客户端	✅ app/src/lib/generation-client.ts
8	章节生成 Prompt 注入 bookOutline/volumeOutline	✅ 5 个 build*Prompt 已注入
-	GenerationLabDialog + GenerationWorkspace 已接线	✅ 自动读取并传入大纲
第二轮：UI 全面重构 — 🔶 主骨架已完成，剩余收尾
步骤	内容	状态
9	WorkspaceLayout（Tab 框架 + 侧边栏）	✅ WorkspaceLayout.tsx
9b	WorkspaceSidebar（卷分组 + 折叠 + 状态图标）	✅ WorkspaceSidebar.tsx
10	OutlineView（全书/卷大纲编辑 + AI 生成）	✅ OutlineView.tsx
11	GenerationView — 基础视图/信息卡	✅ 已落地
11b	GenerationView — 升级为内联审核流（前端本地状态机 + generationQueue 崩溃恢复）	✅ 已完成
12	EditorView（精简后的富文本编辑器）	✅ EditorView.tsx
13	设置简化（基础设置常显 + 高级设置折叠）	✅ 已完成
-	AppShell 入口切换 + EditorWorkspace 嵌入模式	✅ 已接线
-	editor-store 支持 volumeId + project-store 自动建默认卷	✅ 已补底座
-	generation-pipeline.ts 已抽出通用流水线，GenerationView / GenerationLabDialog 共用	✅ 已完成
-	GenerationView 已支持 idle → generating → reviewing → approved 四态	✅ 已完成
-	reviewing 已支持内联编辑、IndexedDB 崩溃恢复、通过后自动跳下一章	✅ 已完成
-	GenerationView 已补页面内“高级选项”折叠区（单步执行 + 上下文/检索预览）	✅ 已完成
-	GenerationView 已补前一章摘要、伏笔变动、approved 摘要信息与“撤回确认”	✅ 已完成
-	GenerationView 已补项目级门控参数调节入口	✅ 已完成
-	GenerationView 已补服务端队列摘要与维护入口（切片 / 向量 / 卷总结回填）	✅ 已完成
-	GenerationView 已补更完整的维护结果展示卡	✅ 已完成
-	GenerationView 已补 context 分层块、轻量召回明细、4.3b 关系摘要与检索命中详情	✅ 已完成
-	GenerationView 已补章节明细 / 实体快照 / 关系抽取 / 服务端伏笔 / 卷级总结与筛选输入	✅ 已完成
-	GenerationView 已补最近任务 / 章节索引联动，可切换调试章节	✅ 已完成
-	GenerationView 已补记忆切片调试与列表展开	✅ 已完成
-	GenerationView 已补检索 / 切片 / 伏笔 / 实体的本地细粒度筛选	✅ 已完成
-	GenerationView 已补主要调试列表的“显示更多 / 收起”与跨章节调试联动体验	✅ 已完成
-	GenerationView 已补“当前创作章节 / 当前调试章节”提示与更高阶筛选	✅ 已完成
-	GenerationView 已补项目级总览统计卡	✅ 已完成
-	GenerationView 已补跨项目调试浏览（调试项目切换 + 服务端调试/维护跟随切换）	✅ 已完成
-	WorkspaceSidebar 已补“编辑卷大纲”快捷入口，OutlineView 已补卷重命名	✅ 已完成
-	OutlineView / volume-store 已补卷顺序调整（上移 / 下移）	✅ 已完成
-	WorkspaceSidebar 已接入 generationQueue 状态映射（生成中 / 待审核 / 生成失败）	✅ 已完成
-	WorkspaceSidebar 已叠加服务端任务状态（生成中 / 已暂停 / 待审核 / 失败）	✅ 已完成
-	EditorView 已隐藏 AI 续写入口，更贴近人工微调定位	✅ 已完成
-	兼容控制台已从主导航降级为 GenerationView 高级区入口	✅ 已完成
-	SettingsDialog 已改为“基础设置默认显示 / 高级设置折叠”	✅ 已完成
-	EditorView 已移除旧的“生成实验”弹窗入口	✅ 已完成
-	GenerationWorkspace / GenerationLabDialog 已标记为兼容入口，不再作为主创作链路	✅ 已完成
第三轮：收尾（含 Archive 兼容性）
步骤 11b — GenerationView 内联审核状态机（核心改动）
当前状态：✅ 已完成第一版内联审核流。GenerationView 当前采用前端本地状态机，不再弹出 dialog；生成与审核都在页面内完成，且 reviewing 已支持崩溃恢复。

状态机定义：

idle → generating → reviewing → approved
  ↑                    │
  └────── retrying ←───┘
idle（待生成）：

显示本章信息卡（卷、前序、现有契约、状态变更）
一个大按钮"生成本章"
可选 hint 输入框
点击"生成本章"→ 向服务端提交生成任务（复用现有 generation-client 的单步 API 或队列入队）→ 转 generating
generating（生成中）：

进度条显示当前步骤：Plan ✓ → Write ● → Style → Review → Polish → Extract
需要轮询/SSE 获取服务端 job 状态（复用 GenerationWorkspace 的队列查询逻辑）
每完成一步更新进度条
全部完成 → 转 reviewing
出错 → 显示错误信息 + "重试"按钮
reviewing（待审核）— 核心界面：

生成结果临时持久化到 IndexedDB（generationQueue 或新的 generationDraft 表），浏览器崩溃后刷新可恢复到此状态
左栏：生成正文（支持内联编辑，用 contentEditable 或轻量编辑器，改错别字不用跳 Tab）
右栏精简摘要卡片：
章节契约（goal / obstacle / cost 一行显示）
审查结果（severity badge + issue 列表）
状态变更（entity → field: old → new）
底部操作栏：
"通过并进入下一章"（主按钮）→ 调用 editor-store.saveChapterContent 将正文 merge 到章节主干 → 更新章节 status → 选中下一章 → 转 idle
"重新生成" → 清空本次草稿 → 转 generating（不离开界面）
"在编辑器中深度修改" → 跳转编辑 Tab
approved（已确认）：

显示已保存的正文预览 + 摘要
"撤回确认"按钮
高级选项（折叠区，默认隐藏）：

单步执行模式（复用 GenerationLabDialog 的 6 个按钮逻辑）
门控参数调整
上下文预览
实现要点：

从 GenerationLabDialog 中提取生成逻辑（handleGeneratePlan/Write/Style/Review/Polish/Extract）到独立的 app/src/lib/generation-pipeline.ts 工具函数，供 GenerationView 和 GenerationLabDialog 共用
进度追踪：如果走队列模式（服务端 job），轮询 GET /api/generation/jobs/:id；如果走本地模式（逐步调用），直接在前端推进状态
关键文件：app/src/components/GenerationView.tsx、app/src/lib/generation-pipeline.ts（新）
步骤 14 — Archive 更新（导出/导入含大纲和卷）
当前状态：✅ 已升级为 Archive v2。`project-archive.ts` 的 `PROJECT_ARCHIVE_SCHEMA_VERSION = 2`，导出已包含 `volumes / bookOutlines / volumeOutlines`，导入已兼容旧版 v1 文件的内存迁移。

改动：

ProjectArchive 类型扩展（domain.ts）：
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
导出（buildProjectArchive）：查询并包含 volumes、bookOutlines、volumeOutlines

导入向下兼容（importProjectArchive）：

读到 schemaVersion === 1（旧版，无 volumes）→ 内存中实时迁移：
从 chapters 的 volumeTitle 提取 distinct 卷名
创建 Volume 记录
给 chapters 分配 volumeId
没有 volumeTitle 的章节归入默认卷
读到 schemaVersion === 2 → 直接使用 volumes/bookOutlines/volumeOutlines
assertProjectArchiveShape 中 schemaVersion 校验改为 <= 2
新增 remapVolumes、remapBookOutlines、remapVolumeOutlines 函数
关键文件： app/src/lib/project-archive.ts、app/src/types/domain.ts

步骤	内容	关键文件
11b	GenerationView 内联审核状态机	GenerationView.tsx + generation-pipeline.ts（新）
13	设置简化（基础/高级分层）	✅ SettingsDialog.tsx
14	Archive v2（导出含卷/大纲 + 导入向下兼容 v1）	✅ project-archive.ts + domain.ts
15	Demo seed data 更新	✅ db.ts
16	旧组件清理（标记废弃并保留兼容职责）	✅ 已完成

## 下一阶段任务清单（防遗忘）

### P0 — 收拢 GenerationView 到 PRD 终态

1. 继续补完 `GenerationView` 的“高级选项”能力  
   当前已完成：
   - 单步执行模式
   - 页面内项目级门控参数调节入口
   - 上下文预览
   - 检索预览
   - 维护入口结果卡
   仍待回迁：
   - 更多服务端调试项与筛选能力
   - 更完整的跨项目浏览与调试体验
   目标文件：
   - `app/src/components/GenerationView.tsx`
   - 视情况拆分 `app/src/components/GenerationAdvancedPanel.tsx`（可新建）

2. 复核 `GenerationView` 新补的终态细节是否还需要再细化
   当前已完成：
   - `idle`：显示前一章摘要
   - `reviewing`：显示伏笔变动
   - `approved`：显示摘要信息与“撤回确认”
   后续关注：
   - “伏笔变动”是否需要从简单列表升级为“新埋 / 回收”显式分组
   - “撤回确认”后的回退口径是否需要更细（例如恢复到特定审核阶段）
   目标文件：
   - `app/src/components/GenerationView.tsx`
   - `app/src/lib/generation-storage.ts`

### P1 — 继续回迁旧控制台能力

3. 把 `GenerationWorkspace` 中仍有价值的能力逐步移回 `GenerationView`
   优先回迁：
   - 服务端队列摘要/状态查看（✅ 已完成第一版）
   - 维护入口（chunks / embeddings / volume recaps）（✅ 已完成第一版）
   - 检索调试与 context 调试（✅ 已完成分层块 / 命中详情回迁）
   - 调试面板入口（✅ 已完成当前章节明细、实体/关系/伏笔/卷总结与基础筛选输入）
   - 跨章节调试浏览（✅ 已完成最近任务 / 章节索引联动）
   - 调试列表分页/全量浏览（✅ 已完成主要列表的“显示更多 / 收起”）
   - 更细粒度筛选（✅ 已完成检索 / 切片 / 伏笔 / 实体的页面内筛选）
   - 更高阶筛选（✅ 已完成命中模式 / 关系来源 / 切片类型等筛选）
   - 项目级总览（✅ 已完成）
   - 跨项目浏览体验（✅ 已完成调试项目切换与服务端调试/维护跟随切换）
   目标文件：
   - `app/src/components/GenerationView.tsx`
   - `app/src/components/GenerationWorkspace.tsx`

4. 继续降低 `GenerationWorkspace / GenerationLabDialog` 的主入口权重
   - 保留兼容职责，但避免新链路再依赖它们
   - 当前已把兼容控制台从主导航降级为 `GenerationView` 高级区入口
   - 后续若主链能力继续回迁充分，可再考虑仅在调试模式下可见
   目标文件：
   - `app/src/components/AppShell.tsx`
   - `app/src/components/GenerationWorkspace.tsx`
   - `app/src/components/GenerationLabDialog.tsx`

### P1 — 卷管理与侧边栏补齐

5. 补卷管理细节，达到 PRD 口径
   - 卷标题旁“快捷编辑卷大纲”入口（✅ 已完成）
   - 卷重命名（✅ 已完成）
   - 卷排序（✅ 已完成基础版上移 / 下移；拖拽暂未做）
   目标文件：
   - `app/src/components/WorkspaceSidebar.tsx`
   - `app/src/components/OutlineView.tsx`
   - `app/src/stores/volume-store.ts`

6. 复核侧边栏状态映射是否要升级为“待生成 / 生成中 / 待审核 / 已确认”
   - 当前已叠加 `generationQueue` 与服务端任务状态，支持“生成中 / 已暂停 / 待审核 / 生成失败”
   - 后续如需更精细，可继续补更多阶段映射与优先级显示
   目标文件：
   - `app/src/components/WorkspaceSidebar.tsx`
   - `app/src/lib/generation-storage.ts`

### P2 — 编辑视图边界收口

7. 决定 `EditorView` 是否继续保留 `AI 续写`
   - 当前已在 `EditorView` 中隐藏 `AI 续写` 入口，使其更贴近人工微调定位
   - 若后续仍需保留底层能力，可继续限制为调试模式或兼容模式可见
   目标文件：
   - `app/src/components/EditorWorkspace.tsx`
   - `app/src/components/EditorView.tsx`

### P2 — 最终收尾与回归核对

8. 做一轮“新工作台是否覆盖旧链路”的能力回归清单
   核查项：
   - 大纲编辑闭环
   - 单章生成闭环
   - 审核确认闭环
   - 调试/维护入口是否仍可达
   - 归档导入导出是否可闭环

9. 如果上述能力都已覆盖，再决定是否进入真正的旧组件删减
   - `GenerationLabDialog` 是否还需要保留
   - `GenerationWorkspace` 是否只保留极薄调试壳
   - `EditorWorkspace` 是否还能继续瘦身

验证方式
启动前端 npm run dev，确认 Dexie 迁移无报错，demo 数据含 Volume + BookOutline + VolumeOutline
大纲 Tab：编辑全书大纲和卷大纲，刷新后数据持久
大纲 Tab：AI 生成全书大纲 → 结构化 JSON 正确填入表单
大纲 Tab：AI 生成卷大纲 → 基于全书大纲 + 上一卷信息生成合理内容
生成 Tab：选中章节 → 点击"生成本章"→ 进度条正常推进 → 显示审核视图
生成 Tab：审核视图中 → 点击"通过"→ 正文写入章节 → 自动跳转下一章
生成 Tab：高级选项展开后可见单步执行和门控参数
编辑 Tab：可手动修改生成的正文
侧边栏：章节按卷分组 + 状态图标正确
服务端日志：章节生成 prompt 包含 【全书大纲】 和 【当前卷大纲】
导出/导入 archive 包含大纲和卷数据


### 改动清单

#### 6.1 字段标签去英文 + 加 placeholder

全书大纲字段：
| 原标签 | 新标签 | placeholder |
|--------|--------|-------------|
| 核心前提（premise） | 核心前提 | "一句话概括你的故事，例：废土少年偶获上古传承，在末法时代重开修仙路" |
| 主冲突（centralConflict） | 贯穿全书的核心冲突 | "驱动整个故事的根本矛盾是什么？" |
| 主角弧线（protagonistArc） | 主角成长弧线 | "主角从开头到结尾会经历怎样的转变？" |
| 主题内核（thematicCore） | 主题内核 | "故事想要表达的深层主题，例：牺牲与救赎" |
| 世界规则（worldRules） | 世界核心规则 | "不可违反的设定，每行一条。例：\n灵气枯竭后修炼速度降低十倍\n破碎空间无法使用传送阵" |
| 结局方向（endgameHint） | 结局方向 | "故事大致朝什么方向收束？不需要详细剧透" |
| 整体基调（toneGuide） | 整体基调 | "例：前期压抑沉重，中期燃血热血，后期苍凉厚重" |

卷大纲字段同理去英文、加 placeholder。

#### 6.2 卷大纲改为手风琴折叠

- 默认所有卷收起，只显示卷标题 + 进度指示（"已填 5/7 字段"或"未填写"）
- 点击展开编辑
- focusVolumeId 指定的卷自动展开
- 同时只展开一个卷（点击新卷时自动收起上一个）

#### 6.3 hint 改为内联输入框

去掉 `window.prompt`。在"AI 生成"按钮旁加一个可选的 inline 输入框：
- 默认显示 placeholder "输入灵感提示词（可选）"
- 输入框 + AI 生成按钮在同一行
- 不需要弹窗确认，直接点按钮触发

#### 6.4 卷管理按钮收入更多菜单

"重命名"/"上移"/"下移" 收入一个 `⋯` 下拉菜单，不和大纲编辑表单并列。菜单项：
- 重命名卷
- 上移
- 下移
- （未来可加：删除卷）

#### 6.5 消灭"填表感" — textarea 差异化尺寸 + 视觉层级

当前所有字段都是相同大小的 textarea，像报税单。改为：
- **短字段**（核心前提、整体基调、本卷目标、核心冲突）→ rows=2，单行就能写完的给小框
- **长字段**（弧线概述、主角弧线）→ rows=4，需要展开写的给大框
- **全书大纲区**用更醒目的视觉区分（更大的标题、描述性副标题"定义你整本书的方向"）
- **卷大纲区**视觉权重低一级，折叠后只占一行

#### 6.6 数组字段改为 Tag 列表

当前 worldRules / keyEvents / foreshadowSeeds 用纯 textarea（换行分隔），长句时阅读混乱。改为：
- 每条规则/事件显示为独立的 Tag 卡片
- 每个 Tag 右侧有 × 删除按钮
- 底部一个输入框 + "添加"按钮，回车也能添加
- Tag 可以是长文本（不限长度），用多行 Tag 展示
- 保留 textarea 模式作为 fallback（"切换为文本编辑"链接），方便批量粘贴

#### 6.7 空状态引导

- 全书大纲全空时：显示引导卡片 "还没有大纲，点击「AI 生成」让 AI 帮你起草，或手动填写各字段"
- 卷大纲全空时：折叠状态显示 "未填写 · 点击展开编辑或使用 AI 生成"

### 关键文件

- `app/src/components/OutlineView.tsx`（唯一需要改的文件）

---

---

## Phase 2 — 裂变引擎与防同构（基于 demo8）

### 背景判断

基于 `demo8.txt` 连续 8 章结果，当前问题不只是“复读”，而是更上游的“章节同构”：

- 多章反复出现同一种骨架：铺氛围 → 摸到异物/线索 → 藏住 → 外部施压 → 李木田收束
- 角色功能分工过于固定，容易形成模板化出场
- 高频词与高频句法已开始自我复制，如“像”“低声”“没立刻”“掌心”“寒意”等

因此本阶段目标从“防复读”升级为：

- 先用 `ChapterBeat` 约束每章功能，解决章法同构
- 再在写作与审核层补“禁区”和“重复检测”

### 2.1 数据模型与存储

- [ ] 新增 `ChapterBeat` 实体
- 建议字段：
  - `id`
  - `projectId`
  - `volumeId`
  - `chapterId?`
  - `orderInVolume`
  - `titleHint?`
  - `scenePurpose`
  - `focusCharacter`
  - `mainPlot`
  - `subPlot?`
  - `pacing`
  - `hookOut`
  - `noveltyRequirement`
  - `powerDelta?`
  - `forbiddenPhrases?: string[]`
  - `forbiddenScenePatterns?: string[]`
  - `keyItems?: string[]`
  - `createdAt`
  - `updatedAt`
- 说明：
  - `scenePurpose` 比 `powerDelta` 更关键，用于防止章节功能撞车
  - `forbiddenPhrases` 与 `forbiddenScenePatterns` 分开存，便于后续分别注入

- [ ] Dexie 升级到 `version(7)`，新增 `chapterBeats` 表
- 建议索引：
  - `id`
  - `projectId`
  - `volumeId`
  - `chapterId`
  - `[volumeId+orderInVolume]`
  - `[projectId+volumeId]`

- [ ] `deleteProjectCascade` 增加 `chapterBeats` 级联删除
- [ ] Archive 导出/导入补 `chapterBeats`
- [ ] 新增 `chapter-beat-store.ts`，注册到 `stores/index.ts`

关键文件：

- `app/src/types/domain.ts`
- `app/src/lib/db.ts`
- `app/src/lib/project-archive.ts`
- `app/src/stores/chapter-beat-store.ts`（新）
- `app/src/stores/index.ts`

### 2.2 服务端：批量裂变 API

- [ ] 新增 `POST /api/ai/volume-beats`

- [ ] 请求类型不要只传 `chapterCount`，改为传 `chapterSlots`
- 建议结构：
  - `chapterId?`
  - `chapterTitle?`
  - `chapterNumber`

- [ ] 一次性喂给模型：
  - 全书大纲
  - 当前卷大纲
  - 该卷章节槽位 `chapterSlots`
- 要求模型返回与 `chapterSlots` 等长的 `ChapterBeat[]`

- [ ] Prompt 约束补强：
  - 相邻两章 `scenePurpose` 不得重复
  - 相邻两章 `focusCharacter` 尽量轮换
  - 每章必须有明确 `hookOut`
  - 每章必须填写 `noveltyRequirement`
  - 允许模型主动输出 `forbiddenScenePatterns`

关键文件：

- `app/src/types/ai.ts`
- `server/src/types/ai.ts`
- `server/src/routes/generation.ts`
- `server/src/services/generation.ts`

### 2.3 Prompt 注入改造

- [ ] `Plan Prompt` 新增：
  - `【当前卷目标】`
  - `【本章节拍】`
  - `【下章预告】`

- [ ] `Write Prompt` 裁剪：
  - 删除全量卷大纲细节注入
  - 仅保留当前卷 `goal`
  - 注入当前章 `ChapterBeat`
  - 注入下一章的 `mainPlot / hookOut` 作为“下章预告”

- [ ] 新增 `【本章禁区】`
- 组成：
  - 人工禁区：`forbiddenPhrases + forbiddenScenePatterns`
  - 自动禁区：最近 3 到 5 章高频词与高频句法

- [ ] 自动禁区第一版只做轻量规则，不引入 embedding
- 重点拦截：
  - 高频词：`像 / 低声 / 没立刻 / 掌心 / 喉结 / 寒意`
  - 高频结构：父亲总结段、摸黑试探段、发现异物后立刻封口、长比喻连续堆叠

关键文件：

- `server/src/services/generation.ts`

### 2.4 审核层：本地重复检测

- [ ] 第一版不改现有 `checkerResults` schema
- 审核主入口目前是 `GenerationView.tsx`，不是独立 `ReviewView.tsx`

- [ ] 在 `GenerationView` 审核区增加本地 `repetition checker` 卡片
- 检测四类风险：
  - 重复短语
  - 高频比喻触发词
  - 人物动作模板重复
  - 章节功能重复

- [ ] 展示内容：
  - 风险级别
  - 命中的重复短语
  - 命中的重复场景模板
  - 建议重写方向

- [ ] 等规则稳定后，再决定是否升级为正式第 4 个服务端 checker

关键文件：

- `app/src/components/GenerationView.tsx`

### 2.5 UI 层：章节拍表编辑

- [ ] 在 `OutlineView` 每个卷下增加“章节拍表”折叠区
- 采用纯 List 渲染，不引入任何 Drag-and-Drop 库

- [ ] 每行建议字段：
  - `chapterNumber`
  - `titleHint`
  - `scenePurpose`
  - `focusCharacter`
  - `mainPlot`
  - `hookOut`
  - `forbiddenScenePatterns` 摘要

- [ ] 支持：
  - Inline 修改
  - `[↑] [↓]` 调序
  - `[AI 裂变本卷]` 按钮

- [ ] 若某一拍已绑定现有 `chapterId`，显示对应章节标题，避免拍表和章节树脱节
- [ ] 缺少 `ChapterBeat` 时，生成页要显式提示，不允许静默退回旧链路

关键文件：

- `app/src/components/OutlineView.tsx`
- `app/src/components/GenerationView.tsx`

### 2.6 实施顺序

1. `types + db + store + archive`
2. `volume-beats` 请求/响应类型与路由
3. `OutlineView` 章节拍表编辑
4. `Plan/Write` 注入 `ChapterBeat`
5. `GenerationView` 本地重复检测
6. fallback 与错误提示

### 2.7 暂不做

- [ ] 暂不把 `repetition checker` 写入后端正式 review schema
- [ ] 暂不上 embedding 相似度去重
- [ ] 暂不把 `powerDelta` 设为强必填
- [ ] 暂不做拖拽排序

### 2.8 验收口径

- 一卷可以一键裂变出完整 `ChapterBeat[]`
- 生成某章时，服务端 prompt 能看到：
  - `【本章节拍】`
  - `【下章预告】`
  - `【本章禁区】`
- 缺少章节拍时，前端明确提示，而不是静默退回旧链路
- 审核界面能标出：
  - 词句重复
  - 章法重复
- 连跑多章后，不再连续出现同一种“发现异物 → 封口 → 父亲总结”章法
