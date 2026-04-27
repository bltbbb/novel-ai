import { CHARACTER_STATIC_FIELD_DEFINITIONS } from '@/lib/lore-entity';
import type { Chapter, Id, LoreEntity, StrandType } from '@/types';

function isCurrentFieldKey(key: string) {
  return key.startsWith('current_');
}

function getStableEntityFieldEntries(entity: LoreEntity) {
  const fieldEntries = Object.entries(entity.fields).filter(([key, value]) => {
    return !isCurrentFieldKey(key) && value !== null && typeof value !== 'undefined' && String(value).trim();
  });

  if (entity.type !== 'character') {
    return fieldEntries;
  }

  const fieldLookup = new Map(fieldEntries);
  const orderedKeys = [...CHARACTER_STATIC_FIELD_DEFINITIONS.map((item) => item.key), ...fieldEntries.map(([key]) => key)];
  const seenKeys = new Set<string>();

  return orderedKeys
    .filter((key) => {
      if (seenKeys.has(key) || !fieldLookup.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    })
    .map((key) => [key, fieldLookup.get(key)] as const);
}

export function buildWorldStateSummary(entities: LoreEntity[]) {
  return entities
    .filter((entity) => entity.pinned)
    .slice(0, 6)
    .map((entity) => {
      const fields = getStableEntityFieldEntries(entity)
        .slice(0, 3)
        .map(([key, value]) => `${key}：${String(value)}`)
        .join('；');

      return [entity.name, entity.description, fields].filter(Boolean).join('｜');
    })
    .join('\n');
}

export function findPreviousChapter(chapters: Chapter[], currentChapterId: Id | undefined) {
  if (!currentChapterId) {
    return null;
  }

  const sortedChapters = [...chapters].sort((left, right) => left.order - right.order);
  const currentIndex = sortedChapters.findIndex((chapter) => chapter.id === currentChapterId);

  if (currentIndex <= 0) {
    return null;
  }

  return sortedChapters[currentIndex - 1];
}

export function getStrandLabel(strand: StrandType) {
  switch (strand) {
    case 'quest':
      return 'Quest 主线';
    case 'fire':
      return 'Fire 情感线';
    case 'constellation':
      return 'Constellation 世界观线';
    default:
      return strand;
  }
}
