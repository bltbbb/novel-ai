# P0-0 Bundle 审计记录

对应执行计划：[设定与结构记忆边界重构执行计划.md](./设定与结构记忆边界重构执行计划.md)

## 审计目的

本记录用于完成 `P0-0`：

- 抽取一章实际 `bundle`
- 保留 `bundle` 全文
- 按 `section` 做逐段标注
- 先确认当前重复主要集中在哪里
- 为下一步 `P0-1 conflictKey / canonical` 定义提供依据

## 样本说明

- 审计日期：`2026-04-16`
- 数据来源：`server/.data/generation.sqlite`
- 导出链路：`generation-debug/context -> getGenerationDebugContext() -> buildGenerationContextBundle()`
- 审计样本：
  - `projectId`: `demo-project-last-cultivator`
  - `chapterId`: `demo-chapter-024`
  - `chapterTitle`: `第24章：归炉前夜`
  - `chapterOrder`: `24`
- 选择理由：
  - 当前本地数据里，这一章的 `section` 最完整
  - 能同时看到 `thread_ledger / world_state_delta / short_term_memory / long_term_memory / retrieval_memory / resource_continuity / focus_entities / relationships`
  - 最容易暴露“同一事实跨 section 重复表达”的问题

## 本地结构记忆样本盘点

补样本前再次盘点本地库，结论如下：

- 当前本地库里，真正挂了结构记忆核心表的章节项目，只有 `demo-project-last-cultivator`
- 该项目当前覆盖：
  - `thread_ledgers = 2`
  - `world_state_entries = 2`
  - `resource_continuities = 1`
  - `question_pools = 2`
- 当前本地库里以下 3 张表**全库为 0**：
  - `foreshadow_plans`
  - `pov_permissions`
  - `antagonist_agendas`

这意味着：

- 这次 `P0-0` 可以补成“同一结构记忆项目的多章节样本”
- 但当前本地库**无法**提供 `foreshadow_plan / pov_permission / antagonist_agenda` 的实际章节样本
- 所以后续如果要继续补这些 section，只能：
  - 新造调试样本
  - 或等待本地项目先实际写入这些结构记忆数据

## 补充样本矩阵

为避免单章样本偏差，本次补充同一项目的 3 个章节样本：

| 样本 | chapterId | chapterTitle | chapterOrder | section 特征 | 用途 |
|---|---|---|---:|---|---|
| A | `demo-chapter-015` | `第15章：钥印底纹` | 15 | `world_state_delta` 仅 1 块，`relationships` 3 块 | 看第一卷后段如何把 recap / 检索 / 状态压进正文 |
| B | `demo-chapter-021` | `第21章：归炉井残图` | 21 | 第二卷切换点，`retrieval_memory` 7 块，`resource_continuity` 3 块 | 看卷切换后“前一卷残留 + 检索召回”如何放大重复 |
| C | `demo-chapter-024` | `第24章：归炉前夜` | 24 | section 最全，`bundleLength = 4994` | 作为主样本，做完整 bundle 全文审计 |

### 补样本快速观察

#### 样本 A：`demo-chapter-015 / 第15章：钥印底纹`

- `section`：
  - `working_memory(3)`
  - `thread_ledger(2)`
  - `world_state_delta(1)`
  - `short_term_memory(5)`
  - `long_term_memory(1)`
  - `retrieval_memory(6)`
  - `resource_continuity(4)`
  - `focus_entities(4)`
  - `relationships(3)`
- 观察：
  - 第一卷后段就已经出现 `thread_ledger / short_term_memory / retrieval_memory / long_term_memory` 对同一“钥印底纹”事实的多层重述
  - 说明重复并不是第二卷才开始出现，而是在第一卷后段就形成了

#### 样本 B：`demo-chapter-021 / 第21章：归炉井残图`

- `section`：
  - `working_memory(2)`
  - `thread_ledger(2)`
  - `world_state_delta(2)`
  - `short_term_memory(6)`
  - `long_term_memory(1)`
  - `retrieval_memory(7)`
  - `resource_continuity(3)`
  - `focus_entities(4)`
  - `relationships(2)`
- 观察：
  - 第二卷开始后，`world_state_delta` 会把“当前卷变化 + 前一卷残留”一起带入
  - 同时 `retrieval_memory` 仍然大量召回第一卷章节与第一卷卷总结
  - 这说明卷切换后，`world_state_delta + short_term_memory + long_term_memory + retrieval_memory` 的交叉重复会进一步放大

#### 样本 C：`demo-chapter-024 / 第24章：归炉前夜`

- `section`：
  - `working_memory(3)`
  - `thread_ledger(2)`
  - `world_state_delta(2)`
  - `short_term_memory(7)`
  - `long_term_memory(1)`
  - `retrieval_memory(7)`
  - `resource_continuity(4)`
  - `focus_entities(4)`
  - `relationships(2)`
- 观察：
  - 这是目前最完整的审计主样本
- 已足够支撑 `world / foreshadow / resource / entity` 的第一版 `conflictKey` 定义

## 人为补齐的结构记忆缺表样本

为补足当前本地库缺失的结构记忆表，本次额外写入了一个**专门用于 `P0-0` 审计**的固定调试项目：

- seed 脚本：[server/src/scripts/seed-p0-audit-structure-sample.ts](./server/src/scripts/seed-p0-audit-structure-sample.ts)
- `projectId`: `p0-audit-structure-sample`
- 推荐审计章节：
  - `chapterId`: `p0-audit-chapter-009`
  - `chapterTitle`: `第9章：子时封门`

### 造样本目的

这组样本不是为了模拟正式用户项目，而是为了补齐当前本地库缺失的 3 类 section：

- `foreshadow_plan`
- `antagonist_agenda`
- `pov_permission`

同时保留以下 section，以便和现有 `demo-project-last-cultivator` 样本对照：

- `thread_ledger`
- `world_state_delta`
- `resource_continuity`
- `focus_entities`

### 样本数据覆盖

| 表 | 记录数 |
|---|---:|
| `generation_chapter_index` | 4 |
| `generation_chapter_summaries` | 4 |
| `generation_entities` | 5 |
| `generation_foreshadows` | 2 |
| `generation_state_changes` | 14 |
| `thread_ledgers` | 1 |
| `foreshadow_plans` | 1 |
| `world_state_entries` | 2 |
| `resource_continuities` | 1 |
| `pov_permissions` | 1 |
| `antagonist_agendas` | 1 |
| `generation_volume_recaps` | 1 |
| `generation_relationships` | 1 |

### 审计章节 section 概览

| sectionKey | 标题 | block 数 | 观察 |
|---|---|---:|---|
| `working_memory` | 工作记忆 | 3 | 当前章合同块正常 |
| `thread_ledger` | 剧情线提醒 | 1 | 可作为结构记忆主线块样本 |
| `foreshadow_plan` | 伏笔规划 | 1 | 当前本地原生样本缺失，这里已补齐 |
| `antagonist_agenda` | 反派议程 | 1 | 当前本地原生样本缺失，这里已补齐 |
| `pov_permission` | 信息控制 | 1 | 当前本地原生样本缺失，这里已补齐 |
| `world_state_delta` | 世界状态 | 2 | 当前卷 / 前一卷都有 |
| `short_term_memory` | 短期记忆 | 3 | 近章摘要块较少，便于看结构记忆 section 的相对权重 |
| `long_term_memory` | 长期记忆 | 1 | 第一卷 recap |
| `retrieval_memory` | 外部检索 | 1 | 只召回卷总结，噪音较低 |
| `resource_continuity` | 资源连续性 | 1 | 单条结构化资源块，适合作为清洁样本 |
| `focus_entities` | 当前关注实体 | 4 | 人物/道具焦点齐全 |
| `relationships` | 相关关系 | 2 | 一条关系样本即可 |

### 关键 section 摘录

#### `foreshadow_plan`

```text
- 灰契第二枚印记（回收伏笔 / 核心伏笔）
当前状态：已激活
计划激活：第2卷
计划回收：第2卷
回收条件：沈砚在子时前夜反破封门礼并逼出第二枚印记
回收效果：确认第二枚印记真正归属，并反揭顾沉舟的布局
激活条件：顾沉舟启动封门阵，灰契在井口开始发热
```

#### `antagonist_agenda`

```text
- 顾沉舟（井坊监印人）
当前目标：在沈砚靠近井口前完成封门并逼出灰契回应
当前动作：利用封门阵诱出沈砚血印反噬
出手触发：沈砚在子时前夜主动触印
主角不动时：顾沉舟会在子时后独吞第二枚印记
```

#### `pov_permission`

```text
- 沈砚 / 章节 第9章：子时封门
禁止透露：顾沉舟其实在等第二枚印记主动认主
允许暗示：顾沉舟故意放慢封门节奏
本单元禁止揭晓：第二枚印记的真正持有人
```

### 这个样本补了什么

和原生 `demo-project-last-cultivator` 样本相比，这个样本的主要价值不是“重复更重”，而是“把缺失 section 真正拉出来”：

- 证明当前 `buildGenerationContextBundle` 已经能实际消费：
  - `foreshadow_plans`
  - `antagonist_agendas`
  - `pov_permissions`
- 证明这些 section 在同一章里可以和：
  - `thread_ledger`
  - `world_state_delta`
  - `resource_continuity`
  - `focus_entities`
  同时存在
- 这样下一步做 `P0-1` 时，不再只是基于“当前本地天然样本有啥就定义啥”，而是可以明确知道：
  - 第一版核心键依然应优先定义 `entity / foreshadow / world_state / resource`
  - 但后续第二版扩到 `thread_ledger / pov_permission` 时，已经有实际 bundle 样本可参考

### 当前仍未补到的点

即便补了这组样本，`P0-0` 仍然有两个限制：

1. 这组样本是**人为构造的清洁样本**
   - 它适合验证“缺失 section 是否能实际进入 bundle”
   - 不适合替代原生项目样本去判断“真实项目里的重复强度”
2. `retrieval_memory` 仍然比较轻
   - 当前只召回了一条卷总结
   - 因此“结构记忆 section 与重检索 section 的冲突”仍主要依赖原生 `demo-project-last-cultivator` 样本来观察

## 审计口径说明

- 本记录审计的是**当前本地工作区代码状态下**导出的实际 `bundle`
- 因当前分支已经存在部分未提交改动，这份记录适合作为“当前现状审计”，不适合作为“改造前纯净基线”
- 当前样本**未覆盖**以下 section：
  - `foreshadow_plan`
  - `physical_engine`
  - `candidate_entities`
  - `fallback_context`
  - `immediate_memory`
- 因此这份记录足以支撑 `P0-1` 的第一版键定义，但对“伏笔规划/前端补充上下文”的重复问题还需要后续补样本

## 头部元信息

- `recentSummaryCount`: `7`
- `recentTextCount`: `0`
- `volumeRecapCount`: `1`
- `relatedChapterCount`: `5`
- `dormantForeshadowRecallCount`: `1`
- `volumeRecapRecallCount`: `1`
- `entityCount`: `4`
- `relationshipCount`: `1`
- `hasFallbackContext`: `false`
- `focusEntityNames`: `林冲`、`黑铁片`、`归炉井`、`韩山舟`
- `queryPhrases`：
  - `第24章：归炉前夜`
  - `第二卷`
  - `第21章：归炉井残图`
  - `等待前夜时刻`
  - `钥印显出完整纹路`
  - `确认井底仍有第二枚钥印`
  - `黑铁片是炼器宗钥印`
  - `井底仍有第二枚钥印`

## Section 概览

| sectionKey | 标题 | block 数 | 审计观察 |
|---|---|---:|---|
| `working_memory` | 工作记忆 | 3 | 当前章合同块较干净，但“上章承接 / 本卷快照”与 `short_term_memory`、`retrieval_memory`、`world_state_delta` 明显重叠 |
| `thread_ledger` | 剧情线提醒 | 2 | 重复最重，几乎把卷摘要、阶段摘要、悬念、伏笔再次重写一遍 |
| `world_state_delta` | 世界状态 | 2 | 当前卷/前一卷状态大量复述章节摘要、卷总结与伏笔风险 |
| `short_term_memory` | 短期记忆 | 7 | 作为“近章摘要”本身合理，但和 `retrieval_memory` 的同章摘要高度重合 |
| `long_term_memory` | 长期记忆 | 1 | 卷总结与 `thread_ledger`、`world_state_delta`、`retrieval_memory` 高度重叠 |
| `retrieval_memory` | 外部检索 | 7 | 对同一章事实再次展开“摘要 + 片段 + 命中信息”，是重复的主要放大器 |
| `resource_continuity` | 资源连续性 | 4 | 当前样本没有出现同一 `owner+resource` 的双源主块硬冲突，但仍可见运行态块直接进入正文 |
| `focus_entities` | 当前关注实体 | 4 | 当前样本只看到 `generation_entities` 单源注入，暂未出现“设定库 vs generation_entities”双源并列 |
| `relationships` | 相关关系 | 2 | 当前较独立，不是本样本里的主要重复源 |

## 逐 Section 标注

### `working_memory`

- `working_memory:0`
  - 内容：本章目标 / 阻力 / 代价 / Beats / 不可变事实
  - 观察：这一块偏当前章合同，重复风险低
- `working_memory:1`
  - 内容：上章承接，核心句是“林冲抵达归炉井外围……真正进入时机仍未到”
  - 观察：该句随后在 `thread_ledger:0`、`world_state_delta:0`、`short_term_memory:0`、`retrieval_memory:0` 再次出现
- `working_memory:2`
  - 内容：第二卷当前快照
  - 观察：本质上是对 `working_memory:1` 的再次摘要，也与 `short_term_memory:0` 高度重合

### `thread_ledger`

- `thread_ledger:0`
  - 内容：第二卷阶段线
  - 观察：把“第21章到第24章”的卷级摘要、当前悬念、跟进伏笔、下一触发都压进同一块
  - 风险：与 `world_state_delta:0`、`short_term_memory:0`、`retrieval_memory:0`、`retrieval_memory:6` 重复严重
- `thread_ledger:1`
  - 内容：第一卷阶段线
  - 观察：把第一卷主线事实、悬念、伏笔再次浓缩一遍
  - 风险：与 `short_term_memory:1/4/6`、`long_term_memory:0`、`retrieval_memory:3/4/5` 重复严重

### `world_state_delta`

- `world_state_delta:0`
  - 内容：第二卷本卷变化
  - 观察：`公开事件 / 舆论状态 / 当前风险` 直接复述第21章与第24章的摘要和悬念
  - 风险：与 `working_memory:1/2`、`thread_ledger:0`、`short_term_memory:0`、`retrieval_memory:0/6` 重复
- `world_state_delta:1`
  - 内容：第一卷残留
  - 观察：前一卷残留本身合理，但当前写法几乎就是“第一卷 recap + 风险提醒”的另一种包装
  - 风险：与 `thread_ledger:1`、`short_term_memory:1/4/6`、`long_term_memory:0`、`retrieval_memory:3/4/5` 重复

### `short_term_memory`

- `short_term_memory:0`
  - 内容：第21章摘要“林冲抵达归炉井外围……”
  - 观察：这是一个清晰、稳定的单章事实块
  - 风险：后面被 `working_memory:1/2`、`thread_ledger:0`、`world_state_delta:0`、`retrieval_memory:0` 多次复述
- `short_term_memory:1`
  - 内容：第15章摘要“残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印……”
  - 风险：与 `thread_ledger:1`、`long_term_memory:0`、`retrieval_memory:3` 重复
- `short_term_memory:2`
  - 内容：第13章摘要“明确第二卷将前往归炉井，但入口坐标已经被人提前触动”
  - 风险：与 `retrieval_memory:1`、`thread_ledger` 的“归炉井入口坐标”提醒重合
- `short_term_memory:3`
  - 内容：第10章摘要“雾盐旧账”
  - 风险：与 `resource_continuity:1/2/3`、`focus_entities:3` 部分重叠
- `short_term_memory:4`
  - 内容：第8章摘要“黑铁片在旧坊市废炉前异响……”
  - 风险：与 `thread_ledger:1`、`world_state_delta:1`、`long_term_memory:0`、`resource_continuity:0` 重合
- `short_term_memory:5`
  - 内容：第3章摘要“古井微光”
  - 风险：与 `retrieval_memory:2` 重合
- `short_term_memory:6`
  - 内容：第1章摘要“林冲在废墟中苏醒……”
  - 风险：与 `thread_ledger:1`、`world_state_delta:1`、`long_term_memory:0`、`retrieval_memory:4/6` 重合

### `long_term_memory`

- `long_term_memory:0`
  - 内容：第一卷 recap
  - 观察：当前写法与“第一卷阶段线”和“第一卷残留世界状态”高度相似
  - 风险：重复复述 `第1章 / 第8章 / 第15章 / 归炉井入口坐标 / 黑铁片真实来历`

### `retrieval_memory`

- `retrieval_memory:0`
  - 内容：第21章召回
  - 风险：和 `short_term_memory:0` 讲的是同一事实，只是额外附带命中词、片段、重排分
- `retrieval_memory:1`
  - 内容：第13章召回
  - 风险：和 `short_term_memory:2`、`thread_ledger` 中“入口坐标”重复
- `retrieval_memory:2`
  - 内容：第3章召回
  - 风险：和 `short_term_memory:5` 重复
- `retrieval_memory:3`
  - 内容：第15章召回
  - 风险：和 `short_term_memory:1`、`long_term_memory:0`、`thread_ledger:1` 重复
- `retrieval_memory:4`
  - 内容：第1章召回
  - 风险：和 `short_term_memory:6`、`long_term_memory:0`、`thread_ledger:1` 重复
- `retrieval_memory:5`
  - 内容：第一卷卷级总结召回
  - 风险：和 `long_term_memory:0` 几乎同义重复
- `retrieval_memory:6`
  - 内容：休眠伏笔召回“黑铁片的真实来历”
  - 风险：与 `thread_ledger:0`、`world_state_delta:0` 的“当前风险/秘密事件”重复指向同一伏笔

### `resource_continuity`

- `resource_continuity:0`
  - 内容：谢无咎 / 人情
  - 观察：当前以结构化主块形式存在
  - 风险：与 `relationships:1`、`short_term_memory:4` 有语义重叠，但不属于当前样本里的最重重复源
- `resource_continuity:1`
  - 内容：韩山舟 / 立场变化
  - 观察：运行态块，和 `world_state_delta:1`、`focus_entities:3` 有交叉
- `resource_continuity:2`
  - 内容：雾盐帮 / 状态变化
- `resource_continuity:3`
  - 内容：雾盐驿站 / 状态变化
- 样本结论：
  - 当前样本**没有**出现“同一 `owner+resource` 由结构化台账和运行态变化同时作为两个主块输出”的硬冲突
  - 但仍能看到运行态资源块直接进入正文上下文

### `focus_entities`

- `focus_entities:0`
  - 内容：林冲
- `focus_entities:1`
  - 内容：黑铁片
- `focus_entities:2`
  - 内容：归炉井
- `focus_entities:3`
  - 内容：韩山舟
- 样本结论：
  - 当前样本只看到 `generation_entities` 这一层
  - 暂未看到“设定库正式条目”和“generation_entities”同名并列
  - 因此该样本**可以用于定义 `entity` 键**，但**不足以验证 `设定库 > generation_entities` 的优先级冲突**

### `relationships`

- `relationships:0`
  - 内容：关系查询头信息
- `relationships:1`
  - 内容：谢无咎 -> 林冲（盟友）
- 样本结论：
  - 当前关系 section 较独立
  - 不属于本轮最主要的重复来源

## 重复内容对照

| 重复主题 | 主出现位置 | 重复位置 | 现象 | 对 `P0-1` 的意义 |
|---|---|---|---|---|
| 第21章“归炉井外围 / 仍未到进入时机” | `short_term_memory:0` | `working_memory:1`、`working_memory:2`、`thread_ledger:0`、`world_state_delta:0`、`retrieval_memory:0` | 同一事实被 6 处不同包装重复 | `world_state` 与 `retrieval/chapter summary` 需要统一 `conflictKey` |
| 第15章“钥印底纹 / 首枚钥印 / 反噬条件” | `short_term_memory:1` | `thread_ledger:1`、`long_term_memory:0`、`retrieval_memory:3`、`world_state_delta:1` | 同一章节事实在“阶段线 / 卷总结 / 检索 / 世界状态残留”多处再讲 | `thread/world/retrieval` 需明确主块与补充块 |
| 第1章“废墟苏醒 / 黑铁片共鸣” | `short_term_memory:6` | `thread_ledger:1`、`world_state_delta:1`、`long_term_memory:0`、`retrieval_memory:4/5` | 典型的跨记忆层重复 | `long_term_memory` 与 `retrieval_memory` 需要压缩或降级 |
| 伏笔“黑铁片的真实来历 / 归炉井入口坐标” | `retrieval_memory:6`、`thread_ledger:0` | `world_state_delta:0`、`long_term_memory:0`、`retrieval_memory:1/5` | 同一伏笔既以风险、秘密事件、卷总结、休眠召回出现 | `foreshadow` 需要正式冲突键与优先级 |
| 第一卷 recap 级信息 | `long_term_memory:0` | `thread_ledger:1`、`world_state_delta:1`、`retrieval_memory:5` | 卷级总结被多层重复再包 | `volume_recap` 应更像补充来源，不应与正式状态并列主讲 |

## 当前可确认结论

### 1. 当前最重的重复不是实体块，而是“记忆层 + 状态层”之间的重复

当前样本里，最重的重复主要集中在：

- `thread_ledger`
- `world_state_delta`
- `short_term_memory`
- `long_term_memory`
- `retrieval_memory`

也就是：

- 同一章节摘要
- 同一卷总结
- 同一伏笔风险
- 同一卷级事实

在多个 section 被反复转述。

### 2. `world_state` 的 canonical 必须先从“卷 / 维度”下手

从当前样本看，`world_state_delta` 的主要问题不是字段缺失，而是：

- 当前卷变化与近章摘要重复
- 前一卷残留与卷 recap 重复
- 风险字段和休眠伏笔召回重复

因此 `world:{volumeKey}:{dimension}` 这类键是有必要的。

### 3. `foreshadow` 的问题更多是“同一指向跨层复述”

当前样本虽然没有 `foreshadow_plan`，但已经能看到：

- `thread_ledger` 会写“黑铁片的真实来历”
- `world_state_delta` 会写“当前风险：黑铁片的真实来历”
- `retrieval_memory` 会写“休眠伏笔召回：黑铁片的真实来历”

这说明 `foreshadow` 至少需要：

- `foreshadow:{title}` 级别的冲突键
- 明确谁是主事实块，谁只能做补充或召回依据

### 4. `entity` 源优先级在这个样本里还没真正撞出来

当前 `focus_entities` 只看到 `generation_entities` 单源输出，没有看到：

- 正式设定库实体
- `generation_entities`

同名并列。

所以本样本可以帮助定义 `entity:{normalizedName}`，但还不能单独证明“`设定库 > generation_entities`”的实战冲突场景。

### 5. `resource` 当前样本不是最重冲突面

当前样本里：

- 结构化资源主块有 1 条
- 运行态资源块有 3 条
- 未看到同一 `owner+resource` 双主块重复

说明资源线在当前样本里不是最重问题，但仍需纳入统一键定义。

## 对 `P0-1` 的直接输入

基于本次审计，下一步 `P0-1` 第一版至少要先定义：

- `entity:{normalizedName}`
- `foreshadow:{normalizedTitle}`
- `world:{volumeKey}:{dimension}`
- `resource:{owner}:{resourceBucket}`

其中优先级最高的是：

- `world`
- `foreshadow`
- `resource`

因为当前样本最明显的重复集中在：

- 世界状态与章节/检索/卷总结重复
- 伏笔风险与召回重复
- 资源连续性仍有运行态块直接进正文

## 附录：结构化关系调试信息

```json
{
  "mode": "graph_1hop",
  "reason": "ok",
  "focusEntityNames": [
    "林冲"
  ],
  "policy": "一度关系优先。",
  "secondaryEvaluation": {
    "label": "supplement",
    "reason": "no_two_hop_relationship",
    "raw": "no_two_hop_relationship（历史二度关系不足）"
  },
  "evaluatedTwoHop": true,
  "hasTwoHopPathBlock": false,
  "nonTriggerCategory": "onehop_sufficient"
}
```

## 附录：轻量召回信息

```json
[
  {
    "sourceType": "volume_recap",
    "title": "第一卷",
    "score": 12,
    "matchedPhrases": [],
    "matchedEntities": [
      "林冲",
      "黑铁片",
      "归炉井"
    ],
    "updatedAt": "2026-04-01T13:35:55.414Z"
  },
  {
    "sourceType": "dormant_foreshadow",
    "title": "黑铁片的真实来历",
    "score": 7,
    "matchedPhrases": [
      "第24章：归炉前夜"
    ],
    "matchedEntities": [
      "黑铁片"
    ],
    "updatedAt": "2026-04-06T18:48:44.791Z"
  }
]
```

## Bundle 全文

```text
工作记忆：

- 本章目标：暂无
阻力：暂无
代价：暂无
Strand：quest
Beats：等待前夜时刻 | 钥印显出完整纹路 | 确认井底仍有第二枚钥印
不可变事实：黑铁片是炼器宗钥印；井底仍有第二枚钥印

- 上章承接
林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。

- 第二卷
范围：第21-21章
近期推进：林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。；谁在林冲之前完成了开井礼节？

剧情线提醒：

- 第二卷阶段线（主线 / 活跃 / 热度 4）
核心问题：林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。；归炉前夜，林冲确认黑铁片是炼器宗钥印之一，第一卷核心伏笔开始正式回收。。当前悬念：井底深处的第二枚钥印为何还在回应？；黑铁片的真实来历。
当前阶段：阶段摘要：林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。；归炉前夜，林冲确认黑铁片是炼器宗钥印之一，第一卷核心伏笔开始正式回收。。当前悬念：井底深处的第二枚钥印为何还在回应？；黑铁片的真实来历。
最近推进：第24章《第24章：归炉前夜》
下一触发：林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。；井底深处的第二枚钥印为何还在回应？；跟进伏笔：归炉井入口坐标

- 第一卷阶段线（阶段线 / 休眠 / 热度 3）
核心问题：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。；黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。；残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。。当前悬念：谁掌握了抄录缺失的下半段仪轨？；归...
当前阶段：阶段摘要：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。；黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。；残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。。当前悬念：谁掌握了抄录缺失的下半段仪轨？；归炉井入口坐标。
最近推进：第15章《第15章：钥印底纹》
下一触发：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。；谁掌握了抄录缺失的下半段仪轨？；跟进伏笔：归炉井入口坐标
预计收束卷：第2卷

世界状态：

- 世界状态-本卷变化《第二卷》
公开事件：林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。；归炉前夜，林冲确认黑铁片是炼器宗钥印之一，第一卷核心伏笔开始正式回收。
秘密事件：伏笔回收：归炉井入口坐标；伏笔回收：黑铁片的真实来历
舆论状态：林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。；归炉前夜，林冲确认黑铁片是炼器宗钥印之一，第一卷核心伏笔开始正式回收。。当前悬念：井底深处的第二枚钥印为何还在回应？；黑铁片的真实来历。；井底深处的第二枚钥印为何还在回...
关键信息掌握者：林冲、归炉井、黑铁片
当前风险：黑铁片的真实来历

- 世界状态-前一卷残留《第一卷》
公开事件：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。；黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。；韩山舟 · 立场 · 中立账房 -> 公开指控雾盐帮
舆论状态：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。；黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。；残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。。当前悬念：谁掌握了抄录缺失的下半段仪轨？；归...
关键信息掌握者：林冲、黑铁片、归炉井、谢无咎
当前风险：谁掌握了抄录缺失的下半段仪轨？

短期记忆：

- 第21章：归炉井残图
摘要：林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。
钩子：谁在林冲之前完成了开井礼节？

- 第15章：钥印底纹
摘要：残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。
钩子：谁掌握了抄录缺失的下半段仪轨？

- 第13章：旧坊市线索
摘要：林冲得到残缺炉图，明确第二卷将前往归炉井，但入口坐标已经被人提前触动。
钩子：谁比林冲更早接触归炉井入口？

- 第10章：雾盐旧账
摘要：雾盐驿站爆出税印失窃，韩山舟与雾盐帮围绕铜鸦账册展开旧账争执。
钩子：谁在三年前调换了驿站税印？

- 第8章：黑铁片异响
摘要：黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。
钩子：谢无咎为什么会知道黑铁片的旧称？

- 第3章：古井微光
摘要：林冲在古井井壁发现旧炼器铭文，确认黑铁片与归炉井体系直接相关。
钩子：谁拿走了入口坐标缺失的一角？

- 第1章：废墟苏醒
摘要：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。
钩子：黑铁片为何会在古井前突然发热？

长期记忆：

- 第一卷
范围：第1-15章
提要：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。；黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。；残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。。当前悬念：谁掌握了抄录缺失的下半段仪轨？；归炉井入口坐标。

外部检索：

- 第21章：第21章：归炉井残图 / parent #1
命中词：第二卷、第21章：归炉井残图
命中实体：林冲、黑铁片、归炉井
命中地点：归炉井外环
命中来源：关键词命中
去重合并：2 条候选
重排：45 -> 54（+9）
依据：近邻章节 +6；phrase/location 强信号 +2；同卷近距 +1
摘要：林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。
片段：章节：第21章：归炉井残图 章节序号：第21章 卷名：第二卷 时间锚点：入夜前 Strand：quest 摘要：林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。 钩子：谁在林冲之前完成了开井礼节？ 伏笔：黑铁片的真实来历；归炉井入口坐标 Beats：进入归炉井外围 | 发现入口开启痕迹 | 确认…

- 第13章：第13章：旧坊市线索 / parent #1
命中词：第二卷
命中实体：林冲、黑铁片、归炉井
命中来源：关键词命中
去重合并：2 条候选
重排：32 -> 38（+6）
依据：近邻章节 +4；phrase/location 强信号 +2
摘要：林冲得到残缺炉图，明确第二卷将前往归炉井，但入口坐标已经被人提前触动。
片段：章节：第13章：旧坊市线索 章节序号：第13章 卷名：第一卷 时间锚点：黄昏 Strand：constellation 摘要：林冲得到残缺炉图，明确第二卷将前往归炉井，但入口坐标已经被人提前触动。 钩子：谁比林冲更早接触归炉井入口？ 伏笔：归炉井入口坐标；谢无咎的真实立场 Beats：换到残缺炉图 | 确认第二卷目标…

- 第3章：第3章：古井微光 / child #1
命中实体：林冲、黑铁片、归炉井
命中来源：关键词命中
去重合并：2 条候选
重排：24 -> 26（+2）
依据：中近距章节 +2
摘要：林冲在古井井壁发现旧炼器铭文，确认黑铁片与归炉井体系直接相关。
片段：林冲沿着废墟下层的裂缝找到一口封死多年的古井。井壁上的炼器铭文在黑铁片靠近时泛起冷光，他确认这口井和失落多年的归炉井体系有关，但入口坐标仍然残缺。 ... 章节：第3章：古井微光 章节序号：第3章 卷名：第一卷 时间锚点：午后 Strand：quest 摘要：林冲在古井井壁发现旧炼器铭文，确认黑铁片与归炉井体系直接相…

- 第15章：第15章：钥印底纹 / child #1
命中实体：黑铁片、归炉井
命中来源：关键词命中
去重合并：2 条候选
重排：21 -> 25（+4）
依据：近邻章节 +4
摘要：残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。
片段：北城库房残图的夹层里藏着一段抄录，明确写明黑铁片是归炉井前夜仪轨的首枚钥印。抄录还提醒若缺少同频回响，开井礼会在子时前反噬施礼者。 ... 章节：第15章：钥印底纹 章节序号：第15章 卷名：第一卷 时间锚点：子时前 Strand：quest 摘要：残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。…

- 第1章：第1章：废墟苏醒 / parent #1
命中实体：林冲、黑铁片、归炉井
命中来源：关键词命中
重排：23 -> 25（+2）
依据：中近距章节 +2
摘要：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。
片段：章节：第1章：废墟苏醒 章节序号：第1章 卷名：第一卷 时间锚点：清晨 Strand：quest 摘要：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。 钩子：黑铁片为何会在古井前突然发热？ 伏笔：黑铁片的真实来历；归炉井入口仍然存在 Beats：在废墟中苏醒 | 黑铁片第一次发热 | 古井残纹与铁片共鸣…

- 卷级总结召回：第一卷
提要：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。；黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。；残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。。当前悬念：谁掌握了抄录缺失的下半段仪轨？；归炉井入口坐标。
匹配分：12
范围：第1-15章
高亮：林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。；黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。；残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。

- 休眠伏笔召回：黑铁片的真实来历
来源：第1章：废墟苏醒
摘要：黑铁片会对古井残纹产生异常共鸣。
匹配分：7
回收指向：第24章：归炉前夜

资源连续性：

- 谢无咎 / 人情
风险级别：高
当前状态：关系：与林冲达成暂时合作
行动限制：与林冲互不信任 -> 与林冲达成暂时合作；黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。
最近消耗：第8章《第8章：黑铁片异响》
连续性风险：谢无咎 · 关系 · 与林冲互不信任 -> 与林冲达成暂时合作；黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。

- 第10章：雾盐旧账 韩山舟 / 立场：中立账房 -> 公开指控雾盐帮

- 第10章：雾盐旧账 雾盐帮 / 状态：低调经营 -> 卷入税印纠纷

- 第10章：雾盐旧账 雾盐驿站 / 状态：账务封存 -> 税印失窃曝光

当前关注实体：

- 林冲（character）
描述：青云门最后传人，沿着黑铁片与归炉井线索追查旧时代遗迹。
关键状态：境界=结丹期；当前目标=确认归炉井与黑铁片的关系
标签：主角
最近出现：第24章：归炉前夜

- 黑铁片（item）
描述：第一卷起就伴随林冲的神秘碎片，第二卷确认其为炼器宗钥印。
关键状态：初始状态=沉寂；当前状态=炼器宗钥印
标签：核心道具
最近出现：第24章：归炉前夜

- 归炉井（location）
描述：旧炼器宗遗留的封闭遗迹，入口会对钥印和前夜时刻作出回应。
关键状态：状态=入口松动；风险=井底仍有未知回响
标签：核心地点
最近出现：第21章：归炉井残图

- 韩山舟（character）
描述：雾盐驿站账房，长期处理盐路矿票与仓单，卷入税印旧账风波。
关键状态：身份=驿站账房；当前冲突=公开指控雾盐帮偷换税印
标签：侧线人物
最近出现：第10章：雾盐旧账

相关关系：

- 命中模式：graph_1hop（结构化强信号）
注入层：relationships
原因：ok（命中历史一度关系边）
焦点实体：林冲
接入策略：一度关系优先。
补充评估：no_two_hop_relationship（历史二度关系不足）

- 强关系：谢无咎 -> 林冲（盟友）
来源：第8章：黑铁片异响
证据：关系：与林冲互不信任 → 与林冲达成暂时合作
置信：high (1.00)
```
