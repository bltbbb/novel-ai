import { createHash } from 'node:crypto';
import type { ServerEnv } from '../config/env.js';
import { listAntagonistAgendas } from './antagonist-agenda-store.js';
import { listGenerationForeshadows } from './generation-foreshadow-store.js';
import { getGenerationDatabase } from './generation-sqlite.js';
import { listGenerationVolumeRecaps } from './generation-volume-recap-store.js';
import {
  createQuestionPool,
  listQuestionPools,
} from './question-pool-store.js';
import {
  createResourceContinuity,
  detectStructuredResourceContinuityIssue,
  listResourceContinuities,
} from './structured-resource-continuity-store.js';
import {
  createThreadLedger,
  createWorldStateEntry,
  listThreadLedgers,
  listWorldStateEntries,
} from './structure-memory-store.js';

type StructureMemorySystemKey =
  | 'thread_ledger'
  | 'foreshadow_plan'
  | 'world_state_entry'
  | 'question_pool'
  | 'antagonist_agenda'
  | 'pov_permission'
  | 'resource_continuity';

type StructureMemoryBackfillSystem =
  | 'thread_ledger'
  | 'question_pool'
  | 'world_state_entry'
  | 'resource_continuity';

type StructureMemoryGuardTrigger =
  | 'project_scan'
  | 'chapter_completed'
  | 'volume_completed'
  | 'structure_memory_updated';

type StructureMemoryGuardAlertSeverity = 'high' | 'medium' | 'low';

interface StructureMemoryBackfillEvidence {
  sourceType: 'volume_recap' | 'chapter_summary' | 'state_change' | 'foreshadow' | 'generated_text';
  sourceLabel: string;
  excerpt: string;
}

interface StructureMemoryBackfillCandidate {
  candidateId: string;
  system: StructureMemoryBackfillSystem;
  status: 'new' | 'existing';
  title: string;
  scopeLabel: string;
  summary: string;
  evidence: StructureMemoryBackfillEvidence[];
}

interface StructureMemoryBackfillSystemCount {
  system: StructureMemoryBackfillSystem;
  total: number;
  newCount: number;
  existingCount: number;
}

export interface StructureMemoryBackfillPreviewResult {
  projectId: string;
  generatedAt: string;
  totalCandidates: number;
  newCandidates: number;
  existingCandidates: number;
  counts: StructureMemoryBackfillSystemCount[];
  candidates: StructureMemoryBackfillCandidate[];
}

export interface StructureMemoryBackfillApplyResult {
  projectId: string;
  generatedAt: string;
  requestedCandidateCount: number;
  createdCount: number;
  skippedExistingCount: number;
  counts: Array<{
    system: StructureMemoryBackfillSystem;
    requestedCount: number;
    createdCount: number;
    skippedExistingCount: number;
  }>;
  createdRecordIds: string[];
}

export interface StructureMemoryGuardAlert {
  id: string;
  ruleKey: string;
  trigger: StructureMemoryGuardTrigger;
  severity: StructureMemoryGuardAlertSeverity;
  title: string;
  message: string;
  evidence: string;
  targetSystem: StructureMemorySystemKey;
  targetRecordId: string | null;
}

export interface StructureMemoryGuardAlertResult {
  projectId: string;
  scannedAt: string;
  trigger: StructureMemoryGuardTrigger;
  items: StructureMemoryGuardAlert[];
}

interface PreviewBackfillRequest {
  projectId: string;
  systems?: string[];
}

interface ApplyBackfillRequest extends PreviewBackfillRequest {
  candidateIds?: string[];
}

interface GuardAlertRequest {
  projectId: string;
  trigger?: string;
  chapterId?: string;
  volumeTitle?: string;
}

interface RuntimeChapterRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  summaryExcerpt: string;
  summary: string;
  hook: string;
  foreshadowings: string[];
  updatedAt: string;
}

interface RuntimeVolumeMeta {
  volumeTitle: string;
  volumeOrder: number;
  startChapterId: string;
  startChapterOrder: number;
  endChapterId: string;
  endChapterOrder: number;
}

interface RuntimeStateChangeRow {
  id: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
  updatedAt: string;
}

interface BackfillDraft {
  preview: StructureMemoryBackfillCandidate;
  payload:
    | Parameters<typeof createThreadLedger>[1]
    | Parameters<typeof createQuestionPool>[1]
    | Parameters<typeof createWorldStateEntry>[1]
    | Parameters<typeof createResourceContinuity>[1];
}

interface ResourceTypeProfile {
  label: string;
  aliases: string[];
  permanentPatterns: RegExp[];
  hiddenCostPatterns: RegExp[];
}

const BACKFILL_SYSTEM_ORDER: StructureMemoryBackfillSystem[] = [
  'thread_ledger',
  'question_pool',
  'world_state_entry',
  'resource_continuity',
];

const GUARD_SEVERITY_PRIORITY: Record<StructureMemoryGuardAlertSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const RESOURCE_TYPE_PROFILES: ResourceTypeProfile[] = [
  {
    label: '伤势',
    aliases: ['伤势', '重伤', '骨折', '内伤', '断臂', '失血', '虚弱'],
    permanentPatterns: [/不可逆|断臂|残缺|终身/u],
    hiddenCostPatterns: [/反噬|代价|透支|伤及根基/u],
  },
  {
    label: '寿命',
    aliases: ['寿命', '寿元', '折寿', '命火'],
    permanentPatterns: [/仅剩|大损|不可逆/u],
    hiddenCostPatterns: [/折寿|寿元|命火/u],
  },
  {
    label: '权限',
    aliases: ['权限', '职权', '令牌', '兵符', '调令', '停职', '封禁'],
    permanentPatterns: [/撤职|封禁|收回/u],
    hiddenCostPatterns: [/越权|追责|清算/u],
  },
  {
    label: '信用',
    aliases: ['信用', '信誉', '名声', '声望', '失信'],
    permanentPatterns: [/黑名单|名声扫地/u],
    hiddenCostPatterns: [/污名|不信|质疑/u],
  },
  {
    label: '人情',
    aliases: ['人情', '交情', '关系', '门路', '欠情'],
    permanentPatterns: [/翻脸|决裂|破裂/u],
    hiddenCostPatterns: [/耗尽|不再相欠|态度转冷/u],
  },
  {
    label: '证据链',
    aliases: ['证据', '证据链', '证词', '物证', '口供'],
    permanentPatterns: [/断裂|毁损|灭失/u],
    hiddenCostPatterns: [/证据不足|翻供|缺失/u],
  },
  {
    label: '法理反噬',
    aliases: ['反噬', '法理', '天谴', '因果'],
    permanentPatterns: [/不可再动用|不可逆/u],
    hiddenCostPatterns: [/反噬|灼烧|因果/u],
  },
  {
    label: '物资',
    aliases: ['物资', '钱粮', '补给', '药材', '军资'],
    permanentPatterns: [/断供|耗尽/u],
    hiddenCostPatterns: [/短缺|见底|缺粮|缺药/u],
  },
];

function nowIsoString() {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function truncateText(value: string, maxLength: number) {
  const normalized = normalizeText(value);

  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function parseStringArrayJson(rawText: string | null | undefined) {
  if (!rawText) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').map((item) => normalizeText(item)).filter(Boolean)
      : [];
  } catch {
    return [] as string[];
  }
}

function createUniqueList(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);

    if (!normalized) {
      continue;
    }

    const key = normalizeKey(normalized);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(normalized);
  }

  return items;
}

function buildStableId(prefix: string, rawKey: string) {
  const digest = createHash('sha1').update(`${prefix}\u0000${rawKey}`).digest('hex').slice(0, 20);
  return `${prefix}:${digest}`;
}

function containsAnyKeyword(text: string, keywords: string[]) {
  const normalized = normalizeKey(text);
  return keywords.some((keyword) => normalized.includes(normalizeKey(keyword)));
}

function countMatchedTerms(text: string, terms: string[]) {
  const normalized = normalizeKey(text);

  if (!normalized) {
    return 0;
  }

  return terms.reduce((count, term) => {
    const normalizedTerm = normalizeKey(term);

    if (!normalizedTerm || normalizedTerm.length < 2) {
      return count;
    }

    return normalized.includes(normalizedTerm) ? count + 1 : count;
  }, 0);
}

function normalizeGuardTrigger(value: string | undefined): StructureMemoryGuardTrigger {
  return value === 'chapter_completed' ||
    value === 'volume_completed' ||
    value === 'structure_memory_updated'
    ? value
    : 'project_scan';
}

function normalizeBackfillSystems(systems: string[] | undefined) {
  if (!Array.isArray(systems) || systems.length === 0) {
    return BACKFILL_SYSTEM_ORDER;
  }

  const normalized = createUniqueList(systems).filter(
    (item): item is StructureMemoryBackfillSystem =>
      item === 'thread_ledger' ||
      item === 'question_pool' ||
      item === 'world_state_entry' ||
      item === 'resource_continuity',
  );

  return normalized.length > 0 ? normalized : BACKFILL_SYSTEM_ORDER;
}

function mapCounts(candidates: StructureMemoryBackfillCandidate[]) {
  return BACKFILL_SYSTEM_ORDER.map((system) => {
    const systemCandidates = candidates.filter((item) => item.system === system);
    return {
      system,
      total: systemCandidates.length,
      newCount: systemCandidates.filter((item) => item.status === 'new').length,
      existingCount: systemCandidates.filter((item) => item.status === 'existing').length,
    };
  });
}

function loadRuntimeChapters(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db.prepare(`
    SELECT
      idx.chapter_id,
      idx.chapter_title,
      idx.chapter_order,
      idx.volume_title,
      idx.summary_excerpt,
      idx.updated_at,
      COALESCE(sums.summary, '') AS summary,
      COALESCE(sums.hook, '') AS hook,
      COALESCE(sums.foreshadowings_json, '[]') AS foreshadowings_json
    FROM generation_chapter_index idx
    LEFT JOIN generation_chapter_summaries sums
      ON sums.project_id = idx.project_id AND sums.chapter_id = idx.chapter_id
    WHERE idx.project_id = ?
    ORDER BY idx.chapter_order ASC, idx.updated_at ASC
  `).all(projectId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): RuntimeChapterRow => ({
      chapterId: asString(row.chapter_id),
      chapterTitle: asString(row.chapter_title),
      chapterOrder: Number(row.chapter_order ?? 0),
      volumeTitle: normalizeText(asString(row.volume_title)),
      summaryExcerpt: normalizeText(asString(row.summary_excerpt)),
      summary: normalizeText(asString(row.summary)),
      hook: normalizeText(asString(row.hook)),
      foreshadowings: parseStringArrayJson(asString(row.foreshadowings_json)),
      updatedAt: asString(row.updated_at),
    }),
  );
}

function loadRuntimeStateChanges(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db.prepare(`
    SELECT
      sc.id,
      sc.chapter_id,
      sc.chapter_title,
      sc.entity_name,
      sc.field,
      sc.old_value,
      sc.new_value,
      sc.updated_at,
      COALESCE(idx.chapter_order, 0) AS chapter_order,
      COALESCE(idx.volume_title, '') AS volume_title
    FROM generation_state_changes sc
    LEFT JOIN generation_chapter_index idx
      ON idx.project_id = sc.project_id AND idx.chapter_id = sc.chapter_id
    WHERE sc.project_id = ?
    ORDER BY chapter_order ASC, sc.updated_at ASC
  `).all(projectId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): RuntimeStateChangeRow => ({
      id: asString(row.id),
      chapterId: asString(row.chapter_id),
      chapterTitle: asString(row.chapter_title),
      chapterOrder: Number(row.chapter_order ?? 0),
      volumeTitle: normalizeText(asString(row.volume_title)),
      entityName: normalizeText(asString(row.entity_name)),
      field: normalizeText(asString(row.field)),
      oldValue: normalizeText(asString(row.old_value)),
      newValue: normalizeText(asString(row.new_value)),
      updatedAt: asString(row.updated_at),
    }),
  );
}

function loadLatestGeneratedText(env: ServerEnv, projectId: string, chapterId: string) {
  const db = getGenerationDatabase(env);
  const row = db.prepare(`
    SELECT generated_text
    FROM generation_jobs
    WHERE project_id = ? AND chapter_id = ? AND generated_text <> ''
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(projectId, chapterId) as Record<string, unknown> | undefined;

  return normalizeText(asString(row?.generated_text));
}

function resolveVolumeMetas(chapters: RuntimeChapterRow[]) {
  const grouped = new Map<string, RuntimeChapterRow[]>();

  for (const chapter of chapters) {
    if (!chapter.volumeTitle) {
      continue;
    }

    const items = grouped.get(chapter.volumeTitle) ?? [];
    items.push(chapter);
    grouped.set(chapter.volumeTitle, items);
  }

  return Array.from(grouped.entries())
    .map(([volumeTitle, items]) => {
      const ordered = [...items].sort((left, right) => left.chapterOrder - right.chapterOrder);
      const first = ordered[0];
      const last = ordered[ordered.length - 1];

      return {
        volumeTitle,
        volumeOrder: 0,
        startChapterId: first?.chapterId ?? '',
        startChapterOrder: first?.chapterOrder ?? 0,
        endChapterId: last?.chapterId ?? '',
        endChapterOrder: last?.chapterOrder ?? 0,
      } satisfies RuntimeVolumeMeta;
    })
    .sort((left, right) => left.startChapterOrder - right.startChapterOrder)
    .map((item, index) => ({
      ...item,
      volumeOrder: index + 1,
    }));
}

function buildVolumeId(volumeTitle: string, volumeOrder: number) {
  return buildStableId(`generated-volume-${volumeOrder}`, volumeTitle);
}

function buildStateChangeNarrative(change: RuntimeStateChangeRow) {
  const beforeAfter = change.oldValue && change.newValue
    ? `${change.oldValue} -> ${change.newValue}`
    : change.newValue || change.oldValue;

  return truncateText(
    [change.entityName, change.field, beforeAfter].filter(Boolean).join(' · '),
    96,
  );
}

function resolveWorldStateNeedCategories(text: string) {
  const categories = new Set<'public' | 'institution' | 'rule' | 'power' | 'risk'>();

  if (containsAnyKeyword(text, ['公开', '曝光', '传开', '昭告', '通告', '传言', '流言', '揭露'])) {
    categories.add('public');
  }

  if (containsAnyKeyword(text, ['衙门', '官署', '司', '院', '诏令', '撤职', '任命', '朝廷', '制度', '规制', '门规'])) {
    categories.add('institution');
  }

  if (containsAnyKeyword(text, ['规则', '法则', '律令', '禁令', '附则', '条款', '法理', '审判'])) {
    categories.add('rule');
  }

  if (containsAnyKeyword(text, ['势力', '宗门', '派系', '兵权', '权柄', '镇守', '家族', '格局'])) {
    categories.add('power');
  }

  if (containsAnyKeyword(text, ['风险', '后患', '反噬', '追查', '追缉', '通缉', '隐患', '代价'])) {
    categories.add('risk');
  }

  return categories;
}

function resolveAgendaWorldStateCategories(text: string) {
  const categories = new Set<'public' | 'institution' | 'rule' | 'power' | 'risk'>();

  if (containsAnyKeyword(text, ['公开', '曝光', '传言', '舆论', '昭告', '揭露'])) {
    categories.add('public');
  }

  if (containsAnyKeyword(text, ['官署', '朝廷', '司', '院', '任命', '撤职', '制度', '规制'])) {
    categories.add('institution');
  }

  if (containsAnyKeyword(text, ['规则', '禁令', '律令', '附则', '法理', '审判'])) {
    categories.add('rule');
  }

  if (containsAnyKeyword(text, ['势力', '宗门', '派系', '权柄', '兵权', '镇守', '家族'])) {
    categories.add('power');
  }

  if (containsAnyKeyword(text, ['风险', '后患', '追查', '追缉', '通缉', '反噬', '隐患'])) {
    categories.add('risk');
  }

  return categories;
}

function detectResourceType(text: string) {
  const normalized = normalizeKey(text);

  for (const profile of RESOURCE_TYPE_PROFILES) {
    if (profile.aliases.some((alias) => normalized.includes(normalizeKey(alias)))) {
      return profile;
    }
  }

  return null;
}

function inferResourceStatus(text: string, profile: ResourceTypeProfile) {
  if (profile.permanentPatterns.some((pattern) => pattern.test(text))) {
    return 'permanent' as const;
  }

  return 'active' as const;
}

function inferResourceHiddenCost(text: string, profile: ResourceTypeProfile) {
  if (!profile.hiddenCostPatterns.some((pattern) => pattern.test(text))) {
    return '';
  }

  return truncateText(text, 120);
}

function buildBackfillDrafts(env: ServerEnv, request: PreviewBackfillRequest) {
  const projectId = normalizeText(request.projectId);
  const enabledSystems = new Set(normalizeBackfillSystems(request.systems));
  const chapters = loadRuntimeChapters(env, projectId);
  const volumeMetas = resolveVolumeMetas(chapters);
  const volumeMetaMap = new Map(volumeMetas.map((item) => [item.volumeTitle, item] as const));
  const chapterMap = new Map(chapters.map((item) => [item.chapterId, item] as const));
  const volumeRecaps = listGenerationVolumeRecaps(env, projectId);
  const volumeRecapMap = new Map(volumeRecaps.map((item) => [normalizeKey(item.volumeTitle), item] as const));
  const stateChanges = loadRuntimeStateChanges(env, projectId);
  const foreshadows = listGenerationForeshadows(env, projectId);
  const stateChangesByVolume = new Map<string, RuntimeStateChangeRow[]>();

  for (const change of stateChanges) {
    const items = stateChangesByVolume.get(change.volumeTitle) ?? [];
    items.push(change);
    stateChangesByVolume.set(change.volumeTitle, items);
  }

  const existingThreadKeys = new Set(listThreadLedgers(env, { projectId }).map((item) => normalizeKey(item.name)));
  const existingQuestionKeys = new Set(listQuestionPools(env, { projectId }).map((item) => normalizeKey(item.question)));
  const existingWorldStateKeys = new Set(
    listWorldStateEntries(env, { projectId })
      .filter((item) => item.milestoneIndex === null)
      .map((item) => normalizeKey(item.volumeTitle)),
  );
  const existingResourceKeys = new Set(
    listResourceContinuities(env, { projectId }).map((item) => {
      const profile = detectResourceType(item.resourceType);
      const typeLabel = profile?.label ?? item.resourceType;
      return `${normalizeKey(item.ownerCharacterName)}::${normalizeKey(typeLabel)}`;
    }),
  );

  const drafts: BackfillDraft[] = [];
  const latestVolumeOrder = volumeMetas[volumeMetas.length - 1]?.volumeOrder ?? 0;

  if (enabledSystems.has('thread_ledger')) {
    for (const volume of volumeMetas) {
      const recap = volumeRecapMap.get(normalizeKey(volume.volumeTitle));
      const volumeChanges = stateChangesByVolume.get(volume.volumeTitle) ?? [];
      const relatedForeshadowTitles = createUniqueList(
        foreshadows
          .filter((item) => {
            const sourceVolumeTitle = item.sourceChapterId ? chapterMap.get(item.sourceChapterId)?.volumeTitle ?? '' : '';
            const resolvedVolumeTitle = item.resolvedChapterId ? chapterMap.get(item.resolvedChapterId)?.volumeTitle ?? '' : '';
            return sourceVolumeTitle === volume.volumeTitle || resolvedVolumeTitle === volume.volumeTitle;
          })
          .map((item) => item.title),
      ).slice(0, 3);
      const relatedCharacterNames = createUniqueList(volumeChanges.map((item) => item.entityName)).slice(0, 4);
      const latestChapter = chapterMap.get(volume.endChapterId) ?? null;
      const phaseSummary = truncateText(
        recap?.summary ||
          createUniqueList([
            latestChapter?.summary,
            latestChapter?.summaryExcerpt,
            ...volumeChanges.slice(-2).map((item) => buildStateChangeNarrative(item)),
          ]).join('；'),
        180,
      );

      if (!phaseSummary) {
        continue;
      }

      const name = `${volume.volumeTitle}阶段线`;
      const preview: StructureMemoryBackfillCandidate = {
        candidateId: buildStableId('thread_ledger', name),
        system: 'thread_ledger',
        status: existingThreadKeys.has(normalizeKey(name)) ? 'existing' : 'new',
        title: name,
        scopeLabel: `第${volume.volumeOrder}卷`,
        summary: '根据卷总结和状态变化生成的阶段主线草稿，方便先把旧卷的大结构落到剧情线账本里。',
        evidence: createUniqueList([
          recap?.summary,
          recap?.highlights?.[0],
          volumeChanges[volumeChanges.length - 1] ? buildStateChangeNarrative(volumeChanges[volumeChanges.length - 1]) : '',
        ])
          .slice(0, 3)
          .map((excerpt, index) => ({
            sourceType: index === 1 ? 'state_change' as const : 'volume_recap' as const,
            sourceLabel: index === 0 ? `${volume.volumeTitle} 卷总结` : `${volume.volumeTitle} 结构线索`,
            excerpt,
          })),
      };

      drafts.push({
        preview,
        payload: {
          projectId,
          name,
          type: volume.volumeOrder === latestVolumeOrder ? '主线' : '阶段线',
          coreQuestion: phaseSummary,
          currentPhase: `阶段摘要：${phaseSummary}`,
          lastProgressAt: `第${volume.endChapterOrder}章《${latestChapter?.chapterTitle || volume.volumeTitle}》`,
          lastProgressChapterId: volume.endChapterId || null,
          lastProgressChapterTitle: latestChapter?.chapterTitle ?? '',
          lastProgressChapterOrder: volume.endChapterOrder > 0 ? volume.endChapterOrder : null,
          nextTrigger: truncateText(
            createUniqueList([
              recap?.highlights?.[0],
              latestChapter?.hook,
              relatedForeshadowTitles[0] ? `跟进伏笔：${relatedForeshadowTitles[0]}` : '',
            ]).join('；'),
            120,
          ),
          blockedBy: '',
          relatedCharacterIds: [],
          relatedCharacterNames,
          relatedForeshadowIds: [],
          relatedForeshadowTitles,
          plannedResolveVolume: volume.volumeOrder < latestVolumeOrder ? volume.volumeOrder + 1 : null,
          status: volume.volumeOrder === latestVolumeOrder ? 'active' : 'dormant',
          audienceHeat: volume.volumeOrder === latestVolumeOrder ? 4 : 3,
        },
      });
    }
  }

  if (enabledSystems.has('question_pool')) {
    for (const foreshadow of foreshadows) {
      const sourceChapter = foreshadow.sourceChapterId ? chapterMap.get(foreshadow.sourceChapterId) ?? null : null;
      const resolvedChapter = foreshadow.resolvedChapterId ? chapterMap.get(foreshadow.resolvedChapterId) ?? null : null;
      const sourceVolume = sourceChapter?.volumeTitle ? volumeMetaMap.get(sourceChapter.volumeTitle) ?? null : null;
      const resolvedVolume = resolvedChapter?.volumeTitle ? volumeMetaMap.get(resolvedChapter.volumeTitle) ?? null : null;
      const question = /[？?]$/.test(foreshadow.title) ? foreshadow.title : `${foreshadow.title} 最终会如何兑现？`;
      const status =
        foreshadow.status === 'resolved'
          ? 'answered'
          : foreshadow.status === 'activated' || foreshadow.status === 'overdue'
            ? 'partial'
            : 'open';
      const revealVolumeOrder = resolvedVolume?.volumeOrder ?? sourceVolume?.volumeOrder ?? null;
      const preview: StructureMemoryBackfillCandidate = {
        candidateId: buildStableId('question_pool', `${foreshadow.id}:${question}`),
        system: 'question_pool',
        status: existingQuestionKeys.has(normalizeKey(question)) ? 'existing' : 'new',
        title: question,
        scopeLabel: sourceVolume ? `第${sourceVolume.volumeOrder}卷线索` : '全局问题',
        summary: '根据伏笔记录生成的问题池草稿，先把未解问题、揭晓窗口和已回收线索补出来。',
        evidence: createUniqueList([
          foreshadow.excerpt,
          foreshadow.notes,
          sourceChapter ? `源头：第${sourceChapter.chapterOrder}章《${sourceChapter.chapterTitle}》` : '',
          resolvedChapter ? `回收：第${resolvedChapter.chapterOrder}章《${resolvedChapter.chapterTitle}》` : '',
        ])
          .slice(0, 3)
          .map((excerpt, index) => ({
            sourceType: index === 0 ? 'foreshadow' as const : 'chapter_summary' as const,
            sourceLabel: index === 0 ? foreshadow.title : '伏笔上下文',
            excerpt,
          })),
      };

      drafts.push({
        preview,
        payload: {
          projectId,
          question,
          firstRaisedChapterId: foreshadow.sourceChapterId ?? null,
          firstRaisedAt: sourceChapter ? `第${sourceChapter.chapterOrder}章《${sourceChapter.chapterTitle}》` : '',
          belongsToThreadId: null,
          belongsToThreadName: sourceVolume ? `${sourceVolume.volumeTitle}阶段线` : '',
          currentClue: truncateText(foreshadow.excerpt || foreshadow.notes, 160),
          falseAnswers: [],
          expectedRevealWindow:
            typeof revealVolumeOrder === 'number' && revealVolumeOrder > 0 ? `第 ${revealVolumeOrder} 卷` : '',
          finalAnswerSummary:
            foreshadow.status === 'resolved'
              ? truncateText(
                `已在${resolvedChapter ? `第${resolvedChapter.chapterOrder}章《${resolvedChapter.chapterTitle}》` : '后续章节'}回收：${foreshadow.notes || foreshadow.excerpt || foreshadow.title}`,
                180,
              )
              : '',
          status,
        },
      });
    }
  }

  if (enabledSystems.has('world_state_entry')) {
    for (const volume of volumeMetas) {
      const recap = volumeRecapMap.get(normalizeKey(volume.volumeTitle));
      const volumeChanges = stateChangesByVolume.get(volume.volumeTitle) ?? [];
      const resolvedForeshadows = foreshadows.filter((item) => {
        const resolvedVolumeTitle = item.resolvedChapterId ? chapterMap.get(item.resolvedChapterId)?.volumeTitle ?? '' : '';
        return resolvedVolumeTitle === volume.volumeTitle;
      });
      const publicEvents = createUniqueList([
        ...(recap?.highlights ?? []).slice(0, 2),
        ...volumeChanges
          .filter((item) => containsAnyKeyword([item.field, item.newValue].join(' '), ['公开', '曝光', '昭告', '传言', '揭露']))
          .map((item) => buildStateChangeNarrative(item)),
      ]).slice(0, 3);
      const secretEvents = createUniqueList([
        ...resolvedForeshadows.map((item) => `伏笔回收：${item.title}`),
        ...volumeChanges
          .filter((item) => containsAnyKeyword([item.field, item.newValue].join(' '), ['暗中', '秘密', '幕后', '隐秘']))
          .map((item) => buildStateChangeNarrative(item)),
      ]).slice(0, 3);
      const powerChanges = createUniqueList(
        volumeChanges
          .filter((item) => containsAnyKeyword([item.field, item.oldValue, item.newValue].join(' '), ['势力', '权柄', '兵权', '派系', '格局']))
          .map((item) => buildStateChangeNarrative(item)),
      ).slice(0, 2);
      const institutionChanges = createUniqueList(
        volumeChanges
          .filter((item) => containsAnyKeyword([item.field, item.oldValue, item.newValue].join(' '), ['官署', '职位', '任命', '撤职', '制度', '规制']))
          .map((item) => buildStateChangeNarrative(item)),
      ).slice(0, 2);
      const ruleChanges = createUniqueList(
        volumeChanges
          .filter((item) => containsAnyKeyword([item.field, item.oldValue, item.newValue].join(' '), ['规则', '禁令', '法理', '律令']))
          .map((item) => buildStateChangeNarrative(item)),
      ).slice(0, 2);
      const currentRisks = createUniqueList([
        ...volumeChanges
          .filter((item) => containsAnyKeyword([item.field, item.oldValue, item.newValue].join(' '), ['风险', '后患', '反噬', '追查', '追缉', '通缉']))
          .map((item) => buildStateChangeNarrative(item)),
        ...(recap?.highlights ?? []).slice(-1),
      ]).slice(0, 3);
      const knownByCharacterNames = createUniqueList(volumeChanges.map((item) => item.entityName)).slice(0, 4);
      const rumorState = truncateText(
        createUniqueList([
          recap?.summary,
          chapters.find((item) => item.chapterId === volume.endChapterId)?.hook,
          resolvedForeshadows[0]?.title ? `卷内已有回收：${resolvedForeshadows[0].title}` : '',
        ]).join('；'),
        180,
      );

      if (
        publicEvents.length === 0 &&
        secretEvents.length === 0 &&
        powerChanges.length === 0 &&
        institutionChanges.length === 0 &&
        ruleChanges.length === 0 &&
        currentRisks.length === 0 &&
        !rumorState
      ) {
        continue;
      }

      const preview: StructureMemoryBackfillCandidate = {
        candidateId: buildStableId('world_state_entry', volume.volumeTitle),
        system: 'world_state_entry',
        status: existingWorldStateKeys.has(normalizeKey(volume.volumeTitle)) ? 'existing' : 'new',
        title: `${volume.volumeTitle} · 卷级世界状态`,
        scopeLabel: `第${volume.volumeOrder}卷`,
        summary: '根据卷总结、状态变化和已回收伏笔生成卷级 delta 草稿，适合先补世界状态底稿。',
        evidence: createUniqueList([
          recap?.summary,
          volumeChanges[volumeChanges.length - 1] ? buildStateChangeNarrative(volumeChanges[volumeChanges.length - 1]) : '',
          resolvedForeshadows[0]?.title ? `已回收伏笔：${resolvedForeshadows[0].title}` : '',
        ])
          .slice(0, 3)
          .map((excerpt, index) => ({
            sourceType:
              index === 0
                ? 'volume_recap'
                : index === 1
                  ? 'state_change'
                  : 'foreshadow',
            sourceLabel: volume.volumeTitle,
            excerpt,
          })),
      };

      drafts.push({
        preview,
        payload: {
          projectId,
          volumeId: buildVolumeId(volume.volumeTitle, volume.volumeOrder),
          volumeTitle: volume.volumeTitle,
          volumeOrder: volume.volumeOrder,
          milestoneIndex: null,
          publicEvents,
          secretEvents,
          powerBalanceChange: powerChanges.join('；'),
          institutionChange: institutionChanges.join('；'),
          ruleChange: ruleChanges.join('；'),
          rumorState,
          knownByCharacterIds: [],
          knownByCharacterNames,
          currentRisks,
        },
      });
    }
  }

  if (enabledSystems.has('resource_continuity')) {
    const chapterSummaryMap = new Map(chapters.map((item) => [item.chapterId, item.summary || item.summaryExcerpt] as const));
    const resourceDraftMap = new Map<string, {
      ownerCharacterName: string;
      resourceType: string;
      currentState: string;
      performanceImpact: string;
      lastConsumedAt: string;
      hiddenCost: string;
      continuityRisk: string;
      status: 'active' | 'permanent';
      evidence: StructureMemoryBackfillEvidence[];
    }>();

    for (const change of stateChanges) {
      const combinedText = normalizeText([change.field, change.oldValue, change.newValue].join(' '));
      const profile = detectResourceType(combinedText);

      if (!profile || !change.entityName) {
        continue;
      }

      const resourceKey = `${normalizeKey(change.entityName)}::${normalizeKey(profile.label)}`;
      const chapterLabel = change.chapterOrder > 0
        ? `第${change.chapterOrder}章《${change.chapterTitle || '未命名章节'}》`
        : change.chapterTitle || '状态变化';
      const continuityRisk = truncateText(
        createUniqueList([
          buildStateChangeNarrative(change),
          chapterSummaryMap.get(change.chapterId),
        ]).join('；'),
        160,
      );

      resourceDraftMap.set(resourceKey, {
        ownerCharacterName: change.entityName,
        resourceType: profile.label,
        currentState: truncateText(`${change.field || '状态'}：${change.newValue || change.oldValue}`, 120),
        performanceImpact: truncateText(
          createUniqueList([
            change.oldValue && change.newValue ? `${change.oldValue} -> ${change.newValue}` : change.newValue || change.oldValue,
            chapterSummaryMap.get(change.chapterId),
          ]).join('；'),
          140,
        ),
        lastConsumedAt: chapterLabel,
        hiddenCost: inferResourceHiddenCost(combinedText, profile),
        continuityRisk,
        status: inferResourceStatus(combinedText, profile),
        evidence: [
          {
            sourceType: 'state_change',
            sourceLabel: chapterLabel,
            excerpt: buildStateChangeNarrative(change),
          },
          ...(chapterSummaryMap.get(change.chapterId)
            ? [
              {
                sourceType: 'chapter_summary' as const,
                sourceLabel: chapterLabel,
                excerpt: truncateText(chapterSummaryMap.get(change.chapterId) ?? '', 120),
              },
            ]
            : []),
        ],
      });
    }

    for (const [resourceKey, item] of resourceDraftMap.entries()) {
      const preview: StructureMemoryBackfillCandidate = {
        candidateId: buildStableId('resource_continuity', resourceKey),
        system: 'resource_continuity',
        status: existingResourceKeys.has(resourceKey) ? 'existing' : 'new',
        title: `${item.ownerCharacterName || '无主资源'} · ${item.resourceType}`,
        scopeLabel: item.lastConsumedAt,
        summary: '从历史状态变化里识别到资源/代价约束，先生成一条连续性候选草稿，后续再人工补恢复条件。',
        evidence: item.evidence,
      };

      drafts.push({
        preview,
        payload: {
          projectId,
          resourceType: item.resourceType,
          ownerCharacterId: null,
          ownerCharacterName: item.ownerCharacterName,
          currentState: item.currentState,
          performanceImpact: item.performanceImpact,
          lastConsumedAt: item.lastConsumedAt,
          recoveryCondition: '',
          hiddenCost: item.hiddenCost,
          continuityRisk: item.continuityRisk,
          status: item.status,
        },
      });
    }
  }

  return drafts.sort((left, right) => {
    const leftIndex = BACKFILL_SYSTEM_ORDER.indexOf(left.preview.system);
    const rightIndex = BACKFILL_SYSTEM_ORDER.indexOf(right.preview.system);

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    if (left.preview.status !== right.preview.status) {
      return left.preview.status === 'new' ? -1 : 1;
    }

    return left.preview.title.localeCompare(right.preview.title, 'zh-CN');
  });
}

export function previewStructureMemoryBackfill(
  env: ServerEnv,
  request: PreviewBackfillRequest,
): StructureMemoryBackfillPreviewResult {
  const drafts = buildBackfillDrafts(env, request);
  const candidates = drafts.map((item) => item.preview);

  return {
    projectId: normalizeText(request.projectId),
    generatedAt: nowIsoString(),
    totalCandidates: candidates.length,
    newCandidates: candidates.filter((item) => item.status === 'new').length,
    existingCandidates: candidates.filter((item) => item.status === 'existing').length,
    counts: mapCounts(candidates),
    candidates,
  };
}

export function applyStructureMemoryBackfill(
  env: ServerEnv,
  request: ApplyBackfillRequest,
): StructureMemoryBackfillApplyResult {
  const drafts = buildBackfillDrafts(env, request);
  const selectedCandidateIds = Array.isArray(request.candidateIds) && request.candidateIds.length > 0
    ? new Set(createUniqueList(request.candidateIds))
    : null;
  const selectedDrafts = selectedCandidateIds
    ? drafts.filter((item) => selectedCandidateIds.has(item.preview.candidateId))
    : drafts.filter((item) => item.preview.status === 'new');
  const counts = BACKFILL_SYSTEM_ORDER.map((system) => ({
    system,
    requestedCount: 0,
    createdCount: 0,
    skippedExistingCount: 0,
  }));
  const createdRecordIds: string[] = [];

  for (const draft of selectedDrafts) {
    const counter = counts.find((item) => item.system === draft.preview.system);

    if (!counter) {
      continue;
    }

    counter.requestedCount += 1;

    if (draft.preview.status === 'existing') {
      counter.skippedExistingCount += 1;
      continue;
    }

    switch (draft.preview.system) {
      case 'thread_ledger': {
        const created = createThreadLedger(env, draft.payload as Parameters<typeof createThreadLedger>[1]);
        createdRecordIds.push(created.id);
        counter.createdCount += 1;
        break;
      }
      case 'question_pool': {
        const created = createQuestionPool(env, draft.payload as Parameters<typeof createQuestionPool>[1]);
        createdRecordIds.push(created.id);
        counter.createdCount += 1;
        break;
      }
      case 'world_state_entry': {
        const created = createWorldStateEntry(env, draft.payload as Parameters<typeof createWorldStateEntry>[1]);
        createdRecordIds.push(created.id);
        counter.createdCount += 1;
        break;
      }
      case 'resource_continuity': {
        const created = createResourceContinuity(env, draft.payload as Parameters<typeof createResourceContinuity>[1]);
        createdRecordIds.push(created.id);
        counter.createdCount += 1;
        break;
      }
      default:
        counter.skippedExistingCount += 1;
        break;
    }
  }

  return {
    projectId: normalizeText(request.projectId),
    generatedAt: nowIsoString(),
    requestedCandidateCount: selectedDrafts.length,
    createdCount: counts.reduce((sum, item) => sum + item.createdCount, 0),
    skippedExistingCount: counts.reduce((sum, item) => sum + item.skippedExistingCount, 0),
    counts,
    createdRecordIds,
  };
}

function loadGuardChapter(
  env: ServerEnv,
  projectId: string,
  chapterId?: string,
) {
  const chapters = loadRuntimeChapters(env, projectId);

  if (chapterId) {
    return chapters.find((item) => item.chapterId === chapterId) ?? null;
  }

  return chapters[chapters.length - 1] ?? null;
}

function buildGuardAlert(input: Omit<StructureMemoryGuardAlert, 'id'>) {
  return {
    ...input,
    id: buildStableId(
      `guard-${input.ruleKey}`,
      [input.targetSystem, input.targetRecordId ?? '', input.title, input.message].join('\n'),
    ),
  };
}

export function listStructureMemoryGuardAlerts(
  env: ServerEnv,
  request: GuardAlertRequest,
): StructureMemoryGuardAlertResult {
  const projectId = normalizeText(request.projectId);
  const trigger = normalizeGuardTrigger(request.trigger);
  const items: StructureMemoryGuardAlert[] = [];
  const chapters = loadRuntimeChapters(env, projectId);
  const chapterMap = new Map(chapters.map((item) => [item.chapterId, item] as const));
  const volumeMetas = resolveVolumeMetas(chapters);
  const volumeMetaMap = new Map(volumeMetas.map((item) => [item.volumeTitle, item] as const));
  const threadLedgers = listThreadLedgers(env, { projectId });
  const worldStateEntries = listWorldStateEntries(env, { projectId });
  const foreshadows = listGenerationForeshadows(env, projectId);
  const antagonistAgendas = listAntagonistAgendas(env, { projectId });
  const resourceRows = listResourceContinuities(env, { projectId });
  const currentChapter = loadGuardChapter(env, projectId, request.chapterId);
  const currentChapterOrder = currentChapter?.chapterOrder ?? 0;

  for (const foreshadow of foreshadows) {
    if (foreshadow.status !== 'resolved' || !foreshadow.resolvedChapterId) {
      continue;
    }

    const resolvedChapter = chapterMap.get(foreshadow.resolvedChapterId) ?? null;
    const resolvedVolume = resolvedChapter?.volumeTitle ? volumeMetaMap.get(resolvedChapter.volumeTitle) ?? null : null;

    if (!resolvedChapter?.volumeTitle || !resolvedVolume) {
      continue;
    }

    if (request.volumeTitle && normalizeKey(request.volumeTitle) !== normalizeKey(resolvedChapter.volumeTitle)) {
      continue;
    }

    const volumeEntries = worldStateEntries
      .filter((item) => normalizeKey(item.volumeTitle) === normalizeKey(resolvedChapter.volumeTitle))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const impactText = [foreshadow.title, foreshadow.excerpt, foreshadow.notes].filter(Boolean).join('\n');
    const categories = resolveWorldStateNeedCategories(impactText);

    if (categories.size === 0) {
      continue;
    }

    const hasPublicCoverage = volumeEntries.some((entry) => entry.publicEvents.length > 0 || entry.rumorState.trim());
    const hasInstitutionCoverage = volumeEntries.some(
      (entry) => Boolean(entry.institutionChange.trim()) || entry.publicEvents.length > 0 || entry.secretEvents.length > 0,
    );
    const hasRuleCoverage = volumeEntries.some(
      (entry) => Boolean(entry.ruleChange.trim()) || Boolean(entry.institutionChange.trim()),
    );
    const hasPowerCoverage = volumeEntries.some(
      (entry) => Boolean(entry.powerBalanceChange.trim()) || entry.publicEvents.length > 0,
    );
    const hasRiskCoverage = volumeEntries.some(
      (entry) => entry.currentRisks.length > 0 || Boolean(entry.rumorState.trim()),
    );
    const missingCategories: string[] = [];

    if (categories.has('public') && !hasPublicCoverage) {
      missingCategories.push('公开影响');
    }
    if (categories.has('institution') && !hasInstitutionCoverage) {
      missingCategories.push('制度变化');
    }
    if (categories.has('rule') && !hasRuleCoverage) {
      missingCategories.push('规则变化');
    }
    if (categories.has('power') && !hasPowerCoverage) {
      missingCategories.push('势力格局');
    }
    if (categories.has('risk') && !hasRiskCoverage) {
      missingCategories.push('后续风险');
    }

    if (volumeEntries.length === 0 || missingCategories.length > 0) {
      items.push(
        buildGuardAlert({
          ruleKey: 'foreshadow_worldstate_followup',
          trigger,
          severity: volumeEntries.length === 0 ? 'high' : 'medium',
          title: `伏笔回收后世界状态未同步：${foreshadow.title}`,
          message:
            volumeEntries.length === 0
              ? `这条伏笔已在第${resolvedChapter.chapterOrder}章回收，但第${resolvedVolume.volumeOrder}卷还没有卷级世界状态记录。`
              : `这条伏笔已回收，但同卷世界状态里仍缺少：${missingCategories.join('、')}。`,
          evidence: truncateText(
            [foreshadow.excerpt, foreshadow.notes, `目标卷：第${resolvedVolume.volumeOrder}卷《${resolvedVolume.volumeTitle}》`]
              .filter(Boolean)
              .join('；'),
            180,
          ),
          targetSystem: 'world_state_entry',
          targetRecordId: volumeEntries[0]?.id ?? null,
        }),
      );
    }
  }

  for (const thread of threadLedgers.filter((item) => item.status !== 'resolved')) {
    const matchingTerms = [
      thread.name,
      thread.coreQuestion,
      ...thread.relatedCharacterNames,
      ...thread.relatedForeshadowTitles,
    ].filter(Boolean);

    if (matchingTerms.length === 0) {
      continue;
    }

    for (const agenda of antagonistAgendas.filter((item) => item.status === 'active')) {
      const agendaSignalText = [
        agenda.currentObjective,
        agenda.currentAction,
        agenda.triggerToStrike,
        agenda.ifProtagonistDoesNothing,
      ]
        .filter(Boolean)
        .join('\n');
      const hitCount = countMatchedTerms(agendaSignalText, matchingTerms);

      if (hitCount <= 0) {
        continue;
      }

      const staleGap =
        currentChapterOrder > 0 && thread.lastProgressChapterOrder && currentChapterOrder > thread.lastProgressChapterOrder
          ? currentChapterOrder - thread.lastProgressChapterOrder
          : 0;
      const severity: StructureMemoryGuardAlertSeverity =
        thread.status === 'dormant' || staleGap >= 6 ? 'high' : staleGap >= 3 ? 'medium' : 'low';

      items.push(
        buildGuardAlert({
          ruleKey: 'antagonist_thread_followup',
          trigger,
          severity,
          title: `反派动作已压到剧情线：${thread.name}`,
          message:
            thread.status === 'dormant'
              ? `反派「${agenda.characterName || '未命名反派'}」的当前动作已经命中这条线索，但这条线仍处于 dormant，建议尽快拉回活跃。`
              : staleGap >= 3
                ? `反派「${agenda.characterName || '未命名反派'}」的动作已经明显压到这条线，但它距离上次推进已过去 ${staleGap} 章。`
                : `反派「${agenda.characterName || '未命名反派'}」的出手条件已经覆盖这条线，建议确认是否要追加推进节点。`,
          evidence: truncateText(
            [agenda.currentObjective, agenda.currentAction, agenda.triggerToStrike, agenda.ifProtagonistDoesNothing]
              .filter(Boolean)
              .join('；'),
            180,
          ),
          targetSystem: 'thread_ledger',
          targetRecordId: thread.id,
        }),
      );
    }
  }

  const latestWorldStateOrder = worldStateEntries.reduce((max, item) => Math.max(max, item.volumeOrder), 0);

  if (latestWorldStateOrder > 0) {
    const latestEntries = worldStateEntries.filter((item) => item.volumeOrder === latestWorldStateOrder);
    const latestWorldStateText = latestEntries
      .flatMap((entry) => [
        ...entry.publicEvents,
        ...entry.secretEvents,
        ...entry.currentRisks,
        entry.powerBalanceChange,
        entry.institutionChange,
        entry.ruleChange,
        entry.rumorState,
      ])
      .filter(Boolean)
      .join('\n');
    const latestVolumeTitle = latestEntries[0]?.volumeTitle ?? `第${latestWorldStateOrder}卷`;
    const hasPublicCoverage = latestEntries.some((entry) => entry.publicEvents.length > 0 || entry.rumorState.trim());
    const hasInstitutionCoverage = latestEntries.some(
      (entry) => Boolean(entry.institutionChange.trim()) || entry.publicEvents.length > 0 || entry.secretEvents.length > 0,
    );
    const hasRuleCoverage = latestEntries.some(
      (entry) => Boolean(entry.ruleChange.trim()) || Boolean(entry.institutionChange.trim()),
    );
    const hasPowerCoverage = latestEntries.some(
      (entry) => Boolean(entry.powerBalanceChange.trim()) || entry.publicEvents.length > 0,
    );
    const hasRiskCoverage = latestEntries.some(
      (entry) => entry.currentRisks.length > 0 || Boolean(entry.rumorState.trim()),
    );

    for (const agenda of antagonistAgendas.filter((item) => item.status === 'active')) {
      const agendaText = [
        agenda.publicRole,
        agenda.currentObjective,
        agenda.currentAction,
        agenda.triggerToStrike,
        agenda.ifProtagonistDoesNothing,
      ]
        .filter(Boolean)
        .join('\n');
      const categories = resolveAgendaWorldStateCategories(agendaText);
      const matchedCategoryLabels: string[] = [];
      const directHitCount = countMatchedTerms(latestWorldStateText, [agenda.characterName, agenda.publicRole]);

      if (categories.has('public') && hasPublicCoverage) {
        matchedCategoryLabels.push('公开变化');
      }
      if (categories.has('institution') && hasInstitutionCoverage) {
        matchedCategoryLabels.push('制度变化');
      }
      if (categories.has('rule') && hasRuleCoverage) {
        matchedCategoryLabels.push('规则变化');
      }
      if (categories.has('power') && hasPowerCoverage) {
        matchedCategoryLabels.push('势力变化');
      }
      if (categories.has('risk') && hasRiskCoverage) {
        matchedCategoryLabels.push('风险变化');
      }

      if (directHitCount <= 0 && matchedCategoryLabels.length === 0) {
        continue;
      }

      items.push(
        buildGuardAlert({
          ruleKey: 'worldstate_antagonist_followup',
          trigger,
          severity: directHitCount > 0 ? 'high' : 'medium',
          title: `世界状态变化后反派议程待重估：${agenda.characterName || '未命名反派'}`,
          message:
            directHitCount > 0
              ? '最新世界状态已经直接提到这名反派或其公开身份，建议检查 currentAction / triggerToStrike 是否需要改写。'
              : `最新世界状态已出现 ${matchedCategoryLabels.join('、')}，与这名反派的行动条件存在明显耦合。`,
          evidence: truncateText(`第${latestWorldStateOrder}卷《${latestVolumeTitle}》：${latestWorldStateText}`, 180),
          targetSystem: 'antagonist_agenda',
          targetRecordId: agenda.id,
        }),
      );
    }
  }

  const guardContent = currentChapter ? loadLatestGeneratedText(env, projectId, currentChapter.chapterId) : '';
  const resourceIssue =
    guardContent && resourceRows.length > 0
      ? detectStructuredResourceContinuityIssue({
        content: guardContent,
        rows: resourceRows,
      })
      : null;

  if (currentChapter && resourceIssue) {
    const targetRow =
      resourceRows.find(
        (item) =>
          resourceIssue.title.includes(item.ownerCharacterName) &&
          resourceIssue.title.includes(item.resourceType),
      ) ?? null;

    items.push(
      buildGuardAlert({
        ruleKey: 'resource_continuity_guard',
        trigger,
        severity: 'high',
        title: `章节生成后连续性高风险：${currentChapter.chapterTitle}`,
        message: resourceIssue.description,
        evidence: truncateText(
          [resourceIssue.evidence, resourceIssue.suggestion].filter(Boolean).join('；'),
          180,
        ),
        targetSystem: 'resource_continuity',
        targetRecordId: targetRow?.id ?? null,
      }),
    );
  }

  const deduped = Array.from(
    items.reduce((map, item) => map.set(item.id, item), new Map<string, StructureMemoryGuardAlert>()).values(),
  ).sort((left, right) => {
    const severityGap = GUARD_SEVERITY_PRIORITY[left.severity] - GUARD_SEVERITY_PRIORITY[right.severity];

    if (severityGap !== 0) {
      return severityGap;
    }

    return left.title.localeCompare(right.title, 'zh-CN');
  });

  return {
    projectId,
    scannedAt: nowIsoString(),
    trigger,
    items: deduped,
  };
}
