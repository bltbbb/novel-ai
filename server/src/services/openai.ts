import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ServerEnv } from '../config/env.js';
import { buildWritingRulesPrompt, WRITING_RULES_MARKER } from '../prompts/index.js';
import type { AIChatRequest, AIRuntimeModelOption, AIProviderPreset, AIReasoningEffort } from '../types/ai.js';

const OPENAI_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;
const CLAUDE_API_VERSION = '2023-06-01';
const CLAUDE_MAX_OUTPUT_TOKENS = 4096;

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

function buildClaudeSystemMessage(env: ServerEnv, request: AIChatRequest) {
  const parts: string[] = [];
  const baseSystemMessage = buildSystemMessage(env, request);

  if (baseSystemMessage) {
    parts.push(baseSystemMessage);
  }

  for (const message of request.messages) {
    if (message.role === 'system' && message.content.trim()) {
      parts.push(message.content.trim());
    }
  }

  return parts.join('\n\n').trim();
}

function buildClaudeMessages(request: AIChatRequest) {
  return request.messages
    .filter((message) => message.role !== 'system' && message.content.trim())
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));
}

function buildMissingChoicesErrorDetails(input: {
  model: string;
  response: unknown;
}) {
  const candidate = input.response && typeof input.response === 'object'
    ? input.response as Record<string, unknown>
    : {};
  const firstChoice = Array.isArray(candidate.choices) && candidate.choices.length > 0 && candidate.choices[0] && typeof candidate.choices[0] === 'object'
    ? candidate.choices[0] as Record<string, unknown>
    : {};
  const firstMessage = firstChoice.message && typeof firstChoice.message === 'object'
    ? firstChoice.message as Record<string, unknown>
    : {};

  return JSON.stringify({
    model: input.model,
    object: typeof candidate.object === 'string' ? candidate.object : '',
    id: typeof candidate.id === 'string' ? candidate.id : '',
    hasChoices: Array.isArray(candidate.choices),
    choiceCount: Array.isArray(candidate.choices) ? candidate.choices.length : 0,
    finishReason: typeof firstChoice.finish_reason === 'string' ? firstChoice.finish_reason : '',
    contentType: Array.isArray(firstMessage.content)
      ? 'array'
      : typeof firstMessage.content === 'string'
        ? 'string'
        : typeof firstMessage.content,
    hasRefusal: typeof firstMessage.refusal === 'string'
      ? Boolean(firstMessage.refusal.trim())
      : Array.isArray(firstMessage.refusal)
        ? firstMessage.refusal.length > 0
        : false,
    toolCallCount: Array.isArray(firstMessage.tool_calls) ? firstMessage.tool_calls.length : 0,
    contentKeys:
      firstMessage.content && typeof firstMessage.content === 'object' && !Array.isArray(firstMessage.content)
        ? Object.keys(firstMessage.content as Record<string, unknown>).slice(0, 8)
        : [],
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

function extractTextFromContentPart(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.text === 'string') {
    return candidate.text;
  }

  if (candidate.text && typeof candidate.text === 'object' && typeof (candidate.text as { value?: unknown }).value === 'string') {
    return (candidate.text as { value: string }).value;
  }

  if (typeof candidate.content === 'string') {
    return candidate.content;
  }

  if (typeof candidate.refusal === 'string') {
    return candidate.refusal;
  }

  if (typeof candidate.value === 'string') {
    return candidate.value;
  }

  return '';
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return extractTextFromContentPart(value).trim();
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => extractTextFromContentPart(item).trim())
    .filter(Boolean)
    .join('');
}

function extractRefusalContent(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return extractTextFromContentPart(value).trim();
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => extractTextFromContentPart(item).trim())
    .filter(Boolean)
    .join('');
}

function getFinishReason(choice: unknown) {
  if (!choice || typeof choice !== 'object') {
    return '';
  }

  return typeof (choice as { finish_reason?: unknown }).finish_reason === 'string'
    ? (choice as { finish_reason: string }).finish_reason
    : '';
}

function getToolCallNames(message: unknown) {
  if (!message || typeof message !== 'object') {
    return [] as string[];
  }

  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(toolCalls)) {
    return [] as string[];
  }

  return toolCalls
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      const functionCandidate = (item as { function?: unknown }).function;
      if (!functionCandidate || typeof functionCandidate !== 'object') {
        return '';
      }

      return typeof (functionCandidate as { name?: unknown }).name === 'string'
        ? (functionCandidate as { name: string }).name.trim()
        : '';
    })
    .filter(Boolean);
}

function extractChoiceContent(choice: unknown) {
  const message = choice && typeof choice === 'object' && (choice as { message?: unknown }).message && typeof (choice as { message?: unknown }).message === 'object'
    ? (choice as { message: Record<string, unknown> }).message
    : null;
  const content = extractTextContent(message?.content);
  const refusal = extractRefusalContent(message?.refusal);
  const toolCallNames = getToolCallNames(message);
  const finishReason = getFinishReason(choice);

  return {
    content,
    refusal,
    toolCallNames,
    finishReason,
  };
}

function extractStreamDeltaContent(choice: unknown) {
  const delta = choice && typeof choice === 'object' && (choice as { delta?: unknown }).delta && typeof (choice as { delta?: unknown }).delta === 'object'
    ? (choice as { delta: Record<string, unknown> }).delta
    : null;
  const content = extractTextContent(delta?.content);
  const refusal = extractRefusalContent(delta?.refusal);
  const finishReason = getFinishReason(choice);

  return {
    content,
    refusal,
    finishReason,
  };
}

async function collectStreamCompletionText(
  client: OpenAI,
  env: ServerEnv,
  request: AIChatRequest,
  resolvedModel: string,
) {
  const stream = await client.chat.completions.create(
    buildChatCompletionRequest(env, request, resolvedModel, true) as any,
  ) as unknown as AsyncIterable<any>;
  let text = '';

  for await (const part of stream) {
    ensureChoicesArray({
      model: resolvedModel,
      response: part,
      contextLabel: '流式聊天分片',
    });

    const firstChoice = part.choices[0];
    const { content, refusal } = extractStreamDeltaContent(firstChoice);

    if (refusal) {
      throw new Error(`模型拒绝响应：${refusal}`);
    }

    if (content) {
      text += content;
    }
  }

  return text.trim();
}

function supportsReasoningEffort(model: string) {
  const normalizedModel = model.trim().toLowerCase();

  return (
    normalizedModel.startsWith('gpt-5') ||
    normalizedModel.startsWith('o1') ||
    normalizedModel.startsWith('o3') ||
    normalizedModel.startsWith('o4')
  );
}

function resolveReasoningEffort(
  model: string,
  reasoningEffort?: AIReasoningEffort,
) {
  if (!reasoningEffort || !supportsReasoningEffort(model)) {
    return undefined;
  }

  return reasoningEffort;
}

function buildChatCompletionRequest(
  env: ServerEnv,
  request: AIChatRequest,
  resolvedModel: string,
  stream: boolean,
): Record<string, unknown> {
  const chatRequest = {
    model: resolvedModel,
    temperature: request.temperature,
    messages: buildMessages(env, request),
    stream,
  };
  const reasoningEffort = resolveReasoningEffort(resolvedModel, request.reasoningEffort);

  if (reasoningEffort) {
    (chatRequest as Record<string, unknown>).reasoning_effort = reasoningEffort;
  }

  return chatRequest;
}

function isClaudeCompatibleProvider(env: ServerEnv) {
  return env.openaiProvider === 'claude_compatible';
}

function supportsClaudeEffort(model: string) {
  const normalizedModel = model.trim().toLowerCase();

  return (
    normalizedModel.includes('claude-mythos') ||
    normalizedModel.includes('claude-opus-4-6') ||
    normalizedModel.includes('claude-sonnet-4-6') ||
    normalizedModel.includes('claude-opus-4-5')
  );
}

function resolveClaudeEffort(
  model: string,
  reasoningEffort?: AIReasoningEffort,
) {
  if (!reasoningEffort || !supportsClaudeEffort(model)) {
    return undefined;
  }

  if (
    reasoningEffort === 'none' ||
    reasoningEffort === 'minimal' ||
    reasoningEffort === 'low'
  ) {
    return 'low' as const;
  }

  if (reasoningEffort === 'medium') {
    return 'medium' as const;
  }

  if (reasoningEffort === 'xhigh') {
    return 'max' as const;
  }

  return 'high' as const;
}

function buildClaudeMessagesRequest(
  env: ServerEnv,
  request: AIChatRequest,
  resolvedModel: string,
  stream: boolean,
) {
  const system = buildClaudeSystemMessage(env, request);
  const effort = resolveClaudeEffort(resolvedModel, request.reasoningEffort);

  return {
    model: resolvedModel,
    temperature: request.temperature,
    max_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
    messages: buildClaudeMessages(request),
    stream,
    ...(system ? { system } : {}),
    ...(effort ? { output_config: { effort } } : {}),
  };
}

function getClaudeMessagesUrl(env: ServerEnv) {
  return `${(env.openaiBaseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/u, '')}/messages`;
}

async function createClaudeMessagesResponse(
  env: ServerEnv,
  request: AIChatRequest,
  resolvedModel: string,
  stream: boolean,
) {
  const response = await fetch(getClaudeMessagesUrl(env), {
    method: 'POST',
    headers: {
      'x-api-key': env.openaiApiKey,
      'anthropic-version': CLAUDE_API_VERSION,
      'Content-Type': 'application/json',
      Accept: stream ? 'text/event-stream' : 'application/json',
    },
    body: JSON.stringify(buildClaudeMessagesRequest(env, request, resolvedModel, stream)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude Messages 请求失败：${response.status} ${errorText}`);
  }

  return response;
}

async function parseClaudeMessagesResponse(response: Response) {
  return await response.json() as {
    content?: unknown;
    stop_reason?: unknown;
    error?: {
      message?: unknown;
    };
  };
}

function extractClaudeErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const error = (payload as { error?: unknown }).error;

  if (!error || typeof error !== 'object') {
    return '';
  }

  return typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message.trim()
    : '';
}

function toPseudoOpenAIStreamPart(text: string) {
  return {
    choices: [
      {
        delta: {
          content: text,
        },
      },
    ],
  };
}

function findSseEventDelimiter(buffer: string) {
  const crlfIndex = buffer.indexOf('\r\n\r\n');

  if (crlfIndex !== -1) {
    return {
      index: crlfIndex,
      length: 4,
    };
  }

  const lfIndex = buffer.indexOf('\n\n');

  if (lfIndex !== -1) {
    return {
      index: lfIndex,
      length: 2,
    };
  }

  return null;
}

function parseClaudeStreamDelta(rawEvent: string) {
  const dataLines = rawEvent
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (dataLines.length === 0) {
    return '';
  }

  const rawData = dataLines.join('\n');

  if (rawData === '[DONE]') {
    return '';
  }

  const payload = JSON.parse(rawData) as Record<string, unknown>;

  if (payload.type === 'error') {
    throw new Error(extractClaudeErrorMessage(payload) || 'Claude 流式响应返回错误事件');
  }

  if (payload.type !== 'content_block_delta') {
    return '';
  }

  const delta = payload.delta && typeof payload.delta === 'object'
    ? payload.delta as Record<string, unknown>
    : null;

  if (delta?.type !== 'text_delta' || typeof delta.text !== 'string') {
    return '';
  }

  return delta.text;
}

async function* streamClaudeMessages(
  env: ServerEnv,
  request: AIChatRequest,
  resolvedModel: string,
) {
  const response = await createClaudeMessagesResponse(env, request, resolvedModel, true);

  if (!response.body) {
    throw new Error('Claude 流式响应缺少响应体');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const delimiter = findSseEventDelimiter(buffer);

        if (!delimiter) {
          break;
        }

        const rawEvent = buffer.slice(0, delimiter.index).trim();
        buffer = buffer.slice(delimiter.index + delimiter.length);

        if (!rawEvent) {
          continue;
        }

        const textDelta = parseClaudeStreamDelta(rawEvent);

        if (textDelta) {
          yield toPseudoOpenAIStreamPart(textDelta);
        }
      }
    }

    const tail = buffer.trim();

    if (tail) {
      const textDelta = parseClaudeStreamDelta(tail);

      if (textDelta) {
        yield toPseudoOpenAIStreamPart(textDelta);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function completeClaudeMessages(
  env: ServerEnv,
  request: AIChatRequest,
  resolvedModel: string,
) {
  const response = await createClaudeMessagesResponse(env, request, resolvedModel, false);
  const payload = await parseClaudeMessagesResponse(response);
  const errorMessage = extractClaudeErrorMessage(payload);

  if (errorMessage) {
    throw new Error(`Claude Messages 请求失败：${errorMessage}`);
  }

  const content = extractTextContent(payload.content).trim();

  if (!content) {
    throw new Error(
      `Claude Messages 响应未返回可用文本内容。上下文：${JSON.stringify({
        model: resolvedModel,
        stopReason: typeof payload.stop_reason === 'string' ? payload.stop_reason : '',
      })}`,
    );
  }

  return content;
}

function createOpenAIClientByConfig(apiKey: string, baseURL?: string) {
  return new OpenAI({
    apiKey,
    baseURL,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
  });
}

export function createOpenAIClient(env: ServerEnv) {
  if (!env.openaiApiKey) {
    throw new Error('缺少 OPENAI_API_KEY，无法建立 OpenAI 客户端');
  }

  return createOpenAIClientByConfig(env.openaiApiKey, env.openaiBaseUrl);
}

function createEmbeddingClient(env: ServerEnv) {
  const apiKey = env.embeddingApiKey || env.openaiApiKey;

  if (!apiKey) {
    throw new Error('缺少 EMBEDDING_API_KEY 或 OPENAI_API_KEY，无法建立 embedding 客户端');
  }

  return createOpenAIClientByConfig(apiKey, env.embeddingBaseUrl || env.openaiBaseUrl);
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
  const resolvedModel = request.model || env.defaultModel;

  if (isClaudeCompatibleProvider(env)) {
    return streamClaudeMessages(env, request, resolvedModel);
  }

  const client = createOpenAIClient(env);
  const stream = await client.chat.completions.create(
    buildChatCompletionRequest(env, request, resolvedModel, true) as any,
  ) as unknown as AsyncIterable<any>;

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
  const resolvedModel = request.model || env.defaultModel;

  if (isClaudeCompatibleProvider(env)) {
    return completeClaudeMessages(env, request, resolvedModel);
  }

  const client = createOpenAIClient(env);
  const completion = await client.chat.completions.create(
    buildChatCompletionRequest(env, request, resolvedModel, false) as any,
  );
  const normalizedCompletion = normalizeChatCompletionResponse(completion);
  const choices = ensureChoicesArray({
    model: resolvedModel,
    response: normalizedCompletion,
    contextLabel: '聊天完成响应',
  });
  const firstChoice = choices[0];
  const {
    content,
    refusal,
    toolCallNames,
    finishReason,
  } = extractChoiceContent(firstChoice);

  if (!content.trim()) {
    if (refusal) {
      throw new Error(`模型拒绝响应：${refusal}`);
    }

    if (toolCallNames.length > 0) {
      throw new Error(`模型返回了工具调用，当前链路不支持：${toolCallNames.join('、')}`);
    }

    if (finishReason === 'length') {
      throw new Error(
        `聊天完成响应被截断，未返回可用文本内容。上下文：${buildMissingChoicesErrorDetails({
          model: resolvedModel,
          response: normalizedCompletion,
        })}`,
      );
    }

    const streamedText = await collectStreamCompletionText(client, env, request, resolvedModel);

    if (streamedText) {
      return streamedText;
    }

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

export async function listAvailableModels(input: {
  provider?: AIProviderPreset;
  apiKey: string;
  baseUrl?: string;
}) {
  const apiKey = input.apiKey.trim();

  if (!apiKey) {
    throw new Error('缺少 API Key，无法拉取模型列表');
  }

  if (input.provider === 'claude_compatible') {
    const modelIds = await listClaudeCompatibleModels({
      apiKey,
      baseUrl: input.baseUrl?.trim() || undefined,
    });
    return modelIds.map((id) => ({ id } satisfies AIRuntimeModelOption));
  }

  const client = createOpenAIClientByConfig(apiKey, input.baseUrl?.trim() || undefined);
  const response = await client.models.list();
  const modelIds = Array.from(
    new Set(
      response.data
        .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, 'zh-CN'));

  return modelIds.map((id) => ({ id } satisfies AIRuntimeModelOption));
}

async function listClaudeCompatibleModels(input: {
  apiKey: string;
  baseUrl?: string;
}) {
  const baseUrl = (input.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/u, '');
  const response = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': CLAUDE_API_VERSION,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude 模型列表拉取失败：${response.status} ${errorText}`);
  }

  const payload = await response.json() as {
    data?: Array<{
      id?: unknown;
    }>;
  };

  return Array.from(
    new Set(
      (Array.isArray(payload.data) ? payload.data : [])
        .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, 'zh-CN'));
}
