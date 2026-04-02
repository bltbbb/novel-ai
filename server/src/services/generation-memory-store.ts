import type { ServerEnv } from '../config/env.js';
import type {
  ChapterOutlineDraft,
  ChapterSummaryDraft,
  StateChangeDraft,
} from '../types/ai.js';
import { getGenerationDatabase } from './generation-sqlite.js';

interface ReplaceGenerationMemoryChunksInput {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  outline: ChapterOutlineDraft | null;
  summary: ChapterSummaryDraft;
  stateChanges: StateChangeDraft[];
  content: string;
}

type MemoryChunkRecord = {
  id: string;
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  chunkKind: 'parent' | 'child';
  sourceKind: 'summary' | 'scene';
  chunkIndex: number;
  timeAnchor: string;
  summaryExcerpt: string;
  tokenCount: number;
  entityRefs: string[];
  locations: string[];
  metadata: Record<string, unknown>;
  content: string;
};

function nowIsoString() {
  return new Date().toISOString();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim();
}

function buildChunkId(
  projectId: string,
  chapterId: string,
  chunkKind: MemoryChunkRecord['chunkKind'],
  chunkIndex: number,
) {
  return ['mem', projectId, chapterId, chunkKind, chunkIndex].join(':');
}

function extractLocations(stateChanges: StateChangeDraft[]) {
  return Array.from(
    new Set(
      stateChanges
        .filter((change) => /位置|地点|location|所在地/i.test(change.field))
        .map((change) => normalizeText(change.newValue))
        .filter(Boolean),
    ),
  );
}

function estimateTokenCount(content: string) {
  const trimmed = normalizeText(content);

  if (!trimmed) {
    return 0;
  }

  return Math.max(1, Math.ceil(trimmed.length * 0.7));
}

function splitParagraphs(content: string) {
  const normalized = content.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return [] as string[];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  return normalized
    .split(/(?<=[。！？!?；;])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function createUniqueList(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function buildParentChunkContent(
  input: ReplaceGenerationMemoryChunksInput,
  entityRefs: string[],
  locations: string[],
) {
  return [
    `章节：${input.chapterTitle}`,
    input.chapterOrder ? `章节序号：第${input.chapterOrder}章` : '',
    input.volumeTitle ? `卷名：${input.volumeTitle}` : '',
    input.outline?.timeAnchor ? `时间锚点：${input.outline.timeAnchor}` : '',
    input.outline?.strand ? `Strand：${input.outline.strand}` : '',
    `摘要：${input.summary.summary}`,
    input.summary.hook ? `钩子：${input.summary.hook}` : '',
    input.summary.foreshadowings.length > 0 ? `伏笔：${input.summary.foreshadowings.join('；')}` : '',
    input.outline?.beats.length ? `Beats：${input.outline.beats.join(' | ')}` : '',
    input.outline?.immutableFacts.length ? `不可变事实：${input.outline.immutableFacts.join('；')}` : '',
    entityRefs.length > 0 ? `实体：${entityRefs.join('、')}` : '',
    locations.length > 0 ? `地点：${locations.join('、')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildChildChunks(
  input: ReplaceGenerationMemoryChunksInput,
  entityRefs: string[],
  locations: string[],
) {
  const paragraphs = splitParagraphs(input.content);

  if (paragraphs.length === 0) {
    return [] as Array<{
      chunkIndex: number;
      content: string;
      entityRefs: string[];
      locations: string[];
      metadata: Record<string, unknown>;
    }>;
  }

  const targetChunkCount = Math.max(3, Math.min(5, Math.ceil(paragraphs.join('\n\n').length / 1200)));
  const targetChunkLength = Math.max(600, Math.ceil(paragraphs.join('\n\n').length / targetChunkCount));
  const chunks: Array<{
    chunkIndex: number;
    content: string;
    entityRefs: string[];
    locations: string[];
    metadata: Record<string, unknown>;
  }> = [];
  let buffer: string[] = [];
  let bufferLength = 0;

  function flushBuffer(force = false) {
    if (buffer.length === 0) {
      return;
    }

    if (!force && bufferLength < targetChunkLength && chunks.length < targetChunkCount - 1) {
      return;
    }

    const chunkContent = buffer.join('\n\n').trim();

    if (!chunkContent) {
      buffer = [];
      bufferLength = 0;
      return;
    }

    const matchedEntities = entityRefs.filter((entityName) => chunkContent.includes(entityName));
    const matchedLocations = locations.filter((location) => chunkContent.includes(location));
    chunks.push({
      chunkIndex: chunks.length,
      content: chunkContent,
      entityRefs: matchedEntities.length > 0 ? matchedEntities : entityRefs.slice(0, 4),
      locations: matchedLocations.length > 0 ? matchedLocations : locations.slice(0, 3),
      metadata: {
        paragraphCount: buffer.length,
        beatHint: input.outline?.beats[chunks.length] ?? '',
      },
    });
    buffer = [];
    bufferLength = 0;
  }

  for (const paragraph of paragraphs) {
    buffer.push(paragraph);
    bufferLength += paragraph.length;
    flushBuffer(false);
  }

  flushBuffer(true);

  return chunks;
}

function buildMemoryChunks(input: ReplaceGenerationMemoryChunksInput) {
  const summaryExcerpt = normalizeText(input.summary.summary).slice(0, 160);
  const entityRefs = createUniqueList(input.stateChanges.map((change) => normalizeText(change.entityName))).slice(0, 8);
  const locations = extractLocations(input.stateChanges).slice(0, 6);
  const parentContent = buildParentChunkContent(input, entityRefs, locations);
  const parentChunk: MemoryChunkRecord = {
    id: buildChunkId(input.projectId, input.chapterId, 'parent', 0),
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    chapterOrder: Math.max(0, Math.trunc(input.chapterOrder ?? 0)),
    volumeTitle: input.volumeTitle?.trim() ?? '',
    chunkKind: 'parent',
    sourceKind: 'summary',
    chunkIndex: 0,
    timeAnchor: input.outline?.timeAnchor ?? '',
    summaryExcerpt,
    tokenCount: estimateTokenCount(parentContent),
    entityRefs,
    locations,
    metadata: {
      hook: input.summary.hook,
      foreshadowings: input.summary.foreshadowings,
      beatCount: input.outline?.beats.length ?? 0,
      immutableFactCount: input.outline?.immutableFacts.length ?? 0,
    },
    content: parentContent,
  };
  const childChunks = buildChildChunks(input, entityRefs, locations).map((chunk) => ({
    id: buildChunkId(input.projectId, input.chapterId, 'child', chunk.chunkIndex),
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    chapterOrder: Math.max(0, Math.trunc(input.chapterOrder ?? 0)),
    volumeTitle: input.volumeTitle?.trim() ?? '',
    chunkKind: 'child' as const,
    sourceKind: 'scene' as const,
    chunkIndex: chunk.chunkIndex,
    timeAnchor: input.outline?.timeAnchor ?? '',
    summaryExcerpt,
    tokenCount: estimateTokenCount(chunk.content),
    entityRefs: chunk.entityRefs,
    locations: chunk.locations,
    metadata: chunk.metadata,
    content: chunk.content,
  }));

  return [parentChunk, ...childChunks];
}

export function replaceGenerationMemoryChunks(
  env: ServerEnv,
  input: ReplaceGenerationMemoryChunksInput,
) {
  const chunks = buildMemoryChunks(input);
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();
  const deleteStatement = db.prepare('DELETE FROM generation_memory_chunks WHERE project_id = ? AND chapter_id = ?');
  const insertStatement = db.prepare(`
    INSERT INTO generation_memory_chunks (
      id,
      project_id,
      chapter_id,
      chapter_title,
      chapter_order,
      volume_title,
      chunk_kind,
      source_kind,
      chunk_index,
      time_anchor,
      summary_excerpt,
      token_count,
      entity_refs_json,
      locations_json,
      metadata_json,
      content,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');

  try {
    deleteStatement.run(input.projectId, input.chapterId);

    for (const chunk of chunks) {
      insertStatement.run(
        chunk.id,
        chunk.projectId,
        chunk.chapterId,
        chunk.chapterTitle,
        chunk.chapterOrder,
        chunk.volumeTitle,
        chunk.chunkKind,
        chunk.sourceKind,
        chunk.chunkIndex,
        chunk.timeAnchor,
        chunk.summaryExcerpt,
        chunk.tokenCount,
        JSON.stringify(chunk.entityRefs),
        JSON.stringify(chunk.locations),
        JSON.stringify(chunk.metadata),
        chunk.content,
        currentTime,
        currentTime,
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    totalChunks: chunks.length,
    parentChunkCount: chunks.filter((chunk) => chunk.chunkKind === 'parent').length,
    childChunkCount: chunks.filter((chunk) => chunk.chunkKind === 'child').length,
  };
}
