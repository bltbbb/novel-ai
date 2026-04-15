import type { QuestionPool } from '@/types';

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function parseExpectedVolumeOrder(windowText: string) {
  const matched = windowText.match(/第\s*(\d+)\s*卷/u) ?? windowText.match(/(\d+)/u);

  if (!matched) {
    return null;
  }

  const parsed = Number(matched[1]);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(1, Math.trunc(parsed));
}

export function buildVolumeQuestionPoolBundle(input: {
  questionPools: QuestionPool[];
  volumeOrder: number;
}) {
  const matchedQuestions = input.questionPools
    .filter((item) => item.status !== 'answered')
    .map((item) => ({
      item,
      expectedVolumeOrder: parseExpectedVolumeOrder(item.expectedRevealWindow),
    }))
    .filter(({ item, expectedVolumeOrder }) => {
      if (expectedVolumeOrder !== null) {
        return expectedVolumeOrder <= input.volumeOrder;
      }

      return normalizeText(item.expectedRevealWindow).includes(normalizeText(`第${input.volumeOrder}卷`));
    })
    .sort((left, right) => {
      if ((left.expectedVolumeOrder ?? Number.MAX_SAFE_INTEGER) !== (right.expectedVolumeOrder ?? Number.MAX_SAFE_INTEGER)) {
        return (left.expectedVolumeOrder ?? Number.MAX_SAFE_INTEGER) - (right.expectedVolumeOrder ?? Number.MAX_SAFE_INTEGER);
      }

      return right.item.updatedAt.localeCompare(left.item.updatedAt);
    })
    .slice(0, 4);

  if (matchedQuestions.length === 0) {
    return '';
  }

  return [
    `【本卷未解问题推进】当前为第 ${input.volumeOrder} 卷，以下问题应优先推进：`,
    ...matchedQuestions.map(({ item }) => {
      const lines = [`- ${item.question}`];

      if (item.currentClue) {
        lines.push(`当前线索：${truncateText(item.currentClue, 120)}`);
      }

      if (item.expectedRevealWindow) {
        lines.push(`预计揭晓窗口：${truncateText(item.expectedRevealWindow, 80)}`);
      }

      if (item.finalAnswerSummary) {
        lines.push(`作者预设答案：${truncateText(item.finalAnswerSummary, 120)}`);
      }

      return lines.join('\n');
    }),
  ].join('\n\n');
}
