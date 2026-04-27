# P0-5 Bundle 回归验证记录

对应执行计划：[设定与结构记忆边界重构执行计划.md](./设定与结构记忆边界重构执行计划.md)

## 验证目的

本记录用于完成 `P0-5`：

- 针对 `entity / foreshadow / world_state / resource` 四类信息做 bundle 回归样例
- 确认 `P0-4` 的 `winner / supplement / discard` 已真实落进 bundle
- 确认 `P0-OPT` 第一版压缩不会把主信息压坏

## 验证方式

- 验证日期：`2026-04-16`
- 验证方式：运行只读审计脚本，使用临时测试环境造样本并直接调用 `buildGenerationContextBundle()`
- 审计脚本：[server/src/scripts/inspect-p0-regression-context.ts](./server/src/scripts/inspect-p0-regression-context.ts)
- 执行命令：

```powershell
npx tsx src/scripts/inspect-p0-regression-context.ts
```

说明：

- 这次没有启动本地服务，也没有改动真实调试库数据
- 样本全部来自临时测试库，验证目标是“规则是否按预期进入 bundle”，不是“真实项目噪音强度”

## 样本矩阵

| 样本 | 目标类别 | 核心验证点 |
|---|---|---|
| A | `entity` | `entitySnapshot` 作为 winner，运行态补充信息折叠回同一主块 |
| B | `foreshadow` | `foreshadowSnapshot` 作为 winner，旧备注进入补充行，不再另起重复事实块 |
| C | `world_state` | `milestone > volume`，同维度只保留一个主块，列表字段补并且去重 |
| D | `resource` | 结构化台账作为主块，运行态变化降为补充；低优先级项压成一行摘要 |

## 样本 A：Entity

### 样本说明

- `projectId`: `p0-5-entity-project`
- `chapterId`: `p0-5-entity-chapter`
- section：`focus_entities`

### section 摘录

```text
- 林冲（character）
描述：设定库正式描述
别名：豹子头
【人格内核-不可改变】欲望：翻出旧案真相；价值排序：先护住证人，再谈翻案
关键状态：static_role=被追缉的军中旧将
标签：正式设定 / 旧案线
最近出现：第1章 旧版实体
补充说明：旧运行态对林冲的补充描述
```

### 回归结论

- `entitySnapshot` 成功成为 winner，正式描述位于主块顶部
- 旧运行态实体没有再并列生成第二个 `focus_entities` 主块
- 旧来源中的：
  - 别名
  - 标签
  - 缺失的稳定字段
  - 描述性补充
  已折叠回同一个 winner
- `current_*` 动态字段仍未回流进主实体块

## 样本 B：Foreshadow

### 样本说明

- `projectId`: `p0-5-foreshadow-project`
- `chapterId`: `p0-5-foreshadow-chapter`
- sections：
  - `working_memory`
  - `foreshadow_plan`

### section 摘录

#### `working_memory`

```text
- 激活伏笔
- 旧印缺页
状态：激活 / 已激活
来源：第1章 埋设
摘要：正式伏笔摘要
补充：旧运行态备注里补充了缺页曾被火漆封存。
预期回收：第8章 回响
```

#### `foreshadow_plan`

```text
- 旧印缺页（回收伏笔 / 核心伏笔）
当前状态：已激活
计划激活：第2卷
计划回收：第2卷
回收条件：确认缺页真正去向
回收效果：旧案证据链重新闭合
激活条件：对账桌上出现原页痕迹
```

### 回归结论

- `foreshadowSnapshot` 成功成为伏笔事实 winner
- 旧运行态记录里的：
  - 来源章节
  - 预期回收章节
  - 备注类补充
  已折叠回同一个激活伏笔块
- 旧运行态伏笔没有再以并列事实块重复出现
- `foreshadow_plan` 继续只承接规划信息，没有和伏笔事实重新混成同类冲突

## 样本 C：World State

### 样本说明

- `projectId`: `p0-5-world-state-project`
- `chapterId`: `p0-5-world-state-chapter`
- section：`world_state_delta`

### section 摘录

```text
- 世界状态-本卷变化《第二卷》
公开事件：阶段覆盖公开事件；两路都提到的风声；卷级公开震荡
秘密事件：阶段暗线推进；卷级暗线推进
制度变化：卷级制度变化仍在生效
舆论状态：阶段舆论接手当前态势
当前风险：阶段新增风险；两路都提到的风声；卷级风险仍在扩大

- 世界状态-前一卷残留《第一卷》
公开事件：第一卷旧案余波
当前风险：第一卷旧债未清
```

### 回归结论

- 当前卷只保留一个 `世界状态-本卷变化` 主块，没有再出现卷级 / 里程碑双主块并列
- `milestone` 的非空值成功覆盖同维度卷级默认值
- 列表字段已按：
  - winner 主导
  - volume-level 补并
  - 重复项只保留一次
  的规则收口
- 仍保留“当前卷 + 前一卷”双窗口，没有回溯更早卷

## 样本 D：Resource

### 样本说明

- `projectId`: `p0-5-resource-project`
- `chapterId`: `chapter-2`
- section：`resource_continuity`

### section 摘录

```text
- 林冲 / 伤药
风险级别：致命
当前状态：伤药见底，只够再撑一回
行动限制：下一场硬战前无法再完整处理伤口
连续性风险：若继续失血，战力会明显下滑
运行态补充：第1章 雨夜疗伤 林冲 / 伤药：还剩半包 -> 伤药见底，只够再撑一回

- 周青 / 物资
风险级别：高
当前状态：备用物资已经被抽走大半
行动限制：队伍转场时会明显拖慢脚步
连续性风险：下一次转移可能暴露补给线

- 柳承业 / 银钱（高风险）：手里只剩一笔过路钱
```

### 回归结论

- `resource_continuity` 结构化记录成功成为主块 winner
- 同 key 的运行态变化没有再单独起第二块，而是降成 `运行态补充`
- `P0-OPT` 第一版已在资源线上生效：
  - 前两条高优先级资源保留完整块
  - 低优先级条目被压成一行摘要
- 当前压缩没有破坏资源主信息辨识度

## 综合结论

基于这 4 组回归样本，可以确认：

1. `entity / foreshadow / world_state / resource` 的 `winner / supplement / discard` 已真实进入 bundle
2. 同一 `conflictKey` 没有再出现并列双主块
3. 低优先级来源若保留，已转为：
   - 折叠进主块的补充行
   - 或压缩成一行摘要
4. `P0-OPT` 第一版至少已在：
   - `resource_continuity`
   - 并行实现上的 `thread_ledger / foreshadow_plan`
   这几条线上具备工程基础

## 当前仍保留的边界

这次 `P0-5` 完成后，仍有两点没有在本记录里继续展开：

1. 这是一组**规则回归样本**
   - 证明规则已落 bundle
   - 不等于真实项目全量噪音已审完
2. `thread_ledger / pov_permission` 的 canonical 第二版仍留在 `P0-6`
   - 当前 `P0-OPT` 已对 `thread_ledger` 做表达压缩
   - 但还没有把它纳入第二版冲突键决策器

## 对执行计划的直接输入

本记录完成后，可以确认：

- `P0-5` 可标为已完成
- 下一条主线建议进入 `P0-I1`
  - 审计结构记忆在正文 bundle 中的实际注入现状
  - 再决定第一版注入增强的放宽幅度
