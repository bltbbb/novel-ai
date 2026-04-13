import { db } from '@/lib/db';
import type { ChapterBeat, HistoryChapterSummary, Id, VolumeMilestoneDraft } from '@/types';

const MAX_EXTRACT_SUMMARY_LENGTH = 200;
const MAX_BEAT_SUMMARY_LENGTH = 140;
const MAX_EARLY_SUMMARY_LENGTH = 80;
const EARLY_COMPRESSION_THRESHOLD = 50;
const RECENT_HISTORY_WINDOW = 20;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function trimSummary(value: string, maxLength: number) {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function buildBeatSummary(beat: ChapterBeat | undefined) {
  if (!beat) {
    return '';
  }

  return trimSummary(
    [
      beat.scenePurpose.trim() ? `场景功能：${beat.scenePurpose.trim()}` : '',
      beat.mainPlot.trim() ? `主推进：${beat.mainPlot.trim()}` : '',
      beat.hookOut.trim() ? `章节钩子：${beat.hookOut.trim()}` : '',
    ]
      .filter(Boolean)
      .join('；'),
    MAX_BEAT_SUMMARY_LENGTH,
  );
}

export async function buildHistorySummaries(
  projectId: Id,
  volumeId: Id,
  upToChapterNumber: number,
): Promise<HistoryChapterSummary[]> {
  const normalizedLimit =
    typeof upToChapterNumber === 'number' && Number.isFinite(upToChapterNumber)
      ? Math.max(0, Math.trunc(upToChapterNumber))
      : 0;

  if (normalizedLimit <= 0) {
    return [];
  }

  const [chapters, chapterSummaries, chapterBeats] = await Promise.all([
    db.chapters.where('volumeId').equals(volumeId).toArray(),
    db.chapterSummaries.where('projectId').equals(projectId).toArray(),
    db.chapterBeats.where('volumeId').equals(volumeId).toArray(),
  ]);
  const orderedChapters = [...chapters]
    .sort((left, right) => left.order - right.order)
    .slice(0, normalizedLimit);
  const summaryByChapterId = new Map(
    chapterSummaries.map((summary) => [summary.chapterId, summary] as const),
  );
  const beatByChapterId = new Map(
    chapterBeats
      .filter((beat) => beat.chapterId)
      .map((beat) => [beat.chapterId as Id, beat] as const),
  );
  const beatByOrder = new Map(
    chapterBeats.map((beat) => [beat.orderInVolume, beat] as const),
  );

  const summaries = orderedChapters
    .map((chapter, index): HistoryChapterSummary | null => {
      const chapterNumber = index + 1;
      const storedSummary = summaryByChapterId.get(chapter.id);

      if (storedSummary?.summary.trim()) {
        return {
          chapterNumber,
          chapterTitle: chapter.title,
          summary: trimSummary(storedSummary.summary, MAX_EXTRACT_SUMMARY_LENGTH),
          source: 'extract',
        };
      }

      const beatSummary = buildBeatSummary(
        beatByChapterId.get(chapter.id) ?? beatByOrder.get(chapterNumber),
      );

      if (!beatSummary) {
        return null;
      }

      return {
        chapterNumber,
        chapterTitle: chapter.title,
        summary: beatSummary,
        source: 'beat',
      };
    })
    .filter((item): item is HistoryChapterSummary => item !== null);

  if (summaries.length <= EARLY_COMPRESSION_THRESHOLD) {
    return summaries;
  }

  const earlyItems = summaries.slice(0, Math.max(0, summaries.length - RECENT_HISTORY_WINDOW));
  const recentItems = summaries.slice(-RECENT_HISTORY_WINDOW);

  return [
    ...earlyItems.map((item) => ({
      ...item,
      summary: trimSummary(item.summary, MAX_EARLY_SUMMARY_LENGTH),
    })),
    ...recentItems,
  ];
}

export function computeMilestoneStartChapter(
  milestones: VolumeMilestoneDraft[],
  targetIndex: number,
) {
  const normalizedTargetIndex =
    typeof targetIndex === 'number' && Number.isFinite(targetIndex)
      ? Math.max(0, Math.trunc(targetIndex))
      : 0;

  if (normalizedTargetIndex <= 0) {
    return 1;
  }

  return milestones
    .slice(0, normalizedTargetIndex)
    .reduce((sum, milestone) => sum + Math.max(0, Math.trunc(milestone.targetChapterCount || 0)), 0) + 1;
}

export function computeMilestoneEndChapter(
  milestones: VolumeMilestoneDraft[],
  targetIndex: number,
) {
  const startChapter = computeMilestoneStartChapter(milestones, targetIndex);
  const targetMilestone = milestones[targetIndex];
  const chapterCount = Math.max(0, Math.trunc(targetMilestone?.targetChapterCount || 0));

  return chapterCount > 0 ? startChapter + chapterCount - 1 : startChapter - 1;
}
