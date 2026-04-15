import type { ServerEnv } from '../config/env.js';
import type { AIRuntimeConfig, AIProviderPreset } from '../types/ai.js';
import { getGenerationDatabase } from './generation-sqlite.js';

const AI_RUNTIME_CONFIG_KEY = 'ai-runtime';

const PROVIDER_BASE_URLS: Record<Exclude<AIProviderPreset, 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  claude_compatible: 'https://api.anthropic.com/v1',
};

let configLock = Promise.resolve();

function withConfigLock<T>(task: () => Promise<T>) {
  const result = configLock.then(task, task);
  configLock = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function hasOwnProperty(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(value: unknown) {
  return normalizeText(value).replace(/\/+$/u, '');
}

function normalizeProvider(value: unknown, fallback: AIProviderPreset): AIProviderPreset {
  return value === 'openai' ||
    value === 'deepseek' ||
    value === 'siliconflow' ||
    value === 'openrouter' ||
    value === 'dashscope' ||
    value === 'zhipu' ||
    value === 'claude_compatible' ||
    value === 'custom'
    ? value
    : fallback;
}

function inferProviderFromBaseUrl(baseUrl?: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl).toLowerCase();

  if (!normalizedBaseUrl) {
    return 'openai' as AIProviderPreset;
  }

  for (const [provider, providerBaseUrl] of Object.entries(PROVIDER_BASE_URLS) as Array<
    [Exclude<AIProviderPreset, 'custom'>, string]
  >) {
    if (normalizedBaseUrl === providerBaseUrl.toLowerCase()) {
      return provider;
    }
  }

  return 'custom' as AIProviderPreset;
}

function resolveBaseUrl(provider: AIProviderPreset, rawBaseUrl: unknown, fallbackBaseUrl: string) {
  if (provider === 'custom' || provider === 'claude_compatible') {
    return normalizeBaseUrl(rawBaseUrl) || fallbackBaseUrl;
  }

  return PROVIDER_BASE_URLS[provider];
}

function getEnvConfig(env: ServerEnv): AIRuntimeConfig {
  const inferredProvider = inferProviderFromBaseUrl(env.openaiBaseUrl);
  const fallbackBaseUrl =
    normalizeBaseUrl(env.openaiBaseUrl) ||
    (inferredProvider === 'custom' ? '' : PROVIDER_BASE_URLS[inferredProvider]);

  return {
    provider: inferredProvider,
    apiKey: env.openaiApiKey.trim(),
    baseUrl: fallbackBaseUrl,
    defaultModel: env.defaultModel.trim(),
    embeddingModel: normalizeText(env.openaiEmbeddingModel) || undefined,
  };
}

function normalizeConfig(raw: unknown, fallback: AIRuntimeConfig): AIRuntimeConfig {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<AIRuntimeConfig>;
  const provider = normalizeProvider(candidate.provider, fallback.provider);
  const baseUrl = resolveBaseUrl(provider, candidate.baseUrl, fallback.baseUrl);
  const defaultModel =
    candidate && typeof candidate === 'object' && hasOwnProperty(candidate, 'defaultModel')
      ? normalizeText(candidate.defaultModel) || fallback.defaultModel
      : fallback.defaultModel;
  const apiKey =
    candidate && typeof candidate === 'object' && hasOwnProperty(candidate, 'apiKey')
      ? normalizeText(candidate.apiKey)
      : fallback.apiKey;
  const embeddingModel = fallback.embeddingModel;

  return {
    provider,
    apiKey,
    baseUrl,
    defaultModel,
    embeddingModel,
  };
}

function applyConfigToEnv(env: ServerEnv, config: AIRuntimeConfig) {
  env.openaiProvider = config.provider;
  env.openaiApiKey = config.apiKey;
  env.openaiBaseUrl = config.baseUrl || undefined;
  env.defaultModel = config.defaultModel;
}

function readConfigRow(env: ServerEnv) {
  const db = getGenerationDatabase(env);
  return db.prepare('SELECT value_json FROM generation_runtime_config WHERE key = ?').get(AI_RUNTIME_CONFIG_KEY) as
    | { value_json?: string }
    | undefined;
}

function writeConfigRow(env: ServerEnv, config: AIRuntimeConfig) {
  const db = getGenerationDatabase(env);
  db.prepare(`
    INSERT INTO generation_runtime_config (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(AI_RUNTIME_CONFIG_KEY, JSON.stringify(config), new Date().toISOString());
}

export function hydrateAIRuntimeConfig(env: ServerEnv) {
  return withConfigLock(async () => {
    const fallback = getEnvConfig(env);
    const row = readConfigRow(env);
    const nextConfig = row?.value_json
      ? normalizeConfig(JSON.parse(row.value_json), fallback)
      : fallback;

    applyConfigToEnv(env, nextConfig);
    return nextConfig;
  });
}

export function getAIRuntimeConfig(env: ServerEnv) {
  return withConfigLock(async () => {
    const fallback = getEnvConfig(env);
    const row = readConfigRow(env);
    const nextConfig = row?.value_json
      ? normalizeConfig(JSON.parse(row.value_json), fallback)
      : fallback;

    applyConfigToEnv(env, nextConfig);
    return nextConfig;
  });
}

export function updateAIRuntimeConfig(env: ServerEnv, rawConfig: unknown) {
  return withConfigLock(async () => {
    const baseConfig = getEnvConfig(env);
    const row = readConfigRow(env);
    const fallback = row?.value_json
      ? normalizeConfig(JSON.parse(row.value_json), baseConfig)
      : baseConfig;
    const nextConfig = normalizeConfig(rawConfig, fallback);
    writeConfigRow(env, nextConfig);
    applyConfigToEnv(env, nextConfig);
    return nextConfig;
  });
}

export function resolveAIRuntimeProbeConfig(env: ServerEnv, rawConfig: unknown) {
  const fallback = getEnvConfig(env);
  return normalizeConfig(rawConfig, fallback);
}
