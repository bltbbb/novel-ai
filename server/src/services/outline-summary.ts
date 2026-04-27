import { WRITING_RULES_MARKER } from '../prompts/index.js';
import { completeChatCompletion } from './openai.js';
import type {
  AIBookOutlineSummaryRequest,
  AIBookOutlineSummaryResponse,
  AIVolumeOutlineSummaryRequest,
  AIVolumeOutlineSummaryResponse,
  BookOutlineFields,
  VolumeMilestoneDraft,
  VolumeOutlineFields,
} from '../types/ai.js';
import type { ServerEnv } from '../config/env.js';

function sanitizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripMarkdownCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseJson<T>(rawText: string): T {
  const candidates = [rawText, stripMarkdownCodeFence(rawText)].map((item) => item.trim()).filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  throw new Error(`模型返回的 JSON 无法解析：${rawText.slice(0, 160).trim()}`);
}

function normalizeSummary(value: unknown) {
  return sanitizeText(value);
}

function normalizeMilestoneSummaries(value: unknown, milestones: VolumeMilestoneDraft[]) {
  const parsed = Array.isArray(value) ? value.map((item) => sanitizeText(item)) : [];

  return milestones.map((_, index) => parsed[index] ?? '');
}

function formatTextList(values: string[] | undefined, limit = 3) {
  return (values ?? [])
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .slice(0, limit)
    .join('；');
}

function buildBookOutlinePayloadText(outline: BookOutlineFields) {
  return [
    outline.premise ? `核心前提：${outline.premise}` : '',
    outline.centralConflict ? `主线冲突：${outline.centralConflict}` : '',
    outline.protagonistArc ? `主角弧线：${outline.protagonistArc}` : '',
    outline.thematicCore ? `主题内核：${outline.thematicCore}` : '',
    outline.logline ? `一句话卖点：${outline.logline}` : '',
    outline.powerSystem ? `能力体系：${outline.powerSystem}` : '',
    outline.antagonistSystem ? `对抗体系：${outline.antagonistSystem}` : '',
    outline.narrativeArc ? `叙事弧线：${outline.narrativeArc}` : '',
    formatTextList(outline.subPlots) ? `副线规划：${formatTextList(outline.subPlots)}` : '',
    formatTextList(outline.worldRules) ? `世界规则：${formatTextList(outline.worldRules)}` : '',
    outline.endgameHint ? `结局方向：${outline.endgameHint}` : '',
    outline.toneGuide ? `整体基调：${outline.toneGuide}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildMilestonePayloadText(milestones: VolumeMilestoneDraft[]) {
  if (milestones.length === 0) {
    return '暂无阶段里程碑';
  }

  return milestones
    .map((milestone, index) =>
      [
        `阶段 ${index + 1}：${sanitizeText(milestone.title) || `阶段 ${index + 1}`}`,
        milestone.targetChapterCount > 0 ? `目标章数：${milestone.targetChapterCount}` : '',
        milestone.phaseGoal ? `阶段目标：${milestone.phaseGoal}` : '',
        milestone.phaseConflict ? `阶段冲突：${milestone.phaseConflict}` : '',
        milestone.entryState ? `进入状态：${milestone.entryState}` : '',
        milestone.exitState ? `结束状态：${milestone.exitState}` : '',
        milestone.powerCeiling ? `阶段边界：${milestone.powerCeiling}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

function buildVolumeOutlinePayloadText(outline: VolumeOutlineFields) {
  return [
    outline.goal ? `本卷目标：${outline.goal}` : '',
    outline.keyConflict ? `核心冲突：${outline.keyConflict}` : '',
    outline.arcSummary ? `弧线概述：${outline.arcSummary}` : '',
    outline.entryState ? `卷初状态：${outline.entryState}` : '',
    outline.exitState ? `卷末状态：${outline.exitState}` : '',
    outline.antagonist ? `明面对手：${outline.antagonist}` : '',
    outline.subPlot ? `本卷暗线：${outline.subPlot}` : '',
    outline.protagonistGrowth ? `主角成长：${outline.protagonistGrowth}` : '',
    outline.emotionalArc ? `情感推进：${outline.emotionalArc}` : '',
    outline.povPlan ? `视角规划：${outline.povPlan}` : '',
    formatTextList(outline.keyEvents) ? `关键事件：${formatTextList(outline.keyEvents)}` : '',
    formatTextList(outline.foreshadowSeeds) ? `伏笔安排：${formatTextList(outline.foreshadowSeeds)}` : '',
    outline.estimatedChapterCount > 0 ? `预估章数：${outline.estimatedChapterCount}` : '',
    outline.estimatedWordCount > 0 ? `预估字数：${outline.estimatedWordCount}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildBookOutlineSummaryPrompt(request: AIBookOutlineSummaryRequest) {
  return [
    `项目标题：${request.projectTitle || '未命名项目'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.genre.length > 0 ? `题材标签：${request.genre.join(' / ')}` : '',
    '全书大纲如下：',
    buildBookOutlinePayloadText(request.outline),
    '',
    '请把这份全书大纲压缩成“供章节生成使用的短摘要”。',
    '输出严格 JSON，不要输出 Markdown，不要解释。',
    '字段要求：summary。',
    '- summary 必须是 3 到 4 行中文短句，用换行分隔。',
    '- 每行聚焦一个层面：故事核心、主线冲突、主角弧线、世界/终局边界。',
    '- 总体要短、稳、抗噪音，适合直接放进章节正文生成上下文。',
    '- 不要展开细节，不要抄写整段原文，不要写成长篇说明。',
  ].filter(Boolean).join('\n');
}

function buildVolumeOutlineSummaryPrompt(request: AIVolumeOutlineSummaryRequest) {
  return [
    `项目标题：${request.projectTitle || '未命名项目'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.bookOutlineSummary ? `全书短摘要：\n${request.bookOutlineSummary}` : '',
    `当前卷：第${request.volumeOrder}卷《${request.volumeTitle || '未命名卷'}》`,
    '当前卷纲如下：',
    buildVolumeOutlinePayloadText(request.outline),
    '',
    '阶段里程碑如下：',
    buildMilestonePayloadText(request.outline.milestones),
    '',
    '请把这份卷纲与阶段信息压缩成“供章节生成使用的短摘要”。',
    '输出严格 JSON，不要输出 Markdown，不要解释。',
    '字段要求：summary, milestoneSummaries。',
    '- summary 必须是 3 到 4 行中文短句，用换行分隔，只概括本卷方向、冲突、状态变化和规模。',
    `- milestoneSummaries 必须是长度为 ${request.outline.milestones.length} 的字符串数组，与里程碑顺序完全一致。`,
    '- 每个 milestone summary 写 2 到 3 行中文短句，用换行分隔，只概括该阶段目标、阶段冲突和阶段状态推进。',
    '- 阶段摘要只聚焦当前阶段，不要把后续阶段的未来事件整段提前灌进去。',
    '- 语言必须短、稳、可直接给章节生成使用，避免大而空的总结腔。',
  ].filter(Boolean).join('\n');
}

export async function generateBookOutlineSummary(
  env: ServerEnv,
  request: AIBookOutlineSummaryRequest,
): Promise<AIBookOutlineSummaryResponse> {
  const rawText = await completeChatCompletion(env, {
    projectId: 'book-outline-summary-generator',
    model: request.model,
    temperature: request.temperature,
    reasoningEffort: request.reasoningEffort,
    systemPrompt: `${WRITING_RULES_MARKER}\n本次不是正文写作任务，而是大纲摘要提炼任务。不要执行写作规则，只做信息压缩并输出 JSON。`,
    messages: [
      {
        id: 'book-outline-summary-user',
        role: 'user',
        content: buildBookOutlineSummaryPrompt(request),
      },
    ],
  });
  const parsed = parseJson<{ summary?: unknown }>(rawText);

  return {
    summary: normalizeSummary(parsed.summary),
  };
}

export async function generateVolumeOutlineSummary(
  env: ServerEnv,
  request: AIVolumeOutlineSummaryRequest,
): Promise<AIVolumeOutlineSummaryResponse> {
  const rawText = await completeChatCompletion(env, {
    projectId: 'volume-outline-summary-generator',
    model: request.model,
    temperature: request.temperature,
    reasoningEffort: request.reasoningEffort,
    systemPrompt: `${WRITING_RULES_MARKER}\n本次不是正文写作任务，而是卷纲摘要提炼任务。不要执行写作规则，只做信息压缩并输出 JSON。`,
    messages: [
      {
        id: 'volume-outline-summary-user',
        role: 'user',
        content: buildVolumeOutlineSummaryPrompt(request),
      },
    ],
  });
  const parsed = parseJson<{ summary?: unknown; milestoneSummaries?: unknown }>(rawText);

  return {
    summary: normalizeSummary(parsed.summary),
    milestoneSummaries: normalizeMilestoneSummaries(parsed.milestoneSummaries, request.outline.milestones),
  };
}
