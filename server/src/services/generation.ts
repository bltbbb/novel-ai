import { buildWritingRulesPrompt } from '../prompts/index.js';
import { completeChatCompletion } from './openai.js';
import { buildGenerationContextBundle } from './generation-context.js';
import { replaceGenerationForeshadows } from './generation-foreshadow-store.js';
import {
  detectResourceContinuityIssue,
  loadResourceStateRows,
} from './generation-resource-continuity.js';
import {
  buildItemStateCandidateBlock,
  detectItemContinuityIssue,
  inferItemRepairStateChanges,
} from './generation-item-continuity.js';
import { buildCurrentStateTableBlock, foldCurrentStateTable } from './generation-state-table.js';
import type {
  AIBookOutlineRequest,
  AIBookOutlineResponse,
  AIChatRequest,
  AIExtractRequest,
  AIExtractResponse,
  AILanguageQaRequest,
  AILanguageQaResponse,
  AIPolishRequest,
  AIPolishResponse,
  AIPlanRequest,
  AIPlanResponse,
  AIReviewRequest,
  AIReviewResponse,
  AIStyleRequest,
  AIStyleResponse,
  AIVolumeBeatsRequest,
  AIVolumeBeatsResponse,
  AIVolumeMilestonesRequest,
  AIVolumeMilestonesResponse,
  AIVolumeOutlineRequest,
  AIVolumeOutlineResponse,
  AIWriteRequest,
  AIWriteResponse,
  BookOutlineFields,
  ChapterLanguageQaDraft,
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
  VolumeMilestoneDraft,
  VolumeOutlineFields,
  VolumeBeatDraft,
  VolumeBeatChapterSlot,
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

function stripReasoningWrappers(text: string) {
  return text
    .replace(/^\uFEFF/u, '')
    .replace(/<think>[\s\S]*?<\/think>/giu, '')
    .trim();
}

function previewJsonParseFailure(text: string) {
  const normalized = stripReasoningWrappers(text).replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return '空文本';
  }

  return normalized.slice(0, 220);
}

function findBalancedJsonBlock(text: string, startIndex: number) {
  const openingChar = text[startIndex];

  if (openingChar !== '{' && openingChar !== '[') {
    return null;
  }

  const stack = [openingChar];
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
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

function extractFirstParsableJsonBlock(text: string) {
  for (const openingChar of ['{', '['] as const) {
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (char !== openingChar) {
        continue;
      }

      const candidate = findBalancedJsonBlock(text, index);
      if (!candidate) {
        continue;
      }

      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
  }

  return null;
}

function collectJsonCandidates(rawText: string) {
  const candidates = new Set<string>();

  function addCandidate(value: string | null | undefined) {
    if (typeof value !== 'string') {
      return;
    }

    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    candidates.add(normalized);
  }

  const normalizedText = stripReasoningWrappers(rawText);

  addCandidate(rawText);
  addCandidate(stripMarkdownCodeFence(rawText));
  addCandidate(normalizedText);
  addCandidate(stripMarkdownCodeFence(normalizedText));

  const codeFencePattern = /```(?:json)?\s*([\s\S]*?)```/giu;
  for (const sourceText of [rawText, normalizedText]) {
    for (const match of sourceText.matchAll(codeFencePattern)) {
      addCandidate(match[1]);
      addCandidate(stripMarkdownCodeFence(match[1] ?? ''));
    }
  }

  addCandidate(extractFirstParsableJsonBlock(normalizedText));

  return [...candidates];
}

function parseJson<T>(rawText: string): T {
  const candidates = collectJsonCandidates(rawText);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  throw new Error(`模型返回的 JSON 无法解析：${previewJsonParseFailure(rawText)}`);
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

function getReviewSeverityWeight(severity: ReviewSeverity) {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
    default:
      return 1;
  }
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

function sanitizePositiveInteger(value: unknown, fallback = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function normalizeVolumeMilestones(value: unknown): VolumeMilestoneDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const candidate = (item && typeof item === 'object' ? item : {}) as Partial<VolumeMilestoneDraft>;

      return {
        title: sanitizeString(candidate.title),
        targetChapterCount: sanitizePositiveInteger(candidate.targetChapterCount),
        phaseGoal: sanitizeString(candidate.phaseGoal),
        phaseConflict: sanitizeString(candidate.phaseConflict),
        entryState: sanitizeString(candidate.entryState),
        exitState: sanitizeString(candidate.exitState),
        keyTurns: sanitizeStringList(candidate.keyTurns).slice(0, 8),
        mustPlant: sanitizeStringList(candidate.mustPlant).slice(0, 8),
        mustPayoff: sanitizeStringList(candidate.mustPayoff).slice(0, 8),
        powerCeiling: sanitizeString(candidate.powerCeiling),
      };
    })
    .filter(
      (milestone) =>
        milestone.title ||
        milestone.phaseGoal ||
        milestone.phaseConflict ||
        milestone.entryState ||
        milestone.exitState ||
        milestone.keyTurns.length > 0 ||
        milestone.mustPlant.length > 0 ||
        milestone.mustPayoff.length > 0 ||
        milestone.powerCeiling ||
        milestone.targetChapterCount > 0,
    )
    .slice(0, 6);
}

function normalizeOutlineBeats(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }

      if (item && typeof item === 'object') {
        const candidate = item as { beat?: unknown; content?: unknown; title?: unknown; summary?: unknown };
        return [
          sanitizeString(candidate.beat),
          sanitizeString(candidate.content),
          sanitizeString(candidate.title),
          sanitizeString(candidate.summary),
        ].find(Boolean) ?? '';
      }

      return '';
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeOutline(raw: unknown): ChapterOutlineDraft {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<ChapterOutlineDraft>;

  return {
    goal: sanitizeString(candidate.goal, '推动当前章节主冲突'),
    obstacle: sanitizeString(candidate.obstacle, '外部阻力仍不明确'),
    cost: sanitizeString(candidate.cost, '需要付出时间或情绪代价'),
    beats: normalizeOutlineBeats(candidate.beats),
    timeAnchor: sanitizeString(candidate.timeAnchor, '未明确'),
    chapterTimeSpan: sanitizeString(candidate.chapterTimeSpan, '未明确'),
    gapFromPrevious: sanitizeString(candidate.gapFromPrevious, '紧接上一章'),
    strand: normalizeStrand(candidate.strand),
    hookType: sanitizeString(candidate.hookType, '悬念推进'),
    hookStrength: normalizeHookStrength(candidate.hookStrength),
    immutableFacts: sanitizeStringList(candidate.immutableFacts).slice(0, 8),
  };
}

function normalizeBookOutline(raw: unknown): BookOutlineFields {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<BookOutlineFields>;

  return {
    premise: sanitizeString(candidate.premise, '主角被卷入一场会改变整本书走向的危机。'),
    centralConflict: sanitizeString(candidate.centralConflict, '主角目标与世界阻力之间的长期对抗。'),
    protagonistArc: sanitizeString(candidate.protagonistArc, '主角将从被动应对成长为能够主动改写局势的人。'),
    thematicCore: sanitizeString(candidate.thematicCore, '代价、选择与成长。'),
    worldRules: sanitizeStringList(candidate.worldRules).slice(0, 8),
    endgameHint: sanitizeString(candidate.endgameHint, '最终会回到全书最初埋下的核心问题。'),
    toneGuide: sanitizeString(candidate.toneGuide, '保持故事感、冲突感与持续追读动力。'),
  };
}

function normalizeVolumeOutline(raw: unknown): VolumeOutlineFields {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<VolumeOutlineFields>;
  const milestones = normalizeVolumeMilestones(candidate.milestones);
  const milestoneChapterCount = milestones.reduce((sum, milestone) => sum + milestone.targetChapterCount, 0);

  return {
    goal: sanitizeString(candidate.goal, '推进当前阶段主目标。'),
    keyConflict: sanitizeString(candidate.keyConflict, '本卷核心矛盾仍待正面爆发。'),
    arcSummary: sanitizeString(candidate.arcSummary, '本卷将完成一段相对完整的阶段弧线。'),
    entryState: sanitizeString(candidate.entryState, '主角带着上卷遗留问题进入本卷。'),
    exitState: sanitizeString(candidate.exitState, '主角在付出代价后进入下一阶段。'),
    keyEvents: sanitizeStringList(candidate.keyEvents).slice(0, 8),
    foreshadowSeeds: sanitizeStringList(candidate.foreshadowSeeds).slice(0, 8),
    estimatedChapterCount: sanitizePositiveInteger(candidate.estimatedChapterCount, milestoneChapterCount),
    milestones,
  };
}

function normalizeVolumeBeatDraft(raw: unknown, slot: VolumeBeatChapterSlot): VolumeBeatDraft {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<VolumeBeatDraft>;
  const normalizedChapterTitle =
    sanitizeString(slot.chapterTitle) || sanitizeString(candidate.chapterTitle, `第${slot.chapterNumber}章`);

  return {
    chapterId: slot.chapterId,
    chapterTitle: normalizedChapterTitle,
    chapterNumber: slot.chapterNumber,
    titleHint: sanitizeString(candidate.titleHint),
    scenePurpose: sanitizeString(candidate.scenePurpose, `第${slot.chapterNumber}章需要承担新的场景功能。`),
    focusCharacter: sanitizeString(candidate.focusCharacter, '主角'),
    mainPlot: sanitizeString(candidate.mainPlot, '推进当前卷主线并制造新的局势变化。'),
    subPlot: sanitizeString(candidate.subPlot),
    pacing: sanitizeString(candidate.pacing, '中速推进'),
    hookOut: sanitizeString(candidate.hookOut, '本章结尾抛出新的行动压力。'),
    noveltyRequirement: sanitizeString(
      candidate.noveltyRequirement,
      '避免重复上一章的信息揭示方式、角色功能和场景模板。',
    ),
    powerDelta: sanitizeString(candidate.powerDelta),
    forbiddenPhrases: sanitizeStringList(candidate.forbiddenPhrases).slice(0, 8),
    forbiddenScenePatterns: sanitizeStringList(candidate.forbiddenScenePatterns).slice(0, 8),
    keyItems: sanitizeStringList(candidate.keyItems).slice(0, 8),
  };
}

function normalizeVolumeBeats(
  raw: unknown,
  chapterSlots: VolumeBeatChapterSlot[],
): AIVolumeBeatsResponse {
  const wrapped =
    raw && typeof raw === 'object' && Array.isArray((raw as { beats?: unknown }).beats)
      ? ((raw as { beats: unknown[] }).beats ?? [])
      : Array.isArray(raw)
        ? raw
        : [];

  return {
    beats: chapterSlots.map((slot, index) => normalizeVolumeBeatDraft(wrapped[index], slot)),
  };
}

function resolveVolumeBeatChapterSlots(request: AIVolumeBeatsRequest): VolumeBeatChapterSlot[] {
  if (Array.isArray(request.chapterSlots) && request.chapterSlots.length > 0) {
    return request.chapterSlots;
  }

  const startChapterNumber =
    typeof request.startChapterNumber === 'number' && Number.isFinite(request.startChapterNumber)
      ? Math.max(1, Math.trunc(request.startChapterNumber))
      : 1;
  const chapterCount =
    typeof request.endChapterNumber === 'number' &&
    Number.isFinite(request.endChapterNumber) &&
    request.endChapterNumber >= startChapterNumber
      ? Math.max(1, Math.trunc(request.endChapterNumber) - startChapterNumber + 1)
      :
    typeof request.chapterCount === 'number' && Number.isFinite(request.chapterCount)
      ? Math.max(1, Math.trunc(request.chapterCount))
      : 0;

  return Array.from({ length: chapterCount }, (_, index) => ({
    chapterNumber: startChapterNumber + index,
  }));
}

type VolumeBeatTemplateCategory =
  | 'secrecy'
  | 'probing'
  | 'practice'
  | 'family_rule'
  | 'pressure'
  | 'advancement'
  | 'conflict'
  | 'aftermath'
  | 'unknown';

interface VolumeBeatValidationResult {
  blockingIssues: string[];
  warningIssues: string[];
}

const LOW_MOMENTUM_TEMPLATE_CATEGORIES = new Set<VolumeBeatTemplateCategory>([
  'secrecy',
  'probing',
  'practice',
  'family_rule',
]);

const RESULT_SIGNAL_KEYWORDS = [
  '发现',
  '得知',
  '看见',
  '撞见',
  '确认',
  '立下',
  '定下',
  '拿到',
  '失去',
  '换来',
  '引动',
  '接引',
  '落稳',
  '成功',
  '突破',
  '踏入',
  '暴露',
  '逼出',
  '套出',
  '闯进',
  '闯入',
  '见血',
  '反杀',
  '夺得',
  '转移',
  '认主',
  '滴血',
  '苏醒',
  '开口',
  '传法',
  '起疑',
  '立规',
  '定规',
  '分层',
  '埋尸',
] as const;

const SOFT_PROGRESS_KEYWORDS = [
  '继续',
  '逐步',
  '慢慢',
  '试探',
  '观察',
  '确认',
  '摸话',
  '暂时',
  '先把',
  '先将',
  '瞒住',
  '压住',
  '守住',
  '半信半疑',
  '既怕又',
  '舍不得',
] as const;

const WEAK_HOOK_PATTERNS = [
  '危险还在后面',
  '事情还没完',
  '先别声张',
  '暂时按住',
  '没有退路',
  '只能先这样',
  '再试一次',
] as const;

const HARD_OPENING_BREAK_KEYWORDS = [
  '开口',
  '撞见',
  '闯入',
  '闯进',
  '逼问',
  '见血',
  '反杀',
  '认主',
  '滴血',
  '突破',
  '落稳',
  '夺得',
  '点亮',
  '响起',
] as const;

const RELATION_KEYWORDS = [
  '父亲',
  '爹',
  '兄',
  '弟',
  '姐',
  '妹',
  '叔',
  '伯',
  '婶',
  '姑',
  '姨',
  '同族',
  '族人',
  '邻居',
  '村人',
  '家主',
  '掌柜',
  '执事',
  '教头',
  '仆',
  '友',
  '伴',
  '师',
  '堂',
  '表',
  '族兄',
  '族叔',
  '家里',
  '自家',
] as const;

const COMMON_CHINESE_SURNAMES =
  '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫房裘缪解应宗丁宣邓郁单杭洪包诸左石崔吉龚程邢裴陆荣翁荀羊惠甄曲家封芮储靳汲松井段富巫焦巴弓牧山谷车侯全班仰仲伊宁仇栾暴甘厉戎刘詹龙叶司黎乔阴';

const NON_NAME_ENDING_CHARS = new Set([
  '家',
  '门',
  '院',
  '村',
  '县',
  '州',
  '河',
  '湖',
  '镜',
  '法',
  '气',
  '路',
  '章',
  '卷',
  '人',
  '户',
  '族',
  '房',
  '图',
  '夜',
  '月',
  '风',
  '雨',
  '雪',
  '火',
  '粮',
  '刀',
  '光',
  '声',
  '势',
  '局',
  '规',
  '缸',
  '堂',
  '屋',
  '口',
  '湾',
  '床',
]);

const OPENING_SCENE_SETTING_WORDS = [
  '天',
  '夜',
  '晨',
  '暮',
  '日',
  '月',
  '风',
  '雨',
  '雪',
  '雾',
  '灯',
  '火',
  '影',
  '光',
  '门',
  '窗',
  '屋',
  '院',
  '墙',
  '桌',
  '床',
  '地',
  '角',
  '水',
  '潮',
] as const;

const OPENING_LOW_ACTION_WORDS = [
  '守',
  '藏',
  '压',
  '贴',
  '缩',
  '靠',
  '停',
  '盯',
  '按',
  '听',
  '看',
  '等',
  '缓',
  '轻',
  '慢',
  '不敢',
  '只是',
  '仍旧',
  '像是',
  '仿佛',
  '一动不动',
  '放轻',
  '压低',
  '掀开',
  '合上',
  '扣紧',
  '贴住',
  '守着',
  '守在',
  '站在',
  '坐在',
  '倚在',
  '靠在',
  '门后',
  '窗下',
  '屋里',
  '院里',
  '缸边',
  '匣边',
] as const;

const MODALITY_VERB_GROUPS = {
  visual: ['看', '望', '见', '瞥', '盯', '扫', '窥', '映', '照'],
  auditory: ['听', '闻听'],
  tactile: ['摸', '碰', '按', '捏', '触', '贴'],
  smell: ['闻', '嗅'],
} as const;

const MODALITY_OBJECT_GROUPS = {
  visual: ['亮', '发亮', '发光', '透光', '光', '颜色', '影', '纹', '白', '红', '黑', '青', '月色'],
  auditory: ['声', '声响', '响动', '嗡鸣', '回声', '回响', '动静', '脚步', '咳', '喊', '叫'],
  tactile: ['冷', '热', '硬', '软', '麻', '痛', '湿', '震', '凉'],
  smell: ['香', '臭', '腥', '焦味', '气味', '味道'],
} as const;

const EXPLANATORY_THOUGHT_MARKERS = [
  '明白',
  '知道',
  '意识到',
  '懂得',
  '想起',
  '想明白',
  '终于',
  '这才',
  '原来',
  '意味着',
  '念头',
  '侥幸',
  '心里',
  '心头',
  '心下',
  '发紧',
  '一沉',
  '压了下去',
  '更清楚',
  '只剩一个念头',
  '忽然觉得',
  '忽然明白',
] as const;

const DIRECTIVE_DIALOGUE_MARKERS = [
  '不许',
  '别',
  '不能',
  '只准',
  '记住',
  '只说',
  '别碰',
  '别动',
  '别让',
  '不准',
  '先别',
  '都得',
] as const;

function normalizeComparableText(value: string) {
  return value.replace(/\s+/gu, '').replace(/[，。！？、；：,.!?;:\-]/gu, '');
}

function getFirstParagraph(text: string) {
  return text
    .split(/\n{2,}|\n/u)
    .map((part) => part.trim())
    .find(Boolean) ?? '';
}

function getParagraphs(text: string) {
  return text
    .split(/\n{2,}|\n/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function countCharacterHits(text: string, keywords: readonly string[]) {
  return keywords.reduce((count, keyword) => (text.includes(keyword) ? count + 1 : count), 0);
}

function includesAnyKeyword(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function countKeywordHits(text: string, keywords: readonly string[]) {
  return keywords.filter((keyword) => text.includes(keyword)).length;
}

function classifyVolumeBeatTemplate(beat: VolumeBeatDraft): VolumeBeatTemplateCategory {
  const text = `${beat.scenePurpose}\n${beat.mainPlot}\n${beat.subPlot}\n${beat.hookOut}`;

  if (includesAnyKeyword(text, ['闯入', '闯进', '逼问', '见血', '反杀', '夺得', '迎战', '动手'])) {
    return 'conflict';
  }

  if (includesAnyKeyword(text, ['埋尸', '善后', '处理尸身', '压住追查', '收拾残局'])) {
    return 'aftermath';
  }

  if (includesAnyKeyword(text, ['外患', '危机', '逼近', '追查', '证据', '撞见', '金光', '贪念'])) {
    return 'pressure';
  }

  if (includesAnyKeyword(text, ['成功', '落地', '突破', '踏入', '认主', '滴血', '苏醒', '开口', '传法', '起疑'])) {
    return 'advancement';
  }

  if (includesAnyKeyword(text, ['立规', '定规', '家族决策', '上交还是私藏', '争执', '决断', '封口', '轮流修炼'])) {
    return 'family_rule';
  }

  if (includesAnyKeyword(text, ['起疑', '窥探', '摸话', '试探', '盯上', '观察', '套话'])) {
    return 'probing';
  }

  if (includesAnyKeyword(text, ['试修', '吐纳', '接引', '试法', '调息', '引气', '功法', '修行', '符种', '胎息'])) {
    return 'practice';
  }

  if (includesAnyKeyword(text, ['私藏', '藏镜', '藏进', '藏物', '转移', '瞒住', '压住', '守住秘密', '不外传', '米缸', '暗格'])) {
    return 'secrecy';
  }

  return 'unknown';
}

function extractPotentialChineseNames(text: string) {
  const matches = text.match(new RegExp(`[${COMMON_CHINESE_SURNAMES}][\\u4e00-\\u9fff]{1,2}`, 'gu')) ?? [];

  return Array.from(
    new Set(
      matches.filter((name) => {
        const lastChar = name.charAt(name.length - 1);
        return !NON_NAME_ENDING_CHARS.has(lastChar);
      }),
    ),
  );
}

function hasIdentityContextNearName(text: string, name: string) {
  let searchIndex = text.indexOf(name);

  while (searchIndex !== -1) {
    const snippet = text.slice(Math.max(0, searchIndex - 8), Math.min(text.length, searchIndex + name.length + 10));

    if (RELATION_KEYWORDS.some((keyword) => snippet.includes(keyword))) {
      return true;
    }

    searchIndex = text.indexOf(name, searchIndex + name.length);
  }

  return false;
}

function collectKnownCharacterNames(...sources: Array<string | undefined>) {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (!source?.trim()) {
      continue;
    }

    for (const name of extractPotentialChineseNames(source)) {
      if (seen.has(name)) {
        continue;
      }

      seen.add(name);
      names.push(name);
    }
  }

  return names.slice(0, 16);
}

function buildKnownCharacterAnchorBlock(title: string, names: string[]) {
  if (names.length === 0) {
    return '';
  }

  return `${title}\n- ${names.join('、')}`;
}

function validateVolumeBeats(
  beats: VolumeBeatDraft[],
  chapterSlots: VolumeBeatChapterSlot[],
): VolumeBeatValidationResult {
  const blockingIssues: string[] = [];
  const warningIssues: string[] = [];
  const introducedNames = new Set<string>();

  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index];
    const chapterNumber = chapterSlots[index]?.chapterNumber ?? beat.chapterNumber ?? index + 1;
    const combinedText = `${beat.scenePurpose}\n${beat.mainPlot}\n${beat.subPlot}\n${beat.hookOut}\n${beat.noveltyRequirement}`;
    const normalizedMainPlot = normalizeComparableText(beat.mainPlot);
    const normalizedHookOut = normalizeComparableText(beat.hookOut);
    const currentCategory = classifyVolumeBeatTemplate(beat);
    const previousBeat = index > 0 ? beats[index - 1] : null;
    const previousCategory = previousBeat ? classifyVolumeBeatTemplate(previousBeat) : null;
    const progressSignalCount = countKeywordHits(
      `${beat.scenePurpose}\n${beat.mainPlot}\n${beat.hookOut}`,
      RESULT_SIGNAL_KEYWORDS,
    );

    if (!beat.scenePurpose.trim() || !beat.mainPlot.trim() || !beat.hookOut.trim() || !beat.noveltyRequirement.trim()) {
      blockingIssues.push(`第${chapterNumber}章字段不完整，至少缺少 scenePurpose / mainPlot / hookOut / noveltyRequirement 之一。`);
    }

    if (progressSignalCount === 0 && includesAnyKeyword(normalizedMainPlot, SOFT_PROGRESS_KEYWORDS)) {
      blockingIssues.push(`第${chapterNumber}章 mainPlot 偏软，仍停留在“继续试探/观察/压住消息”一类推进，缺少明确结果事件。`);
    }

    if (
      chapterNumber <= 15 &&
      progressSignalCount < 2 &&
      includesAnyKeyword(normalizeComparableText(combinedText), SOFT_PROGRESS_KEYWORDS)
    ) {
      blockingIssues.push(`第${chapterNumber}章处于开篇阶段，但可验证推进不足，容易写成铺垫打转。`);
    }

    if (
      (beat.hookOut.trim().length < 12 || includesAnyKeyword(normalizedHookOut, WEAK_HOOK_PATTERNS)) &&
      !includesAnyKeyword(normalizedHookOut, RESULT_SIGNAL_KEYWORDS)
    ) {
      blockingIssues.push(`第${chapterNumber}章 hookOut 偏虚，缺少具体下一步动作、风险或收益。`);
    }

    if (
      previousBeat &&
      previousCategory &&
      currentCategory === previousCategory &&
      LOW_MOMENTUM_TEMPLATE_CATEGORIES.has(currentCategory)
    ) {
      blockingIssues.push(
        `第${previousBeat.chapterNumber}章与第${chapterNumber}章连续落在同类低动量章法（${currentCategory}），容易写成重复的“藏/守/试/商量”。`,
      );
    }

    const chapterTitle = beat.chapterTitle?.trim() ?? '';

    if (!chapterTitle || /^第\s*\d+\s*章$/u.test(chapterTitle)) {
      warningIssues.push(`第${chapterNumber}章 chapterTitle 仍接近占位写法，建议换成更像目录标题的短标题。`);
    }

    const namesInBeat = extractPotentialChineseNames(combinedText);
    const newNames = namesInBeat.filter((name) => !introducedNames.has(name));

    if (index > 0) {
      for (const name of newNames) {
        if (!hasIdentityContextNearName(combinedText, name)) {
          blockingIssues.push(`第${chapterNumber}章首次引入人物“${name}”时，缺少身份、关系或当下意图的交代。`);
        }
      }
    }

    for (const name of namesInBeat) {
      introducedNames.add(name);
    }
  }

  return {
    blockingIssues: Array.from(new Set(blockingIssues)),
    warningIssues: Array.from(new Set(warningIssues)),
  };
}

function formatVolumeBeatValidationFeedback(result: VolumeBeatValidationResult) {
  return result.blockingIssues
    .slice(0, 8)
    .map((issue, index) => `${index + 1}. ${issue}`)
    .join('\n');
}

function detectGenericOpeningIssue(content: string): ReviewIssue | null {
  const firstParagraph = getFirstParagraph(content);

  if (!firstParagraph) {
    return null;
  }

  const normalizedOpening = normalizeComparableText(firstParagraph);
  const sceneSettingHits = countCharacterHits(firstParagraph, OPENING_SCENE_SETTING_WORDS);
  const lowActionHits = countKeywordHits(firstParagraph, OPENING_LOW_ACTION_WORDS);
  const hardBreakHits = countKeywordHits(normalizedOpening, HARD_OPENING_BREAK_KEYWORDS);
  const hasDialogue = firstParagraph.includes('“') || firstParagraph.includes('"');

  if (
    firstParagraph.length < 90 ||
    sceneSettingHits < 3 ||
    lowActionHits < 3 ||
    hardBreakHits > 0 ||
    hasDialogue
  ) {
    return null;
  }

  return {
    severity: 'medium',
    title: '开头模板化重复',
    description: '首段主要在铺陈环境、姿态与戒备状态，但缺少明确结果动作，容易和前文形成同构开场。',
    suggestion: '改成从当下动作、外部打断、对话冲突或直接结果切入，不要先用一整段夜景和守物状态铺陈。',
    evidence: firstParagraph.slice(0, 60),
  };
}

function detectSensoryMismatchIssues(content: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  const incompatiblePairs: Array<{
    verbGroup: keyof typeof MODALITY_VERB_GROUPS;
    objectGroup: keyof typeof MODALITY_OBJECT_GROUPS;
  }> = [
    { verbGroup: 'auditory', objectGroup: 'visual' },
    { verbGroup: 'visual', objectGroup: 'auditory' },
    { verbGroup: 'tactile', objectGroup: 'visual' },
  ];

  for (const pair of incompatiblePairs) {
    for (const verb of MODALITY_VERB_GROUPS[pair.verbGroup]) {
      for (const objectWord of MODALITY_OBJECT_GROUPS[pair.objectGroup]) {
        const pattern = new RegExp(`${verb}(?:了|到|见|一[眼下遍次回]?|了一[眼下遍次回]?)?[^，。！？\\n]{0,14}${objectWord}`, 'u');
        const matched = content.match(pattern);

        if (!matched) {
          continue;
        }

        issues.push({
          severity: 'high',
          title: '感官搭配错误',
          description: `把${pair.verbGroup === 'auditory' ? '听觉' : pair.verbGroup === 'visual' ? '视觉' : '触觉'}动作和${pair.objectGroup === 'visual' ? '视觉结果' : '听觉结果'}直接搭配，语义不通。`,
          suggestion:
            pair.objectGroup === 'visual'
              ? '若对象是发亮、透光、颜色、影纹等视觉结果，应改用“看见/望见”；若想保留“听”，就应改成出声、回响、动静。'
              : '若对象是声响、回响、脚步、动静等听觉结果，应改用“听见/听到”，不要写成“看见声响”。',
          evidence: matched[0],
        });
      }
    }
  }

  return Array.from(new Map(issues.map((issue) => [`${issue.title}::${issue.evidence}`, issue])).values());
}

function detectExplanatoryEchoIssue(content: string): ReviewIssue | null {
  const paragraphs = getParagraphs(content);

  if (paragraphs.length < 3) {
    return null;
  }

  let streakStart = -1;
  let streakLength = 0;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const thoughtHits = countKeywordHits(paragraph, EXPLANATORY_THOUGHT_MARKERS);
    const eventHits = countKeywordHits(paragraph, RESULT_SIGNAL_KEYWORDS) + countKeywordHits(paragraph, HARD_OPENING_BREAK_KEYWORDS);
    const hasDialogue = paragraph.includes('“') || paragraph.includes('"');

    if (paragraph.length >= 45 && thoughtHits >= 2 && eventHits === 0 && !hasDialogue) {
      if (streakStart === -1) {
        streakStart = index;
      }
      streakLength += 1;
      continue;
    }

    if (streakLength >= 2) {
      break;
    }

    streakStart = -1;
    streakLength = 0;
  }

  if (streakLength < 2 || streakStart === -1) {
    return null;
  }

  const evidence = paragraphs.slice(streakStart, streakStart + Math.min(streakLength, 2)).join(' / ').slice(0, 120);

  return {
    severity: 'medium',
    title: '解释性心理复述过量',
    description: '连续段落主要在重复解释人物心绪、判断和意义，却没有带来新的动作结果或局势变化。',
    suggestion: '一个结果说清后，下一段直接写连锁动作、代价或外部反应；心理活动最多补一层，不要连续两段都在解释“这意味着什么”。',
    evidence,
  };
}

function detectRepeatedDirectiveDialogueIssue(content: string): ReviewIssue | null {
  const quotePattern = /“([^”]{4,60})”/gu;
  const quotes: Array<{ text: string; index: number }> = [];
  let matched: RegExpExecArray | null = quotePattern.exec(content);

  while (matched) {
    quotes.push({
      text: matched[1],
      index: matched.index,
    });
    matched = quotePattern.exec(content);
  }

  if (quotes.length < 2) {
    return null;
  }

  for (let index = 0; index < quotes.length - 1; index += 1) {
    const current = quotes[index];
    const next = quotes[index + 1];

    if (next.index - current.index > 420) {
      continue;
    }

    const sharedMarkers = DIRECTIVE_DIALOGUE_MARKERS.filter(
      (marker) => current.text.includes(marker) && next.text.includes(marker),
    );

    if (sharedMarkers.length === 0) {
      continue;
    }

    return {
      severity: 'medium',
      title: '命令型对白重复',
      description: '短距离内连续两句对白在重复同一层命令、禁令或立场，容易让角色像在反复收束同一个结论。',
      suggestion: '同一角色把规矩或立场说清一次后，下一句就让动作、后果或分工接上，不要再换个说法复述同一层意思。',
      evidence: `“${current.text.slice(0, 28)}” / “${next.text.slice(0, 28)}”`,
    };
  }

  return null;
}

function detectCharacterAnchorDriftIssue(content: string, knownNames: string[]): ReviewIssue | null {
  if (knownNames.length < 2) {
    return null;
  }

  const contentNames = extractPotentialChineseNames(content);

  if (contentNames.length < 2) {
    return null;
  }

  const overlap = contentNames.filter((name) => knownNames.includes(name));

  if (overlap.length > 0) {
    return null;
  }

  return {
    severity: 'high',
    title: '人物名锚点漂移',
    description: '上下文已经给出一组明确人物名，但正文整段换成了另一组新名字，疑似无依据改名或临时造角。',
    suggestion: '优先复用上下文里已经出现的人物名；若必须新增人物，至少保留原有核心人物继续在场，并明确新人物身份与关系。',
    evidence: `正文出现：${contentNames.slice(0, 4).join('、')}；已知锚点：${knownNames.slice(0, 4).join('、')}`,
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

function getHighestIssueSeverity(issues: ReviewIssue[]): ReviewSeverity {
  return issues.reduce<ReviewSeverity>((highest, issue) => {
    return getReviewSeverityWeight(issue.severity) > getReviewSeverityWeight(highest)
      ? issue.severity
      : highest;
  }, 'low');
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

function normalizeLanguageQa(raw: unknown): ChapterLanguageQaDraft {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<ChapterLanguageQaDraft>;
  const issues = normalizeReviewIssues(candidate.issues);

  return {
    severity:
      candidate.severity === 'critical' ||
      candidate.severity === 'high' ||
      candidate.severity === 'medium' ||
      candidate.severity === 'low'
        ? candidate.severity
        : getHighestIssueSeverity(issues),
    summary: sanitizeString(candidate.summary, '未发现显著语言层问题，但仍建议人工通读。'),
    issues,
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

function formatSeedOutlineBlock(
  title: string,
  entries: Array<[string, string | string[] | undefined]>,
) {
  const lines = entries.flatMap(([label, value]) => {
    if (Array.isArray(value)) {
      const sanitized = value.map((item) => item.trim()).filter(Boolean);
      return sanitized.length > 0 ? [`- ${label}：${sanitized.join('；')}`] : [];
    }

    const sanitized = value?.trim();
    return sanitized ? [`- ${label}：${sanitized}`] : [];
  });

  if (lines.length === 0) {
    return '';
  }

  return [title, ...lines].join('\n');
}

function formatMilestoneSeedBlock(title: string, milestones: VolumeMilestoneDraft[] | undefined) {
  const sanitized = (milestones ?? []).filter(
    (milestone) =>
      milestone.title.trim() ||
      milestone.phaseGoal.trim() ||
      milestone.phaseConflict.trim() ||
      milestone.entryState.trim() ||
      milestone.exitState.trim() ||
      milestone.keyTurns.length > 0 ||
      milestone.mustPlant.length > 0 ||
      milestone.mustPayoff.length > 0 ||
      milestone.powerCeiling.trim() ||
      milestone.targetChapterCount > 0,
  );

  if (sanitized.length === 0) {
    return '';
  }

  return [
    title,
    ...sanitized.map((milestone, index) =>
      [
        `- 阶段${index + 1}：${milestone.title.trim() || `阶段${index + 1}`}`,
        milestone.targetChapterCount > 0 ? `  目标章数：${milestone.targetChapterCount}` : '',
        milestone.phaseGoal.trim() ? `  阶段目标：${milestone.phaseGoal.trim()}` : '',
        milestone.phaseConflict.trim() ? `  阶段冲突：${milestone.phaseConflict.trim()}` : '',
        milestone.entryState.trim() ? `  进入状态：${milestone.entryState.trim()}` : '',
        milestone.exitState.trim() ? `  结束状态：${milestone.exitState.trim()}` : '',
        milestone.powerCeiling.trim() ? `  能力上限：${milestone.powerCeiling.trim()}` : '',
        milestone.keyTurns.length > 0 ? `  关键转折：${milestone.keyTurns.join('；')}` : '',
        milestone.mustPlant.length > 0 ? `  必埋伏笔：${milestone.mustPlant.join('；')}` : '',
        milestone.mustPayoff.length > 0 ? `  必回收：${milestone.mustPayoff.join('；')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ].join('\n');
}

function extractToneGuideFromBookOutline(bookOutline?: string) {
  if (!bookOutline?.trim()) {
    return '';
  }

  const matchedLine = bookOutline
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^(整体基调|基调指引|toneGuide)\s*[:：]/i.test(line));

  return matchedLine ? matchedLine.replace(/^[^:：]+[:：]\s*/, '').trim() : '';
}

function buildBookOutlinePrompt(request: AIBookOutlineRequest) {
  const seedBlock = formatSeedOutlineBlock('已提供的种子信息：', [
    ['核心前提', request.seedOutline?.premise],
    ['主冲突', request.seedOutline?.centralConflict],
    ['主角弧线', request.seedOutline?.protagonistArc],
    ['主题内核', request.seedOutline?.thematicCore],
    ['世界规则', request.seedOutline?.worldRules],
    ['结局方向', request.seedOutline?.endgameHint],
    ['整体基调', request.seedOutline?.toneGuide],
  ]);
  const sections = [
    `项目标题：${request.projectTitle || '未命名项目'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.genre.length > 0 ? `题材标签：${request.genre.join(' / ')}` : '',
    seedBlock,
    request.hint?.trim() ? `补充灵感：${request.hint.trim()}` : '',
    '',
    '请输出严格 JSON，不要输出 Markdown，不要解释。',
    '字段要求：premise, centralConflict, protagonistArc, thematicCore, worldRules, endgameHint, toneGuide。',
    '- premise 用 1 到 2 句话概括全书核心前提',
    '- centralConflict 说明贯穿全书的主冲突',
    '- protagonistArc 说明主角成长弧线',
    '- thematicCore 说明主题内核',
    '- worldRules 为 3 到 6 条不可违反的世界规则',
    '- endgameHint 描述结局方向，但不要把结局写死',
    '- toneGuide 概括整体文风、节奏和情绪基调',
    '- 如果种子信息已给出，请保留其核心方向并补齐其余空白',
  ].filter(Boolean);

  return sections.join('\n');
}

function buildVolumeOutlinePrompt(request: AIVolumeOutlineRequest) {
  const seedBlock = formatSeedOutlineBlock('当前卷已提供的种子信息：', [
    ['本卷目标', request.seedOutline?.goal],
    ['核心冲突', request.seedOutline?.keyConflict],
    ['弧线概述', request.seedOutline?.arcSummary],
    ['卷初状态', request.seedOutline?.entryState],
    ['卷末状态', request.seedOutline?.exitState],
    ['预估总章数', request.seedOutline?.estimatedChapterCount ? String(request.seedOutline.estimatedChapterCount) : ''],
    ['关键事件', request.seedOutline?.keyEvents],
    ['伏笔安排', request.seedOutline?.foreshadowSeeds],
  ]);
  const milestoneSeedBlock = formatMilestoneSeedBlock('当前卷已提供的阶段里程碑：', request.seedOutline?.milestones);
  const sections = [
    `项目标题：${request.projectTitle || '未命名项目'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    `当前卷：第${request.volumeOrder}卷《${request.volumeTitle || '未命名卷'}》`,
    `全书大纲：\n${request.bookOutline}`,
    request.previousVolumeOutline ? `上一卷大纲：\n${request.previousVolumeOutline}` : '',
    request.volumeRecaps ? `已有卷级摘要池：\n${request.volumeRecaps}` : '',
    seedBlock,
    milestoneSeedBlock,
    request.hint?.trim() ? `补充灵感：${request.hint.trim()}` : '',
    '',
    '请输出严格 JSON，不要输出 Markdown，不要解释。',
    '字段要求：goal, keyConflict, arcSummary, entryState, exitState, estimatedChapterCount, keyEvents, foreshadowSeeds, milestones。',
    '- goal 概括本卷阶段目标',
    '- keyConflict 说明本卷最核心的对抗或矛盾',
    '- arcSummary 说明本卷完整弧线，强调开端、推进与收束',
    '- entryState / exitState 分别描述卷初与卷末的主角和局势状态',
    '- estimatedChapterCount 为本卷预估总章数，长卷建议给出一个明确范围中心值',
    '- keyEvents 为 4 到 8 个关键事件',
    '- foreshadowSeeds 为本卷要埋设或回收的伏笔',
    '- milestones 为 3 到 5 个阶段里程碑数组；每项字段包含 title, targetChapterCount, phaseGoal, phaseConflict, entryState, exitState, keyTurns, mustPlant, mustPayoff, powerCeiling',
    '- milestones 的 targetChapterCount 总和应尽量接近 estimatedChapterCount',
    '- 每个里程碑都要体现阶段目标、阶段冲突、进入/结束状态和阶段能力上限，便于后续做滚动规划',
    '- 如果种子信息已给出，请优先保留其方向并补齐空白',
  ].filter(Boolean);

  return sections.join('\n');
}

function buildVolumeMilestonesPrompt(request: AIVolumeMilestonesRequest) {
  const seedBlock = formatSeedOutlineBlock('当前卷已提供的卷纲信息：', [
    ['本卷目标', request.seedOutline?.goal],
    ['核心冲突', request.seedOutline?.keyConflict],
    ['弧线概述', request.seedOutline?.arcSummary],
    ['卷初状态', request.seedOutline?.entryState],
    ['卷末状态', request.seedOutline?.exitState],
    ['预估总章数', request.seedOutline?.estimatedChapterCount ? String(request.seedOutline.estimatedChapterCount) : ''],
    ['关键事件', request.seedOutline?.keyEvents],
    ['伏笔安排', request.seedOutline?.foreshadowSeeds],
  ]);
  const existingMilestoneBlock = formatMilestoneSeedBlock(
    '当前已手填的阶段里程碑（可参考、可补全）：',
    request.seedOutline?.milestones,
  );
  const sections = [
    `项目标题：${request.projectTitle || '未命名项目'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    `当前卷：第${request.volumeOrder}卷《${request.volumeTitle || '未命名卷'}》`,
    `全书大纲：\n${request.bookOutline}`,
    request.previousVolumeOutline ? `上一卷大纲：\n${request.previousVolumeOutline}` : '',
    request.volumeRecaps ? `已有卷级摘要池：\n${request.volumeRecaps}` : '',
    seedBlock,
    existingMilestoneBlock,
    request.hint?.trim() ? `补充灵感：${request.hint.trim()}` : '',
    '',
    '请仅补全当前卷的“预估总章数”和“阶段里程碑”，输出严格 JSON，不要输出 Markdown，不要解释。',
    '字段要求：estimatedChapterCount, milestones。',
    '- estimatedChapterCount 为本卷预估总章数，长卷请给出明确数字，例如 80、100、120',
    '- 如果当前卷种子信息里已经给出 estimatedChapterCount，且该数字与卷目标、关键事件、阶段范围并不矛盾，优先保留这个量级，不要因为前期开局要细拆就把整卷总章数大幅压短',
    '- 细拆里程碑的目标是提升阶段粒度，不是主动缩卷；除非卷纲本身明显过空或种子章数严重失衡，否则不要把 100 章量级直接压成 60 章量级',
    '- 若确实需要调整 estimatedChapterCount，也应以小幅校准为主；长卷一般控制在原设想上下浮动 10% 到 20%，不要无依据腰斩',
    '- milestones 为 3 到 5 个阶段里程碑数组',
    '- milestones 每项字段必须包含：title, targetChapterCount, phaseGoal, phaseConflict, entryState, exitState, keyTurns, mustPlant, mustPayoff, powerCeiling',
    '- milestones 的 targetChapterCount 总和应尽量接近 estimatedChapterCount',
    '- 即使是 100 章以上的长卷，开篇前 30 章也必须细拆，不要把“得宝、试探、立规矩、初入门”合并成一个过宽的大阶段',
    '- 开篇阶段的单个里程碑建议控制在 8 到 15 章；除非明确是中后期扩张、战争或大地图阶段，否则不要超过 18 章',
    '- 每个里程碑至少包含 2 到 3 个可验证的硬事件，不能只用“接触、试探、适应、建立信任、逐步推进”撑满整个阶段',
    '- keyTurns 必须写成可直接裂变为章节节点的结果型事件，优先使用“暴露、见血、突破、拜入、反杀、转移、结盟、失守、夺得、开启”等表达',
    '- 如果某阶段主要承担过渡功能，也必须写清该阶段结束前已经完成的软推进，以及下一阶段会被迫面对的外压',
    '- 开篇阶段必须尽早把外部压力抬进场，不能长期停留在家内试探、秘密磨合、规则说明和低风险试修',
    '- 中后段虽然允许比开篇更长，但仍必须按“事件簇”拆阶段：地盘整合、资源获取、妖物猎杀、宗门博弈、阵法落成、势力定势等通常不应全部塞进同一个阶段',
    '- 如果一个阶段同时承担了三类以上的大事件簇，必须继续拆分；不要为了把阶段数压在 3 到 5 个而强行把 30 章、50 章的大块内容糊成一个阶段',
    '- 除非明确是大地图远征、长期战争或卷末总收束，否则单个里程碑超过 24 章时，应优先判断为“过宽”并主动拆成两个阶段',
    '- 阶段边界优先跟着事件完成点走，而不是按总章数平均切分；同一阶段内必须围绕少数几个强关联事件簇组织，而不是把整卷剩余内容一次打包',
    '- 你只负责补这两部分，不要改写当前卷已有的 goal / keyConflict / arcSummary / entryState / exitState / keyEvents / foreshadowSeeds 文案',
    '- 如果用户已经手填了部分 milestones，请尽量保留其方向并补齐空白',
  ].filter(Boolean);

  return sections.join('\n');
}

function buildVolumeBeatsPrompt(
  request: AIVolumeBeatsRequest,
  options?: {
    validationFeedback?: string;
    attemptIndex?: number;
  },
) {
  const chapterSlots = resolveVolumeBeatChapterSlots(request);
  const knownCharacterNames = collectKnownCharacterNames(
    request.bookOutline,
    request.volumeOutline,
    request.currentMilestone,
    ...(request.historySummaries ?? []).flatMap((item) => [item.chapterTitle, item.summary]),
    request.hint,
  );
  const knownCharacterBlock = buildKnownCharacterAnchorBlock('已知人物锚点：', knownCharacterNames);
  const slotLines = chapterSlots.map((slot) =>
    `- 第${slot.chapterNumber}章${slot.chapterTitle?.trim() ? `《${slot.chapterTitle.trim()}》` : ''}`,
  );
  const hasPresetChapterTitles = chapterSlots.some((slot) => Boolean(slot.chapterTitle?.trim()));
  const hasMissingChapterTitles = chapterSlots.some((slot) => !slot.chapterTitle?.trim());
  const historyLines = (request.historySummaries ?? []).map((item) =>
    `- 第${item.chapterNumber}章《${item.chapterTitle}》 [${item.source}]：${item.summary}`,
  );
  const sections = [
    `项目标题：${request.projectTitle || '未命名项目'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    `当前卷：第${request.volumeOrder}卷《${request.volumeTitle || '未命名卷'}》`,
    `全书大纲：\n${request.bookOutline}`,
    `当前卷大纲：\n${request.volumeOutline}`,
    request.estimatedTotalChapters ? `当前卷预估总章数：${request.estimatedTotalChapters}` : '',
    typeof request.milestoneIndex === 'number' ? `当前目标里程碑：第 ${request.milestoneIndex + 1} 阶段` : '',
    request.currentMilestone?.trim() ? `当前里程碑说明：\n${request.currentMilestone.trim()}` : '',
    historyLines.length > 0 ? `已完成进度摘要：\n${historyLines.join('\n')}` : '',
    request.chapterCount && chapterSlots.length > 0 ? `目标章节数：${chapterSlots.length}` : '',
    typeof request.startChapterNumber === 'number' && typeof request.endChapterNumber === 'number'
      ? `本次裂变范围：第${request.startChapterNumber}章 ~ 第${request.endChapterNumber}章`
      : typeof request.startChapterNumber === 'number'
        ? `本次裂变起点：第${request.startChapterNumber}章`
        : '',
    slotLines.length > 0 ? `章节槽位：\n${slotLines.join('\n')}` : '',
    knownCharacterBlock,
    request.hint?.trim() ? `补充灵感：${request.hint.trim()}` : '',
    options?.validationFeedback?.trim()
      ? `上一轮裂变质检反馈：\n${options.validationFeedback.trim()}\n本轮必须优先修复以上问题，不得重复犯错。`
      : '',
    '',
    '请为当前卷裂变出一组章节拍表，输出严格 JSON，不要输出 Markdown，不要解释。',
    'JSON 顶层字段为 beats，必须是与章节槽位等长的数组，且顺序严格对应章节槽位。',
    '每个 beat 必须包含字段：chapterTitle, titleHint, scenePurpose, focusCharacter, mainPlot, subPlot, pacing, hookOut, noveltyRequirement, powerDelta, forbiddenPhrases, forbiddenScenePatterns, keyItems。',
    '约束要求：',
    hasPresetChapterTitles && !hasMissingChapterTitles
      ? '- 已提供的章节标题视为现成章节槽位，但你仍必须返回 chapterTitle：若认为现有标题已合适，可直接复用；若存在更贴合当前章节拍的短标题，也可返回新的推荐标题'
      : hasPresetChapterTitles && hasMissingChapterTitles
        ? '- 已提供正式标题的章节槽位也必须返回 chapterTitle；缺失标题或仅有占位标题的槽位，必须补出可直接使用的 chapterTitle'
        : '- 如果没有预置章节标题，你必须为每一章生成一个 chapterTitle，标题要可直接拿来建章，避免“第X章”这种占位写法',
    '- chapterTitle 必须是适合目录展示的短标题，优先控制在 4 到 12 个字，不要把一句完整剧情说明直接塞进标题',
    request.overwriteTitles
      ? '- 本次用户明确要求同步重写当前范围内的章节标题：chapterTitle 不得机械沿用旧标题，必须根据本轮章节拍重新给出更贴合的新短标题；除非旧标题与本轮 scenePurpose、mainPlot、hookOut 高度一致。'
      : '- 如果现有标题已经高度贴合本轮章节拍，可以复用，但仍需明确返回 chapterTitle。',
    knownCharacterNames.length > 0
      ? `- 已知人物锚点如下：${knownCharacterNames.join('、')}。若这些名字已经足够支撑当前章节功能，不得无故换名、改姓、拆成新角色或临时造出承担同一功能的人。`
      : '- 若上下文尚未给出人物名，可以谨慎引入必要人物，但必须同时交代身份、关系和进场意图。',
    '- 相邻两章的 scenePurpose 不得重复，避免出现同一种章法模板连续复用',
    '- 相邻两章的 focusCharacter 尽量轮换，避免角色功能过于固定',
    '- 每章都必须有明确 hookOut，能把读者推向下一章',
    '- 每章都必须写出 noveltyRequirement，明确这一章和上一章最大的不同点',
    '- powerDelta 不是可有可无的装饰字段，尤其动作章必须写清：主角本章能力变化幅度、敌方或环境限制条件、以及这是一次性爆发 / 短时增幅 / 稳定成长中的哪一种',
    '- 如果本章没有明显变强，也要在 powerDelta 写明“无新增成长，但暴露了什么限制 / 承受了什么伤势 / 哪个关键器具受损”',
    '- 如果当前卷大纲中已经给出阶段里程碑，章节拍必须优先贴合前序里程碑的阶段目标，不要为了追求热闹而提前透支后半卷的大事件',
    '- 如果当前里程碑中已经写出关键转折 keyTurns，必须把这些转折拆到具体章位上，不要全部堆到阶段最后一章才发生',
    '- 连续两章内至少一章要承担硬推进；过渡章允许没有爆点，但必须完成一次有效变化，例如关系位移、代价落地、风险抬升、资源变化或行动准备',
    '- 相邻两章不得同时使用“家内密议 / 夜间试修 / 藏物转移 / 守夜盘账 / 规则解释”这类同功能场景模板',
    '- 开篇前 15 章每章都要让读者能一句话说清“发生了什么事”，禁止连续多章都只是试探、确认、磨合和铺垫',
    '- 开篇前 15 章每章至少落实两项可验证推进：信息揭晓、关系位移、资源变化、风险升级、行动决策、局势变化、地位变化；禁止连续多章都只完成“先藏住、先守住、先试试、先商量”这类低动量动作',
    '- mainPlot 优先写结果型事件，不要只写“进一步接触、逐步适应、继续试探、持续观察、慢慢建立信任”',
    '- scenePurpose 不要只写主题或氛围，优先写成“本章要把什么结果推出来”，例如“把异宝从死物推进到可交流的器灵”“把窥探升级成近身威胁”',
    '- 每章的 hookOut 必须具体到下一步动作、风险、收益或证据，不能只写泛泛的“危险还在后面”“事情没有结束”',
    '- 若某章首次引入具名人物，必须在 scenePurpose 或 mainPlot 中同时交代其身份、与主角关系、当下意图，不能只抛姓名',
    '- 如果必须新增人物，优先写成有明确身份标签的一次性外部角色，不要用新名字替换已知核心人物原本承担的功能',
    '- 如果提供了已完成进度摘要，你必须把它视为既成事实；source=extract 的事实优先级高于 source=beat 的规划摘要',
    '- 如果提供了本次裂变范围，只能规划当前范围内的章节，不要提前把后续阶段的大事件、终局揭晓或关键身份反转写掉',
    '- 可以主动输出 forbiddenScenePatterns，帮助后续写作避开重复场景',
    '- forbiddenPhrases 与 forbiddenScenePatterns 用数组返回，没有内容时返回空数组',
    '- keyItems 填本章必须出现或必须推进的关键物件、线索或符号',
  ].filter(Boolean);

  return sections.join('\n');
}

function buildPlanPrompt(request: AIPlanRequest) {
  const knownCharacterNames = collectKnownCharacterNames(
    request.bookOutline,
    request.volumeOutline,
    request.volumeGoal,
    request.chapterBeat,
    request.nextChapterPreview,
    request.previousSummary,
    request.contextBundle,
  );
  const knownCharacterBlock = buildKnownCharacterAnchorBlock('已知人物锚点：', knownCharacterNames);
  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.bookOutline ? `【全书大纲】\n${request.bookOutline}` : '',
    request.volumeOutline ? `【当前卷大纲】\n${request.volumeOutline}` : '',
    request.volumeGoal ? `【当前卷目标】\n${request.volumeGoal}` : '',
    request.chapterBeat ? `【本章节拍】\n${request.chapterBeat}` : '',
    request.nextChapterPreview ? `【下章预告】\n${request.nextChapterPreview}` : '',
    request.forbiddenZone ? `【本章禁区】\n${request.forbiddenZone}` : '',
    request.previousSummary ? `上一章摘要：${request.previousSummary}` : '',
    request.worldState ? `当前世界状态：${request.worldState}` : '',
    request.contextBundle ? `补充上下文：\n${request.contextBundle}` : '',
    knownCharacterBlock,
    '',
    '请输出一个严格的章节 Context Contract，使用 JSON 对象，不要输出 Markdown。',
    '字段要求：goal, obstacle, cost, beats, timeAnchor, chapterTimeSpan, gapFromPrevious, strand, hookType, hookStrength, immutableFacts。',
    '其中：',
    '- goal / obstacle / cost 各控制在 20 字左右',
    '- beats 默认为 2 到 3 条；只有明确是复杂动作章、多方交锋章或高密度转换章时才允许写到 4 条',
    '- 避免把同一种观察、试探或确认拆成多个重复 beat',
    '- 若 beat 首次引入一个具名人物，该 beat 必须承担其身份、与主角关系、当下意图的落地，不能只抛名字',
    '- beats 必须服务于本章节拍中的场景功能、新意要求和章节钩子',
    '- 至少一条 beat 要对应可感知的有效变化，不能所有 beat 都停留在观察、试探、确认和收束',
    '- 一章内至少要落实两项可验证推进：信息揭晓、关系位移、资源变化、风险升级、行动决策、局势变化、地位变化，不能只在同一层情绪里打转',
    knownCharacterNames.length > 0
      ? `- 规划时优先复用已知人物锚点：${knownCharacterNames.join('、')}，不得无故改名或换一个新名字去承担原有人物功能`
      : '- 若必须新增人物，请在 beats 中安排其身份、关系和进场动机，不要只抛姓名',
    '- 如果本章是过渡章，可以没有硬爆点，但必须明确软推进已经完成了什么，以及下章行动是如何被推出去的',
    '- 若本章节拍给出了能力变化幅度，beats 必须安排其触发条件、限制兑现与代价，不能只写“突然变强”的结果',
    '- 若提供了下章预告，本章只负责把读者推向下章，不要提前写完下章的核心推进',
    '- 若提供了本章禁区，beats 中不得安排禁区里的重复场景模板或高频表达',
    '- 若上下文中出现“资源连续性”记录，beats 不得默认已见底、被扣或耗尽的物资依然可用',
    '- strand 只能是 quest / fire / constellation',
    '- hookStrength 只能是 soft / medium / strong',
    '- immutableFacts 为本章绝不能违背的事实列表',
  ].filter(Boolean);

  return sections.join('\n');
}

function buildExtractPrompt(request: AIExtractRequest) {
  const sections = [
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.chapterBeat ? `【本章节拍】\n${request.chapterBeat}` : '',
    request.currentStateTable?.trim() ? request.currentStateTable.trim() : '',
    request.loreSummary ? `当前设定摘要：${request.loreSummary}` : '',
    '',
    '请根据正文提取章节摘要、状态变更和主导 strand，输出 JSON，不要输出 Markdown。',
    'JSON 字段要求：summary, stateChanges, strand。',
    '- summary 为对象，包含 summary, hook, foreshadowings',
    '- stateChanges 为数组，每项包含 entityName, field, oldValue, newValue',
    '- 如果【本章节拍】或正文涉及能力变化、伤势变化、临时增幅、临时修复或限制条件暴露，必须显式写入 stateChanges',
    '- 如果关键物件出现损毁、折断、失灵、遗失、被夺、修复、重铸、找回、重新持有等变化，必须写入 stateChanges',
    '- 如果正文中出现盐、粮、药、钱、关键器具、关键物件等有限资源或可损毁对象的增减、耗尽、被扣押、丢失、损毁或补回，必须写入 stateChanges',
    '- 如果环境条件发生变化，例如入口开启/封闭、道路阻断、阵法失效、房屋焚毁，也应写入 stateChanges',
    '- 对有限资源，entityName 尽量写成“持有人/地点+资源名”，field 优先使用“存量”或“状态”',
    '- 对关键物件，entityName 保持物件原名，field 优先使用“状态 / 完整度 / 可用性 / 持有状态 / 去向”',
    '- 对能力一致性相关变化，field 优先使用“能力变化 / 战力状态 / 伤势 / 临时增幅 / 临时修复 / 限制条件”',
    '- 如果正文里只是一次性爆发或短时增幅，不要误写成永久提升；应在 newValue 里保留其时效和代价',
    '- 对敌方或环境暴露出的限制条件，也应写入 stateChanges，例如“芦湾灰影 / 限制条件 / 无 / 被破渔网缠身，转身受阻”',
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
  const knownCharacterNames = collectKnownCharacterNames(
    request.bookOutline,
    request.volumeOutline,
    request.volumeGoal,
    request.chapterBeat,
    request.nextChapterPreview,
    request.previousSummary,
    request.contextBundle,
    completedText,
  );
  const knownCharacterBlock = buildKnownCharacterAnchorBlock('已知人物锚点：', knownCharacterNames);
  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.bookOutline ? `【全书大纲】\n${request.bookOutline}` : '',
    request.volumeOutline ? `【当前卷大纲】\n${request.volumeOutline}` : '',
    request.volumeGoal ? `【当前卷目标】\n${request.volumeGoal}` : '',
    request.chapterBeat ? `【本章节拍】\n${request.chapterBeat}` : '',
    request.nextChapterPreview ? `【下章预告】\n${request.nextChapterPreview}` : '',
    request.forbiddenZone ? `【本章禁区】\n${request.forbiddenZone}` : '',
    request.currentStateTable?.trim() ? request.currentStateTable.trim() : '',
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
    knownCharacterBlock,
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
    '- 输出 2 到 4 段自然正文',
    '- 单次长度控制在约 800 到 1200 字；除非本 beat 明确是极短过桥段，否则不要写成 600 字上下的轻量碎片',
    '- 若本章共有 2 到 3 个 beats，整章累计字数通常应落在 2200 到 3200 字区间；宁可用新信息、新动作、新结果充实，也不要靠重复说明凑字数',
    '- 必须推进当前 beat，但不要一次写完所有后续 beats',
    '- 每个 beat 至少要落下一项硬结果或软结果，例如发现真相、逼出态度、拿到资源、失去筹码、关系偏移、危险坐实、行动条件改变，不能写完后局势与入场时几乎一样',
    '- 如果当前要写的是章节开头，不要默认用“夜色 / 月光 / 油灯 / 门闩 / 米缸 / 守着器物 / 压低呼吸”这类模板起笔；优先从动作、对话、外部打断或结果切入',
    '- 如果前文已经写过夜里守物、月下试法或缸边藏物，本章开头必须换一个入口，不得继续用同一套夜景与守物模板复写',
    knownCharacterNames.length > 0
      ? `- 已知人物锚点如下：${knownCharacterNames.join('、')}。正文优先复用这些名字，不得无故改名、换名、拆人或临时造出承担同一功能的新角色`
      : '- 若当前上下文尚无固定人物名，新增具名人物时必须同步交代身份、关系与当下意图',
    '- 同一角色在短距离内不要重复表达同一层命令、禁令、判断或立场；一句话说明后，下一句应推进动作、代价、分工或外部反应',
    '- 一个结果一旦已经落地，下一段直接写连锁变化，不要再用大段旁白或心理活动重复解释“这意味着什么”',
    '- 心理活动只负责给动作加一层压力或动机，不要连续两段都停在“他明白了 / 他知道了 / 他心里一沉 / 他终于意识到”这类解释性内心上',
    '- 如果【本章节拍】写了能力变化幅度，只能在这个幅度内推进；小幅进步不能写成突然碾压，短时爆发不能写成稳定常态',
    '- 如果【本章节拍】写了敌方或环境限制条件，正文必须让这些限制真实生效，不能写到一半就忘掉',
    '- 如果本章出现吐血、脱力、伤势加重、器具过载等代价，后文必须延续，不得同章内无解释归零',
    '- 每一段都必须有新的信息增量，禁止连续两段表达同一个判断或同一层情绪',
    '- 若首次引入具名人物，首次出现后的 1 到 2 句内必须交代其身份、与主角关系、当下意图或为何此刻会出现在场',
    '- 章节结尾必须把读者推向下一个更具体的问题、选择、风险或收益，不能只把前文担忧再说一遍',
    '- 严禁复用【本章禁区】中的高频词、动作模板、重复模板和旧章法',
    '- 尽量少用比喻、总结句、解释句，优先用具体动作、对话、环境反馈推进',
    '- 若【当前状态表】里某个关键物件已经损毁、失效、遗失或被夺，正文不得直接祭出、挥动、催动、取出或继续使用它；除非先交代修复、找回、重铸或重新取得的过程',
    '- 若上下文里写明盐、粮、药、钱、关键器具或关键物件已被扣、见底、耗尽、损毁、失效或丢失，正文不得直接继续使用；除非先交代补给、修复、找回或替代来源',
    '- 输出前自检：如果出现“像 / 低声 / 伸手 / 抬手 / 没立刻”这类禁区词，或出现摸黑试探、发现异物后立刻封口、父辈收束总结等模板，必须先改写再输出',
    '- 保持人物状态、设定边界、节奏与当前 strand 一致',
  ].filter(Boolean);

  return sections.join('\n');
}

function buildReviewPrompt(request: AIReviewRequest) {
  const knownCharacterNames = collectKnownCharacterNames(
    request.bookOutline,
    request.volumeOutline,
    request.chapterBeat,
    request.previousSummary,
    request.contextBundle,
  );
  const knownCharacterBlock = buildKnownCharacterAnchorBlock('已知人物锚点：', knownCharacterNames);
  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.bookOutline ? `【全书大纲】\n${request.bookOutline}` : '',
    request.volumeOutline ? `【当前卷大纲】\n${request.volumeOutline}` : '',
    request.chapterBeat ? `【本章节拍】\n${request.chapterBeat}` : '',
    request.currentStateTable?.trim() ? request.currentStateTable.trim() : '',
    request.previousSummary ? `上一章摘要：${request.previousSummary}` : '',
    request.worldState ? `当前世界状态：${request.worldState}` : '',
    request.contextBundle ? `补充上下文：\n${request.contextBundle}` : '',
    knownCharacterBlock,
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
    '1. consistency：设定冲突、时间回溯、能力越权、新实体矛盾、有限资源前后矛盾、关键物件前后矛盾',
    '2. continuity：场景衔接、上章钩子承接、人物行为是否突兀、章节功能是否与前章高度重复',
    '3. reader_pull：钩子强度、爽点密度、未闭合问题是否形成追读动力、本章是否真的往前推动了故事',
    '特别注意：如果【本章节拍】中的 powerDelta 只允许小幅提升，正文却写成跨级压制、无伤反杀或突然开挂，必须判为一致性问题。',
    '特别注意：如果同章内写的是一次性爆发、短时增幅或拼命换伤，后文却把它当成稳定常态持续使用，也必须判为一致性问题。',
    '特别注意：如果敌方或环境限制条件已经成立，例如负伤、被缠住、地形受限、器具失衡，后文却无解释失效，也必须判为一致性问题。',
    '特别注意：如果上文已写明盐、粮、药、银钱等资源被扣、见底、耗尽或丢失，本章又直接拿出来使用，必须判为一致性问题。',
    '特别注意：如果当前状态表里某个关键物件已经损毁、失效、遗失或被夺，本章又直接祭出、挥动、催动、取出或使用它，也必须判为一致性问题。',
    '特别注意：如果【本章候选状态更新】里写明某个关键物件已修复或暂时修复，且正文确实交代了修复过程、限制与代价，可以判定为“本章内状态更新成立”，不要机械沿用旧状态判冲突。',
    '特别注意：如果本章大量篇幅都停留在观察、试探、确认、磨合、收束，却没有形成局势变化、关系变化、信息揭晓、风险升级、资源变化或行动条件变化，reader_pull 至少判为 medium。',
    '特别注意：如果本章是过渡章，可以没有硬爆点，但必须完成软推进，例如关系位移、代价落地、风险显形、资源收紧、行动准备完成；若连软推进也没有，应判为 reader_pull 问题。',
    '特别注意：如果本章与前章高度复用同一种章节功能，例如连续两章都只是家内密议、夜间试修、藏物转移、守夜盘账、规则说明，应判为 continuity 问题。',
    '特别注意：如果首段主要只是铺陈环境、姿态、戒备状态和器物位置，却没有明确结果动作、外部打断或实质推进，应判为 continuity 或 reader_pull 问题。',
    '特别注意：如果同一角色在短距离内连续两句以上重复同一层命令、禁令、判断或立场，只是换个说法再讲一遍，应判为 continuity 或 reader_pull 问题。',
    '特别注意：如果一个结果已经明确成立，后续却连续用两段以上心理活动或旁白去反复解释其意义，而没有新的动作或局势变化，应判为 reader_pull 问题。',
    '特别注意：如果正文连续两段都主要由“他明白了 / 他知道了 / 他意识到 / 他心里一沉 / 他终于懂了”这类解释性心理活动组成，也应视为节奏空转。',
    knownCharacterNames.length > 0
      ? `特别注意：如果上下文已明确给出人物锚点 ${knownCharacterNames.join('、')}，正文却整段换成另一组新名字，或无故把原有人物改名、改姓、拆成功能重叠的新角色，应判为 consistency 或 continuity 问题。`
      : '',
    '特别注意：如果正文首次引入具名人物，却没有在首次出现后的 1 到 2 句内说明其身份、与主角关系、当下意图或为何在场，应判为 continuity 或 reader_pull 问题。',
    '特别注意：如果正文连续两段以上反复表达同一个判断、同一层情绪、同一条规矩或同一项担忧，即便措辞不同，也应判为 reader_pull 问题。',
    '特别注意：如果结尾只是把同一个问题再问一遍、只多出一个新名词、或只重复“危险还在后面”，没有形成新的行动压力、结果落点或外压升级，reader_pull 不得给高分。',
    '特别注意：如果本章新增了名词、设定或规则说明，却没有带来相应的事件推进或局势位移，也应视为节奏稀释。',
    '',
    '正文如下：',
    request.content,
  ].filter(Boolean);

  return sections.join('\n');
}

function buildLanguageQaPrompt(request: AILanguageQaRequest) {
  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    request.bookOutline ? `【全书大纲】\n${request.bookOutline}` : '',
    request.volumeOutline ? `【当前卷大纲】\n${request.volumeOutline}` : '',
    request.chapterBeat ? `【本章节拍】\n${request.chapterBeat}` : '',
    request.currentStateTable?.trim() ? request.currentStateTable.trim() : '',
    request.previousSummary ? `上一章摘要：${request.previousSummary}` : '',
    request.worldState ? `当前世界状态：${request.worldState}` : '',
    request.contextBundle ? `补充上下文：\n${request.contextBundle}` : '',
    request.outline
      ? [
          '章节契约：',
          `- 目标：${request.outline.goal}`,
          `- 阻力：${request.outline.obstacle}`,
          `- 代价：${request.outline.cost}`,
          `- Beats：${request.outline.beats.join(' | ')}`,
        ].join('\n')
      : '',
    '',
    '你是小说生成流水线中的独立语言校对检查器，只负责找语言层与局部逻辑层问题，不负责改文。',
    '请输出 JSON，不要输出 Markdown。',
    'JSON 字段要求：severity, summary, issues。',
    '- severity 只能是 critical / high / medium / low',
    '- issues 每项字段包含 severity, title, description, suggestion, evidence',
    '- issues 重点检查：错别字与误写、病句 / 残句 / 主语缺失、搭配不当 / 用词错误、局部逻辑矛盾、未铺垫专名突然出现、指代 / 称谓 / 局部关系错乱',
    '- 额外重点检查：感官搭配错误（例如把“听”用到“发亮”上）、语义冲突句、明显的口水句和僵硬搭配',
    '- 只报细粒度语言问题和局部幻觉，不要把整章节奏、爽点、钩子强度这类问题写进来',
    '- evidence 尽量引用最短的原句片段，便于定位',
    '- 如果没有明显问题，issues 返回空数组，summary 简短说明即可',
    '',
    '正文如下：',
    request.content,
  ].filter(Boolean);

  return sections.join('\n');
}

function buildStylePrompt(request: AIStyleRequest) {
  const toneGuide = extractToneGuideFromBookOutline(request.bookOutline);
  const sections = [
    `项目：${request.projectTitle || '未命名项目'}`,
    `章节标题：${request.chapterTitle || '未命名章节'}`,
    request.projectDescription ? `项目简介：${request.projectDescription}` : '',
    toneGuide ? `全书基调：${toneGuide}` : '',
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
  const languageQaBlock = request.languageQa
    ? [
        `语言校对级别：${request.languageQa.severity}`,
        `语言校对总结：${request.languageQa.summary}`,
        ...request.languageQa.issues.map((issue, index) =>
          [
            `语言问题 ${index + 1}：${issue.title}`,
            `说明：${issue.description}`,
            issue.suggestion ? `建议：${issue.suggestion}` : '',
            issue.evidence ? `证据：${issue.evidence}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ]
        .filter(Boolean)
        .join('\n\n')
    : '暂无明确语言校对问题，但仍需人工顺读一遍语句。';

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
    '2. 优先修复审查问题和语言校对问题，让表达更自然、更像网文作者手写，而不是模型流水句。',
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
    '语言校对反馈如下：',
    languageQaBlock,
    '',
    '原正文如下：',
    request.content,
  ].filter(Boolean);

  return sections.join('\n');
}

function buildOneShotRequest(
  env: ServerEnv,
  projectId: string,
  model: string,
  temperature: number,
  reasoningEffort: AIChatRequest['reasoningEffort'],
  userPrompt: string,
): AIChatRequest {
  return {
    projectId,
    model,
    temperature,
    reasoningEffort,
    systemPrompt: buildWritingRulesPrompt(env.promptConfig),
    messages: [
      {
        id: 'system-user',
        role: 'user',
        content: userPrompt,
      },
    ],
  };
}

function injectDeterministicReviewIssue(
  review: ChapterReviewDraft,
  checker: ReviewCheckerType,
  issue: ReviewIssue,
): ChapterReviewDraft {
  const nextCheckerResults = review.checkerResults.map((result) => {
    if (result.checker !== checker) {
      return result;
    }

    const nextIssues = [issue, ...result.issues].slice(0, 8);
    const nextSummary = result.summary.includes(issue.title)
      ? result.summary
      : `${result.summary}；额外检测到${issue.title}。`;

    return {
      ...result,
      score: Math.min(result.score, 35),
      summary: nextSummary,
      issues: nextIssues,
    };
  });
  const overallSeverity =
    getReviewSeverityWeight(issue.severity) > getReviewSeverityWeight(review.overallSeverity)
      ? issue.severity
      : review.overallSeverity;
  const nextSummary = review.summary.includes(issue.title)
    ? review.summary
    : `${review.summary}；${issue.title}`;

  return {
    ...review,
    summary: nextSummary,
    overallSeverity,
    needsRewrite: true,
    checkerResults: nextCheckerResults,
  };
}

function injectDeterministicLanguageIssues(
  languageQa: ChapterLanguageQaDraft,
  issues: ReviewIssue[],
): ChapterLanguageQaDraft {
  if (issues.length === 0) {
    return languageQa;
  }

  const existingKeys = new Set(languageQa.issues.map((issue) => `${issue.title}::${issue.evidence}`));
  const mergedIssues = [
    ...issues.filter((issue) => !existingKeys.has(`${issue.title}::${issue.evidence}`)),
    ...languageQa.issues,
  ].slice(0, 8);
  const severity = getHighestIssueSeverity(mergedIssues);
  const summary = languageQa.summary.includes('感官搭配')
    ? languageQa.summary
    : `${languageQa.summary}；额外检测到${issues[0]?.title || '语言问题'}。`;

  return {
    ...languageQa,
    severity,
    summary,
    issues: mergedIssues,
  };
}

export async function generateBookOutline(
  env: ServerEnv,
  request: AIBookOutlineRequest,
): Promise<AIBookOutlineResponse> {
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      env,
      'book-outline-generator',
      request.model,
      request.temperature,
      request.reasoningEffort,
      buildBookOutlinePrompt(request),
    ),
  );
  const parsed = parseJson<unknown>(rawText);

  return normalizeBookOutline(parsed);
}

export async function generateVolumeOutline(
  env: ServerEnv,
  request: AIVolumeOutlineRequest,
): Promise<AIVolumeOutlineResponse> {
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      env,
      'volume-outline-generator',
      request.model,
      request.temperature,
      request.reasoningEffort,
      buildVolumeOutlinePrompt(request),
    ),
  );
  const parsed = parseJson<unknown>(rawText);

  return normalizeVolumeOutline(parsed);
}

export async function generateVolumeMilestones(
  env: ServerEnv,
  request: AIVolumeMilestonesRequest,
): Promise<AIVolumeMilestonesResponse> {
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      env,
      'volume-milestones-generator',
      request.model,
      request.temperature,
      request.reasoningEffort,
      buildVolumeMilestonesPrompt(request),
    ),
  );
  const parsed = parseJson<unknown>(rawText);
  const normalized = normalizeVolumeOutline(parsed);

  return {
    estimatedChapterCount: normalized.estimatedChapterCount,
    milestones: normalized.milestones,
  };
}

export async function generateVolumeBeats(
  env: ServerEnv,
  request: AIVolumeBeatsRequest,
): Promise<AIVolumeBeatsResponse> {
  const chapterSlots = resolveVolumeBeatChapterSlots(request);
  const normalizedMilestoneIndex =
    typeof request.milestoneIndex === 'number' && Number.isFinite(request.milestoneIndex) && request.milestoneIndex >= 0
      ? Math.trunc(request.milestoneIndex)
      : undefined;
  const maxAttempts = 3;
  let validationFeedback = '';
  let bestResponse: AIVolumeBeatsResponse | null = null;
  let bestValidation: VolumeBeatValidationResult | null = null;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const rawText = await completeChatCompletion(
      env,
      buildOneShotRequest(
        env,
        'volume-beats-generator',
        request.model,
        request.temperature,
        request.reasoningEffort,
        buildVolumeBeatsPrompt(request, {
          validationFeedback,
          attemptIndex: attemptIndex + 1,
        }),
      ),
    );
    const parsed = parseJson<unknown>(rawText);
    const normalized = normalizeVolumeBeats(parsed, chapterSlots);
    const candidate: AIVolumeBeatsResponse = {
      beats: normalized.beats.map((beat) => ({
        ...beat,
        milestoneIndex: normalizedMilestoneIndex ?? beat.milestoneIndex,
      })),
    };
    const validation = validateVolumeBeats(candidate.beats, chapterSlots);

    if (
      !bestResponse ||
      !bestValidation ||
      validation.blockingIssues.length < bestValidation.blockingIssues.length ||
      (
        validation.blockingIssues.length === bestValidation.blockingIssues.length &&
        validation.warningIssues.length < bestValidation.warningIssues.length
      )
    ) {
      bestResponse = candidate;
      bestValidation = validation;
    }

    if (validation.blockingIssues.length === 0) {
      return candidate;
    }

    validationFeedback = formatVolumeBeatValidationFeedback(validation);
  }

  if (bestResponse) {
    return bestResponse;
  }

  throw new Error('章节拍裂变失败：未获得有效结果');
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
      env,
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      resolvedRequest.reasoningEffort,
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
  const resolvedRequest: AIExtractRequest = {
    ...request,
    currentStateTable: buildCurrentStateTableBlock(env, request.projectId, request.chapterOrder),
  };
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      env,
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      resolvedRequest.reasoningEffort,
      buildExtractPrompt(resolvedRequest),
    ),
  );
  const parsed = parseJson<{
    summary?: unknown;
    stateChanges?: unknown;
    strand?: unknown;
  }>(rawText);
  const currentStateEntries = foldCurrentStateTable(env, request.projectId, request.chapterOrder);
  const inferredRepairChanges = inferItemRepairStateChanges({
    content: request.content,
    stateEntries: currentStateEntries,
  });
  const normalizedStateChanges = normalizeStateChanges(parsed.stateChanges);
  const mergedStateChanges = [
    ...normalizedStateChanges,
    ...inferredRepairChanges.filter(
      (candidate) =>
        !normalizedStateChanges.some(
          (item) =>
            item.entityName === candidate.entityName &&
            item.field === candidate.field &&
            item.newValue === candidate.newValue,
        ),
    ),
  ];

  return {
    summary: normalizeSummary(parsed.summary),
    stateChanges: mergedStateChanges,
    strand: normalizeStrand(parsed.strand),
    rawText,
  };
}

export async function generateBeatDraft(env: ServerEnv, request: AIWriteRequest): Promise<AIWriteResponse> {
  const resolvedRequest: AIWriteRequest = {
    ...request,
    currentStateTable: buildCurrentStateTableBlock(env, request.projectId, request.chapterOrder, 10),
    contextBundle: await resolveRequestContextBundle(env, request),
  };
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      env,
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      resolvedRequest.reasoningEffort,
      buildWritePrompt(resolvedRequest),
    ),
  );

  return {
    content: stripMarkdownCodeFence(rawText),
    rawText,
  };
}

export async function reviewChapterDraft(env: ServerEnv, request: AIReviewRequest): Promise<AIReviewResponse> {
  const currentStateEntries = foldCurrentStateTable(env, request.projectId, request.chapterOrder);
  const knownCharacterNames = collectKnownCharacterNames(
    request.bookOutline,
    request.volumeOutline,
    request.chapterBeat,
    request.previousSummary,
    request.contextBundle,
  );
  const inferredRepairChanges = inferItemRepairStateChanges({
    content: request.content,
    stateEntries: currentStateEntries,
  });
  const candidateStateBlock = buildItemStateCandidateBlock(inferredRepairChanges);
  const resolvedRequest: AIReviewRequest = {
    ...request,
    currentStateTable: [
      buildCurrentStateTableBlock(env, request.projectId, request.chapterOrder),
      candidateStateBlock,
    ]
      .filter(Boolean)
      .join('\n'),
    contextBundle: await resolveRequestContextBundle(env, request),
  };
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      env,
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      resolvedRequest.reasoningEffort,
      buildReviewPrompt(resolvedRequest),
    ),
  );
  const parsed = parseJson<unknown>(rawText);
  const normalizedReview = normalizeReview(parsed);
  const resourceIssue = detectResourceContinuityIssue({
    content: resolvedRequest.content,
    chapterOrder: resolvedRequest.chapterOrder,
    resourceRows: loadResourceStateRows(env, resolvedRequest.projectId),
  });
  const itemIssue = detectItemContinuityIssue({
    content: resolvedRequest.content,
    stateEntries: currentStateEntries,
  });
  const openingTemplateIssue = detectGenericOpeningIssue(resolvedRequest.content);
  const explanatoryEchoIssue = detectExplanatoryEchoIssue(resolvedRequest.content);
  const repeatedDirectiveDialogueIssue = detectRepeatedDirectiveDialogueIssue(resolvedRequest.content);
  const characterAnchorDriftIssue = detectCharacterAnchorDriftIssue(
    resolvedRequest.content,
    knownCharacterNames,
  );
  const reviewWithResourceIssue = resourceIssue
    ? injectDeterministicReviewIssue(normalizedReview, 'consistency', resourceIssue)
    : normalizedReview;
  const reviewWithOpeningIssue = openingTemplateIssue
    ? injectDeterministicReviewIssue(reviewWithResourceIssue, 'continuity', openingTemplateIssue)
    : reviewWithResourceIssue;
  const reviewWithNameIssue = characterAnchorDriftIssue
    ? injectDeterministicReviewIssue(reviewWithOpeningIssue, 'consistency', characterAnchorDriftIssue)
    : reviewWithOpeningIssue;
  const reviewWithDialogueIssue = repeatedDirectiveDialogueIssue
    ? injectDeterministicReviewIssue(reviewWithNameIssue, 'continuity', repeatedDirectiveDialogueIssue)
    : reviewWithNameIssue;
  const reviewWithExplanationIssue = explanatoryEchoIssue
    ? injectDeterministicReviewIssue(reviewWithDialogueIssue, 'reader_pull', explanatoryEchoIssue)
    : reviewWithDialogueIssue;

  return {
    review: itemIssue
      ? injectDeterministicReviewIssue(reviewWithExplanationIssue, 'consistency', itemIssue)
      : reviewWithExplanationIssue,
    rawText,
  };
}

export async function checkChapterLanguageQa(
  env: ServerEnv,
  request: AILanguageQaRequest,
): Promise<AILanguageQaResponse> {
  const resolvedRequest: AILanguageQaRequest = {
    ...request,
    currentStateTable: buildCurrentStateTableBlock(env, request.projectId, request.chapterOrder),
    contextBundle: await resolveRequestContextBundle(env, request),
  };
  const rawText = await completeChatCompletion(
    env,
    buildOneShotRequest(
      env,
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      resolvedRequest.reasoningEffort,
      buildLanguageQaPrompt(resolvedRequest),
    ),
  );
  const parsed = parseJson<unknown>(rawText);
  const normalized = normalizeLanguageQa(parsed);
  const sensoryMismatchIssues = detectSensoryMismatchIssues(resolvedRequest.content);

  return {
    languageQa: injectDeterministicLanguageIssues(normalized, sensoryMismatchIssues),
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
      env,
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      resolvedRequest.reasoningEffort,
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
      env,
      resolvedRequest.projectId,
      resolvedRequest.model,
      resolvedRequest.temperature,
      resolvedRequest.reasoningEffort,
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
