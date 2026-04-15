import { create } from 'zustand';
import { db, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { useProjectStore } from '@/stores/project-store';
import type { EntityRelation, Id } from '@/types';

interface CreateEntityRelationInput {
  projectId: Id;
  sourceEntityId: Id;
  targetEntityId: Id;
  sourceEntityName: string;
  targetEntityName: string;
  relationType: string;
  origin?: string;
  description?: string;
  currentStance?: string;
  currentIntensity?: number;
  stanceReason?: string;
  draft?: boolean;
}

interface UpdateEntityRelationInput {
  sourceEntityId?: Id;
  targetEntityId?: Id;
  sourceEntityName?: string;
  targetEntityName?: string;
  relationType?: string;
  origin?: string;
  description?: string;
  currentStance?: string;
  currentIntensity?: number;
  stanceReason?: string;
  draft?: boolean;
}

interface EntityRelationStoreState {
  entityRelations: EntityRelation[];
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadEntityRelations: (projectId: Id) => Promise<void>;
  createEntityRelation: (input: CreateEntityRelationInput) => Promise<EntityRelation>;
  updateEntityRelation: (relationId: Id, input: UpdateEntityRelationInput) => Promise<void>;
  deleteEntityRelation: (relationId: Id) => Promise<void>;
}

function normalizeText(value: string | undefined) {
  return value?.trim() ?? '';
}

function normalizeIntensity(value: number | undefined, fallback = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(5, Math.trunc(value)));
}

function normalizeEntityRelation(relation: EntityRelation): EntityRelation {
  return {
    ...relation,
    sourceEntityName: normalizeText(relation.sourceEntityName),
    targetEntityName: normalizeText(relation.targetEntityName),
    relationType: normalizeText(relation.relationType),
    origin: normalizeText(relation.origin),
    description: normalizeText(relation.description),
    currentStance: normalizeText(relation.currentStance),
    currentIntensity: normalizeIntensity(relation.currentIntensity),
    stanceReason: normalizeText(relation.stanceReason),
    draft: Boolean(relation.draft),
  };
}

function sortEntityRelations(entityRelations: EntityRelation[]) {
  return [...entityRelations].sort((left, right) => {
    if (left.updatedAt === right.updatedAt) {
      return `${left.sourceEntityName}-${left.targetEntityName}`.localeCompare(
        `${right.sourceEntityName}-${right.targetEntityName}`,
        'zh-CN',
      );
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export const useEntityRelationStore = create<EntityRelationStoreState>((set, get) => ({
  entityRelations: [],
  loadedProjectId: null,
  isLoaded: false,

  async loadEntityRelations(projectId) {
    const entityRelations = sortEntityRelations(
      (await db.entityRelations.where('projectId').equals(projectId).toArray()).map(normalizeEntityRelation),
    );

    set({
      entityRelations,
      loadedProjectId: projectId,
      isLoaded: true,
    });
  },

  async createEntityRelation(input) {
    const now = createTimestamp();
    const relation = normalizeEntityRelation({
      id: createId(),
      projectId: input.projectId,
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      sourceEntityName: input.sourceEntityName,
      targetEntityName: input.targetEntityName,
      relationType: input.relationType,
      origin: input.origin ?? '',
      description: input.description ?? '',
      currentStance: input.currentStance ?? '',
      currentIntensity: normalizeIntensity(input.currentIntensity, 0),
      stanceReason: input.stanceReason ?? '',
      draft: Boolean(input.draft),
      createdAt: now,
      updatedAt: now,
    });

    await db.entityRelations.put(relation);
    await touchProject(input.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      entityRelations:
        state.loadedProjectId === input.projectId
          ? sortEntityRelations([...state.entityRelations, relation])
          : [relation],
      loadedProjectId: input.projectId,
      isLoaded: true,
    }));

    return relation;
  },

  async updateEntityRelation(relationId, input) {
    const current =
      get().entityRelations.find((relation) => relation.id === relationId) ??
      (await db.entityRelations.get(relationId));

    if (!current) {
      return;
    }

    const nextRelation = normalizeEntityRelation({
      ...current,
      ...input,
      sourceEntityId: input.sourceEntityId ?? current.sourceEntityId,
      targetEntityId: input.targetEntityId ?? current.targetEntityId,
      sourceEntityName: normalizeText(input.sourceEntityName) || current.sourceEntityName,
      targetEntityName: normalizeText(input.targetEntityName) || current.targetEntityName,
      relationType: normalizeText(input.relationType) || current.relationType,
      origin: typeof input.origin === 'string' ? input.origin : current.origin,
      description: typeof input.description === 'string' ? input.description : current.description,
      currentStance: typeof input.currentStance === 'string' ? input.currentStance : current.currentStance,
      currentIntensity:
        typeof input.currentIntensity === 'number'
          ? normalizeIntensity(input.currentIntensity, current.currentIntensity)
          : current.currentIntensity,
      stanceReason: typeof input.stanceReason === 'string' ? input.stanceReason : current.stanceReason,
      draft: typeof input.draft === 'boolean' ? input.draft : current.draft,
      updatedAt: createTimestamp(),
    });

    await db.entityRelations.put(nextRelation);
    await touchProject(nextRelation.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      entityRelations: sortEntityRelations(
        state.entityRelations.map((relation) => (relation.id === relationId ? nextRelation : relation)),
      ),
    }));
  },

  async deleteEntityRelation(relationId) {
    const current =
      get().entityRelations.find((relation) => relation.id === relationId) ??
      (await db.entityRelations.get(relationId));

    if (!current) {
      return;
    }

    await db.entityRelations.delete(relationId);
    await touchProject(current.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      entityRelations: state.entityRelations.filter((relation) => relation.id !== relationId),
    }));
  },
}));
