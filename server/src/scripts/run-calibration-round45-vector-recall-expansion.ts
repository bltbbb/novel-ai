import { loadServerEnv } from '../config/env.js';
import { retrieveGenerationMemory } from '../services/generation-retrieval.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';
import { getGenerationVectorBackendStatus } from '../services/generation-vector-backend.js';

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

interface CalibrationScenario {
  key: string;
  label: string;
  projectId: string;
  hybridChunkId: string;
  vectorOnlyChunkId: string;
  noiseChunkIds: string[];
  seeds: MemoryChunkSeed[];
}

const BASE_LEXICAL_SEED: MemoryChunkSeed = {
  id: 'base-lexical',
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
};

const SCENARIOS: CalibrationScenario[] = [
  {
    key: 'synonym-bridge',
    label: '同义改写型',
    projectId: 'calibration-project-vector-expansion-synonym',
    hybridChunkId: 'synonym-bridge-hybrid',
    vectorOnlyChunkId: 'synonym-bridge-vector-only',
    noiseChunkIds: ['synonym-bridge-noise'],
    seeds: [
      {
        ...BASE_LEXICAL_SEED,
        id: 'synonym-bridge-base-lexical',
      },
      {
        id: 'synonym-bridge-hybrid',
        chapterId: 'calibration-chapter-044',
        chapterTitle: '第44章：旧场回证',
        chapterOrder: 44,
        chunkKind: 'child',
        sourceKind: 'scene',
        chunkIndex: 0,
        summaryExcerpt: '炼器宗钥印靠近井状遗迹入口时，引发旧门通行回响。',
        content:
          '炼器宗钥印靠近井状遗迹入口时，引发旧门通行回响，像是凭证与井口锁闭识别为同源机关。',
        entityRefs: ['林冲'],
        locations: ['井状遗迹入口'],
      },
      {
        id: 'synonym-bridge-vector-only',
        chapterId: 'calibration-chapter-043',
        chapterTitle: '第43章：沉井回证',
        chapterOrder: 43,
        chunkKind: 'child',
        sourceKind: 'scene',
        chunkIndex: 0,
        summaryExcerpt: '旧门凭证靠近井状遗迹入口时引发通行回应。',
        content:
          '那枚旧门凭证靠近井状遗迹入口时，封闭多年的通行纹路忽然泛起回声般的共鸣，像是在识别来者身份并尝试解开入口锁闭。',
        entityRefs: ['林冲'],
        locations: ['井状遗迹入口'],
      },
      {
        id: 'synonym-bridge-noise',
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
    ],
  },
  {
    key: 'weak-semantic',
    label: '语义弱相关型',
    projectId: 'calibration-project-vector-expansion-weak',
    hybridChunkId: 'weak-semantic-hybrid',
    vectorOnlyChunkId: 'weak-semantic-vector-only',
    noiseChunkIds: ['weak-semantic-noise'],
    seeds: [
      {
        ...BASE_LEXICAL_SEED,
        id: 'weak-semantic-base-lexical',
      },
      {
        id: 'weak-semantic-hybrid',
        chapterId: 'calibration-chapter-044',
        chapterTitle: '第44章：旧场对印',
        chapterOrder: 44,
        chunkKind: 'child',
        sourceKind: 'scene',
        chunkIndex: 0,
        summaryExcerpt: '炼器宗钥印在井状遗迹入口附近引发旧门回应。',
        content:
          '炼器宗钥印在井状遗迹入口附近引发旧门回应，林冲确认凭证与入口机关存在共鸣式识别。',
        entityRefs: ['林冲'],
        locations: ['井状遗迹入口'],
      },
      {
        id: 'weak-semantic-vector-only',
        chapterId: 'calibration-chapter-043',
        chapterTitle: '第43章：旧门残券',
        chapterOrder: 43,
        chunkKind: 'child',
        sourceKind: 'scene',
        chunkIndex: 0,
        summaryExcerpt: '失传门派留下的通行残券指向废弃工坊遗迹。',
        content:
          '那枚失传门派留下的通行残券指向废弃工坊遗迹，只能说明它和旧门资产有关，但没有明显的入口回应或解锁迹象。',
        entityRefs: [],
        locations: ['废弃工坊遗迹'],
      },
      {
        id: 'weak-semantic-noise',
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
    ],
  },
  {
    key: 'noise-pressure',
    label: '明确噪音型',
    projectId: 'calibration-project-vector-expansion-noise',
    hybridChunkId: 'noise-pressure-hybrid',
    vectorOnlyChunkId: 'noise-pressure-vector-only',
    noiseChunkIds: ['noise-pressure-nearby-1', 'noise-pressure-nearby-2'],
    seeds: [
      {
        ...BASE_LEXICAL_SEED,
        id: 'noise-pressure-base-lexical',
      },
      {
        id: 'noise-pressure-hybrid',
        chapterId: 'calibration-chapter-044',
        chapterTitle: '第44章：旧场回证',
        chapterOrder: 44,
        chunkKind: 'child',
        sourceKind: 'scene',
        chunkIndex: 0,
        summaryExcerpt: '炼器宗钥印靠近井状遗迹入口时，引发旧门通行回响。',
        content:
          '炼器宗钥印靠近井状遗迹入口时，引发旧门通行回响，像是凭证与井口锁闭识别为同源机关。',
        entityRefs: ['林冲'],
        locations: ['井状遗迹入口'],
      },
      {
        id: 'noise-pressure-vector-only',
        chapterId: 'calibration-chapter-043',
        chapterTitle: '第43章：沉井回证',
        chapterOrder: 43,
        chunkKind: 'child',
        sourceKind: 'scene',
        chunkIndex: 0,
        summaryExcerpt: '旧门凭证靠近井状遗迹入口时引发通行回应。',
        content:
          '那枚旧门凭证靠近井状遗迹入口时，封闭多年的通行纹路忽然泛起回声般的共鸣，像是在识别来者身份并尝试解开入口锁闭。',
        entityRefs: ['林冲'],
        locations: ['井状遗迹入口'],
      },
      {
        id: 'noise-pressure-nearby-1',
        chapterId: 'calibration-chapter-042',
        chapterTitle: '第42章：炉场旧凭',
        chapterOrder: 42,
        chunkKind: 'child',
        sourceKind: 'scene',
        chunkIndex: 0,
        summaryExcerpt: '旧门凭证曾被登记在废弃炉场账本里。',
        content:
          '旧门凭证曾被登记在废弃炉场账本里，但这里只记录保管手续和交接残页，并没有任何入口识别或开启反应。',
        entityRefs: [],
        locations: ['废弃炉场账房'],
      },
      {
        id: 'noise-pressure-nearby-2',
        chapterId: 'calibration-chapter-041',
        chapterTitle: '第41章：沉井旧账',
        chapterOrder: 41,
        chunkKind: 'child',
        sourceKind: 'scene',
        chunkIndex: 0,
        summaryExcerpt: '沉井周边旧账残页提到封井时留下的清点记录。',
        content:
          '沉井周边旧账残页提到封井时留下的清点记录，内容只涉及器材和工料损耗，没有凭证识别、回响或锁闭反应。',
        entityRefs: [],
        locations: ['沉井旧账库'],
      },
    ],
  },
];

function nowIsoString() {
  return new Date().toISOString();
}

function estimateTokenCount(content: string) {
  return Math.max(1, Math.ceil(content.trim().length * 0.7));
}

function clearProjectData(env: ReturnType<typeof loadServerEnv>, projectId: string) {
  const db = getGenerationDatabase(env);
  db.prepare('DELETE FROM generation_memory_embeddings WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM generation_memory_chunks WHERE project_id = ?').run(projectId);
}

function seedProjectData(
  env: ReturnType<typeof loadServerEnv>,
  projectId: string,
  seeds: MemoryChunkSeed[],
) {
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

  for (const chunk of seeds) {
    insertStatement.run(
      chunk.id,
      projectId,
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
      JSON.stringify({ calibration: 'round45-vector-recall-expansion', scenario: projectId }),
      chunk.content,
      currentTime,
      currentTime,
    );
  }
}

function printScenarioResult(
  title: string,
  env: ReturnType<typeof loadServerEnv>,
  scenario: CalibrationScenario,
  embeddingLabel: string,
  result: Awaited<ReturnType<typeof retrieveGenerationMemory>>,
) {
  const memoryItems = result.items.filter((item) => item.sourceType === 'memory_chunk');
  const finalVectorOnlyItems = memoryItems.filter((item) => item.retrievalHitOrigin === 'vector_only');
  const finalHybridItems = memoryItems.filter((item) => item.retrievalHitOrigin === 'hybrid');
  const preservedNoiseIds = scenario.noiseChunkIds.filter((chunkId) => memoryItems.some((item) => item.id === chunkId));

  console.log(`## ${title}`);
  console.log(`scenario: ${scenario.label} (${scenario.key})`);
  console.log(`embeddingModel: ${embeddingLabel}`);
  console.log(`vectorBackend: ${JSON.stringify(getGenerationVectorBackendStatus(env))}`);
  console.log(
    `hybridRecall: lexical_only=${result.pipeline.hybridRecall.lexicalOnlyCount}, vector_only=${result.pipeline.hybridRecall.vectorOnlyCount}, hybrid=${result.pipeline.hybridRecall.hybridCount}`,
  );
  console.log(
    `selection: rescuedVectorOnlyCandidates=${result.pipeline.selection.rescuedVectorOnlyCandidates}, rescuedVectorOnlyChunkIds=${result.pipeline.selection.rescuedVectorOnlyChunkIds.join('、') || '无'}, droppedVectorOnlyChunkIds=${result.pipeline.selection.droppedVectorOnlyChunkIds.join('、') || '无'}`,
  );
  console.log(
    `finalSelected: vector_only=${finalVectorOnlyItems.length} (${finalVectorOnlyItems.map((item) => item.id).join('、') || '无'}) / hybrid=${finalHybridItems.length} (${finalHybridItems.map((item) => item.id).join('、') || '无'})`,
  );
  console.log(`noiseRetained: ${preservedNoiseIds.join('、') || '无'}`);
  console.log('');
}

async function runScenario(
  env: ReturnType<typeof loadServerEnv>,
  scenario: CalibrationScenario,
) {
  clearProjectData(env, scenario.projectId);
  seedProjectData(env, scenario.projectId, scenario.seeds);

  const enabledResult = await retrieveGenerationMemory(env, {
    projectId: scenario.projectId,
    chapterId: CURRENT_CHAPTER_ID,
    chapterOrder: CURRENT_CHAPTER_ORDER,
    volumeTitle: CURRENT_VOLUME_TITLE,
    queryPhrases: QUERY_PHRASES,
    focusEntityNames: [],
    limit: 8,
  });
  const disabledResult = await retrieveGenerationMemory(
    {
      ...env,
      openaiEmbeddingModel: undefined,
    },
    {
      projectId: scenario.projectId,
      chapterId: CURRENT_CHAPTER_ID,
      chapterOrder: CURRENT_CHAPTER_ORDER,
      volumeTitle: CURRENT_VOLUME_TITLE,
      queryPhrases: QUERY_PHRASES,
      focusEntityNames: [],
      limit: 8,
    },
  );

  printScenarioResult('Scenario A: 向量通道启用', env, scenario, env.openaiEmbeddingModel ?? '未配置', enabledResult);
  printScenarioResult('Scenario B: embedding 关闭回退', { ...env, openaiEmbeddingModel: undefined }, scenario, '未配置', disabledResult);
}

async function main() {
  const env = loadServerEnv();
  const enabledEnv = process.env.CALIBRATION_VECTOR_EMBEDDING_MODEL?.trim()
    ? {
        ...env,
        openaiEmbeddingModel: process.env.CALIBRATION_VECTOR_EMBEDDING_MODEL.trim(),
      }
    : env;

  console.log('# 4.5 Vector-only Expansion Calibration');
  console.log(`queryPhrases: ${QUERY_PHRASES.join(' / ')}`);
  console.log(`embeddingModel(enabled): ${enabledEnv.openaiEmbeddingModel ?? '未配置'}`);
  console.log('通过标准：跨样本稳定、噪音不进、强 hybrid 不伤');
  console.log('');

  for (const scenario of SCENARIOS) {
    await runScenario(enabledEnv, scenario);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Round45 vector-only 扩样复核失败：${message}`);
  process.exitCode = 1;
});
