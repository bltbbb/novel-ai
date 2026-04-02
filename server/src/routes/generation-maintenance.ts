import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import {
  backfillGenerationMemoryChunks,
  backfillGenerationMemoryEmbeddings,
  backfillGenerationVolumeRecapSummaries,
} from '../services/generation-backfill.js';

interface BackfillMemoryChunksBody {
  projectId?: string;
  chapterId?: string;
  limit?: number;
}

function isBackfillMemoryChunksBody(body: unknown): body is BackfillMemoryChunksBody {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as BackfillMemoryChunksBody;

  return (
    typeof candidate.projectId === 'string' &&
    candidate.projectId.trim().length > 0 &&
    (typeof candidate.chapterId === 'undefined' || typeof candidate.chapterId === 'string') &&
    (typeof candidate.limit === 'undefined' ||
      (typeof candidate.limit === 'number' && Number.isFinite(candidate.limit) && candidate.limit >= 0))
  );
}

export async function registerGenerationMaintenanceRoutes(app: FastifyInstance, env: ServerEnv) {
  app.post(
    '/api/runtime/generation-maintenance/backfill-memory-chunks',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isBackfillMemoryChunksBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少合法的 projectId，或 limit / chapterId 格式不正确',
        });
      }

      const body = request.body as BackfillMemoryChunksBody & { projectId: string };

      return backfillGenerationMemoryChunks(env, {
        projectId: body.projectId.trim(),
        chapterId: body.chapterId?.trim() || undefined,
        limit: typeof body.limit === 'number' ? Math.trunc(body.limit) : undefined,
      });
    },
  );

  app.post(
    '/api/runtime/generation-maintenance/backfill-volume-recaps',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isBackfillMemoryChunksBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少合法的 projectId，或 limit / chapterId 格式不正确',
        });
      }

      const body = request.body as BackfillMemoryChunksBody & { projectId: string };

      return backfillGenerationVolumeRecapSummaries(env, {
        projectId: body.projectId.trim(),
        chapterId: body.chapterId?.trim() || undefined,
        limit: typeof body.limit === 'number' ? Math.trunc(body.limit) : undefined,
      });
    },
  );

  app.post(
    '/api/runtime/generation-maintenance/backfill-memory-embeddings',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isBackfillMemoryChunksBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少合法的 projectId，或 limit / chapterId 格式不正确',
        });
      }

      const body = request.body as BackfillMemoryChunksBody & { projectId: string };

      return backfillGenerationMemoryEmbeddings(env, {
        projectId: body.projectId.trim(),
        chapterId: body.chapterId?.trim() || undefined,
        limit: typeof body.limit === 'number' ? Math.trunc(body.limit) : undefined,
      });
    },
  );
}
