import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import type {
  AIBookAnalysisRequest,
  AIBookAnalysisResponse,
  BookAnalysisRange,
  BookAnalysisJobRecord,
  BookAnalysisJobStage,
  BookAnalysisJobStatus,
} from '../types/ai.js';
import type { BookAnalysisCheckpoint } from './template-analysis.js';

type BookAnalysisJobPatch = Partial<
  Pick<
    BookAnalysisJobRecord,
    | 'status'
    | 'progressStage'
    | 'progressPercent'
    | 'message'
    | 'totalSegments'
    | 'sampledSegments'
    | 'finishedSegments'
    | 'estimatedWordCount'
    | 'errorMessage'
    | 'result'
    | 'updatedAt'
  >
>;

interface BookAnalysisJobEntry {
  job: BookAnalysisJobRecord;
  request: AIBookAnalysisRequest;
  checkpoint: BookAnalysisCheckpoint | null;
}

let storeLock = Promise.resolve();
const loadedStoreByFilePath = new Set<string>();
const entryStoreByFilePath = new Map<string, Map<string, BookAnalysisJobEntry>>();

function withStoreLock<T>(task: () => Promise<T>) {
  const result = storeLock.then(task, task);
  storeLock = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function now() {
  return new Date().toISOString();
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function getStoreFilePath(env: ServerEnv) {
  return path.resolve(process.cwd(), env.generationDataDir, 'book-analysis-jobs.json');
}

function getEntryMap(env: ServerEnv) {
  const filePath = getStoreFilePath(env);
  let entryMap = entryStoreByFilePath.get(filePath);

  if (!entryMap) {
    entryMap = new Map<string, BookAnalysisJobEntry>();
    entryStoreByFilePath.set(filePath, entryMap);
  }

  return entryMap;
}

function serializeEntries(entries: BookAnalysisJobEntry[]) {
  return JSON.stringify(entries, null, 2);
}

function normalizeStatus(value: unknown): BookAnalysisJobStatus {
  return value === 'pending' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
    ? value
    : 'pending';
}

function normalizeAnalysisRange(value: unknown): BookAnalysisRange {
  return value === 'opening' || value === 'middle' || value === 'ending' || value === 'custom'
    ? value
    : 'full';
}

function normalizePositiveIndex(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.max(1, Math.trunc(value));
  return normalized > 0 ? normalized : null;
}

function normalizeStage(value: unknown): BookAnalysisJobStage {
  return value === 'pending' ||
    value === 'preprocessing' ||
    value === 'light_analyzing' ||
    value === 'sampling' ||
    value === 'chunk_analyzing' ||
    value === 'aggregating' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
    ? value
    : 'pending';
}

function normalizeJob(raw: unknown): BookAnalysisJobRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Partial<BookAnalysisJobRecord>;
  const timestamp = now();
  const status = normalizeStatus(candidate.status);
  const normalizedStatus =
    status === 'pending' || status === 'running'
      ? 'failed'
      : status;

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : randomUUID(),
    sourceTitle: typeof candidate.sourceTitle === 'string' ? candidate.sourceTitle.trim() : '',
    sourceAuthor: typeof candidate.sourceAuthor === 'string' ? candidate.sourceAuthor.trim() : '',
    analysisRange: normalizeAnalysisRange(candidate.analysisRange),
    rangeStartIndex: normalizePositiveIndex(candidate.rangeStartIndex),
    rangeEndIndex: normalizePositiveIndex(candidate.rangeEndIndex),
    status: normalizedStatus,
    progressStage:
      status === 'pending' || status === 'running'
        ? 'failed'
        : normalizeStage(candidate.progressStage),
    progressPercent:
      typeof candidate.progressPercent === 'number'
        ? clampProgress(candidate.progressPercent)
        : normalizedStatus === 'completed'
          ? 100
          : 0,
    message:
      status === 'pending' || status === 'running'
        ? '服务重启后任务中断'
        : typeof candidate.message === 'string'
          ? candidate.message
          : '',
    totalSegments: typeof candidate.totalSegments === 'number' ? Math.max(0, Math.trunc(candidate.totalSegments)) : 0,
    sampledSegments: typeof candidate.sampledSegments === 'number' ? Math.max(0, Math.trunc(candidate.sampledSegments)) : 0,
    finishedSegments: typeof candidate.finishedSegments === 'number' ? Math.max(0, Math.trunc(candidate.finishedSegments)) : 0,
    estimatedWordCount:
      typeof candidate.estimatedWordCount === 'number'
        ? Math.max(0, Math.trunc(candidate.estimatedWordCount))
        : 0,
    errorMessage:
      status === 'pending' || status === 'running'
        ? '服务重启后任务中断'
        : typeof candidate.errorMessage === 'string'
          ? candidate.errorMessage
          : '',
    result:
      candidate.result && typeof candidate.result === 'object'
        ? candidate.result as AIBookAnalysisResponse
        : null,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : timestamp,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : timestamp,
  };
}

function normalizeRequest(raw: unknown): AIBookAnalysisRequest | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Partial<AIBookAnalysisRequest>;

  if (
    typeof candidate.sourceTitle !== 'string' ||
    typeof candidate.content !== 'string' ||
    typeof candidate.model !== 'string' ||
    typeof candidate.temperature !== 'number'
  ) {
    return null;
  }

  return {
    sourceTitle: candidate.sourceTitle.trim(),
    sourceAuthor: typeof candidate.sourceAuthor === 'string' ? candidate.sourceAuthor.trim() : undefined,
    content: candidate.content,
    analysisRange: normalizeAnalysisRange(candidate.analysisRange),
    rangeStartIndex: normalizePositiveIndex(candidate.rangeStartIndex) ?? undefined,
    rangeEndIndex: normalizePositiveIndex(candidate.rangeEndIndex) ?? undefined,
    model: candidate.model.trim(),
    temperature: candidate.temperature,
    reasoningEffort:
      candidate.reasoningEffort === 'none' ||
      candidate.reasoningEffort === 'minimal' ||
      candidate.reasoningEffort === 'low' ||
      candidate.reasoningEffort === 'medium' ||
      candidate.reasoningEffort === 'high' ||
      candidate.reasoningEffort === 'xhigh'
        ? candidate.reasoningEffort
        : undefined,
  };
}

function ensureStoreLoaded(env: ServerEnv) {
  const filePath = getStoreFilePath(env);

  if (loadedStoreByFilePath.has(filePath)) {
    return;
  }

  const entryMap = getEntryMap(env);
  entryMap.clear();

  if (existsSync(filePath)) {
    try {
      const rawText = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(rawText) as unknown;

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== 'object') {
            continue;
          }

          const candidate = item as { job?: unknown; request?: unknown; checkpoint?: unknown };
          const job = normalizeJob(candidate.job);
          const request = normalizeRequest(candidate.request);

          if (!job || !request) {
            continue;
          }

          entryMap.set(job.id, {
            job,
            request,
            checkpoint:
              candidate.checkpoint && typeof candidate.checkpoint === 'object'
                ? candidate.checkpoint as BookAnalysisCheckpoint
                : null,
          });
        }
      }
    } catch {
      entryMap.clear();
    }
  }

  loadedStoreByFilePath.add(filePath);
}

function persistStore(env: ServerEnv) {
  const filePath = getStoreFilePath(env);
  const entryMap = getEntryMap(env);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, serializeEntries([...entryMap.values()]), 'utf8');
}

function createEmptyJob(request: AIBookAnalysisRequest) {
  const timestamp = now();

  return {
    id: randomUUID(),
    sourceTitle: request.sourceTitle.trim(),
    sourceAuthor: request.sourceAuthor?.trim() || '',
    analysisRange: normalizeAnalysisRange(request.analysisRange),
    rangeStartIndex: normalizePositiveIndex(request.rangeStartIndex),
    rangeEndIndex: normalizePositiveIndex(request.rangeEndIndex),
    status: 'pending' as BookAnalysisJobStatus,
    progressStage: 'pending' as BookAnalysisJobStage,
    progressPercent: 0,
    message: '等待开始',
    totalSegments: 0,
    sampledSegments: 0,
    finishedSegments: 0,
    estimatedWordCount: 0,
    errorMessage: '',
    result: null as AIBookAnalysisResponse | null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createBookAnalysisJobRecord(env: ServerEnv, request: AIBookAnalysisRequest) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    const entryMap = getEntryMap(env);
    const job = createEmptyJob(request);

    entryMap.set(job.id, {
      job,
      request,
      checkpoint: null,
    });
    persistStore(env);
    return job;
  });
}

export function listBookAnalysisJobs(env: ServerEnv) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    return [...getEntryMap(env).values()]
      .map((entry) => entry.job)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });
}

export function getBookAnalysisJob(env: ServerEnv, jobId: string) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    return getEntryMap(env).get(jobId)?.job ?? null;
  });
}

export function getBookAnalysisJobRequest(env: ServerEnv, jobId: string) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    return getEntryMap(env).get(jobId)?.request ?? null;
  });
}

export function getBookAnalysisCheckpoint(env: ServerEnv, jobId: string) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    return getEntryMap(env).get(jobId)?.checkpoint ?? null;
  });
}

export function peekBookAnalysisJob(env: ServerEnv, jobId: string) {
  ensureStoreLoaded(env);
  return getEntryMap(env).get(jobId)?.job ?? null;
}

export function isBookAnalysisJobCancelled(env: ServerEnv, jobId: string) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    const job = getEntryMap(env).get(jobId)?.job ?? null;
    return job?.status === 'cancelled';
  });
}

export function isBookAnalysisJobCancelledSync(env: ServerEnv, jobId: string) {
  return peekBookAnalysisJob(env, jobId)?.status === 'cancelled';
}

export function updateBookAnalysisJob(env: ServerEnv, jobId: string, patch: BookAnalysisJobPatch) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    const entryMap = getEntryMap(env);
    const current = entryMap.get(jobId);

    if (!current) {
      return null;
    }

    const nextJob: BookAnalysisJobRecord = {
      ...current.job,
      ...patch,
      progressPercent:
        typeof patch.progressPercent === 'number'
          ? clampProgress(patch.progressPercent)
          : current.job.progressPercent,
      updatedAt: patch.updatedAt ?? now(),
    };

    entryMap.set(jobId, {
      ...current,
      job: nextJob,
    });
    persistStore(env);
    return nextJob;
  });
}

export function saveBookAnalysisCheckpoint(
  env: ServerEnv,
  jobId: string,
  checkpoint: BookAnalysisCheckpoint | null,
) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    const entryMap = getEntryMap(env);
    const current = entryMap.get(jobId);

    if (!current) {
      return null;
    }

    entryMap.set(jobId, {
      ...current,
      checkpoint,
    });
    persistStore(env);
    return checkpoint;
  });
}

export function markBookAnalysisJobCompleted(
  env: ServerEnv,
  jobId: string,
  result: AIBookAnalysisResponse,
) {
  return updateBookAnalysisJob(env, jobId, {
    status: 'completed',
    progressStage: 'completed',
    progressPercent: 100,
    message: '拆书分析完成',
    result,
    errorMessage: '',
  });
}

export function markBookAnalysisJobFailed(env: ServerEnv, jobId: string, message: string) {
  return updateBookAnalysisJob(env, jobId, {
    status: 'failed',
    progressStage: 'failed',
    progressPercent: 100,
    message: '拆书分析失败',
    errorMessage: message,
  });
}

export function cancelBookAnalysisJob(env: ServerEnv, jobId: string) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    const entryMap = getEntryMap(env);
    const current = entryMap.get(jobId);

    if (!current) {
      return null;
    }

    if (
      current.job.status === 'completed' ||
      current.job.status === 'failed' ||
      current.job.status === 'cancelled'
    ) {
      return current.job;
    }

    const nextJob: BookAnalysisJobRecord = {
      ...current.job,
      status: 'cancelled',
      progressStage: 'cancelled',
      message: '任务已取消',
      updatedAt: now(),
    };

    entryMap.set(jobId, {
      ...current,
      job: nextJob,
    });
    persistStore(env);
    return nextJob;
  });
}

export function resetBookAnalysisJobForRetry(env: ServerEnv, jobId: string) {
  return withStoreLock(async () => {
    ensureStoreLoaded(env);
    const entryMap = getEntryMap(env);
    const current = entryMap.get(jobId);

    if (!current) {
      return null;
    }

    const nextJob: BookAnalysisJobRecord = {
      ...current.job,
      status: 'running',
      progressStage: 'pending',
      progressPercent: 1,
      message: '任务已重试，等待执行',
      totalSegments: 0,
      sampledSegments: 0,
      finishedSegments: 0,
      estimatedWordCount: 0,
      errorMessage: '',
      result: null,
      updatedAt: now(),
    };

    entryMap.set(jobId, {
      ...current,
      job: nextJob,
    });
    persistStore(env);
    return {
      job: nextJob,
      request: current.request,
    };
  });
}
