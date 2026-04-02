import type { GenerationGateConfig } from '@/types';

function normalizeServerUrl(serverUrl: string) {
  return serverUrl.replace(/\/+$/, '');
}

function extractErrorMessage(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as { message?: string };
    return parsed.message || rawText;
  } catch {
    return rawText;
  }
}

export async function fetchGenerationGateConfig(serverUrl: string) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/runtime/generation-gate`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  const parsed = (await response.json()) as { config: GenerationGateConfig };
  return parsed.config;
}

export async function saveGenerationGateConfig(serverUrl: string, config: GenerationGateConfig) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/runtime/generation-gate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  const parsed = (await response.json()) as { config: GenerationGateConfig };
  return parsed.config;
}
