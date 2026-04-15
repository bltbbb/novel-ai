import { create } from 'zustand';
import { db, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { useProjectStore } from '@/stores/project-store';
import type { ChapterBeat, ChapterBeatFields, Id } from '@/types';

interface SaveChapterBeatInput extends Partial<Omit<ChapterBeatFields, 'orderInVolume'>> {
  chapterId?: Id;
  orderInVolume: number;
}

interface ChapterBeatStoreState {
  chapterBeats: ChapterBeat[];
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadChapterBeats: (projectId: Id) => Promise<void>;
  saveChapterBeat: (projectId: Id, volumeId: Id, input: SaveChapterBeatInput) => Promise<ChapterBeat>;
  saveVolumeChapterBeats: (
    projectId: Id,
    volumeId: Id,
    inputs: SaveChapterBeatInput[],
  ) => Promise<ChapterBeat[]>;
  replaceVolumeChapterBeatsInRange: (
    projectId: Id,
    volumeId: Id,
    startOrderInVolume: number,
    endOrderInVolume: number,
    inputs: SaveChapterBeatInput[],
  ) => Promise<ChapterBeat[]>;
  replaceVolumeChapterBeatsByMilestone: (
    projectId: Id,
    volumeId: Id,
    milestoneIndex: number,
    inputs: SaveChapterBeatInput[],
  ) => Promise<ChapterBeat[]>;
  deleteChapterBeat: (beatId: Id) => Promise<void>;
  moveChapterBeat: (beatId: Id, direction: 'up' | 'down') => Promise<void>;
  getChapterBeatByChapterId: (chapterId: Id) => Promise<ChapterBeat | undefined>;
  getVolumeChapterBeats: (volumeId: Id) => Promise<ChapterBeat[]>;
}

function normalizeText(value?: string) {
  return value?.trim() ?? '';
}

function normalizeTextList(values?: string[]) {
  return Array.isArray(values) ? values.map((value) => value.trim()).filter(Boolean) : [];
}

function normalizeOrderInVolume(orderInVolume: number) {
  if (!Number.isFinite(orderInVolume)) {
    return 1;
  }

  return Math.max(1, Math.trunc(orderInVolume));
}

function normalizeMilestoneIndex(milestoneIndex?: number) {
  if (typeof milestoneIndex !== 'number' || !Number.isFinite(milestoneIndex) || milestoneIndex < 0) {
    return undefined;
  }

  return Math.trunc(milestoneIndex);
}

function normalizeChapterBeatInput(input: SaveChapterBeatInput): ChapterBeatFields {
  return {
    orderInVolume: normalizeOrderInVolume(input.orderInVolume),
    titleHint: normalizeText(input.titleHint),
    scenePurpose: normalizeText(input.scenePurpose),
    focusCharacter: normalizeText(input.focusCharacter),
    mustAppearCharacters: normalizeTextList(input.mustAppearCharacters),
    availableCharacters: normalizeTextList(input.availableCharacters),
    mainPlot: normalizeText(input.mainPlot),
    subPlot: normalizeText(input.subPlot),
    pacing: normalizeText(input.pacing),
    hookOut: normalizeText(input.hookOut),
    noveltyRequirement: normalizeText(input.noveltyRequirement),
    powerDelta: normalizeText(input.powerDelta),
    forbiddenPhrases: normalizeTextList(input.forbiddenPhrases),
    forbiddenScenePatterns: normalizeTextList(input.forbiddenScenePatterns),
    keyItems: normalizeTextList(input.keyItems),
    milestoneIndex: normalizeMilestoneIndex(input.milestoneIndex),
  };
}

function resolveMilestoneIndex(input: SaveChapterBeatInput, existing?: ChapterBeat) {
  return typeof input.milestoneIndex === 'number' && Number.isFinite(input.milestoneIndex) && input.milestoneIndex >= 0
    ? normalizeMilestoneIndex(input.milestoneIndex)
    : existing?.milestoneIndex;
}

function createChapterBeatRecord(
  projectId: Id,
  volumeId: Id,
  input: SaveChapterBeatInput,
  existing: ChapterBeat | undefined,
  now: string,
): ChapterBeat {
  const normalized = normalizeChapterBeatInput(input);

  return {
    id: existing?.id ?? createId(),
    projectId,
    volumeId,
    chapterId: input.chapterId ?? existing?.chapterId,
    ...normalized,
    mustAppearCharacters:
      Array.isArray(input.mustAppearCharacters)
        ? normalized.mustAppearCharacters
        : existing?.mustAppearCharacters ?? [],
    availableCharacters:
      Array.isArray(input.availableCharacters)
        ? normalized.availableCharacters
        : existing?.availableCharacters ?? [],
    milestoneIndex: resolveMilestoneIndex(input, existing),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function updateCachedChapterBeats(
  projectId: Id,
  removedBeatIds: Set<Id>,
  nextBeats: ChapterBeat[],
) {
  if (useChapterBeatStore.getState().loadedProjectId === projectId) {
    useChapterBeatStore.setState((state) => ({
      chapterBeats: sortChapterBeats([
        ...state.chapterBeats.filter((beat) => !removedBeatIds.has(beat.id)),
        ...nextBeats,
      ]),
    }));
    return;
  }

  useChapterBeatStore.setState({
    loadedProjectId: projectId,
    chapterBeats: sortChapterBeats(nextBeats),
    isLoaded: true,
  });
}

function sortChapterBeats(beats: ChapterBeat[]) {
  return [...beats].sort((left, right) => {
    if (left.volumeId === right.volumeId) {
      if (left.orderInVolume === right.orderInVolume) {
        return left.updatedAt.localeCompare(right.updatedAt);
      }

      return left.orderInVolume - right.orderInVolume;
    }

    return left.volumeId.localeCompare(right.volumeId);
  });
}

export const useChapterBeatStore = create<ChapterBeatStoreState>((set, get) => ({
  chapterBeats: [],
  loadedProjectId: null,
  isLoaded: false,

  async loadChapterBeats(projectId) {
    const chapterBeats = sortChapterBeats(
      await db.chapterBeats.where('projectId').equals(projectId).toArray(),
    );

    set({
      chapterBeats,
      loadedProjectId: projectId,
      isLoaded: true,
    });
  },

  async saveChapterBeat(projectId, volumeId, input) {
    const now = createTimestamp();
    const cachedBeats =
      get().loadedProjectId === projectId
        ? get().chapterBeats.filter((beat) => beat.projectId === projectId)
        : await db.chapterBeats.where('projectId').equals(projectId).toArray();
    const existing =
      (input.chapterId
        ? cachedBeats.find((beat) => beat.chapterId === input.chapterId)
        : undefined) ??
      cachedBeats.find(
        (beat) =>
          beat.volumeId === volumeId && beat.orderInVolume === normalizeOrderInVolume(input.orderInVolume),
      );
    const nextBeat = createChapterBeatRecord(projectId, volumeId, input, existing, now);

    await db.chapterBeats.put(nextBeat);
    await touchProject(projectId);
    await useProjectStore.getState().loadProjects();

    updateCachedChapterBeats(projectId, new Set([nextBeat.id]), [nextBeat]);

    return nextBeat;
  },

  async saveVolumeChapterBeats(projectId, volumeId, inputs) {
    const now = createTimestamp();
    const existingBeats = sortChapterBeats(await db.chapterBeats.where('volumeId').equals(volumeId).toArray());
    const existingByChapterId = new Map(
      existingBeats
        .filter((beat) => beat.chapterId)
        .map((beat) => [beat.chapterId as Id, beat] as const),
    );
    const existingByOrder = new Map(
      existingBeats.map((beat) => [beat.orderInVolume, beat] as const),
    );
    const nextBeats = inputs.map((input) => {
      const normalizedOrderInVolume = normalizeOrderInVolume(input.orderInVolume);
      const matched =
        (input.chapterId ? existingByChapterId.get(input.chapterId) : undefined) ??
        existingByOrder.get(normalizedOrderInVolume);

      return createChapterBeatRecord(projectId, volumeId, input, matched, now);
    });
    const nextIds = new Set(nextBeats.map((beat) => beat.id));
    const staleIds = existingBeats
      .filter((beat) => !nextIds.has(beat.id))
      .map((beat) => beat.id);

    await db.transaction('rw', db.chapterBeats, async () => {
      if (nextBeats.length > 0) {
        await db.chapterBeats.bulkPut(nextBeats);
      }

      if (staleIds.length > 0) {
        await db.chapterBeats.bulkDelete(staleIds);
      }
    });

    await touchProject(projectId);
    await useProjectStore.getState().loadProjects();
    updateCachedChapterBeats(projectId, new Set([...staleIds, ...nextBeats.map((beat) => beat.id)]), nextBeats);

    return nextBeats;
  },

  async replaceVolumeChapterBeatsInRange(projectId, volumeId, startOrderInVolume, endOrderInVolume, inputs) {
    const now = createTimestamp();
    const normalizedStart = normalizeOrderInVolume(Math.min(startOrderInVolume, endOrderInVolume));
    const normalizedEnd = normalizeOrderInVolume(Math.max(startOrderInVolume, endOrderInVolume));
    const existingBeats = sortChapterBeats(await db.chapterBeats.where('volumeId').equals(volumeId).toArray());
    const targetExistingBeats = existingBeats.filter(
      (beat) => beat.orderInVolume >= normalizedStart && beat.orderInVolume <= normalizedEnd,
    );
    const existingByChapterId = new Map(
      targetExistingBeats
        .filter((beat) => beat.chapterId)
        .map((beat) => [beat.chapterId as Id, beat] as const),
    );
    const existingByOrder = new Map(
      targetExistingBeats.map((beat) => [beat.orderInVolume, beat] as const),
    );
    const nextBeats = inputs.map((input) => {
      const normalizedOrderInVolume = normalizeOrderInVolume(input.orderInVolume);

      if (normalizedOrderInVolume < normalizedStart || normalizedOrderInVolume > normalizedEnd) {
        throw new Error(`章节拍顺序 ${normalizedOrderInVolume} 超出指定范围 ${normalizedStart}-${normalizedEnd}`);
      }

      const matched =
        (input.chapterId ? existingByChapterId.get(input.chapterId) : undefined) ??
        existingByOrder.get(normalizedOrderInVolume);

      return createChapterBeatRecord(projectId, volumeId, input, matched, now);
    });
    const nextIds = new Set(nextBeats.map((beat) => beat.id));
    const staleIds = targetExistingBeats
      .filter((beat) => !nextIds.has(beat.id))
      .map((beat) => beat.id);

    await db.transaction('rw', db.chapterBeats, async () => {
      if (nextBeats.length > 0) {
        await db.chapterBeats.bulkPut(nextBeats);
      }

      if (staleIds.length > 0) {
        await db.chapterBeats.bulkDelete(staleIds);
      }
    });

    await touchProject(projectId);
    await useProjectStore.getState().loadProjects();
    updateCachedChapterBeats(projectId, new Set([...staleIds, ...nextBeats.map((beat) => beat.id)]), nextBeats);

    return nextBeats;
  },

  async replaceVolumeChapterBeatsByMilestone(projectId, volumeId, milestoneIndex, inputs) {
    const now = createTimestamp();
    const normalizedMilestoneIndex = normalizeMilestoneIndex(milestoneIndex);

    if (typeof normalizedMilestoneIndex === 'undefined') {
      throw new Error('milestoneIndex 不合法');
    }

    const existingBeats = sortChapterBeats(await db.chapterBeats.where('volumeId').equals(volumeId).toArray());
    const targetExistingBeats = existingBeats.filter(
      (beat) => beat.milestoneIndex === normalizedMilestoneIndex,
    );
    const existingByChapterId = new Map(
      targetExistingBeats
        .filter((beat) => beat.chapterId)
        .map((beat) => [beat.chapterId as Id, beat] as const),
    );
    const existingByOrder = new Map(
      targetExistingBeats.map((beat) => [beat.orderInVolume, beat] as const),
    );
    const nextBeats = inputs.map((input) => {
      const normalizedInput: SaveChapterBeatInput = {
        ...input,
        milestoneIndex: normalizedMilestoneIndex,
      };
      const normalizedOrderInVolume = normalizeOrderInVolume(normalizedInput.orderInVolume);
      const matched =
        (normalizedInput.chapterId ? existingByChapterId.get(normalizedInput.chapterId) : undefined) ??
        existingByOrder.get(normalizedOrderInVolume);

      return createChapterBeatRecord(projectId, volumeId, normalizedInput, matched, now);
    });
    const nextIds = new Set(nextBeats.map((beat) => beat.id));
    const staleIds = targetExistingBeats
      .filter((beat) => !nextIds.has(beat.id))
      .map((beat) => beat.id);

    await db.transaction('rw', db.chapterBeats, async () => {
      if (nextBeats.length > 0) {
        await db.chapterBeats.bulkPut(nextBeats);
      }

      if (staleIds.length > 0) {
        await db.chapterBeats.bulkDelete(staleIds);
      }
    });

    await touchProject(projectId);
    await useProjectStore.getState().loadProjects();
    updateCachedChapterBeats(projectId, new Set([...staleIds, ...nextBeats.map((beat) => beat.id)]), nextBeats);

    return nextBeats;
  },

  async deleteChapterBeat(beatId) {
    const current =
      get().chapterBeats.find((beat) => beat.id === beatId) ??
      (await db.chapterBeats.get(beatId));

    if (!current) {
      return;
    }

    await db.chapterBeats.delete(beatId);
    await touchProject(current.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      chapterBeats: state.chapterBeats.filter((beat) => beat.id !== beatId),
    }));
  },

  async moveChapterBeat(beatId, direction) {
    const current =
      get().chapterBeats.find((beat) => beat.id === beatId) ??
      (await db.chapterBeats.get(beatId));

    if (!current) {
      return;
    }

    const volumeBeats = sortChapterBeats(await db.chapterBeats.where('volumeId').equals(current.volumeId).toArray());
    const currentIndex = volumeBeats.findIndex((beat) => beat.id === beatId);

    if (currentIndex === -1) {
      return;
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= volumeBeats.length) {
      return;
    }

    const reordered = [...volumeBeats];
    const [targetBeat] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, targetBeat);

    const now = createTimestamp();
    const nextBeats = reordered.map((beat, index) => ({
      ...beat,
      orderInVolume: index + 1,
      updatedAt: beat.id === current.id ? now : beat.updatedAt,
    }));

    await db.chapterBeats.bulkPut(nextBeats);
    await touchProject(current.projectId);
    await useProjectStore.getState().loadProjects();

    if (get().loadedProjectId === current.projectId) {
      set((state) => ({
        chapterBeats: sortChapterBeats([
          ...state.chapterBeats.filter((beat) => beat.volumeId !== current.volumeId),
          ...nextBeats,
        ]),
      }));
    }
  },

  async getChapterBeatByChapterId(chapterId) {
    const cached = get().chapterBeats.find((beat) => beat.chapterId === chapterId);

    if (cached) {
      return cached;
    }

    return db.chapterBeats.where('chapterId').equals(chapterId).first();
  },

  async getVolumeChapterBeats(volumeId) {
    const cached = get().chapterBeats.filter((beat) => beat.volumeId === volumeId);

    if (cached.length > 0) {
      return sortChapterBeats(cached);
    }

    return sortChapterBeats(await db.chapterBeats.where('volumeId').equals(volumeId).toArray());
  },
}));
