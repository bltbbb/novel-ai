import { normalizeLoreEntity } from '@/lib/lore-entity';
import type { GenerationEntitySnapshot, LoreEntity } from '@/types';

export function buildGenerationEntitySnapshot(entities: LoreEntity[]): GenerationEntitySnapshot[] {
  return entities
    .map((entity) => normalizeLoreEntity(entity))
    .filter((entity): entity is LoreEntity => Boolean(entity))
    .map((entity) => ({
      name: entity.name.trim(),
      type: entity.type,
      description: entity.description,
      fields: entity.fields,
      tags: [...entity.tags],
      aliases: [...(entity.aliases ?? [])],
      pinned: entity.pinned,
      draft: Boolean(entity.draft),
    }))
    .filter((entity) => entity.name);
}
