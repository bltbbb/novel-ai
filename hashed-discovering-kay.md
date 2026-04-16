# 人物图谱 + 人物人格卡 改进方案评审

## 文档定位

本文档现在只负责**人物关系层**：

- 人物卡
- 显式关系
- `availableCharacters / focusCharacters`
- 人物关系层预算
- 与人物关系层直接相关的生成消费改造与隐形限流点

关于“百万级长篇是否 cover”“BookOutline / VolumeOutline / VolumeMilestone 扩容”“暗线 / 跨卷承接 / 世界状态 / 伏笔规划 / 结构记忆系统”等结构层内容，已正式迁移到：

- [longform-structure-systems.md](./longform-structure-systems.md)

后续以 [longform-structure-systems.md](./longform-structure-systems.md) 为结构层权威文档；本文档不再重复维护那部分分析，避免两边漂移。

如果你要按 HTTP / client / route / service 逐层联调人物关系层与章节生成主链，请直接看：[完整接口手册.md](./完整接口手册.md)

---

## 背景：当前系统现状

### 关系图谱现状
- **前端图谱页面**（`app/src/components/GraphWorkspace.tsx`）：已经同时提供“综合图谱”和“关系视图”两种模式；关系视图会把前端 `entityRelations` 的显式关系与服务端调试回灌的运行态关系一起展示
- **显式关系编辑态**：`EntityRelation` 当前保存在前端 IndexedDB，可在 `app/src/components/LoreWorkspace.tsx` 中创建、编辑、删除，并区分草案/正式态
- **服务端运行态关系表**（`generation_relationships`）：AI 生成章节后自动提取，用于记录与调试，不支持手工编辑
- **生成消费链路**：正式生成不会直接跨端查询前端表；当前做法是前端先把 `entityRelations` 组装成 `relationSnapshot`，再随生成请求发送给服务端消费
- **当前问题**：显式关系已能进入生成，但“关系历史版本”“按卷回放”“灵感入口自动产关系草案”都还没有落地

### 人物卡现状
- **人物卡编辑**：`app/src/components/LoreWorkspace.tsx` 已支持 character 的静态 8 字段、动态 4 字段、别名、草案确认和完整度提示
- **章节拍字段**：`mustAppearCharacters` 和 `availableCharacters` 已存在；`app/src/components/OutlineView.tsx` 里当前是人工维护文本列表
- **消费入口**：`server/src/services/generation-context.ts` 已按 `static_` / `current_` 前缀拆分人物卡，并对实体块、关系块、检索块做数量/字符级裁剪
- **当前问题**：`availableCharacters` 自动候选/回填尚未实现；预算仍以常量裁剪和前端估算为主，尚未形成端到端 token 硬控制

### 文档口径说明
- **已实现**：仓库里已经能找到对应代码入口
- **建议 / 规划**：保留设计方向，但当前不能当作现状依赖
- **待验证**：链路已接通，但本文不把它当成“已完成验收”

---

## 人物人格卡方案

### 一、核心设计：静态人格 + 动态状态双层分离

人物卡拆成两层，模型明确知道哪些能变、哪些不能变：

**静态层（人格内核）— 基本不变，变了就是人设崩**：
```typescript
interface CharacterStaticCard {
  desire: string;           // 核心欲望 — 驱动力
  fear: string;             // 核心恐惧 — 冲突触发点
  values: string;           // 价值排序 — 决策依据
  trueNature: string;       // 真实底色 — 内在本质
  speechStyle: string;      // 说话方式 — 含常用表达/避免表达，防同质化最直接的字段
  decisionStyle: string;    // 行为偏好/决策习惯 — 先试探还是先出手、先算账还是先讲理，决定行动风格
  conflictResponse: string; // 冲突时反应 — 高压场景的行为锚点
  taboos: string;           // 底线与禁忌 — 防止 AI 写出"越线"行为
}
```

**动态层（阶段状态）— 跟着卷/里程碑走，每个阶段可以不同**：
```typescript
interface CharacterDynamicState {
  currentStance: string;    // 当前立场 — 如"相信律法" / "质疑律法" / "重建信念"
  currentWound: string;     // 当前伤口 — 如"伪造证据的愧疚" / "失去法理之心"
  currentGoal: string;      // 当前目标 — 如"让秦不孤案被正式重审"
  currentDisguise: string;  // 当前伪装/对外人设 — 如"低调抄写员" / "新晋检律使"
}
```

**为什么这样拆**：
- 许明从"相信律法"到"伪造证据失去法理之心"再到"重修"，动态层变了三次，但静态层的 `desire`("白纸黑字不该有错") 始终没变
- 余化及的 `trueNature`(野心家) 不变，但 `currentDisguise`(仙门耆宿/秩序维护者) 在三百年间层层加固
- 模型看到两层分离，就知道动态层可以写变化，静态层不能随便动

**"对主角态度"不放人物卡** — 放进关系模型的 stance 字段。态度是双向的、会变的，属于关系而非人物本体。

**实现方式**：不改 LoreEntity 的 fields 类型（仍然是 `Record<string, any>`），前端编辑器在 `type === 'character'` 时渲染模板化表单：
- 静态层字段用 key 前缀 `static_`（如 `static_desire`）
- 动态层字段用 key 前缀 `current_`（如 `current_stance`）
- 数据库不用迁移，旧数据兼容，非 character 类型不受影响
- AI 消费时按前缀区分，静态层标注"不可改变"，动态层标注"当前阶段"

---

### 二、显式关系模型

**当前已实现的是：前端维护 `EntityRelation`，正式生成通过 `relationSnapshot` 消费；设计上仍保持与自动推导关系并存。**

```typescript
interface EntityRelation {
  id: Id;
  projectId: Id;
  sourceEntityId: Id;
  targetEntityId: Id;
  sourceEntityName: string;
  targetEntityName: string;

  // 稳定层 — 关系本质，基本不变
  relationType: string;        // 师徒/血缘/宿敌/镜像/担保/旧识...
  origin: string;              // 关系因什么建立（"第一卷公审后结为搭档"）
  description: string;         // 关系本质描述（"绳是许明的镜子——都从裂缝里爬出来"）

  // 阶段层 — 当前态度，随剧情更新
  currentStance: string;       // 当前态度：信任/冷战/利用/防备/暧昧/敌对...
  currentIntensity: number;    // 当前强度 1-5
  stanceReason: string;        // 当前态度因什么事件形成（"第三卷许明伪造证据导致冷战"）

  draft: boolean;              // 草案态标记（手工创建或未来灵感入口落草案时为 true，用户确认后为 false）
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**稳定层 vs 阶段层的区别**：
- "许明和秦小昭是搭档"（稳定）不会因为冷战而消失
- "当前冷战、信任度降到2"（阶段）可以随剧情更新

**关系历史版本：定死为"只保留当前态，不做历史版本"**

这是本文档最重要的一个决策。理由：
1. 历史版本需要 snapshot 表 + 版本号 + 按卷回溯 UI，实现成本翻倍
2. 当前核心目标是"生成时关系不写飘"，只需要当前态就够
3. 如果中期需要"按卷回顾关系演化"，再补 `EntityRelationSnapshot` 表，当前架构不阻碍扩展

因此：
- EntityRelation 一条记录就够，阶段层字段直接原地更新
- `stanceReason` 记录"最近一次变化的锚点事件"，足以让模型知道为什么是这个态度
- **不做按卷过滤关系**，图谱页面只展示当前态
- 如果作者想记录"第三卷曾经冷战"，可以在 `stanceReason` 里手写历史（"第三卷冷战→第四卷和解→当前信任"）

**和自动推导关系的区别**：
| 维度 | EntityRelation（显式） | generation_relationships（自动） |
|------|----------------------|-------------------------------|
| 来源 | 用户手动创建；后续可扩展到灵感入口 | AI 生成后自动提取 |
| 用途 | **规划层**——告诉 AI 该怎么写 | **记录层**——AI 写完后记下来的 |
| 可编辑 | 可以 | 不可以 |
| 存储 | 编辑态在前端 IndexedDB；生成态通过 `relationSnapshot` 随请求上传 | 服务端 SQLite |
| 消费优先级 | **高于自动关系** | 低于显式关系 |

**当前实现的数据流**：
1. 前端在 IndexedDB 维护 `EntityRelation`
2. 发起生成前，由 `app/src/lib/generation-relation-snapshot.ts` 把它转换成 `relationSnapshot`
3. `GenerationView / GenerationWorkspace / GenerationLabDialog` 把 `relationSnapshot` 附到请求上
4. 服务端 `server/src/services/generation-context.ts` 直接消费 `input.relationSnapshot`，并让显式关系优先于自动关系

#### 最小联调样例（以 `/api/ai/plan` 为例）

下面这段只保留当前仓库里真实存在、且足够验证 `relationSnapshot` 主链路的最小要点，不展开成完整 API 文档。

**前端从哪里组装**
- `GenerationView.tsx` 当前主链路会先从 `useEntityRelationStore` 读出当前项目的 `entityRelations`
- 然后用 `buildGenerationRelationSnapshot(entityRelations.filter((relation) => relation.projectId === projectId))` 组装请求态快照
- `GenerationWorkspace.tsx`、`GenerationLabDialog.tsx` 走的是同一套组装函数；主创作入口优先看 `GenerationView.tsx`

**请求里最少要看到什么**
- 最小联调建议直接看 `POST /api/ai/plan`
- 不需要把所有字段都塞满，但至少要有章节定位、人物快照、`relationSnapshot`、模型参数
- 为了让显式关系稳定命中，建议同时带上 `requiredEntityNames`，让服务端有明确焦点人物

```json
{
  "projectId": "proj_demo",
  "chapterId": "chapter_12",
  "chapterTitle": "第十二章 夜雨入城",
  "chapterOrder": 12,
  "volumeTitle": "第一卷",
  "bookOutline": "......",
  "volumeOutline": "......",
  "chapterBeat": "林澈潜入承天城，必须和沈砚临时结盟。",
  "entitySnapshot": [
    {
      "name": "林澈",
      "type": "人物",
      "description": "潜入承天城的主角",
      "fields": {},
      "tags": ["主角"],
      "aliases": [],
      "pinned": true,
      "draft": false
    },
    {
      "name": "沈砚",
      "type": "人物",
      "description": "城内接应人",
      "fields": {},
      "tags": ["盟友"],
      "aliases": [],
      "pinned": false,
      "draft": false
    }
  ],
  "relationSnapshot": [
    {
      "id": "rel_001",
      "sourceEntityId": "entity_linche",
      "targetEntityId": "entity_shenyan",
      "sourceEntityName": "林澈",
      "targetEntityName": "沈砚",
      "relationType": "临时盟友",
      "origin": "黑市交易后形成互保",
      "description": "双方互不完全信任，但当前目标一致",
      "currentStance": "合作中带戒备",
      "currentIntensity": 4,
      "stanceReason": "林澈需要进城路线，沈砚需要外部援手",
      "draft": false
    }
  ],
  "requiredEntityNames": ["林澈"],
  "availableCharacterNames": ["林澈", "沈砚"],
  "model": "gpt-5.4",
  "temperature": 0.8
}
```

**服务端从哪里消费**
- 路由入口是 `server/src/routes/generation.ts` 的 `/api/ai/plan`
- 服务函数 `generateChapterOutline` 会把请求继续传给 `resolveRequestContextBundle`
- `resolveRequestContextBundle` 再调用 `buildGenerationContextBundle`
- 在这一步里，`relationSnapshot` 当前主要做三件事：
  1. `expandFocusEntityNamesByExplicitRelations(...)`：如果焦点人物命中 `林澈`，会把一跳显式关系里的 `沈砚` 也拉进焦点集合
  2. `buildExplicitRelationshipBlocks(...)`：把快照转成“显式关系”文本块，直接进入关系上下文
  3. `filterAutomaticRelationshipBlocksByExplicitCoverage(...)`：如果自动关系和显式关系撞车，优先保留显式关系

**联调成功后先看哪里**
- 第一观察点看浏览器 Network：`/api/ai/plan` 请求体里应能直接看到非空 `relationSnapshot`
- 第二观察点看接口返回：只要请求成功返回 `200` 且拿到 `outline`，说明这条链路至少已经被前后端接受
- 第三观察点看正文/规划结果：如果 `requiredEntityNames` 只给了 `林澈`，但章节契约里开始稳定把 `沈砚` 也当成关系相关人物处理，通常说明一跳显式关系扩展已经生效
- 如果要看服务端调试层的关系来源，不要把它理解成这次 `/api/ai/plan` 的即时回显；当前更适合在后续提取/重建后，再去 `GenerationView` 的调试区或 `GraphWorkspace` 关系视图里查看 `sourceKind = explicit_manual / explicit_manual_draft`

**设计意图**：显式关系在生成消费时应直接注入，不经过置信度过滤。它们是作者的明确意图，不需要 AI 来猜。

---

### 三、灵感入口草案态

**当前已实现的只有 `seedEntities` 草案落库；`seedRelationships` 仍是规划项，不应视为现状。**

原因：discuss 里很多内容虽然精彩，但未必已经稳定。AI 一次总结偏了，如果直接成为高优先级数据会被反复注入。

机制：
- LoreEntity 和 EntityRelation 当前都有 `draft: boolean` 字段
- 灵感入口当前只会把 `seedEntities` 写成草案角色；`seedForeshadows` 仍按伏笔链路单独创建
- 显式关系草案当前来源于作者在设定库/关系编辑区手工新建或确认，不是灵感入口自动产出
- 如果后续要支持灵感入口直接生成关系草案，再新增 `seedRelationships` 字段与落库链路
- 在设定库/关系编辑器里用户手动确认后 `draft = false`
- **消费规则（按场景区分）**：
  - 大纲/卷纲/里程碑生成：**允许消费草案** — 规划阶段正是需要这些数据的时候
  - 正文生成：**草案不注入** — 只注入已确认的数据，防止 AI 一次总结偏了被反复放大
  - 灵感对话（立项会话内）：**允许消费草案** — 对话上下文本身就在迭代这些数据
- 前端 UI：草案态卡片用虚线边框/半透明样式，显示"待确认"标记
- 本文后面提到“关系草案”时，默认指 `EntityRelation.draft = true` 的手工草案，不等于 `seedRelationships` 已落地

---

### 四、实体去重/别名机制

**LoreEntity 新增 `aliases: string[]` 字段，防止超长篇里同一角色裂成多份。**

典型场景：
- "灵茶铺老板" / "茶铺老板" / "老板" / "某某前辈" 其实是一个人
- "第三执事" / "绳" / "绳姐" 是一个人

机制：
- LoreEntity 加 `aliases: string[]`
- 生成消费时：实体匹配按 `name + aliases` 全部命中
- 图谱/关系编辑器：创建新实体时检查是否与已有实体的 name/aliases 重复，提示合并
- 灵感入口：`seedEntities` 生成后应补一次别名冲突检查；当前更稳妥的做法仍是创建后人工复核

---

### 五、卷纲关系变化

**不在 VolumeOutline 加字段，关系变化通过 EntityRelation 的阶段层（currentStance / stanceReason）直接更新。**

原因：
1. 关系变化的粒度不一定是"每卷"，可能是某个里程碑内就变了
2. 如果在卷纲里也加字段，会和 EntityRelation 有两份数据，容易不一致
3. EntityRelation 的 stanceReason 本身就记录了"因什么事件变化"，自带卷的锚点

---

### 六、图谱页面改造

当前实现：
1. `app/src/components/GraphWorkspace.tsx` 已保留综合图谱，并增加“关系视图”模式
2. 关系视图以 character 类型的 LoreEntity 为节点，`EntityRelation` 为显式主边
3. 边上展示 `relationType + currentStance`
4. 自动推导的运行态关系用虚线/浅色，显式关系用实线/深色，并额外区分草案/正式态
5. 当前仍只展示关系当前态，不做按卷过滤（与关系模型“只保留当前态”的决策一致）

---

### 七、生成消费改造

当前 `server/src/services/generation-context.ts` 已同时处理人物卡、显式关系快照和自动关系补位；其中 `focusCharacters` 由后台合并计算，`availableCharacters` 目前仍以前台填写名单为输入。

#### 出场人物三层注入策略

核心问题：如果只注入 2-4 张完整人物卡，模型容易只围着这几个人转，其他人变工具人。

**解法：不是"只注入几个人物卡"，而是分层注入。**

| 层级 | 人数 | 注入内容 | 来源 | 字段类型 |
|------|------|---------|------|---------|
| **强注入（focusCharacters）** | 2-4 人 | 完整人物卡（静态+动态）+ 相关关系 | 系统合并计算 + 显式关系扩展 | 纯后台（不暴露文本框） |
| **弱注入（availableCharacters）** | 0-4 人 | 一行压缩摘要 + 弱提示文案 | 当前以 `ChapterBeat.availableCharacters` 手填名单为准，后台负责摘要化 | 前台输入，后台消费 |
| **背景角色** | 不限 | 不专门注入，靠章节拍/上下文自然带出 | — | — |

**章节拍新增字段**：
```typescript
interface ChapterBeatFields {
  // 现有字段...
  mustAppearCharacters?: string[]; // 必须重点出场，前台可编辑
  availableCharacters?: string[];  // 可出场候选，当前由作者手工维护
}
```

**focusCharacters 当前合并入口**（纯后台计算，不需要文本框）：
1. `ChapterBeat.mustAppearCharacters`
2. `ChapterBeat.focusCharacter`
3. `VolumeOutline.requiredEntities`
4. `Milestone.requiredEntities`
5. 若以上仍不足，`server/src/services/generation-context.ts` 会结合当前章/上一章出场人物与 pinned 人物兜底
6. 最后再用 `relationSnapshot` 对焦点人物做一跳显式关系扩展

**availableCharacters 当前实现**：
- 输入来源：作者在 `app/src/components/OutlineView.tsx` 的“可出场候选”文本框中手动填写
- `app/src/lib/planning-requirements.ts` 当前只透传这份名单，不会自动从“最近 3 章 / 当前卷 / 显式关系”反算候选池
- 服务端 `buildAvailableCharacterHintBlocks` 会把这份名单转换为最多 4 条弱提示摘要，并自动排除已进入 `focusCharacters` 的人物
- 如果后续要做“系统自动候选池 + 前端回填”，可以在这一层继续扩展，但当前不应按已实现能力依赖

**防过度聚焦指令**：生成 prompt 中附加提醒：
- "以下为本章重点人物，但不要让非焦点角色完全消失"
- "次级人物可以自然出场，但不应抢占核心冲突的篇幅"

**人物卡回答"这个人怎么写"，关系模型回答"这个人和别人什么关系"，章节规划回答"这章该让谁进场"。三者缺一不可。**

#### 字段归属总结

| 字段 | 前台可编辑 | 前台可调整（系统建议 / 手填） | 纯后台 |
|------|-----------|---------------------|--------|
| 人物卡（静态8+动态4） | 是 | — | — |
| 显式关系 | 是 | — | — |
| mustAppear（必须出场） | 是（`ChapterBeat.mustAppearCharacters` / Milestone.requiredEntities） | — | — |
| availableCharacters | 是（文本列表直接维护） | — | — |
| focusCharacters（最终注入名单） | — | — | 是 |
| 注入优先级/容量裁剪 | — | — | 是 |
| 人物卡完整度评分 | — | — | 是 |

#### 人物关系层预算参考

| 类型 | 上限 | 每条字数 | 预算 |
|------|------|---------|------|
| 强注入人物卡（静态+动态） | 4 张 × 180-260 字 | ~720-1040 字 |
| 弱注入人物摘要 | 4-6 条 × 40-80 字 | ~160-480 字 |
| 显式关系 | 4-6 条 × 80-120 字 | ~320-720 字 |
| 自动关系（仅补位） | 2-4 条 × 40-80 字 | ~80-320 字 |
| **人物关系层基准压缩态** | 取各项下限组合 | | **约 1280-1600 字** |
| **人物关系层常规推荐态** | 取中位数组合 | | **约 1800-2600 字** |
| **人物关系层高压人物章** | 取高位数组合 | | **约 2600-3800 字** |

**展示层 / 执行层分离**：
- **本节预算只对应“人物关系层”**，包括：人物卡、availableCharacters、显式关系、自动关系补位
- **不包含** [longform-structure-systems.md](./longform-structure-systems.md) 里的结构记忆增量：剧情线、伏笔规划、世界状态、反派议程、信息权限、资源/代价
- [longform-structure-systems.md](./longform-structure-systems.md) 会在此基础上继续叠加“结构记忆层增量预算”，共同形成**单章记忆层总预算**
- [longform-structure-systems.md](./longform-structure-systems.md) 里的总预算目前更接近设计目标/验收口径，**不等于当前项目已经存在统一的 token governor**
- 展示层：前端会用 `estimateTextTokens` 做粗估，并向作者展示分级参考预算
  - 轻章：约 `1800 字`
  - 常规章：约 `2500-3500 字`
  - 群像/关系重章：约 `4500 字`
- 执行层：当前主要依赖数量/字符常量进行裁剪，包括 `server/src/services/generation-context.ts`、`server/src/services/generation-retrieval.ts`、`server/src/services/generation.ts` 和 `app/src/lib/context-assembler.ts`
- **当前未实现**：`buildGenerationContextBundle` 按统一总 token 预算做硬截断
- 对应关系：`text.length / 1.5` 只是前端估算近似值，不应当作服务端硬判定依据
- 当前实现里已经明确的是“显式关系优先于自动关系”；其余内容块还没有收敛成单一总预算裁剪器

**建议优先级链（用于后续总预算治理）**：强注入人物卡 > 显式关系 > 弱注入摘要 > 自动关系 > 运行态摘要

#### 其他改造要点

1. **`buildEntityBlocks` 改造**：识别 `static_` / `current_` 前缀字段，格式化为两段注入
   - 静态层："【人格内核-不可改变】欲望：…；恐惧：…；说话方式：…"
   - 动态层："【当前阶段状态】立场：…；目标：…；伤口：…"

2. **显式关系优先注入**：当前由请求里的 `relationSnapshot` 直接注入，不经过置信度过滤；正式生成不会跨端直接查询前端 IndexedDB

3. **自动关系降为补位**：显式关系已覆盖的实体对，不再重复注入自动关系

4. **别名匹配**：实体焦点选择时，按 `name + aliases` 全部命中

---

### 八、当前系统的容量常量（比旧文档参数名更可靠）

这里讨论的不是模型输出 `max_tokens`，而是上下文构建链路里的容量常量；这些常量会在人物卡方案落地前就把高价值信息提前裁掉。

**这些限流点是“容量参数”，不是“token 预算”。**
- 它们决定系统最多能塞进多少实体、关系、检索块
- 但不直接等于一章正式生成该用多少 token
- 正式生成预算应以“人物关系层预算 + 结构记忆层增量预算”的合并总预算为准

这些参数里，很多已经抽成真实常量。下面优先写**当前真实常量名**或**稳定模块描述**，避免按旧名字检索扑空：

| 当前常量 / 描述 | 当前默认值 | 建议关注范围 | 位置 |
|------|-------------|---------|------|
| `GENERATION_CONTEXT_LIMITS.focusEntityMaxDefault / focusEntityMaxWithHardHit` | `3 / 4` | `4-6` | `server/src/services/generation-context.ts` |
| `GENERATION_CONTEXT_LIMITS.entityBlockMax` | `6` | `8-12` | `server/src/services/generation-context.ts` |
| `GENERATION_CONTEXT_LIMITS.entityFieldPreviewMax` | `4` | `8-12` | `server/src/services/generation-context.ts` |
| `GENERATION_CONTEXT_LIMITS.entityDescriptionMaxChars` | `80` | `160-240` | `server/src/services/generation-context.ts` |
| `GENERATION_CONTEXT_LIMITS.entityTagPreviewMax` | `4` | `6-8` | `server/src/services/generation-context.ts` |
| `GENERATION_CONTEXT_LIMITS.memoryRetrievalLimit` | `6` | `10-16` | `server/src/services/generation-context.ts` |
| `GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax` | `1` | `2-4` | `server/src/services/generation-context.ts` |
| `GENERATION_RETRIEVAL_LIMITS.focusEntityNameMax` | `8` | `12-16` | `server/src/services/generation-retrieval.ts` |
| `GENERATION_RETRIEVAL_LIMITS.queryPhraseMax` | `16` | `20-32` | `server/src/services/generation-retrieval.ts` |
| `GENERATION_PROMPT_LIMITS.completedTextTailChars` | `2200` | `3000-5000` | `server/src/services/generation.ts` |
| `CONTEXT_ASSEMBLER_LIMITS.maxReferencesDefault` | `8` | `10-16` | `app/src/lib/context-assembler.ts` |

**优先参数化顺序（最先改的 4 个）**：
1. `GENERATION_CONTEXT_LIMITS.focusEntityMaxDefault / focusEntityMaxWithHardHit`
2. `GENERATION_CONTEXT_LIMITS.entityBlockMax / entityDescriptionMaxChars / entityFieldPreviewMax`
3. `GENERATION_CONTEXT_LIMITS.memoryRetrievalLimit`
4. `GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax`

原因：这四个点决定了"人物卡能不能真正进 prompt"，其影响往往比单独讨论 `max_tokens` 更大。

---

### 九、质检层 — 先做轻校验，不上复杂 NLP

**第一版只做规则型检查，先摘 80% 低垂果子：**

1. **人物卡完整度** — 当前章出场人物是否有人物卡；人物卡 8 个静态字段 + 4 个动态字段填了几个
2. **关键人物注入缺失** — pinned 的核心角色是否连续 N 章（如 5 章）未被注入焦点实体
3. **对白重复句式** — 同章多角色对白是否出现高频重复句式（纯文本匹配，不需要 NLP）
4. **关系覆盖** — 当前章出场的两个有显式关系的角色，关系是否被注入

前端展示：
- LoreWorkspace 设定列表中，character 卡片加完整度指示（红/黄/绿）
- 生成后在 review 结果中附带轻校验结果

**第二版（P2，后续迭代）才上 AI 检查**：
- 角色口气漂移：对比对白风格与 speechStyle 的偏离度
- 价值观反转无铺垫：当前行为是否违反 values/taboos
- 对白同质化：多角色对白的语义相似度

---

## 实施顺序

### Phase 1：人物卡 + 别名（成本低，收益高）
1. LoreEntity 加 `aliases: string[]` 字段
2. 前端：LoreWorkspace 给 `type === 'character'` 加编辑表单（静态 8 字段 + 动态 4 字段）
3. 灵感入口：seedEntities 生成 character 时自动填充双层字段，`draft = true`
4. 设定库：草案态卡片样式 + 确认按钮
5. 生成消费：先把 `buildEntityBlocks` 等隐形限流点参数化，再按静态/动态两段格式化注入
6. 卡片完整度指示（红/黄/绿）

### Phase 2：显式关系模型（成本中，收益高）
1. 数据层：前端 IndexedDB 新增 `entityRelations` 表
2. 前端：关系编辑器（稳定层 + 阶段层分区编辑）
3. 灵感入口：如后续需要，再新增 `seedRelationships` 自动创建初始关系（`draft = true`）
4. 生成消费：`buildGenerationContextBundle` 按优先级链注入（显式 > 自动）
5. 别名匹配联动

### Phase 3：图谱页面 + 轻校验（成本中，收益中）
1. 图谱页面增加"关系视图"模式（显式实线 + 自动虚线）
2. 轻校验规则：完整度、注入缺失、对白重复、关系覆盖
3. review 结果附带校验结果

---

## 关键文件清单

| 文件 | 改动 |
|------|------|
| `app/src/types/domain.ts` | LoreEntity 加 aliases/draft；ChapterBeat 加 mustAppearCharacters/availableCharacters；新增 EntityRelation 类型 |
| `app/src/lib/db.ts` | 新增 entityRelations 表；LoreEntity 表加 aliases 列 |
| `app/src/stores/lore-store.ts` | 支持 aliases、draft 操作 |
| `app/src/stores/entity-relation-store.ts` | 新增 — EntityRelation 的 CRUD |
| `app/src/components/LoreWorkspace.tsx` | 人物卡编辑表单、完整度指示、草案态样式 |
| `app/src/components/GraphWorkspace.tsx` | 关系视图模式 |
| `app/src/components/InspirationDialog.tsx` | `seedEntities` 填充双层字段 + `draft` 标记；当前不负责 `seedRelationships` |
| `app/src/lib/generation-relation-snapshot.ts` | 把前端 `EntityRelation` 组装成请求态 `relationSnapshot` |
| `app/src/components/GenerationView.tsx` / `app/src/components/GenerationWorkspace.tsx` | 发起生成时附带 `relationSnapshot` |
| `server/src/services/generation-context.ts` | `buildEntityBlocks` 改造、消费 `relationSnapshot`、显式关系优先注入、别名匹配 |
| `server/src/services/generation-retrieval.ts` | focus/query/limit 等检索裁剪参数化 |
| `server/src/services/generation.ts` | completedText 承接长度、review 中的候选人物/显式关系提示 |
| `app/src/lib/context-assembler.ts` | 前端本地 references 上限与 token 粗估 |
| `app/src/lib/lore-consistency.ts` | 轻校验规则扩展 |

---

## 执行版开发计划（历史记录 + 现状校准）

本节用于把上面的方案落成可推进、可打勾、可回填的执行看板。

### 状态约定

| 状态 | 含义 |
|------|------|
| `未开始` | 还未进入开发 |
| `进行中` | 已开始实现或联调 |
| `部分实现` | 设计意图已落一部分，但还有明确未落地项 |
| `已实现` | 仓库里已有代码入口，但本文不把它等同于“本轮重新验收完成” |
| `待验证` | 代码链路已接通，仍缺专门测试或运行态观察 |
| `阻塞` | 有依赖或方案问题待解决 |

### 推进备注

1. 建议按 `PR1 -> PR2 -> PR3 -> PR4 -> PR5 -> PR6 -> PR7/PR8` 顺序推进
2. `PR5` 必须把显式关系的**跨端传输链路**一起做完，不能只停留在前端 IndexedDB
3. 每完成一个 PR，就在本节补充状态、日期、结果和遗留问题
4. 本节已按 2026-04-16 的静态核对重标状态；凡提到“已实现”，仅表示当前仓库里能找到对应入口，不代表已经完成端到端测试

### 总进度占位

| 批次 | 状态 | 计划完成 | 实际完成 | 备注 |
|------|------|----------|----------|------|
| `M1` 基础层：PR1-PR3 | `已实现` | `待填` | `2026-04-14` | 类型、存储、人物卡编辑器、容量常量入口均已存在 |
| `M2` 关系层：PR4-PR5 | `部分实现` | `待填` | `2026-04-15` | `relationSnapshot` 主链路已通；灵感入口 `seedRelationships` 仍未落地 |
| `M3` 规划层：PR6 | `部分实现` | `待填` | `2026-04-15` | `availableCharacters` 已能进入弱注入，但当前仍是手工维护名单 |
| `M4` 展示与质检：PR7-PR8 | `已实现` | `待填` | `2026-04-15` | 关系视图、设定库关系质检、review 轻质检已有代码入口 |

### PR1：数据模型与本地库迁移

- 状态：`已实现`
- 负责人：`Codex`
- 开始时间：`2026-04-14`
- 完成时间：`2026-04-14`
- 依赖：无
- 目标：补齐人物关系层的基础字段与本地表结构，为后续编辑器和消费改造打底
- 主要改动文件：
  - `app/src/types/domain.ts`
  - `app/src/lib/db.ts`
  - `app/src/stores/project-store.ts`
  - `app/src/stores/lore-store.ts`
  - `app/src/stores/chapter-beat-store.ts`
- 核心任务：
  - [x] `LoreEntity` 增加 `aliases`、`draft`
  - [x] `ChapterBeat` 增加 `mustAppearCharacters`、`availableCharacters`
  - [x] 新增 `EntityRelation` 类型
  - [x] Dexie 升版并新增 `entityRelations` 表
  - [x] 创建、更新、导入链路补默认值与兼容逻辑
- 验收标准：
  - [x] 旧项目可正常打开，不因缺字段报错
  - [x] 新建项目时新字段默认值正确
  - [x] 关系表可正常读写
- 进度记录：
  - 日期：`2026-04-14`
  - 结果：`已实现`
  - 已完成：`domain/db/store/archive 默认值与迁移链路已补齐`
  - 未完成：`关系编辑 UI 留到 PR5`
  - 阻塞项：`无`
  - 下一步：`推进 PR5 的显式关系快照与消费`
- 风险/备注：`EntityRelation` 数据层已具备，但消费链路需在 PR5 接通`

### PR2：上下文容量参数化

- 状态：`已实现`
- 负责人：`Codex`
- 开始时间：`2026-04-14`
- 完成时间：`2026-04-14`
- 依赖：PR1 可并行，但建议接在 PR1 后合入
- 目标：移除会提前裁掉人物卡与关系卡的隐形限流点
- 主要改动文件：
  - `server/src/services/generation-context.ts`
  - `server/src/services/generation-retrieval.ts`
  - `server/src/services/generation.ts`
  - `app/src/lib/context-assembler.ts`
- 核心任务：
  - [x] 抽离 `GENERATION_CONTEXT_LIMITS.focusEntityMaxDefault / focusEntityMaxWithHardHit`
  - [x] 抽离 `GENERATION_CONTEXT_LIMITS.entityBlockMax / entityFieldPreviewMax / entityDescriptionMaxChars / entityTagPreviewMax`
  - [x] 抽离 `GENERATION_CONTEXT_LIMITS.memoryRetrievalLimit`
  - [x] 抽离 `GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax`
  - [x] 抽离 `GENERATION_RETRIEVAL_LIMITS.focusEntityNameMax / queryPhraseMax`
  - [x] 抽离 `GENERATION_PROMPT_LIMITS.completedTextTailChars / CONTEXT_ASSEMBLER_LIMITS.maxReferencesDefault`
- 验收标准：
  - [x] 关键容量参数不再散落在函数内部
  - [x] 默认行为与当前版本基本一致
  - [x] 后续 PR 可直接复用这些参数
- 进度记录：
  - 日期：`2026-04-14`
  - 结果：`已实现`
  - 已完成：`前后端人物关系层关键限流点已收口为常量`
  - 未完成：`结构层更大预算联动留到后续`
  - 阻塞项：`无`
  - 下一步：`在 PR5/PR6 直接复用这些参数`
- 风险/备注：`仍有部分非人物关系层截断点保持原样，后续按结构层方案再扩`

### PR3：人物卡编辑器与草案态

- 状态：`已实现`
- 负责人：`Codex`
- 开始时间：`2026-04-14`
- 完成时间：`2026-04-14`
- 依赖：PR1、PR2
- 目标：把人物卡从只读设定条目升级为可编辑、可确认、可评估完整度的正式模块
- 主要改动文件：
  - `app/src/components/LoreWorkspace.tsx`
  - `app/src/stores/lore-store.ts`
  - `app/src/lib/lore-consistency.ts`
- 核心任务：
  - [x] 人物条目渲染静态 8 字段 + 动态 4 字段表单
  - [x] 字段按 `static_` / `current_` 前缀落入 `fields`
  - [x] 支持 `aliases` 编辑
  - [x] 支持 `draft` 确认按钮与样式
  - [x] 增加完整度红黄绿提示
- 验收标准：
  - [x] `character` 条目可编辑完整人物卡
  - [x] 草案态与正式态可区分
  - [x] 完整度提示可随字段变化更新
- 进度记录：
  - 日期：`2026-04-14`
  - 结果：`已实现`
  - 已完成：`LoreWorkspace 已支持人物卡编辑、别名、草案确认与完整度展示`
  - 未完成：`显式关系编辑器留到 PR5`
  - 阻塞项：`无`
  - 下一步：`推进显式关系编辑与消费`
- 风险/备注：`当前非人物条目仍以描述和既有 fields 为主，暂未做模板化表单`

### PR4：灵感入口接入人物卡草案

- 状态：`部分实现`
- 负责人：`Codex`
- 开始时间：`2026-04-14`
- 完成时间：`2026-04-14`
- 依赖：PR1、PR3
- 目标：让立项会话生成的人物设定直接进入新的人物卡结构，而不是停留在旧版平面 seedEntities
- 主要改动文件：
  - `app/src/types/ai.ts`
  - `app/src/components/InspirationDialog.tsx`
  - `app/src/stores/project-store.ts`
- 核心任务：
  - [x] 扩展 `AIInspirationBlueprint.seedEntities` 结构
  - [x] 生成项目时写入双层人物字段
  - [x] 灵感入口创建的人物默认 `draft = true`
  - [ ] 新增 `seedRelationships` 字段并落库显式关系
- 验收标准：
  - [x] 从灵感入口创建的角色会以草案态入库
  - [x] 静态层 / 动态层字段不丢失
  - [x] 不影响现有项目创建流程
- 进度记录：
  - 日期：`2026-04-14`
  - 结果：`部分实现`
  - 已完成：`蓝图 prompt、seedEntities 类型、落库逻辑已接入人物卡字段与草案态`
  - 未完成：`seedRelationships 仍未落地，当前只保留为后续规划`
  - 阻塞项：`无`
  - 下一步：`如要让灵感入口直接生成关系草案，再单独补 seedRelationships 设计、类型与落库链路`
- 风险/备注：`人物卡字段质量仍取决于蓝图输出，后续可在 PR8 增加更强提示`

### PR5：显式关系模型与跨端传输

- 状态：`已实现`
- 负责人：`Codex`
- 开始时间：`2026-04-14`
- 完成时间：`2026-04-15`
- 依赖：PR1、PR2、PR4
- 目标：把显式关系从“前端数据”做成“生成系统可消费的规划层输入”
- 主要改动文件：
  - `app/src/stores/entity-relation-store.ts`
  - `app/src/types/ai.ts`
  - `server/src/types/ai.ts`
  - `server/src/services/generation.ts`
  - `server/src/services/generation-context.ts`
  - `server/src/services/generation-job-runner.ts`
- 核心任务：
  - [x] 新增 EntityRelation 的前端 CRUD
  - [x] 新增 `relationSnapshot` 请求字段
  - [x] 服务端接收并缓存显式关系快照
  - [x] 上下文构建按“显式关系 > 自动关系”注入
  - [x] 草案关系仅在规划场景可消费，正文场景排除
  - [x] 同实体对显式关系已覆盖时，自动关系不重复注入
- 验收标准：
  - [x] 手工创建的关系能进入正式生成上下文
  - [x] 显式关系优先级高于自动关系
  - [x] 只做前端不做跨端时不得视为完成
- 进度记录：
  - 日期：`2026-04-15`
  - 结果：`已实现`
  - 已完成：`显式关系 CRUD、relationSnapshot 透传、服务端优先注入、项目重建回灌与调试视图映射已打通`
  - 未完成：`无`
  - 阻塞项：`无`
  - 下一步：`推进章节拍人物进场闭环与关系视图`
- 风险/备注：`显式关系在服务端调试层以 source_kind 标注为 explicit_manual / explicit_manual_draft，正式生成消费时仍由 relationSnapshot 主链路主导`

### PR6：章节拍人物进场改造

- 状态：`部分实现`
- 负责人：`Codex`
- 开始时间：`2026-04-14`
- 完成时间：`2026-04-15`
- 依赖：PR1、PR2、PR5
- 目标：把“谁该进场”从隐式推断升级为章节拍可编辑、服务端可计算的闭环；其中自动候选池仍待后续补齐
- 主要改动文件：
  - `app/src/components/OutlineView.tsx`
  - `app/src/stores/chapter-beat-store.ts`
  - `app/src/lib/planning-requirements.ts`
  - `server/src/services/generation-context.ts`
- 核心任务：
  - [x] 章节拍支持 `mustAppearCharacters`
  - [x] 章节拍支持 `availableCharacters`
  - [x] 生成链路合并计算 `focusCharacters`
  - [x] 注入策略区分强注入人物卡、弱注入摘要、显式关系、自动关系补位
  - [x] prompt 增加“防过度聚焦”提醒
  - [ ] 基于章节历史 / 卷纲 / 显式关系自动生成 `availableCharacters` 候选并回填
- 验收标准：
  - [x] 章节层可明确指定必须出场人物
  - [x] `availableCharacters` 可手工维护并进入弱注入摘要
  - [x] 服务端最终焦点人物名单符合优先级链
  - [ ] `availableCharacters` 自动回填并允许调整
- 进度记录：
  - 日期：`2026-04-15`
  - 结果：`部分实现`
  - 已完成：`章节拍字段、planningRequirements、单步/流水线/队列请求、服务端 focus 计算、候选人物弱摘要与写作提示已接通`
  - 未完成：`availableCharacters` 仍需作者手工维护，系统自动候选/回填尚未落地`
  - 阻塞项：`无`
  - 下一步：`推进图谱关系视图与人物关系层轻质检`
- 风险/备注：`focusCharacters 仍保持后台计算结果，前台只编辑 must/available 两层；其中 available 当前是手填输入，不是系统候选列表`

### PR7：图谱页面关系视图

- 状态：`已实现`
- 负责人：`Codex`
- 开始时间：`2026-04-15`
- 完成时间：`2026-04-15`
- 依赖：PR5
- 目标：在保留现有综合图谱的同时，新增真正围绕人物关系的视图
- 主要改动文件：
  - `app/src/components/GraphWorkspace.tsx`
  - `app/src/stores/entity-relation-store.ts`
- 核心任务：
  - [x] 图谱页增加“关系视图”模式
  - [x] `character` 作为节点，EntityRelation 作为主边
  - [x] 显式关系与自动关系使用不同视觉样式
  - [x] 边显示 `relationType + currentStance`
- 验收标准：
  - [x] 人物关系图不再只靠共享标签/文本互提弱推导
  - [x] 用户能清晰区分规划层关系与运行态关系
  - [x] 关系视图不破坏现有综合图谱
- 进度记录：
  - 日期：`2026-04-15`
  - 结果：`已实现`
  - 已完成：`GraphWorkspace 已新增综合图谱 / 关系视图双模式，显式关系与运行态关系分色分线展示`
  - 未完成：`无`
  - 阻塞项：`无`
  - 下一步：`把轻质检结果回显到设定库与生成 review`
- 风险/备注：`关系视图当前聚焦人物层，不展示 faction/location 的派生关系`

### PR8：轻质检与结果回显

- 状态：`已实现`
- 负责人：`Codex`
- 开始时间：`2026-04-15`
- 完成时间：`2026-04-15`
- 依赖：PR3、PR5、PR6
- 目标：先用规则型检查覆盖最容易出问题的人物关系层问题
- 主要改动文件：
  - `app/src/lib/lore-consistency.ts`
  - `app/src/components/LoreWorkspace.tsx`
  - `server/src/services/generation.ts`
- 核心任务：
  - [x] 人物卡完整度检查
  - [x] 核心人物连续未注入检查
  - [x] 同章对白重复句式检查
  - [x] 显式关系角色同场但未覆盖检查
  - [x] 在 review 结果中展示轻质检回显
- 验收标准：
  - [x] 质检结果可定位到具体问题，不是泛化提示
  - [x] 设定库与生成 review 都能看到对应提示
  - [x] 不引入复杂 NLP 依赖
- 进度记录：
  - 日期：`2026-04-15`
  - 结果：`已实现`
  - 已完成：`设定库新增显式关系同场未覆盖检查，review 增加核心人物缺席、对白句式重复、显式关系未落地等规则型注入`
  - 未完成：`无`
  - 阻塞项：`无`
  - 下一步：`视真实生成样本再收敛误报阈值`
- 风险/备注：`当前规则仍偏启发式，后续建议结合真实章节样本微调误报与漏报`

### 每次推进后的回填模板

可复制以下模板追加到对应 PR 的“进度记录”中：

```md
- 日期：`待填`
- 结果：`待填`
- 已完成：`待填`
- 未完成：`待填`
- 阻塞项：`待填`
- 下一步：`待填`
```
