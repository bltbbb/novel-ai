import dotenv from 'dotenv';
import { DEFAULT_PROMPT_CONFIG, type PromptConfig } from '../prompts/index.js';
import type {
  GenerationGateConfig,
  GenerationVectorBackendKind,
  ReviewSeverity,
} from '../types/ai.js';

dotenv.config({ override: true });

export interface ServerEnv {
  port: number;
  host: string;
  corsOrigin: string;
  openaiApiKey: string;
  openaiBaseUrl?: string;
  defaultModel: string;
  embeddingApiKey?: string;
  embeddingBaseUrl?: string;
  embeddingDimensions?: number;
  openaiEmbeddingModel?: string;
  sqliteVecExtensionPath?: string;
  generationVectorBackend: GenerationVectorBackendKind;
  generationDataDir: string;
  generationGateConfig: GenerationGateConfig;
  promptConfig: Required<PromptConfig>;
}

function parseBooleanEnv(name: string, fallback: boolean) {
  const rawValue = process.env[name];

  if (typeof rawValue === 'undefined') {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`环境变量 ${name} 不是有效布尔值`);
}

function parseIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (typeof rawValue === 'undefined') {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`环境变量 ${name} 不是有效的非负整数`);
  }

  return value;
}

function parseScoreEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (typeof rawValue === 'undefined') {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`环境变量 ${name} 不是有效的 0-100 分数`);
  }

  return Math.round(value);
}

function parseReviewSeverityEnv(name: string, fallback: ReviewSeverity): ReviewSeverity {
  const rawValue = process.env[name];

  if (typeof rawValue === 'undefined') {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (normalized === 'critical' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }

  throw new Error(`环境变量 ${name} 不是有效的审查级别`);
}

function parseGenerationVectorBackendEnv(
  name: string,
  fallback: GenerationVectorBackendKind,
): GenerationVectorBackendKind {
  const rawValue = process.env[name];

  if (typeof rawValue === 'undefined') {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (normalized === 'json_cache' || normalized === 'sqlite_vec') {
    return normalized;
  }

  throw new Error(`环境变量 ${name} 不是有效的向量后端类型`);
}

export function loadServerEnv(): ServerEnv {
  const port = Number(process.env.PORT ?? '3001');

  if (Number.isNaN(port)) {
    throw new Error('环境变量 PORT 不是有效数字');
  }

  return {
    port,
    host: process.env.HOST ?? '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
    defaultModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    embeddingApiKey: process.env.EMBEDDING_API_KEY?.trim() || undefined,
    embeddingBaseUrl: process.env.EMBEDDING_BASE_URL?.trim() || undefined,
    embeddingDimensions:
      typeof process.env.EMBEDDING_DIMENSIONS === 'undefined'
        ? undefined
        : parseIntegerEnv('EMBEDDING_DIMENSIONS', 0) || undefined,
    openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL?.trim() || undefined,
    sqliteVecExtensionPath: process.env.SQLITE_VEC_EXTENSION_PATH?.trim() || undefined,
    generationVectorBackend: parseGenerationVectorBackendEnv('GENERATION_VECTOR_BACKEND', 'json_cache'),
    generationDataDir: process.env.GENERATION_DATA_DIR?.trim() || '.data',
    generationGateConfig: {
      reviewRewriteMinSeverity: parseReviewSeverityEnv(
        'GENERATION_REVIEW_REWRITE_MIN_SEVERITY',
        'critical',
      ),
      reviewMaxRewriteCount: parseIntegerEnv('GENERATION_REVIEW_MAX_REWRITE_COUNT', 2),
      reviewScoreThresholds: {
        consistency: parseScoreEnv('GENERATION_REVIEW_CONSISTENCY_MIN_SCORE', 60),
        continuity: parseScoreEnv('GENERATION_REVIEW_CONTINUITY_MIN_SCORE', 60),
        reader_pull: parseScoreEnv('GENERATION_REVIEW_READER_PULL_MIN_SCORE', 60),
      },
      polishFailBlockReady: parseBooleanEnv('GENERATION_POLISH_FAIL_BLOCK_READY', true),
      lightweightRecall: {
        minScore: parseScoreEnv('GENERATION_LIGHTWEIGHT_RECALL_MIN_SCORE', 3),
        topK: parseIntegerEnv('GENERATION_LIGHTWEIGHT_RECALL_TOP_K', 4),
        phraseWeight: parseIntegerEnv('GENERATION_LIGHTWEIGHT_RECALL_PHRASE_WEIGHT', 2),
        entityWeight: parseIntegerEnv('GENERATION_LIGHTWEIGHT_RECALL_ENTITY_WEIGHT', 3),
        recencyWeight: parseIntegerEnv('GENERATION_LIGHTWEIGHT_RECALL_RECENCY_WEIGHT', 1),
      },
    },
    promptConfig: {
      enableCoreConstraints: parseBooleanEnv(
        'PROMPT_ENABLE_CORE_CONSTRAINTS',
        DEFAULT_PROMPT_CONFIG.enableCoreConstraints,
      ),
      enableAntiAI: parseBooleanEnv('PROMPT_ENABLE_ANTI_AI', DEFAULT_PROMPT_CONFIG.enableAntiAI),
      enableStrandWeave: parseBooleanEnv(
        'PROMPT_ENABLE_STRAND_WEAVE',
        DEFAULT_PROMPT_CONFIG.enableStrandWeave,
      ),
      enableCoolPoints: parseBooleanEnv(
        'PROMPT_ENABLE_COOL_POINTS',
        DEFAULT_PROMPT_CONFIG.enableCoolPoints,
      ),
      enableNoPoison: parseBooleanEnv('PROMPT_ENABLE_NO_POISON', DEFAULT_PROMPT_CONFIG.enableNoPoison),
    },
  };
}
