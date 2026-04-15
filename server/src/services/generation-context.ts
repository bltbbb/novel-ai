import type { ServerEnv } from '../config/env.js';
import type {
  ChapterOutlineDraft,
  GenerationRelationSnapshot,
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
import {
  listForeshadowPlans,
  listThreadLedgers,
  type ForeshadowPlanRecord,
  type ThreadLedgerRecord,
  listWorldStateEntries,
  type WorldStateEntryRecord,
} from './structure-memory-store.js';
import { listAntagonistAgendas, type AntagonistAgendaRecord } from './antagonist-agenda-store.js';
import { listPovPermissions, type PovPermissionRecord } from './pov-permission-store.js';
import {
  getResourceContinuityHintTerms,
  listResourceContinuities,
  type ResourceContinuityRecord,
} from './structured-resource-continuity-store.js';
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
  relationSnapshot?: GenerationRelationSnapshot[];
  allowDraftContext?: boolean;
  requiredEntityNames?: string[];
  availableCharacterNames?: string[];
  requiredForeshadowTitles?: string[];
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
  aliases: string[];
  pinned: boolean;
  draft: boolean;
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

const GENERATION_CONTEXT_LIMITS = {
  focusEntityMaxWithHardHit: 4,
  focusEntityMaxDefault: 3,
  focusEntityFallbackFromCurrentChapterMax: 2,
  focusEntityFallbackFromPreviousChapterMax: 2,
  focusEntityFallbackPinnedMax: 3,
  relationshipFocusEntityMax: 1,
  entityBlockMax: 6,
  entityFieldPreviewMax: 4,
  entityDescriptionMaxChars: 80,
  entityTagPreviewMax: 4,
  memoryRetrievalLimit: 6,
} as const;

const CHARACTER_STATIC_FIELD_LABELS = [
  ['static_desire', '欲望'],
  ['static_fear', '恐惧'],
  ['static_values', '价值排序'],
  ['static_trueNature', '真实底色'],
  ['static_speechStyle', '说话方式'],
  ['static_decisionStyle', '决策习惯'],
  ['static_conflictResponse', '冲突反应'],
  ['static_taboos', '底线禁忌'],
] as const;

const CHARACTER_DYNAMIC_FIELD_LABELS = [
  ['current_stance', '立场'],
  ['current_wound', '伤口'],
  ['current_goal', '目标'],
  ['current_disguise', '伪装'],
] as const;

function buildRelationPairKey(leftName: string, rightName: string) {
  const sorted = [normalizeText(leftName), normalizeText(rightName)].filter(Boolean).sort();
  return sorted.join('::');
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

function getEntitySearchTerms(row: GenerationEntityRow) {
  return createUniqueList([row.entityName, ...row.aliases])
    .map((item) => item.trim())
    .filter(Boolean);
}

function countEntityTextHits(text: string, row: GenerationEntityRow) {
  return getEntitySearchTerms(row).reduce((total, term) => total + countTextOccurrences(text, term), 0);
}

function resolveEntityRowPositionScore(entityNames: string[], row: GenerationEntityRow, scores: number[]) {
  return getEntitySearchTerms(row).reduce((best, term) => {
    return Math.max(best, resolveEntityPositionScore(entityNames, term, scores));
  }, 0);
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
      ...(input.availableCharacterNames ?? []),
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
    ...(input.requiredForeshadowTitles ?? []),
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
          aliases_json,
          pinned,
          draft,
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
      aliases: parseStringArrayJson(asString(row.aliases_json)),
      pinned: Number(row.pinned ?? 0) > 0,
      draft: Number(row.draft ?? 0) > 0,
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
      const hardHitCount = hard.reduce((total, text) => total + countEntityTextHits(text, row), 0);
      const softHitCount = soft.reduce((total, text) => total + countEntityTextHits(text, row), 0);
      const currentChapterScore = currentRow
        ? resolveEntityRowPositionScore(currentRow.entitiesAppeared, row, [8, 5, 3, 1])
        : 0;
      const previousChapterScore = previousRow
        ? resolveEntityRowPositionScore(previousRow.entitiesAppeared, row, [5, 3, 2, 1])
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
    const limit = scoredCandidates.some((item) => item.hardHitCount > 0)
      ? GENERATION_CONTEXT_LIMITS.focusEntityMaxWithHardHit
      : GENERATION_CONTEXT_LIMITS.focusEntityMaxDefault;
    return scoredCandidates.slice(0, limit).map((item) => item.entityName);
  }

  if (currentRow && currentRow.entitiesAppeared.length > 0) {
    return createUniqueList(currentRow.entitiesAppeared).slice(
      0,
      GENERATION_CONTEXT_LIMITS.focusEntityFallbackFromCurrentChapterMax,
    );
  }

  if (previousRow && previousRow.entitiesAppeared.length > 0) {
    return createUniqueList(previousRow.entitiesAppeared).slice(
      0,
      GENERATION_CONTEXT_LIMITS.focusEntityFallbackFromPreviousChapterMax,
    );
  }

  const pinnedNames = entityRows.filter((row) => row.pinned).map((row) => row.entityName);

  if (pinnedNames.length > 0) {
    return pinnedNames.slice(0, GENERATION_CONTEXT_LIMITS.focusEntityFallbackPinnedMax);
  }

  return entityRows.slice(0, GENERATION_CONTEXT_LIMITS.focusEntityMaxDefault).map((row) => row.entityName);
}

function selectStructuredRelationshipFocusEntityNames(
  input: GenerationContextBuildInput,
  chapterRows: ChapterMemoryRow[],
  focusEntityNames: string[],
) {
  const uniqueFocusEntityNames = createUniqueList(focusEntityNames);

  if (uniqueFocusEntityNames.length <= GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax) {
    return uniqueFocusEntityNames;
  }

  const currentRow = findChapterRowById(chapterRows, input.chapterId);

  if (currentRow) {
    const primaryCurrentEntity = currentRow.entitiesAppeared.find((entityName) =>
      uniqueFocusEntityNames.some((focusEntityName) => normalizeText(focusEntityName) === normalizeText(entityName)),
    );

    if (primaryCurrentEntity) {
      return [primaryCurrentEntity].slice(0, GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax);
    }
  }

  const { hard } = buildFocusSignalTexts(input);
  const explicitHits = uniqueFocusEntityNames.filter((entityName) =>
    hard.some((text) => countTextOccurrences(text, entityName) > 0),
  );

  if (explicitHits.length > 0) {
    return explicitHits.slice(0, GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax);
  }

  const previousRow = findChapterRowById(chapterRows, input.previousChapterId);

  if (previousRow) {
    const primaryPreviousEntity = previousRow.entitiesAppeared.find((entityName) =>
      uniqueFocusEntityNames.some((focusEntityName) => normalizeText(focusEntityName) === normalizeText(entityName)),
    );

    if (primaryPreviousEntity) {
      return [primaryPreviousEntity].slice(0, GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax);
    }
  }

  return uniqueFocusEntityNames.slice(0, GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax);
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

function buildForeshadowBlocks(rows: ForeshadowRow[], requiredTitles: string[] = []) {
  const normalizedRequiredSet = new Set(requiredTitles.map((item) => normalizeText(item)).filter(Boolean));

  return rows
    .filter((row) => row.lifecycle === 'active')
    .sort((left, right) => {
      const leftRequired = normalizedRequiredSet.has(normalizeText(left.title));
      const rightRequired = normalizedRequiredSet.has(normalizeText(right.title));

      if (leftRequired !== rightRequired) {
        return leftRequired ? -1 : 1;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
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

function buildForeshadowPlanBlocks(input: {
  plans: ForeshadowPlanRecord[];
  activeForeshadowRows: ForeshadowRow[];
  requiredForeshadowTitles?: string[];
}) {
  const activeForeshadowMap = new Map(
    input.activeForeshadowRows
      .filter((row) => row.lifecycle === 'active')
      .map((row) => [row.id, row] as const),
  );
  const requiredTitleSet = new Set(
    (input.requiredForeshadowTitles ?? [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );

  return input.plans
    .filter((plan) => activeForeshadowMap.has(plan.foreshadowId) || requiredTitleSet.has(normalizeText(plan.foreshadowTitle)))
    .sort((left, right) => {
      if (left.importance !== right.importance) {
        return left.importance === 'major' ? -1 : 1;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 2)
    .map((plan) => {
      const matchedForeshadow = activeForeshadowMap.get(plan.foreshadowId) ?? null;
      const lines = [
        `- ${plan.foreshadowTitle}（${plan.type || '未分类'} / ${plan.importance === 'major' ? '核心伏笔' : '次级伏笔'}）`,
      ];

      if (matchedForeshadow) {
        const statusLabel =
          matchedForeshadow.status === 'overdue'
            ? '超期'
            : matchedForeshadow.status === 'activated'
              ? '已激活'
              : matchedForeshadow.status === 'planted'
                ? '已埋设'
                : '已回收';
        lines.push(`当前状态：${statusLabel}`);
      }

      if (typeof plan.plannedActivateVolume === 'number' && plan.plannedActivateVolume > 0) {
        lines.push(`计划激活：第${plan.plannedActivateVolume}卷`);
      }

      if (typeof plan.plannedResolveVolume === 'number' && plan.plannedResolveVolume > 0) {
        lines.push(`计划回收：第${plan.plannedResolveVolume}卷`);
      }

      if (plan.resolveCondition) {
        lines.push(`回收条件：${truncateText(plan.resolveCondition, 120)}`);
      }

      if (plan.payoffEffect) {
        lines.push(`回收效果：${truncateText(plan.payoffEffect, 120)}`);
      }

      if (plan.activationCondition) {
        lines.push(`激活条件：${truncateText(plan.activationCondition, 100)}`);
      }

      return lines.join('\n');
    });
}

function countNormalizedMatches(values: string[], normalizedSet: Set<string>) {
  return values.reduce((count, value) => count + (normalizedSet.has(normalizeText(value)) ? 1 : 0), 0);
}

function buildThreadLedgerBlocks(input: {
  rows: ThreadLedgerRecord[];
  focusEntityNames: string[];
  requiredEntityNames?: string[];
  availableCharacterNames?: string[];
  requiredForeshadowTitles?: string[];
  currentChapterOrder: number | null;
  chapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
}) {
  const normalizedCharacterSet = new Set(
    createUniqueList([
      ...input.focusEntityNames,
      ...(input.requiredEntityNames ?? []),
      ...(input.availableCharacterNames ?? []),
    ])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );
  const normalizedForeshadowSet = new Set(
    (input.requiredForeshadowTitles ?? [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );
  const chapterHintHaystack = [
    input.chapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
  ]
    .join('\n')
    .toLowerCase();

  return input.rows
    .filter((row) => row.status !== 'resolved' && row.audienceHeat >= 3)
    .map((row) => {
      const relatedCharacterMatchCount = countNormalizedMatches(row.relatedCharacterNames, normalizedCharacterSet);
      const relatedForeshadowMatchCount = countNormalizedMatches(row.relatedForeshadowTitles, normalizedForeshadowSet);
      const normalizedThreadName = normalizeText(row.name);
      const normalizedCoreQuestion = normalizeText(row.coreQuestion);
      const recentGap =
        typeof row.lastProgressChapterOrder === 'number' &&
        input.currentChapterOrder &&
        input.currentChapterOrder > row.lastProgressChapterOrder
          ? input.currentChapterOrder - row.lastProgressChapterOrder
          : null;
      const chapterHintHit =
        (normalizedThreadName ? chapterHintHaystack.includes(normalizedThreadName) : false) ||
        (normalizedCoreQuestion ? chapterHintHaystack.includes(normalizedCoreQuestion) : false);
      const score =
        (row.status === 'active' ? 120 : 50) +
        row.audienceHeat * 20 +
        relatedCharacterMatchCount * 90 +
        relatedForeshadowMatchCount * 75 +
        (chapterHintHit ? 40 : 0) +
        (recentGap === null ? 0 : Math.max(0, 20 - recentGap));

      return {
        row,
        score,
      };
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.row.status !== right.row.status) {
        return left.row.status === 'active' ? -1 : 1;
      }

      if (left.row.audienceHeat !== right.row.audienceHeat) {
        return right.row.audienceHeat - left.row.audienceHeat;
      }

      return right.row.updatedAt.localeCompare(left.row.updatedAt);
    })
    .slice(0, 2)
    .map(({ row }) => {
      const statusLabel = row.status === 'dormant' ? '休眠' : '活跃';
      const lines = [
        `- ${row.name}（${row.type || '未分类'} / ${statusLabel} / 热度 ${row.audienceHeat}）`,
        `核心问题：${truncateText(row.coreQuestion || '暂无核心问题', 120)}`,
        `当前阶段：${truncateText(row.currentPhase || '暂无阶段说明', 140)}`,
      ];

      if (row.lastProgressAt) {
        lines.push(`最近推进：${truncateText(row.lastProgressAt, 120)}`);
      }

      if (row.nextTrigger) {
        lines.push(`下一触发：${truncateText(row.nextTrigger, 120)}`);
      }

      if (row.blockedBy) {
        lines.push(`当前卡点：${truncateText(row.blockedBy, 100)}`);
      }

      if (typeof row.plannedResolveVolume === 'number' && row.plannedResolveVolume > 0) {
        lines.push(`预计收束卷：第${row.plannedResolveVolume}卷`);
      }

      return lines.join('\n');
    });
}

function normalizeWorldStateTitle(value: string | null | undefined) {
  return normalizeText(value);
}

function selectWorldStateValue(primary: string, fallback: string) {
  return primary.trim() ? primary.trim() : fallback.trim();
}

function selectWorldStateList(primary: string[], fallback: string[]) {
  return primary.length > 0 ? primary : fallback;
}

function mergeWorldStateEntries(input: {
  volumeEntry: WorldStateEntryRecord;
  milestoneEntry?: WorldStateEntryRecord | null;
}) {
  const milestoneEntry = input.milestoneEntry ?? null;

  return {
    publicEvents: selectWorldStateList(milestoneEntry?.publicEvents ?? [], input.volumeEntry.publicEvents),
    secretEvents: selectWorldStateList(milestoneEntry?.secretEvents ?? [], input.volumeEntry.secretEvents),
    powerBalanceChange: selectWorldStateValue(
      milestoneEntry?.powerBalanceChange ?? '',
      input.volumeEntry.powerBalanceChange,
    ),
    institutionChange: selectWorldStateValue(
      milestoneEntry?.institutionChange ?? '',
      input.volumeEntry.institutionChange,
    ),
    ruleChange: selectWorldStateValue(
      milestoneEntry?.ruleChange ?? '',
      input.volumeEntry.ruleChange,
    ),
    rumorState: selectWorldStateValue(
      milestoneEntry?.rumorState ?? '',
      input.volumeEntry.rumorState,
    ),
    knownByCharacterNames: selectWorldStateList(
      milestoneEntry?.knownByCharacterNames ?? [],
      input.volumeEntry.knownByCharacterNames,
    ),
    currentRisks: selectWorldStateList(milestoneEntry?.currentRisks ?? [], input.volumeEntry.currentRisks),
  };
}

function formatWorldStateEntryBlock(label: string, entry: {
  volumeTitle: string;
  publicEvents: string[];
  secretEvents: string[];
  powerBalanceChange: string;
  institutionChange: string;
  ruleChange: string;
  rumorState: string;
  knownByCharacterNames: string[];
  currentRisks: string[];
}) {
  const lines = [`- ${label}《${entry.volumeTitle || '未命名卷'}》`];

  if (entry.publicEvents.length > 0) {
    lines.push(`公开事件：${entry.publicEvents.join('；')}`);
  }

  if (entry.secretEvents.length > 0) {
    lines.push(`秘密事件：${entry.secretEvents.join('；')}`);
  }

  if (entry.powerBalanceChange) {
    lines.push(`势力变化：${truncateText(entry.powerBalanceChange, 120)}`);
  }

  if (entry.institutionChange) {
    lines.push(`制度变化：${truncateText(entry.institutionChange, 120)}`);
  }

  if (entry.ruleChange) {
    lines.push(`规则变化：${truncateText(entry.ruleChange, 120)}`);
  }

  if (entry.rumorState) {
    lines.push(`舆论状态：${truncateText(entry.rumorState, 120)}`);
  }

  if (entry.knownByCharacterNames.length > 0) {
    lines.push(`关键信息掌握者：${entry.knownByCharacterNames.join('、')}`);
  }

  if (entry.currentRisks.length > 0) {
    lines.push(`当前风险：${entry.currentRisks.join('；')}`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

function buildWorldStateDeltaBlocks(input: {
  rows: WorldStateEntryRecord[];
  volumeTitle?: string;
  milestoneIndex?: number | null;
}) {
  const volumeLevelRows = input.rows
    .filter((row) => row.milestoneIndex === null)
    .sort((left, right) => {
      if (left.volumeOrder !== right.volumeOrder) {
        return right.volumeOrder - left.volumeOrder;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });
  const normalizedCurrentVolumeTitle = normalizeWorldStateTitle(input.volumeTitle);

  if (!normalizedCurrentVolumeTitle) {
    return [] as string[];
  }

  const currentVolumeEntry =
    volumeLevelRows.find((row) => normalizeWorldStateTitle(row.volumeTitle) === normalizedCurrentVolumeTitle) ?? null;

  if (!currentVolumeEntry) {
    return [] as string[];
  }

  const milestoneEntry =
    typeof input.milestoneIndex === 'number' && Number.isFinite(input.milestoneIndex)
      ? input.rows.find(
        (row) =>
          row.volumeId === currentVolumeEntry.volumeId &&
          row.milestoneIndex === Math.max(0, Math.trunc(input.milestoneIndex ?? 0)),
      ) ?? null
      : null;
  const previousVolumeEntry =
    volumeLevelRows.find((row) => row.volumeOrder < currentVolumeEntry.volumeOrder) ?? null;
  const currentBlock = formatWorldStateEntryBlock('世界状态-本卷变化', {
    volumeTitle: currentVolumeEntry.volumeTitle,
    ...mergeWorldStateEntries({
      volumeEntry: currentVolumeEntry,
      milestoneEntry,
    }),
  });
  const previousBlock = previousVolumeEntry
    ? formatWorldStateEntryBlock('世界状态-前一卷残留', {
      volumeTitle: previousVolumeEntry.volumeTitle,
      ...mergeWorldStateEntries({
        volumeEntry: previousVolumeEntry,
      }),
    })
    : '';

  return [currentBlock, previousBlock].filter(Boolean);
}

function buildAntagonistAgendaBlocks(input: {
  rows: AntagonistAgendaRecord[];
  focusEntityNames: string[];
  chapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
}) {
  const focusEntitySet = new Set(input.focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));
  const chapterHintHaystack = [
    input.chapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
  ]
    .join('\n')
    .toLowerCase();

  return input.rows
    .filter((row) => row.status === 'active')
    .map((row) => ({
      row,
      score:
        (focusEntitySet.has(normalizeText(row.characterName)) ? 100 : 0) +
        (normalizeText(row.characterName) && chapterHintHaystack.includes(normalizeText(row.characterName)) ? 60 : 0) +
        (row.triggerToStrike ? 20 : 0) +
        (row.currentAction ? 20 : 0),
    }))
    .filter((item) => item.score >= 40)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return right.row.updatedAt.localeCompare(left.row.updatedAt);
    })
    .slice(0, 2)
    .map(({ row }) => {
      const lines = [`- ${row.characterName}${row.publicRole ? `（${row.publicRole}）` : ''}`];
      if (row.currentObjective) {
        lines.push(`当前目标：${truncateText(row.currentObjective, 120)}`);
      }
      if (row.currentAction) {
        lines.push(`当前动作：${truncateText(row.currentAction, 120)}`);
      }
      if (row.triggerToStrike) {
        lines.push(`出手触发：${truncateText(row.triggerToStrike, 100)}`);
      }
      if (row.ifProtagonistDoesNothing) {
        lines.push(`主角不动时：${truncateText(row.ifProtagonistDoesNothing, 120)}`);
      }
      return lines.join('\n');
    });
}

function selectEffectivePovPermissions(input: {
  rows: PovPermissionRecord[];
  volumeTitle?: string;
  chapterId?: string;
}) {
  if (input.chapterId) {
    const chapterRows = input.rows.filter((row) => row.chapterId === input.chapterId);

    if (chapterRows.length > 0) {
      return chapterRows;
    }
  }

  const normalizedVolumeTitle = normalizeText(input.volumeTitle);

  if (!normalizedVolumeTitle) {
    return [] as PovPermissionRecord[];
  }

  return input.rows.filter(
    (row) =>
      normalizeText(row.volumeTitle) === normalizedVolumeTitle &&
      !row.chapterId,
  );
}

function buildPovPermissionBlocks(input: {
  rows: PovPermissionRecord[];
  volumeTitle?: string;
  chapterId?: string;
}) {
  return selectEffectivePovPermissions(input)
    .slice(0, 2)
    .map((row) => {
      const lines = [
        `- ${row.povCharacterName || '未命名视角'}${row.chapterTitle ? ` / 章节 ${row.chapterTitle}` : row.volumeTitle ? ` / ${row.volumeTitle}` : ''}`,
      ];
      if (row.mustHide.length > 0) {
        lines.push(`禁止透露：${row.mustHide.join('；')}`);
      }
      if (row.canHint.length > 0) {
        lines.push(`允许暗示：${row.canHint.join('；')}`);
      }
      if (row.forbiddenReveal.length > 0) {
        lines.push(`本单元禁止揭晓：${row.forbiddenReveal.join('；')}`);
      }
      return lines.join('\n');
    });
}

function buildStructuredResourceContinuityBlocks(input: {
  rows: ResourceContinuityRecord[];
  focusEntityNames: string[];
  chapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
  highPressure: boolean;
}) {
  const focusEntitySet = new Set(input.focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));
  const chapterHintHaystack = [
    input.chapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
    ...(input.outline?.immutableFacts ?? []),
  ]
    .join('\n')
    .toLowerCase();
  const riskLabelMap: Record<ResourceContinuityRecord['riskLevel'], string> = {
    critical: '致命',
    high: '高',
    medium: '中',
    low: '低',
  };

  return input.rows
    .filter((row) => row.status === 'active' || row.status === 'permanent')
    .map((row) => {
      const hintTerms = getResourceContinuityHintTerms(row.resourceType);
      const hintScore = hintTerms.reduce((total, term) => total + (countTextOccurrences(chapterHintHaystack, term) > 0 ? 18 : 0), 0);
      const riskScore =
        row.riskLevel === 'critical'
          ? 45
          : row.riskLevel === 'high'
            ? 30
            : row.riskLevel === 'medium'
              ? 15
              : 0;

      return {
        row,
        score:
          (focusEntitySet.has(normalizeText(row.ownerCharacterName)) ? 100 : 0) +
          (row.status === 'permanent' ? 30 : 0) +
          riskScore +
          hintScore +
          (input.highPressure && row.riskLevel !== 'low' ? 10 : 0),
      };
    })
    .filter((item) => item.score >= (input.highPressure ? 35 : 60))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return right.row.updatedAt.localeCompare(left.row.updatedAt);
    })
    .slice(0, input.highPressure ? 6 : 4)
    .map(({ row }) => {
      const lines = [`- ${row.ownerCharacterName || '未绑定角色'} / ${row.resourceType}`];
      lines.push(`风险级别：${riskLabelMap[row.riskLevel]}`);
      if (row.currentState) {
        lines.push(`当前状态：${truncateText(row.currentState, 120)}`);
      }
      if (row.performanceImpact) {
        lines.push(`行动限制：${truncateText(row.performanceImpact, 120)}`);
      }
      if (input.highPressure && row.lastConsumedAt) {
        lines.push(`最近消耗：${truncateText(row.lastConsumedAt, 80)}`);
      }
      if (input.highPressure && row.recoveryCondition) {
        lines.push(`恢复条件：${truncateText(row.recoveryCondition, 100)}`);
      }
      if (row.hiddenCost) {
        lines.push(`隐藏代价：${truncateText(row.hiddenCost, 100)}`);
      }
      if (row.continuityRisk) {
        lines.push(`连续性风险：${truncateText(row.continuityRisk, 100)}`);
      }
      return lines.join('\n');
    });
}

function isHighPressureResourceScene(input: {
  chapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
}) {
  if (input.outline?.hookStrength === 'strong') {
    return true;
  }

  const haystack = [
    input.chapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
    ...(input.outline?.immutableFacts ?? []),
  ]
    .join('\n');

  return /(追杀|围杀|突围|亡命|逃亡|审判|对峙|翻案|搜证|破局|借势|反噬|倒计时|期限|封锁|围捕|潜入|截杀)/u.test(haystack);
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
  const entityRowMap = new Map<string, GenerationEntityRow>();

  for (const row of entityRows) {
    for (const term of getEntitySearchTerms(row)) {
      const normalizedTerm = normalizeText(term);

      if (normalizedTerm && !entityRowMap.has(normalizedTerm)) {
        entityRowMap.set(normalizedTerm, row);
      }
    }
  }

  return focusEntityNames
    .map((entityName) => entityRowMap.get(normalizeText(entityName)))
    .filter((row): row is GenerationEntityRow => Boolean(row))
    .filter((row, index, rows) => {
      return rows.findIndex((candidate) => normalizeText(candidate.entityName) === normalizeText(row.entityName)) === index;
    })
    .slice(0, GENERATION_CONTEXT_LIMITS.entityBlockMax)
    .map((row) => {
      const lines = [`- ${row.entityName}${row.entityType ? `（${row.entityType}）` : ''}`];
      const genericFieldEntries = Object.entries(row.fields)
        .filter(([key]) =>
          !CHARACTER_STATIC_FIELD_LABELS.some(([fieldKey]) => fieldKey === key)
          && !CHARACTER_DYNAMIC_FIELD_LABELS.some(([fieldKey]) => fieldKey === key),
        )
        .map(([key, value]) => `${key}=${value}`)
        .slice(0, GENERATION_CONTEXT_LIMITS.entityFieldPreviewMax);
      const staticFieldEntries = CHARACTER_STATIC_FIELD_LABELS
        .map(([fieldKey, label]) => {
          const value = row.fields[fieldKey];
          return value ? `${label}：${value}` : '';
        })
        .filter(Boolean);
      const dynamicFieldEntries = CHARACTER_DYNAMIC_FIELD_LABELS
        .map(([fieldKey, label]) => {
          const value = row.fields[fieldKey];
          return value ? `${label}：${value}` : '';
        })
        .filter(Boolean);

      if (row.description) {
        lines.push(`描述：${truncateText(row.description, GENERATION_CONTEXT_LIMITS.entityDescriptionMaxChars)}`);
      }

      if (row.aliases.length > 0) {
        lines.push(`别名：${row.aliases.slice(0, GENERATION_CONTEXT_LIMITS.entityTagPreviewMax).join(' / ')}`);
      }

      if (staticFieldEntries.length > 0) {
        lines.push(`【人格内核-不可改变】${staticFieldEntries.join('；')}`);
      }

      if (dynamicFieldEntries.length > 0) {
        lines.push(`【当前阶段状态】${dynamicFieldEntries.join('；')}`);
      }

      if (genericFieldEntries.length > 0) {
        lines.push(`关键状态：${genericFieldEntries.join('；')}`);
      }

      if (row.tags.length > 0) {
        lines.push(`标签：${row.tags.slice(0, GENERATION_CONTEXT_LIMITS.entityTagPreviewMax).join(' / ')}`);
      }

      if (row.lastSeenChapterTitle) {
        lines.push(`最近出现：${row.lastSeenChapterTitle}`);
      }

      return lines.join('\n');
    });
}

function buildAvailableCharacterHintBlocks(
  entityRows: GenerationEntityRow[],
  availableCharacterNames: string[],
  focusEntityNames: string[],
) {
  const normalizedFocusSet = new Set(focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));
  const entityRowMap = new Map<string, GenerationEntityRow>();

  for (const row of entityRows) {
    for (const term of getEntitySearchTerms(row)) {
      const normalizedTerm = normalizeText(term);

      if (normalizedTerm && !entityRowMap.has(normalizedTerm)) {
        entityRowMap.set(normalizedTerm, row);
      }
    }
  }

  return createUniqueList(availableCharacterNames)
    .map((entityName) => entityRowMap.get(normalizeText(entityName)))
    .filter((row): row is GenerationEntityRow => Boolean(row))
    .filter((row) => !normalizedFocusSet.has(normalizeText(row.entityName)))
    .filter((row, index, rows) => {
      return rows.findIndex((candidate) => normalizeText(candidate.entityName) === normalizeText(row.entityName)) === index;
    })
    .slice(0, 4)
    .map((row) => {
      const summary = row.description.trim()
        || row.fields.current_status?.trim()
        || row.fields.current_goal?.trim()
        || row.fields.static_role?.trim();

      return [
        `- 候选人物：${row.entityName}${row.entityType ? `（${row.entityType}）` : ''}`,
        '弱提示：可用于分担对话、对照、施压或信息转手，但不要抢走必须出场人物的章节职责。',
        summary ? `当前抓手：${truncateText(summary, 80)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    });
}

function expandFocusEntityNamesByExplicitRelations(
  focusEntityNames: string[],
  relationSnapshots: GenerationRelationSnapshot[],
  allowDraftContext?: boolean,
) {
  const normalizedFocusSet = new Set(focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));

  if (normalizedFocusSet.size === 0 || relationSnapshots.length === 0) {
    return [] as string[];
  }

  return relationSnapshots
    .flatMap((relation) => {
      if (!allowDraftContext && relation.draft) {
        return [] as string[];
      }

      const sourceMatched = normalizedFocusSet.has(normalizeText(relation.sourceEntityName));
      const targetMatched = normalizedFocusSet.has(normalizeText(relation.targetEntityName));

      if (sourceMatched && relation.targetEntityName.trim()) {
        return [relation.targetEntityName.trim()];
      }

      if (targetMatched && relation.sourceEntityName.trim()) {
        return [relation.sourceEntityName.trim()];
      }

      return [] as string[];
    })
    .filter(Boolean);
}

function buildExplicitRelationshipBlocks(input: {
  relationSnapshots: GenerationRelationSnapshot[];
  focusEntityNames: string[];
  allowDraftContext?: boolean;
}) {
  const normalizedFocusSet = new Set(input.focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));

  if (normalizedFocusSet.size === 0 || input.relationSnapshots.length === 0) {
    return {
      blocks: [] as string[],
      coverageKeys: new Set<string>(),
    };
  }

  const blocks: string[] = [];
  const coverageKeys = new Set<string>();

  for (const relation of input.relationSnapshots) {
    if (!input.allowDraftContext && relation.draft) {
      continue;
    }

    const sourceName = relation.sourceEntityName.trim();
    const targetName = relation.targetEntityName.trim();
    const focusMatched =
      normalizedFocusSet.has(normalizeText(sourceName)) || normalizedFocusSet.has(normalizeText(targetName));

    if (!focusMatched || !sourceName || !targetName || !relation.relationType.trim()) {
      continue;
    }

    coverageKeys.add(buildRelationPairKey(sourceName, targetName));
    blocks.push(
      [
        `- 显式关系：${sourceName} <-> ${targetName}（${relation.relationType.trim()}）`,
        relation.description.trim() ? `关系本质：${truncateText(relation.description.trim(), 120)}` : '',
        relation.origin.trim() ? `建立原因：${truncateText(relation.origin.trim(), 80)}` : '',
        relation.currentStance.trim() ? `当前态度：${relation.currentStance.trim()}` : '',
        relation.currentIntensity > 0 ? `当前强度：${relation.currentIntensity}` : '',
        relation.stanceReason.trim() ? `态度锚点：${truncateText(relation.stanceReason.trim(), 80)}` : '',
        relation.draft ? '状态：草案' : '状态：已确认',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    if (blocks.length >= GENERATION_CONTEXT_LIMITS.entityBlockMax) {
      break;
    }
  }

  return {
    blocks,
    coverageKeys,
  };
}

function filterAutomaticRelationshipBlocksByExplicitCoverage(
  blocks: string[],
  relationSnapshots: GenerationRelationSnapshot[],
  coverageKeys: Set<string>,
) {
  if (blocks.length === 0 || coverageKeys.size === 0) {
    return blocks;
  }

  const [headerBlock, ...detailBlocks] = blocks;
  const filteredDetailBlocks = detailBlocks.filter((block) => {
    return !relationSnapshots.some((relation) => {
      const pairKey = buildRelationPairKey(relation.sourceEntityName, relation.targetEntityName);

      return (
        coverageKeys.has(pairKey) &&
        block.includes(relation.sourceEntityName) &&
        block.includes(relation.targetEntityName)
      );
    });
  });

  if (filteredDetailBlocks.length === 0) {
    return [] as string[];
  }

  return [headerBlock, ...filteredDetailBlocks];
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
  const entityRows = loadEntityRows(env, input.projectId).filter((row) => input.allowDraftContext || !row.draft);
  const relationshipRows = loadRelationshipRows(env, input.projectId);
  const resourceStateRows = loadResourceStateRows(env, input.projectId);
  const storedVolumeRecaps = listGenerationVolumeRecaps(env, input.projectId);
  const foreshadowPlanRows = listForeshadowPlans(env, {
    projectId: input.projectId,
  });
  const worldStateRows = listWorldStateEntries(env, {
    projectId: input.projectId,
  });
  const antagonistAgendaRows = listAntagonistAgendas(env, {
    projectId: input.projectId,
  });
  const povPermissionRows = listPovPermissions(env, {
    projectId: input.projectId,
  });
  const structuredResourceContinuityRows = listResourceContinuities(env, {
    projectId: input.projectId,
  });
  const threadLedgerRows = listThreadLedgers(env, {
    projectId: input.projectId,
  });
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
  const seedFocusEntityNames = createUniqueList([
    ...(input.requiredEntityNames ?? []),
    ...selectFocusEntityNames(input, chapterRows, entityRows),
  ]);
  const focusEntityNames = createUniqueList([
    ...seedFocusEntityNames,
    ...expandFocusEntityNamesByExplicitRelations(seedFocusEntityNames, input.relationSnapshot ?? [], input.allowDraftContext),
  ]);
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
    limit: GENERATION_CONTEXT_LIMITS.memoryRetrievalLimit,
    lightweightRecallConfig: input.lightweightRecallConfig,
  });
  const relatedChapterBlocks = buildRelatedChapterBlocks(retrievalItems);
  const lightweightRecallBlocks = buildLightweightRecallItems(retrievalItems);
  const entityBlocks = buildEntityBlocks(entityRows, focusEntityNames);
  const availableCharacterHintBlocks = buildAvailableCharacterHintBlocks(
    entityRows,
    input.availableCharacterNames ?? [],
    focusEntityNames,
  );
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
  const explicitRelationshipResult = buildExplicitRelationshipBlocks({
    relationSnapshots: input.relationSnapshot ?? [],
    focusEntityNames,
    allowDraftContext: input.allowDraftContext,
  });
  const relationshipBlocks = [
    ...explicitRelationshipResult.blocks,
    ...filterAutomaticRelationshipBlocksByExplicitCoverage(
      structuredRelationshipResult.blocks,
      input.relationSnapshot ?? [],
      explicitRelationshipResult.coverageKeys,
    ),
  ];
  const serverForeshadowBlocks = buildForeshadowBlocks(
    storedForeshadowRows,
    input.requiredForeshadowTitles ?? [],
  );
  const activeForeshadowBlocks =
    input.preferStoredForeshadows ? serverForeshadowBlocks : fallbackContext.activeForeshadowBlocks;
  const foreshadowPlanBlocks = buildForeshadowPlanBlocks({
    plans: foreshadowPlanRows,
    activeForeshadowRows: storedForeshadowRows,
    requiredForeshadowTitles: input.requiredForeshadowTitles,
  });
  const workingMemoryBlocks = buildWorkingMemoryBlocks(
    input,
    currentVolumeSnapshotBlocks,
    activeForeshadowBlocks,
  );
  const resourceContinuityBlocks = buildResourceContinuityBlocks(
    resourceStateRows,
    currentChapterOrder,
  );
  const highPressureResourceScene = isHighPressureResourceScene({
    chapterTitle: input.chapterTitle,
    outline: input.outline,
  });
  const structuredResourceContinuityBlocks = buildStructuredResourceContinuityBlocks({
    rows: structuredResourceContinuityRows,
    focusEntityNames,
    chapterTitle: input.chapterTitle,
    outline: input.outline,
    highPressure: highPressureResourceScene,
  });
  const worldStateDeltaBlocks = buildWorldStateDeltaBlocks({
    rows: worldStateRows,
    volumeTitle: input.volumeTitle,
    milestoneIndex: null,
  });
  const antagonistAgendaBlocks = buildAntagonistAgendaBlocks({
    rows: antagonistAgendaRows,
    focusEntityNames,
    chapterTitle: input.chapterTitle,
    outline: input.outline,
  });
  const povPermissionBlocks = buildPovPermissionBlocks({
    rows: povPermissionRows,
    volumeTitle: input.volumeTitle,
    chapterId: input.chapterId,
  });
  const threadLedgerBlocks = buildThreadLedgerBlocks({
    rows: threadLedgerRows,
    focusEntityNames,
    requiredEntityNames: input.requiredEntityNames,
    availableCharacterNames: input.availableCharacterNames,
    requiredForeshadowTitles: input.requiredForeshadowTitles,
    currentChapterOrder,
    chapterTitle: input.chapterTitle,
    outline: input.outline,
  });
  const sections = [
    createSection('working_memory', '工作记忆', workingMemoryBlocks),
    createSection('thread_ledger', '剧情线提醒', threadLedgerBlocks),
    createSection('foreshadow_plan', '伏笔规划', foreshadowPlanBlocks),
    createSection('antagonist_agenda', '反派议程', antagonistAgendaBlocks),
    createSection('pov_permission', '信息控制', povPermissionBlocks),
    createSection('world_state_delta', '世界状态', worldStateDeltaBlocks),
    createSection('immediate_memory', '即时记忆', buildRecentTextBlocks(recentTextRows)),
    createSection('short_term_memory', '短期记忆', buildRecentSummaryBlocks(recentSummaryRows)),
    createSection('long_term_memory', '长期记忆', volumeRecapBlocks),
    createSection('retrieval_memory', '外部检索', relatedChapterBlocks),
    input.worldState?.trim() ? createSection('physical_engine', '物理引擎', [input.worldState.trim()]) : null,
    createSection('resource_continuity', '资源连续性', [...structuredResourceContinuityBlocks, ...resourceContinuityBlocks].slice(0, highPressureResourceScene ? 8 : 6)),
    createSection('focus_entities', '当前关注实体', entityBlocks),
    createSection('candidate_entities', '候选出场人物', availableCharacterHintBlocks),
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
    relationshipCount:
      explicitRelationshipResult.blocks.length +
      Math.max(
        0,
        filterAutomaticRelationshipBlocksByExplicitCoverage(
          structuredRelationshipResult.blocks,
          input.relationSnapshot ?? [],
          explicitRelationshipResult.coverageKeys,
        ).length - 1,
      ),
    hasFallbackContext: Boolean(input.fallbackContextBundle?.trim()),
    focusEntityNames,
    queryPhrases,
    lightweightRecallItems: lightweightRecallBlocks,
    sections,
  };
}
