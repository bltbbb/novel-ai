import { create } from 'zustand';
import { normalizeForeshadowRefs } from '@/lib/chapter-outline';
import { db, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import {
  buildBookOutlineSummary,
  buildVolumeMilestoneSummary,
  buildVolumeOutlineSummary,
} from '@/lib/outline-summary';
import { useProjectStore } from '@/stores/project-store';
import type {
  BookOutline,
  BookOutlineFields,
  Id,
  VolumeMilestoneDraft,
  VolumeOutline,
  VolumeOutlineFields,
} from '@/types';

interface OutlineStoreState {
  bookOutline: BookOutline | null;
  volumeOutlines: VolumeOutline[];
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadOutlines: (projectId: Id) => Promise<void>;
  saveBookOutline: (projectId: Id, fields: BookOutlineFields) => Promise<BookOutline>;
  saveVolumeOutline: (projectId: Id, volumeId: Id, fields: VolumeOutlineFields) => Promise<VolumeOutline>;
  getVolumeOutline: (volumeId: Id) => Promise<VolumeOutline | undefined>;
  getBookOutline: (projectId: Id) => Promise<BookOutline | undefined>;
}

function normalizeText(value: string | undefined | null) {
  return value?.trim() ?? '';
}

function normalizeTextList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function normalizeOptionalTextList(values: string[] | undefined) {
  return normalizeTextList(values ?? []);
}

function normalizeBookCharacterArcs(
  values: BookOutlineFields['characterArcs'] | undefined,
): BookOutlineFields['characterArcs'] {
  return (values ?? [])
    .map((item) => ({
      characterId: item.characterId ?? null,
      characterName: normalizeText(item.characterName),
      arc: normalizeText(item.arc),
    }))
    .filter((item) => item.characterName || item.arc);
}

function normalizeVolumeInheritedThreads(
  values: VolumeOutlineFields['inheritedThreads'] | undefined,
): VolumeOutlineFields['inheritedThreads'] {
  return (values ?? [])
    .map((item) => ({
      threadId: item.threadId ?? null,
      threadName: normalizeText(item.threadName),
      note: normalizeText(item.note),
    }))
    .filter((item) => item.threadName || item.note);
}

function normalizePositiveInteger(value: number, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function normalizeVolumeMilestones(milestones: VolumeMilestoneDraft[] | undefined) {
  return (milestones ?? [])
    .map((milestone) => ({
      title: normalizeText(milestone.title),
      targetChapterCount: normalizePositiveInteger(milestone.targetChapterCount),
      phaseGoal: normalizeText(milestone.phaseGoal),
      phaseConflict: normalizeText(milestone.phaseConflict),
      entryState: normalizeText(milestone.entryState),
      exitState: normalizeText(milestone.exitState),
      phasePacing: normalizeText(milestone.phasePacing),
      phaseEmotionShift: normalizeText(milestone.phaseEmotionShift),
      phasePOV: normalizeText(milestone.phasePOV),
      keyTurns: normalizeTextList(milestone.keyTurns),
      mustPlant: normalizeTextList(milestone.mustPlant),
      mustPayoff: normalizeTextList(milestone.mustPayoff),
      powerCeiling: normalizeText(milestone.powerCeiling),
      requiredEntities: normalizeOptionalTextList(milestone.requiredEntities),
      requiredForeshadows: normalizeOptionalTextList(milestone.requiredForeshadows),
      requiredForeshadowIds: normalizeOptionalTextList(milestone.requiredForeshadowIds),
      foreshadowRefs: normalizeForeshadowRefs(milestone.foreshadowRefs),
      summary: normalizeText(milestone.summary),
    }))
    .filter(
      (milestone) =>
        milestone.title ||
        milestone.phaseGoal ||
        milestone.phaseConflict ||
        milestone.entryState ||
        milestone.exitState ||
        milestone.phasePacing ||
        milestone.phaseEmotionShift ||
        milestone.phasePOV ||
        milestone.keyTurns.length > 0 ||
        milestone.mustPlant.length > 0 ||
        milestone.mustPayoff.length > 0 ||
        milestone.requiredEntities.length > 0 ||
        milestone.requiredForeshadows.length > 0 ||
        milestone.requiredForeshadowIds.length > 0 ||
        (milestone.foreshadowRefs?.length ?? 0) > 0 ||
        milestone.powerCeiling ||
        milestone.targetChapterCount > 0,
    )
    .map((milestone, index) => ({
      ...milestone,
      summary: milestone.summary || buildVolumeMilestoneSummary(milestone, index),
    }));
}

function normalizeBookOutlineFields(fields: BookOutlineFields): BookOutlineFields {
  const normalized: BookOutlineFields = {
    premise: normalizeText(fields.premise),
    centralConflict: normalizeText(fields.centralConflict),
    protagonistArc: normalizeText(fields.protagonistArc),
    thematicCore: normalizeText(fields.thematicCore),
    subPlots: normalizeTextList(fields.subPlots),
    characterArcs: normalizeBookCharacterArcs(fields.characterArcs),
    powerSystem: normalizeText(fields.powerSystem),
    antagonistSystem: normalizeText(fields.antagonistSystem),
    narrativeArc: normalizeText(fields.narrativeArc),
    logline: normalizeText(fields.logline),
    worldRules: normalizeTextList(fields.worldRules),
    endgameHint: normalizeText(fields.endgameHint),
    toneGuide: normalizeText(fields.toneGuide),
  };

  return {
    ...normalized,
    summary: normalizeText(fields.summary) || buildBookOutlineSummary(normalized),
  };
}

function normalizeVolumeOutlineFields(fields: VolumeOutlineFields): VolumeOutlineFields {
  const normalized: VolumeOutlineFields = {
    goal: normalizeText(fields.goal),
    keyConflict: normalizeText(fields.keyConflict),
    arcSummary: normalizeText(fields.arcSummary),
    entryState: normalizeText(fields.entryState),
    exitState: normalizeText(fields.exitState),
    antagonist: normalizeText(fields.antagonist),
    subPlot: normalizeText(fields.subPlot),
    inheritedThreads: normalizeVolumeInheritedThreads(fields.inheritedThreads),
    protagonistGrowth: normalizeText(fields.protagonistGrowth),
    emotionalArc: normalizeText(fields.emotionalArc),
    estimatedWordCount: normalizePositiveInteger(fields.estimatedWordCount),
    povPlan: normalizeText(fields.povPlan),
    keyEvents: normalizeTextList(fields.keyEvents),
    foreshadowSeeds: normalizeTextList(fields.foreshadowSeeds),
    requiredEntities: normalizeOptionalTextList(fields.requiredEntities),
    requiredForeshadows: normalizeOptionalTextList(fields.requiredForeshadows),
    requiredForeshadowIds: normalizeOptionalTextList(fields.requiredForeshadowIds),
    foreshadowRefs: normalizeForeshadowRefs(fields.foreshadowRefs),
    estimatedChapterCount: normalizePositiveInteger(fields.estimatedChapterCount),
    milestones: normalizeVolumeMilestones(fields.milestones),
  };

  return {
    ...normalized,
    summary: normalizeText(fields.summary) || buildVolumeOutlineSummary(normalized),
  };
}

function normalizeBookOutlineRecord(outline: BookOutline): BookOutline {
  return {
    ...outline,
    ...normalizeBookOutlineFields(outline),
  };
}

function normalizeVolumeOutlineRecord(outline: VolumeOutline): VolumeOutline {
  return {
    ...outline,
    ...normalizeVolumeOutlineFields(outline),
  };
}

function sortVolumeOutlines(outlines: VolumeOutline[]) {
  return [...outlines].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

export const useOutlineStore = create<OutlineStoreState>((set, get) => ({
  bookOutline: null,
  volumeOutlines: [],
  loadedProjectId: null,
  isLoaded: false,

  async loadOutlines(projectId) {
    const [bookOutline, rawVolumeOutlines] = await Promise.all([
      db.bookOutlines.where('projectId').equals(projectId).first(),
      db.volumeOutlines.where('projectId').equals(projectId).toArray(),
    ]);
    const normalizedBookOutline = bookOutline ? normalizeBookOutlineRecord(bookOutline) : null;
    const volumeOutlines = rawVolumeOutlines.map(normalizeVolumeOutlineRecord);

    set({
      bookOutline: normalizedBookOutline,
      volumeOutlines: sortVolumeOutlines(volumeOutlines),
      loadedProjectId: projectId,
      isLoaded: true,
    });
  },

  async saveBookOutline(projectId, fields) {
    const now = createTimestamp();
    const existing = await db.bookOutlines.where('projectId').equals(projectId).first();
    const normalizedFields = normalizeBookOutlineFields(fields);

    const nextOutline: BookOutline = {
      id: existing?.id ?? createId(),
      projectId,
      ...normalizedFields,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await db.bookOutlines.put(nextOutline);
    await touchProject(projectId);
    await useProjectStore.getState().loadProjects();

    if (get().loadedProjectId === projectId) {
      set({ bookOutline: nextOutline });
    } else {
      set({
        loadedProjectId: projectId,
        bookOutline: nextOutline,
        volumeOutlines: [],
        isLoaded: true,
      });
    }

    return nextOutline;
  },

  async saveVolumeOutline(projectId, volumeId, fields) {
    const now = createTimestamp();
    const existing = await db.volumeOutlines.where('[projectId+volumeId]').equals([projectId, volumeId]).first();
    const normalizedFields = normalizeVolumeOutlineFields(fields);

    const nextOutline: VolumeOutline = {
      id: existing?.id ?? createId(),
      projectId,
      volumeId,
      ...normalizedFields,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await db.volumeOutlines.put(nextOutline);
    await touchProject(projectId);
    await useProjectStore.getState().loadProjects();

    if (get().loadedProjectId === projectId) {
      set((state) => ({
        volumeOutlines: sortVolumeOutlines(
          state.volumeOutlines.some((outline) => outline.id === nextOutline.id)
            ? state.volumeOutlines.map((outline) =>
                outline.id === nextOutline.id ? nextOutline : outline,
              )
            : [...state.volumeOutlines, nextOutline],
        ),
      }));
    } else {
      set({
        loadedProjectId: projectId,
        bookOutline: null,
        volumeOutlines: [nextOutline],
        isLoaded: true,
      });
    }

    return nextOutline;
  },

  async getVolumeOutline(volumeId) {
    const cached = get().volumeOutlines.find((outline) => outline.volumeId === volumeId);
    if (cached) {
      return cached;
    }

    const outline = await db.volumeOutlines.where('volumeId').equals(volumeId).first();
    return outline ? normalizeVolumeOutlineRecord(outline) : undefined;
  },

  async getBookOutline(projectId): Promise<BookOutline | undefined> {
    const cachedBookOutline = get().bookOutline;

    if (get().loadedProjectId === projectId && cachedBookOutline) {
      return cachedBookOutline;
    }

    const outline = await db.bookOutlines.where('projectId').equals(projectId).first();
    return outline ? normalizeBookOutlineRecord(outline) : undefined;
  },
}));
