import type { ServerEnv } from '../config/env.js';
import type {
  ChapterOutlineDraft,
  GenerationStructuredRelationshipQueryMode,
  GenerationStructuredRelationshipQueryReason,
  LightweightRecallConfig,
} from '../types/ai.js';
import {
  retrieveGenerationMemoryChunks,
  type GenerationRetrievedChunk,
} from './generation-retrieval.js';
import {
  deriveGenerationForeshadowLifecycle,
  listGenerationForeshadows,
  type GenerationForeshadowLifecycle,
} from './generation-foreshadow-store.js';
import { getGenerationDatabase } from './generation-sqlite.js';
import {
  buildResourceContinuityBlocks,
  loadResourceStateRows,
} from './generation-resource-continuity.js';
import { listGenerationVolumeRecaps, type GenerationVolumeRecapRecord } from './generation-volume-recap-store.js';

interface GenerationContextBuildInput {
  projectId: string;
  chapterId?: string;
  chapterTitle?: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  previousSummary?: string;
  worldState?: string;
  outline?: ChapterOutlineDraft | null;
  fallbackContextBundle?: string;
  preferStoredForeshadows?: boolean;
  lightweightRecallConfig?: LightweightRecallConfig;
}

interface ChapterMemoryRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  previousChapterId: string;
  previousChapterTitle: string;
  timeAnchor: string;
  strand: string;
  beats: string[];
  immutableFacts: string[];
  entitiesAppeared: string[];
  locations: string[];
  summary: string;
  hook: string;
  summaryExcerpt: string;
  updatedAt: string;
}

interface ChapterTextRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  generatedText: string;
  updatedAt: string;
}

interface GenerationEntityRow {
  entityName: string;
  entityType: string;
  description: string;
  fields: Record<string, string>;
  tags: string[];
  pinned: boolean;
  lastSeenChapterTitle: string;
  updatedAt: string;
}

interface RelationshipRow {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: string;
  sourceKind: string;
  description: string;
  evidence: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  updatedAt: string;
}

interface ForeshadowRow {
  id: string;
  title: string;
  excerpt: string;
  notes: string;
  status: 'planted' | 'activated' | 'resolved' | 'overdue';
  lifecycle: GenerationForeshadowLifecycle;
  sourceChapterOrder: number;
  sourceChapterTitle: string;
  resolvedChapterTitle: string;
  updatedAt: string;
}

interface VolumeRecapBlockEntry {
  volumeTitle: string;
  block: string;
  sortOrder: number;
}

interface LightweightRecallBlock {
  sourceType: 'dormant_foreshadow' | 'volume_recap';
  title: string;
  block: string;
  score: number;
  matchedPhrases: string[];
  matchedEntities: string[];
  scoreBreakdown: {
    phrase: number;
    entity: number;
    recency: number;
  };
  updatedAt: string;
}

type StructuredRelationshipConfidenceLevel = 'high' | 'medium' | 'low';

interface StructuredRelationshipEdgeCandidate {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: string;
  sourceKind: string;
  evidence: string;
  description: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  confidence: number;
  confidenceLevel: StructuredRelationshipConfidenceLevel;
}

interface StructuredRelationshipPathCandidate {
  focusEntityName: string;
  viaEntityName: string;
  targetEntityName: string;
  edgeA: StructuredRelationshipEdgeCandidate;
  edgeB: StructuredRelationshipEdgeCandidate;
  confidence: number;
  confidenceLevel: StructuredRelationshipConfidenceLevel;
}

interface StructuredRelationshipSignalResult {
  mode: GenerationStructuredRelationshipQueryMode;
  reason: GenerationStructuredRelationshipQueryReason;
  detailBlocks: string[];
  acceptedEdges: StructuredRelationshipEdgeCandidate[];
  acceptedPaths: StructuredRelationshipPathCandidate[];
}

interface StructuredRelationshipContextResult {
  mode: GenerationStructuredRelationshipQueryMode;
  reason: GenerationStructuredRelationshipQueryReason;
  signalCount: number;
  detailBlocks: string[];
  blocks: string[];
}

export interface GenerationContextSection {
  key: string;
  title: string;
  blocks: string[];
}

export interface GenerationContextBundleResult {
  bundle: string;
  recentSummaryCount: number;
  recentTextCount: number;
  volumeRecapCount: number;
  relatedChapterCount: number;
  dormantForeshadowRecallCount: number;
  volumeRecapRecallCount: number;
  entityCount: number;
  relationshipCount: number;
  hasFallbackContext: boolean;
  focusEntityNames: string[];
  queryPhrases: string[];
  lightweightRecallItems: LightweightRecallBlock[];
  sections: GenerationContextSection[];
}

interface FallbackContextParts {
  activeForeshadowBlocks: string[];
  residualBundle: string;
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

function parseFieldsJson(rawText: string | null | undefined) {
  if (!rawText) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function clampScore(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function looksLikeGenericRelationshipType(value: string) {
  const normalized = normalizeText(value);
  return !normalized || normalized === '关系' || normalized === '关联' || normalized === '相关';
}

function resolveStructuredRelationshipConfidenceLevel(score: number): StructuredRelationshipConfidenceLevel {
  if (score >= 0.78) {
    return 'high';
  }

  if (score >= 0.56) {
    return 'medium';
  }

  return 'low';
}

function scoreStructuredRelationshipCandidate(input: {
  sourceKind: string;
  relationshipType: string;
  hasTarget: boolean;
  evidence: string;
}) {
  let score = 0.15;
  const sourceKind = normalizeText(input.sourceKind);

  if (sourceKind === 'state_change') {
    score += 0.5;
  } else if (sourceKind === 'sentence_pattern') {
    score += 0.26;
  } else {
    score += 0.12;
  }

  if (!looksLikeGenericRelationshipType(input.relationshipType)) {
    score += 0.18;
  }

  if (input.hasTarget) {
    score += 0.08;
  }

  if (input.evidence.trim().length >= 12) {
    score += 0.09;
  }

  return clampScore(score, 0, 1);
}

function includesQuery(parts: Array<string | null | undefined>, query: string) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return false;
  }

  return parts.some((part) => normalizeText(part).includes(normalizedQuery));
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}...`;
}

function tailText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `...${trimmed.slice(-maxLength)}`;
}

function countTextOccurrences(source: string | null | undefined, pattern: string) {
  const normalizedSource = normalizeText(source);
  const normalizedPattern = normalizeText(pattern);

  if (!normalizedSource || !normalizedPattern) {
    return 0;
  }

  let count = 0;
  let startIndex = 0;

  while (true) {
    const nextIndex = normalizedSource.indexOf(normalizedPattern, startIndex);

    if (nextIndex < 0) {
      break;
    }

    count += 1;
    startIndex = nextIndex + normalizedPattern.length;
  }

  return count;
}

function buildSection(title: string, blocks: string[]) {
  if (blocks.length === 0) {
    return '';
  }

  return [`${title}：`, ...blocks].join('\n\n');
}

function parseFallbackContextBundle(rawText?: string) {
  const input = rawText?.trim() ?? '';

  if (!input) {
    return {
      activeForeshadowBlocks: [],
      residualBundle: '',
    } satisfies FallbackContextParts;
  }

  const marker = '激活伏笔：';
  const markerIndex = input.indexOf(marker);

  if (markerIndex < 0) {
    return {
      activeForeshadowBlocks: [],
      residualBundle: input,
    } satisfies FallbackContextParts;
  }

  const beforeMarker = input.slice(0, markerIndex).trim();
  const foreshadowText = input.slice(markerIndex + marker.length).trim();
  const activeForeshadowBlocks = foreshadowText
    .split(/\n\n(?=- )/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    activeForeshadowBlocks,
    residualBundle: beforeMarker,
  } satisfies FallbackContextParts;
}

function createSection(key: string, title: string, blocks: string[]) {
  const filteredBlocks = blocks.filter((block) => block.trim());

  if (filteredBlocks.length === 0) {
    return null;
  }

  return {
    key,
    title,
    blocks: filteredBlocks,
  } satisfies GenerationContextSection;
}

function compareChapterRows(left: Pick<ChapterMemoryRow, 'chapterOrder' | 'updatedAt'>, right: Pick<ChapterMemoryRow, 'chapterOrder' | 'updatedAt'>) {
  const leftOrder = left.chapterOrder > 0 ? left.chapterOrder : Number.MAX_SAFE_INTEGER;
  const rightOrder = right.chapterOrder > 0 ? right.chapterOrder : Number.MAX_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.updatedAt.localeCompare(right.updatedAt);
}

function buildChapterLabel(chapterOrder: number, chapterTitle: string) {
  if (chapterOrder <= 0) {
    return chapterTitle;
  }

  const trimmedTitle = chapterTitle.trim();
  const prefix = `第${chapterOrder}章`;

  if (trimmedTitle.startsWith(prefix)) {
    return trimmedTitle;
  }

  return `${prefix} ${trimmedTitle}`;
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

function buildFocusSignalTexts(input: GenerationContextBuildInput) {
  return {
    hard: [
      input.chapterTitle,
      input.outline?.goal,
      input.outline?.obstacle,
      input.outline?.cost,
      ...(input.outline?.beats ?? []),
      ...(input.outline?.immutableFacts ?? []),
    ].filter(Boolean) as string[],
    soft: [
      input.previousChapterTitle,
      input.previousSummary,
      input.worldState,
    ].filter(Boolean) as string[],
  };
}

function findChapterRowById(chapterRows: ChapterMemoryRow[], chapterId?: string) {
  if (!chapterId) {
    return null;
  }

  return chapterRows.find((row) => row.chapterId === chapterId) ?? null;
}

function buildEntityLatestSeenOrderMap(chapterRows: ChapterMemoryRow[], currentChapterOrder: number | null) {
  const latestSeenOrderMap = new Map<string, number>();

  for (const row of chapterRows) {
    if (row.chapterOrder <= 0) {
      continue;
    }

    if (currentChapterOrder !== null && row.chapterOrder >= currentChapterOrder) {
      continue;
    }

    for (const entityName of row.entitiesAppeared) {
      const key = normalizeText(entityName);
      const currentMax = latestSeenOrderMap.get(key) ?? 0;

      if (row.chapterOrder > currentMax) {
        latestSeenOrderMap.set(key, row.chapterOrder);
      }
    }
  }

  return latestSeenOrderMap;
}

function resolveEntityPositionScore(entityNames: string[], entityName: string, scoreByIndex: number[]) {
  const index = entityNames.findIndex((item) => normalizeText(item) === normalizeText(entityName));

  if (index < 0) {
    return 0;
  }

  return scoreByIndex[index] ?? 1;
}

function buildQueryPhrases(input: GenerationContextBuildInput) {
  return createUniqueList([
    input.chapterTitle ?? '',
    input.volumeTitle ?? '',
    input.previousChapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
    ...(input.outline?.immutableFacts ?? []),
  ]).slice(0, 12);
}

function loadChapterMemoryRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          idx.chapter_id,
          idx.chapter_title,
          idx.chapter_order,
          idx.volume_title,
          idx.previous_chapter_id,
          idx.previous_chapter_title,
          idx.time_anchor,
          idx.strand,
          idx.beats_json,
          idx.immutable_facts_json,
          idx.entities_appeared_json,
          idx.locations_json,
          idx.summary_excerpt,
          idx.updated_at,
          sums.summary,
          sums.hook
        FROM generation_chapter_index idx
        LEFT JOIN generation_chapter_summaries sums
          ON sums.project_id = idx.project_id AND sums.chapter_id = idx.chapter_id
        WHERE idx.project_id = ?
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows
    .map(
      (row): ChapterMemoryRow => ({
        chapterId: asString(row.chapter_id),
        chapterTitle: asString(row.chapter_title),
        chapterOrder: Number(row.chapter_order ?? 0),
        volumeTitle: asString(row.volume_title),
        previousChapterId: asString(row.previous_chapter_id),
        previousChapterTitle: asString(row.previous_chapter_title),
        timeAnchor: asString(row.time_anchor),
        strand: asString(row.strand),
        beats: parseStringArrayJson(asString(row.beats_json)),
        immutableFacts: parseStringArrayJson(asString(row.immutable_facts_json)),
        entitiesAppeared: parseStringArrayJson(asString(row.entities_appeared_json)),
        locations: parseStringArrayJson(asString(row.locations_json)),
        summary: asString(row.summary),
        hook: asString(row.hook),
        summaryExcerpt: asString(row.summary_excerpt),
        updatedAt: asString(row.updated_at),
      }),
    )
    .sort(compareChapterRows);
}

function loadRecentTextRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          jobs.chapter_id,
          jobs.chapter_title,
          jobs.generated_text,
          jobs.updated_at AS job_updated_at,
          idx.chapter_order
        FROM generation_jobs jobs
        LEFT JOIN generation_chapter_index idx
          ON idx.project_id = jobs.project_id AND idx.chapter_id = jobs.chapter_id
        WHERE jobs.project_id = ?
          AND jobs.generated_text <> ''
          AND jobs.status IN ('ready', 'approved')
        ORDER BY jobs.updated_at DESC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;
  const latestByChapter = new Map<string, ChapterTextRow>();

  for (const row of rows) {
    const chapterId = asString(row.chapter_id);

    if (!chapterId || latestByChapter.has(chapterId)) {
      continue;
    }

    latestByChapter.set(chapterId, {
      chapterId,
      chapterTitle: asString(row.chapter_title),
      chapterOrder: Number(row.chapter_order ?? 0),
      generatedText: asString(row.generated_text),
      updatedAt: asString(row.job_updated_at),
    });
  }

  return Array.from(latestByChapter.values());
}

function loadEntityRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          entity_name,
          entity_type,
          description,
          fields_json,
          tags_json,
          pinned,
          last_seen_chapter_title,
          updated_at
        FROM generation_entities
        WHERE project_id = ?
        ORDER BY pinned DESC, updated_at DESC, entity_name COLLATE NOCASE ASC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): GenerationEntityRow => ({
      entityName: asString(row.entity_name),
      entityType: asString(row.entity_type),
      description: asString(row.description),
      fields: parseFieldsJson(asString(row.fields_json)),
      tags: parseStringArrayJson(asString(row.tags_json)),
      pinned: Number(row.pinned ?? 0) > 0,
      lastSeenChapterTitle: asString(row.last_seen_chapter_title),
      updatedAt: asString(row.updated_at),
    }),
  );
}

function loadRelationshipRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          rel.source_entity_name,
          rel.target_entity_name,
          rel.relationship_type,
          rel.source_kind,
          rel.description,
          rel.evidence,
          rel.chapter_id,
          rel.chapter_title,
          COALESCE(idx.chapter_order, 0) AS chapter_order,
          rel.updated_at
        FROM generation_relationships rel
        LEFT JOIN generation_chapter_index idx
          ON idx.project_id = rel.project_id AND idx.chapter_id = rel.chapter_id
        WHERE rel.project_id = ?
        ORDER BY chapter_order DESC, rel.updated_at DESC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): RelationshipRow => ({
      sourceEntityName: asString(row.source_entity_name),
      targetEntityName: asString(row.target_entity_name),
      relationshipType: asString(row.relationship_type),
      sourceKind: asString(row.source_kind),
      description: asString(row.description),
      evidence: asString(row.evidence),
      chapterId: asString(row.chapter_id),
      chapterTitle: asString(row.chapter_title),
      chapterOrder: Number(row.chapter_order ?? 0),
      updatedAt: asString(row.updated_at),
    }),
  );
}

function resolveCurrentChapterOrder(
  input: GenerationContextBuildInput,
  chapterRows: ChapterMemoryRow[],
) {
  const requestOrder = Math.trunc(input.chapterOrder ?? 0);

  if (requestOrder > 0) {
    return requestOrder;
  }

  if (input.chapterId) {
    const currentRow = chapterRows.find((row) => row.chapterId === input.chapterId);

    if (currentRow && currentRow.chapterOrder > 0) {
      return currentRow.chapterOrder;
    }
  }

  if (input.previousChapterId) {
    const previousRow = chapterRows.find((row) => row.chapterId === input.previousChapterId);

    if (previousRow && previousRow.chapterOrder > 0) {
      return previousRow.chapterOrder + 1;
    }
  }

  return null;
}

function filterHistoricalChapters(
  input: GenerationContextBuildInput,
  chapterRows: ChapterMemoryRow[],
  currentChapterOrder: number | null,
) {
  return chapterRows.filter((row) => {
    if (input.chapterId && row.chapterId === input.chapterId) {
      return false;
    }

    if (currentChapterOrder !== null) {
      return row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder;
    }

    return true;
  });
}

function selectFocusEntityNames(
  input: GenerationContextBuildInput,
  chapterRows: ChapterMemoryRow[],
  entityRows: GenerationEntityRow[],
) {
  const currentChapterOrder = resolveCurrentChapterOrder(input, chapterRows);
  const currentRow = findChapterRowById(chapterRows, input.chapterId);
  const previousRow = findChapterRowById(chapterRows, input.previousChapterId);
  const { hard, soft } = buildFocusSignalTexts(input);
  const latestSeenOrderMap = buildEntityLatestSeenOrderMap(chapterRows, currentChapterOrder);
  const scoredCandidates = entityRows
    .map((row) => {
      const hardHitCount = hard.reduce((total, text) => total + countTextOccurrences(text, row.entityName), 0);
      const softHitCount = soft.reduce((total, text) => total + countTextOccurrences(text, row.entityName), 0);
      const currentChapterScore = currentRow
        ? resolveEntityPositionScore(currentRow.entitiesAppeared, row.entityName, [8, 5, 3, 1])
        : 0;
      const previousChapterScore = previousRow
        ? resolveEntityPositionScore(previousRow.entitiesAppeared, row.entityName, [5, 3, 2, 1])
        : 0;
      const latestSeenOrder = latestSeenOrderMap.get(normalizeText(row.entityName)) ?? 0;
      const recencyScore =
        currentChapterOrder !== null && latestSeenOrder > 0
          ? Math.max(0, 2 - Math.floor(Math.max(0, currentChapterOrder - latestSeenOrder - 1) / 10))
          : 0;
      const score =
        hardHitCount * 10
        + softHitCount * 4
        + currentChapterScore
        + previousChapterScore
        + recencyScore
        + (row.pinned ? 1 : 0);

      return {
        entityName: row.entityName,
        hardHitCount,
        softHitCount,
        currentChapterScore,
        previousChapterScore,
        latestSeenOrder,
        pinned: row.pinned,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.hardHitCount !== left.hardHitCount) {
        return right.hardHitCount - left.hardHitCount;
      }

      if (right.currentChapterScore !== left.currentChapterScore) {
        return right.currentChapterScore - left.currentChapterScore;
      }

      if (right.previousChapterScore !== left.previousChapterScore) {
        return right.previousChapterScore - left.previousChapterScore;
      }

      if (right.latestSeenOrder !== left.latestSeenOrder) {
        return right.latestSeenOrder - left.latestSeenOrder;
      }

      if (right.pinned !== left.pinned) {
        return Number(right.pinned) - Number(left.pinned);
      }

      return left.entityName.localeCompare(right.entityName, 'zh-CN');
    });

  if (scoredCandidates.length > 0) {
    const limit = scoredCandidates.some((item) => item.hardHitCount > 0) ? 4 : 3;
    return scoredCandidates.slice(0, limit).map((item) => item.entityName);
  }

  if (currentRow && currentRow.entitiesAppeared.length > 0) {
    return createUniqueList(currentRow.entitiesAppeared).slice(0, 2);
  }

  if (previousRow && previousRow.entitiesAppeared.length > 0) {
    return createUniqueList(previousRow.entitiesAppeared).slice(0, 2);
  }

  const pinnedNames = entityRows.filter((row) => row.pinned).map((row) => row.entityName);

  if (pinnedNames.length > 0) {
    return pinnedNames.slice(0, 3);
  }

  return entityRows.slice(0, 3).map((row) => row.entityName);
}

function selectStructuredRelationshipFocusEntityNames(
  input: GenerationContextBuildInput,
  chapterRows: ChapterMemoryRow[],
  focusEntityNames: string[],
) {
  const uniqueFocusEntityNames = createUniqueList(focusEntityNames);

  if (uniqueFocusEntityNames.length <= 1) {
    return uniqueFocusEntityNames;
  }

  const currentRow = findChapterRowById(chapterRows, input.chapterId);

  if (currentRow) {
    const primaryCurrentEntity = currentRow.entitiesAppeared.find((entityName) =>
      uniqueFocusEntityNames.some((focusEntityName) => normalizeText(focusEntityName) === normalizeText(entityName)),
    );

    if (primaryCurrentEntity) {
      return [primaryCurrentEntity];
    }
  }

  const { hard } = buildFocusSignalTexts(input);
  const explicitHits = uniqueFocusEntityNames.filter((entityName) =>
    hard.some((text) => countTextOccurrences(text, entityName) > 0),
  );

  if (explicitHits.length > 0) {
    return explicitHits.slice(0, 1);
  }

  const previousRow = findChapterRowById(chapterRows, input.previousChapterId);

  if (previousRow) {
    const primaryPreviousEntity = previousRow.entitiesAppeared.find((entityName) =>
      uniqueFocusEntityNames.some((focusEntityName) => normalizeText(focusEntityName) === normalizeText(entityName)),
    );

    if (primaryPreviousEntity) {
      return [primaryPreviousEntity];
    }
  }

  return uniqueFocusEntityNames.slice(0, 1);
}

function buildRecentSummaryBlocks(rows: ChapterMemoryRow[]) {
  return rows.map((row) => {
    const lines = [`- ${buildChapterLabel(row.chapterOrder, row.chapterTitle)}`];
    const summaryText = row.summary || row.summaryExcerpt;

    if (summaryText) {
      lines.push(`摘要：${truncateText(summaryText, 180)}`);
    }

    if (row.hook) {
      lines.push(`钩子：${truncateText(row.hook, 80)}`);
    }

    return lines.join('\n');
  });
}

function buildRecentTextBlocks(rows: ChapterTextRow[]) {
  return rows.map((row) =>
    [`- ${buildChapterLabel(row.chapterOrder, row.chapterTitle)}`, tailText(row.generatedText, 260)].join('\n'),
  );
}

function buildVolumeRecapEntriesFromHistoricalRows(
  rows: ChapterMemoryRow[],
  currentVolumeTitle?: string,
) {
  const groups = new Map<string, ChapterMemoryRow[]>();

  for (const row of rows) {
    const volumeTitle = row.volumeTitle.trim();

    if (!volumeTitle) {
      continue;
    }

    const current = groups.get(volumeTitle) ?? [];
    current.push(row);
    groups.set(volumeTitle, current);
  }

  const normalizedCurrentVolume = normalizeText(currentVolumeTitle);
  const groupEntries = Array.from(groups.entries())
    .filter(([volumeTitle]) => normalizeText(volumeTitle) !== normalizedCurrentVolume)
    .sort((left, right) => compareChapterRows(left[1][left[1].length - 1], right[1][right[1].length - 1]))
    .reverse()
    .slice(0, 6);

  return groupEntries.map(([volumeTitle, groupRows]) => {
    const sortedRows = [...groupRows].sort(compareChapterRows);
    const firstRow = sortedRows[0];
    const lastRow = sortedRows[sortedRows.length - 1];
    const highlights = createUniqueList(
      sortedRows
        .slice(-2)
        .flatMap((row) => [row.summary || row.summaryExcerpt, row.hook]),
    )
      .map((item) => truncateText(item, 80))
      .slice(0, 2);
    const range =
      firstRow.chapterOrder > 0 && lastRow.chapterOrder > 0
        ? `第${firstRow.chapterOrder}-${lastRow.chapterOrder}章`
        : `累计 ${sortedRows.length} 章`;

    const entry: VolumeRecapBlockEntry = {
      volumeTitle,
      sortOrder: lastRow.chapterOrder > 0 ? lastRow.chapterOrder : 0,
      block: [
        `- ${volumeTitle}`,
        `范围：${range}`,
        `提要：${highlights.join('；') || '暂无稳定卷级摘要'}`,
      ].join('\n'),
    };

    return entry;
  });
}

function buildVolumeRecapEntriesFromStoredRecaps(
  rows: GenerationVolumeRecapRecord[],
  currentVolumeTitle?: string,
) {
  const normalizedCurrentVolume = normalizeText(currentVolumeTitle);

  return rows
    .filter((row) => normalizeText(row.volumeTitle) !== normalizedCurrentVolume)
    .slice(0, 6)
    .map((row) => {
      const range =
        row.startChapterOrder > 0 && row.endChapterOrder > 0
          ? `第${row.startChapterOrder}-${row.endChapterOrder}章`
          : `累计 ${row.chapterCount} 章`;

      const entry: VolumeRecapBlockEntry = {
        volumeTitle: row.volumeTitle,
        sortOrder: row.endChapterOrder > 0 ? row.endChapterOrder : 0,
        block: [
          `- ${row.volumeTitle}`,
          `范围：${range}`,
          `提要：${truncateText(row.summary, 180) || '暂无稳定卷级摘要'}`,
        ].join('\n'),
      };

      return entry;
    });
}

function mergeVolumeRecapBlocks(
  storedEntries: VolumeRecapBlockEntry[],
  fallbackEntries: VolumeRecapBlockEntry[],
) {
  const merged = new Map<string, VolumeRecapBlockEntry>();

  for (const entry of storedEntries) {
    merged.set(normalizeText(entry.volumeTitle), entry);
  }

  for (const entry of fallbackEntries) {
    const key = normalizeText(entry.volumeTitle);

    if (!merged.has(key)) {
      merged.set(key, entry);
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => right.sortOrder - left.sortOrder)
    .slice(0, 6)
    .map((entry) => entry.block);
}

function buildCurrentVolumeSnapshotBlocks(
  rows: ChapterMemoryRow[],
  currentVolumeTitle?: string,
) {
  const normalizedCurrentVolume = normalizeText(currentVolumeTitle);

  if (!normalizedCurrentVolume) {
    return [] as string[];
  }

  const currentVolumeRows = rows.filter((row) => normalizeText(row.volumeTitle) === normalizedCurrentVolume);

  if (currentVolumeRows.length === 0) {
    return [] as string[];
  }

  const recentRows = currentVolumeRows.slice(-5);
  const highlightTexts = createUniqueList(
    recentRows.flatMap((row) => [row.summary || row.summaryExcerpt, row.hook]),
  )
    .map((item) => truncateText(item, 90))
    .slice(0, 4);
  const firstRow = currentVolumeRows[0];
  const lastRow = currentVolumeRows[currentVolumeRows.length - 1];
  const range =
    firstRow.chapterOrder > 0 && lastRow.chapterOrder > 0
      ? `第${firstRow.chapterOrder}-${lastRow.chapterOrder}章`
      : `累计 ${currentVolumeRows.length} 章`;

  return [
    [
      `- ${currentVolumeTitle}`,
      `范围：${range}`,
      `近期推进：${highlightTexts.join('；') || '暂无稳定推进摘要'}`,
    ].join('\n'),
  ];
}

function buildForeshadowBlocks(rows: ForeshadowRow[]) {
  return rows
    .filter((row) => row.lifecycle === 'active')
    .slice(0, 8)
    .map((row) => {
      const summary = truncateText(row.excerpt || row.notes || '暂无说明', 120);
      const sourceLabel = row.sourceChapterTitle || '未关联章节';
      const statusLabel =
        row.status === 'overdue' ? '超期' : row.status === 'activated' ? '已激活' : '已埋设';
      const lines = [`- ${row.title}`, `状态：激活 / ${statusLabel}`, `来源：${sourceLabel}`, `摘要：${summary}`];

      if (row.resolvedChapterTitle) {
        lines.push(`预期回收：${row.resolvedChapterTitle}`);
      }

      return lines.join('\n');
    });
}

function buildWorkingMemoryBlocks(
  input: GenerationContextBuildInput,
  currentVolumeSnapshotBlocks: string[],
  activeForeshadowBlocks: string[],
) {
  const contractLines = input.outline
    ? [
        `- 本章目标：${input.outline.goal || '暂无'}`,
        `阻力：${input.outline.obstacle || '暂无'}`,
        `代价：${input.outline.cost || '暂无'}`,
        `Strand：${input.outline.strand}`,
        input.outline.beats.length > 0 ? `Beats：${input.outline.beats.join(' | ')}` : '',
        input.outline.immutableFacts.length > 0 ? `不可变事实：${input.outline.immutableFacts.join('；')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';
  const blocks = [
    contractLines,
    input.previousSummary?.trim() ? `- 上章承接\n${truncateText(input.previousSummary.trim(), 180)}` : '',
    ...currentVolumeSnapshotBlocks,
    ...activeForeshadowBlocks.map((block) => `- 激活伏笔\n${block}`),
  ].filter(Boolean);

  return blocks;
}

function buildRelatedChapterBlocks(items: GenerationRetrievedChunk[]) {
  return items.map((item) => item.block);
}

function buildLightweightRecallItems(items: GenerationRetrievedChunk[]) {
  return items
    .filter(
      (item): item is GenerationRetrievedChunk & { sourceType: 'dormant_foreshadow' | 'volume_recap' } =>
        item.sourceType === 'dormant_foreshadow' || item.sourceType === 'volume_recap',
    )
    .map((item): LightweightRecallBlock => ({
      sourceType: item.sourceType,
      title: item.title,
      block: item.block,
      score: item.score,
      matchedPhrases: item.matchedTerms,
      matchedEntities: item.matchedEntityNames,
      scoreBreakdown: {
        phrase: item.scoreBreakdown.phrase,
        entity: item.scoreBreakdown.entity,
        recency: item.scoreBreakdown.recency,
      },
      updatedAt: item.updatedAt,
    }));
}

function buildEntityBlocks(entityRows: GenerationEntityRow[], focusEntityNames: string[]) {
  const entityRowMap = new Map(entityRows.map((row) => [normalizeText(row.entityName), row] as const));

  return focusEntityNames
    .map((entityName) => entityRowMap.get(normalizeText(entityName)))
    .filter((row): row is GenerationEntityRow => Boolean(row))
    .slice(0, 6)
    .map((row) => {
      const lines = [`- ${row.entityName}${row.entityType ? `（${row.entityType}）` : ''}`];
      const fieldEntries = Object.entries(row.fields)
        .map(([key, value]) => `${key}=${value}`)
        .slice(0, 4);

      if (row.description) {
        lines.push(`描述：${truncateText(row.description, 80)}`);
      }

      if (fieldEntries.length > 0) {
        lines.push(`关键状态：${fieldEntries.join('；')}`);
      }

      if (row.tags.length > 0) {
        lines.push(`标签：${row.tags.slice(0, 4).join(' / ')}`);
      }

      if (row.lastSeenChapterTitle) {
        lines.push(`最近出现：${row.lastSeenChapterTitle}`);
      }

      return lines.join('\n');
    });
}

function describeStructuredRelationshipOneHopReason(reason: GenerationStructuredRelationshipQueryReason) {
  if (reason === 'ok') {
    return '命中历史一度关系边';
  }

  if (reason === 'missing_chapter_context') {
    return '缺少有效章节上下文';
  }

  if (reason === 'no_focus_entity') {
    return '未识别可用焦点实体';
  }

  if (reason === 'high_noise') {
    return '候选关系噪音偏高';
  }

  return '历史关系不足';
}

function describeStructuredRelationshipTwoHopReason(reason: GenerationStructuredRelationshipQueryReason) {
  if (reason === 'ok') {
    return '命中稳定二度关系路径';
  }

  if (reason === 'missing_chapter_context') {
    return '缺少有效章节上下文';
  }

  if (reason === 'no_focus_entity') {
    return '未识别可用焦点实体';
  }

  if (reason === 'high_noise') {
    return '候选二度路径噪音偏高';
  }

  return '历史二度关系不足';
}

function buildStructuredRelationshipFallbackHintBlocks(
  chapterRows: ChapterMemoryRow[],
  currentChapterOrder: number,
  focusEntityNames: string[],
) {
  const normalizedFocusSet = new Set(focusEntityNames.map((item) => normalizeText(item)));

  if (normalizedFocusSet.size === 0 || currentChapterOrder <= 0) {
    return [] as string[];
  }

  const hintBlocks: string[] = [];
  const historicalRows = [...chapterRows]
    .filter((row) => row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder)
    .sort((left, right) => right.chapterOrder - left.chapterOrder);

  for (const row of historicalRows) {
    const matchedFocus = row.entitiesAppeared.filter((name) => normalizedFocusSet.has(normalizeText(name)));

    if (matchedFocus.length === 0) {
      continue;
    }

    const coAppeared = row.entitiesAppeared.filter((name) => !normalizedFocusSet.has(normalizeText(name)));

    if (coAppeared.length === 0) {
      continue;
    }

    hintBlocks.push(
      [
        `- 弱提示：${matchedFocus.join('、')} 与 ${coAppeared.slice(0, 4).join('、')} 同章出现`,
        `来源：${buildChapterLabel(row.chapterOrder, row.chapterTitle)}`,
      ].join('\n'),
    );

    if (hintBlocks.length >= 4) {
      break;
    }
  }

  return hintBlocks;
}

function buildStructuredRelationshipNoisyEdgeHintBlocks(edges: StructuredRelationshipEdgeCandidate[]) {
  return edges
    .slice(0, 1)
    .map((edge) =>
      [
        `- 弱结构提示：${edge.sourceEntityName} -> ${edge.targetEntityName}（${edge.relationshipType}）`,
        `来源：${edge.chapterTitle || '未知章节'}`,
        `证据：${truncateText(edge.evidence || edge.description, 80)}`,
        `置信：${edge.confidenceLevel} (${edge.confidence.toFixed(2)})`,
      ].join('\n'),
    );
}

function buildStructuredRelationshipOneHopSignalResult(input: {
  relationshipRows: RelationshipRow[];
  chapterRows: ChapterMemoryRow[];
  focusEntityNames: string[];
  currentChapterOrder: number | null;
  currentChapterId?: string;
}): StructuredRelationshipSignalResult {
  const uniqueFocusEntityNames = createUniqueList(input.focusEntityNames);
  const makeResult = (
    reason: GenerationStructuredRelationshipQueryReason,
    detailBlocks: string[],
  ): StructuredRelationshipSignalResult => {
    return {
      mode: reason === 'ok' ? 'graph_1hop' : 'degraded',
      reason,
      detailBlocks,
      acceptedEdges: [],
      acceptedPaths: [],
    };
  };

  if (input.currentChapterOrder === null || input.currentChapterOrder <= 0) {
    return makeResult('missing_chapter_context', [
      '- 弱提示：无法锁定当前章节顺序，暂不注入结构化关系事实。',
    ]);
  }

  if (uniqueFocusEntityNames.length === 0) {
    return makeResult('no_focus_entity', [
      '- 弱提示：未识别焦点实体，暂不注入结构化关系事实。',
    ]);
  }

  const normalizedFocusSet = new Set(uniqueFocusEntityNames.map((item) => normalizeText(item)));
  const dedupedEdges = new Map<string, StructuredRelationshipEdgeCandidate>();
  let candidateRelationships = 0;

  for (const row of input.relationshipRows) {
    if (row.chapterOrder <= 0 || row.chapterOrder >= input.currentChapterOrder) {
      continue;
    }

    if (input.currentChapterId && row.chapterId === input.currentChapterId) {
      continue;
    }

    const sourceMatched = normalizedFocusSet.has(normalizeText(row.sourceEntityName));
    const targetMatched = normalizedFocusSet.has(normalizeText(row.targetEntityName));

    if (!sourceMatched && !targetMatched) {
      continue;
    }

    const confidence = scoreStructuredRelationshipCandidate({
      sourceKind: row.sourceKind,
      relationshipType: row.relationshipType,
      hasTarget: Boolean(row.targetEntityName),
      evidence: row.evidence || row.description,
    });
    const confidenceLevel = resolveStructuredRelationshipConfidenceLevel(confidence);

    candidateRelationships += 1;

    if (confidenceLevel === 'low') {
      continue;
    }

    const edge: StructuredRelationshipEdgeCandidate = {
      sourceEntityName: row.sourceEntityName || '未知实体',
      targetEntityName: row.targetEntityName || '未知目标',
      relationshipType: row.relationshipType || '关系',
      sourceKind: row.sourceKind || 'unknown',
      evidence: row.evidence,
      description: row.description,
      chapterId: row.chapterId,
      chapterTitle: row.chapterTitle,
      chapterOrder: row.chapterOrder,
      confidence,
      confidenceLevel,
    };
    const dedupeKey = [
      normalizeText(edge.sourceEntityName),
      normalizeText(edge.targetEntityName),
      normalizeText(edge.relationshipType),
    ].join(':');
    const existing = dedupedEdges.get(dedupeKey);

    if (
      !existing ||
      edge.confidence > existing.confidence ||
      (edge.confidence === existing.confidence && edge.chapterOrder > existing.chapterOrder)
    ) {
      dedupedEdges.set(dedupeKey, edge);
    }
  }

  const acceptedEdges = Array.from(dedupedEdges.values())
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return right.chapterOrder - left.chapterOrder;
    })
    .slice(0, 8);

  if (acceptedEdges.length === 0) {
    const hintBlocks = buildStructuredRelationshipFallbackHintBlocks(
      input.chapterRows,
      input.currentChapterOrder,
      uniqueFocusEntityNames,
    );

    return makeResult(
      'no_historical_relationship',
      hintBlocks.length > 0
        ? hintBlocks
        : ['- 弱提示：未命中稳定历史关系边，请结合短期记忆与外部检索综合判断。'],
    );
  }

  const acceptedRatio = candidateRelationships > 0 ? acceptedEdges.length / candidateRelationships : 0;

  if (candidateRelationships >= 5 && acceptedRatio < 0.34) {
    const hintBlocks = buildStructuredRelationshipFallbackHintBlocks(
      input.chapterRows,
      input.currentChapterOrder,
      uniqueFocusEntityNames,
    );
    const noisyEdgeHintBlocks = buildStructuredRelationshipNoisyEdgeHintBlocks(acceptedEdges);

    return makeResult(
      'high_noise',
      [
        ...(noisyEdgeHintBlocks.length > 0 ? noisyEdgeHintBlocks : []),
        ...(hintBlocks.length > 0
          ? hintBlocks
          : ['- 弱提示：历史关系候选噪音偏高，当前不注入强关系事实。']),
      ],
    );
  }

  const edgeBlocks = acceptedEdges.map((edge) =>
    [
      `- 强关系：${edge.sourceEntityName} -> ${edge.targetEntityName}（${edge.relationshipType}）`,
      `来源：${edge.chapterTitle || '未知章节'}`,
      `证据：${truncateText(edge.evidence || edge.description, 100)}`,
      `置信：${edge.confidenceLevel} (${edge.confidence.toFixed(2)})`,
    ].join('\n'),
  );

  return {
    mode: 'graph_1hop',
    reason: 'ok',
    detailBlocks: edgeBlocks,
    acceptedEdges,
    acceptedPaths: [],
  };
}

function buildStructuredRelationshipTwoHopSignalResult(input: {
  relationshipRows: RelationshipRow[];
  focusEntityNames: string[];
  currentChapterOrder: number | null;
  currentChapterId?: string;
}): StructuredRelationshipSignalResult {
  const uniqueFocusEntityNames = createUniqueList(input.focusEntityNames);
  const makeResult = (
    reason: GenerationStructuredRelationshipQueryReason,
    detailBlocks: string[] = [],
  ): StructuredRelationshipSignalResult => ({
    mode: reason === 'ok' ? 'graph_2hop' : 'degraded',
    reason,
    detailBlocks,
    acceptedEdges: [],
    acceptedPaths: [],
  });

  if (input.currentChapterOrder === null || input.currentChapterOrder <= 0) {
    return makeResult('missing_chapter_context');
  }

  if (uniqueFocusEntityNames.length === 0) {
    return makeResult('no_focus_entity');
  }

  const normalizedFocusSet = new Set(uniqueFocusEntityNames.map((item) => normalizeText(item)));
  const candidateEdges: StructuredRelationshipEdgeCandidate[] = [];

  for (const row of input.relationshipRows) {
    if (row.chapterOrder <= 0 || row.chapterOrder >= input.currentChapterOrder) {
      continue;
    }

    if (input.currentChapterId && row.chapterId === input.currentChapterId) {
      continue;
    }

    const confidence = scoreStructuredRelationshipCandidate({
      sourceKind: row.sourceKind,
      relationshipType: row.relationshipType,
      hasTarget: Boolean(row.targetEntityName),
      evidence: row.evidence || row.description,
    });
    const confidenceLevel = resolveStructuredRelationshipConfidenceLevel(confidence);

    if (confidenceLevel === 'low') {
      continue;
    }

    candidateEdges.push({
      sourceEntityName: row.sourceEntityName || '未知实体',
      targetEntityName: row.targetEntityName || '未知目标',
      relationshipType: row.relationshipType || '关系',
      sourceKind: row.sourceKind || 'unknown',
      evidence: row.evidence,
      description: row.description,
      chapterId: row.chapterId,
      chapterTitle: row.chapterTitle,
      chapterOrder: row.chapterOrder,
      confidence,
      confidenceLevel,
    });
  }

  const adjacency = new Map<string, StructuredRelationshipEdgeCandidate[]>();

  for (const edge of candidateEdges) {
    const sourceKey = normalizeText(edge.sourceEntityName);
    const targetKey = normalizeText(edge.targetEntityName);
    const sourceBucket = adjacency.get(sourceKey) ?? [];
    sourceBucket.push(edge);
    adjacency.set(sourceKey, sourceBucket);

    const targetBucket = adjacency.get(targetKey) ?? [];
    targetBucket.push(edge);
    adjacency.set(targetKey, targetBucket);
  }

  const dedupedPaths = new Map<string, StructuredRelationshipPathCandidate>();
  let candidatePaths = 0;

  for (const focusEntityName of uniqueFocusEntityNames) {
    const firstHopEdges = adjacency.get(normalizeText(focusEntityName)) ?? [];

    for (const firstHopEdge of firstHopEdges) {
      const viaEntityName = normalizeText(firstHopEdge.sourceEntityName) === normalizeText(focusEntityName)
        ? firstHopEdge.targetEntityName
        : firstHopEdge.sourceEntityName;
      const secondHopEdges = adjacency.get(normalizeText(viaEntityName)) ?? [];

      for (const secondHopEdge of secondHopEdges) {
        const targetEntityName = normalizeText(secondHopEdge.sourceEntityName) === normalizeText(viaEntityName)
          ? secondHopEdge.targetEntityName
          : secondHopEdge.sourceEntityName;

        if (!targetEntityName) {
          continue;
        }

        if (normalizeText(targetEntityName) === normalizeText(focusEntityName)) {
          continue;
        }

        if (normalizedFocusSet.has(normalizeText(targetEntityName))) {
          continue;
        }

        if (
          firstHopEdge.chapterId === secondHopEdge.chapterId
          && normalizeText(firstHopEdge.sourceEntityName) === normalizeText(secondHopEdge.sourceEntityName)
          && normalizeText(firstHopEdge.targetEntityName) === normalizeText(secondHopEdge.targetEntityName)
          && normalizeText(firstHopEdge.relationshipType) === normalizeText(secondHopEdge.relationshipType)
        ) {
          continue;
        }

        candidatePaths += 1;
        const confidence = Number(((firstHopEdge.confidence + secondHopEdge.confidence) / 2).toFixed(3));
        const confidenceLevel = resolveStructuredRelationshipConfidenceLevel(confidence);
        const pathCandidate: StructuredRelationshipPathCandidate = {
          focusEntityName,
          viaEntityName,
          targetEntityName,
          edgeA: firstHopEdge,
          edgeB: secondHopEdge,
          confidence,
          confidenceLevel,
        };
        const dedupeKey = [
          normalizeText(focusEntityName),
          normalizeText(viaEntityName),
          normalizeText(targetEntityName),
        ].join('->');
        const existing = dedupedPaths.get(dedupeKey);

        if (
          !existing ||
          pathCandidate.confidence > existing.confidence ||
          (
            pathCandidate.confidence === existing.confidence
            && Math.max(pathCandidate.edgeA.chapterOrder, pathCandidate.edgeB.chapterOrder)
              > Math.max(existing.edgeA.chapterOrder, existing.edgeB.chapterOrder)
          )
        ) {
          dedupedPaths.set(dedupeKey, pathCandidate);
        }
      }
    }
  }

  const acceptedPaths = Array.from(dedupedPaths.values())
    .filter((item) => item.confidenceLevel !== 'low')
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return Math.max(right.edgeA.chapterOrder, right.edgeB.chapterOrder)
        - Math.max(left.edgeA.chapterOrder, left.edgeB.chapterOrder);
    })
    .slice(0, 4);

  if (acceptedPaths.length === 0) {
    return makeResult('no_two_hop_relationship');
  }

  const acceptedRatio = candidatePaths > 0 ? acceptedPaths.length / candidatePaths : 0;

  if (candidatePaths >= 6 && acceptedRatio < 0.34) {
    return makeResult('high_noise');
  }

  const pathBlocks = acceptedPaths.map((path) =>
    [
      `- 二跳路径：${path.focusEntityName} -> ${path.viaEntityName} -> ${path.targetEntityName}`,
      `关系链：${path.focusEntityName} 与 ${path.viaEntityName}（${path.edgeA.relationshipType}）；${path.viaEntityName} 与 ${path.targetEntityName}（${path.edgeB.relationshipType}）`,
      `来源：${path.edgeA.chapterTitle || '未知章节'} -> ${path.edgeB.chapterTitle || '未知章节'}`,
      `置信：${path.confidenceLevel} (${path.confidence.toFixed(2)})`,
    ].join('\n'),
  );

  return {
    mode: 'graph_2hop',
    reason: 'ok',
    detailBlocks: pathBlocks,
    acceptedEdges: [],
    acceptedPaths,
  };
}

function buildStructuredRelationshipContextResult(input: {
  relationshipRows: RelationshipRow[];
  chapterRows: ChapterMemoryRow[];
  focusEntityNames: string[];
  currentChapterOrder: number | null;
  currentChapterId?: string;
}): StructuredRelationshipContextResult {
  const uniqueFocusEntityNames = createUniqueList(input.focusEntityNames);
  const focusLabel = uniqueFocusEntityNames.join('、') || '无';
  const oneHopResult = buildStructuredRelationshipOneHopSignalResult(input);
  const shouldEvaluateTwoHop = oneHopResult.mode !== 'graph_1hop' || oneHopResult.detailBlocks.length <= 2;
  const twoHopResult = shouldEvaluateTwoHop
    ? buildStructuredRelationshipTwoHopSignalResult(input)
    : null;

  if (oneHopResult.mode === 'graph_1hop') {
    const oneHopEntityNames = new Set(
      oneHopResult.acceptedEdges.flatMap((edge) => [
        normalizeText(edge.sourceEntityName),
        normalizeText(edge.targetEntityName),
      ]),
    );
    const twoHopEvaluationLine =
      twoHopResult
        ? twoHopResult.mode === 'graph_2hop'
          ? '补充评估：ok（命中二度路径，但未形成新增实体链）'
          : `补充评估：${twoHopResult.reason}（${describeStructuredRelationshipTwoHopReason(twoHopResult.reason)}）`
        : null;
    const twoHopSupplementBlocks =
      twoHopResult?.mode === 'graph_2hop'
        ? twoHopResult.acceptedPaths
            .filter((path) =>
              !(
                oneHopEntityNames.has(normalizeText(path.focusEntityName)) &&
                oneHopEntityNames.has(normalizeText(path.viaEntityName)) &&
                oneHopEntityNames.has(normalizeText(path.targetEntityName))
              ),
            )
            .slice(0, Math.min(2, Math.max(0, 3 - oneHopResult.detailBlocks.length)))
            .map((path) =>
              [
                `- 二跳路径：${path.focusEntityName} -> ${path.viaEntityName} -> ${path.targetEntityName}`,
                `关系链：${path.focusEntityName} 与 ${path.viaEntityName}（${path.edgeA.relationshipType}）；${path.viaEntityName} 与 ${path.targetEntityName}（${path.edgeB.relationshipType}）`,
                `来源：${path.edgeA.chapterTitle || '未知章节'} -> ${path.edgeB.chapterTitle || '未知章节'}`,
                `置信：${path.confidenceLevel} (${path.confidence.toFixed(2)})`,
              ].join('\n'),
            )
        : [];
    const headerBlock = [
      `- 命中模式：${twoHopSupplementBlocks.length > 0 ? 'graph_1hop（主信号，补充二度路径）' : 'graph_1hop（结构化强信号）'}`,
      '注入层：relationships',
      `原因：${oneHopResult.reason}（${describeStructuredRelationshipOneHopReason(oneHopResult.reason)}）`,
      `焦点实体：${focusLabel}`,
      `接入策略：${twoHopSupplementBlocks.length > 0 ? '一度关系优先，补充少量二度路径。' : '一度关系优先。'}`,
      ...(twoHopSupplementBlocks.length > 0 && twoHopResult
        ? [`补充评估：${twoHopResult.reason}（${describeStructuredRelationshipTwoHopReason(twoHopResult.reason)}）`]
        : twoHopEvaluationLine
          ? [twoHopEvaluationLine]
          : []),
    ].join('\n');
    const detailBlocks = [...oneHopResult.detailBlocks, ...twoHopSupplementBlocks];

    return {
      mode: 'graph_1hop',
      reason: oneHopResult.reason,
      signalCount: detailBlocks.length,
      detailBlocks,
      blocks: [headerBlock, ...detailBlocks],
    };
  }

  if (twoHopResult?.mode === 'graph_2hop') {
    const headerBlock = [
      '- 命中模式：graph_2hop（补位强信号）',
      '注入层：relationships',
      `原因：${twoHopResult.reason}（${describeStructuredRelationshipTwoHopReason(twoHopResult.reason)}）`,
      `焦点实体：${focusLabel}`,
      '接入策略：一度关系不足时，改用二度路径补位。',
      `补位评估：一度 ${oneHopResult.reason}（${describeStructuredRelationshipOneHopReason(oneHopResult.reason)}）`,
    ].join('\n');

    return {
      mode: 'graph_2hop',
      reason: twoHopResult.reason,
      signalCount: twoHopResult.detailBlocks.length,
      detailBlocks: twoHopResult.detailBlocks,
      blocks: [headerBlock, ...twoHopResult.detailBlocks],
    };
  }

  const headerBlock = [
    '- 命中模式：degraded（仅弱提示）',
    '注入层：relationships',
    `原因：${oneHopResult.reason}（${describeStructuredRelationshipOneHopReason(oneHopResult.reason)}）`,
    `焦点实体：${focusLabel}`,
    '接入策略：一度与二度都未形成稳定强信号。',
    ...(twoHopResult
      ? [`补位评估：${twoHopResult.reason}（${describeStructuredRelationshipTwoHopReason(twoHopResult.reason)}）`]
      : []),
  ].join('\n');

  return {
    mode: 'degraded',
    reason: oneHopResult.reason,
    signalCount: 0,
    detailBlocks: oneHopResult.detailBlocks,
    blocks: [headerBlock, ...oneHopResult.detailBlocks],
  };
}

export async function buildGenerationContextBundle(
  env: ServerEnv,
  input: GenerationContextBuildInput,
): Promise<GenerationContextBundleResult> {
  const chapterRows = loadChapterMemoryRows(env, input.projectId);
  const currentChapterOrder = resolveCurrentChapterOrder(input, chapterRows);
  const historicalRows = filterHistoricalChapters(input, chapterRows, currentChapterOrder);
  const recentSummaryRows = historicalRows.slice(-20).reverse();
  const recentTextRows = loadRecentTextRows(env, input.projectId)
    .filter((row) => {
      if (input.chapterId && row.chapterId === input.chapterId) {
        return false;
      }

      if (currentChapterOrder !== null) {
        return row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder;
      }

      return true;
    })
    .sort((left, right) => {
      const leftOrder = left.chapterOrder > 0 ? left.chapterOrder : Number.MIN_SAFE_INTEGER;
      const rightOrder = right.chapterOrder > 0 ? right.chapterOrder : Number.MIN_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return rightOrder - leftOrder;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 5);
  const entityRows = loadEntityRows(env, input.projectId);
  const relationshipRows = loadRelationshipRows(env, input.projectId);
  const resourceStateRows = loadResourceStateRows(env, input.projectId);
  const storedVolumeRecaps = listGenerationVolumeRecaps(env, input.projectId);
  const storedForeshadowRows = listGenerationForeshadows(env, input.projectId).map(
    (row): ForeshadowRow => ({
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      notes: row.notes,
      status: row.status,
      lifecycle: deriveGenerationForeshadowLifecycle(row, currentChapterOrder),
      sourceChapterOrder: row.sourceChapterOrder,
      sourceChapterTitle: row.sourceChapterTitle,
      resolvedChapterTitle: row.resolvedChapterTitle,
      updatedAt: row.updatedAt,
    }),
  );
  const focusEntityNames = selectFocusEntityNames(input, chapterRows, entityRows);
  const queryPhrases = buildQueryPhrases(input);
  const fallbackContext = parseFallbackContextBundle(input.fallbackContextBundle);
  const volumeRecapBlocks = mergeVolumeRecapBlocks(
    buildVolumeRecapEntriesFromStoredRecaps(storedVolumeRecaps, input.volumeTitle),
    buildVolumeRecapEntriesFromHistoricalRows(historicalRows, input.volumeTitle),
  );
  const currentVolumeSnapshotBlocks = buildCurrentVolumeSnapshotBlocks(historicalRows, input.volumeTitle);
  const retrievalItems = await retrieveGenerationMemoryChunks(env, {
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterOrder: currentChapterOrder ?? undefined,
    volumeTitle: input.volumeTitle,
    queryPhrases,
    focusEntityNames,
    limit: 6,
    lightweightRecallConfig: input.lightweightRecallConfig,
  });
  const relatedChapterBlocks = buildRelatedChapterBlocks(retrievalItems);
  const lightweightRecallBlocks = buildLightweightRecallItems(retrievalItems);
  const entityBlocks = buildEntityBlocks(entityRows, focusEntityNames);
  const relationshipFocusEntityNames = selectStructuredRelationshipFocusEntityNames(
    input,
    chapterRows,
    focusEntityNames,
  );
  const structuredRelationshipResult = buildStructuredRelationshipContextResult({
    relationshipRows,
    chapterRows,
    focusEntityNames: relationshipFocusEntityNames,
    currentChapterOrder,
    currentChapterId: input.chapterId,
  });
  const relationshipBlocks = structuredRelationshipResult.blocks;
  const serverForeshadowBlocks = buildForeshadowBlocks(storedForeshadowRows);
  const activeForeshadowBlocks =
    input.preferStoredForeshadows ? serverForeshadowBlocks : fallbackContext.activeForeshadowBlocks;
  const workingMemoryBlocks = buildWorkingMemoryBlocks(
    input,
    currentVolumeSnapshotBlocks,
    activeForeshadowBlocks,
  );
  const resourceContinuityBlocks = buildResourceContinuityBlocks(
    resourceStateRows,
    currentChapterOrder,
  );
  const sections = [
    createSection('working_memory', '工作记忆', workingMemoryBlocks),
    createSection('immediate_memory', '即时记忆', buildRecentTextBlocks(recentTextRows)),
    createSection('short_term_memory', '短期记忆', buildRecentSummaryBlocks(recentSummaryRows)),
    createSection('long_term_memory', '长期记忆', volumeRecapBlocks),
    createSection('retrieval_memory', '外部检索', relatedChapterBlocks),
    input.worldState?.trim() ? createSection('physical_engine', '物理引擎', [input.worldState.trim()]) : null,
    createSection('resource_continuity', '资源连续性', resourceContinuityBlocks),
    createSection('focus_entities', '当前关注实体', entityBlocks),
    createSection('relationships', '相关关系', relationshipBlocks),
    fallbackContext.residualBundle
      ? createSection('fallback_context', '前端补充上下文', [fallbackContext.residualBundle])
      : null,
  ].filter((section): section is GenerationContextSection => section !== null);

  return {
    bundle: sections.map((section) => buildSection(section.title, section.blocks)).filter(Boolean).join('\n\n'),
    recentSummaryCount: recentSummaryRows.length,
    recentTextCount: recentTextRows.length,
    volumeRecapCount: volumeRecapBlocks.length,
    relatedChapterCount: retrievalItems.filter((item) => item.sourceType === 'memory_chunk').length,
    dormantForeshadowRecallCount: retrievalItems.filter((item) => item.sourceType === 'dormant_foreshadow').length,
    volumeRecapRecallCount: retrievalItems.filter((item) => item.sourceType === 'volume_recap').length,
    entityCount: entityBlocks.length,
    relationshipCount: structuredRelationshipResult.signalCount,
    hasFallbackContext: Boolean(input.fallbackContextBundle?.trim()),
    focusEntityNames,
    queryPhrases,
    lightweightRecallItems: lightweightRecallBlocks,
    sections,
  };
}
