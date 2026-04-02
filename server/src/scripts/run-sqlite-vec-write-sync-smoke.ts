import { loadServerEnv } from '../config/env.js';
import { ensureGenerationMemoryEmbeddingAssets } from '../services/generation-embedding-store.js';

async function main() {
  const env = loadServerEnv();
  const smokeEnv = {
    ...env,
    generationVectorBackend: 'sqlite_vec' as const,
    openaiEmbeddingModel: process.env.CALIBRATION_ASSET_EMBEDDING_MODEL?.trim() || 'local-hash',
  };

  const result = await ensureGenerationMemoryEmbeddingAssets(smokeEnv, [
    {
      chunkId: 'sqlite-vec-write-smoke-alpha',
      projectId: 'sqlite-vec-write-smoke',
      chapterId: 'chapter-alpha',
      content: '旧门凭证靠近井状遗迹入口时引发通行回应。',
    },
    {
      chunkId: 'sqlite-vec-write-smoke-beta',
      projectId: 'sqlite-vec-write-smoke',
      chapterId: 'chapter-beta',
      content: '废弃工坊旧址只保留通行残券的登记记录，没有出现即时回应。',
    },
  ]);

  console.log('# sqlite-vec write smoke');
  console.log(`embeddingModel: ${result.embeddingModel ?? '未配置'}`);
  console.log(`created=${result.createdChunkIds.length} reused=${result.reusedChunkIds.length} rebuilt=${result.rebuiltChunkIds.length} skipped=${result.skippedItems.length}`);
  console.log(`sqliteVecIndexSync.status=${result.sqliteVecIndexSync.status}`);
  console.log(`sqliteVecIndexSync.vectorTables=${result.sqliteVecIndexSync.vectorTables.join(', ') || '无'}`);
  console.log(`sqliteVecIndexSync.syncedChunkIds=${result.sqliteVecIndexSync.syncedChunkIds.join('、') || '无'}`);
  console.log(`sqliteVecIndexSync.fallbackReason=${result.sqliteVecIndexSync.fallbackReason ?? '无'}`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sqlite-vec write smoke 失败：${message}`);
  process.exitCode = 1;
});
