import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ServerEnv } from '../config/env.js';
import { buildWritingRulesPrompt, WRITING_RULES_MARKER } from '../prompts/index.js';
import type { AIChatRequest } from '../types/ai.js';

function hasWritingRules(systemPrompt?: string) {
  return Boolean(systemPrompt?.includes(WRITING_RULES_MARKER));
}

function buildSystemMessage(env: ServerEnv, request: AIChatRequest) {
  const parts: string[] = [];

  if (request.systemPrompt?.trim()) {
    parts.push(request.systemPrompt.trim());
  }

  if (!hasWritingRules(request.systemPrompt)) {
    parts.push(buildWritingRulesPrompt(env.promptConfig));
  }

  if (request.references && request.references.length > 0) {
    const referenceBlock = request.references
      .map((reference, index) => {
        const lines = [`${index + 1}. ${reference.label} [${reference.type}]`];

        if (reference.excerpt?.trim()) {
          lines.push(reference.excerpt.trim());
        }

        return lines.join('\n');
      })
      .join('\n\n');

    parts.push(`以下是调用方补充的参考上下文，请在续写时优先参考：\n${referenceBlock}`);
  }

  return parts.join('\n\n').trim();
}

function buildMessages(env: ServerEnv, request: AIChatRequest): ChatCompletionMessageParam[] {
  const systemMessage = buildSystemMessage(env, request);
  const messages: ChatCompletionMessageParam[] = [];

  if (systemMessage) {
    messages.push({
      role: 'system',
      content: systemMessage,
    });
  }

  for (const message of request.messages) {
    messages.push({
      role: message.role,
      content: message.content,
    });
  }

  return messages;
}

function buildMissingChoicesErrorDetails(input: {
  model: string;
  response: unknown;
}) {
  const candidate = input.response && typeof input.response === 'object'
    ? input.response as Record<string, unknown>
    : {};

  return JSON.stringify({
    model: input.model,
    object: typeof candidate.object === 'string' ? candidate.object : '',
    id: typeof candidate.id === 'string' ? candidate.id : '',
    hasChoices: Array.isArray(candidate.choices),
    choiceCount: Array.isArray(candidate.choices) ? candidate.choices.length : 0,
  });
}

function ensureChoicesArray(input: {
  model: string;
  response: unknown;
  contextLabel: '聊天完成响应' | '流式聊天分片';
}) {
  const candidate = input.response && typeof input.response === 'object'
    ? input.response as Record<string, unknown>
    : {};
  const choices = candidate.choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(
      `${input.contextLabel}结构异常：缺少 choices。上下文：${buildMissingChoicesErrorDetails({
        model: input.model,
        response: input.response,
      })}`,
    );
  }

  return choices;
}

function normalizeChatCompletionResponse(response: unknown) {
  if (typeof response !== 'string') {
    return response;
  }

  const trimmed = response.trim();

  if (!trimmed) {
    return response;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return response;
  }
}

export function createOpenAIClient(env: ServerEnv) {
  if (!env.openaiApiKey) {
    throw new Error('缺少 OPENAI_API_KEY，无法建立 OpenAI 客户端');
  }

  return new OpenAI({
    apiKey: env.openaiApiKey,
    baseURL: env.openaiBaseUrl,
  });
}

function createEmbeddingClient(env: ServerEnv) {
  const apiKey = env.embeddingApiKey || env.openaiApiKey;

  if (!apiKey) {
    throw new Error('缺少 EMBEDDING_API_KEY 或 OPENAI_API_KEY，无法建立 embedding 客户端');
  }

  return new OpenAI({
    apiKey,
    baseURL: env.embeddingBaseUrl || env.openaiBaseUrl,
  });
}

function shouldUseZhipuNativeEmbeddings(env: ServerEnv, model: string) {
  const baseUrl = (env.embeddingBaseUrl || '').trim().toLowerCase();
  return Boolean(baseUrl.includes('open.bigmodel.cn/api/paas/v4') && model === 'embedding-3');
}

async function createZhipuEmbeddings(
  env: ServerEnv,
  inputs: string[],
  model: string,
) {
  const apiKey = env.embeddingApiKey?.trim();
  const baseUrl = env.embeddingBaseUrl?.trim();

  if (!apiKey || !baseUrl) {
    throw new Error('智谱 embedding-3 需要同时配置 EMBEDDING_API_KEY 与 EMBEDDING_BASE_URL');
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/u, '')}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: inputs,
      ...(env.embeddingDimensions ? { dimensions: env.embeddingDimensions } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`智谱 embeddings 请求失败：${response.status} ${errorText}`);
  }

  const payload = await response.json() as {
    data?: Array<{
      embedding?: unknown;
    }>;
  };

  return Array.isArray(payload.data)
    ? payload.data.map((item) =>
        Array.isArray(item.embedding)
          ? item.embedding.filter((value): value is number => typeof value === 'number')
          : [],
      )
    : [];
}

export async function streamChatCompletion(env: ServerEnv, request: AIChatRequest) {
  const client = createOpenAIClient(env);
  const resolvedModel = request.model || env.defaultModel;
  const stream = await client.chat.completions.create({
    model: resolvedModel,
    temperature: request.temperature,
    messages: buildMessages(env, request),
    stream: true,
  });

  async function* validatedStream() {
    for await (const part of stream) {
      ensureChoicesArray({
        model: resolvedModel,
        response: part,
        contextLabel: '流式聊天分片',
      });
      yield part;
    }
  }

  return validatedStream();
}

export async function completeChatCompletion(env: ServerEnv, request: AIChatRequest) {
  const client = createOpenAIClient(env);
  const completion = await client.chat.completions.create({
    model: request.model || env.defaultModel,
    temperature: request.temperature,
    messages: buildMessages(env, request),
    stream: false,
  });
  const resolvedModel = request.model || env.defaultModel;
  const normalizedCompletion = normalizeChatCompletionResponse(completion);
  const choices = ensureChoicesArray({
    model: resolvedModel,
    response: normalizedCompletion,
    contextLabel: '聊天完成响应',
  });
  const firstChoice = choices[0];
  const content = typeof firstChoice?.message?.content === 'string'
    ? firstChoice.message.content
    : '';

  if (!content.trim()) {
    throw new Error(
      `聊天完成响应结构异常：首条 choice 未返回可用文本内容。上下文：${buildMissingChoicesErrorDetails({
        model: resolvedModel,
        response: normalizedCompletion,
      })}`,
    );
  }

  return content;
}

export async function createEmbeddings(
  env: ServerEnv,
  inputs: string[],
  model?: string,
) {
  if (inputs.length === 0) {
    return [] as number[][];
  }

  const resolvedModel = model || env.openaiEmbeddingModel || env.defaultModel;

  if (resolvedModel === 'local-hash') {
    return inputs.map((input) => {
      const vector: number[] = [];

      for (let index = 0; index < 64; index += 1) {
        const digest = createHash('sha256').update(`${index}:${input.trim()}`).digest();
        const value = (digest[0] / 255) * 2 - 1;
        vector.push(Number(value.toFixed(6)));
      }

      return vector;
    });
  }

  if (shouldUseZhipuNativeEmbeddings(env, resolvedModel)) {
    return createZhipuEmbeddings(env, inputs, resolvedModel);
  }

  const client = createEmbeddingClient(env);
  const response = await client.embeddings.create({
    model: resolvedModel,
    input: inputs,
    ...(env.embeddingDimensions ? { dimensions: env.embeddingDimensions } : {}),
  });

  return response.data.map((item) => item.embedding);
}
