import type { EntityRelation, GenerationRelationSnapshot } from '@/types';

function normalizeText(value: string | undefined) {
  return value?.trim() ?? '';
}

function normalizeIntensity(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(5, Math.trunc(value)));
}

export function buildGenerationRelationSnapshot(entityRelations: EntityRelation[]): GenerationRelationSnapshot[] {
  return entityRelations
    .map((relation) => ({
      id: relation.id,
      sourceEntityId: relation.sourceEntityId,
      targetEntityId: relation.targetEntityId,
      sourceEntityName: normalizeText(relation.sourceEntityName),
      targetEntityName: normalizeText(relation.targetEntityName),
      relationType: normalizeText(relation.relationType),
      origin: normalizeText(relation.origin),
      description: normalizeText(relation.description),
      currentStance: normalizeText(relation.currentStance),
      currentIntensity: normalizeIntensity(relation.currentIntensity),
      stanceReason: normalizeText(relation.stanceReason),
      draft: Boolean(relation.draft),
    }))
    .filter((relation) => relation.sourceEntityName && relation.targetEntityName && relation.relationType);
}
