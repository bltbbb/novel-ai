import type { ServerEnv } from '../config/env.js';
import type {
  GenerationArtifactSyncRequest,
  GenerationArtifactSyncResponse,
} from '../types/ai.js';
import {
  replaceGenerationStateChanges,
  upsertGenerationChapterSummary,
  upsertGenerationLanguageQaMetrics,
  upsertGenerationReviewMetrics,
} from './generation-artifact-store.js';
import {
  upsertGenerationChapterIndex,
  upsertGenerationEntitiesFromStateChanges,
  replaceGenerationRelationshipsFromStateChanges,
} from './generation-knowledge-store.js';
import { replaceGenerationMemoryChunks } from './generation-memory-store.js';
import { rebuildGenerationVolumeRecap } from './generation-volume-recap-store.js';

export async function syncGenerationArtifacts(
  env: ServerEnv,
  request: GenerationArtifactSyncRequest,
): Promise<GenerationArtifactSyncResponse> {
  upsertGenerationChapterSummary(env, {
    projectId: request.projectId,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    summary: request.summary,
  });
  replaceGenerationStateChanges(env, {
    projectId: request.projectId,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    stateChanges: request.stateChanges,
  });
  upsertGenerationEntitiesFromStateChanges(env, {
    projectId: request.projectId,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    stateChanges: request.stateChanges,
  });
  replaceGenerationRelationshipsFromStateChanges(env, {
    projectId: request.projectId,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    stateChanges: request.stateChanges,
    content: request.content,
    summary: request.summary.summary,
  });
  upsertGenerationChapterIndex(env, {
    projectId: request.projectId,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    chapterOrder: request.chapterOrder,
    volumeTitle: request.volumeTitle,
    previousChapterId: request.previousChapterId,
    previousChapterTitle: request.previousChapterTitle,
    outline: request.outline ?? null,
    summary: request.summary,
    strand: request.strand,
    stateChanges: request.stateChanges,
  });
  replaceGenerationMemoryChunks(env, {
    projectId: request.projectId,
    chapterId: request.chapterId,
    chapterTitle: request.chapterTitle,
    chapterOrder: request.chapterOrder,
    volumeTitle: request.volumeTitle,
    outline: request.outline ?? null,
    summary: request.summary,
    stateChanges: request.stateChanges,
    content: request.content,
  });

  if (request.review) {
    upsertGenerationReviewMetrics(env, {
      projectId: request.projectId,
      chapterId: request.chapterId,
      chapterTitle: request.chapterTitle,
      review: request.review,
    });
  }

  if (request.languageQa) {
    upsertGenerationLanguageQaMetrics(env, {
      projectId: request.projectId,
      chapterId: request.chapterId,
      chapterTitle: request.chapterTitle,
      languageQa: request.languageQa,
    });
  }

  rebuildGenerationVolumeRecap(env, {
    projectId: request.projectId,
    volumeTitle: request.volumeTitle,
  });

  return { ok: true };
}
