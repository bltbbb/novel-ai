import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import {
  extractChapterArtifacts,
  generateBeatDraft,
  generateChapterOutline,
  polishChapterDraft,
  reviewChapterDraft,
  styleChapterDraft,
} from '../services/generation.js';
import type {
  AIExtractRequest,
  AIPolishRequest,
  AIPlanRequest,
  AIReviewRequest,
  AIStyleRequest,
  AIWriteRequest,
} from '../types/ai.js';

function isAIPlanRequest(body: unknown): body is AIPlanRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIPlanRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIExtractRequest(body: unknown): body is AIExtractRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIExtractRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIWriteRequest(body: unknown): body is AIWriteRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIWriteRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number' &&
    typeof candidate.beatIndex === 'number' &&
    typeof candidate.currentBeat === 'string' &&
    candidate.outline !== undefined &&
    typeof candidate.outline === 'object'
  );
}

function isAIReviewRequest(body: unknown): body is AIReviewRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIReviewRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIPolishRequest(body: unknown): body is AIPolishRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIPolishRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIStyleRequest(body: unknown): body is AIStyleRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIStyleRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.stylePrompt === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

export async function registerGenerationRoutes(app: FastifyInstance, env: ServerEnv) {
  app.post('/api/ai/plan', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIPlanRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIPlanRequest 结构',
      });
    }

    try {
      return await generateChapterOutline(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/extract', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIExtractRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIExtractRequest 结构',
      });
    }

    try {
      return await extractChapterArtifacts(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/write', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIWriteRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIWriteRequest 结构',
      });
    }

    try {
      return await generateBeatDraft(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/review', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIReviewRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIReviewRequest 结构',
      });
    }

    try {
      return await reviewChapterDraft(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/style', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIStyleRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIStyleRequest 结构',
      });
    }

    try {
      return await styleChapterDraft(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/polish', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIPolishRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIPolishRequest 结构',
      });
    }

    try {
      return await polishChapterDraft(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });
}
