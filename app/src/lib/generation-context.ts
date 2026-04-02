import { db } from '@/lib/db';
import { richTextToPlainText } from '@/lib/editor-content';
import { buildWorldStateSummary } from '@/lib/generation-utils';
import type { Chapter, Foreshadow, Id, LoreEntity } from '@/types';

interface GenerationContextBundleInput {
  projectId: Id;
  currentChapterId: Id;
  chapters: Chapter[];
  entities: LoreEntity[];
}

function formatChapterLabel(chapter: Chapter) {
  return `第${chapter.order}章 ${chapter.title}`;
}

function buildRecentChapterSection(chapters: Chapter[]) {
  if (chapters.length === 0) {
    return '';
  }

  const lines = chapters.map((chapter) => {
    const tail = richTextToPlainText(chapter.content).trim().slice(-600);
    return `- ${formatChapterLabel(chapter)}\n${tail || '暂无正文尾部'}`;
  });

  return ['最近 5 章原文尾部：', ...lines].join('\n\n');
}

function buildRecentSummarySection(
  chapters: Chapter[],
  summaryMap: Map<Id, { summary: string; hook: string }>,
) {
  const lines = chapters
    .map((chapter) => {
      const summary = summaryMap.get(chapter.id);

      if (!summary) {
        return '';
      }

      return `- ${formatChapterLabel(chapter)}\n摘要：${summary.summary}${summary.hook ? `\n钩子：${summary.hook}` : ''}`;
    })
    .filter(Boolean);

  if (lines.length === 0) {
    return '';
  }

  return ['最近 20 章摘要：', ...lines].join('\n\n');
}

function buildForeshadowSection(foreshadows: Foreshadow[], chapterTitleMap: Map<Id, string>) {
  if (foreshadows.length === 0) {
    return '';
  }

  const lines = foreshadows.map((foreshadow) => {
    const sourceChapter = foreshadow.sourceChapterId ? chapterTitleMap.get(foreshadow.sourceChapterId) ?? '未知章节' : '未关联章节';
    return `- ${foreshadow.title}\n状态：${foreshadow.status}\n来源：${sourceChapter}\n摘要：${foreshadow.excerpt || foreshadow.notes || '暂无说明'}`;
  });

  return ['激活伏笔：', ...lines].join('\n\n');
}

export async function buildGenerationContextBundle(input: GenerationContextBundleInput) {
  const sortedChapters = [...input.chapters].sort((left, right) => left.order - right.order);
  const currentIndex = sortedChapters.findIndex((chapter) => chapter.id === input.currentChapterId);
  const previousChapters =
    currentIndex >= 0 ? sortedChapters.slice(0, currentIndex) : sortedChapters;
  const recentChapters = previousChapters.slice(-5);
  const recentSummaryChapters = previousChapters.slice(-20);
  const summaryIds = new Set(recentSummaryChapters.map((chapter) => chapter.id));
  const [summaries, foreshadows] = await Promise.all([
    db.chapterSummaries.where('projectId').equals(input.projectId).toArray(),
    db.foreshadows.where('projectId').equals(input.projectId).toArray(),
  ]);
  const summaryMap = new Map(
    summaries
      .filter((summary) => summaryIds.has(summary.chapterId))
      .map((summary) => [
        summary.chapterId,
        {
          summary: summary.summary,
          hook: summary.hook,
        },
      ] as const),
  );
  const chapterTitleMap = new Map(sortedChapters.map((chapter) => [chapter.id, chapter.title] as const));
  const activeForeshadows = foreshadows
    .filter((foreshadow) => foreshadow.status === 'activated' || foreshadow.status === 'overdue')
    .slice(0, 8);
  const worldState = buildWorldStateSummary(input.entities);

  const sections = [
    worldState ? `当前世界状态快照：\n${worldState}` : '',
    buildRecentSummarySection(recentSummaryChapters, summaryMap),
    buildRecentChapterSection(recentChapters),
    buildForeshadowSection(activeForeshadows, chapterTitleMap),
  ].filter(Boolean);

  return {
    bundle: sections.join('\n\n'),
    recentChapterCount: recentChapters.length,
    recentSummaryCount: summaryMap.size,
    activeForeshadowCount: activeForeshadows.length,
  };
}
