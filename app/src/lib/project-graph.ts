import { richTextToPlainText } from '@/lib/editor-content';
import { getLoreEntityTypeLabel } from '@/lib/lore-meta';
import type { Chapter, Foreshadow, Id, LoreEntity } from '@/types';

export type GraphNodeKind = 'chapter' | 'foreshadow' | 'entity';
export type GraphEdgeKind = 'chapter_entity' | 'foreshadow_source' | 'foreshadow_resolved' | 'foreshadow_entity' | 'entity_entity';

export interface GraphNode {
  id: string;
  entityId?: Id;
  chapterId?: Id;
  foreshadowId?: Id;
  kind: GraphNodeKind;
  label: string;
  meta: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: GraphEdgeKind;
  label: string;
}

export interface ProjectGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesEntityName(text: string, entity: LoreEntity) {
  const normalizedText = normalizeText(text);

  if (!entity.name.trim()) {
    return false;
  }

  if (normalizedText.includes(normalizeText(entity.name))) {
    return true;
  }

  return Object.values(entity.fields).some((value) => {
    return typeof value === 'string' && value.trim().length >= 2 && normalizedText.includes(normalizeText(value));
  });
}

function deduplicateEdges(edges: GraphEdge[]) {
  const seen = new Set<string>();

  return edges.filter((edge) => {
    const directKey = `${edge.kind}:${edge.sourceId}:${edge.targetId}:${edge.label}`;
    const reverseKey = `${edge.kind}:${edge.targetId}:${edge.sourceId}:${edge.label}`;

    if (seen.has(directKey) || seen.has(reverseKey)) {
      return false;
    }

    seen.add(directKey);
    return true;
  });
}

function createNodeId(kind: GraphNodeKind, id: string) {
  return `${kind}:${id}`;
}

function buildEntityEntityEdges(entities: LoreEntity[]) {
  const edges: GraphEdge[] = [];

  for (let leftIndex = 0; leftIndex < entities.length; leftIndex += 1) {
    const left = entities[leftIndex];
    const leftText = [left.description, ...Object.values(left.fields).map(String), ...left.tags].join('\n');
    const leftTagSet = new Set(left.tags.map((tag) => normalizeText(tag)).filter(Boolean));

    for (let rightIndex = leftIndex + 1; rightIndex < entities.length; rightIndex += 1) {
      const right = entities[rightIndex];
      const sharedTag = right.tags.find((tag) => leftTagSet.has(normalizeText(tag)));
      const rightMentionedByLeft = includesEntityName(leftText, right);
      const leftMentionedByRight = includesEntityName(
        [right.description, ...Object.values(right.fields).map(String), ...right.tags].join('\n'),
        left,
      );

      if (!sharedTag && !rightMentionedByLeft && !leftMentionedByRight) {
        continue;
      }

      edges.push({
        id: `entity-entity:${left.id}:${right.id}:${sharedTag || 'mention'}`,
        sourceId: createNodeId('entity', left.id),
        targetId: createNodeId('entity', right.id),
        kind: 'entity_entity',
        label: sharedTag ? `共享标签：${sharedTag}` : '设定互相关联',
      });
    }
  }

  return edges;
}

function buildChapterEntityEdges(chapters: Chapter[], entities: LoreEntity[]) {
  const edges: GraphEdge[] = [];

  for (const chapter of chapters) {
    const chapterText = richTextToPlainText(chapter.content);

    for (const entity of entities) {
      if (!includesEntityName(chapterText, entity)) {
        continue;
      }

      edges.push({
        id: `chapter-entity:${chapter.id}:${entity.id}`,
        sourceId: createNodeId('chapter', chapter.id),
        targetId: createNodeId('entity', entity.id),
        kind: 'chapter_entity',
        label: '正文命中设定',
      });
    }
  }

  return edges;
}

function buildForeshadowEdges(foreshadows: Foreshadow[], entities: LoreEntity[]) {
  const edges: GraphEdge[] = [];

  for (const foreshadow of foreshadows) {
    const foreshadowNodeId = createNodeId('foreshadow', foreshadow.id);

    if (foreshadow.sourceChapterId) {
      edges.push({
        id: `foreshadow-source:${foreshadow.id}:${foreshadow.sourceChapterId}`,
        sourceId: foreshadowNodeId,
        targetId: createNodeId('chapter', foreshadow.sourceChapterId),
        kind: 'foreshadow_source',
        label: '来源章节',
      });
    }

    if (foreshadow.resolvedChapterId) {
      edges.push({
        id: `foreshadow-resolved:${foreshadow.id}:${foreshadow.resolvedChapterId}`,
        sourceId: foreshadowNodeId,
        targetId: createNodeId('chapter', foreshadow.resolvedChapterId),
        kind: 'foreshadow_resolved',
        label: '回收章节',
      });
    }

    const foreshadowText = [foreshadow.title, foreshadow.excerpt, foreshadow.notes].join('\n');

    for (const entity of entities) {
      if (!includesEntityName(foreshadowText, entity)) {
        continue;
      }

      edges.push({
        id: `foreshadow-entity:${foreshadow.id}:${entity.id}`,
        sourceId: foreshadowNodeId,
        targetId: createNodeId('entity', entity.id),
        kind: 'foreshadow_entity',
        label: '伏笔涉及设定',
      });
    }
  }

  return edges;
}

function layoutNodes(chapters: Chapter[], foreshadows: Foreshadow[], entities: LoreEntity[]) {
  const columnX = {
    chapter: 160,
    foreshadow: 500,
    entity: 880,
  } as const;
  const sectionTop = 80;
  const rowGap = 96;
  const sectionGap = 36;

  const chapterNodes: GraphNode[] = chapters
    .sort((left, right) => left.order - right.order)
    .map((chapter, index) => ({
      id: createNodeId('chapter', chapter.id),
      chapterId: chapter.id,
      kind: 'chapter',
      label: chapter.title,
      meta: `${chapter.wordCount} 字`,
      x: columnX.chapter,
      y: sectionTop + index * rowGap,
    }));

  const foreshadowNodes: GraphNode[] = foreshadows
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .map((foreshadow, index) => ({
      id: createNodeId('foreshadow', foreshadow.id),
      foreshadowId: foreshadow.id,
      kind: 'foreshadow',
      label: foreshadow.title,
      meta: foreshadow.status,
      x: columnX.foreshadow,
      y: sectionTop + index * rowGap,
    }));

  const groupedEntities = entities
    .slice()
    .sort((left, right) => {
      const typeGap = getLoreEntityTypeLabel(left.type).localeCompare(getLoreEntityTypeLabel(right.type), 'zh-CN');
      if (typeGap !== 0) {
        return typeGap;
      }

      return left.name.localeCompare(right.name, 'zh-CN');
    });

  const entityNodes: GraphNode[] = [];
  let currentY = sectionTop;
  let previousType = '';

  for (const entity of groupedEntities) {
    if (previousType && previousType !== entity.type) {
      currentY += sectionGap;
    }

    entityNodes.push({
      id: createNodeId('entity', entity.id),
      entityId: entity.id,
      kind: 'entity',
      label: entity.name,
      meta: getLoreEntityTypeLabel(entity.type),
      x: columnX.entity,
      y: currentY,
    });

    currentY += rowGap;
    previousType = entity.type;
  }

  const nodes = [...chapterNodes, ...foreshadowNodes, ...entityNodes];
  const maxY = nodes.reduce((currentMax, node) => Math.max(currentMax, node.y), sectionTop);

  return {
    nodes,
    width: 1120,
    height: maxY + 120,
  };
}

export function buildProjectGraph(input: {
  chapters: Chapter[];
  foreshadows: Foreshadow[];
  entities: LoreEntity[];
}) {
  const { nodes, width, height } = layoutNodes(input.chapters, input.foreshadows, input.entities);
  const edges = deduplicateEdges([
    ...buildChapterEntityEdges(input.chapters, input.entities),
    ...buildForeshadowEdges(input.foreshadows, input.entities),
    ...buildEntityEntityEdges(input.entities),
  ]).filter((edge) => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    return nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId);
  });

  return {
    nodes,
    edges,
    width,
    height,
  } satisfies ProjectGraph;
}
