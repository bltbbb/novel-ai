import type { ChapterBeat, ProjectGateSeverity } from '../types';

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

export function detectScenePatterns(text: string) {
  const normalizedText = normalizeWhitespace(text);

  return SCENE_PATTERN_DEFINITIONS.filter((definition) => {
    if (definition.label === '长比喻连续堆叠') {
      return countOccurrences(normalizedText, '像') >= 3;
    }

    return definition.patterns.every((pattern) => pattern.test(normalizedText));
  }).map((definition) => definition.label);
}

export function buildAutomaticForbiddenZone(recentChapterTexts: string[]): AutomaticForbiddenZone {
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
