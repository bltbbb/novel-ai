import type { LoreEntityType } from '@/types';

export const LORE_ENTITY_TYPE_LABELS: Record<LoreEntityType, string> = {
  character: '人物',
  faction: '势力',
  location: '地点',
  magic_system: '力量体系',
  item: '物品',
  event: '事件',
};

export function getLoreEntityTypeLabel(type: LoreEntityType) {
  return LORE_ENTITY_TYPE_LABELS[type] ?? '设定';
}
