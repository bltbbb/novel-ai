import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import type {
  ChapterLanguageQaDraft,
  ChapterReviewDraft,
  ChapterSummaryDraft,
  StateChangeDraft,
} from '../types/ai.js';
import { getGenerationDatabase } from './generation-sqlite.js';

function nowIsoString() {
  return new Date().toISOString();
}

export function upsertGenerationChapterSummary(
  env: ServerEnv,
  input: {
    projectId: string;
    chapterId: string;
    chapterTitle: string;
    summary: ChapterSummaryDraft;
  },
) {
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();

  db.prepare(`
    INSERT INTO generation_chapter_summaries (
      project_id,
      chapter_id,
      chapter_title,
      summary,
      hook,
      foreshadowings_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, chapter_id) DO UPDATE SET
      chapter_title = excluded.chapter_title,
      summary = excluded.summary,
      hook = excluded.hook,
      foreshadowings_json = excluded.foreshadowings_json,
      updated_at = excluded.updated_at
  `).run(
    input.projectId,
    input.chapterId,
    input.chapterTitle,
    input.summary.summary,
    input.summary.hook,
    JSON.stringify(input.summary.foreshadowings),
    currentTime,
    currentTime,
  );
}

export function replaceGenerationStateChanges(
  env: ServerEnv,
  input: {
    projectId: string;
    chapterId: string;
    chapterTitle: string;
    stateChanges: StateChangeDraft[];
  },
) {
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();
  const insertStatement = db.prepare(`
    INSERT INTO generation_state_changes (
      id,
      project_id,
      chapter_id,
      chapter_title,
      entity_name,
      field,
      old_value,
      new_value,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');

  try {
    db.prepare('DELETE FROM generation_state_changes WHERE project_id = ? AND chapter_id = ?').run(
      input.projectId,
      input.chapterId,
    );

    for (const change of input.stateChanges) {
      insertStatement.run(
        randomUUID(),
        input.projectId,
        input.chapterId,
        input.chapterTitle,
        change.entityName,
        change.field,
        change.oldValue,
        change.newValue,
        currentTime,
        currentTime,
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function upsertGenerationReviewMetrics(
  env: ServerEnv,
  input: {
    projectId: string;
    chapterId: string;
    chapterTitle: string;
    review: ChapterReviewDraft;
  },
) {
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();

  db.prepare(`
    INSERT INTO generation_review_metrics (
      project_id,
      chapter_id,
      chapter_title,
      summary,
      overall_severity,
      needs_rewrite,
      anti_ai_force_check,
      checker_results_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, chapter_id) DO UPDATE SET
      chapter_title = excluded.chapter_title,
      summary = excluded.summary,
      overall_severity = excluded.overall_severity,
      needs_rewrite = excluded.needs_rewrite,
      anti_ai_force_check = excluded.anti_ai_force_check,
      checker_results_json = excluded.checker_results_json,
      updated_at = excluded.updated_at
  `).run(
    input.projectId,
    input.chapterId,
    input.chapterTitle,
    input.review.summary,
    input.review.overallSeverity,
    input.review.needsRewrite ? 1 : 0,
    input.review.antiAiForceCheck,
    JSON.stringify(input.review.checkerResults),
    currentTime,
    currentTime,
  );
}

export function upsertGenerationLanguageQaMetrics(
  env: ServerEnv,
  input: {
    projectId: string;
    chapterId: string;
    chapterTitle: string;
    languageQa: ChapterLanguageQaDraft;
  },
) {
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();

  db.prepare(`
    INSERT INTO generation_language_qa_metrics (
      project_id,
      chapter_id,
      chapter_title,
      severity,
      summary,
      issues_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, chapter_id) DO UPDATE SET
      chapter_title = excluded.chapter_title,
      severity = excluded.severity,
      summary = excluded.summary,
      issues_json = excluded.issues_json,
      updated_at = excluded.updated_at
  `).run(
    input.projectId,
    input.chapterId,
    input.chapterTitle,
    input.languageQa.severity,
    input.languageQa.summary,
    JSON.stringify(input.languageQa.issues),
    currentTime,
    currentTime,
  );
}
