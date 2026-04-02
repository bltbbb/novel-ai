import type { ServerEnv } from '../config/env.js';
import { getGenerationDatabase } from './generation-sqlite.js';

interface VolumeChapterRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  summary: string;
  hook: string;
  foreshadowings: string[];
  summaryExcerpt: string;
  updatedAt: string;
}

export interface GenerationVolumeRecapRecord {
  projectId: string;
  volumeTitle: string;
  startChapterId: string;
  startChapterOrder: number;
  endChapterId: string;
  endChapterOrder: number;
  chapterCount: number;
  summary: string;
  highlights: string[];
  updatedAt: string;
}

interface GenerationVolumeRecapBackfillRequest {
  projectId: string;
  chapterId?: string;
  limit?: number;
}

export interface GenerationVolumeRecapBackfillResult {
  projectId: string;
  totalVolumes: number;
  processedVolumes: number;
  skippedVolumes: number;
  processedVolumeTitles: string[];
}

function nowIsoString() {
  return new Date().toISOString();
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

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function createUniqueList(items: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalizedItem = item?.replace(/\s+/g, ' ').trim();

    if (!normalizedItem) {
      continue;
    }

    const key = normalizeText(normalizedItem);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalizedItem);
  }

  return result;
}

function loadVolumeChapterRows(env: ServerEnv, projectId: string, volumeTitle?: string) {
  const db = getGenerationDatabase(env);
  const baseSql = `
    SELECT
      idx.chapter_id,
      idx.chapter_title,
      idx.chapter_order,
      idx.volume_title,
      idx.summary_excerpt,
      idx.updated_at,
      sums.summary,
      sums.hook,
      sums.foreshadowings_json
    FROM generation_chapter_index idx
    LEFT JOIN generation_chapter_summaries sums
      ON sums.project_id = idx.project_id AND sums.chapter_id = idx.chapter_id
    WHERE idx.project_id = ?
  `;
  const rows = volumeTitle?.trim()
    ? db.prepare(`${baseSql} AND idx.volume_title = ? ORDER BY idx.chapter_order ASC, idx.updated_at ASC`).all(projectId, volumeTitle)
    : db.prepare(`${baseSql} AND idx.volume_title <> '' ORDER BY idx.chapter_order ASC, idx.updated_at ASC`).all(projectId);

  return (rows as Array<Record<string, unknown>>).map(
    (row): VolumeChapterRow => ({
      chapterId: asString(row.chapter_id),
      chapterTitle: asString(row.chapter_title),
      chapterOrder: Number(row.chapter_order ?? 0),
      volumeTitle: asString(row.volume_title),
      summary: asString(row.summary),
      hook: asString(row.hook),
      foreshadowings: parseStringArrayJson(asString(row.foreshadowings_json)),
      summaryExcerpt: asString(row.summary_excerpt),
      updatedAt: asString(row.updated_at),
    }),
  );
}

function buildVolumeRecapSummary(rows: VolumeChapterRow[]) {
  const orderedRows = [...rows].sort((left, right) => {
    const leftOrder = left.chapterOrder > 0 ? left.chapterOrder : Number.MIN_SAFE_INTEGER;
    const rightOrder = right.chapterOrder > 0 ? right.chapterOrder : Number.MIN_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.updatedAt.localeCompare(right.updatedAt);
  });
  const firstRow = orderedRows[0];
  const middleRow = orderedRows[Math.floor((orderedRows.length - 1) / 2)];
  const lastRow = orderedRows[orderedRows.length - 1];
  const arcHighlights = createUniqueList([
    firstRow.summary || firstRow.summaryExcerpt,
    middleRow.summary || middleRow.summaryExcerpt,
    lastRow.summary || lastRow.summaryExcerpt,
  ])
    .map((item) => truncateText(item, 72))
    .slice(0, 3);
  const suspenseHighlights = createUniqueList([
    lastRow.hook,
    ...orderedRows.slice(-2).flatMap((row) => row.foreshadowings),
  ])
    .map((item) => truncateText(item, 56))
    .slice(0, 2);
  const highlights = createUniqueList([...arcHighlights, ...suspenseHighlights]).slice(0, 4);
  const summaryParts: string[] = [];

  if (arcHighlights.length > 0) {
    summaryParts.push(arcHighlights.join('；'));
  }

  if (suspenseHighlights.length > 0) {
    summaryParts.push(`当前悬念：${suspenseHighlights.join('；')}`);
  }

  let summary = summaryParts.join('。').trim();

  if (!summary) {
    summary = '本卷已完成阶段性推进。';
  } else if (!/[。！？]$/.test(summary)) {
    summary = `${summary}。`;
  }

  return {
    summary: truncateText(summary, 220),
    highlights,
  };
}

export function rebuildGenerationVolumeRecap(
  env: ServerEnv,
  input: {
    projectId: string;
    volumeTitle?: string;
  },
) {
  const normalizedVolumeTitle = input.volumeTitle?.trim() ?? '';

  if (!normalizedVolumeTitle) {
    return null;
  }

  const rows = loadVolumeChapterRows(env, input.projectId, normalizedVolumeTitle);
  const db = getGenerationDatabase(env);

  if (rows.length === 0) {
    db.prepare('DELETE FROM generation_volume_recaps WHERE project_id = ? AND volume_title = ?').run(
      input.projectId,
      normalizedVolumeTitle,
    );
    return null;
  }

  const currentTime = nowIsoString();
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const recap = buildVolumeRecapSummary(rows);

  db.prepare(`
    INSERT INTO generation_volume_recaps (
      project_id,
      volume_title,
      start_chapter_id,
      start_chapter_order,
      end_chapter_id,
      end_chapter_order,
      chapter_count,
      summary,
      highlights_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, volume_title) DO UPDATE SET
      start_chapter_id = excluded.start_chapter_id,
      start_chapter_order = excluded.start_chapter_order,
      end_chapter_id = excluded.end_chapter_id,
      end_chapter_order = excluded.end_chapter_order,
      chapter_count = excluded.chapter_count,
      summary = excluded.summary,
      highlights_json = excluded.highlights_json,
      updated_at = excluded.updated_at
  `).run(
    input.projectId,
    normalizedVolumeTitle,
    firstRow.chapterId,
    firstRow.chapterOrder,
    lastRow.chapterId,
    lastRow.chapterOrder,
    rows.length,
    recap.summary,
    JSON.stringify(recap.highlights),
    currentTime,
    currentTime,
  );

  const result: GenerationVolumeRecapRecord = {
    projectId: input.projectId,
    volumeTitle: normalizedVolumeTitle,
    startChapterId: firstRow.chapterId,
    startChapterOrder: firstRow.chapterOrder,
    endChapterId: lastRow.chapterId,
    endChapterOrder: lastRow.chapterOrder,
    chapterCount: rows.length,
    summary: recap.summary,
    highlights: recap.highlights,
    updatedAt: currentTime,
  };

  return result;
}

export function listGenerationVolumeRecaps(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          project_id,
          volume_title,
          start_chapter_id,
          start_chapter_order,
          end_chapter_id,
          end_chapter_order,
          chapter_count,
          summary,
          highlights_json,
          updated_at
        FROM generation_volume_recaps
        WHERE project_id = ?
        ORDER BY end_chapter_order DESC, updated_at DESC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): GenerationVolumeRecapRecord => ({
      projectId: asString(row.project_id),
      volumeTitle: asString(row.volume_title),
      startChapterId: asString(row.start_chapter_id),
      startChapterOrder: Number(row.start_chapter_order ?? 0),
      endChapterId: asString(row.end_chapter_id),
      endChapterOrder: Number(row.end_chapter_order ?? 0),
      chapterCount: Number(row.chapter_count ?? 0),
      summary: asString(row.summary),
      highlights: parseStringArrayJson(asString(row.highlights_json)),
      updatedAt: asString(row.updated_at),
    }),
  );
}

function resolveBackfillVolumeTitles(env: ServerEnv, request: GenerationVolumeRecapBackfillRequest) {
  const db = getGenerationDatabase(env);

  if (request.chapterId?.trim()) {
    const row = db
      .prepare(
        `
          SELECT volume_title
          FROM generation_chapter_index
          WHERE project_id = ? AND chapter_id = ?
          LIMIT 1
        `,
      )
      .get(request.projectId, request.chapterId) as Record<string, unknown> | undefined;
    const volumeTitle = asString(row?.volume_title).trim();

    return volumeTitle ? [volumeTitle] : [];
  }

  const rows = db
    .prepare(
      `
        SELECT
          volume_title,
          MAX(chapter_order) AS latest_chapter_order
        FROM generation_chapter_index
        WHERE project_id = ? AND volume_title <> ''
        GROUP BY volume_title
        ORDER BY latest_chapter_order DESC, volume_title COLLATE NOCASE ASC
      `,
    )
    .all(request.projectId) as Array<Record<string, unknown>>;
  const volumeTitles = rows.map((row) => asString(row.volume_title).trim()).filter(Boolean);

  if (!request.limit || request.limit <= 0) {
    return volumeTitles;
  }

  return volumeTitles.slice(0, Math.trunc(request.limit));
}

export function backfillGenerationVolumeRecaps(
  env: ServerEnv,
  request: GenerationVolumeRecapBackfillRequest,
) {
  const volumeTitles = resolveBackfillVolumeTitles(env, request);
  const result: GenerationVolumeRecapBackfillResult = {
    projectId: request.projectId,
    totalVolumes: volumeTitles.length,
    processedVolumes: 0,
    skippedVolumes: 0,
    processedVolumeTitles: [],
  };

  for (const volumeTitle of volumeTitles) {
    const recap = rebuildGenerationVolumeRecap(env, {
      projectId: request.projectId,
      volumeTitle,
    });

    if (!recap) {
      result.skippedVolumes += 1;
      continue;
    }

    result.processedVolumes += 1;
    result.processedVolumeTitles.push(recap.volumeTitle);
  }

  return result;
}
