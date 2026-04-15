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
  createThreadLedger as createThreadLedgerRequest,
  deleteThreadLedger as deleteThreadLedgerRequest,
  fetchThreadLedgers,
  type FetchThreadLedgersOptions,
  type ThreadLedgerMutationInput,
  updateThreadLedger as updateThreadLedgerRequest,
} from '@/lib/structure-memory-client';
import { useSettingsStore } from '@/stores/settings-store';
import type { Id, StructureMemorySyncStatus, ThreadLedger, ThreadLedgerAlert } from '@/types';

const MIRROR_SYSTEM = 'thread_ledger';

interface ThreadLedgerStoreState {
  threadLedgers: ThreadLedger[];
  alerts: ThreadLedgerAlert[];
  syncStatusById: Record<Id, StructureMemorySyncStatus>;
  localOnlyById: Record<Id, boolean>;
  activeThreadLedgerId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadThreadLedgers: (projectId: Id, options?: FetchThreadLedgersOptions) => Promise<void>;
  setActiveThreadLedger: (threadLedgerId: Id | null) => void;
  createThreadLedger: (input: ThreadLedgerMutationInput, options?: FetchThreadLedgersOptions) => Promise<ThreadLedger>;
  updateThreadLedger: (
    threadLedgerId: Id,
    input: ThreadLedgerMutationInput,
    options?: FetchThreadLedgersOptions,
  ) => Promise<ThreadLedger>;
  deleteThreadLedger: (projectId: Id, threadLedgerId: Id, options?: FetchThreadLedgersOptions) => Promise<void>;
}

function getServerUrl() {
  return useSettingsStore.getState().settings.serverUrl;
}

export const useThreadLedgerStore = create<ThreadLedgerStoreState>((set, get) => ({
  threadLedgers: [],
  alerts: [],
  syncStatusById: {},
  localOnlyById: {},
  activeThreadLedgerId: null,
  loadedProjectId: null,
  isLoaded: false,

  async loadThreadLedgers(projectId, options) {
    const cached = await loadStructureMemoryMirror<ThreadLedger>(projectId, MIRROR_SYSTEM);

    if (cached.hasMirror) {
      set((state) => ({
        threadLedgers: cached.items,
        alerts: [],
        syncStatusById: cached.syncStatusById,
        localOnlyById: cached.localOnlyById,
        activeThreadLedgerId:
          state.loadedProjectId === projectId && cached.items.some((item) => item.id === state.activeThreadLedgerId)
            ? state.activeThreadLedgerId
            : cached.items[0]?.id ?? null,
        loadedProjectId: projectId,
        isLoaded: true,
      }));
    }

    try {
      const result = await fetchThreadLedgers(getServerUrl(), projectId, options);
      const mirrored = await syncStructureMemoryMirrorFromServer(projectId, MIRROR_SYSTEM, result.items);

      set((state) => ({
        threadLedgers: mirrored.items,
        alerts: result.alerts,
        syncStatusById: mirrored.syncStatusById,
        localOnlyById: mirrored.localOnlyById,
        activeThreadLedgerId:
          state.loadedProjectId === projectId && mirrored.items.some((item) => item.id === state.activeThreadLedgerId)
            ? state.activeThreadLedgerId
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

  setActiveThreadLedger(threadLedgerId) {
    set({
      activeThreadLedgerId: threadLedgerId,
    });
  },

  async createThreadLedger(input, options) {
    try {
      const item = await createThreadLedgerRequest(getServerUrl(), input);
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadThreadLedgers(item.projectId, options);
      set({
        activeThreadLedgerId: item.id,
      });
      return item;
    } catch (error) {
      const localItem: ThreadLedger = {
        id: createId(),
        projectId: input.projectId,
        name: input.name?.trim() || '未命名剧情线',
        type: input.type?.trim() || '',
        coreQuestion: input.coreQuestion?.trim() || '',
        currentPhase: input.currentPhase?.trim() || '',
        lastProgressAt: input.lastProgressAt?.trim() || '',
        lastProgressChapterId: input.lastProgressChapterId ?? null,
        lastProgressChapterTitle: input.lastProgressChapterTitle?.trim() || '',
        lastProgressChapterOrder:
          typeof input.lastProgressChapterOrder === 'number' ? input.lastProgressChapterOrder : null,
        nextTrigger: input.nextTrigger?.trim() || '',
        blockedBy: input.blockedBy?.trim() || '',
        relatedCharacterIds: [...(input.relatedCharacterIds ?? [])],
        relatedCharacterNames: [...(input.relatedCharacterNames ?? [])],
        relatedForeshadowIds: [...(input.relatedForeshadowIds ?? [])],
        relatedForeshadowTitles: [...(input.relatedForeshadowTitles ?? [])],
        plannedResolveVolume:
          typeof input.plannedResolveVolume === 'number' ? Math.trunc(input.plannedResolveVolume) : null,
        status: input.status ?? 'active',
        audienceHeat:
          typeof input.audienceHeat === 'number' ? Math.max(1, Math.min(5, Math.trunc(input.audienceHeat))) : 3,
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
      };

      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, localItem);
      await markStructureMemoryMirrorUpsertError(
        MIRROR_SYSTEM,
        localItem,
        error instanceof Error ? error.message : '剧情线账本创建同步失败',
      );

      set((state) => ({
        threadLedgers: [localItem, ...state.threadLedgers.filter((item) => item.id !== localItem.id)],
        syncStatusById: {
          ...state.syncStatusById,
          [localItem.id]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [localItem.id]: true,
        },
        activeThreadLedgerId: localItem.id,
        loadedProjectId: input.projectId,
        isLoaded: true,
      }));

      return localItem;
    }
  },

  async updateThreadLedger(threadLedgerId, input, options) {
    const current = get().threadLedgers.find((item) => item.id === threadLedgerId) ?? null;
    const isLocalOnly = get().localOnlyById[threadLedgerId] === true;
    const optimisticItem = current
      ? ({
          ...current,
          ...input,
          id: current.id,
          projectId: current.projectId,
          updatedAt: createTimestamp(),
        } satisfies ThreadLedger)
      : null;

    if (optimisticItem) {
      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, optimisticItem);
      set((state) => ({
        threadLedgers: state.threadLedgers.map((item) => (item.id === threadLedgerId ? optimisticItem : item)),
        syncStatusById: {
          ...state.syncStatusById,
          [threadLedgerId]: 'pending_push',
        },
      }));
    }

    try {
      const item = isLocalOnly
        ? await createThreadLedgerRequest(getServerUrl(), input)
        : await updateThreadLedgerRequest(getServerUrl(), threadLedgerId, input);
      if (isLocalOnly) {
        await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, threadLedgerId);
      }
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadThreadLedgers(item.projectId, options);
      set({
        activeThreadLedgerId: item.id,
      });
      return item;
    } catch (error) {
      if (optimisticItem) {
        await markStructureMemoryMirrorUpsertError(
          MIRROR_SYSTEM,
          optimisticItem,
          error instanceof Error ? error.message : '剧情线账本同步失败',
        );
        set((state) => ({
          syncStatusById: {
            ...state.syncStatusById,
            [threadLedgerId]: 'sync_error',
          },
          localOnlyById: {
            ...state.localOnlyById,
            [threadLedgerId]: isLocalOnly,
          },
        }));
      }
      throw error;
    }
  },

  async deleteThreadLedger(projectId, threadLedgerId, options) {
    if (get().localOnlyById[threadLedgerId]) {
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, threadLedgerId);
      set((state) => {
        const nextItems = state.threadLedgers.filter((item) => item.id !== threadLedgerId);
        const nextSyncStatusById = { ...state.syncStatusById };
        const nextLocalOnlyById = { ...state.localOnlyById };
        delete nextSyncStatusById[threadLedgerId];
        delete nextLocalOnlyById[threadLedgerId];

        return {
          threadLedgers: nextItems,
          syncStatusById: nextSyncStatusById,
          localOnlyById: nextLocalOnlyById,
          activeThreadLedgerId:
            state.activeThreadLedgerId === threadLedgerId ? nextItems[0]?.id ?? null : state.activeThreadLedgerId,
        };
      });
      return;
    }

    await markStructureMemoryMirrorPendingDelete(projectId, MIRROR_SYSTEM, threadLedgerId);
    set((state) => ({
      syncStatusById: {
        ...state.syncStatusById,
        [threadLedgerId]: 'pending_push',
      },
      localOnlyById: {
        ...state.localOnlyById,
        [threadLedgerId]: false,
      },
    }));

    try {
      await deleteThreadLedgerRequest(getServerUrl(), projectId, threadLedgerId);
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, threadLedgerId);
      await get().loadThreadLedgers(projectId, options);
    } catch (error) {
      await markStructureMemoryMirrorDeleteError(
        projectId,
        MIRROR_SYSTEM,
        threadLedgerId,
        error instanceof Error ? error.message : '剧情线账本删除同步失败',
      );
      set((state) => ({
        syncStatusById: {
          ...state.syncStatusById,
          [threadLedgerId]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [threadLedgerId]: false,
        },
      }));
      throw error;
    }
  },
}));
