import type { ServerEnv } from '../config/env.js';
import type {
  ChapterOutlineDraft,
  ChapterSummaryDraft,
  GenerationMemoryEmbeddingSkipReasonCounts,
  GenerationVectorBackendStatus,
  StateChangeDraft,
} from '../types/ai.js';
import { ensureGenerationMemoryEmbeddingAssets } from './generation-embedding-store.js';
import { replaceGenerationMemoryChunks } from './generation-memory-store.js';
import { getGenerationDatabase } from './generation-sqlite.js';
import { getGenerationVectorBackendStatus } from './generation-vector-backend.js';
import {
  backfillGenerationVolumeRecaps,
  type GenerationVolumeRecapBackfillResult,
} from './generation-volume-recap-store.js';

interface GenerationBackfillRequest {
  projectId: string;
  chapterId?: string;
  limit?: number;
}

export interface GenerationMemoryChunkBackfillResult {
  projectId: string;
  totalCandidates: number;
  processedChapters: number;
  skippedChapters: number;
  missingContentChapters: number;
  totalChunks: number;
  parentChunks: number;
  childChunks: number;
  processedChapterIds: string[];
}

export interface GenerationMemoryEmbeddingBackfillResult {
  projectId: string;
  totalCandidates: number;
  createdChunks: number;
  rebuiltChunks: number;
  embeddedChunks: number;
  reusedChunks: number;
  skippedChunks: number;
  skipReasonCounts: GenerationMemoryEmbeddingSkipReasonCounts;
  processedChunkIds: string[];
  embeddingModel: string | null;
  vectorBackend: GenerationVectorBackendStatus;
}

export type { GenerationVolumeRecapBackfillResult };

interface BackfillCandidateRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  timeAnchor: string;
  strand: string;
  beats: string[];
  immutableFacts: string[];
  hookType: string;
  hookStrength: 'soft' | 'medium' | 'strong';
  summary: string;
  hook: string;
  foreshadowings: string[];
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function parseStringArrayJson(rawText: string | null | undefined) {
  if (!rawText) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [];
  } catch {
    return [] as string[];
  }
}

function normalizeHookStrength(value: string): 'soft' | 'medium' | 'strong' {
  return value === 'soft' || value === 'medium' || value === 'strong' ? value : 'medium';
}

function createEmptySkipReasonCounts(): GenerationMemoryEmbeddingSkipReasonCounts {
  return {
    embeddingDisabled: 0,
    emptyContent: 0,
    embeddingFailed: 0,
  };
}

function buildOutline(row: BackfillCandidateRow): ChapterOutlineDraft {
  return {
    goal: '',
    obstacle: '',
    cost: '',
    beats: row.beats,
    timeAnchor: row.timeAnchor,
    chapterTimeSpan: '',
    gapFromPrevious: '',
    strand: row.strand === 'fire' || row.strand === 'constellation' ? row.strand : 'quest',
    hookType: row.hookType,
    hookStrength: row.hookStrength,
    immutableFacts: row.immutableFacts,
  };
}

function buildSummary(row: BackfillCandidateRow): ChapterSummaryDraft {
  return {
    summary: row.summary || '本章完成了阶段性推进。',
    hook: row.hook,
    foreshadowings: row.foreshadowings,
  };
}

function loadBackfillCandidates(env: ServerEnv, request: GenerationBackfillRequest) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          idx.chapter_id,
          idx.chapter_title,
          idx.chapter_order,
          idx.volume_title,
          idx.time_anchor,
          idx.strand,
          idx.beats_json,
          idx.immutable_facts_json,
          idx.hook_type,
          idx.hook_strength,
          sums.summary,
          sums.hook,
          sums.foreshadowings_json
        FROM generation_chapter_index idx
        LEFT JOIN generation_chapter_summaries sums
          ON sums.project_id = idx.project_id AND sums.chapter_id = idx.chapter_id
        WHERE idx.project_id = ?
        ORDER BY idx.chapter_order ASC, idx.updated_at ASC
      `,
    )
    .all(request.projectId) as Array<Record<string, unknown>>;
  const candidates = rows
    .map(
      (row): BackfillCandidateRow => ({
        chapterId: asString(row.chapter_id),
        chapterTitle: asString(row.chapter_title),
        chapterOrder: Number(row.chapter_order ?? 0),
        volumeTitle: asString(row.volume_title),
        timeAnchor: asString(row.time_anchor),
        strand: asString(row.strand),
        beats: parseStringArrayJson(asString(row.beats_json)),
        immutableFacts: parseStringArrayJson(asString(row.immutable_facts_json)),
        hookType: asString(row.hook_type),
        hookStrength: normalizeHookStrength(asString(row.hook_strength)),
        summary: asString(row.summary),
        hook: asString(row.hook),
        foreshadowings: parseStringArrayJson(asString(row.foreshadowings_json)),
      }),
    )
    .filter((row) => row.chapterId && (!request.chapterId || row.chapterId === request.chapterId));

  if (!request.limit || request.limit <= 0) {
    return candidates;
  }

  return candidates.slice(0, Math.trunc(request.limit));
}

function loadStateChanges(env: ServerEnv, projectId: string, chapterId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          entity_name,
          field,
          old_value,
          new_value
        FROM generation_state_changes
        WHERE project_id = ? AND chapter_id = ?
        ORDER BY updated_at ASC
      `,
    )
    .all(projectId, chapterId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): StateChangeDraft => ({
      entityName: asString(row.entity_name),
      field: asString(row.field),
      oldValue: asString(row.old_value),
      newValue: asString(row.new_value),
    }),
  );
}

function loadLatestGeneratedText(env: ServerEnv, projectId: string, chapterId: string) {
  const db = getGenerationDatabase(env);
  const row = db
    .prepare(
      `
        SELECT generated_text
        FROM generation_jobs
        WHERE project_id = ? AND chapter_id = ? AND generated_text <> ''
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(projectId, chapterId) as Record<string, unknown> | undefined;

  return asString(row?.generated_text);
}

export function backfillGenerationMemoryChunks(
  env: ServerEnv,
  request: GenerationBackfillRequest,
) {
  const candidates = loadBackfillCandidates(env, request);
  const result: GenerationMemoryChunkBackfillResult = {
    projectId: request.projectId,
    totalCandidates: candidates.length,
    processedChapters: 0,
    skippedChapters: 0,
    missingContentChapters: 0,
    totalChunks: 0,
    parentChunks: 0,
    childChunks: 0,
    processedChapterIds: [],
  };

  for (const candidate of candidates) {
    if (!candidate.summary.trim()) {
      result.skippedChapters += 1;
      continue;
    }

    const stateChanges = loadStateChanges(env, request.projectId, candidate.chapterId);
    const content = loadLatestGeneratedText(env, request.projectId, candidate.chapterId);

    if (!content.trim()) {
      result.missingContentChapters += 1;
    }

    const chunkResult = replaceGenerationMemoryChunks(env, {
      projectId: request.projectId,
      chapterId: candidate.chapterId,
      chapterTitle: candidate.chapterTitle,
      chapterOrder: candidate.chapterOrder,
      volumeTitle: candidate.volumeTitle,
      outline: buildOutline(candidate),
      summary: buildSummary(candidate),
      stateChanges,
      content,
    });

    result.processedChapters += 1;
    result.totalChunks += chunkResult.totalChunks;
    result.parentChunks += chunkResult.parentChunkCount;
    result.childChunks += chunkResult.childChunkCount;
    result.processedChapterIds.push(candidate.chapterId);
  }

  return result;
}

export async function backfillGenerationMemoryEmbeddings(
  env: ServerEnv,
  request: GenerationBackfillRequest,
) {
  const vectorBackend = getGenerationVectorBackendStatus(env);
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          id,
          project_id,
          chapter_id,
          content
        FROM generation_memory_chunks
        WHERE project_id = ?
        ORDER BY updated_at DESC, chunk_kind ASC, chunk_index ASC
      `,
    )
    .all(request.projectId) as Array<Record<string, unknown>>;
  const candidates = rows
    .map((row) => ({
      chunkId: asString(row.id),
      projectId: asString(row.project_id),
      chapterId: asString(row.chapter_id),
      content: asString(row.content),
    }))
    .filter((row) => row.chunkId)
    .filter((row) => !request.chapterId || row.chapterId === request.chapterId);
  const limitedCandidates =
    request.limit && request.limit > 0 ? candidates.slice(0, Math.trunc(request.limit)) : candidates;
  const embeddingResult = await ensureGenerationMemoryEmbeddingAssets(env, limitedCandidates);
  const skipReasonCounts = createEmptySkipReasonCounts();

  for (const item of embeddingResult.skippedItems) {
    if (item.reason === 'embedding_disabled') {
      skipReasonCounts.embeddingDisabled += 1;
      continue;
    }

    if (item.reason === 'empty_content') {
      skipReasonCounts.emptyContent += 1;
      continue;
    }

    skipReasonCounts.embeddingFailed += 1;
  }

  const processedChunkIds = Array.from(embeddingResult.vectorsByChunkId.keys());
  const createdChunks = embeddingResult.createdChunkIds.length;
  const rebuiltChunks = embeddingResult.rebuiltChunkIds.length;
  const embeddedChunks = createdChunks + rebuiltChunks;
  const reusedChunks = embeddingResult.reusedChunkIds.length;

  const result: GenerationMemoryEmbeddingBackfillResult = {
    projectId: request.projectId,
    totalCandidates: limitedCandidates.length,
    createdChunks,
    rebuiltChunks,
    embeddedChunks,
    reusedChunks,
    skippedChunks: embeddingResult.skippedItems.length,
    skipReasonCounts,
    processedChunkIds,
    embeddingModel: embeddingResult.embeddingModel,
    vectorBackend,
  };

  return result;
}

export function backfillGenerationVolumeRecapSummaries(
  env: ServerEnv,
  request: GenerationBackfillRequest,
) {
  return backfillGenerationVolumeRecaps(env, request);
}
