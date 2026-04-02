import type { Chapter, Id, LoreEntity, StrandType } from '@/types';

export function buildWorldStateSummary(entities: LoreEntity[]) {
  return entities
    .filter((entity) => entity.pinned)
    .slice(0, 6)
    .map((entity) => {
      const fields = Object.entries(entity.fields)
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
