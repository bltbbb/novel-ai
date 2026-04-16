import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerEnv } from '../../src/config/env.js';
import { DEFAULT_PROMPT_CONFIG } from '../../src/prompts/index.js';
import { registerStructureMemoryRoutes } from '../../src/routes/structure-memory.js';
import { getGenerationDatabase } from '../../src/services/generation-sqlite.js';

const DEFAULT_TEST_GATE_CONFIG: ServerEnv['generationGateConfig'] = {
  reviewRewriteMinSeverity: 'critical',
  reviewMaxRewriteCount: 2,
  reviewScoreThresholds: {
    consistency: 60,
    continuity: 60,
    reader_pull: 60,
  },
  polishFailBlockReady: true,
  lightweightRecall: {
    minScore: 3,
    topK: 4,
    phraseWeight: 2,
    entityWeight: 3,
    recencyWeight: 1,
  },
};

export interface TestEnvContext {
  env: ServerEnv;
  tempDir: string;
  dispose: () => Promise<void>;
  createStructureMemoryApp: () => Promise<FastifyInstance>;
}

function normalizeName(value: string) {
  const normalized = value.replace(/[^a-z0-9-]+/giu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '');
  return normalized || 'server-test';
}

export function createTestEnv(name = 'server-test'): TestEnvContext {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), `novel-ai-${normalizeName(name)}-`));
  const env: ServerEnv = {
    port: 0,
    host: '127.0.0.1',
    corsOrigin: '*',
    openaiProvider: 'openai',
    openaiApiKey: '',
    defaultModel: 'gpt-4o-mini',
    generationVectorBackend: 'json_cache',
    generationDataDir: tempDir,
    generationGateConfig: DEFAULT_TEST_GATE_CONFIG,
    promptConfig: DEFAULT_PROMPT_CONFIG,
  };
  let disposed = false;

  return {
    env,
    tempDir,
    async createStructureMemoryApp() {
      const app = Fastify({
        logger: false,
      });

      await registerStructureMemoryRoutes(app, env);
      await app.ready();
      return app;
    },
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;

      const dbFilePath = path.join(tempDir, 'generation.sqlite');

      if (existsSync(dbFilePath)) {
        try {
          const db = getGenerationDatabase(env) as { close?: () => void };
          db.close?.();
        } catch {
          // 测试清理阶段不阻断主流程。
        }
      }

      try {
        rmSync(tempDir, {
          recursive: true,
          force: true,
        });
      } catch {
        // Windows 下偶发文件锁不会影响测试结果。
      }
    },
  };
}
