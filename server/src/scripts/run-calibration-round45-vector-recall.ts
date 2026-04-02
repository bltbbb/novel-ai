import { loadServerEnv } from '../config/env.js';
import { retrieveGenerationMemory } from '../services/generation-retrieval.js';
import { ensureGenerationMemoryEmbeddingAssets } from '../services/generation-embedding-store.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';
import {
  diagnoseGenerationVectorCandidates,
  getGenerationVectorBackendStatus,
} from '../services/generation-vector-backend.js';

const PROJECT_ID = 'calibration-project-vector-recall';
const CURRENT_CHAPTER_ID = 'calibration-current-chapter';
const CURRENT_CHAPTER_TITLE = '第50章：归炉回响';
const CURRENT_CHAPTER_ORDER = 50;
const CURRENT_VOLUME_TITLE = '第二卷';
const QUERY_PHRASES = ['炼器宗钥印', '归炉井'];

interface MemoryChunkSeed {
  id: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  chunkKind: 'parent' | 'child';
  sourceKind: 'summary' | 'scene';
  chunkIndex: number;
  summaryExcerpt: string;
  content: string;
  entityRefs: string[];
  locations: string[];
}

const MEMORY_CHUNK_SEEDS: MemoryChunkSeed[] = [
  {
    id: 'calibration-vector-lexical',
    chapterId: 'calibration-chapter-045',
    chapterTitle: '第45章：钥印明文',
    chapterOrder: 45,
    chunkKind: 'parent',
    sourceKind: 'summary',
    chunkIndex: 0,
    summaryExcerpt: '林冲确认炼器宗钥印会在归炉井前发光。',
    content: '林冲确认炼器宗钥印会在归炉井前发光，钥印与井口禁制同时震鸣。',
    entityRefs: ['林冲', '黑铁片'],
    locations: ['归炉井'],
  },
  {
    id: 'calibration-vector-semantic',
    chapterId: 'calibration-chapter-044',
    chapterTitle: '第44章：旧门残券',
    chapterOrder: 44,
    chunkKind: 'child',
    sourceKind: 'scene',
    chunkIndex: 0,
    summaryExcerpt: '失传门派留下的通行残券指向一处废弃工坊旧址。',
    content:
      '那枚失传门派留下的通行残券指向一处废弃工坊旧址，只能证明凭证与旧门遗产有关，但没有出现即时回应或开启迹象。',
    entityRefs: [],
    locations: ['废弃工坊旧址'],
  },
  {
    id: 'calibration-vector-hybrid',
    chapterId: 'calibration-chapter-043',
    chapterTitle: '第43章：沉井回证',
    chapterOrder: 43,
    chunkKind: 'child',
    sourceKind: 'scene',
    chunkIndex: 0,
    summaryExcerpt: '旧门凭证靠近井状遗迹入口时引发通行回应。',
    content:
      '那枚旧门凭证靠近井状遗迹入口时，封闭多年的通行纹路忽然泛起回声般的共鸣，像是在识别来者身份并尝试解开入口锁闭，林冲因此确认这份凭证与遗弃炉场属于同一脉络。',
    entityRefs: ['林冲'],
    locations: ['井状遗迹入口'],
  },
  {
    id: 'calibration-vector-noise',
    chapterId: 'calibration-chapter-042',
    chapterTitle: '第42章：雾盐回执',
    chapterOrder: 42,
    chunkKind: 'child',
    sourceKind: 'scene',
    chunkIndex: 0,
    summaryExcerpt: '雾盐驿站正在核对旧账与税印。',
    content: '韩山舟带人核对雾盐驿站旧账，税印与仓单纠纷再次爆发。',
    entityRefs: ['韩山舟'],
    locations: ['雾盐驿站'],
  },
];

function nowIsoString() {
  return new Date().toISOString();
}

function estimateTokenCount(content: string) {
  return Math.max(1, Math.ceil(content.trim().length * 0.7));
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join('、') : '无';
}

function clearProjectData(env: ReturnType<typeof loadServerEnv>) {
  const db = getGenerationDatabase(env);
  db.prepare('DELETE FROM generation_memory_embeddings WHERE project_id = ?').run(PROJECT_ID);
  db.prepare('DELETE FROM generation_memory_chunks WHERE project_id = ?').run(PROJECT_ID);
  const vecIndexTable = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'generation_memory_embedding_vec_index'
  `).get() as { name?: string } | undefined;

  if (vecIndexTable?.name) {
    db.prepare(`
      DELETE FROM generation_memory_embedding_vec_index
      WHERE project_id = ?
    `).run(PROJECT_ID);
  }
}

function seedProjectData(env: ReturnType<typeof loadServerEnv>) {
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();
  const insertStatement = db.prepare(`
    INSERT INTO generation_memory_chunks (
      id,
      project_id,
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
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const chunk of MEMORY_CHUNK_SEEDS) {
    insertStatement.run(
      chunk.id,
      PROJECT_ID,
      chunk.chapterId,
      chunk.chapterTitle,
      chunk.chapterOrder,
      CURRENT_VOLUME_TITLE,
      chunk.chunkKind,
      chunk.sourceKind,
      chunk.chunkIndex,
      '深夜',
      chunk.summaryExcerpt,
      estimateTokenCount(chunk.content),
      JSON.stringify(chunk.entityRefs),
      JSON.stringify(chunk.locations),
      JSON.stringify({ calibration: 'round45-vector-recall' }),
      chunk.content,
      currentTime,
      currentTime,
    );
  }
}

async function syncSeededEmbeddings(env: ReturnType<typeof loadServerEnv>) {
  return ensureGenerationMemoryEmbeddingAssets(
    env,
    MEMORY_CHUNK_SEEDS.map((chunk) => ({
      chunkId: chunk.id,
      projectId: PROJECT_ID,
      chapterId: chunk.chapterId,
      content: [chunk.chapterTitle, chunk.summaryExcerpt, chunk.content].filter(Boolean).join('\n'),
    })),
  );
}

function printRetrievalSummary(
  title: string,
  env: ReturnType<typeof loadServerEnv>,
  result: Awaited<ReturnType<typeof retrieveGenerationMemory>> & {
    vectorCandidateDiagnostics?: Array<{
      chunkId: string;
      vectorSimilarity: number | null;
      vectorScore: number | null;
      minSimilarity: number;
      minScore: number;
      diagnosticDecision:
        | 'below_min_similarity'
        | 'below_min_score'
        | 'passed_threshold_but_dropped_later'
        | 'passed_threshold_and_selected'
        | 'vector_diagnostic_unavailable';
    }>;
  },
) {
  const memoryItems = result.items.filter((item) => item.sourceType === 'memory_chunk');
  const lexicalOnlyCount = memoryItems.filter((item) => item.retrievalHitOrigin === 'lexical_only').length;
  const vectorOnlyCount = memoryItems.filter((item) => item.retrievalHitOrigin === 'vector_only').length;
  const hybridCount = memoryItems.filter((item) => item.retrievalHitOrigin === 'hybrid').length;

  console.log(`## ${title}`);
  console.log(`projectId: ${PROJECT_ID}`);
  console.log(`sampleChapter: ${CURRENT_CHAPTER_TITLE} (${CURRENT_CHAPTER_ID})`);
  console.log(`vectorBackend: ${JSON.stringify(getGenerationVectorBackendStatus(env))}`);
  console.log(`vectorSearch: ${JSON.stringify(result.vectorSearch)}`);
  console.log(`pipeline: ${JSON.stringify(result.pipeline)}`);
  console.log(
    `originDistribution: lexical_only=${lexicalOnlyCount}, vector_only=${vectorOnlyCount}, hybrid=${hybridCount}`,
  );

  if (result.vectorSearch.status === 'active') {
    const finalVectorSignalChunkIds = new Set(
      memoryItems
        .filter((item) => item.retrievalSignals.includes('vector'))
        .map((item) => item.id),
    );
    const candidateDiagnostics = result.vectorCandidateDiagnostics ?? [];

    console.log('vectorCandidateDiagnostics:');

    for (const item of candidateDiagnostics) {
      console.log(
        `- ${item.chunkId} | vectorSimilarity=${item.vectorSimilarity ?? 'null'} | vectorScore=${item.vectorScore ?? 'null'} | minSimilarity=${item.minSimilarity} | minScore=${item.minScore} | diagnosticDecision=${item.diagnosticDecision}`,
      );
    }

    if (candidateDiagnostics.length > 0) {
      const droppedChunkIds = candidateDiagnostics
        .filter((item) => item.diagnosticDecision === 'passed_threshold_but_dropped_later')
        .map((item) => item.chunkId);

      if (droppedChunkIds.length > 0) {
        console.log(`vectorDroppedAfterThreshold: ${droppedChunkIds.join('、')}`);
      }

      const finalVectorHits = Array.from(finalVectorSignalChunkIds);

      if (finalVectorHits.length > 0) {
        console.log(`vectorSignalsInFinalResults: ${finalVectorHits.join('、')}`);
      }
    }
  }

  if (memoryItems.length === 0) {
    console.log('hits: 无 memory_chunk 命中');
    console.log('');
    return;
  }

  for (const [index, item] of memoryItems.entries()) {
    console.log(
      `${index + 1}. ${item.chapterTitle} | origin=${item.retrievalHitOrigin} | signals=${item.retrievalSignals.join('+') || '无'} | vectorSimilarity=${item.vectorSimilarity ?? 'null'} | pre=${item.preRerankScore} | delta=${item.rerankDelta} | final=${item.score}`,
    );
    console.log(`   rerankReasons=${item.rerankReasons.join('；') || '无'}`);
    console.log(`   matchedTerms=${formatList(item.matchedTerms)} | matchedEntities=${formatList(item.matchedEntityNames)} | matchedLocations=${formatList(item.matchedLocations)}`);
  }

  if (vectorOnlyCount === 0) {
    console.log('note: 当前样本未形成稳定 vector-only 命中；如使用 local-hash 或语义差距不足，请改用真实 embedding 模型或调整语义改写样本。');
  }

  console.log('');
}

async function main() {
  const env = loadServerEnv();
  const enabledEnv = process.env.CALIBRATION_VECTOR_EMBEDDING_MODEL?.trim()
    ? {
        ...env,
        openaiEmbeddingModel: process.env.CALIBRATION_VECTOR_EMBEDDING_MODEL.trim(),
      }
    : env;
  const disabledEnv = {
    ...enabledEnv,
    openaiEmbeddingModel: undefined,
  };

  clearProjectData(enabledEnv);
  seedProjectData(enabledEnv);
  const enabledEmbeddingSync = await syncSeededEmbeddings(enabledEnv);
  const vectorCandidates = MEMORY_CHUNK_SEEDS.map((chunk) => ({
    chunkId: chunk.id,
    projectId: PROJECT_ID,
    chapterId: chunk.chapterId,
    content: [chunk.chapterTitle, chunk.summaryExcerpt, chunk.content].filter(Boolean).join('\n'),
  }));

  const enabledResult = await retrieveGenerationMemory(enabledEnv, {
    projectId: PROJECT_ID,
    chapterId: CURRENT_CHAPTER_ID,
    chapterOrder: CURRENT_CHAPTER_ORDER,
    volumeTitle: CURRENT_VOLUME_TITLE,
    queryPhrases: QUERY_PHRASES,
    focusEntityNames: [],
    limit: 8,
  });
  const enabledVectorDiagnostics = await diagnoseGenerationVectorCandidates(enabledEnv, {
    queryText: QUERY_PHRASES.join('\n'),
    candidates: vectorCandidates,
  });
  const disabledResult = await retrieveGenerationMemory(disabledEnv, {
    projectId: PROJECT_ID,
    chapterId: CURRENT_CHAPTER_ID,
    chapterOrder: CURRENT_CHAPTER_ORDER,
    volumeTitle: CURRENT_VOLUME_TITLE,
    queryPhrases: QUERY_PHRASES,
    focusEntityNames: [],
    limit: 8,
  });

  console.log('# 4.5 Vector Retrieval Calibration');
  console.log(`queryPhrases: ${QUERY_PHRASES.join(' / ')}`);
  console.log(`embeddingModel(enabled): ${enabledEnv.openaiEmbeddingModel ?? '未配置'}`);
  console.log(`embeddingModel(disabled): ${disabledEnv.openaiEmbeddingModel ?? '未配置'}`);
  console.log('');

  console.log('## Pre-read embedding sync');
  console.log(
    `created=${enabledEmbeddingSync.createdChunkIds.length} reused=${enabledEmbeddingSync.reusedChunkIds.length} rebuilt=${enabledEmbeddingSync.rebuiltChunkIds.length} skipped=${enabledEmbeddingSync.skippedItems.length}`,
  );
  console.log(`sqliteVecIndexSync.status=${enabledEmbeddingSync.sqliteVecIndexSync.status}`);
  console.log(`sqliteVecIndexSync.vectorTables=${enabledEmbeddingSync.sqliteVecIndexSync.vectorTables.join(', ') || '无'}`);
  console.log(`sqliteVecIndexSync.syncedChunkIds=${enabledEmbeddingSync.sqliteVecIndexSync.syncedChunkIds.join('、') || '无'}`);
  console.log(`sqliteVecIndexSync.fallbackReason=${enabledEmbeddingSync.sqliteVecIndexSync.fallbackReason ?? '无'}`);
  console.log('');

  const enabledFinalVectorSignalChunkIds = new Set(
    enabledResult.items
      .filter((item) => item.sourceType === 'memory_chunk' && item.retrievalSignals.includes('vector'))
      .map((item) => item.id),
  );
  const enabledSelectedHitChunkIds = new Set(enabledVectorDiagnostics.selectedHitChunkIds);
  const enabledCandidateDiagnostics = enabledVectorDiagnostics.status === 'active'
    ? vectorCandidates.map((candidate) => {
        const diagnosticItem = enabledVectorDiagnostics.items.find((item) => item.chunkId === candidate.chunkId);

        if (!diagnosticItem || diagnosticItem.similarity === null || diagnosticItem.score === null) {
          return {
            chunkId: candidate.chunkId,
            vectorSimilarity: diagnosticItem?.similarity ?? null,
            vectorScore: diagnosticItem?.score ?? null,
            minSimilarity: enabledVectorDiagnostics.minSimilarity,
            minScore: enabledVectorDiagnostics.minScore,
            diagnosticDecision: 'vector_diagnostic_unavailable' as const,
          };
        }

        let diagnosticDecision:
          | 'below_min_similarity'
          | 'below_min_score'
          | 'passed_threshold_but_dropped_later'
          | 'passed_threshold_and_selected';

        if (!diagnosticItem.passedMinSimilarity) {
          diagnosticDecision = 'below_min_similarity';
        } else if (!diagnosticItem.passedMinScore) {
          diagnosticDecision = 'below_min_score';
        } else if (
          !enabledSelectedHitChunkIds.has(candidate.chunkId) ||
          !enabledFinalVectorSignalChunkIds.has(candidate.chunkId)
        ) {
          diagnosticDecision = 'passed_threshold_but_dropped_later';
        } else {
          diagnosticDecision = 'passed_threshold_and_selected';
        }

        return {
          chunkId: candidate.chunkId,
          vectorSimilarity: diagnosticItem.similarity,
          vectorScore: diagnosticItem.score,
          minSimilarity: enabledVectorDiagnostics.minSimilarity,
          minScore: enabledVectorDiagnostics.minScore,
          diagnosticDecision,
        };
      })
    : [];

  printRetrievalSummary('Scenario A: 向量通道启用', enabledEnv, {
    ...enabledResult,
    vectorCandidateDiagnostics: enabledCandidateDiagnostics,
  });
  printRetrievalSummary('Scenario B: embedding 关闭回退', disabledEnv, disabledResult);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Round45 向量检索校准失败：${message}`);
  process.exitCode = 1;
});
