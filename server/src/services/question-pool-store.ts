import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import { getGenerationDatabase } from './generation-sqlite.js';

export type QuestionPoolStatus = 'open' | 'partial' | 'answered';

export interface QuestionPoolRecord {
  id: string;
  projectId: string;
  question: string;
  firstRaisedChapterId: string | null;
  firstRaisedAt: string;
  belongsToThreadId: string | null;
  belongsToThreadName: string;
  currentClue: string;
  falseAnswers: string[];
  expectedRevealWindow: string;
  finalAnswerSummary: string;
  status: QuestionPoolStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionPoolMutationInput {
  projectId: string;
  question?: string;
  firstRaisedChapterId?: string | null;
  firstRaisedAt?: string;
  belongsToThreadId?: string | null;
  belongsToThreadName?: string;
  currentClue?: string;
  falseAnswers?: string[];
  expectedRevealWindow?: string;
  finalAnswerSummary?: string;
  status?: QuestionPoolStatus;
}

export interface ListQuestionPoolsOptions {
  projectId: string;
  status?: QuestionPoolStatus;
}

export interface QuestionPoolAlertRecord {
  questionPoolId: string;
  projectId: string;
  question: string;
  expectedRevealWindow: string;
  currentVolumeOrder: number | null;
  overdueVolumeCount: number;
  message: string;
}

function nowIsoString() {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const uniqueItems = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const normalized = item.trim();

    if (!normalized) {
      continue;
    }

    uniqueItems.add(normalized);
  }

  return Array.from(uniqueItems);
}

function parseStringArrayJson(rawText: string | null | undefined) {
  if (!rawText) {
    return [] as string[];
  }

  try {
    return normalizeStringArray(JSON.parse(rawText));
  } catch {
    return [] as string[];
  }
}

function normalizeQuestionPoolStatus(value: unknown): QuestionPoolStatus {
  return value === 'partial' || value === 'answered' ? value : 'open';
}

function mapQuestionPoolRow(row: Record<string, unknown>): QuestionPoolRecord {
  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    question: asString(row.question),
    firstRaisedChapterId: asNullableString(row.first_raised_chapter_id),
    firstRaisedAt: asString(row.first_raised_at),
    belongsToThreadId: asNullableString(row.belongs_to_thread_id),
    belongsToThreadName: asString(row.belongs_to_thread_name),
    currentClue: asString(row.current_clue),
    falseAnswers: parseStringArrayJson(asString(row.false_answers_json)),
    expectedRevealWindow: asString(row.expected_reveal_window),
    finalAnswerSummary: asString(row.final_answer_summary),
    status: normalizeQuestionPoolStatus(row.status),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function normalizeQuestionPoolRecord(
  input: QuestionPoolMutationInput,
  existing?: QuestionPoolRecord | null,
): QuestionPoolRecord {
  const currentTime = nowIsoString();

  return {
    id: existing?.id ?? randomUUID(),
    projectId: normalizeText(input.projectId, existing?.projectId ?? ''),
    question: normalizeText(input.question, existing?.question ?? '未命名问题'),
    firstRaisedChapterId:
      typeof input.firstRaisedChapterId === 'undefined'
        ? existing?.firstRaisedChapterId ?? null
        : asNullableString(input.firstRaisedChapterId),
    firstRaisedAt: normalizeText(input.firstRaisedAt, existing?.firstRaisedAt ?? ''),
    belongsToThreadId:
      typeof input.belongsToThreadId === 'undefined'
        ? existing?.belongsToThreadId ?? null
        : asNullableString(input.belongsToThreadId),
    belongsToThreadName: normalizeText(input.belongsToThreadName, existing?.belongsToThreadName ?? ''),
    currentClue: normalizeText(input.currentClue, existing?.currentClue ?? ''),
    falseAnswers:
      typeof input.falseAnswers === 'undefined'
        ? existing?.falseAnswers ?? []
        : normalizeStringArray(input.falseAnswers),
    expectedRevealWindow: normalizeText(input.expectedRevealWindow, existing?.expectedRevealWindow ?? ''),
    finalAnswerSummary: normalizeText(input.finalAnswerSummary, existing?.finalAnswerSummary ?? ''),
    status:
      typeof input.status === 'undefined'
        ? existing?.status ?? 'open'
        : normalizeQuestionPoolStatus(input.status),
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime,
  };
}

export function listQuestionPools(env: ServerEnv, options: ListQuestionPoolsOptions) {
  const db = getGenerationDatabase(env);
  const params: Array<string> = [options.projectId];
  const statusFilter = options.status ? 'AND status = ?' : '';

  if (options.status) {
    params.push(options.status);
  }

  const rows = db.prepare(`
    SELECT
      id,
      project_id,
      question,
      first_raised_chapter_id,
      first_raised_at,
      belongs_to_thread_id,
      belongs_to_thread_name,
      current_clue,
      false_answers_json,
      expected_reveal_window,
      final_answer_summary,
      status,
      created_at,
      updated_at
    FROM question_pools
    WHERE project_id = ?
    ${statusFilter}
    ORDER BY
      CASE status
        WHEN 'open' THEN 0
        WHEN 'partial' THEN 1
        WHEN 'answered' THEN 2
        ELSE 3
      END ASC,
      updated_at DESC
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map(mapQuestionPoolRow);
}

export function getQuestionPool(env: ServerEnv, projectId: string, questionPoolId: string) {
  const db = getGenerationDatabase(env);
  const row = db.prepare(`
    SELECT
      id,
      project_id,
      question,
      first_raised_chapter_id,
      first_raised_at,
      belongs_to_thread_id,
      belongs_to_thread_name,
      current_clue,
      false_answers_json,
      expected_reveal_window,
      final_answer_summary,
      status,
      created_at,
      updated_at
    FROM question_pools
    WHERE project_id = ? AND id = ?
    LIMIT 1
  `).get(projectId, questionPoolId) as Record<string, unknown> | undefined;

  return row ? mapQuestionPoolRow(row) : null;
}

export function createQuestionPool(env: ServerEnv, input: QuestionPoolMutationInput) {
  const db = getGenerationDatabase(env);
  const record = normalizeQuestionPoolRecord(input);
  db.prepare(`
    INSERT INTO question_pools (
      id,
      project_id,
      question,
      first_raised_chapter_id,
      first_raised_at,
      belongs_to_thread_id,
      belongs_to_thread_name,
      current_clue,
      false_answers_json,
      expected_reveal_window,
      final_answer_summary,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.projectId,
    record.question,
    record.firstRaisedChapterId,
    record.firstRaisedAt,
    record.belongsToThreadId,
    record.belongsToThreadName,
    record.currentClue,
    JSON.stringify(record.falseAnswers),
    record.expectedRevealWindow,
    record.finalAnswerSummary,
    record.status,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function updateQuestionPool(env: ServerEnv, questionPoolId: string, input: QuestionPoolMutationInput) {
  const existing = getQuestionPool(env, input.projectId, questionPoolId);

  if (!existing) {
    return null;
  }

  const db = getGenerationDatabase(env);
  const record = normalizeQuestionPoolRecord(input, existing);
  db.prepare(`
    UPDATE question_pools
    SET
      question = ?,
      first_raised_chapter_id = ?,
      first_raised_at = ?,
      belongs_to_thread_id = ?,
      belongs_to_thread_name = ?,
      current_clue = ?,
      false_answers_json = ?,
      expected_reveal_window = ?,
      final_answer_summary = ?,
      status = ?,
      updated_at = ?
    WHERE project_id = ? AND id = ?
  `).run(
    record.question,
    record.firstRaisedChapterId,
    record.firstRaisedAt,
    record.belongsToThreadId,
    record.belongsToThreadName,
    record.currentClue,
    JSON.stringify(record.falseAnswers),
    record.expectedRevealWindow,
    record.finalAnswerSummary,
    record.status,
    record.updatedAt,
    record.projectId,
    record.id,
  );

  return record;
}

export function deleteQuestionPool(env: ServerEnv, projectId: string, questionPoolId: string) {
  const db = getGenerationDatabase(env);
  const result = db.prepare('DELETE FROM question_pools WHERE project_id = ? AND id = ?').run(projectId, questionPoolId);
  return result.changes > 0;
}

function parseExpectedVolumeOrder(windowText: string) {
  const matched = windowText.match(/第\s*(\d+)\s*卷/u) ?? windowText.match(/(\d+)/u);

  if (!matched) {
    return null;
  }

  const parsed = Number(matched[1]);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(1, Math.trunc(parsed));
}

export function listQuestionPoolAlerts(env: ServerEnv, projectId: string, currentVolumeOrder?: number | null) {
  return listQuestionPools(env, {
    projectId,
  })
    .filter((item) => item.status === 'open' && item.expectedRevealWindow.trim())
    .map((item) => ({
      item,
      expectedVolumeOrder: parseExpectedVolumeOrder(item.expectedRevealWindow),
    }))
    .filter(({ expectedVolumeOrder }) => expectedVolumeOrder !== null)
    .filter(({ expectedVolumeOrder }) => {
      if (!expectedVolumeOrder) {
        return false;
      }

      if (!currentVolumeOrder || currentVolumeOrder <= 0) {
        return true;
      }

      return currentVolumeOrder >= expectedVolumeOrder;
    })
    .sort((left, right) => {
      const leftGap =
        currentVolumeOrder && left.expectedVolumeOrder ? currentVolumeOrder - left.expectedVolumeOrder : 0;
      const rightGap =
        currentVolumeOrder && right.expectedVolumeOrder ? currentVolumeOrder - right.expectedVolumeOrder : 0;

      if (leftGap !== rightGap) {
        return rightGap - leftGap;
      }

      return (left.expectedVolumeOrder ?? Number.MAX_SAFE_INTEGER) - (right.expectedVolumeOrder ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 4)
    .map(
      ({ item }): QuestionPoolAlertRecord => ({
        questionPoolId: item.id,
        projectId: item.projectId,
        question: item.question,
        expectedRevealWindow: item.expectedRevealWindow,
        currentVolumeOrder: currentVolumeOrder ?? null,
        overdueVolumeCount:
          currentVolumeOrder && parseExpectedVolumeOrder(item.expectedRevealWindow)
            ? Math.max(0, currentVolumeOrder - (parseExpectedVolumeOrder(item.expectedRevealWindow) ?? currentVolumeOrder))
            : 0,
        message:
          currentVolumeOrder && parseExpectedVolumeOrder(item.expectedRevealWindow)
            ? currentVolumeOrder > (parseExpectedVolumeOrder(item.expectedRevealWindow) ?? currentVolumeOrder)
              ? `当前已推进到第 ${currentVolumeOrder} 卷，这条未解问题原计划在「${item.expectedRevealWindow}」前后推进，但仍处于 open，已经超出 ${Math.max(0, currentVolumeOrder - (parseExpectedVolumeOrder(item.expectedRevealWindow) ?? currentVolumeOrder))} 卷。`
              : `当前已到第 ${currentVolumeOrder} 卷，这条未解问题的揭晓窗口就是「${item.expectedRevealWindow}」，但服务端记录仍是 open，建议本卷至少推进一次线索。`
            : `这条未解问题仍处于 open，且揭晓窗口已明确写为「${item.expectedRevealWindow}」，建议至少在后续卷纲或章节里推进线索。`,
      }),
    );
}
