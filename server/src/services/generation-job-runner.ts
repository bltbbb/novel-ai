import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import {
  clearResolvedGenerationJobs,
  findGenerationJob,
  findNextQueuedJob,
  listGenerationJobs,
  recoverInterruptedGenerationJobs,
  updateGenerationJob,
  updateManyGenerationJobs,
  upsertGenerationJob,
} from './generation-job-store.js';
import {
  checkChapterLanguageQa,
  extractChapterArtifacts,
  generateBeatDraft,
  generateChapterOutline,
  polishChapterDraft,
  reviewChapterDraft,
  styleChapterDraft,
} from './generation.js';
import {
  replaceGenerationStateChanges,
  upsertGenerationChapterSummary,
  upsertGenerationLanguageQaMetrics,
  upsertGenerationReviewMetrics,
} from './generation-artifact-store.js';
import {
  upsertGenerationChapterIndex,
  upsertGenerationEntitiesSnapshot,
  upsertGenerationEntitiesFromStateChanges,
  replaceGenerationRelationshipsFromStateChanges,
} from './generation-knowledge-store.js';
import { replaceGenerationForeshadows } from './generation-foreshadow-store.js';
import { replaceGenerationMemoryChunks } from './generation-memory-store.js';
import { rebuildGenerationVolumeRecap } from './generation-volume-recap-store.js';
import type {
  ChapterLanguageQaDraft,
  ChapterReviewDraft,
  GenerationJobBatchAction,
  GenerationJobBatchRequest,
  GenerationGateConfig,
  GenerationJobRecord,
  GenerationJobRollbackStage,
  GenerationJobRequest,
  GenerationJobStatus,
  ReviewSeverity,
} from '../types/ai.js';

function createGenerationJob(request: GenerationJobRequest): GenerationJobRecord {
  const now = new Date().toISOString();
  const priority = Math.max(0, Math.trunc(request.priority ?? 0));

  return {
    id: randomUUID(),
    projectId: request.projectId,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    status: 'queued',
    priority,
    currentStep: 'queued',
    completedBeatCount: 0,
    totalBeatCount: 0,
    currentBeatIndex: null,
    currentBeatLabel: '',
    attemptCount: 0,
    reviewRewriteCount: 0,
    reviewGateReason: '',
    rewriteGuidance: '',
    pausedAt: null,
    request: {
      ...request,
      priority,
    },
    outline: null,
    generatedText: '',
    style: null,
    review: null,
    languageQa: null,
    polish: null,
    summary: null,
    stateChanges: [],
    strand: null,
    errorMessage: '',
    createdAt: now,
    updatedAt: now,
  };
}

function nowIsoString() {
  return new Date().toISOString();
}

function isStoppedStatus(status: GenerationJobStatus) {
  return status === 'paused' || status === 'approved' || status === 'discarded';
}

async function loadJobOrThrow(env: ServerEnv, jobId: string) {
  const job = await findGenerationJob(env, jobId);

  if (!job) {
    throw new Error('目标任务不存在');
  }

  return job;
}

async function loadRunnableJob(env: ServerEnv, jobId: string) {
  const job = await loadJobOrThrow(env, jobId);
  return isStoppedStatus(job.status) ? null : job;
}

function buildGeneratedText(previousText: string, nextChunk: string) {
  return [previousText, nextChunk.trim()].filter(Boolean).join('\n\n');
}

function getReviewSeverityWeight(severity: ReviewSeverity) {
  switch (severity) {
    case 'critical':
      return 3;
    case 'high':
      return 2;
    case 'medium':
      return 1;
    case 'low':
    default:
      return 0;
  }
}

function getEffectiveGateConfig(env: ServerEnv, job: Pick<GenerationJobRecord, 'request'>) {
  return job.request.gateConfigOverride ?? env.generationGateConfig;
}

function findScoreThresholdViolation(review: ChapterReviewDraft, gateConfig: GenerationGateConfig) {
  return review.checkerResults.find((checker) => {
    const threshold = gateConfig.reviewScoreThresholds[checker.checker];
    return checker.score < threshold;
  }) ?? null;
}

function shouldRewriteForReviewWithConfig(review: ChapterReviewDraft, gateConfig: ServerEnv['generationGateConfig']) {
  return (
    review.needsRewrite ||
    review.antiAiForceCheck === 'fail' ||
    Boolean(findScoreThresholdViolation(review, gateConfig)) ||
    getReviewSeverityWeight(review.overallSeverity) >=
      getReviewSeverityWeight(gateConfig.reviewRewriteMinSeverity)
  );
}

function buildReviewGateReason(review: ChapterReviewDraft, gateConfig: GenerationGateConfig) {
  const criticalIssue = review.checkerResults
    .flatMap((checker) => checker.issues)
    .find((issue) => issue.severity === 'critical');

  if (criticalIssue) {
    return `${criticalIssue.title}：${criticalIssue.description}`;
  }

  if (review.antiAiForceCheck === 'fail') {
    return `Anti-AI 终检未通过：${review.summary}`;
  }

  const scoreViolation = findScoreThresholdViolation(review, gateConfig);

  if (scoreViolation) {
    return `${scoreViolation.checker} 分数 ${scoreViolation.score} 低于门槛 ${gateConfig.reviewScoreThresholds[scoreViolation.checker]}：${scoreViolation.summary}`;
  }

  return review.summary || '审查层判定需要重写';
}

function buildRewriteGuidance(
  review: ChapterReviewDraft,
  gateConfig: GenerationGateConfig,
  languageQa: ChapterLanguageQaDraft | null,
) {
  const issueLines = review.checkerResults
    .flatMap((checker) =>
      checker.issues.map((issue) => {
        const parts = [`[${checker.checker}] ${issue.title}`, issue.description];

        if (issue.suggestion) {
          parts.push(`修改建议：${issue.suggestion}`);
        }

        if (issue.evidence) {
          parts.push(`证据：${issue.evidence}`);
        }

        return parts.join('；');
      }),
    )
    .slice(0, 4);
  const scoreLines = review.checkerResults
    .filter((checker) => checker.score < gateConfig.reviewScoreThresholds[checker.checker])
    .map(
      (checker) =>
        `[${checker.checker}] 当前分数 ${checker.score}，低于门槛 ${gateConfig.reviewScoreThresholds[checker.checker]}；优先修复：${checker.summary}`,
    )
    .slice(0, 3);
  const languageQaLines = languageQa
    ? languageQa.issues
        .slice(0, 3)
        .map((issue) => {
          const parts = [`[language_qa] ${issue.title}`, issue.description];

          if (issue.suggestion) {
            parts.push(`修改建议：${issue.suggestion}`);
          }

          if (issue.evidence) {
            parts.push(`证据：${issue.evidence}`);
          }

          return parts.join('；');
        })
    : [];

  return [
    `审查总结：${review.summary}`,
    review.antiAiForceCheck === 'fail' ? 'Anti-AI 终检未通过，必须整体改写表达，避免重复高危词和机械句式。' : '',
    languageQa ? `语言校对：${languageQa.summary}` : '',
    ...scoreLines,
    ...issueLines,
    ...languageQaLines,
  ]
    .filter(Boolean)
    .join('\n');
}

function canApproveJob(job: GenerationJobRecord) {
  return job.status === 'ready';
}

function canDiscardJob(job: GenerationJobRecord) {
  return job.status !== 'approved' && job.status !== 'discarded';
}

function canRollbackJob(job: GenerationJobRecord, stage: GenerationJobRollbackStage) {
  if (job.status === 'approved' || job.status === 'discarded' || job.status === 'queued' || job.status === 'running') {
    return false;
  }

  if (!job.generatedText.trim()) {
    return false;
  }

  if (stage === 'review') {
    return true;
  }

  return Boolean(job.review);
}

export async function enqueueGenerationJobs(env: ServerEnv, request: GenerationJobBatchRequest) {
  const jobs: GenerationJobRecord[] = [];

  for (const jobRequest of request.jobs) {
    const job = createGenerationJob(jobRequest);
    await upsertGenerationJob(env, job);

    upsertGenerationEntitiesSnapshot(env, {
      projectId: job.projectId,
      chapterId: job.chapterId,
      chapterTitle: job.chapterTitle,
      entities: job.request.entitySnapshot ?? [],
    });
    if (Array.isArray(job.request.foreshadowSnapshot)) {
      replaceGenerationForeshadows(env, {
        projectId: job.projectId,
        foreshadows: job.request.foreshadowSnapshot,
      });
    }

    jobs.push(job);
  }

  return jobs;
}

export function listProjectGenerationJobs(env: ServerEnv, projectId?: string) {
  return listGenerationJobs(env, projectId);
}

export async function approveGenerationJob(env: ServerEnv, jobId: string) {
  const current = await findGenerationJob(env, jobId);

  if (!current || !canApproveJob(current)) {
    return null;
  }

  return updateGenerationJob(env, jobId, {
    status: 'approved',
    currentStep: 'complete',
    currentBeatIndex: null,
    currentBeatLabel: '',
    pausedAt: null,
    updatedAt: nowIsoString(),
  });
}

export async function discardGenerationJob(env: ServerEnv, jobId: string) {
  const current = await findGenerationJob(env, jobId);

  if (!current || !canDiscardJob(current)) {
    return null;
  }

  return updateGenerationJob(env, jobId, {
    status: 'discarded',
    currentStep: 'complete',
    currentBeatIndex: null,
    currentBeatLabel: '',
    pausedAt: null,
    updatedAt: nowIsoString(),
  });
}

export async function retryGenerationJob(env: ServerEnv, jobId: string) {
  const current = await findGenerationJob(env, jobId);

  if (!current) {
    return null;
  }

  const currentReview = current.review;
  const currentPolish = current.polish;
  const shouldResetForReviewGate =
    current.status === 'error' &&
    Boolean(current.reviewGateReason) &&
    currentReview !== null &&
    shouldRewriteForReviewWithConfig(currentReview, getEffectiveGateConfig(env, current));
  const shouldResetForPolishGate =
    current.status === 'error' &&
    currentPolish !== null &&
    currentPolish.antiAiForceCheck === 'fail' &&
    getEffectiveGateConfig(env, current).polishFailBlockReady;

  return updateGenerationJob(env, jobId, {
    status: 'queued',
    completedBeatCount: shouldResetForReviewGate ? 0 : current.completedBeatCount,
    totalBeatCount: shouldResetForReviewGate ? current.outline?.beats.length ?? current.totalBeatCount : current.totalBeatCount,
    currentBeatIndex: null,
    currentBeatLabel: '',
    reviewRewriteCount: shouldResetForReviewGate ? 0 : current.reviewRewriteCount,
    reviewGateReason: shouldResetForReviewGate ? '' : current.reviewGateReason,
    rewriteGuidance: shouldResetForPolishGate ? '' : current.rewriteGuidance,
    pausedAt: null,
    errorMessage: '',
    generatedText: shouldResetForReviewGate ? '' : current.generatedText,
    style: shouldResetForReviewGate ? null : current.style,
    review: shouldResetForReviewGate ? null : current.review,
    languageQa: shouldResetForReviewGate ? null : current.languageQa,
    polish: shouldResetForReviewGate || shouldResetForPolishGate ? null : current.polish,
    summary: shouldResetForReviewGate || shouldResetForPolishGate ? null : current.summary,
    stateChanges: shouldResetForReviewGate || shouldResetForPolishGate ? [] : current.stateChanges,
    strand: shouldResetForReviewGate || shouldResetForPolishGate ? null : current.strand,
    updatedAt: nowIsoString(),
  });
}

export async function pauseGenerationJob(env: ServerEnv, jobId: string) {
  const current = await findGenerationJob(env, jobId);

  if (!current || (current.status !== 'queued' && current.status !== 'running')) {
    return null;
  }

  return updateGenerationJob(env, jobId, {
    status: 'paused',
    pausedAt: nowIsoString(),
    updatedAt: nowIsoString(),
  });
}

export async function resumeGenerationJob(env: ServerEnv, jobId: string) {
  const current = await findGenerationJob(env, jobId);

  if (!current || current.status !== 'paused') {
    return null;
  }

  return updateGenerationJob(env, jobId, {
    status: 'queued',
    pausedAt: null,
    errorMessage: '',
    updatedAt: nowIsoString(),
  });
}

export async function reprioritizeGenerationJob(env: ServerEnv, jobId: string, priority: number) {
  const current = await findGenerationJob(env, jobId);

  if (!current) {
    return null;
  }

  const nextPriority = Math.max(0, Math.trunc(priority));

  return updateGenerationJob(env, jobId, {
    priority: nextPriority,
    updatedAt: nowIsoString(),
  });
}

export async function rollbackGenerationJobStage(
  env: ServerEnv,
  jobId: string,
  stage: GenerationJobRollbackStage,
) {
  const current = await findGenerationJob(env, jobId);

  if (!current || !canRollbackJob(current, stage)) {
    return null;
  }

  if (stage === 'review') {
    return updateGenerationJob(env, jobId, {
      status: 'queued',
      review: null,
      languageQa: null,
      polish: null,
      summary: null,
      stateChanges: [],
      strand: null,
      reviewGateReason: '',
      rewriteGuidance: '',
      errorMessage: '',
      currentStep: 'review',
      currentBeatIndex: null,
      currentBeatLabel: '',
      pausedAt: null,
      updatedAt: nowIsoString(),
    });
  }

  return updateGenerationJob(env, jobId, {
    status: 'queued',
    polish: null,
    summary: null,
    stateChanges: [],
    strand: null,
    errorMessage: '',
    currentStep: 'polish',
    currentBeatIndex: null,
    currentBeatLabel: '',
    pausedAt: null,
    updatedAt: nowIsoString(),
  });
}

export function batchUpdateGenerationJobs(env: ServerEnv, jobIds: string[], action: GenerationJobBatchAction) {
  const now = nowIsoString();

  return updateManyGenerationJobs(env, jobIds, (job) => {
    if (action === 'approve') {
      if (!canApproveJob(job)) {
        return null;
      }

      return {
        status: 'approved',
        currentStep: 'complete',
        currentBeatIndex: null,
        currentBeatLabel: '',
        pausedAt: null,
        updatedAt: now,
      };
    }

    if (!canDiscardJob(job)) {
      return null;
    }

    return {
      status: 'discarded',
      currentStep: 'complete',
      currentBeatIndex: null,
      currentBeatLabel: '',
      pausedAt: null,
      updatedAt: now,
    };
  });
}

export function clearProjectResolvedJobs(env: ServerEnv, projectId: string) {
  return clearResolvedGenerationJobs(env, projectId);
}

async function executeGenerationJob(env: ServerEnv, jobId: string) {
  let currentJob = await loadJobOrThrow(env, jobId);

  if (!currentJob.outline) {
    const runnableJob = await loadRunnableJob(env, jobId);

    if (!runnableJob) {
      return;
    }

    await updateGenerationJob(env, jobId, {
      currentStep: 'plan',
      currentBeatIndex: null,
      currentBeatLabel: '',
      updatedAt: nowIsoString(),
    });

    const outline = runnableJob.request.outlineOverride
      ? runnableJob.request.outlineOverride
      : (
          await generateChapterOutline(env, {
            projectId: runnableJob.projectId,
            chapterId: runnableJob.chapterId,
            chapterTitle: runnableJob.request.chapterTitle,
            chapterOrder: runnableJob.request.chapterOrder,
            volumeTitle: runnableJob.request.volumeTitle,
            previousChapterId: runnableJob.request.previousChapterId,
            previousChapterTitle: runnableJob.request.previousChapterTitle,
            projectTitle: runnableJob.request.projectTitle,
            projectDescription: runnableJob.request.projectDescription,
            bookOutline: runnableJob.request.bookOutline,
            volumeOutline: runnableJob.request.volumeOutline,
            volumeGoal: runnableJob.request.volumeGoal,
            chapterBeat: runnableJob.request.chapterBeat,
            nextChapterPreview: runnableJob.request.nextChapterPreview,
            forbiddenZone: runnableJob.request.forbiddenZone,
            previousSummary: runnableJob.request.previousSummary,
            worldState: runnableJob.request.worldState,
            contextBundle: runnableJob.request.contextBundle,
            gateConfigOverride: getEffectiveGateConfig(env, runnableJob),
            model: runnableJob.request.model,
            temperature: runnableJob.request.temperature,
            reasoningEffort: runnableJob.request.reasoningEffort,
          })
        ).outline;

    const afterPlanJob = await loadJobOrThrow(env, jobId);

    if (afterPlanJob.status === 'approved' || afterPlanJob.status === 'discarded') {
      return;
    }

    await updateGenerationJob(env, jobId, {
      outline,
      currentStep: 'write',
      totalBeatCount: outline.beats.length,
      completedBeatCount: 0,
      currentBeatIndex: null,
      currentBeatLabel: '',
      updatedAt: nowIsoString(),
    });
  }

  currentJob = await loadJobOrThrow(env, jobId);

  while (true) {
    currentJob = await loadJobOrThrow(env, jobId);
    const currentOutline = currentJob.outline;

    if (!currentOutline || currentOutline.beats.length === 0) {
      throw new Error('章节契约没有可执行的 beats');
    }

    if (currentJob.totalBeatCount !== currentOutline.beats.length) {
      await updateGenerationJob(env, jobId, {
        totalBeatCount: currentOutline.beats.length,
        updatedAt: nowIsoString(),
      });
      currentJob = await loadJobOrThrow(env, jobId);
    }

    for (let index = currentJob.completedBeatCount; index < currentOutline.beats.length; index += 1) {
      const runnableJob = await loadRunnableJob(env, jobId);

      if (!runnableJob) {
        return;
      }

      if (!runnableJob.outline) {
        throw new Error('章节契约缺失，无法继续生成');
      }

      const beat = runnableJob.outline.beats[index];

      if (!beat) {
        throw new Error('章节契约中的 beat 缺失，无法继续生成');
      }

      await updateGenerationJob(env, jobId, {
        currentStep: 'write',
        totalBeatCount: runnableJob.outline.beats.length,
        currentBeatIndex: index,
        currentBeatLabel: beat,
        updatedAt: nowIsoString(),
      });

      const writeResponse = await generateBeatDraft(env, {
        projectId: runnableJob.projectId,
        chapterId: runnableJob.chapterId,
        chapterTitle: runnableJob.request.chapterTitle,
        chapterOrder: runnableJob.request.chapterOrder,
        volumeTitle: runnableJob.request.volumeTitle,
        previousChapterId: runnableJob.request.previousChapterId,
        previousChapterTitle: runnableJob.request.previousChapterTitle,
        projectTitle: runnableJob.request.projectTitle,
        projectDescription: runnableJob.request.projectDescription,
        bookOutline: runnableJob.request.bookOutline,
        volumeOutline: runnableJob.request.volumeOutline,
        volumeGoal: runnableJob.request.volumeGoal,
        chapterBeat: runnableJob.request.chapterBeat,
        nextChapterPreview: runnableJob.request.nextChapterPreview,
        forbiddenZone: runnableJob.request.forbiddenZone,
        outline: runnableJob.outline,
        beatIndex: index,
        currentBeat: beat,
        previousText: runnableJob.generatedText,
        previousSummary: runnableJob.request.previousSummary,
        worldState: runnableJob.request.worldState,
        rewriteGuidance: runnableJob.rewriteGuidance,
        stylePrompt: runnableJob.request.stylePrompt,
        contextBundle: runnableJob.request.contextBundle,
        gateConfigOverride: getEffectiveGateConfig(env, runnableJob),
        model: runnableJob.request.model,
        temperature: runnableJob.request.temperature,
        reasoningEffort: runnableJob.request.reasoningEffort,
      });

      const afterWriteJob = await loadJobOrThrow(env, jobId);

      if (afterWriteJob.status === 'approved' || afterWriteJob.status === 'discarded') {
        return;
      }

      await updateGenerationJob(env, jobId, {
        generatedText: buildGeneratedText(afterWriteJob.generatedText, writeResponse.content),
        completedBeatCount: Math.max(afterWriteJob.completedBeatCount, index + 1),
        totalBeatCount: runnableJob.outline.beats.length,
        currentStep: 'write',
        currentBeatIndex: index,
        currentBeatLabel: beat,
        updatedAt: nowIsoString(),
      });

      if (afterWriteJob.status === 'paused') {
        return;
      }
    }

    currentJob = await loadJobOrThrow(env, jobId);

    if (!currentJob.style && currentJob.request.stylePrompt?.trim()) {
      const runnableJob = await loadRunnableJob(env, jobId);

      if (!runnableJob) {
        return;
      }
      const stylePrompt = runnableJob.request.stylePrompt?.trim();

      if (!stylePrompt) {
        return;
      }

      await updateGenerationJob(env, jobId, {
        currentStep: 'style',
        currentBeatIndex: null,
        currentBeatLabel: '',
        updatedAt: nowIsoString(),
      });

      const styleResponse = await styleChapterDraft(env, {
        projectId: runnableJob.projectId,
        chapterId: runnableJob.chapterId,
        chapterTitle: runnableJob.request.chapterTitle,
        chapterOrder: runnableJob.request.chapterOrder,
        volumeTitle: runnableJob.request.volumeTitle,
        previousChapterId: runnableJob.request.previousChapterId,
        previousChapterTitle: runnableJob.request.previousChapterTitle,
        projectTitle: runnableJob.request.projectTitle,
        projectDescription: runnableJob.request.projectDescription,
        bookOutline: runnableJob.request.bookOutline,
        volumeOutline: runnableJob.request.volumeOutline,
        outline: runnableJob.outline,
        previousSummary: runnableJob.request.previousSummary,
        worldState: runnableJob.request.worldState,
        contextBundle: runnableJob.request.contextBundle,
        gateConfigOverride: getEffectiveGateConfig(env, runnableJob),
        stylePrompt,
        content: runnableJob.generatedText,
        model: runnableJob.request.model,
        temperature: runnableJob.request.temperature,
        reasoningEffort: runnableJob.request.reasoningEffort,
      });

      const afterStyleJob = await loadJobOrThrow(env, jobId);

      if (afterStyleJob.status === 'approved' || afterStyleJob.status === 'discarded') {
        return;
      }

      await updateGenerationJob(env, jobId, {
        generatedText: styleResponse.content,
        style: styleResponse.style,
        review: null,
        languageQa: null,
        polish: null,
        summary: null,
        stateChanges: [],
        strand: null,
        currentStep: 'review',
        currentBeatIndex: null,
        currentBeatLabel: '',
        updatedAt: nowIsoString(),
      });
    }

    currentJob = await loadJobOrThrow(env, jobId);

    if (!currentJob.review) {
      const runnableJob = await loadRunnableJob(env, jobId);

      if (!runnableJob) {
        return;
      }

      await updateGenerationJob(env, jobId, {
        currentStep: 'review',
        currentBeatIndex: null,
        currentBeatLabel: '',
        updatedAt: nowIsoString(),
      });

      const reviewResponse = await reviewChapterDraft(env, {
        projectId: runnableJob.projectId,
        chapterId: runnableJob.chapterId,
        chapterTitle: runnableJob.request.chapterTitle,
        chapterOrder: runnableJob.request.chapterOrder,
        volumeTitle: runnableJob.request.volumeTitle,
        previousChapterId: runnableJob.request.previousChapterId,
        previousChapterTitle: runnableJob.request.previousChapterTitle,
        projectTitle: runnableJob.request.projectTitle,
        projectDescription: runnableJob.request.projectDescription,
        bookOutline: runnableJob.request.bookOutline,
        volumeOutline: runnableJob.request.volumeOutline,
        chapterBeat: runnableJob.request.chapterBeat,
        outline: runnableJob.outline,
        previousSummary: runnableJob.request.previousSummary,
        worldState: runnableJob.request.worldState,
        contextBundle: runnableJob.request.contextBundle,
        gateConfigOverride: getEffectiveGateConfig(env, runnableJob),
        content: runnableJob.generatedText,
        model: runnableJob.request.model,
        temperature: runnableJob.request.temperature,
        reasoningEffort: runnableJob.request.reasoningEffort,
      });
      const languageQaResponse = await checkChapterLanguageQa(env, {
        projectId: runnableJob.projectId,
        chapterId: runnableJob.chapterId,
        chapterTitle: runnableJob.request.chapterTitle,
        chapterOrder: runnableJob.request.chapterOrder,
        volumeTitle: runnableJob.request.volumeTitle,
        previousChapterId: runnableJob.request.previousChapterId,
        previousChapterTitle: runnableJob.request.previousChapterTitle,
        projectTitle: runnableJob.request.projectTitle,
        projectDescription: runnableJob.request.projectDescription,
        bookOutline: runnableJob.request.bookOutline,
        volumeOutline: runnableJob.request.volumeOutline,
        chapterBeat: runnableJob.request.chapterBeat,
        outline: runnableJob.outline,
        previousSummary: runnableJob.request.previousSummary,
        worldState: runnableJob.request.worldState,
        contextBundle: runnableJob.request.contextBundle,
        gateConfigOverride: getEffectiveGateConfig(env, runnableJob),
        content: runnableJob.generatedText,
        model: runnableJob.request.model,
        temperature: runnableJob.request.temperature,
        reasoningEffort: runnableJob.request.reasoningEffort,
      });

      const afterReviewJob = await loadJobOrThrow(env, jobId);

      if (afterReviewJob.status === 'approved' || afterReviewJob.status === 'discarded') {
        return;
      }

      upsertGenerationReviewMetrics(env, {
        projectId: runnableJob.projectId,
        chapterId: runnableJob.chapterId,
        chapterTitle: runnableJob.request.chapterTitle,
        review: reviewResponse.review,
      });
      upsertGenerationLanguageQaMetrics(env, {
        projectId: runnableJob.projectId,
        chapterId: runnableJob.chapterId,
        chapterTitle: runnableJob.request.chapterTitle,
        languageQa: languageQaResponse.languageQa,
      });

      const effectiveGateConfig = getEffectiveGateConfig(env, afterReviewJob);

      if (shouldRewriteForReviewWithConfig(reviewResponse.review, effectiveGateConfig)) {
        const gateReason = buildReviewGateReason(reviewResponse.review, effectiveGateConfig);
        const rewriteGuidance = buildRewriteGuidance(
          reviewResponse.review,
          effectiveGateConfig,
          languageQaResponse.languageQa,
        );
        const nextRewriteCount = afterReviewJob.reviewRewriteCount + 1;

        if (nextRewriteCount > effectiveGateConfig.reviewMaxRewriteCount) {
          await updateGenerationJob(env, jobId, {
            status: 'error',
            review: reviewResponse.review,
            languageQa: languageQaResponse.languageQa,
            reviewRewriteCount: afterReviewJob.reviewRewriteCount,
            reviewGateReason: `自动重写 ${effectiveGateConfig.reviewMaxRewriteCount} 次后仍未通过：${gateReason}`,
            rewriteGuidance,
            currentStep: 'complete',
            currentBeatIndex: null,
            currentBeatLabel: '',
            errorMessage: `审查未通过，已达到自动重写上限：${gateReason}`,
            updatedAt: nowIsoString(),
          });
          return;
        }

        await updateGenerationJob(env, jobId, {
          generatedText: '',
          review: null,
          languageQa: null,
          polish: null,
          summary: null,
          stateChanges: [],
          strand: null,
          completedBeatCount: 0,
          totalBeatCount: runnableJob.outline?.beats.length ?? afterReviewJob.totalBeatCount,
          currentStep: 'write',
          currentBeatIndex: null,
          currentBeatLabel: '',
          reviewRewriteCount: nextRewriteCount,
          reviewGateReason: gateReason,
          rewriteGuidance,
          errorMessage: '',
          updatedAt: nowIsoString(),
        });
        continue;
      }

      await updateGenerationJob(env, jobId, {
        review: reviewResponse.review,
        languageQa: languageQaResponse.languageQa,
        reviewGateReason: '',
        rewriteGuidance: '',
        polish: null,
        currentStep: 'polish',
        currentBeatIndex: null,
        currentBeatLabel: '',
        updatedAt: nowIsoString(),
      });
    }

    currentJob = await loadJobOrThrow(env, jobId);

    if (!currentJob.polish) {
      const runnableJob = await loadRunnableJob(env, jobId);

      if (!runnableJob) {
        return;
      }

      await updateGenerationJob(env, jobId, {
        currentStep: 'polish',
        currentBeatIndex: null,
        currentBeatLabel: '',
        updatedAt: nowIsoString(),
      });

      const polishResponse = await polishChapterDraft(env, {
        projectId: runnableJob.projectId,
        chapterId: runnableJob.chapterId,
        chapterTitle: runnableJob.request.chapterTitle,
        chapterOrder: runnableJob.request.chapterOrder,
        volumeTitle: runnableJob.request.volumeTitle,
        previousChapterId: runnableJob.request.previousChapterId,
        previousChapterTitle: runnableJob.request.previousChapterTitle,
        projectTitle: runnableJob.request.projectTitle,
        projectDescription: runnableJob.request.projectDescription,
        bookOutline: runnableJob.request.bookOutline,
        volumeOutline: runnableJob.request.volumeOutline,
        outline: runnableJob.outline,
        previousSummary: runnableJob.request.previousSummary,
        worldState: runnableJob.request.worldState,
        contextBundle: runnableJob.request.contextBundle,
        gateConfigOverride: getEffectiveGateConfig(env, runnableJob),
        review: runnableJob.review,
        languageQa: runnableJob.languageQa,
        content: runnableJob.generatedText,
        model: runnableJob.request.model,
        temperature: runnableJob.request.temperature,
        reasoningEffort: runnableJob.request.reasoningEffort,
      });

      const afterPolishJob = await loadJobOrThrow(env, jobId);

      if (afterPolishJob.status === 'approved' || afterPolishJob.status === 'discarded') {
        return;
      }

      if (getEffectiveGateConfig(env, afterPolishJob).polishFailBlockReady && polishResponse.polish.antiAiForceCheck === 'fail') {
        await updateGenerationJob(env, jobId, {
          status: 'error',
          generatedText: polishResponse.content,
          polish: polishResponse.polish,
          currentStep: 'complete',
          currentBeatIndex: null,
          currentBeatLabel: '',
          errorMessage: `润色终检未通过：${polishResponse.polish.summary}`,
          updatedAt: nowIsoString(),
        });
        return;
      }

      await updateGenerationJob(env, jobId, {
        generatedText: polishResponse.content,
        polish: polishResponse.polish,
        currentStep: 'extract',
        currentBeatIndex: null,
        currentBeatLabel: '',
        updatedAt: nowIsoString(),
      });
    }

    break;
  }

  currentJob = await loadJobOrThrow(env, jobId);

  if (!currentJob.summary || currentJob.strand === null) {
    const runnableJob = await loadRunnableJob(env, jobId);

    if (!runnableJob) {
      return;
    }

    await updateGenerationJob(env, jobId, {
      currentStep: 'extract',
      currentBeatIndex: null,
      currentBeatLabel: '',
      updatedAt: nowIsoString(),
    });

    const extractResponse = await extractChapterArtifacts(env, {
      projectId: runnableJob.projectId,
      chapterId: runnableJob.chapterId,
      chapterTitle: runnableJob.request.chapterTitle,
      chapterOrder: runnableJob.request.chapterOrder,
      chapterBeat: runnableJob.request.chapterBeat,
      content: runnableJob.generatedText,
      loreSummary: runnableJob.request.worldState,
      model: runnableJob.request.model,
      temperature: runnableJob.request.temperature,
      reasoningEffort: runnableJob.request.reasoningEffort,
    });

    const afterExtractJob = await loadJobOrThrow(env, jobId);

    if (afterExtractJob.status === 'approved' || afterExtractJob.status === 'discarded') {
      return;
    }

    upsertGenerationChapterSummary(env, {
      projectId: runnableJob.projectId,
      chapterId: runnableJob.chapterId,
      chapterTitle: runnableJob.request.chapterTitle,
      summary: extractResponse.summary,
    });
    replaceGenerationStateChanges(env, {
      projectId: runnableJob.projectId,
      chapterId: runnableJob.chapterId,
      chapterTitle: runnableJob.request.chapterTitle,
      stateChanges: extractResponse.stateChanges,
    });
    upsertGenerationEntitiesFromStateChanges(env, {
      projectId: runnableJob.projectId,
      chapterId: runnableJob.chapterId,
      chapterTitle: runnableJob.request.chapterTitle,
      stateChanges: extractResponse.stateChanges,
    });
    replaceGenerationRelationshipsFromStateChanges(env, {
      projectId: runnableJob.projectId,
      chapterId: runnableJob.chapterId,
      chapterTitle: runnableJob.request.chapterTitle,
      stateChanges: extractResponse.stateChanges,
      content: runnableJob.generatedText,
      summary: extractResponse.summary.summary,
    });
    upsertGenerationChapterIndex(env, {
      projectId: runnableJob.projectId,
      chapterId: runnableJob.chapterId,
      chapterTitle: runnableJob.request.chapterTitle,
      chapterOrder: runnableJob.request.chapterOrder,
      volumeTitle: runnableJob.request.volumeTitle,
      previousChapterId: runnableJob.request.previousChapterId,
      previousChapterTitle: runnableJob.request.previousChapterTitle,
      outline: runnableJob.outline,
      summary: extractResponse.summary,
      strand: extractResponse.strand,
      stateChanges: extractResponse.stateChanges,
    });
    rebuildGenerationVolumeRecap(env, {
      projectId: runnableJob.projectId,
      volumeTitle: runnableJob.request.volumeTitle,
    });
    replaceGenerationMemoryChunks(env, {
      projectId: runnableJob.projectId,
      chapterId: runnableJob.chapterId,
      chapterTitle: runnableJob.request.chapterTitle,
      chapterOrder: runnableJob.request.chapterOrder,
      volumeTitle: runnableJob.request.volumeTitle,
      outline: runnableJob.outline,
      summary: extractResponse.summary,
      stateChanges: extractResponse.stateChanges,
      content: runnableJob.generatedText,
    });

    await updateGenerationJob(env, jobId, {
      summary: extractResponse.summary,
      stateChanges: extractResponse.stateChanges,
      strand: extractResponse.strand,
      currentStep: 'complete',
      currentBeatIndex: null,
      currentBeatLabel: '',
      updatedAt: nowIsoString(),
    });
  }

  const beforeFinalizeJob = await loadRunnableJob(env, jobId);

  if (!beforeFinalizeJob) {
    return;
  }

  if (beforeFinalizeJob.summary && beforeFinalizeJob.strand !== null) {
    await updateGenerationJob(env, jobId, {
      status: 'ready',
      currentStep: 'complete',
      currentBeatIndex: null,
      currentBeatLabel: '',
      pausedAt: null,
      errorMessage: '',
      updatedAt: nowIsoString(),
    });
  }
}

let runnerBusy = false;

export async function processNextGenerationJob(env: ServerEnv) {
  if (runnerBusy) {
    return;
  }

  runnerBusy = true;
  let activeJobId: string | null = null;

  try {
    const job = await findNextQueuedJob(env);

    if (!job) {
      return;
    }

    activeJobId = job.id;

    await updateGenerationJob(env, job.id, {
      status: 'running',
      pausedAt: null,
      errorMessage: '',
      attemptCount: job.attemptCount + 1,
      updatedAt: nowIsoString(),
    });

    await executeGenerationJob(env, job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';

    if (activeJobId) {
      const latestJob = await findGenerationJob(env, activeJobId);

      if (latestJob && !isStoppedStatus(latestJob.status)) {
        await updateGenerationJob(env, activeJobId, {
          status: 'error',
          errorMessage: message,
          updatedAt: nowIsoString(),
        });
      }
    }
  } finally {
    runnerBusy = false;
  }
}

export function startGenerationJobWorker(env: ServerEnv) {
  void recoverInterruptedGenerationJobs(env).finally(() => {
    void processNextGenerationJob(env);
  });

  const timer = setInterval(() => {
    void processNextGenerationJob(env);
  }, 2000);

  return () => {
    clearInterval(timer);
  };
}

export async function getGenerationJob(env: ServerEnv, jobId: string) {
  return findGenerationJob(env, jobId);
}
