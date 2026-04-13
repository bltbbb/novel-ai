import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ServerEnv } from '../config/env.js';
import {
  createSqliteVecDatabase,
  loadSqliteVecExtension,
  resolveSqliteVecExtensionPath,
} from './sqlite-vec-runtime.js';

const SQLITE_VEC_INDEX_METADATA_TABLE = 'generation_memory_embedding_vec_index';

export interface GenerationSqliteVecIndexEntry {
  chunkId: string;
  projectId: string;
  chapterId: string;
  embeddingModel: string;
  contentHash: string;
  vector: number[];
}

export interface GenerationSqliteVecIndexSyncResult {
  status: 'disabled' | 'synced' | 'fallback';
  vectorTables: string[];
  syncedChunkIds: string[];
  fallbackReason: string | null;
}

export interface GenerationSqliteVecQueryResultItem {
  chunkId: string;
  distance: number;
  similarity: number;
  score: number;
}

export interface GenerationSqliteVecQueryResult {
  status: 'disabled' | 'active' | 'failed';
  hits: GenerationSqliteVecQueryResultItem[];
  fallbackReason: string | null;
}

interface SqliteVecIndexRow {
  chunk_id: string;
  vec_table: string;
  vec_rowid: number;
  dimension: number;
}

function ensureDirectoryExists(targetPath: string) {
  if (!existsSync(targetPath)) {
    mkdirSync(targetPath, { recursive: true });
  }
}

function getGenerationDatabaseFilePath(env: ServerEnv) {
  return path.resolve(process.cwd(), env.generationDataDir, 'generation.sqlite');
}

function toVectorBuffer(values: number[]) {
  return Buffer.from(new Float32Array(values).buffer);
}

function buildVecTableName(dimension: number) {
  return `generation_memory_embedding_vec_${dimension}`;
}

function migrateLegacySqliteVecMetadataTable(db: DatabaseSync) {
  const schemaRow = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(SQLITE_VEC_INDEX_METADATA_TABLE) as { sql?: string } | undefined;
  const tableSql = schemaRow?.sql ?? '';

  if (!tableSql || !/vec_rowid\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/iu.test(tableSql)) {
    return;
  }

  const tempTableName = `${SQLITE_VEC_INDEX_METADATA_TABLE}_migrating`;

  db.exec(`
    DROP TABLE IF EXISTS ${tempTableName};

    CREATE TABLE ${tempTableName} (
      chunk_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      vec_table TEXT NOT NULL,
      vec_rowid INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO ${tempTableName} (
      chunk_id,
      project_id,
      chapter_id,
      embedding_model,
      content_hash,
      dimension,
      vec_table,
      vec_rowid,
      created_at,
      updated_at
    )
    SELECT
      chunk_id,
      project_id,
      chapter_id,
      embedding_model,
      content_hash,
      dimension,
      vec_table,
      vec_rowid,
      created_at,
      updated_at
    FROM ${SQLITE_VEC_INDEX_METADATA_TABLE};

    DROP TABLE ${SQLITE_VEC_INDEX_METADATA_TABLE};
    ALTER TABLE ${tempTableName} RENAME TO ${SQLITE_VEC_INDEX_METADATA_TABLE};
  `);
}

function ensureSqliteVecMetadataTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SQLITE_VEC_INDEX_METADATA_TABLE} (
      chunk_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      vec_table TEXT NOT NULL,
      vec_rowid INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_memory_embedding_vec_index_project
      ON ${SQLITE_VEC_INDEX_METADATA_TABLE}(project_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_memory_embedding_vec_index_table_rowid
      ON ${SQLITE_VEC_INDEX_METADATA_TABLE}(vec_table, vec_rowid);
  `);

  migrateLegacySqliteVecMetadataTable(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_generation_memory_embedding_vec_index_project
      ON ${SQLITE_VEC_INDEX_METADATA_TABLE}(project_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_memory_embedding_vec_index_table_rowid
      ON ${SQLITE_VEC_INDEX_METADATA_TABLE}(vec_table, vec_rowid);
  `);

  const legacyIndexes = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'index'
      AND tbl_name = ?
      AND sql LIKE '%vec_rowid%'
      AND sql NOT LIKE '%vec_table%'
  `).all(SQLITE_VEC_INDEX_METADATA_TABLE) as Array<{ name?: string }>;

  for (const index of legacyIndexes) {
    if (!index.name) {
      continue;
    }

    db.exec(`DROP INDEX IF EXISTS ${index.name}`);
  }
}

function ensureVecTable(db: DatabaseSync, tableName: string, dimension: number) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName}
    USING vec0(embedding float[${dimension}])
  `);
}

function nowIsoString() {
  return new Date().toISOString();
}

function loadExistingIndexRow(db: DatabaseSync, chunkId: string) {
  return db.prepare(`
    SELECT chunk_id, vec_table, vec_rowid, dimension
    FROM ${SQLITE_VEC_INDEX_METADATA_TABLE}
    WHERE chunk_id = ?
  `).get(chunkId) as SqliteVecIndexRow | undefined;
}

function allocateNextRowid(db: DatabaseSync, vecTable: string) {
  const row = db.prepare(`
    SELECT COALESCE(MAX(rowid), 0) + 1 AS next_rowid
    FROM ${vecTable}
  `).get() as { next_rowid?: number | bigint } | undefined;

  return Number(row?.next_rowid ?? 1);
}

function deleteOldVectorRow(db: DatabaseSync, row: SqliteVecIndexRow) {
  db.prepare(`DELETE FROM ${row.vec_table} WHERE rowid = ?`).run(row.vec_rowid);
}

function upsertIndexMetadata(
  db: DatabaseSync,
  input: {
    chunkId: string;
    projectId: string;
    chapterId: string;
    embeddingModel: string;
    contentHash: string;
    dimension: number;
    vecTable: string;
    vecRowid: number;
  },
) {
  const currentTime = nowIsoString();

  db.prepare(`
    INSERT INTO ${SQLITE_VEC_INDEX_METADATA_TABLE} (
      chunk_id,
      project_id,
      chapter_id,
      embedding_model,
      content_hash,
      dimension,
      vec_table,
      vec_rowid,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chunk_id) DO UPDATE SET
      project_id = excluded.project_id,
      chapter_id = excluded.chapter_id,
      embedding_model = excluded.embedding_model,
      content_hash = excluded.content_hash,
      dimension = excluded.dimension,
      vec_table = excluded.vec_table,
      vec_rowid = excluded.vec_rowid,
      updated_at = excluded.updated_at
  `).run(
    input.chunkId,
    input.projectId,
    input.chapterId,
    input.embeddingModel,
    input.contentHash,
    input.dimension,
    input.vecTable,
    input.vecRowid,
    currentTime,
    currentTime,
  );
}

function insertOrReplaceVector(
  db: DatabaseSync,
  tableName: string,
  rowid: number,
  vector: number[],
) {
  db.prepare(`DELETE FROM ${tableName} WHERE rowid = ?`).run(BigInt(rowid));
  db.prepare(`
    INSERT INTO ${tableName}(rowid, embedding)
    VALUES (?, ?)
  `).run(BigInt(rowid), toVectorBuffer(vector));
}

function createSqliteVecIndexDatabase(env: ServerEnv) {
  const sqliteFilePath = getGenerationDatabaseFilePath(env);
  const sqliteDir = path.dirname(sqliteFilePath);

  ensureDirectoryExists(sqliteDir);

  return {
    sqliteFilePath,
    db: createSqliteVecDatabase(sqliteFilePath),
  };
}

function computeCosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm <= 0 || rightNorm <= 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function loadIndexedChunkRows(
  db: DatabaseSync,
  input: {
    projectId: string;
    chunkIds: string[];
  },
) {
  if (input.chunkIds.length === 0) {
    return [] as Array<{
      chunk_id: string;
      vector_json: string;
    }>;
  }

  const placeholders = input.chunkIds.map(() => '?').join(', ');

  return db.prepare(`
    SELECT chunk_id, vector_json
    FROM generation_memory_embeddings
    WHERE project_id = ? AND chunk_id IN (${placeholders})
  `).all(input.projectId, ...input.chunkIds) as Array<{
    chunk_id: string;
    vector_json: string;
  }>;
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

export async function clearGenerationSqliteVecProjectIndex(
  env: ServerEnv,
  projectId: string,
) {
  if (env.generationVectorBackend !== 'sqlite_vec') {
    return;
  }

  try {
    const extensionPath = await resolveSqliteVecExtensionPath(env);
    const { db } = createSqliteVecIndexDatabase(env);

    try {
      loadSqliteVecExtension(db, extensionPath);
      ensureSqliteVecMetadataTable(db);

      const rows = db.prepare(`
        SELECT vec_table, vec_rowid
        FROM ${SQLITE_VEC_INDEX_METADATA_TABLE}
        WHERE project_id = ?
      `).all(projectId) as Array<{
        vec_table?: string;
        vec_rowid?: number | bigint;
      }>;

      db.exec('BEGIN');

      try {
        for (const row of rows) {
          const vecTable = typeof row.vec_table === 'string' ? row.vec_table : '';
          const vecRowid = Number(row.vec_rowid ?? 0);

          if (!vecTable || vecRowid <= 0) {
            continue;
          }

          db.prepare(`DELETE FROM ${vecTable} WHERE rowid = ?`).run(BigInt(vecRowid));
        }

        db.prepare(`
          DELETE FROM ${SQLITE_VEC_INDEX_METADATA_TABLE}
          WHERE project_id = ?
        `).run(projectId);

        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } finally {
      db.close();
    }
  } catch {
    // sqlite-vec 不可用时，项目级清理退回为仅清理主表 generation_memory_embeddings。
  }
}

export async function queryGenerationSqliteVecIndex(
  env: ServerEnv,
  input: {
    projectId: string;
    queryVector: number[];
    topK: number;
    minScore: number;
    minSimilarity: number;
  },
): Promise<GenerationSqliteVecQueryResult> {
  if (env.generationVectorBackend !== 'sqlite_vec') {
    return {
      status: 'disabled',
      hits: [],
      fallbackReason: '当前未启用 sqlite_vec 读链路，已跳过索引查询。',
    };
  }

  if (input.queryVector.length === 0) {
    return {
      status: 'disabled',
      hits: [],
      fallbackReason: 'query 向量为空，已跳过 sqlite-vec 索引查询。',
    };
  }

  try {
    const extensionPath = await resolveSqliteVecExtensionPath(env);
    const { db } = createSqliteVecIndexDatabase(env);

    try {
      loadSqliteVecExtension(db, extensionPath);
      ensureSqliteVecMetadataTable(db);

      const vecTable = buildVecTableName(input.queryVector.length);
      const tableExistsRow = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
      `).get(vecTable) as { name?: string } | undefined;

      if (!tableExistsRow?.name) {
        return {
          status: 'disabled',
          hits: [],
          fallbackReason: `sqlite-vec 表 ${vecTable} 不存在，已回退到 json_cache。`,
        };
      }

      const rawRows = db.prepare(`
        SELECT idx.chunk_id, idx.vec_rowid, vec_distance_l2(vec.embedding, ?) AS distance
        FROM ${SQLITE_VEC_INDEX_METADATA_TABLE} idx
        JOIN ${vecTable} vec ON vec.rowid = idx.vec_rowid
        WHERE idx.project_id = ? AND idx.dimension = ?
        ORDER BY distance
        LIMIT ?
      `).all(
        toVectorBuffer(input.queryVector),
        input.projectId,
        input.queryVector.length,
        input.topK,
      ) as Array<{
        chunk_id: string;
        vec_rowid: number;
        distance: number;
      }>;

      if (rawRows.length === 0) {
        return {
          status: 'active',
          hits: [],
          fallbackReason: null,
        };
      }

      const chunkRows = loadIndexedChunkRows(db, {
        projectId: input.projectId,
        chunkIds: rawRows.map((row) => row.chunk_id),
      });
      const chunkVectorMap = new Map(
        chunkRows.map((row) => [row.chunk_id, parseVectorJson(row.vector_json)] as const),
      );

      const hits = rawRows
        .map((row) => {
          const vector = chunkVectorMap.get(row.chunk_id) ?? [];
          const similarity = computeCosineSimilarity(input.queryVector, vector);
          const score = similarity > 0 ? Math.max(0, Math.round(similarity * 20)) : 0;

          return {
            chunkId: row.chunk_id,
            distance: row.distance,
            similarity,
            score,
          };
        })
        .filter((item) => item.score >= input.minScore && item.similarity >= input.minSimilarity);

      return {
        status: 'active',
        hits,
        fallbackReason: null,
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      status: 'failed',
      hits: [],
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function syncGenerationSqliteVecIndex(
  env: ServerEnv,
  entries: GenerationSqliteVecIndexEntry[],
): Promise<GenerationSqliteVecIndexSyncResult> {
  if (env.generationVectorBackend !== 'sqlite_vec') {
    return {
      status: 'disabled',
      vectorTables: [],
      syncedChunkIds: [],
      fallbackReason: '当前未启用 sqlite_vec 写入链路，已跳过向量索引同步。',
    };
  }

  if (entries.length === 0) {
    return {
      status: 'disabled',
      vectorTables: [],
      syncedChunkIds: [],
      fallbackReason: null,
    };
  }

  try {
    const extensionPath = await resolveSqliteVecExtensionPath(env);
    const { db } = createSqliteVecIndexDatabase(env);

    try {
      loadSqliteVecExtension(db, extensionPath);
      ensureSqliteVecMetadataTable(db);

      const vectorTables = new Set<string>();
      const syncedChunkIds: string[] = [];

      db.exec('BEGIN');

      try {
        for (const entry of entries) {
          const dimension = entry.vector.length;

          if (dimension <= 0) {
            continue;
          }

          const vecTable = buildVecTableName(dimension);
          vectorTables.add(vecTable);
          ensureVecTable(db, vecTable, dimension);

          const existingRow = loadExistingIndexRow(db, entry.chunkId);
          const vecRowid = existingRow?.vec_rowid ?? allocateNextRowid(db, vecTable);

          if (existingRow && existingRow.vec_table !== vecTable) {
            deleteOldVectorRow(db, existingRow);
          }

          insertOrReplaceVector(db, vecTable, vecRowid, entry.vector);
          upsertIndexMetadata(db, {
            chunkId: entry.chunkId,
            projectId: entry.projectId,
            chapterId: entry.chapterId,
            embeddingModel: entry.embeddingModel,
            contentHash: entry.contentHash,
            dimension,
            vecTable,
            vecRowid,
          });
          syncedChunkIds.push(entry.chunkId);
        }

        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return {
        status: 'synced',
        vectorTables: Array.from(vectorTables).sort(),
        syncedChunkIds,
        fallbackReason: null,
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      status: 'fallback',
      vectorTables: [],
      syncedChunkIds: [],
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
}
