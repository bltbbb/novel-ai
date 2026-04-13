import type { Table } from 'dexie';
import { create } from 'zustand';
import { DEFAULT_VOLUME_TITLE, db, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { useProjectStore } from '@/stores/project-store';
import type { Id, Volume } from '@/types';

interface CreateVolumeInput {
  projectId: Id;
  title?: string;
}

interface UpdateVolumeInput {
  title?: string;
  order?: number;
}

interface VolumeStoreState {
  volumes: Volume[];
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadVolumes: (projectId: Id) => Promise<void>;
  createVolume: (input: CreateVolumeInput) => Promise<Volume>;
  updateVolume: (volumeId: Id, input: UpdateVolumeInput) => Promise<void>;
  deleteVolume: (volumeId: Id) => Promise<void>;
}

function normalizeVolumeTitle(title?: string) {
  const normalized = title?.trim() ?? '';
  return normalized || DEFAULT_VOLUME_TITLE;
}

function sortVolumes(volumes: Volume[]) {
  return [...volumes].sort((left, right) => {
    if (left.order === right.order) {
      return left.title.localeCompare(right.title, 'zh-CN');
    }

    return left.order - right.order;
  });
}

export const useVolumeStore = create<VolumeStoreState>((set, get) => ({
  volumes: [],
  loadedProjectId: null,
  isLoaded: false,

  async loadVolumes(projectId) {
    const volumes = sortVolumes(await db.volumes.where('projectId').equals(projectId).toArray());

    set({
      volumes,
      loadedProjectId: projectId,
      isLoaded: true,
    });
  },

  async createVolume(input) {
    const now = createTimestamp();
    const title = normalizeVolumeTitle(input.title);
    const existingVolumes =
      get().loadedProjectId === input.projectId
        ? get().volumes
        : await db.volumes.where('projectId').equals(input.projectId).toArray();
    const maxOrder = existingVolumes.reduce((current, volume) => Math.max(current, volume.order), 0);

    const volume: Volume = {
      id: createId(),
      projectId: input.projectId,
      title,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };

    await db.volumes.put(volume);
    await touchProject(input.projectId);
    await useProjectStore.getState().loadProjects();

    const nextVolumes =
      get().loadedProjectId === input.projectId ? sortVolumes([...get().volumes, volume]) : [volume];

    set({
      volumes: nextVolumes,
      loadedProjectId: input.projectId,
      isLoaded: true,
    });

    return volume;
  },

  async updateVolume(volumeId, input) {
    const current = get().volumes.find((volume) => volume.id === volumeId) ?? (await db.volumes.get(volumeId));

    if (!current) {
      return;
    }

    const now = createTimestamp();
    const nextTitle =
      typeof input.title === 'undefined' ? current.title : normalizeVolumeTitle(input.title);
    const nextOrder =
      typeof input.order === 'number' ? Math.max(1, Math.trunc(input.order)) : current.order;
    const nextVolume: Volume = {
      ...current,
      title: nextTitle,
      order: nextOrder,
      updatedAt: now,
    };

    const reorderTables: Table<any, any>[] = [db.volumes, db.chapters as Table<any, any>];

    await db.transaction('rw', reorderTables, async () => {
      const projectVolumes = sortVolumes(
        await db.volumes.where('projectId').equals(current.projectId).toArray(),
      );

      if (current.order !== nextOrder) {
        const reorderedVolumes = projectVolumes
          .filter((volume) => volume.id !== current.id)
          .sort((left, right) => left.order - right.order);
        const insertIndex = Math.max(0, Math.min(reorderedVolumes.length, nextOrder - 1));

        reorderedVolumes.splice(insertIndex, 0, nextVolume);

        await db.volumes.bulkPut(
          reorderedVolumes.map((volume, index) => ({
            ...volume,
            order: index + 1,
            updatedAt: volume.id === nextVolume.id ? now : volume.updatedAt,
          })),
        );
      } else {
        await db.volumes.put(nextVolume);
      }

      if (current.title !== nextTitle) {
        const chapters = await db.chapters.where('volumeId').equals(current.id).toArray();

        if (chapters.length > 0) {
          await db.chapters.bulkPut(
            chapters.map((chapter) => ({
              ...chapter,
              volumeTitle: nextTitle,
              updatedAt: now,
            })),
          );
        }
      }
    });

    await touchProject(current.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      volumes: sortVolumes(
        state.volumes.map((volume) => (volume.id === volumeId ? nextVolume : volume)),
      ),
    }));
  },

  async deleteVolume(volumeId) {
    const current = get().volumes.find((volume) => volume.id === volumeId) ?? (await db.volumes.get(volumeId));

    if (!current) {
      return;
    }

    const now = createTimestamp();

    const deleteTables: Table<any, any>[] = [db.volumes, db.chapters as Table<any, any>];

    await db.transaction('rw', deleteTables, async () => {
      const projectVolumes = sortVolumes(
        await db.volumes.where('projectId').equals(current.projectId).toArray(),
      );
      let fallbackVolume =
        projectVolumes.find(
          (volume) => volume.id !== current.id && volume.title === DEFAULT_VOLUME_TITLE,
        ) ?? projectVolumes.find((volume) => volume.id !== current.id);

      if (!fallbackVolume) {
        fallbackVolume = {
          id: createId(),
          projectId: current.projectId,
          title: DEFAULT_VOLUME_TITLE,
          order: projectVolumes.length + 1,
          createdAt: now,
          updatedAt: now,
        };
        await db.volumes.put(fallbackVolume);
      }

      const chapters = await db.chapters.where('volumeId').equals(current.id).toArray();

      if (chapters.length > 0) {
        await db.chapters.bulkPut(
          chapters.map((chapter) => ({
            ...chapter,
            volumeId: fallbackVolume.id,
            volumeTitle: fallbackVolume.title,
            updatedAt: now,
          })),
        );
      }

      await db.volumes.delete(current.id);
    });

    await touchProject(current.projectId);
    await useProjectStore.getState().loadProjects();

    if (get().loadedProjectId === current.projectId) {
      const nextVolumes = sortVolumes(
        await db.volumes.where('projectId').equals(current.projectId).toArray(),
      );

      set({ volumes: nextVolumes });
    } else {
      set((state) => ({
        volumes: state.volumes.filter((volume) => volume.id !== current.id),
      }));
    }
  },
}));
