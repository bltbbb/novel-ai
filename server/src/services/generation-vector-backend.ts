import type { ServerEnv } from '../config/env.js';
import type {
  GenerationVectorBackendKind,
  GenerationVectorBackendStatus,
} from '../types/ai.js';
import {
  createGenerationQueryEmbedding,
  ensureGenerationMemoryEmbeddings,
} from './generation-embedding-store.js';
import { queryGenerationSqliteVecIndex } from './generation-sqlite-vec-store.js';

interface GenerationVectorSearchCandidate {
  chunkId: string;
  projectId: string;
  chapterId: string;
  content: string;
}

export interface GenerationVectorScoreHit {
  chunkId: string;
  similarity: number;
  score: number;
  backendKind: GenerationVectorBackendKind;
}

export interface GenerationVectorSearchDiagnostics {
  status: 'active' | 'disabled' | 'failed';
  source: 'sqlite_vec' | 'json_cache' | 'none';
  candidatePoolSize: number;
  matchedCandidateCount: number;
  topK: number;
  minScore: number;
  minSimilarity: number;
  fallbackReason: string | null;
}

export interface GenerationVectorSearchResult {
  hits: Map<string, GenerationVectorScoreHit>;
  diagnostics: GenerationVectorSearchDiagnostics;
}

export interface GenerationVectorCandidateDiagnosticItem {
  chunkId: string;
  similarity: number | null;
  score: number | null;
  passedMinSimilarity: boolean;
  passedMinScore: boolean;
}

export interface GenerationVectorCandidateDiagnosticsResult {
  status: 'active' | 'disabled' | 'failed';
  minScore: number;
  minSimilarity: number;
  topK: number;
  candidatePoolSize: number;
  fallbackReason: string | null;
  items: GenerationVectorCandidateDiagnosticItem[];
  selectedHitChunkIds: string[];
}

export const DEFAULT_VECTOR_CANDIDATE_POOL_LIMIT = 96;
export const DEFAULT_VECTOR_TOP_K = 18;
export const DEFAULT_VECTOR_MIN_SCORE = 6;
export const DEFAULT_VECTOR_MIN_SIMILARITY = 0.22;

function cosineSimilarity(left: number[], right: number[]) {
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

function isVectorBackendImplemented(backendKind: GenerationVectorBackendKind) {
  return backendKind === 'json_cache' || backendKind === 'sqlite_vec';
}

export function getGenerationVectorBackendStatus(env: ServerEnv): GenerationVectorBackendStatus {
  const configuredBackend = env.generationVectorBackend;
  const embeddingModel = env.openaiEmbeddingModel?.trim() || null;
  const isVectorEnabled = Boolean(embeddingModel);

  if (isVectorBackendImplemented(configuredBackend)) {
    return {
      configuredBackend,
      activeBackend: configuredBackend,
      embeddingModel,
      isVectorEnabled,
      supportsIndexedSearch: configuredBackend === 'sqlite_vec',
      fallbackReason: null,
    };
  }

  return {
    configuredBackend,
    activeBackend: configuredBackend,
    embeddingModel,
    isVectorEnabled,
    supportsIndexedSearch: configuredBackend === 'sqlite_vec',
    fallbackReason: null,
  };
}

async function scoreWithJsonCacheBackend(
  env: ServerEnv,
  queryText: string,
  candidates: GenerationVectorSearchCandidate[],
) {
  const result = new Map<string, GenerationVectorScoreHit>();

  if (!queryText.trim() || candidates.length === 0) {
    return result;
  }

  const queryVector = await createGenerationQueryEmbedding(env, queryText);

  if (!queryVector || queryVector.length === 0) {
    return result;
  }

  const embeddingMap = await ensureGenerationMemoryEmbeddings(env, candidates);

  for (const candidate of candidates) {
    const chunkVector = embeddingMap.get(candidate.chunkId);

    if (!chunkVector || chunkVector.length === 0) {
      continue;
    }

    const similarity = cosineSimilarity(queryVector, chunkVector);

    if (similarity <= 0) {
      continue;
    }

    result.set(candidate.chunkId, {
      chunkId: candidate.chunkId,
      similarity,
      score: Math.max(0, Math.round(similarity * 20)),
      backendKind: 'json_cache',
    });
  }

  return result;
}

export async function findGenerationVectorCandidates(
  env: ServerEnv,
  input: {
    queryText: string;
    candidates: GenerationVectorSearchCandidate[];
    candidatePoolLimit?: number;
    topK?: number;
    minScore?: number;
    minSimilarity?: number;
  },
): Promise<GenerationVectorSearchResult> {
  const status = getGenerationVectorBackendStatus(env);
  const candidatePoolLimit = Math.max(1, Math.trunc(input.candidatePoolLimit ?? DEFAULT_VECTOR_CANDIDATE_POOL_LIMIT));
  const topK = Math.max(1, Math.trunc(input.topK ?? DEFAULT_VECTOR_TOP_K));
  const minScore = Math.max(0, Math.trunc(input.minScore ?? DEFAULT_VECTOR_MIN_SCORE));
  const minSimilarity = Math.max(0, Math.min(1, input.minSimilarity ?? DEFAULT_VECTOR_MIN_SIMILARITY));
  const candidatePool = input.candidates.slice(0, candidatePoolLimit);

  if (!status.isVectorEnabled || !input.queryText.trim() || candidatePool.length === 0) {
    return {
      hits: new Map<string, GenerationVectorScoreHit>(),
      diagnostics: {
        status: 'disabled',
        source: 'none',
        candidatePoolSize: candidatePool.length,
        matchedCandidateCount: 0,
        topK,
        minScore,
        minSimilarity,
        fallbackReason: !status.isVectorEnabled
          ? '当前未启用 embedding 模型，向量通道已回退到 lexical 旧路径。'
          : null,
      },
    };
  }

  try {
    let rawHits = new Map<string, GenerationVectorScoreHit>();
    let source: GenerationVectorSearchDiagnostics['source'] = 'none';

    switch (status.activeBackend) {
      case 'json_cache':
        rawHits = await scoreWithJsonCacheBackend(env, input.queryText, candidatePool);
        source = 'json_cache';
        break;
      case 'sqlite_vec':
      {
        const queryVector = await createGenerationQueryEmbedding(env, input.queryText);

        if (!queryVector || queryVector.length === 0) {
          return {
            hits: new Map<string, GenerationVectorScoreHit>(),
            diagnostics: {
              status: 'failed',
              source: 'none',
              candidatePoolSize: candidatePool.length,
              matchedCandidateCount: 0,
              topK,
              minScore,
              minSimilarity,
              fallbackReason: 'query 向量生成失败，当前已回退到 json_cache。',
            },
          };
        }

        const sqliteVecResult = await queryGenerationSqliteVecIndex(env, {
          projectId: input.candidates[0]?.projectId ?? '',
          queryVector,
          topK,
          minScore,
          minSimilarity,
        });

        if (sqliteVecResult.status === 'active' && sqliteVecResult.hits.length > 0) {
          rawHits = new Map(
            sqliteVecResult.hits.map((item) => [
              item.chunkId,
              {
                chunkId: item.chunkId,
                similarity: item.similarity,
                score: item.score,
                backendKind: 'sqlite_vec' as const,
              },
            ]),
          );
          source = 'sqlite_vec';
          break;
        }

        rawHits = await scoreWithJsonCacheBackend(env, input.queryText, candidatePool);
        source = 'json_cache';

        const fallbackReason =
          sqliteVecResult.status === 'failed' || sqliteVecResult.status === 'disabled'
            ? sqliteVecResult.fallbackReason || 'sqlite-vec 未返回命中，已回退到 json_cache。'
            : sqliteVecResult.hits.length === 0
              ? 'sqlite-vec 未命中，已回退到 json_cache。'
              : null;

        const filteredHits = Array.from(rawHits.values())
          .filter((item) => item.score >= minScore && item.similarity >= minSimilarity)
          .sort((left, right) => {
            if (left.score !== right.score) {
              return right.score - left.score;
            }

            return right.similarity - left.similarity;
          })
          .slice(0, topK);

        return {
          hits: new Map(filteredHits.map((item) => [item.chunkId, item])),
          diagnostics: {
            status: 'active',
            source,
            candidatePoolSize: candidatePool.length,
            matchedCandidateCount: filteredHits.length,
            topK,
            minScore,
            minSimilarity,
            fallbackReason,
          },
        };
      }
        break;
      default:
        rawHits = new Map<string, GenerationVectorScoreHit>();
        source = 'none';
        break;
    }

    const filteredHits = Array.from(rawHits.values())
      .filter((item) => item.score >= minScore && item.similarity >= minSimilarity)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }

        return right.similarity - left.similarity;
      })
      .slice(0, topK);

    return {
      hits: new Map(filteredHits.map((item) => [item.chunkId, item])),
      diagnostics: {
        status: 'active',
        source,
        candidatePoolSize: candidatePool.length,
        matchedCandidateCount: filteredHits.length,
        topK,
        minScore,
        minSimilarity,
        fallbackReason: status.fallbackReason,
      },
    };
  } catch {
    return {
      hits: new Map<string, GenerationVectorScoreHit>(),
      diagnostics: {
        status: 'failed',
        source: 'none',
        candidatePoolSize: candidatePool.length,
        matchedCandidateCount: 0,
        topK,
        minScore,
        minSimilarity,
        fallbackReason: '向量候选召回执行失败，当前已自动回退到 lexical 旧路径。',
      },
    };
  }
}

export async function scoreGenerationVectorCandidates(
  env: ServerEnv,
  input: {
    queryText: string;
    candidates: GenerationVectorSearchCandidate[];
  },
) {
  const result = await findGenerationVectorCandidates(env, input);
  return result.hits;
}

export async function diagnoseGenerationVectorCandidates(
  env: ServerEnv,
  input: {
    queryText: string;
    candidates: GenerationVectorSearchCandidate[];
    candidatePoolLimit?: number;
    topK?: number;
    minScore?: number;
    minSimilarity?: number;
  },
): Promise<GenerationVectorCandidateDiagnosticsResult> {
  const status = getGenerationVectorBackendStatus(env);
  const candidatePoolLimit = Math.max(1, Math.trunc(input.candidatePoolLimit ?? DEFAULT_VECTOR_CANDIDATE_POOL_LIMIT));
  const topK = Math.max(1, Math.trunc(input.topK ?? DEFAULT_VECTOR_TOP_K));
  const minScore = Math.max(0, Math.trunc(input.minScore ?? DEFAULT_VECTOR_MIN_SCORE));
  const minSimilarity = Math.max(0, Math.min(1, input.minSimilarity ?? DEFAULT_VECTOR_MIN_SIMILARITY));
  const candidatePool = input.candidates.slice(0, candidatePoolLimit);

  if (!status.isVectorEnabled || !input.queryText.trim() || candidatePool.length === 0) {
    return {
      status: 'disabled',
      minScore,
      minSimilarity,
      topK,
      candidatePoolSize: candidatePool.length,
      fallbackReason: !status.isVectorEnabled
        ? '当前未启用 embedding 模型，向量通道已回退到 lexical 旧路径。'
        : null,
      items: [],
      selectedHitChunkIds: [],
    };
  }

  try {
    const queryVector = await createGenerationQueryEmbedding(env, input.queryText);

    if (!queryVector || queryVector.length === 0) {
      return {
        status: 'failed',
        minScore,
        minSimilarity,
        topK,
        candidatePoolSize: candidatePool.length,
        fallbackReason: '向量查询向量生成失败，当前无法产出候选级诊断。',
        items: [],
        selectedHitChunkIds: [],
      };
    }

    const embeddingMap = await ensureGenerationMemoryEmbeddings(env, candidatePool);
    const items = candidatePool.map((candidate): GenerationVectorCandidateDiagnosticItem => {
      const chunkVector = embeddingMap.get(candidate.chunkId);

      if (!chunkVector || chunkVector.length === 0) {
        return {
          chunkId: candidate.chunkId,
          similarity: null,
          score: null,
          passedMinSimilarity: false,
          passedMinScore: false,
        };
      }

      const similarity = cosineSimilarity(queryVector, chunkVector);
      const score = similarity > 0 ? Math.max(0, Math.round(similarity * 20)) : 0;

      return {
        chunkId: candidate.chunkId,
        similarity,
        score,
        passedMinSimilarity: similarity >= minSimilarity,
        passedMinScore: score >= minScore,
      };
    });

    const selectedHitChunkIds = items
      .filter((item) => item.similarity !== null && item.score !== null)
      .filter((item) => item.passedMinSimilarity && item.passedMinScore)
      .sort((left, right) => {
        if ((left.score ?? 0) !== (right.score ?? 0)) {
          return (right.score ?? 0) - (left.score ?? 0);
        }

        return (right.similarity ?? 0) - (left.similarity ?? 0);
      })
      .slice(0, topK)
      .map((item) => item.chunkId);

    return {
      status: 'active',
      minScore,
      minSimilarity,
      topK,
      candidatePoolSize: candidatePool.length,
      fallbackReason: null,
      items,
      selectedHitChunkIds,
    };
  } catch {
    return {
      status: 'failed',
      minScore,
      minSimilarity,
      topK,
      candidatePoolSize: candidatePool.length,
      fallbackReason: '向量候选诊断执行失败，当前无法输出候选级明细。',
      items: [],
      selectedHitChunkIds: [],
    };
  }
}
