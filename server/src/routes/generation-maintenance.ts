import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import {
  backfillGenerationMemoryChunks,
  backfillGenerationMemoryEmbeddings,
  backfillGenerationVolumeRecapSummaries,
} from '../services/generation-backfill.js';
import { rebuildGenerationProjectArtifacts } from '../services/generation-project-artifact-rebuild.js';
import type {
  GenerationEntitySnapshot,
  GenerationForeshadowSnapshot,
  GenerationRelationSnapshot,
  GenerationProjectArtifactRebuildChapterInput,
  GenerationProjectArtifactRebuildRequest,
} from '../types/ai.js';

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

function isGenerationEntitySnapshot(value: unknown): value is GenerationEntitySnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GenerationEntitySnapshot>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.description === 'string' &&
    Array.isArray(candidate.tags) &&
    typeof candidate.pinned === 'boolean' &&
    candidate.fields !== null &&
    typeof candidate.fields === 'object'
  );
}

function isGenerationForeshadowSnapshot(value: unknown): value is GenerationForeshadowSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GenerationForeshadowSnapshot>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.excerpt === 'string' &&
    typeof candidate.notes === 'string' &&
    (candidate.status === 'planted' ||
      candidate.status === 'activated' ||
      candidate.status === 'resolved' ||
      candidate.status === 'overdue') &&
    typeof candidate.updatedAt === 'string'
  );
}

function isGenerationRelationSnapshot(value: unknown): value is GenerationRelationSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GenerationRelationSnapshot>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.sourceEntityId === 'string' &&
    typeof candidate.targetEntityId === 'string' &&
    typeof candidate.sourceEntityName === 'string' &&
    typeof candidate.targetEntityName === 'string' &&
    typeof candidate.relationType === 'string' &&
    typeof candidate.origin === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.currentStance === 'string' &&
    typeof candidate.currentIntensity === 'number' &&
    typeof candidate.stanceReason === 'string' &&
    typeof candidate.draft === 'boolean'
  );
}

function isGenerationProjectArtifactRebuildChapterInput(
  value: unknown,
): value is GenerationProjectArtifactRebuildChapterInput {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GenerationProjectArtifactRebuildChapterInput>;

  return (
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.chapterOrder === 'number' &&
    Number.isFinite(candidate.chapterOrder) &&
    candidate.chapterOrder > 0 &&
    typeof candidate.content === 'string' &&
    (typeof candidate.volumeTitle === 'undefined' || typeof candidate.volumeTitle === 'string') &&
    (typeof candidate.previousChapterId === 'undefined' || typeof candidate.previousChapterId === 'string') &&
    (typeof candidate.previousChapterTitle === 'undefined' || typeof candidate.previousChapterTitle === 'string') &&
    (typeof candidate.outline === 'undefined' || candidate.outline === null || typeof candidate.outline === 'object') &&
    (typeof candidate.summary === 'undefined' || candidate.summary === null || typeof candidate.summary === 'object') &&
    (typeof candidate.stateChanges === 'undefined' || Array.isArray(candidate.stateChanges)) &&
    (typeof candidate.strand === 'undefined' ||
      candidate.strand === null ||
      candidate.strand === 'quest' ||
      candidate.strand === 'fire' ||
      candidate.strand === 'constellation') &&
    (typeof candidate.review === 'undefined' || candidate.review === null || typeof candidate.review === 'object') &&
    (typeof candidate.languageQa === 'undefined' || candidate.languageQa === null || typeof candidate.languageQa === 'object')
  );
}

function isGenerationProjectArtifactRebuildRequest(
  body: unknown,
): body is GenerationProjectArtifactRebuildRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<GenerationProjectArtifactRebuildRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    candidate.projectId.trim().length > 0 &&
    Array.isArray(candidate.chapters) &&
    candidate.chapters.every(isGenerationProjectArtifactRebuildChapterInput) &&
    Array.isArray(candidate.entitySnapshot) &&
    candidate.entitySnapshot.every(isGenerationEntitySnapshot) &&
    Array.isArray(candidate.relationSnapshot) &&
    candidate.relationSnapshot.every(isGenerationRelationSnapshot) &&
    Array.isArray(candidate.foreshadowSnapshot) &&
    candidate.foreshadowSnapshot.every(isGenerationForeshadowSnapshot)
  );
}

export async function registerGenerationMaintenanceRoutes(app: FastifyInstance, env: ServerEnv) {
  app.post(
    '/api/runtime/generation-maintenance/rebuild-project-artifacts',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isGenerationProjectArtifactRebuildRequest(request.body)) {
        return reply.status(400).send({
          message: '请求体不符合 GenerationProjectArtifactRebuildRequest 结构',
        });
      }

      return rebuildGenerationProjectArtifacts(env, request.body);
    },
  );

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
