import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import { getGenerationDatabase } from './generation-sqlite.js';

export type ThreadLedgerStatus = 'active' | 'dormant' | 'resolved';

export interface ThreadLedgerRecord {
  id: string;
  projectId: string;
  name: string;
  type: string;
  coreQuestion: string;
  currentPhase: string;
  lastProgressAt: string;
  lastProgressChapterId: string | null;
  lastProgressChapterTitle: string;
  lastProgressChapterOrder: number | null;
  nextTrigger: string;
  blockedBy: string;
  relatedCharacterIds: string[];
  relatedCharacterNames: string[];
  relatedForeshadowIds: string[];
  relatedForeshadowTitles: string[];
  plannedResolveVolume: number | null;
  status: ThreadLedgerStatus;
  audienceHeat: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadLedgerMutationInput {
  projectId: string;
  name?: string;
  type?: string;
  coreQuestion?: string;
  currentPhase?: string;
  lastProgressAt?: string;
  lastProgressChapterId?: string | null;
  lastProgressChapterTitle?: string;
  lastProgressChapterOrder?: number | null;
  nextTrigger?: string;
  blockedBy?: string;
  relatedCharacterIds?: string[];
  relatedCharacterNames?: string[];
  relatedForeshadowIds?: string[];
  relatedForeshadowTitles?: string[];
  plannedResolveVolume?: number | null;
  status?: ThreadLedgerStatus;
  audienceHeat?: number;
}

export interface ListThreadLedgersOptions {
  projectId: string;
  status?: ThreadLedgerStatus;
}

export interface ThreadLedgerAlertRecord {
  threadLedgerId: string;
  projectId: string;
  name: string;
  lastProgressAt: string;
  lastProgressChapterOrder: number | null;
  currentChapterOrder: number;
  overdueChapterCount: number;
  staleChapterGap: number;
  message: string;
}

export type ForeshadowPlanImportance = 'major' | 'minor';

export interface ForeshadowPlanRecord {
  id: string;
  projectId: string;
  foreshadowId: string;
  foreshadowTitle: string;
  type: string;
  importance: ForeshadowPlanImportance;
  activationWindow: string;
  resolveWindow: string;
  plannedActivateVolume: number | null;
  plannedResolveVolume: number | null;
  activationCondition: string;
  resolveCondition: string;
  dependsOnForeshadowIds: string[];
  dependsOnForeshadowTitles: string[];
  dependsOnEventKeys: string[];
  relatedQuestionIds: string[];
  payoffEffect: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForeshadowPlanMutationInput {
  projectId: string;
  foreshadowId?: string;
  foreshadowTitle?: string;
  type?: string;
  importance?: ForeshadowPlanImportance;
  activationWindow?: string;
  resolveWindow?: string;
  plannedActivateVolume?: number | null;
  plannedResolveVolume?: number | null;
  activationCondition?: string;
  resolveCondition?: string;
  dependsOnForeshadowIds?: string[];
  dependsOnForeshadowTitles?: string[];
  dependsOnEventKeys?: string[];
  relatedQuestionIds?: string[];
  payoffEffect?: string;
}

export interface ListForeshadowPlansOptions {
  projectId: string;
  foreshadowId?: string;
}

export interface ForeshadowPlanAlertRecord {
  foreshadowPlanId: string;
  projectId: string;
  foreshadowId: string;
  foreshadowTitle: string;
  plannedResolveVolume: number | null;
  currentVolumeOrder: number;
  overdueVolumeCount: number;
  message: string;
}

export interface WorldStateEntryRecord {
  id: string;
  projectId: string;
  volumeId: string;
  volumeTitle: string;
  volumeOrder: number;
  milestoneIndex: number | null;
  publicEvents: string[];
  secretEvents: string[];
  powerBalanceChange: string;
  institutionChange: string;
  ruleChange: string;
  rumorState: string;
  knownByCharacterIds: string[];
  knownByCharacterNames: string[];
  currentRisks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorldStateEntryMutationInput {
  projectId: string;
  volumeId?: string;
  volumeTitle?: string;
  volumeOrder?: number;
  milestoneIndex?: number | null;
  publicEvents?: string[];
  secretEvents?: string[];
  powerBalanceChange?: string;
  institutionChange?: string;
  ruleChange?: string;
  rumorState?: string;
  knownByCharacterIds?: string[];
  knownByCharacterNames?: string[];
  currentRisks?: string[];
}

export interface ListWorldStateEntriesOptions {
  projectId: string;
  volumeId?: string;
  milestoneIndex?: number | null;
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

function normalizeOptionalInteger(value: unknown) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function normalizeOptionalNonNegativeInteger(value: unknown) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Math.trunc(parsed);
  return normalized >= 0 ? normalized : null;
}

function normalizeAudienceHeat(value: unknown, fallback = 3) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(5, Math.trunc(parsed)));
}

function normalizeThreadLedgerStatus(value: unknown): ThreadLedgerStatus {
  return value === 'dormant' || value === 'resolved' ? value : 'active';
}

function normalizeForeshadowPlanImportance(value: unknown): ForeshadowPlanImportance {
  return value === 'major' ? 'major' : 'minor';
}

function mapThreadLedgerRow(row: Record<string, unknown>): ThreadLedgerRecord {
  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    name: asString(row.name),
    type: asString(row.type),
    coreQuestion: asString(row.core_question),
    currentPhase: asString(row.current_phase),
    lastProgressAt: asString(row.last_progress_at),
    lastProgressChapterId: asNullableString(row.last_progress_chapter_id),
    lastProgressChapterTitle: asString(row.last_progress_chapter_title),
    lastProgressChapterOrder: normalizeOptionalInteger(row.last_progress_chapter_order),
    nextTrigger: asString(row.next_trigger),
    blockedBy: asString(row.blocked_by),
    relatedCharacterIds: parseStringArrayJson(asString(row.related_character_ids_json)),
    relatedCharacterNames: parseStringArrayJson(asString(row.related_character_names_json)),
    relatedForeshadowIds: parseStringArrayJson(asString(row.related_foreshadow_ids_json)),
    relatedForeshadowTitles: parseStringArrayJson(asString(row.related_foreshadow_titles_json)),
    plannedResolveVolume: normalizeOptionalInteger(row.planned_resolve_volume),
    status: normalizeThreadLedgerStatus(row.status),
    audienceHeat: normalizeAudienceHeat(row.audience_heat),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function normalizeThreadLedgerRecord(
  input: ThreadLedgerMutationInput,
  existing?: ThreadLedgerRecord | null,
): ThreadLedgerRecord {
  const currentTime = nowIsoString();

  return {
    id: existing?.id ?? randomUUID(),
    projectId: normalizeText(input.projectId, existing?.projectId ?? ''),
    name: normalizeText(input.name, existing?.name ?? '未命名剧情线'),
    type: normalizeText(input.type, existing?.type ?? '支线'),
    coreQuestion: normalizeText(input.coreQuestion, existing?.coreQuestion ?? ''),
    currentPhase: normalizeText(input.currentPhase, existing?.currentPhase ?? ''),
    lastProgressAt: normalizeText(input.lastProgressAt, existing?.lastProgressAt ?? ''),
    lastProgressChapterId:
      typeof input.lastProgressChapterId === 'undefined'
        ? existing?.lastProgressChapterId ?? null
        : asNullableString(input.lastProgressChapterId),
    lastProgressChapterTitle:
      typeof input.lastProgressChapterTitle === 'undefined'
        ? existing?.lastProgressChapterTitle ?? ''
        : normalizeText(input.lastProgressChapterTitle),
    lastProgressChapterOrder:
      typeof input.lastProgressChapterOrder === 'undefined'
        ? existing?.lastProgressChapterOrder ?? null
        : normalizeOptionalInteger(input.lastProgressChapterOrder),
    nextTrigger: normalizeText(input.nextTrigger, existing?.nextTrigger ?? ''),
    blockedBy: normalizeText(input.blockedBy, existing?.blockedBy ?? ''),
    relatedCharacterIds:
      typeof input.relatedCharacterIds === 'undefined'
        ? existing?.relatedCharacterIds ?? []
        : normalizeStringArray(input.relatedCharacterIds),
    relatedCharacterNames:
      typeof input.relatedCharacterNames === 'undefined'
        ? existing?.relatedCharacterNames ?? []
        : normalizeStringArray(input.relatedCharacterNames),
    relatedForeshadowIds:
      typeof input.relatedForeshadowIds === 'undefined'
        ? existing?.relatedForeshadowIds ?? []
        : normalizeStringArray(input.relatedForeshadowIds),
    relatedForeshadowTitles:
      typeof input.relatedForeshadowTitles === 'undefined'
        ? existing?.relatedForeshadowTitles ?? []
        : normalizeStringArray(input.relatedForeshadowTitles),
    plannedResolveVolume:
      typeof input.plannedResolveVolume === 'undefined'
        ? existing?.plannedResolveVolume ?? null
        : normalizeOptionalInteger(input.plannedResolveVolume),
    status:
      typeof input.status === 'undefined'
        ? existing?.status ?? 'active'
        : normalizeThreadLedgerStatus(input.status),
    audienceHeat:
      typeof input.audienceHeat === 'undefined'
        ? existing?.audienceHeat ?? 3
        : normalizeAudienceHeat(input.audienceHeat),
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime,
  };
}

export function listThreadLedgers(env: ServerEnv, options: ListThreadLedgersOptions) {
  const db = getGenerationDatabase(env);
  const params: Array<string> = [options.projectId];
  const statusFilter = options.status ? 'AND status = ?' : '';

  if (options.status) {
    params.push(options.status);
  }

  const rows = db
    .prepare(
      `
        SELECT
          id,
          project_id,
          name,
          type,
          core_question,
          current_phase,
          last_progress_at,
          last_progress_chapter_id,
          last_progress_chapter_title,
          last_progress_chapter_order,
          next_trigger,
          blocked_by,
          related_character_ids_json,
          related_character_names_json,
          related_foreshadow_ids_json,
          related_foreshadow_titles_json,
          planned_resolve_volume,
          status,
          audience_heat,
          created_at,
          updated_at
        FROM thread_ledgers
        WHERE project_id = ?
        ${statusFilter}
        ORDER BY
          CASE status
            WHEN 'active' THEN 0
            WHEN 'dormant' THEN 1
            WHEN 'resolved' THEN 2
            ELSE 3
          END ASC,
          audience_heat DESC,
          updated_at DESC,
          name COLLATE NOCASE ASC
      `,
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map(mapThreadLedgerRow);
}

export function getThreadLedger(env: ServerEnv, projectId: string, threadLedgerId: string) {
  const db = getGenerationDatabase(env);
  const row = db
    .prepare(
      `
        SELECT
          id,
          project_id,
          name,
          type,
          core_question,
          current_phase,
          last_progress_at,
          last_progress_chapter_id,
          last_progress_chapter_title,
          last_progress_chapter_order,
          next_trigger,
          blocked_by,
          related_character_ids_json,
          related_character_names_json,
          related_foreshadow_ids_json,
          related_foreshadow_titles_json,
          planned_resolve_volume,
          status,
          audience_heat,
          created_at,
          updated_at
        FROM thread_ledgers
        WHERE project_id = ? AND id = ?
        LIMIT 1
      `,
    )
    .get(projectId, threadLedgerId) as Record<string, unknown> | undefined;

  return row ? mapThreadLedgerRow(row) : null;
}

export function createThreadLedger(env: ServerEnv, input: ThreadLedgerMutationInput) {
  const db = getGenerationDatabase(env);
  const record = normalizeThreadLedgerRecord(input);
  const statement = db.prepare(`
    INSERT INTO thread_ledgers (
      id,
      project_id,
      name,
      type,
      core_question,
      current_phase,
      last_progress_at,
      last_progress_chapter_id,
      last_progress_chapter_title,
      last_progress_chapter_order,
      next_trigger,
      blocked_by,
      related_character_ids_json,
      related_character_names_json,
      related_foreshadow_ids_json,
      related_foreshadow_titles_json,
      planned_resolve_volume,
      status,
      audience_heat,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    record.id,
    record.projectId,
    record.name,
    record.type,
    record.coreQuestion,
    record.currentPhase,
    record.lastProgressAt,
    record.lastProgressChapterId,
    record.lastProgressChapterTitle,
    record.lastProgressChapterOrder,
    record.nextTrigger,
    record.blockedBy,
    JSON.stringify(record.relatedCharacterIds),
    JSON.stringify(record.relatedCharacterNames),
    JSON.stringify(record.relatedForeshadowIds),
    JSON.stringify(record.relatedForeshadowTitles),
    record.plannedResolveVolume,
    record.status,
    record.audienceHeat,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function updateThreadLedger(env: ServerEnv, threadLedgerId: string, input: ThreadLedgerMutationInput) {
  const existing = getThreadLedger(env, input.projectId, threadLedgerId);

  if (!existing) {
    return null;
  }

  const db = getGenerationDatabase(env);
  const record = normalizeThreadLedgerRecord(input, existing);
  const statement = db.prepare(`
    UPDATE thread_ledgers
    SET
      name = ?,
      type = ?,
      core_question = ?,
      current_phase = ?,
      last_progress_at = ?,
      last_progress_chapter_id = ?,
      last_progress_chapter_title = ?,
      last_progress_chapter_order = ?,
      next_trigger = ?,
      blocked_by = ?,
      related_character_ids_json = ?,
      related_character_names_json = ?,
      related_foreshadow_ids_json = ?,
      related_foreshadow_titles_json = ?,
      planned_resolve_volume = ?,
      status = ?,
      audience_heat = ?,
      updated_at = ?
    WHERE project_id = ? AND id = ?
  `);

  statement.run(
    record.name,
    record.type,
    record.coreQuestion,
    record.currentPhase,
    record.lastProgressAt,
    record.lastProgressChapterId,
    record.lastProgressChapterTitle,
    record.lastProgressChapterOrder,
    record.nextTrigger,
    record.blockedBy,
    JSON.stringify(record.relatedCharacterIds),
    JSON.stringify(record.relatedCharacterNames),
    JSON.stringify(record.relatedForeshadowIds),
    JSON.stringify(record.relatedForeshadowTitles),
    record.plannedResolveVolume,
    record.status,
    record.audienceHeat,
    record.updatedAt,
    record.projectId,
    record.id,
  );

  return record;
}

export function deleteThreadLedger(env: ServerEnv, projectId: string, threadLedgerId: string) {
  const db = getGenerationDatabase(env);
  const result = db
    .prepare('DELETE FROM thread_ledgers WHERE project_id = ? AND id = ?')
    .run(projectId, threadLedgerId);

  return result.changes > 0;
}

export function listDormantThreadLedgerAlerts(env: ServerEnv, input: {
  projectId: string;
  currentChapterOrder: number;
  staleChapterGap?: number;
}) {
  const staleChapterGap = Math.max(1, Math.trunc(input.staleChapterGap ?? 15));

  if (!Number.isFinite(input.currentChapterOrder) || input.currentChapterOrder <= 0) {
    return [] as ThreadLedgerAlertRecord[];
  }

  return listThreadLedgers(env, {
    projectId: input.projectId,
  })
    .filter(
      (item) =>
        item.status === 'dormant' &&
        typeof item.lastProgressChapterOrder === 'number' &&
        input.currentChapterOrder - item.lastProgressChapterOrder >= staleChapterGap,
    )
    .map(
      (item): ThreadLedgerAlertRecord => ({
        threadLedgerId: item.id,
        projectId: item.projectId,
        name: item.name,
        lastProgressAt: item.lastProgressAt,
        lastProgressChapterOrder: item.lastProgressChapterOrder,
        currentChapterOrder: input.currentChapterOrder,
        overdueChapterCount: input.currentChapterOrder - (item.lastProgressChapterOrder ?? input.currentChapterOrder),
        staleChapterGap,
        message:
          item.lastProgressChapterOrder && item.lastProgressChapterOrder > 0
            ? `这条剧情线已休眠，并且自第 ${item.lastProgressChapterOrder} 章后又过去了 ${input.currentChapterOrder - item.lastProgressChapterOrder} 章，建议尽快决定是推进、转移还是收束。`
            : '这条剧情线已休眠超过阈值，但没有明确推进章节锚点，建议补录最近推进点或尽快处理。',
      }),
    );
}

function mapForeshadowPlanRow(row: Record<string, unknown>): ForeshadowPlanRecord {
  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    foreshadowId: asString(row.foreshadow_id),
    foreshadowTitle: asString(row.foreshadow_title),
    type: asString(row.type),
    importance: normalizeForeshadowPlanImportance(row.importance),
    activationWindow: asString(row.activation_window),
    resolveWindow: asString(row.resolve_window),
    plannedActivateVolume: normalizeOptionalInteger(row.planned_activate_volume),
    plannedResolveVolume: normalizeOptionalInteger(row.planned_resolve_volume),
    activationCondition: asString(row.activation_condition),
    resolveCondition: asString(row.resolve_condition),
    dependsOnForeshadowIds: parseStringArrayJson(asString(row.depends_on_foreshadow_ids_json)),
    dependsOnForeshadowTitles: parseStringArrayJson(asString(row.depends_on_foreshadow_titles_json)),
    dependsOnEventKeys: parseStringArrayJson(asString(row.depends_on_event_keys_json)),
    relatedQuestionIds: parseStringArrayJson(asString(row.related_question_ids_json)),
    payoffEffect: asString(row.payoff_effect),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function normalizeForeshadowPlanRecord(
  input: ForeshadowPlanMutationInput,
  existing?: ForeshadowPlanRecord | null,
): ForeshadowPlanRecord {
  const currentTime = nowIsoString();

  return {
    id: existing?.id ?? randomUUID(),
    projectId: normalizeText(input.projectId, existing?.projectId ?? ''),
    foreshadowId: normalizeText(input.foreshadowId, existing?.foreshadowId ?? ''),
    foreshadowTitle: normalizeText(input.foreshadowTitle, existing?.foreshadowTitle ?? '未命名伏笔'),
    type: normalizeText(input.type, existing?.type ?? '主线伏笔'),
    importance:
      typeof input.importance === 'undefined'
        ? existing?.importance ?? 'minor'
        : normalizeForeshadowPlanImportance(input.importance),
    activationWindow: normalizeText(input.activationWindow, existing?.activationWindow ?? ''),
    resolveWindow: normalizeText(input.resolveWindow, existing?.resolveWindow ?? ''),
    plannedActivateVolume:
      typeof input.plannedActivateVolume === 'undefined'
        ? existing?.plannedActivateVolume ?? null
        : normalizeOptionalInteger(input.plannedActivateVolume),
    plannedResolveVolume:
      typeof input.plannedResolveVolume === 'undefined'
        ? existing?.plannedResolveVolume ?? null
        : normalizeOptionalInteger(input.plannedResolveVolume),
    activationCondition: normalizeText(input.activationCondition, existing?.activationCondition ?? ''),
    resolveCondition: normalizeText(input.resolveCondition, existing?.resolveCondition ?? ''),
    dependsOnForeshadowIds:
      typeof input.dependsOnForeshadowIds === 'undefined'
        ? existing?.dependsOnForeshadowIds ?? []
        : normalizeStringArray(input.dependsOnForeshadowIds),
    dependsOnForeshadowTitles:
      typeof input.dependsOnForeshadowTitles === 'undefined'
        ? existing?.dependsOnForeshadowTitles ?? []
        : normalizeStringArray(input.dependsOnForeshadowTitles),
    dependsOnEventKeys:
      typeof input.dependsOnEventKeys === 'undefined'
        ? existing?.dependsOnEventKeys ?? []
        : normalizeStringArray(input.dependsOnEventKeys),
    relatedQuestionIds:
      typeof input.relatedQuestionIds === 'undefined'
        ? existing?.relatedQuestionIds ?? []
        : normalizeStringArray(input.relatedQuestionIds),
    payoffEffect: normalizeText(input.payoffEffect, existing?.payoffEffect ?? ''),
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime,
  };
}

export function listForeshadowPlans(env: ServerEnv, options: ListForeshadowPlansOptions) {
  const db = getGenerationDatabase(env);
  const params: Array<string> = [options.projectId];
  const foreshadowFilter = options.foreshadowId ? 'AND foreshadow_id = ?' : '';

  if (options.foreshadowId) {
    params.push(options.foreshadowId);
  }

  const rows = db
    .prepare(
      `
        SELECT
          id,
          project_id,
          foreshadow_id,
          foreshadow_title,
          type,
          importance,
          activation_window,
          resolve_window,
          planned_activate_volume,
          planned_resolve_volume,
          activation_condition,
          resolve_condition,
          depends_on_foreshadow_ids_json,
          depends_on_foreshadow_titles_json,
          depends_on_event_keys_json,
          related_question_ids_json,
          payoff_effect,
          created_at,
          updated_at
        FROM foreshadow_plans
        WHERE project_id = ?
        ${foreshadowFilter}
        ORDER BY
          CASE importance
            WHEN 'major' THEN 0
            ELSE 1
          END ASC,
          planned_resolve_volume ASC,
          updated_at DESC,
          foreshadow_title COLLATE NOCASE ASC
      `,
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map(mapForeshadowPlanRow);
}

export function getForeshadowPlan(env: ServerEnv, projectId: string, foreshadowPlanId: string) {
  const db = getGenerationDatabase(env);
  const row = db
    .prepare(
      `
        SELECT
          id,
          project_id,
          foreshadow_id,
          foreshadow_title,
          type,
          importance,
          activation_window,
          resolve_window,
          planned_activate_volume,
          planned_resolve_volume,
          activation_condition,
          resolve_condition,
          depends_on_foreshadow_ids_json,
          depends_on_foreshadow_titles_json,
          depends_on_event_keys_json,
          related_question_ids_json,
          payoff_effect,
          created_at,
          updated_at
        FROM foreshadow_plans
        WHERE project_id = ? AND id = ?
        LIMIT 1
      `,
    )
    .get(projectId, foreshadowPlanId) as Record<string, unknown> | undefined;

  return row ? mapForeshadowPlanRow(row) : null;
}

export function createForeshadowPlan(env: ServerEnv, input: ForeshadowPlanMutationInput) {
  const db = getGenerationDatabase(env);
  const record = normalizeForeshadowPlanRecord(input);
  const statement = db.prepare(`
    INSERT INTO foreshadow_plans (
      id,
      project_id,
      foreshadow_id,
      foreshadow_title,
      type,
      importance,
      activation_window,
      resolve_window,
      planned_activate_volume,
      planned_resolve_volume,
      activation_condition,
      resolve_condition,
      depends_on_foreshadow_ids_json,
      depends_on_foreshadow_titles_json,
      depends_on_event_keys_json,
      related_question_ids_json,
      payoff_effect,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    record.id,
    record.projectId,
    record.foreshadowId,
    record.foreshadowTitle,
    record.type,
    record.importance,
    record.activationWindow,
    record.resolveWindow,
    record.plannedActivateVolume,
    record.plannedResolveVolume,
    record.activationCondition,
    record.resolveCondition,
    JSON.stringify(record.dependsOnForeshadowIds),
    JSON.stringify(record.dependsOnForeshadowTitles),
    JSON.stringify(record.dependsOnEventKeys),
    JSON.stringify(record.relatedQuestionIds),
    record.payoffEffect,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function updateForeshadowPlan(env: ServerEnv, foreshadowPlanId: string, input: ForeshadowPlanMutationInput) {
  const existing = getForeshadowPlan(env, input.projectId, foreshadowPlanId);

  if (!existing) {
    return null;
  }

  const db = getGenerationDatabase(env);
  const record = normalizeForeshadowPlanRecord(input, existing);
  const statement = db.prepare(`
    UPDATE foreshadow_plans
    SET
      foreshadow_id = ?,
      foreshadow_title = ?,
      type = ?,
      importance = ?,
      activation_window = ?,
      resolve_window = ?,
      planned_activate_volume = ?,
      planned_resolve_volume = ?,
      activation_condition = ?,
      resolve_condition = ?,
      depends_on_foreshadow_ids_json = ?,
      depends_on_foreshadow_titles_json = ?,
      depends_on_event_keys_json = ?,
      related_question_ids_json = ?,
      payoff_effect = ?,
      updated_at = ?
    WHERE project_id = ? AND id = ?
  `);

  statement.run(
    record.foreshadowId,
    record.foreshadowTitle,
    record.type,
    record.importance,
    record.activationWindow,
    record.resolveWindow,
    record.plannedActivateVolume,
    record.plannedResolveVolume,
    record.activationCondition,
    record.resolveCondition,
    JSON.stringify(record.dependsOnForeshadowIds),
    JSON.stringify(record.dependsOnForeshadowTitles),
    JSON.stringify(record.dependsOnEventKeys),
    JSON.stringify(record.relatedQuestionIds),
    record.payoffEffect,
    record.updatedAt,
    record.projectId,
    record.id,
  );

  return record;
}

export function deleteForeshadowPlan(env: ServerEnv, projectId: string, foreshadowPlanId: string) {
  const db = getGenerationDatabase(env);
  const result = db
    .prepare('DELETE FROM foreshadow_plans WHERE project_id = ? AND id = ?')
    .run(projectId, foreshadowPlanId);

  return result.changes > 0;
}

export function listOverdueForeshadowPlanAlerts(env: ServerEnv, input: {
  projectId: string;
  currentVolumeOrder: number;
  overdueVolumeGap?: number;
}) {
  const overdueVolumeGap = Math.max(1, Math.trunc(input.overdueVolumeGap ?? 2));

  if (!Number.isFinite(input.currentVolumeOrder) || input.currentVolumeOrder <= 0) {
    return [] as ForeshadowPlanAlertRecord[];
  }

  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          plan.id,
          plan.project_id,
          plan.foreshadow_id,
          plan.foreshadow_title,
          plan.planned_resolve_volume,
          COALESCE(gf.status, '') AS foreshadow_status
        FROM foreshadow_plans plan
        LEFT JOIN generation_foreshadows gf
          ON gf.project_id = plan.project_id
          AND gf.id = plan.foreshadow_id
        WHERE plan.project_id = ?
          AND plan.importance = 'major'
          AND plan.planned_resolve_volume IS NOT NULL
      `,
    )
    .all(input.projectId) as Array<Record<string, unknown>>;

  return rows
    .map((row) => ({
      id: asString(row.id),
      projectId: asString(row.project_id),
      foreshadowId: asString(row.foreshadow_id),
      foreshadowTitle: asString(row.foreshadow_title),
      plannedResolveVolume: normalizeOptionalInteger(row.planned_resolve_volume),
      foreshadowStatus: asString(row.foreshadow_status),
    }))
    .filter(
      (row) =>
        typeof row.plannedResolveVolume === 'number' &&
        row.plannedResolveVolume > 0 &&
        row.foreshadowStatus !== 'resolved' &&
        input.currentVolumeOrder - row.plannedResolveVolume >= overdueVolumeGap,
    )
    .map(
      (row): ForeshadowPlanAlertRecord => ({
        foreshadowPlanId: row.id,
        projectId: row.projectId,
        foreshadowId: row.foreshadowId,
        foreshadowTitle: row.foreshadowTitle,
        plannedResolveVolume: row.plannedResolveVolume,
        currentVolumeOrder: input.currentVolumeOrder,
        overdueVolumeCount: input.currentVolumeOrder - (row.plannedResolveVolume ?? input.currentVolumeOrder),
        message: `这条核心伏笔计划在第 ${row.plannedResolveVolume} 卷前后回收，但按当前服务端记录仍未 resolved，已经超出 ${input.currentVolumeOrder - (row.plannedResolveVolume ?? input.currentVolumeOrder)} 卷。`,
      }),
    );
}

function mapWorldStateEntryRow(row: Record<string, unknown>): WorldStateEntryRecord {
  const milestoneIndex = normalizeOptionalNonNegativeInteger(row.milestone_index);

  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    volumeId: asString(row.volume_id),
    volumeTitle: asString(row.volume_title),
    volumeOrder: Number(row.volume_order ?? 0),
    milestoneIndex: milestoneIndex === null || milestoneIndex < 0 ? null : milestoneIndex,
    publicEvents: parseStringArrayJson(asString(row.public_events_json)),
    secretEvents: parseStringArrayJson(asString(row.secret_events_json)),
    powerBalanceChange: asString(row.power_balance_change),
    institutionChange: asString(row.institution_change),
    ruleChange: asString(row.rule_change),
    rumorState: asString(row.rumor_state),
    knownByCharacterIds: parseStringArrayJson(asString(row.known_by_character_ids_json)),
    knownByCharacterNames: parseStringArrayJson(asString(row.known_by_character_names_json)),
    currentRisks: parseStringArrayJson(asString(row.current_risks_json)),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function normalizeMilestoneIndex(value: unknown) {
  const normalized = normalizeOptionalNonNegativeInteger(value);

  if (normalized === null) {
    return null;
  }

  return Math.max(0, normalized);
}

function normalizeWorldStateEntryRecord(
  input: WorldStateEntryMutationInput,
  existing?: WorldStateEntryRecord | null,
): WorldStateEntryRecord {
  const currentTime = nowIsoString();
  const milestoneIndex =
    typeof input.milestoneIndex === 'undefined'
      ? existing?.milestoneIndex ?? null
      : normalizeMilestoneIndex(input.milestoneIndex);

  return {
    id: existing?.id ?? randomUUID(),
    projectId: normalizeText(input.projectId, existing?.projectId ?? ''),
    volumeId: normalizeText(input.volumeId, existing?.volumeId ?? ''),
    volumeTitle: normalizeText(input.volumeTitle, existing?.volumeTitle ?? ''),
    volumeOrder: normalizeOptionalInteger(input.volumeOrder) ?? existing?.volumeOrder ?? 0,
    milestoneIndex,
    publicEvents:
      typeof input.publicEvents === 'undefined'
        ? existing?.publicEvents ?? []
        : normalizeStringArray(input.publicEvents),
    secretEvents:
      typeof input.secretEvents === 'undefined'
        ? existing?.secretEvents ?? []
        : normalizeStringArray(input.secretEvents),
    powerBalanceChange: normalizeText(input.powerBalanceChange, existing?.powerBalanceChange ?? ''),
    institutionChange: normalizeText(input.institutionChange, existing?.institutionChange ?? ''),
    ruleChange: normalizeText(input.ruleChange, existing?.ruleChange ?? ''),
    rumorState: normalizeText(input.rumorState, existing?.rumorState ?? ''),
    knownByCharacterIds:
      typeof input.knownByCharacterIds === 'undefined'
        ? existing?.knownByCharacterIds ?? []
        : normalizeStringArray(input.knownByCharacterIds),
    knownByCharacterNames:
      typeof input.knownByCharacterNames === 'undefined'
        ? existing?.knownByCharacterNames ?? []
        : normalizeStringArray(input.knownByCharacterNames),
    currentRisks:
      typeof input.currentRisks === 'undefined'
        ? existing?.currentRisks ?? []
        : normalizeStringArray(input.currentRisks),
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime,
  };
}

export function listWorldStateEntries(env: ServerEnv, options: ListWorldStateEntriesOptions) {
  const db = getGenerationDatabase(env);
  const params: Array<string | number> = [options.projectId];
  const volumeFilter = options.volumeId ? 'AND volume_id = ?' : '';
  const milestoneFilter =
    typeof options.milestoneIndex === 'number' && Number.isFinite(options.milestoneIndex)
      ? 'AND milestone_index = ?'
      : '';

  if (options.volumeId) {
    params.push(options.volumeId);
  }

  if (typeof options.milestoneIndex === 'number' && Number.isFinite(options.milestoneIndex)) {
    params.push(Math.max(-1, Math.trunc(options.milestoneIndex)));
  }

  const rows = db
    .prepare(
      `
        SELECT
          id,
          project_id,
          volume_id,
          volume_title,
          volume_order,
          milestone_index,
          public_events_json,
          secret_events_json,
          power_balance_change,
          institution_change,
          rule_change,
          rumor_state,
          known_by_character_ids_json,
          known_by_character_names_json,
          current_risks_json,
          created_at,
          updated_at
        FROM world_state_entries
        WHERE project_id = ?
        ${volumeFilter}
        ${milestoneFilter}
        ORDER BY volume_order DESC, milestone_index ASC, updated_at DESC
      `,
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map(mapWorldStateEntryRow);
}

export function getWorldStateEntry(env: ServerEnv, projectId: string, worldStateEntryId: string) {
  const db = getGenerationDatabase(env);
  const row = db
    .prepare(
      `
        SELECT
          id,
          project_id,
          volume_id,
          volume_title,
          volume_order,
          milestone_index,
          public_events_json,
          secret_events_json,
          power_balance_change,
          institution_change,
          rule_change,
          rumor_state,
          known_by_character_ids_json,
          known_by_character_names_json,
          current_risks_json,
          created_at,
          updated_at
        FROM world_state_entries
        WHERE project_id = ? AND id = ?
        LIMIT 1
      `,
    )
    .get(projectId, worldStateEntryId) as Record<string, unknown> | undefined;

  return row ? mapWorldStateEntryRow(row) : null;
}

export function createWorldStateEntry(env: ServerEnv, input: WorldStateEntryMutationInput) {
  const db = getGenerationDatabase(env);
  const record = normalizeWorldStateEntryRecord(input);
  const statement = db.prepare(`
    INSERT INTO world_state_entries (
      id,
      project_id,
      volume_id,
      volume_title,
      volume_order,
      milestone_index,
      public_events_json,
      secret_events_json,
      power_balance_change,
      institution_change,
      rule_change,
      rumor_state,
      known_by_character_ids_json,
      known_by_character_names_json,
      current_risks_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    record.id,
    record.projectId,
    record.volumeId,
    record.volumeTitle,
    record.volumeOrder,
    record.milestoneIndex ?? -1,
    JSON.stringify(record.publicEvents),
    JSON.stringify(record.secretEvents),
    record.powerBalanceChange,
    record.institutionChange,
    record.ruleChange,
    record.rumorState,
    JSON.stringify(record.knownByCharacterIds),
    JSON.stringify(record.knownByCharacterNames),
    JSON.stringify(record.currentRisks),
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function updateWorldStateEntry(env: ServerEnv, worldStateEntryId: string, input: WorldStateEntryMutationInput) {
  const existing = getWorldStateEntry(env, input.projectId, worldStateEntryId);

  if (!existing) {
    return null;
  }

  const db = getGenerationDatabase(env);
  const record = normalizeWorldStateEntryRecord(input, existing);
  const statement = db.prepare(`
    UPDATE world_state_entries
    SET
      volume_id = ?,
      volume_title = ?,
      volume_order = ?,
      milestone_index = ?,
      public_events_json = ?,
      secret_events_json = ?,
      power_balance_change = ?,
      institution_change = ?,
      rule_change = ?,
      rumor_state = ?,
      known_by_character_ids_json = ?,
      known_by_character_names_json = ?,
      current_risks_json = ?,
      updated_at = ?
    WHERE project_id = ? AND id = ?
  `);

  statement.run(
    record.volumeId,
    record.volumeTitle,
    record.volumeOrder,
    record.milestoneIndex ?? -1,
    JSON.stringify(record.publicEvents),
    JSON.stringify(record.secretEvents),
    record.powerBalanceChange,
    record.institutionChange,
    record.ruleChange,
    record.rumorState,
    JSON.stringify(record.knownByCharacterIds),
    JSON.stringify(record.knownByCharacterNames),
    JSON.stringify(record.currentRisks),
    record.updatedAt,
    record.projectId,
    record.id,
  );

  return record;
}

export function deleteWorldStateEntry(env: ServerEnv, projectId: string, worldStateEntryId: string) {
  const db = getGenerationDatabase(env);
  const result = db
    .prepare('DELETE FROM world_state_entries WHERE project_id = ? AND id = ?')
    .run(projectId, worldStateEntryId);

  return result.changes > 0;
}
