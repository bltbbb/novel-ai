import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import {
  approveGenerationJob,
  batchUpdateGenerationJobs,
  clearProjectResolvedJobs,
  discardGenerationJob,
  enqueueGenerationJobs,
  getGenerationJob,
  listProjectGenerationJobs,
  pauseGenerationJob,
  reprioritizeGenerationJob,
  rollbackGenerationJobStage,
  resumeGenerationJob,
  retryGenerationJob,
} from '../services/generation-job-runner.js';
import type {
  GenerationJobBatchActionRequest,
  GenerationJobBatchRequest,
  GenerationJobPriorityRequest,
  GenerationJobRollbackRequest,
  GenerationJobRequest,
} from '../types/ai.js';

function isGenerationJobRequest(value: unknown): value is GenerationJobRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GenerationJobRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isGenerationJobBatchRequest(body: unknown): body is GenerationJobBatchRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<GenerationJobBatchRequest>;
  return Array.isArray(candidate.jobs) && candidate.jobs.every(isGenerationJobRequest);
}

function isGenerationJobBatchActionRequest(body: unknown): body is GenerationJobBatchActionRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<GenerationJobBatchActionRequest>;

  return (
    Array.isArray(candidate.jobIds) &&
    candidate.jobIds.every((item) => typeof item === 'string' && item.trim()) &&
    (candidate.action === 'approve' || candidate.action === 'discard')
  );
}

function isGenerationJobPriorityRequest(body: unknown): body is GenerationJobPriorityRequest {
  return Boolean(
    body &&
      typeof body === 'object' &&
      typeof (body as GenerationJobPriorityRequest).priority === 'number' &&
      Number.isFinite((body as GenerationJobPriorityRequest).priority),
  );
}

function isGenerationJobRollbackRequest(body: unknown): body is GenerationJobRollbackRequest {
  return Boolean(
    body &&
      typeof body === 'object' &&
      (((body as GenerationJobRollbackRequest).stage === 'review') ||
        (body as GenerationJobRollbackRequest).stage === 'polish'),
  );
}

interface JobIdParams {
  id: string;
}

interface ProjectQuerystring {
  projectId?: string;
}

interface ClearResolvedBody {
  projectId: string;
}

function isClearResolvedBody(body: unknown): body is ClearResolvedBody {
  return Boolean(body && typeof body === 'object' && typeof (body as ClearResolvedBody).projectId === 'string');
}

export async function registerGenerationJobRoutes(app: FastifyInstance, env: ServerEnv) {
  app.get(
    '/api/generation/jobs',
    async (request: FastifyRequest<{ Querystring: ProjectQuerystring }>, reply: FastifyReply) => {
      return {
        jobs: await listProjectGenerationJobs(env, request.query.projectId),
      };
    },
  );

  app.get(
    '/api/generation/jobs/:id',
    async (request: FastifyRequest<{ Params: JobIdParams }>, reply: FastifyReply) => {
      const job = await getGenerationJob(env, request.params.id);

      if (!job) {
        return reply.status(404).send({
          message: '目标任务不存在',
        });
      }

      return job;
    },
  );

  app.post('/api/generation/jobs/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGenerationJobBatchRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 GenerationJobBatchRequest 结构',
      });
    }

    return {
      jobs: await enqueueGenerationJobs(env, request.body),
    };
  });

  app.post('/api/generation/jobs/batch-action', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGenerationJobBatchActionRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 GenerationJobBatchActionRequest 结构',
      });
    }

    return {
      jobs: await batchUpdateGenerationJobs(env, request.body.jobIds, request.body.action),
    };
  });

  app.post(
    '/api/generation/jobs/:id/approve',
    async (request: FastifyRequest<{ Params: JobIdParams }>, reply: FastifyReply) => {
      const job = await approveGenerationJob(env, request.params.id);

      if (!job) {
        return reply.status(400).send({
          message: '目标任务不存在，或当前状态不允许确认写回',
        });
      }

      return job;
    },
  );

  app.post(
    '/api/generation/jobs/:id/discard',
    async (request: FastifyRequest<{ Params: JobIdParams }>, reply: FastifyReply) => {
      const job = await discardGenerationJob(env, request.params.id);

      if (!job) {
        return reply.status(400).send({
          message: '目标任务不存在，或当前状态不允许丢弃',
        });
      }

      return job;
    },
  );

  app.post(
    '/api/generation/jobs/:id/retry',
    async (request: FastifyRequest<{ Params: JobIdParams }>, reply: FastifyReply) => {
      const job = await retryGenerationJob(env, request.params.id);

      if (!job) {
        return reply.status(400).send({
          message: '目标任务不存在',
        });
      }

      return job;
    },
  );

  app.post(
    '/api/generation/jobs/:id/pause',
    async (request: FastifyRequest<{ Params: JobIdParams }>, reply: FastifyReply) => {
      const job = await pauseGenerationJob(env, request.params.id);

      if (!job) {
        return reply.status(400).send({
          message: '目标任务不存在，或当前状态不允许暂停',
        });
      }

      return job;
    },
  );

  app.post(
    '/api/generation/jobs/:id/resume',
    async (request: FastifyRequest<{ Params: JobIdParams }>, reply: FastifyReply) => {
      const job = await resumeGenerationJob(env, request.params.id);

      if (!job) {
        return reply.status(400).send({
          message: '目标任务不存在，或当前状态不允许恢复',
        });
      }

      return job;
    },
  );

  app.post(
    '/api/generation/jobs/:id/priority',
    async (request: FastifyRequest<{ Params: JobIdParams }>, reply: FastifyReply) => {
      if (!isGenerationJobPriorityRequest(request.body)) {
        return reply.status(400).send({
          message: '请求体不符合 GenerationJobPriorityRequest 结构',
        });
      }

      const job = await reprioritizeGenerationJob(env, request.params.id, request.body.priority);

      if (!job) {
        return reply.status(404).send({
          message: '目标任务不存在',
        });
      }

      return job;
    },
  );

  app.post(
    '/api/generation/jobs/:id/rollback',
    async (request: FastifyRequest<{ Params: JobIdParams }>, reply: FastifyReply) => {
      if (!isGenerationJobRollbackRequest(request.body)) {
        return reply.status(400).send({
          message: '请求体不符合 GenerationJobRollbackRequest 结构',
        });
      }

      const job = await rollbackGenerationJobStage(env, request.params.id, request.body.stage);

      if (!job) {
        return reply.status(400).send({
          message: '目标任务不存在，或当前状态不允许回退到指定阶段',
        });
      }

      return job;
    },
  );

  app.post('/api/generation/jobs/clear-resolved', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isClearResolvedBody(request.body)) {
      return reply.status(400).send({
        message: '请求体缺少 projectId',
      });
    }

    await clearProjectResolvedJobs(env, request.body.projectId);
    return {
      ok: true,
    };
  });
}
