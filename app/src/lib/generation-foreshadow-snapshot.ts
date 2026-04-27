import type { Chapter, Foreshadow, GenerationForeshadowSnapshot } from '@/types';

export function buildGenerationForeshadowSnapshot(
  foreshadows: Foreshadow[],
  chapters: Chapter[],
): GenerationForeshadowSnapshot[] {
  const chapterTitleMap = new Map(chapters.map((chapter) => [chapter.id, chapter.title] as const));

  return foreshadows.map((foreshadow) => ({
    id: foreshadow.id,
    foreshadowId: foreshadow.foreshadowId ?? null,
    title: foreshadow.title,
    excerpt: foreshadow.excerpt,
    notes: foreshadow.notes,
    status: foreshadow.status,
    sourceChapterId: foreshadow.sourceChapterId,
    sourceChapterTitle: foreshadow.sourceChapterId ? chapterTitleMap.get(foreshadow.sourceChapterId) ?? '' : '',
    resolvedChapterId: foreshadow.resolvedChapterId,
    resolvedChapterTitle: foreshadow.resolvedChapterId ? chapterTitleMap.get(foreshadow.resolvedChapterId) ?? '' : '',
    updatedAt: foreshadow.updatedAt,
  }));
}
