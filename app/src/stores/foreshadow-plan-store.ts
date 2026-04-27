import { create } from 'zustand';
import { createId, createTimestamp } from '@/lib/identity';
import {
  clearStructureMemoryMirrorEntity,
  loadStructureMemoryMirror,
  markStructureMemoryMirrorDeleteError,
  markStructureMemoryMirrorPendingDelete,
  markStructureMemoryMirrorPendingUpsert,
  markStructureMemoryMirrorUpsertError,
  syncStructureMemoryMirrorFromServer,
  upsertStructureMemoryMirrorSyncedEntity,
} from '@/lib/structure-memory-mirror';
import {
  createForeshadowPlan as createForeshadowPlanRequest,
  deleteForeshadowPlan as deleteForeshadowPlanRequest,
  fetchForeshadowPlans,
  type FetchForeshadowPlansOptions,
  type ForeshadowPlanMutationInput,
  updateForeshadowPlan as updateForeshadowPlanRequest,
} from '@/lib/structure-memory-client';
import { useSettingsStore } from '@/stores/settings-store';
import type { ForeshadowPlan, ForeshadowPlanAlert, Id, StructureMemorySyncStatus } from '@/types';

const MIRROR_SYSTEM = 'foreshadow_plan';

interface ForeshadowPlanStoreState {
  foreshadowPlans: ForeshadowPlan[];
  alerts: ForeshadowPlanAlert[];
  syncStatusById: Record<Id, StructureMemorySyncStatus>;
  localOnlyById: Record<Id, boolean>;
  activeForeshadowPlanId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadForeshadowPlans: (projectId: Id, options?: FetchForeshadowPlansOptions) => Promise<void>;
  setActiveForeshadowPlan: (foreshadowPlanId: Id | null) => void;
  createForeshadowPlan: (
    input: ForeshadowPlanMutationInput,
    options?: FetchForeshadowPlansOptions,
  ) => Promise<ForeshadowPlan>;
  updateForeshadowPlan: (
    foreshadowPlanId: Id,
    input: ForeshadowPlanMutationInput,
    options?: FetchForeshadowPlansOptions,
  ) => Promise<ForeshadowPlan>;
  deleteForeshadowPlan: (projectId: Id, foreshadowPlanId: Id, options?: FetchForeshadowPlansOptions) => Promise<void>;
}

function getServerUrl() {
  return useSettingsStore.getState().settings.serverUrl;
}

export const useForeshadowPlanStore = create<ForeshadowPlanStoreState>((set, get) => ({
  foreshadowPlans: [],
  alerts: [],
  syncStatusById: {},
  localOnlyById: {},
  activeForeshadowPlanId: null,
  loadedProjectId: null,
  isLoaded: false,

  async loadForeshadowPlans(projectId, options) {
    const cached = await loadStructureMemoryMirror<ForeshadowPlan>(projectId, MIRROR_SYSTEM);

    if (cached.hasMirror) {
      set((state) => ({
        foreshadowPlans: cached.items,
        alerts: [],
        syncStatusById: cached.syncStatusById,
        localOnlyById: cached.localOnlyById,
        activeForeshadowPlanId:
          state.loadedProjectId === projectId && cached.items.some((item) => item.id === state.activeForeshadowPlanId)
            ? state.activeForeshadowPlanId
            : cached.items[0]?.id ?? null,
        loadedProjectId: projectId,
        isLoaded: true,
      }));
    }

    try {
      const result = await fetchForeshadowPlans(getServerUrl(), projectId, options);
      const mirrored = await syncStructureMemoryMirrorFromServer(projectId, MIRROR_SYSTEM, result.items);

      set((state) => ({
        foreshadowPlans: mirrored.items,
        alerts: result.alerts,
        syncStatusById: mirrored.syncStatusById,
        localOnlyById: mirrored.localOnlyById,
        activeForeshadowPlanId:
          state.loadedProjectId === projectId && mirrored.items.some((item) => item.id === state.activeForeshadowPlanId)
            ? state.activeForeshadowPlanId
            : mirrored.items[0]?.id ?? null,
        loadedProjectId: projectId,
        isLoaded: true,
      }));
    } catch (error) {
      if (!cached.hasMirror) {
        throw error;
      }
    }
  },

  setActiveForeshadowPlan(foreshadowPlanId) {
    set({
      activeForeshadowPlanId: foreshadowPlanId,
    });
  },

  async createForeshadowPlan(input, options) {
    try {
      const item = await createForeshadowPlanRequest(getServerUrl(), input);
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadForeshadowPlans(item.projectId, options);
      set({
        activeForeshadowPlanId: item.id,
      });
      return item;
    } catch (error) {
      const localItem: ForeshadowPlan = {
        id: createId(),
        projectId: input.projectId,
        foreshadowId: input.foreshadowId ?? '',
        foreshadowTitle: input.foreshadowTitle?.trim() || '未命名伏笔规划',
        type: input.type?.trim() || '',
        importance: input.importance ?? 'minor',
        activationWindow: input.activationWindow?.trim() || '',
        resolveWindow: input.resolveWindow?.trim() || '',
        plannedActivateVolume:
          typeof input.plannedActivateVolume === 'number' ? Math.trunc(input.plannedActivateVolume) : null,
        plannedResolveVolume:
          typeof input.plannedResolveVolume === 'number' ? Math.trunc(input.plannedResolveVolume) : null,
        activationCondition: input.activationCondition?.trim() || '',
        resolveCondition: input.resolveCondition?.trim() || '',
        dependsOnForeshadowIds: [...(input.dependsOnForeshadowIds ?? [])],
        dependsOnForeshadowTitles: [...(input.dependsOnForeshadowTitles ?? [])],
        dependsOnEventKeys: [...(input.dependsOnEventKeys ?? [])],
        relatedQuestionIds: [...(input.relatedQuestionIds ?? [])],
        payoffEffect: input.payoffEffect?.trim() || '',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
      };

      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, localItem);
      await markStructureMemoryMirrorUpsertError(
        MIRROR_SYSTEM,
        localItem,
        error instanceof Error ? error.message : '伏笔规划创建同步失败',
      );

      set((state) => ({
        foreshadowPlans: [localItem, ...state.foreshadowPlans.filter((item) => item.id !== localItem.id)],
        syncStatusById: {
          ...state.syncStatusById,
          [localItem.id]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [localItem.id]: true,
        },
        activeForeshadowPlanId: localItem.id,
        loadedProjectId: input.projectId,
        isLoaded: true,
      }));

      return localItem;
    }
  },

  async updateForeshadowPlan(foreshadowPlanId, input, options) {
    const current = get().foreshadowPlans.find((item) => item.id === foreshadowPlanId) ?? null;
    const isLocalOnly = get().localOnlyById[foreshadowPlanId] === true;
    const optimisticItem = current
      ? ({
          ...current,
          ...input,
          id: current.id,
          projectId: current.projectId,
          updatedAt: createTimestamp(),
        } satisfies ForeshadowPlan)
      : null;

    if (optimisticItem) {
      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, optimisticItem);
      set((state) => ({
        foreshadowPlans: state.foreshadowPlans.map((item) => (item.id === foreshadowPlanId ? optimisticItem : item)),
        syncStatusById: {
          ...state.syncStatusById,
          [foreshadowPlanId]: 'pending_push',
        },
      }));
    }

    try {
      const item = isLocalOnly
        ? await createForeshadowPlanRequest(getServerUrl(), input)
        : await updateForeshadowPlanRequest(getServerUrl(), foreshadowPlanId, input);
      if (isLocalOnly) {
        await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, foreshadowPlanId);
      }
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadForeshadowPlans(item.projectId, options);
      set({
        activeForeshadowPlanId: item.id,
      });
      return item;
    } catch (error) {
      if (optimisticItem) {
        await markStructureMemoryMirrorUpsertError(
          MIRROR_SYSTEM,
          optimisticItem,
          error instanceof Error ? error.message : '伏笔规划同步失败',
        );
        set((state) => ({
          syncStatusById: {
            ...state.syncStatusById,
            [foreshadowPlanId]: 'sync_error',
          },
          localOnlyById: {
            ...state.localOnlyById,
            [foreshadowPlanId]: isLocalOnly,
          },
        }));
      }
      throw error;
    }
  },

  async deleteForeshadowPlan(projectId, foreshadowPlanId, options) {
    if (get().localOnlyById[foreshadowPlanId]) {
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, foreshadowPlanId);
      set((state) => {
        const nextItems = state.foreshadowPlans.filter((item) => item.id !== foreshadowPlanId);
        const nextSyncStatusById = { ...state.syncStatusById };
        const nextLocalOnlyById = { ...state.localOnlyById };
        delete nextSyncStatusById[foreshadowPlanId];
        delete nextLocalOnlyById[foreshadowPlanId];

        return {
          foreshadowPlans: nextItems,
          syncStatusById: nextSyncStatusById,
          localOnlyById: nextLocalOnlyById,
          activeForeshadowPlanId:
            state.activeForeshadowPlanId === foreshadowPlanId ? nextItems[0]?.id ?? null : state.activeForeshadowPlanId,
        };
      });
      return;
    }

    await markStructureMemoryMirrorPendingDelete(projectId, MIRROR_SYSTEM, foreshadowPlanId);
    set((state) => ({
      syncStatusById: {
        ...state.syncStatusById,
        [foreshadowPlanId]: 'pending_push',
      },
      localOnlyById: {
        ...state.localOnlyById,
        [foreshadowPlanId]: false,
      },
    }));

    try {
      await deleteForeshadowPlanRequest(getServerUrl(), projectId, foreshadowPlanId);
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, foreshadowPlanId);
      await get().loadForeshadowPlans(projectId, options);
    } catch (error) {
      await markStructureMemoryMirrorDeleteError(
        projectId,
        MIRROR_SYSTEM,
        foreshadowPlanId,
        error instanceof Error ? error.message : '伏笔规划删除同步失败',
      );
      set((state) => ({
        syncStatusById: {
          ...state.syncStatusById,
          [foreshadowPlanId]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [foreshadowPlanId]: false,
        },
      }));
      throw error;
    }
  },
}));
