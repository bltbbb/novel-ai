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
  createPovPermission as createPovPermissionRequest,
  deletePovPermission as deletePovPermissionRequest,
  fetchPovPermissions,
  type FetchPovPermissionsOptions,
  type POVPermissionMutationInput,
  updatePovPermission as updatePovPermissionRequest,
} from '@/lib/structure-memory-client';
import { useSettingsStore } from '@/stores/settings-store';
import type { Id, POVPermission, StructureMemorySyncStatus } from '@/types';

const MIRROR_SYSTEM = 'pov_permission';

interface PovPermissionStoreState {
  povPermissions: POVPermission[];
  syncStatusById: Record<Id, StructureMemorySyncStatus>;
  localOnlyById: Record<Id, boolean>;
  activePovPermissionId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadPovPermissions: (projectId: Id, options?: FetchPovPermissionsOptions) => Promise<void>;
  setActivePovPermission: (permissionId: Id | null) => void;
  createPovPermission: (
    input: POVPermissionMutationInput,
    options?: FetchPovPermissionsOptions,
  ) => Promise<POVPermission>;
  updatePovPermission: (
    permissionId: Id,
    input: POVPermissionMutationInput,
    options?: FetchPovPermissionsOptions,
  ) => Promise<POVPermission>;
  deletePovPermission: (projectId: Id, permissionId: Id, options?: FetchPovPermissionsOptions) => Promise<void>;
}

function getServerUrl() {
  return useSettingsStore.getState().settings.serverUrl;
}

export const usePovPermissionStore = create<PovPermissionStoreState>((set, get) => ({
  povPermissions: [],
  syncStatusById: {},
  localOnlyById: {},
  activePovPermissionId: null,
  loadedProjectId: null,
  isLoaded: false,

  async loadPovPermissions(projectId, options) {
    const cached = await loadStructureMemoryMirror<POVPermission>(projectId, MIRROR_SYSTEM);

    if (cached.hasMirror) {
      set((state) => ({
        povPermissions: cached.items,
        syncStatusById: cached.syncStatusById,
        localOnlyById: cached.localOnlyById,
        activePovPermissionId:
          state.loadedProjectId === projectId && cached.items.some((item) => item.id === state.activePovPermissionId)
            ? state.activePovPermissionId
            : cached.items[0]?.id ?? null,
        loadedProjectId: projectId,
        isLoaded: true,
      }));
    }

    try {
      const result = await fetchPovPermissions(getServerUrl(), projectId, options);
      const mirrored = await syncStructureMemoryMirrorFromServer(projectId, MIRROR_SYSTEM, result.items);

      set((state) => ({
        povPermissions: mirrored.items,
        syncStatusById: mirrored.syncStatusById,
        localOnlyById: mirrored.localOnlyById,
        activePovPermissionId:
          state.loadedProjectId === projectId && mirrored.items.some((item) => item.id === state.activePovPermissionId)
            ? state.activePovPermissionId
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

  setActivePovPermission(permissionId) {
    set({
      activePovPermissionId: permissionId,
    });
  },

  async createPovPermission(input, options) {
    try {
      const item = await createPovPermissionRequest(getServerUrl(), input);
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadPovPermissions(item.projectId, options);
      set({
        activePovPermissionId: item.id,
      });
      return item;
    } catch (error) {
      const localItem: POVPermission = {
        id: createId(),
        projectId: input.projectId,
        volumeId: input.volumeId ?? null,
        volumeTitle: input.volumeTitle?.trim() || '',
        milestoneIndex:
          typeof input.milestoneIndex === 'number' ? Math.max(0, Math.trunc(input.milestoneIndex)) : null,
        chapterId: input.chapterId ?? null,
        chapterTitle: input.chapterTitle?.trim() || '',
        povCharacterId: input.povCharacterId ?? null,
        povCharacterName: input.povCharacterName?.trim() || '',
        readerKnows: [...(input.readerKnows ?? [])],
        protagonistKnows: [...(input.protagonistKnows ?? [])],
        antagonistKnows: [...(input.antagonistKnows ?? [])],
        mustHide: [...(input.mustHide ?? [])],
        canHint: [...(input.canHint ?? [])],
        forbiddenReveal: [...(input.forbiddenReveal ?? [])],
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
      };

      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, localItem);
      await markStructureMemoryMirrorUpsertError(
        MIRROR_SYSTEM,
        localItem,
        error instanceof Error ? error.message : '信息权限创建同步失败',
      );

      set((state) => ({
        povPermissions: [localItem, ...state.povPermissions.filter((item) => item.id !== localItem.id)],
        syncStatusById: {
          ...state.syncStatusById,
          [localItem.id]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [localItem.id]: true,
        },
        activePovPermissionId: localItem.id,
        loadedProjectId: input.projectId,
        isLoaded: true,
      }));

      return localItem;
    }
  },

  async updatePovPermission(permissionId, input, options) {
    const current = get().povPermissions.find((item) => item.id === permissionId) ?? null;
    const isLocalOnly = get().localOnlyById[permissionId] === true;
    const optimisticItem = current
      ? ({
          ...current,
          ...input,
          id: current.id,
          projectId: current.projectId,
          updatedAt: createTimestamp(),
        } satisfies POVPermission)
      : null;

    if (optimisticItem) {
      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, optimisticItem);
      set((state) => ({
        povPermissions: state.povPermissions.map((item) => (item.id === permissionId ? optimisticItem : item)),
        syncStatusById: {
          ...state.syncStatusById,
          [permissionId]: 'pending_push',
        },
      }));
    }

    try {
      const item = isLocalOnly
        ? await createPovPermissionRequest(getServerUrl(), input)
        : await updatePovPermissionRequest(getServerUrl(), permissionId, input);
      if (isLocalOnly) {
        await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, permissionId);
      }
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadPovPermissions(item.projectId, options);
      set({
        activePovPermissionId: item.id,
      });
      return item;
    } catch (error) {
      if (optimisticItem) {
        await markStructureMemoryMirrorUpsertError(
          MIRROR_SYSTEM,
          optimisticItem,
          error instanceof Error ? error.message : '信息权限同步失败',
        );
        set((state) => ({
          syncStatusById: {
            ...state.syncStatusById,
            [permissionId]: 'sync_error',
          },
          localOnlyById: {
            ...state.localOnlyById,
            [permissionId]: isLocalOnly,
          },
        }));
      }
      throw error;
    }
  },

  async deletePovPermission(projectId, permissionId, options) {
    if (get().localOnlyById[permissionId]) {
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, permissionId);
      set((state) => {
        const nextItems = state.povPermissions.filter((item) => item.id !== permissionId);
        const nextSyncStatusById = { ...state.syncStatusById };
        const nextLocalOnlyById = { ...state.localOnlyById };
        delete nextSyncStatusById[permissionId];
        delete nextLocalOnlyById[permissionId];

        return {
          povPermissions: nextItems,
          syncStatusById: nextSyncStatusById,
          localOnlyById: nextLocalOnlyById,
          activePovPermissionId:
            state.activePovPermissionId === permissionId ? nextItems[0]?.id ?? null : state.activePovPermissionId,
        };
      });
      return;
    }

    await markStructureMemoryMirrorPendingDelete(projectId, MIRROR_SYSTEM, permissionId);
    set((state) => ({
      syncStatusById: {
        ...state.syncStatusById,
        [permissionId]: 'pending_push',
      },
      localOnlyById: {
        ...state.localOnlyById,
        [permissionId]: false,
      },
    }));

    try {
      await deletePovPermissionRequest(getServerUrl(), projectId, permissionId);
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, permissionId);
      await get().loadPovPermissions(projectId, options);
    } catch (error) {
      await markStructureMemoryMirrorDeleteError(
        projectId,
        MIRROR_SYSTEM,
        permissionId,
        error instanceof Error ? error.message : '信息权限删除同步失败',
      );
      set((state) => ({
        syncStatusById: {
          ...state.syncStatusById,
          [permissionId]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [permissionId]: false,
        },
      }));
      throw error;
    }
  },
}));
