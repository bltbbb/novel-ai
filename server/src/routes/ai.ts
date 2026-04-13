import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import { streamChatCompletion } from '../services/openai.js';
import type { AIChatRequest, AIChatRole, AIStreamChunk } from '../types/ai.js';

function isValidRole(role: unknown): role is AIChatRole {
  return role === 'system' || role === 'user' || role === 'assistant';
}

function isAIChatRequest(body: unknown): body is AIChatRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIChatRequest>;

  if (typeof candidate.projectId !== 'string') {
    return false;
  }

  if (typeof candidate.model !== 'string') {
    return false;
  }

  if (typeof candidate.temperature !== 'number') {
    return false;
  }

  if (!Array.isArray(candidate.messages)) {
    return false;
  }

  return candidate.messages.every((message) => {
    return (
      message &&
      typeof message === 'object' &&
      typeof message.id === 'string' &&
      isValidRole(message.role) &&
      typeof message.content === 'string'
    );
  });
}

function writeSseChunk(reply: FastifyReply, chunk: AIStreamChunk) {
  reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

function extractDeltaTextPart(value: unknown): string {
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

  if (typeof candidate.content === 'string') {
    return candidate.content;
  }

  return '';
}

function extractDeltaText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return extractDeltaTextPart(value);
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => extractDeltaTextPart(item))
    .filter(Boolean)
    .join('');
}

export async function registerAIRoutes(app: FastifyInstance, env: ServerEnv) {
  app.post('/api/ai/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIChatRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIChatRequest 结构',
      });
    }

    if (!env.openaiApiKey) {
      return reply.status(500).send({
        message: '服务端尚未配置 OPENAI_API_KEY',
      });
    }

    const requestOrigin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': requestOrigin ?? env.corsOrigin.split(',')[0]?.trim() ?? '*',
      Vary: 'Origin',
    });

    try {
      const stream = await streamChatCompletion(env, request.body);

      for await (const part of stream as AsyncIterable<any>) {
        const firstChoice = part.choices[0];
        const delta = extractDeltaText(firstChoice?.delta?.content);
        const refusal = typeof firstChoice?.delta?.refusal === 'string'
          ? firstChoice.delta.refusal.trim()
          : '';

        if (!delta && !refusal) {
          continue;
        }

        if (refusal) {
          throw new Error(`模型拒绝续写：${refusal}`);
        }

        writeSseChunk(reply, {
          delta,
          done: false,
        });
      }

      writeSseChunk(reply, {
        delta: '',
        done: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      writeSseChunk(reply, {
        delta: '',
        done: true,
        error: message,
      });
    } finally {
      reply.raw.end();
    }
  });
}
