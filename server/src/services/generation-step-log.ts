import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ServerEnv } from '../config/env.js';
import type { AIChatRequest } from '../types/ai.js';
import { previewOutgoingChatRequest, type ChatRuntimeOverride } from './openai.js';

export function getGenerationStepLogFilePath(env: ServerEnv) {
  return path.resolve(process.cwd(), env.generationDataDir, 'logs', 'generation-step-events.jsonl');
}

export async function appendGenerationStepLog(
  env: ServerEnv,
  input: {
    stage: string;
    request: AIChatRequest;
    chapterId?: string;
    chapterTitle?: string;
    responseText?: string;
    errorMessage?: string;
    runtimeOverride?: ChatRuntimeOverride;
  },
) {
  const preview = previewOutgoingChatRequest(env, input.request, input.runtimeOverride);
  const filePath = getGenerationStepLogFilePath(env);
  const requestBody = (() => {
    try {
      return JSON.parse(preview.requestBody) as unknown;
    } catch {
      return preview.requestBody;
    }
  })();

  await mkdir(path.dirname(filePath), { recursive: true });

  const entry = {
    id: randomUUID(),
    loggedAt: new Date().toISOString(),
    stage: input.stage,
    projectId: input.request.projectId,
    chapterId: input.chapterId ?? input.request.chapterId ?? null,
    chapterTitle: input.chapterTitle ?? null,
    model: preview.model,
    transport: preview.transport,
    requestUrl: preview.requestUrl,
    runtime: preview.runtime,
    requestBody,
    responseText: input.responseText ?? '',
    errorMessage: input.errorMessage ?? '',
  };

  await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
}
