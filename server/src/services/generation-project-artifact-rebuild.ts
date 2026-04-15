import type { ServerEnv } from '../config/env.js';
import type {
  GenerationProjectArtifactRebuildChapterInput,
  GenerationProjectArtifactRebuildRequest,
  GenerationProjectArtifactRebuildResponse,
} from '../types/ai.js';
import {
  replaceGenerationStateChanges,
  upsertGenerationChapterSummary,
  upsertGenerationLanguageQaMetrics,
  upsertGenerationReviewMetrics,
} from './generation-artifact-store.js';
import { backfillGenerationMemoryEmbeddings } from './generation-backfill.js';
import { replaceGenerationForeshadows } from './generation-foreshadow-store.js';
import {
  replaceGenerationEntitiesSnapshot,
  replaceGenerationRelationshipsSnapshot,
  replaceGenerationRelationshipsFromStateChanges,
  upsertGenerationChapterIndex,
  upsertGenerationEntitiesFromStateChanges,
} from './generation-knowledge-store.js';
import { replaceGenerationMemoryChunks } from './generation-memory-store.js';
import { getGenerationDatabase } from './generation-sqlite.js';
import { clearGenerationSqliteVecProjectIndex } from './generation-sqlite-vec-store.js';
import { rebuildGenerationVolumeRecap } from './generation-volume-recap-store.js';

const PROJECT_ARTIFACT_TABLES = [
  'generation_jobs',
  'generation_chapter_summaries',
  'generation_state_changes',
  'generation_review_metrics',
  'generation_language_qa_metrics',
  'generation_relationships',
  'generation_chapter_index',
  'generation_memory_chunks',
  'generation_volume_recaps',
  'generation_entities',
  'generation_foreshadows',
  'generation_memory_embeddings',
  'generation_memory_embedding_vec_index',
] as const;

function tableExists(env: ServerEnv, tableName: string) {
  const db = getGenerationDatabase(env);
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(tableName) as { name?: string } | undefined;

  return Boolean(row?.name);
}

function clearProjectArtifactTables(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);

  db.exec('BEGIN');

  try {
    for (const tableName of PROJECT_ARTIFACT_TABLES) {
      if (!tableExists(env, tableName)) {
        continue;
      }

      db.prepare(`DELETE FROM ${tableName} WHERE project_id = ?`).run(projectId);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function sortRebuildChapters(chapters: GenerationProjectArtifactRebuildChapterInput[]) {
  return [...chapters].sort((left, right) => {
    if (left.chapterOrder === right.chapterOrder) {
      return left.chapterId.localeCompare(right.chapterId);
    }

    return left.chapterOrder - right.chapterOrder;
  });
}

function normalizeVolumeTitles(chapters: GenerationProjectArtifactRebuildChapterInput[]) {
  return Array.from(
    new Set(
      chapters
        .map((chapter) => chapter.volumeTitle?.trim() ?? '')
        .filter(Boolean),
    ),
  );
}

function replayChapterArtifacts(env: ServerEnv, projectId: string, chapter: GenerationProjectArtifactRebuildChapterInput) {
  const stateChanges = Array.isArray(chapter.stateChanges) ? chapter.stateChanges : [];

  if (chapter.review) {
    upsertGenerationReviewMetrics(env, {
      projectId,
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle,
      review: chapter.review,
    });
  }

  if (chapter.languageQa) {
    upsertGenerationLanguageQaMetrics(env, {
      projectId,
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle,
      languageQa: chapter.languageQa,
    });
  }

  if (!chapter.summary || !chapter.strand) {
    return;
  }

  upsertGenerationChapterSummary(env, {
    projectId,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    summary: chapter.summary,
  });
  replaceGenerationStateChanges(env, {
    projectId,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    stateChanges,
  });

  if (stateChanges.length > 0) {
    upsertGenerationEntitiesFromStateChanges(env, {
      projectId,
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle,
      stateChanges,
    });
  }

  replaceGenerationRelationshipsFromStateChanges(env, {
    projectId,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    stateChanges,
    content: chapter.content,
    summary: chapter.summary.summary,
  });
  upsertGenerationChapterIndex(env, {
    projectId,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    chapterOrder: chapter.chapterOrder,
    volumeTitle: chapter.volumeTitle,
    previousChapterId: chapter.previousChapterId,
    previousChapterTitle: chapter.previousChapterTitle,
    outline: chapter.outline ?? null,
    summary: chapter.summary,
    strand: chapter.strand,
    stateChanges,
  });
  replaceGenerationMemoryChunks(env, {
    projectId,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    chapterOrder: chapter.chapterOrder,
    volumeTitle: chapter.volumeTitle,
    outline: chapter.outline ?? null,
    summary: chapter.summary,
    stateChanges,
    content: chapter.content,
  });
}

export async function rebuildGenerationProjectArtifacts(
  env: ServerEnv,
  request: GenerationProjectArtifactRebuildRequest,
): Promise<GenerationProjectArtifactRebuildResponse> {
  await clearGenerationSqliteVecProjectIndex(env, request.projectId);
  clearProjectArtifactTables(env, request.projectId);

  replaceGenerationEntitiesSnapshot(env, {
    projectId: request.projectId,
    entities: request.entitySnapshot,
  });
  replaceGenerationForeshadows(env, {
    projectId: request.projectId,
    foreshadows: request.foreshadowSnapshot,
  });
  replaceGenerationRelationshipsSnapshot(env, {
    projectId: request.projectId,
    relationships: request.relationSnapshot,
  });

  const chapters = sortRebuildChapters(request.chapters);

  for (const chapter of chapters) {
    replayChapterArtifacts(env, request.projectId, chapter);
  }

  const rebuiltVolumeCount = normalizeVolumeTitles(chapters).reduce((count, volumeTitle) => {
    const recap = rebuildGenerationVolumeRecap(env, {
      projectId: request.projectId,
      volumeTitle,
    });

    return recap ? count + 1 : count;
  }, 0);

  await backfillGenerationMemoryEmbeddings(env, {
    projectId: request.projectId,
  });

  return {
    ok: true,
    rebuiltChapterCount: chapters.length,
    rebuiltVolumeCount,
  };
}
