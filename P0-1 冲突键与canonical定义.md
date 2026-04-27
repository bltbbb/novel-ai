# P0-1 冲突键与 Canonical 定义

对应执行计划：[设定与结构记忆边界重构执行计划.md](./设定与结构记忆边界重构执行计划.md)  
上游审计依据：[P0-0 bundle审计记录.md](./P0-0%20bundle审计记录.md)

## 文档目的

本文只完成 `P0-1`：

- 为第一版 4 类信息定义 `conflictKey`
- 明确每类信息的 `canonical` 单位
- 明确 `winner / supplement / discard` 的判定边界

本文**不**负责：

- 落来源优先级实现
- 落 bundle 渲染实现
- 做跨类自由文本语义去重

这些分别留给：

- `P0-2` 来源优先级
- `P0-3` 去重实现
- `P0-4` 渲染回 bundle

## 第一版范围

第一版只定义 4 类：

- `entity`
- `foreshadow`
- `world_state`
- `resource`

当前明确不纳入第一版键定义主线的：

- `thread_ledger`
- `pov_permission`

它们保留到第二版，也就是执行计划里的 `P0-6`。

## 统一原则

### 1. `conflictKey` 只解决“是否是同一事实单元”

`conflictKey` 的职责是把“同一类、同一事实”的不同来源先放进同一个桶里。  
它**不直接**决定谁赢。

### 2. `canonical` 是最终只允许保留一个主块的事实单元

如果多个来源命中同一个 `conflictKey`，最终只能保留一个 `canonical winner` 作为主块。

### 3. 第一版只做结构化可判定规则

第一版不做：

- 大模型语义判同
- 长文本近义句归并
- 跨类事实推理归并

只做：

- 名称
- 标题
- 卷/阶段
- 资源桶
- 明确字段位

这些结构化可判定规则。

### 4. `winner / supplement / discard` 的职责划分

- `winner`
  - 进入最终主块
  - 同一 `conflictKey` 只能有一个
- `supplement`
  - 不另起同类主块
  - 只能折叠进 winner，或降成一行补充摘要
- `discard`
  - 不进入 bundle

### 5. 第一版不做跨类冲突合并

例如：

- `world_state.current_risks` 和 `foreshadow.title`
- `resource_continuity` 和 `relationships`

哪怕词面相同，第一版也先不跨类合并，只做“同类内唯一主块”。

## 1. Entity

### 1.1 canonical 单位

一个 `entity canonical` 代表“同一个人物 / 地点 / 物品 / 事件 / 势力”。

### 1.2 `conflictKey`

第一版定义为：

```text
entity:{normalizedCanonicalName}
```

其中：

- `normalizedCanonicalName`
  - 优先取正式真源中的规范名称
  - 如果没有正式真源，就取运行态实体的 `entityName`
  - 统一做 `trim + lowercase`

### 1.3 别名规则

别名不单独生成新的主键。

处理规则：

- 如果别名能唯一映射到一个规范名称，则并到该 `entity` 的 `conflictKey`
- 如果别名会同时命中多个实体，则第一版不自动合并，保留原名，避免误伤

### 1.4 winner / supplement / discard

`winner`

- 同名实体中，最终只保留 1 个主实体块
- 跨来源谁赢，放到 `P0-2` 决定
- 同源内如果出现重复，优先保留：
  - 规范名更完整者
  - 结构化稳定字段更完整者
  - `updatedAt` 更新者

`supplement`

- 别名
- 标签
- 不冲突的稳定字段补充
- 非核心描述补充

`discard`

- 与 winner 同名、同类、信息更弱的重复块
- 只含别名、无新增稳定事实的块
- 当前阶段动态状态字段

### 1.5 边界声明

- 第一版 `entity` 不处理“同实体不同译名”的语义归并，只处理显式名称/别名映射
- `current_*` 动态字段不再参与主信息 canonical
- `relationships` 不反向改变 `entity winner`

## 2. Foreshadow

### 2.1 canonical 单位

一个 `foreshadow canonical` 代表“同一个伏笔事实项”，不是伏笔规划项。

### 2.2 `conflictKey`

第一版定义为：

```text
foreshadow:{normalizedTitle}
```

其中：

- `normalizedTitle`
  - 取伏笔标题
  - 统一做 `trim + lowercase`

说明：

- 当前实际重复主要围绕伏笔标题展开
- `generation_foreshadows`
- `thread_ledger` 中的风险/悬念
- `retrieval_memory` 中的休眠伏笔召回

因此第一版先以标题作为稳定键面。

### 2.3 `foreshadowId` 的地位

如果来源里已经有稳定 `foreshadowId`，可以作为辅助定位信息，但第一版不把它作为唯一主键。

原因：

- 当前很多重复并不是从同一条数据库记录扩散出来的
- 而是同一标题跨 section 被反复转述

### 2.4 winner / supplement / discard

`winner`

- 同一标题的伏笔事实最终只保留 1 个主事实块
- 正式真源与运行态谁赢，放到 `P0-2`
- 同源内优先保留：
  - 状态更明确者
  - 来源章节更明确者
  - `updatedAt` 更新者

`supplement`

- 来源章节
- 回收章节
- 生命周期补充
- 休眠伏笔召回信息

但这些补充不能再以并列主块方式出现。

`discard`

- 与 winner 同标题、无新增事实的重复块
- 只是用不同 section 再描述一次同一伏笔指向的块

### 2.5 边界声明

- 第一版只处理“伏笔事实”，不把 `foreshadow_plan` 视为同类冲突源
- `world_state.current_risks` 即使文本上与伏笔标题一致，第一版也不跨类合并
- `retrieval_memory` 里的休眠伏笔召回默认只做 supplement 候选，不做并列主事实

## 3. World State

### 3.1 canonical 单位

一个 `world_state canonical` 代表“同一卷内、同一维度的一条主世界状态事实”。

第一版不是按整条 `WorldStateEntryRecord` 判冲突，而是按“卷 + 维度”判冲突。

### 3.2 `conflictKey`

第一版定义为：

```text
world:{volumeKey}:{dimension}
```

其中：

- `volumeKey`
  - 优先 `volumeId`
  - 否则回退 `normalize(volumeTitle)`
- `dimension`
  - 固定为以下 8 个字段位之一：
    - `public_events`
    - `secret_events`
    - `power_balance_change`
    - `institution_change`
    - `rule_change`
    - `rumor_state`
    - `known_by_characters`
    - `current_risks`

### 3.3 `milestoneIndex` 的规则

`milestoneIndex` 不进入 `conflictKey`。

原因：

- 它是同一卷内的优先级信息
- 不是另一条事实身份

否则同一卷的：

- volume-level entry
- milestone entry

将永远无法命中同一桶，canonical 失效。

### 3.4 winner / supplement / discard

`winner`

- 同一 `world:{volumeKey}:{dimension}` 下：
  - `milestone` 非空值优先于 `volume-level`
  - 同层级冲突时，`updatedAt` 更新者优先

标量维度：

- `power_balance_change`
- `institution_change`
- `rule_change`
- `rumor_state`

采用单值 winner 覆盖。

列表维度：

- `public_events`
- `secret_events`
- `known_by_characters`
- `current_risks`

采用 winner 主导，再补 volume-level 未重复项。

`supplement`

- 对 `world_state` 来说，supplement 主要是“同字段内折叠补并”
- 不单独再起第二个同类主块

`discard`

- 空字段
- 被 milestone 非空值完全遮蔽的 volume-level 值
- 同一维度里被更新记录完全覆盖的旧记录

### 3.5 边界声明

- 第一版不处理 `world_state` 与 `short_term_memory / long_term_memory / retrieval_memory / physical_engine` 的自由文本去重
- 如果只有 milestone，没有当前卷 volume-level entry，第一版视为数据不完整，不单独生成该卷 canonical
- `current_risks` 和 `foreshadow title` 可能撞语义，但第一版不做 `world ↔ foreshadow` 跨类合并
- `knownByCharacterNames` 只属于 world state 维度，不反向参与 `entity winner`

## 4. Resource

### 4.1 canonical 单位

一个 `resource canonical` 代表“同一主体、同一资源桶的一条主连续性事实”。

### 4.2 `conflictKey`

第一版定义为：

```text
resource:{ownerKey}:{resourceTypeKey}
```

其中：

- `ownerKey`
  - 优先 `ownerCharacterId`
  - 否则 `normalize(ownerCharacterName)`
  - runtime 行回退 `normalize(entityName)`
  - 都没有时记为 `unbound`

- `resourceTypeKey`
  - 优先结构化 `resourceType` 的 canonical profile key
  - 第一版建议保留这些稳定桶：
    - `injury`
    - `lifespan`
    - `authority`
    - `credit`
    - `favor`
    - `evidence`
    - `backlash`
    - `supply`
  - runtime `generation_state_changes` 先映射到具体桶：
    - `salt`
    - `grain`
    - `medicine`
    - `money`
  - 再额外挂一个别名冲突键 `resource:{ownerKey}:supply`

### 4.3 winner / supplement / discard

`winner`

- 固定原则：
  - `structured resource_continuities > runtime generation_state_changes`

structured 同 key 内：

- `active / permanent` 可做主块
- `recovered` 默认不做主块
- 若有多个仍有效记录：
  - `riskLevel` 更高者优先
  - 再看 `updatedAt`

runtime 同 key 内：

- 只保留最新一条
- 先看 `chapterOrder`
- 再看 `updatedAt`

`supplement`

- 只允许一种情况：
  - runtime 行命中已有 structured winner
  - 最多保留 1 条最近运行态补充

`discard`

- 被 structured winner 覆盖的旧 runtime 行
- 同 key 的旧 runtime 行
- `recovered` 的结构化记录
- owner/type 模糊到无法稳定归桶的低置信度 runtime 行

### 4.4 边界声明

- 第一版只做规则词表命中，不做自由文本语义理解
- `supply` 和 `salt / grain / medicine / money` 必须视为“主 key + 别名冲突 key”的关系
- `owner` 不一定是角色，可能是组织、地点、帮派；第一版不跨主体强合并
- `favor / authority / evidence` 这类结构化类型当前 runtime 对等来源较少，第一版先保留键空间，不强求都在样本里命中

## 第一版输出格式约束

为方便后续 `P0-2 / P0-3 / P0-4` 直接落实现，第一版建议统一采用以下判定结构：

```text
conflictKey
canonicalUnit
winnerRule
supplementRule
discardRule
boundaryNotes
```

## 对 P0-2 的直接输入

本文完成后，`P0-2` 可以直接承接两件事：

### 1. 明确跨来源优先级

- `设定库 > generation_entities`
- `伏笔追踪 > generation_foreshadows`
- `world_state_entries > generation chapter/recap/retrieval 文本`
- `resource_continuities > generation_state_changes`

### 2. 明确 bundle 只允许一个主块

同一 `conflictKey`：

- 一个 `winner`
- 零到一组 `supplement`
- 其余 `discard`

## 当前结论

`P0-1` 第一版正式定义如下：

- `entity:{normalizedCanonicalName}`
- `foreshadow:{normalizedTitle}`
- `world:{volumeKey}:{dimension}`
- `resource:{ownerKey}:{resourceTypeKey}`

其中：

- `world` 以“卷 + 维度”作为最核心键面
- `resource` 以“主体 + 资源桶”作为最核心键面
- `entity / foreshadow` 先用名称/标题收口，跨来源优先级留到 `P0-2`
