import { create } from 'zustand';
import { db, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { useProjectStore } from '@/stores/project-store';
import type { Foreshadow, ForeshadowStatus, Id } from '@/types';

interface CreateForeshadowInput {
  projectId: Id;
  title?: string;
  excerpt?: string;
  notes?: string;
  status?: ForeshadowStatus;
  sourceChapterId?: Id | null;
  resolvedChapterId?: Id | null;
}

interface UpdateForeshadowInput {
  title?: string;
  excerpt?: string;
  notes?: string;
  status?: ForeshadowStatus;
  sourceChapterId?: Id | null;
  resolvedChapterId?: Id | null;
}

interface ForeshadowStoreState {
  foreshadows: Foreshadow[];
  activeForeshadowId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadForeshadows: (projectId: Id) => Promise<void>;
  setActiveForeshadow: (foreshadowId: Id | null) => void;
  createForeshadow: (input: CreateForeshadowInput) => Promise<Foreshadow>;
  updateForeshadow: (foreshadowId: Id, input: UpdateForeshadowInput) => Promise<void>;
  deleteForeshadow: (foreshadowId: Id) => Promise<void>;
}

const statusOrder: Record<ForeshadowStatus, number> = {
  overdue: 0,
  activated: 1,
  planted: 2,
  resolved: 3,
};

function sortForeshadows(foreshadows: Foreshadow[]) {
  return [...foreshadows].sort((a, b) => {
    const statusGap = statusOrder[a.status] - statusOrder[b.status];

    if (statusGap !== 0) {
      return statusGap;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function normalizeText(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function hasOwnField<T extends object>(value: T, field: keyof T) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

export const useForeshadowStore = create<ForeshadowStoreState>((set, get) => ({
  foreshadows: [],
  activeForeshadowId: null,
  loadedProjectId: null,
  isLoaded: false,

  async loadForeshadows(projectId) {
    const foreshadows = sortForeshadows(await db.foreshadows.where('projectId').equals(projectId).toArray());

    set((state) => ({
      foreshadows,
      activeForeshadowId:
        state.loadedProjectId === projectId && foreshadows.some((item) => item.id === state.activeForeshadowId)
          ? state.activeForeshadowId
          : foreshadows[0]?.id ?? null,
      loadedProjectId: projectId,
      isLoaded: true,
    }));
  },

  setActiveForeshadow(foreshadowId) {
    set({ activeForeshadowId: foreshadowId });
  },

  async createForeshadow(input) {
    const now = createTimestamp();
    const status = input.status ?? 'planted';
    const foreshadow: Foreshadow = {
      id: createId(),
      projectId: input.projectId,
      title: normalizeText(input.title, '未命名伏笔'),
      excerpt: input.excerpt?.trim() || '',
      notes: input.notes?.trim() || '',
      status,
      sourceChapterId: input.sourceChapterId ?? null,
      resolvedChapterId: status === 'resolved' ? input.resolvedChapterId ?? null : null,
      createdAt: now,
      updatedAt: now,
    };

    await db.foreshadows.put(foreshadow);
    await touchProject(input.projectId);
    await useProjectStore.getState().loadProjects();

    const nextForeshadows =
      get().loadedProjectId === input.projectId
        ? sortForeshadows([foreshadow, ...get().foreshadows])
        : [foreshadow];

    set({
      foreshadows: nextForeshadows,
      activeForeshadowId: foreshadow.id,
      loadedProjectId: input.projectId,
      isLoaded: true,
    });

    return foreshadow;
  },

  async updateForeshadow(foreshadowId, input) {
    const current =
      get().foreshadows.find((item) => item.id === foreshadowId) ?? (await db.foreshadows.get(foreshadowId));

    if (!current) {
      return;
    }

    const nextStatus = input.status ?? current.status;
    const nextForeshadow: Foreshadow = {
      ...current,
      title: hasOwnField(input, 'title') ? normalizeText(input.title, current.title) : current.title,
      excerpt: hasOwnField(input, 'excerpt') ? input.excerpt?.trim() || '' : current.excerpt,
      notes: hasOwnField(input, 'notes') ? input.notes?.trim() || '' : current.notes,
      status: nextStatus,
      sourceChapterId: hasOwnField(input, 'sourceChapterId') ? input.sourceChapterId ?? null : current.sourceChapterId,
      resolvedChapterId:
        nextStatus === 'resolved'
          ? hasOwnField(input, 'resolvedChapterId')
            ? input.resolvedChapterId ?? null
            : current.resolvedChapterId
          : null,
      updatedAt: createTimestamp(),
    };

    await db.foreshadows.put(nextForeshadow);
    await touchProject(nextForeshadow.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      foreshadows: sortForeshadows(
        state.foreshadows.map((item) => (item.id === foreshadowId ? nextForeshadow : item)),
      ),
    }));
  },

  async deleteForeshadow(foreshadowId) {
    const current =
      get().foreshadows.find((item) => item.id === foreshadowId) ?? (await db.foreshadows.get(foreshadowId));

    if (!current) {
      return;
    }

    await db.foreshadows.delete(foreshadowId);
    await touchProject(current.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => {
      const foreshadows = state.foreshadows.filter((item) => item.id !== foreshadowId);

      return {
        foreshadows,
        activeForeshadowId:
          state.activeForeshadowId === foreshadowId ? foreshadows[0]?.id ?? null : state.activeForeshadowId,
      };
    });
  },
}));
