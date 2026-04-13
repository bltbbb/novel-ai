import { db } from '@/lib/db';
import { richTextToPlainText } from '@/lib/editor-content';
import { createId, createTimestamp } from '@/lib/identity';
import type {
  Chapter,
  ChapterOutline,
  ChapterOutlineDraft,
  ChapterSummary,
  ChapterSummaryDraft,
  GenerationQueueItem,
  GenerationQueueOutline,
  GenerationQueueProgressStage,
  GenerationQueueReview,
  GenerationQueueStateChange,
  GenerationQueueStatus,
  GenerationQueueSummary,
  Id,
  StateChange,
  StateChangeDraft,
  StrandTracker,
  StrandType,
} from '@/types';

function shouldUseQueueDraft(item?: GenerationQueueItem | null) {
  if (!item) {
    return false;
  }

  return item.status === 'ready' || item.status === 'approved';
}

export function getEffectiveChapterText(chapter: Chapter, queueItem?: GenerationQueueItem | null) {
  const queueText = queueItem?.generatedText?.trim() ?? '';

  if (queueText && shouldUseQueueDraft(queueItem) && (queueItem?.updatedAt ?? '') > chapter.updatedAt) {
    return queueText;
  }

  return richTextToPlainText(chapter.content).trim();
}

export function getEffectiveChapterSummary(
  summary: ChapterSummary | null | undefined,
  queueItem?: GenerationQueueItem | null,
) {
  const queueSummary = queueItem?.summary ?? null;

  if (
    queueSummary &&
    shouldUseQueueDraft(queueItem) &&
    (queueItem?.updatedAt ?? '') > (summary?.updatedAt ?? '')
  ) {
    return queueSummary;
  }

  if (!summary) {
    return null;
  }

  return {
    summary: summary.summary,
    hook: summary.hook,
    foreshadowings: summary.foreshadowings,
  };
}

export function loadGenerationQueueMap(projectId: Id) {
  return db.generationQueue.where('projectId').equals(projectId).toArray();
}

export async function saveChapterOutline(projectId: Id, chapterId: Id, draft: ChapterOutlineDraft) {
  const now = createTimestamp();
  const existing = await db.chapterOutlines.where('[projectId+chapterId]').equals([projectId, chapterId]).first();

  const outline: ChapterOutline = {
    id: existing?.id ?? createId(),
    projectId,
    chapterId,
    goal: draft.goal,
    obstacle: draft.obstacle,
    cost: draft.cost,
    beats: draft.beats,
    timeAnchor: draft.timeAnchor,
    chapterTimeSpan: draft.chapterTimeSpan,
    gapFromPrevious: draft.gapFromPrevious,
    strand: draft.strand,
    hookType: draft.hookType,
    hookStrength: draft.hookStrength,
    immutableFacts: draft.immutableFacts,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.chapterOutlines.put(outline);
  return outline;
}

export function loadChapterOutline(projectId: Id, chapterId: Id) {
  return db.chapterOutlines.where('[projectId+chapterId]').equals([projectId, chapterId]).first();
}

export async function saveChapterSummary(projectId: Id, chapterId: Id, draft: ChapterSummaryDraft) {
  const now = createTimestamp();
  const existing = await db.chapterSummaries.where('[projectId+chapterId]').equals([projectId, chapterId]).first();

  const summary: ChapterSummary = {
    id: existing?.id ?? createId(),
    projectId,
    chapterId,
    summary: draft.summary,
    hook: draft.hook,
    foreshadowings: draft.foreshadowings,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.chapterSummaries.put(summary);
  return summary;
}

export function loadChapterSummary(projectId: Id, chapterId: Id) {
  return db.chapterSummaries.where('[projectId+chapterId]').equals([projectId, chapterId]).first();
}

export function loadChapterStateChanges(chapterId: Id) {
  return db.stateChanges.where('chapterId').equals(chapterId).toArray();
}

export async function replaceChapterStateChanges(
  projectId: Id,
  chapterId: Id,
  drafts: StateChangeDraft[],
  entityIdMap?: Map<string, Id>,
) {
  await db.transaction('rw', [db.stateChanges], async () => {
    await db.stateChanges.where('chapterId').equals(chapterId).delete();

    const now = createTimestamp();
    const changes: StateChange[] = drafts.map((draft) => ({
      id: createId(),
      projectId,
      chapterId,
      entityId:
        entityIdMap?.get(draft.entityName) ??
        entityIdMap?.get(draft.entityName.trim()) ??
        entityIdMap?.get(draft.entityName.trim().toLowerCase()) ??
        null,
      entityName: draft.entityName,
      field: draft.field,
      oldValue: draft.oldValue,
      newValue: draft.newValue,
      createdAt: now,
      updatedAt: now,
    }));

    if (changes.length > 0) {
      await db.stateChanges.bulkAdd(changes);
    }
  });
}

export async function appendStrandHistory(projectId: Id, chapterId: Id, chapterTitle: string, strand: StrandType) {
  const now = createTimestamp();
  const tracker = await db.strandTrackers.get(projectId);

  const nextTracker: StrandTracker = {
    projectId,
    history: [
      ...(tracker?.history.filter((entry) => entry.chapterId !== chapterId) ?? []),
      {
        chapterId,
        chapterTitle,
        strand,
        createdAt: now,
      },
    ],
    lastQuestChapterId: strand === 'quest' ? chapterId : tracker?.lastQuestChapterId ?? null,
    lastFireChapterId: strand === 'fire' ? chapterId : tracker?.lastFireChapterId ?? null,
    lastConstellationChapterId:
      strand === 'constellation' ? chapterId : tracker?.lastConstellationChapterId ?? null,
    updatedAt: now,
  };

  await db.strandTrackers.put(nextTracker);
  return nextTracker;
}

export function loadStrandTracker(projectId: Id) {
  return db.strandTrackers.get(projectId);
}

interface SaveGenerationQueueInput {
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  status: GenerationQueueStatus;
  progressStage?: GenerationQueueProgressStage | null;
  progressLabel?: string;
  progressBeatIndex?: number | null;
  progressBeatCount?: number | null;
  generatedText?: string;
  outline?: GenerationQueueOutline | null;
  review?: GenerationQueueReview | null;
  languageQa?: GenerationQueueItem['languageQa'];
  summary?: GenerationQueueSummary | null;
  stateChanges?: GenerationQueueStateChange[];
  strand?: StrandType | null;
  errorMessage?: string;
}

export async function saveGenerationQueueItem(input: SaveGenerationQueueInput) {
  const now = createTimestamp();
  const existing = await db.generationQueue.where('[projectId+chapterId]').equals([input.projectId, input.chapterId]).first();

  const item: GenerationQueueItem = {
    id: existing?.id ?? createId(),
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    status: input.status,
    progressStage:
      input.status === 'running'
        ? (typeof input.progressStage === 'undefined'
            ? existing?.progressStage ?? null
            : input.progressStage)
        : null,
    progressLabel:
      input.status === 'running'
        ? (typeof input.progressLabel === 'undefined'
            ? existing?.progressLabel ?? ''
            : input.progressLabel)
        : '',
    progressBeatIndex:
      input.status === 'running'
        ? (typeof input.progressBeatIndex === 'undefined'
            ? existing?.progressBeatIndex ?? null
            : input.progressBeatIndex)
        : null,
    progressBeatCount:
      input.status === 'running'
        ? (typeof input.progressBeatCount === 'undefined'
            ? existing?.progressBeatCount ?? null
            : input.progressBeatCount)
        : null,
    generatedText: input.generatedText ?? existing?.generatedText ?? '',
    outline: typeof input.outline === 'undefined' ? existing?.outline ?? null : input.outline,
    review: typeof input.review === 'undefined' ? existing?.review ?? null : input.review,
    languageQa:
      typeof input.languageQa === 'undefined'
        ? existing?.languageQa ?? null
        : input.languageQa,
    summary: typeof input.summary === 'undefined' ? existing?.summary ?? null : input.summary,
    stateChanges: input.stateChanges ?? existing?.stateChanges ?? [],
    strand: typeof input.strand === 'undefined' ? existing?.strand ?? null : input.strand,
    errorMessage: input.errorMessage ?? existing?.errorMessage ?? '',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.generationQueue.put(item);
  return item;
}

export function loadGenerationQueue(projectId: Id) {
  return db.generationQueue.where('projectId').equals(projectId).sortBy('updatedAt');
}

export async function clearResolvedGenerationQueue(projectId: Id) {
  const items = await db.generationQueue.where('projectId').equals(projectId).toArray();
  const targetIds = items
    .filter((item) => item.status === 'approved' || item.status === 'discarded')
    .map((item) => item.id);

  if (targetIds.length > 0) {
    await db.generationQueue.bulkDelete(targetIds);
  }
}
