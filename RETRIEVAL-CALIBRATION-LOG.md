# AI Novel Studio 检索参数标定执行记录

## 1. 当前状态

当前仓库已经具备：

- 统一 retrieval 主链
- 轻量召回权重预设
- 生成控制台中的统一检索调试入口
- `app/npm run test:e2e:generation` 回归通过
- 前后端构建通过

当前还没有补的，是“真实多章项目样本下的参数结论”。

---

## 2. 执行前检查

开始第一轮真实标定前，请先确认：

- [ ] 样本项目至少有 3 到 5 章，可观察 `memory_chunk + volume_recap` 混排
- [ ] 若要测 `dormant_foreshadow`，当前章序与来源章序差值已大于 20
- [ ] 已有至少 1 条伏笔和 1 份卷总结
- [ ] 可从生成控制台查看“检索候选”“轻量召回排序”“Context 预览”
- [ ] 当前权重预设已记录为 `均衡 / 实体优先 / 近期优先 / 关键词优先` 之一，或明确标为“自定义”

如果需要快速准备样本环境，当前建议使用仓库内置样本：

1. 前端样本  
   开发模式首次进入时，`seedDemoData()` 会写入一组稀疏章序章节

2. 服务端样本  
   在 `server/` 目录执行：

   ```powershell
   npm run seed:calibration
   ```

这两组样本使用同一套固定 `projectId / chapterId`，便于前端项目与服务端 SQLite 调试结果对齐。

---

## 3. 第一轮待执行记录

### 轮次 01

- 状态：`已执行`
- 日期：`2026-04-01`
- 项目：`最后一个修仙者`
- 目标：
  - 先确认默认 `均衡` 是否足以作为当前仓库的全局基线
  - 再确认 `实体优先` 是否更适合有明显伏笔回收需求的项目

### 建议样本

- 近期承接型章节：`第13章：旧坊市线索`
- 远程回收型章节：`第24章：归炉前夜`

### 当前参数组

1. `均衡`
   - `phraseWeight = 2`
   - `entityWeight = 3`
   - `recencyWeight = 1`
   - `minScore = 3`
   - `topK = 4`

2. `实体优先`
   - `phraseWeight = 1`
   - `entityWeight = 4`
   - `recencyWeight = 1`
   - `minScore = 3`
   - `topK = 4`

### 观察项

#### 章节观察

- `第13章：旧坊市线索`
  - `均衡` 与 `实体优先` 的前 3 条结果一致
  - 结果依次为：`第8章：黑铁片异响`、`第3章：古井微光`、`第1章：废墟苏醒`
  - 说明近期承接和第一卷早期线索召回已经足够稳定

- `第24章：归炉前夜`
  - `均衡` 与 `实体优先` 的前 2 条仍然都是近期相关章节切片：`第21章：归炉井残图`、`第13章：旧坊市线索`
  - 两组参数都能召回 `第一卷` 卷总结和休眠伏笔 `黑铁片的真实来历`
  - `实体优先` 只让卷总结分数从 `11` 升到 `12`，休眠伏笔分数从 `7` 保持不变，没有改变排序

#### 综合评价

- 近期承接能力：`好`
  - 最近相关章节切片稳定排在前列，没有被旧伏笔挤掉

- 远程召回能力：`一般`
  - 休眠伏笔已经能进入结果，但仍排在卷总结之后
  - `实体优先` 对当前样本的排序改善不明显

- 噪音比例：`好`
  - 修复未来卷总结泄漏后，没有再出现明显“未来信息”召回
  - 当前前 4 条结果都还能解释其相关性

- 检索与 Context 一致性：`好`
  - 统一 retrieval 主链与 Context 组装已共享同一套来源结构，观察结果一致

- 最终判断：
  - `均衡` 可以继续作为当前仓库默认基线
  - `实体优先` 在这组样本下没有带来足够明显的排序收益
  - 下一轮如果要继续提升“旧伏笔前置能力”，应尝试更激进的自定义实体权重，而不是直接切全局默认到 `实体优先`

### 结论占位

- 推荐基线：`均衡`
- 是否需要继续调 `minScore`：暂不调整
- 是否需要继续调 `topK`：暂不调整
- 下一轮建议：
  - 保持 `minScore = 3 / topK = 4`
  - 新增一轮自定义对比：`phraseWeight = 1 / entityWeight = 5 / recencyWeight = 1`
  - 重点观察 `第24章：归炉前夜` 中休眠伏笔是否能超过卷总结

### 本轮额外发现

- 已修复一个会污染标定结果的问题：
  - 未来卷总结不应进入当前章节的统一检索结果
  - 当前已在 `generation-retrieval.ts` 中修复该时间泄漏

### 轮次 02

- 状态：`已执行`
- 日期：`2026-04-01`
- 项目：`最后一个修仙者`
- 执行命令：
  - `server/npm run seed:calibration`
  - `server/npm run calibration:round2`
- 样本章节：
  - `第13章：旧坊市线索`
  - `第24章：归炉前夜`
- 对比参数组：
  - `balanced(2/3/1)`
  - `entity_first(1/4/1)`
  - `entity_aggressive(1/5/1)`
- 前置口径：
  - 本轮观察基于“未来卷总结泄漏已修复”后的统一检索结果

#### 观察结果

- `第13章：旧坊市线索`
  - 三组 preset 的前列命中结构整体稳定，近期承接片段仍为主
  - `entity_aggressive` 相比 `balanced`/`entity_first`，对更早章节 `memory_chunk` 有分数抬升趋势

- `第24章：归炉前夜`
  - 三组 preset 都能召回近期关联切片与轻量召回来源
  - `entity_first` 与 `entity_aggressive` 未形成稳定且可复现的排序优势

- 风险观察
  - `entity_aggressive(1/5/1)` 存在抬高旧 `memory_chunk` 分数的趋势，可能在后续样本中挤占近期上下文位次

#### 当前样本下的暂定结论

- 默认基线继续保持 `均衡`
- `entity_first` 暂不具备替换默认值的证据
- `entity_aggressive` 暂不具备替换默认值的证据
- 本轮结论仅代表当前样本下的暂定判断，不视为最终最优参数

### 轮次 03（2A+2B 后复核）

- 状态：`已执行`
- 日期：`2026-04-01`
- 项目：`最后一个修仙者`
- 执行命令：
  - `server/npm run build`
  - `server/npm run seed:calibration`
  - `server/npm run calibration:round2`
- 对比口径：
  - 在 2A 元数据预过滤防线保持不变的前提下，复核 2B 显式 `rerank + 去重增强` 的排序收益

#### 观察结果

- 当前样本（`第13章：旧坊市线索`、`第24章：归炉前夜`）下，2B 的显式 rerank 与去重增强没有带来足够明显、可复现的排序变化。
- 当前样本下，尚未形成“需要切换默认基线”的证据，默认基线继续保持 `均衡`。
- `entity_aggressive(1/5/1)` 仍存在抬高旧 `memory_chunk` 分数的风险，风险口径保持延续。
- 当前调试输出仍缺 `rerankDelta` 级别的可解释性字段，导致 2B 收益判断只能做有限判断，暂不宜给出更强结论。

#### 当前样本下的暂定结论

- 默认基线继续保持 `均衡`。
- 2B 已完成实现与回归复核，但在当前样本下暂未观察到足够明显的排序增益信号。
- 本轮结论仅代表当前样本下的暂定判断，不视为最终最优参数结论。

---

## 4. 建议记录格式

后续每一轮建议按下面格式继续追加：

```md
### 轮次 02

- 日期：
- 项目：
- 样本章节：
- 当前预设：
- 当前参数：

#### 观察结果

- 近期承接能力：
- 远程召回能力：
- 噪音比例：
- 检索与 Context 一致性：

#### 结论

- 是否保留：
- 下一轮只改什么：
- 原因：
```

---

## 5. 阶段 4.5 闭环验证模板

阶段 `4.5` 当前建议把记录拆成 2 组：

1. 向量召回与回退
2. embedding 资产口径

这样更容易把“命中来源分布”和“资产生命周期统计”分开复核。

### 5.1 向量召回与回退记录模板

```md
### 轮次 04A

- 状态：`待执行`
- 日期：
- 项目：
- 样本章节：
- 执行命令：
  - `npx tsx src/scripts/run-calibration-round45-vector-recall.ts`
- 向量后端状态：
- embedding 模型状态：
- fallback 原因：

#### 检索主链诊断

- vectorSearch diagnostics：
- pipeline：
  - metadata filter：
  - hybrid recall：
  - dedupe/rerank：
  - selection：

#### 命中来源分布

- lexical_only：
- vector_only：
- hybrid：

#### 样本明细

- retrievalHitOrigin：
- retrievalSignals：
- vectorSimilarity：
- preRerankScore：
- rerankDelta：
- rerankReasons：

#### 结论

- 是否命中稳定 vector-only：
- embedding 关闭后是否稳定回退：
- 下一步：
```

### 5.2 Embedding 资产口径记录模板

```md
### 轮次 04B

- 状态：`待执行`
- 日期：
- 项目：
- 执行命令：
  - `npx tsx src/scripts/run-calibration-round45-embedding-assets.ts`
- 向量后端状态：
- embedding 模型状态：

#### 资产统计

- created：
- reused：
- rebuilt：
- skipped：
- skipped.embedding_disabled：
- skipped.empty_content：
- skipped.embedding_failed：

#### 口径结论

- reused 是否符合预期：
- rebuilt 是否符合预期：
- skipped 分类是否自洽：
- 下一步：
```

### 5.3 当前待执行命令

在 `server/` 目录执行：

```powershell
npx tsx src/scripts/run-calibration-round45-vector-recall.ts
npx tsx src/scripts/run-calibration-round45-embedding-assets.ts
```

如果要显式使用真实 embedding 模型验证 `vector-only`：

```powershell
$env:CALIBRATION_VECTOR_EMBEDDING_MODEL='text-embedding-3-small'
npx tsx src/scripts/run-calibration-round45-vector-recall.ts
```

当前这些模板现已完成首轮回填，后续继续按同一格式追加即可。

### 轮次 04A（阶段 4.5 向量召回与回退）

- 状态：`已执行`
- 日期：`2026-04-01`
- 项目：`calibration-project-vector-recall`
- 样本章节：`第50章：归炉回响`
- 执行命令：
  - 默认未配置模型：`$env:TSX_DISABLE_CACHE='1'; npx tsx src/scripts/run-calibration-round45-vector-recall.ts`
  - 启用场景补跑：`$env:TSX_DISABLE_CACHE='1'; $env:CALIBRATION_VECTOR_EMBEDDING_MODEL='local-hash'; npx tsx src/scripts/run-calibration-round45-vector-recall.ts`
  - 真实 embedding 名称场景：`$env:TSX_DISABLE_CACHE='1'; $env:CALIBRATION_VECTOR_EMBEDDING_MODEL='embedding-3'; npx tsx src/scripts/run-calibration-round45-vector-recall.ts`
- 向量后端状态：`json_cache`
- embedding 模型状态：
  - disabled 场景：`未配置`
  - enabled 场景：`embedding-3`
- fallback 原因：
  - disabled 场景：已按预期回退到 lexical 旧路径
  - enabled 场景：无额外 fallback

#### 检索主链诊断

- vectorSearch diagnostics：
  - enabled：`status=active, candidatePoolSize=4, matchedCandidateCount=4, topK=18, minScore=6, minSimilarity=0.22`
- pipeline：
  - metadata filter：已输出，可用于复核当前候选进入混合召回前的规模
  - hybrid recall：当前已出现 `vector_only / hybrid` 命中，分布为 `lexicalOnlyCount=0 / vectorOnlyCount=3 / hybridCount=1`
  - dedupe/rerank：当前 `vector-only` 候选已过向量阈值并进入后续阶段
  - selection：最终只保留 `1` 条 `hybrid` 命中，`vector-only` 候选未稳定进入最终 selected results

#### 命中来源分布

- lexical_only：`0`
- vector_only：`3`
- hybrid：`1`

#### 样本明细

- embedding 向量健康诊断：
  - query / lexical / semantic / vector-only 样本均为正常非零 `2048` 维向量
  - `l2Norm = 1`，无 `NaN / Infinity`
  - cosine similarity：
    - lexical：`0.700761`
    - semantic：`0.440299`
    - vector-only：`0.425302`
- retrievalHitOrigin：当前样本已出现 `vector_only / hybrid`
- retrievalSignals：当前样本已出现 vector 信号，不再只是 lexical
- vectorSimilarity：当前样本已输出稳定可用的 vector 命中值
- preRerankScore：已可通过调试输出复核
- rerankDelta：已可通过调试输出复核
- rerankReasons：已可通过调试输出复核

#### 结论

- 是否命中稳定 vector-only：部分成立；`vector-only` 已在 `hybridRecall` 阶段真实出现，但最终 `selection` 仍未稳定保留 `vector-only`
- embedding 关闭后是否稳定回退：是；当前已验证向量通道启用/关闭两种状态都可解释
- 下一步：
  - provider 与 embedding 调用层问题已解决；当前剩余问题不再是“向量无效”，而是“`vector-only` 候选在最终 `selection` 未保留”
  - 下一步应优先复核 `selection / rerank` 对 `vector-only` 候选的挤出原因，而不是继续排查 provider 或向量本体有效性
  - 当前样本已足以说明向量召回真实生效、回退路径可用、调试解释字段可复核

### 轮次 04A-Expansion（阶段 4.5 vector-only 扩样复核）

- 状态：`已执行`
- 日期：`2026-04-02`
- 项目：
  - `calibration-project-vector-expansion-synonym`
  - `calibration-project-vector-expansion-weak`
  - `calibration-project-vector-expansion-noise`
- 执行命令：
  - `$env:TSX_DISABLE_CACHE='1'; $env:CALIBRATION_VECTOR_EMBEDDING_MODEL='embedding-3'; npx tsx src/scripts/run-calibration-round45-vector-recall-expansion.ts`
- 向量后端状态：`json_cache`
- embedding 模型状态：
  - enabled 场景：`embedding-3`
  - disabled 场景：`未配置`

#### 扩样结果

- 同义改写型：
  - Scenario A / hybridRecall：`lexical_only=0 / vector_only=3 / hybrid=1`
  - Scenario A / selection：`rescuedVectorOnlyCandidates=1`
  - Scenario A / 最终结果：`vector_only=1 / hybrid=2`
  - Scenario A / noiseRetained：`无`
  - Scenario B / 回退结果：`lexical_only=2 / vector_only=0 / hybrid=0`
- 语义弱相关型：
  - Scenario A / hybridRecall：`lexical_only=0 / vector_only=3 / hybrid=1`
  - Scenario A / selection：`rescuedVectorOnlyCandidates=1`
  - Scenario A / 最终结果：`vector_only=1 / hybrid=2`
  - Scenario A / noiseRetained：`无`
  - Scenario B / 回退结果：`lexical_only=2 / vector_only=0 / hybrid=0`
- 明确噪音型：
  - Scenario A / hybridRecall：`lexical_only=0 / vector_only=3 / hybrid=1`
  - Scenario A / selection：`rescuedVectorOnlyCandidates=1`
  - Scenario A / 最终结果：`vector_only=1 / hybrid=2`
  - Scenario A / noiseRetained：`无`
  - Scenario B / 回退结果：`lexical_only=2 / vector_only=0 / hybrid=0`

#### 扩样结论

- 当前不只是 `hybridRecall` 出现 `vector-only`，而是 `selection` 最终也已稳定保留少量 `vector_only`
- 当前样本口径下，`vector-only rescue` 已跨样本稳定
- 当前样本口径下，噪音样本未进入最终结果，控噪成立
- 当前样本口径下，强 `hybrid` 结果仍稳定保留，未见明显误伤
- 当前结论仍保持克制：这只说明“当前扩样样本口径下” rescue 机制成立，不等价于所有真实项目章节都会稳定同样表现

#### 下一步

- 当前样本口径下，`selection / rerank` 已达到可收官状态
- 后续重点从“继续调算法”切换为“回归监测”：
  - 在后续真实项目或新 calibration 样本中持续观察 `vector_only / hybrid / noiseRetained`
  - 若后续出现噪音上升或 `vector-only` 大面积消失，再进入下一轮针对性复核

### 轮次 04C（阶段 4.5 sqlite-vec 对比验证）

- 状态：`已执行`
- 日期：`2026-04-02`
- 项目：`calibration-project-vector-backend-compare`
- 执行命令：
  - `$env:TSX_DISABLE_CACHE='1'; $env:CALIBRATION_VECTOR_EMBEDDING_MODEL='embedding-3'; npx tsx src/scripts/run-calibration-round45-vector-backend-compare.ts`
  - `npm run sqlite-vec:poc`
  - `npm run sqlite-vec:write-smoke`
- 向量后端状态：
  - `sqlite-vec PoC`：通过
  - 写入共存：`sqliteVecIndexSync.status=synced`
  - 读路径切换：`embedding-3 + sqlite_vec` 下 `vectorSearch.source=sqlite_vec`

#### 关键结果

- sqlite-vec PoC：
  - 官方 Windows `vec0.dll` 可加载
  - `vec_version`
  - 建表
  - 写入
  - top-k 查询
  - 均已通过
- sqlite-vec vs json_cache 对比：
  - 在相同 `04A` 样本下，`sqlite_vec` 与 `json_cache` 的 `matchedCandidateCount`、`originDistribution`、`selection` 关键信息无明显劣化
  - 两者均稳定保留少量 `vector_only`，并稳定保留强 `hybrid`
  - 两者 `noiseRetained=无`
- disabled 回退：
  - 仍稳定回退为 `lexical_only=2 / vector_only=0 / hybrid=0`

#### 对比结论

- 当前样本口径下，`sqlite_vec` 正式读路径已验证 through
- 当前样本口径下，`sqlite_vec` 相比 `json_cache` 未见明显退化
- 当前样本口径下，`vector-only rescue / hybrid 保留 / noiseRetained` 三项表现与 `json_cache` 基本一致
- 当前结论仍保持克制：仅说明在当前校准样本口径下，`sqlite_vec` 已可进入正式验证通过状态，不等价于所有真实项目章节都会同样稳定

### 轮次 04B（阶段 4.5 Embedding 资产口径）

- 状态：`已执行`
- 日期：`2026-04-01`
- 项目：`calibration-project-embedding-assets`
- 执行命令：
  - `$env:TSX_DISABLE_CACHE='1'; npx tsx src/scripts/run-calibration-round45-embedding-assets.ts`
- 向量后端状态：`json_cache`
- embedding 模型状态：`local-hash`

#### 资产统计

- Pass1：`created=2, reused=0, rebuilt=0, skipped=1`
- Pass2：`created=0, reused=2, rebuilt=0, skipped=1`
- Pass3：`created=0, reused=1, rebuilt=1, skipped=1`
- Pass4：`created=0, reused=0, rebuilt=0, skipped=3`
- skipped.embedding_disabled：`2`（Pass4）
- skipped.empty_content：`1`（每轮均为 1）
- skipped.embedding_failed：`0`

#### 口径结论

- reused 是否符合预期：符合；同内容复跑稳定进入 `reused`
- rebuilt 是否符合预期：符合；内容变更后稳定进入 `rebuilt`
- skipped 分类是否自洽：符合；`embedding_disabled` 与 `empty_content` 已分型成立
- 下一步：
  - 当前 `created / reused / rebuilt / skipped` 口径已用 `local-hash` 动态验证 through
  - 后续如需继续验证真实模型行为，可在不改主逻辑的前提下补跑真实 embedding 模型

## 7. 阶段 4.3b 二度关系查询校准

### 7.1 正向样本（graph_2hop）

```md
### 轮次 43B-A

- 状态：`已执行`
- 日期：`2026-04-02`
- 项目：`calibration-project-relationship-2hop`
- 样本章节：`rel2hop-chapter-027`
- 执行命令：
  - `npm run seed:43b-relationship`
  - `curl "http://localhost:3001/api/runtime/generation-debug/relationship-query-2hop?projectId=calibration-project-relationship-2hop&chapterId=rel2hop-chapter-027&entityName=%E6%9E%97%E5%86%B2"`

#### 结果摘要

- mode：`graph_2hop`
- 路径已稳定包含：
  - `林冲 -> 谢无咎 -> 沈藏锋`
  - `谢无咎 -> 沈藏锋 -> 沉井遗迹`
- 输出已包含：
  - `paths`
  - `edges`
  - `nodes`
  - `stats`

#### 结论

- 当前样本口径下，4.3b 二度关系查询已能稳定输出可解释路径。
```

### 7.2 负样本（degraded）

```md
### 轮次 43B-B

- 状态：`已执行`
- 日期：`2026-04-02`
- 执行命令：
  - `npm run seed:43b-relationship-negative`

#### no_two_hop_relationship

- projectId：`calibration-project-relationship-2hop-negative-empty`
- chapterId：`rel2hop-empty-chapter-018`
- entityName：`顾沉舟`
- 执行：
  - `curl "http://localhost:3001/api/runtime/generation-debug/relationship-query-2hop?projectId=calibration-project-relationship-2hop-negative-empty&chapterId=rel2hop-empty-chapter-018&entityName=%E9%A1%BE%E6%B2%89%E8%88%9F"`
- 结果：
  - `mode=degraded`
  - `reason=no_two_hop_relationship`
  - `candidatePaths=0 / acceptedPaths=0`

#### high_noise

- projectId：`calibration-project-relationship-2hop-negative-noise`
- chapterId：`rel2hop-noise-chapter-020`
- entityName：`顾沉舟`
- 执行：
  - `curl "http://localhost:3001/api/runtime/generation-debug/relationship-query-2hop?projectId=calibration-project-relationship-2hop-negative-noise&chapterId=rel2hop-noise-chapter-020&entityName=%E9%A1%BE%E6%B2%89%E8%88%9F"`
- 结果：
  - `mode=degraded`
  - `reason=high_noise`
  - `candidatePaths=9 / acceptedPaths=1 / droppedNoisyPaths=8`

#### 结论

- 当前样本口径下，4.3b 已具备三种可复核状态：
  - `graph_2hop`
  - `degraded / no_two_hop_relationship`
  - `degraded / high_noise`
- 当前结论仍保持克制：仅说明 4.3b 只读查询 PoC 已可验证 through，不等价于已进入生成主链消费。
```
