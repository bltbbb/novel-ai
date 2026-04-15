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
  createWorldStateEntry as createWorldStateEntryRequest,
  deleteWorldStateEntry as deleteWorldStateEntryRequest,
  fetchWorldStateEntries,
  type FetchWorldStateEntriesOptions,
  type WorldStateEntryMutationInput,
  updateWorldStateEntry as updateWorldStateEntryRequest,
} from '@/lib/structure-memory-client';
import { useSettingsStore } from '@/stores/settings-store';
import type { Id, StructureMemorySyncStatus, WorldStateEntry } from '@/types';

const MIRROR_SYSTEM = 'world_state';

interface WorldStateStoreState {
  worldStateEntries: WorldStateEntry[];
  syncStatusById: Record<Id, StructureMemorySyncStatus>;
  localOnlyById: Record<Id, boolean>;
  activeWorldStateEntryId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadWorldStateEntries: (projectId: Id, options?: FetchWorldStateEntriesOptions) => Promise<void>;
  setActiveWorldStateEntry: (worldStateEntryId: Id | null) => void;
  createWorldStateEntry: (
    input: WorldStateEntryMutationInput,
    options?: FetchWorldStateEntriesOptions,
  ) => Promise<WorldStateEntry>;
  updateWorldStateEntry: (
    worldStateEntryId: Id,
    input: WorldStateEntryMutationInput,
    options?: FetchWorldStateEntriesOptions,
  ) => Promise<WorldStateEntry>;
  deleteWorldStateEntry: (projectId: Id, worldStateEntryId: Id, options?: FetchWorldStateEntriesOptions) => Promise<void>;
}

function getServerUrl() {
  return useSettingsStore.getState().settings.serverUrl;
}

export const useWorldStateStore = create<WorldStateStoreState>((set, get) => ({
  worldStateEntries: [],
  syncStatusById: {},
  localOnlyById: {},
  activeWorldStateEntryId: null,
  loadedProjectId: null,
  isLoaded: false,

  async loadWorldStateEntries(projectId, options) {
    const cached = await loadStructureMemoryMirror<WorldStateEntry>(projectId, MIRROR_SYSTEM);

    if (cached.hasMirror) {
      set((state) => ({
        worldStateEntries: cached.items,
        syncStatusById: cached.syncStatusById,
        localOnlyById: cached.localOnlyById,
        activeWorldStateEntryId:
          state.loadedProjectId === projectId && cached.items.some((item) => item.id === state.activeWorldStateEntryId)
            ? state.activeWorldStateEntryId
            : cached.items[0]?.id ?? null,
        loadedProjectId: projectId,
        isLoaded: true,
      }));
    }

    try {
      const result = await fetchWorldStateEntries(getServerUrl(), projectId, options);
      const mirrored = await syncStructureMemoryMirrorFromServer(projectId, MIRROR_SYSTEM, result.items);

      set((state) => ({
        worldStateEntries: mirrored.items,
        syncStatusById: mirrored.syncStatusById,
        localOnlyById: mirrored.localOnlyById,
        activeWorldStateEntryId:
          state.loadedProjectId === projectId && mirrored.items.some((item) => item.id === state.activeWorldStateEntryId)
            ? state.activeWorldStateEntryId
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

  setActiveWorldStateEntry(worldStateEntryId) {
    set({
      activeWorldStateEntryId: worldStateEntryId,
    });
  },

  async createWorldStateEntry(input, options) {
    try {
      const item = await createWorldStateEntryRequest(getServerUrl(), input);
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadWorldStateEntries(item.projectId, options);
      set({
        activeWorldStateEntryId: item.id,
      });
      return item;
    } catch (error) {
      const localItem: WorldStateEntry = {
        id: createId(),
        projectId: input.projectId,
        volumeId: input.volumeId ?? '',
        volumeTitle: input.volumeTitle?.trim() || '',
        volumeOrder: typeof input.volumeOrder === 'number' ? Math.trunc(input.volumeOrder) : 0,
        milestoneIndex:
          typeof input.milestoneIndex === 'number' ? Math.max(0, Math.trunc(input.milestoneIndex)) : null,
        publicEvents: [...(input.publicEvents ?? [])],
        secretEvents: [...(input.secretEvents ?? [])],
        powerBalanceChange: input.powerBalanceChange?.trim() || '',
        institutionChange: input.institutionChange?.trim() || '',
        ruleChange: input.ruleChange?.trim() || '',
        rumorState: input.rumorState?.trim() || '',
        knownByCharacterIds: [...(input.knownByCharacterIds ?? [])],
        knownByCharacterNames: [...(input.knownByCharacterNames ?? [])],
        currentRisks: [...(input.currentRisks ?? [])],
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
      };

      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, localItem);
      await markStructureMemoryMirrorUpsertError(
        MIRROR_SYSTEM,
        localItem,
        error instanceof Error ? error.message : '世界状态创建同步失败',
      );

      set((state) => ({
        worldStateEntries: [localItem, ...state.worldStateEntries.filter((item) => item.id !== localItem.id)],
        syncStatusById: {
          ...state.syncStatusById,
          [localItem.id]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [localItem.id]: true,
        },
        activeWorldStateEntryId: localItem.id,
        loadedProjectId: input.projectId,
        isLoaded: true,
      }));

      return localItem;
    }
  },

  async updateWorldStateEntry(worldStateEntryId, input, options) {
    const current = get().worldStateEntries.find((item) => item.id === worldStateEntryId) ?? null;
    const isLocalOnly = get().localOnlyById[worldStateEntryId] === true;
    const optimisticItem = current
      ? ({
          ...current,
          ...input,
          id: current.id,
          projectId: current.projectId,
          updatedAt: createTimestamp(),
        } satisfies WorldStateEntry)
      : null;

    if (optimisticItem) {
      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, optimisticItem);
      set((state) => ({
        worldStateEntries: state.worldStateEntries.map((item) => (item.id === worldStateEntryId ? optimisticItem : item)),
        syncStatusById: {
          ...state.syncStatusById,
          [worldStateEntryId]: 'pending_push',
        },
      }));
    }

    try {
      const item = isLocalOnly
        ? await createWorldStateEntryRequest(getServerUrl(), input)
        : await updateWorldStateEntryRequest(getServerUrl(), worldStateEntryId, input);
      if (isLocalOnly) {
        await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, worldStateEntryId);
      }
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadWorldStateEntries(item.projectId, options);
      set({
        activeWorldStateEntryId: item.id,
      });
      return item;
    } catch (error) {
      if (optimisticItem) {
        await markStructureMemoryMirrorUpsertError(
          MIRROR_SYSTEM,
          optimisticItem,
          error instanceof Error ? error.message : '世界状态同步失败',
        );
        set((state) => ({
          syncStatusById: {
            ...state.syncStatusById,
            [worldStateEntryId]: 'sync_error',
          },
          localOnlyById: {
            ...state.localOnlyById,
            [worldStateEntryId]: isLocalOnly,
          },
        }));
      }
      throw error;
    }
  },

  async deleteWorldStateEntry(projectId, worldStateEntryId, options) {
    if (get().localOnlyById[worldStateEntryId]) {
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, worldStateEntryId);
      set((state) => {
        const nextItems = state.worldStateEntries.filter((item) => item.id !== worldStateEntryId);
        const nextSyncStatusById = { ...state.syncStatusById };
        const nextLocalOnlyById = { ...state.localOnlyById };
        delete nextSyncStatusById[worldStateEntryId];
        delete nextLocalOnlyById[worldStateEntryId];

        return {
          worldStateEntries: nextItems,
          syncStatusById: nextSyncStatusById,
          localOnlyById: nextLocalOnlyById,
          activeWorldStateEntryId:
            state.activeWorldStateEntryId === worldStateEntryId ? nextItems[0]?.id ?? null : state.activeWorldStateEntryId,
        };
      });
      return;
    }

    await markStructureMemoryMirrorPendingDelete(projectId, MIRROR_SYSTEM, worldStateEntryId);
    set((state) => ({
      syncStatusById: {
        ...state.syncStatusById,
        [worldStateEntryId]: 'pending_push',
      },
      localOnlyById: {
        ...state.localOnlyById,
        [worldStateEntryId]: false,
      },
    }));

    try {
      await deleteWorldStateEntryRequest(getServerUrl(), projectId, worldStateEntryId);
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, worldStateEntryId);
      await get().loadWorldStateEntries(projectId, options);
    } catch (error) {
      await markStructureMemoryMirrorDeleteError(
        projectId,
        MIRROR_SYSTEM,
        worldStateEntryId,
        error instanceof Error ? error.message : '世界状态删除同步失败',
      );
      set((state) => ({
        syncStatusById: {
          ...state.syncStatusById,
          [worldStateEntryId]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [worldStateEntryId]: false,
        },
      }));
      throw error;
    }
  },
}));
