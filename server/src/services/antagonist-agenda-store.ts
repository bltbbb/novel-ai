import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import { getGenerationDatabase } from './generation-sqlite.js';

export type AntagonistAgendaStatus = 'active' | 'defeated' | 'dormant';

export interface AntagonistAgendaRecord {
  id: string;
  projectId: string;
  characterEntityId: string | null;
  characterName: string;
  publicRole: string;
  hiddenAgenda: string;
  currentObjective: string;
  currentAction: string;
  triggerToStrike: string;
  bottomLine: string;
  resourceBase: string;
  nextMoveWindow: string;
  intelligenceBlindSpot: string;
  ifProtagonistDoesNothing: string;
  status: AntagonistAgendaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AntagonistAgendaMutationInput {
  projectId: string;
  characterEntityId?: string | null;
  characterName?: string;
  publicRole?: string;
  hiddenAgenda?: string;
  currentObjective?: string;
  currentAction?: string;
  triggerToStrike?: string;
  bottomLine?: string;
  resourceBase?: string;
  nextMoveWindow?: string;
  intelligenceBlindSpot?: string;
  ifProtagonistDoesNothing?: string;
  status?: AntagonistAgendaStatus;
}

export interface ListAntagonistAgendasOptions {
  projectId: string;
  status?: AntagonistAgendaStatus;
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

function normalizeStatus(value: unknown): AntagonistAgendaStatus {
  return value === 'defeated' || value === 'dormant' ? value : 'active';
}

function mapRow(row: Record<string, unknown>): AntagonistAgendaRecord {
  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    characterEntityId: asNullableString(row.character_entity_id),
    characterName: asString(row.character_name),
    publicRole: asString(row.public_role),
    hiddenAgenda: asString(row.hidden_agenda),
    currentObjective: asString(row.current_objective),
    currentAction: asString(row.current_action),
    triggerToStrike: asString(row.trigger_to_strike),
    bottomLine: asString(row.bottom_line),
    resourceBase: asString(row.resource_base),
    nextMoveWindow: asString(row.next_move_window),
    intelligenceBlindSpot: asString(row.intelligence_blind_spot),
    ifProtagonistDoesNothing: asString(row.if_protagonist_does_nothing),
    status: normalizeStatus(row.status),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function normalizeRecord(input: AntagonistAgendaMutationInput, existing?: AntagonistAgendaRecord | null): AntagonistAgendaRecord {
  const currentTime = nowIsoString();

  return {
    id: existing?.id ?? randomUUID(),
    projectId: normalizeText(input.projectId, existing?.projectId ?? ''),
    characterEntityId:
      typeof input.characterEntityId === 'undefined'
        ? existing?.characterEntityId ?? null
        : asNullableString(input.characterEntityId),
    characterName: normalizeText(input.characterName, existing?.characterName ?? '未命名反派'),
    publicRole: normalizeText(input.publicRole, existing?.publicRole ?? ''),
    hiddenAgenda: normalizeText(input.hiddenAgenda, existing?.hiddenAgenda ?? ''),
    currentObjective: normalizeText(input.currentObjective, existing?.currentObjective ?? ''),
    currentAction: normalizeText(input.currentAction, existing?.currentAction ?? ''),
    triggerToStrike: normalizeText(input.triggerToStrike, existing?.triggerToStrike ?? ''),
    bottomLine: normalizeText(input.bottomLine, existing?.bottomLine ?? ''),
    resourceBase: normalizeText(input.resourceBase, existing?.resourceBase ?? ''),
    nextMoveWindow: normalizeText(input.nextMoveWindow, existing?.nextMoveWindow ?? ''),
    intelligenceBlindSpot: normalizeText(input.intelligenceBlindSpot, existing?.intelligenceBlindSpot ?? ''),
    ifProtagonistDoesNothing: normalizeText(input.ifProtagonistDoesNothing, existing?.ifProtagonistDoesNothing ?? ''),
    status:
      typeof input.status === 'undefined'
        ? existing?.status ?? 'active'
        : normalizeStatus(input.status),
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime,
  };
}

export function listAntagonistAgendas(env: ServerEnv, options: ListAntagonistAgendasOptions) {
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
      character_entity_id,
      character_name,
      public_role,
      hidden_agenda,
      current_objective,
      current_action,
      trigger_to_strike,
      bottom_line,
      resource_base,
      next_move_window,
      intelligence_blind_spot,
      if_protagonist_does_nothing,
      status,
      created_at,
      updated_at
    FROM antagonist_agendas
    WHERE project_id = ?
    ${statusFilter}
    ORDER BY
      CASE status
        WHEN 'active' THEN 0
        WHEN 'dormant' THEN 1
        WHEN 'defeated' THEN 2
        ELSE 3
      END ASC,
      updated_at DESC
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map(mapRow);
}

export function getAntagonistAgenda(env: ServerEnv, projectId: string, agendaId: string) {
  const db = getGenerationDatabase(env);
  const row = db.prepare(`
    SELECT
      id,
      project_id,
      character_entity_id,
      character_name,
      public_role,
      hidden_agenda,
      current_objective,
      current_action,
      trigger_to_strike,
      bottom_line,
      resource_base,
      next_move_window,
      intelligence_blind_spot,
      if_protagonist_does_nothing,
      status,
      created_at,
      updated_at
    FROM antagonist_agendas
    WHERE project_id = ? AND id = ?
    LIMIT 1
  `).get(projectId, agendaId) as Record<string, unknown> | undefined;

  return row ? mapRow(row) : null;
}

export function createAntagonistAgenda(env: ServerEnv, input: AntagonistAgendaMutationInput) {
  const db = getGenerationDatabase(env);
  const record = normalizeRecord(input);
  db.prepare(`
    INSERT INTO antagonist_agendas (
      id,
      project_id,
      character_entity_id,
      character_name,
      public_role,
      hidden_agenda,
      current_objective,
      current_action,
      trigger_to_strike,
      bottom_line,
      resource_base,
      next_move_window,
      intelligence_blind_spot,
      if_protagonist_does_nothing,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.projectId,
    record.characterEntityId,
    record.characterName,
    record.publicRole,
    record.hiddenAgenda,
    record.currentObjective,
    record.currentAction,
    record.triggerToStrike,
    record.bottomLine,
    record.resourceBase,
    record.nextMoveWindow,
    record.intelligenceBlindSpot,
    record.ifProtagonistDoesNothing,
    record.status,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function updateAntagonistAgenda(env: ServerEnv, agendaId: string, input: AntagonistAgendaMutationInput) {
  const existing = getAntagonistAgenda(env, input.projectId, agendaId);

  if (!existing) {
    return null;
  }

  const db = getGenerationDatabase(env);
  const record = normalizeRecord(input, existing);
  db.prepare(`
    UPDATE antagonist_agendas
    SET
      character_entity_id = ?,
      character_name = ?,
      public_role = ?,
      hidden_agenda = ?,
      current_objective = ?,
      current_action = ?,
      trigger_to_strike = ?,
      bottom_line = ?,
      resource_base = ?,
      next_move_window = ?,
      intelligence_blind_spot = ?,
      if_protagonist_does_nothing = ?,
      status = ?,
      updated_at = ?
    WHERE project_id = ? AND id = ?
  `).run(
    record.characterEntityId,
    record.characterName,
    record.publicRole,
    record.hiddenAgenda,
    record.currentObjective,
    record.currentAction,
    record.triggerToStrike,
    record.bottomLine,
    record.resourceBase,
    record.nextMoveWindow,
    record.intelligenceBlindSpot,
    record.ifProtagonistDoesNothing,
    record.status,
    record.updatedAt,
    record.projectId,
    record.id,
  );

  return record;
}

export function deleteAntagonistAgenda(env: ServerEnv, projectId: string, agendaId: string) {
  const db = getGenerationDatabase(env);
  const result = db.prepare('DELETE FROM antagonist_agendas WHERE project_id = ? AND id = ?').run(projectId, agendaId);
  return result.changes > 0;
}
