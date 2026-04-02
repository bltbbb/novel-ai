import { buildWritingRulesPrompt } from '../prompts/index.js';
import { completeChatCompletion } from './openai.js';
import { buildGenerationContextBundle } from './generation-context.js';
import { replaceGenerationForeshadows } from './generation-foreshadow-store.js';
import type {
  AIChatRequest,
  AIExtractRequest,
  AIExtractResponse,
  AIPolishRequest,
  AIPolishResponse,
  AIPlanRequest,
  AIPlanResponse,
  AIReviewRequest,
  AIReviewResponse,
  AIStyleRequest,
  AIStyleResponse,
  AIWriteRequest,
  AIWriteResponse,
  ChapterPolishDraft,
  ChapterReviewDraft,
  ChapterStyleDraft,
  GenerationGateConfig,
  GenerationForeshadowSnapshot,
  ChapterOutlineDraft,
  ChapterSummaryDraft,
  HookStrength,
  ReviewCheckerResult,
  ReviewCheckerType,
  ReviewIssue,
  ReviewSeverity,
  StateChangeDraft,
  StrandType,
} from '../types/ai.js';
import type { ServerEnv } from '../config/env.js';

type ContextAwareRequest = {
  projectId: string;
  chapterId?: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  outline?: ChapterOutlineDraft | null;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
};

function stripMarkdownCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseJson<T>(rawText: string): T {
  try {
    return JSON.parse(stripMarkdownCodeFence(rawText)) as T;
  } catch {
    throw new Error('模型返回的 JSON 无法解析');
  }
}

function normalizeHookStrength(value: unknown): HookStrength {
  return value === 'soft' || value === 'medium' || value === 'strong' ? value : 'medium';
}

function normalizeStrand(value: unknown): StrandType {
  return value === 'quest' || value === 'fire' || value === 'constellation' ? value : 'quest';
}

function normalizeReviewSeverity(value: unknown): ReviewSeverity {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function normalizeCheckerType(value: unknown): ReviewCheckerType {
  return value === 'consistency' || value === 'continuity' || value === 'reader_pull' ? value : 'consistency';
}

function sanitizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function sanitizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeOutline(raw: unknown): ChapterOutlineDraft {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<ChapterOutlineDraft>;

  return {
    goal: sanitizeString(candidate.goal, '推动当前章节主冲突'),
    obstacle: sanitizeString(candidate.obstacle, '外部阻力仍不明确'),
    cost: sanitizeString(candidate.cost, '需要付出时间或情绪代价'),
    beats: sanitizeStringList(candidate.beats).slice(0, 5),
    timeAnchor: sanitizeString(candidate.timeAnchor, '未明确'),
    chapterTimeSpan: sanitizeString(candidate.chapterTimeSpan, '未明确'),
    gapFromPrevious: sanitizeString(candidate.gapFromPrevious, '紧接上一章'),
    strand: normalizeStrand(candidate.strand),
    hookType: sanitizeString(candidate.hookType, '悬念推进'),
    hookStrength: normalizeHookStrength(candidate.hookStrength),
    immutableFacts: sanitizeStringList(candidate.immutableFacts).slice(0, 8),
  };
}

function normalizeSummary(raw: unknown): ChapterSummaryDraft {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<ChapterSummaryDraft>;

  return {
    summary: sanitizeString(candidate.summary, '本章完成了阶段性推进。'),
    hook: sanitizeString(candidate.hook, '后续仍有未闭合问题。'),
    foreshadowings: sanitizeStringList(candidate.foreshadowings).slice(0, 8),
  };
}

function normalizeStateChanges(raw: unknown): StateChangeDraft[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      const candidate = (item && typeof item === 'object' ? item : {}) as Partial<StateChangeDraft>;

      return {
        entityName: sanitizeString(candidate.entityName, '未识别实体'),
        field: sanitizeString(candidate.field, '状态'),
        oldValue: sanitizeString(candidate.oldValue),
        newValue: sanitizeString(candidate.newValue),
      };
    })
    .filter((item) => item.entityName && item.field && item.newValue)
    .slice(0, 12);
}

function sanitizeScore(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 75;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeReviewIssues(raw: unknown): ReviewIssue[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      const candidate = (item && typeof item === 'object' ? item : {}) as Partial<ReviewIssue>;

      return {
        severity: normalizeReviewSeverity(candidate.severity),
        title: sanitizeString(candidate.title, '未命名问题'),
        description: sanitizeString(candidate.description, '未提供问题说明'),
        suggestion: sanitizeString(candidate.suggestion, '建议人工复核后调整'),
        evidence: sanitizeString(candidate.evidence),
      };
    })
    .filter((item) => item.title && item.description)
    .slice(0, 8);
}

function createDefaultCheckerResult(checker: ReviewCheckerType): ReviewCheckerResult {
  const summaryMap: Record<ReviewCheckerType, string> = {
    consistency: '未发现明确设定冲突，但仍建议人工抽查关键事实。',
    continuity: '场景与人物承接基本成立，暂未发现明显跳脱。',
    reader_pull: '节奏与钩子尚可，追读风险暂未显著暴露。',
  };

  return {
    checker,
    score: 80,
    summary: summaryMap[checker],
    issues: [],
  };
}

function normalizeCheckerResult(raw: unknown): ReviewCheckerResult {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<ReviewCheckerResult>;
  const checker = normalizeCheckerType(candidate.checker);

  return {
    checker,
    score: sanitizeScore(candidate.score),
    summary: sanitizeString(candidate.summary, createDefaultCheckerResult(checker).summary),
    issues: normalizeReviewIssues(candidate.issues),
  };
}

function normalizeReview(raw: unknown): ChapterReviewDraft {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<ChapterReviewDraft>;
  const rawResults = Array.isArray(candidate.checkerResults) ? candidate.checkerResults.map(normalizeCheckerResult) : [];
  const resultMap = new Map(rawResults.map((item) => [item.checker, item] as const));
  const checkerResults: ReviewCheckerResult[] = [
    resultMap.get('consistency') ?? createDefaultCheckerResult('consistency'),
    resultMap.get('continuity') ?? createDefaultCheckerResult('continuity'),
    resultMap.get('reader_pull') ?? createDefaultCheckerResult('reader_pull'),
  ];
  const overallSeverity = normalizeReviewSeverity(candidate.overallSeverity);

  return {
    summary: sanitizeString(candidate.summary, '本章整体可读，但仍建议人工复核审查结果。'),
    overallSeverity,
    needsRewrite:
      typeof candidate.needsRewrite === 'boolean'
        ? candidate.needsRewrite
        : overallSeverity === 'critical',
    antiAiForceCheck: candidate.antiAiForceCheck === 'fail' ? 'fail' : 'pass',
    checkerResults,
  };
}

function normalizePolish(raw: unknown): ChapterPolishDraft {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<ChapterPolishDraft>;

  return {
    summary: sanitizeString(candidate.summary, '已完成润色，但仍建议人工抽查最终措辞。'),
    antiAiForceCheck: candidate.antiAiForceCheck === 'fail' ? 'fail' : 'pass',
    appliedChanges: sanitizeStringList(candidate.appliedChanges).slice(0, 6),
  };
}

function normalizeStyle(raw: unknown): ChapterStyleDraft {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<ChapterStyleDraft>;

  return {
    summary: sanitizeString(candidate.summary, '已完成文风转译。'),
    appliedChanges: sanitizeStringList(candidate.appliedChanges).slice(0, 6),
  };
}

function buildPlanPrompt(request: AIPlanRequest) {
  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.volumeOutline ? `当前卷/阶段大纲：${request.volumeOutline}` : '',
    request.previousSummary ? `上一章摘要：${request.previousSummary}` : '',
    request.worldState ? `当前世界状态：${request.worldState}` : '',
    request.contextBundle ? `补充上下文：\n${request.contextBundle}` : '',
    '',
    '请输出一个严格的章节 Context Contract，使用 JSON 对象，不要输出 Markdown。',
    '字段要求：goal, obstacle, cost, beats, timeAnchor, chapterTimeSpan, gapFromPrevious, strand, hookType, hookStrength, immutableFacts。',
    '其中：',
    '- goal / obstacle / cost 各控制在 20 字左右',
    '- beats 为 3 到 5 条',
    '- strand 只能是 quest / fire / constellation',
    '- hookStrength 只能是 soft / medium / strong',
    '- immutableFacts 为本章绝不能违背的事实列表',
  ].filter(Boolean);

  return sections.join('\n');
}

function buildExtractPrompt(request: AIExtractRequest) {
  const sections = [
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.loreSummary ? `当前设定摘要：${request.loreSummary}` : '',
    '',
    '请根据正文提取章节摘要、状态变更和主导 strand，输出 JSON，不要输出 Markdown。',
    'JSON 字段要求：summary, stateChanges, strand。',
    '- summary 为对象，包含 summary, hook, foreshadowings',
    '- stateChanges 为数组，每项包含 entityName, field, oldValue, newValue',
    '- strand 只能是 quest / fire / constellation',
    '',
    '正文如下：',
    request.content,
  ].filter(Boolean);

  return sections.join('\n');
}

function buildWritePrompt(request: AIWriteRequest) {
  const completedText = request.previousText?.trim() || '';
  const outline = request.outline;
  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    `当前 Strand：${outline.strand}`,
    `章节目标：${outline.goal}`,
    `主要阻力：${outline.obstacle}`,
    `代价：${outline.cost}`,
    `时间锚点：${outline.timeAnchor}`,
    `章节跨度：${outline.chapterTimeSpan}`,
    `与上章间隔：${outline.gapFromPrevious}`,
    outline.immutableFacts.length > 0 ? `不可变事实：${outline.immutableFacts.join('；')}` : '',
    request.previousSummary ? `上一章摘要：${request.previousSummary}` : '',
    request.worldState ? `当前世界状态：${request.worldState}` : '',
    request.contextBundle ? `补充上下文：\n${request.contextBundle}` : '',
    request.rewriteGuidance
      ? ['上一轮审查打回反馈：', request.rewriteGuidance, '本轮重写必须优先修复以上问题，不能重复犯错。'].join('\n')
      : '',
    '',
    `当前要写第 ${request.beatIndex + 1} 个 beat：${request.currentBeat}`,
    `本章 beats 全列表：${outline.beats.join(' | ')}`,
    '',
    completedText
      ? ['以下是本章已完成正文，请自然承接，不要重复信息：', completedText.slice(-2200)].join('\n')
      : '当前是本章开头，请直接进入场景与冲突。',
    '',
    '请输出这一段正文片段本身，不要解释，不要使用 Markdown，不要输出标题。',
    '要求：',
    '- 输出 3 到 6 段自然正文',
    '- 单次长度控制在约 600 到 1000 字',
    '- 必须推进当前 beat，但不要一次写完所有后续 beats',
    '- 保持人物状态、设定边界、节奏与当前 strand 一致',
  ].filter(Boolean);

  return sections.join('\n');
}

function buildReviewPrompt(request: AIReviewRequest) {
  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.previousSummary ? `上一章摘要：${request.previousSummary}` : '',
    request.worldState ? `当前世界状态：${request.worldState}` : '',
    request.contextBundle ? `补充上下文：\n${request.contextBundle}` : '',
    request.outline
      ? [
          '章节契约：',
          `- 目标：${request.outline.goal}`,
          `- 阻力：${request.outline.obstacle}`,
          `- 代价：${request.outline.cost}`,
          `- Strand：${request.outline.strand}`,
          `- Beats：${request.outline.beats.join(' | ')}`,
          request.outline.immutableFacts.length > 0
            ? `- 不可变事实：${request.outline.immutableFacts.join('；')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '',
    '',
    '你是小说生成流水线中的审查层，请以严格编辑视角评估本章草稿，输出 JSON，不要输出 Markdown。',
    'JSON 字段要求：summary, overallSeverity, needsRewrite, antiAiForceCheck, checkerResults。',
    '- overallSeverity 只能是 critical / high / medium / low',
    '- antiAiForceCheck 只能是 pass / fail',
    '- checkerResults 固定包含 consistency / continuity / reader_pull 三项',
    '- 每个 checker 字段包含 checker, score, summary, issues',
    '- issues 每项字段包含 severity, title, description, suggestion, evidence',
    '- 若没有明显问题，issues 返回空数组',
    '- 仅在必须打回重写时使用 critical 与 needsRewrite=true',
    '',
    '三类检查重点：',
    '1. consistency：设定冲突、时间回溯、能力越权、新实体矛盾',
    '2. continuity：场景衔接、上章钩子承接、人物行为是否突兀',
    '3. reader_pull：钩子强度、爽点密度、未闭合问题是否形成追读动力',
    '',
    '正文如下：',
    request.content,
  ].filter(Boolean);

  return sections.join('\n');
}

function buildStylePrompt(request: AIStyleRequest) {
  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.previousSummary ? `上一章摘要：${request.previousSummary}` : '',
    request.worldState ? `当前世界状态：${request.worldState}` : '',
    request.contextBundle ? `补充上下文：\n${request.contextBundle}` : '',
    '',
    '你是小说流水线中的 Style Adaptation 层，请在不改变剧情事实、人物状态、信息顺序和核心冲突的前提下，对正文做文风转译。',
    `目标文风要求：${request.stylePrompt}`,
    '',
    '请输出 JSON，不要输出 Markdown。',
    '字段要求：content, summary, appliedChanges。',
    '- content 为转译后的完整正文',
    '- summary 为本次文风转译摘要',
    '- appliedChanges 为 1 到 6 条修改摘要',
    '- 严禁新增设定、篡改事实、删掉关键剧情推进或改变人物关系',
    '',
    '原正文如下：',
    request.content,
  ].filter(Boolean);

  return sections.join('\n');
}

function buildPolishPrompt(request: AIPolishRequest) {
  const reviewBlock = request.review
    ? [
        `审查总结：${request.review.summary}`,
        `审查级别：${request.review.overallSeverity}`,
        `Anti-AI：${request.review.antiAiForceCheck}`,
        ...request.review.checkerResults.flatMap((checker) =>
          checker.issues.map((issue, index) =>
            [
              `${checker.checker} 问题 ${index + 1}：${issue.title}`,
              `说明：${issue.description}`,
              issue.suggestion ? `建议：${issue.suggestion}` : '',
              issue.evidence ? `证据：${issue.evidence}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          ),
        ),
      ]
        .filter(Boolean)
        .join('\n\n')
    : '暂无明确审查问题，但仍需做 Anti-AI 和语言润色。';

  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.previousSummary ? `上一章摘要：${request.previousSummary}` : '',
    request.worldState ? `当前世界状态：${request.worldState}` : '',
    request.contextBundle ? `补充上下文：\n${request.contextBundle}` : '',
    request.outline
      ? [
          '章节契约：',
          `- 目标：${request.outline.goal}`,
          `- 阻力：${request.outline.obstacle}`,
          `- 代价：${request.outline.cost}`,
          `- Strand：${request.outline.strand}`,
          request.outline.immutableFacts.length > 0
            ? `- 不可变事实：${request.outline.immutableFacts.join('；')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '',
    '',
    '请对以下章节正文做定稿润色，目标是：',
    '1. 保留所有剧情事实、顺序、人物状态和核心冲突，不得新增设定或改写剧情走向。',
    '2. 优先修复审查问题，让表达更自然、更像网文作者手写，而不是模型流水句。',
    '3. 做最终 Anti-AI 检查，尽量改掉机械重复、套话、空泛抒情与高危 AI 腔。',
    '',
    '请输出 JSON，不要输出 Markdown。',
    '字段要求：content, summary, antiAiForceCheck, appliedChanges。',
    '- content 为润色后的完整正文',
    '- antiAiForceCheck 只能是 pass / fail',
    '- appliedChanges 为 1 到 6 条修改摘要',
    '- 如果你认为仍有明显 AI 腔无法彻底消除，可以返回 fail，并在 summary 中写明残留风险',
    '',
    '审查反馈如下：',
    reviewBlock,
    '',
    '原正文如下：',
    request.content,
  ].filter(Boolean);

  return sections.join('\n');
}

function buildOneShotRequest(
  projectId: string,
  model: string,
  temperature: number,
  userPrompt: string,
): AIChatRequest {
  return {
    projectId,
    model,
    temperature,
    systemPrompt: buildWritingRulesPrompt({
      enableCoolPoints: false,
    }),
    messages: [
      {
        id: 'system-user',
        role: 'user',
        content: userPrompt,
      },
    ],
  };
}

async function resolveRequestContextBundle(env: ServerEnv, request: ContextAwareRequest) {
  if (Array.isArray(request.foreshadowSnapshot)) {
    replaceGenerationForeshadows(env, {
      projectId: request.projectId,
      foreshadows: request.foreshadowSnapshot,
    });
  }

  return (
    await buildGenerationContextBundle(env, {
    projectId: request.projectId,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    chapterOrder: request.chapterOrder,
    volumeTitle: request.volumeTitle,
    previousChapterId: request.previousChapterId,
    previousChapterTitle: request.previousChapterTitle,
    previousSummary: request.previousSummary,
    worldState: request.worldState,
    outline: request.outline,
    fallbackContextBundle: request.contextBundle,
    preferStoredForeshadows: Array.isArray(request.foreshadowSnapshot),
    lightweightRecallConfig: request.gateConfigOverride?.lightweightRecall,
    })
  ).bundle;
}

export async function generateChapterOutline(env: ServerEnv, request: AIPlanRequest): Promise<AIPlanResponse> {
  const resolvedRequest: AIPlanRequest = {
    ...request,
    contextBundle: await resolveRequestContextBundle(env, request),
  };
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      buildPlanPrompt(resolvedRequest),
    ),
  );
  const parsed = parseJson<unknown>(rawText);

  return {
    outline: normalizeOutline(parsed),
    rawText,
  };
}

export async function extractChapterArtifacts(env: ServerEnv, request: AIExtractRequest): Promise<AIExtractResponse> {
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(request.projectId, request.model, request.temperature, buildExtractPrompt(request)),
  );
  const parsed = parseJson<{
    summary?: unknown;
    stateChanges?: unknown;
    strand?: unknown;
  }>(rawText);

  return {
    summary: normalizeSummary(parsed.summary),
    stateChanges: normalizeStateChanges(parsed.stateChanges),
    strand: normalizeStrand(parsed.strand),
    rawText,
  };
}

export async function generateBeatDraft(env: ServerEnv, request: AIWriteRequest): Promise<AIWriteResponse> {
  const resolvedRequest: AIWriteRequest = {
    ...request,
    contextBundle: await resolveRequestContextBundle(env, request),
  };
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      buildWritePrompt(resolvedRequest),
    ),
  );

  return {
    content: stripMarkdownCodeFence(rawText),
    rawText,
  };
}

export async function reviewChapterDraft(env: ServerEnv, request: AIReviewRequest): Promise<AIReviewResponse> {
  const resolvedRequest: AIReviewRequest = {
    ...request,
    contextBundle: await resolveRequestContextBundle(env, request),
  };
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      buildReviewPrompt(resolvedRequest),
    ),
  );
  const parsed = parseJson<unknown>(rawText);

  return {
    review: normalizeReview(parsed),
    rawText,
  };
}

export async function styleChapterDraft(env: ServerEnv, request: AIStyleRequest): Promise<AIStyleResponse> {
  const resolvedRequest: AIStyleRequest = {
    ...request,
    contextBundle: await resolveRequestContextBundle(env, request),
  };
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      buildStylePrompt(resolvedRequest),
    ),
  );
  const parsed = parseJson<{
    content?: unknown;
    summary?: unknown;
    appliedChanges?: unknown;
  }>(rawText);

  return {
    content: sanitizeString(parsed.content, resolvedRequest.content),
    style: normalizeStyle(parsed),
    rawText,
  };
}

export async function polishChapterDraft(env: ServerEnv, request: AIPolishRequest): Promise<AIPolishResponse> {
  const resolvedRequest: AIPolishRequest = {
    ...request,
    contextBundle: await resolveRequestContextBundle(env, request),
  };
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      buildPolishPrompt(resolvedRequest),
    ),
  );
  const parsed = parseJson<{
    content?: unknown;
    summary?: unknown;
    antiAiForceCheck?: unknown;
    appliedChanges?: unknown;
  }>(rawText);

  return {
    content: sanitizeString(parsed.content, resolvedRequest.content),
    polish: normalizePolish(parsed),
    rawText,
  };
}
