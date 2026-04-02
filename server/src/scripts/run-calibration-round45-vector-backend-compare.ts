import { loadServerEnv } from '../config/env.js';
import { ensureGenerationMemoryEmbeddingAssets } from '../services/generation-embedding-store.js';
import { retrieveGenerationMemory } from '../services/generation-retrieval.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';
import { getGenerationVectorBackendStatus } from '../services/generation-vector-backend.js';

const PROJECT_ID = 'calibration-project-vector-backend-compare';
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
    id: 'compare-vector-lexical',
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
    id: 'compare-vector-semantic',
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
    id: 'compare-vector-hybrid',
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
    id: 'compare-vector-noise',
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
      JSON.stringify({ calibration: 'round45-vector-backend-compare' }),
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

function printBackendResult(
  title: string,
  env: ReturnType<typeof loadServerEnv>,
  result: Awaited<ReturnType<typeof retrieveGenerationMemory>>,
) {
  const memoryItems = result.items.filter((item) => item.sourceType === 'memory_chunk');
  const lexicalOnlyItems = memoryItems.filter((item) => item.retrievalHitOrigin === 'lexical_only');
  const vectorOnlyItems = memoryItems.filter((item) => item.retrievalHitOrigin === 'vector_only');
  const hybridItems = memoryItems.filter((item) => item.retrievalHitOrigin === 'hybrid');
  const noiseItems = memoryItems.filter((item) => item.id === 'compare-vector-noise');

  console.log(`## ${title}`);
  console.log(`vectorBackend: ${JSON.stringify(getGenerationVectorBackendStatus(env))}`);
  console.log(`vectorSearch.source=${result.vectorSearch.source}`);
  console.log(`vectorSearch.status=${result.vectorSearch.status}`);
  console.log(`vectorSearch.matchedCandidateCount=${result.vectorSearch.matchedCandidateCount}`);
  console.log(
    `originDistribution: lexical_only=${lexicalOnlyItems.length}, vector_only=${vectorOnlyItems.length}, hybrid=${hybridItems.length}`,
  );
  console.log(
    `selection: rescuedVectorOnlyCandidates=${result.pipeline.selection.rescuedVectorOnlyCandidates} / rescuedVectorOnlyChunkIds=${result.pipeline.selection.rescuedVectorOnlyChunkIds.join('、') || '无'} / droppedVectorOnlyChunkIds=${result.pipeline.selection.droppedVectorOnlyChunkIds.join('、') || '无'}`,
  );
  console.log(`finalSelected.vector_only=${vectorOnlyItems.map((item) => item.id).join('、') || '无'}`);
  console.log(`finalSelected.hybrid=${hybridItems.map((item) => item.id).join('、') || '无'}`);
  console.log(`noiseRetained=${noiseItems.map((item) => item.id).join('、') || '无'}`);

  if (result.vectorSearch.fallbackReason) {
    console.log(`fallbackReason=${result.vectorSearch.fallbackReason}`);
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
  const sqliteVecEnv = {
    ...enabledEnv,
    generationVectorBackend: 'sqlite_vec' as const,
  };
  const jsonCacheEnv = {
    ...enabledEnv,
    generationVectorBackend: 'json_cache' as const,
  };
  const disabledEnv = {
    ...enabledEnv,
    generationVectorBackend: 'sqlite_vec' as const,
    openaiEmbeddingModel: undefined,
  };

  clearProjectData(sqliteVecEnv);
  seedProjectData(sqliteVecEnv);
  const syncResult = await syncSeededEmbeddings(sqliteVecEnv);

  console.log('# 4.5 sqlite-vec vs json_cache compare');
  console.log(`queryPhrases: ${QUERY_PHRASES.join(' / ')}`);
  console.log(`embeddingModel(enabled): ${enabledEnv.openaiEmbeddingModel ?? '未配置'}`);
  console.log('');
  console.log('## Pre-read embedding sync');
  console.log(
    `created=${syncResult.createdChunkIds.length} reused=${syncResult.reusedChunkIds.length} rebuilt=${syncResult.rebuiltChunkIds.length} skipped=${syncResult.skippedItems.length}`,
  );
  console.log(`sqliteVecIndexSync.status=${syncResult.sqliteVecIndexSync.status}`);
  console.log(`sqliteVecIndexSync.vectorTables=${syncResult.sqliteVecIndexSync.vectorTables.join(', ') || '无'}`);
  console.log(`sqliteVecIndexSync.syncedChunkIds=${syncResult.sqliteVecIndexSync.syncedChunkIds.join('、') || '无'}`);
  console.log(`sqliteVecIndexSync.fallbackReason=${syncResult.sqliteVecIndexSync.fallbackReason ?? '无'}`);
  console.log('');

  const sqliteVecResult = await retrieveGenerationMemory(sqliteVecEnv, {
    projectId: PROJECT_ID,
    chapterId: CURRENT_CHAPTER_ID,
    chapterOrder: CURRENT_CHAPTER_ORDER,
    volumeTitle: CURRENT_VOLUME_TITLE,
    queryPhrases: QUERY_PHRASES,
    focusEntityNames: [],
    limit: 8,
  });
  const jsonCacheResult = await retrieveGenerationMemory(jsonCacheEnv, {
    projectId: PROJECT_ID,
    chapterId: CURRENT_CHAPTER_ID,
    chapterOrder: CURRENT_CHAPTER_ORDER,
    volumeTitle: CURRENT_VOLUME_TITLE,
    queryPhrases: QUERY_PHRASES,
    focusEntityNames: [],
    limit: 8,
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

  printBackendResult('sqlite_vec enabled', sqliteVecEnv, sqliteVecResult);
  printBackendResult('json_cache enabled', jsonCacheEnv, jsonCacheResult);
  printBackendResult('sqlite_vec disabled fallback', disabledEnv, disabledResult);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`round45 sqlite-vec vs json_cache 对比失败：${message}`);
  process.exitCode = 1;
});
