import type { ServerEnv } from '../config/env.js';
import type { AIBookAnalysisRequest } from '../types/ai.js';
import {
  cancelBookAnalysisJob,
  createBookAnalysisJobRecord,
  getBookAnalysisCheckpoint,
  getBookAnalysisJob,
  getBookAnalysisJobRequest,
  isBookAnalysisJobCancelled,
  isBookAnalysisJobCancelledSync,
  listBookAnalysisJobs,
  markBookAnalysisJobCompleted,
  markBookAnalysisJobFailed,
  resetBookAnalysisJobForRetry,
  saveBookAnalysisCheckpoint,
  updateBookAnalysisJob,
} from './book-analysis-job-store.js';
import { analyzeBookTemplate } from './template-analysis.js';

async function startBookAnalysisExecution(
  env: ServerEnv,
  jobId: string,
  request: AIBookAnalysisRequest,
) {
  void (async () => {
    try {
      const checkpoint = await getBookAnalysisCheckpoint(env, jobId);
      const result = await analyzeBookTemplate(env, request, {
        onProgress: async (payload) => {
          if (await isBookAnalysisJobCancelled(env, jobId)) {
            return;
          }

          await updateBookAnalysisJob(env, jobId, {
            status: payload.stage === 'completed' ? 'completed' : 'running',
            progressStage: payload.stage,
            progressPercent: payload.progressPercent,
            message: payload.message,
            totalSegments: payload.totalSegments,
            sampledSegments: payload.sampledSegments,
            finishedSegments: payload.finishedSegments,
            estimatedWordCount: payload.estimatedWordCount,
          });
        },
        isCancelled: () => isBookAnalysisJobCancelledSync(env, jobId),
        checkpoint,
        onCheckpoint: async (nextCheckpoint) => {
          await saveBookAnalysisCheckpoint(env, jobId, nextCheckpoint);
        },
      });

      if (await isBookAnalysisJobCancelled(env, jobId)) {
        return;
      }

      await saveBookAnalysisCheckpoint(env, jobId, null);
      await markBookAnalysisJobCompleted(env, jobId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      if ((await isBookAnalysisJobCancelled(env, jobId)) || message === '任务已取消') {
        await cancelBookAnalysisJob(env, jobId);
        return;
      }

      await markBookAnalysisJobFailed(env, jobId, message);
    }
  })();
}

export function listRunningBookAnalysisJobs(env: ServerEnv) {
  return listBookAnalysisJobs(env);
}

export function getRunningBookAnalysisJob(env: ServerEnv, jobId: string) {
  return getBookAnalysisJob(env, jobId);
}

export function requestCancelBookAnalysisJob(env: ServerEnv, jobId: string) {
  return cancelBookAnalysisJob(env, jobId);
}

export async function enqueueBookAnalysisJob(
  env: ServerEnv,
  request: AIBookAnalysisRequest,
) {
  const job = await createBookAnalysisJobRecord(env, request);

  await updateBookAnalysisJob(env, job.id, {
    status: 'running',
    progressStage: 'pending',
    progressPercent: 1,
    message: '任务已创建，等待执行',
  });

  await startBookAnalysisExecution(env, job.id, request);

  return job;
}

export async function retryBookAnalysisJob(env: ServerEnv, jobId: string) {
  const resetResult = await resetBookAnalysisJobForRetry(env, jobId);

  if (!resetResult) {
    return null;
  }

  await startBookAnalysisExecution(env, resetResult.job.id, resetResult.request);
  return resetResult.job;
}

export async function recoverInterruptedBookAnalysisJobs(env: ServerEnv) {
  const jobs = await listBookAnalysisJobs(env);
  const recoveredJobIds: string[] = [];

  for (const job of jobs) {
    if (job.status !== 'pending' && job.status !== 'running') {
      continue;
    }

    const request = await getBookAnalysisJobRequest(env, job.id);

    if (!request) {
      await markBookAnalysisJobFailed(env, job.id, '服务恢复时未找到原始请求，无法继续执行');
      continue;
    }

    await updateBookAnalysisJob(env, job.id, {
      status: 'running',
      progressStage: 'pending',
      progressPercent: Math.max(1, job.progressPercent || 1),
      message: '服务恢复后继续执行',
      errorMessage: '',
    });

    await startBookAnalysisExecution(env, job.id, request);
    recoveredJobIds.push(job.id);
  }

  return recoveredJobIds;
}
