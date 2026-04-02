import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import type { GenerationGateConfig } from '../types/ai.js';
import {
  getGenerationGateConfig,
  updateGenerationGateConfig,
} from '../services/generation-gate-config-store.js';

function isScore(value: unknown) {
  return typeof value === 'number' && value >= 0 && value <= 100;
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isGenerationGateConfig(body: unknown): body is GenerationGateConfig {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<GenerationGateConfig>;
  const scoreThresholds = candidate.reviewScoreThresholds as Partial<GenerationGateConfig['reviewScoreThresholds']> | undefined;
  const lightweightRecall = candidate.lightweightRecall as Partial<GenerationGateConfig['lightweightRecall']> | undefined;

  return (
    (candidate.reviewRewriteMinSeverity === 'critical' ||
      candidate.reviewRewriteMinSeverity === 'high' ||
      candidate.reviewRewriteMinSeverity === 'medium' ||
      candidate.reviewRewriteMinSeverity === 'low') &&
    isNonNegativeInteger(candidate.reviewMaxRewriteCount) &&
    Boolean(
      scoreThresholds &&
        isScore(scoreThresholds.consistency) &&
        isScore(scoreThresholds.continuity) &&
        isScore(scoreThresholds.reader_pull),
    ) &&
    typeof candidate.polishFailBlockReady === 'boolean' &&
    Boolean(
      lightweightRecall &&
        isScore(lightweightRecall.minScore) &&
        isNonNegativeInteger(lightweightRecall.topK) &&
        isNonNegativeInteger(lightweightRecall.phraseWeight) &&
        isNonNegativeInteger(lightweightRecall.entityWeight) &&
        isNonNegativeInteger(lightweightRecall.recencyWeight),
    )
  );
}

export async function registerRuntimeConfigRoutes(app: FastifyInstance, env: ServerEnv) {
  app.get('/api/runtime/generation-gate', async () => {
    return {
      config: await getGenerationGateConfig(env),
    };
  });

  app.put('/api/runtime/generation-gate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGenerationGateConfig(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 GenerationGateConfig 结构',
      });
    }

    return {
      config: await updateGenerationGateConfig(env, request.body),
    };
  });
}
