import { create } from 'zustand';
import { db, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { useProjectStore } from '@/stores/project-store';
import type { Id, RichTextDocument, Snapshot, SnapshotSource } from '@/types';

interface CreateSnapshotInput {
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  content: RichTextDocument;
  source?: SnapshotSource;
  note?: string;
}

interface SnapshotStoreState {
  snapshots: Snapshot[];
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadSnapshots: (projectId: Id) => Promise<void>;
  createSnapshot: (input: CreateSnapshotInput) => Promise<Snapshot>;
  deleteSnapshot: (snapshotId: Id) => Promise<void>;
}

function sortSnapshots(snapshots: Snapshot[]) {
  return [...snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const useSnapshotStore = create<SnapshotStoreState>((set, get) => ({
  snapshots: [],
  loadedProjectId: null,
  isLoaded: false,

  async loadSnapshots(projectId) {
    const snapshots = sortSnapshots(await db.snapshots.where('projectId').equals(projectId).toArray());

    set({
      snapshots,
      loadedProjectId: projectId,
      isLoaded: true,
    });
  },

  async createSnapshot(input) {
    const now = createTimestamp();
    const snapshot: Snapshot = {
      id: createId(),
      projectId: input.projectId,
      chapterId: input.chapterId,
      chapterTitle: input.chapterTitle.trim() || '未命名章节',
      content: input.content,
      source: input.source ?? 'manual',
      note: input.note?.trim() || '',
      createdAt: now,
      updatedAt: now,
    };

    await db.snapshots.put(snapshot);
    await touchProject(input.projectId);
    await useProjectStore.getState().loadProjects();

    const nextSnapshots =
      get().loadedProjectId === input.projectId
        ? sortSnapshots([snapshot, ...get().snapshots])
        : [snapshot];

    set({
      snapshots: nextSnapshots,
      loadedProjectId: input.projectId,
      isLoaded: true,
    });

    return snapshot;
  },

  async deleteSnapshot(snapshotId) {
    const current =
      get().snapshots.find((item) => item.id === snapshotId) ?? (await db.snapshots.get(snapshotId));

    if (!current) {
      return;
    }

    await db.snapshots.delete(snapshotId);
    await touchProject(current.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      snapshots: state.snapshots.filter((item) => item.id !== snapshotId),
    }));
  },
}));
