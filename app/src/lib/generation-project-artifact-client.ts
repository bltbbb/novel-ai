import { db } from '@/lib/db';
import { createChapterOutlineDraft } from '@/lib/chapter-outline';
import { richTextToPlainText } from '@/lib/editor-content';
import { buildGenerationEntitySnapshot } from '@/lib/generation-entity-snapshot';
import { buildGenerationForeshadowSnapshot } from '@/lib/generation-foreshadow-snapshot';
import { buildGenerationRelationSnapshot } from '@/lib/generation-relation-snapshot';
import { rebuildProjectGenerationArtifacts } from '@/lib/generation-debug-client';
import type {
  Chapter,
  ChapterOutline,
  ChapterOutlineDraft,
  GenerationProjectArtifactRebuildRequest,
} from '@/types';

function sortChapters(chapters: Chapter[]) {
  return [...chapters].sort((left, right) => {
    if (left.order === right.order) {
      if (left.createdAt === right.createdAt) {
        return left.id.localeCompare(right.id);
      }

      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.order - right.order;
  });
}

function normalizeOutlineDraft(outline: ChapterOutline | ChapterOutlineDraft): ChapterOutlineDraft {
  return createChapterOutlineDraft(outline);
}

export async function buildProjectArtifactRebuildRequest(
  projectId: string,
): Promise<GenerationProjectArtifactRebuildRequest> {
  const [
    rawChapters,
    outlines,
    summaries,
    stateChanges,
    queueItems,
    entities,
    entityRelations,
    foreshadows,
  ] = await Promise.all([
    db.chapters.where('projectId').equals(projectId).toArray(),
    db.chapterOutlines.where('projectId').equals(projectId).toArray(),
    db.chapterSummaries.where('projectId').equals(projectId).toArray(),
    db.stateChanges.where('projectId').equals(projectId).toArray(),
    db.generationQueue.where('projectId').equals(projectId).toArray(),
    db.entities.where('projectId').equals(projectId).toArray(),
    db.entityRelations.where('projectId').equals(projectId).toArray(),
    db.foreshadows.where('projectId').equals(projectId).toArray(),
  ]);

  const chapters = sortChapters(rawChapters);
  const outlineByChapterId = new Map(outlines.map((outline) => [outline.chapterId, outline] as const));
  const summaryByChapterId = new Map(summaries.map((summary) => [summary.chapterId, summary] as const));
  const stateChangesByChapterId = new Map<string, typeof stateChanges>();
  const queueByChapterId = new Map(queueItems.map((item) => [item.chapterId, item] as const));

  for (const change of stateChanges) {
    const items = stateChangesByChapterId.get(change.chapterId) ?? [];
    items.push(change);
    stateChangesByChapterId.set(change.chapterId, items);
  }

  return {
    projectId,
    chapters: chapters.map((chapter, index) => {
      const previousChapter = index > 0 ? chapters[index - 1] : null;
      const outline = outlineByChapterId.get(chapter.id);
      const summary = summaryByChapterId.get(chapter.id);
      const chapterStateChanges = stateChangesByChapterId.get(chapter.id) ?? [];
      const queueItem = queueByChapterId.get(chapter.id);

      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
        volumeTitle: chapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        content: richTextToPlainText(chapter.content).trim(),
        outline: outline ? normalizeOutlineDraft(outline) : queueItem?.outline ?? null,
        summary: summary
          ? {
              summary: summary.summary,
              hook: summary.hook,
              foreshadowings: [...summary.foreshadowings],
            }
          : queueItem?.summary ?? null,
        stateChanges: chapterStateChanges.map((change) => ({
          entityName: change.entityName,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
        strand: queueItem?.strand ?? outline?.strand ?? null,
        review: queueItem?.review ?? null,
        languageQa: queueItem?.languageQa ?? null,
      };
    }),
    entitySnapshot: buildGenerationEntitySnapshot(entities),
    relationSnapshot: buildGenerationRelationSnapshot(entityRelations),
    foreshadowSnapshot: buildGenerationForeshadowSnapshot(foreshadows, chapters),
  };
}

export async function rebuildProjectArtifactsFromLocalState(serverUrl: string, projectId: string) {
  const request = await buildProjectArtifactRebuildRequest(projectId);
  return rebuildProjectGenerationArtifacts(serverUrl, request);
}
