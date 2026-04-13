import { serializeBookOutline, serializeVolumeOutline } from '@/lib/outline-serializer';
import { getEffectiveChapterText, loadGenerationQueueMap } from '@/lib/generation-storage';
import { useChapterBeatStore, useOutlineStore } from '@/stores';
import type {
  Chapter,
  ChapterBeat,
  ChapterBeatFields,
  GenerationQueueItem,
  Id,
  ProjectGateSeverity,
  VolumeOutline,
} from '@/types';

const DEFAULT_HIGH_FREQUENCY_PHRASES = ['像', '低声', '没立刻', '掌心', '喉结', '寒意'] as const;

const DEFAULT_METAPHOR_TRIGGERS = ['像', '寒意', '掌心', '喉结'] as const;

const DEFAULT_ACTION_PATTERNS = ['低声', '伸手', '抬手', '握紧', '没立刻'] as const;

const SCENE_PATTERN_DEFINITIONS = [
  {
    label: '父亲总结段',
    patterns: [/父亲/u, /(只说|最后说|收束|总结)/u],
  },
  {
    label: '摸黑试探段',
    patterns: [/(摸黑|摸索|试探)/u],
  },
  {
    label: '发现异物后立刻封口',
    patterns: [/(异物|铁片|物件|残片)/u, /(藏起|收起|封口|没说|闭口)/u],
  },
  {
    label: '长比喻连续堆叠',
    patterns: [],
  },
] as const;

export interface AutomaticForbiddenZone {
  phrases: string[];
  actionPatterns: string[];
  scenePatterns: string[];
}

export interface ChapterPromptPayload {
  bookOutline?: string;
  volumeOutline?: string;
  volumeGoal?: string;
  chapterBeat?: string;
  nextChapterPreview?: string;
  forbiddenZone?: string;
  currentChapterBeat: ChapterBeat | null;
  nextChapterBeat: ChapterBeat | null;
  automaticForbiddenZone: AutomaticForbiddenZone;
}

export interface LocalRepetitionCheckerResult {
  severity: ProjectGateSeverity;
  repeatedPhrases: string[];
  metaphorTriggers: string[];
  repeatedActionPatterns: string[];
  repeatedScenePatterns: string[];
  repeatedChapterFunctions: string[];
  suggestions: string[];
}

function countOccurrences(text: string, target: string) {
  if (!text || !target) {
    return 0;
  }

  let count = 0;
  let fromIndex = 0;

  while (fromIndex < text.length) {
    const matchedIndex = text.indexOf(target, fromIndex);

    if (matchedIndex === -1) {
      break;
    }

    count += 1;
    fromIndex = matchedIndex + target.length;
  }

  return count;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value: string) {
  return normalizeWhitespace(value).replace(/[，。！？、；：,.!?;:\-]/g, '');
}

function serializeChapterBeat(beat: ChapterBeat | ChapterBeatFields) {
  return [
    beat.titleHint.trim() ? `标题提示：${beat.titleHint.trim()}` : '',
    beat.scenePurpose.trim() ? `场景功能：${beat.scenePurpose.trim()}` : '',
    beat.focusCharacter.trim() ? `焦点角色：${beat.focusCharacter.trim()}` : '',
    beat.mainPlot.trim() ? `主线推进：${beat.mainPlot.trim()}` : '',
    beat.subPlot.trim() ? `支线推进：${beat.subPlot.trim()}` : '',
    beat.pacing.trim() ? `节奏：${beat.pacing.trim()}` : '',
    beat.hookOut.trim() ? `章节钩子：${beat.hookOut.trim()}` : '',
    beat.noveltyRequirement.trim() ? `新意要求：${beat.noveltyRequirement.trim()}` : '',
    beat.powerDelta.trim() ? `能力变化幅度：${beat.powerDelta.trim()}` : '',
    beat.keyItems.length > 0 ? `关键物件：${beat.keyItems.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function serializeNextChapterPreview(beat: ChapterBeat) {
  return [
    beat.mainPlot.trim() ? `下章主推进：${beat.mainPlot.trim()}` : '',
    beat.hookOut.trim() ? `下章钩子：${beat.hookOut.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function detectScenePatterns(text: string) {
  const normalizedText = normalizeWhitespace(text);

  return SCENE_PATTERN_DEFINITIONS.filter((definition) => {
    if (definition.label === '长比喻连续堆叠') {
      return countOccurrences(normalizedText, '像') >= 3;
    }

    return definition.patterns.every((pattern) => pattern.test(normalizedText));
  }).map((definition) => definition.label);
}

function buildAutomaticForbiddenZone(recentChapterTexts: string[]): AutomaticForbiddenZone {
  if (recentChapterTexts.length === 0) {
    return {
      phrases: [],
      actionPatterns: [],
      scenePatterns: [],
    };
  }

  const recentCombinedText = recentChapterTexts.join('\n');
  const phrases = DEFAULT_HIGH_FREQUENCY_PHRASES.filter((phrase) => {
    const count = countOccurrences(recentCombinedText, phrase);
    return phrase.length === 1 ? count >= 6 : count >= 2;
  });
  const actionPatterns = DEFAULT_ACTION_PATTERNS.filter((phrase) => {
    const count = countOccurrences(recentCombinedText, phrase);
    return count >= 2;
  });
  const scenePatternCounts = new Map<string, number>();

  for (const text of recentChapterTexts) {
    for (const label of detectScenePatterns(text)) {
      scenePatternCounts.set(label, (scenePatternCounts.get(label) ?? 0) + 1);
    }
  }

  const scenePatterns = Array.from(scenePatternCounts.entries())
    .filter(([, count]) => count >= 1)
    .sort((left, right) => right[1] - left[1])
    .map(([label]) => label);

  return {
    phrases,
    actionPatterns,
    scenePatterns,
  };
}

function buildForbiddenZoneText(
  currentChapterBeat: ChapterBeat | null,
  automaticForbiddenZone: AutomaticForbiddenZone,
) {
  const manualPhrases = currentChapterBeat?.forbiddenPhrases ?? [];
  const manualScenePatterns = currentChapterBeat?.forbiddenScenePatterns ?? [];
  const sections = [
    manualPhrases.length > 0 ? `人工禁用短语：${manualPhrases.join('；')}` : '',
    manualScenePatterns.length > 0
      ? `人工禁用模板：${manualScenePatterns.join('；')}`
      : '',
    automaticForbiddenZone.phrases.length > 0
      ? `自动禁用高频词：${automaticForbiddenZone.phrases.join('；')}`
      : '',
    automaticForbiddenZone.actionPatterns.length > 0
      ? `自动禁用动作模板：${automaticForbiddenZone.actionPatterns.join('；')}`
      : '',
    automaticForbiddenZone.scenePatterns.length > 0
      ? `自动禁用场景模板：${automaticForbiddenZone.scenePatterns.join('；')}`
      : '',
  ].filter(Boolean);

  return sections.length > 0 ? sections.join('\n') : undefined;
}

function getVolumeGoal(volumeOutline?: VolumeOutline) {
  return volumeOutline?.goal.trim() || undefined;
}

function getRecentChapterTexts(
  chapters: Chapter[],
  currentChapter: Chapter,
  queueMap: Map<Id, GenerationQueueItem>,
  windowSize = 5,
) {
  return [...chapters]
    .filter((chapter) => chapter.projectId === currentChapter.projectId && chapter.order < currentChapter.order)
    .sort((left, right) => right.order - left.order)
    .slice(0, windowSize)
    .map((chapter) => getEffectiveChapterText(chapter, queueMap.get(chapter.id)))
    .filter(Boolean);
}

export async function buildChapterPromptPayload(
  projectId: Id,
  chapter: Chapter,
  chapters: Chapter[],
): Promise<ChapterPromptPayload> {
  const outlineStore = useOutlineStore.getState();
  const chapterBeatStore = useChapterBeatStore.getState();
  const [bookOutlineRecord, volumeOutlineRecord, currentChapterBeat] = await Promise.all([
    outlineStore.getBookOutline(projectId),
    chapter.volumeId ? outlineStore.getVolumeOutline(chapter.volumeId) : Promise.resolve(undefined),
    chapterBeatStore.getChapterBeatByChapterId(chapter.id),
  ]);
  const queueItems = await loadGenerationQueueMap(projectId);
  const queueMap = new Map(queueItems.map((item) => [item.chapterId, item] as const));

  const volumeChapterBeats =
    chapter.volumeId && currentChapterBeat
      ? await chapterBeatStore.getVolumeChapterBeats(chapter.volumeId)
      : [];
  const nextChapterBeat =
    currentChapterBeat && chapter.volumeId
      ? volumeChapterBeats.find((beat) => beat.orderInVolume === currentChapterBeat.orderInVolume + 1) ?? null
      : null;
  const automaticForbiddenZone = buildAutomaticForbiddenZone(getRecentChapterTexts(chapters, chapter, queueMap));

  return {
    bookOutline: bookOutlineRecord ? serializeBookOutline(bookOutlineRecord) : undefined,
    volumeOutline: volumeOutlineRecord ? serializeVolumeOutline(volumeOutlineRecord) : undefined,
    volumeGoal: getVolumeGoal(volumeOutlineRecord),
    chapterBeat: currentChapterBeat ? serializeChapterBeat(currentChapterBeat) : undefined,
    nextChapterPreview: nextChapterBeat ? serializeNextChapterPreview(nextChapterBeat) : undefined,
    forbiddenZone: buildForbiddenZoneText(currentChapterBeat ?? null, automaticForbiddenZone),
    currentChapterBeat: currentChapterBeat ?? null,
    nextChapterBeat,
    automaticForbiddenZone,
  };
}

export function runLocalRepetitionChecker(input: {
  currentText: string;
  currentChapterBeat: ChapterBeat | null;
  previousChapterBeats: ChapterBeat[];
  recentChapterTexts: string[];
}): LocalRepetitionCheckerResult {
  const normalizedCurrentText = normalizeWhitespace(input.currentText);
  const recentCombinedText = input.recentChapterTexts.join('\n');
  const repeatedPhrases = DEFAULT_HIGH_FREQUENCY_PHRASES.filter((phrase) => {
    const currentCount = countOccurrences(normalizedCurrentText, phrase);
    const recentCount = countOccurrences(recentCombinedText, phrase);

    if (phrase.length === 1) {
      return currentCount >= 2 && recentCount >= 6;
    }

    return currentCount >= 1 && recentCount >= 2;
  });
  const metaphorTriggers = DEFAULT_METAPHOR_TRIGGERS.filter((phrase) =>
    repeatedPhrases.includes(phrase),
  );
  const repeatedActionPatterns = DEFAULT_ACTION_PATTERNS.filter((phrase) => {
    const currentCount = countOccurrences(normalizedCurrentText, phrase);
    const recentCount = countOccurrences(recentCombinedText, phrase);
    return currentCount >= 1 && recentCount >= 2;
  });
  const currentScenePatterns = detectScenePatterns(normalizedCurrentText);
  const recentScenePatterns = new Set(
    input.recentChapterTexts.flatMap((text) => detectScenePatterns(text)),
  );
  const repeatedScenePatterns = currentScenePatterns.filter((label) => recentScenePatterns.has(label));
  const repeatedChapterFunctions: string[] = [];

  if (input.currentChapterBeat) {
    const currentScenePurpose = normalizeComparableText(input.currentChapterBeat.scenePurpose);
    const currentFocusCharacter = normalizeComparableText(input.currentChapterBeat.focusCharacter);

    for (const beat of input.previousChapterBeats.slice(-2)) {
      const previousScenePurpose = normalizeComparableText(beat.scenePurpose);
      const previousFocusCharacter = normalizeComparableText(beat.focusCharacter);

      if (currentScenePurpose && previousScenePurpose && currentScenePurpose === previousScenePurpose) {
        repeatedChapterFunctions.push(`场景功能与前章重复：${beat.scenePurpose}`);
      }

      if (
        currentScenePurpose &&
        previousScenePurpose &&
        currentScenePurpose &&
        previousScenePurpose &&
        (currentScenePurpose.includes(previousScenePurpose) || previousScenePurpose.includes(currentScenePurpose))
      ) {
        repeatedChapterFunctions.push(`场景功能高度近似：${beat.scenePurpose}`);
      }

      if (currentFocusCharacter && previousFocusCharacter && currentFocusCharacter === previousFocusCharacter) {
        repeatedChapterFunctions.push(`焦点角色连续重复：${beat.focusCharacter}`);
      }
    }
  }

  const uniqueRepeatedFunctions = Array.from(new Set(repeatedChapterFunctions));
  const suggestions = [
    repeatedPhrases.length > 0 ? '替换高频词，优先改掉明显 AI 腔触发词。' : '',
    repeatedScenePatterns.length > 0 ? '重写场景推进方式，避免沿用旧章法模板。' : '',
    repeatedActionPatterns.length > 0 ? '把动作写得更具体，避免人物反应继续模板化。' : '',
    uniqueRepeatedFunctions.length > 0 ? '调整本章功能分配或焦点角色，拉开与前章的差异。' : '',
    metaphorTriggers.length > 0 ? '减少连续比喻和体感词堆叠，让句子更直接。' : '',
  ].filter(Boolean);

  const severityScore =
    (uniqueRepeatedFunctions.length > 0 ? 2 : 0) +
    (repeatedScenePatterns.length > 0 ? 2 : 0) +
    (repeatedActionPatterns.length > 0 ? 1 : 0) +
    (repeatedPhrases.length > 0 ? 1 : 0) +
    (metaphorTriggers.length > 1 ? 1 : 0);
  const severity: ProjectGateSeverity =
    severityScore >= 4 ? 'high' : severityScore >= 2 ? 'medium' : 'low';

  return {
    severity,
    repeatedPhrases,
    metaphorTriggers,
    repeatedActionPatterns,
    repeatedScenePatterns,
    repeatedChapterFunctions: uniqueRepeatedFunctions,
    suggestions,
  };
}
