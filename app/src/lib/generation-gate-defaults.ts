import type { GenerationGateConfig, LightweightRecallConfig, ReviewSeverity } from '@/types';

const REVIEW_SEVERITIES: ReviewSeverity[] = ['critical', 'high', 'medium', 'low'];

export interface LightweightRecallPreset {
  key: 'balanced' | 'entity_first' | 'recency_first' | 'keyword_first';
  label: string;
  description: string;
  weights: Pick<LightweightRecallConfig, 'phraseWeight' | 'entityWeight' | 'recencyWeight'>;
}

export const DEFAULT_GENERATION_GATE_CONFIG: GenerationGateConfig = {
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

export const LIGHTWEIGHT_RECALL_PRESETS: LightweightRecallPreset[] = [
  {
    key: 'balanced',
    label: '均衡',
    description: '保留当前默认比例，适合先做基线标定。',
    weights: {
      phraseWeight: 2,
      entityWeight: 3,
      recencyWeight: 1,
    },
  },
  {
    key: 'entity_first',
    label: '实体优先',
    description: '更强调人物、道具和设定实体命中。',
    weights: {
      phraseWeight: 1,
      entityWeight: 4,
      recencyWeight: 1,
    },
  },
  {
    key: 'recency_first',
    label: '近期优先',
    description: '更强调章节距离，适合承接近期剧情线索。',
    weights: {
      phraseWeight: 1,
      entityWeight: 2,
      recencyWeight: 3,
    },
  },
  {
    key: 'keyword_first',
    label: '关键词优先',
    description: '更强调 query phrase 命中，适合强锚点检索。',
    weights: {
      phraseWeight: 4,
      entityWeight: 2,
      recencyWeight: 1,
    },
  },
];

function normalizeScore(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.trunc(value);
}

function normalizeReviewSeverity(value: unknown, fallback: ReviewSeverity): ReviewSeverity {
  return REVIEW_SEVERITIES.includes(value as ReviewSeverity) ? (value as ReviewSeverity) : fallback;
}

export function normalizeLightweightRecallConfig(
  value: Partial<LightweightRecallConfig> | null | undefined,
): LightweightRecallConfig {
  const candidate = value ?? {};
  const fallback = DEFAULT_GENERATION_GATE_CONFIG.lightweightRecall;

  return {
    minScore: normalizeScore(candidate.minScore, fallback.minScore),
    topK: normalizeNonNegativeInteger(candidate.topK, fallback.topK),
    phraseWeight: normalizeNonNegativeInteger(candidate.phraseWeight, fallback.phraseWeight),
    entityWeight: normalizeNonNegativeInteger(candidate.entityWeight, fallback.entityWeight),
    recencyWeight: normalizeNonNegativeInteger(candidate.recencyWeight, fallback.recencyWeight),
  };
}

export function applyLightweightRecallPreset(
  current: LightweightRecallConfig,
  presetKey: LightweightRecallPreset['key'],
): LightweightRecallConfig {
  const preset = LIGHTWEIGHT_RECALL_PRESETS.find((item) => item.key === presetKey);

  if (!preset) {
    return current;
  }

  return {
    ...current,
    ...preset.weights,
  };
}

export function findMatchingLightweightRecallPreset(
  config: LightweightRecallConfig,
): LightweightRecallPreset | null {
  return (
    LIGHTWEIGHT_RECALL_PRESETS.find(
      (preset) =>
        preset.weights.phraseWeight === config.phraseWeight &&
        preset.weights.entityWeight === config.entityWeight &&
        preset.weights.recencyWeight === config.recencyWeight,
    ) ?? null
  );
}

export function normalizeGenerationGateConfig(
  value: Partial<GenerationGateConfig> | null | undefined,
): GenerationGateConfig {
  const candidate = value ?? {};
  const fallback = DEFAULT_GENERATION_GATE_CONFIG;

  return {
    reviewRewriteMinSeverity: normalizeReviewSeverity(
      candidate.reviewRewriteMinSeverity,
      fallback.reviewRewriteMinSeverity,
    ),
    reviewMaxRewriteCount: normalizeNonNegativeInteger(
      candidate.reviewMaxRewriteCount,
      fallback.reviewMaxRewriteCount,
    ),
    reviewScoreThresholds: {
      consistency: normalizeScore(
        candidate.reviewScoreThresholds?.consistency,
        fallback.reviewScoreThresholds.consistency,
      ),
      continuity: normalizeScore(
        candidate.reviewScoreThresholds?.continuity,
        fallback.reviewScoreThresholds.continuity,
      ),
      reader_pull: normalizeScore(
        candidate.reviewScoreThresholds?.reader_pull,
        fallback.reviewScoreThresholds.reader_pull,
      ),
    },
    polishFailBlockReady:
      typeof candidate.polishFailBlockReady === 'boolean'
        ? candidate.polishFailBlockReady
        : fallback.polishFailBlockReady,
    lightweightRecall: normalizeLightweightRecallConfig(candidate.lightweightRecall),
  };
}
