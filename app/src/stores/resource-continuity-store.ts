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
  createResourceContinuity as createResourceContinuityRequest,
  deleteResourceContinuity as deleteResourceContinuityRequest,
  fetchResourceContinuities,
  type FetchResourceContinuitiesOptions,
  type ResourceContinuityMutationInput,
  updateResourceContinuity as updateResourceContinuityRequest,
} from '@/lib/structure-memory-client';
import { useSettingsStore } from '@/stores/settings-store';
import type { Id, ResourceContinuity, StructureMemorySyncStatus } from '@/types';

const MIRROR_SYSTEM = 'resource_continuity';

interface ResourceContinuityStoreState {
  resourceContinuities: ResourceContinuity[];
  syncStatusById: Record<Id, StructureMemorySyncStatus>;
  localOnlyById: Record<Id, boolean>;
  activeResourceContinuityId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadResourceContinuities: (projectId: Id, options?: FetchResourceContinuitiesOptions) => Promise<void>;
  setActiveResourceContinuity: (resourceContinuityId: Id | null) => void;
  createResourceContinuity: (
    input: ResourceContinuityMutationInput,
    options?: FetchResourceContinuitiesOptions,
  ) => Promise<ResourceContinuity>;
  updateResourceContinuity: (
    resourceContinuityId: Id,
    input: ResourceContinuityMutationInput,
    options?: FetchResourceContinuitiesOptions,
  ) => Promise<ResourceContinuity>;
  deleteResourceContinuity: (
    projectId: Id,
    resourceContinuityId: Id,
    options?: FetchResourceContinuitiesOptions,
  ) => Promise<void>;
}

function getServerUrl() {
  return useSettingsStore.getState().settings.serverUrl;
}

export const useResourceContinuityStore = create<ResourceContinuityStoreState>((set, get) => ({
  resourceContinuities: [],
  syncStatusById: {},
  localOnlyById: {},
  activeResourceContinuityId: null,
  loadedProjectId: null,
  isLoaded: false,

  async loadResourceContinuities(projectId, options) {
    const cached = await loadStructureMemoryMirror<ResourceContinuity>(projectId, MIRROR_SYSTEM);

    if (cached.hasMirror) {
      set((state) => ({
        resourceContinuities: cached.items,
        syncStatusById: cached.syncStatusById,
        localOnlyById: cached.localOnlyById,
        activeResourceContinuityId:
          state.loadedProjectId === projectId && cached.items.some((item) => item.id === state.activeResourceContinuityId)
            ? state.activeResourceContinuityId
            : cached.items[0]?.id ?? null,
        loadedProjectId: projectId,
        isLoaded: true,
      }));
    }

    try {
      const result = await fetchResourceContinuities(getServerUrl(), projectId, options);
      const mirrored = await syncStructureMemoryMirrorFromServer(projectId, MIRROR_SYSTEM, result.items);

      set((state) => ({
        resourceContinuities: mirrored.items,
        syncStatusById: mirrored.syncStatusById,
        localOnlyById: mirrored.localOnlyById,
        activeResourceContinuityId:
          state.loadedProjectId === projectId && mirrored.items.some((item) => item.id === state.activeResourceContinuityId)
            ? state.activeResourceContinuityId
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

  setActiveResourceContinuity(resourceContinuityId) {
    set({
      activeResourceContinuityId: resourceContinuityId,
    });
  },

  async createResourceContinuity(input, options) {
    try {
      const item = await createResourceContinuityRequest(getServerUrl(), input);
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadResourceContinuities(item.projectId, options);
      set({
        activeResourceContinuityId: item.id,
      });
      return item;
    } catch (error) {
      const localItem: ResourceContinuity = {
        id: createId(),
        projectId: input.projectId,
        resourceType: input.resourceType?.trim() || '伤势',
        ownerCharacterId: input.ownerCharacterId ?? null,
        ownerCharacterName: input.ownerCharacterName?.trim() || '',
        currentState: input.currentState?.trim() || '',
        performanceImpact: input.performanceImpact?.trim() || '',
        lastConsumedAt: input.lastConsumedAt?.trim() || '',
        recoveryCondition: input.recoveryCondition?.trim() || '',
        hiddenCost: input.hiddenCost?.trim() || '',
        continuityRisk: input.continuityRisk?.trim() || '',
        status: input.status ?? 'active',
        riskLevel: 'medium',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
      };

      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, localItem);
      await markStructureMemoryMirrorUpsertError(
        MIRROR_SYSTEM,
        localItem,
        error instanceof Error ? error.message : '资源连续性创建同步失败',
      );

      set((state) => ({
        resourceContinuities: [localItem, ...state.resourceContinuities.filter((item) => item.id !== localItem.id)],
        syncStatusById: {
          ...state.syncStatusById,
          [localItem.id]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [localItem.id]: true,
        },
        activeResourceContinuityId: localItem.id,
        loadedProjectId: input.projectId,
        isLoaded: true,
      }));

      return localItem;
    }
  },

  async updateResourceContinuity(resourceContinuityId, input, options) {
    const current = get().resourceContinuities.find((item) => item.id === resourceContinuityId) ?? null;
    const isLocalOnly = get().localOnlyById[resourceContinuityId] === true;
    const optimisticItem = current
      ? ({
          ...current,
          ...input,
          id: current.id,
          projectId: current.projectId,
          updatedAt: createTimestamp(),
        } satisfies ResourceContinuity)
      : null;

    if (optimisticItem) {
      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, optimisticItem);
      set((state) => ({
        resourceContinuities: state.resourceContinuities.map((item) =>
          item.id === resourceContinuityId ? optimisticItem : item,
        ),
        syncStatusById: {
          ...state.syncStatusById,
          [resourceContinuityId]: 'pending_push',
        },
      }));
    }

    try {
      const item = isLocalOnly
        ? await createResourceContinuityRequest(getServerUrl(), input)
        : await updateResourceContinuityRequest(getServerUrl(), resourceContinuityId, input);
      if (isLocalOnly) {
        await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, resourceContinuityId);
      }
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadResourceContinuities(item.projectId, options);
      set({
        activeResourceContinuityId: item.id,
      });
      return item;
    } catch (error) {
      if (optimisticItem) {
        await markStructureMemoryMirrorUpsertError(
          MIRROR_SYSTEM,
          optimisticItem,
          error instanceof Error ? error.message : '资源连续性同步失败',
        );
        set((state) => ({
          syncStatusById: {
            ...state.syncStatusById,
            [resourceContinuityId]: 'sync_error',
          },
          localOnlyById: {
            ...state.localOnlyById,
            [resourceContinuityId]: isLocalOnly,
          },
        }));
      }
      throw error;
    }
  },

  async deleteResourceContinuity(projectId, resourceContinuityId, options) {
    if (get().localOnlyById[resourceContinuityId]) {
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, resourceContinuityId);
      set((state) => {
        const nextItems = state.resourceContinuities.filter((item) => item.id !== resourceContinuityId);
        const nextSyncStatusById = { ...state.syncStatusById };
        const nextLocalOnlyById = { ...state.localOnlyById };
        delete nextSyncStatusById[resourceContinuityId];
        delete nextLocalOnlyById[resourceContinuityId];

        return {
          resourceContinuities: nextItems,
          syncStatusById: nextSyncStatusById,
          localOnlyById: nextLocalOnlyById,
          activeResourceContinuityId:
            state.activeResourceContinuityId === resourceContinuityId ? nextItems[0]?.id ?? null : state.activeResourceContinuityId,
        };
      });
      return;
    }

    await markStructureMemoryMirrorPendingDelete(projectId, MIRROR_SYSTEM, resourceContinuityId);
    set((state) => ({
      syncStatusById: {
        ...state.syncStatusById,
        [resourceContinuityId]: 'pending_push',
      },
      localOnlyById: {
        ...state.localOnlyById,
        [resourceContinuityId]: false,
      },
    }));

    try {
      await deleteResourceContinuityRequest(getServerUrl(), projectId, resourceContinuityId);
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, resourceContinuityId);
      await get().loadResourceContinuities(projectId, options);
    } catch (error) {
      await markStructureMemoryMirrorDeleteError(
        projectId,
        MIRROR_SYSTEM,
        resourceContinuityId,
        error instanceof Error ? error.message : '资源连续性删除同步失败',
      );
      set((state) => ({
        syncStatusById: {
          ...state.syncStatusById,
          [resourceContinuityId]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [resourceContinuityId]: false,
        },
      }));
      throw error;
    }
  },
}));
