import type { AIProviderPreset } from '@/types';

export const AI_PROVIDER_PRESETS: Array<{
  value: AIProviderPreset;
  label: string;
  baseUrl: string;
}> = [
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { value: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1' },
  { value: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { value: 'dashscope', label: '阿里百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { value: 'zhipu', label: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { value: 'custom', label: '自定义', baseUrl: '' },
];

export function getProviderDefaultBaseUrl(provider: AIProviderPreset) {
  return AI_PROVIDER_PRESETS.find((item) => item.value === provider)?.baseUrl || '';
}
