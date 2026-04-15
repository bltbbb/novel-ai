import { richTextToPlainText } from '@/lib/editor-content';
import { CHARACTER_CARD_FIELD_TOTAL, getCharacterCardFilledCount, getLoreEntityMatchTerms } from '@/lib/lore-entity';
import { getLoreEntityTypeLabel } from '@/lib/lore-meta';
import type {
  EntityRelation,
  GenerationDebugChapterRecord,
  GenerationDebugRelationshipRecord,
  LoreEntity,
  RichTextDocument,
  SearchResult,
} from '@/types';

export interface ConsistencyHint {
  id: string;
  level: 'warning' | 'info';
  title: string;
  description: string;
  entityId?: string;
  relationId?: string;
  chapterId?: string;
}

interface AnalyzeLoreConsistencyInput {
  content: RichTextDocument;
  matchedEntities: LoreEntity[];
  allEntities: LoreEntity[];
  searchResults?: SearchResult[];
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getStringFields(entity: LoreEntity) {
  return Object.entries(entity.fields).filter(([, value]) => {
    return typeof value === 'string' && value.trim().length >= 2;
  }) as Array<[string, string]>;
}

function getContentWindow(content: string, anchor: string, radius = 42) {
  const anchorIndex = content.indexOf(anchor);

  if (anchorIndex < 0) {
    return '';
  }

  return content.slice(Math.max(anchorIndex - radius, 0), anchorIndex + anchor.length + radius);
}

function buildAlternativeFieldIndex(allEntities: LoreEntity[]) {
  const index = new Map<string, Array<{ entityId: string; value: string }>>();

  for (const entity of allEntities) {
    for (const [field, value] of getStringFields(entity)) {
      const normalizedField = normalizeText(field);
      const bucket = index.get(normalizedField) ?? [];

      bucket.push({
        entityId: entity.id,
        value,
      });

      index.set(normalizedField, bucket.filter((item, itemIndex, current) => {
        return current.findIndex((candidate) => {
          return candidate.entityId === item.entityId && normalizeText(candidate.value) === normalizeText(item.value);
        }) === itemIndex;
      }));
    }
  }

  return index;
}

function createSparseEntityHints(matchedEntities: LoreEntity[]) {
  return matchedEntities.flatMap((entity) => {
    const fieldCount = Object.keys(entity.fields).length;
    const hasDescription = entity.description.trim().length > 0;

    if (!hasDescription && fieldCount === 0) {
      return [
        {
          id: `sparse:${entity.id}`,
          level: 'info' as const,
          title: `${entity.name} 的设定信息较少`,
          description: `${getLoreEntityTypeLabel(entity.type)}条目目前没有描述和结构化字段，AI 约束会偏弱。`,
          entityId: entity.id,
        },
      ];
    }

    if (entity.type === 'character') {
      const filledCount = getCharacterCardFilledCount(entity.fields);

      if (filledCount >= CHARACTER_CARD_FIELD_TOTAL) {
        return [];
      }

      return [
        {
          id: `character-fields:${entity.id}`,
          level: 'info' as const,
          title: `${entity.name} 的人物字段偏少`,
          description: `当前已填写 ${filledCount}/${CHARACTER_CARD_FIELD_TOTAL} 项人物卡字段，建议继续补充人格内核与当前阶段状态。`,
          entityId: entity.id,
        },
      ];
    }

    return [];
  });
}

function createPinningHints(matchedEntities: LoreEntity[]) {
  if (matchedEntities.length < 3 || matchedEntities.some((entity) => entity.pinned)) {
    return [];
  }

  return [
    {
      id: 'pinning:matched-entities',
      level: 'info' as const,
      title: '当前段落命中多个设定，但没有钉选重点实体',
      description: '如果这段剧情对人物、地点或物品依赖较强，可以把关键设定钉选到上下文，减少 AI 偏写的概率。',
    },
  ];
}

function createHistoryHints(matchedEntities: LoreEntity[], searchResults: SearchResult[], plainText: string) {
  if (matchedEntities.length === 0 || searchResults.length > 0 || plainText.length < 320) {
    return [];
  }

  return [
    {
      id: 'history:missing-results',
      level: 'info' as const,
      title: '当前正文涉及设定，但没有命中历史章节片段',
      description: '如果这一段依赖前情状态，可以检查关键词是否足够明确，或手动回看相关章节与快照。',
    },
  ];
}

function createFieldConflictHints(matchedEntities: LoreEntity[], allEntities: LoreEntity[], plainText: string) {
  const hints: ConsistencyHint[] = [];
  const alternativeFieldIndex = buildAlternativeFieldIndex(allEntities);
  const normalizedContent = normalizeText(plainText);

  for (const entity of matchedEntities) {
    const matchedAnchor =
      [entity.name, ...(entity.aliases ?? [])].find((anchor) => plainText.includes(anchor)) ?? entity.name;
    const contentWindow = normalizeText(getContentWindow(plainText, matchedAnchor));

    if (!contentWindow && !getLoreEntityMatchTerms(entity).some((term) => normalizedContent.includes(term))) {
      continue;
    }

    for (const [field, canonicalValue] of getStringFields(entity)) {
      const normalizedField = normalizeText(field);
      const normalizedCanonicalValue = normalizeText(canonicalValue);
      const alternatives = (alternativeFieldIndex.get(normalizedField) ?? []).filter((item) => {
        return item.entityId !== entity.id && normalizeText(item.value) !== normalizedCanonicalValue;
      });

      if (alternatives.length === 0) {
        continue;
      }

      const targetWindow = contentWindow || normalizedContent;

      for (const alternative of alternatives) {
        if (
          targetWindow.includes(normalizeText(alternative.value)) &&
          !targetWindow.includes(normalizedCanonicalValue)
        ) {
          hints.push({
            id: `conflict:${entity.id}:${field}:${alternative.value}`,
            level: 'warning',
            title: `${entity.name} 的「${field}」可能出现冲突`,
            description: `当前正文附近更像写成了「${alternative.value}」，但设定库记录为「${canonicalValue}」。建议复核这一处表述。`,
            entityId: entity.id,
          });
          break;
        }
      }
    }
  }

  return hints;
}

function deduplicateHints(hints: ConsistencyHint[]) {
  const seen = new Set<string>();

  return hints.filter((hint) => {
    if (seen.has(hint.id)) {
      return false;
    }

    seen.add(hint.id);
    return true;
  });
}

function buildRelationPairKey(left: string, right: string) {
  return [normalizeText(left), normalizeText(right)].sort().join('::');
}

function isExplicitSnapshotRelationship(item: GenerationDebugRelationshipRecord) {
  return item.sourceKind === 'explicit_manual' || item.sourceKind === 'explicit_manual_draft';
}

export function analyzeExplicitRelationCoverage(input: {
  relations: EntityRelation[];
  chapterRecords: Pick<GenerationDebugChapterRecord, 'chapterId' | 'chapterTitle' | 'chapterOrder' | 'entitiesAppeared'>[];
  runtimeRelationships: GenerationDebugRelationshipRecord[];
}) {
  const runtimePairMap = new Map<string, GenerationDebugRelationshipRecord[]>();

  for (const item of input.runtimeRelationships) {
    if (isExplicitSnapshotRelationship(item)) {
      continue;
    }

    const sourceEntityName = item.sourceEntityName?.trim() ?? '';
    const targetEntityName = item.targetEntityName?.trim() ?? '';

    if (!sourceEntityName || !targetEntityName || !item.chapterId) {
      continue;
    }

    const pairKey = `${item.chapterId}::${buildRelationPairKey(sourceEntityName, targetEntityName)}`;
    const bucket = runtimePairMap.get(pairKey) ?? [];

    bucket.push(item);
    runtimePairMap.set(pairKey, bucket);
  }

  const hints = input.relations.flatMap((relation) => {
    if (relation.draft) {
      return [];
    }

    const sourceEntityName = relation.sourceEntityName.trim();
    const targetEntityName = relation.targetEntityName.trim();

    if (!sourceEntityName || !targetEntityName) {
      return [];
    }

    const coAppearedChapters = input.chapterRecords
      .filter((chapter) => {
        const normalizedEntitySet = new Set((chapter.entitiesAppeared ?? []).map((item) => normalizeText(item)));
        return normalizedEntitySet.has(normalizeText(sourceEntityName)) && normalizedEntitySet.has(normalizeText(targetEntityName));
      })
      .sort((left, right) => right.chapterOrder - left.chapterOrder);

    if (coAppearedChapters.length === 0) {
      return [];
    }

    const uncoveredChapters = coAppearedChapters.filter((chapter) => {
      const pairKey = `${chapter.chapterId}::${buildRelationPairKey(sourceEntityName, targetEntityName)}`;
      return (runtimePairMap.get(pairKey) ?? []).length === 0;
    });

    if (uncoveredChapters.length === 0) {
      return [];
    }

    const firstChapter = uncoveredChapters[0];

    return [
      {
        id: `relation-coverage:${relation.id}:${firstChapter.chapterId}`,
        level: 'warning' as const,
        title: `${sourceEntityName} 与 ${targetEntityName} 已同场，但关系未沉淀`,
        description: `在《${firstChapter.chapterTitle}》等 ${uncoveredChapters.length} 章里，两人已经同时出场，但运行态还没有记录到这对角色的关系变化。显式关系「${relation.relationType}」可能没有真正落到正文。`,
        entityId: relation.sourceEntityId,
        relationId: relation.id,
        chapterId: firstChapter.chapterId,
      },
    ];
  });

  return deduplicateHints(hints).slice(0, 5);
}

export function analyzeLoreConsistency(input: AnalyzeLoreConsistencyInput) {
  const plainText = richTextToPlainText(input.content);
  const searchResults = input.searchResults ?? [];

  const hints = deduplicateHints([
    ...createFieldConflictHints(input.matchedEntities, input.allEntities, plainText),
    ...createSparseEntityHints(input.matchedEntities),
    ...createPinningHints(input.matchedEntities),
    ...createHistoryHints(input.matchedEntities, searchResults, plainText),
  ]);

  return hints.slice(0, 5);
}
