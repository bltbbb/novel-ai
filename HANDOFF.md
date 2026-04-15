# AI Novel Studio 交接说明

## 1. 当前阶段

当前仓库已经不再处于单纯 MVP 阶段，重点工作已经进入生成引擎与长程记忆增强。

截至本次交接，主线进度可以概括为：

- `Plan → Write → Style → Review → Polish → Extract` 六步链路已存在
- 服务端 SQLite 持久层已接入生成任务、结构化产物、记忆切片、向量缓存
- `Context Assembler` 已具备分层记忆
- 长期记忆、工作记忆、轻量召回与对应调试面板已经补到可继续演进的状态

建议把当前版本理解为：

> 已具备“服务端有状态生成 + 分层记忆 + 可调试轻量召回”的第一版生成引擎，而不是早期 MVP 写作器。

---

## 2. 本轮实际落地

### 2.1 卷级长期记忆

已新增卷级总结持久层：

- `generation_volume_recaps`
- 章节 `Extract` 成功后会自动重建当前卷 recap
- `long_term_memory` 优先读取持久化卷总结
- 历史项目可通过维护入口回填卷总结

对应关键文件：

- `server/src/services/generation-volume-recap-store.ts`
- `server/src/services/generation-context.ts`
- `server/src/routes/generation-maintenance.ts`
- `app/src/components/GenerationWorkspace.tsx`

### 2.2 伏笔服务端化

已新增服务端伏笔快照表：

- `generation_foreshadows`

当前同步来源：

- `GenerationLabDialog` 直连 `/api/ai/*`
- 服务端任务入队请求

当前作用：

- `working_memory` 不再只依赖前端 `contextBundle` 文本里的“激活伏笔”
- 服务端可直接从 SQLite 读取伏笔快照构建工作记忆

对应关键文件：

- `server/src/services/generation-foreshadow-store.ts`
- `server/src/services/generation.ts`
- `server/src/services/generation-job-runner.ts`
- `app/src/lib/generation-foreshadow-snapshot.ts`

### 2.3 伏笔生命周期最小升级

前端本地状态仍然保留：

- `planted`
- `activated`
- `resolved`
- `overdue`

但服务端已经额外派生出一层生命周期：

- `active`
- `dormant`
- `archived`

当前派生规则：

- `resolved` -> `archived`
- `activated / overdue` -> `active`
- `planted` 且距来源章节超过 20 章 -> `dormant`
- 其余 `planted` -> `active`

这意味着：

- 工作记忆只注入 `active` 伏笔
- `dormant` 伏笔不会再常驻 `working_memory`

### 2.4 休眠伏笔按需召回

已补第一版休眠伏笔召回：

- 基于 `queryPhrases`
- 基于 `focusEntityNames`
- 命中后进入 `retrieval_memory`

当前不是走独立 retrieval service，也不是向量召回，只是服务端 Context 内的轻量匹配。

### 2.5 统一轻量召回排序

目前会进入统一轻量召回排序的两类来源：

- 休眠伏笔召回
- 卷级总结召回

两者会先按统一轻量分数排序，再一并注入 `retrieval_memory`。

### 2.6 轻量召回调试明细

调试面板现在可以直接看到每条轻量召回项的：

- 来源类型
- 标题
- 总分
- 命中词
- 命中实体
- 分项分数
- 最终注入文本

当前分项包括：

- `phrase`
- `entity`
- `recency`

### 2.7 轻量召回运行时配置

轻量召回参数已经进入运行时配置：

- `lightweightRecall.minScore`
- `lightweightRecall.topK`
- `lightweightRecall.phraseWeight`
- `lightweightRecall.entityWeight`
- `lightweightRecall.recencyWeight`

并且已经贯通到：

- 服务端默认环境变量
- SQLite 运行时配置
- 设置页
- 项目级覆盖
- 任务固化后的请求
- Context 实际计算
- 生成控制台“当前生效门控”摘要

当前前端还额外补了第一版标定辅助入口：

- 设置页可直接切换轻量召回权重预设
- 项目级覆盖也可切换同一套预设
- 当前内置 4 组起点：`均衡 / 实体优先 / 近期优先 / 关键词优先`

### 2.8 轻量召回并入 retrieval service

当前 `retrieval service` 已不再只返回 memory chunks：

- 休眠伏笔召回已并入 `generation-retrieval.ts`
- 卷级总结召回已并入 `generation-retrieval.ts`
- `generation-context.ts` 不再单独维护第二套轻量召回排序
- 生成控制台“检索候选”当前会直接展示统一检索结果

这意味着：

- Context 注入与 retrieval 调试现在共享同一套召回主链
- 轻量召回与 memory chunks 已统一在服务端检索层汇总、排序与输出
- 后续如果要继续做 rerank 或 GraphRAG 前置过滤，改动入口会更集中

### 2.9 4.3a 结构化关系查询起步（最小验证）

阶段 4.3a 已起步并完成最小验证，当前口径是“已验证可用”，不是完整图谱能力：

- 已新增只读调试入口：`GET /api/runtime/generation-debug/relationship-query`
- 当前查询结果有两种模式：
  - `graph_1hop`：命中历史一度关系边
  - `degraded`：关系不足或噪音高时返回降级线索
- 两条查询路径均已验证可用：
  - 指定实体路径（`entityName`）
  - 上一章实体回退路径（未指定 `entityName`）
- 已确认一个边界：指定实体在历史边不足时会降级到 `degraded`
- 当前建议的后续接入策略：`graph_1hop` 优先，`degraded` 回退
- 4.3a 最小接入生成链路已验证通过：结构化结果当前仅在 Context 的 `relationships` 层消费，且现有 context/debug 输出可直接看出命中模式与注入位置。
- 相对空的 `relationships` 基线，4.3a 扩样结果显示该层信号增量存在稳定分层（`graph_1hop` / `degraded`），不是个别样本现象。
- 当前样本下，`graph_1hop` 主要覆盖中后期或关系较明确章节，`degraded` 主要出现在早期或关系稀薄章节。
- 扩样统计 `worldStateRequiredCount = 0`，说明当前样本中强关系命中不依赖额外补 `worldState`；阶段口径仍是“可用起步版”，不是“所有章节稳定覆盖”的最终形态。
- 当前仅能证明 `relationships` 层信号价值增加，不等价于整体生成质量已提升。
- 以上结论仅说明 4.3a 接入可用，不等同于已具备进入 4.3b 的充分条件。

### 2.10 4.4 场景隔离与冷归档（最小验证）

阶段 4.4 已落最小可用版，当前口径是“旧卷噪音可压制、关键线索可保留”，不是完整跨世界隔离：

- 当前以“进入新卷”作为阶段切换代理，在服务端从 `generation_entities.last_seen_volume_title` 派生旧卷实体冷归档集合
- 当前只作用于 `memory_chunk`
- 仅当候选 chunk 的实体引用全部命中冷归档集合，且不命中当前 `focus/query` 时，才会被过滤
- 已验证两类样本：
  - 旧卷噪音样本 `第10章：雾盐旧账` 会被实际过滤
  - 跨阶段关键线索样本 `第15章：钥印底纹` 会因 `focus_entity_hit` 被保留
- 为避免 `tsx` 缓存导致旧样本残留，当前 calibration 相关脚本已统一禁用缓存
- 当前边界仍然清晰：
  - 只覆盖 `memory_chunk`
  - 不外推到 `volume_recap / dormant_foreshadow`
- 不等价于完整“跨世界 / 跨阶段”隔离能力

### 2.11 4.3b 二度关系查询（已完成最小正式接入）

阶段 4.3b 当前已从“只读 PoC”推进到“最小正式接入已落地”，但当前接入范围仍保持克制：

- 已新增只读调试入口：
  - `GET /api/runtime/generation-debug/relationship-query-2hop`
  - `GET /api/runtime/generation-debug/relationship-query-2hop-preview`
- 当前正向样本已验证可输出 `graph_2hop`
- 当前负样本已验证两类降级：
  - `no_two_hop_relationship`
  - `high_noise`
- 当前已完成门槛汇总验证：
  - 正样本 `3/3` 通过
  - 负样本 `2/2` 通过
  - 当前结论为 `decision=pass`
- 当前已完成最小消费实验：
  - 正样本可直接产出 `relationships_experimental_2hop` 注入块
  - 负样本会稳定降级为弱提示块
- 当前已完成最小正式接入：
  - Context `relationships` 层当前已受控消费 4.3b 结果
  - 当前策略为：`graph_1hop` 优先，`graph_2hop` 在一度高噪音或强信号不足时补位，`degraded` 保底回退
  - 若 `graph_2hop` 只是在重复一度层已覆盖的实体链，当前不会再额外冗余补充
- 当前已完成主链样本校准：
  - 已新增 `server/src/scripts/run-calibration-round43b-context.ts`
  - 当前已覆盖 3 组仿真实战场景：`2` 组 `graph_2hop` 补位、`1` 组 `graph_1hop` 主信号补充二度路径
  - 仿真实战扩样当前为 `pass=3/3`、`decision=pass`
  - 关系层焦点实体当前已收紧为“当前章节主实体优先，其次显式命中实体”，以减少一度过宽焦点对 2hop 补位的抢占
- 当前已完成非触发归因：
  - 已新增 `server/src/scripts/run-calibration-round43b-nontrigger-analysis.ts`
  - 当前已可稳定分型 4 类未命中 `graph_2hop` 的近似真实项目场景：
    - `onehop_sufficient`
    - `twohop_redundant`
    - `sparse_history`
    - `onehop_noise_without_twohop`
  - 当前归因脚本结果为 `pass=4/4`、`decision=pass`
- 当前已完成分布观察：
  - 已新增 `server/src/scripts/run-calibration-round43b-distribution.ts`
  - 当前 synthetic 样本分布为：`graph_2hop=2 / graph_1hop=3 / degraded=2`
  - 当前 synthetic 非触发分布为：`onehop_sufficient=1 / twohop_redundant=1 / sparse_history=1 / onehop_noise_without_twohop=1`
  - 当前 demo 样本分布为：`graph_1hop=3 / degraded=5`
  - 当前 demo 非触发分布为：`onehop_sufficient=3 / sparse_history=5`
- 当前已完成噪音降级保底：
  - 在 `onehop_noise_without_twohop` 场景下，即使最终仍为 `degraded`，当前也会优先保留 1 条高置信一度边作为“弱结构提示”
  - 当前不再只剩同章共现弱提示，便于继续人工判断是否值得追查
- 当前口径保持克制：
  - 仅说明 4.3b 已最小正式并入 Context `relationships` 层
  - 不等价于已并入 retrieval 主链
  - 不等价于整体生成质量已提升
  - 当前 `demo-project-last-cultivator` 扩样下仍为 `graph2hopCount = 0`，说明补位样本已打通，但默认 demo 项目还未出现稳定 2hop 触发覆盖

### 2.12 4.5 向量检索基础设施（当前阶段）

阶段 4.5 当前已补到“主链可用 + 调试可解释 + 校准闭环已跑完”的状态，且 `sqlite-vec` 已完成当前样本口径下的正式验证：

- 已补向量后端抽象与显式回退状态：
  - `GENERATION_VECTOR_BACKEND`
  - `json_cache` 当前可用
  - `sqlite_vec` 写入共存与读路径切换当前样本口径下已验证通过
- 已补 embedding 资产治理口径：
  - `created`
  - `reused`
  - `rebuilt`
  - `skipped`
  - `skipped` 当前已细分：
    - `embedding_disabled`
    - `empty_content`
    - `embedding_failed`
- 已补独立向量候选召回通道：
  - 当前不再只对 lexical top candidates 加向量分
  - 当前已允许 `lexical_only / vector_only / hybrid` 三类命中
- 已补 retrieval 主链四段结构与解释字段：
  - `metadata filter`
  - `hybrid recall`
  - `dedupe-rerank`
  - `selection`
  - 调试结果当前可直接查看：
    - `vectorSearch diagnostics`
    - `pipeline`
    - `retrievalHitOrigin / retrievalSignals / vectorSimilarity`
    - `preRerankScore / rerankDelta / rerankReasons`
- 已补阶段 5 校准/交接脚本与记录模板：
  - `server/src/scripts/run-calibration-round45-vector-recall.ts`
  - `server/src/scripts/run-calibration-round45-embedding-assets.ts`
  - `RETRIEVAL-CALIBRATION.md`
  - `RETRIEVAL-CALIBRATION-LOG.md`

当前口径要保持克制：

- 当前能说明 `4.5` 在 calibration 样本口径下已完成最大可验证闭环
- 不等价于 `sqlite-vec` 已在所有真实项目章节上完成终态验证
- 不等价于动态校准结论已经最终收敛
- 当前更适合作为“样本口径下收官、后续转回归监测”的状态，而不是继续优先扩主链

### 2.13 滚动规划裂变（功能已完成，待验证）

当前“AI 裂变本卷”已经从一次性整卷裂变，升级为**里程碑驱动 + 批次规划 + 历史锚定**的滚动规划模式。

当前已落地：

- 卷纲已升级为：
  - `estimatedChapterCount`
  - `milestones[]`
- 空卷已支持直接自动建章裂变
- `ChapterBeat` 已新增 `milestoneIndex`
- 已新增历史摘要构建器：
  - 正文摘要优先
  - 无摘要时回退 beat 摘要
  - 不读取未确认草稿正文
- 服务端裂变请求已支持：
  - `milestoneIndex`
  - `startChapterNumber / endChapterNumber`
  - `estimatedTotalChapters`
  - `currentMilestone`
  - `historySummaries`
- 服务端裂变 prompt 已支持：
  - 注入历史摘要
  - 注入当前里程碑说明
  - 限定本次规划范围
- 前端 `OutlineView` 已支持：
  - 里程碑状态：`未规划 / 已规划 / 已推进`
  - beat 列表按里程碑分组
  - 未规划阶段占位卡
  - “裂变此阶段”
  - 裂变设置弹层
  - 全卷回退模式 / 里程碑模式切换
  - 阶段模式下的“本次规划章数”
  - 续规划下一批次
  - 重裂变覆盖提示
  - 保留已有章节标题的提示
- 章节拍保存语义已改为支持**局部替换**，不再要求整卷覆盖

当前未做：

- 尚未执行本地构建 / 测试
- 尚未执行完整手工流程验证

因此当前口径应理解为：

> 滚动规划裂变功能已实现到“可进入验证”的状态，下一步不再是补功能，而是验证与小修。

### 2.14 长篇生成前置能力补强（已实现并完成基础验证）

围绕“书纲 -> 卷纲 -> 里程碑 -> 章节拍”这条时间轴，当前已补完第一版前置能力增强，目标是让立项、实体轴与长线暗线能更稳定地进入后续自动化生成。

当前已落地：

- 已增强现有 `InspirationDialog`，不是新造第二套入口
- 项目列表当前同时保留：
  - 直接创建项目
  - 灵感入口
- 已新增服务端结构化提炼接口：
  - `POST /api/ai/inspiration-blueprint`
- 灵感入口当前已支持：
  - 多轮讨论
  - `coverage` 四项 checklist
  - 一键生成项目
  - 初始 `Lore / Foreshadow` 落库
  - 书纲生成
  - 第一卷卷纲与里程碑生成
- 卷纲与里程碑当前已新增：
  - `requiredEntities`
  - `requiredForeshadows`
- 以上新字段当前已贯通：
  - 前后端类型
  - 前端本地保存
  - 序列化
  - 归档导入导出
  - 服务端 `volume-outline / volume-milestones` 归一化
- 运行时上下文当前已开始消费：
  - `requiredEntityNames`
  - `requiredForeshadowTitles`
- 当前策略是：
  - `requiredEntities` 合并进服务端 `focusEntityNames`
  - `requiredForeshadows` 同时影响 active foreshadow 注入与 dormant foreshadow recall
- 若灵感入口或卷纲/里程碑引用了尚未存在的实体，当前会自动创建带 `#placeholder` 标签的占位 `Lore`
- 已新增当前卷规划修正接口：
  - `POST /api/ai/volume-plan-reconcile`
- 前端 `OutlineView` 当前已支持：
  - 修正规划按钮
  - 新旧两栏建议稿对比
  - 一键覆盖当前卷规划
- `GenerationView` 当前已补轻量入口：
  - 可直接跳回大纲页修正规划

本轮已实际验证：

- 前端构建通过：`app/npm run build`
- 后端构建通过：`server/npm run build`
- 已通过 e2e：
  - `records-foreshadow.spec.ts`
  - `settings-gate-config.spec.ts`
  - `archive-import.spec.ts`
  - `inspiration-entry.spec.ts`
  - `volume-plan-reconcile.spec.ts`
- 常用回归脚本当前已更新：
  - `test:e2e:records` 已纳入 `inspiration-entry.spec.ts`
  - `test:e2e:generation` 已纳入 `volume-plan-reconcile.spec.ts`

当前专项文档：

- `长篇生成前置能力补强方案.md`

当前口径要保持准确：

- 这一轮可以视为“代码实现完成 + 基础验证已通过”
- 不等价于已完成所有灵感入口产品化细节
- 不等价于 Drift Correction 已进入自动修正阶段
- 当前更适合转入后续真实使用观察与小修，而不是继续大改架构

---

## 3. 当前配置流转

轻量召回相关配置当前流转顺序如下：

1. 服务端默认值  
   来自 `server/src/config/env.ts`

2. 运行时全局配置  
   读写 `/api/runtime/generation-gate`

3. 项目级覆盖  
   保存在前端本地 `Project.generationGateOverride`

4. 入队时固化到任务请求  
   `GenerationJobRequest.gateConfigOverride`

5. 执行时生效  
   `generation-job-runner.ts` 将当前生效门控传入 `generation.ts`

6. Context 实际读取  
   `generation-retrieval.ts` 与 `generation-context.ts` 按生效值执行统一检索与上下文注入

这条链路现在已经闭合，不是只展示不生效。

当前做参数标定时，建议优先从内置预设起步：

- `均衡`
- `实体优先`
- `近期优先`
- `关键词优先`

对应记录模板与观察方法见：

- `RETRIEVAL-CALIBRATION.md`
- `RETRIEVAL-CALIBRATION-LOG.md`

如果需要快速准备一组可直接观察的样本：

- 前端开发模式首次进入会写入稀疏章序 demo 项目
- 服务端可在 `server/` 目录执行 `npm run seed:calibration`
- 第二轮标定入口可直接执行 `npm run calibration:round2`

---

## 4. 当前默认值

轻量召回默认值：

- `minScore = 3`
- `topK = 4`
- `phraseWeight = 2`
- `entityWeight = 3`
- `recencyWeight = 1`

服务端环境变量：

```env
GENERATION_LIGHTWEIGHT_RECALL_MIN_SCORE=3
GENERATION_LIGHTWEIGHT_RECALL_TOP_K=4
GENERATION_LIGHTWEIGHT_RECALL_PHRASE_WEIGHT=2
GENERATION_LIGHTWEIGHT_RECALL_ENTITY_WEIGHT=3
GENERATION_LIGHTWEIGHT_RECALL_RECENCY_WEIGHT=1
```

对应文件：

- `server/src/config/env.ts`
- `app/src/lib/generation-gate-defaults.ts`

---

## 5. 关键文件索引

### 5.1 服务端

- `server/src/services/generation-context.ts`
  现在负责分层上下文组装，并消费统一检索结果

- `server/src/services/generation-retrieval.ts`
  当前统一承接 memory chunks、休眠伏笔召回与卷级总结召回

- `server/src/services/generation-volume-recap-store.ts`
  卷级总结落库与读取

- `server/src/services/generation-foreshadow-store.ts`
  服务端伏笔快照、生命周期派生的基础来源

- `server/src/services/generation-gate-config-store.ts`
  运行时配置归一化与 SQLite 存储

- `server/src/services/generation-job-runner.ts`
  任务执行链路，当前已把生效门控传到 Context

- `server/src/services/generation-debug-store.ts`
  Context 调试输出与轻量召回明细

### 5.2 前端

- `app/src/components/GenerationWorkspace.tsx`
  当前最重要的调试与控制台入口

- `app/src/components/GenerationLabDialog.tsx`
  单章实验流，当前会同步伏笔快照

- `app/src/components/SettingsDialog.tsx`
  全局运行时配置入口

- `app/src/lib/generation-foreshadow-snapshot.ts`
  前端伏笔 -> 服务端快照转换

- `app/src/stores/project-store.ts`
  项目级门控覆盖归一化

---

## 6. 当前调试入口

### 6.1 前端

生成控制台的 SQLite 调试面板当前可直接查看：

- 卷级总结
- 服务端伏笔
- Context 预览
- 轻量召回排序
- 检索候选
- 结构化章节明细

### 6.2 服务端 API

运行时配置：

- `GET /api/runtime/generation-gate`
- `PUT /api/runtime/generation-gate`

维护入口：

- `POST /api/runtime/generation-maintenance/backfill-memory-chunks`
- `POST /api/runtime/generation-maintenance/backfill-memory-embeddings`
- `POST /api/runtime/generation-maintenance/backfill-volume-recaps`

调试入口：

- `GET /api/runtime/generation-debug/overview`
- `GET /api/runtime/generation-debug/chapters`
- `GET /api/runtime/generation-debug/chapter-detail`
- `GET /api/runtime/generation-debug/context`
- `GET /api/runtime/generation-debug/entities`
- `GET /api/runtime/generation-debug/foreshadows`
- `GET /api/runtime/generation-debug/relationships`
- `GET /api/runtime/generation-debug/relationship-query`
- `GET /api/runtime/generation-debug/volume-recaps`
- `GET /api/runtime/generation-debug/chunks`
- `GET /api/runtime/generation-debug/retrieval`

---

## 7. 当前已知边界

### 7.1 已做但还是第一版

- 卷级总结召回仍然是轻量匹配，不是完整 rerank
- 休眠伏笔召回与卷总结召回虽然已并入 retrieval service，但当前仍是第一版混排，不是完整 rerank
- 生命周期规则仍然是“最小派生层”，不是最终完整状态机
- 冷归档当前只覆盖 `memory_chunk`，还没有统一约束到 `volume_recap / dormant_foreshadow`
- 向量后端当前虽然已完成 `sqlite_vec` 样本级验证，但仍未进入全量项目/长期运行验证

当前已确认并修复一处基础问题：

- 未来卷总结不再参与当前章节统一检索结果，避免标定和真实生成时出现“未来信息泄漏”

当前调试结果已补到可解释口径：

- `vectorSearch diagnostics`
- `pipeline`
- `retrievalHitOrigin / retrievalSignals / vectorSimilarity`
- `preRerankScore / rerankDelta / rerankReasons`

### 7.2 还没有做

- `sqlite-vec` 当前仍未进入全量项目/长期运行验证
- 4.3b 当前仍未并入 retrieval 主链
- 4.3b 当前虽已最小正式接入 Context `relationships` 层，但默认 demo 项目与真实项目下的 `graph_2hop` 触发覆盖仍需继续扩样
- 当前结论仍限于 calibration 样本口径，不等价于已完成所有真实项目回归验证

---

## 8. 建议下一步

最顺的下一步建议是分两条线并行管理，而不是继续把所有工作都压在 4.5 上：

1. 当前已确认：
   - `created / reused / rebuilt / skipped` 资产口径已动态验证通过
   - provider 与 embedding 调用层问题已解决，`embedding-3` 已返回正常非零 `2048` 维向量
   - 向量召回已真实生效，`hybridRecall` 与 `selection` 两个阶段都已稳定保留少量 `vector_only`
   - 三类扩样样本下，`rescuedVectorOnlyCandidates=1`、最终结果稳定为 `vector_only=1 / hybrid=2`，且 `noiseRetained=无`
   - disabled 对照场景均稳定回退为 `lexical_only=2 / vector_only=0 / hybrid=0`
   - `sqlite-vec` PoC、写入共存、读路径切换与 `json_cache` 对比验证当前样本口径下均已 through
   - 4.3b 当前正向样本、负样本、门槛汇总与最小消费实验均已通过
   - 4.3b 当前已最小正式接入 Context `relationships` 层，且主链 `graph_2hop` 补位校准样本已通过
   - 4.3b 当前已补“未命中 `graph_2hop` 的章节类型归因”，4 类近似真实项目样本已分型 through
2. 当前阶段结论：
   - 当前样本口径下，vector-only rescue 机制已跨样本稳定，且控噪成立
   - 当前样本口径下，强 `hybrid` 结果未见明显误伤
   - 当前样本口径下，`sqlite_vec` 相比 `json_cache` 未见明显退化
   - 当前样本口径下，4.3b 已从“主链接入评估”推进到“最小正式接入已完成”
   - 当前样本口径下，`graph_2hop` 主链补位分支已可复跑验证，但默认 demo 项目还未出现稳定命中
   - 当前样本口径下，4.3b 未触发 `graph_2hop` 的原因已可收敛到 4 类，而不再只是笼统记为“没命中”
   - 当前 demo 项目里的非触发主要仍集中在 `sparse_history`，说明短板更像“历史边不足”，而不是“2hop 规则没开”
3. 下一步建议：
   - `4.5` 当前更适合作为“已完成最大可验证闭环”的状态收官，后续转回归监测
   - `4.3b` 当前更适合进入“接入后定向校准与边界复核”，继续观察 4 类非触发场景在后续样本中的占比变化
   - 当前最值得继续盯的是 `onehop_noise_without_twohop`，因为其余 3 类更多是“合理不触发”而不是“策略缺陷”
   - 若后续继续推进 `onehop_noise_without_twohop`，优先尝试“单次备选焦点重试”：仅在首选焦点命中 `degraded + high_noise + no_two_hop_relationship` 时，使用第 2 候选焦点实体再试 1 次关系层
   - 优先复核 `focusEntityNames` 选择是否过宽，以及是否需要为 4.3b 增加显式门控或调试摘要
   - 若后续真实项目样本中出现噪音上升、`vector-only` 大面积消失，或 `sqlite_vec` 相比 `json_cache` 出现明显退化，再回到 4.5 做定点复核
   - 生成质量侧当前新增一条独立建议：优先落 `Language QA Checker`，专门处理语病、错字、搭配不当、局部逻辑矛盾、未铺垫专名与称谓/指代漂移；不要继续把这类语言校对问题全压在 `Polish` 上
   - 当前推荐链路为：`Plan → Write → Style → Review → Language QA → Polish → Extract`
   - 第一版先独立展示，不急着并入正式 `review.checkerResults`
   - 与 `Language QA` 并列的另一条生成质量主线是 `powerDelta / 能力一致性链`：它不处理语病，而专门处理“能力跃迁过大、敌我强弱标尺不稳、环境限制失真、强敌前后表现不一致”
   - 当前建议的推进顺序不是先做完整能力档案系统，而是：先让章节拍里的 `powerDelta` 真正被生成、被注入、被检查；再让 `Extract` 回写能力变化/限制暴露；最后再做独立的能力档案页
   - 后续页面规划建议新增“运行态能力面板”：重点展示人物能力层级、伤势、器具可用性、敌方限制条件，以及最近几章 `powerDelta / stateChanges` 轨迹

---

## 9. 本轮执行情况

本轮已执行：

- `app/npm run test:e2e:generation`
- `app/npm run build`
- `server/npm run build`
- `server/npm run seed:calibration`
- `server/npm run calibration:round2`
- `server/npm run calibration:round43a-context`
- `server/npm run calibration:round43a-expansion`
- `server/npm run calibration:round43b-context`
- `server/npm run calibration:round43b-nontrigger`
- `server/npm run calibration:round43b-distribution`
- 冷归档最小收益验证脚本（直接读取 SQLite 校验过滤/放行结果）
- 其中后 3 条为 2A+2B 落地后的复跑校验命令

本轮还已补齐但默认未主动执行：

- `server/src/scripts/run-calibration-round45-vector-recall.ts`
- `server/src/scripts/run-calibration-round45-embedding-assets.ts`
- `RETRIEVAL-CALIBRATION.md` 中的 4.5 闭环执行说明
- `RETRIEVAL-CALIBRATION-LOG.md` 中的 4.5 记录模板

本轮人工已执行并回填：

- `04A` 向量召回与回退：
  - `embedding-3` 已返回正常非零 `2048` 维向量，query 与 3 个样本向量 `l2Norm = 1` 且 cosine similarity 可解释
  - `vectorSearch.status = active`，`matchedCandidateCount = 4`
  - `hybridRecall` 分布为 `lexicalOnlyCount=0 / vectorOnlyCount=3 / hybridCount=1`
  - 扩样后，三类样本在 `selection` 中均出现 `rescuedVectorOnlyCandidates=1`，最终稳定保留 `vector_only=1 / hybrid=2`，且 `noiseRetained=无`
  - disabled 对照场景均稳定回退为 `lexical_only=2 / vector_only=0 / hybrid=0`
  - 结论：provider 与 embedding 调用层问题已解决，向量召回已真实生效；当前样本口径下，vector-only rescue 机制已跨样本稳定且控噪成立
- `04C` sqlite-vec 对比验证：
  - Windows 本机 `sqlite-vec` PoC 已通过，官方 `vec0.dll` 可加载，`vec_version / build / write / top-k` 全通过
  - `json_cache` 与 `sqlite-vec` 写入共存已打通，`sqliteVecIndexSync.status=synced`
  - 读路径切换已打通，`embedding-3 + sqlite_vec` 场景下 `vectorSearch.source=sqlite_vec`
  - 当前 `04A` 样本口径下，`sqlite_vec` 相比 `json_cache` 在 vector-only rescue、hybrid 保留、noiseRetained 三项上未见明显退化
- `43B` 二度关系查询只读 PoC：
  - 正向样本已稳定命中 `graph_2hop`
  - 负样本已稳定命中 `degraded / no_two_hop_relationship`
  - 负样本已稳定命中 `degraded / high_noise`
  - 门槛汇总结果为：正样本 `3/3`、负样本 `2/2`，`decision=pass`
  - 最小消费实验已通过：正样本可产出 `relationships_experimental_2hop` 注入块，负样本稳定降级为弱提示块
  - 主链最小正式接入已通过：Context `relationships` 层当前已可在 `graph_1hop` 优先下受控消费 `graph_2hop`
  - 主链仿真实战样本已通过：`run-calibration-round43b-context.ts` 当前已稳定覆盖 `graph_2hop` 补位与 `graph_1hop` + 2hop 补充两类场景
  - 非触发归因样本已通过：`run-calibration-round43b-nontrigger-analysis.ts` 当前已稳定分出 4 类“为何没有触发 graph_2hop”的场景
  - 结论：当前样本口径下，4.3b 已从“主链接入评估”推进到“最小正式接入已完成”
- `04B` Embedding 资产口径：
  - Pass1：`created=2 / skipped=1`
  - Pass2：`reused=2 / skipped=1`
  - Pass3：`reused=1 / rebuilt=1 / skipped=1`
  - Pass4：`embedding_disabled=2 / empty_content=1`
  - 结论：`created / reused / rebuilt / skipped` 口径已动态验证 through，`embedding_disabled` 与 `empty_content` 已分型成立

因此当前交接文档反映的是：

> 统一检索主链、4.3a 最小消费接入、4.4 最小冷归档、4.5 向量检索基础设施样本级闭环验证，以及 4.3b 只读验证/最小消费实验/Context 最小正式接入/非触发归因都已落地；当前更适合让 4.5 转入回归监测，并把 4.3b 主线切到“接入后定向校准与边界复核”。

补充一条生成质量口径：

> 当前已确认一类新问题不适合继续用“资源/物件/称谓专题硬规则”零散兜底，而更适合沉淀为独立 `Language QA Checker`：其目标是专门拦截语病、错别字、局部逻辑矛盾与语言层小型幻觉；`Polish` 仍负责修问题与润色，不再承担全部语言校对职责。

再补一条能力一致性口径：

> 当前已确认另一类问题不属于语病，也不属于资源守恒，而是能力标尺失稳：如“前文只体现小幅稳定性提升，后文却突然具备明显战斗跃迁”或“敌方既能打裂船舷，又会被普通障碍长时间拖住”。这类问题更适合走 `powerDelta → Write/Review → Extract → 能力档案页` 这条能力一致性链，不应继续混入 `Language QA` 处理。

---

## 10. 交接建议阅读顺序

建议接手人按以下顺序阅读：

1. `HANDOFF.md`
2. `ROADMAP.md`
3. `PLAN.md`
4. `server/src/services/generation-context.ts`
5. `server/src/services/generation-volume-recap-store.ts`
6. `server/src/services/generation-foreshadow-store.ts`
7. `app/src/components/GenerationWorkspace.tsx`

如果是继续跟进 `4.3b`，建议再补看：

1. `server/src/services/generation-debug-store.ts`
2. `server/src/scripts/run-calibration-round43b-context.ts`

如果是要继续改配置链路，再补看：

1. `server/src/services/generation-gate-config-store.ts`
2. `server/src/routes/runtime-config.ts`
3. `app/src/components/SettingsDialog.tsx`

---

## 11. 总监式接手说明

如果切到新窗口继续推进，建议按“总监 / 总控”方式执行，而不是直接单线程写代码。

### 11.1 当前总方向

- 主线优先跟 `ROADMAP.md`
- 不跟 `PLAN.md` 里的产品化优先级走
- 先做完整功能，再考虑产品化能力
- 当前更适合让 `4.5` 转入回归监测，并把主线切到 `4.3b` 接入后定向校准与边界复核

### 11.2 当前建议的下一个完整功能

优先建议：

1. `4.3b` 接入后定向校准与边界复核
2. 基于校准结果决定是否继续扩 `graph_2hop` 覆盖、门控或调试口径
3. `4.5` 转回归监测，暂不继续扩主链

暂不建议：

- 回到 `I6` 产品化能力
- 再继续扩主检索逻辑而不先复核 4.3b 接入后的覆盖与边界

### 11.3 执行模式要求

- 采用分步执行模式推进
- 每轮拆成 `4-6` 个阶段
- 每阶段开始前先写清楚：
  - 目标
  - 验收条件
- 一个 codex 负责实现
- 另一个 codex 负责全程监工
- 监工 codex 只做 review，不直接修改业务代码
- 每阶段结束后必须输出：
  - 是否通过
  - 风险点
  - 是否继续下一步
- 一旦发现跑偏，先暂停实现，再调整计划

### 11.4 监工重点

- 需求是否跑偏
- 接口是否一致
- 边界条件是否漏掉
- 回归风险
- 测试缺口

### 11.5 模型建议

- 实现 codex：优先使用 `gpt-5.4` + `xhigh`
- 监工 codex：保持高推理强度，重点做阶段 review 与终审

---

## 12. 新窗口启动说明

下面这段可以直接交给新窗口：

```md
请以“总监 / 总控”方式继续当前仓库，不要单线程直接写代码。

执行要求：

1. 主线优先跟 `ROADMAP.md`
2. 不跟 `PLAN.md` 的产品化优先级走
3. 先做完整功能，再说产品化
4. 采用分步执行模式，每轮拆成 4-6 个阶段
5. 每阶段开始前先说明目标和验收条件
6. 一个 codex 负责实现，另一个 codex 负责监工
7. 监工 codex 只做 review，不直接改业务代码
8. 每阶段都给出：
   - 是否通过
   - 风险点
   - 是否继续下一步
9. 如果发现跑偏，先暂停实现并调整计划
10. 实现 codex 优先使用 `gpt-5.4 xhigh`

当前仓库主线状态：

- 统一检索主链已完成
- 4.3a 最小结构化关系查询已完成，并已最小接入 Context `relationships` 层
- 4.3a 扩样收益验证已完成，但结论只说明 `relationships` 层信号价值增加，不等价于整体生成质量提升
- 4.3b 只读 PoC、正负样本验证、门槛汇总与最小消费实验已完成，并已最小正式接入 Context `relationships` 层
- 4.3b 当前主链策略为：`graph_1hop` 优先、`graph_2hop` 补位、`degraded` 回退
- 4.3b 已新增主链校准样本，当前可稳定复现 `graph_2hop（补位强信号）`
- 4.4 最小冷归档已完成，已证明旧卷噪音可压制、关键线索可保留，但当前只覆盖 `memory_chunk`
- 4.5 向量检索基础设施当前样本口径下已完成最大可验证闭环，`sqlite-vec` 写入/读路径都已验证 through
- 当前不建议回到 I6 产品化能力

当前建议的下一步：

1. 先做 `4.3b` 接入后定向校准与边界复核：
   - 继续扩样观察真实项目里 `graph_2hop` 的触发覆盖
   - 继续观察 `onehop_sufficient / twohop_redundant / sparse_history / onehop_noise_without_twohop` 这 4 类非触发场景的占比变化
   - 复核 `focusEntityNames` 选择是否过宽，是否影响 2hop 补位命中
   - 决定是否为 4.3b 增加显式门控、调试摘要或更细粒度校准脚本
2. `4.5` 暂时转回归监测：
   - 继续观察 `vector_only / hybrid / noiseRetained`
   - 继续观察 `sqlite_vec` 相比 `json_cache` 是否退化

接手前建议先阅读：

1. `HANDOFF.md`
2. `ROADMAP.md`
3. `PLAN.md`
4. `server/src/services/generation-retrieval.ts`
5. `server/src/services/generation-context.ts`
6. `server/src/services/generation-debug-store.ts`
7. `server/src/routes/generation-debug.ts`
8. `server/src/services/generation-cold-storage.ts`
9. `RETRIEVAL-CALIBRATION.md`
10. `RETRIEVAL-CALIBRATION-LOG.md`
```
