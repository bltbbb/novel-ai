import { db } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import type {
  ChapterOutline,
  ChapterOutlineDraft,
  ChapterSummary,
  ChapterSummaryDraft,
  GenerationQueueItem,
  GenerationQueueOutline,
  GenerationQueueStateChange,
  GenerationQueueStatus,
  GenerationQueueSummary,
  Id,
  StateChange,
  StateChangeDraft,
  StrandTracker,
  StrandType,
} from '@/types';

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
  generatedText?: string;
  outline?: GenerationQueueOutline | null;
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
    generatedText: input.generatedText ?? existing?.generatedText ?? '',
    outline: input.outline ?? existing?.outline ?? null,
    summary: input.summary ?? existing?.summary ?? null,
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
