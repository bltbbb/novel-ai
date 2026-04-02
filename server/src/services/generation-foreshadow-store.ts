import type { ServerEnv } from '../config/env.js';
import type {
  GenerationForeshadowSnapshot,
  GenerationForeshadowSnapshotStatus,
} from '../types/ai.js';
import { getGenerationDatabase } from './generation-sqlite.js';

export type GenerationForeshadowLifecycle = 'active' | 'dormant' | 'archived';

export interface GenerationForeshadowRecord {
  id: string;
  projectId: string;
  title: string;
  excerpt: string;
  notes: string;
  status: GenerationForeshadowSnapshotStatus;
  sourceChapterId: string | null;
  sourceChapterTitle: string;
  sourceChapterOrder: number;
  resolvedChapterId: string | null;
  resolvedChapterTitle: string;
  resolvedChapterOrder: number;
  updatedAt: string;
}

function nowIsoString() {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeStatus(value: unknown): GenerationForeshadowSnapshotStatus {
  return value === 'activated' || value === 'resolved' || value === 'overdue' ? value : 'planted';
}

export function deriveGenerationForeshadowLifecycle(
  row: {
    status: GenerationForeshadowSnapshotStatus;
    sourceChapterOrder: number;
  },
  currentChapterOrder?: number | null,
): GenerationForeshadowLifecycle {
  if (row.status === 'resolved') {
    return 'archived';
  }

  if (row.status === 'activated' || row.status === 'overdue') {
    return 'active';
  }

  if (!currentChapterOrder || currentChapterOrder <= 0 || row.sourceChapterOrder <= 0) {
    return 'active';
  }

  return currentChapterOrder - row.sourceChapterOrder > 20 ? 'dormant' : 'active';
}

function normalizeForeshadowSnapshot(input: GenerationForeshadowSnapshot) {
  return {
    id: input.id.trim(),
    title: input.title.trim() || '未命名伏笔',
    excerpt: input.excerpt.trim(),
    notes: input.notes.trim(),
    status: normalizeStatus(input.status),
    sourceChapterId: input.sourceChapterId?.trim() || null,
    sourceChapterTitle: input.sourceChapterTitle?.trim() || '',
    resolvedChapterId: input.resolvedChapterId?.trim() || null,
    resolvedChapterTitle: input.resolvedChapterTitle?.trim() || '',
    updatedAt: input.updatedAt.trim() || nowIsoString(),
  };
}

export function replaceGenerationForeshadows(
  env: ServerEnv,
  input: {
    projectId: string;
    foreshadows: GenerationForeshadowSnapshot[];
  },
) {
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();
  const foreshadows = input.foreshadows
    .filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
    .map((item) => normalizeForeshadowSnapshot(item))
    .filter((item) => item.id);
  const deleteStatement = db.prepare('DELETE FROM generation_foreshadows WHERE project_id = ?');
  const insertStatement = db.prepare(`
    INSERT INTO generation_foreshadows (
      id,
      project_id,
      title,
      excerpt,
      notes,
      status,
      source_chapter_id,
      source_chapter_title,
      resolved_chapter_id,
      resolved_chapter_title,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');

  try {
    deleteStatement.run(input.projectId);

    for (const item of foreshadows) {
      insertStatement.run(
        item.id,
        input.projectId,
        item.title,
        item.excerpt,
        item.notes,
        item.status,
        item.sourceChapterId,
        item.sourceChapterTitle,
        item.resolvedChapterId,
        item.resolvedChapterTitle,
        currentTime,
        item.updatedAt,
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function listGenerationForeshadows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          gf.id,
          gf.project_id,
          gf.title,
          gf.excerpt,
          gf.notes,
          gf.status,
          gf.source_chapter_id,
          gf.source_chapter_title,
          source_idx.chapter_order AS source_chapter_order,
          gf.resolved_chapter_id,
          gf.resolved_chapter_title,
          resolved_idx.chapter_order AS resolved_chapter_order,
          gf.updated_at
        FROM generation_foreshadows gf
        LEFT JOIN generation_chapter_index source_idx
          ON source_idx.project_id = gf.project_id
          AND source_idx.chapter_id = gf.source_chapter_id
        LEFT JOIN generation_chapter_index resolved_idx
          ON resolved_idx.project_id = gf.project_id
          AND resolved_idx.chapter_id = gf.resolved_chapter_id
        WHERE gf.project_id = ?
        ORDER BY
          CASE gf.status
            WHEN 'activated' THEN 0
            WHEN 'overdue' THEN 1
            WHEN 'planted' THEN 2
            WHEN 'resolved' THEN 3
            ELSE 4
          END ASC,
          gf.updated_at DESC,
          gf.title COLLATE NOCASE ASC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): GenerationForeshadowRecord => ({
      id: asString(row.id),
      projectId: asString(row.project_id),
      title: asString(row.title),
      excerpt: asString(row.excerpt),
      notes: asString(row.notes),
      status: normalizeStatus(row.status),
      sourceChapterId: asNullableString(row.source_chapter_id),
      sourceChapterTitle: asString(row.source_chapter_title),
      sourceChapterOrder: Number(row.source_chapter_order ?? 0),
      resolvedChapterId: asNullableString(row.resolved_chapter_id),
      resolvedChapterTitle: asString(row.resolved_chapter_title),
      resolvedChapterOrder: Number(row.resolved_chapter_order ?? 0),
      updatedAt: asString(row.updated_at),
    }),
  );
}
