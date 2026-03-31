# AI-Novel-Studio (AI 小说创作工坊) 完整产品需求文档 (PRD)

## 1. 产品概述 (Product Overview)

**产品名称：** AI-Novel-Studio (AI 小说创作工坊)

**产品定位：** 一款专为长篇小说创作者打造的"AI 原生"专业级写作环境。

**核心痛点解决：**
传统写作软件缺乏对庞大世界观的动态管理；而直接使用通用 AI 对话框写作，极易导致 AI "遗忘"前文设定、产生逻辑矛盾（幻觉），且作者难以掌控 AI 的上下文窗口。

**产品愿景：**
通过"可视化 AI 上下文"、"模块化世界观动态注入"以及"伏笔生命周期管理"，让作者在保持绝对创作主导权的同时，享受 AI 带来的灵感迸发与效率提升。

---

## 2. 目标用户 (Target Audience)

| 用户类型 | 描述 | 核心诉求 |
|---|---|---|
| 网络小说作者 | 需要管理动辄数百万字、数百个人物、复杂势力设定的重度创作者 | 设定一致性、高效更新、伏笔管理 |
| 跑团/设定集爱好者 | 热衷于构建庞大世界观（如克苏鲁、赛博朋克、修仙）的创作者 | 世界观可视化、关系图谱 |
| 兼职写手 | 希望利用 AI 辅助扩写、润色、检查逻辑以提高更新速度的创作者 | 快速续写、文风一致性 |
| 新手作者 | 有想法但缺乏长篇驾驭经验的入门创作者 | 模板引导、结构化写作辅助 |

---

## 3. 用户故事 (User Stories)

### 核心场景

1. **连载一致性**："作为一名网文作者，我希望在写到第 200 章时，AI 仍然记得第 3 章埋下的伏笔，并在合适的时机提醒我回收。"
2. **设定校验**："作为一名新手作者，我希望能一键让 AI 检查当前章节是否与已有设定冲突（如已损毁的法宝被再次使用）。"
3. **上下文透明**："作为一名硬核作者，我希望清楚地看到 AI 续写时参考了哪些设定，哪些被遗漏了，并能手动干预上下文组成。"
4. **灵感捕获**："作为一名兼职写手，我希望在通勤时与 AI 讨论剧情走向，并一键将好点子保存到草稿中。"
5. **世界观复用**："作为一名跑团爱好者，我希望为不同的故事复用同一套世界观设定，只替换角色和剧情线。"
6. **多章节管理**："作为一名连载作者，我希望能方便地在章节间跳转、拖拽调整顺序、批量导出已完成的章节。"

---

## 4. 竞品分析 (Competitive Analysis)

| 产品 | 优势 | 不足 | 我们的差异化 |
|---|---|---|---|
| NovelAI | 自训练模型、文风定制强 | 无世界观管理、上下文黑盒 | 可视化上下文 + 结构化设定库 |
| Sudowrite | 续写/改写功能成熟 | 不支持中文、无伏笔管理 | 中文原生 + 伏笔生命周期系统 |
| AI Dungeon | 交互式叙事体验好 | 偏游戏向、非专业写作工具 | 专业编辑器 + 大纲结构化管理 |
| 通用 AI 对话框 (ChatGPT/Claude) | 能力强、灵活 | 长文遗忘、无项目管理、上下文不可控 | 动态 Context 注入 + 设定冲突校验 |
| 传统写作软件 (Scrivener/Word) | 成熟的文档管理 | 无 AI 能力、设定管理弱 | AI 原生 + 世界观引擎 |

---

## 5. 核心功能架构 (Core Features)

### 5.1 项目管理 (Project Management)

项目列表页作为应用入口，管理多个创作项目。

- **项目卡片**：展示项目名称、类型标签（仙侠/悬疑/奇幻等）、字数统计、最后修改时间、简介。
- **新建项目**：支持从空白创建或从预设模板创建（见 5.3 设定模板）。
- **项目导入/导出**：支持导入 `.json` 工程文件恢复完整项目。
- **项目归档/删除**：支持归档不活跃项目，删除需二次确认。

### 5.2 沉浸式智能编辑器 (Main Editor)

#### 5.2.1 编辑器内核
- **富文本编辑**：基于 TipTap (ProseMirror) 构建，支持 Markdown 基础语法的无干扰写作区域。
- **章节标题与正文分离**：章节标题独立输入区域，与正文分开管理。

#### 5.2.2 多章节管理
- **章节列表（左侧大纲树）**：树状结构展示卷/章，支持折叠。
- **拖拽排序**：支持章节间拖拽调整顺序。
- **批量操作**：多选章节后支持批量导出、批量删除。
- **章节状态标记**：草稿 / 初稿 / 已修订 / 已发布。

#### 5.2.3 行内指令 (Slash Commands)
触发方式：在编辑器内输入 `/` 唤出快捷指令菜单。

| 指令 | 快捷键 | 说明 |
|---|---|---|
| 续写当前段落 | ⌘J | 根据光标位置上下文，AI 流式续写 |
| 扩展大纲 | ⌘E | 将简略句子扩写为详细段落大纲 |
| 检查逻辑矛盾 | ⌘D | 扫描当前段落与全局设定的冲突 |
| 改写为对话 | - | 将叙述性段落改写为角色对话 |
| 生成人物外貌 | - | 根据角色设定生成外貌描写 |
| 切换叙事视角 | - | 将当前段落切换为第一/第三人称 |
| 润色当前段落 | - | 优化文笔、修辞、节奏感 |

#### 5.2.4 选中文本操作
选中文本后弹出浮动工具栏（Floating Toolbar），提供：
- **AI 重写**：保留语义，换一种表达方式。
- **AI 润色**：优化文笔和修辞。
- **风格转换**：切换文风（如严肃→诙谐、白话→古风）。
- **标记为伏笔**：将选中内容快速收录到伏笔系统。
- **关联设定**：将选中文本与设定库实体手动关联。

#### 5.2.5 版本历史与回退
- **自动快照**：每次 AI 操作前自动保存快照。
- **手动保存版本**：作者可手动创建命名版本（如"战斗场景 v2"）。
- **Diff 对比**：支持任意两个版本间的差异对比。
- **一键回退**：对 AI 续写不满意时可立即撤回。

### 5.3 设定与世界观管理系统 (World-building Engine)

#### 5.3.1 设定库分类 (Entity Categories)

| 分类 | 核心字段 | 说明 |
|---|---|---|
| 人物卡 (Characters) | 基础信息、数值状态（境界/生命值）、社会关系、性格与动机 | 支持状态时间线（结丹期→元婴期） |
| 势力/阵营 (Factions) | 宗旨、领袖、敌对/同盟关系、核心资源 | 支持势力关系图 |
| 地理/场景 (Locations) | 地名、环境特征、所属势力、关联事件 | 支持场景氛围描述模板 |
| 力量体系/规则 (Magic Systems) | 体系名称、等级划分、限制与代价 | 约束 AI 幻觉的核心防线 |
| 物品/法宝 (Items) | 名称、能力、持有者、当前状态（完好/损毁/封印） | 防止已损毁物品被再次使用 |
| 事件/历史 (Events) | 事件名称、时间线位置、关联人物、后续影响 | 构建世界历史脉络 |

#### 5.3.2 设定模板
为不同题材提供预设世界观模板，降低新建项目门槛：
- **修仙/仙侠**：境界体系（练气→渡劫）、宗门结构、灵根/体质系统。
- **赛博朋克**：科技树、公司阵营、义体改造等级。
- **克苏鲁/悬疑**：SAN 值系统、禁忌知识、调查线索链。
- **西方奇幻**：种族、职业、魔法学派、神系。
- **空白模板**：仅提供基础分类框架，由作者自由填充。

#### 5.3.3 设定版本化（时间线快照）
角色状态随剧情发展而变化，设定库需支持：
- **状态时间线**：记录角色/物品在不同章节的状态变化（如"林冲在第 50 章突破元婴期"）。
- **按章节查询**：查看角色在任意章节时的状态快照。
- **AI 感知当前状态**：续写时 AI 自动引用角色在当前章节的最新状态，而非初始设定。

#### 5.3.4 关系图谱可视化
- **人物关系图**：节点表示人物，连线表示关系（师徒/敌对/恋人等），支持筛选和缩放。
- **势力关系图**：展示阵营间的同盟/敌对/中立关系。
- **交互操作**：点击节点查看详情，拖拽调整布局，双击编辑。

#### 5.3.5 AI 动态注入机制 (Dynamic Context Injection)
- **实体识别 (NER)**：后台自动识别正文中键入的设定名词。
- **按需加载 (Lazy Loading)**：仅提取当前段落提及的实体及其关联设定，动态拼接到 Prompt 中，避免爆 Token。
- **设定冲突实时校验**：AI 后台比对当前文本与设定库，发现矛盾即刻标红报错并给出修改建议。

### 5.4 伏笔与剧情线追踪系统 (Foreshadowing Tracker)

#### 5.4.1 伏笔生命周期管理

```
埋设 (Planted) → 休眠 (Dormant) → 激活 (Active) → 回收 (Resolved)
                                         ↓
                                    超期预警 (Overdue)
```

| 状态 | 说明 |
|---|---|
| 埋设 (Planted) | 作者手动标记，或 AI 自动识别悬念并提示收录 |
| 休眠 (Dormant) | 记录埋设位置、涉及人物和核心悬念 |
| 激活 (Active) | 按条件触发：间隔 N 章、遇到关联人物/事件，在右侧面板亮起警报 |
| 回收 (Resolved) | 作者填坑后标记完成，AI 自动验证逻辑是否闭环 |
| 超期预警 (Overdue) | 超过设定章节数未回收，升级为红色警报 |

#### 5.4.2 伏笔优先级
- **主线伏笔 (Critical)**：必须回收，影响主线剧情走向。超期自动升级为最高优先级警报。
- **支线伏笔 (Normal)**：应当回收，丰富故事细节。
- **氛围伏笔 (Optional)**：可选回收，用于营造悬念或世界观厚度。

#### 5.4.3 伏笔关联与分组
- 多个伏笔可关联到同一事件（如"血月事件"关联了 3 个分散伏笔）。
- 支持伏笔串联成主线/支线剧情线。
- 节点连线图视图：可视化展示伏笔间的因果关系。

### 5.5 核心 AI 监控面板 (Context Inspector)

右侧边栏，让 AI 的"黑盒"变得透明、可控。

#### 5.5.1 AI 视野指示器 (AI Vision Indicator)
- 实时显示当前 Prompt Token 的占用情况（如 16,450 / 32,000）。
- 可视化展示上下文权重分配（基础设定 | 记忆/RAG | 当前文本）。
- 展示 AI 续写时**参考了哪些设定条目**，增强可信度和可审计性。

#### 5.5.2 上下文手动干预
- **Pin 设定**：手动将重要设定钉到上下文中（"这个角色虽然没出场但很重要，AI 必须记住"）。
- **Unpin 设定**：移除不需要的上下文占用。
- **权重调节**：为不同设定条目设置优先级权重。

#### 5.5.3 当前在场人物 (Active Characters)
- 实时扫描当前段落，提取出场人物。
- 悬浮展示该人物的当前状态（境界、血量、核心目的），防止写作偏离设定。

#### 5.5.4 触发器警报 (Alerts)
- 动态展示被激活的伏笔提醒。
- 展示设定冲突检测结果。
- 提供"自动回收伏笔"的 AI 建议按钮。

### 5.6 灵感发散与对话区 (Chat / Brainstorming)

- **独立对话窗口**：与主编辑器并列或作为抽屉弹出。
- **功能**：与 AI 讨论剧情走向、推演战斗过程、起名、设计角色。
- **一键插入**：对话结果可一键插入主编辑器或保存为设定条目。
- **灵感收集板**：将有价值的对话片段保存为灵感卡片，支持标签分类。

---

## 6. 系统设置与偏好 (System Settings & Preferences)

### 6.1 AI 引擎与上下文配置

- **模型路由 (Model Routing)**：支持多模型切换，按任务类型自动路由：
  - 重度逻辑任务（大纲生成、逻辑查错）：调用高级模型。
  - 轻度速写任务（环境描写、对话续写）：调用快速低成本模型。
  - 用户可自定义路由规则。
- **Token 权重分配滑块**：允许作者手动分配上下文窗口比例（如设定 20%，近期文本 80%）。
- **温度值与发散度 (Temperature)**：滑块控制 AI 的"脑洞大小"（严谨贴合 vs 意想不到的转折）。

### 6.2 写作偏好与文风预设

- **全局文风设定**：用户可输入自定义全局 System Prompt（例："杀伐果断的极道流仙侠，文风冷峻"）。
- **格式规范**：设定 AI 输出的段落长度、对话占比、标点习惯。
- **文风模板**：提供预设文风模板（热血少年、暗黑悬疑、轻松搞笑等）。

### 6.3 数据与常规设置

- **API Key 管理**：支持用户填入自带的 API Key（本地加密存储），支持多供应商（Gemini / OpenAI / Anthropic）。
- **数据存储与同步**：
  - 默认本地存储（IndexedDB）确保隐私。
  - 支持导出为 `.json` 完整工程文件，或 `.md` / `.docx` / `.epub` 纯文本。
- **编辑器偏好**：
  - 打字机模式 (Typewriter Mode)：当前输入行始终居中。
  - 专注模式 (Zen Mode)：隐藏两侧边栏，全屏纯净打字。
  - 字体、字号、行距精细调节。

---

## 7. 交互与视觉设计规范 (UI/UX Design)

### 7.1 视觉风格
暗色模式 (Dark Mode) 为主，深灰/黑色背景 (neutral-950) 搭配低饱和度文字，减少视觉疲劳。

### 7.2 色彩语义

| 颜色 | 语义 | 使用场景 |
|---|---|---|
| Indigo (靛蓝) | 主操作强调 | 按钮、选中态、链接 |
| Green (绿色) | 正常/安全 | 存活状态、已回收伏笔、通过校验 |
| Yellow (黄色) | 警告/注意 | 伏笔激活、超期预警 |
| Red (红色) | 危险/错误 | 死亡状态、设定冲突、超期未回收 |
| Purple (紫色) | 特殊状态 | 封印、休眠、未激活 |

### 7.3 响应式布局
- **桌面端**：左（大纲/设定库）- 中（编辑器）- 右（AI 监控）三栏经典布局。
- **平板端**：右侧边栏折叠为悬浮面板，按需呼出。
- **移动端**：左右侧边栏自动隐藏，通过汉堡菜单或手势滑动呼出。

### 7.4 交互规范
- 所有破坏性操作（删除项目、删除章节）需二次确认。
- AI 操作前自动保存快照，支持一键撤回。
- 加载状态使用骨架屏 (Skeleton) 而非 Spinner。
- 关键操作提供 Toast 反馈。

---

## 8. 核心数据模型 (Data Models)

```typescript
// 项目
interface Project {
  id: string
  name: string
  description: string
  genre: string[]           // 类型标签：仙侠、悬疑等
  createdAt: Date
  updatedAt: Date
  wordCount: number
  settings: ProjectSettings // 项目级设定（文风、模型路由等）
}

// 章节
interface Chapter {
  id: string
  projectId: string
  volumeId: string          // 所属卷
  title: string
  content: string           // 富文本内容（TipTap JSON）
  order: number             // 排序序号
  status: 'draft' | 'first_draft' | 'revised' | 'published'
  wordCount: number
  createdAt: Date
  updatedAt: Date
}

// 卷
interface Volume {
  id: string
  projectId: string
  title: string
  order: number
  chapterIds: string[]
}

// 设定实体（通用基类）
interface LoreEntity {
  id: string
  projectId: string
  type: 'character' | 'faction' | 'location' | 'magic_system' | 'item' | 'event'
  name: string
  description: string
  tags: string[]
  relatedEntities: { entityId: string; relation: string }[]
  createdAt: Date
  updatedAt: Date
}

// 人物卡
interface Character extends LoreEntity {
  type: 'character'
  basicInfo: {
    age?: string
    gender?: string
    appearance?: string
  }
  stats: CharacterStateSnapshot[]  // 状态时间线
  personality: string
  motivation: string
  factionId?: string
}

// 角色状态快照（支持时间线）
interface CharacterStateSnapshot {
  chapterId: string         // 在哪一章发生变化
  realm?: string            // 境界/等级
  health?: number           // 生命值/状态
  status: 'alive' | 'dead' | 'sealed' | 'missing'
  note: string              // 变化说明
}

// 伏笔
interface Foreshadowing {
  id: string
  projectId: string
  content: string           // 伏笔内容描述
  plantedChapterId: string  // 埋设章节
  triggerCondition: string  // 触发条件
  priority: 'critical' | 'normal' | 'optional'
  status: 'planted' | 'dormant' | 'active' | 'resolved' | 'overdue'
  resolvedChapterId?: string
  resolvedExplanation?: string
  relatedCharacterIds: string[]
  relatedForeshadowingIds: string[]  // 关联伏笔
  groupId?: string          // 伏笔分组
  overdueThreshold: number  // 超期章节数阈值
  createdAt: Date
  updatedAt: Date
}

// 版本快照
interface Snapshot {
  id: string
  chapterId: string
  name?: string             // 手动命名（可选）
  content: string
  trigger: 'auto' | 'manual'  // 自动 or 手动保存
  createdAt: Date
}

// 灵感卡片
interface IdeaCard {
  id: string
  projectId: string
  title: string
  content: string
  tags: string[]
  sourceConversationId?: string
  createdAt: Date
}
```

---

## 9. 非功能性需求 (Non-Functional Requirements)

### 9.1 性能
- AI 续写首 Token 响应时间 < 2 秒（流式输出）。
- 编辑器输入延迟 < 50ms，保持 60fps 流畅体验。
- 单项目支持 500 万字量级（约 500 章 × 1 万字/章）。
- 设定库支持 1000+ 实体条目。

### 9.2 可靠性
- 编辑器每 30 秒自动保存到 IndexedDB。
- AI 操作前自动创建快照，确保可回退。
- API 调用失败时提供友好错误提示和重试机制。

### 9.3 安全与隐私
- API Key 使用 Web Crypto API 加密后存储在 IndexedDB。
- 所有数据默认本地存储，不上传到任何第三方服务器。
- 导出文件不包含 API Key 等敏感信息。

### 9.4 离线能力
- 编辑器核心功能（写作、章节管理、设定浏览）支持完全离线使用。
- AI 功能在离线时禁用，并给出明确提示。
- 恢复网络后自动重连 AI 服务。

---

## 10. 技术架构与实现规划 (Technical Architecture)

### 10.1 技术栈

| 层级 | 技术选型 | 说明 |
|---|---|---|
| 前端框架 | React 18 + TypeScript + Vite | 成熟生态，类型安全 |
| UI 组件库 | Tailwind CSS + shadcn/ui + Lucide React | 暗色主题友好，图标统一 |
| 富文本编辑器 | TipTap (ProseMirror) | 支持 Slash Commands、行内标注、协作扩展 |
| 状态管理 | Zustand | 多 Store 分离：editorStore、loreStore、foreshadowStore、projectStore |
| 本地存储 | IndexedDB (Dexie.js) | 存储海量文本和设定数据 |
| 图谱可视化 | React Flow 或 D3.js | 关系图谱、伏笔连线图 |

### 10.2 AI 接口层
- 抽象统一的 AI Provider 接口，支持多供应商切换（Gemini / OpenAI / Anthropic）。
- 流式输出 (SSE)：续写时实时逐字展示，打字机效果。
- 结构化输出 (JSON Schema)：用于解析人物状态、伏笔检测和设定冲突。

### 10.3 RAG (检索增强生成)
- 引入轻量级本地向量数据库或基于关键词的 BM25 检索，实现长文本记忆。
- 章节分块索引，按语义相关性检索历史内容注入上下文。

---

## 11. MVP 定义 (Minimum Viable Product)

以下功能构成最小可用产品，是第一个可发布版本的范围：

### MVP 包含
- [x] 项目创建与管理（新建、打开、删除）
- [x] 基础编辑器（富文本写作、章节切换）
- [x] Slash Commands：续写、扩展大纲（接入真实 AI）
- [x] 基础设定库：人物卡、力量体系的 CRUD
- [x] 动态 Context 注入：识别正文中的设定名词，自动拼接到 Prompt
- [x] AI 监控面板：Token 用量展示、当前在场人物
- [x] 本地存储（IndexedDB）
- [x] 导出为 .md 纯文本

### MVP 不包含（后续迭代）
- 伏笔追踪系统
- 关系图谱可视化
- 设定版本化（时间线快照）
- RAG 长记忆
- 版本历史与 Diff 对比
- 多格式导出（.docx / .epub）
- 灵感收集板
- 设定模板

---

## 12. 演进路线图 (Roadmap)

### Phase 1: 静态原型与核心交互 ✅ 已完成
- 搭建三栏布局、编辑器 UI、Slash Menu 交互、右侧监控面板的静态数据展示。
- 项目列表页原型。

### Phase 2a: AI 基础接入与编辑器升级
- 将 `<textarea>` 替换为 TipTap 富文本编辑器。
- 接入 AI API，实现续写的真实流式输出。
- 实现选中文本浮动工具栏（AI 重写、润色）。
- 实现基础版本快照（AI 操作前自动保存）。

### Phase 2b: 设定管理与 Context 注入
- 建立设定库数据结构，实现人物卡/力量体系的 CRUD。
- 实现动态 Context 注入（NER 识别 + 按需加载）。
- 实现"当前在场人物"的动态提取。
- 实现设定冲突检测基础版。
- 引入 IndexedDB 实现本地持久化。

### Phase 3: 伏笔系统与高级设定
- 开发伏笔追踪系统（埋设、激活、回收、超期预警）。
- 实现设定版本化（角色状态时间线）。
- 完善系统设置面板（API Key、文风预设、模型路由）。
- 实现关系图谱可视化。
- 增加物品/法宝、事件/历史实体分类。

### Phase 4: RAG 长记忆与导出发布
- 实现本地向量检索，让 AI 拥有"长记忆"。
- 支持导出为 Markdown / EPUB / DOCX 格式。
- 增加字数统计、写作目标打卡功能。
- 设定模板库上线。
- 灵感收集板功能。
