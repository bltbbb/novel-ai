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

### 2.11 4.3b 二度关系查询（已完成最小消费实验）

阶段 4.3b 当前已从“只读 PoC”推进到“门槛验证 + 最小消费实验已通过”，但仍未正式接入生成主链：

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
- 当前口径保持克制：
  - 仅说明 4.3b 已具备进入“主链接入评估”的条件
  - 不等价于已正式并入 Context `relationships` 层
  - 不等价于整体生成质量已提升

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
- 4.3b 当前仍未正式接入 Context / retrieval 主链
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
2. 当前阶段结论：
   - 当前样本口径下，vector-only rescue 机制已跨样本稳定，且控噪成立
   - 当前样本口径下，强 `hybrid` 结果未见明显误伤
   - 当前样本口径下，`sqlite_vec` 相比 `json_cache` 未见明显退化
   - 当前样本口径下，4.3b 已具备“进入主链接入评估”的条件
3. 下一步建议：
   - `4.5` 当前更适合作为“已完成最大可验证闭环”的状态收官，后续转回归监测
   - `4.3b` 当前更适合进入“主链接入评估”，先设计最小接入策略，再决定是否接入 Context `relationships`
   - 若后续真实项目样本中出现噪音上升、`vector-only` 大面积消失，或 `sqlite_vec` 相比 `json_cache` 出现明显退化，再回到 4.5 做定点复核

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
  - 结论：当前样本口径下，4.3b 已具备“进入主链接入评估”的条件
- `04B` Embedding 资产口径：
  - Pass1：`created=2 / skipped=1`
  - Pass2：`reused=2 / skipped=1`
  - Pass3：`reused=1 / rebuilt=1 / skipped=1`
  - Pass4：`embedding_disabled=2 / empty_content=1`
  - 结论：`created / reused / rebuilt / skipped` 口径已动态验证 through，`embedding_disabled` 与 `empty_content` 已分型成立

因此当前交接文档反映的是：

> 统一检索主链、4.3a 最小消费接入、4.4 最小冷归档、4.5 向量检索基础设施样本级闭环验证、以及 4.3b 正负样本/门槛汇总/最小消费实验都已落地；当前更适合让 4.5 转入回归监测，并把主线切到 4.3b 主链接入评估。

---

## 10. 交接建议阅读顺序

建议接手人按以下顺序阅读：

1. `HANDOFF.md`
2. `PLAN.md`
3. `ROADMAP.md`
4. `server/src/services/generation-context.ts`
5. `server/src/services/generation-volume-recap-store.ts`
6. `server/src/services/generation-foreshadow-store.ts`
7. `app/src/components/GenerationWorkspace.tsx`

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
- 当前更适合让 `4.5` 转入回归监测，并把主线切到 `4.3b` 主链接入评估

### 11.2 当前建议的下一个完整功能

优先建议：

1. `4.3b` 主链接入评估
2. 基于评估结果决定是否做 4.3b 最小正式接入
3. `4.5` 转回归监测，暂不继续扩主链

暂不建议：

- 回到 `I6` 产品化能力
- 再继续扩主检索逻辑而不先评估 4.3b 接入门槛

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
- 4.3b 只读 PoC、正负样本验证、门槛汇总与最小消费实验已完成，当前已具备进入主链接入评估的条件
- 4.4 最小冷归档已完成，已证明旧卷噪音可压制、关键线索可保留，但当前只覆盖 `memory_chunk`
- 4.5 向量检索基础设施当前样本口径下已完成最大可验证闭环，`sqlite-vec` 写入/读路径都已验证 through
- 当前不建议回到 I6 产品化能力

当前建议的下一步：

1. 先做 `4.3b` 主链接入评估：
   - 明确 `graph_2hop` 的最小接入策略
   - 明确何时优先 `graph_1hop`、何时补充 `graph_2hop`
   - 明确高噪音时的降级回退口径
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
