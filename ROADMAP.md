# AI Novel Studio — 战略演进路线图

> 从"带 AI 的富文本编辑器（Copilot）"转型为"百万字自动化小说生成引擎（Agentic Workflow）"

---

## 一、当前状态

AI Novel Studio 已完成完整 MVP + I1-I5 迭代，`I6` 已部分落地，并已进入生成引擎与长程记忆增强阶段，具备：

- 项目/章节/设定 CRUD + TipTap 富文本编辑
- AI 流式续写（单次 80-120 字）+ 上下文组装
- 伏笔追踪、快照、灵感卡片、导入导出
- BM25 历史章节检索、一致性提示、知识图谱
- 前端本地优先（IndexedDB），后端无状态（Fastify + OpenAI 代理）
- 总代码量 ~6400 行，38+ 文件

当前路线迁移状态：

- [x] 阶段 0 Prompt 移植已启动并落下首版规则注入
- [x] 阶段 1 基础层已启动：已补章节大纲 / 摘要 / 状态变更 / StrandTracker 数据结构，以及 `/api/ai/plan`、`/api/ai/extract` 基础端点
- [x] 阶段 1 最小链路已打通：已新增 `/api/ai/write` 与前端 `GenerationLabDialog`，可在编辑器内执行最小 `Plan → Write → Extract` 实验流
- [x] 阶段 1 可视化面板已起步：`GenerationLabDialog` 已展示章节契约、摘要、状态变更与 strand 轨迹
- [x] 阶段 1 正式控制台已起步：新增 `GenerationWorkspace`，已支持章节总览、批量契约生成、待确认队列与逐章写回
- [x] 阶段 1 本地持久化队列已接入：待确认生成结果已进入 IndexedDB，刷新页面后仍可恢复
- [x] 阶段 1 服务端任务队列已接入：新增服务端 generation-jobs 路由、文件持久化存储与 worker，前端控制台可查看和确认服务端结果
- [x] 阶段 1 的更完整跨会话调度已落地：已补暂停/恢复、优先级、批量人工确认、检查点式进度持久化与服务重启后的任务恢复
- [x] 阶段 2 最小审查层已提前落地：已接入 `Review` 三类 checker、严重级别、自动打回重写与重写反馈回灌
- [x] 阶段 2 `Polish` 终检已提前落地：已形成 `Plan → Write → Style → Review → Polish → Extract` 六步服务端流水线
- [x] 正向偏离：运行时门控配置已提前落地，系统设置可直接调整 Review 自动重写阈值、最大重写次数与 Polish 放行策略
- [x] 正向偏离：生成控制台已展示当前生效的门控配置摘要，便于在任务视角快速确认 Review/Polish 放行规则
- [x] 正向偏离：项目级门控覆盖已提前落地，可为单个项目覆盖全局 Review/Polish 放行策略，并在入队时固化到任务请求
- [x] 阶段 2 审查分数门槛已落地：已支持按 checker 分数阈值触发自动重写，并可在全局门控与项目覆盖中分别配置
- [x] 阶段 3 更细粒度人工回退已落地：控制台已支持把任务回退到 `Review` 或 `Polish` 并重新入队，而不是只能整任务重试
- [x] 阶段 3 大纲/节拍编辑器已落地：生成控制台已支持手动编辑章节契约、beats 与不可变事实，并在加入服务端队列时固化为任务输入
- [x] 阶段 5 风格适配层最小版已提前落地：已在服务端链路接入 `Style` 步骤，可基于全局文风 Prompt 在 `Write → Style → Review` 间做文风转译
- [x] 正向偏离：本地实验室已同步接入 `Style / Review / Polish`，单章实验流已可执行 `Plan → Write → Style → Review → Polish → Extract`
- [x] 阶段 1.4 上下文组装升级已落地第一版：`Plan/Write/Style/Review/Polish` 已接入最近章节尾部、最近章节摘要、激活伏笔与世界状态快照
- [x] 阶段 3.1 服务端持久层已落地第一版：生成任务与运行时门控配置已切入 SQLite，并保留旧 JSON 文件的平滑迁移
- [x] 阶段 3.1 结构化表已落地第一批：`chapter_summaries / state_changes / review_metrics` 已在任务执行时自动写入 SQLite
- [x] 阶段 3.1 结构化表已落地第二批：`entities / chapter_index / relationships` 已开始从 Extract 结果自动沉淀到 SQLite
- [x] 正向偏离：SQLite 只读调试接口已提前落地，可直接查看 overview / chapters / entities / relationships，便于验证结构化写入
- [x] 正向偏离：生成控制台已接入 SQLite 只读调试面板，可直接查看任务、章节索引、实体与关系快照
- [x] 正向偏离：调试面板已支持按章节查看完整明细，当前可直接核对 beats / immutable facts / state_changes / relationships
- [x] 正向偏离：关系调试结果已展示命中来源与证据，便于验证 relationship 抽取质量
- [x] 正向偏离：调试接口与调试面板已支持按章节/实体/关系关键词服务端筛选，便于快速定位结构化数据问题
- [x] 正向偏离：已补 Context 调试预览，可直接按章节查看服务端实际组装的分层记忆与最终 `contextBundle`
- [x] 正向偏离：本地实验室与直接 `POST /api/ai/*` 端点已统一走服务端 Context 组装入口，不再只有服务端任务流具备分层记忆
- [x] 阶段 4 起步：已补 `generation_memory_chunks` 基础表与只读调试入口，长程检索底座开始从章节级记录升级到片段级记录
- [x] 阶段 4 起步：服务端 `Extract` 后已自动写入 parent / child memory chunks，调试面板可直接查看切片明细
- [x] 阶段 4 起步：已抽离独立 `retrieval` 服务，当前支持 SQL 过滤 + 关键词粗排，并提供章节级检索调试结果
- [x] 阶段 4 起步：已补 embedding 兼容层与 SQLite 向量缓存表，当前检索可在关键词粗排基础上做可回退的向量加权
- [x] 阶段 4 起步：`Context Assembler` 已正式改用 retrieval service，服务端上下文层完成“检索/组装”解耦
- [x] 阶段 4 起步：已补 memory chunks 历史回填入口，可为旧章节批量补齐 parent / child chunk
- [x] 阶段 4 起步：已补 memory embeddings 历史回填入口，并提供 `local-hash` 本地验证模式，便于离线回填与 smoke
- [x] 阶段 4.1 长期记忆已落地第一刀：已新增 `generation_volume_recaps` 卷级总结表，章节 `Extract` 后会自动重建当前卷 recap
- [x] 阶段 4.1 长期记忆已落地第一刀：`Context Assembler` 的 `long_term_memory` 已优先读取持久化卷级总结，并保留缺 recap 时的旧聚合回退
- [x] 阶段 4.1 工作记忆已落地第一刀：已新增 `generation_foreshadows` 表，实验室直连请求与服务端任务入队时会同步前端伏笔快照
- [x] 阶段 4.1 工作记忆已落地第一刀：`Context Assembler` 已优先读取服务端伏笔快照构建“激活伏笔”，并保留旧 `contextBundle` 文本解析作为兼容兜底
- [x] 阶段 4.1 工作记忆已补最小生命周期派生：当前会把 `resolved` 归为“归档”，把 `activated / overdue` 归为“激活”，并按来源章节距离将久未推进的 `planted` 伏笔派生为“休眠”
- [x] 阶段 4.1 工作记忆已补休眠伏笔按需召回：当前会基于 query phrases 与 focus entities 对休眠伏笔做轻量匹配，并将命中项注入 `retrieval_memory`
- [x] 阶段 4.1 检索层已补统一轻量召回排序：当前会把休眠伏笔召回与卷级总结召回合并后按同一套轻量分数排序，再注入 `retrieval_memory`
- [x] 阶段 4.1 检索层已补统一 retrieval 主链：休眠伏笔召回与卷级总结召回已正式并入 `generation-retrieval.ts`，`Context Assembler` 不再内置独立轻量召回排序
- [x] 阶段 4.1 调试层已补轻量召回明细：当前可直接查看每条轻量召回的来源类型、分数与最终注入文本
- [x] 阶段 4.1 调试层已补轻量召回分项：当前可直接查看词命中、实体命中与时序加权分项，并将时序加权纳入轻量召回总分
- [x] 阶段 4.1 运行时配置已补轻量召回参数：当前 `minScore / topK / phraseWeight / entityWeight / recencyWeight` 已纳入服务端门控配置与设置面板，轻量召回不再固定写死
- [x] 阶段 4.3a 起步：已新增只读调试入口 `/api/runtime/generation-debug/relationship-query`，服务端可基于 SQLite `entities / relationships / chapter_index` 执行最小一度结构化关系查询（仅历史章）。
- [x] 阶段 4.3a 起步：`graph_1hop` 与 `degraded` 两种模式均已验证可用；指定实体路径与“上一章实体回退”路径均可工作，但指定实体在历史边不足时会降级。
- [x] 阶段 4.3a 接入建议：在 4.3a 范围内，优先消费 `graph_1hop`，`degraded` 作为保底回退；后续 4.3b 已另行推进。
- [x] 阶段 4.3a 最小接入验证：结构化关系查询结果已按最小范围接入生成链路，当前已在 Context 的 `relationships` 层消费，并可在现有 context/debug 输出中直接识别命中模式与注入位置。
- [x] 阶段 4.3a 扩样收益复核：相对空的 `relationships` 基线，扩样结果显示该层信号增量存在稳定分层（`graph_1hop` / `degraded`），不是个别样本现象。
- [x] 阶段 4.3a 分层分布观察：当前样本下，`graph_1hop` 主要覆盖中后期或关系较明确章节，`degraded` 主要出现在早期或关系稀薄章节。
- [x] 阶段 4.3a 边界确认（当前样本）：扩样统计 `worldStateRequiredCount = 0`，当前样本中强关系命中不依赖额外补 `worldState`；阶段口径仍为“可用起步版”，不宣称全章节稳定覆盖，也不构成进入 4.3b 的充分条件。
- [x] 阶段 4.3a 结论口径收敛：当前仅证明 Context `relationships` 层信号价值增加，不等价于整体生成质量已提升；是否进入 4.3b 已由后续独立校准继续推进。
- [x] 阶段 4.3b 只读 PoC：已新增 `/api/runtime/generation-debug/relationship-query-2hop`，当前可基于 SQLite `entities / relationships / chapter_index` 执行最小二度关系查询。
- [x] 阶段 4.3b 正向样本验证：当前正向样本已稳定命中 `graph_2hop`，输出包含 `paths / edges / nodes / stats`。
- [x] 阶段 4.3b 负样本验证：当前负样本已稳定命中 `degraded / no_two_hop_relationship` 与 `degraded / high_noise` 两类降级。
- [x] 阶段 4.3b 门槛汇总与最小消费实验：`gate / preview` 已通过，当前实验注入块 `relationships_experimental_2hop` 可稳定输出。
- [x] 阶段 4.3b 最小正式接入：结果已受控接入 Context `relationships` 层，当前策略为 `graph_1hop` 优先、`graph_2hop` 在一度高噪音或强信号不足时补位、`degraded` 保底回退。
- [x] 阶段 4.3b 主链样本校准：已新增 `run-calibration-round43b-context.ts`，当前专门校准 `graph_2hop` 在主链中的补位触发，并已通过最小样本验证。
- [x] 阶段 4.3b 仿真实战扩样：`run-calibration-round43b-context.ts` 当前已覆盖 `2` 组 `graph_2hop` 补位场景与 `1` 组 `graph_1hop` + 2hop 补充场景，当前结果为 `pass=3/3`。
- [x] 阶段 4.3b 焦点收敛：关系层焦点实体当前已收紧到“当前章节主实体优先，其次显式命中实体”，以减少一度过宽焦点对 2hop 补位的抢占。
- [x] 阶段 4.3b 非触发归因：已新增 `run-calibration-round43b-nontrigger-analysis.ts`，当前可将未命中 `graph_2hop` 的样本稳定分成 `onehop_sufficient / twohop_redundant / sparse_history / onehop_noise_without_twohop` 四类，结果为 `pass=4/4`。
- [x] 阶段 4.3b 分布观察：已新增 `run-calibration-round43b-distribution.ts`；当前 synthetic 样本分布为 `graph_2hop=2 / graph_1hop=3 / degraded=2`，demo 样本分布为 `graph_1hop=3 / degraded=5`，且 demo 非触发当前集中在 `sparse_history=5 / onehop_sufficient=3`。
- [x] 阶段 4.3b 噪音降级保底：当前在 `onehop_noise_without_twohop` 场景下，即使最终仍为 `degraded`，也会优先保留 1 条高置信一度边作为“弱结构提示”，不再只剩同章共现弱提示。
- [x] 阶段 4.3b 当前边界：当前仅说明二度关系查询已最小正式并入 Context `relationships` 层，不等价于已并入 retrieval 主链，也不等价于整体生成质量已提升。
- [x] 阶段 4 起步：生成控制台已补 memory backfill 维护入口，可按项目或当前调试章节触发切片 / 向量回填，并展示结果摘要
- [x] 阶段 4.1 长期记忆已落地第一刀：生成控制台已补卷级总结调试与 `backfill-volume-recaps` 维护入口，可直接核对长期记忆资产
- [x] 阶段 4.1 工作记忆已落地第一刀：生成控制台已补服务端伏笔调试展示，可直接核对当前工作记忆依赖的伏笔快照
- [x] 阶段 4 起步：前端维护入口已接回填后自刷新，当前可联动刷新 SQLite 调试明细、检索候选与 Context 预览
- [x] 阶段 4 起步：Context 分层已补到“工作记忆 / 即时记忆 / 短期记忆 / 长期记忆 / 外部检索 / 物理引擎”，激活伏笔会优先进入工作记忆层
- [x] 阶段 4.5 起步：已补向量后端抽象与显式回退状态，当前 `json_cache` 与 `sqlite_vec` 两条向量后端路径都已打通最小验证
- [x] 阶段 4.5 起步：已补 embedding 资产治理口径，当前可区分 `created / reused / rebuilt / skipped`
- [x] 阶段 4.5 起步：已补独立向量候选召回通道，当前允许 `lexical_only / vector_only / hybrid` 三类命中
- [x] 阶段 4.5 起步：检索主链已收口为 `metadata filter / hybrid recall / dedupe-rerank / selection` 四段，调试结果可直接查看 `vectorSearch / pipeline / rerank` 解释字段
- [x] 阶段 4.5 起步：已补阶段 5 校准脚本与记录模板，当前可人工复跑 `vector-only`、`embedding 关闭回退` 与 `reused / rebuilt` 资产口径

## 二、目标终态

让 AI 独立或半独立地生成 **100 万甚至 300 万字**的长篇网文，同时保持：

- 全局剧情连贯性（跨数百章不出现逻辑硬伤）
- 人物状态一致性（设定/能力/位置/关系随剧情正确演变）
- 可读性与追读力（节奏不单调、不读起来像 AI 生成的流水账）
- 人类可干预（随时暂停/编辑/回退/调整方向）

## 三、参考蓝本

**lingfengQAQ/webnovel-writer**（GitHub 开源）— 一套面向 200 万字连载的 Claude Code 写作插件：

| 维度 | webnovel-writer 的成熟能力 | 我们当前的差距 |
|------|--------------------------|--------------|
| 生成流程 | 7 步流水线（Context → Draft → Style → Review → Polish → Extract → Git） | 已形成 6 步流水线（Plan → Write → Style → Review → Polish → Extract），仍缺 Context/Git 收尾 |
| 大纲管理 | 总纲→卷级→章级（含节拍表+时间线表） | 无 |
| 质量控制 | 6 维并行审查 + Anti-AI 七层检查 | 已接 3 checker + Anti-AI 终检 + 自动打回重写，仍缺更细门槛与评分策略 |
| 状态追踪 | state.json + index.db（动态，含 state_changes 表） | LoreEntity.fields（静态） |
| 节奏控制 | Strand Weave 三线交织 + 爽点密度 + 追读力债务 | 无 |
| 记忆系统 | 摘要链 + parent/child chunk + 向量混合检索 | BM25 token 重叠 |
| 前端 UI | 无（CLI 驱动） | **我们领先**：完整工作台 |

**核心策略：借鉴其规则体系和 Prompt 工程，嫁接到我们更成熟的工程骨架上。**

---

## 四、分阶段演进路线

### 阶段 0：Prompt 移植（不改架构）

> 详细计划见 `PROMPT-MIGRATION.md`

**目标**：在不改动任何数据结构和 API 的前提下，通过注入 webnovel-writer 的核心规则提升生成质量。

**产出**：
- `server/src/prompts/` 规则模板目录（5 套规则）
- `context-assembler.ts` + `openai.ts` 注入规则约束
- 可配置的 PromptConfig 开关

**关键规则**：
1. 防幻觉三定律（大纲即法律、设定即物理、发明需识别）
2. Anti-AI 七层检查（200+ 高危词库、句式禁止、表达替换）
3. Strand Weave 三线节奏（Quest/Fire/Constellation 最大间隔约束）
4. 爽点工程（6 种模式、30/40/30 结构、密度建议）
5. 毒点规避（降智推进、强行误会等 5 类禁止事项）

---

### 阶段 1：最小生成引擎（现有架构上验证核心假设）

**目标**：实现 Plan → Write → Extract 三步流水线，验证 AI 在有摘要+状态+节拍的情况下能否保持 10-20 章的连贯性。

#### 1.1 章节大纲/契约生成 (Plan)

新增 `/api/ai/plan` 端点：
- 输入：卷大纲 + 上章摘要 + 当前世界状态
- 输出：章节 Context Contract
  - 目标 / 阻力 / 代价（各 ≤20 字）
  - 节拍列表（3-5 个 beat，每个 beat 描述 ≤50 字）
  - 时间锚点 / 章内时间跨度 / 与上章时间差
  - Strand 类型（Quest / Fire / Constellation）
  - 钩子类型与强度
  - 不可变事实清单

新增数据结构：
- `ChapterOutline`：关联 chapterId，存储 Context Contract
- Dexie version 4 新增 `chapterOutlines` 表

#### 1.2 分段扩写 (Write)

新增 `/api/ai/write` 端点：
- 输入：Context Contract + 当前 beat + 前一段正文尾部
- 输出：800-1000 字段落
- 循环 3-5 个 beat，拼接成 3000-5000 字完整章节
- 每段生成时注入：当前 beat 目标 + 不可变事实 + Anti-AI 规则

#### 1.3 状态提取 + 摘要生成 (Extract)

新增 `/api/ai/extract` 端点：
- 输入：完成的章节正文 + 当前 LoreEntity 列表
- 输出：
  - 章节摘要（100-150 字）
  - 实体状态变更 JSON（人物位置/境界/持有物品/关系变化）
  - 新实体识别列表

新增数据结构：
- `ChapterSummary`：chapterId + summary + hook + foreshadowings
- `StateChange`：entityId + field + oldValue + newValue + chapterId
- `StrandTracker`：projectId + history[] + last_quest/fire/constellation

#### 1.4 上下文组装升级

改造 `context-assembler.ts`：
- 当前逻辑："最后 3000 字正文 + 命中设定 + 检索结果"
- 升级为："最近 5 章原文尾部 + 最近 20 章摘要 + 激活状态的伏笔 + 当前世界状态快照"

**当前进度补充**：
- 已在生成控制台和本地实验室落下第一版 `generation-context` 打包器
- `Plan / Write / Style / Review / Polish` 请求已可接收 `contextBundle`
- 服务端任务流已补第一版 `Context Assembler`，会从 SQLite 组装最近摘要、原文尾部、卷级索引、实体与关系记忆，并保留前端 `contextBundle` 作为补充兜底
- 本地实验室与直接 `POST /api/ai/*` 端点已统一走服务端 Context 组装入口，当前任务流与单章实验流共享同一套分层记忆主入口

---

### 阶段 2：Review 审查层

**目标**：在正文生成和发布之间插入多维质量审查，严重问题自动打回重写。

**当前进度补充**：
- 已落下最小版 `Review` 骨架：3 个 checker、严重级别、问题清单、自动打回重写
- 已将审查反馈回灌到下一轮 `Write` prompt，自动重写不再是盲重写
- `Polish` 已作为独立阶段提前接入，承担终稿润色与 Anti-AI 终检
- 已补 checker 分数门槛，门控不再只看严重级别，还可按一致性/连贯性/追读力最低分自动打回

#### 2.1 三个核心 Checker

参考 webnovel-writer 的 6 维并行审查，简化为 3 个核心：

| Checker | 对标 | 检查内容 |
|---------|------|---------|
| 一致性检查 | consistency-checker | 设定冲突、能力越权、时间回溯、新实体矛盾 |
| 连贯性检查 | continuity-checker + ooc-checker | 场景衔接、上章钩子承接、人物 OOC |
| 追读力检查 | reader-pull-checker | 钩子类型/强度、微兑现计数、未闭合问题 |

#### 2.2 审查门控

- 审查结果分 critical / high / medium / low 四级
- critical 必须修复，自动返回 Writer 重写
- 审查结果存入 `review_metrics`（chapter_range + scores + issues）

#### 2.3 Anti-AI 终检

- 在 Polish 阶段执行 Anti-AI 七层全文检查
- 命中高危词汇必须改写或记录偏离原因
- 输出 `anti_ai_force_check: pass/fail`

#### 2.4 Language QA Checker（下一步计划）

**进度更新（2026-04-03）**：

- 第一版基础接入已落地
- 当前链路已实装为：`Plan → Write → Style → Review → Language QA → Polish → Extract`
- 服务端已新增独立 `Language QA` 类型、接口与落库，不并入现有 `review.checkerResults`
- 前端审核态已新增“语言校对”卡片，与 `Review`、本地重复检测并列展示
- `Polish` 当前会消费 `Language QA` 结果来做定稿修文
- 当前仍未进入专项验证阶段，后续需继续观察命中口径与误报率

**目标**：把“语病、错别字、局部逻辑矛盾、称谓漂移、未铺垫专名、搭配失真”这类细粒度语言问题，从 `Polish` 中拆出来，交给独立的语言校对检查器处理。

**为什么单独做**：

- 当前 `Polish` 已同时承担终稿润色、去 AI 味、表达压缩与审查问题修复，职责过重
- `试过结实 / 收船 / 鱼腮 / 连你婶子都不能说 / 两尾死鱼鱼鳃还在一张一合` 这类问题，本质更像语言层局部幻觉，不适合继续靠专题硬规则逐个兜底
- 这类问题可被独立审稿模型稳定识别，适合沉淀为专门 checker

**建议链路位置**：

```text
Plan → Write → Style → Review → Language QA → Polish → Extract
```

第一版先不改主流程图中的阶段命名，可先作为独立检查器插在 `Review` 之后、`Polish` 之前，并在前端审核态中并列展示。

**第一版检查范围**：

- 错别字与误写
- 病句 / 残句 / 主语缺失
- 搭配不当 / 用词错误
- 局部逻辑矛盾（如“死鱼鱼鳃还在一张一合”）
- 未铺垫专名突然出现
- 指代 / 称谓 / 局部关系错乱

**第一版输出结构**：

- `severity`
- `issues[]`
  - `title`
  - `description`
  - `suggestion`
  - `evidence`
- `summary`

**实施策略**：

1. 先做独立 `Language QA Checker`，不并入现有 `review.checkerResults` schema
2. 前端审核态先增加“语言校对”卡片，与现有 `Review` 和本地 `repetition checker` 并列展示
3. 等命中口径稳定后，再决定是否升级为正式第 4 个服务端 checker

**与 `Polish` 的职责边界**：

- `Language QA Checker`：负责找问题
- `Polish`：负责在不改剧情事实的前提下修问题、润表达、去 AI 味

当前建议：不要继续把语言校对职责堆进 `Polish` prompt，而是优先落独立 `Language QA Checker`。

#### 2.5 Power Delta / 能力一致性链（下一步计划）

**进度更新（2026-04-03）**：

- 阶段 A 与阶段 B 的第一版基础接入已落地
- `ChapterBeat.powerDelta` 已不再只是展示字段，而是已进入卷裂变、Plan、Write、Review、Extract 提示链路
- `Write` 已显式约束能力变化幅度、敌方/环境限制、短时增幅与代价延续
- `Review` 已增加对能力跃迁过大、威胁标尺失稳、限制条件失效的提示约束
- `Extract` 已增加对能力变化、伤势、临时增幅、临时修复、限制条件暴露的提取约束
- 能力档案页（阶段 C）仍未开始，当前优先级在滚动规划裂变与验证

**目标**：解决“能力提升幅度飘移、敌我强弱标尺不稳、强敌表现前后不一、临时增幅和真实战力混写”这类问题，让模型在动作场景中稳定守住“现在到底能做到什么”。

**为什么单独做**：

- `李木田初次吐纳后提水桶变稳，但紧接着雨夜杀人时仍需拼尽全力并吐血`
- `芦湾灰影能一掌拍裂船舷，却被破渔网和橹杆绊住许久`

这类问题不是语言校对，也不是资源守恒，而是**能力标尺与威胁标尺失稳**。仅靠 `Review` 的泛化一致性描述不够，需要把“本章允许变化的能力幅度”和“敌我限制条件”显式结构化。

**核心思路**：

1. 用 `ChapterBeat.powerDelta` 表达“本章允许发生的能力变化幅度”
2. 在 `Write` 前注入 `powerDelta`，避免把“小幅进步”写成“突然开挂”
3. 在 `Review` 中增加能力一致性检查，识别“能力跃迁过大 / 强敌表现前后不一”
4. 在 `Extract` 中回写“能力变化 / 限制暴露 / 临时增幅 / 临时修复”
5. 最后再把这些结构沉淀为更完整的实体能力档案页

**分阶段落法**：

**阶段 A：先让 `powerDelta` 真正起作用**

- `ChapterBeat` 中的 `powerDelta` 从“可有可无”升级为动作章重点字段
- 批量裂变章节拍时，模型必须给出：
  - 主角本章能力变化幅度
  - 敌方/环境限制条件
  - 是否为一次性爆发、短时增幅或稳定成长
- 前端大纲页允许人工修改 `powerDelta`

**阶段 B：Write / Review / Extract 联动**

- `Write` 注入：
  - 当前章 `powerDelta`
  - 当前状态表中的伤势、体力、器具状态、敌方特性
- `Review` 增加独立能力一致性检查：
  - 能力跃迁过大
  - 威胁标尺前后不一
  - 环境限制未被兑现
- `Extract` 明确提取：
  - 能力变化
  - 伤势变化
  - 临时增幅
  - 临时修复
  - 暴露出的敌方限制条件

**阶段 C：能力档案页（后续页面规划）**

新增一个独立页面，用来查看“运行中的能力状态”，不是手工静态设定页的简单翻版。

建议信息结构：

- 人物当前能力层级
- 最近一次能力变化来源章节
- 当前伤势 / 体力 / 可持续作战状态
- 当前持有关键器具及其可用性
- 敌方特性与限制条件
- 最近 5 次 `powerDelta / stateChanges` 轨迹

这个页面优先作为**运行态能力面板**，后续再决定是否允许人工回写成正式设定。

**职责划分**：

- `powerDelta`：前置约束，说明“本章允许涨多少、弱多少、限制是什么”
- 实体能力档案：长期底座，说明“这个人/物长期是什么状态”
- `Extract stateChanges`：后置记账，说明“这一章实际上发生了什么变化”

**当前建议**

不要先做复杂的完整能力档案系统，最现实的推进顺序是：

1. 先让章节拍里的 `powerDelta` 真正被生成、被注入、被检查
2. 再让 `Extract` 提取“能力变化 / 限制暴露”
3. 最后把这些沉淀成更完整的实体能力档案页

这条线应与 `Language QA Checker` 并行规划，但不要混为一类问题。

---

### 阶段 3：服务端生成引擎（架构升级）

**目标**：后端从"无状态代理"升级为"有状态的生成引擎"。

#### 3.1 引入服务端持久层

- 使用 **SQLite**（better-sqlite3）而非 PostgreSQL（降低部署复杂度）
- 表结构参考 webnovel-writer 的 index.db：
  - `entities`：id, name, type, tier
  - `aliases`：entity_id, alias_name, confidence
  - `relationships`：from_id, to_id, type, description
  - `state_changes`：entity_id, field, old_value, new_value, chapter
  - `chapter_index`：chapter, entities_appeared, locations, time_anchor
  - `review_metrics`：chapter_range, scores, severity_counts
  - `chapter_summaries`：chapter, summary, hook, foreshadowings

**当前进度补充**：
- 已落第一版 SQLite 持久层，当前覆盖 `generation_jobs` 与 `generation_runtime_config`
- 旧版 `generation-jobs.json` / `generation-gate-config.json` 会在首次访问时自动导入 SQLite
- 已补第一批结构化表：`generation_chapter_summaries / generation_state_changes / generation_review_metrics`
- 已补第二批结构化表：`generation_entities / generation_chapter_index / generation_relationships` 已开始自动写入
- `generation_relationships` 已增强到第二版：除状态变更外，还会利用摘要/正文句子中的实体共现与关系模式词做补充抽取
- 前端设定库实体快照已在入队时回流到 SQLite，当前 `generation_entities` 已可保留类型、描述、字段、标签与 pinned 状态
- 已补只读调试路由：可按项目查看 SQLite 中的 overview、chapter records、entities 与 relationships
- 生成控制台已同步接入只读调试面板，当前可直接在前端查看结构化写入结果
- 调试接口与调试面板当前已支持按章节标题、实体关键词、关系证据等服务端筛选
- `generation_relationships` 当前会记录 `source_kind / evidence`，用于调试面板展示关系命中证据
- `generation_chapter_index` 已补 richer 元数据：当前已记录 beat_count / beats / immutable_facts / hook_type / hook_strength
- `generation_chapter_index` 已补稳定元数据：当前已记录 chapter_order / volume_title / previous_chapter_id / previous_chapter_title
- 更完整的 chapter_index 元数据与高置信关系抽取仍待继续补齐

#### 3.2 生成任务队列

一个章节的完整生成流水线：

```
Plan → Write(×N beats) → Review(3 checkers 并行) → Polish → Extract → 保存
```

支持：
- 暂停/恢复
- 人工干预（任意步骤插入人工确认）
- 自动重试（Review 打回后自动返回 Write）
- 进度持久化（浏览器关闭不丢失）
- 运行时门控配置（Review 自动重写阈值、最大重写次数、Polish fail 是否阻断 ready）
- 项目级门控覆盖（当前已提前落地，任务执行时优先于全局门控）
- 审查分数门槛（当前已提前落地，支持对三个 checker 单独设最低分）

#### 3.3 前端控制台

在现有工作台基础上新增：
- 生成进度可视化（当前处于哪个步骤、每个 beat 的生成状态）
- 大纲/节拍编辑器（生成前可手动调整 beats）
- 当前已补最小版：可直接编辑本地契约并在入队时作为 outline override 传入服务端
- 审查报告展示（每个 checker 的结果、严重级别、修复建议）
- 人工确认/回退入口
- 运行时门控配置入口（当前已提前落地到系统设置）
- 当前生效门控摘要展示（当前已提前落地到生成控制台）
- 项目级门控覆盖编辑入口（当前已提前落地到生成控制台）
- 阶段级人工回退入口（当前已提前落地到生成控制台，支持回退到 Review / Polish）

#### 3.4 数据同步策略

- 前端 IndexedDB 仍作为人工编辑的主数据源
- 服务端 SQLite 作为 AI 生成链路的数据源
- 章节确认后同步回前端 IndexedDB
- 保持前端可离线编辑的能力

---

### 阶段 4：长程记忆升级

**目标**：让 AI 在第 2000 章（400 万字）时仍能准确引用第 10 章的关键信息，同时在海量记忆中过滤噪音、维持世界观的物理演进。

> 核心认知转变：50 万字以下的痛点是"AI 记不住"；400 万字时痛点变成"记忆太多，噪音淹没信号"。
> 系统不能仅仅是一个"带长记忆的文本生成器"，底层必须有一个**可查询的、带时间戳的事实数据库**在维护世界随时间流逝的客观状态。

#### 4.1 多分辨率记忆（分层上下文策略）

总 Token 预算控制在 **12k-15k**，按"分辨率"从高到低分配：

| 层级 | 分辨率 | 内容 | Token 预算 | 400 万字量级关键变化 |
|------|--------|------|-----------|---------------------|
| **即时记忆** | 逐字 | 最近 3-5 章原文尾部 | ~4000 | 维持当前行文语感和微观逻辑，不变 |
| **短期记忆** | 章级 | 最近 20 章单章摘要（100-150 字） | ~3000 | 维持当前剧情弧光（Arc）连贯，不变 |
| **长期记忆** | 卷级 | 历史各卷极简总结（每卷 1-2 句） | ~1500 | **新增**。防止 AI 彻底遗忘前期终极目标和已完结的重大事件 |
| **工作记忆** | 动态 | 激活伏笔 + 当前卷大纲 + 本章 Contract | ~1500 | 伏笔引入**休眠/淘汰机制**，几百章未推进的伏笔不全量注入 |
| **物理引擎** | 实体级 | 出场人物当前状态快照 + 所在地快照 | ~1500 | 必须是**时间戳敏感**的最新快照（防止把死了 1000 章的人复活） |
| **外部检索** | 片段级 | 向量检索 / 图谱召回片段 | ~2000 | 纯向量权重下降，强依赖元数据过滤 + 结构化定位 |

**伏笔管理升级**：
- 伏笔分三种状态：**激活**（距回收目标 ≤20 章）→ **休眠**（距回收目标 >20 章且近期无推进）→ **归档**（已回收或确认废弃）
- 工作记忆只注入激活伏笔，休眠伏笔通过检索触发时才召回
- 卷级总结中保留核心伏笔的一句话摘要，作为安全网

**长期记忆格式示例**：
```
第1卷（第1-120章）：主角萧炎被退婚后获得药老传承，在斗气大陆云岚宗击败纳兰嫣然，离开家族前往迦南学院。
第2卷（第121-300章）：主角在迦南学院获得异火，击败药老仇人韩枫，药老恢复肉身后分别。
...
```

#### 4.2 检索策略：从"相似度召回"到"结构化定位"

400 万字时，用"主角在拍卖行买飞剑"的 query 做纯向量检索，会召回过去 1500 章的 20 次拍卖会，造成极大噪音和幻觉。

**检索流程升级为三阶段**：

```
Stage 1: 元数据切片（SQL 过滤）
  → 先确定检索范围：哪几卷、哪些地点、哪些人物
  → 可由轻量 Agent 决定，或由大纲 Contract 中的关键实体自动触发

Stage 2: 向量 + BM25 混合检索（在切片范围内）
  → Parent chunk（摘要级）+ Child chunk（场景级）
  → 动态 K 值：检索分值低于阈值时宁可返回空，不注入噪音

Stage 3: Rerank + 去重
  → 按相关性重排
  → 同一事件的多个 chunk 合并
```

**Chunk 必须携带强标签**：
- `chapter_num`：章节号
- `volume_id`：所属卷
- `time_anchor`：时间线节点
- `location`：发生地点
- `characters`：参与人物列表
- `entity_refs`：涉及的设定实体 ID

#### 4.3 知识图谱（GraphRAG）

> 50 万字以下可选，超过 50 万字或实体关系复杂时为**必须项**。

**为什么向量检索不够**：长篇网文本质是复杂的社会关系网络。主角在第 2000 章遇到的反派，可能是第 100 章某个路人的师傅。向量检索无法处理这种"多跳（Multi-hop）"的关系推演。

**渐进式引入路径**（不需要一步到位上 Neo4j）：

| 阶段 | 实现方式 | 能力 |
|------|---------|------|
| **4.3a** 结构化查询 | SQLite 的 entities + relationships 表 | 一度关系查询（A 认识谁、A 在哪） |
| **4.3b** 图遍历 | SQLite 递归 CTE 或轻量图库 | 二度关系（A 的师傅的敌人是谁） |
| **4.3c** 完整图谱 | PostgreSQL + Apache AGE 或 Neo4j | 多跳推理 + 路径分析 |

**当前进度补充（4.3a）**：
- 已完成最小一度结构化关系查询验证，当前提供 `graph_1hop`（命中关系边）与 `degraded`（降级线索）两种只读结果模式。
- 已补只读调试入口 `/api/runtime/generation-debug/relationship-query`，支持指定实体查询与上一章实体回退两条路径。
- 当前建议的后续接入策略：在 4.3a 范围内，`graph_1hop` 优先，`degraded` 回退；后续 4.3b 已另行推进。
- 4.3a 最小接入生成链路已验证通过：结构化结果当前仅在 Context `relationships` 层做最小消费，`graph_1hop` 作为强关系信号，`degraded` 仅作弱提示回退。
- 相对空的 `relationships` 基线，扩样结果显示 4.3a 信号增量存在稳定分层（`graph_1hop` / `degraded`），不是个别样本现象。
- 当前样本下，`graph_1hop` 主要覆盖中后期或关系较明确章节，`degraded` 主要出现在早期或关系稀薄章节。
- 扩样统计 `worldStateRequiredCount = 0`，说明当前样本中强关系命中不依赖额外补 `worldState`。
- 上述结果本身不等价于整体生成质量已提升；进入 4.3b 的决定已由后续独立校准补充验证。

**当前进度补充（4.3b）**：
- 已完成只读二度关系查询 PoC、正负样本验证、门槛汇总与最小消费实验，当前 `graph_2hop / degraded(no_two_hop_relationship) / degraded(high_noise)` 三种模式均已验证 through。
- 已完成最小正式接入：Context `relationships` 层当前采用“`graph_1hop` 优先、`graph_2hop` 补位、`degraded` 回退”的受控策略，而不是直接用 2hop 覆盖 1hop。
- 已新增主链校准脚本 `server/src/scripts/run-calibration-round43b-context.ts`，当前可稳定复现“一度高噪音、二度补位成功”的 `graph_2hop` 主链样本。
- 已完成仿真实战扩样：当前脚本已覆盖 `2` 组 `graph_2hop` 补位场景与 `1` 组 `graph_1hop` 主信号补充二度路径场景，结果为 `pass=3/3`。
- 当前关系层焦点实体已进一步收敛到“当前章节主实体优先，其次显式命中实体”，用来避免一度焦点过宽抢占 2hop 补位机会。
- 已新增非触发归因脚本 `server/src/scripts/run-calibration-round43b-nontrigger-analysis.ts`，当前可稳定归因 4 类“为何没有触发 graph_2hop”的近似真实项目场景。
- 已新增分布脚本 `server/src/scripts/run-calibration-round43b-distribution.ts`，当前可直接观察 synthetic 与 demo 两套样本的模式分布和非触发类别分布。
- 若后续继续优化 `onehop_noise_without_twohop`，当前建议优先尝试“单次备选焦点重试”，而不是立刻引入新的全局门控。
- 当前 `demo-project-last-cultivator` 扩样结果中，`graph2hopCount = 0`；这说明主链接口与补位样本已打通，但不等价于默认 demo 项目或真实项目中已稳定大面积触发 2hop。
- 当前边界仍需保持克制：4.3b 已最小正式并入 Context `relationships` 层，但尚未并入 retrieval 主链，也不足以直接宣称整体生成质量已提升。

**当前进度补充（4.4）**：
- 已落最小冷归档判定：当前以“进入新卷”作为阶段切换代理，在服务端从 `generation_entities.last_seen_volume_title` 派生旧卷实体冷归档集合。
- 冷归档当前只作用于 `memory_chunk`：当候选 chunk 的实体引用全部命中冷归档集合，且不命中当前 `focus/query` 时，会在 retrieval 预过滤阶段被排除。
- 已完成最小收益验证：旧卷噪音样本 `第10章：雾盐旧账` 的 child/parent chunk 会被实际过滤；跨阶段关键线索样本 `第15章：钥印底纹` 会因 `focus_entity_hit` 被保留。
- 当前口径仍保持克制：4.4 最小版已证明“旧卷噪音可被压制且关键线索可被保留”，但暂时只覆盖 `memory_chunk`，还未统一到 `volume_recap / dormant_foreshadow`。

**实体生命周期管理**：
- 图谱不仅记录静态关系（"人物 A 是门派 B 的长老"），还记录**状态变更事件**（"人物 A 在第 800 章被击杀"、"门派 B 在第 1200 章被灭门"）
- 每章生成完成后，Extract Agent 提取实体关系并更新图谱
- 查询时自动过滤已死亡/已毁灭的实体

**创作时自动召回**：
- 当大纲/Contract 提到某个实体时，通过图谱自动拉出其 1-2 度关联的存活实体和道具
- 作为"物理引擎"层的补充，注入到 system prompt 中

#### 4.4 场景隔离与冷归档

400 万字的连载通常跨越多个"世界"或"阶段"（如：凡人界 → 仙界 → 神界）。

**冷归档机制**：
- 当主角进入新阶段（如飞升仙界），前一阶段 90% 的人物和道具标记为**冷存储（Cold Storage）**
- 冷存储实体不参与任何检索和 Prompt 组装
- 除非主角跨界返回或剧情明确关联，才临时激活
- 冷归档的触发可以是手动标记，也可以在卷级大纲切换时自动触发

**战力/数值膨胀对齐**：
- 记录主角在不同阶段的"境界/战力快照"
- 写第 1500 章时，严格约束 AI 只能使用匹配当前境界的技能库
- 防止"练气期的招式在渡劫期还在用"的穿越问题

#### 4.5 向量检索基础设施

- **首选**：SQLite + sqlite-vec（与阶段 3 的 SQLite 生态一致，零额外部署）
- **备选**：PostgreSQL + pgvector（数据量极大或需要并发时切换）
- **Chunk 策略**：Parent chunk（摘要级，每章 1 条）+ Child chunk（场景级，每章 3-5 条）
- **嵌入模型**：优先本地模型（如 bge-m3），降低 API 依赖和成本

**当前进度补充（4.5）**：

- 已补向量后端抽象、`GENERATION_VECTOR_BACKEND` 配置与显式 fallback 说明，当前主实现仍是 `json_cache`
- 已补 embedding 资产治理：当前可稳定区分 `created / reused / rebuilt / skipped`
- 已补独立向量候选召回通道，当前不再只给 lexical top candidates 加向量分
- 已补 `retrievalHitOrigin / retrievalSignals / vectorSimilarity`，当前可直接区分 `lexical_only / vector_only / hybrid`
- 已补 `metadata filter / hybrid recall / dedupe-rerank / selection` 四段调试解释，当前调试结果可直接看到 `pipeline`
- 已补阶段 5 的校准脚本与记录模板，且已完成首轮人工复跑：
  - `embedding-3` 已返回正常非零 `2048` 维向量，向量本体有效性已确认
  - 向量通道启用与 `embedding` 关闭回退两种状态已验证可解释
  - `hybridRecall` 阶段已真实出现 `vector_only / hybrid` 分布，说明 vector recall 已生效
  - 三类扩样样本下，`selection` 均出现 `rescuedVectorOnlyCandidates=1`，最终稳定保留 `vector_only=1 / hybrid=2`
  - 三类扩样样本下，`noiseRetained=无`，disabled 对照均稳定回退为 `lexical_only=2 / vector_only=0 / hybrid=0`
  - Windows 本机 `sqlite-vec` PoC 已通过，`vec0.dll` 可加载，`vec_version / build / write / top-k` 全通过
  - `json_cache` 与 `sqlite-vec` 写入共存已打通，`sqliteVecIndexSync.status=synced`
  - 读路径切换已打通，`embedding-3 + sqlite_vec` 场景下 `vectorSearch.source=sqlite_vec`
  - 当前 `04A` 样本口径下，`sqlite_vec` 对比 `json_cache` 未见明显退化，`vector-only rescue / hybrid 保留 / noiseRetained` 三项表现一致

**当前边界提醒（4.5）**：

- `sqlite-vec` 当前结论仍限于 calibration 样本口径，不等价于所有真实项目章节都会稳定同样表现
- 还没有进入阶段 5 的校准执行记录自动化
- 当前更适合作为“当前样本口径下可收官，后续转回归监测”的状态，再决定是否继续推进 `sqlite-vec`

---

### 阶段 5：高级能力扩展

#### 5.1 追读力债务系统
- 参考 webnovel-writer 的 Override Contract + 债务利息机制
- 软约束违规累积"债务"，超期变 critical
- 通过 `rationale_type` 记录违规理由

#### 5.2 风格适配层
- 参考 webnovel-writer 的 Step 2B Style Adaptation
- 在 Draft 和 Review 之间插入风格转译
- 目标：降低模板腔、说明腔、机械腔
- 当前进度：已落最小版，使用设置中的全局文风 Prompt 触发 `Style` 步骤，并在控制台展示风格转译结果
- 当前补充：`GenerationLabDialog` 已同步接入 `Style / Review / Polish`，便于在单章实验时观察风格层与审查/润色层对正文的直接影响

#### 5.3 题材 Profile 系统
- 参考 webnovel-writer 的 `genres/` 目录
- 不同题材有不同的：爽点偏好、钩子类型、Strand 比例、微兑现类型
- 仙侠/赛博朋克/克苏鲁/言情等预设 Profile

#### 5.4 多模型路由
- 不同步骤使用不同模型：
  - Plan/Extract：快速模型（如 GPT-4o-mini / Haiku）
  - Write：高质量模型（如 GPT-4o / Sonnet / Opus）
  - Review：中等模型

---

## 五、架构演变总览

```
阶段 0（当前）               阶段 1-2                    阶段 3-4
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│   Frontend   │           │   Frontend   │           │   Frontend   │
│  IndexedDB   │           │  IndexedDB   │           │  IndexedDB   │
│  TipTap      │           │  TipTap      │           │  TipTap      │
│  Zustand     │           │  Zustand     │           │  Zustand     │
└──────┬───────┘           └──────┬───────┘           └──────┬───────┘
       │ SSE                      │ SSE                      │ SSE + WS
       ▼                          ▼                          ▼
┌─────────────┐           ┌─────────────┐           ┌─────────────────┐
│   Server     │           │   Server     │           │    Server        │
│  Fastify     │           │  Fastify     │           │  Fastify         │
│  OpenAI 代理 │           │  Plan/Write/ │           │  任务队列        │
│  (无状态)    │           │  Extract API │           │  SQLite          │
│              │           │  (轻状态)    │           │  向量检索        │
└─────────────┘           └─────────────┘           │  Agent 编排      │
                                                     └─────────────────┘
```

## 六、关键决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 服务端持久层 | SQLite（非 PostgreSQL） | 降低部署复杂度，单文件数据库，本地开发友好 |
| 向量检索 | sqlite-vec 优先，pgvector 备选 | 与 SQLite 生态一致，避免额外数据库 |
| Agent 编排 | 自建简单状态机（非 LangGraph/LangChain） | 减少依赖，逻辑透明可调试 |
| 阶段推进方式 | 允许阶段 2/3 交错落地 | 先用服务端任务队列承接完整流水线，再回补 Review/Polish，比严格线性推进更快形成闭环 |
| 前端角色 | 保留完整编辑能力，新增控制台 | 人工精修仍是必需环节 |
| 规则移植 | 提取 Prompt 模板，非代码移植 | webnovel-writer 是 Python/Claude Code，技术栈不同 |
| GraphRAG | 延后，视数据量决定 | <50 万字时 ROI 不明显 |
| Critic Agent | 先用规则校验，AI Critic 作为补充 | AI 校验 AI 容易"和稀泥" |
| 门控策略配置 | 后端运行时可调 + 前端设置页可写 | 避免频繁改环境变量，便于试错和参数标定 |
| 项目级门控 | 优先于全局门控，并在入队时固化到任务请求 | 保证单项目实验不会被后续全局配置变更污染 |

## 七、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| Token 开销膨胀 | 规则+摘要+状态注入增加 prompt 长度 | PromptConfig 可关闭部分规则；摘要压缩 |
| AI 提取状态不准确 | 世界状态错误累积 | 初期"AI 建议 + 人工确认"模式 |
| 生成流水线中断 | 浏览器关闭丢失进度 | 阶段 3 引入服务端持久化任务队列 |
| 门控过严导致吞吐下降 | 任务频繁打回、人工确认堆积 | 运行时门控配置可调，允许快速放宽重写阈值与 Polish 阻断策略 |
| 长篇幻觉累积 | 第 500 章忘记第 10 章的设定 | 分层上下文策略 + 强制设定查询 |
| 过度工程化 | 规则太多导致 AI 输出僵硬 | 规则分层（Hard/Soft/Style），可逐级放松 |
