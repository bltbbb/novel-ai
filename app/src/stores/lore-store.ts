import { create } from 'zustand';
import { db, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { useProjectStore } from '@/stores/project-store';
import type { Id, LoreEntity, LoreEntityFields, LoreEntityType } from '@/types';

interface CreateLoreEntityInput {
  projectId: Id;
  type: LoreEntityType;
  name: string;
  description?: string;
  fields?: LoreEntityFields;
  tags?: string[];
  pinned?: boolean;
}

interface UpdateLoreEntityInput {
  name?: string;
  description?: string;
  fields?: LoreEntityFields;
  tags?: string[];
  pinned?: boolean;
}

interface LoreStoreState {
  entities: LoreEntity[];
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadEntities: (projectId: Id, type?: LoreEntityType) => Promise<void>;
  createEntity: (input: CreateLoreEntityInput) => Promise<LoreEntity>;
  updateEntity: (entityId: Id, input: UpdateLoreEntityInput) => Promise<void>;
  deleteEntity: (entityId: Id) => Promise<void>;
  togglePin: (entityId: Id) => Promise<void>;
}

function sortEntities(entities: LoreEntity[]) {
  return [...entities].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export const useLoreStore = create<LoreStoreState>((set, get) => ({
  entities: [],
  loadedProjectId: null,
  isLoaded: false,

  async loadEntities(projectId, type) {
    const entities = type
      ? await db.entities.where('[projectId+type]').equals([projectId, type]).sortBy('name')
      : await db.entities.where('projectId').equals(projectId).sortBy('name');

    set({
      entities,
      loadedProjectId: projectId,
      isLoaded: true,
    });
  },

  async createEntity(input) {
    const now = createTimestamp();
    const entity: LoreEntity = {
      id: createId(),
      projectId: input.projectId,
      type: input.type,
      name: input.name.trim() || '未命名设定',
      description: input.description?.trim() || '',
      fields: input.fields ?? {},
      tags: input.tags ?? [],
      pinned: input.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await db.entities.put(entity);
    await touchProject(input.projectId);
    await useProjectStore.getState().loadProjects();

    const nextEntities =
      get().loadedProjectId === input.projectId ? sortEntities([...get().entities, entity]) : [entity];

    set({
      entities: nextEntities,
      loadedProjectId: input.projectId,
      isLoaded: true,
    });

    return entity;
  },

  async updateEntity(entityId, input) {
    const current = get().entities.find((entity) => entity.id === entityId) ?? (await db.entities.get(entityId));

    if (!current) {
      return;
    }

    const nextEntity: LoreEntity = {
      ...current,
      ...input,
      name: input.name?.trim() || current.name,
      description: input.description?.trim() ?? current.description,
      fields: input.fields ?? current.fields,
      tags: input.tags ?? current.tags,
      pinned: input.pinned ?? current.pinned,
      updatedAt: createTimestamp(),
    };

    await db.entities.put(nextEntity);
    await touchProject(nextEntity.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      entities: sortEntities(
        state.entities.map((entity) => (entity.id === entityId ? nextEntity : entity)),
      ),
    }));
  },

  async deleteEntity(entityId) {
    const current = get().entities.find((entity) => entity.id === entityId) ?? (await db.entities.get(entityId));

    if (!current) {
      return;
    }

    await db.entities.delete(entityId);
    await touchProject(current.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      entities: state.entities.filter((entity) => entity.id !== entityId),
    }));
  },

  async togglePin(entityId) {
    const current = get().entities.find((entity) => entity.id === entityId) ?? (await db.entities.get(entityId));

    if (!current) {
      return;
    }

    const nextEntity: LoreEntity = {
      ...current,
      pinned: !current.pinned,
      updatedAt: createTimestamp(),
    };

    await db.entities.put(nextEntity);
    await touchProject(nextEntity.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      entities: sortEntities(
        state.entities.map((entity) => (entity.id === entityId ? nextEntity : entity)),
      ),
    }));
  },
}));
