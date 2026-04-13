import type { ServerEnv } from '../config/env.js';
import { WRITING_RULES_MARKER } from '../prompts/index.js';
import { analyzeBookLightStats } from './book-analysis-light-stats.js';
import { completeChatCompletion } from './openai.js';
import type {
  AIBookAnalysisRequest,
  AIBookAnalysisResponse,
  AIChatRequest,
  BookAnalysisRange,
  BookAnalysisJobStage,
  TemplateAnalysisMeta,
  TemplateLibraryDraft,
  TemplatePromptBundle,
  TemplateSubPromptBundle,
  TemplateSubTemplateDraft,
  TemplateSubTemplates,
} from '../types/ai.js';

interface TextSegment {
  title: string;
  content: string;
}

interface SegmentAnalysis {
  title: string;
  summary: string;
  narrativeStyle: string;
  pacingStyle: string;
  conflictStyle: string;
  characterStyle: string;
  dialogueStyle: string;
  openingStyle: string;
  endingHookStyle: string;
  commonPatterns: string[];
  forbiddenPatterns: string[];
}

export interface BookAnalysisCheckpoint {
  sampledSegments: TextSegment[];
  analyses: SegmentAnalysis[];
  meta: TemplateAnalysisMeta;
  batchSize: number;
  totalBatches: number;
}

interface SegmentAnalysisBatchResponse {
  items?: unknown;
}

const EMPTY_PROMPT_BUNDLE: TemplatePromptBundle = {
  bookOutlinePrompt: '',
  volumeOutlinePrompt: '',
  milestonePrompt: '',
  beatPrompt: '',
  writingPrompt: '',
  stylePrompt: '',
  negativePrompt: '',
};

const EMPTY_SUB_PROMPT_BUNDLE: TemplateSubPromptBundle = {
  beatPrompt: '',
  writingPrompt: '',
  stylePrompt: '',
  negativePrompt: '',
};

const EMPTY_SUB_TEMPLATE: TemplateSubTemplateDraft = {
  summary: '',
  usage: '',
  promptBundle: { ...EMPTY_SUB_PROMPT_BUNDLE },
};

interface AnalyzeBookTemplateOptions {
  onProgress?: (payload: {
    stage: BookAnalysisJobStage;
    progressPercent: number;
    message: string;
    totalSegments?: number;
    sampledSegments?: number;
    finishedSegments?: number;
    estimatedWordCount?: number;
  }) => void | Promise<void>;
  isCancelled?: () => boolean;
  checkpoint?: BookAnalysisCheckpoint | null;
  onCheckpoint?: (checkpoint: BookAnalysisCheckpoint) => void | Promise<void>;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function summarizeTexts(values: string[], maxItems = 3) {
  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .join('；');
}

function formatAnalysisRangeLabel(range: BookAnalysisRange) {
  switch (range) {
    case 'opening':
      return '开篇';
    case 'middle':
      return '中段';
    case 'ending':
      return '结尾';
    case 'custom':
      return '自定义区间';
    case 'full':
    default:
      return '全文';
  }
}

function ensureNotCancelled(options: AnalyzeBookTemplateOptions) {
  if (options.isCancelled?.()) {
    throw new Error('任务已取消');
  }
}

function normalizeTextList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function stripMarkdownCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/iu, '')
    .replace(/```$/iu, '')
    .trim();
}

function findBalancedJsonBlock(text: string, startIndex: number) {
  const openingChar = text[startIndex];

  if (openingChar !== '{' && openingChar !== '[') {
    return null;
  }

  const stack = [openingChar];
  let inString = false;
  let escaped = false;

  for (let index = startIndex + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char !== '}' && char !== ']') {
      continue;
    }

    const lastOpeningChar = stack.pop();
    const isMatched =
      (lastOpeningChar === '{' && char === '}') ||
      (lastOpeningChar === '[' && char === ']');

    if (!isMatched) {
      return null;
    }

    if (stack.length === 0) {
      return text.slice(startIndex, index + 1).trim();
    }
  }

  return null;
}

function extractJsonCandidate(rawText: string) {
  const candidates = new Set<string>();
  const normalized = stripMarkdownCodeFence(rawText);

  candidates.add(rawText.trim());
  candidates.add(normalized);

  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/giu;
  for (const match of rawText.matchAll(fencePattern)) {
    if (typeof match[1] === 'string' && match[1].trim()) {
      candidates.add(match[1].trim());
    }
  }

  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] !== '{' && normalized[index] !== '[') {
      continue;
    }

    const candidate = findBalancedJsonBlock(normalized, index);
    if (candidate) {
      candidates.add(candidate);
    }
  }

  for (const candidate of candidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`拆书分析返回 JSON 解析失败：${normalized.slice(0, 200) || '空文本'}`);
}

function parseJson<T>(rawText: string) {
  return JSON.parse(extractJsonCandidate(rawText)) as T;
}

function buildRequest(
  sourceTitle: string,
  model: string,
  temperature: number,
  reasoningEffort: AIChatRequest['reasoningEffort'],
  systemPrompt: string,
  userPrompt: string,
): AIChatRequest {
  return {
    projectId: `template-analysis:${sourceTitle.trim() || 'unknown'}`,
    model,
    temperature,
    reasoningEffort,
    systemPrompt,
    messages: [
      {
        id: 'template-analysis-user',
        role: 'user',
        content: userPrompt,
      },
    ],
  };
}

function normalizeContent(rawText: string) {
  return rawText
    .replace(/\r\n?/gu, '\n')
    .replace(/\u0000/gu, '')
    .trim();
}

function estimateWordCount(content: string) {
  return content.replace(/\s+/gu, '').length;
}

function createEvidenceSnippets(segments: TextSegment[]) {
  return segments.slice(0, 6).map((segment) => ({
    title: segment.title,
    excerpt: shrinkSegmentContent(segment.content, 260),
  }));
}

function splitByChapterHeading(content: string) {
  const lines = content.split('\n');
  const segments: TextSegment[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];
  const chapterHeadingPattern =
    /^\s*(第.{0,24}(章|回|节|卷|篇|集)|chapter\s+\d+|Chapter\s+\d+)\s*[:：\-—]?.*$/u;

  function pushCurrent() {
    const normalizedContent = currentLines.join('\n').trim();
    if (!normalizedContent) {
      return;
    }

    segments.push({
      title: currentTitle || `片段 ${segments.length + 1}`,
      content: normalizedContent,
    });
  }

  for (const line of lines) {
    if (chapterHeadingPattern.test(line.trim()) && currentLines.length > 0) {
      pushCurrent();
      currentTitle = line.trim();
      currentLines = [];
      continue;
    }

    if (chapterHeadingPattern.test(line.trim()) && !currentTitle) {
      currentTitle = line.trim();
      continue;
    }

    currentLines.push(line);
  }

  pushCurrent();

  return segments.filter((segment) => segment.content.trim().length > 0);
}

function splitByLength(content: string, chunkSize = 6000) {
  const paragraphs = content
    .split(/\n{2,}/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const segments: TextSegment[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= chunkSize || !current) {
      current = candidate;
      continue;
    }

    segments.push({
      title: `片段 ${segments.length + 1}`,
      content: current,
    });
    current = paragraph;
  }

  if (current.trim()) {
    segments.push({
      title: `片段 ${segments.length + 1}`,
      content: current,
    });
  }

  return segments;
}

function buildSegments(content: string) {
  const chapterSegments = splitByChapterHeading(content);
  if (chapterSegments.length >= 3) {
    return chapterSegments;
  }

  const lengthSegments = splitByLength(content);
  if (lengthSegments.length > 0) {
    return lengthSegments;
  }

  return [
    {
      title: '片段 1',
      content,
    },
  ];
}

function selectSegmentsByRange(segments: TextSegment[], request: Pick<AIBookAnalysisRequest, 'analysisRange' | 'rangeStartIndex' | 'rangeEndIndex'>) {
  const range = request.analysisRange ?? 'full';

  if (range === 'full' || segments.length <= 2) {
    return segments;
  }

  if (range === 'custom') {
    const startIndex = Math.max(1, Math.trunc(request.rangeStartIndex ?? 1));
    const endIndex = Math.max(startIndex, Math.trunc(request.rangeEndIndex ?? startIndex));
    const sliced = segments.slice(startIndex - 1, endIndex);
    return sliced.length > 0 ? sliced : segments.slice(-1);
  }

  const total = segments.length;
  const windowSize = Math.max(1, Math.ceil(total / 3));

  if (range === 'opening') {
    return segments.slice(0, windowSize);
  }

  if (range === 'ending') {
    return segments.slice(Math.max(0, total - windowSize));
  }

  const startIndex = Math.max(0, Math.floor((total - windowSize) / 2));
  return segments.slice(startIndex, startIndex + windowSize);
}

function buildSamplingPlan(totalChars: number, segmentCount: number) {
  const totalSampleBudget = Math.max(60000, Math.min(360000, Math.round(totalChars * 0.08)));
  const preferredWindowChars =
    totalChars >= 2_000_000
      ? 32000
      : totalChars >= 800_000
        ? 26000
        : totalChars >= 300_000
          ? 22000
          : 16000;
  const windowCount = Math.min(
    segmentCount,
    Math.max(4, Math.min(10, Math.round(totalSampleBudget / preferredWindowChars))),
  );
  const targetWindowChars = Math.max(
    16000,
    Math.min(40000, Math.round(totalSampleBudget / Math.max(windowCount, 1))),
  );

  return {
    totalSampleBudget,
    windowCount,
    targetWindowChars,
  };
}

function sampleSegments(segments: TextSegment[], totalChars: number) {
  const samplingPlan = buildSamplingPlan(totalChars, segments.length);
  const { targetWindowChars, windowCount } = samplingPlan;

  function buildWindow(bucket: TextSegment[], index: number) {
    if (bucket.length === 0) {
      return null;
    }

    const firstTitle = bucket[0]?.title ?? `样本 ${index + 1}`;
    const lastTitle = bucket[bucket.length - 1]?.title ?? firstTitle;
    const mergedTitle = bucket.length === 1 ? firstTitle : `${firstTitle} ~ ${lastTitle}`;
    const mergedContent = bucket
      .map((segment) => [`【${segment.title}】`, segment.content].join('\n'))
      .join('\n\n');

    return {
      title: mergedTitle,
      content: shrinkSegmentContent(mergedContent, targetWindowChars),
    } satisfies TextSegment;
  }

  if (segments.length <= windowCount) {
    return segments
      .map((segment, index) => buildWindow([segment], index))
      .filter((item): item is TextSegment => Boolean(item));
  }

  const windows: TextSegment[] = [];

  for (let order = 0; order < windowCount; order += 1) {
    const startIndex = Math.floor((order * segments.length) / windowCount);
    const endIndex = Math.floor(((order + 1) * segments.length) / windowCount);
    const bucket = segments.slice(startIndex, Math.max(startIndex + 1, endIndex));
    const window = buildWindow(bucket, order);

    if (window) {
      windows.push(window);
    }
  }

  return windows;
}

function shrinkSegmentContent(content: string, maxLength = 5200) {
  const normalized = content.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const headLength = Math.floor(maxLength * 0.65);
  const tailLength = maxLength - headLength - 16;

  return [
    normalized.slice(0, headLength).trim(),
    '......（中段省略）......',
    normalized.slice(-tailLength).trim(),
  ].join('\n');
}

function buildSegmentAnalysisPrompt(
  request: AIBookAnalysisRequest,
  segment: TextSegment,
  segmentIndex: number,
  totalSegments: number,
) {
  return [
    `现在要拆解作品《${request.sourceTitle.trim()}》的写法特征。`,
    request.sourceAuthor?.trim() ? `作者：${request.sourceAuthor.trim()}` : '',
    `当前是样本片段 ${segmentIndex + 1}/${totalSegments}。`,
    '',
    '你的任务不是复述剧情，而是提炼写法模式。',
    '请聚焦：叙事方式、节奏推进、冲突制造、人物塑造、对白习惯、开头方式、章末钩子。',
    '严禁输出长篇剧情摘要，严禁模仿或补写原文。',
    '',
    '请输出 JSON，不要输出 Markdown。',
    '字段要求：summary, narrativeStyle, pacingStyle, conflictStyle, characterStyle, dialogueStyle, openingStyle, endingHookStyle, commonPatterns, forbiddenPatterns。',
    '- commonPatterns 和 forbiddenPatterns 输出 3 到 6 条短句数组。',
    '',
    `样本标题：${segment.title}`,
    '样本文本如下：',
    shrinkSegmentContent(segment.content),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildBatchSegmentAnalysisPrompt(
  request: AIBookAnalysisRequest,
  segments: TextSegment[],
  batchIndex: number,
  totalBatches: number,
) {
  const segmentBlock = segments
    .map((segment, index) => {
      return [
        `### 样本 ${index + 1}`,
        `标题：${segment.title}`,
        '正文：',
        segment.content,
      ].join('\n');
    })
    .join('\n\n');

  return [
    `现在要拆解作品《${request.sourceTitle.trim()}》的写法特征。`,
    request.sourceAuthor?.trim() ? `作者：${request.sourceAuthor.trim()}` : '',
    `当前是分析批次 ${batchIndex + 1}/${totalBatches}。`,
    '',
    '你的任务不是复述剧情，而是提炼写法模式。',
    '请分别分析每个样本的叙事方式、节奏推进、冲突制造、人物塑造、对白习惯、开头方式、章末钩子。',
    '严禁输出长篇剧情摘要，严禁模仿或补写原文。',
    '',
    '请输出 JSON，不要输出 Markdown。',
    '字段要求：items。',
    'items 必须是数组，数组长度必须与样本数一致。',
    '每个 item 必须包含：title, summary, narrativeStyle, pacingStyle, conflictStyle, characterStyle, dialogueStyle, openingStyle, endingHookStyle, commonPatterns, forbiddenPatterns。',
    '',
    segmentBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeSegmentAnalysis(raw: unknown, title: string): SegmentAnalysis {
  const candidate =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};

  return {
    title,
    summary: normalizeText(candidate.summary),
    narrativeStyle: normalizeText(candidate.narrativeStyle),
    pacingStyle: normalizeText(candidate.pacingStyle),
    conflictStyle: normalizeText(candidate.conflictStyle),
    characterStyle: normalizeText(candidate.characterStyle),
    dialogueStyle: normalizeText(candidate.dialogueStyle),
    openingStyle: normalizeText(candidate.openingStyle),
    endingHookStyle: normalizeText(candidate.endingHookStyle),
    commonPatterns: normalizeTextList(candidate.commonPatterns).slice(0, 6),
    forbiddenPatterns: normalizeTextList(candidate.forbiddenPatterns).slice(0, 6),
  };
}

function buildAggregatePrompt(
  request: AIBookAnalysisRequest,
  analyses: SegmentAnalysis[],
  meta: TemplateAnalysisMeta,
) {
  const analysisBlock = analyses
    .map((analysis, index) => {
      return [
        `${index + 1}. ${analysis.title}`,
        `总结：${analysis.summary || '暂无'}`,
        `叙事：${analysis.narrativeStyle || '暂无'}`,
        `节奏：${analysis.pacingStyle || '暂无'}`,
        `冲突：${analysis.conflictStyle || '暂无'}`,
        `人物：${analysis.characterStyle || '暂无'}`,
        `对白：${analysis.dialogueStyle || '暂无'}`,
        `开头：${analysis.openingStyle || '暂无'}`,
        `结尾：${analysis.endingHookStyle || '暂无'}`,
        analysis.commonPatterns.length > 0 ? `常见套路：${analysis.commonPatterns.join('；')}` : '',
        analysis.forbiddenPatterns.length > 0 ? `避免项：${analysis.forbiddenPatterns.join('；')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return [
    `请把作品《${request.sourceTitle.trim()}》的样本拆解结果汇总成一条可复用的创作模板。`,
    request.sourceAuthor?.trim() ? `作者：${request.sourceAuthor.trim()}` : '',
    '',
    '输出目标不是剧情梗概，而是“写法模板”。',
    '模板必须服务小说创作，不得复制原书专有设定、人名、地名和剧情。',
    '请把特征抽象为可迁移的创作约束。',
    '',
    '请输出 JSON，不要输出 Markdown。',
    '字段要求：',
    '- name',
    '- sourceTitle',
    '- sourceAuthor',
    '- tags',
    '- summary',
    '- narrativeStyle',
    '- pacingStyle',
    '- conflictStyle',
    '- characterStyle',
    '- dialogueStyle',
    '- openingStyle',
    '- endingHookStyle',
    '- commonPatterns',
    '- forbiddenPatterns',
    '- promptBundle',
    '',
    '其中 promptBundle 必须包含：bookOutlinePrompt, volumeOutlinePrompt, milestonePrompt, beatPrompt, writingPrompt, stylePrompt, negativePrompt。',
    '要求这些 prompt 都是“可直接给写作模型使用的中文约束”，不要写成解释文。',
    '',
    '统计信息：',
    `- 总片段数：${meta.totalSegments}`,
    `- 采样片段数：${meta.sampledSegments}`,
    `- 估算字数：${meta.estimatedWordCount}`,
    `- 方法：${meta.method}`,
    '',
    '样本分析如下：',
    analysisBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSubTemplatesPrompt(
  request: AIBookAnalysisRequest,
  analyses: SegmentAnalysis[],
  meta: TemplateAnalysisMeta,
) {
  const analysisBlock = analyses
    .map((analysis, index) => {
      return [
        `${index + 1}. ${analysis.title}`,
        `总结：${analysis.summary || '暂无'}`,
        `叙事：${analysis.narrativeStyle || '暂无'}`,
        `节奏：${analysis.pacingStyle || '暂无'}`,
        `冲突：${analysis.conflictStyle || '暂无'}`,
        `人物：${analysis.characterStyle || '暂无'}`,
        `对白：${analysis.dialogueStyle || '暂无'}`,
        `开头：${analysis.openingStyle || '暂无'}`,
        `结尾：${analysis.endingHookStyle || '暂无'}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return [
    `请基于作品《${request.sourceTitle.trim()}》的拆书样本结果，输出四类子模板。`,
    request.sourceAuthor?.trim() ? `作者：${request.sourceAuthor.trim()}` : '',
    '',
    '请输出 JSON，不要输出 Markdown。',
    '字段要求：subTemplates。',
    'subTemplates 必须包含 opening, middle, climax, ending 四个对象。',
    '每个对象都必须包含：summary, usage, promptBundle。',
    '其中 promptBundle 必须包含：beatPrompt, writingPrompt, stylePrompt, negativePrompt。',
    '这些子模板必须服务小说创作，不得复述原书剧情。要写成能直接指导生成模型的抽象写法模板。',
    '',
    '统计信息：',
    `- 总片段数：${meta.totalSegments}`,
    `- 采样片段数：${meta.sampledSegments}`,
    `- 方法：${meta.method}`,
    '',
    '样本分析如下：',
    analysisBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizePromptBundle(raw: unknown): TemplatePromptBundle {
  const candidate =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};

  return {
    bookOutlinePrompt: normalizeText(candidate.bookOutlinePrompt),
    volumeOutlinePrompt: normalizeText(candidate.volumeOutlinePrompt),
    milestonePrompt: normalizeText(candidate.milestonePrompt),
    beatPrompt: normalizeText(candidate.beatPrompt),
    writingPrompt: normalizeText(candidate.writingPrompt),
    stylePrompt: normalizeText(candidate.stylePrompt),
    negativePrompt: normalizeText(candidate.negativePrompt),
  };
}

function normalizeSubPromptBundle(raw: unknown): TemplateSubPromptBundle {
  const candidate =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};

  return {
    beatPrompt: normalizeText(candidate.beatPrompt),
    writingPrompt: normalizeText(candidate.writingPrompt),
    stylePrompt: normalizeText(candidate.stylePrompt),
    negativePrompt: normalizeText(candidate.negativePrompt),
  };
}

function normalizeSubTemplate(raw: unknown): TemplateSubTemplateDraft {
  const candidate =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};

  return {
    summary: normalizeText(candidate.summary),
    usage: normalizeText(candidate.usage),
    promptBundle: {
      ...EMPTY_SUB_PROMPT_BUNDLE,
      ...normalizeSubPromptBundle(candidate.promptBundle),
    },
  };
}

function normalizeSubTemplates(raw: unknown): TemplateSubTemplates {
  const candidate =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};

  return {
    opening: {
      ...EMPTY_SUB_TEMPLATE,
      ...normalizeSubTemplate(candidate.opening),
    },
    middle: {
      ...EMPTY_SUB_TEMPLATE,
      ...normalizeSubTemplate(candidate.middle),
    },
    climax: {
      ...EMPTY_SUB_TEMPLATE,
      ...normalizeSubTemplate(candidate.climax),
    },
    ending: {
      ...EMPTY_SUB_TEMPLATE,
      ...normalizeSubTemplate(candidate.ending),
    },
  };
}

function normalizeTemplateCore(
  raw: unknown,
  request: AIBookAnalysisRequest,
  analyses: SegmentAnalysis[],
): Omit<TemplateLibraryDraft, 'subTemplates' | 'analysisMeta'> {
  const candidate =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
  const narrativeFallback = summarizeTexts(analyses.map((analysis) => analysis.narrativeStyle));
  const pacingFallback = summarizeTexts(analyses.map((analysis) => analysis.pacingStyle));
  const conflictFallback = summarizeTexts(analyses.map((analysis) => analysis.conflictStyle));
  const characterFallback = summarizeTexts(analyses.map((analysis) => analysis.characterStyle));
  const dialogueFallback = summarizeTexts(analyses.map((analysis) => analysis.dialogueStyle));
  const openingFallback = summarizeTexts(analyses.map((analysis) => analysis.openingStyle));
  const endingFallback = summarizeTexts(analyses.map((analysis) => analysis.endingHookStyle));
  const summaryFallback = summarizeTexts(analyses.map((analysis) => analysis.summary), 4);
  const commonPatternsFallback = analyses.flatMap((analysis) => analysis.commonPatterns).filter(Boolean).slice(0, 8);
  const forbiddenPatternsFallback = analyses.flatMap((analysis) => analysis.forbiddenPatterns).filter(Boolean).slice(0, 8);

  return {
    name: normalizeText(candidate.name) || `${request.sourceTitle.trim() || '未命名作品'}写法模板`,
    sourceTitle: normalizeText(candidate.sourceTitle) || request.sourceTitle.trim(),
    sourceAuthor: normalizeText(candidate.sourceAuthor) || request.sourceAuthor?.trim() || '',
    tags: normalizeTextList(candidate.tags).slice(0, 8),
    summary: normalizeText(candidate.summary) || summaryFallback,
    narrativeStyle: normalizeText(candidate.narrativeStyle) || narrativeFallback,
    pacingStyle: normalizeText(candidate.pacingStyle) || pacingFallback,
    conflictStyle: normalizeText(candidate.conflictStyle) || conflictFallback,
    characterStyle: normalizeText(candidate.characterStyle) || characterFallback,
    dialogueStyle: normalizeText(candidate.dialogueStyle) || dialogueFallback,
    openingStyle: normalizeText(candidate.openingStyle) || openingFallback,
    endingHookStyle: normalizeText(candidate.endingHookStyle) || endingFallback,
    commonPatterns: normalizeTextList(candidate.commonPatterns).slice(0, 8).length > 0
      ? normalizeTextList(candidate.commonPatterns).slice(0, 8)
      : commonPatternsFallback,
    forbiddenPatterns: normalizeTextList(candidate.forbiddenPatterns).slice(0, 8).length > 0
      ? normalizeTextList(candidate.forbiddenPatterns).slice(0, 8)
      : forbiddenPatternsFallback,
    promptBundle: {
      ...EMPTY_PROMPT_BUNDLE,
      ...normalizePromptBundle(candidate.promptBundle),
    },
  };
}

function normalizeTemplateDraft(
  raw: unknown,
  subTemplateRaw: unknown,
  request: AIBookAnalysisRequest,
  analyses: SegmentAnalysis[],
  meta: TemplateAnalysisMeta,
): TemplateLibraryDraft {
  const core = normalizeTemplateCore(raw, request, analyses);
  const subTemplateCandidate =
    subTemplateRaw && typeof subTemplateRaw === 'object'
      ? (subTemplateRaw as Record<string, unknown>)
      : {};

  return {
    ...core,
    subTemplates: normalizeSubTemplates(subTemplateCandidate.subTemplates),
    analysisMeta: meta,
  };
}

async function analyzeSingleSegment(
  env: ServerEnv,
  request: AIBookAnalysisRequest,
  segment: TextSegment,
  segmentIndex: number,
  totalSegments: number,
) {
  const rawText = await completeChatCompletion(
    env,
    buildRequest(
      request.sourceTitle,
      request.model,
      request.temperature,
      request.reasoningEffort,
      `${WRITING_RULES_MARKER}\n你现在处于拆书分析模式，不需要写小说。你的职责是提炼可迁移的写法模式，不复述剧情，不抄写原文，不产出模仿性文本。`,
      buildSegmentAnalysisPrompt(request, segment, segmentIndex, totalSegments),
    ),
  );

  return normalizeSegmentAnalysis(parseJson<unknown>(rawText), segment.title);
}

async function analyzeSegmentBatch(
  env: ServerEnv,
  request: AIBookAnalysisRequest,
  segments: TextSegment[],
  batchIndex: number,
  totalBatches: number,
) {
  const rawText = await completeChatCompletion(
    env,
    buildRequest(
      request.sourceTitle,
      request.model,
      request.temperature,
      request.reasoningEffort,
      `${WRITING_RULES_MARKER}\n你现在处于拆书分析模式，不需要写小说。你的职责是提炼可迁移的写法模式，不复述剧情，不抄写原文，不产出模仿性文本。`,
      buildBatchSegmentAnalysisPrompt(request, segments, batchIndex, totalBatches),
    ),
  );
  const parsed = parseJson<SegmentAnalysisBatchResponse>(rawText);
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return segments.map((segment, index) =>
    normalizeSegmentAnalysis(items[index], segment.title),
  );
}

export async function analyzeBookTemplate(
  env: ServerEnv,
  request: AIBookAnalysisRequest,
  options: AnalyzeBookTemplateOptions = {},
): Promise<AIBookAnalysisResponse> {
  const normalizedContent = normalizeContent(request.content);

  if (!normalizedContent) {
    throw new Error('待拆书文本不能为空');
  }
  ensureNotCancelled(options);

  await options.onProgress?.({
    stage: 'preprocessing',
    progressPercent: 5,
    message: '正在预处理文本',
  });

  const segments = buildSegments(normalizedContent);
  const scopedSegments = selectSegmentsByRange(segments, request);
  const scopedContent = scopedSegments.map((segment) => segment.content).join('\n');
  const lightStats = analyzeBookLightStats(scopedContent || normalizedContent, scopedSegments);

  await options.onProgress?.({
    stage: 'light_analyzing',
    progressPercent: 10,
    message: '正在执行全量轻分析',
    totalSegments: scopedSegments.length,
    estimatedWordCount: estimateWordCount(scopedContent || normalizedContent),
  });

  const checkpoint = options.checkpoint ?? null;
  const sampledSegments =
    checkpoint?.sampledSegments && checkpoint.sampledSegments.length > 0
      ? checkpoint.sampledSegments
      : sampleSegments(
          scopedSegments,
          estimateWordCount(scopedContent || normalizedContent),
        );
  const meta: TemplateAnalysisMeta = checkpoint?.meta ?? {
    method: `chunk_sample_v1:${request.analysisRange ?? 'full'}`,
    totalSegments: scopedSegments.length,
    sampledSegments: sampledSegments.length,
    estimatedWordCount: estimateWordCount(scopedContent || normalizedContent),
    paragraphCount: lightStats.paragraphCount,
    averageParagraphLength: lightStats.averageParagraphLength,
    dialogueParagraphRatio: lightStats.dialogueParagraphRatio,
    headingSegmentCount: lightStats.headingSegmentCount,
    dominantPerspective: lightStats.dominantPerspective,
    topTransitionWords: lightStats.topTransitionWords,
    evidenceSnippets: createEvidenceSnippets(sampledSegments),
  };
  await options.onProgress?.({
    stage: 'sampling',
    progressPercent: 16,
    message:
      request.analysisRange && request.analysisRange !== 'full'
        ? request.analysisRange === 'custom'
          ? `已按第 ${request.rangeStartIndex ?? 1} 到 ${request.rangeEndIndex ?? request.rangeStartIndex ?? 1} 段范围完成切段与代表性采样`
          : `已按${formatAnalysisRangeLabel(request.analysisRange)}范围完成切段与代表性采样`
        : '已完成切段与代表性采样',
    totalSegments: meta.totalSegments,
    sampledSegments: meta.sampledSegments,
    estimatedWordCount: meta.estimatedWordCount,
  });
  const analyses: SegmentAnalysis[] = [...(checkpoint?.analyses ?? [])].slice(0, sampledSegments.length);
  const averageWindowChars =
    sampledSegments.length > 0
      ? Math.round(
          sampledSegments.reduce((sum, segment) => sum + segment.content.length, 0) / sampledSegments.length,
        )
      : 0;
  const batchSize = checkpoint?.batchSize ?? (averageWindowChars >= 28000 ? 2 : sampledSegments.length > 3 ? 3 : sampledSegments.length || 1);
  const totalBatches = checkpoint?.totalBatches ?? Math.max(1, Math.ceil(sampledSegments.length / batchSize));

  await options.onCheckpoint?.({
    sampledSegments,
    analyses,
    meta,
    batchSize,
    totalBatches,
  });

  const resumedBatchIndex = analyses.length > 0 ? Math.floor(analyses.length / batchSize) : 0;

  for (let batchIndex = resumedBatchIndex; batchIndex < totalBatches; batchIndex += 1) {
    ensureNotCancelled(options);
    const batchStart = batchIndex * batchSize;
    const batchSegments = sampledSegments.slice(batchStart, batchStart + batchSize);

    await options.onProgress?.({
      stage: 'chunk_analyzing',
      progressPercent: 20 + Math.round(((batchIndex + 1) / Math.max(totalBatches, 1)) * 55),
      message: `正在分析批次 ${batchIndex + 1}/${totalBatches}（样本 ${batchStart + 1}-${Math.min(sampledSegments.length, batchStart + batchSegments.length)}）`,
      totalSegments: meta.totalSegments,
      sampledSegments: meta.sampledSegments,
      finishedSegments: batchStart,
      estimatedWordCount: meta.estimatedWordCount,
    });
    const batchAnalyses = await analyzeSegmentBatch(
      env,
      request,
      batchSegments,
      batchIndex,
      totalBatches,
    );
    analyses.push(...batchAnalyses);
    await options.onCheckpoint?.({
      sampledSegments,
      analyses,
      meta,
      batchSize,
      totalBatches,
    });
  }
  ensureNotCancelled(options);

  await options.onProgress?.({
    stage: 'aggregating',
    progressPercent: 82,
    message: '正在聚合主模板',
    totalSegments: meta.totalSegments,
    sampledSegments: meta.sampledSegments,
    finishedSegments: sampledSegments.length,
    estimatedWordCount: meta.estimatedWordCount,
  });

  const aggregateRawText = await completeChatCompletion(
    env,
    buildRequest(
      request.sourceTitle,
      request.model,
      request.temperature,
      request.reasoningEffort,
      `${WRITING_RULES_MARKER}\n你现在处于拆书聚合模式，不需要写小说。你要把拆书结果抽象为可复用的写法模板，不输出剧情复刻，不保留专名依赖。`,
      buildAggregatePrompt(request, analyses, meta),
    ),
  );
  await options.onProgress?.({
    stage: 'aggregating',
    progressPercent: 91,
    message: '正在聚合子模板',
    totalSegments: meta.totalSegments,
    sampledSegments: meta.sampledSegments,
    finishedSegments: sampledSegments.length,
    estimatedWordCount: meta.estimatedWordCount,
  });
  const subTemplateRawText = await completeChatCompletion(
    env,
    buildRequest(
      request.sourceTitle,
      request.model,
      request.temperature,
      request.reasoningEffort,
      `${WRITING_RULES_MARKER}\n你现在处于拆书聚合模式，不需要写小说。你要把拆书结果抽象为四类可复用的子模板，不输出剧情复刻，不保留专名依赖。`,
      buildSubTemplatesPrompt(request, analyses, meta),
    ),
  );
  const template = normalizeTemplateDraft(
    parseJson<unknown>(aggregateRawText),
    parseJson<unknown>(subTemplateRawText),
    request,
    analyses,
    meta,
  );
  ensureNotCancelled(options);

  await options.onProgress?.({
    stage: 'completed',
    progressPercent: 100,
    message: '模板草稿已生成',
    totalSegments: meta.totalSegments,
    sampledSegments: meta.sampledSegments,
    finishedSegments: sampledSegments.length,
    estimatedWordCount: meta.estimatedWordCount,
  });

  return {
    template,
    meta,
  };
}
