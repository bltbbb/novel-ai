import type { AIReasoningEffort, AppSettings, ReasoningEffortSetting } from '@/types';

export const DEFAULT_SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim() || 'http://localhost:3001';
export const REASONING_EFFORT_OPTIONS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: DEFAULT_SERVER_URL,
  modelName: 'gpt-5.4-mini',
  temperature: 0.7,
  stylePrompt: '',
  reasoningEffort: 'model_default',
};

export const FRONTEND_RUNTIME_CONTRACT = {
  frontendVisible: [] as const,
  serverOnly: [] as const,
};

export function isAIReasoningEffort(value: unknown): value is AIReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORT_OPTIONS.includes(value as AIReasoningEffort);
}

export function normalizeReasoningEffortSetting(value: unknown): ReasoningEffortSetting {
  return isAIReasoningEffort(value) ? value : 'model_default';
}

export function getRequestReasoningEffort(settings: Pick<AppSettings, 'reasoningEffort'>): AIReasoningEffort | undefined {
  return settings.reasoningEffort === 'model_default' ? undefined : settings.reasoningEffort;
}

export function buildModelRequestConfig(
  settings: Pick<AppSettings, 'modelName' | 'temperature' | 'reasoningEffort'>,
) {
  const reasoningEffort = getRequestReasoningEffort(settings);

  return {
    model: settings.modelName,
    temperature: settings.temperature,
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}
