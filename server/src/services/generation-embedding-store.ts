import { createHash } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import type {
  GenerationMemoryEmbeddingSkipReason,
  GenerationVectorBackendKind,
} from '../types/ai.js';
import { createEmbeddings } from './openai.js';
import { getGenerationDatabase } from './generation-sqlite.js';
import {
  syncGenerationSqliteVecIndex,
  type GenerationSqliteVecIndexSyncResult,
} from './generation-sqlite-vec-store.js';

interface MemoryEmbeddingRow {
  chunkId: string;
  backendKind: GenerationVectorBackendKind;
  embeddingModel: string;
  contentHash: string;
  vector: number[];
}

interface MemoryEmbeddingTarget {
  chunkId: string;
  projectId: string;
  chapterId: string;
  content: string;
}

export interface GenerationMemoryEmbeddingSkippedItem {
  chunkId: string;
  reason: GenerationMemoryEmbeddingSkipReason;
}

export interface GenerationMemoryEmbeddingEnsureResult {
  vectorsByChunkId: Map<string, number[]>;
  createdChunkIds: string[];
  reusedChunkIds: string[];
  rebuiltChunkIds: string[];
  skippedItems: GenerationMemoryEmbeddingSkippedItem[];
  embeddingModel: string | null;
  sqliteVecIndexSync: GenerationSqliteVecIndexSyncResult;
}

function nowIsoString() {
  return new Date().toISOString();
}

function buildContentHash(content: string) {
  return createHash('sha1').update(content.trim()).digest('hex');
}

function parseVectorJson(rawText: string | null | undefined) {
  if (!rawText) {
    return [] as number[];
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === 'number') : [];
  } catch {
    return [] as number[];
  }
}

function loadMemoryEmbeddingRow(env: ServerEnv, chunkId: string) {
  const db = getGenerationDatabase(env);
  const row = db
    .prepare(
      `
        SELECT
          chunk_id,
          backend_kind,
          embedding_model,
          content_hash,
          vector_json
        FROM generation_memory_embeddings
        WHERE chunk_id = ?
      `,
    )
    .get(chunkId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  const record: MemoryEmbeddingRow = {
    chunkId: typeof row.chunk_id === 'string' ? row.chunk_id : '',
    backendKind: row.backend_kind === 'sqlite_vec' ? 'sqlite_vec' : 'json_cache',
    embeddingModel: typeof row.embedding_model === 'string' ? row.embedding_model : '',
    contentHash: typeof row.content_hash === 'string' ? row.content_hash : '',
    vector: parseVectorJson(typeof row.vector_json === 'string' ? row.vector_json : ''),
  };

  return record;
}

function upsertMemoryEmbeddingRow(
  env: ServerEnv,
  input: {
    chunkId: string;
    projectId: string;
    chapterId: string;
    backendKind: GenerationVectorBackendKind;
    embeddingModel: string;
    contentHash: string;
    vector: number[];
  },
) {
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();

  db.prepare(`
    INSERT INTO generation_memory_embeddings (
      chunk_id,
      project_id,
      chapter_id,
      backend_kind,
      embedding_model,
      content_hash,
      vector_json,
      dimension,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chunk_id) DO UPDATE SET
      project_id = excluded.project_id,
      chapter_id = excluded.chapter_id,
      backend_kind = excluded.backend_kind,
      embedding_model = excluded.embedding_model,
      content_hash = excluded.content_hash,
      vector_json = excluded.vector_json,
      dimension = excluded.dimension,
      updated_at = excluded.updated_at
  `).run(
    input.chunkId,
    input.projectId,
    input.chapterId,
    input.backendKind,
    input.embeddingModel,
    input.contentHash,
    JSON.stringify(input.vector),
    input.vector.length,
    currentTime,
    currentTime,
  );
}

export async function ensureGenerationMemoryEmbeddingAssets(
  env: ServerEnv,
  targets: MemoryEmbeddingTarget[],
): Promise<GenerationMemoryEmbeddingEnsureResult> {
  const embeddingModel = env.openaiEmbeddingModel?.trim();
  const vectorsByChunkId = new Map<string, number[]>();
  const createdChunkIds: string[] = [];
  const reusedChunkIds: string[] = [];
  const rebuiltChunkIds: string[] = [];
  const skippedItems: GenerationMemoryEmbeddingSkippedItem[] = [];
  const sqliteVecIndexEntries: Array<{
    chunkId: string;
    projectId: string;
    chapterId: string;
    embeddingModel: string;
    contentHash: string;
    vector: number[];
  }> = [];
  const nonEmptyTargets: MemoryEmbeddingTarget[] = [];

  for (const target of targets) {
    if (!target.content.trim()) {
      skippedItems.push({
        chunkId: target.chunkId,
        reason: 'empty_content',
      });
      continue;
    }

    nonEmptyTargets.push(target);
  }

  if (!embeddingModel) {
    return {
      vectorsByChunkId,
      createdChunkIds,
      reusedChunkIds,
      rebuiltChunkIds,
      skippedItems: [
        ...skippedItems,
        ...nonEmptyTargets.map((target) => ({
          chunkId: target.chunkId,
          reason: 'embedding_disabled' as const,
        })),
      ],
      embeddingModel: null,
      sqliteVecIndexSync: {
        status: 'disabled',
        vectorTables: [],
        syncedChunkIds: [],
        fallbackReason: '当前未启用 embedding 模型，未执行 sqlite-vec 索引写入。',
      },
    };
  }

  const pendingTargets: Array<MemoryEmbeddingTarget & {
    contentHash: string;
    state: 'created' | 'rebuilt';
  }> = [];

  for (const target of nonEmptyTargets) {
    const contentHash = buildContentHash(target.content);
    const existingRow = loadMemoryEmbeddingRow(env, target.chunkId);

    if (
      existingRow &&
      existingRow.backendKind === 'json_cache' &&
      existingRow.embeddingModel === embeddingModel &&
      existingRow.contentHash === contentHash &&
      existingRow.vector.length > 0
    ) {
      vectorsByChunkId.set(target.chunkId, existingRow.vector);
      reusedChunkIds.push(target.chunkId);
      sqliteVecIndexEntries.push({
        chunkId: target.chunkId,
        projectId: target.projectId,
        chapterId: target.chapterId,
        embeddingModel,
        contentHash,
        vector: existingRow.vector,
      });
      continue;
    }

    pendingTargets.push({
      ...target,
      contentHash,
      state: existingRow ? 'rebuilt' : 'created',
    });
  }

  if (pendingTargets.length === 0) {
    const sqliteVecIndexSync = await syncGenerationSqliteVecIndex(env, sqliteVecIndexEntries);

    return {
      vectorsByChunkId,
      createdChunkIds,
      reusedChunkIds,
      rebuiltChunkIds,
      skippedItems,
      embeddingModel,
      sqliteVecIndexSync,
    };
  }

  let vectors: number[][] = [];

  try {
    vectors = await createEmbeddings(
      env,
      pendingTargets.map((target) => target.content),
      embeddingModel,
    );
  } catch {
    return {
      vectorsByChunkId,
      createdChunkIds,
      reusedChunkIds,
      rebuiltChunkIds,
      skippedItems: [
        ...skippedItems,
        ...pendingTargets.map((target) => ({
          chunkId: target.chunkId,
          reason: 'embedding_failed' as const,
        })),
      ],
      embeddingModel,
      sqliteVecIndexSync: {
        status: 'fallback',
        vectorTables: [],
        syncedChunkIds: [],
        fallbackReason: 'embedding 生成失败，已跳过 sqlite-vec 索引写入。',
      },
    };
  }

  for (let index = 0; index < pendingTargets.length; index += 1) {
    const target = pendingTargets[index];
    const vector = vectors[index] ?? [];

    if (vector.length === 0) {
      skippedItems.push({
        chunkId: target.chunkId,
        reason: 'embedding_failed',
      });
      continue;
    }

    upsertMemoryEmbeddingRow(env, {
      chunkId: target.chunkId,
      projectId: target.projectId,
      chapterId: target.chapterId,
      backendKind: 'json_cache',
      embeddingModel,
      contentHash: target.contentHash,
      vector,
    });
    vectorsByChunkId.set(target.chunkId, vector);
    sqliteVecIndexEntries.push({
      chunkId: target.chunkId,
      projectId: target.projectId,
      chapterId: target.chapterId,
      embeddingModel,
      contentHash: target.contentHash,
      vector,
    });

    if (target.state === 'created') {
      createdChunkIds.push(target.chunkId);
    } else {
      rebuiltChunkIds.push(target.chunkId);
    }
  }

  const sqliteVecIndexSync = await syncGenerationSqliteVecIndex(env, sqliteVecIndexEntries);

  return {
    vectorsByChunkId,
    createdChunkIds,
    reusedChunkIds,
    rebuiltChunkIds,
    skippedItems,
    embeddingModel,
    sqliteVecIndexSync,
  };
}

export async function ensureGenerationMemoryEmbeddings(
  env: ServerEnv,
  targets: MemoryEmbeddingTarget[],
) {
  const result = await ensureGenerationMemoryEmbeddingAssets(env, targets);
  return result.vectorsByChunkId;
}

export async function createGenerationQueryEmbedding(env: ServerEnv, queryText: string) {
  const embeddingModel = env.openaiEmbeddingModel?.trim();

  if (!embeddingModel || !queryText.trim()) {
    return null;
  }

  const vectors = await createEmbeddings(env, [queryText], embeddingModel);
  return vectors[0] && vectors[0].length > 0 ? vectors[0] : null;
}
