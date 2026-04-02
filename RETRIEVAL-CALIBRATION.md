# AI Novel Studio 检索参数标定说明

## 1. 文档目的

这份文档用于记录统一检索主链的轻量召回参数标定方法与结果。

当前主要标定对象：

- `lightweightRecall.phraseWeight`
- `lightweightRecall.entityWeight`
- `lightweightRecall.recencyWeight`
- `lightweightRecall.minScore`
- `lightweightRecall.topK`

目标不是一次找出“永远正确”的参数，而是：

1. 先建立可重复的观察方法
2. 再形成当前仓库可复用的默认建议
3. 后续随着题材、项目规模和检索主链升级继续迭代

---

## 2. 当前内置预设

当前前端已提供 4 组轻量召回权重预设：

| 预设 | 权重 | 适用场景 |
|---|---|---|
| `均衡` | `词 2 / 实体 3 / 时序 1` | 作为默认基线，适合多数项目先做首轮观察 |
| `实体优先` | `词 1 / 实体 4 / 时序 1` | 角色、道具、势力命中比关键词更重要 |
| `近期优先` | `词 1 / 实体 2 / 时序 3` | 最近 20-40 章承接关系更关键 |
| `关键词优先` | `词 4 / 实体 2 / 时序 1` | query phrase 本身具有强锚点 |

这些预设当前可在以下位置直接切换：

- 全局设置页
- 项目级门控覆盖
- 生成控制台的生效门控摘要中可直接识别当前命中哪组预设

---

## 3. 建议样本

做标定时，建议每次至少选 2 类章节样本：

1. 近期承接型  
   特点：主要依赖最近 5-20 章的未完线索

2. 远程回收型  
   特点：需要召回更早章节中的伏笔、卷总结或设定资产

如果项目已经比较大，再加一类：

3. 干扰高频型  
   特点：存在重复关键词、重复地点或多个相似事件，容易误召回

每类至少选 2 章，避免只凭单章结论改默认值。

### 3.1 数据前提提醒

当前仓库里的演示种子项目 `最后一个修仙者` 只有 1 章，只够验证界面和基础链路，不足以支撑真实检索标定。

做真实标定前，至少要满足：

1. 同一项目内有 3 到 5 章可检索章节  
   这样才能先观察 `memory chunk` 与 `volume recap` 的基础混排

2. 如果要测“休眠伏笔召回”，当前章序与伏笔来源章序差值必须大于 20  
   当前服务端把 `planted` 伏笔派生为 `dormant` 的条件就是 `currentChapterOrder - sourceChapterOrder > 20`

3. 至少已经生成过 1 份卷总结  
   否则无法判断 `volume_recap` 在统一检索主链中的排序是否合理

换句话说：

- 做基础混排标定：3 到 5 章就可以开始
- 做完整“休眠伏笔”标定：建议准备 22 章以上的样本项目

---

## 4. 观察入口

当前建议优先使用以下调试入口：

1. 生成控制台  
   观察“检索候选”“轻量召回排序”“Context 预览”

2. `GET /api/runtime/generation-debug/retrieval`  
   直接看统一检索结果是否把 `memory chunk / dormant_foreshadow / volume_recap` 混排正确

3. `GET /api/runtime/generation-debug/context`  
   验证最终注入的 `retrieval_memory` 是否与调试候选一致

---

## 5. 观察指标

每次标定至少记录以下 5 项：

1. 命中质量  
   召回结果里前 3 条是否真的和当前章节相关

2. 噪音比例  
   前 5 条里明显弱相关或误召回的条数

3. 远程召回能力  
   需要回收旧伏笔时，休眠伏笔或卷总结是否能进入前列

4. 近期承接能力  
   近期章节切片是否被无关旧伏笔挤掉

5. 最终注入一致性  
   `retrieval debug` 与 `context preview` 中的结果是否一致

建议使用简单评分：

- `好`
- `一般`
- `差`

先保证评价尺度稳定，再讨论改多少参数。

---

## 6. 标定顺序

建议按下面顺序调，而不是一次同时改 5 个参数：

### 6.1 第一步：固定阈值，只测权重

先固定：

- `minScore = 3`
- `topK = 4`

只切换 4 组预设，观察哪组更接近当前项目需求。

### 6.2 第二步：微调单一权重

在最接近的预设上，只改一个维度：

- 远程伏笔召回不足：先加 `entityWeight` 或 `phraseWeight`
- 旧内容噪音过大：先加 `recencyWeight`
- 关键词误命中过多：先降 `phraseWeight`

每次只改一个维度，幅度建议 `±1`。

### 6.3 第三步：再调 `minScore / topK`

只有在权重方向基本稳定后，才动：

- `minScore`
- `topK`

一般判断：

- 命中多但噪音大：优先提高 `minScore`
- 命中太少：优先降低 `minScore`
- 前几条质量不错但信息不够：再考虑提高 `topK`

---

## 7. 记录模板

建议每轮标定按下面格式记录：

```md
### 标定轮次

- 日期：
- 项目：
- 样本章节：
- 当前预设：
- 当前参数：
  - phraseWeight =
  - entityWeight =
  - recencyWeight =
  - minScore =
  - topK =

### 观察结果

- 近期承接能力：
- 远程召回能力：
- 噪音比例：
- 检索与 Context 一致性：
- 总体判断：

### 调整结论

- 是否保留当前参数：
- 下一轮只改哪一个参数：
- 原因：
```

---

## 8. 推荐起步策略

如果是第一次给一个项目做标定，建议用这个顺序：

1. 先用 `均衡`
2. 如果旧伏笔经常掉出前列，试 `实体优先`
3. 如果近期章节总被旧内容打断，试 `近期优先`
4. 如果关键词本身非常稳定，比如道具名、术法名、专有地点名，试 `关键词优先`

---

## 9. 当前结论占位

当前仓库状态：

- 统一 retrieval 主链已接通
- 权重预设已接入全局设置与项目级覆盖
- 生成控制台可识别当前权重命中的预设标签
- `app/npm run test:e2e:generation` 已通过
- `app/npm run build` 与 `server/npm run build` 已通过

当前仍待补的是真实项目样本下的参数结论。

后续应在本节直接追加项目级结论，而不是只更新 `PLAN.md` 中的一句话状态。

---

## 10. 首轮示范记录

下面这段不是最终结论，而是一份可直接复用的示范写法。

做真实标定时，建议复制这一段，替换项目名、章节名和观察结果。

```md
### 标定轮次 01（示范）

- 日期：2026-04-01
- 项目：示例项目
- 样本章节：
  - 第12章：近期承接型
  - 第38章：远程回收型
- 当前预设：`均衡`
- 当前参数：
  - phraseWeight = 2
  - entityWeight = 3
  - recencyWeight = 1
  - minScore = 3
  - topK = 4

### 观察结果

- 第12章：近期承接能力 `好`
  - 最近章节切片仍能稳定排在前 2 条
  - 没有被卷总结或旧伏笔明显挤掉

- 第38章：远程召回能力 `一般`
  - 休眠伏笔能进入结果，但有时排在卷总结之后
  - 对“人物 + 道具”双实体命中的章节更友好

- 噪音比例：`一般`
  - 前 5 条里约 1 条偏弱相关，但没有明显误召回

- 检索与 Context 一致性：`好`
  - retrieval debug 与 context preview 基本一致

- 总体判断：
  - `均衡` 适合作为默认基线
  - 如果项目更依赖远程伏笔回收，可继续试 `实体优先`

### 调整结论

- 是否保留当前参数：暂时保留
- 下一轮只改哪一个参数：先试 `实体优先`
- 原因：
  - 当前近期承接已经够稳
  - 真正需要继续优化的是远程伏笔进入前列的能力
```

---

## 11. 推荐首轮执行清单

如果下一轮要开始真实标定，建议按这个最小清单执行：

1. 选 1 个近期承接章节
2. 选 1 个远程回收章节
3. 先跑 `均衡`
4. 再跑 `实体优先`
5. 只比较前 3 条检索结果是否更合理
6. 把结论回填到本文件

这样一轮下来，就能先决定默认基线是继续保留 `均衡`，还是切到 `实体优先`。

---

## 12. 执行记录文件

方法说明与执行记录建议分开维护：

- 方法说明：`RETRIEVAL-CALIBRATION.md`
- 真实执行记录：`RETRIEVAL-CALIBRATION-LOG.md`

后续如果开始做真实项目标定，建议把每一轮项目级结论都写到执行记录文件里，而不是继续堆在本说明文档末尾。

---

## 13. 4.5 向量闭环验证

阶段 `4.5` 当前不再只看“是否有 embedding”，而是要补齐以下 3 类关键样本：

1. `vector-only` 命中  
   用于确认独立向量候选通道真实生效，而不是只给 lexical top-N 加分

2. `embedding 关闭回退`  
   用于确认向量通道关闭或失败时，主链能稳定退回 lexical 旧路径，且调试结果可解释

3. `reused / rebuilt` 资产口径  
   用于确认 embedding 资产治理能正确区分首次写入、复用、失效重建和跳过

### 13.1 推荐执行命令

在 `server/` 目录执行：

```powershell
npx tsx src/scripts/run-calibration-round45-vector-recall.ts
npx tsx src/scripts/run-calibration-round45-embedding-assets.ts
```

如果要强制指定真实 embedding 模型，可显式覆盖：

```powershell
$env:CALIBRATION_VECTOR_EMBEDDING_MODEL='text-embedding-3-small'
npx tsx src/scripts/run-calibration-round45-vector-recall.ts
```

如果本地没有真实 embedding 服务，资产口径脚本默认会使用 `local-hash`，因此 `created / reused / rebuilt / skipped` 仍然可以离线复核。

### 13.2 推荐记录字段

做 `4.5` 闭环验证时，建议每次至少记录以下字段：

- 项目 / 样本章节
- 向量后端状态
- embedding 模型状态
- `vectorSearch diagnostics`
- `pipeline`
- 命中来源分布：`lexical_only / vector_only / hybrid`
- `retrievalHitOrigin / retrievalSignals / vectorSimilarity`
- `preRerankScore / rerankDelta / rerankReasons`
- `created / reused / rebuilt / skipped`
- fallback 原因
- 本轮结论
- 下一步建议

### 13.3 当前口径提醒

- `vector-only` 样本建议优先使用真实 embedding 模型验证；`local-hash` 更适合作为链路 smoke，不适合作为语义召回强证据
- `embedding 关闭回退` 与 `reused / rebuilt` 资产口径当前可以不依赖真实 embedding 服务
- 阶段 `4.5` 的主线目标是“调试、校准和交接闭环”，不是继续扩主检索逻辑
