import type { ServerEnv } from '../config/env.js';
import type { LightweightRecallConfig } from '../types/ai.js';
import {
  buildGenerationColdStorageContext,
  evaluateGenerationColdStorageCandidate,
  type GenerationColdStorageContext,
  type GenerationColdStorageDecision,
  type GenerationColdStorageDecisionReason,
} from './generation-cold-storage.js';
import {
  DEFAULT_VECTOR_MIN_SCORE,
  DEFAULT_VECTOR_MIN_SIMILARITY,
  findGenerationVectorCandidates,
  type GenerationVectorSearchDiagnostics,
} from './generation-vector-backend.js';
import {
  deriveGenerationForeshadowLifecycle,
  listGenerationForeshadows,
} from './generation-foreshadow-store.js';
import { getGenerationDatabase } from './generation-sqlite.js';
import { listGenerationVolumeRecaps } from './generation-volume-recap-store.js';

export interface GenerationMemoryRetrievalRequest {
  projectId: string;
  chapterId?: string;
  chapterOrder?: number;
  volumeTitle?: string;
  queryPhrases?: string[];
  focusEntityNames?: string[];
  limit?: number;
  lightweightRecallConfig?: LightweightRecallConfig;
}

export type GenerationRetrievedSourceType = 'memory_chunk' | 'dormant_foreshadow' | 'volume_recap';
export type GenerationRetrievedHitOrigin = 'lexical_only' | 'vector_only' | 'hybrid';

export interface GenerationRetrievedChunk {
  id: string;
  sourceType: GenerationRetrievedSourceType;
  title: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  chunkKind: string;
  sourceKind: string;
  chunkIndex: number;
  timeAnchor: string;
  summaryExcerpt: string;
  entityRefs: string[];
  locations: string[];
  score: number;
  matchedTerms: string[];
  matchedEntityNames: string[];
  matchedLocations: string[];
  contentExcerpt: string;
  updatedAt: string;
  block: string;
  retrievalHitOrigin: GenerationRetrievedHitOrigin;
  retrievalSignals: Array<'lexical' | 'vector'>;
  vectorSimilarity: number | null;
  preRerankScore: number;
  rerankDelta: number;
  rerankReasons: string[];
  mergedCandidateCount: number;
  scoreBreakdown: {
    sameVolume: number;
    phrase: number;
    entity: number;
    location: number;
    recency: number;
    chunkKind: number;
    embedding: number;
  };
}

export interface GenerationColdArchiveFilteredItem {
  sourceType: 'memory_chunk' | 'volume_recap';
  id: string;
  title: string;
  chapterOrder: number;
  volumeTitle: string;
  chapterDistance: number | null;
  reason: GenerationColdStorageDecisionReason;
}

interface RetrievalCandidateRow {
  id: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  chunkKind: string;
  sourceKind: string;
  chunkIndex: number;
  timeAnchor: string;
  summaryExcerpt: string;
  entityRefs: string[];
  locations: string[];
  content: string;
  updatedAt: string;
}

export interface GenerationMemoryRetrievalResult {
  items: GenerationRetrievedChunk[];
  vectorSearch: GenerationVectorSearchDiagnostics;
  pipeline: {
    metadataFilter: {
      inputCandidates: number;
      outputCandidates: number;
      filteredOutCandidates: number;
    };
    hybridRecall: {
      candidateCount: number;
      lexicalOnlyCount: number;
      vectorOnlyCount: number;
      hybridCount: number;
    };
    dedupeRerank: {
      inputCandidates: number;
      dedupedCandidates: number;
      mergedAwayCandidates: number;
    };
    selection: {
      inputCandidates: number;
      selectedCandidates: number;
      thresholdSelectedCandidates: number;
      rescuedVectorOnlyCandidates: number;
      droppedBelowThresholdCandidates: number;
      droppedByLimitCandidates: number;
      limit: number;
      topScore: number | null;
      dynamicThreshold: number | null;
      rescuedVectorOnlyChunkIds: string[];
      droppedVectorOnlyChunkIds: string[];
    };
  };
}

interface RetrievalMetadataFilterPhaseResult {
  candidates: RetrievalCandidateRow[];
  diagnostics: GenerationMemoryRetrievalResult['pipeline']['metadataFilter'];
}

interface RetrievalHybridRecallPhaseResult {
  candidates: Array<GenerationRetrievedChunk & { content: string }>;
  vectorSearch: GenerationVectorSearchDiagnostics;
  diagnostics: GenerationMemoryRetrievalResult['pipeline']['hybridRecall'];
}

interface RetrievalDedupeRerankPhaseResult {
  candidates: Array<GenerationRetrievedChunk & { content: string }>;
  diagnostics: GenerationMemoryRetrievalResult['pipeline']['dedupeRerank'];
}

interface RetrievalSelectionPhaseResult {
  candidates: Array<GenerationRetrievedChunk & { content: string }>;
  diagnostics: GenerationMemoryRetrievalResult['pipeline']['selection'];
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

function createUniqueList(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function collectMatchedTerms(parts: Array<string | null | undefined>, candidates: string[]) {
  const matched = candidates.filter((candidate) => {
    const normalizedCandidate = normalizeText(candidate);

    if (!normalizedCandidate) {
      return false;
    }

    return parts.some((part) => normalizeText(part).includes(normalizedCandidate));
  });

  return createUniqueList(matched).slice(0, 6);
}

function buildChapterLabel(chapterOrder: number, chapterTitle: string) {
  return chapterOrder > 0 ? `第${chapterOrder}章：${chapterTitle}` : chapterTitle || '未命名章节';
}

function countOccurrences(source: string, pattern: string) {
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

function buildQueryPhrases(request: GenerationMemoryRetrievalRequest) {
  return createUniqueList(request.queryPhrases ?? []).slice(0, 16);
}

function buildFocusEntityNames(request: GenerationMemoryRetrievalRequest) {
  return createUniqueList(request.focusEntityNames ?? []).slice(0, 8);
}

interface MemoryMetadataPrefilterContext {
  coldStorageContext: GenerationColdStorageContext;
  normalizedCurrentVolume: string;
  normalizedFocusEntitySet: Set<string>;
  normalizedLocationTerms: string[];
}

function buildMemoryMetadataPrefilterContext(
  env: ServerEnv,
  request: GenerationMemoryRetrievalRequest,
  queryPhrases: string[],
  focusEntityNames: string[],
): MemoryMetadataPrefilterContext {
  const normalizedFocusEntitySet = new Set(
    createUniqueList(focusEntityNames.map((entityName) => normalizeText(entityName)).filter(Boolean)),
  );

  return {
    coldStorageContext: buildGenerationColdStorageContext(env, {
      projectId: request.projectId,
      currentVolumeTitle: request.volumeTitle,
      queryPhrases,
      focusEntityNames,
    }),
    normalizedCurrentVolume: normalizeText(request.volumeTitle),
    normalizedFocusEntitySet,
    normalizedLocationTerms: createUniqueList([
      ...queryPhrases.filter((phrase) => phrase.length <= 12),
      ...focusEntityNames,
    ])
      .map((term) => normalizeText(term))
      .filter(Boolean),
  };
}

function hasLocationMetadataHit(candidateLocations: string[], normalizedLocationTerms: string[]) {
  if (candidateLocations.length === 0 || normalizedLocationTerms.length === 0) {
    return false;
  }

  const normalizedCandidateLocations = candidateLocations
    .map((location) => normalizeText(location))
    .filter(Boolean);

  return normalizedCandidateLocations.some((location) =>
    normalizedLocationTerms.some((term) => location.includes(term) || term.includes(location)),
  );
}

function shouldKeepMemoryCandidateByMetadata(
  candidate: RetrievalCandidateRow,
  request: GenerationMemoryRetrievalRequest,
  context: MemoryMetadataPrefilterContext,
  onColdArchived?: (item: GenerationColdArchiveFilteredItem) => void,
) {
  if (request.chapterId && candidate.chapterId === request.chapterId) {
    return false;
  }

  const currentChapterOrder = request.chapterOrder ?? 0;

  if (currentChapterOrder > 0 && candidate.chapterOrder > 0 && candidate.chapterOrder >= currentChapterOrder) {
    return false;
  }

  if (currentChapterOrder <= 0 || candidate.chapterOrder <= 0) {
    return true;
  }

  const chapterDistance = currentChapterOrder - candidate.chapterOrder;

  if (chapterDistance <= 0) {
    return false;
  }

  const coldArchiveDecision = evaluateGenerationColdStorageCandidate(context.coldStorageContext, {
    volumeTitle: candidate.volumeTitle,
    entityRefs: candidate.entityRefs,
    textParts: [candidate.chapterTitle, candidate.summaryExcerpt, candidate.timeAnchor, candidate.content],
  });

  if (coldArchiveDecision.isColdArchived) {
    onColdArchived?.(createColdArchivedMemoryItem(candidate, coldArchiveDecision));
    return false;
  }

  // 近邻章节先放行，避免过早裁剪掉最近上下文。
  if (chapterDistance <= 12) {
    return true;
  }

  const sameVolume =
    Boolean(context.normalizedCurrentVolume) &&
    context.normalizedCurrentVolume === normalizeText(candidate.volumeTitle);
  const entityMatched =
    context.normalizedFocusEntitySet.size > 0 &&
    candidate.entityRefs.some((entityRef) =>
      context.normalizedFocusEntitySet.has(normalizeText(entityRef)),
    );
  const locationMatched = hasLocationMetadataHit(candidate.locations, context.normalizedLocationTerms);

  if (entityMatched || locationMatched) {
    return true;
  }

  if (sameVolume) {
    return chapterDistance <= 96;
  }

  return chapterDistance <= 32;
}

function createColdArchivedMemoryItem(
  candidate: RetrievalCandidateRow,
  decision: GenerationColdStorageDecision,
): GenerationColdArchiveFilteredItem {
  return {
    sourceType: 'memory_chunk',
    id: candidate.id,
    title: candidate.chapterTitle,
    chapterOrder: candidate.chapterOrder,
    volumeTitle: candidate.volumeTitle,
    chapterDistance: decision.chapterDistance,
    reason: decision.reason,
  };
}

function mapCandidateRow(row: Record<string, unknown>): RetrievalCandidateRow {
  return {
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
    entityRefs: parseStringArrayJson(asString(row.entity_refs_json)),
    locations: parseStringArrayJson(asString(row.locations_json)),
    content: asString(row.content),
    updatedAt: asString(row.updated_at),
  };
}

function calculateRecencyScore(currentChapterOrder: number | undefined, candidateChapterOrder: number) {
  if (!currentChapterOrder || currentChapterOrder <= 0 || candidateChapterOrder <= 0) {
    return 0;
  }

  if (candidateChapterOrder >= currentChapterOrder) {
    return 0;
  }

  const distance = currentChapterOrder - candidateChapterOrder;

  if (distance <= 5) {
    return 4;
  }

  if (distance <= 20) {
    return 3;
  }

  if (distance <= 60) {
    return 2;
  }

  if (distance <= 120) {
    return 1;
  }

  return 0;
}

function resolveLightweightRecallConfig(
  env: ServerEnv,
  candidate: LightweightRecallConfig | undefined,
): LightweightRecallConfig {
  const fallback = env.generationGateConfig.lightweightRecall;

  return {
    minScore: candidate?.minScore ?? fallback.minScore,
    topK: candidate?.topK ?? fallback.topK,
    phraseWeight: candidate?.phraseWeight ?? fallback.phraseWeight,
    entityWeight: candidate?.entityWeight ?? fallback.entityWeight,
    recencyWeight: candidate?.recencyWeight ?? fallback.recencyWeight,
  };
}

function createEmptyScoreBreakdown() {
  return {
    sameVolume: 0,
    phrase: 0,
    entity: 0,
    location: 0,
    recency: 0,
    chunkKind: 0,
    embedding: 0,
  };
}

function compareRetrievedItems(left: GenerationRetrievedChunk, right: GenerationRetrievedChunk) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.chapterOrder !== right.chapterOrder) {
    return right.chapterOrder - left.chapterOrder;
  }

  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }

  return left.chunkIndex - right.chunkIndex;
}

function buildRetrievalHitOriginLabel(origin: GenerationRetrievedHitOrigin) {
  switch (origin) {
    case 'hybrid':
      return '混合命中';
    case 'vector_only':
      return '向量命中';
    case 'lexical_only':
    default:
      return '关键词命中';
  }
}

function buildRetrievedChunkBlock(item: GenerationRetrievedChunk) {
  if (item.sourceType === 'dormant_foreshadow') {
    const lines = [
      `- 休眠伏笔召回：${item.title}`,
      `来源：${item.chapterTitle || '未关联章节'}`,
      `摘要：${truncateText(item.summaryExcerpt || item.contentExcerpt || '暂无说明', 140)}`,
      `匹配分：${item.score}`,
    ];

    if (item.contentExcerpt && item.contentExcerpt !== item.summaryExcerpt) {
      lines.push(item.contentExcerpt);
    }

    return lines.join('\n');
  }

  if (item.sourceType === 'volume_recap') {
    const lines = [
      `- 卷级总结召回：${item.title}`,
      item.summaryExcerpt ? `提要：${truncateText(item.summaryExcerpt, 140)}` : '',
      `匹配分：${item.score}`,
      item.contentExcerpt || '',
    ].filter(Boolean);

    return lines.join('\n');
  }

  const lines = [`- ${buildChapterLabel(item.chapterOrder, item.chapterTitle)} / ${item.chunkKind} #${item.chunkIndex + 1}`];

  if (item.matchedTerms.length > 0) {
    lines.push(`命中词：${item.matchedTerms.join('、')}`);
  }

  if (item.matchedEntityNames.length > 0) {
    lines.push(`命中实体：${item.matchedEntityNames.join('、')}`);
  }

  if (item.matchedLocations.length > 0) {
    lines.push(`命中地点：${item.matchedLocations.join('、')}`);
  }

  lines.push(`命中来源：${buildRetrievalHitOriginLabel(item.retrievalHitOrigin)}`);

  if (item.vectorSimilarity !== null) {
    lines.push(`向量相似度：${item.vectorSimilarity.toFixed(3)}`);
  }

  if (item.mergedCandidateCount > 1) {
    lines.push(`去重合并：${item.mergedCandidateCount} 条候选`);
  }

  if (item.rerankDelta !== 0 || item.rerankReasons.length > 0) {
    lines.push(
      `重排：${item.preRerankScore} -> ${item.score}（${item.rerankDelta > 0 ? '+' : ''}${item.rerankDelta}）`,
    );
  }

  if (item.rerankReasons.length > 0) {
    lines.push(`依据：${item.rerankReasons.join('；')}`);
  }

  lines.push(`摘要：${truncateText(item.summaryExcerpt || item.contentExcerpt || '暂无摘要', 140)}`);
  lines.push(`片段：${truncateText(item.contentExcerpt || '暂无片段', 160)}`);

  return lines.join('\n');
}

function scoreCandidate(
  candidate: RetrievalCandidateRow,
  request: GenerationMemoryRetrievalRequest,
  queryPhrases: string[],
  focusEntityNames: string[],
) {
  const matchedTerms: string[] = [];
  const matchedEntityNames: string[] = [];
  const matchedLocations: string[] = [];
  const scoreBreakdown = {
    sameVolume: 0,
    phrase: 0,
    entity: 0,
    location: 0,
    recency: 0,
    chunkKind: 0,
    embedding: 0,
  };

  if (request.volumeTitle && normalizeText(request.volumeTitle) === normalizeText(candidate.volumeTitle)) {
    scoreBreakdown.sameVolume += 3;
  }

  scoreBreakdown.chunkKind += candidate.chunkKind === 'parent' ? 1 : 2;
  scoreBreakdown.recency += calculateRecencyScore(request.chapterOrder, candidate.chapterOrder);

  for (const entityName of focusEntityNames) {
    const exactEntityMatched = candidate.entityRefs.some(
      (candidateEntity) => normalizeText(candidateEntity) === normalizeText(entityName),
    );
    const contentMatched = countOccurrences(candidate.content, entityName) > 0;

    if (exactEntityMatched || contentMatched) {
      matchedEntityNames.push(entityName);
      scoreBreakdown.entity += exactEntityMatched ? 8 : 4;
    }
  }

  for (const phrase of queryPhrases) {
    const normalizedPhrase = normalizeText(phrase);

    if (!normalizedPhrase) {
      continue;
    }

    let phraseScore = 0;

    if (countOccurrences(candidate.chapterTitle, phrase) > 0) {
      phraseScore += 6;
    }

    if (countOccurrences(candidate.summaryExcerpt, phrase) > 0) {
      phraseScore += 4;
    }

    if (countOccurrences(candidate.timeAnchor, phrase) > 0) {
      phraseScore += 2;
    }

    if (countOccurrences(candidate.volumeTitle, phrase) > 0) {
      phraseScore += 2;
    }

    const contentHits = countOccurrences(candidate.content, phrase);

    if (contentHits > 0) {
      phraseScore += Math.min(6, contentHits * 2);
    }

    if (phraseScore > 0) {
      matchedTerms.push(phrase);
      scoreBreakdown.phrase += phraseScore;
    }
  }

  const locationTerms = createUniqueList([
    ...queryPhrases.filter((phrase) => phrase.length <= 12),
    ...focusEntityNames,
  ]);

  for (const location of candidate.locations) {
    if (locationTerms.some((term) => countOccurrences(location, term) > 0 || countOccurrences(term, location) > 0)) {
      matchedLocations.push(location);
      scoreBreakdown.location += 3;
    }
  }

  const score = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);

  return {
    score,
    matchedTerms: createUniqueList(matchedTerms),
    matchedEntityNames: createUniqueList(matchedEntityNames),
    matchedLocations: createUniqueList(matchedLocations),
    scoreBreakdown,
  };
}

function hasLexicalScoreBreakdownSignal(scoreBreakdown: GenerationRetrievedChunk['scoreBreakdown']) {
  return scoreBreakdown.phrase > 0 || scoreBreakdown.entity > 0 || scoreBreakdown.location > 0;
}

function createMemoryRetrievedChunk(
  candidate: RetrievalCandidateRow,
  input: {
    score: number;
    matchedTerms: string[];
    matchedEntityNames: string[];
    matchedLocations: string[];
    scoreBreakdown: GenerationRetrievedChunk['scoreBreakdown'];
    retrievalSignals: Array<'lexical' | 'vector'>;
    vectorSimilarity: number | null;
  },
) {
  const retrievalHitOrigin: GenerationRetrievedHitOrigin =
    input.retrievalSignals.length >= 2
      ? 'hybrid'
      : input.retrievalSignals[0] === 'vector'
        ? 'vector_only'
        : 'lexical_only';

  return {
    id: candidate.id,
    sourceType: 'memory_chunk',
    title: candidate.chapterTitle,
    chapterId: candidate.chapterId,
    chapterTitle: candidate.chapterTitle,
    chapterOrder: candidate.chapterOrder,
    volumeTitle: candidate.volumeTitle,
    chunkKind: candidate.chunkKind,
    sourceKind: candidate.sourceKind,
    chunkIndex: candidate.chunkIndex,
    timeAnchor: candidate.timeAnchor,
    summaryExcerpt: candidate.summaryExcerpt,
    entityRefs: candidate.entityRefs,
    locations: candidate.locations,
    score: input.score,
    matchedTerms: input.matchedTerms,
    matchedEntityNames: input.matchedEntityNames,
    matchedLocations: input.matchedLocations,
    contentExcerpt: candidate.content.slice(0, 220),
    updatedAt: candidate.updatedAt,
    block: '',
    retrievalHitOrigin,
    retrievalSignals: input.retrievalSignals,
    vectorSimilarity: input.vectorSimilarity,
    preRerankScore: input.score,
    rerankDelta: 0,
    rerankReasons: [],
    mergedCandidateCount: 1,
    scoreBreakdown: input.scoreBreakdown,
    content: candidate.content,
  } satisfies GenerationRetrievedChunk & { content: string };
}

function runMetadataFilterPhase(
  candidates: RetrievalCandidateRow[],
  request: GenerationMemoryRetrievalRequest,
  context: MemoryMetadataPrefilterContext,
) {
  const filteredCandidates = candidates.filter((candidate) =>
    shouldKeepMemoryCandidateByMetadata(candidate, request, context),
  );

  return {
    candidates: filteredCandidates,
    diagnostics: {
      inputCandidates: candidates.length,
      outputCandidates: filteredCandidates.length,
      filteredOutCandidates: Math.max(0, candidates.length - filteredCandidates.length),
    },
  } satisfies RetrievalMetadataFilterPhaseResult;
}

async function runHybridRecallPhase(
  env: ServerEnv,
  request: GenerationMemoryRetrievalRequest,
  candidates: RetrievalCandidateRow[],
  queryPhrases: string[],
  focusEntityNames: string[],
) {
  const recallById = new Map<string, GenerationRetrievedChunk & { content: string }>();

  for (const candidate of candidates) {
    const scoring = scoreCandidate(candidate, request, queryPhrases, focusEntityNames);
    const retrievalSignals = hasLexicalScoreBreakdownSignal(scoring.scoreBreakdown) ? ['lexical'] as Array<'lexical' | 'vector'> : [];

    if (retrievalSignals.length === 0) {
      continue;
    }

    recallById.set(
      candidate.id,
      createMemoryRetrievedChunk(candidate, {
        score: scoring.score,
        matchedTerms: scoring.matchedTerms,
        matchedEntityNames: scoring.matchedEntityNames,
        matchedLocations: scoring.matchedLocations,
        scoreBreakdown: scoring.scoreBreakdown,
        retrievalSignals,
        vectorSimilarity: null,
      }),
    );
  }

  const vectorSearchResult = await findGenerationVectorCandidates(env, {
    queryText: buildQueryEmbeddingText(request),
    candidates: candidates.map((candidate) => ({
      chunkId: candidate.id,
      projectId: request.projectId,
      chapterId: candidate.chapterId,
      content: [candidate.chapterTitle, candidate.summaryExcerpt, candidate.content].filter(Boolean).join('\n'),
    })),
  });

  for (const candidate of candidates) {
    const vectorHit = vectorSearchResult.hits.get(candidate.id);

    if (!vectorHit) {
      continue;
    }

    const existing = recallById.get(candidate.id);

    if (existing) {
      existing.scoreBreakdown.embedding = vectorHit.score;
      existing.score += vectorHit.score;
      existing.preRerankScore = existing.score;
      existing.vectorSimilarity = vectorHit.similarity;
      existing.retrievalSignals = createUniqueList([...existing.retrievalSignals, 'vector']) as Array<'lexical' | 'vector'>;
      existing.retrievalHitOrigin = existing.retrievalSignals.length >= 2 ? 'hybrid' : 'vector_only';
      continue;
    }

    recallById.set(
      candidate.id,
      createMemoryRetrievedChunk(candidate, {
        score: vectorHit.score,
        matchedTerms: [],
        matchedEntityNames: [],
        matchedLocations: [],
        scoreBreakdown: {
          ...createEmptyScoreBreakdown(),
          embedding: vectorHit.score,
        },
        retrievalSignals: ['vector'],
        vectorSimilarity: vectorHit.similarity,
      }),
    );
  }

  const recalledCandidates = Array.from(recallById.values()).filter((item) => hasAnyRetrievalSignal(item));
  const diagnostics = {
    candidateCount: recalledCandidates.length,
    lexicalOnlyCount: recalledCandidates.filter((item) => item.retrievalHitOrigin === 'lexical_only').length,
    vectorOnlyCount: recalledCandidates.filter((item) => item.retrievalHitOrigin === 'vector_only').length,
    hybridCount: recalledCandidates.filter((item) => item.retrievalHitOrigin === 'hybrid').length,
  };

  return {
    candidates: recalledCandidates.sort(compareRetrievedItems),
    vectorSearch: vectorSearchResult.diagnostics,
    diagnostics,
  } satisfies RetrievalHybridRecallPhaseResult;
}

function buildDormantForeshadowCandidates(
  env: ServerEnv,
  request: GenerationMemoryRetrievalRequest,
  queryPhrases: string[],
  focusEntityNames: string[],
  lightweightRecallConfig: LightweightRecallConfig,
) {
  return listGenerationForeshadows(env, request.projectId)
    .map((row) => ({
      row,
      lifecycle: deriveGenerationForeshadowLifecycle(row, request.chapterOrder ?? null),
    }))
    .filter((item) => item.lifecycle === 'dormant')
    .map(({ row }) => {
      const textParts = [row.title, row.excerpt, row.notes, row.sourceChapterTitle, row.resolvedChapterTitle];
      const matchedTerms = collectMatchedTerms(textParts, queryPhrases);
      const matchedEntityNames = collectMatchedTerms(textParts, focusEntityNames);
      const scoreBreakdown = {
        ...createEmptyScoreBreakdown(),
        phrase: matchedTerms.length * lightweightRecallConfig.phraseWeight,
        entity: matchedEntityNames.length * lightweightRecallConfig.entityWeight,
        recency: calculateRecencyScore(request.chapterOrder, row.sourceChapterOrder) * lightweightRecallConfig.recencyWeight,
      };
      const summaryExcerpt = truncateText(row.excerpt || row.notes || '暂无说明', 140);
      const item: GenerationRetrievedChunk = {
        id: `foreshadow:${row.id}`,
        sourceType: 'dormant_foreshadow',
        title: row.title,
        chapterId: row.sourceChapterId ?? row.id,
        chapterTitle: row.sourceChapterTitle || row.title,
        chapterOrder: row.sourceChapterOrder,
        volumeTitle: '',
        chunkKind: 'recall',
        sourceKind: 'dormant_foreshadow',
        chunkIndex: 0,
        timeAnchor: '',
        summaryExcerpt,
        entityRefs: [],
        locations: [],
        score: scoreBreakdown.phrase + scoreBreakdown.entity + scoreBreakdown.recency,
        matchedTerms,
        matchedEntityNames,
        matchedLocations: [],
        contentExcerpt: row.resolvedChapterTitle ? `回收指向：${row.resolvedChapterTitle}` : '',
        updatedAt: row.updatedAt,
        block: '',
        retrievalHitOrigin: 'lexical_only',
        retrievalSignals: ['lexical'],
        vectorSimilarity: null,
        preRerankScore: scoreBreakdown.phrase + scoreBreakdown.entity + scoreBreakdown.recency,
        rerankDelta: 0,
        rerankReasons: [],
        mergedCandidateCount: 1,
        scoreBreakdown,
      };

      return {
        ...item,
        block: buildRetrievedChunkBlock(item),
      };
    })
    .filter((item) => item.score >= lightweightRecallConfig.minScore)
    .sort(compareRetrievedItems);
}

function buildVolumeRecapCandidates(
  env: ServerEnv,
  request: GenerationMemoryRetrievalRequest,
  queryPhrases: string[],
  focusEntityNames: string[],
  lightweightRecallConfig: LightweightRecallConfig,
) {
  const normalizedCurrentVolume = normalizeText(request.volumeTitle);

  return listGenerationVolumeRecaps(env, request.projectId)
    .filter((row) => normalizeText(row.volumeTitle) !== normalizedCurrentVolume)
    .filter((row) => {
      if (!request.chapterOrder || request.chapterOrder <= 0) {
        return true;
      }

      return row.endChapterOrder > 0 && row.endChapterOrder < request.chapterOrder;
    })
    .map((row) => {
      const textParts = [row.volumeTitle, row.summary, ...row.highlights];
      const matchedTerms = collectMatchedTerms(textParts, queryPhrases);
      const matchedEntityNames = collectMatchedTerms(textParts, focusEntityNames);
      const scoreBreakdown = {
        ...createEmptyScoreBreakdown(),
        phrase: matchedTerms.length * lightweightRecallConfig.phraseWeight,
        entity: matchedEntityNames.length * lightweightRecallConfig.entityWeight,
        recency: calculateRecencyScore(request.chapterOrder, row.endChapterOrder) * lightweightRecallConfig.recencyWeight,
      };
      const range =
        row.startChapterOrder > 0 && row.endChapterOrder > 0
          ? `范围：第${row.startChapterOrder}-${row.endChapterOrder}章`
          : `范围：累计 ${row.chapterCount} 章`;
      const highlightLine = row.highlights.length > 0 ? `高亮：${row.highlights.slice(0, 3).join('；')}` : '';
      const item: GenerationRetrievedChunk = {
        id: `volume_recap:${row.volumeTitle}`,
        sourceType: 'volume_recap',
        title: row.volumeTitle,
        chapterId: row.endChapterId,
        chapterTitle: row.volumeTitle,
        chapterOrder: row.endChapterOrder,
        volumeTitle: row.volumeTitle,
        chunkKind: 'recall',
        sourceKind: 'volume_recap',
        chunkIndex: 0,
        timeAnchor: '',
        summaryExcerpt: truncateText(row.summary, 140),
        entityRefs: [],
        locations: [],
        score: scoreBreakdown.phrase + scoreBreakdown.entity + scoreBreakdown.recency,
        matchedTerms,
        matchedEntityNames,
        matchedLocations: [],
        contentExcerpt: [range, highlightLine].filter(Boolean).join('\n'),
        updatedAt: row.updatedAt,
        block: '',
        retrievalHitOrigin: 'lexical_only',
        retrievalSignals: ['lexical'],
        vectorSimilarity: null,
        preRerankScore: scoreBreakdown.phrase + scoreBreakdown.entity + scoreBreakdown.recency,
        rerankDelta: 0,
        rerankReasons: [],
        mergedCandidateCount: 1,
        scoreBreakdown,
      };

      return {
        ...item,
        block: buildRetrievedChunkBlock(item),
      };
    })
    .filter((item) => item.score >= lightweightRecallConfig.minScore)
    .sort(compareRetrievedItems);
}

function buildQueryEmbeddingText(request: GenerationMemoryRetrievalRequest) {
  return createUniqueList([
    ...(request.queryPhrases ?? []),
    ...(request.focusEntityNames ?? []),
    request.volumeTitle ?? '',
  ]).join('\n');
}

function pickPreferredChunk(
  left: GenerationRetrievedChunk & { content: string },
  right: GenerationRetrievedChunk & { content: string },
) {
  if (left.score !== right.score) {
    return left.score > right.score ? left : right;
  }

  if (left.chapterOrder !== right.chapterOrder) {
    return left.chapterOrder > right.chapterOrder ? left : right;
  }

  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt.localeCompare(right.updatedAt) >= 0 ? left : right;
  }

  return left.chunkIndex <= right.chunkIndex ? left : right;
}

function mergeChunkSignals(
  preferred: GenerationRetrievedChunk & { content: string },
  fallback: GenerationRetrievedChunk & { content: string },
) {
  const mergedTerms = createUniqueList([...preferred.matchedTerms, ...fallback.matchedTerms]);
  const mergedEntities = createUniqueList([...preferred.matchedEntityNames, ...fallback.matchedEntityNames]);
  const mergedLocations = createUniqueList([...preferred.matchedLocations, ...fallback.matchedLocations]);
  const mergedSignals = createUniqueList([...preferred.retrievalSignals, ...fallback.retrievalSignals]) as Array<'lexical' | 'vector'>;
  const mergedContentExcerpt =
    preferred.contentExcerpt === fallback.contentExcerpt
      ? preferred.contentExcerpt
      : `${preferred.contentExcerpt}\n...\n${fallback.contentExcerpt}`.slice(0, 260);
  const mergedVectorSimilarity = Math.max(preferred.vectorSimilarity ?? 0, fallback.vectorSimilarity ?? 0) || null;

  return {
    ...preferred,
    matchedTerms: mergedTerms,
    matchedEntityNames: mergedEntities,
    matchedLocations: mergedLocations,
    retrievalSignals: mergedSignals,
    retrievalHitOrigin:
      mergedSignals.length >= 2 ? 'hybrid' : mergedSignals[0] === 'vector' ? 'vector_only' : 'lexical_only',
    vectorSimilarity: mergedVectorSimilarity,
    mergedCandidateCount: preferred.mergedCandidateCount + fallback.mergedCandidateCount,
    contentExcerpt: mergedContentExcerpt,
  };
}

function buildChapterEventDedupSignature(item: GenerationRetrievedChunk & { content: string }) {
  const summaryKey = normalizeText(item.summaryExcerpt).slice(0, 80);
  const contentKey = normalizeText(item.contentExcerpt).slice(0, 80);
  const anchorKey = normalizeText(item.timeAnchor).slice(0, 32);
  const entityKey = createUniqueList(
    [...item.matchedEntityNames, ...item.entityRefs]
      .map((name) => normalizeText(name))
      .filter(Boolean),
  )
    .slice(0, 4)
    .join('|');
  const termKey = createUniqueList(item.matchedTerms.map((term) => normalizeText(term)).filter(Boolean))
    .slice(0, 3)
    .join('|');

  return [item.chapterId, summaryKey || contentKey, anchorKey, entityKey || termKey].join('#');
}

function buildChunkDedupSignature(item: GenerationRetrievedChunk & { content: string }) {
  const summaryKey = normalizeText(item.summaryExcerpt).slice(0, 80);
  const contentKey = normalizeText(item.contentExcerpt).slice(0, 80);
  const anchorKey = normalizeText(item.timeAnchor).slice(0, 32);
  const entityKey = createUniqueList(
    [...item.matchedEntityNames, ...item.entityRefs]
      .map((name) => normalizeText(name))
      .filter(Boolean),
  )
    .slice(0, 4)
    .join('|');
  const termKey = createUniqueList(item.matchedTerms.map((term) => normalizeText(term)).filter(Boolean))
    .slice(0, 3)
    .join('|');

  return [summaryKey || contentKey, anchorKey, entityKey || termKey].join('#');
}

function mergeDuplicateChunks(items: Array<GenerationRetrievedChunk & { content: string }>) {
  const stableItems = [...items].sort(compareRetrievedItems);
  const mergedByChapterEvent = new Map<string, GenerationRetrievedChunk & { content: string }>();

  for (const item of stableItems) {
    const signature = buildChapterEventDedupSignature(item);
    const existing = mergedByChapterEvent.get(signature);

    if (!existing) {
      mergedByChapterEvent.set(signature, item);
      continue;
    }

    const preferred = pickPreferredChunk(item, existing);
    const fallback = preferred === item ? existing : item;

    mergedByChapterEvent.set(signature, mergeChunkSignals(preferred, fallback));
  }

  const mergedBySignature = new Map<string, GenerationRetrievedChunk & { content: string }>();

  for (const item of mergedByChapterEvent.values()) {
    const signature = buildChunkDedupSignature(item);
    const existing = mergedBySignature.get(signature);

    if (!existing) {
      mergedBySignature.set(signature, item);
      continue;
    }

    const preferred = pickPreferredChunk(item, existing);
    const fallback = preferred === item ? existing : item;
    mergedBySignature.set(signature, mergeChunkSignals(preferred, fallback));
  }

  const mergedItems = Array.from(mergedBySignature.values()).sort(compareRetrievedItems);

  return {
    items: mergedItems,
    mergedAwayCandidates: Math.max(0, items.length - mergedItems.length),
  };
}

function applyDynamicSelection(
  items: Array<GenerationRetrievedChunk & { content: string }>,
  limit: number,
) {
  if (items.length === 0) {
    return {
      candidates: [] as Array<GenerationRetrievedChunk & { content: string }>,
      diagnostics: {
        inputCandidates: 0,
        selectedCandidates: 0,
        thresholdSelectedCandidates: 0,
        rescuedVectorOnlyCandidates: 0,
        droppedBelowThresholdCandidates: 0,
        droppedByLimitCandidates: 0,
        limit,
        topScore: null,
        dynamicThreshold: null,
        rescuedVectorOnlyChunkIds: [],
        droppedVectorOnlyChunkIds: [],
      },
    } satisfies RetrievalSelectionPhaseResult;
  }

  const topScore = items[0].score;
  const topHasVectorSignal = items[0].scoreBreakdown.embedding >= DEFAULT_VECTOR_MIN_SCORE;

  if (topScore < 10 && !topHasVectorSignal) {
    return {
      candidates: [] as Array<GenerationRetrievedChunk & { content: string }>,
      diagnostics: {
        inputCandidates: items.length,
        selectedCandidates: 0,
        thresholdSelectedCandidates: 0,
        rescuedVectorOnlyCandidates: 0,
        droppedBelowThresholdCandidates: items.length,
        droppedByLimitCandidates: 0,
        limit,
        topScore,
        dynamicThreshold: null,
        rescuedVectorOnlyChunkIds: [],
        droppedVectorOnlyChunkIds: items
          .filter((item) => item.retrievalHitOrigin === 'vector_only')
          .map((item) => item.id),
      },
    } satisfies RetrievalSelectionPhaseResult;
  }

  const dynamicThreshold = topHasVectorSignal
    ? Math.max(DEFAULT_VECTOR_MIN_SCORE, Math.ceil(topScore * 0.45))
    : Math.max(10, Math.ceil(topScore * 0.45));
  const thresholdSelected: Array<GenerationRetrievedChunk & { content: string }> = [];
  const droppedBelowThreshold = items.filter((item) => item.score < dynamicThreshold);

  for (const item of items) {
    if (item.score < dynamicThreshold) {
      continue;
    }

    thresholdSelected.push(item);

    if (thresholdSelected.length >= limit) {
      break;
    }
  }

  const selected = [...thresholdSelected];
  const rescuedVectorOnlyChunkIds: string[] = [];

  const strongestVectorOnlyCandidate = items.find(
    (item) =>
      item.retrievalHitOrigin === 'vector_only'
      && item.scoreBreakdown.embedding >= DEFAULT_VECTOR_MIN_SCORE
      && (item.vectorSimilarity ?? 0) >= DEFAULT_VECTOR_MIN_SIMILARITY,
  );
  const hasVectorOnlySelected = selected.some((item) => item.retrievalHitOrigin === 'vector_only');

  if (
    strongestVectorOnlyCandidate
    && !hasVectorOnlySelected
    && !selected.some((item) => item.id === strongestVectorOnlyCandidate.id)
    && selected.length < limit
  ) {
    selected.push(strongestVectorOnlyCandidate);
    rescuedVectorOnlyChunkIds.push(strongestVectorOnlyCandidate.id);
  }

  if (selected.length === 0) {
    return {
      candidates: [] as Array<GenerationRetrievedChunk & { content: string }>,
      diagnostics: {
        inputCandidates: items.length,
        selectedCandidates: 0,
        thresholdSelectedCandidates: thresholdSelected.length,
        rescuedVectorOnlyCandidates: rescuedVectorOnlyChunkIds.length,
        droppedBelowThresholdCandidates: droppedBelowThreshold.length,
        droppedByLimitCandidates: Math.max(0, items.length - thresholdSelected.length - droppedBelowThreshold.length),
        limit,
        topScore,
        dynamicThreshold,
        rescuedVectorOnlyChunkIds,
        droppedVectorOnlyChunkIds: items
          .filter((item) => item.retrievalHitOrigin === 'vector_only')
          .filter((item) => !selected.some((selectedItem) => selectedItem.id === item.id))
          .map((item) => item.id),
      },
    } satisfies RetrievalSelectionPhaseResult;
  }

  const droppedVectorOnlyChunkIds = items
    .filter((item) => item.retrievalHitOrigin === 'vector_only')
    .filter((item) => !selected.some((selectedItem) => selectedItem.id === item.id))
    .map((item) => item.id);

  return {
    candidates: selected,
    diagnostics: {
      inputCandidates: items.length,
      selectedCandidates: selected.length,
      thresholdSelectedCandidates: thresholdSelected.length,
      rescuedVectorOnlyCandidates: rescuedVectorOnlyChunkIds.length,
      droppedBelowThresholdCandidates: droppedBelowThreshold.length,
      droppedByLimitCandidates: Math.max(0, items.length - thresholdSelected.length - droppedBelowThreshold.length),
      limit,
      topScore,
      dynamicThreshold,
      rescuedVectorOnlyChunkIds,
      droppedVectorOnlyChunkIds,
    },
  } satisfies RetrievalSelectionPhaseResult;
}

function getChapterDistance(currentChapterOrder: number | undefined, candidateChapterOrder: number) {
  if (!currentChapterOrder || currentChapterOrder <= 0 || candidateChapterOrder <= 0) {
    return null;
  }

  return currentChapterOrder - candidateChapterOrder;
}

function applyExplicitRerank(
  items: Array<GenerationRetrievedChunk & { content: string }>,
  request: GenerationMemoryRetrievalRequest,
) {
  return items
    .map((item) => {
      const chapterDistance = getChapterDistance(request.chapterOrder, item.chapterOrder);
      const hasPhraseOrLocation = item.scoreBreakdown.phrase > 0 || item.scoreBreakdown.location > 0;
      const hasEmbeddingSupport = item.scoreBreakdown.embedding >= 6;
      const entityOnlySignal = item.scoreBreakdown.entity > 0 && !hasPhraseOrLocation && item.scoreBreakdown.embedding <= 0;
      let rerankDelta = 0;
      const rerankReasons: string[] = [];

      if (chapterDistance !== null) {
        if (chapterDistance <= 6) {
          rerankDelta += 6;
          rerankReasons.push('近邻章节 +6');
        } else if (chapterDistance <= 12) {
          rerankDelta += 4;
          rerankReasons.push('近邻章节 +4');
        } else if (chapterDistance <= 24) {
          rerankDelta += 2;
          rerankReasons.push('中近距章节 +2');
        } else if (chapterDistance > 96) {
          rerankDelta -= 2;
          rerankReasons.push('超远距章节 -2');
        }
      }

      if (hasPhraseOrLocation) {
        rerankDelta += 2;
        rerankReasons.push('phrase/location 强信号 +2');
      }

      if (hasEmbeddingSupport) {
        rerankDelta += 1;
        rerankReasons.push('vector 支持 +1');
      }

      if (item.scoreBreakdown.sameVolume > 0 && chapterDistance !== null && chapterDistance <= 48) {
        rerankDelta += 1;
        rerankReasons.push('同卷近距 +1');
      }

      // 远距离且只有实体命中的旧切片，降权避免挤占近邻强相关结果。
      if (entityOnlySignal && chapterDistance !== null && chapterDistance > 24) {
        rerankDelta -= 4;
        rerankReasons.push('远距仅实体命中 -4');
      }

      if (entityOnlySignal && chapterDistance !== null && chapterDistance > 60) {
        rerankDelta -= 4;
        rerankReasons.push('超远距仅实体命中 -4');
      }

      if (!hasPhraseOrLocation && !hasEmbeddingSupport && chapterDistance !== null && chapterDistance > 96) {
        rerankDelta -= 2;
        rerankReasons.push('远距弱信号 -2');
      }

      return {
        ...item,
        preRerankScore: item.score,
        score: Math.max(0, item.score + rerankDelta),
        rerankDelta,
        rerankReasons,
      };
    })
    .sort((left, right) => {
      const leftStrong = left.scoreBreakdown.phrase > 0 || left.scoreBreakdown.location > 0 || left.scoreBreakdown.embedding >= 6;
      const rightStrong =
        right.scoreBreakdown.phrase > 0 || right.scoreBreakdown.location > 0 || right.scoreBreakdown.embedding >= 6;

      if (leftStrong !== rightStrong) {
        return leftStrong ? -1 : 1;
      }

      return compareRetrievedItems(left, right);
    });
}

function runDedupeAndRerankPhase(
  candidates: Array<GenerationRetrievedChunk & { content: string }>,
  request: GenerationMemoryRetrievalRequest,
) {
  const deduped = mergeDuplicateChunks(candidates);
  const reranked = applyExplicitRerank(deduped.items, request);

  return {
    candidates: reranked,
    diagnostics: {
      inputCandidates: candidates.length,
      dedupedCandidates: deduped.items.length,
      mergedAwayCandidates: deduped.mergedAwayCandidates,
    },
  } satisfies RetrievalDedupeRerankPhaseResult;
}

function hasLexicalRetrievalSignal(item: GenerationRetrievedChunk) {
  return (
    item.scoreBreakdown.phrase > 0 ||
    item.scoreBreakdown.entity > 0 ||
    item.scoreBreakdown.location > 0
  );
}

function hasAnyRetrievalSignal(item: GenerationRetrievedChunk) {
  return hasLexicalRetrievalSignal(item) || item.scoreBreakdown.embedding > 0;
}

export async function retrieveGenerationMemory(
  env: ServerEnv,
  request: GenerationMemoryRetrievalRequest,
): Promise<GenerationMemoryRetrievalResult> {
  const queryPhrases = buildQueryPhrases(request);
  const focusEntityNames = buildFocusEntityNames(request);
  const metadataPrefilterContext = buildMemoryMetadataPrefilterContext(
    env,
    request,
    queryPhrases,
    focusEntityNames,
  );

  if (queryPhrases.length === 0 && focusEntityNames.length === 0) {
    return {
      items: [] as GenerationRetrievedChunk[],
      vectorSearch: {
        status: 'disabled',
        candidatePoolSize: 0,
        matchedCandidateCount: 0,
        topK: 0,
        minScore: 0,
        minSimilarity: 0,
        fallbackReason: '缺少 query phrases 与 focus entities，当前未触发检索。',
      },
      pipeline: {
        metadataFilter: {
          inputCandidates: 0,
          outputCandidates: 0,
          filteredOutCandidates: 0,
        },
        hybridRecall: {
          candidateCount: 0,
          lexicalOnlyCount: 0,
          vectorOnlyCount: 0,
          hybridCount: 0,
        },
        dedupeRerank: {
          inputCandidates: 0,
          dedupedCandidates: 0,
          mergedAwayCandidates: 0,
        },
        selection: {
          inputCandidates: 0,
          selectedCandidates: 0,
          limit: Math.max(1, Math.min(12, Math.trunc(request.limit ?? 8))),
          topScore: null,
          dynamicThreshold: null,
        },
      },
    };
  }

  const db = getGenerationDatabase(env);
  const candidates = db
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
          entity_refs_json,
          locations_json,
          content,
          updated_at
        FROM generation_memory_chunks
        WHERE project_id = ?
        ORDER BY chapter_order DESC, chunk_kind ASC, chunk_index ASC
        LIMIT 240
      `,
    )
    .all(request.projectId) as Array<Record<string, unknown>>;

  const metadataFilterPhase = runMetadataFilterPhase(
    candidates.map(mapCandidateRow),
    request,
    metadataPrefilterContext,
  );
  const hybridRecallPhase = await runHybridRecallPhase(
    env,
    request,
    metadataFilterPhase.candidates,
    queryPhrases,
    focusEntityNames,
  );
  const dedupeRerankPhase = runDedupeAndRerankPhase(
    hybridRecallPhase.candidates,
    request,
  );
  const selectionPhase = applyDynamicSelection(
    dedupeRerankPhase.candidates,
    Math.max(1, Math.min(12, Math.trunc(request.limit ?? 8))),
  );

  const lightweightRecallConfig = resolveLightweightRecallConfig(env, request.lightweightRecallConfig);
  const lightweightCandidates = [
    ...buildDormantForeshadowCandidates(env, request, queryPhrases, focusEntityNames, lightweightRecallConfig),
    ...buildVolumeRecapCandidates(env, request, queryPhrases, focusEntityNames, lightweightRecallConfig),
  ]
    .sort(compareRetrievedItems)
    .slice(0, Math.max(0, lightweightRecallConfig.topK));

  const items = [...selectionPhase.candidates, ...lightweightCandidates]
    .sort(compareRetrievedItems)
    .map((item) => {
      const normalizedItem = item as GenerationRetrievedChunk & { content?: string };

      return {
        id: normalizedItem.id,
        sourceType: normalizedItem.sourceType,
        title: normalizedItem.title,
        chapterId: normalizedItem.chapterId,
        chapterTitle: normalizedItem.chapterTitle,
        chapterOrder: normalizedItem.chapterOrder,
        volumeTitle: normalizedItem.volumeTitle,
        chunkKind: normalizedItem.chunkKind,
        sourceKind: normalizedItem.sourceKind,
        chunkIndex: normalizedItem.chunkIndex,
        timeAnchor: normalizedItem.timeAnchor,
        summaryExcerpt: normalizedItem.summaryExcerpt,
        entityRefs: normalizedItem.entityRefs,
        locations: normalizedItem.locations,
        score: normalizedItem.score,
        matchedTerms: normalizedItem.matchedTerms,
        matchedEntityNames: normalizedItem.matchedEntityNames,
        matchedLocations: normalizedItem.matchedLocations,
        contentExcerpt: normalizedItem.contentExcerpt,
        updatedAt: normalizedItem.updatedAt,
        block: normalizedItem.block || buildRetrievedChunkBlock(normalizedItem),
        retrievalHitOrigin: normalizedItem.retrievalHitOrigin,
        retrievalSignals: normalizedItem.retrievalSignals,
        vectorSimilarity: normalizedItem.vectorSimilarity,
        preRerankScore: normalizedItem.preRerankScore,
        rerankDelta: normalizedItem.rerankDelta,
        rerankReasons: normalizedItem.rerankReasons,
        mergedCandidateCount: normalizedItem.mergedCandidateCount,
        scoreBreakdown: normalizedItem.scoreBreakdown,
      } satisfies GenerationRetrievedChunk;
    });

  return {
    items,
    vectorSearch: hybridRecallPhase.vectorSearch,
    pipeline: {
      metadataFilter: metadataFilterPhase.diagnostics,
      hybridRecall: hybridRecallPhase.diagnostics,
      dedupeRerank: dedupeRerankPhase.diagnostics,
      selection: selectionPhase.diagnostics,
    },
  };
}

export async function retrieveGenerationMemoryChunks(
  env: ServerEnv,
  request: GenerationMemoryRetrievalRequest,
) {
  const result = await retrieveGenerationMemory(env, request);
  return result.items;
}
