import { create } from 'zustand';
import { createParagraphDocument, countDocumentCharacters } from '@/lib/editor-content';
import { db, recalculateProjectWordCount, touchProject } from '@/lib/db';
import { rebuildProjectArtifactsFromLocalState } from '@/lib/generation-project-artifact-client';
import { createId, createTimestamp } from '@/lib/identity';
import { useProjectStore } from '@/stores/project-store';
import { useChapterBeatStore } from './chapter-beat-store';
import { useForeshadowStore } from './foreshadow-store';
import { useIdeaCardStore } from './idea-card-store';
import { useSettingsStore } from './settings-store';
import { useSnapshotStore } from './snapshot-store';
import type { Chapter, ChapterBeat, Foreshadow, Id, RichTextDocument, StrandTracker } from '@/types';

interface CreateChapterInput {
  projectId: Id;
  volumeId?: Id;
  title?: string;
  volumeTitle?: string;
}

interface EditorStoreState {
  chapters: Chapter[];
  activeChapterId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  isDirty: boolean;
  lastSavedAt: string | null;
  loadChapters: (projectId: Id) => Promise<void>;
  setActiveChapter: (chapterId: Id | null) => void;
  createChapter: (input: CreateChapterInput) => Promise<Chapter>;
  updateChapterTitle: (chapterId: Id, title: string) => Promise<void>;
  updateChapterStatus: (chapterId: Id, status: Chapter['status']) => Promise<void>;
  saveChapterContent: (chapterId: Id, content: RichTextDocument) => Promise<void>;
  deleteChapter: (chapterId: Id) => Promise<DeleteChapterResult>;
  markDirty: () => void;
  clearDirty: () => void;
}

export interface DeleteChapterResult {
  rebuildSucceeded: boolean;
  rebuildError?: string;
}

function sortChapters(chapters: Chapter[]) {
  return [...chapters].sort((a, b) => {
    if (a.order === b.order) {
      if (a.createdAt === b.createdAt) {
        return a.id.localeCompare(b.id);
      }

      return a.createdAt.localeCompare(b.createdAt);
    }

    return a.order - b.order;
  });
}

function normalizeChapterOrder(chapters: Chapter[]) {
  const sorted = sortChapters(chapters);
  let changed = false;

  const normalized = sorted.map((chapter, index) => {
    const nextOrder = index + 1;

    if (chapter.order === nextOrder) {
      return chapter;
    }

    changed = true;

    return {
      ...chapter,
      order: nextOrder,
    };
  });

  return {
    changed,
    chapters: normalized,
  };
}

function getChapterOrderInVolume(chapters: Chapter[], chapter: Chapter) {
  if (!chapter.volumeId) {
    return null;
  }

  const volumeChapters = sortChapters(
    chapters.filter((item) => item.volumeId === chapter.volumeId),
  );
  const index = volumeChapters.findIndex((item) => item.id === chapter.id);

  return index === -1 ? null : index + 1;
}

function normalizeForeshadowAfterChapterDeletion(foreshadow: Foreshadow, chapterId: Id) {
  const nextSourceChapterId = foreshadow.sourceChapterId === chapterId ? null : foreshadow.sourceChapterId;
  const resolvedCleared = foreshadow.resolvedChapterId === chapterId;
  const nextResolvedChapterId = resolvedCleared ? null : foreshadow.resolvedChapterId;
  let nextStatus = foreshadow.status;

  if (resolvedCleared && foreshadow.status === 'resolved') {
    nextStatus = nextSourceChapterId ? 'activated' : 'planted';
  }

  return {
    ...foreshadow,
    sourceChapterId: nextSourceChapterId,
    resolvedChapterId: nextResolvedChapterId,
    status: nextStatus,
  };
}

function rebuildStrandTrackerWithoutChapter(
  tracker: StrandTracker | undefined,
  chapterId: Id,
) {
  if (!tracker) {
    return null;
  }

  const nextHistory = tracker.history.filter((entry) => entry.chapterId !== chapterId);

  if (nextHistory.length === 0) {
    return null;
  }

  const lastQuestEntry = [...nextHistory].reverse().find((entry) => entry.strand === 'quest') ?? null;
  const lastFireEntry = [...nextHistory].reverse().find((entry) => entry.strand === 'fire') ?? null;
  const lastConstellationEntry = [...nextHistory].reverse().find((entry) => entry.strand === 'constellation') ?? null;

  return {
    ...tracker,
    history: nextHistory,
    lastQuestChapterId: lastQuestEntry?.chapterId ?? null,
    lastFireChapterId: lastFireEntry?.chapterId ?? null,
    lastConstellationChapterId: lastConstellationEntry?.chapterId ?? null,
    updatedAt: createTimestamp(),
  };
}

async function refreshDependentProjectStores(projectId: Id) {
  const tasks: Array<Promise<unknown>> = [];

  if (useSnapshotStore.getState().loadedProjectId === projectId) {
    tasks.push(useSnapshotStore.getState().loadSnapshots(projectId));
  }

  if (useForeshadowStore.getState().loadedProjectId === projectId) {
    tasks.push(useForeshadowStore.getState().loadForeshadows(projectId));
  }

  if (useIdeaCardStore.getState().loadedProjectId === projectId) {
    tasks.push(useIdeaCardStore.getState().loadIdeaCards(projectId));
  }

  if (useChapterBeatStore.getState().loadedProjectId === projectId) {
    tasks.push(useChapterBeatStore.getState().loadChapterBeats(projectId));
  }

  await Promise.all(tasks);
}

let createChapterLock = Promise.resolve();

function withCreateChapterLock<T>(task: () => Promise<T>) {
  const result = createChapterLock.then(task, task);
  createChapterLock = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  chapters: [],
  activeChapterId: null,
  loadedProjectId: null,
  isLoaded: false,
  isDirty: false,
  lastSavedAt: null,

  async loadChapters(projectId) {
    const rawChapters = await db.chapters.where('projectId').equals(projectId).toArray();
    const normalized = normalizeChapterOrder(rawChapters);
    const chapters = normalized.chapters;

    if (normalized.changed) {
      await db.chapters.bulkPut(chapters);
    }

    set((state) => ({
      chapters,
      loadedProjectId: projectId,
      activeChapterId:
        state.loadedProjectId === projectId && chapters.some((chapter) => chapter.id === state.activeChapterId)
          ? state.activeChapterId
          : chapters[0]?.id ?? null,
      isLoaded: true,
      isDirty: false,
    }));
  },

  setActiveChapter(chapterId) {
    set({ activeChapterId: chapterId });
  },

  async createChapter(input) {
    return withCreateChapterLock(async () => {
      const existingChapters =
        get().loadedProjectId === input.projectId
          ? get().chapters
          : await db.chapters.where('projectId').equals(input.projectId).toArray();
      const normalizedExisting = normalizeChapterOrder(existingChapters).chapters;
      const maxOrder = normalizedExisting.reduce((currentMax, chapter) => Math.max(currentMax, chapter.order), 0);
      const now = createTimestamp();
      const volume = input.volumeId ? await db.volumes.get(input.volumeId) : null;

      const chapter: Chapter = {
        id: createId(),
        projectId: input.projectId,
        volumeId: volume?.id ?? input.volumeId,
        volumeTitle: volume?.title ?? input.volumeTitle,
        title: input.title?.trim() || `第${maxOrder + 1}章`,
        order: maxOrder + 1,
        content: createParagraphDocument(),
        wordCount: 0,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };

      await db.chapters.put(chapter);
      await touchProject(input.projectId);
      await useProjectStore.getState().loadProjects();

      const nextChapters =
        get().loadedProjectId === input.projectId
          ? sortChapters([...get().chapters, chapter])
          : [chapter];

      set({
        chapters: nextChapters,
        activeChapterId: chapter.id,
        loadedProjectId: input.projectId,
        isLoaded: true,
        isDirty: false,
        lastSavedAt: now,
      });

      return chapter;
    });
  },

  async updateChapterTitle(chapterId, title) {
    const current = get().chapters.find((chapter) => chapter.id === chapterId) ?? (await db.chapters.get(chapterId));

    if (!current) {
      return;
    }

    const nextChapter: Chapter = {
      ...current,
      title: title.trim() || current.title,
      updatedAt: createTimestamp(),
    };

    await db.chapters.put(nextChapter);
    await touchProject(nextChapter.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      chapters: sortChapters(
        state.chapters.map((chapter) => (chapter.id === chapterId ? nextChapter : chapter)),
      ),
      lastSavedAt: nextChapter.updatedAt,
      isDirty: false,
    }));
  },

  async updateChapterStatus(chapterId, status) {
    const current = get().chapters.find((chapter) => chapter.id === chapterId) ?? (await db.chapters.get(chapterId));

    if (!current || current.status === status) {
      return;
    }

    const nextChapter: Chapter = {
      ...current,
      status,
      updatedAt: createTimestamp(),
    };

    await db.chapters.put(nextChapter);
    await touchProject(nextChapter.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      chapters: sortChapters(
        state.chapters.map((chapter) => (chapter.id === chapterId ? nextChapter : chapter)),
      ),
      lastSavedAt: nextChapter.updatedAt,
    }));
  },

  async saveChapterContent(chapterId, content) {
    const current = get().chapters.find((chapter) => chapter.id === chapterId) ?? (await db.chapters.get(chapterId));

    if (!current) {
      return;
    }

    const nextChapter: Chapter = {
      ...current,
      content,
      wordCount: countDocumentCharacters(content),
      updatedAt: createTimestamp(),
    };

    await db.chapters.put(nextChapter);
    await recalculateProjectWordCount(nextChapter.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      chapters: sortChapters(
        state.chapters.map((chapter) => (chapter.id === chapterId ? nextChapter : chapter)),
      ),
      lastSavedAt: nextChapter.updatedAt,
      isDirty: false,
    }));
  },

  async deleteChapter(chapterId) {
    const target = get().chapters.find((chapter) => chapter.id === chapterId) ?? (await db.chapters.get(chapterId));

    if (!target) {
      return {
        rebuildSucceeded: true,
      };
    }

    let nextChapters: Chapter[] = [];
    const deletedOrderInVolume = getChapterOrderInVolume(
      get().loadedProjectId === target.projectId
        ? get().chapters
        : await db.chapters.where('projectId').equals(target.projectId).toArray(),
      target,
    );
    const updatedAt = createTimestamp();

    await db.transaction(
      'rw',
      [
        db.chapters,
        db.snapshots,
        db.chapterOutlines,
        db.chapterSummaries,
        db.chapterBeats,
        db.stateChanges,
        db.generationQueue,
        db.foreshadows,
        db.ideaCards,
        db.strandTrackers,
      ],
      async () => {
        const projectChapters = await db.chapters.where('projectId').equals(target.projectId).toArray();
        const projectForeshadows = await db.foreshadows.where('projectId').equals(target.projectId).toArray();
        const projectIdeaCards = await db.ideaCards.where('projectId').equals(target.projectId).toArray();
        const tracker = await db.strandTrackers.get(target.projectId);
        const volumeBeats = target.volumeId
          ? await db.chapterBeats.where('volumeId').equals(target.volumeId).toArray()
          : ([] as ChapterBeat[]);

        await db.chapters.delete(chapterId);
        await db.snapshots.where('chapterId').equals(chapterId).delete();
        await db.chapterOutlines.where('chapterId').equals(chapterId).delete();
        await db.chapterSummaries.where('chapterId').equals(chapterId).delete();
        await db.chapterBeats.where('chapterId').equals(chapterId).delete();
        await db.stateChanges.where('chapterId').equals(chapterId).delete();
        await db.generationQueue.where('chapterId').equals(chapterId).delete();

        const normalizedRemaining = normalizeChapterOrder(
          projectChapters.filter((chapter) => chapter.id !== chapterId),
        );
        nextChapters = normalizedRemaining.chapters;

        if (normalizedRemaining.changed && nextChapters.length > 0) {
          await db.chapters.bulkPut(nextChapters);
        }

        if (target.volumeId && deletedOrderInVolume !== null) {
          const shiftedVolumeBeats = volumeBeats
            .filter((beat) => beat.chapterId !== chapterId && beat.orderInVolume > deletedOrderInVolume)
            .map((beat) => ({
              ...beat,
              orderInVolume: beat.orderInVolume - 1,
              updatedAt,
            }));

          if (shiftedVolumeBeats.length > 0) {
            await db.chapterBeats.bulkPut(shiftedVolumeBeats);
          }
        }

        const nextForeshadows = projectForeshadows
          .map((foreshadow) => normalizeForeshadowAfterChapterDeletion(foreshadow, chapterId))
          .filter((foreshadow, index) => {
            const current = projectForeshadows[index];
            return (
              foreshadow.sourceChapterId !== current.sourceChapterId ||
              foreshadow.resolvedChapterId !== current.resolvedChapterId ||
              foreshadow.status !== current.status
            );
          })
          .map((foreshadow) => ({
            ...foreshadow,
            updatedAt,
          }));

        if (nextForeshadows.length > 0) {
          await db.foreshadows.bulkPut(nextForeshadows);
        }

        const nextIdeaCards = projectIdeaCards
          .filter((ideaCard) => ideaCard.sourceChapterId === chapterId)
          .map((ideaCard) => ({
            ...ideaCard,
            sourceChapterId: null,
            updatedAt,
          }));

        if (nextIdeaCards.length > 0) {
          await db.ideaCards.bulkPut(nextIdeaCards);
        }

        const nextTracker = rebuildStrandTrackerWithoutChapter(tracker, chapterId);

        if (nextTracker) {
          await db.strandTrackers.put(nextTracker);
        } else if (tracker) {
          await db.strandTrackers.delete(target.projectId);
        }
      },
    );

    await recalculateProjectWordCount(target.projectId);
    await useProjectStore.getState().loadProjects();
    await refreshDependentProjectStores(target.projectId);

    set((state) => {
      const chapters = nextChapters;

      return {
        chapters,
        activeChapterId:
          state.activeChapterId === chapterId ? chapters[0]?.id ?? null : state.activeChapterId,
        isDirty: false,
      };
    });

    try {
      await rebuildProjectArtifactsFromLocalState(
        useSettingsStore.getState().settings.serverUrl,
        target.projectId,
      );

      return {
        rebuildSucceeded: true,
      };
    } catch (error) {
      return {
        rebuildSucceeded: false,
        rebuildError: error instanceof Error ? error.message : '未知错误',
      };
    }
  },

  markDirty() {
    set({ isDirty: true });
  },

  clearDirty() {
    set({ isDirty: false });
  },
}));
