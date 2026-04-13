import { create } from 'zustand';
import { db, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
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

function normalizeText(value: string) {
  return value.trim();
}

function normalizeTextList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
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
      keyTurns: normalizeTextList(milestone.keyTurns),
      mustPlant: normalizeTextList(milestone.mustPlant),
      mustPayoff: normalizeTextList(milestone.mustPayoff),
      powerCeiling: normalizeText(milestone.powerCeiling),
    }))
    .filter(
      (milestone) =>
        milestone.title ||
        milestone.phaseGoal ||
        milestone.phaseConflict ||
        milestone.entryState ||
        milestone.exitState ||
        milestone.keyTurns.length > 0 ||
        milestone.mustPlant.length > 0 ||
        milestone.mustPayoff.length > 0 ||
        milestone.powerCeiling ||
        milestone.targetChapterCount > 0,
    );
}

function normalizeBookOutlineFields(fields: BookOutlineFields): BookOutlineFields {
  return {
    premise: normalizeText(fields.premise),
    centralConflict: normalizeText(fields.centralConflict),
    protagonistArc: normalizeText(fields.protagonistArc),
    thematicCore: normalizeText(fields.thematicCore),
    worldRules: normalizeTextList(fields.worldRules),
    endgameHint: normalizeText(fields.endgameHint),
    toneGuide: normalizeText(fields.toneGuide),
  };
}

function normalizeVolumeOutlineFields(fields: VolumeOutlineFields): VolumeOutlineFields {
  return {
    goal: normalizeText(fields.goal),
    keyConflict: normalizeText(fields.keyConflict),
    arcSummary: normalizeText(fields.arcSummary),
    entryState: normalizeText(fields.entryState),
    exitState: normalizeText(fields.exitState),
    keyEvents: normalizeTextList(fields.keyEvents),
    foreshadowSeeds: normalizeTextList(fields.foreshadowSeeds),
    estimatedChapterCount: normalizePositiveInteger(fields.estimatedChapterCount),
    milestones: normalizeVolumeMilestones(fields.milestones),
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
    const volumeOutlines = rawVolumeOutlines.map(normalizeVolumeOutlineRecord);

    set({
      bookOutline: bookOutline ?? null,
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
    return outline ?? undefined;
  },
}));
