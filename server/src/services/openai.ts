import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ServerEnv } from '../config/env.js';
import type { AIChatRequest } from '../types/ai.js';

function buildSystemMessage(request: AIChatRequest) {
  const parts: string[] = [];

  if (request.systemPrompt?.trim()) {
    parts.push(request.systemPrompt.trim());
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

function buildMessages(request: AIChatRequest): ChatCompletionMessageParam[] {
  const systemMessage = buildSystemMessage(request);
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

export function createOpenAIClient(env: ServerEnv) {
  if (!env.openaiApiKey) {
    throw new Error('缺少 OPENAI_API_KEY，无法建立 OpenAI 客户端');
  }

  return new OpenAI({
    apiKey: env.openaiApiKey,
    baseURL: env.openaiBaseUrl,
  });
}

export async function streamChatCompletion(env: ServerEnv, request: AIChatRequest) {
  const client = createOpenAIClient(env);

  return client.chat.completions.create({
    model: request.model || env.defaultModel,
    temperature: request.temperature,
    messages: buildMessages(request),
    stream: true,
  });
}
