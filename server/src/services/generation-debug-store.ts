import type { ServerEnv } from '../config/env.js';
import type {
  AntiAIForceCheck,
  ChapterOutlineDraft,
  GenerationDebugContext,
  GenerationDebugChapterDetail,
  GenerationDebugChapterRecord,
  GenerationDebugMemoryChunkRecord,
  GenerationDebugRetrieval,
  GenerationDebugStateChangeRecord,
  GenerationDebugEntityRecord,
  GenerationDebugForeshadowRecord,
  GenerationDebugOverview,
  GenerationDebugVolumeRecapRecord,
  GenerationDebugRelationshipRecord,
  GenerationStructuredRelationshipConfidenceLevel,
  GenerationStructuredRelationshipEdge,
  GenerationStructuredRelationshipFallbackHint,
  GenerationStructuredRelationshipNode,
  GenerationStructuredRelationshipConsumptionPreview,
  GenerationStructuredRelationshipPath,
  GenerationStructuredRelationshipQueryReason,
  GenerationStructuredRelationshipQueryResult,
  GenerationJobRequest,
  ReviewCheckerResult,
  ReviewSeverity,
} from '../types/ai.js';
import { buildGenerationContextBundle } from './generation-context.js';
import { deriveGenerationForeshadowLifecycle, listGenerationForeshadows } from './generation-foreshadow-store.js';
import { retrieveGenerationMemory } from './generation-retrieval.js';
import { getGenerationDatabase } from './generation-sqlite.js';
import { getGenerationVectorBackendStatus } from './generation-vector-backend.js';
import { listGenerationVolumeRecaps } from './generation-volume-recap-store.js';

function parseJsonArray(rawText: string | null | undefined) {
  if (!rawText) {
    return [] as unknown[];
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(rawText: string | null | undefined) {
  if (!rawText) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
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

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeReviewSeverity(value: unknown): ReviewSeverity {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function normalizeAntiAiForceCheck(value: unknown): AntiAIForceCheck {
  return value === 'fail' ? 'fail' : 'pass';
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function includesQuery(parts: Array<string | null | undefined>, query: string) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return true;
  }

  return parts.some((part) => normalizeText(part).includes(normalizedQuery));
}

function createUniqueList(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (value ?? '').trim())
        .filter(Boolean),
    ),
  );
}

function clampScore(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function looksLikeGenericRelationshipType(value: string) {
  const normalized = normalizeText(value);
  return !normalized || normalized === '关系' || normalized === '关联' || normalized === '相关';
}

function resolveRelationshipConfidenceLevel(score: number): GenerationStructuredRelationshipConfidenceLevel {
  if (score >= 0.78) {
    return 'high';
  }

  if (score >= 0.56) {
    return 'medium';
  }

  return 'low';
}

function scoreRelationshipCandidate(input: {
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

  if ((input.evidence ?? '').trim().length >= 12) {
    score += 0.09;
  }

  return clampScore(score, 0, 1);
}

interface StructuredRelationshipRawRow {
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

interface StructuredRelationshipEntityRow {
  entityName: string;
  entityType: string;
  description: string;
  tags: string[];
  pinned: boolean;
  lastSeenChapterTitle: string;
}

function getProjectLatestChapterOrder(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const row = db
    .prepare(
      `
        SELECT MAX(chapter_order) AS latest_chapter_order
        FROM generation_chapter_index
        WHERE project_id = ?
      `,
    )
    .get(projectId) as { latest_chapter_order?: number | bigint } | undefined;

  return Number(row?.latest_chapter_order ?? 0);
}

export function getGenerationDebugOverview(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const jobs = db
    .prepare(
      `
        SELECT
          id,
          chapter_id,
          chapter_title,
          status,
          current_step,
          updated_at
        FROM generation_jobs
        WHERE project_id = ?
        ORDER BY updated_at DESC
        LIMIT 5
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  function count(tableName: string) {
    const statement = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE project_id = ?`);
    const row = statement.get(projectId) as { count?: number | bigint };
    return Number(row.count ?? 0);
  }

  const overview: GenerationDebugOverview = {
    projectId,
    counts: {
      generationJobs: count('generation_jobs'),
      chapterSummaries: count('generation_chapter_summaries'),
      stateChanges: count('generation_state_changes'),
      reviewMetrics: count('generation_review_metrics'),
      entities: count('generation_entities'),
      relationships: count('generation_relationships'),
      foreshadows: count('generation_foreshadows'),
      chapterIndex: count('generation_chapter_index'),
      volumeRecaps: count('generation_volume_recaps'),
      memoryChunks: count('generation_memory_chunks'),
      memoryEmbeddings: count('generation_memory_embeddings'),
    },
    recentJobs: jobs.map((job) => ({
      id: asString(job.id),
      chapterId: asString(job.chapter_id),
      chapterTitle: asString(job.chapter_title),
      status: job.status as GenerationDebugOverview['recentJobs'][number]['status'],
      currentStep: job.current_step as GenerationDebugOverview['recentJobs'][number]['currentStep'],
      updatedAt: asString(job.updated_at),
    })),
  };

  return overview;
}

export function listGenerationDebugVolumeRecaps(env: ServerEnv, projectId: string, query?: string) {
  return listGenerationVolumeRecaps(env, projectId)
    .map(
      (item): GenerationDebugVolumeRecapRecord => ({
        volumeTitle: item.volumeTitle,
        startChapterId: item.startChapterId,
        startChapterOrder: item.startChapterOrder,
        endChapterId: item.endChapterId,
        endChapterOrder: item.endChapterOrder,
        chapterCount: item.chapterCount,
        summary: item.summary,
        highlights: item.highlights,
        updatedAt: item.updatedAt,
      }),
    )
    .filter((item) =>
      includesQuery(
        [
          item.volumeTitle,
          item.summary,
          item.highlights.join(' '),
          String(item.startChapterOrder),
          String(item.endChapterOrder),
          String(item.chapterCount),
        ],
        query ?? '',
      ),
    );
}

export function listGenerationDebugForeshadows(env: ServerEnv, projectId: string, query?: string) {
  const latestChapterOrder = getProjectLatestChapterOrder(env, projectId);

  return listGenerationForeshadows(env, projectId)
    .map(
      (item): GenerationDebugForeshadowRecord => {
        const lifecycle = deriveGenerationForeshadowLifecycle(item, latestChapterOrder);
        const chapterGap =
          latestChapterOrder > 0 && item.sourceChapterOrder > 0
            ? Math.max(0, latestChapterOrder - item.sourceChapterOrder)
            : null;

        return {
          id: item.id,
          title: item.title,
          excerpt: item.excerpt,
          notes: item.notes,
          status: item.status,
          lifecycle,
          sourceChapterId: item.sourceChapterId,
          sourceChapterTitle: item.sourceChapterTitle,
          sourceChapterOrder: item.sourceChapterOrder,
          resolvedChapterId: item.resolvedChapterId,
          resolvedChapterTitle: item.resolvedChapterTitle,
          resolvedChapterOrder: item.resolvedChapterOrder,
          chapterGap,
          updatedAt: item.updatedAt,
        };
      },
    )
    .filter((item) =>
      includesQuery(
        [
          item.title,
          item.excerpt,
          item.notes,
          item.status,
          item.lifecycle,
          item.sourceChapterTitle,
          item.resolvedChapterTitle,
          String(item.sourceChapterOrder),
          item.chapterGap === null ? '' : String(item.chapterGap),
        ],
        query ?? '',
      ),
    );
}

export function listGenerationDebugChapterRecords(env: ServerEnv, projectId: string, query?: string) {
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
          idx.beat_count,
          idx.beats_json,
          idx.immutable_facts_json,
          idx.hook_type,
          idx.hook_strength,
          idx.entities_appeared_json,
          idx.locations_json,
          idx.summary_excerpt,
          idx.updated_at AS index_updated_at,
          sums.hook,
          sums.foreshadowings_json,
          sums.updated_at AS summary_updated_at,
          reviews.overall_severity,
          reviews.needs_rewrite,
          reviews.anti_ai_force_check,
          reviews.checker_results_json,
          reviews.updated_at AS review_updated_at
        FROM generation_chapter_index idx
        LEFT JOIN generation_chapter_summaries sums
          ON sums.project_id = idx.project_id AND sums.chapter_id = idx.chapter_id
        LEFT JOIN generation_review_metrics reviews
          ON reviews.project_id = idx.project_id AND reviews.chapter_id = idx.chapter_id
        WHERE idx.project_id = ?
        ORDER BY idx.updated_at DESC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows
    .map((row): GenerationDebugChapterRecord => ({
      chapterId: asString(row.chapter_id),
      chapterTitle: asString(row.chapter_title),
      chapterOrder: Number(row.chapter_order ?? 0),
      volumeTitle: asString(row.volume_title),
      previousChapterId: asString(row.previous_chapter_id),
      previousChapterTitle: asString(row.previous_chapter_title),
      timeAnchor: asString(row.time_anchor),
      strand: asString(row.strand),
      beatCount: Number(row.beat_count ?? 0),
      beats: parseJsonArray(String(row.beats_json ?? '[]')) as string[],
      immutableFacts: parseJsonArray(String(row.immutable_facts_json ?? '[]')) as string[],
      hookType: asString(row.hook_type),
      hookStrength: asString(row.hook_strength),
      entitiesAppeared: parseJsonArray(String(row.entities_appeared_json ?? '[]')) as string[],
      locations: parseJsonArray(String(row.locations_json ?? '[]')) as string[],
      summaryExcerpt: asString(row.summary_excerpt),
      hook: asString(row.hook),
      foreshadowings: parseJsonArray(String(row.foreshadowings_json ?? '[]')),
      review: row.overall_severity
        ? {
            overallSeverity: normalizeReviewSeverity(row.overall_severity),
            needsRewrite: Number(row.needs_rewrite ?? 0) > 0,
            antiAiForceCheck: normalizeAntiAiForceCheck(row.anti_ai_force_check),
            checkerResults: parseJsonArray(String(row.checker_results_json ?? '[]')) as ReviewCheckerResult[],
          }
        : null,
      updatedAt:
        asString(row.review_updated_at) ||
        asString(row.summary_updated_at) ||
        asString(row.index_updated_at),
    }))
    .filter((item) =>
      includesQuery(
        [
          item.chapterTitle,
          item.timeAnchor,
          item.strand,
          item.summaryExcerpt,
          item.hook,
          item.entitiesAppeared.join(' '),
          item.locations.join(' '),
          item.beats.join(' '),
          item.immutableFacts.join(' '),
        ],
        query ?? '',
      ),
    );
}

export function listGenerationDebugEntities(env: ServerEnv, projectId: string, query?: string) {
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
          last_seen_chapter_id,
          last_seen_chapter_title,
          updated_at
        FROM generation_entities
        WHERE project_id = ?
        ORDER BY updated_at DESC, entity_name COLLATE NOCASE ASC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows
    .map((row): GenerationDebugEntityRecord => ({
      entityName: asString(row.entity_name),
      entityType: asString(row.entity_type),
      description: asString(row.description),
      fields: (parseJsonObject(String(row.fields_json ?? '{}')) as Record<string, unknown> | null) ?? {},
      tags: parseJsonArray(String(row.tags_json ?? '[]')) as string[],
      pinned: Number(row.pinned ?? 0) > 0,
      lastSeenChapterId: asString(row.last_seen_chapter_id),
      lastSeenChapterTitle: asString(row.last_seen_chapter_title),
      updatedAt: asString(row.updated_at),
    }))
    .filter((item) =>
      includesQuery(
        [
          item.entityName,
          item.entityType,
          item.description,
          item.tags.join(' '),
          item.lastSeenChapterTitle,
          JSON.stringify(item.fields),
        ],
        query ?? '',
      ),
    );
}

export function listGenerationDebugRelationships(
  env: ServerEnv,
  projectId: string,
  filters?: {
    q?: string;
    chapterId?: string;
    entityName?: string;
  },
) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          id,
          source_entity_name,
          target_entity_name,
          relationship_type,
          source_kind,
          description,
          evidence,
          chapter_id,
          chapter_title,
          updated_at
        FROM generation_relationships
        WHERE project_id = ?
        ORDER BY updated_at DESC, source_entity_name COLLATE NOCASE ASC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows
    .map((row): GenerationDebugRelationshipRecord => ({
      id: asString(row.id),
      sourceEntityName: asString(row.source_entity_name),
      targetEntityName: asNullableString(row.target_entity_name),
      relationshipType: asString(row.relationship_type),
      sourceKind: asString(row.source_kind),
      description: asString(row.description),
      evidence: asString(row.evidence),
      chapterId: asString(row.chapter_id),
      chapterTitle: asString(row.chapter_title),
      updatedAt: asString(row.updated_at),
    }))
    .filter((item) => {
      if (filters?.chapterId && item.chapterId !== filters.chapterId) {
        return false;
      }

      if (filters?.entityName) {
        const normalizedEntityName = normalizeText(filters.entityName);
        const sourceMatched = normalizeText(item.sourceEntityName).includes(normalizedEntityName);
        const targetMatched = normalizeText(item.targetEntityName).includes(normalizedEntityName);

        if (!sourceMatched && !targetMatched) {
          return false;
        }
      }

      return includesQuery(
        [
          item.sourceEntityName,
          item.targetEntityName,
          item.relationshipType,
          item.sourceKind,
          item.description,
          item.evidence,
          item.chapterTitle,
        ],
        filters?.q ?? '',
      );
    });
}

function resolveStructuredRelationshipFocusNames(
  chapterRecords: GenerationDebugChapterRecord[],
  chapterRecord: GenerationDebugChapterRecord,
  entityName?: string,
) {
  if (entityName && entityName.trim()) {
    return [entityName.trim()];
  }

  if (chapterRecord.previousChapterId) {
    const previousRecord = chapterRecords.find((item) => item.chapterId === chapterRecord.previousChapterId);

    if (previousRecord && previousRecord.entitiesAppeared.length > 0) {
      return previousRecord.entitiesAppeared.slice(0, 6);
    }
  }

  const historicalRows = chapterRecords
    .filter((item) => item.chapterOrder > 0 && item.chapterOrder < chapterRecord.chapterOrder)
    .slice(-1);
  const latestHistorical = historicalRows[0];

  if (latestHistorical && latestHistorical.entitiesAppeared.length > 0) {
    return latestHistorical.entitiesAppeared.slice(0, 6);
  }

  return [] as string[];
}

function loadStructuredRelationshipRows(
  env: ServerEnv,
  projectId: string,
  chapterId: string,
  chapterOrder: number,
) {
  if (chapterOrder <= 0) {
    return [] as StructuredRelationshipRawRow[];
  }

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
          idx.chapter_order,
          rel.updated_at
        FROM generation_relationships rel
        INNER JOIN generation_chapter_index idx
          ON idx.project_id = rel.project_id AND idx.chapter_id = rel.chapter_id
        WHERE rel.project_id = ?
          AND rel.chapter_id <> ?
          AND idx.chapter_order > 0
          AND idx.chapter_order < ?
        ORDER BY idx.chapter_order DESC, rel.updated_at DESC
      `,
    )
    .all(projectId, chapterId, chapterOrder) as Array<Record<string, unknown>>;

  return rows.map((row): StructuredRelationshipRawRow => ({
    sourceEntityName: asString(row.source_entity_name),
    targetEntityName: asString(row.target_entity_name),
    relationshipType: asString(row.relationship_type) || '关系',
    sourceKind: asString(row.source_kind) || 'unknown',
    description: asString(row.description),
    evidence: asString(row.evidence),
    chapterId: asString(row.chapter_id),
    chapterTitle: asString(row.chapter_title),
    chapterOrder: Number(row.chapter_order ?? 0),
    updatedAt: asString(row.updated_at),
  }));
}

function loadStructuredRelationshipEntities(
  env: ServerEnv,
  projectId: string,
  chapterOrder: number,
) {
  if (chapterOrder <= 0) {
    return [] as StructuredRelationshipEntityRow[];
  }

  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          ent.entity_name,
          ent.entity_type,
          ent.description,
          ent.tags_json,
          ent.pinned,
          ent.last_seen_chapter_title
        FROM generation_entities ent
        LEFT JOIN generation_chapter_index idx
          ON idx.project_id = ent.project_id AND idx.chapter_id = ent.last_seen_chapter_id
        WHERE ent.project_id = ?
          AND COALESCE(idx.chapter_order, 0) > 0
          AND COALESCE(idx.chapter_order, 0) < ?
        ORDER BY ent.pinned DESC, idx.chapter_order DESC, ent.updated_at DESC, ent.entity_name COLLATE NOCASE ASC
      `,
    )
    .all(projectId, chapterOrder) as Array<Record<string, unknown>>;

  return rows.map((row): StructuredRelationshipEntityRow => ({
    entityName: asString(row.entity_name),
    entityType: asString(row.entity_type),
    description: asString(row.description),
    tags: parseJsonArray(asString(row.tags_json)).filter((item): item is string => typeof item === 'string'),
    pinned: Number(row.pinned ?? 0) > 0,
    lastSeenChapterTitle: asString(row.last_seen_chapter_title),
  }));
}

function buildStructuredRelationshipFallbackHints(
  chapterRecords: GenerationDebugChapterRecord[],
  chapterOrder: number,
  focusEntityNames: string[],
): GenerationStructuredRelationshipFallbackHint[] {
  const normalizedFocusSet = new Set(focusEntityNames.map((item) => normalizeText(item)));

  if (normalizedFocusSet.size === 0 || chapterOrder <= 0) {
    return [];
  }

  const hints: GenerationStructuredRelationshipFallbackHint[] = [];
  const historicalRows = [...chapterRecords]
    .filter((item) => item.chapterOrder > 0 && item.chapterOrder < chapterOrder)
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

    hints.push({
      kind: 'chapter_coappearance',
      text: `${matchedFocus.join('、')} 与 ${coAppeared.slice(0, 4).join('、')} 同章出现`,
      chapterId: row.chapterId,
      chapterTitle: row.chapterTitle,
      chapterOrder: row.chapterOrder,
    });

    if (hints.length >= 4) {
      break;
    }
  }

  return hints;
}

function createStructuredRelationshipResult(
  projectId: string,
  chapterRecord: GenerationDebugChapterRecord,
  focusEntityNames: string[],
  entityRows: StructuredRelationshipEntityRow[],
  relationshipRows: StructuredRelationshipRawRow[],
  chapterRecords: GenerationDebugChapterRecord[],
): GenerationStructuredRelationshipQueryResult {
  const uniqueFocusEntityNames = createUniqueList(focusEntityNames);

  const makeResult = (
    reason: GenerationStructuredRelationshipQueryReason,
    fallbackHints: GenerationStructuredRelationshipFallbackHint[] = [],
    stats?: GenerationStructuredRelationshipQueryResult['stats'],
  ): GenerationStructuredRelationshipQueryResult => ({
    projectId,
    chapterId: chapterRecord.chapterId,
    chapterTitle: chapterRecord.chapterTitle,
    chapterOrder: chapterRecord.chapterOrder,
    focusEntityNames: uniqueFocusEntityNames,
    mode: reason === 'ok' ? 'graph_1hop' : 'degraded',
    reason,
    nodes: [],
    edges: [],
    paths: [],
    fallbackHints,
    stats:
      stats ?? {
        candidateRelationships: 0,
        acceptedRelationships: 0,
        droppedLowConfidence: 0,
        candidatePaths: 0,
        acceptedPaths: 0,
        droppedNoisyPaths: 0,
      },
  });

  if (chapterRecord.chapterOrder <= 0) {
    return makeResult('missing_chapter_context');
  }

  if (uniqueFocusEntityNames.length === 0) {
    return makeResult(
      'no_focus_entity',
      buildStructuredRelationshipFallbackHints(chapterRecords, chapterRecord.chapterOrder, uniqueFocusEntityNames),
    );
  }

  const normalizedFocusSet = new Set(uniqueFocusEntityNames.map((item) => normalizeText(item)));
  const dedupedEdges = new Map<string, GenerationStructuredRelationshipEdge>();
  let candidateRelationships = 0;

  for (const row of relationshipRows) {
    const sourceMatched = normalizedFocusSet.has(normalizeText(row.sourceEntityName));
    const targetMatched = normalizedFocusSet.has(normalizeText(row.targetEntityName));

    if (!sourceMatched && !targetMatched) {
      continue;
    }

    const confidence = scoreRelationshipCandidate({
      sourceKind: row.sourceKind,
      relationshipType: row.relationshipType,
      hasTarget: Boolean(row.targetEntityName),
      evidence: row.evidence || row.description,
    });
    const confidenceLevel = resolveRelationshipConfidenceLevel(confidence);

    candidateRelationships += 1;

    if (confidenceLevel === 'low') {
      continue;
    }

    const targetEntityName = row.targetEntityName || '未知目标';
    const edge: GenerationStructuredRelationshipEdge = {
      sourceEntityName: row.sourceEntityName || '未知实体',
      targetEntityName,
      relationshipType: row.relationshipType || '关系',
      sourceKind: row.sourceKind || 'unknown',
      description: row.description,
      evidence: row.evidence,
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
    .slice(0, 12);
  const droppedLowConfidence = Math.max(0, candidateRelationships - acceptedEdges.length);

  if (acceptedEdges.length === 0) {
    return makeResult(
      'no_historical_relationship',
      buildStructuredRelationshipFallbackHints(chapterRecords, chapterRecord.chapterOrder, uniqueFocusEntityNames),
      {
        candidateRelationships,
        acceptedRelationships: 0,
        droppedLowConfidence,
        candidatePaths: 0,
        acceptedPaths: 0,
        droppedNoisyPaths: 0,
      },
    );
  }

  const acceptedRatio = candidateRelationships > 0 ? acceptedEdges.length / candidateRelationships : 0;

  if (candidateRelationships >= 5 && acceptedRatio < 0.34) {
    return makeResult(
      'high_noise',
      buildStructuredRelationshipFallbackHints(chapterRecords, chapterRecord.chapterOrder, uniqueFocusEntityNames),
      {
        candidateRelationships,
        acceptedRelationships: acceptedEdges.length,
        droppedLowConfidence,
        candidatePaths: 0,
        acceptedPaths: 0,
        droppedNoisyPaths: 0,
      },
    );
  }

  const entityRowByName = new Map(entityRows.map((row) => [normalizeText(row.entityName), row] as const));
  const nodeNames = createUniqueList([
    ...uniqueFocusEntityNames,
    ...acceptedEdges.flatMap((item) => [item.sourceEntityName, item.targetEntityName]),
  ]).slice(0, 18);
  const nodes: GenerationStructuredRelationshipNode[] = nodeNames.map((entityName) => {
    const row = entityRowByName.get(normalizeText(entityName));

    return {
      entityName,
      entityType: row?.entityType ?? '',
      role: normalizedFocusSet.has(normalizeText(entityName)) ? 'focus' : 'neighbor',
      description: row?.description ?? '',
      tags: row?.tags ?? [],
      pinned: row?.pinned ?? false,
      lastSeenChapterTitle: row?.lastSeenChapterTitle ?? '',
    };
  });

  return {
    projectId,
    chapterId: chapterRecord.chapterId,
    chapterTitle: chapterRecord.chapterTitle,
    chapterOrder: chapterRecord.chapterOrder,
    focusEntityNames: uniqueFocusEntityNames,
    mode: 'graph_1hop',
    reason: 'ok',
    nodes,
    edges: acceptedEdges,
    paths: [],
    fallbackHints: [],
    stats: {
      candidateRelationships,
      acceptedRelationships: acceptedEdges.length,
      droppedLowConfidence,
      candidatePaths: 0,
      acceptedPaths: 0,
      droppedNoisyPaths: 0,
    },
  };
}

interface StructuredRelationshipPathCandidate {
  focusEntityName: string;
  viaEntityName: string;
  targetEntityName: string;
  edgeA: GenerationStructuredRelationshipEdge;
  edgeB: GenerationStructuredRelationshipEdge;
  confidence: number;
  confidenceLevel: GenerationStructuredRelationshipConfidenceLevel;
}

function createStructuredRelationshipTwoHopResult(
  projectId: string,
  chapterRecord: GenerationDebugChapterRecord,
  focusEntityNames: string[],
  entityRows: StructuredRelationshipEntityRow[],
  relationshipRows: StructuredRelationshipRawRow[],
  chapterRecords: GenerationDebugChapterRecord[],
): GenerationStructuredRelationshipQueryResult {
  const uniqueFocusEntityNames = createUniqueList(focusEntityNames);

  const makeResult = (
    reason: GenerationStructuredRelationshipQueryReason,
    fallbackHints: GenerationStructuredRelationshipFallbackHint[] = [],
    stats?: GenerationStructuredRelationshipQueryResult['stats'],
  ): GenerationStructuredRelationshipQueryResult => ({
    projectId,
    chapterId: chapterRecord.chapterId,
    chapterTitle: chapterRecord.chapterTitle,
    chapterOrder: chapterRecord.chapterOrder,
    focusEntityNames: uniqueFocusEntityNames,
    mode: reason === 'ok' ? 'graph_2hop' : 'degraded',
    reason,
    nodes: [],
    edges: [],
    paths: [],
    fallbackHints,
    stats:
      stats ?? {
        candidateRelationships: 0,
        acceptedRelationships: 0,
        droppedLowConfidence: 0,
        candidatePaths: 0,
        acceptedPaths: 0,
        droppedNoisyPaths: 0,
      },
  });

  if (chapterRecord.chapterOrder <= 0) {
    return makeResult('missing_chapter_context');
  }

  if (uniqueFocusEntityNames.length === 0) {
    return makeResult(
      'no_focus_entity',
      buildStructuredRelationshipFallbackHints(chapterRecords, chapterRecord.chapterOrder, uniqueFocusEntityNames),
    );
  }

  const normalizedFocusSet = new Set(uniqueFocusEntityNames.map((item) => normalizeText(item)));
  const candidateEdges: GenerationStructuredRelationshipEdge[] = [];
  let droppedLowConfidence = 0;

  for (const row of relationshipRows) {
    const confidence = scoreRelationshipCandidate({
      sourceKind: row.sourceKind,
      relationshipType: row.relationshipType,
      hasTarget: Boolean(row.targetEntityName),
      evidence: row.evidence || row.description,
    });
    const confidenceLevel = resolveRelationshipConfidenceLevel(confidence);

    if (confidenceLevel === 'low') {
      droppedLowConfidence += 1;
      continue;
    }

    candidateEdges.push({
      sourceEntityName: row.sourceEntityName || '未知实体',
      targetEntityName: row.targetEntityName || '未知目标',
      relationshipType: row.relationshipType || '关系',
      sourceKind: row.sourceKind || 'unknown',
      description: row.description,
      evidence: row.evidence,
      chapterId: row.chapterId,
      chapterTitle: row.chapterTitle,
      chapterOrder: row.chapterOrder,
      confidence,
      confidenceLevel,
    });
  }

  const adjacency = new Map<string, GenerationStructuredRelationshipEdge[]>();

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
        const confidenceLevel = resolveRelationshipConfidenceLevel(confidence);
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
          !existing
          || pathCandidate.confidence > existing.confidence
          || (
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
    .slice(0, 8);
  const droppedNoisyPaths = Math.max(0, candidatePaths - acceptedPaths.length);

  if (acceptedPaths.length === 0) {
    return makeResult(
      'no_two_hop_relationship',
      buildStructuredRelationshipFallbackHints(chapterRecords, chapterRecord.chapterOrder, uniqueFocusEntityNames),
      {
        candidateRelationships: candidateEdges.length,
        acceptedRelationships: candidateEdges.length,
        droppedLowConfidence,
        candidatePaths,
        acceptedPaths: 0,
        droppedNoisyPaths,
      },
    );
  }

  const acceptedRatio = candidatePaths > 0 ? acceptedPaths.length / candidatePaths : 0;

  if (candidatePaths >= 6 && acceptedRatio < 0.34) {
    return makeResult(
      'high_noise',
      buildStructuredRelationshipFallbackHints(chapterRecords, chapterRecord.chapterOrder, uniqueFocusEntityNames),
      {
        candidateRelationships: candidateEdges.length,
        acceptedRelationships: candidateEdges.length,
        droppedLowConfidence,
        candidatePaths,
        acceptedPaths: acceptedPaths.length,
        droppedNoisyPaths,
      },
    );
  }

  const entityRowByName = new Map(entityRows.map((row) => [normalizeText(row.entityName), row] as const));
  const nodes = createUniqueList([
    ...uniqueFocusEntityNames,
    ...acceptedPaths.flatMap((item) => [item.focusEntityName, item.viaEntityName, item.targetEntityName]),
  ])
    .slice(0, 24)
    .map((entityName): GenerationStructuredRelationshipNode => {
      const row = entityRowByName.get(normalizeText(entityName));

      return {
        entityName,
        entityType: row?.entityType ?? '',
        role: normalizedFocusSet.has(normalizeText(entityName)) ? 'focus' : 'neighbor',
        description: row?.description ?? '',
        tags: row?.tags ?? [],
        pinned: row?.pinned ?? false,
        lastSeenChapterTitle: row?.lastSeenChapterTitle ?? '',
      };
    });

  const edgeMap = new Map<string, GenerationStructuredRelationshipEdge>();

  for (const path of acceptedPaths) {
    for (const edge of [path.edgeA, path.edgeB]) {
      const edgeKey = [
        normalizeText(edge.sourceEntityName),
        normalizeText(edge.targetEntityName),
        normalizeText(edge.relationshipType),
      ].join(':');

      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, edge);
      }
    }
  }

  return {
    projectId,
    chapterId: chapterRecord.chapterId,
    chapterTitle: chapterRecord.chapterTitle,
    chapterOrder: chapterRecord.chapterOrder,
    focusEntityNames: uniqueFocusEntityNames,
    mode: 'graph_2hop',
    reason: 'ok',
    nodes,
    edges: Array.from(edgeMap.values()),
    paths: acceptedPaths.map((item): GenerationStructuredRelationshipPath => ({
      focusEntityName: item.focusEntityName,
      viaEntityName: item.viaEntityName,
      targetEntityName: item.targetEntityName,
      edgeCount: 2,
      confidence: item.confidence,
      confidenceLevel: item.confidenceLevel,
      sourceKinds: createUniqueList([item.edgeA.sourceKind, item.edgeB.sourceKind]),
      chapterOrders: [item.edgeA.chapterOrder, item.edgeB.chapterOrder],
    })),
    fallbackHints: [],
    stats: {
      candidateRelationships: candidateEdges.length,
      acceptedRelationships: candidateEdges.length,
      droppedLowConfidence,
      candidatePaths,
      acceptedPaths: acceptedPaths.length,
      droppedNoisyPaths,
    },
  };
}

export function getGenerationDebugStructuredRelationshipQuery(
  env: ServerEnv,
  projectId: string,
  input: {
    chapterId: string;
    entityName?: string;
  },
) {
  const chapterRecords = listGenerationDebugChapterRecords(env, projectId);
  const chapterRecord = chapterRecords.find((item) => item.chapterId === input.chapterId);

  if (!chapterRecord) {
    return null;
  }

  const focusEntityNames = resolveStructuredRelationshipFocusNames(
    chapterRecords,
    chapterRecord,
    input.entityName,
  );
  const entityRows = loadStructuredRelationshipEntities(env, projectId, chapterRecord.chapterOrder);
  const relationshipRows = loadStructuredRelationshipRows(
    env,
    projectId,
    chapterRecord.chapterId,
    chapterRecord.chapterOrder,
  );

  return createStructuredRelationshipResult(
    projectId,
    chapterRecord,
    focusEntityNames,
    entityRows,
    relationshipRows,
    chapterRecords,
  );
}

export function getGenerationDebugStructuredRelationshipQueryTwoHop(
  env: ServerEnv,
  projectId: string,
  input: {
    chapterId: string;
    entityName?: string;
  },
) {
  const chapterRecords = listGenerationDebugChapterRecords(env, projectId);
  const chapterRecord = chapterRecords.find((item) => item.chapterId === input.chapterId);

  if (!chapterRecord) {
    return null;
  }

  const focusEntityNames = resolveStructuredRelationshipFocusNames(
    chapterRecords,
    chapterRecord,
    input.entityName,
  );
  const entityRows = loadStructuredRelationshipEntities(env, projectId, chapterRecord.chapterOrder);
  const relationshipRows = loadStructuredRelationshipRows(
    env,
    projectId,
    chapterRecord.chapterId,
    chapterRecord.chapterOrder,
  );

  return createStructuredRelationshipTwoHopResult(
    projectId,
    chapterRecord,
    focusEntityNames,
    entityRows,
    relationshipRows,
    chapterRecords,
  );
}

function describeStructuredRelationshipReason(reason: GenerationStructuredRelationshipQueryReason) {
  switch (reason) {
    case 'ok':
      return '命中稳定二度关系路径';
    case 'missing_chapter_context':
      return '缺少有效章节上下文';
    case 'no_focus_entity':
      return '未识别可用焦点实体';
    case 'no_historical_relationship':
      return '历史一度关系不足';
    case 'no_two_hop_relationship':
      return '历史二度关系不足';
    case 'high_noise':
      return '候选二度路径噪音偏高';
    default:
      return '未知原因';
  }
}

export function getGenerationDebugStructuredRelationshipConsumptionPreview(
  env: ServerEnv,
  projectId: string,
  input: {
    chapterId: string;
    entityName?: string;
  },
): GenerationStructuredRelationshipConsumptionPreview | null {
  const queryResult = getGenerationDebugStructuredRelationshipQueryTwoHop(env, projectId, input);

  if (!queryResult) {
    return null;
  }

  const headerBlock = [
    `- 命中模式：${queryResult.mode === 'graph_2hop' ? 'graph_2hop（二度关系实验）' : 'degraded（仅弱提示）'}`,
    '注入层：relationships_experimental_2hop',
    `原因：${queryResult.reason}（${describeStructuredRelationshipReason(queryResult.reason)}）`,
    `焦点实体：${queryResult.focusEntityNames.join('、') || '无'}`,
  ].join('\n');

  const detailBlocks =
    queryResult.mode === 'graph_2hop'
      ? queryResult.paths.map((path) =>
          [
            `- 二跳路径：${path.focusEntityName} -> ${path.viaEntityName} -> ${path.targetEntityName}`,
            `边数：${path.edgeCount}`,
            `来源：${path.sourceKinds.join(' / ') || '未知'}`,
            `章节：${path.chapterOrders.join(' -> ')}`,
            `置信：${path.confidenceLevel} (${path.confidence.toFixed(2)})`,
          ].join('\n'),
        )
      : queryResult.fallbackHints.length > 0
        ? queryResult.fallbackHints.map((hint) =>
            [
              `- 弱提示：${hint.text}`,
              `来源：${hint.chapterTitle || '未知章节'}`,
            ].join('\n'),
          )
        : ['- 弱提示：当前未形成可注入的二度关系强信号。'];

  return {
    projectId: queryResult.projectId,
    chapterId: queryResult.chapterId,
    chapterTitle: queryResult.chapterTitle,
    chapterOrder: queryResult.chapterOrder,
    focusEntityNames: queryResult.focusEntityNames,
    mode: queryResult.mode,
    reason: queryResult.reason,
    injectionLayer: 'relationships_experimental_2hop',
    blocks: [headerBlock, ...detailBlocks],
    stats: queryResult.stats,
  };
}

export function getGenerationDebugChapterDetail(
  env: ServerEnv,
  projectId: string,
  chapterId: string,
) {
  const chapterRecord = listGenerationDebugChapterRecords(env, projectId).find((item) => item.chapterId === chapterId);

  if (!chapterRecord) {
    return null;
  }

  const db = getGenerationDatabase(env);
  const stateChangeRows = db
    .prepare(
      `
        SELECT
          id,
          entity_name,
          field,
          old_value,
          new_value,
          updated_at
        FROM generation_state_changes
        WHERE project_id = ? AND chapter_id = ?
        ORDER BY updated_at DESC, entity_name COLLATE NOCASE ASC
      `,
    )
    .all(projectId, chapterId) as Array<Record<string, unknown>>;
  const stateChanges = stateChangeRows.map((row): GenerationDebugStateChangeRecord => ({
    id: String(row.id ?? ''),
    entityName: String(row.entity_name ?? ''),
    field: String(row.field ?? ''),
    oldValue: String(row.old_value ?? ''),
    newValue: String(row.new_value ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }));
  const relationships = listGenerationDebugRelationships(env, projectId, { chapterId });

  const detail: GenerationDebugChapterDetail = {
    ...chapterRecord,
    stateChanges,
    relationships,
  };

  return detail;
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

export async function getGenerationDebugContext(
  env: ServerEnv,
  projectId: string,
  chapterId: string,
) {
  const chapterRecords = listGenerationDebugChapterRecords(env, projectId);
  const chapterRecord = chapterRecords.find((item) => item.chapterId === chapterId);

  if (!chapterRecord) {
    return null;
  }

  const previousChapterRecord = chapterRecord.previousChapterId
    ? chapterRecords.find((item) => item.chapterId === chapterRecord.previousChapterId)
    : null;
  const db = getGenerationDatabase(env);
  const latestJobRow = db
    .prepare(
      `
        SELECT
          chapter_title,
          request_json,
          outline_json,
          updated_at
        FROM generation_jobs
        WHERE project_id = ? AND chapter_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(projectId, chapterId) as Record<string, unknown> | undefined;
  const request = parseJsonText<GenerationJobRequest>(asString(latestJobRow?.request_json));
  const outlineFromJob = parseJsonText<ChapterOutlineDraft>(asString(latestJobRow?.outline_json));
  const context = await buildGenerationContextBundle(env, {
    projectId,
    chapterId,
    chapterTitle: asString(latestJobRow?.chapter_title) || chapterRecord.chapterTitle,
    chapterOrder: request?.chapterOrder ?? chapterRecord.chapterOrder,
    volumeTitle: request?.volumeTitle ?? chapterRecord.volumeTitle,
    previousChapterId: request?.previousChapterId ?? chapterRecord.previousChapterId,
    previousChapterTitle: request?.previousChapterTitle ?? chapterRecord.previousChapterTitle,
    previousSummary: request?.previousSummary ?? previousChapterRecord?.summaryExcerpt ?? '',
    worldState: request?.worldState,
    outline: outlineFromJob ?? request?.outlineOverride ?? buildContextOutlineFromChapterRecord(chapterRecord),
    fallbackContextBundle: request?.contextBundle,
    preferStoredForeshadows: Array.isArray(request?.foreshadowSnapshot),
    lightweightRecallConfig: request?.gateConfigOverride?.lightweightRecall,
  });

  const debugContext: GenerationDebugContext = {
    chapterId: chapterRecord.chapterId,
    chapterTitle: chapterRecord.chapterTitle,
    chapterOrder: chapterRecord.chapterOrder,
    bundle: context.bundle,
    recentSummaryCount: context.recentSummaryCount,
    recentTextCount: context.recentTextCount,
    volumeRecapCount: context.volumeRecapCount,
    relatedChapterCount: context.relatedChapterCount,
    dormantForeshadowRecallCount: context.dormantForeshadowRecallCount,
    volumeRecapRecallCount: context.volumeRecapRecallCount,
    entityCount: context.entityCount,
    relationshipCount: context.relationshipCount,
    hasFallbackContext: context.hasFallbackContext,
    focusEntityNames: context.focusEntityNames,
    queryPhrases: context.queryPhrases,
    lightweightRecallItems: context.lightweightRecallItems,
    sections: context.sections,
  };

  return debugContext;
}

export function listGenerationDebugMemoryChunks(
  env: ServerEnv,
  projectId: string,
  filters?: {
    q?: string;
    chapterId?: string;
    chunkKind?: string;
  },
) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          id,
          chapter_id,
          chapter_title,
          chapter_order,
          volume_title,
          chunk_kind,
          source_kind,
          chunk_index,
          time_anchor,
          summary_excerpt,
          token_count,
          entity_refs_json,
          locations_json,
          metadata_json,
          content,
          updated_at
        FROM generation_memory_chunks
        WHERE project_id = ?
        ORDER BY updated_at DESC, chapter_order DESC, chunk_index ASC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows
    .map((row): GenerationDebugMemoryChunkRecord => ({
      id: asString(row.id),
      chapterId: asString(row.chapter_id),
      chapterTitle: asString(row.chapter_title),
      chapterOrder: Number(row.chapter_order ?? 0),
      volumeTitle: asString(row.volume_title),
      chunkKind: asString(row.chunk_kind),
      sourceKind: asString(row.source_kind),
      chunkIndex: Number(row.chunk_index ?? 0),
      timeAnchor: asString(row.time_anchor),
      summaryExcerpt: asString(row.summary_excerpt),
      tokenCount: Number(row.token_count ?? 0),
      entityRefs: parseJsonArray(String(row.entity_refs_json ?? '[]')) as string[],
      locations: parseJsonArray(String(row.locations_json ?? '[]')) as string[],
      content: asString(row.content),
      updatedAt: asString(row.updated_at),
    }))
    .filter((item) => {
      if (filters?.chapterId && item.chapterId !== filters.chapterId) {
        return false;
      }

      if (filters?.chunkKind && item.chunkKind !== filters.chunkKind) {
        return false;
      }

      return includesQuery(
        [
          item.chapterTitle,
          item.volumeTitle,
          item.chunkKind,
          item.sourceKind,
          item.timeAnchor,
          item.summaryExcerpt,
          item.entityRefs.join(' '),
          item.locations.join(' '),
          item.content,
        ],
        filters?.q ?? '',
      );
    });
}

export async function getGenerationDebugRetrieval(
  env: ServerEnv,
  projectId: string,
  chapterId: string,
) {
  const chapterRecords = listGenerationDebugChapterRecords(env, projectId);
  const chapterRecord = chapterRecords.find((item) => item.chapterId === chapterId);

  if (!chapterRecord) {
    return null;
  }

  const previousChapterRecord = chapterRecord.previousChapterId
    ? chapterRecords.find((item) => item.chapterId === chapterRecord.previousChapterId)
    : null;
  const db = getGenerationDatabase(env);
  const latestJobRow = db
    .prepare(
      `
        SELECT
          chapter_title,
          request_json,
          outline_json
        FROM generation_jobs
        WHERE project_id = ? AND chapter_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(projectId, chapterId) as Record<string, unknown> | undefined;
  const request = parseJsonText<GenerationJobRequest>(asString(latestJobRow?.request_json));
  const outlineFromJob = parseJsonText<ChapterOutlineDraft>(asString(latestJobRow?.outline_json));
  const context = await buildGenerationContextBundle(env, {
    projectId,
    chapterId,
    chapterTitle: asString(latestJobRow?.chapter_title) || chapterRecord.chapterTitle,
    chapterOrder: request?.chapterOrder ?? chapterRecord.chapterOrder,
    volumeTitle: request?.volumeTitle ?? chapterRecord.volumeTitle,
    previousChapterId: request?.previousChapterId ?? chapterRecord.previousChapterId,
    previousChapterTitle: request?.previousChapterTitle ?? chapterRecord.previousChapterTitle,
    previousSummary: request?.previousSummary ?? previousChapterRecord?.summaryExcerpt ?? '',
    worldState: request?.worldState,
    outline: outlineFromJob ?? request?.outlineOverride ?? buildContextOutlineFromChapterRecord(chapterRecord),
    fallbackContextBundle: request?.contextBundle,
    preferStoredForeshadows: Array.isArray(request?.foreshadowSnapshot),
    lightweightRecallConfig: request?.gateConfigOverride?.lightweightRecall,
  });
  const retrieval = await retrieveGenerationMemory(env, {
    projectId,
    chapterId,
    chapterOrder: request?.chapterOrder ?? chapterRecord.chapterOrder,
    volumeTitle: request?.volumeTitle ?? chapterRecord.volumeTitle,
    queryPhrases: context.queryPhrases,
    focusEntityNames: context.focusEntityNames,
    limit: 8,
    lightweightRecallConfig: request?.gateConfigOverride?.lightweightRecall,
  });

  const result: GenerationDebugRetrieval = {
    chapterId: chapterRecord.chapterId,
    chapterTitle: chapterRecord.chapterTitle,
    queryPhrases: context.queryPhrases,
    focusEntityNames: context.focusEntityNames,
    vectorBackend: getGenerationVectorBackendStatus(env),
    vectorSearch: retrieval.vectorSearch,
    pipeline: retrieval.pipeline,
    items: retrieval.items,
  };

  return result;
}
