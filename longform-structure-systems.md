长篇结构记忆系统（longform-structure-systems）

## 目标

[hashed-discovering-kay.md](h:/myproject/novel-ai/hashed-discovering-kay.md) 解决"人物不撞脸"（人物卡 + 显式关系）。
本文档解决"故事不断线"：

- 故事线不断、不丢
- 伏笔不忘、有计划
- 世界状态持续演化
- 反派主动推动剧情
- 信息权限不泄露
- 代价和资源连续

## 当前进度（2026-04-15）

执行拆解与实时进度记录见：

- [longform-structure-systems-plan.md](h:/myproject/novel-ai/longform-structure-systems-plan.md)

### 已完成

- `P0-1 Outline Schema Upgrade` 已落地第一版：
  - `BookOutline / VolumeOutline / VolumeMilestone` 新增 longform 骨架字段
  - `OutlineView` 已补对应编辑 UI
  - `outline-store / project-archive / demo data` 已补兼容与默认值
  - `outline-serializer` 已能序列化新字段
  - `server/src/services/generation.ts` 已补书纲 / 卷纲 / 里程碑 prompt 与 normalize 支持
- `S0` 结构记忆底座已打通：
  - 服务端权威表、统一 route、前端请求封装已可复用
- `P0-2 / P0-3 / P0-4` 已完成第一版：
  - `ThreadLedger / ForeshadowPlan / WorldStateEntry` 已落服务端 CRUD、前端维护与上下文注入
- `P1-1 / P1-2 / P1-3 / P1-4` 已完成第一版：
  - `QuestionPool / AntagonistAgenda / POVPermission / ResourceContinuity(core)` 已进入可继续打磨状态
- `P2-1 ResourceContinuity(expanded)` 已完成第一版：
  - 扩展资源类型预设已补到 `物资 / 人情 / 信用 / 证据链`
  - 管理面板已支持按资源类型、人物、风险级别筛选
  - 正文上下文会在高压结构章动态扩张资源连续性注入
  - 审核链路已补非伤势型约束的连续性冲突检测

### 下一步

- 继续做运行态观察与提示降噪，必要时把联动提醒升级成更自动的守护规则
- `ResourceContinuity(expanded)` 后续只保留运行态观察，不再占用主任务位

### 当前口径

- 本文档偏设计说明，实时实施状态以 [longform-structure-systems-plan.md](h:/myproject/novel-ai/longform-structure-systems-plan.md) 为准
- 规划骨架层、结构记忆核心层与 `ResourceContinuity(expanded)` 都已落第一版
- 当前阶段重点从“先补功能”切到“运行态观察与联动降噪”

## 现有基础（项目已有的相关机制）

在设计前必须先明确：项目不是白纸，已有一批相关机制。新系统要和它们共存，不能冲突。

| 现有机制 | 位置 | 能力 | 不足 |
|---------|------|------|------|
| StrandTracker | `domain.ts:352` + `db.ts` | 追踪每章剧情线类型 + 最后出现章节 | 类型固定为 quest/fire/constellation 三种，无自定义；无"线的目标/卡点/触发器" |
| Foreshadow | `domain.ts:273` + `foreshadow-store.ts` | 完整的 planted→activated→resolved→overdue 状态机 | 无规划维度（计划哪卷回收、重要性、激活条件、回收效果） |
| StateChange | `domain.ts:339` + `generation-storage.ts` | 每章提取 entity 的字段变更（oldValue→newValue） | 被动记录，不能主动维护；无"代价持续影响"追踪 |
| WorldStateSummary | `generation-utils.ts` | 从 pinned entities 构建世界快照 | 只是 pinned 实体的摘要拼接，不是结构化的世界状态 |
| ChapterOutline.immutableFacts | `domain.ts:323` | 每章的不可更改事实列表 | 只在章节级别，无跨章/跨卷的持续约束 |
| ChapterSummary + VolumeRecap | `domain.ts:328` + 后端 | 最近 20 章摘要 + 分卷回顾 | 是被动总结，不是主动规划 |

**设计原则：新系统独立建表，但在生成消费时和上述机制协同工作——新系统提供"规划层"数据，现有机制继续提供"记录层"数据。**

### 数据归属与同步架构（补强建议）

这一组结构记忆系统不能只停留在前端本地表里。原因很简单：真正消费它们的是服务端 `buildGenerationContextBundle` 和服务端生成队列。

**推荐架构：前端编辑态 + 服务端权威态双层**

- **服务端 SQLite = 权威源（source of truth）**
  - 所有被生成链路正式消费的数据，都必须存在服务端结构记忆表中
  - 服务端任务队列、批量生成、调试面板统一只读服务端数据
- **前端 Dexie = 草稿态 / 编辑缓存 / 镜像**
  - 允许用户本地编辑、暂存、对比未提交改动
  - 但不能把前端本地表当成正式生成输入的唯一来源
- **同步方式**
  - 前端在“保存/确认”时调用结构记忆同步 API 写入服务端
  - 服务端返回最终版本，前端再回写本地镜像
  - 灵感入口会话内产生的草案，可作为“本次请求内联上下文”直接消费；会话结束后若要长期生效，仍需同步到服务端

**因此后文所有新模型都默认遵循一个规则：**
- 生成消费读取服务端权威态
- 前端可持有本地草稿态，但草稿态不自动等于正式态

**统一引用规则：所有跨系统关联字段一律采用 `Id + name/title` 双存。**

理由：
- `Id` 保证关联稳定，不怕改名、别名、同名人物
- `name/title` 方便展示、导出、调试、Prompt 注入
- 当 `Id` 丢失或对象被删时，仍能保留最小可读语义

---

## 一、规划骨架扩容（Outline Schema Upgrade）

### 为什么要单独列出来

当前 `BookOutline / VolumeOutline / VolumeMilestone` 的字段，对中等规模小说还能勉强使用，但对百万字级长篇明显偏薄。

如果不先把骨架层扩厚，就会出现一种结构失衡：
- 人物卡越来越细
- 结构记忆系统越来越细
- 但最核心的书纲 / 卷纲 / 里程碑本身仍然承载不了暗线、多角色弧线、跨卷承接和视角规划

**因此这里明确：规划骨架扩容属于本文件的正式实施范围，不再停留在“仅供参考”。**

### BookOutline 建议新增字段

```typescript
interface BookOutlineFields {
  // 现有字段...
  subPlots: string[]; // 暗线 / 副线描述
  characterArcs: Array<{
    characterId: Id | null;
    characterName: string;
    arc: string;
  }>;
  powerSystem: string;      // 能力体系
  antagonistSystem: string; // 对抗体系
  narrativeArc: string;     // 全书节奏弧线
  logline: string;          // 一句话卖点
}
```

### VolumeOutline 建议新增字段

```typescript
interface VolumeOutlineFields {
  // 现有字段...
  antagonist: string;        // 本卷明面对手
  subPlot: string;           // 本卷暗线
  inheritedThreads: Array<{
    threadId: Id | null;
    threadName: string;
    note: string;
  }>;                        // 从前卷继承的悬念 / 线头
  protagonistGrowth: string; // 主角在本卷的成长 / 境界变化
  emotionalArc: string;      // 本卷情感线推进
  estimatedWordCount: number;// 预估字数
  povPlan: string;           // 本卷视角规划
}
```

### VolumeMilestone 建议新增字段

```typescript
interface VolumeMilestoneDraft {
  // 现有字段...
  phasePacing: string;      // 阶段节奏：高压 / 蓄力 / 过渡 / 反扑
  phaseEmotionShift: string;// 阶段情感变化
  phasePOV: string;         // 阶段主视角 / 辅视角
}
```

### 设计定位

- `Outline Schema Upgrade` 属于**规划骨架层**
- `ThreadLedger / QuestionPool / ForeshadowPlan / WorldStateEntry` 属于**结构记忆层**
- 结构记忆层是在骨架层之上补长期状态，不替代骨架本身

换句话说：
- 骨架层回答：这本书 / 这一卷 / 这一阶段本来要怎么走
- 结构记忆层回答：走到现在具体发生了什么、哪些线还活着

---

## 二、剧情线账本（ThreadLedger）

### 解决什么问题
200 章后"主线还在，支线丢了"。作者和系统都不知道某条线推进到哪了、该什么时候捡起来。

### 和现有 StrandTracker 的关系
- StrandTracker 是"记录层"——AI 生成后自动标注本章属于哪种剧情线
- ThreadLedger 是"规划层"——作者主动声明有哪些线、每条线现在到哪了
- 两者并存：ThreadLedger 告诉系统"该推哪条线了"，StrandTracker 记录"实际推了哪条"

### 数据模型
```typescript
interface ThreadLedger {
  id: Id;
  projectId: Id;
  name: string;                    // 线名："翻案线"/"量天司线"/"情感线"
  type: string;                    // 主线 / 支线 / 暗线 / 情感线 / 成长线 / 悬疑线
  coreQuestion: string;            // 核心问题："量天司到底是什么？"
  currentPhase: string;            // 当前阶段："已发现存在，尚未正面接触"
  lastProgressAt: string;          // 最近推进点："第47章许明拿到附则第七条原文"
  nextTrigger: string;             // 下一触发点："许明回到仙都后触发"
  blockedBy: string;               // 当前卡点："需要先拿到承天城档案权限"
  relatedCharacterIds: Id[];       // 关联人物（稳定关联）
  relatedCharacterNames: string[]; // 冗余存名
  relatedForeshadowIds: Id[];      // 关联伏笔（稳定关联）
  relatedForeshadowTitles: string[];// 冗余存标题
  plannedResolveVolume: number | null; // 预计收束卷
  status: 'active' | 'dormant' | 'resolved'; // 活跃/休眠/已收束
  audienceHeat: number;            // 读者期待度 1-5（Gemini 建议）
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 生成消费
- 生成 ChapterBeat 时注入：当前 active 且 audienceHeat >= 3 的线，提醒"本章可以推进哪条线"
- 生成正文时注入：本章相关的 1-2 条线的 coreQuestion + currentPhase
- 每章生成后：检查是否有 dormant 线超过 N 章（如 15 章）未推进 → 告警

---

## 二、伏笔规划账本（ForeshadowPlan）

### 解决什么问题
现有 Foreshadow 只记"埋了/收了"的事实状态，不记"打算什么时候动、动了会改什么"。

### 和现有 Foreshadow 的关系
- 不替换 Foreshadow，而是为每个 Foreshadow 补一条规划记录
- Foreshadow 继续管状态（planted/activated/resolved）
- ForeshadowPlan 管意图（计划什么时候收、收了改变什么）
- **假线索 / 误导答案统一归 QuestionPool 管**，ForeshadowPlan 只通过 `relatedQuestionIds` 关联，不再重复存一份

### 数据模型
```typescript
interface ForeshadowPlan {
  id: Id;
  projectId: Id;
  foreshadowId: Id;                // 关联到 Foreshadow
  foreshadowTitle: string;         // 冗余存标题
  type: string;                    // 主线伏笔 / 支线伏笔 / 关系伏笔 / 规则伏笔 / 反转伏笔
  importance: 'major' | 'minor';   // 重要性
  plannedActivateVolume: number | null;  // 计划激活卷
  plannedResolveVolume: number | null;   // 计划回收卷
  activationCondition: string;     // 激活条件："许明拿到公审资格时"
  resolveCondition: string;        // 回收条件："余化及当庭道心崩塌时"
  dependsOnForeshadowIds: Id[];    // 依赖哪些前提伏笔
  dependsOnForeshadowTitles: string[]; // 冗余存标题
  dependsOnEventKeys: string[];    // 依赖哪些事件/状态键
  relatedQuestionIds: Id[];        // 这条伏笔主要服务于哪些未解问题
  payoffEffect: string;            // 回收后改变什么："量天司合法性被连根拔起"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 生成消费
- 生成 VolumeOutline/Milestone 时：注入该卷 plannedActivateVolume/plannedResolveVolume 匹配的伏笔计划
- 生成正文时：当前章节相关的 activated 伏笔，附带 resolveCondition 提醒
- 轻校验：importance=major 的伏笔超过计划回收卷 2 卷仍未 resolved → 告警

---

## 三、世界状态表（WorldStateTable）

### 解决什么问题
世界像静止背景板——上一卷仙盟大会变天了，下一卷世界却像没动过。

### 和现有 WorldStateSummary / StateChange 的关系
- WorldStateSummary 是从 pinned entities 实时构建的快照，不结构化
- StateChange 是章节级的自动提取，粒度太细
- WorldStateTable 是作者主动维护的"世界现在是什么样"，按卷/里程碑粒度

### 数据模型（采用 Gemini 建议的 Delta 更新法）
```typescript
interface WorldStateEntry {
  id: Id;
  projectId: Id;
  volumeId: Id;                    // 哪个卷末的状态
  milestoneIndex?: number;         // 可选：精确到哪个里程碑
  // Delta 字段 — 只记本卷/本阶段的变化
  publicEvents: string[];          // 公开事件："秦不孤案平反"
  secretEvents: string[];          // 秘密事件："量天司灭口余化及"
  powerBalanceChange: string;      // 势力变化："柳镇守使被明升暗降"
  institutionChange: string;       // 制度变化："积案清查组被撤销"
  ruleChange: string;              // 规则变化："附则第七条仍为删改版"
  rumorState: string;              // 舆论状态："仙都传言许明一战成名"
  knownByCharacterIds: Id[];       // 关键信息由谁掌握（稳定关联）
  knownByCharacterNames: string[]; // 冗余存名
  currentRisks: string[];          // 当前风险："许明没有靠山了"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### WorldState 的合并规则（必须写死）

WorldStateEntry 采用 delta 方案的前提，是必须明确覆盖优先级，否则不同层的状态会相互打架。

**推荐合并优先级：**
`chapter > milestone > volume > recap`

解释：
- `chapter`：最细粒度，优先级最高
- `milestone`：当前阶段的稳定状态
- `volume`：本卷默认状态
- `recap`：仅作兜底参考，不覆盖结构化字段

**消费规则：**
- 当前章若存在 chapter 级状态，直接覆盖同 key 的 milestone / volume 值
- 若无 chapter 级，取 milestone 级
- 若 milestone 级也无，取 volume 级
- recap 只参与补全文本说明，不参与覆盖判断

### 生成消费
- 生成正文时：注入当前卷 + 前一卷的 WorldStateEntry（两条 delta 叠加即为当前世界）
- 注入格式："【世界状态-本卷变化】公开事件：…；势力变化：…；当前风险：…"
- 不注入所有历史卷的状态——token 预算有限，只看最近两层 delta

---

## 四、反派议程板（AntagonistAgenda）

### 解决什么问题
反派等着被打——主角不动，世界就停。

### 数据模型
```typescript
interface AntagonistAgenda {
  id: Id;
  projectId: Id;
  characterEntityId: Id;           // 关联 LoreEntity
  characterName: string;           // 冗余存名
  // 议程
  publicRole: string;              // 公开身份："天璇宗太上长老"
  hiddenAgenda: string;            // 隐藏目标："维护量天司合法性，保住自己的道果"
  currentObjective: string;        // 当前目标："阻止秦不孤案重审"
  currentAction: string;           // 正在做什么："通过档案主事压卷、删缺页"
  triggerToStrike: string;         // 什么情况出手："许明拿到调卷权限时"
  bottomLine: string;              // 底线："那枚魔气玉简绝不能被打开"
  resourceBase: string;            // 手上有什么："化神中期修为、仙盟人脉、量天司外围支持"
  nextMoveWindow: string;          // 下一次出手窗口："复核听证阶段"
  intelligenceBlindSpot: string;   // 信息盲区（Gemini 建议）："不知道秦小昭持有秦不孤私人笔记"
  ifProtagonistDoesNothing: string;// 主角不动会怎样："余化及会先发制人消除许明"
  status: 'active' | 'defeated' | 'dormant';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 生成消费
- 生成 ChapterBeat/正文时：如果当前章涉及该反派或触发条件被满足，注入 currentObjective + currentAction + triggerToStrike
- 防呆："如果主角在本章没有主动行动，反派会做什么？" → 从 ifProtagonistDoesNothing 生成

---

## 五、未解问题池（QuestionPool）

### 解决什么问题
早期抛出的钩子蒸发了——读者记得"量天司到底是什么"，但 200 章后作者忘了推进。

### 数据模型
```typescript
interface QuestionPool {
  id: Id;
  projectId: Id;
  question: string;                // "量天司到底是什么？"
  firstRaisedChapterId: Id | null; // 第一次抛出的章节
  firstRaisedAt: string;           // "第一卷第10章，余化及口供只写了三个字"
  belongsToThreadId: Id | null;    // 关联 ThreadLedger
  belongsToThreadName: string;     // 冗余存线名
  currentClue: string;             // 当前已给线索："许明知道名字，柳镇守使不敢说"
  falseAnswers: string[];          // 已抛出的假线索
  expectedRevealWindow: string;    // 预计揭晓窗口："第二卷中段在承天城"
  finalAnswerSummary: string;      // 最终答案概述（作者预设）
  status: 'open' | 'partial' | 'answered';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 生成消费
- 生成 VolumeOutline 时：注入该卷 expectedRevealWindow 内的问题，提醒"本卷该推进哪些悬念"
- 轻校验：status=open 且超过 expectedRevealWindow 仍未推进 → 告警

---

## 六、视角与信息权限表（POVPermission）

### 解决什么问题
主角不该知道的事情，写得像他知道了；该保密的信息提前泄露。

### 数据模型
```typescript
interface POVPermission {
  id: Id;
  projectId: Id;
  // 适用范围
  volumeId?: Id;                   // 卷级
  milestoneIndex?: number;         // 里程碑级
  chapterId?: Id;                  // 章节级（最细粒度）
  // 权限
  povCharacterId: Id | null;       // 本单元视角人物（稳定关联）
  povCharacterName: string;        // 冗余存名
  readerKnows: string[];           // 读者可以知道的
  protagonistKnows: string[];      // 主角知道的
  antagonistKnows: string[];       // 反派知道的
  mustHide: string[];              // 绝对禁止透露的信息
  canHint: string[];               // 可以暗示但不能明说的
  forbiddenReveal: string[];       // 本单元内禁止揭晓的谜底
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 生成消费
- 生成正文时：注入当前章节的 mustHide + canHint
- 格式："【信息控制】本章禁止透露：…；可以暗示：…"
- 和 ChapterBeat.forbiddenScenePatterns 协同——forbiddenScenePatterns 管场景，mustHide 管信息

---

## 七、资源与代价连续性表（ResourceContinuity）

### 解决什么问题
上一章付了代价，下一章像没事人。

### 数据模型
```typescript
interface ResourceContinuity {
  id: Id;
  projectId: Id;
  resourceType: string;            // 伤势/寿命/权限/信用/人情/证据链/法理反噬
  ownerCharacterId: Id | null;     // 谁的资源（稳定关联）
  ownerCharacterName: string;      // 冗余存名
  currentState: string;            // "左臂骨折，三个月内无法使用"
  performanceImpact: string;       // 对行动的具体限制（Gemini 建议）："无法展开明镜高悬道域"
  lastConsumedAt: string;          // 最近消耗位置："第五卷天道审判"
  recoveryCondition: string;       // 恢复条件："无法恢复，永久失去300年寿元"
  hiddenCost: string;              // 隐藏代价："被量天司'看见'了"
  continuityRisk: string;          // 连续性风险："如果忘记这个限制，后续战斗会不合理"
  status: 'active' | 'recovered' | 'permanent';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 生成消费
- 生成正文时：注入 status=active 且 owner 匹配焦点人物的条目
- 注入格式："【代价约束】许明：寿元仅剩三年，无法再次启动天道审判"
- 和 ChapterOutline.immutableFacts 协同——immutableFacts 是章节级硬约束，ResourceContinuity 是跨章持续约束

---

## 八、系统间联动规则（Gemini 建议）

这 7 个系统不是孤立的 Excel 表，需要联动：

| 触发事件 | 联动检查 |
|---------|---------|
| 伏笔被标记为 resolved | 检查 WorldStateEntry 是否需要更新（如"附则第七条恢复"改变了世界规则） |
| 反派 agenda 的 triggerToStrike 被满足 | 检查 ThreadLedger 对应线是否需要推进 |
| 章节生成完成 | 检查 ResourceContinuity 中 active 条目是否在本章被遵守 |
| 卷结束 | 检查 QuestionPool 中 expectedRevealWindow 匹配本卷的问题是否有推进 |
| 世界状态变更 | 检查 AntagonistAgenda 的 currentAction 是否需要响应 |

---

## 九、和现有结构的完整层级关系

```
BookOutline（全局总纲）
├── ThreadLedger[]（剧情线账本 — 全局级）
├── QuestionPool[]（未解问题池 — 全局级）
│
├── VolumeOutline（卷级推进）
│   ├── WorldStateEntry（世界状态 — 卷级 delta）
│   ├── POVPermission（视角权限 — 卷级默认）
│   │
│   ├── VolumeMilestone（阶段推进）
│   │   ├── POVPermission（视角权限 — 里程碑级覆盖）
│   │   │
│   │   ├── ChapterBeat（章节拍）
│   │   │   ├── POVPermission（视角权限 — 章节级覆盖）
│   │   │   └── focusCharacters / availableCharacters
│   │   │
│   │   └── ChapterOutline（章节大纲）
│   │       └── immutableFacts[]
│   │
│   └── ForeshadowPlan[]（伏笔规划 — 按卷窗口）
│
├── CharacterCard（人物卡 — 静态+动态）
├── EntityRelation（显式关系 — 稳定+阶段）
├── AntagonistAgenda（反派议程 — 每个核心对手）
├── ResourceContinuity（资源与代价 — 跨章持续）
│
└── 现有自动层（不变）
    ├── StrandTracker（剧情线自动记录）
    ├── StateChange（状态变更自动提取）
    ├── Foreshadow（伏笔状态机）
    ├── ChapterSummary + VolumeRecap（摘要）
    └── generation_relationships（自动关系）
```

---

## 十、实施优先级

### P0（直接影响长篇中后期是否散架）
1. **Outline Schema Upgrade（书纲 / 卷纲 / 里程碑字段扩容）**
2. **ThreadLedger（剧情线账本）** — 新建 `threadLedgers` 表
3. **ForeshadowPlan（伏笔规划）** — 新建 `foreshadowPlans` 表，关联现有 Foreshadow
4. **WorldStateEntry（世界状态）** — 新建 `worldStateEntries` 表

### P1（显著提升质量）
5. **AntagonistAgenda（反派议程）** — 新建 `antagonistAgendas` 表
6. **POVPermission（视角权限）** — 新建 `povPermissions` 表
7. **QuestionPool（未解问题池）** — 新建 `questionPools` 表
8. **ResourceContinuity（核心子集）** — 先覆盖伤势 / 寿命 / 权限 / 法理反噬 / 关键代价

### P2（锦上添花）
9. **ResourceContinuity（扩展子集）** — 再扩到物资 / 人情 / 信用 / 证据链

**为什么把 ResourceContinuity 提到 P1：**
- 这本书的核心卖点之一就是法理代价、能力反噬、伤势与失去法理之心
- 这些内容如果跨章连续性断掉，会直接破坏主线可信度
- 因此“核心代价连续性”不是锦上添花，而是中后期稳定性的核心部件

### 新增文件清单

| 文件 | 内容 |
|------|------|
| `app/src/types/domain.ts` | BookOutline / VolumeOutline / VolumeMilestone 字段扩容 + 结构记忆接口定义（统一采用 Id + name/title 双存） |
| `app/src/lib/db.ts` | 前端本地草稿/镜像表（可选） |
| `app/src/lib/structure-memory-client.ts` | 新建 — 前端与服务端结构记忆同步客户端 |
| `app/src/stores/outline-store.ts` | 书纲 / 卷纲 / 里程碑扩容字段的保存与读取 |
| `app/src/stores/thread-ledger-store.ts` | 新建 |
| `app/src/stores/foreshadow-plan-store.ts` | 新建 |
| `app/src/stores/world-state-store.ts` | 新建 |
| `app/src/stores/antagonist-agenda-store.ts` | 新建 |
| `app/src/stores/pov-permission-store.ts` | 新建 |
| `app/src/stores/question-pool-store.ts` | 新建 |
| `app/src/stores/resource-continuity-store.ts` | 新建 |
| `app/src/components/OutlineView.tsx` | 书纲 / 卷纲 / 里程碑新增字段的编辑 UI |
| `app/src/components/StructureWorkspace.tsx` | 新建 — 结构记忆系统的统一管理界面 |
| `server/src/routes/structure-memory.ts` | 新建 — 结构记忆读写 / 批量同步接口 |
| `server/src/services/structure-memory-store.ts` | 新建 — 服务端结构记忆 CRUD / 合并逻辑 |
| `server/src/services/generation-sqlite.ts` | 新增结构记忆表 + 索引（服务端权威态） |
| `server/src/services/generation.ts` | BookOutline / VolumeOutline / Milestone prompt 与 normalize 结构同步扩容 |
| `server/src/services/generation-context.ts` | 改造 — 在 buildGenerationContextBundle 中增加结构记忆注入 |

---

## 十一、结构记忆层增量预算（叠加在人物关系层之上）

| 类型 | 上限 | 预算 |
|------|------|------|
| 剧情线提醒 | 2-4 条 × 120-260 字 | ~240-1040 字 |
| 伏笔规划提醒 | 2-4 条 × 120-260 字 | ~240-1040 字 |
| 世界状态 delta | 1-3 条 × 250-500 字 | ~250-1500 字 |
| 反派议程 | 1-2 条 × 180-360 字 | ~180-720 字 |
| 信息权限 | 1-3 条 × 120-240 字 | ~120-720 字 |
| 资源/代价约束 | 2-4 条 × 120-240 字 | ~240-960 字 |
| **结构层基准压缩态** | 取各项下限组合 | **约 1270-1800 字** |
| **结构层常规推荐态** | 取中位数组合 | **约 2200-3600 字** |
| **结构层高压结构章** | 取高位数组合 | **约 4200-6000 字** |

**本节只定义“结构记忆层增量预算”。**
- [hashed-discovering-kay.md](h:/myproject/novel-ai/hashed-discovering-kay.md) 定义的是“人物关系层预算”
- 本文档定义的是“结构记忆层增量预算”
- 两者叠加后，才是**单章记忆层总预算**
- [hashed-discovering-kay.md](h:/myproject/novel-ai/hashed-discovering-kay.md) 里的“隐形限流点”只定义容量参数，不单独定义 token 预算
- 上表只覆盖“结构核心块”，**还不包括当前系统已有的检索/摘要层**（最近摘要、最近正文尾段、卷 recap、memory retrieval chunks）

**按项目当前估算公式（`text.length / 1.5`）换算，结构层增量大致对应：**
- `1270-1800 字` ≈ `850-1200 tokens`
- `2200-3600 字` ≈ `1460-2400 tokens`
- `4200-6000 字` ≈ `2800-4000 tokens`

**结构层增量执行预算：**
- 轻章：`1000-1800 tokens`
- 常规章：`1800-3000 tokens`
- 群像 / 高压结构章：`3000-5000 tokens`

## 十二、单章记忆层总预算（人物关系层 + 结构记忆层）

**人物关系层预算来自 [hashed-discovering-kay.md](h:/myproject/novel-ai/hashed-discovering-kay.md)：**
- 轻章：`1200-1600 tokens`
- 常规章：`1800-2500 tokens`
- 群像 / 高压人物章：`2500-3500 tokens`

**结构记忆层增量预算来自本文档：**
- 轻章：`1000-1800 tokens`
- 常规章：`1800-3000 tokens`
- 群像 / 高压结构章：`3000-5000 tokens`

**当前系统既有的检索 / 摘要层预算：**
- 轻章：`800-1600 tokens`
- 常规章：`1200-2500 tokens`
- 群像 / 高压结构章：`2000-4000 tokens`

**两者叠加后的单章记忆层总预算：**
- 轻章：`3000-5000 tokens`
- 常规章：`5000-8000 tokens`
- 群像 / 高压结构章：`8000-10000 tokens`

**按当前项目估算公式（`text.length / 1.5`）换算，大致对应：**
- 轻章：约 `4500-7500 字`
- 常规章：约 `7500-12000 字`
- 群像 / 高压结构章：约 `12000-15000 字`

**推荐控制方式：**
- 轻章：优先保人物层，结构层只带最必要的 2-4 项，但允许为高价值老信息和检索召回预留额外空间
- 常规章：人物层、结构层、检索摘要层都允许跑到区间中段，视世界状态复杂度动态扩张
- 群像 / 高压结构章：允许结构层和检索摘要层明显扩张，目标上限直接按 `10K tokens` 级别设计，但不能反过来挤掉核心人物卡和显式关系

**这里的“单章记忆层总预算”只指结构化上下文 / 记忆层，不包含任务层。**

任务层通常包括：
- ChapterBeat / 当前 beat
- Outline / ForbiddenZone
- 当前写作指令
- 模板 Prompt / 项目写法约束

也就是说：
- `10K tokens` 级别说的是“记忆层上限”
- 整次请求总 token 仍然会在此基础上再加上任务层

超出时按优先级从底部裁剪：
1. 自动关系
2. 次级剧情线提醒 / 次级伏笔提醒
3. availableCharacters 弱摘要
4. 非核心世界状态 / 反派议程补充
5. 非核心信息权限 / 资源代价补充
6. 最后才压缩核心人物卡 / 显式关系 / 核心代价约束
