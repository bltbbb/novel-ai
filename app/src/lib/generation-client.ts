import type {
  AIExtractRequest,
  AIExtractResponse,
  AIPolishRequest,
  AIPolishResponse,
  AIPlanRequest,
  AIPlanResponse,
  AIReviewRequest,
  AIReviewResponse,
  AIStyleRequest,
  AIStyleResponse,
  GenerationJobBatchActionRequest,
  GenerationJobBatchActionResponse,
  GenerationJobBatchRequest,
  GenerationJobBatchResponse,
  GenerationJobListResponse,
  GenerationJobPriorityRequest,
  GenerationJobRollbackRequest,
  GenerationJobRecord,
  AIWriteRequest,
  AIWriteResponse,
} from '@/types';

function createApiUrl(serverUrl: string, path: string) {
  return `${serverUrl.replace(/\/+$/, '')}${path}`;
}

function extractErrorMessage(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as { message?: string };
    return parsed.message || rawText;
  } catch {
    return rawText;
  }
}

async function postJson<TRequest, TResponse>(serverUrl: string, path: string, request: TRequest) {
  const response = await fetch(createApiUrl(serverUrl, path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export function createChapterPlan(serverUrl: string, request: AIPlanRequest) {
  return postJson<AIPlanRequest, AIPlanResponse>(serverUrl, '/api/ai/plan', request);
}

export function writeChapterBeat(serverUrl: string, request: AIWriteRequest) {
  return postJson<AIWriteRequest, AIWriteResponse>(serverUrl, '/api/ai/write', request);
}

export function styleChapterDraft(serverUrl: string, request: AIStyleRequest) {
  return postJson<AIStyleRequest, AIStyleResponse>(serverUrl, '/api/ai/style', request);
}

export function reviewChapterDraft(serverUrl: string, request: AIReviewRequest) {
  return postJson<AIReviewRequest, AIReviewResponse>(serverUrl, '/api/ai/review', request);
}

export function polishChapterDraft(serverUrl: string, request: AIPolishRequest) {
  return postJson<AIPolishRequest, AIPolishResponse>(serverUrl, '/api/ai/polish', request);
}

export function extractChapterState(serverUrl: string, request: AIExtractRequest) {
  return postJson<AIExtractRequest, AIExtractResponse>(serverUrl, '/api/ai/extract', request);
}

export async function listGenerationJobs(serverUrl: string, projectId: string) {
  const response = await fetch(
    `${createApiUrl(serverUrl, '/api/generation/jobs')}?projectId=${encodeURIComponent(projectId)}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  const parsed = (await response.json()) as GenerationJobListResponse;
  return parsed.jobs;
}

export async function enqueueGenerationJobs(serverUrl: string, request: GenerationJobBatchRequest) {
  const response = await postJson<GenerationJobBatchRequest, GenerationJobBatchResponse>(
    serverUrl,
    '/api/generation/jobs/batch',
    request,
  );

  return response.jobs;
}

export async function batchUpdateGenerationJobs(
  serverUrl: string,
  request: GenerationJobBatchActionRequest,
) {
  const response = await postJson<GenerationJobBatchActionRequest, GenerationJobBatchActionResponse>(
    serverUrl,
    '/api/generation/jobs/batch-action',
    request,
  );

  return response.jobs;
}

export function approveGenerationJob(serverUrl: string, jobId: string) {
  return postJson<Record<string, never>, GenerationJobRecord>(
    serverUrl,
    `/api/generation/jobs/${jobId}/approve`,
    {},
  );
}

export function discardGenerationJob(serverUrl: string, jobId: string) {
  return postJson<Record<string, never>, GenerationJobRecord>(
    serverUrl,
    `/api/generation/jobs/${jobId}/discard`,
    {},
  );
}

export function retryGenerationJob(serverUrl: string, jobId: string) {
  return postJson<Record<string, never>, GenerationJobRecord>(
    serverUrl,
    `/api/generation/jobs/${jobId}/retry`,
    {},
  );
}

export function pauseGenerationJob(serverUrl: string, jobId: string) {
  return postJson<Record<string, never>, GenerationJobRecord>(
    serverUrl,
    `/api/generation/jobs/${jobId}/pause`,
    {},
  );
}

export function resumeGenerationJob(serverUrl: string, jobId: string) {
  return postJson<Record<string, never>, GenerationJobRecord>(
    serverUrl,
    `/api/generation/jobs/${jobId}/resume`,
    {},
  );
}

export function reprioritizeGenerationJob(serverUrl: string, jobId: string, priority: number) {
  return postJson<GenerationJobPriorityRequest, GenerationJobRecord>(
    serverUrl,
    `/api/generation/jobs/${jobId}/priority`,
    { priority },
  );
}

export function rollbackGenerationJobStage(
  serverUrl: string,
  jobId: string,
  request: GenerationJobRollbackRequest,
) {
  return postJson<GenerationJobRollbackRequest, GenerationJobRecord>(
    serverUrl,
    `/api/generation/jobs/${jobId}/rollback`,
    request,
  );
}

export function clearResolvedGenerationJobs(serverUrl: string, projectId: string) {
  return postJson<{ projectId: string }, { ok: boolean }>(
    serverUrl,
    '/api/generation/jobs/clear-resolved',
    { projectId },
  );
}
