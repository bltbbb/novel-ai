import type { ServerEnv } from '../config/env.js';
import { getGenerationDatabase } from './generation-sqlite.js';

interface RawStateRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
  updatedAt: string;
}

export interface FoldedStateEntry {
  entityName: string;
  field: string;
  currentValue: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  updatedAt: string;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim();
}

function normalizeKey(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function buildChapterLabel(chapterOrder: number, chapterTitle: string) {
  if (chapterOrder <= 0) {
    return chapterTitle.trim() || '未知章节';
  }

  const trimmedTitle = chapterTitle.trim();
  const prefix = `第${chapterOrder}章`;

  if (trimmedTitle.startsWith(prefix)) {
    return trimmedTitle;
  }

  return `${prefix} ${trimmedTitle}`;
}

function loadRawStateRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          changes.chapter_id,
          changes.chapter_title,
          COALESCE(idx.chapter_order, 0) AS chapter_order,
          changes.entity_name,
          changes.field,
          changes.old_value,
          changes.new_value,
          changes.updated_at
        FROM generation_state_changes changes
        LEFT JOIN generation_chapter_index idx
          ON idx.project_id = changes.project_id AND idx.chapter_id = changes.chapter_id
        WHERE changes.project_id = ?
        ORDER BY chapter_order ASC, changes.updated_at ASC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): RawStateRow => ({
      chapterId: String(row.chapter_id ?? ''),
      chapterTitle: String(row.chapter_title ?? ''),
      chapterOrder: Number(row.chapter_order ?? 0),
      entityName: String(row.entity_name ?? ''),
      field: String(row.field ?? ''),
      oldValue: String(row.old_value ?? ''),
      newValue: String(row.new_value ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    }),
  );
}

export function foldCurrentStateTable(
  env: ServerEnv,
  projectId: string,
  currentChapterOrder?: number,
) {
  const rows = loadRawStateRows(env, projectId).filter((row) => {
    if (!currentChapterOrder || currentChapterOrder <= 0) {
      return true;
    }

    return row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder;
  });
  const entryMap = new Map<string, FoldedStateEntry>();

  for (const row of rows) {
    const entityKey = normalizeKey(row.entityName);
    const fieldKey = normalizeKey(row.field);

    if (!entityKey || !fieldKey) {
      continue;
    }

    entryMap.set(`${entityKey}::${fieldKey}`, {
      entityName: normalizeText(row.entityName),
      field: normalizeText(row.field),
      currentValue: normalizeText(row.newValue),
      chapterId: row.chapterId,
      chapterTitle: row.chapterTitle,
      chapterOrder: row.chapterOrder,
      updatedAt: row.updatedAt,
    });
  }

  return Array.from(entryMap.values()).sort((left, right) => {
    if (left.chapterOrder !== right.chapterOrder) {
      return right.chapterOrder - left.chapterOrder;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function buildCurrentStateTableBlock(
  env: ServerEnv,
  projectId: string,
  currentChapterOrder?: number,
  limit = 18,
) {
  const entries = foldCurrentStateTable(env, projectId, currentChapterOrder).slice(0, limit);

  if (entries.length === 0) {
    return '';
  }

  return [
    '【当前状态表】',
    ...entries.map((entry) => {
      const chapterLabel = buildChapterLabel(entry.chapterOrder, entry.chapterTitle);
      return `- ${entry.entityName} / ${entry.field}：${entry.currentValue}（更新于 ${chapterLabel}）`;
    }),
  ].join('\n');
}
