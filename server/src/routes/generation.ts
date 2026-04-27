import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import {
  extractChapterArtifacts,
  checkChapterLanguageQa,
  editorRefineChapterDraft,
  generateInspirationBlueprint,
  generateBookOutline,
  generateBeatDraft,
  generateChapterOutline,
  generateVolumeBeats,
  generateVolumeMilestones,
  generateVolumeOutline,
  polishChapterDraft,
  reconcileVolumePlan,
  reviewChapterDraft,
  styleChapterDraft,
} from '../services/generation.js';
import {
  generateBookOutlineSummary,
  generateVolumeOutlineSummary,
} from '../services/outline-summary.js';
import { analyzeBookTemplate } from '../services/template-analysis.js';
import { extractEpubText } from '../services/epub-extract.js';
import {
  enqueueBookAnalysisJob,
  getRunningBookAnalysisJob,
  listRunningBookAnalysisJobs,
  requestCancelBookAnalysisJob,
  retryBookAnalysisJob,
} from '../services/book-analysis-job-runner.js';
import { syncGenerationArtifacts } from '../services/generation-artifact-sync.js';
import type {
  AIBookAnalysisRequest,
  AIEpubExtractRequest,
  AIInspirationBlueprintRequest,
  AIBookOutlineRequest,
  AIBookOutlineSummaryRequest,
  AIEditorRefineRequest,
  AIExtractRequest,
  AILanguageQaRequest,
  AIPolishRequest,
  AIPlanRequest,
  AIReviewRequest,
  AIStyleRequest,
  AIVolumeBeatsRequest,
  AIVolumeMilestonesRequest,
  AIVolumeOutlineRequest,
  AIVolumeOutlineSummaryRequest,
  AIVolumePlanReconcileRequest,
  AIWriteRequest,
  GenerationArtifactSyncRequest,
} from '../types/ai.js';

function isAIPlanRequest(body: unknown): body is AIPlanRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIPlanRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIBookOutlineRequest(body: unknown): body is AIBookOutlineRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIBookOutlineRequest>;

  return (
    typeof candidate.projectTitle === 'string' &&
    typeof candidate.projectDescription === 'string' &&
    Array.isArray(candidate.genre) &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIBookOutlineSummaryRequest(body: unknown): body is AIBookOutlineSummaryRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIBookOutlineSummaryRequest>;

  return (
    typeof candidate.projectTitle === 'string' &&
    Array.isArray(candidate.genre) &&
    candidate.outline !== null &&
    typeof candidate.outline === 'object' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIInspirationBlueprintRequest(body: unknown): body is AIInspirationBlueprintRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIInspirationBlueprintRequest>;

  return (
    typeof candidate.transcript === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIBookAnalysisRequest(body: unknown): body is AIBookAnalysisRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIBookAnalysisRequest>;

  return (
    typeof candidate.sourceTitle === 'string' &&
    typeof candidate.content === 'string' &&
    (
      typeof candidate.analysisRange === 'undefined' ||
      candidate.analysisRange === 'full' ||
      candidate.analysisRange === 'opening' ||
      candidate.analysisRange === 'middle' ||
      candidate.analysisRange === 'ending' ||
      candidate.analysisRange === 'custom'
    ) &&
    (typeof candidate.rangeStartIndex === 'undefined' || typeof candidate.rangeStartIndex === 'number') &&
    (typeof candidate.rangeEndIndex === 'undefined' || typeof candidate.rangeEndIndex === 'number') &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIEpubExtractRequest(body: unknown): body is AIEpubExtractRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIEpubExtractRequest>;

  return (
    typeof candidate.fileName === 'string' &&
    typeof candidate.contentBase64 === 'string'
  );
}

function isAIVolumeOutlineRequest(body: unknown): body is AIVolumeOutlineRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIVolumeOutlineRequest>;

  return (
    typeof candidate.projectTitle === 'string' &&
    typeof candidate.projectDescription === 'string' &&
    typeof candidate.bookOutline === 'string' &&
    typeof candidate.volumeTitle === 'string' &&
    typeof candidate.volumeOrder === 'number' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIVolumeOutlineSummaryRequest(body: unknown): body is AIVolumeOutlineSummaryRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIVolumeOutlineSummaryRequest>;

  return (
    typeof candidate.projectTitle === 'string' &&
    typeof candidate.volumeTitle === 'string' &&
    typeof candidate.volumeOrder === 'number' &&
    candidate.outline !== null &&
    typeof candidate.outline === 'object' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIVolumeMilestonesRequest(body: unknown): body is AIVolumeMilestonesRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIVolumeMilestonesRequest>;

  return (
    typeof candidate.projectTitle === 'string' &&
    typeof candidate.projectDescription === 'string' &&
    typeof candidate.bookOutline === 'string' &&
    typeof candidate.volumeTitle === 'string' &&
    typeof candidate.volumeOrder === 'number' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIVolumePlanReconcileRequest(body: unknown): body is AIVolumePlanReconcileRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIVolumePlanReconcileRequest>;

  return (
    typeof candidate.projectTitle === 'string' &&
    typeof candidate.projectDescription === 'string' &&
    typeof candidate.volumeTitle === 'string' &&
    typeof candidate.volumeOrder === 'number' &&
    typeof candidate.bookOutline === 'string' &&
    typeof candidate.currentVolumeOutline === 'string' &&
    typeof candidate.currentMilestones === 'string' &&
    typeof candidate.chapterSummaries === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIVolumeBeatsRequest(body: unknown): body is AIVolumeBeatsRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIVolumeBeatsRequest>;
  const hasValidChapterSlots =
    Array.isArray(candidate.chapterSlots) &&
    candidate.chapterSlots.every(
      (slot) =>
        slot &&
        typeof slot === 'object' &&
        typeof slot.chapterNumber === 'number' &&
        (typeof slot.chapterId === 'undefined' || typeof slot.chapterId === 'string') &&
        (typeof slot.chapterTitle === 'undefined' || typeof slot.chapterTitle === 'string'),
    );
  const hasValidChapterCount =
    typeof candidate.chapterCount === 'number' &&
    Number.isFinite(candidate.chapterCount) &&
    candidate.chapterCount > 0;
  const hasValidHistorySummaries =
    typeof candidate.historySummaries === 'undefined' ||
    (Array.isArray(candidate.historySummaries) &&
      candidate.historySummaries.every(
        (item) =>
          item &&
          typeof item === 'object' &&
          typeof item.chapterNumber === 'number' &&
          typeof item.chapterTitle === 'string' &&
          typeof item.summary === 'string' &&
          (item.source === 'extract' || item.source === 'beat'),
      ));

  return (
    typeof candidate.projectTitle === 'string' &&
    typeof candidate.projectDescription === 'string' &&
    typeof candidate.bookOutline === 'string' &&
    typeof candidate.volumeOutline === 'string' &&
    typeof candidate.volumeTitle === 'string' &&
    typeof candidate.volumeOrder === 'number' &&
    (hasValidChapterSlots || hasValidChapterCount) &&
    (typeof candidate.milestoneIndex === 'undefined' ||
      (typeof candidate.milestoneIndex === 'number' &&
        Number.isFinite(candidate.milestoneIndex) &&
        candidate.milestoneIndex >= 0)) &&
    (typeof candidate.startChapterNumber === 'undefined' ||
      (typeof candidate.startChapterNumber === 'number' &&
        Number.isFinite(candidate.startChapterNumber) &&
        candidate.startChapterNumber > 0)) &&
    (typeof candidate.endChapterNumber === 'undefined' ||
      (typeof candidate.endChapterNumber === 'number' &&
        Number.isFinite(candidate.endChapterNumber) &&
        candidate.endChapterNumber > 0)) &&
    (typeof candidate.estimatedTotalChapters === 'undefined' ||
      (typeof candidate.estimatedTotalChapters === 'number' &&
        Number.isFinite(candidate.estimatedTotalChapters) &&
        candidate.estimatedTotalChapters > 0)) &&
    (typeof candidate.currentMilestone === 'undefined' || typeof candidate.currentMilestone === 'string') &&
    hasValidHistorySummaries &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIExtractRequest(body: unknown): body is AIExtractRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIExtractRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIEditorRefineRequest(body: unknown): body is AIEditorRefineRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIEditorRefineRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIWriteRequest(body: unknown): body is AIWriteRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIWriteRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number' &&
    typeof candidate.beatIndex === 'number' &&
    typeof candidate.currentBeat === 'string' &&
    candidate.outline !== undefined &&
    typeof candidate.outline === 'object'
  );
}

function isAIReviewRequest(body: unknown): body is AIReviewRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIReviewRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAILanguageQaRequest(body: unknown): body is AILanguageQaRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AILanguageQaRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIPolishRequest(body: unknown): body is AIPolishRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIPolishRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isAIStyleRequest(body: unknown): body is AIStyleRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<AIStyleRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.stylePrompt === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.temperature === 'number'
  );
}

function isGenerationArtifactSyncRequest(body: unknown): body is GenerationArtifactSyncRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<GenerationArtifactSyncRequest>;

  return (
    typeof candidate.projectId === 'string' &&
    typeof candidate.chapterId === 'string' &&
    typeof candidate.chapterTitle === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.summary === 'object' &&
    candidate.summary !== null &&
    typeof candidate.summary.summary === 'string' &&
    typeof candidate.summary.hook === 'string' &&
    Array.isArray(candidate.summary.foreshadowings) &&
    Array.isArray(candidate.stateChanges) &&
    (candidate.strand === 'quest' || candidate.strand === 'fire' || candidate.strand === 'constellation')
  );
}

export async function registerGenerationRoutes(app: FastifyInstance, env: ServerEnv) {
  app.post('/api/ai/book-analysis-extract-epub', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIEpubExtractRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIEpubExtractRequest 结构',
      });
    }

    try {
      return extractEpubText(request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.get('/api/ai/book-analysis-jobs', async () => {
    return listRunningBookAnalysisJobs(env);
  });

  app.get(
    '/api/ai/book-analysis-jobs/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const job = await getRunningBookAnalysisJob(env, request.params.id);

      if (!job) {
        return reply.status(404).send({
          message: '目标拆书任务不存在',
        });
      }

      return job;
    },
  );

  app.post('/api/ai/book-analysis-jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIBookAnalysisRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIBookAnalysisRequest 结构',
      });
    }

    try {
      return await enqueueBookAnalysisJob(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post(
    '/api/ai/book-analysis-jobs/:id/cancel',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const job = await requestCancelBookAnalysisJob(env, request.params.id);

      if (!job) {
        return reply.status(404).send({
          message: '目标拆书任务不存在',
        });
      }

      return job;
    },
  );

  app.post(
    '/api/ai/book-analysis-jobs/:id/retry',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const job = await retryBookAnalysisJob(env, request.params.id);

      if (!job) {
        return reply.status(404).send({
          message: '目标拆书任务不存在',
        });
      }

      return job;
    },
  );

  app.post('/api/ai/book-analysis-template', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIBookAnalysisRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIBookAnalysisRequest 结构',
      });
    }

    try {
      return await analyzeBookTemplate(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/inspiration-blueprint', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIInspirationBlueprintRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIInspirationBlueprintRequest 结构',
      });
    }

    try {
      return await generateInspirationBlueprint(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/book-outline', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIBookOutlineRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIBookOutlineRequest 结构',
      });
    }

    try {
      return await generateBookOutline(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/book-outline-summary', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIBookOutlineSummaryRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIBookOutlineSummaryRequest 结构',
      });
    }

    try {
      return await generateBookOutlineSummary(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/volume-outline', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIVolumeOutlineRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIVolumeOutlineRequest 结构',
      });
    }

    try {
      return await generateVolumeOutline(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/volume-outline-summary', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIVolumeOutlineSummaryRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIVolumeOutlineSummaryRequest 结构',
      });
    }

    try {
      return await generateVolumeOutlineSummary(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/volume-milestones', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIVolumeMilestonesRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIVolumeMilestonesRequest 结构',
      });
    }

    try {
      return await generateVolumeMilestones(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/volume-plan-reconcile', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIVolumePlanReconcileRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIVolumePlanReconcileRequest 结构',
      });
    }

    try {
      return await reconcileVolumePlan(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/volume-beats', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIVolumeBeatsRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIVolumeBeatsRequest 结构',
      });
    }

    try {
      return await generateVolumeBeats(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/plan', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIPlanRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIPlanRequest 结构',
      });
    }

    try {
      return await generateChapterOutline(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/extract', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIExtractRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIExtractRequest 结构',
      });
    }

    try {
      return await extractChapterArtifacts(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/editor-refine', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIEditorRefineRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIEditorRefineRequest 结构',
      });
    }

    try {
      return await editorRefineChapterDraft(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/generation/artifacts/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGenerationArtifactSyncRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 GenerationArtifactSyncRequest 结构',
      });
    }

    try {
      return await syncGenerationArtifacts(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/write', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIWriteRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIWriteRequest 结构',
      });
    }

    try {
      return await generateBeatDraft(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/review', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIReviewRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIReviewRequest 结构',
      });
    }

    try {
      return await reviewChapterDraft(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/language-qa', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAILanguageQaRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AILanguageQaRequest 结构',
      });
    }

    try {
      return await checkChapterLanguageQa(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/style', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIStyleRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIStyleRequest 结构',
      });
    }

    try {
      return await styleChapterDraft(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });

  app.post('/api/ai/polish', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAIPolishRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 AIPolishRequest 结构',
      });
    }

    try {
      return await polishChapterDraft(env, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return reply.status(500).send({
        message,
      });
    }
  });
}
