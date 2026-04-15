import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import { getGenerationDatabase } from './generation-sqlite.js';

export interface PovPermissionRecord {
  id: string;
  projectId: string;
  volumeId: string | null;
  volumeTitle: string;
  milestoneIndex: number | null;
  chapterId: string | null;
  chapterTitle: string;
  povCharacterId: string | null;
  povCharacterName: string;
  readerKnows: string[];
  protagonistKnows: string[];
  antagonistKnows: string[];
  mustHide: string[];
  canHint: string[];
  forbiddenReveal: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PovPermissionMutationInput {
  projectId: string;
  volumeId?: string | null;
  volumeTitle?: string;
  milestoneIndex?: number | null;
  chapterId?: string | null;
  chapterTitle?: string;
  povCharacterId?: string | null;
  povCharacterName?: string;
  readerKnows?: string[];
  protagonistKnows?: string[];
  antagonistKnows?: string[];
  mustHide?: string[];
  canHint?: string[];
  forbiddenReveal?: string[];
}

export interface ListPovPermissionsOptions {
  projectId: string;
  volumeId?: string;
  chapterId?: string;
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

function mapRow(row: Record<string, unknown>): PovPermissionRecord {
  const milestoneIndex = normalizeOptionalNonNegativeInteger(row.milestone_index);

  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    volumeId: asNullableString(row.volume_id),
    volumeTitle: asString(row.volume_title),
    milestoneIndex: milestoneIndex === null || milestoneIndex < 0 ? null : milestoneIndex,
    chapterId: asNullableString(row.chapter_id),
    chapterTitle: asString(row.chapter_title),
    povCharacterId: asNullableString(row.pov_character_id),
    povCharacterName: asString(row.pov_character_name),
    readerKnows: parseStringArrayJson(asString(row.reader_knows_json)),
    protagonistKnows: parseStringArrayJson(asString(row.protagonist_knows_json)),
    antagonistKnows: parseStringArrayJson(asString(row.antagonist_knows_json)),
    mustHide: parseStringArrayJson(asString(row.must_hide_json)),
    canHint: parseStringArrayJson(asString(row.can_hint_json)),
    forbiddenReveal: parseStringArrayJson(asString(row.forbidden_reveal_json)),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function normalizeRecord(input: PovPermissionMutationInput, existing?: PovPermissionRecord | null): PovPermissionRecord {
  const currentTime = nowIsoString();

  return {
    id: existing?.id ?? randomUUID(),
    projectId: normalizeText(input.projectId, existing?.projectId ?? ''),
    volumeId:
      typeof input.volumeId === 'undefined' ? existing?.volumeId ?? null : asNullableString(input.volumeId),
    volumeTitle: normalizeText(input.volumeTitle, existing?.volumeTitle ?? ''),
    milestoneIndex:
      typeof input.milestoneIndex === 'undefined'
        ? existing?.milestoneIndex ?? null
        : normalizeOptionalNonNegativeInteger(input.milestoneIndex),
    chapterId:
      typeof input.chapterId === 'undefined' ? existing?.chapterId ?? null : asNullableString(input.chapterId),
    chapterTitle: normalizeText(input.chapterTitle, existing?.chapterTitle ?? ''),
    povCharacterId:
      typeof input.povCharacterId === 'undefined'
        ? existing?.povCharacterId ?? null
        : asNullableString(input.povCharacterId),
    povCharacterName: normalizeText(input.povCharacterName, existing?.povCharacterName ?? ''),
    readerKnows:
      typeof input.readerKnows === 'undefined' ? existing?.readerKnows ?? [] : normalizeStringArray(input.readerKnows),
    protagonistKnows:
      typeof input.protagonistKnows === 'undefined'
        ? existing?.protagonistKnows ?? []
        : normalizeStringArray(input.protagonistKnows),
    antagonistKnows:
      typeof input.antagonistKnows === 'undefined'
        ? existing?.antagonistKnows ?? []
        : normalizeStringArray(input.antagonistKnows),
    mustHide:
      typeof input.mustHide === 'undefined' ? existing?.mustHide ?? [] : normalizeStringArray(input.mustHide),
    canHint:
      typeof input.canHint === 'undefined' ? existing?.canHint ?? [] : normalizeStringArray(input.canHint),
    forbiddenReveal:
      typeof input.forbiddenReveal === 'undefined'
        ? existing?.forbiddenReveal ?? []
        : normalizeStringArray(input.forbiddenReveal),
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime,
  };
}

export function listPovPermissions(env: ServerEnv, options: ListPovPermissionsOptions) {
  const db = getGenerationDatabase(env);
  const params: Array<string> = [options.projectId];
  const volumeFilter = options.volumeId ? 'AND volume_id = ?' : '';
  const chapterFilter = options.chapterId ? 'AND chapter_id = ?' : '';

  if (options.volumeId) {
    params.push(options.volumeId);
  }
  if (options.chapterId) {
    params.push(options.chapterId);
  }

  const rows = db.prepare(`
    SELECT
      id,
      project_id,
      volume_id,
      volume_title,
      milestone_index,
      chapter_id,
      chapter_title,
      pov_character_id,
      pov_character_name,
      reader_knows_json,
      protagonist_knows_json,
      antagonist_knows_json,
      must_hide_json,
      can_hint_json,
      forbidden_reveal_json,
      created_at,
      updated_at
    FROM pov_permissions
    WHERE project_id = ?
    ${volumeFilter}
    ${chapterFilter}
    ORDER BY
      CASE WHEN chapter_id IS NOT NULL AND chapter_id != '' THEN 0 ELSE 1 END ASC,
      milestone_index DESC,
      updated_at DESC
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map(mapRow);
}

export function getPovPermission(env: ServerEnv, projectId: string, permissionId: string) {
  const db = getGenerationDatabase(env);
  const row = db.prepare(`
    SELECT
      id,
      project_id,
      volume_id,
      volume_title,
      milestone_index,
      chapter_id,
      chapter_title,
      pov_character_id,
      pov_character_name,
      reader_knows_json,
      protagonist_knows_json,
      antagonist_knows_json,
      must_hide_json,
      can_hint_json,
      forbidden_reveal_json,
      created_at,
      updated_at
    FROM pov_permissions
    WHERE project_id = ? AND id = ?
    LIMIT 1
  `).get(projectId, permissionId) as Record<string, unknown> | undefined;

  return row ? mapRow(row) : null;
}

export function createPovPermission(env: ServerEnv, input: PovPermissionMutationInput) {
  const db = getGenerationDatabase(env);
  const record = normalizeRecord(input);
  db.prepare(`
    INSERT INTO pov_permissions (
      id,
      project_id,
      volume_id,
      volume_title,
      milestone_index,
      chapter_id,
      chapter_title,
      pov_character_id,
      pov_character_name,
      reader_knows_json,
      protagonist_knows_json,
      antagonist_knows_json,
      must_hide_json,
      can_hint_json,
      forbidden_reveal_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.projectId,
    record.volumeId,
    record.volumeTitle,
    record.milestoneIndex ?? -1,
    record.chapterId,
    record.chapterTitle,
    record.povCharacterId,
    record.povCharacterName,
    JSON.stringify(record.readerKnows),
    JSON.stringify(record.protagonistKnows),
    JSON.stringify(record.antagonistKnows),
    JSON.stringify(record.mustHide),
    JSON.stringify(record.canHint),
    JSON.stringify(record.forbiddenReveal),
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function updatePovPermission(env: ServerEnv, permissionId: string, input: PovPermissionMutationInput) {
  const existing = getPovPermission(env, input.projectId, permissionId);
  if (!existing) {
    return null;
  }
  const db = getGenerationDatabase(env);
  const record = normalizeRecord(input, existing);
  db.prepare(`
    UPDATE pov_permissions
    SET
      volume_id = ?,
      volume_title = ?,
      milestone_index = ?,
      chapter_id = ?,
      chapter_title = ?,
      pov_character_id = ?,
      pov_character_name = ?,
      reader_knows_json = ?,
      protagonist_knows_json = ?,
      antagonist_knows_json = ?,
      must_hide_json = ?,
      can_hint_json = ?,
      forbidden_reveal_json = ?,
      updated_at = ?
    WHERE project_id = ? AND id = ?
  `).run(
    record.volumeId,
    record.volumeTitle,
    record.milestoneIndex ?? -1,
    record.chapterId,
    record.chapterTitle,
    record.povCharacterId,
    record.povCharacterName,
    JSON.stringify(record.readerKnows),
    JSON.stringify(record.protagonistKnows),
    JSON.stringify(record.antagonistKnows),
    JSON.stringify(record.mustHide),
    JSON.stringify(record.canHint),
    JSON.stringify(record.forbiddenReveal),
    record.updatedAt,
    record.projectId,
    record.id,
  );

  return record;
}

export function deletePovPermission(env: ServerEnv, projectId: string, permissionId: string) {
  const db = getGenerationDatabase(env);
  const result = db.prepare('DELETE FROM pov_permissions WHERE project_id = ? AND id = ?').run(projectId, permissionId);
  return result.changes > 0;
}
