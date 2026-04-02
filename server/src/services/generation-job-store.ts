import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ServerEnv } from '../config/env.js';
import type {
  GenerationForeshadowSnapshotStatus,
  GenerationJobRecord,
  GenerationJobRequest,
  GenerationJobStatus,
  GenerationJobStep,
} from '../types/ai.js';
import { getGenerationDatabase } from './generation-sqlite.js';

type GenerationJobPatch = Partial<
  Pick<
    GenerationJobRecord,
    | 'status'
    | 'priority'
    | 'currentStep'
    | 'completedBeatCount'
    | 'totalBeatCount'
    | 'currentBeatIndex'
    | 'currentBeatLabel'
    | 'attemptCount'
    | 'reviewRewriteCount'
    | 'reviewGateReason'
    | 'rewriteGuidance'
    | 'pausedAt'
    | 'errorMessage'
    | 'outline'
    | 'generatedText'
    | 'style'
    | 'review'
    | 'polish'
    | 'summary'
    | 'stateChanges'
    | 'strand'
    | 'updatedAt'
  >
>;

let storeLock = Promise.resolve();
let migrationChecked = false;

function withStoreLock<T>(task: () => Promise<T>) {
  const result = storeLock.then(task, task);
  storeLock = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function getLegacyStoreFilePath(env: ServerEnv) {
  return path.resolve(process.cwd(), env.generationDataDir, 'generation-jobs.json');
}

function toNonNegativeInteger(value: unknown, fallback = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function normalizeStatus(value: unknown): GenerationJobStatus {
  return value === 'queued' ||
    value === 'running' ||
    value === 'paused' ||
    value === 'ready' ||
    value === 'approved' ||
    value === 'discarded' ||
    value === 'error'
    ? value
    : 'queued';
}

function normalizeForeshadowStatus(value: unknown): GenerationForeshadowSnapshotStatus {
  return value === 'activated' || value === 'resolved' || value === 'overdue' ? value : 'planted';
}

function inferStep(candidate: Partial<GenerationJobRecord>, status: GenerationJobStatus): GenerationJobStep {
  if (candidate.currentStep === 'queued' ||
    candidate.currentStep === 'plan' ||
    candidate.currentStep === 'write' ||
    candidate.currentStep === 'style' ||
    candidate.currentStep === 'review' ||
    candidate.currentStep === 'polish' ||
    candidate.currentStep === 'extract' ||
    candidate.currentStep === 'complete') {
    return candidate.currentStep;
  }

  if (status === 'ready' || status === 'approved' || status === 'discarded') {
    return 'complete';
  }

  if (candidate.summary) {
    return 'extract';
  }

  if (candidate.polish) {
    return 'polish';
  }

  if (candidate.review) {
    return 'review';
  }

  if (candidate.style) {
    return 'style';
  }

  if (candidate.outline) {
    return 'write';
  }

  return 'queued';
}

function normalizeRequest(
  candidate: Partial<GenerationJobRecord>,
  priority: number,
): GenerationJobRequest {
  const requestCandidate =
    candidate.request && typeof candidate.request === 'object'
      ? (candidate.request as Partial<GenerationJobRequest>)
      : {};

  return {
    projectId:
      typeof requestCandidate.projectId === 'string'
        ? requestCandidate.projectId
        : typeof candidate.projectId === 'string'
          ? candidate.projectId
          : '',
    chapterId:
      typeof requestCandidate.chapterId === 'string'
        ? requestCandidate.chapterId
        : typeof candidate.chapterId === 'string'
          ? candidate.chapterId
          : '',
    chapterTitle:
      typeof requestCandidate.chapterTitle === 'string'
        ? requestCandidate.chapterTitle
        : typeof candidate.chapterTitle === 'string'
          ? candidate.chapterTitle
          : '未命名章节',
    chapterOrder: typeof requestCandidate.chapterOrder === 'number' ? requestCandidate.chapterOrder : undefined,
    volumeTitle: typeof requestCandidate.volumeTitle === 'string' ? requestCandidate.volumeTitle : undefined,
    previousChapterId: typeof requestCandidate.previousChapterId === 'string' ? requestCandidate.previousChapterId : undefined,
    previousChapterTitle: typeof requestCandidate.previousChapterTitle === 'string' ? requestCandidate.previousChapterTitle : undefined,
    projectTitle: typeof requestCandidate.projectTitle === 'string' ? requestCandidate.projectTitle : undefined,
    projectDescription:
      typeof requestCandidate.projectDescription === 'string' ? requestCandidate.projectDescription : undefined,
    previousSummary: typeof requestCandidate.previousSummary === 'string' ? requestCandidate.previousSummary : undefined,
    worldState: typeof requestCandidate.worldState === 'string' ? requestCandidate.worldState : undefined,
    contextBundle: typeof requestCandidate.contextBundle === 'string' ? requestCandidate.contextBundle : undefined,
    stylePrompt: typeof requestCandidate.stylePrompt === 'string' ? requestCandidate.stylePrompt : undefined,
    model: typeof requestCandidate.model === 'string' ? requestCandidate.model : '',
    temperature: typeof requestCandidate.temperature === 'number' ? requestCandidate.temperature : 0.7,
    priority,
    gateConfigOverride:
      requestCandidate.gateConfigOverride && typeof requestCandidate.gateConfigOverride === 'object'
        ? {
            reviewRewriteMinSeverity: requestCandidate.gateConfigOverride.reviewRewriteMinSeverity,
            reviewMaxRewriteCount: requestCandidate.gateConfigOverride.reviewMaxRewriteCount,
            reviewScoreThresholds: requestCandidate.gateConfigOverride.reviewScoreThresholds,
            polishFailBlockReady: requestCandidate.gateConfigOverride.polishFailBlockReady,
            lightweightRecall: requestCandidate.gateConfigOverride.lightweightRecall,
          }
        : null,
    outlineOverride:
      requestCandidate.outlineOverride && typeof requestCandidate.outlineOverride === 'object'
        ? requestCandidate.outlineOverride
        : null,
    entitySnapshot: Array.isArray(requestCandidate.entitySnapshot)
      ? requestCandidate.entitySnapshot
          .filter((item) => item && typeof item === 'object' && typeof item.name === 'string')
          .map((item) => ({
            name: item.name.trim(),
            type: typeof item.type === 'string' ? item.type : 'unknown',
            description: typeof item.description === 'string' ? item.description : '',
            fields:
              item.fields && typeof item.fields === 'object'
                ? item.fields
                : {},
            tags: Array.isArray(item.tags)
              ? item.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
              : [],
            pinned: typeof item.pinned === 'boolean' ? item.pinned : false,
          }))
          .filter((item) => item.name)
      : [],
    foreshadowSnapshot: Array.isArray(requestCandidate.foreshadowSnapshot)
      ? requestCandidate.foreshadowSnapshot
          .filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
          .map((item) => ({
            id: item.id.trim(),
            title: typeof item.title === 'string' ? item.title.trim() : '',
            excerpt: typeof item.excerpt === 'string' ? item.excerpt.trim() : '',
            notes: typeof item.notes === 'string' ? item.notes.trim() : '',
            status: normalizeForeshadowStatus(item.status),
            sourceChapterId:
              typeof item.sourceChapterId === 'string' && item.sourceChapterId.trim()
                ? item.sourceChapterId.trim()
                : null,
            sourceChapterTitle: typeof item.sourceChapterTitle === 'string' ? item.sourceChapterTitle.trim() : '',
            resolvedChapterId:
              typeof item.resolvedChapterId === 'string' && item.resolvedChapterId.trim()
                ? item.resolvedChapterId.trim()
                : null,
            resolvedChapterTitle:
              typeof item.resolvedChapterTitle === 'string' ? item.resolvedChapterTitle.trim() : '',
            updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt.trim() : '',
          }))
          .filter((item) => item.id)
      : undefined,
  };
}

function normalizeGenerationJob(raw: unknown): GenerationJobRecord {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<GenerationJobRecord>;
  const now = new Date().toISOString();
  const status = normalizeStatus(candidate.status);
  const priority = toNonNegativeInteger(
    candidate.priority ?? (candidate.request as Partial<GenerationJobRequest> | undefined)?.priority,
    0,
  );
  const request = normalizeRequest(candidate, priority);
  const totalBeatCount = toNonNegativeInteger(
    candidate.totalBeatCount ??
      ((candidate.outline && Array.isArray(candidate.outline.beats) && candidate.outline.beats.length) || 0),
    0,
  );
  const completedBeatCount = Math.min(
    totalBeatCount,
    toNonNegativeInteger(candidate.completedBeatCount, candidate.generatedText ? 0 : 0),
  );
  const currentBeatIndex =
    typeof candidate.currentBeatIndex === 'number' &&
    Number.isFinite(candidate.currentBeatIndex) &&
    candidate.currentBeatIndex >= 0 &&
    candidate.currentBeatIndex < Math.max(totalBeatCount, 1)
      ? Math.trunc(candidate.currentBeatIndex)
      : null;

  return {
    id: typeof candidate.id === 'string' ? candidate.id : '',
    projectId: request.projectId,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    status,
    priority,
    currentStep: inferStep(candidate, status),
    completedBeatCount,
    totalBeatCount,
    currentBeatIndex,
    currentBeatLabel: typeof candidate.currentBeatLabel === 'string' ? candidate.currentBeatLabel : '',
    attemptCount: toNonNegativeInteger(candidate.attemptCount, 0),
    reviewRewriteCount: toNonNegativeInteger(candidate.reviewRewriteCount, 0),
    reviewGateReason: typeof candidate.reviewGateReason === 'string' ? candidate.reviewGateReason : '',
    rewriteGuidance: typeof candidate.rewriteGuidance === 'string' ? candidate.rewriteGuidance : '',
    pausedAt: typeof candidate.pausedAt === 'string' ? candidate.pausedAt : null,
    request,
    outline:
      candidate.outline && typeof candidate.outline === 'object'
        ? candidate.outline
        : null,
    generatedText: typeof candidate.generatedText === 'string' ? candidate.generatedText : '',
    style:
      candidate.style && typeof candidate.style === 'object'
        ? candidate.style
        : null,
    review:
      candidate.review && typeof candidate.review === 'object'
        ? candidate.review
        : null,
    polish:
      candidate.polish && typeof candidate.polish === 'object'
        ? candidate.polish
        : null,
    summary:
      candidate.summary && typeof candidate.summary === 'object'
        ? candidate.summary
        : null,
    stateChanges: Array.isArray(candidate.stateChanges) ? candidate.stateChanges : [],
    strand:
      candidate.strand === 'quest' || candidate.strand === 'fire' || candidate.strand === 'constellation'
        ? candidate.strand
        : null,
    errorMessage: typeof candidate.errorMessage === 'string' ? candidate.errorMessage : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt:
      typeof candidate.updatedAt === 'string'
        ? candidate.updatedAt
        : typeof candidate.createdAt === 'string'
          ? candidate.createdAt
          : now,
  };
}

function parseJsonText<T>(rawText: string | null): T | null {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    return null;
  }
}

function serializeJson(value: unknown) {
  return value === null || typeof value === 'undefined' ? null : JSON.stringify(value);
}

function mapRowToJob(row: Record<string, unknown>) {
  return normalizeGenerationJob({
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    status: row.status,
    priority: row.priority,
    currentStep: row.current_step,
    completedBeatCount: row.completed_beat_count,
    totalBeatCount: row.total_beat_count,
    currentBeatIndex: row.current_beat_index,
    currentBeatLabel: row.current_beat_label,
    attemptCount: row.attempt_count,
    reviewRewriteCount: row.review_rewrite_count,
    reviewGateReason: row.review_gate_reason,
    rewriteGuidance: row.rewrite_guidance,
    pausedAt: row.paused_at,
    request: parseJsonText<GenerationJobRequest>(String(row.request_json ?? 'null')),
    outline: parseJsonText(String(row.outline_json ?? 'null')),
    generatedText: row.generated_text,
    style: parseJsonText(String(row.style_json ?? 'null')),
    review: parseJsonText(String(row.review_json ?? 'null')),
    polish: parseJsonText(String(row.polish_json ?? 'null')),
    summary: parseJsonText(String(row.summary_json ?? 'null')),
    stateChanges: parseJsonText(String(row.state_changes_json ?? '[]')),
    strand: row.strand,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function upsertJobRow(env: ServerEnv, job: GenerationJobRecord) {
  const db = getGenerationDatabase(env);
  const statement = db.prepare(`
    INSERT INTO generation_jobs (
      id, project_id, chapter_id, chapter_title, status, priority, current_step,
      completed_beat_count, total_beat_count, current_beat_index, current_beat_label,
      attempt_count, review_rewrite_count, review_gate_reason, rewrite_guidance, paused_at,
      request_json, outline_json, generated_text, style_json, review_json, polish_json,
      summary_json, state_changes_json, strand, error_message, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      chapter_id = excluded.chapter_id,
      chapter_title = excluded.chapter_title,
      status = excluded.status,
      priority = excluded.priority,
      current_step = excluded.current_step,
      completed_beat_count = excluded.completed_beat_count,
      total_beat_count = excluded.total_beat_count,
      current_beat_index = excluded.current_beat_index,
      current_beat_label = excluded.current_beat_label,
      attempt_count = excluded.attempt_count,
      review_rewrite_count = excluded.review_rewrite_count,
      review_gate_reason = excluded.review_gate_reason,
      rewrite_guidance = excluded.rewrite_guidance,
      paused_at = excluded.paused_at,
      request_json = excluded.request_json,
      outline_json = excluded.outline_json,
      generated_text = excluded.generated_text,
      style_json = excluded.style_json,
      review_json = excluded.review_json,
      polish_json = excluded.polish_json,
      summary_json = excluded.summary_json,
      state_changes_json = excluded.state_changes_json,
      strand = excluded.strand,
      error_message = excluded.error_message,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);

  statement.run(
    job.id,
    job.projectId,
    job.chapterId,
    job.chapterTitle,
    job.status,
    job.priority,
    job.currentStep,
    job.completedBeatCount,
    job.totalBeatCount,
    job.currentBeatIndex,
    job.currentBeatLabel,
    job.attemptCount,
    job.reviewRewriteCount,
    job.reviewGateReason,
    job.rewriteGuidance,
    job.pausedAt,
    JSON.stringify(job.request),
    serializeJson(job.outline),
    job.generatedText,
    serializeJson(job.style),
    serializeJson(job.review),
    serializeJson(job.polish),
    serializeJson(job.summary),
    JSON.stringify(job.stateChanges),
    job.strand,
    job.errorMessage,
    job.createdAt,
    job.updatedAt,
  );
}

function listAllJobs(env: ServerEnv) {
  const db = getGenerationDatabase(env);
  const rows = db.prepare('SELECT * FROM generation_jobs').all() as Record<string, unknown>[];
  return rows.map(mapRowToJob);
}

function findJobById(env: ServerEnv, jobId: string) {
  const db = getGenerationDatabase(env);
  const row = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId) as Record<string, unknown> | undefined;
  return row ? mapRowToJob(row) : null;
}

function ensureMigratedFromLegacyJson(env: ServerEnv) {
  if (migrationChecked) {
    return;
  }

  const db = getGenerationDatabase(env);
  const row = db.prepare('SELECT COUNT(*) AS count FROM generation_jobs').get() as { count?: number | bigint };
  const count = Number(row.count ?? 0);

  if (count > 0) {
    migrationChecked = true;
    return;
  }

  const legacyStoreFilePath = getLegacyStoreFilePath(env);

  if (!existsSync(legacyStoreFilePath)) {
    migrationChecked = true;
    return;
  }

  try {
    const rawText = readFileSync(legacyStoreFilePath, 'utf8');
    const parsed = JSON.parse(rawText) as unknown;

    if (!Array.isArray(parsed)) {
      migrationChecked = true;
      return;
    }

    db.exec('BEGIN');

    try {
      for (const item of parsed) {
        const normalizedJob = normalizeGenerationJob(item);

        if (!normalizedJob.id) {
          continue;
        }

        upsertJobRow(env, normalizedJob);
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    migrationChecked = true;
  }
}

function compareJobs(left: GenerationJobRecord, right: GenerationJobRecord) {
  if (right.priority !== left.priority) {
    return right.priority - left.priority;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

export function listGenerationJobs(env: ServerEnv, projectId?: string) {
  return withStoreLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const jobs = listAllJobs(env);
    const filteredJobs = projectId ? jobs.filter((job) => job.projectId === projectId) : jobs;

    return filteredJobs.sort((left, right) => {
      const statusWeight = (status: GenerationJobStatus) => {
        switch (status) {
          case 'running':
            return 0;
          case 'queued':
            return 1;
          case 'paused':
            return 2;
          case 'ready':
            return 3;
          case 'error':
            return 4;
          default:
            return 5;
        }
      };

      const statusDiff = statusWeight(left.status) - statusWeight(right.status);

      if (statusDiff !== 0) {
        return statusDiff;
      }

      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });
  });
}

export function findGenerationJob(env: ServerEnv, jobId: string) {
  return withStoreLock(async () => {
    ensureMigratedFromLegacyJson(env);
    return findJobById(env, jobId);
  });
}

export function upsertGenerationJob(env: ServerEnv, job: GenerationJobRecord) {
  return withStoreLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const normalizedJob = normalizeGenerationJob(job);
    upsertJobRow(env, normalizedJob);
    return normalizedJob;
  });
}

export function updateGenerationJob(env: ServerEnv, jobId: string, patch: GenerationJobPatch) {
  return withStoreLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const current = findJobById(env, jobId);

    if (!current) {
      return null;
    }

    const nextJob = normalizeGenerationJob({
      ...current,
      ...patch,
      request: {
        ...current.request,
        priority: typeof patch.priority === 'number' ? patch.priority : current.request.priority,
      },
    });

    upsertJobRow(env, nextJob);
    return nextJob;
  });
}

export function updateManyGenerationJobs(
  env: ServerEnv,
  jobIds: string[],
  buildPatch: (job: GenerationJobRecord) => GenerationJobPatch | null,
) {
  return withStoreLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const jobs = listAllJobs(env);
    const targetIdSet = new Set(jobIds);
    const updatedJobs: GenerationJobRecord[] = [];
    const db = getGenerationDatabase(env);

    db.exec('BEGIN');

    try {
      for (const job of jobs) {
        if (!targetIdSet.has(job.id)) {
          continue;
        }

        const patch = buildPatch(job);

        if (!patch) {
          continue;
        }

        const nextJob = normalizeGenerationJob({
          ...job,
          ...patch,
          request: {
            ...job.request,
            priority: typeof patch.priority === 'number' ? patch.priority : job.request.priority,
          },
        });

        upsertJobRow(env, nextJob);
        updatedJobs.push(nextJob);
      }

      db.exec('COMMIT');
      return updatedJobs;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

export function clearResolvedGenerationJobs(env: ServerEnv, projectId: string) {
  return withStoreLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const db = getGenerationDatabase(env);
    db.prepare(
      "DELETE FROM generation_jobs WHERE project_id = ? AND status IN ('approved', 'discarded')",
    ).run(projectId);
  });
}

export function findNextQueuedJob(env: ServerEnv) {
  return withStoreLock(async () => {
    ensureMigratedFromLegacyJson(env);
    return listAllJobs(env)
      .filter((job) => job.status === 'queued')
      .sort(compareJobs)[0] ?? null;
  });
}

export function recoverInterruptedGenerationJobs(env: ServerEnv) {
  return withStoreLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const jobs = listAllJobs(env);
    const db = getGenerationDatabase(env);
    const now = new Date().toISOString();
    const recoveredJobs: GenerationJobRecord[] = [];

    db.exec('BEGIN');

    try {
      for (const job of jobs) {
        if (job.status !== 'running') {
          continue;
        }

        const nextJob = normalizeGenerationJob({
          ...job,
          status: 'queued',
          pausedAt: null,
          updatedAt: now,
        });

        upsertJobRow(env, nextJob);
        recoveredJobs.push(nextJob);
      }

      db.exec('COMMIT');
      return recoveredJobs;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

export function countGenerationJobsByStatus(env: ServerEnv, status: GenerationJobStatus) {
  return withStoreLock(async () => {
    ensureMigratedFromLegacyJson(env);
    const db = getGenerationDatabase(env);
    const row = db.prepare('SELECT COUNT(*) AS count FROM generation_jobs WHERE status = ?').get(status) as {
      count?: number | bigint;
    };
    return Number(row.count ?? 0);
  });
}
