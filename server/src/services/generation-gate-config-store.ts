import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ServerEnv } from '../config/env.js';
import type { GenerationGateConfig, LightweightRecallConfig, ReviewScoreThresholds, ReviewSeverity } from '../types/ai.js';
import { getGenerationDatabase } from './generation-sqlite.js';

let configLock = Promise.resolve();
let configMigrationChecked = false;

function withConfigLock<T>(task: () => Promise<T>) {
  const result = configLock.then(task, task);
  configLock = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function getLegacyConfigFilePath(env: ServerEnv) {
  return path.resolve(process.cwd(), env.generationDataDir, 'generation-gate-config.json');
}

function normalizeSeverity(value: unknown, fallback: ReviewSeverity): ReviewSeverity {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : fallback;
}

function normalizeScore(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.trunc(value);
}

function normalizeScoreThresholds(raw: unknown, fallback: ReviewScoreThresholds): ReviewScoreThresholds {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<ReviewScoreThresholds>;

  return {
    consistency: normalizeScore(candidate.consistency, fallback.consistency),
    continuity: normalizeScore(candidate.continuity, fallback.continuity),
    reader_pull: normalizeScore(candidate.reader_pull, fallback.reader_pull),
  };
}

function normalizeLightweightRecall(raw: unknown, fallback: LightweightRecallConfig): LightweightRecallConfig {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<LightweightRecallConfig>;

  return {
    minScore: normalizeScore(candidate.minScore, fallback.minScore),
    topK: normalizeNonNegativeInteger(candidate.topK, fallback.topK),
    phraseWeight: normalizeNonNegativeInteger(candidate.phraseWeight, fallback.phraseWeight),
    entityWeight: normalizeNonNegativeInteger(candidate.entityWeight, fallback.entityWeight),
    recencyWeight: normalizeNonNegativeInteger(candidate.recencyWeight, fallback.recencyWeight),
  };
}

function normalizeConfig(raw: unknown, fallback: GenerationGateConfig): GenerationGateConfig {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<GenerationGateConfig>;
  const reviewMaxRewriteCount =
    typeof candidate.reviewMaxRewriteCount === 'number' &&
    Number.isInteger(candidate.reviewMaxRewriteCount) &&
    candidate.reviewMaxRewriteCount >= 0
      ? candidate.reviewMaxRewriteCount
      : fallback.reviewMaxRewriteCount;

  return {
    reviewRewriteMinSeverity: normalizeSeverity(candidate.reviewRewriteMinSeverity, fallback.reviewRewriteMinSeverity),
    reviewMaxRewriteCount,
    reviewScoreThresholds: normalizeScoreThresholds(candidate.reviewScoreThresholds, fallback.reviewScoreThresholds),
    polishFailBlockReady:
      typeof candidate.polishFailBlockReady === 'boolean'
        ? candidate.polishFailBlockReady
        : fallback.polishFailBlockReady,
    lightweightRecall: normalizeLightweightRecall(candidate.lightweightRecall, fallback.lightweightRecall),
  };
}

function readConfigRow(env: ServerEnv) {
  const db = getGenerationDatabase(env);
  return db.prepare('SELECT value_json FROM generation_runtime_config WHERE key = ?').get('default') as
    | { value_json?: string }
    | undefined;
}

function writeConfigRow(env: ServerEnv, config: GenerationGateConfig) {
  const db = getGenerationDatabase(env);
  db.prepare(`
    INSERT INTO generation_runtime_config (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run('default', JSON.stringify(config), new Date().toISOString());
}

function ensureMigratedFromLegacyJson(env: ServerEnv) {
  if (configMigrationChecked) {
    return;
  }

  const row = readConfigRow(env);

  if (row?.value_json) {
    configMigrationChecked = true;
    return;
  }

  const legacyConfigFilePath = getLegacyConfigFilePath(env);

  if (!existsSync(legacyConfigFilePath)) {
    configMigrationChecked = true;
    return;
  }

  try {
    const rawText = readFileSync(legacyConfigFilePath, 'utf8');
    const parsed = JSON.parse(rawText) as unknown;
    const nextConfig = normalizeConfig(parsed, env.generationGateConfig);
    writeConfigRow(env, nextConfig);
    env.generationGateConfig = nextConfig;
  } finally {
    configMigrationChecked = true;
  }
}

export function hydrateGenerationGateConfig(env: ServerEnv) {
  return withConfigLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const row = readConfigRow(env);

    if (row?.value_json) {
      env.generationGateConfig = normalizeConfig(JSON.parse(row.value_json), env.generationGateConfig);
    }

    return env.generationGateConfig;
  });
}

export function getGenerationGateConfig(env: ServerEnv) {
  return withConfigLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const row = readConfigRow(env);
    const nextConfig = row?.value_json
      ? normalizeConfig(JSON.parse(row.value_json), env.generationGateConfig)
      : env.generationGateConfig;

    env.generationGateConfig = nextConfig;
    return nextConfig;
  });
}

export function updateGenerationGateConfig(env: ServerEnv, rawConfig: unknown) {
  return withConfigLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const nextConfig = normalizeConfig(rawConfig, env.generationGateConfig);
    writeConfigRow(env, nextConfig);
    env.generationGateConfig = nextConfig;
    return nextConfig;
  });
}
