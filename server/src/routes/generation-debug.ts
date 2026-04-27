import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import {
  getGenerationDebugContext,
  getGenerationDebugChapterDetail,
  getGenerationDebugOverview,
  getGenerationDebugRetrieval,
  getGenerationDebugStructuredRelationshipConsumptionPreview,
  getGenerationDebugStructuredRelationshipQuery,
  getGenerationDebugStructuredRelationshipQueryTwoHop,
  listGenerationDebugChapterRecords,
  listGenerationDebugMemoryChunks,
  listGenerationDebugEntities,
  listGenerationDebugForeshadows,
  listGenerationDebugVolumeRecaps,
  listGenerationDebugRelationships,
} from '../services/generation-debug-store.js';
import { previewGenerationPrompts } from '../services/generation.js';
import type { GenerationPromptPreviewRequest } from '../types/ai.js';

interface ProjectQuerystring {
  projectId?: string;
  chapterId?: string;
  q?: string;
  entityName?: string;
}

function isGenerationPromptPreviewRequest(body: unknown): body is GenerationPromptPreviewRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<GenerationPromptPreviewRequest>;
  return (
    Array.isArray(candidate.stages) &&
    candidate.stages.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        (
          item.stage === 'plan' ||
          item.stage === 'write' ||
          item.stage === 'review' ||
          item.stage === 'language_qa' ||
          item.stage === 'style' ||
          item.stage === 'polish' ||
          item.stage === 'editor_refine' ||
          item.stage === 'extract'
        ) &&
        item.request &&
        typeof item.request === 'object',
    )
  );
}

function getProjectIdOrReply(
  reply: FastifyReply,
  query: ProjectQuerystring,
) {
  if (typeof query.projectId !== 'string' || !query.projectId.trim()) {
    reply.status(400).send({
      message: '查询参数缺少 projectId',
    });
    return null;
  }

  return query.projectId;
}

export async function registerGenerationDebugRoutes(app: FastifyInstance, env: ServerEnv) {
  app.get(
    '/api/runtime/generation-debug/overview',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      return getGenerationDebugOverview(env, projectId);
    },
  );

  app.get(
    '/api/runtime/generation-debug/chapter-detail',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      if (typeof request.query.chapterId !== 'string' || !request.query.chapterId.trim()) {
        return reply.status(400).send({
          message: '查询参数缺少 chapterId',
        });
      }

      const detail = getGenerationDebugChapterDetail(env, projectId, request.query.chapterId);

      if (!detail) {
        return reply.status(404).send({
          message: '目标章节的调试记录不存在',
        });
      }

      return detail;
    },
  );

  app.get(
    '/api/runtime/generation-debug/context',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      if (typeof request.query.chapterId !== 'string' || !request.query.chapterId.trim()) {
        return reply.status(400).send({
          message: '查询参数缺少 chapterId',
        });
      }

      const detail = await getGenerationDebugContext(env, projectId, request.query.chapterId);

      if (!detail) {
        return reply.status(404).send({
          message: '目标章节的 Context 调试记录不存在',
        });
      }

      return detail;
    },
  );

  app.post(
    '/api/runtime/generation-debug/prompt-preview',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isGenerationPromptPreviewRequest(request.body)) {
        return reply.status(400).send({
          message: '请求体不符合 GenerationPromptPreviewRequest 结构',
        });
      }

      try {
        return await previewGenerationPrompts(env, request.body);
      } catch (error) {
        const message = error instanceof Error ? error.message : '生成 Prompt 预览失败';
        return reply.status(500).send({
          message,
        });
      }
    },
  );

  app.get(
    '/api/runtime/generation-debug/chapters',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      return {
        items: listGenerationDebugChapterRecords(env, projectId, request.query.q),
      };
    },
  );

  app.get(
    '/api/runtime/generation-debug/entities',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      return {
        items: listGenerationDebugEntities(env, projectId, request.query.q),
      };
    },
  );

  app.get(
    '/api/runtime/generation-debug/foreshadows',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      return {
        items: listGenerationDebugForeshadows(env, projectId, request.query.q),
      };
    },
  );

  app.get(
    '/api/runtime/generation-debug/volume-recaps',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      return {
        items: listGenerationDebugVolumeRecaps(env, projectId, request.query.q),
      };
    },
  );

  app.get(
    '/api/runtime/generation-debug/relationships',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      return {
        items: listGenerationDebugRelationships(env, projectId, {
          q: request.query.q,
          chapterId: request.query.chapterId,
          entityName: request.query.entityName,
        }),
      };
    },
  );

  app.get(
    '/api/runtime/generation-debug/relationship-query',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      if (typeof request.query.chapterId !== 'string' || !request.query.chapterId.trim()) {
        return reply.status(400).send({
          message: '查询参数缺少 chapterId',
        });
      }

      const detail = getGenerationDebugStructuredRelationshipQuery(env, projectId, {
        chapterId: request.query.chapterId,
        entityName: request.query.entityName,
      });

      if (!detail) {
        return reply.status(404).send({
          message: '目标章节的关系查询调试记录不存在',
        });
      }

      return detail;
    },
  );

  app.get(
    '/api/runtime/generation-debug/relationship-query-2hop',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      if (typeof request.query.chapterId !== 'string' || !request.query.chapterId.trim()) {
        return reply.status(400).send({
          message: '查询参数缺少 chapterId',
        });
      }

      const detail = getGenerationDebugStructuredRelationshipQueryTwoHop(env, projectId, {
        chapterId: request.query.chapterId,
        entityName: request.query.entityName,
      });

      if (!detail) {
        return reply.status(404).send({
          message: '目标章节的二度关系查询调试记录不存在',
        });
      }

      return detail;
    },
  );

  app.get(
    '/api/runtime/generation-debug/relationship-query-2hop-preview',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      if (typeof request.query.chapterId !== 'string' || !request.query.chapterId.trim()) {
        return reply.status(400).send({
          message: '查询参数缺少 chapterId',
        });
      }

      const detail = getGenerationDebugStructuredRelationshipConsumptionPreview(env, projectId, {
        chapterId: request.query.chapterId,
        entityName: request.query.entityName,
      });

      if (!detail) {
        return reply.status(404).send({
          message: '目标章节的二度关系消费预览不存在',
        });
      }

      return detail;
    },
  );

  app.get(
    '/api/runtime/generation-debug/chunks',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      return {
        items: listGenerationDebugMemoryChunks(env, projectId, {
          q: request.query.q,
          chapterId: request.query.chapterId,
        }),
      };
    },
  );

  app.get(
    '/api/runtime/generation-debug/retrieval',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query);

      if (!projectId) {
        return reply;
      }

      if (typeof request.query.chapterId !== 'string' || !request.query.chapterId.trim()) {
        return reply.status(400).send({
          message: '查询参数缺少 chapterId',
        });
      }

      const detail = await getGenerationDebugRetrieval(env, projectId, request.query.chapterId);

      if (!detail) {
        return reply.status(404).send({
          message: '目标章节的检索调试记录不存在',
        });
      }

      return detail;
    },
  );
}
