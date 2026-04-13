interface LightStatsSegment {
  title: string;
  content: string;
}

const TRANSITION_KEYWORDS = [
  '然而',
  '但是',
  '不过',
  '与此同时',
  '随后',
  '紧接着',
  '下一刻',
  '很快',
  '忽然',
  '突然',
] as const;

function normalizeContent(content: string) {
  return content.trim();
}

function countKeyword(content: string, keyword: string) {
  const matches = normalizeContent(content).match(new RegExp(keyword, 'gu'));
  return matches?.length ?? 0;
}

function detectPerspective(content: string) {
  const normalized = normalizeContent(content);
  const firstPersonCount =
    countKeyword(normalized, '我') +
    countKeyword(normalized, '我们') +
    countKeyword(normalized, '自己');
  const thirdPersonCount =
    countKeyword(normalized, '他') +
    countKeyword(normalized, '她') +
    countKeyword(normalized, '他们') +
    countKeyword(normalized, '她们');

  if (firstPersonCount === 0 && thirdPersonCount === 0) {
    return '未识别';
  }

  return firstPersonCount >= thirdPersonCount ? '第一人称倾向' : '第三人称倾向';
}

function collectTopTransitionWords(content: string) {
  return TRANSITION_KEYWORDS
    .map((keyword) => ({
      keyword,
      count: countKeyword(content, keyword),
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
    .map((item) => `${item.keyword}(${item.count})`);
}

export function analyzeBookLightStats(content: string, segments: LightStatsSegment[]) {
  const normalized = normalizeContent(content);
  const paragraphs = normalized
    .split(/\n{2,}/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const paragraphCount = paragraphs.length;
  const totalParagraphChars = paragraphs.reduce((sum, paragraph) => sum + paragraph.replace(/\s+/gu, '').length, 0);
  const dialogueParagraphCount = paragraphs.filter((paragraph) => /[“”"「」『』]/u.test(paragraph)).length;

  return {
    paragraphCount,
    averageParagraphLength: paragraphCount > 0 ? Math.round(totalParagraphChars / paragraphCount) : 0,
    dialogueParagraphRatio:
      paragraphCount > 0
        ? Number((dialogueParagraphCount / paragraphCount).toFixed(3))
        : 0,
    headingSegmentCount: segments.filter((segment) => /^第/u.test(segment.title)).length,
    dominantPerspective: detectPerspective(normalized),
    topTransitionWords: collectTopTransitionWords(normalized),
  };
}

