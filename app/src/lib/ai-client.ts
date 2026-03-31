import type { AIChatRequest, AIStreamChunk } from '@/types';

function createApiUrl(serverUrl: string, path: string) {
  return `${serverUrl.replace(/\/+$/, '')}${path}`;
}

function isAIStreamChunk(value: unknown): value is AIStreamChunk {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const chunk = value as Partial<AIStreamChunk>;
  const errorValid = typeof chunk.error === 'undefined' || typeof chunk.error === 'string';
  return typeof chunk.delta === 'string' && typeof chunk.done === 'boolean' && errorValid;
}

function extractErrorMessage(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as { message?: string };
    return parsed.message || rawText;
  } catch {
    return rawText;
  }
}

export async function* streamChat(
  serverUrl: string,
  request: AIChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(createApiUrl(serverUrl, '/api/ai/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `AI 请求失败：${response.status}`);
  }

  if (!response.body) {
    throw new Error('服务端未返回可读取的数据流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let separatorIndex = buffer.indexOf('\n\n');

    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const rawPayload = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');

      if (rawPayload) {
        const parsed = JSON.parse(rawPayload) as unknown;

        if (!isAIStreamChunk(parsed)) {
          throw new Error('服务端返回了无法识别的流式数据');
        }

        if (parsed.error) {
          throw new Error(parsed.error);
        }

        if (parsed.delta) {
          yield parsed.delta;
        }

        if (parsed.done) {
          return;
        }
      }

      separatorIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      break;
    }
  }
}
