import { loadServerEnv } from '../config/env.js';
import { buildGenerationContextBundle, type GenerationContextSection } from '../services/generation-context.js';
import { listGenerationDebugChapterRecords } from '../services/generation-debug-store.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';
import type {
  ChapterOutlineDraft,
  GenerationDebugChapterRecord,
  GenerationJobRequest,
  GenerationStructuredRelationshipQueryMode,
  GenerationStructuredRelationshipQueryReason,
} from '../types/ai.js';

const DEFAULT_PROJECT_ID = 'demo-project-last-cultivator';

interface LatestJobSnapshot {
  chapterTitle: string;
  request: GenerationJobRequest | null;
  outline: ChapterOutlineDraft | null;
}

interface ParsedRelationshipHeader {
  mode: GenerationStructuredRelationshipQueryMode;
  reason: GenerationStructuredRelationshipQueryReason | 'unknown';
  focusEntities: string[];
}

interface CalibrationExpansionRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  mode: GenerationStructuredRelationshipQueryMode;
  reason: GenerationStructuredRelationshipQueryReason | 'unknown';
  focusEntities: string[];
  worldStateRequiredForGraph1Hop: boolean;
  relationshipsAddedBlockCount: number;
}

interface CalibrationExpansionReport {
  projectId: string;
  scannedChapters: number;
  rows: CalibrationExpansionRow[];
  summary: {
    graph1hopCount: number;
    degradedCount: number;
    worldStateRequiredCount: number;
    averageRelationshipsAddedBlockCount: number;
  };
}

function parseJsonText<T>(rawText: string | null | undefined) {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    return null;
  }
}

function resolveProjectId() {
  const raw = process.env.CALIBRATION_PROJECT_ID?.trim();
  return raw || DEFAULT_PROJECT_ID;
}

function resolveChapterLimit(total: number) {
  const raw = process.env.CALIBRATION_CHAPTER_LIMIT?.trim();

  if (!raw) {
    return total;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return total;
  }

  return Math.min(total, Math.trunc(parsed));
}

function resolveChapterIdFilter() {
  const raw = process.env.CALIBRATION_CHAPTER_IDS?.trim();

  if (!raw) {
    return null;
  }

  const values = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  return new Set(values);
}

function compareChapterRecords(left: GenerationDebugChapterRecord, right: GenerationDebugChapterRecord) {
  const leftOrder = left.chapterOrder > 0 ? left.chapterOrder : Number.MIN_SAFE_INTEGER;
  const rightOrder = right.chapterOrder > 0 ? right.chapterOrder : Number.MIN_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.updatedAt.localeCompare(right.updatedAt);
}

function normalizeRelationshipMode(value: string): GenerationStructuredRelationshipQueryMode {
  return value.startsWith('graph_1hop') ? 'graph_1hop' : 'degraded';
}

function normalizeRelationshipReason(value: string): GenerationStructuredRelationshipQueryReason | 'unknown' {
  if (
    value === 'ok' ||
    value === 'missing_chapter_context' ||
    value === 'no_focus_entity' ||
    value === 'no_historical_relationship' ||
    value === 'high_noise'
  ) {
    return value;
  }

  return 'unknown';
}

function parseRelationshipHeader(section: GenerationContextSection | undefined): ParsedRelationshipHeader {
  const header = section?.blocks[0] ?? '';
  const lines = header.split('\n').map((line) => line.trim());
  let mode: GenerationStructuredRelationshipQueryMode = 'degraded';
  let reason: GenerationStructuredRelationshipQueryReason | 'unknown' = 'unknown';
  let focusEntities: string[] = [];

  for (const line of lines) {
    if (line.startsWith('- 命中模式：')) {
      mode = normalizeRelationshipMode(line.replace('- 命中模式：', '').trim());
      continue;
    }

    if (line.startsWith('原因：')) {
      const rawReason = line
        .replace('原因：', '')
        .split('（')[0]
        .trim();
      reason = normalizeRelationshipReason(rawReason);
      continue;
    }

    if (line.startsWith('焦点实体：')) {
      const rawEntities = line.replace('焦点实体：', '').trim();
      focusEntities =
        rawEntities === '无'
          ? []
          : rawEntities
              .split('、')
              .map((item) => item.trim())
              .filter(Boolean);
    }
  }

  return {
    mode,
    reason,
    focusEntities,
  };
}

function getRelationshipSection(sections: GenerationContextSection[]) {
  return sections.find((section) => section.key === 'relationships');
}

function buildContextOutlineFromChapterRecord(chapterRecord: GenerationDebugChapterRecord): ChapterOutlineDraft {
  return {
    goal: '',
    obstacle: '',
    cost: '',
    beats: chapterRecord.beats,
    timeAnchor: chapterRecord.timeAnchor,
    chapterTimeSpan: '',
    gapFromPrevious: '',
    strand:
      chapterRecord.strand === 'quest' || chapterRecord.strand === 'fire' || chapterRecord.strand === 'constellation'
        ? chapterRecord.strand
        : 'quest',
    hookType: chapterRecord.hookType,
    hookStrength:
      chapterRecord.hookStrength === 'soft' ||
      chapterRecord.hookStrength === 'medium' ||
      chapterRecord.hookStrength === 'strong'
        ? chapterRecord.hookStrength
        : 'medium',
    immutableFacts: chapterRecord.immutableFacts,
  };
}

function loadLatestJobSnapshots(env: ReturnType<typeof loadServerEnv>, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          chapter_id,
          chapter_title,
          request_json,
          outline_json,
          updated_at
        FROM generation_jobs
        WHERE project_id = ?
        ORDER BY updated_at DESC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;
  const snapshotByChapterId = new Map<string, LatestJobSnapshot>();

  for (const row of rows) {
    const chapterId = typeof row.chapter_id === 'string' ? row.chapter_id : '';

    if (!chapterId || snapshotByChapterId.has(chapterId)) {
      continue;
    }

    snapshotByChapterId.set(chapterId, {
      chapterTitle: typeof row.chapter_title === 'string' ? row.chapter_title : '',
      request: parseJsonText<GenerationJobRequest>(typeof row.request_json === 'string' ? row.request_json : ''),
      outline: parseJsonText<ChapterOutlineDraft>(typeof row.outline_json === 'string' ? row.outline_json : ''),
    });
  }

  return snapshotByChapterId;
}

async function buildChapterContext(
  env: ReturnType<typeof loadServerEnv>,
  projectId: string,
  chapterRecord: GenerationDebugChapterRecord,
  previousChapterRecord: GenerationDebugChapterRecord | undefined,
  latestSnapshot: LatestJobSnapshot | undefined,
  worldState: string | undefined,
) {
  const request = latestSnapshot?.request;
  const outline = latestSnapshot?.outline ?? request?.outlineOverride ?? buildContextOutlineFromChapterRecord(chapterRecord);

  return buildGenerationContextBundle(env, {
    projectId: request?.projectId ?? projectId,
    chapterId: chapterRecord.chapterId,
    chapterTitle: latestSnapshot?.chapterTitle || chapterRecord.chapterTitle,
    chapterOrder: request?.chapterOrder ?? chapterRecord.chapterOrder,
    volumeTitle: request?.volumeTitle ?? chapterRecord.volumeTitle,
    previousChapterId: request?.previousChapterId ?? chapterRecord.previousChapterId,
    previousChapterTitle: request?.previousChapterTitle ?? chapterRecord.previousChapterTitle,
    previousSummary: request?.previousSummary ?? previousChapterRecord?.summaryExcerpt ?? '',
    worldState,
    outline,
    fallbackContextBundle: request?.contextBundle,
    preferStoredForeshadows: Array.isArray(request?.foreshadowSnapshot),
    lightweightRecallConfig: request?.gateConfigOverride?.lightweightRecall,
  });
}

async function main() {
  const env = loadServerEnv();
  const projectId = resolveProjectId();
  const chapterIdFilter = resolveChapterIdFilter();
  const allChapterRecords = listGenerationDebugChapterRecords(env, projectId).sort(compareChapterRecords);

  if (allChapterRecords.length === 0) {
    throw new Error(`未找到 projectId=${projectId} 的章节数据，请先准备样本后再执行。`);
  }

  const filteredChapterRecords = chapterIdFilter
    ? allChapterRecords.filter((record) => chapterIdFilter.has(record.chapterId))
    : allChapterRecords;
  const chapterLimit = resolveChapterLimit(filteredChapterRecords.length);
  const chapterRecords = filteredChapterRecords.slice(0, chapterLimit);

  if (chapterRecords.length === 0) {
    throw new Error('过滤后没有可扫描章节，请检查 CALIBRATION_CHAPTER_IDS。');
  }

  const chapterById = new Map(allChapterRecords.map((record) => [record.chapterId, record] as const));
  const latestSnapshotByChapterId = loadLatestJobSnapshots(env, projectId);
  const rows: CalibrationExpansionRow[] = [];

  for (const chapterRecord of chapterRecords) {
    const previousChapterRecord = chapterRecord.previousChapterId
      ? chapterById.get(chapterRecord.previousChapterId)
      : undefined;
    const latestSnapshot = latestSnapshotByChapterId.get(chapterRecord.chapterId);
    const requestWorldState = latestSnapshot?.request?.worldState?.trim() || undefined;
    const contextWithWorldState = await buildChapterContext(
      env,
      projectId,
      chapterRecord,
      previousChapterRecord,
      latestSnapshot,
      requestWorldState,
    );
    const relationshipSectionWithWorldState = getRelationshipSection(contextWithWorldState.sections);
    const parsedWithWorldState = parseRelationshipHeader(relationshipSectionWithWorldState);
    const relationshipsAddedBlockCount = relationshipSectionWithWorldState?.blocks.length ?? 0;
    let worldStateRequiredForGraph1Hop = false;

    if (parsedWithWorldState.mode === 'graph_1hop' && requestWorldState) {
      const contextWithoutWorldState = await buildChapterContext(
        env,
        projectId,
        chapterRecord,
        previousChapterRecord,
        latestSnapshot,
        undefined,
      );
      const relationshipSectionWithoutWorldState = getRelationshipSection(contextWithoutWorldState.sections);
      const parsedWithoutWorldState = parseRelationshipHeader(relationshipSectionWithoutWorldState);
      worldStateRequiredForGraph1Hop = parsedWithoutWorldState.mode !== 'graph_1hop';
    }

    rows.push({
      chapterId: chapterRecord.chapterId,
      chapterTitle: chapterRecord.chapterTitle,
      chapterOrder: chapterRecord.chapterOrder,
      mode: parsedWithWorldState.mode,
      reason: parsedWithWorldState.reason,
      focusEntities: parsedWithWorldState.focusEntities,
      worldStateRequiredForGraph1Hop,
      relationshipsAddedBlockCount,
    });
  }

  const graph1hopCount = rows.filter((row) => row.mode === 'graph_1hop').length;
  const degradedCount = rows.filter((row) => row.mode === 'degraded').length;
  const worldStateRequiredCount = rows.filter((row) => row.worldStateRequiredForGraph1Hop).length;
  const relationshipsAddedBlockTotal = rows.reduce(
    (total, row) => total + row.relationshipsAddedBlockCount,
    0,
  );

  const report: CalibrationExpansionReport = {
    projectId,
    scannedChapters: rows.length,
    rows,
    summary: {
      graph1hopCount,
      degradedCount,
      worldStateRequiredCount,
      averageRelationshipsAddedBlockCount:
        rows.length > 0 ? Number((relationshipsAddedBlockTotal / rows.length).toFixed(2)) : 0,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`4.3a 扩样收益验证失败：${message}`);
  process.exitCode = 1;
});
