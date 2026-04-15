import type { Id, LoreEntity, LoreEntityFieldValue, LoreEntityFields } from '@/types';

export interface CharacterFieldDefinition {
  key: string;
  label: string;
  placeholder: string;
}

export const CHARACTER_STATIC_FIELD_DEFINITIONS: CharacterFieldDefinition[] = [
  { key: 'static_desire', label: '核心欲望', placeholder: '人物最底层想要得到什么' },
  { key: 'static_fear', label: '核心恐惧', placeholder: '最害怕失去什么或变成什么' },
  { key: 'static_values', label: '价值排序', placeholder: '做选择时先看什么、后看什么' },
  { key: 'static_trueNature', label: '真实底色', placeholder: '卸掉伪装后的内在本质' },
  { key: 'static_speechStyle', label: '说话方式', placeholder: '常用表达、语气、忌讳表达' },
  { key: 'static_decisionStyle', label: '决策习惯', placeholder: '先试探、先算账还是先出手' },
  { key: 'static_conflictResponse', label: '冲突反应', placeholder: '高压场景下的固定反应' },
  { key: 'static_taboos', label: '底线禁忌', placeholder: '绝不跨越的线' },
];

export const CHARACTER_DYNAMIC_FIELD_DEFINITIONS: CharacterFieldDefinition[] = [
  { key: 'current_stance', label: '当前立场', placeholder: '当前阶段相信什么、站在哪边' },
  { key: 'current_wound', label: '当前伤口', placeholder: '当前最痛的缺口与阴影' },
  { key: 'current_goal', label: '当前目标', placeholder: '这阶段最想完成什么' },
  { key: 'current_disguise', label: '当前伪装', placeholder: '对外呈现出的身份或面具' },
];

export const CHARACTER_CARD_FIELD_TOTAL =
  CHARACTER_STATIC_FIELD_DEFINITIONS.length + CHARACTER_DYNAMIC_FIELD_DEFINITIONS.length;

function normalizeText(value: string) {
  return value.trim();
}

function isFilledFieldValue(value: LoreEntityFieldValue | unknown) {
  if (value === null || typeof value === 'undefined') {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
}

export function normalizeLoreEntityAliases(aliases: string[] | undefined | null) {
  return Array.from(
    new Set(
      (aliases ?? [])
        .map((alias) => normalizeText(alias))
        .filter(Boolean),
    ),
  );
}

export function normalizeLoreEntityFields(fields: LoreEntityFields | undefined | null) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).filter(([, value]) => {
      return value !== undefined;
    }),
  ) as LoreEntityFields;
}

export function normalizeLoreEntity(entity: LoreEntity | null | undefined): LoreEntity | null {
  if (!entity) {
    return null;
  }

  return {
    ...entity,
    description: entity.description?.trim() || '',
    fields: normalizeLoreEntityFields(entity.fields),
    tags: Array.from(
      new Set(
        (entity.tags ?? [])
          .map((tag) => normalizeText(tag))
          .filter(Boolean),
      ),
    ),
    aliases: normalizeLoreEntityAliases(entity.aliases),
    draft: Boolean(entity.draft),
  };
}

export function getLoreEntityMatchTerms(entity: LoreEntity) {
  return Array.from(
    new Set(
      [entity.name, ...(entity.aliases ?? [])]
        .map((term) => normalizeText(term).toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function buildLoreEntityIdLookup(entities: LoreEntity[]) {
  const lookup = new Map<string, Id>();

  for (const rawEntity of entities) {
    const entity = normalizeLoreEntity(rawEntity);

    if (!entity) {
      continue;
    }

    for (const term of [entity.name, ...(entity.aliases ?? [])]) {
      const trimmed = normalizeText(term);

      if (!trimmed) {
        continue;
      }

      lookup.set(trimmed, entity.id);
      lookup.set(trimmed.toLowerCase(), entity.id);
    }
  }

  return lookup;
}

export function getCharacterCardFilledCount(fields: LoreEntityFields | undefined | null) {
  return [
    ...CHARACTER_STATIC_FIELD_DEFINITIONS,
    ...CHARACTER_DYNAMIC_FIELD_DEFINITIONS,
  ].reduce((count, definition) => {
    return count + (isFilledFieldValue(fields?.[definition.key]) ? 1 : 0);
  }, 0);
}

export function getCharacterCardCompleteness(entity: LoreEntity) {
  const filled = getCharacterCardFilledCount(entity.fields);
  const total = CHARACTER_CARD_FIELD_TOTAL;
  const ratio = total > 0 ? filled / total : 0;
  const level = ratio >= 0.8 ? 'high' : ratio >= 0.4 ? 'medium' : 'low';

  return {
    filled,
    total,
    level,
  };
}
