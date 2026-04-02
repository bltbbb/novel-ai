import { loadServerEnv } from '../config/env.js';
import { ensureGenerationMemoryEmbeddingAssets } from '../services/generation-embedding-store.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';
import { getGenerationVectorBackendStatus } from '../services/generation-vector-backend.js';

const PROJECT_ID = 'calibration-project-embedding-assets';
const CHAPTER_ID = 'calibration-asset-chapter';

interface AssetTarget {
  chunkId: string;
  projectId: string;
  chapterId: string;
  content: string;
}

function cleanupAssetRows(env: ReturnType<typeof loadServerEnv>) {
  const db = getGenerationDatabase(env);
  db.prepare('DELETE FROM generation_memory_embeddings WHERE project_id = ?').run(PROJECT_ID);
}

function createBaseTargets(contentOverride?: Partial<Record<'alpha' | 'beta' | 'empty', string>>): AssetTarget[] {
  return [
    {
      chunkId: 'calibration-asset-alpha',
      projectId: PROJECT_ID,
      chapterId: CHAPTER_ID,
      content: contentOverride?.alpha ?? '炼器宗钥印在归炉井前发出回响。',
    },
    {
      chunkId: 'calibration-asset-beta',
      projectId: PROJECT_ID,
      chapterId: CHAPTER_ID,
      content: contentOverride?.beta ?? '谢无咎带回了一张只剩半边的旧宗残图。',
    },
    {
      chunkId: 'calibration-asset-empty',
      projectId: PROJECT_ID,
      chapterId: CHAPTER_ID,
      content: contentOverride?.empty ?? '',
    },
  ];
}

function createSkipReasonSummary(
  skippedItems: Awaited<ReturnType<typeof ensureGenerationMemoryEmbeddingAssets>>['skippedItems'],
) {
  return skippedItems.reduce(
    (summary, item) => {
      if (item.reason === 'embedding_disabled') {
        summary.embeddingDisabled += 1;
      } else if (item.reason === 'empty_content') {
        summary.emptyContent += 1;
      } else {
        summary.embeddingFailed += 1;
      }

      return summary;
    },
    {
      embeddingDisabled: 0,
      emptyContent: 0,
      embeddingFailed: 0,
    },
  );
}

function printAssetPass(
  label: string,
  env: ReturnType<typeof loadServerEnv>,
  result: Awaited<ReturnType<typeof ensureGenerationMemoryEmbeddingAssets>>,
) {
  const skipSummary = createSkipReasonSummary(result.skippedItems);

  console.log(`## ${label}`);
  console.log(`vectorBackend: ${JSON.stringify(getGenerationVectorBackendStatus(env))}`);
  console.log(`embeddingModel: ${result.embeddingModel ?? '未配置'}`);
  console.log(
    `created=${result.createdChunkIds.length} | reused=${result.reusedChunkIds.length} | rebuilt=${result.rebuiltChunkIds.length} | skipped=${result.skippedItems.length}`,
  );
  console.log(
    `skippedByReason: embedding_disabled=${skipSummary.embeddingDisabled} | empty_content=${skipSummary.emptyContent} | embedding_failed=${skipSummary.embeddingFailed}`,
  );
  console.log(`createdChunkIds: ${result.createdChunkIds.join('、') || '无'}`);
  console.log(`reusedChunkIds: ${result.reusedChunkIds.join('、') || '无'}`);
  console.log(`rebuiltChunkIds: ${result.rebuiltChunkIds.join('、') || '无'}`);
  console.log(`processedVectors: ${Array.from(result.vectorsByChunkId.keys()).join('、') || '无'}`);
  console.log('');
}

async function main() {
  const env = loadServerEnv();
  const assetEnv = {
    ...env,
    openaiEmbeddingModel: process.env.CALIBRATION_ASSET_EMBEDDING_MODEL?.trim() || 'local-hash',
  };
  const disabledEnv = {
    ...assetEnv,
    openaiEmbeddingModel: undefined,
  };

  cleanupAssetRows(assetEnv);

  const pass1 = await ensureGenerationMemoryEmbeddingAssets(assetEnv, createBaseTargets());
  const pass2 = await ensureGenerationMemoryEmbeddingAssets(assetEnv, createBaseTargets());
  const pass3 = await ensureGenerationMemoryEmbeddingAssets(
    assetEnv,
    createBaseTargets({
      alpha: '炼器宗钥印在归炉井前突然转为灼热，回响比前一轮更强。',
    }),
  );
  const pass4 = await ensureGenerationMemoryEmbeddingAssets(disabledEnv, createBaseTargets());

  console.log('# 4.5 Embedding Asset Calibration');
  console.log(`projectId: ${PROJECT_ID}`);
  console.log(`activeEmbeddingModel: ${assetEnv.openaiEmbeddingModel ?? '未配置'}`);
  console.log('');

  printAssetPass('Pass 1: 首次写入（created + empty_content）', assetEnv, pass1);
  printAssetPass('Pass 2: 同内容复跑（reused + empty_content）', assetEnv, pass2);
  printAssetPass('Pass 3: 内容变更（rebuilt + reused + empty_content）', assetEnv, pass3);
  printAssetPass('Pass 4: embedding 关闭（embedding_disabled + empty_content）', disabledEnv, pass4);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Round45 embedding 资产校准失败：${message}`);
  process.exitCode = 1;
});
