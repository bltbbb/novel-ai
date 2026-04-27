import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import type { ReviewIssue } from '../types/ai.js';
import { getGenerationDatabase } from './generation-sqlite.js';

export type ResourceContinuityStatus = 'active' | 'recovered' | 'permanent';
export type ResourceContinuityRiskLevel = 'critical' | 'high' | 'medium' | 'low';

interface ResourceContinuityTypeProfile {
  key: string;
  label: string;
  aliases: string[];
  chapterHintTerms: string[];
  constraintPatterns: RegExp[];
  contradictionPatterns: RegExp[];
}

const RESOURCE_CONTINUITY_TYPE_PROFILES: ResourceContinuityTypeProfile[] = [
  {
    key: 'injury',
    label: '伤势',
    aliases: ['伤势', '伤', '重伤', '内伤', '骨折', '断臂', '伤病'],
    chapterHintTerms: ['搏杀', '战斗', '突围', '追杀', '围杀', '逃亡'],
    constraintPatterns: [/重伤|骨折|断臂|内伤|失血|虚弱|不能久战|无法动武/u],
    contradictionPatterns: [/毫发无伤|恢复如初|若无其事|健步如飞|全力冲杀|再次硬撼/u],
  },
  {
    key: 'lifespan',
    label: '寿命',
    aliases: ['寿命', '寿元', '命火', '折寿'],
    chapterHintTerms: ['燃寿', '禁术', '献祭', '续命'],
    constraintPatterns: [/寿元|燃寿|折寿|命火|仅剩|不可再耗/u],
    contradictionPatterns: [/再次燃寿|寿元充沛|恢复巅峰|毫无损耗/u],
  },
  {
    key: 'authority',
    label: '权限',
    aliases: ['权限', '职权', '令牌', '调令', '兵符'],
    chapterHintTerms: ['调阅', '开库', '放行', '调兵', '入档', '内库'],
    constraintPatterns: [/无权|停职|封禁|禁足|收回令牌|不得调阅|不得入内/u],
    contradictionPatterns: [/直接调阅|径直开库|一路放行|调兵如臂|擅入内库/u],
  },
  {
    key: 'credit',
    label: '信用',
    aliases: ['信用', '名声', '声望', '信誉'],
    chapterHintTerms: ['采信', '作保', '担保', '借贷', '号召'],
    constraintPatterns: [/失信|污名|不信|名声扫地|无人采信|黑名单/u],
    contradictionPatterns: [/众人尽信|一呼百应|无人怀疑|官府立刻采信|顺利借到/u],
  },
  {
    key: 'favor',
    label: '人情',
    aliases: ['人情', '交情', '关系', '门路'],
    chapterHintTerms: ['求援', '托情', '借势', '请动', '走门路'],
    constraintPatterns: [/人情用尽|翻脸|不再相欠|关系破裂|交情耗尽|态度转冷/u],
    contradictionPatterns: [/立刻相助|一句话便出手|再次卖他人情|登门就借到/u],
  },
  {
    key: 'evidence',
    label: '证据链',
    aliases: ['证据链', '证据', '证词', '口供', '物证'],
    chapterHintTerms: ['搜证', '翻案', '公堂', '审问', '定罪'],
    constraintPatterns: [/证据不足|证据链断裂|物证缺失|证词翻供|口供不全/u],
    contradictionPatterns: [/铁证如山|当堂定罪|证据齐全|凭现有证据直接坐实/u],
  },
  {
    key: 'backlash',
    label: '法理反噬',
    aliases: ['法理反噬', '反噬', '天谴', '因果反噬', '法理灼烧'],
    chapterHintTerms: ['审判', '天罚', '因果', '反噬'],
    constraintPatterns: [/反噬|天谴|因果缠身|法理灼烧|不可再动用/u],
    contradictionPatterns: [/再次强行催动|毫无代价|全力再开|若无其事地再用/u],
  },
  {
    key: 'supply',
    label: '物资',
    aliases: ['物资', '钱粮', '军资', '补给', '药材'],
    chapterHintTerms: ['断供', '补给', '缺粮', '缺药', '军资'],
    constraintPatterns: [/断供|见底|耗尽|缺粮|缺药|短缺/u],
    contradictionPatterns: [/随手掏出|补给充足|粮草无缺|药材充沛/u],
  },
];

const GENERIC_CRITICAL_RISK_PATTERN = /(永久|不可逆|断裂|封禁|停职|黑名单|证据链断裂|仅剩|寿元|重伤|骨折|失去|断供|耗尽|反噬|通缉)/u;
const GENERIC_HIGH_RISK_PATTERN = /(无法|不能|不可|受限|虚弱|失信|不信|翻脸|短缺|缺失|见底|枯竭|暴露|追缉)/u;
const GENERIC_CONTRADICTION_PATTERN = /(毫发无伤|恢复如初|若无其事|再次(?:催动|施展|启动)|全力展开|毫不费力|健步如飞|当堂采信|众人尽信|一路放行|直接调阅|径直开库|铁证如山|一呼百应|立刻相助)/u;

export interface ResourceContinuityRecord {
  id: string;
  projectId: string;
  resourceType: string;
  ownerCharacterId: string | null;
  ownerCharacterName: string;
  currentState: string;
  performanceImpact: string;
  lastConsumedAt: string;
  recoveryCondition: string;
  hiddenCost: string;
  continuityRisk: string;
  status: ResourceContinuityStatus;
  riskLevel: ResourceContinuityRiskLevel;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceContinuityMutationInput {
  projectId: string;
  resourceType?: string;
  ownerCharacterId?: string | null;
  ownerCharacterName?: string;
  currentState?: string;
  performanceImpact?: string;
  lastConsumedAt?: string;
  recoveryCondition?: string;
  hiddenCost?: string;
  continuityRisk?: string;
  status?: ResourceContinuityStatus;
  riskLevel?: ResourceContinuityRiskLevel;
}

export interface ListResourceContinuitiesOptions {
  projectId: string;
  status?: ResourceContinuityStatus;
  ownerCharacterId?: string;
  resourceType?: string;
  riskLevel?: ResourceContinuityRiskLevel;
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

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function normalizeStatus(value: unknown): ResourceContinuityStatus {
  return value === 'recovered' || value === 'permanent' ? value : 'active';
}

function createUniqueList(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function includesAnyNormalizedText(source: string, terms: string[]) {
  const normalizedSource = normalizeComparableText(source);

  if (!normalizedSource) {
    return false;
  }

  return terms.some((term) => {
    const normalizedTerm = normalizeComparableText(term);
    return normalizedTerm ? normalizedSource.includes(normalizedTerm) : false;
  });
}

function buildConstraintText(input: {
  currentState: string;
  performanceImpact: string;
  hiddenCost: string;
  continuityRisk: string;
}) {
  return [input.currentState, input.performanceImpact, input.hiddenCost, input.continuityRisk]
    .join(' ')
    .trim();
}

function findResourceContinuityTypeProfile(resourceType: string) {
  const normalizedType = normalizeComparableText(resourceType);

  return (
    RESOURCE_CONTINUITY_TYPE_PROFILES.find((profile) => {
      const candidates = [profile.label, ...profile.aliases];
      return candidates.some((candidate) => normalizedType.includes(normalizeComparableText(candidate)));
    }) ?? null
  );
}

export function getResourceContinuityHintTerms(resourceType: string) {
  const profile = findResourceContinuityTypeProfile(resourceType);

  return createUniqueList(
    profile
      ? [resourceType, profile.label, ...profile.aliases, ...profile.chapterHintTerms]
      : [resourceType],
  );
}

export function isResourceContinuityRiskLevel(value: unknown): value is ResourceContinuityRiskLevel {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low';
}

export function inferResourceContinuityRiskLevel(input: {
  resourceType: string;
  currentState: string;
  performanceImpact: string;
  hiddenCost: string;
  continuityRisk: string;
  status: ResourceContinuityStatus;
}): ResourceContinuityRiskLevel {
  const profile = findResourceContinuityTypeProfile(input.resourceType);
  const constraintText = buildConstraintText(input);
  let score = 0;

  if (input.status === 'permanent') {
    score += 4;
  } else if (input.status === 'active') {
    score += 2;
  }

  if (profile && profile.key !== 'injury' && profile.key !== 'supply') {
    score += 1;
  }

  if (profile?.constraintPatterns.some((pattern) => pattern.test(constraintText))) {
    score += 2;
  }

  if (GENERIC_CRITICAL_RISK_PATTERN.test(constraintText)) {
    score += 3;
  } else if (GENERIC_HIGH_RISK_PATTERN.test(constraintText)) {
    score += 2;
  }

  if (input.hiddenCost.trim()) {
    score += 1;
  }

  if (input.continuityRisk.trim()) {
    score += 1;
  }

  if (score >= 7) {
    return 'critical';
  }
  if (score >= 5) {
    return 'high';
  }
  if (score >= 2) {
    return 'medium';
  }
  return 'low';
}

function matchesResourceTypeFilter(record: ResourceContinuityRecord, resourceType?: string) {
  if (!resourceType) {
    return true;
  }

  const normalizedFilter = normalizeComparableText(resourceType);
  const recordProfile = findResourceContinuityTypeProfile(record.resourceType);
  const filterProfile = findResourceContinuityTypeProfile(resourceType);

  if (recordProfile && filterProfile) {
    return recordProfile.key === filterProfile.key;
  }

  return normalizeComparableText(record.resourceType) === normalizedFilter;
}

function sortResourceContinuityRecords(left: ResourceContinuityRecord, right: ResourceContinuityRecord) {
  const statusPriority: Record<ResourceContinuityStatus, number> = {
    active: 0,
    permanent: 1,
    recovered: 2,
  };
  const riskPriority: Record<ResourceContinuityRiskLevel, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  if (statusPriority[left.status] !== statusPriority[right.status]) {
    return statusPriority[left.status] - statusPriority[right.status];
  }

  if (riskPriority[left.riskLevel] !== riskPriority[right.riskLevel]) {
    return riskPriority[left.riskLevel] - riskPriority[right.riskLevel];
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function mapRow(row: Record<string, unknown>): ResourceContinuityRecord {
  const status = normalizeStatus(row.status);
  const resourceType = asString(row.resource_type);
  const currentState = asString(row.current_state);
  const performanceImpact = asString(row.performance_impact);
  const hiddenCost = asString(row.hidden_cost);
  const continuityRisk = asString(row.continuity_risk);
  const inferredRiskLevel = inferResourceContinuityRiskLevel({
    resourceType,
    currentState,
    performanceImpact,
    hiddenCost,
    continuityRisk,
    status,
  });
  const riskLevel = isResourceContinuityRiskLevel(row.risk_level) ? row.risk_level : inferredRiskLevel;

  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    resourceType,
    ownerCharacterId: asNullableString(row.owner_character_id),
    ownerCharacterName: asString(row.owner_character_name),
    currentState,
    performanceImpact,
    lastConsumedAt: asString(row.last_consumed_at),
    recoveryCondition: asString(row.recovery_condition),
    hiddenCost,
    continuityRisk,
    status,
    riskLevel,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function normalizeRecord(
  input: ResourceContinuityMutationInput,
  existing?: ResourceContinuityRecord | null,
): ResourceContinuityRecord {
  const currentTime = nowIsoString();
  const resourceType = normalizeText(input.resourceType, existing?.resourceType ?? '伤势');
  const currentState = normalizeText(input.currentState, existing?.currentState ?? '');
  const performanceImpact = normalizeText(input.performanceImpact, existing?.performanceImpact ?? '');
  const hiddenCost = normalizeText(input.hiddenCost, existing?.hiddenCost ?? '');
  const continuityRisk = normalizeText(input.continuityRisk, existing?.continuityRisk ?? '');
  const status =
    typeof input.status === 'undefined'
      ? existing?.status ?? 'active'
      : normalizeStatus(input.status);
  const inferredRiskLevel = inferResourceContinuityRiskLevel({
    resourceType,
    currentState,
    performanceImpact,
    hiddenCost,
    continuityRisk,
    status,
  });
  const riskLevel = isResourceContinuityRiskLevel(input.riskLevel) ? input.riskLevel : inferredRiskLevel;

  return {
    id: existing?.id ?? randomUUID(),
    projectId: normalizeText(input.projectId, existing?.projectId ?? ''),
    resourceType,
    ownerCharacterId:
      typeof input.ownerCharacterId === 'undefined'
        ? existing?.ownerCharacterId ?? null
        : asNullableString(input.ownerCharacterId),
    ownerCharacterName: normalizeText(input.ownerCharacterName, existing?.ownerCharacterName ?? ''),
    currentState,
    performanceImpact,
    lastConsumedAt: normalizeText(input.lastConsumedAt, existing?.lastConsumedAt ?? ''),
    recoveryCondition: normalizeText(input.recoveryCondition, existing?.recoveryCondition ?? ''),
    hiddenCost,
    continuityRisk,
    status,
    riskLevel,
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime,
  };
}

export function listResourceContinuities(env: ServerEnv, options: ListResourceContinuitiesOptions) {
  const db = getGenerationDatabase(env);
  const params: Array<string> = [options.projectId];
  const statusFilter = options.status ? 'AND status = ?' : '';
  const ownerFilter = options.ownerCharacterId ? 'AND owner_character_id = ?' : '';

  if (options.status) {
    params.push(options.status);
  }
  if (options.ownerCharacterId) {
    params.push(options.ownerCharacterId);
  }

  const rows = db.prepare(`
    SELECT
      id,
      project_id,
      resource_type,
      owner_character_id,
      owner_character_name,
      current_state,
      performance_impact,
      last_consumed_at,
      recovery_condition,
      hidden_cost,
      continuity_risk,
      status,
      risk_level,
      created_at,
      updated_at
    FROM resource_continuities
    WHERE project_id = ?
    ${statusFilter}
    ${ownerFilter}
    ORDER BY updated_at DESC
  `).all(...params) as Array<Record<string, unknown>>;

  return rows
    .map(mapRow)
    .filter((row) => matchesResourceTypeFilter(row, options.resourceType))
    .filter((row) => (options.riskLevel ? row.riskLevel === options.riskLevel : true))
    .sort(sortResourceContinuityRecords);
}

export function getResourceContinuity(env: ServerEnv, projectId: string, resourceContinuityId: string) {
  const db = getGenerationDatabase(env);
  const row = db.prepare(`
    SELECT
      id,
      project_id,
      resource_type,
      owner_character_id,
      owner_character_name,
      current_state,
      performance_impact,
      last_consumed_at,
      recovery_condition,
      hidden_cost,
      continuity_risk,
      status,
      risk_level,
      created_at,
      updated_at
    FROM resource_continuities
    WHERE project_id = ? AND id = ?
    LIMIT 1
  `).get(projectId, resourceContinuityId) as Record<string, unknown> | undefined;

  return row ? mapRow(row) : null;
}

export function createResourceContinuity(env: ServerEnv, input: ResourceContinuityMutationInput) {
  const db = getGenerationDatabase(env);
  const record = normalizeRecord(input);
  db.prepare(`
    INSERT INTO resource_continuities (
      id,
      project_id,
      resource_type,
      owner_character_id,
      owner_character_name,
      current_state,
      performance_impact,
      last_consumed_at,
      recovery_condition,
      hidden_cost,
      continuity_risk,
      status,
      risk_level,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.projectId,
    record.resourceType,
    record.ownerCharacterId,
    record.ownerCharacterName,
    record.currentState,
    record.performanceImpact,
    record.lastConsumedAt,
    record.recoveryCondition,
    record.hiddenCost,
    record.continuityRisk,
    record.status,
    record.riskLevel,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export function updateResourceContinuity(env: ServerEnv, resourceContinuityId: string, input: ResourceContinuityMutationInput) {
  const existing = getResourceContinuity(env, input.projectId, resourceContinuityId);
  if (!existing) {
    return null;
  }
  const db = getGenerationDatabase(env);
  const record = normalizeRecord(input, existing);
  db.prepare(`
    UPDATE resource_continuities
    SET
      resource_type = ?,
      owner_character_id = ?,
      owner_character_name = ?,
      current_state = ?,
      performance_impact = ?,
      last_consumed_at = ?,
      recovery_condition = ?,
      hidden_cost = ?,
      continuity_risk = ?,
      status = ?,
      risk_level = ?,
      updated_at = ?
    WHERE project_id = ? AND id = ?
  `).run(
    record.resourceType,
    record.ownerCharacterId,
    record.ownerCharacterName,
    record.currentState,
    record.performanceImpact,
    record.lastConsumedAt,
    record.recoveryCondition,
    record.hiddenCost,
    record.continuityRisk,
    record.status,
    record.riskLevel,
    record.updatedAt,
    record.projectId,
    record.id,
  );

  return record;
}

export function deleteResourceContinuity(env: ServerEnv, projectId: string, resourceContinuityId: string) {
  const db = getGenerationDatabase(env);
  const result = db.prepare('DELETE FROM resource_continuities WHERE project_id = ? AND id = ?').run(projectId, resourceContinuityId);
  return result.changes > 0;
}

export function detectStructuredResourceContinuityIssue(input: {
  content: string;
  rows: ResourceContinuityRecord[];
}): ReviewIssue | null {
  for (const row of input.rows) {
    if (row.status !== 'active' && row.status !== 'permanent') {
      continue;
    }

    const ownerName = row.ownerCharacterName.trim();
    const profile = findResourceContinuityTypeProfile(row.resourceType);
    const contentFocusTerms = createUniqueList([ownerName, ...getResourceContinuityHintTerms(row.resourceType)]);

    if (!includesAnyNormalizedText(input.content, contentFocusTerms)) {
      continue;
    }

    const constraintText = buildConstraintText(row);
    const hasConstraintSignal =
      GENERIC_CRITICAL_RISK_PATTERN.test(constraintText) ||
      GENERIC_HIGH_RISK_PATTERN.test(constraintText) ||
      !!profile?.constraintPatterns.some((pattern) => pattern.test(constraintText));

    if (!constraintText || !hasConstraintSignal) {
      continue;
    }

    const hasContradictionSignal =
      GENERIC_CONTRADICTION_PATTERN.test(input.content) ||
      !!profile?.contradictionPatterns.some((pattern) => pattern.test(input.content));

    if (!hasContradictionSignal) {
      continue;
    }

    return {
      severity: 'high',
      title: `资源连续性冲突：${ownerName || '关键约束'} / ${row.resourceType}`,
      description: '结构化资源约束显示该资源仍带着显著限制，但正文表现像这些限制已经消失，疑似跨章代价断档。',
      suggestion: '若限制已经解除，需要补写恢复、补证、再授权或关系修复过程；若限制仍有效，应把动作表现压回受限状态。',
      evidence: `结构化约束：${constraintText}`,
    };
  }

  return null;
}
