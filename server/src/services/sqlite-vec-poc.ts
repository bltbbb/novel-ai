import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ServerEnv } from '../config/env.js';
import {
  createSqliteVecDatabase,
  listSqliteVecPackageNativeFiles,
  loadSqliteVecExtension,
  resolveSqliteVecExtensionPath,
} from './sqlite-vec-runtime.js';

interface SqliteVecNearestNeighborRow {
  rowid: number;
  distance: number;
}

const SQLITE_VEC_POC_TABLE_NAME = 'vec_poc_items';

function toVectorBuffer(values: number[]) {
  return Buffer.from(new Float32Array(values).buffer);
}

export interface SqliteVecPocResult {
  extensionPath: string;
  extensionExists: boolean;
  packageNativeFiles: string[];
  sqliteFilePath: string;
  vecVersion: string;
  insertedRows: number;
  nearestNeighbors: SqliteVecNearestNeighborRow[];
}

export interface SqliteVecPocFailureDiagnostics {
  extensionPath: string;
  extensionExists: boolean;
  packageNativeFiles: string[];
  loadError: string;
}

function ensureDirectoryExists(targetPath: string) {
  if (!existsSync(targetPath)) {
    mkdirSync(targetPath, { recursive: true });
  }
}

export async function runSqliteVecPoc(env: ServerEnv): Promise<SqliteVecPocResult> {
  const extensionPath = await resolveSqliteVecExtensionPath(env);
  const extensionExists = existsSync(extensionPath);
  const packageNativeFiles = listSqliteVecPackageNativeFiles(extensionPath);
  const sqliteDir = path.resolve(process.cwd(), env.generationDataDir);
  const sqliteFilePath = path.join(sqliteDir, 'sqlite-vec-poc.sqlite');

  ensureDirectoryExists(sqliteDir);

  const db = createSqliteVecDatabase(sqliteFilePath);

  try {
    loadSqliteVecExtension(db, extensionPath);

    const versionRow = db.prepare('select vec_version() as version').get() as { version?: string } | undefined;
    const vecVersion = versionRow?.version?.trim();

    if (!vecVersion) {
      throw new Error('sqlite-vec 已加载，但 vec_version() 未返回有效版本号');
    }

    db.exec(`DROP TABLE IF EXISTS ${SQLITE_VEC_POC_TABLE_NAME}`);
    db.exec(`
      CREATE VIRTUAL TABLE ${SQLITE_VEC_POC_TABLE_NAME}
      USING vec0(embedding float[4])
    `);

    const insertStatement = db.prepare(`
      INSERT INTO ${SQLITE_VEC_POC_TABLE_NAME}(rowid, embedding)
      VALUES (?, ?)
    `);

    const rows: Array<{ rowid: bigint; embedding: Buffer }> = [
      { rowid: 1n, embedding: toVectorBuffer([0.10, 0.20, 0.30, 0.40]) },
      { rowid: 2n, embedding: toVectorBuffer([0.12, 0.18, 0.33, 0.39]) },
      { rowid: 3n, embedding: toVectorBuffer([-0.80, 0.05, 0.10, -0.20]) },
    ];

    for (const row of rows) {
      insertStatement.run(row.rowid, row.embedding);
    }

    const nearestNeighbors = db.prepare(`
      SELECT rowid, vec_distance_l2(embedding, ?) AS distance
      FROM ${SQLITE_VEC_POC_TABLE_NAME}
      ORDER BY distance
      LIMIT 2
    `).all(toVectorBuffer([0.11, 0.19, 0.31, 0.41])) as SqliteVecNearestNeighborRow[];

    return {
      extensionPath,
      extensionExists,
      packageNativeFiles,
      sqliteFilePath,
      vecVersion,
      insertedRows: rows.length,
      nearestNeighbors,
    };
  } finally {
    db.close();
  }
}

export async function diagnoseSqliteVecPocFailure(
  env: ServerEnv,
): Promise<SqliteVecPocFailureDiagnostics> {
  const extensionPath = await resolveSqliteVecExtensionPath(env);
  const extensionExists = existsSync(extensionPath);
  const packageNativeFiles = listSqliteVecPackageNativeFiles(extensionPath);
  const sqliteDir = path.resolve(process.cwd(), env.generationDataDir);
  const sqliteFilePath = path.join(sqliteDir, 'sqlite-vec-poc.sqlite');

  ensureDirectoryExists(sqliteDir);

  const db = createSqliteVecDatabase(sqliteFilePath);

  try {
    loadSqliteVecExtension(db, extensionPath);

    return {
      extensionPath,
      extensionExists,
      packageNativeFiles,
      loadError: '',
    };
  } catch (error) {
    const loadError = error instanceof Error ? error.message : String(error);

    return {
      extensionPath,
      extensionExists,
      packageNativeFiles,
      loadError,
    };
  } finally {
    db.close();
  }
}
