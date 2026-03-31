import type { AppSettings } from '@/types';

export const DEFAULT_SERVER_URL = 'http://localhost:3001';

export const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: DEFAULT_SERVER_URL,
  modelName: 'gpt-5.4-mini',
  temperature: 0.7,
  stylePrompt: '',
};

export const FRONTEND_RUNTIME_CONTRACT = {
  frontendVisible: ['serverUrl'] as const,
  serverOnly: ['OPENAI_API_KEY'] as const,
};
