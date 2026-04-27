import type {
  AIBookAnalysisRequest,
  AIBookAnalysisResponse,
  AIInspirationBlueprint,
  AIInspirationBlueprintRequest,
  AIEpubExtractRequest,
  AIEpubExtractResponse,
  AIBookOutlineRequest,
  AIBookOutlineResponse,
  AIBookOutlineSummaryRequest,
  AIBookOutlineSummaryResponse,
  AIEditorRefineRequest,
  AIEditorRefineResponse,
  BookAnalysisJobRecord,
  AIExtractRequest,
  AIExtractResponse,
  AILanguageQaRequest,
  AILanguageQaResponse,
  AIPolishRequest,
  AIPolishResponse,
  AIPlanRequest,
  AIPlanResponse,
  AIReviewRequest,
  AIReviewResponse,
  AIStyleRequest,
  AIStyleResponse,
  AIVolumeBeatsRequest,
  AIVolumeBeatsResponse,
  AIVolumeMilestonesRequest,
  AIVolumeMilestonesResponse,
  AIVolumeOutlineRequest,
  AIVolumeOutlineResponse,
  AIVolumeOutlineSummaryRequest,
  AIVolumeOutlineSummaryResponse,
  AIVolumePlanReconcileRequest,
  AIVolumePlanReconcileResponse,
  GenerationArtifactSyncRequest,
  GenerationArtifactSyncResponse,
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

interface JsonRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutMessage?: string;
}

interface LocalInspirationTranscriptResponse {
  sourceName: string;
  transcript: string;
  messageCount: number;
  bytes: number;
  updatedAt: string;
}

const LONG_AI_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const EXTRA_LONG_AI_REQUEST_TIMEOUT_MS = 45 * 60 * 1000;

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

async function postJson<TRequest, TResponse>(
  serverUrl: string,
  path: string,
  request: TRequest,
  options: JsonRequestOptions = {},
) {
  const controller = new AbortController();
  let timedOut = false;
  let abortedByCaller = false;
  let timeoutId: number | null = null;
  const cleanupListeners: Array<() => void> = [];

  if (options.signal) {
    if (options.signal.aborted) {
      abortedByCaller = true;
      controller.abort();
    } else {
      const handleAbort = () => {
        abortedByCaller = true;
        controller.abort();
      };

      options.signal.addEventListener('abort', handleAbort, { once: true });
      cleanupListeners.push(() => options.signal?.removeEventListener('abort', handleAbort));
    }
  }

  if (typeof options.timeoutMs === 'number' && options.timeoutMs > 0) {
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
  }

  let response: Response;

  try {
    response = await fetch(createApiUrl(serverUrl, path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    cleanupListeners.forEach((cleanup) => cleanup());

    if (timedOut) {
      throw new Error(options.timeoutMessage || '请求超时，请稍后重试');
    }

    if (abortedByCaller) {
      throw new Error('请求已取消');
    }

    throw error;
  }

  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
  }
  cleanupListeners.forEach((cleanup) => cleanup());

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export function createChapterPlan(serverUrl: string, request: AIPlanRequest, options?: JsonRequestOptions) {
  return postJson<AIPlanRequest, AIPlanResponse>(serverUrl, '/api/ai/plan', request, {
    timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
    timeoutMessage: 'Plan 请求超时，请重试',
    ...options,
  });
}

export function createBookOutline(serverUrl: string, request: AIBookOutlineRequest) {
  return postJson<AIBookOutlineRequest, AIBookOutlineResponse>(
    serverUrl,
    '/api/ai/book-outline',
    request,
  );
}

export function createBookOutlineSummary(serverUrl: string, request: AIBookOutlineSummaryRequest) {
  return postJson<AIBookOutlineSummaryRequest, AIBookOutlineSummaryResponse>(
    serverUrl,
    '/api/ai/book-outline-summary',
    request,
  );
}

export function createInspirationBlueprint(serverUrl: string, request: AIInspirationBlueprintRequest) {
  return postJson<AIInspirationBlueprintRequest, AIInspirationBlueprint>(
    serverUrl,
    '/api/ai/inspiration-blueprint',
    request,
    {
      timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
      timeoutMessage: '灵感提炼请求超时，请稍后重试',
    },
  );
}

export async function fetchDiscussTranscript(serverUrl: string) {
  const response = await fetch(createApiUrl(serverUrl, '/api/local/inspiration-transcripts/discuss'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  return (await response.json()) as LocalInspirationTranscriptResponse;
}

export function analyzeBookTemplate(serverUrl: string, request: AIBookAnalysisRequest, options?: JsonRequestOptions) {
  return postJson<AIBookAnalysisRequest, AIBookAnalysisResponse>(
    serverUrl,
    '/api/ai/book-analysis-template',
    request,
    {
      timeoutMs: EXTRA_LONG_AI_REQUEST_TIMEOUT_MS,
      timeoutMessage: '拆书分析请求超时，请稍后重试',
      ...options,
    },
  );
}

export function createBookAnalysisJob(serverUrl: string, request: AIBookAnalysisRequest, options?: JsonRequestOptions) {
  return postJson<AIBookAnalysisRequest, BookAnalysisJobRecord>(
    serverUrl,
    '/api/ai/book-analysis-jobs',
    request,
    {
      timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
      timeoutMessage: '创建拆书任务超时，请稍后重试',
      ...options,
    },
  );
}

export function extractEpubForBookAnalysis(serverUrl: string, request: AIEpubExtractRequest, options?: JsonRequestOptions) {
  return postJson<AIEpubExtractRequest, AIEpubExtractResponse>(
    serverUrl,
    '/api/ai/book-analysis-extract-epub',
    request,
    {
      timeoutMs: EXTRA_LONG_AI_REQUEST_TIMEOUT_MS,
      timeoutMessage: 'EPUB 提取超时，请稍后重试',
      ...options,
    },
  );
}

export async function listBookAnalysisJobs(serverUrl: string) {
  const response = await fetch(createApiUrl(serverUrl, '/api/ai/book-analysis-jobs'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  return (await response.json()) as BookAnalysisJobRecord[];
}

export async function getBookAnalysisJob(serverUrl: string, jobId: string) {
  const response = await fetch(createApiUrl(serverUrl, `/api/ai/book-analysis-jobs/${jobId}`), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  return (await response.json()) as BookAnalysisJobRecord;
}

export async function cancelBookAnalysisJob(serverUrl: string, jobId: string) {
  return postJson<Record<string, never>, BookAnalysisJobRecord>(
    serverUrl,
    `/api/ai/book-analysis-jobs/${jobId}/cancel`,
    {},
  );
}

export async function retryBookAnalysisJob(serverUrl: string, jobId: string) {
  return postJson<Record<string, never>, BookAnalysisJobRecord>(
    serverUrl,
    `/api/ai/book-analysis-jobs/${jobId}/retry`,
    {},
  );
}

export function createVolumeOutline(serverUrl: string, request: AIVolumeOutlineRequest) {
  return postJson<AIVolumeOutlineRequest, AIVolumeOutlineResponse>(
    serverUrl,
    '/api/ai/volume-outline',
    request,
  );
}

export function createVolumeOutlineSummary(serverUrl: string, request: AIVolumeOutlineSummaryRequest) {
  return postJson<AIVolumeOutlineSummaryRequest, AIVolumeOutlineSummaryResponse>(
    serverUrl,
    '/api/ai/volume-outline-summary',
    request,
  );
}

export function createVolumeMilestones(serverUrl: string, request: AIVolumeMilestonesRequest) {
  return postJson<AIVolumeMilestonesRequest, AIVolumeMilestonesResponse>(
    serverUrl,
    '/api/ai/volume-milestones',
    request,
  );
}

export function reconcileVolumePlan(serverUrl: string, request: AIVolumePlanReconcileRequest) {
  return postJson<AIVolumePlanReconcileRequest, AIVolumePlanReconcileResponse>(
    serverUrl,
    '/api/ai/volume-plan-reconcile',
    request,
    {
      timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
      timeoutMessage: '卷规划修正请求超时，请稍后重试',
    },
  );
}

export function createVolumeBeats(serverUrl: string, request: AIVolumeBeatsRequest) {
  return postJson<AIVolumeBeatsRequest, AIVolumeBeatsResponse>(
    serverUrl,
    '/api/ai/volume-beats',
    request,
  );
}

export function writeChapterBeat(serverUrl: string, request: AIWriteRequest, options?: JsonRequestOptions) {
  return postJson<AIWriteRequest, AIWriteResponse>(serverUrl, '/api/ai/write', request, {
    timeoutMs: EXTRA_LONG_AI_REQUEST_TIMEOUT_MS,
    timeoutMessage: 'Write 请求超时，请重试',
    ...options,
  });
}

export function styleChapterDraft(serverUrl: string, request: AIStyleRequest, options?: JsonRequestOptions) {
  return postJson<AIStyleRequest, AIStyleResponse>(serverUrl, '/api/ai/style', request, {
    timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
    timeoutMessage: 'Style 请求超时，请重试',
    ...options,
  });
}

export function reviewChapterDraft(serverUrl: string, request: AIReviewRequest, options?: JsonRequestOptions) {
  return postJson<AIReviewRequest, AIReviewResponse>(serverUrl, '/api/ai/review', request, {
    timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
    timeoutMessage: 'Review 请求超时，请重试',
    ...options,
  });
}

export function checkChapterLanguageQa(
  serverUrl: string,
  request: AILanguageQaRequest,
  options?: JsonRequestOptions,
) {
  return postJson<AILanguageQaRequest, AILanguageQaResponse>(
    serverUrl,
    '/api/ai/language-qa',
    request,
    {
      timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
      timeoutMessage: '语言校对请求超时，请重试',
      ...options,
    },
  );
}

export function polishChapterDraft(serverUrl: string, request: AIPolishRequest, options?: JsonRequestOptions) {
  return postJson<AIPolishRequest, AIPolishResponse>(serverUrl, '/api/ai/polish', request, {
    timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
    timeoutMessage: 'Polish 请求超时，请重试',
    ...options,
  });
}

export function editorRefineChapterDraft(
  serverUrl: string,
  request: AIEditorRefineRequest,
  options?: JsonRequestOptions,
) {
  return postJson<AIEditorRefineRequest, AIEditorRefineResponse>(serverUrl, '/api/ai/editor-refine', request, {
    timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
    timeoutMessage: 'Editor Refine 请求超时，请重试',
    ...options,
  });
}

export function extractChapterState(serverUrl: string, request: AIExtractRequest, options?: JsonRequestOptions) {
  return postJson<AIExtractRequest, AIExtractResponse>(serverUrl, '/api/ai/extract', request, {
    timeoutMs: LONG_AI_REQUEST_TIMEOUT_MS,
    timeoutMessage: 'Extract 请求超时，请重试',
    ...options,
  });
}

export function syncGenerationArtifacts(serverUrl: string, request: GenerationArtifactSyncRequest) {
  return postJson<GenerationArtifactSyncRequest, GenerationArtifactSyncResponse>(
    serverUrl,
    '/api/generation/artifacts/sync',
    request,
  );
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
