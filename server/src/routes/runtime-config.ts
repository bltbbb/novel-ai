import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import type { AIRuntimeConfig, AIRuntimeModelProbeRequest, GenerationGateConfig } from '../types/ai.js';
import {
  getAIRuntimeConfig,
  resolveAIRuntimeProbeConfig,
  updateAIRuntimeConfig,
} from '../services/ai-runtime-config-store.js';
import {
  getGenerationGateConfig,
  updateGenerationGateConfig,
} from '../services/generation-gate-config-store.js';
import { listAvailableModels } from '../services/openai.js';

function isScore(value: unknown) {
  return typeof value === 'number' && value >= 0 && value <= 100;
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isAiProviderPreset(value: unknown) {
  return value === 'openai' ||
    value === 'deepseek' ||
    value === 'siliconflow' ||
    value === 'openrouter' ||
    value === 'dashscope' ||
    value === 'zhipu' ||
    value === 'custom';
}

function isAIRuntimeConfig(body: unknown): body is AIRuntimeConfig {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIRuntimeConfig>;

  return (
    isAiProviderPreset(candidate.provider) &&
    typeof candidate.apiKey === 'string' &&
    typeof candidate.baseUrl === 'string' &&
    typeof candidate.defaultModel === 'string' &&
    (typeof candidate.embeddingModel === 'undefined' || typeof candidate.embeddingModel === 'string')
  );
}

function isAIRuntimeModelProbeRequest(body: unknown): body is AIRuntimeModelProbeRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIRuntimeModelProbeRequest>;

  return (
    (typeof candidate.provider === 'undefined' || isAiProviderPreset(candidate.provider)) &&
    (typeof candidate.apiKey === 'undefined' || typeof candidate.apiKey === 'string') &&
    (typeof candidate.baseUrl === 'undefined' || typeof candidate.baseUrl === 'string')
  );
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
  app.get('/api/runtime/ai-config', async () => {
    return {
      config: await getAIRuntimeConfig(env),
    };
  });

  app.put('/api/runtime/ai-config', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIRuntimeConfig(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIRuntimeConfig 结构',
      });
    }

    return {
      config: await updateAIRuntimeConfig(env, request.body),
    };
  });

  app.post('/api/runtime/ai-models', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody = typeof request.body === 'undefined' ? {} : request.body;

    if (!isAIRuntimeModelProbeRequest(rawBody)) {
      return reply.status(400).send({
        message: '请求体不符合 AIRuntimeModelProbeRequest 结构',
      });
    }

    try {
      const probeConfig = resolveAIRuntimeProbeConfig(env, rawBody);

      return {
        models: await listAvailableModels({
          apiKey: probeConfig.apiKey,
          baseUrl: probeConfig.baseUrl,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '模型列表拉取失败';
      return reply.status(400).send({
        message,
      });
    }
  });

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
