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
  createAntagonistAgenda as createAntagonistAgendaRequest,
  deleteAntagonistAgenda as deleteAntagonistAgendaRequest,
  fetchAntagonistAgendas,
  type AntagonistAgendaMutationInput,
  type FetchAntagonistAgendasOptions,
  updateAntagonistAgenda as updateAntagonistAgendaRequest,
} from '@/lib/structure-memory-client';
import { useSettingsStore } from '@/stores/settings-store';
import type { AntagonistAgenda, Id, StructureMemorySyncStatus } from '@/types';

const MIRROR_SYSTEM = 'antagonist_agenda';

interface AntagonistAgendaStoreState {
  antagonistAgendas: AntagonistAgenda[];
  syncStatusById: Record<Id, StructureMemorySyncStatus>;
  localOnlyById: Record<Id, boolean>;
  activeAntagonistAgendaId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadAntagonistAgendas: (projectId: Id, options?: FetchAntagonistAgendasOptions) => Promise<void>;
  setActiveAntagonistAgenda: (agendaId: Id | null) => void;
  createAntagonistAgenda: (
    input: AntagonistAgendaMutationInput,
    options?: FetchAntagonistAgendasOptions,
  ) => Promise<AntagonistAgenda>;
  updateAntagonistAgenda: (
    agendaId: Id,
    input: AntagonistAgendaMutationInput,
    options?: FetchAntagonistAgendasOptions,
  ) => Promise<AntagonistAgenda>;
  deleteAntagonistAgenda: (projectId: Id, agendaId: Id, options?: FetchAntagonistAgendasOptions) => Promise<void>;
}

function getServerUrl() {
  return useSettingsStore.getState().settings.serverUrl;
}

export const useAntagonistAgendaStore = create<AntagonistAgendaStoreState>((set, get) => ({
  antagonistAgendas: [],
  syncStatusById: {},
  localOnlyById: {},
  activeAntagonistAgendaId: null,
  loadedProjectId: null,
  isLoaded: false,

  async loadAntagonistAgendas(projectId, options) {
    const cached = await loadStructureMemoryMirror<AntagonistAgenda>(projectId, MIRROR_SYSTEM);

    if (cached.hasMirror) {
      set((state) => ({
        antagonistAgendas: cached.items,
        syncStatusById: cached.syncStatusById,
        localOnlyById: cached.localOnlyById,
        activeAntagonistAgendaId:
          state.loadedProjectId === projectId && cached.items.some((item) => item.id === state.activeAntagonistAgendaId)
            ? state.activeAntagonistAgendaId
            : cached.items[0]?.id ?? null,
        loadedProjectId: projectId,
        isLoaded: true,
      }));
    }

    try {
      const result = await fetchAntagonistAgendas(getServerUrl(), projectId, options);
      const mirrored = await syncStructureMemoryMirrorFromServer(projectId, MIRROR_SYSTEM, result.items);

      set((state) => ({
        antagonistAgendas: mirrored.items,
        syncStatusById: mirrored.syncStatusById,
        localOnlyById: mirrored.localOnlyById,
        activeAntagonistAgendaId:
          state.loadedProjectId === projectId && mirrored.items.some((item) => item.id === state.activeAntagonistAgendaId)
            ? state.activeAntagonistAgendaId
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

  setActiveAntagonistAgenda(agendaId) {
    set({
      activeAntagonistAgendaId: agendaId,
    });
  },

  async createAntagonistAgenda(input, options) {
    try {
      const item = await createAntagonistAgendaRequest(getServerUrl(), input);
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadAntagonistAgendas(item.projectId, options);
      set({
        activeAntagonistAgendaId: item.id,
      });
      return item;
    } catch (error) {
      const localItem: AntagonistAgenda = {
        id: createId(),
        projectId: input.projectId,
        characterEntityId: input.characterEntityId ?? null,
        characterName: input.characterName?.trim() || '未命名反派',
        publicRole: input.publicRole?.trim() || '',
        hiddenAgenda: input.hiddenAgenda?.trim() || '',
        currentObjective: input.currentObjective?.trim() || '',
        currentAction: input.currentAction?.trim() || '',
        triggerToStrike: input.triggerToStrike?.trim() || '',
        bottomLine: input.bottomLine?.trim() || '',
        resourceBase: input.resourceBase?.trim() || '',
        nextMoveWindow: input.nextMoveWindow?.trim() || '',
        intelligenceBlindSpot: input.intelligenceBlindSpot?.trim() || '',
        ifProtagonistDoesNothing: input.ifProtagonistDoesNothing?.trim() || '',
        status: input.status ?? 'active',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
      };

      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, localItem);
      await markStructureMemoryMirrorUpsertError(
        MIRROR_SYSTEM,
        localItem,
        error instanceof Error ? error.message : '反派议程创建同步失败',
      );

      set((state) => ({
        antagonistAgendas: [localItem, ...state.antagonistAgendas.filter((item) => item.id !== localItem.id)],
        syncStatusById: {
          ...state.syncStatusById,
          [localItem.id]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [localItem.id]: true,
        },
        activeAntagonistAgendaId: localItem.id,
        loadedProjectId: input.projectId,
        isLoaded: true,
      }));

      return localItem;
    }
  },

  async updateAntagonistAgenda(agendaId, input, options) {
    const current = get().antagonistAgendas.find((item) => item.id === agendaId) ?? null;
    const isLocalOnly = get().localOnlyById[agendaId] === true;
    const optimisticItem = current
      ? ({
          ...current,
          ...input,
          id: current.id,
          projectId: current.projectId,
          updatedAt: createTimestamp(),
        } satisfies AntagonistAgenda)
      : null;

    if (optimisticItem) {
      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, optimisticItem);
      set((state) => ({
        antagonistAgendas: state.antagonistAgendas.map((item) => (item.id === agendaId ? optimisticItem : item)),
        syncStatusById: {
          ...state.syncStatusById,
          [agendaId]: 'pending_push',
        },
      }));
    }

    try {
      const item = isLocalOnly
        ? await createAntagonistAgendaRequest(getServerUrl(), input)
        : await updateAntagonistAgendaRequest(getServerUrl(), agendaId, input);
      if (isLocalOnly) {
        await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, agendaId);
      }
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadAntagonistAgendas(item.projectId, options);
      set({
        activeAntagonistAgendaId: item.id,
      });
      return item;
    } catch (error) {
      if (optimisticItem) {
        await markStructureMemoryMirrorUpsertError(
          MIRROR_SYSTEM,
          optimisticItem,
          error instanceof Error ? error.message : '反派议程同步失败',
        );
        set((state) => ({
          syncStatusById: {
            ...state.syncStatusById,
            [agendaId]: 'sync_error',
          },
          localOnlyById: {
            ...state.localOnlyById,
            [agendaId]: isLocalOnly,
          },
        }));
      }
      throw error;
    }
  },

  async deleteAntagonistAgenda(projectId, agendaId, options) {
    if (get().localOnlyById[agendaId]) {
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, agendaId);
      set((state) => {
        const nextItems = state.antagonistAgendas.filter((item) => item.id !== agendaId);
        const nextSyncStatusById = { ...state.syncStatusById };
        const nextLocalOnlyById = { ...state.localOnlyById };
        delete nextSyncStatusById[agendaId];
        delete nextLocalOnlyById[agendaId];

        return {
          antagonistAgendas: nextItems,
          syncStatusById: nextSyncStatusById,
          localOnlyById: nextLocalOnlyById,
          activeAntagonistAgendaId:
            state.activeAntagonistAgendaId === agendaId ? nextItems[0]?.id ?? null : state.activeAntagonistAgendaId,
        };
      });
      return;
    }

    await markStructureMemoryMirrorPendingDelete(projectId, MIRROR_SYSTEM, agendaId);
    set((state) => ({
      syncStatusById: {
        ...state.syncStatusById,
        [agendaId]: 'pending_push',
      },
      localOnlyById: {
        ...state.localOnlyById,
        [agendaId]: false,
      },
    }));

    try {
      await deleteAntagonistAgendaRequest(getServerUrl(), projectId, agendaId);
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, agendaId);
      await get().loadAntagonistAgendas(projectId, options);
    } catch (error) {
      await markStructureMemoryMirrorDeleteError(
        projectId,
        MIRROR_SYSTEM,
        agendaId,
        error instanceof Error ? error.message : '反派议程删除同步失败',
      );
      set((state) => ({
        syncStatusById: {
          ...state.syncStatusById,
          [agendaId]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [agendaId]: false,
        },
      }));
      throw error;
    }
  },
}));
