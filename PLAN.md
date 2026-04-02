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
- 正式工程已完成 `M0-M4`，项目、章节、设定、AI 续写、上下文预览与 Markdown 导出均已形成可交付的 MVP 闭环。
- `server/` 已切到用户提供的 OpenAI 兼容地址 `http://localhost:8317/v1`，真实流式输出、离线降级与基础回归验证均已落地。

### 2.2 当前剩余工作

- 原型中的数据仍然是硬编码 mock。
- 当前最关键的剩余工作不再是 MVP 打通，而是进入 Post-MVP 能力扩展，优先补齐伏笔、快照、导入导出与长记忆等能力。

### 2.4 当前执行补充（与路线图同步）

- 服务端生成链路已从早期的单次 AI 调用推进到 `Plan → Write → Style → Review → Polish → Extract` 六步流水线。
- 生成控制台已支持暂停/恢复、优先级、批量人工确认、检查点式进度持久化与服务重启后任务恢复。
- `Review` 已接入 3 个 checker、严重级别、自动打回重写与重写反馈回灌。
- `Review` 已补 checker 分数门槛，可按一致性/连贯性/追读力最低分触发自动重写。
- `Polish` 已作为独立阶段承担终稿润色与 Anti-AI 终检。
- 风格适配层最小版已接入服务端生成链路，可用全局文风 Prompt 在 `Write` 后做一次风格转译。
- 本地生成实验室也已同步接入 `Style / Review / Polish`，单章实验流现为 `Plan → Write → Style → Review → Polish → Extract`。
- 生成链路的上下文组装已升级到第一版：会把最近章节尾部、最近摘要、激活伏笔与世界状态快照一起打包传入服务端生成请求。
- 服务端任务流已补第一版 `Context Assembler`：当前会基于 SQLite 组装最近摘要、最近原文尾部、卷级索引、实体与关系记忆，并保留前端 `contextBundle` 作为补充兜底。
- 服务端持久层已切到 SQLite 第一版，当前已承接生成任务与运行时门控配置，并兼容旧 JSON 自动迁移。
- 服务端 SQLite 已补第一批结构化表，当前任务执行时会自动写入章节摘要、状态变更与审查指标。
- 服务端 SQLite 已补第二批知识表，当前会从 Extract 结果自动沉淀实体、chapter index 与第二版关系数据。
- 前端设定库的实体快照已开始在入队时同步到服务端 SQLite，实体类型、描述、字段、标签与 pinned 状态不会再长期缺失。
- 服务端已补只读调试接口，当前可直接按项目查看 SQLite 中的 overview、chapter records、entities 与 relationships。
- 生成控制台已同步接入只读调试面板，便于直接在前端核对 SQLite 结构化数据写入是否符合预期。
- 调试面板已支持按章节查看更完整的 SQLite 明细，当前可核对 beats、不可变事实、状态变更与关系抽取结果。
- 关系调试结果已补命中来源与证据展示，当前能直接区分是来自 `state_change` 还是正文/摘要句子模式。
- 调试接口与调试面板已支持服务端筛选，当前可按章节、实体、关系关键词快速缩小排查范围。
- 调试面板已补章节级 Context 预览，当前可直接查看服务端实际组装的分层记忆与最终 `contextBundle`。
- 本地实验室与直接 `POST /api/ai/*` 端点已统一接入服务端 Context 组装入口，当前服务端任务流与单章实验流不再分叉。
- 长程检索底座已起步：SQLite 已补 `generation_memory_chunks` 片段表与只读调试入口，当前可以开始承接章节级 parent chunk / 场景级 child chunk 持久化。
- 服务端 `Extract` 后已自动落 memory chunks，当前调试面板可以直接查看 parent / child chunk 的 token 估算、实体、地点与正文片段。
- 检索层已抽离为独立 retrieval service，当前先走 SQL 过滤 + 关键词粗排，调试面板可直接查看章节级检索候选与分项得分。
- embedding 兼容层已落地第一版：SQLite 已补向量缓存表，若配置 `OPENAI_EMBEDDING_MODEL` 则检索会在关键词粗排上叠加余弦相似度；失败时自动退回纯关键词模式。
- `Context Assembler` 已正式切到 retrieval service，当前服务端上下文层只负责构造 query 与拼装 section，不再内置相关章节启发式判分。
- 阶段 4.5 已补向量后端抽象与显式回退状态，当前 `json_cache` 与 `sqlite_vec` 两条向量后端路径都已打通最小验证。
- 阶段 4.5 已补 embedding 资产治理口径，当前可区分 `created / reused / rebuilt / skipped`。
- 阶段 4.5 已补独立向量候选召回通道，当前允许 `lexical_only / vector_only / hybrid` 三类命中。
- 阶段 4.5 已补 `metadata filter / hybrid recall / dedupe-rerank / selection` 四段调试解释，现有检索调试结果可直接看到 `vectorSearch / pipeline / rerank` 字段。
- 阶段 5 校准闭环已补脚本与记录模板，并已完成 `04A / 04B / 04C` 首轮人工执行回填：当前已验证 `embedding` 关闭回退、`reused / rebuilt` 资产口径、`vector-only rescue` 的跨样本稳定性，以及 `sqlite_vec` 相比 `json_cache` 在当前样本口径下未见明显退化；默认未主动执行本地构建或测试。
- 阶段 4.3b 已补只读二度关系查询 PoC，当前已验证 `graph_2hop / degraded(no_two_hop_relationship) / degraded(high_noise)` 三种结果模式。
- 阶段 4.3b 已补只读二度关系查询 PoC，当前已验证 `graph_2hop / degraded(no_two_hop_relationship) / degraded(high_noise)` 三种结果模式。
- 长期记忆已补第一刀持久层：SQLite 已新增 `generation_volume_recaps` 卷级总结表，当前会在章节 `Extract` 成功后自动重建当前卷 recap。
- `long_term_memory` 已优先读取持久化卷级总结，不再只依赖运行时按章节临时拼接；缺 recap 时才回退旧聚合逻辑。
- 工作记忆已补服务端化第一刀：SQLite 已新增 `generation_foreshadows`，当前会在实验室直连请求与服务端任务入队时同步前端伏笔快照。
- `Context Assembler` 已优先读取服务端伏笔快照生成工作记忆中的“激活伏笔”，并保留前端 `contextBundle` 文本解析作为兼容兜底。
- 伏笔生命周期已补最小派生层：当前会基于服务端伏笔状态与来源章节距离，推导 `激活 / 休眠 / 归档`，工作记忆只注入激活伏笔。
- 检索层已补休眠伏笔按需召回：当前会基于 query phrases 与 focus entities 对休眠伏笔做轻量匹配，并将命中结果注入 `retrieval_memory`，避免其完全掉出上下文。
- 检索层已补统一轻量召回排序：当前会将“休眠伏笔召回”和“卷级总结召回”合并后按同一套轻量分数排序，再注入 `retrieval_memory`。
- 调试面板已补轻量召回明细：当前可直接查看每条轻量召回的来源类型、分数与最终注入文本，不再只能从 `retrieval_memory` 文本块反推排序依据。
- 调试面板已补轻量召回分项：当前可直接查看每条轻量召回的词命中、实体命中与时序加权分项，便于校对排序依据。
- 轻量召回阈值已进入运行时配置：当前 `minScore / topK` 已纳入服务端门控配置、设置面板与生成控制台摘要，不再固定写死在 `generation-context.ts`。
- 已补 `backfill-memory-chunks` 维护入口，当前可以按项目为历史章节批量补齐 memory chunks，缺正文时会退化为仅补 parent chunk。
- 已补 `backfill-memory-embeddings` 维护入口；若未接真实 embedding 服务，可显式使用 `local-hash` 做离线回填与检索 smoke。
- 已补 `backfill-volume-recaps` 维护入口与调试面板展示，当前可按项目或当前调试章节所在卷回填并直接核对卷级总结内容。
- 生成控制台的 SQLite 调试面板已补前端维护入口，当前可直接按项目或按当前调试章节触发 `memory chunks / embeddings` 回填，并查看结果摘要。
- 前端维护入口已接回填后自刷新，当前执行成功后会同步刷新 SQLite 概览、章节明细、检索候选与 Context 预览。
- `chapter_index` 已补章节序号、卷名和上一章引用等稳定元数据，便于后续时间线/卷级检索升级。
- 正向偏离：后端运行时门控配置已提前落地，并已暴露到前端系统设置，可直接调整自动重写阈值与 Polish 放行策略。
- 正向偏离：生成控制台已可直接查看当前生效的门控配置摘要，便于将任务状态与门控策略联动观察。
- 正向偏离：项目级门控覆盖已提前落地，可按项目覆盖全局门控，并在任务入队时固化为该任务的执行策略。
- 生成控制台已支持更细粒度人工回退，可把任务直接回退到 `Review` 或 `Polish` 阶段后重新入队。
- 生成控制台已支持最小版大纲/节拍编辑器，保存后的本地契约会在加入服务端队列时固化为任务输入。
- 阶段 4.3a 已起步并完成最小验证：服务端当前可基于 SQLite `entities / relationships / chapter_index` 执行一度结构化关系查询（仅历史章）。
- 已新增只读调试入口 `/api/runtime/generation-debug/relationship-query`，并验证 `graph_1hop` 与 `degraded` 两种模式均可用。
- 查询路径已验证：指定实体查询与上一章实体回退均可工作；指定实体在历史边不足时会降级到 `degraded`。
- 当前建议的后续接入策略：`graph_1hop` 优先，`degraded` 回退（仍处于 4.3a，不扩展到 4.3b）。
- 阶段 4.3a 最小接入生成链路已验证通过：结构化关系结果已按最小范围接入 Context 的 `relationships` 层，现有 context/debug 输出可直接看到命中模式与注入位置。
- 相对空的 `relationships` 基线，4.3a 扩样结果显示该层信号增量存在稳定分层（`graph_1hop` / `degraded`），不是个别样本现象。
- 当前样本分布下，`graph_1hop` 主要覆盖中后期或关系较明确章节，`degraded` 主要出现在早期或关系稀薄章节。
- 当前样本边界复核：`worldStateRequiredCount = 0`，强关系命中不依赖额外补 `worldState`；阶段口径仍为“可用起步版”，不是“所有章节稳定覆盖”的最终形态。
- 当前结论仅说明 Context `relationships` 层信号价值增加，不等价于整体生成质量已提升；证据仍不足以直接进入 4.3b。
- 阶段 4.4 最小冷归档已起步：当前以“进入新卷”作为阶段切换代理，从 `generation_entities.last_seen_volume_title` 派生旧卷实体冷归档集合。
- 冷归档当前仅作用于 `memory_chunk`：当候选 chunk 的实体引用全部命中冷归档集合，且不命中当前 `focus/query` 时，会在 retrieval 预过滤阶段被排除。
- 4.4 最小收益验证已通过：旧卷噪音样本 `第10章：雾盐旧账` 会被实际过滤，跨阶段关键线索样本 `第15章：钥印底纹` 会被实际保留。
- 当前 4.4 结论口径保持克制：最小冷归档已证明“旧卷噪音可压制、关键线索可保留”，但当前仅覆盖 `memory_chunk`，不外推到整条检索主链。

### 2.3 结论

项目目前处于：

> **“`M0-M4` 已完成，当前仓库已具备可交付的 MVP 闭环，并正式进入 Post-MVP 迭代阶段”**

因此接下来的开发顺序必须是：

> **保留 `P1-P4` 作为长期能力路线图；当前真实开发主线已切到 `ROADMAP 4.5`，并进入“向量检索基础设施静态实现完成 → 阶段 5 动态校准/记录回填”的口径。**

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
- 长记忆检索：当前以 `json_cache -> sqlite-vec` 为主线演进，`pgvector + PostgreSQL` 仅作为备选/远期方案

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

1. 轻量召回参数标定与执行记录补齐
2. `sqlite-vec` 是否值得进入验证
3. 4.3a / 4.4 的后续扩样复核
4. 更完整的一致性增强与时间线能力
5. 多 Provider / 多模型路由与导出能力完善
6. 轻量召回参数的后续扩样复核

一句话总结：

> **先完成 `4.5` 的动态校准、记录回填与口径收敛，再决定是否继续推进索引层升级或其他主线能力。**

---

## 12. 近期执行建议

下一轮开发建议不再回到 `M0-M4`，而是从新的后续迭代计划开始推进。

### 建议的第一批落地顺序

1. 先补一次本地验证记录，确认统一 retrieval 主链和新增权重配置都已实际生效。
2. 人工执行阶段 5 脚本，补齐：
   - `vector-only` 命中
   - `embedding 关闭回退`
   - `created / reused / rebuilt / skipped`
3. 将动态结果回填到 `RETRIEVAL-CALIBRATION-LOG.md`、`HANDOFF.md`、`ROADMAP.md`、`PLAN.md`
4. 基于动态结果判断是否需要继续验证 `sqlite-vec`
5. 在 4.5 口径真正收敛前，不回到 `I6` 产品化优先级

执行原则是：

- `P1-P4` 继续保留为长期能力分层，不直接替代真实开发顺序
- 日常开发与排期优先跟随最新交接文档中的“当前阶段 / 已知边界 / 建议下一步”
- 每完成一个近期主线任务，先更新“执行记录”，再同步回填 `ROADMAP / HANDOFF / PLAN`

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
- [x] `I1` 数据层：新增 `Foreshadow / ForeshadowStatus` 类型、Dexie `foreshadows` 表、演示数据与项目删除级联清理。
- [x] `I1` 状态层：新增 `foreshadow-store`，已接入伏笔加载、创建、编辑、删除、筛选与状态流转。
- [x] `I1` 工作台：新增 `ForeshadowWorkspace`，已接入独立导航入口、状态筛选、详情编辑与来源 / 回收章节跳转。
- [x] `I1` 编辑器入口：`EditorWorkspace.tsx` 已支持从当前章节快速创建伏笔，最小闭环已接入正式工程。
- [x] `I1` 本地验证：执行 `npm run test:e2e:records` 通过，伏笔创建、列表查看与创作记录链路可用。
- [x] `I2` 数据层：新增 `Snapshot / IdeaCard` 类型、Dexie `snapshots / ideaCards` 表、演示数据与项目删除级联清理。
- [x] `I2` 状态层：新增 `snapshot-store` 与 `idea-card-store`，已接入快照与灵感卡片的加载、创建、删除能力。
- [x] `I2` 自动快照：`EditorWorkspace.tsx` 已在 AI 续写前自动创建章节快照，且快照创建失败不会阻断主链路。
- [x] `I2` 创作记录：新增 `CreativeRecordsDialog`，已支持手动创建快照、查看当前章节快照、恢复正文、保存当前正文为灵感卡片、保存最近 AI 输出为灵感卡片、删除灵感卡片。
- [x] `I2` 删除收口：章节删除时会一并清理该章节快照，避免遗留孤立数据。
- [x] `I2` 本地验证：执行 `npm run test:e2e:records` 通过，手动快照、灵感卡片保存与创作记录弹层可用。
- [x] `I3` 归档契约：新增 `ProjectArchive / schemaVersion`，已明确项目级 JSON 归档结构。
- [x] `I3` 导出能力：新增项目归档导出工具，已覆盖 `Project / Chapter / LoreEntity / Foreshadow / Snapshot / IdeaCard`。
- [x] `I3` 导入能力：新增项目归档解析、版本校验与 ID 重映射逻辑，导入后会生成新的本地项目 ID 并保持章节与关联关系一致。
- [x] `I3` 入口接入：`ProjectList.tsx` 已支持从列表页导入项目，并在项目卡片上导出归档文件。
- [x] `I3` 本地验证：执行 `npm run test:e2e:archive` 通过，项目归档导入导出链路可用。
- [x] `I4` 检索协议：新增 `SearchCandidate / SearchRequest / SearchResponse / SearchResult`，前后端检索契约已对齐。
- [x] `I4` 服务端检索：新增 `POST /api/search` 与最小排序服务，当前基于无状态候选集完成历史片段召回。
- [x] `I4` 前端候选构造：新增章节切片与候选构造逻辑，会从当前项目其他章节中生成可检索片段。
- [x] `I4` 上下文注入：`EditorWorkspace.tsx` 已在 AI 续写前请求检索结果，并将命中片段作为 `chapter` 参考条目注入上下文。
- [x] `I4` Inspector 展示：`ContextInspector.tsx` 已展示历史检索状态、命中章节、摘要片段，并在检索失败时提示已降级为 Lite 上下文。
- [x] `I4` 本地验证：执行 `npm run test:e2e:ai` 与 `npm run test:e2e:inspector` 通过，AI 续写与历史检索展示可用。
- [x] `I5` 设定类型支持：`LoreWorkspace.tsx` 已补齐地点、物品、事件等筛选与展示标签，正式工作流不再只偏向人物 / 势力 / 力量体系。
- [x] `I5` 一致性分析：新增轻量 `lore-consistency` 分析逻辑，当前会提示设定过空、命中实体过多但未钉选，以及正文局部可能写成了其他设定值的情况。
- [x] `I5` 提示入口：`ContextInspector.tsx` 已新增“一致性提示”分区，写作和 AI 续写时可以看到基础一致性风险。
- [x] `I5` 快照入口复用：章节快照查询入口沿用 `I2` 的 `CreativeRecordsDialog`，本轮不再重复新增独立入口。
- [x] `I5` 本地验证：执行 `npm run test:e2e:inspector` 通过，一致性提示分区已进入可见回归范围。
- [x] `I6` 模板体系起步：新增项目模板定义，当前已提供空白、仙侠、赛博朋克、克苏鲁、西幻 5 套起步模板。
- [x] `I6` 创建入口：新增 `ProjectTemplateDialog`，项目创建已从 `prompt` 升级为模板化弹层，可预览题材、首章和基础设定。
- [x] `I6` 模板落地：`project-store.createProject()` 已支持种子章节和种子设定，模板创建时会同步生成首章与基础世界观条目。
- [x] `I6` 关系图谱：新增 `GraphWorkspace` 与自动图谱推导逻辑，当前可基于章节命中、伏笔关联和设定互提关系生成可浏览图谱。
- [x] `I6` 图谱入口：`AppShell.tsx` 已新增“关系图谱”导航，支持从图谱节点跳回章节、伏笔和设定库。
- [ ] `I6` 其他产品化能力：DOCX / EPUB 与多 Provider / 多模型路由仍待后续继续推进。
- [x] `I6` 本地验证：执行 `npm run test:e2e:graph` 通过，模板创建与关系图谱入口可用。
- [x] 补验证：执行 `app/npm run typecheck`、`app/npm run build`、`server/npm run build` 与 `app/npm run test:e2e` 均通过，当前新增能力已有静态与浏览器级回归覆盖。

### 2026-04-01

- [x] 运行环境收口：已通过 `nvm` 安装并切换到 `Node.js 22.22.2`，当前不再沿用 `20.19.0` 做服务端运行态验证。
- [x] 服务端运行验证：已确认 `node:sqlite` 在 `Node.js 22.22.2` 下可导入，`server/npm run build` 通过，编译产物可真实启动并通过 `GET /api/health`。
- [x] 文档收口：`README.md`、`RELEASE.md` 与 `server/package.json` 已补 `Node.js 22+` 运行前提，避免后续继续在不兼容运行时下联调。
- [x] 历史切片回填：已新增 `POST /api/runtime/generation-maintenance/backfill-memory-chunks`，可按项目为旧章节批量补齐 memory chunks。
- [x] 历史切片回填验证：已在临时 SQLite 项目上执行 backfill smoke，确认 `processedChapters=1`、`totalChunks=2`，旧章节可补出 parent / child chunk。
- [x] 历史向量回填：已新增 `POST /api/runtime/generation-maintenance/backfill-memory-embeddings`，可按项目为已有 memory chunks 批量补 embedding。
- [x] 历史向量回填验证：已使用 `local-hash` 模式在临时 SQLite 项目上执行 backfill smoke，确认 `embeddedChunks=1`、向量缓存表成功落库。
- [x] 前端维护入口：`GenerationWorkspace` 已补 `backfill-memory-chunks` / `backfill-memory-embeddings` 按钮，支持项目级 / 章节级作用范围、可选 `limit` 与结果摘要展示。
- [x] 前端联动收口：回填成功后会自动刷新 SQLite 概览、章节明细、检索候选与 Context 预览，避免控制台继续停留旧数据。
- [x] 前端维护入口自动化验证：已新增 `app/e2e/generation-maintenance.spec.ts`，通过前端拦截后端接口覆盖维护入口渲染、项目级/章节级提交与结果摘要展示。
- [x] 自动化验证补齐：已执行 `app/npm run build`、`server/npm run build` 与 `app/npm run test:e2e:generation`，当前前端维护入口已有构建级与浏览器级回归覆盖。
- [x] AI 续写回归去外部依赖：`app/e2e/ai-continuation.spec.ts` 已改为前端拦截 `/api/ai/chat` 与 `/api/search`，避免本地 OpenAI 兼容代理认证失效时拖垮仓库内回归。
- [x] 全量 e2e 回归：已执行 `app/npm run test:e2e`，当前 7 条 Playwright 用例全部通过。
- [x] 检索质量收敛：`generation-retrieval.ts` 已补动态 K、低分空返回和同章候选合并，检索层不再无条件堆叠弱相关片段。
- [x] 检索质量验证：已在临时 SQLite 项目上完成 retrieval smoke，确认强命中保留、同章重复被收敛、弱命中返回空结果。
- [x] Context 分层补完：服务端上下文已显式拆为 `working_memory / immediate_memory / short_term_memory / long_term_memory / retrieval_memory / physical_engine` 六层。
- [x] Context 分层验证：已在临时 SQLite 项目上完成 context smoke，确认工作记忆、长期记忆、物理引擎层正常生成，激活伏笔会进入 working memory。
- [x] 卷级长期记忆落地：已新增 `generation_volume_recaps`、卷级 recap 聚合服务与 `backfill-volume-recaps` 维护入口，历史项目可按项目或按当前章节所属卷回填。
- [x] 长期记忆接线收口：`Context Assembler` 的 `long_term_memory` 已优先读取持久化卷级总结，生成控制台 SQLite 调试面板已新增卷级总结计数、列表与回填结果展示。
- [x] 伏笔服务端化第一刀：已新增 `generation_foreshadows` 表，`GenerationLabDialog` 与服务端任务入队请求会同步前端伏笔快照到 SQLite。
- [x] 工作记忆接线收口：`Context Assembler` 已优先从服务端伏笔快照构建“激活伏笔”，生成控制台 SQLite 调试面板已新增伏笔计数与服务端伏笔列表展示。
- [x] 伏笔生命周期最小升级：服务端当前会把 `resolved` 归为“归档”，把 `activated / overdue` 归为“激活”，并将久未推进的 `planted` 按来源章节距离派生为“休眠”，工作记忆不再注入这些休眠伏笔。
- [x] 休眠伏笔召回第一刀：服务端当前会按 query phrases 与 focus entities 对休眠伏笔做轻量匹配，并将命中项注入 `retrieval_memory`；生成控制台 Context 预览已新增休眠伏笔召回计数。
- [x] 统一轻量召回排序：服务端当前会把休眠伏笔召回与卷级总结召回合并排序后注入 `retrieval_memory`；生成控制台 Context 预览已新增卷总结召回计数。
- [x] 轻量召回调试明细：生成控制台 Context 预览已新增“轻量召回排序”卡片，可直接查看每条召回项的来源类型、分数和注入文本。
- [x] 轻量召回分项调试：生成控制台当前会展示每条轻量召回的词命中、实体命中与时序加权分项，并将时序加权纳入总分排序。
- [x] 轻量召回运行时配置：`GenerationGateConfig` 已新增 `lightweightRecall.minScore / topK`，服务端 Context 已按运行时配置过滤与截断轻量召回，设置面板与生成控制台摘要已同步展示。
- [x] 轻量召回权重运行时配置：`GenerationGateConfig` 已新增 `lightweightRecall.phraseWeight / entityWeight / recencyWeight`，服务端 Context、设置页、项目级覆盖、任务固化与控制台摘要已同步接通。
- [x] 轻量召回配置兼容收口：项目归档导入导出、项目门控覆盖归一化与旧任务兜底已补齐，旧配置缺字段时会回退到默认权重。
- [x] 自动化验证补充：已新增 `app/e2e/settings-gate-config.spec.ts`，并补充 `generation-maintenance.spec.ts` 断言，覆盖运行时配置读取、保存与生成控制台权重摘要展示。
- [x] 参数标定入口第一版：设置页与项目级覆盖已新增“均衡 / 实体优先 / 近期优先 / 关键词优先”四组轻量召回权重预设，便于后续快速切换基线做调参记录。
- [x] 参数标定文档起步：新增 `RETRIEVAL-CALIBRATION.md`，记录预设说明、观察指标、样本选择与结论模板，后续真实标定结果统一往该文档回填。
- [x] 参数标定示范记录：`RETRIEVAL-CALIBRATION.md` 已补首轮示范写法与最小执行清单，后续可直接替换为真实项目样本结论。
- [x] 参数标定执行文件：新增 `RETRIEVAL-CALIBRATION-LOG.md`，拆出真实执行记录载体，并补“休眠伏笔需跨 20 章以上”这一前置条件说明，避免拿不满足条件的数据做结论。
- [x] 标定样本准备：前端 `seedDemoData()` 已扩成多章稀疏章序样本，服务端已新增 `npm run seed:calibration`，便于前后端用同一组固定 ID 数据做真实参数标定。
- [x] 首轮真实标定：已执行 `server/npm run seed:calibration`，并基于 `第13章：旧坊市线索`、`第24章：归炉前夜` 对比 `均衡 / 实体优先` 两组结果；当前仍建议保留 `均衡` 作为默认基线。
- [x] 检索时间泄漏修复：在首轮标定中发现未来卷总结会误入当前章节结果，已在 `generation-retrieval.ts` 修复未来章节 `recency` 加权与未来卷总结过滤逻辑。
- [x] 第二轮真实标定：已执行 `server/npm run seed:calibration` 与 `server/npm run calibration:round2`，并基于同一组样本章节对比 `balanced(2/3/1) / entity_first(1/4/1) / entity_aggressive(1/5/1)`。
- [x] 第二轮暂定结论：在“未来卷总结泄漏已修复”的前提下，当前样本下默认基线继续保持 `均衡`；`entity_first` 与 `entity_aggressive` 仍无足够证据替换默认值。
- [x] 第二轮风险记录：`entity_aggressive(1/5/1)` 在当前样本中表现出抬高旧 `memory_chunk` 分数的趋势，需作为后续扩样验证风险持续跟踪。
- [x] 2A+2B 复核执行：在完成 2A 预过滤与 2B 显式 rerank + 去重增强后，已重新执行 `server/npm run build`、`server/npm run seed:calibration`、`server/npm run calibration:round2`。
- [x] 2B 收益复核（当前样本口径）：当前样本下，显式 rerank + 去重增强尚未带来足够明显的排序变化或默认基线切换证据，默认基线继续保持 `均衡`。
- [x] 2B 解释性缺口记录：当前调试结果仍缺 `rerankDelta` 可解释性字段，导致 2B 收益判断范围有限；结论仅可定性为“当前样本下的暂定结论”。
- [x] 标定入口回归验证：已执行 `npx playwright test e2e/settings-gate-config.spec.ts --reporter=line --workers=1`，当前设置页“实体优先”预设切换与保存链路通过。
- [x] 统一检索主链：休眠伏笔召回与卷级总结召回已正式并入 `generation-retrieval.ts`，`generation-context.ts` 不再单独维护第二套轻量召回排序。
- [x] 检索调试收口：生成控制台“检索候选”现已展示统一 retrieval 结果，memory chunks、休眠伏笔与卷总结共用同一套服务端输出结构。
- [x] 统一检索自动化脚本：已新增 `app/e2e/generation-retrieval.spec.ts`，并将 `app/package.json` 中的 `test:e2e:generation` 扩展为覆盖维护入口与统一检索展示。
- [x] 生成控制台回归验证：已执行 `app/npm run test:e2e:generation`，当前维护入口与统一检索主链展示两条 Playwright 用例均通过。
- [x] 构建级验证补齐：已执行 `app/npm run build` 与 `server/npm run build`，当前前后端构建均通过；期间修复了 `generation-job-store.ts` 中 `foreshadowSnapshot.status` 的类型归一化问题。
- [x] 4.3a 一度关系结构化查询起步：已完成最小能力验证，当前可在只读调试接口查询历史一度关系结果。
- [x] 4.3a 调试入口补齐：已新增 `/api/runtime/generation-debug/relationship-query`，`graph_1hop` 与 `degraded` 两种模式均已验证可用。
- [x] 4.3a 路径与降级验证：指定实体路径与上一章实体回退路径均可工作；指定实体在历史边不足时会降级，后续接入建议为 `graph_1hop` 优先、`degraded` 回退。
- [x] 4.3a 最小接入生成链路：结构化关系结果已按最小范围接到 Context `relationships` 层，`graph_1hop` 作为强关系信号，`degraded` 仅作为弱提示回退。
- [x] 4.3a 扩样收益复核：相对空的 `relationships` 基线，扩样结果显示层内信号增量存在稳定分层（`graph_1hop` / `degraded`），不是个别样本现象。
- [x] 4.3a 分层分布观察：当前样本下，`graph_1hop` 主要覆盖中后期或关系较明确章节，`degraded` 主要出现在早期或关系稀薄章节。
- [x] 4.3a 边界复核（当前样本）：`worldStateRequiredCount = 0`，强关系命中不依赖额外补 `worldState`；当前口径仍为“可用起步版”，不宣称全章节稳定覆盖，也不作为进入 4.3b 的充分条件。
- [x] 4.3a 结论口径收敛：上述验证不等价于整体生成质量已提升，当前仍不足以直接进入 4.3b。
- [x] 4.4 最小冷归档起步：已新增保守版冷归档判定服务，并在 retrieval 的 memory chunk 预过滤阶段接入。
- [x] 4.4 噪音样本验证：在正确的 8 章服务端标定样本下，旧卷噪音样本 `第10章：雾盐旧账` 会被实际过滤，跨阶段关键线索样本 `第15章：钥印底纹` 会被实际保留。
- [x] 4.4 当前结论：最小冷归档已证明“旧卷噪音可压制、关键线索可保留”，但当前仅覆盖 `memory_chunk`，不把该结论外推到整条检索主链。
- [x] 标定脚本稳定性修复：为避免 `tsx` 缓存导致旧样本残留，`server/package.json` 中的 calibration 脚本已统一禁用缓存。

---

## 14. 后续迭代计划（2026-03-31 起）

本节只记录“未来要做什么”，用于和长期路线图、执行记录形成双向对照。

### 14.1 使用规则

- `13. 执行记录` 只记录已经完成的事实，不预写未来任务。
- 本节只记录后续任务、默认实现策略、验收标准与当前状态。
- 后续每完成一个 `I*`，先更新 `13. 执行记录`，再回填本节中的状态与备注。
- `P1-P4` 继续作为长期能力分层；`I1-I6` 只负责表达真实执行顺序。

### 14.2 后续契约占位

以下名称作为后续实现时的文档锚点，后续落地时应尽量保持命名一致：

- `Foreshadow`
- `ForeshadowStatus`
- `Snapshot`
- `IdeaCard`
- `ProjectArchive`
- `schemaVersion`
- `POST /api/search`
- `SearchResult`

### 14.3 `I1` 伏笔系统 MVP

- 状态：`已验证`
- 目标：把伏笔从规划项落成真实本地工作流，让项目具备基础的伏笔创建、管理与回收能力。
- 任务拆分：
  - 新增 `Foreshadow` 数据模型与 `ForeshadowStatus` 状态枚举。
  - 在 Dexie 中新增 `foreshadows` 表，并补项目删除级联与基础索引。
  - 新增对应 Store，负责伏笔加载、创建、编辑、删除、筛选与状态流转。
  - 在正式工作台中新增独立伏笔入口，支持列表浏览、状态筛选与详情编辑。
  - 建立来源章节关联、回收章节关联与从当前章节创建伏笔的最小入口。
- 默认实现策略：
  - 第一版只做“来源章节 + 摘录文本 + 备注 + 状态”，不做 TipTap 精确选区锚点。
  - 伏笔先走本地优先模式，不引入服务端同步或 AI 自动抽取。
- 验收标准：
  - 可以创建、编辑、删除伏笔，并按状态或章节来源进行筛选。
  - 可以变更伏笔状态，并记录来源章节与回收章节。
  - 可以从工作台跳转查看伏笔关联的来源章节。
  - 删除项目时，相关伏笔会被联动清理。
- 归属阶段：`P1`

### 14.4 `I2` 快照与灵感卡片

- 状态：`已验证`
- 目标：补齐 AI 操作前后可回退、可沉淀的创作辅助层，降低 AI 修改正文时的风险。
- 任务拆分：
  - 新增 `Snapshot` 与 `IdeaCard` 数据模型及本地表结构。
  - 在 AI 续写前自动生成章节快照，并保留最近快照列表。
  - 支持手动创建快照、查看快照摘要并回退当前章节正文。
  - 支持从 AI 输出或手工文本沉淀灵感卡片，并在工作台中查看与删除。
- 默认实现策略：
  - 快照优先覆盖章节正文回退，不扩展到全项目级版本管理。
  - 灵感卡片先不做复杂标签体系、拖拽整理或跨项目共享。
- 验收标准：
  - AI 续写前会自动生成可追溯的章节快照。
  - 可以查看最近快照并将章节内容回退到指定快照。
  - 可以新增、查看、删除灵感卡片，并保留来源说明。
  - 快照与灵感卡片均不影响现有自动保存与 AI 主链路。
- 归属阶段：`P1`

### 14.5 `I3` JSON 项目导入导出

- 状态：`已验证`
- 目标：提供本地备份、迁移和后续 schema 演进缓冲层，降低数据结构继续扩展时的迁移风险。
- 任务拆分：
  - 新增 `ProjectArchive` 导出结构与 `schemaVersion` 字段。
  - 支持项目级 JSON 导出，覆盖 `Project / Chapter / LoreEntity / Foreshadow / Snapshot / IdeaCard`。
  - 支持项目级 JSON 导入，补充基础校验、错误提示与 ID 重映射策略。
  - 为旧版本导入预留 schema 版本识别与兼容提示。
- 默认实现策略：
  - 导入导出只面向本地工作流，不引入云端同步格式。
  - 导入失败时优先保证现有本地数据不受破坏。
- 验收标准：
  - 导出的 JSON 可以在新环境中恢复同一项目的主要数据结构。
  - 导入失败时能给出明确原因，例如 schema 不兼容或关键字段缺失。
  - 旧版本 schema 会给出版本提示，不静默失败。
  - 导入后的项目不会与现有项目 ID 冲突。
- 归属阶段：横切能力，服务于 `P1-P3`

### 14.6 `I4` RAG / 长记忆基础闭环

- 状态：`已验证`
- 目标：在现有 AI 续写链路上补最小检索增强，让长篇项目可以命中历史章节片段。
- 任务拆分：
  - 后端新增 `POST /api/search`，补齐最小检索入口。
  - 建立章节切块、embedding 管线与检索结果返回结构。
  - 将检索结果注入 `Context Assembler`，从 Lite 版升级为带历史参考的基础版。
  - 在监控面板中展示命中来源，并与 `SearchResult` 契约保持前后端一致。
- 默认实现策略：
  - 检索失败不阻断写作与 AI 续写，只降级回 Lite 上下文。
  - 第一版只做最小 Top-K 历史片段召回，不抢跑复杂 rerank 或多路检索。
- 验收标准：
  - 在长章节项目中，AI 续写可以命中历史片段并参与上下文组装。
  - 监控面板可以展示检索命中的来源章节与摘要。
  - 检索异常时主链路仍可用，并自动降级为当前 Lite 逻辑。
  - 前后端对 `SearchResult` 的字段语义保持一致。
- 归属阶段：`P2`

### 14.7 `I5` 设定一致性增强

- 状态：`已验证`
- 目标：从“能存设定”升级到“能用设定约束写作”，让设定库真正进入创作主流程。
- 任务拆分：
  - 补齐更多设定类型在 UI 的正式支持，不再只偏向人物、势力、力量体系。
  - 基于设定与正文内容提供基础冲突检测或一致性提示。
  - 增加角色状态时间线或章节快照查询入口，帮助查看人物随章节变化的状态。
  - 让一致性提示可以进入编辑器或 AI 工作流中的可见位置。
- 默认实现策略：
  - 先做轻量提示，不做全自动强约束拦截或强制修正。
  - 一致性能力优先服务编辑器与 AI 续写，不额外扩展复杂图谱依赖。
- 验收标准：
  - AI 输出或正文编辑时，可以看到基础一致性提示。
  - 更多设定类型可以正常进入主流程并参与上下文或提示逻辑。
  - 角色状态或章节快照查询入口可用，便于追踪人物变化。
  - 一致性能力不会阻断当前写作与保存链路。
- 归属阶段：`P3`

### 14.8 `I6` 高级产品化能力

- 状态：`已部分落地并验证（模板体系与关系图谱）`
- 目标：把工作台从 MVP 打磨到更完整的产品形态，补强发布能力、扩展性与可视化表达。
- 任务拆分：
  - 模板体系
  - DOCX / EPUB 导出
  - 关系图谱
  - 多 Provider / 多模型路由
- 默认实现策略：
  - 这一批次只作为中长期规划，不在近期迭代中细拆实现顺序。
  - 进入本批次前，默认要求 `I1-I5` 的核心能力已基本稳定。
- 验收标准：
  - 文档层面明确进入条件、能力边界与后续拆分入口。
  - 未来进入实施阶段时，再按单项能力继续细化为独立里程碑。
- 归属阶段：`P4`
