# 滚动规划裂变（Rolling Wave Planning）实现计划

## Context

当前"AI 裂变本卷"是一次性生成整卷所有章节拍。网文一卷常有 100+ 章，存在三个痛点：
1. **Token 爆炸 / 注意力衰减**：AI 一次性输出 100 个 beat，后半段敷衍套路化
2. **剧情僵化**：全量预定义后，正文写作中的新增灵感无法反馈到后续 beat
3. **废稿率高**：规划越远越容易偏离

**解决方案**：将裂变策略改为"宏观长远，微观分批"——按里程碑（milestone）分批裂变，每次 15-30 章，后续批次自动锚定前面已完成的进度。

**用户选择的设计决策**：
- 历史锚定：混合模式（正文摘要优先，无正文则用章节拍摘要）
- 裂变粒度：按里程碑裂变（没有 milestone 时回退到手动输入章数）

**需要补充的关键约束**：
- 历史事实口径：只吃**已落库**的章节摘要（`chapterSummaries`）作为正文事实，不读取未确认草稿正文；若某章没有已落库摘要，则回退到章节拍摘要
- 标题覆盖策略：重新裂变已存在章节的阶段时，默认**保留已有章节标题**，只更新该阶段 beat；仅对当前还不存在的章节才自动创建并使用 AI 生成标题
- 保存语义：按阶段/范围裂变时，必须做**局部替换**，不能复用当前整卷覆盖式 `saveVolumeChapterBeats`

---

## 当前实现进度（截至 2026-04-03）

当前状态可概括为：

> **功能层面已基本完成，当前剩余工作主要是验证，不再是功能缺口。**

### 已完成

- 卷纲已升级为 `estimatedChapterCount + milestones[]`
- `AI 裂变本卷` 已支持空卷自动建章
- `ChapterBeat` 已支持 `milestoneIndex`
- `chapter-beat-store` 已补局部替换能力：
  - `replaceVolumeChapterBeatsInRange(...)`
  - `replaceVolumeChapterBeatsByMilestone(...)`
- 历史摘要口径已落地：
  - 正文摘要优先
  - 无正文摘要时回退 beat 摘要
  - 不读取未确认草稿正文
- 后端 `AIVolumeBeatsRequest` 已支持：
  - `milestoneIndex`
  - `startChapterNumber / endChapterNumber`
  - `estimatedTotalChapters`
  - `currentMilestone`
  - `historySummaries`
- `buildVolumeBeatsPrompt` 已支持滚动规划上下文注入
- `resolveVolumeBeatChapterSlots` 已支持按起始章号递增
- 里程碑模式下，后端返回 beat 时会自动带回 `milestoneIndex`
- `OutlineView` 已支持：
  - 里程碑选择器
  - 里程碑状态：`未规划 / 已规划 / 已推进`
  - beat 列表按里程碑分组
  - 未规划阶段占位卡与“裂变此阶段”
  - 裂变设置弹层
  - 全卷回退模式 / 里程碑模式切换
  - 阶段模式下的“本次规划章数”
  - 续规划下一批次
  - 重裂变覆盖提示
  - 保留已有章节标题的用户提示

### 待做（进入验证前不再新增功能）

- 无新增功能缺口
- 下一步应进入：
  - 手工流程验证
  - 本地构建/测试验证
  - 边角文案与交互微调（如验证中暴露问题）

### 当前口径

- 该方案当前已经不再是“设计中”，而是“功能已实现、待验证”
- 当前文档中的 `验证方式` 与 `推荐实施顺序` 仍保留，供下一步验证阶段直接执行
- 本轮实现过程中**未主动执行本地构建/测试**，遵循当前工程规范

---

## 改动文件清单

### Phase 0: 保存语义与事实口径先补齐

**这是第一优先级，否则后续 UI 与 prompt 改造会建立在错误语义上。**

**1. `app/src/stores/chapter-beat-store.ts`** — 新增局部替换 API
- 当前 `saveVolumeChapterBeats` 是“整卷全量替换”，不适合滚动规划
- 新增一个局部保存方法，建议二选一：
  - `replaceVolumeChapterBeatsByMilestone(projectId, volumeId, milestoneIndex, inputs)`
  - `replaceVolumeChapterBeatsInRange(projectId, volumeId, startOrderInVolume, endOrderInVolume, inputs)`
- 行为要求：
  - 只删除当前 milestone / 当前章号范围内旧 beat
  - 同卷其他阶段 beat 完全保留
  - 若同范围内已有 beat 且章节已绑定，保留 `chapterId`
  - 若当前批次新生成的某章还不存在，再由 `OutlineView` 调 `createChapter`

**2. `app/src/lib/history-summary.ts`** — 明确历史事实口径
- `buildHistorySummaries(projectId, volumeId, upToChapterNumber)` 函数规则补充：
  - 优先从 `db.chapterSummaries` 读取**已落库摘要**，source='extract'
  - 若该章没有已落库摘要，则从 `chapterBeats` 拼接 scenePurpose + mainPlot + hookOut，source='beat'
  - 不直接读取未确认正文草稿，不读取 `generationQueue` 中 ready/error 的临时文本
- 这样可以避免“后续规划吃进未确认事实”导致节拍漂移

### Phase 1: 类型与数据层

**1. `app/src/types/domain.ts`** — ChapterBeatFields 新增 milestoneIndex
- 在 `ChapterBeatFields` 接口末尾加 `milestoneIndex?: number`
- 用于标记该 beat 由哪个里程碑生成，判定里程碑裂变状态、UI 分组、重新裂变时精确删除

**2. `app/src/types/ai.ts`** — 扩展请求类型
- `AIVolumeBeatsRequest` 新增可选字段：
  - `milestoneIndex?: number` — 目标里程碑索引(0-based)
  - `startChapterNumber?: number` — 本批次起始章号(1-based)
  - `endChapterNumber?: number` — 本批次结束章号(1-based)，便于 prompt 明确范围
  - `estimatedTotalChapters?: number` — 当前卷预估总章数
  - `currentMilestone?: string` — 单个里程碑的序列化文本
  - `historySummaries?: HistoryChapterSummary[]` — 已完成章节的历史摘要
- 新增 `HistoryChapterSummary` 接口：`{ chapterNumber, chapterTitle, summary, source: 'extract' | 'beat' }`

**3. `server/src/types/ai.ts`** — 同步前端类型变更

**4. `app/src/stores/chapter-beat-store.ts`** — normalizeChapterBeatInput 处理 milestoneIndex
- `normalizeChapterBeatInput` 补充 `milestoneIndex` 字段透传
- `SaveChapterBeatInput` 类型加 `milestoneIndex?: number`

### Phase 2: 后端 prompt 改造

**5. `server/src/routes/generation.ts`** — 请求验证扩展
- `isAIVolumeBeatsRequest` 增加对新可选字段的校验

**6. `server/src/services/generation.ts`** — 核心改造
- `buildVolumeBeatsPrompt`：当 `request.milestoneIndex !== undefined` 时进入滚动模式
  - 注入【已完成进度摘要】段落（从 historySummaries 序列化）
  - 注入【本次裂变范围】段落（从 currentMilestone 提取）
  - 约束指令追加：限定范围、衔接上一批次 hookOut、source='beat' 的摘要可适当偏离
  - 明确约束：只规划 `startChapterNumber ~ endChapterNumber`，不要提前透支后续里程碑大事件
- `resolveVolumeBeatChapterSlots`：当 `startChapterNumber` 存在时，chapterNumber 从该值开始递增
- `normalizeVolumeBeatDraft`：透传 `milestoneIndex`（从 request 中取，不是 AI 输出的）

### Phase 3: 前端辅助函数

**7. `app/src/lib/outline-serializer.ts`** — 新增 `serializeSingleMilestone`
- 序列化单个里程碑为 prompt 文本（标题、目标章数、阶段目标/冲突、进入/退出状态等）

**8. 新建 `app/src/lib/history-summary.ts`** — 历史摘要收集
- `buildHistorySummaries(projectId, volumeId, upToChapterNumber)` 函数
- 优先从 `db.chapterSummaries`（正文提取摘要）获取，source='extract'
- 没有正文摘要的章节，从 `chapterBeats` 拼接 scenePurpose + mainPlot，source='beat'
- Token 控制：每条摘要最多 200 字，总条数超 50 时压缩早期条目
- `computeMilestoneStartChapter(milestones, targetIndex)` — 根据前面里程碑的 targetChapterCount 累加得出起始章号

**8.1 `app/src/lib/outline-serializer.ts`** — 里程碑序列化补充
- `serializeSingleMilestone` 序列化单个里程碑
- 可选新增 `serializeMilestoneProgress`：输出“当前已完成到哪个 milestone / 哪些阶段已规划 / 哪些阶段未规划”

### Phase 4: 前端 UI 交互

**9. `app/src/components/OutlineView.tsx`** — 主要 UI 改造

**A. 新增 state**：
- `selectedMilestoneIndex: Record<Id, number | null>` — 每卷当前选中的里程碑索引

**B. 里程碑选择器**（在"AI 裂变本卷"按钮上方）：
- 仅当 `draft.milestones.length > 0` 时显示
- 一排可点击标签：`阶段 N: 标题 (K章)` + 裂变状态指示
- 已裂变的里程碑：绿色勾号 + 降低不透明度
- 当前选中的里程碑：emerald 边框高亮
- 附加"全卷裂变"选项（回退到旧行为）

**B.1 里程碑状态判定规则**：
- `未规划`：该 milestone 范围内没有任何 beat
- `已规划`：该 milestone 范围内已有 beat，但对应章节没有已落库摘要
- `已推进`：该 milestone 范围内至少有一章已有 `chapterSummaries`
- UI 上不要只有“已裂变/未裂变”二元状态，否则看不出哪些阶段只是拍表完成，哪些阶段已经进入正文事实阶段

**C. 按钮文案动态化**：
- 有里程碑选择时：`AI 裂变阶段 N`
- 后续批次时显示灰色提示：`将基于前 N 章的进度继续裂变`

**D. beat 列表按里程碑分组**：
- 在每个里程碑边界插入分隔 header：`阶段 N: 标题`
- 未裂变的里程碑区域显示虚线占位 + "裂变此阶段"按钮
- 注意：这里不能只在现有 `chapterBeatRowsByVolumeId` 上简单插 header，必须把“里程碑范围 + 已保存 beat + 已有章节”一起作为驱动源重算行模型

**E. handleGenerateVolumeBeats 改造**：
- 检测是否选择了里程碑，走分支逻辑：
  - 里程碑模式：调用 `buildHistorySummaries` 收集历史，计算 startChapterNumber，传入新字段
  - 全卷模式：原逻辑不变
- 保存时调用新的“局部替换 API”，只更新当前里程碑范围内 beat
- 若目标范围内章节不存在，先自动 `createChapter`
- 若章节已存在且标题被人工调整过，默认保留原标题，不覆盖

---

## 向后兼容

- 所有新字段都是可选的，不传新字段时行为完全不变
- 已有的全卷裂变（无 milestone）继续正常工作
- 已有的 ChapterBeat 数据不受影响（milestoneIndex 为 undefined）

## 验证方式

1. **无 milestone 场景**：创建一卷，不设里程碑，直接裂变 → 行为与改动前完全一致
2. **有 milestone 场景**：创建一卷 3 个里程碑（各 20/30/20 章），依次裂变每个阶段
   - 确认第 1 阶段裂变出 20 个 beat，chapterNumber 从 1 开始
   - 确认第 2 阶段裂变时 prompt 包含前 20 章摘要，chapterNumber 从 21 开始
   - 确认 beat 列表按里程碑分组显示
3. **混合摘要**：第 1 阶段的前 5 章写了正文并 extract，后 15 章只有 beat → 确认 historySummaries 中前 5 章 source='extract'，后 15 章 source='beat'
4. **重新裂变**：对已裂变的阶段再次裂变 → 确认只替换该阶段的 beats，不影响其他阶段
5. **标题保护**：对某阶段某章手工改标题后重新裂变该阶段 → 确认标题保留，只更新 beat
6. **事实口径**：某章存在未确认正文草稿但尚未 extract → 确认 historySummaries 仍回退到 beat 摘要，不吃临时草稿事实

---

## 推荐实施顺序

1. 先做 `chapter-beat-store` 的局部替换 API
2. 再做 `history-summary.ts` 和事实口径
3. 然后改后端请求类型与 prompt
4. 最后做 `OutlineView` 的里程碑状态、分组 UI 和交互按钮

这样可以避免先做 UI，最后发现底层仍是“整卷覆盖式保存”而返工。
