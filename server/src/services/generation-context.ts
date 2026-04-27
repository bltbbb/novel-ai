import type { ServerEnv } from '../config/env.js';
import type {
  ChapterOutlineDraft,
  GenerationEntitySnapshot,
  GenerationForeshadowSnapshot,
  GenerationRelationSnapshot,
  GenerationStructuredRelationshipQueryMode,
  GenerationStructuredRelationshipQueryReason,
  LightweightRecallConfig,
} from '../types/ai.js';
import {
  retrieveGenerationMemoryChunks,
  type GenerationRetrievedChunk,
} from './generation-retrieval.js';
import {
  deriveGenerationForeshadowLifecycle,
  listGenerationForeshadows,
  type GenerationForeshadowLifecycle,
} from './generation-foreshadow-store.js';
import { getGenerationDatabase } from './generation-sqlite.js';
import {
  type ResourceStateRow,
  loadResourceStateRows,
} from './generation-resource-continuity.js';
import {
  dedupeResourceContinuityBlocks,
  type RuntimeResourceContinuityCandidate,
  type StructuredResourceContinuityCandidate,
} from './context-dedup.js';
import {
  listForeshadowPlans,
  listThreadLedgers,
  type ForeshadowPlanRecord,
  type ThreadLedgerRecord,
  listWorldStateEntries,
  type WorldStateEntryRecord,
} from './structure-memory-store.js';
import { listAntagonistAgendas, type AntagonistAgendaRecord } from './antagonist-agenda-store.js';
import { listPovPermissions, type PovPermissionRecord } from './pov-permission-store.js';
import {
  listQuestionPools,
  type QuestionPoolRecord,
} from './question-pool-store.js';
import {
  getResourceContinuityHintTerms,
  listResourceContinuities,
  type ResourceContinuityRecord,
} from './structured-resource-continuity-store.js';
import { listGenerationVolumeRecaps, type GenerationVolumeRecapRecord } from './generation-volume-recap-store.js';

interface GenerationContextBuildInput {
  projectId: string;
  chapterId?: string;
  chapterTitle?: string;
  chapterOrder?: number;
  volumeTitle?: string;
  milestoneIndex?: number | null;
  previousChapterId?: string;
  previousChapterTitle?: string;
  previousSummary?: string;
  worldState?: string;
  outline?: ChapterOutlineDraft | null;
  fallbackContextBundle?: string;
  preferStoredForeshadows?: boolean;
  lightweightRecallConfig?: LightweightRecallConfig;
  relationSnapshot?: GenerationRelationSnapshot[];
  entitySnapshot?: GenerationEntitySnapshot[];
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  allowDraftContext?: boolean;
  requiredEntityNames?: string[];
  availableCharacterNames?: string[];
  requiredForeshadowTitles?: string[];
}

interface ChapterMemoryRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  previousChapterId: string;
  previousChapterTitle: string;
  timeAnchor: string;
  strand: string;
  beats: string[];
  immutableFacts: string[];
  entitiesAppeared: string[];
  locations: string[];
  summary: string;
  hook: string;
  summaryExcerpt: string;
  updatedAt: string;
}

interface ChapterTextRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  generatedText: string;
  updatedAt: string;
}

interface GenerationEntityRow {
  entityName: string;
  entityType: string;
  description: string;
  fields: Record<string, string>;
  tags: string[];
  aliases: string[];
  pinned: boolean;
  draft: boolean;
  lastSeenChapterTitle: string;
  updatedAt: string;
}

interface RelationshipRow {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: string;
  sourceKind: string;
  description: string;
  evidence: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  updatedAt: string;
}

interface ForeshadowRow {
  id: string;
  title: string;
  excerpt: string;
  notes: string;
  status: 'planted' | 'activated' | 'resolved' | 'overdue';
  lifecycle: GenerationForeshadowLifecycle;
  sourceChapterOrder: number;
  sourceChapterTitle: string;
  resolvedChapterTitle: string;
  updatedAt: string;
}

interface CanonicalEntityRow extends GenerationEntityRow {
  supplementTexts: string[];
}

interface CanonicalForeshadowRow extends ForeshadowRow {
  supplementTexts: string[];
}

interface CanonicalThreadLedgerCandidate {
  row: ThreadLedgerRecord;
  score: number;
  supplementTexts: string[];
}

type PovPermissionScopeLevel = 'chapter' | 'milestone' | 'volume';

interface CanonicalPovPermissionEntry {
  row: PovPermissionRecord;
  scopeLevel: PovPermissionScopeLevel;
  mustHide: string[];
  canHint: string[];
  forbiddenReveal: string[];
  supplementTexts: string[];
}

interface QuestionPoolHintCandidate {
  row: QuestionPoolRecord;
  score: number;
  forced: boolean;
}

interface VolumeRecapBlockEntry {
  volumeTitle: string;
  block: string;
  sortOrder: number;
}

interface LightweightRecallBlock {
  sourceType: 'dormant_foreshadow' | 'volume_recap';
  title: string;
  block: string;
  score: number;
  matchedPhrases: string[];
  matchedEntities: string[];
  scoreBreakdown: {
    phrase: number;
    entity: number;
    recency: number;
  };
  updatedAt: string;
}

type StructuredRelationshipConfidenceLevel = 'high' | 'medium' | 'low';

interface StructuredRelationshipEdgeCandidate {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: string;
  sourceKind: string;
  evidence: string;
  description: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  confidence: number;
  confidenceLevel: StructuredRelationshipConfidenceLevel;
}

interface StructuredRelationshipPathCandidate {
  focusEntityName: string;
  viaEntityName: string;
  targetEntityName: string;
  edgeA: StructuredRelationshipEdgeCandidate;
  edgeB: StructuredRelationshipEdgeCandidate;
  confidence: number;
  confidenceLevel: StructuredRelationshipConfidenceLevel;
}

interface StructuredRelationshipSignalResult {
  mode: GenerationStructuredRelationshipQueryMode;
  reason: GenerationStructuredRelationshipQueryReason;
  detailBlocks: string[];
  acceptedEdges: StructuredRelationshipEdgeCandidate[];
  acceptedPaths: StructuredRelationshipPathCandidate[];
}

interface StructuredRelationshipContextResult {
  mode: GenerationStructuredRelationshipQueryMode;
  reason: GenerationStructuredRelationshipQueryReason;
  signalCount: number;
  detailBlocks: string[];
  blocks: string[];
}

export interface GenerationContextSection {
  key: string;
  title: string;
  blocks: string[];
}

export interface GenerationContextBundleResult {
  bundle: string;
  recentSummaryCount: number;
  recentTextCount: number;
  volumeRecapCount: number;
  relatedChapterCount: number;
  dormantForeshadowRecallCount: number;
  volumeRecapRecallCount: number;
  entityCount: number;
  relationshipCount: number;
  hasFallbackContext: boolean;
  focusEntityNames: string[];
  queryPhrases: string[];
  lightweightRecallItems: LightweightRecallBlock[];
  sections: GenerationContextSection[];
}

interface FallbackContextParts {
  activeForeshadowBlocks: string[];
  residualBundle: string;
}

const GENERATION_CONTEXT_LIMITS = {
  focusEntityMaxWithHardHit: 4,
  focusEntityMaxDefault: 3,
  focusEntityFallbackFromCurrentChapterMax: 2,
  focusEntityFallbackFromPreviousChapterMax: 2,
  focusEntityFallbackPinnedMax: 3,
  relationshipFocusEntityMax: 1,
  entityBlockMax: 6,
  entityFieldPreviewMax: 4,
  entityDescriptionMaxChars: 80,
  entityTagPreviewMax: 4,
  sectionSupplementPreviewMax: 2,
  availableCharacterBlockMax: 5,
  threadLedgerBlockMax: 5,
  threadLedgerFullBlockMax: 2,
  antagonistAgendaBlockMax: 3,
  antagonistAgendaFullBlockMax: 2,
  foreshadowPlanBlockMax: 4,
  foreshadowPlanFullBlockMax: 3,
  povPermissionBlockMax: 3,
  povPermissionFullBlockMax: 2,
  questionPoolHintBlockMax: 3,
  questionPoolHintFullBlockMax: 1,
  resourceContinuityFullBlockMaxDefault: 3,
  resourceContinuityFullBlockMaxHighPressure: 4,
  memoryRetrievalLimit: 6,
} as const;

const CHARACTER_STATIC_FIELD_LABELS = [
  ['static_desire', '欲望'],
  ['static_fear', '恐惧'],
  ['static_values', '价值排序'],
  ['static_trueNature', '真实底色'],
  ['static_speechStyle', '说话方式'],
  ['static_decisionStyle', '决策习惯'],
  ['static_conflictResponse', '冲突反应'],
  ['static_taboos', '底线禁忌'],
] as const;

function buildRelationPairKey(leftName: string, rightName: string) {
  const sorted = [normalizeText(leftName), normalizeText(rightName)].filter(Boolean).sort();
  return sorted.join('::');
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function parseStringArrayJson(rawText: string | null | undefined) {
  if (!rawText) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [];
  } catch {
    return [] as string[];
  }
}

function parseFieldsJson(rawText: string | null | undefined) {
  if (!rawText) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function isEntityDynamicFieldKey(fieldKey: string) {
  return fieldKey.trim().toLowerCase().startsWith('current_');
}

function getEntitySearchTerms(row: GenerationEntityRow) {
  return createUniqueList([row.entityName, ...row.aliases])
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapEntitySnapshotToRow(snapshot: GenerationEntitySnapshot): GenerationEntityRow | null {
  const entityName = snapshot.name.trim();

  if (!entityName) {
    return null;
  }

  return {
    entityName,
    entityType: snapshot.type?.trim() || 'unknown',
    description: snapshot.description?.trim() || '',
    fields: Object.fromEntries(
      Object.entries(snapshot.fields ?? {}).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
    ),
    tags: Array.isArray(snapshot.tags) ? snapshot.tags.map((tag) => tag.trim()).filter(Boolean) : [],
    aliases: Array.isArray(snapshot.aliases) ? snapshot.aliases.map((alias) => alias.trim()).filter(Boolean) : [],
    pinned: Boolean(snapshot.pinned),
    draft: Boolean(snapshot.draft),
    lastSeenChapterTitle: '',
    updatedAt: new Date().toISOString(),
  };
}

function createCanonicalEntityRow(row: GenerationEntityRow): CanonicalEntityRow {
  return {
    ...row,
    fields: { ...row.fields },
    tags: [...row.tags],
    aliases: [...row.aliases],
    supplementTexts: [],
  };
}

function mergeEntityRowsWithSnapshotPriority(
  storedRows: GenerationEntityRow[],
  entitySnapshots?: GenerationEntitySnapshot[],
) {
  const snapshotRows = (entitySnapshots ?? [])
    .map((snapshot) => mapEntitySnapshotToRow(snapshot))
    .filter((row): row is GenerationEntityRow => Boolean(row));
  const mergedRows = [] as CanonicalEntityRow[];
  const rowIndex = new Map<string, CanonicalEntityRow>();

  for (const row of [...snapshotRows, ...storedRows]) {
    const entityNameKey = normalizeText(row.entityName);

    if (!entityNameKey) {
      continue;
    }

    const existingRow = rowIndex.get(entityNameKey);

    if (!existingRow) {
      const canonicalRow = createCanonicalEntityRow(row);
      rowIndex.set(entityNameKey, canonicalRow);
      mergedRows.push(canonicalRow);
      continue;
    }

    if ((!existingRow.entityType || existingRow.entityType === 'unknown') && row.entityType && row.entityType !== 'unknown') {
      existingRow.entityType = row.entityType;
    }

    const contributesAlias = row.aliases.some(
      (alias) => !existingRow.aliases.some((existingAlias) => normalizeText(existingAlias) === normalizeText(alias)),
    );
    const contributesTag = row.tags.some(
      (tag) => !existingRow.tags.some((existingTag) => normalizeText(existingTag) === normalizeText(tag)),
    );
    let contributesStableField = false;

    for (const [key, value] of Object.entries(row.fields)) {
      const trimmedValue = value.trim();

      if (!trimmedValue || isEntityDynamicFieldKey(key)) {
        continue;
      }

      if (!existingRow.fields[key]?.trim()) {
        existingRow.fields[key] = trimmedValue;
        contributesStableField = true;
      }
    }

    if (!existingRow.description && row.description.trim()) {
      existingRow.description = row.description.trim();
    } else if (
      row.description.trim()
      && normalizeText(row.description) !== normalizeText(existingRow.description)
      && (contributesAlias || contributesTag || contributesStableField)
    ) {
      pushUniqueSupplementText(existingRow.supplementTexts, row.description);
    }

    existingRow.aliases = mergeUniqueTextValues(existingRow.aliases, row.aliases);
    existingRow.tags = mergeUniqueTextValues(existingRow.tags, row.tags);

    if (!existingRow.lastSeenChapterTitle && row.lastSeenChapterTitle.trim()) {
      existingRow.lastSeenChapterTitle = row.lastSeenChapterTitle.trim();
    }
  }

  return mergedRows;
}

function findChapterOrderById(chapterRows: ChapterMemoryRow[], chapterId?: string | null) {
  if (!chapterId) {
    return 0;
  }

  return chapterRows.find((row) => row.chapterId === chapterId)?.chapterOrder ?? 0;
}

function findChapterTitleById(chapterRows: ChapterMemoryRow[], chapterId?: string | null) {
  if (!chapterId) {
    return '';
  }

  return chapterRows.find((row) => row.chapterId === chapterId)?.chapterTitle ?? '';
}

function mapForeshadowSnapshotToRow(input: {
  snapshot: GenerationForeshadowSnapshot;
  chapterRows: ChapterMemoryRow[];
  currentChapterOrder: number | null;
}): ForeshadowRow | null {
  const id = input.snapshot.id.trim();
  const title = input.snapshot.title.trim();

  if (!id && !title) {
    return null;
  }

  const sourceChapterOrder = findChapterOrderById(input.chapterRows, input.snapshot.sourceChapterId ?? null);
  const sourceChapterTitle =
    input.snapshot.sourceChapterTitle?.trim()
    || findChapterTitleById(input.chapterRows, input.snapshot.sourceChapterId ?? null);
  const resolvedChapterTitle =
    input.snapshot.resolvedChapterTitle?.trim()
    || findChapterTitleById(input.chapterRows, input.snapshot.resolvedChapterId ?? null);
  const rowBase = {
    status: input.snapshot.status,
    sourceChapterOrder,
  };

  return {
    id: id || title,
    title: title || '未命名伏笔',
    excerpt: input.snapshot.excerpt.trim(),
    notes: input.snapshot.notes.trim(),
    status: input.snapshot.status,
    lifecycle: deriveGenerationForeshadowLifecycle(rowBase, input.currentChapterOrder),
    sourceChapterOrder,
    sourceChapterTitle,
    resolvedChapterTitle,
    updatedAt: input.snapshot.updatedAt.trim() || new Date().toISOString(),
  };
}

function createCanonicalForeshadowRow(row: ForeshadowRow): CanonicalForeshadowRow {
  return {
    ...row,
    supplementTexts: [],
  };
}

function mergeForeshadowRowsWithSnapshotPriority(input: {
  storedRows: ForeshadowRow[];
  chapterRows: ChapterMemoryRow[];
  currentChapterOrder: number | null;
  foreshadowSnapshots?: GenerationForeshadowSnapshot[];
}) {
  const snapshotRows = (input.foreshadowSnapshots ?? [])
    .map((snapshot) =>
      mapForeshadowSnapshotToRow({
        snapshot,
        chapterRows: input.chapterRows,
        currentChapterOrder: input.currentChapterOrder,
      }),
    )
    .filter((row): row is ForeshadowRow => Boolean(row));
  const mergedRows = [] as CanonicalForeshadowRow[];
  const rowIndex = new Map<string, CanonicalForeshadowRow>();

  for (const row of [...snapshotRows, ...input.storedRows]) {
    const idKey = normalizeText(row.id);
    const titleKey = normalizeText(row.title);
    const canonicalKey = titleKey || idKey;

    if (!canonicalKey) {
      continue;
    }

    const existingRow =
      rowIndex.get(canonicalKey)
      ?? (idKey ? rowIndex.get(idKey) : null)
      ?? (titleKey ? rowIndex.get(titleKey) : null)
      ?? null;

    if (!existingRow) {
      const canonicalRow = createCanonicalForeshadowRow(row);
      rowIndex.set(canonicalKey, canonicalRow);
      if (idKey) {
        rowIndex.set(idKey, canonicalRow);
      }
      if (titleKey) {
        rowIndex.set(titleKey, canonicalRow);
      }
      mergedRows.push(canonicalRow);
      continue;
    }

    if (!existingRow.excerpt && row.excerpt.trim()) {
      existingRow.excerpt = row.excerpt.trim();
    }

    if (row.notes.trim()) {
      if (!existingRow.notes && !existingRow.excerpt) {
        existingRow.notes = row.notes.trim();
      } else if (
        normalizeText(row.notes) !== normalizeText(existingRow.notes) &&
        normalizeText(row.notes) !== normalizeText(existingRow.excerpt)
      ) {
        pushUniqueSupplementText(existingRow.supplementTexts, row.notes);
      }
    }

    if (!existingRow.sourceChapterTitle && row.sourceChapterTitle.trim()) {
      existingRow.sourceChapterTitle = row.sourceChapterTitle.trim();
    }

    if (!existingRow.resolvedChapterTitle && row.resolvedChapterTitle.trim()) {
      existingRow.resolvedChapterTitle = row.resolvedChapterTitle.trim();
    }

    if (existingRow.sourceChapterOrder <= 0 && row.sourceChapterOrder > 0) {
      existingRow.sourceChapterOrder = row.sourceChapterOrder;
    }

    if (!existingRow.id && row.id.trim()) {
      existingRow.id = row.id.trim();
    }

    rowIndex.set(canonicalKey, existingRow);
    if (idKey) {
      rowIndex.set(idKey, existingRow);
    }
    if (titleKey) {
      rowIndex.set(titleKey, existingRow);
    }
  }

  return mergedRows;
}

function countEntityTextHits(text: string, row: GenerationEntityRow) {
  return getEntitySearchTerms(row).reduce((total, term) => total + countTextOccurrences(text, term), 0);
}

function resolveEntityRowPositionScore(entityNames: string[], row: GenerationEntityRow, scores: number[]) {
  return getEntitySearchTerms(row).reduce((best, term) => {
    return Math.max(best, resolveEntityPositionScore(entityNames, term, scores));
  }, 0);
}

function clampScore(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function looksLikeGenericRelationshipType(value: string) {
  const normalized = normalizeText(value);
  return !normalized || normalized === '关系' || normalized === '关联' || normalized === '相关';
}

function resolveStructuredRelationshipConfidenceLevel(score: number): StructuredRelationshipConfidenceLevel {
  if (score >= 0.78) {
    return 'high';
  }

  if (score >= 0.56) {
    return 'medium';
  }

  return 'low';
}

function scoreStructuredRelationshipCandidate(input: {
  sourceKind: string;
  relationshipType: string;
  hasTarget: boolean;
  evidence: string;
}) {
  let score = 0.15;
  const sourceKind = normalizeText(input.sourceKind);

  if (sourceKind === 'state_change') {
    score += 0.5;
  } else if (sourceKind === 'sentence_pattern') {
    score += 0.26;
  } else {
    score += 0.12;
  }

  if (!looksLikeGenericRelationshipType(input.relationshipType)) {
    score += 0.18;
  }

  if (input.hasTarget) {
    score += 0.08;
  }

  if (input.evidence.trim().length >= 12) {
    score += 0.09;
  }

  return clampScore(score, 0, 1);
}

function includesQuery(parts: Array<string | null | undefined>, query: string) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return false;
  }

  return parts.some((part) => normalizeText(part).includes(normalizedQuery));
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}...`;
}

function tailText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `...${trimmed.slice(-maxLength)}`;
}

function countTextOccurrences(source: string | null | undefined, pattern: string) {
  const normalizedSource = normalizeText(source);
  const normalizedPattern = normalizeText(pattern);

  if (!normalizedSource || !normalizedPattern) {
    return 0;
  }

  let count = 0;
  let startIndex = 0;

  while (true) {
    const nextIndex = normalizedSource.indexOf(normalizedPattern, startIndex);

    if (nextIndex < 0) {
      break;
    }

    count += 1;
    startIndex = nextIndex + normalizedPattern.length;
  }

  return count;
}

function buildSection(title: string, blocks: string[]) {
  if (blocks.length === 0) {
    return '';
  }

  return [`${title}：`, ...blocks].join('\n\n');
}

function parseFallbackContextBundle(rawText?: string) {
  const input = rawText?.trim() ?? '';

  if (!input) {
    return {
      activeForeshadowBlocks: [],
      residualBundle: '',
    } satisfies FallbackContextParts;
  }

  const marker = '激活伏笔：';
  const markerIndex = input.indexOf(marker);

  if (markerIndex < 0) {
    return {
      activeForeshadowBlocks: [],
      residualBundle: input,
    } satisfies FallbackContextParts;
  }

  const beforeMarker = input.slice(0, markerIndex).trim();
  const foreshadowText = input.slice(markerIndex + marker.length).trim();
  const activeForeshadowBlocks = foreshadowText
    .split(/\n\n(?=- )/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    activeForeshadowBlocks,
    residualBundle: beforeMarker,
  } satisfies FallbackContextParts;
}

function createSection(key: string, title: string, blocks: string[]) {
  const filteredBlocks = blocks.filter((block) => block.trim());

  if (filteredBlocks.length === 0) {
    return null;
  }

  return {
    key,
    title,
    blocks: filteredBlocks,
  } satisfies GenerationContextSection;
}

function compareChapterRows(left: Pick<ChapterMemoryRow, 'chapterOrder' | 'updatedAt'>, right: Pick<ChapterMemoryRow, 'chapterOrder' | 'updatedAt'>) {
  const leftOrder = left.chapterOrder > 0 ? left.chapterOrder : Number.MAX_SAFE_INTEGER;
  const rightOrder = right.chapterOrder > 0 ? right.chapterOrder : Number.MAX_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.updatedAt.localeCompare(right.updatedAt);
}

function buildChapterLabel(chapterOrder: number, chapterTitle: string) {
  if (chapterOrder <= 0) {
    return chapterTitle;
  }

  const trimmedTitle = chapterTitle.trim();
  const prefix = `第${chapterOrder}章`;

  if (trimmedTitle.startsWith(prefix)) {
    return trimmedTitle;
  }

  return `${prefix} ${trimmedTitle}`;
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

function mergeUniqueTextValues(primary: string[], supplement: string[]) {
  const merged = [...primary];
  const seen = new Set(primary.map((item) => normalizeText(item)).filter(Boolean));

  for (const item of supplement) {
    const trimmed = item.trim();
    const normalized = normalizeText(trimmed);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    merged.push(trimmed);
  }

  return merged;
}

function pushUniqueSupplementText(target: string[], value: string) {
  const trimmed = value.trim();
  const normalized = normalizeText(trimmed);

  if (!normalized) {
    return;
  }

  if (target.some((item) => normalizeText(item) === normalized)) {
    return;
  }

  target.push(trimmed);
}

function previewSupplementTexts(values: string[], maxLength: number) {
  return values
    .map((value) => truncateText(value, maxLength))
    .slice(0, GENERATION_CONTEXT_LIMITS.sectionSupplementPreviewMax)
    .join('；');
}

function buildFocusSignalTexts(input: GenerationContextBuildInput) {
  return {
    hard: [
      input.chapterTitle,
      input.outline?.goal,
      input.outline?.obstacle,
      input.outline?.cost,
      input.outline?.chapterFunction,
      input.outline?.chapterBoundary,
      input.outline?.revealCeiling,
      input.outline?.openingState,
      input.outline?.closingState,
      input.outline?.focusCharacter,
      input.outline?.mainPlot,
      input.outline?.subPlot,
      input.outline?.coreScene,
      input.outline?.infoBudget,
      input.outline?.powerShift,
      input.outline?.personalConflict,
      input.outline?.emotionalOutcome,
      input.outline?.chapterHook,
      ...(input.outline?.mustAppearCharacters ?? []),
      ...(input.outline?.sceneAnchors ?? []),
      ...((input.outline?.foreshadowRefs ?? []).flatMap((item) => [item.foreshadowId, item.foreshadowTitle ?? ''])),
      ...(input.outline?.beats ?? []),
      ...((input.outline?.beatDrafts ?? []).flatMap((beat) => [
        beat.beatTitle,
        beat.scene,
        beat.progress,
        beat.result,
        ...(beat.actors ?? []),
        ...(beat.anchors ?? []),
        ...(beat.entityRefs ?? []),
        ...((beat.foreshadowRefs ?? []).flatMap((item) => [item.foreshadowId, item.foreshadowTitle ?? ''])),
      ])),
      ...(input.outline?.immutableFacts ?? []),
    ].filter(Boolean) as string[],
    soft: [
      input.previousChapterTitle,
      input.previousSummary,
      input.worldState,
    ].filter(Boolean) as string[],
  };
}

function findChapterRowById(chapterRows: ChapterMemoryRow[], chapterId?: string) {
  if (!chapterId) {
    return null;
  }

  return chapterRows.find((row) => row.chapterId === chapterId) ?? null;
}

function buildEntityLatestSeenOrderMap(chapterRows: ChapterMemoryRow[], currentChapterOrder: number | null) {
  const latestSeenOrderMap = new Map<string, number>();

  for (const row of chapterRows) {
    if (row.chapterOrder <= 0) {
      continue;
    }

    if (currentChapterOrder !== null && row.chapterOrder >= currentChapterOrder) {
      continue;
    }

    for (const entityName of row.entitiesAppeared) {
      const key = normalizeText(entityName);
      const currentMax = latestSeenOrderMap.get(key) ?? 0;

      if (row.chapterOrder > currentMax) {
        latestSeenOrderMap.set(key, row.chapterOrder);
      }
    }
  }

  return latestSeenOrderMap;
}

function resolveEntityPositionScore(entityNames: string[], entityName: string, scoreByIndex: number[]) {
  const index = entityNames.findIndex((item) => normalizeText(item) === normalizeText(entityName));

  if (index < 0) {
    return 0;
  }

  return scoreByIndex[index] ?? 1;
}

function buildQueryPhrases(input: GenerationContextBuildInput) {
  return createUniqueList([
    input.chapterTitle ?? '',
    input.volumeTitle ?? '',
    input.previousChapterTitle ?? '',
    ...(input.requiredForeshadowTitles ?? []),
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
    ...(input.outline?.immutableFacts ?? []),
  ]).slice(0, 12);
}

function loadChapterMemoryRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          idx.chapter_id,
          idx.chapter_title,
          idx.chapter_order,
          idx.volume_title,
          idx.previous_chapter_id,
          idx.previous_chapter_title,
          idx.time_anchor,
          idx.strand,
          idx.beats_json,
          idx.immutable_facts_json,
          idx.entities_appeared_json,
          idx.locations_json,
          idx.summary_excerpt,
          idx.updated_at,
          sums.summary,
          sums.hook
        FROM generation_chapter_index idx
        LEFT JOIN generation_chapter_summaries sums
          ON sums.project_id = idx.project_id AND sums.chapter_id = idx.chapter_id
        WHERE idx.project_id = ?
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows
    .map(
      (row): ChapterMemoryRow => ({
        chapterId: asString(row.chapter_id),
        chapterTitle: asString(row.chapter_title),
        chapterOrder: Number(row.chapter_order ?? 0),
        volumeTitle: asString(row.volume_title),
        previousChapterId: asString(row.previous_chapter_id),
        previousChapterTitle: asString(row.previous_chapter_title),
        timeAnchor: asString(row.time_anchor),
        strand: asString(row.strand),
        beats: parseStringArrayJson(asString(row.beats_json)),
        immutableFacts: parseStringArrayJson(asString(row.immutable_facts_json)),
        entitiesAppeared: parseStringArrayJson(asString(row.entities_appeared_json)),
        locations: parseStringArrayJson(asString(row.locations_json)),
        summary: asString(row.summary),
        hook: asString(row.hook),
        summaryExcerpt: asString(row.summary_excerpt),
        updatedAt: asString(row.updated_at),
      }),
    )
    .sort(compareChapterRows);
}

function loadRecentTextRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          jobs.chapter_id,
          jobs.chapter_title,
          jobs.generated_text,
          jobs.updated_at AS job_updated_at,
          idx.chapter_order
        FROM generation_jobs jobs
        LEFT JOIN generation_chapter_index idx
          ON idx.project_id = jobs.project_id AND idx.chapter_id = jobs.chapter_id
        WHERE jobs.project_id = ?
          AND jobs.generated_text <> ''
          AND jobs.status IN ('ready', 'approved')
        ORDER BY jobs.updated_at DESC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;
  const latestByChapter = new Map<string, ChapterTextRow>();

  for (const row of rows) {
    const chapterId = asString(row.chapter_id);

    if (!chapterId || latestByChapter.has(chapterId)) {
      continue;
    }

    latestByChapter.set(chapterId, {
      chapterId,
      chapterTitle: asString(row.chapter_title),
      chapterOrder: Number(row.chapter_order ?? 0),
      generatedText: asString(row.generated_text),
      updatedAt: asString(row.job_updated_at),
    });
  }

  return Array.from(latestByChapter.values());
}

function loadEntityRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          entity_name,
          entity_type,
          description,
          fields_json,
          tags_json,
          aliases_json,
          pinned,
          draft,
          last_seen_chapter_title,
          updated_at
        FROM generation_entities
        WHERE project_id = ?
        ORDER BY pinned DESC, updated_at DESC, entity_name COLLATE NOCASE ASC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): GenerationEntityRow => ({
      entityName: asString(row.entity_name),
      entityType: asString(row.entity_type),
      description: asString(row.description),
      fields: parseFieldsJson(asString(row.fields_json)),
      tags: parseStringArrayJson(asString(row.tags_json)),
      aliases: parseStringArrayJson(asString(row.aliases_json)),
      pinned: Number(row.pinned ?? 0) > 0,
      draft: Number(row.draft ?? 0) > 0,
      lastSeenChapterTitle: asString(row.last_seen_chapter_title),
      updatedAt: asString(row.updated_at),
    }),
  );
}

function loadRelationshipRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          rel.source_entity_name,
          rel.target_entity_name,
          rel.relationship_type,
          rel.source_kind,
          rel.description,
          rel.evidence,
          rel.chapter_id,
          rel.chapter_title,
          COALESCE(idx.chapter_order, 0) AS chapter_order,
          rel.updated_at
        FROM generation_relationships rel
        LEFT JOIN generation_chapter_index idx
          ON idx.project_id = rel.project_id AND idx.chapter_id = rel.chapter_id
        WHERE rel.project_id = ?
        ORDER BY chapter_order DESC, rel.updated_at DESC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows.map(
    (row): RelationshipRow => ({
      sourceEntityName: asString(row.source_entity_name),
      targetEntityName: asString(row.target_entity_name),
      relationshipType: asString(row.relationship_type),
      sourceKind: asString(row.source_kind),
      description: asString(row.description),
      evidence: asString(row.evidence),
      chapterId: asString(row.chapter_id),
      chapterTitle: asString(row.chapter_title),
      chapterOrder: Number(row.chapter_order ?? 0),
      updatedAt: asString(row.updated_at),
    }),
  );
}

function resolveCurrentChapterOrder(
  input: GenerationContextBuildInput,
  chapterRows: ChapterMemoryRow[],
) {
  const requestOrder = Math.trunc(input.chapterOrder ?? 0);

  if (requestOrder > 0) {
    return requestOrder;
  }

  if (input.chapterId) {
    const currentRow = chapterRows.find((row) => row.chapterId === input.chapterId);

    if (currentRow && currentRow.chapterOrder > 0) {
      return currentRow.chapterOrder;
    }
  }

  if (input.previousChapterId) {
    const previousRow = chapterRows.find((row) => row.chapterId === input.previousChapterId);

    if (previousRow && previousRow.chapterOrder > 0) {
      return previousRow.chapterOrder + 1;
    }
  }

  return null;
}

function filterHistoricalChapters(
  input: GenerationContextBuildInput,
  chapterRows: ChapterMemoryRow[],
  currentChapterOrder: number | null,
) {
  return chapterRows.filter((row) => {
    if (input.chapterId && row.chapterId === input.chapterId) {
      return false;
    }

    if (currentChapterOrder !== null) {
      return row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder;
    }

    return true;
  });
}

function selectFocusEntityNames(
  input: GenerationContextBuildInput,
  chapterRows: ChapterMemoryRow[],
  entityRows: GenerationEntityRow[],
) {
  const currentChapterOrder = resolveCurrentChapterOrder(input, chapterRows);
  const currentRow = findChapterRowById(chapterRows, input.chapterId);
  const previousRow = findChapterRowById(chapterRows, input.previousChapterId);
  const { hard, soft } = buildFocusSignalTexts(input);
  const latestSeenOrderMap = buildEntityLatestSeenOrderMap(chapterRows, currentChapterOrder);
  const scoredCandidates = entityRows
    .map((row) => {
      const hardHitCount = hard.reduce((total, text) => total + countEntityTextHits(text, row), 0);
      const softHitCount = soft.reduce((total, text) => total + countEntityTextHits(text, row), 0);
      const currentChapterScore = currentRow
        ? resolveEntityRowPositionScore(currentRow.entitiesAppeared, row, [8, 5, 3, 1])
        : 0;
      const previousChapterScore = previousRow
        ? resolveEntityRowPositionScore(previousRow.entitiesAppeared, row, [5, 3, 2, 1])
        : 0;
      const latestSeenOrder = latestSeenOrderMap.get(normalizeText(row.entityName)) ?? 0;
      const recencyScore =
        currentChapterOrder !== null && latestSeenOrder > 0
          ? Math.max(0, 2 - Math.floor(Math.max(0, currentChapterOrder - latestSeenOrder - 1) / 10))
          : 0;
      const score =
        hardHitCount * 10
        + softHitCount * 4
        + currentChapterScore
        + previousChapterScore
        + recencyScore
        + (row.pinned ? 1 : 0);

      return {
        entityName: row.entityName,
        hardHitCount,
        softHitCount,
        currentChapterScore,
        previousChapterScore,
        latestSeenOrder,
        pinned: row.pinned,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.hardHitCount !== left.hardHitCount) {
        return right.hardHitCount - left.hardHitCount;
      }

      if (right.currentChapterScore !== left.currentChapterScore) {
        return right.currentChapterScore - left.currentChapterScore;
      }

      if (right.previousChapterScore !== left.previousChapterScore) {
        return right.previousChapterScore - left.previousChapterScore;
      }

      if (right.latestSeenOrder !== left.latestSeenOrder) {
        return right.latestSeenOrder - left.latestSeenOrder;
      }

      if (right.pinned !== left.pinned) {
        return Number(right.pinned) - Number(left.pinned);
      }

      return left.entityName.localeCompare(right.entityName, 'zh-CN');
    });

  if (scoredCandidates.length > 0) {
    const limit = scoredCandidates.some((item) => item.hardHitCount > 0)
      ? GENERATION_CONTEXT_LIMITS.focusEntityMaxWithHardHit
      : GENERATION_CONTEXT_LIMITS.focusEntityMaxDefault;
    return scoredCandidates.slice(0, limit).map((item) => item.entityName);
  }

  if (currentRow && currentRow.entitiesAppeared.length > 0) {
    return createUniqueList(currentRow.entitiesAppeared).slice(
      0,
      GENERATION_CONTEXT_LIMITS.focusEntityFallbackFromCurrentChapterMax,
    );
  }

  if (previousRow && previousRow.entitiesAppeared.length > 0) {
    return createUniqueList(previousRow.entitiesAppeared).slice(
      0,
      GENERATION_CONTEXT_LIMITS.focusEntityFallbackFromPreviousChapterMax,
    );
  }

  const pinnedNames = entityRows.filter((row) => row.pinned).map((row) => row.entityName);

  if (pinnedNames.length > 0) {
    return pinnedNames.slice(0, GENERATION_CONTEXT_LIMITS.focusEntityFallbackPinnedMax);
  }

  return entityRows.slice(0, GENERATION_CONTEXT_LIMITS.focusEntityMaxDefault).map((row) => row.entityName);
}

function selectStructuredRelationshipFocusEntityNames(
  input: GenerationContextBuildInput,
  chapterRows: ChapterMemoryRow[],
  focusEntityNames: string[],
) {
  const uniqueFocusEntityNames = createUniqueList(focusEntityNames);

  if (uniqueFocusEntityNames.length <= GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax) {
    return uniqueFocusEntityNames;
  }

  const currentRow = findChapterRowById(chapterRows, input.chapterId);

  if (currentRow) {
    const primaryCurrentEntity = currentRow.entitiesAppeared.find((entityName) =>
      uniqueFocusEntityNames.some((focusEntityName) => normalizeText(focusEntityName) === normalizeText(entityName)),
    );

    if (primaryCurrentEntity) {
      return [primaryCurrentEntity].slice(0, GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax);
    }
  }

  const { hard } = buildFocusSignalTexts(input);
  const explicitHits = uniqueFocusEntityNames.filter((entityName) =>
    hard.some((text) => countTextOccurrences(text, entityName) > 0),
  );

  if (explicitHits.length > 0) {
    return explicitHits.slice(0, GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax);
  }

  const previousRow = findChapterRowById(chapterRows, input.previousChapterId);

  if (previousRow) {
    const primaryPreviousEntity = previousRow.entitiesAppeared.find((entityName) =>
      uniqueFocusEntityNames.some((focusEntityName) => normalizeText(focusEntityName) === normalizeText(entityName)),
    );

    if (primaryPreviousEntity) {
      return [primaryPreviousEntity].slice(0, GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax);
    }
  }

  return uniqueFocusEntityNames.slice(0, GENERATION_CONTEXT_LIMITS.relationshipFocusEntityMax);
}

function buildRecentSummaryBlocks(rows: ChapterMemoryRow[]) {
  return rows.map((row) => {
    const lines = [`- ${buildChapterLabel(row.chapterOrder, row.chapterTitle)}`];
    const summaryText = row.summary || row.summaryExcerpt;

    if (summaryText) {
      lines.push(`摘要：${truncateText(summaryText, 180)}`);
    }

    if (row.hook) {
      lines.push(`钩子：${truncateText(row.hook, 80)}`);
    }

    return lines.join('\n');
  });
}

function buildRecentTextBlocks(rows: ChapterTextRow[]) {
  return rows.map((row) =>
    [`- ${buildChapterLabel(row.chapterOrder, row.chapterTitle)}`, tailText(row.generatedText, 260)].join('\n'),
  );
}

function buildVolumeRecapEntriesFromHistoricalRows(
  rows: ChapterMemoryRow[],
  currentVolumeTitle?: string,
) {
  const groups = new Map<string, ChapterMemoryRow[]>();

  for (const row of rows) {
    const volumeTitle = row.volumeTitle.trim();

    if (!volumeTitle) {
      continue;
    }

    const current = groups.get(volumeTitle) ?? [];
    current.push(row);
    groups.set(volumeTitle, current);
  }

  const normalizedCurrentVolume = normalizeText(currentVolumeTitle);
  const groupEntries = Array.from(groups.entries())
    .filter(([volumeTitle]) => normalizeText(volumeTitle) !== normalizedCurrentVolume)
    .sort((left, right) => compareChapterRows(left[1][left[1].length - 1], right[1][right[1].length - 1]))
    .reverse()
    .slice(0, 6);

  return groupEntries.map(([volumeTitle, groupRows]) => {
    const sortedRows = [...groupRows].sort(compareChapterRows);
    const firstRow = sortedRows[0];
    const lastRow = sortedRows[sortedRows.length - 1];
    const highlights = createUniqueList(
      sortedRows
        .slice(-2)
        .flatMap((row) => [row.summary || row.summaryExcerpt, row.hook]),
    )
      .map((item) => truncateText(item, 80))
      .slice(0, 2);
    const range =
      firstRow.chapterOrder > 0 && lastRow.chapterOrder > 0
        ? `第${firstRow.chapterOrder}-${lastRow.chapterOrder}章`
        : `累计 ${sortedRows.length} 章`;

    const entry: VolumeRecapBlockEntry = {
      volumeTitle,
      sortOrder: lastRow.chapterOrder > 0 ? lastRow.chapterOrder : 0,
      block: [
        `- ${volumeTitle}`,
        `范围：${range}`,
        `提要：${highlights.join('；') || '暂无稳定卷级摘要'}`,
      ].join('\n'),
    };

    return entry;
  });
}

function buildVolumeRecapEntriesFromStoredRecaps(
  rows: GenerationVolumeRecapRecord[],
  currentVolumeTitle?: string,
) {
  const normalizedCurrentVolume = normalizeText(currentVolumeTitle);

  return rows
    .filter((row) => normalizeText(row.volumeTitle) !== normalizedCurrentVolume)
    .slice(0, 6)
    .map((row) => {
      const range =
        row.startChapterOrder > 0 && row.endChapterOrder > 0
          ? `第${row.startChapterOrder}-${row.endChapterOrder}章`
          : `累计 ${row.chapterCount} 章`;

      const entry: VolumeRecapBlockEntry = {
        volumeTitle: row.volumeTitle,
        sortOrder: row.endChapterOrder > 0 ? row.endChapterOrder : 0,
        block: [
          `- ${row.volumeTitle}`,
          `范围：${range}`,
          `提要：${truncateText(row.summary, 180) || '暂无稳定卷级摘要'}`,
        ].join('\n'),
      };

      return entry;
    });
}

function mergeVolumeRecapBlocks(
  storedEntries: VolumeRecapBlockEntry[],
  fallbackEntries: VolumeRecapBlockEntry[],
) {
  const merged = new Map<string, VolumeRecapBlockEntry>();

  for (const entry of storedEntries) {
    merged.set(normalizeText(entry.volumeTitle), entry);
  }

  for (const entry of fallbackEntries) {
    const key = normalizeText(entry.volumeTitle);

    if (!merged.has(key)) {
      merged.set(key, entry);
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => right.sortOrder - left.sortOrder)
    .slice(0, 6)
    .map((entry) => entry.block);
}

function buildCurrentVolumeSnapshotBlocks(
  rows: ChapterMemoryRow[],
  currentVolumeTitle?: string,
) {
  const normalizedCurrentVolume = normalizeText(currentVolumeTitle);

  if (!normalizedCurrentVolume) {
    return [] as string[];
  }

  const currentVolumeRows = rows.filter((row) => normalizeText(row.volumeTitle) === normalizedCurrentVolume);

  if (currentVolumeRows.length === 0) {
    return [] as string[];
  }

  const recentRows = currentVolumeRows.slice(-5);
  const highlightTexts = createUniqueList(
    recentRows.flatMap((row) => [row.summary || row.summaryExcerpt, row.hook]),
  )
    .map((item) => truncateText(item, 90))
    .slice(0, 4);
  const firstRow = currentVolumeRows[0];
  const lastRow = currentVolumeRows[currentVolumeRows.length - 1];
  const range =
    firstRow.chapterOrder > 0 && lastRow.chapterOrder > 0
      ? `第${firstRow.chapterOrder}-${lastRow.chapterOrder}章`
      : `累计 ${currentVolumeRows.length} 章`;

  return [
    [
      `- ${currentVolumeTitle}`,
      `范围：${range}`,
      `近期推进：${highlightTexts.join('；') || '暂无稳定推进摘要'}`,
    ].join('\n'),
  ];
}

function buildQuestionPoolHintBlocks(input: {
  rows: QuestionPoolRecord[];
  selectedThreadLedgerRows: ThreadLedgerRecord[];
  requiredForeshadowTitles?: string[];
  chapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
}) {
  const normalizedThreadSet = new Set(
    input.selectedThreadLedgerRows
      .map((row) => normalizeText(row.name))
      .filter(Boolean),
  );
  const normalizedForeshadowSet = new Set(
    (input.requiredForeshadowTitles ?? [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );
  const chapterHintHaystack = [
    input.chapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
    ...(input.outline?.immutableFacts ?? []),
  ]
    .join('\n')
    .toLowerCase();

  const candidates = input.rows
    .filter((row) => row.status !== 'answered')
    .map((row): QuestionPoolHintCandidate => {
      const normalizedQuestion = normalizeText(row.question);
      const normalizedClue = normalizeText(row.currentClue);
      const normalizedThread = normalizeText(row.belongsToThreadName);
      const clueHit =
        (normalizedQuestion && chapterHintHaystack.includes(normalizedQuestion)) ||
        (normalizedClue && chapterHintHaystack.includes(normalizedClue));
      const threadHit = normalizedThread ? normalizedThreadSet.has(normalizedThread) : false;
      const foreshadowHit = Array.from(normalizedForeshadowSet).some((item) =>
        normalizedQuestion.includes(item) || normalizedClue.includes(item),
      );
      const forced = clueHit || threadHit || foreshadowHit;

      return {
        row,
        forced,
        score:
          (row.status === 'open' ? 20 : 10) +
          (forced ? 120 : 0) +
          (clueHit ? 35 : 0) +
          (threadHit ? 40 : 0) +
          (foreshadowHit ? 30 : 0) +
          (row.currentClue ? 15 : 0) +
          (row.finalAnswerSummary ? 10 : 0),
      };
    })
    .filter((item) => item.forced || item.score >= 70)
    .sort((left, right) => {
      if (left.forced !== right.forced) {
        return left.forced ? -1 : 1;
      }

      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return right.row.updatedAt.localeCompare(left.row.updatedAt);
    })
    .slice(0, GENERATION_CONTEXT_LIMITS.questionPoolHintBlockMax);

  return candidates.map((candidate, index) => {
    const shouldRenderFull = index < GENERATION_CONTEXT_LIMITS.questionPoolHintFullBlockMax;

    if (!shouldRenderFull) {
      const compactParts = [];

      if (candidate.row.currentClue) {
        compactParts.push(`当前线索：${truncateText(candidate.row.currentClue, 28)}`);
      }

      if (candidate.row.expectedRevealWindow) {
        compactParts.push(`窗口：${truncateText(candidate.row.expectedRevealWindow, 18)}`);
      }

      return `- 未解问题提醒：${candidate.row.question}${compactParts.length > 0 ? `（${compactParts.join('；')}）` : ''}`;
    }

    const lines = [`- 未解问题提醒`, `问题：${truncateText(candidate.row.question, 120)}`];

    if (candidate.row.currentClue) {
      lines.push(`当前线索：${truncateText(candidate.row.currentClue, 120)}`);
    }

    if (candidate.row.expectedRevealWindow) {
      lines.push(`预计揭晓窗口：${truncateText(candidate.row.expectedRevealWindow, 80)}`);
    }

    if (candidate.row.finalAnswerSummary) {
      lines.push(`作者预设答案：${truncateText(candidate.row.finalAnswerSummary, 120)}`);
    }

    return lines.join('\n');
  });
}

function buildForeshadowBlocks(rows: CanonicalForeshadowRow[], requiredTitles: string[] = []) {
  const normalizedRequiredSet = new Set(requiredTitles.map((item) => normalizeText(item)).filter(Boolean));
  const enforceRequiredScope = normalizedRequiredSet.size > 0;

  return rows
    .filter((row) => {
      if (row.lifecycle !== 'active') {
        return false;
      }

      if (!enforceRequiredScope) {
        return true;
      }

      return normalizedRequiredSet.has(normalizeText(row.title));
    })
    .sort((left, right) => {
      const leftRequired = normalizedRequiredSet.has(normalizeText(left.title));
      const rightRequired = normalizedRequiredSet.has(normalizeText(right.title));

      if (leftRequired !== rightRequired) {
        return leftRequired ? -1 : 1;
      }

      return left.updatedAt.localeCompare(right.updatedAt);
    })
    .slice(0, 8)
    .map((row) => {
      const summary = truncateText(row.excerpt || row.notes || '暂无说明', 120);
      const sourceLabel = row.sourceChapterTitle || '未关联章节';
      const statusLabel =
        row.status === 'overdue' ? '超期' : row.status === 'activated' ? '已激活' : '已埋设';
      const lines = [`- ${row.title}`, `状态：激活 / ${statusLabel}`, `来源：${sourceLabel}`, `摘要：${summary}`];

      if (row.supplementTexts.length > 0) {
        lines.push(`补充：${previewSupplementTexts(row.supplementTexts, 60)}`);
      }

      if (row.resolvedChapterTitle) {
        lines.push(`预期回收：${row.resolvedChapterTitle}`);
      }

      return lines.join('\n');
    });
}

function buildForeshadowPlanBlocks(input: {
  plans: ForeshadowPlanRecord[];
  activeForeshadowRows: CanonicalForeshadowRow[];
  requiredForeshadowTitles?: string[];
}) {
  const activeForeshadowById = new Map<string, CanonicalForeshadowRow>();
  const activeForeshadowByTitle = new Map<string, CanonicalForeshadowRow>();

  for (const row of input.activeForeshadowRows.filter((candidate) => candidate.lifecycle === 'active')) {
    const idKey = normalizeText(row.id);
    const titleKey = normalizeText(row.title);

    if (idKey && !activeForeshadowById.has(idKey)) {
      activeForeshadowById.set(idKey, row);
    }

    if (titleKey && !activeForeshadowByTitle.has(titleKey)) {
      activeForeshadowByTitle.set(titleKey, row);
    }
  }

  const requiredTitleSet = new Set(
    (input.requiredForeshadowTitles ?? [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );
  const resolveMatchedForeshadow = (plan: ForeshadowPlanRecord) =>
    activeForeshadowById.get(normalizeText(plan.foreshadowId))
    ?? activeForeshadowByTitle.get(normalizeText(plan.foreshadowTitle))
    ?? null;

  const selectedPlans = input.plans
    .filter((plan) => {
      const matchedForeshadow = resolveMatchedForeshadow(plan);
      const normalizedTitle = normalizeText(plan.foreshadowTitle);
      const isRequired =
        requiredTitleSet.has(normalizedTitle)
        || (matchedForeshadow ? requiredTitleSet.has(normalizeText(matchedForeshadow.title)) : false);

      return (
        Boolean(matchedForeshadow)
        || isRequired
        || plan.importance === 'major'
      );
    })
    .sort((left, right) => {
      const leftMatchedRow = resolveMatchedForeshadow(left);
      const rightMatchedRow = resolveMatchedForeshadow(right);
      const leftMatched = Boolean(leftMatchedRow);
      const rightMatched = Boolean(rightMatchedRow);
      const leftRequired =
        requiredTitleSet.has(normalizeText(left.foreshadowTitle))
        || (leftMatchedRow ? requiredTitleSet.has(normalizeText(leftMatchedRow.title)) : false);
      const rightRequired =
        requiredTitleSet.has(normalizeText(right.foreshadowTitle))
        || (rightMatchedRow ? requiredTitleSet.has(normalizeText(rightMatchedRow.title)) : false);

      if (leftMatched !== rightMatched) {
        return leftMatched ? -1 : 1;
      }

      if (leftRequired !== rightRequired) {
        return leftRequired ? -1 : 1;
      }

      if (left.importance !== right.importance) {
        return left.importance === 'major' ? -1 : 1;
      }

      return left.updatedAt.localeCompare(right.updatedAt);
    })
    .slice(0, GENERATION_CONTEXT_LIMITS.foreshadowPlanBlockMax);

  return selectedPlans.map((plan, index) => {
    const matchedForeshadow = resolveMatchedForeshadow(plan);
    const resolvedForeshadowTitle = matchedForeshadow?.title?.trim() || plan.foreshadowTitle;
    const isRequired =
      requiredTitleSet.has(normalizeText(plan.foreshadowTitle))
      || (matchedForeshadow ? requiredTitleSet.has(normalizeText(matchedForeshadow.title)) : false);
    const shouldRenderFull =
      index < GENERATION_CONTEXT_LIMITS.foreshadowPlanFullBlockMax || isRequired || plan.importance === 'major';
    const statusLabel =
      matchedForeshadow
        ? matchedForeshadow.status === 'overdue'
          ? '超期'
          : matchedForeshadow.status === 'activated'
            ? '已激活'
            : matchedForeshadow.status === 'planted'
              ? '已埋设'
              : '已回收'
        : '未挂事实';

    if (!shouldRenderFull) {
      const compactParts = [`当前状态：${statusLabel}`];

      if (plan.activationWindow) {
        compactParts.push(`激活窗口：${truncateText(plan.activationWindow, 18)}`);
      }

      if (plan.resolveWindow) {
        compactParts.push(`回收窗口：${truncateText(plan.resolveWindow, 18)}`);
      }

      if (typeof plan.plannedResolveVolume === 'number' && plan.plannedResolveVolume > 0) {
        compactParts.push(`计划回收：第${plan.plannedResolveVolume}卷`);
      } else if (typeof plan.plannedActivateVolume === 'number' && plan.plannedActivateVolume > 0) {
        compactParts.push(`计划激活：第${plan.plannedActivateVolume}卷`);
      }

      if (plan.resolveCondition) {
        compactParts.push(`回收条件：${truncateText(plan.resolveCondition, 30)}`);
      } else if (plan.activationCondition) {
        compactParts.push(`激活条件：${truncateText(plan.activationCondition, 30)}`);
      }

      return `- ${resolvedForeshadowTitle}（${plan.type || '未分类'} / ${plan.importance === 'major' ? '核心伏笔' : '次级伏笔'}）：${compactParts.join('；')}`;
    }

    const lines = [
      `- ${resolvedForeshadowTitle}（${plan.type || '未分类'} / ${plan.importance === 'major' ? '核心伏笔' : '次级伏笔'}）`,
    ];

    if (matchedForeshadow) {
      lines.push(`当前状态：${statusLabel}`);
    }

    if (plan.activationWindow) {
      lines.push(`激活窗口：${truncateText(plan.activationWindow, 100)}`);
    }

    if (plan.resolveWindow) {
      lines.push(`回收窗口：${truncateText(plan.resolveWindow, 100)}`);
    }

    if (typeof plan.plannedActivateVolume === 'number' && plan.plannedActivateVolume > 0) {
      lines.push(`计划激活：第${plan.plannedActivateVolume}卷`);
    }

    if (typeof plan.plannedResolveVolume === 'number' && plan.plannedResolveVolume > 0) {
      lines.push(`计划回收：第${plan.plannedResolveVolume}卷`);
    }

    if (plan.resolveCondition) {
      lines.push(`回收条件：${truncateText(plan.resolveCondition, 120)}`);
    }

    if (plan.payoffEffect) {
      lines.push(`回收效果：${truncateText(plan.payoffEffect, 120)}`);
    }

    if (plan.activationCondition) {
      lines.push(`激活条件：${truncateText(plan.activationCondition, 100)}`);
    }

    return lines.join('\n');
  });
}

function countNormalizedMatches(values: string[], normalizedSet: Set<string>) {
  return values.reduce((count, value) => count + (normalizedSet.has(normalizeText(value)) ? 1 : 0), 0);
}

function buildThreadLedgerConflictKey(row: ThreadLedgerRecord) {
  return normalizeText(row.name) || normalizeText(row.coreQuestion) || row.id;
}

function cloneThreadLedgerRecord(row: ThreadLedgerRecord): ThreadLedgerRecord {
  return {
    ...row,
    relatedCharacterIds: [...row.relatedCharacterIds],
    relatedCharacterNames: [...row.relatedCharacterNames],
    relatedForeshadowIds: [...row.relatedForeshadowIds],
    relatedForeshadowTitles: [...row.relatedForeshadowTitles],
  };
}

function mergeThreadLedgerCandidateField(input: {
  target: CanonicalThreadLedgerCandidate;
  value: string;
  currentValue: string;
  label: string;
  assign: (value: string) => void;
}) {
  const trimmedValue = input.value.trim();

  if (!trimmedValue) {
    return;
  }

  if (!input.currentValue.trim()) {
    input.assign(trimmedValue);
    return;
  }

  if (normalizeText(trimmedValue) !== normalizeText(input.currentValue)) {
    pushUniqueSupplementText(input.target.supplementTexts, `${input.label}：${trimmedValue}`);
  }
}

function dedupeThreadLedgerCandidates(candidates: Array<{ row: ThreadLedgerRecord; score: number }>) {
  const canonicalCandidates: CanonicalThreadLedgerCandidate[] = [];
  const candidateIndex = new Map<string, CanonicalThreadLedgerCandidate>();

  for (const candidate of candidates) {
    const conflictKey = buildThreadLedgerConflictKey(candidate.row);

    if (!conflictKey) {
      continue;
    }

    const existing = candidateIndex.get(conflictKey);

    if (!existing) {
      const canonicalCandidate: CanonicalThreadLedgerCandidate = {
        row: cloneThreadLedgerRecord(candidate.row),
        score: candidate.score,
        supplementTexts: [],
      };
      canonicalCandidates.push(canonicalCandidate);
      candidateIndex.set(conflictKey, canonicalCandidate);
      continue;
    }

    existing.row.relatedCharacterIds = mergeUniqueTextValues(existing.row.relatedCharacterIds, candidate.row.relatedCharacterIds);
    existing.row.relatedCharacterNames = mergeUniqueTextValues(existing.row.relatedCharacterNames, candidate.row.relatedCharacterNames);
    existing.row.relatedForeshadowIds = mergeUniqueTextValues(existing.row.relatedForeshadowIds, candidate.row.relatedForeshadowIds);
    existing.row.relatedForeshadowTitles = mergeUniqueTextValues(existing.row.relatedForeshadowTitles, candidate.row.relatedForeshadowTitles);

    if (!existing.row.type.trim() && candidate.row.type.trim()) {
      existing.row.type = candidate.row.type.trim();
    }

    mergeThreadLedgerCandidateField({
      target: existing,
      value: candidate.row.coreQuestion,
      currentValue: existing.row.coreQuestion,
      label: '问题补充',
      assign: (value) => {
        existing.row.coreQuestion = value;
      },
    });
    mergeThreadLedgerCandidateField({
      target: existing,
      value: candidate.row.currentPhase,
      currentValue: existing.row.currentPhase,
      label: '阶段补充',
      assign: (value) => {
        existing.row.currentPhase = value;
      },
    });
    mergeThreadLedgerCandidateField({
      target: existing,
      value: candidate.row.nextTrigger,
      currentValue: existing.row.nextTrigger,
      label: '触发补充',
      assign: (value) => {
        existing.row.nextTrigger = value;
      },
    });
    mergeThreadLedgerCandidateField({
      target: existing,
      value: candidate.row.blockedBy,
      currentValue: existing.row.blockedBy,
      label: '卡点补充',
      assign: (value) => {
        existing.row.blockedBy = value;
      },
    });

    if (!existing.row.lastProgressAt.trim() && candidate.row.lastProgressAt.trim()) {
      existing.row.lastProgressAt = candidate.row.lastProgressAt.trim();
    }

    if (!existing.row.lastProgressChapterTitle.trim() && candidate.row.lastProgressChapterTitle.trim()) {
      existing.row.lastProgressChapterTitle = candidate.row.lastProgressChapterTitle.trim();
    }

    if (existing.row.lastProgressChapterOrder === null && candidate.row.lastProgressChapterOrder !== null) {
      existing.row.lastProgressChapterOrder = candidate.row.lastProgressChapterOrder;
    }

    if (existing.row.plannedResolveVolume === null && candidate.row.plannedResolveVolume !== null) {
      existing.row.plannedResolveVolume = candidate.row.plannedResolveVolume;
    }
  }

  return canonicalCandidates;
}

function buildPovPermissionConflictKey(row: PovPermissionRecord) {
  return row.povCharacterId?.trim() || normalizeText(row.povCharacterName) || row.id;
}

function formatPovPermissionScopeLabel(row: PovPermissionRecord, scopeLevel: PovPermissionScopeLevel) {
  if (scopeLevel === 'chapter') {
    return row.chapterTitle ? `章节 ${row.chapterTitle}` : '章节限制';
  }

  if (scopeLevel === 'milestone') {
    const milestoneLabel =
      typeof row.milestoneIndex === 'number' && Number.isFinite(row.milestoneIndex)
        ? `里程碑 ${row.milestoneIndex}`
        : '里程碑限制';
    return row.volumeTitle ? `${row.volumeTitle} / ${milestoneLabel}` : milestoneLabel;
  }

  return row.volumeTitle || '卷级限制';
}

function resolvePovPermissionScopeLevel(input: {
  row: PovPermissionRecord;
  volumeTitle?: string;
  chapterId?: string;
  milestoneIndex?: number | null;
}): PovPermissionScopeLevel | null {
  if (input.chapterId && input.row.chapterId === input.chapterId) {
    return 'chapter';
  }

  const normalizedVolumeKey = normalizeText(input.volumeTitle);

  if (!normalizedVolumeKey || normalizeText(input.row.volumeTitle) !== normalizedVolumeKey) {
    return null;
  }

  if (
    typeof input.milestoneIndex === 'number' &&
    Number.isFinite(input.milestoneIndex) &&
    !input.row.chapterId &&
    input.row.milestoneIndex === Math.max(0, Math.trunc(input.milestoneIndex))
  ) {
    return 'milestone';
  }

  if (!input.row.chapterId && input.row.milestoneIndex === null) {
    return 'volume';
  }

  return null;
}

function mergePovPermissionFieldWithSupplement(input: {
  currentValues: string[];
  nextValues: string[];
  label: string;
}) {
  const addedValues = input.nextValues.filter((value) =>
    !input.currentValues.some((item) => normalizeText(item) === normalizeText(value)),
  );

  return {
    mergedValues: mergeUniqueTextValues(input.currentValues, input.nextValues),
    addedValues,
    label: input.label,
  };
}

function buildPovPermissionSupplementText(input: {
  row: PovPermissionRecord;
  scopeLevel: PovPermissionScopeLevel;
  addedMustHide: string[];
  addedCanHint: string[];
  addedForbiddenReveal: string[];
}) {
  const parts: string[] = [];

  if (input.addedMustHide.length > 0) {
    parts.push(`禁止透露：${input.addedMustHide.join('、')}`);
  }

  if (input.addedCanHint.length > 0) {
    parts.push(`允许暗示：${input.addedCanHint.join('、')}`);
  }

  if (input.addedForbiddenReveal.length > 0) {
    parts.push(`禁止揭晓：${input.addedForbiddenReveal.join('、')}`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `${formatPovPermissionScopeLabel(input.row, input.scopeLevel)}补充：${parts.join('；')}`;
}

function buildCanonicalPovPermissionEntries(input: {
  rows: PovPermissionRecord[];
  volumeTitle?: string;
  chapterId?: string;
  milestoneIndex?: number | null;
}) {
  const scopePriority = (scopeLevel: PovPermissionScopeLevel) =>
    scopeLevel === 'chapter' ? 0 : scopeLevel === 'milestone' ? 1 : 2;
  const relevantRows = input.rows
    .map((row) => ({
      row,
      scopeLevel: resolvePovPermissionScopeLevel({
        row,
        volumeTitle: input.volumeTitle,
        chapterId: input.chapterId,
        milestoneIndex: input.milestoneIndex,
      }),
    }))
    .filter((item): item is { row: PovPermissionRecord; scopeLevel: PovPermissionScopeLevel } => item.scopeLevel !== null)
    .sort((left, right) => {
      const leftPriority = scopePriority(left.scopeLevel);
      const rightPriority = scopePriority(right.scopeLevel);

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return right.row.updatedAt.localeCompare(left.row.updatedAt);
    });
  const canonicalEntries: CanonicalPovPermissionEntry[] = [];
  const entryIndex = new Map<string, CanonicalPovPermissionEntry>();

  for (const item of relevantRows) {
    const conflictKey = buildPovPermissionConflictKey(item.row);

    if (!conflictKey) {
      continue;
    }

    const existing = entryIndex.get(conflictKey);

    if (!existing) {
      const canonicalEntry: CanonicalPovPermissionEntry = {
        row: {
          ...item.row,
          readerKnows: [...item.row.readerKnows],
          protagonistKnows: [...item.row.protagonistKnows],
          antagonistKnows: [...item.row.antagonistKnows],
          mustHide: [...item.row.mustHide],
          canHint: [...item.row.canHint],
          forbiddenReveal: [...item.row.forbiddenReveal],
        },
        scopeLevel: item.scopeLevel,
        mustHide: [...item.row.mustHide],
        canHint: [...item.row.canHint],
        forbiddenReveal: [...item.row.forbiddenReveal],
        supplementTexts: [],
      };
      canonicalEntries.push(canonicalEntry);
      entryIndex.set(conflictKey, canonicalEntry);
      continue;
    }

    const mustHideMerge = mergePovPermissionFieldWithSupplement({
      currentValues: existing.mustHide,
      nextValues: item.row.mustHide,
      label: '禁止透露',
    });
    const canHintMerge = mergePovPermissionFieldWithSupplement({
      currentValues: existing.canHint,
      nextValues: item.row.canHint,
      label: '允许暗示',
    });
    const forbiddenRevealMerge = mergePovPermissionFieldWithSupplement({
      currentValues: existing.forbiddenReveal,
      nextValues: item.row.forbiddenReveal,
      label: '本单元禁止揭晓',
    });

    existing.mustHide = mustHideMerge.mergedValues;
    existing.canHint = canHintMerge.mergedValues;
    existing.forbiddenReveal = forbiddenRevealMerge.mergedValues;

    const supplementText = buildPovPermissionSupplementText({
      row: item.row,
      scopeLevel: item.scopeLevel,
      addedMustHide: mustHideMerge.addedValues,
      addedCanHint: canHintMerge.addedValues,
      addedForbiddenReveal: forbiddenRevealMerge.addedValues,
    });

    if (supplementText) {
      pushUniqueSupplementText(existing.supplementTexts, supplementText);
    }
  }

  return canonicalEntries.sort((left, right) => {
    const leftPriority = scopePriority(left.scopeLevel);
    const rightPriority = scopePriority(right.scopeLevel);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.row.povCharacterName.localeCompare(right.row.povCharacterName, 'zh-CN');
  });
}

function selectThreadLedgerCandidates(input: {
  rows: ThreadLedgerRecord[];
  focusEntityNames: string[];
  requiredEntityNames?: string[];
  availableCharacterNames?: string[];
  requiredForeshadowTitles?: string[];
  currentChapterOrder: number | null;
  chapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
}) {
  const normalizedCharacterSet = new Set(
    createUniqueList([
      ...input.focusEntityNames,
      ...(input.requiredEntityNames ?? []),
      ...(input.availableCharacterNames ?? []),
    ])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );
  const normalizedForeshadowSet = new Set(
    (input.requiredForeshadowTitles ?? [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );
  const chapterHintHaystack = [
    input.chapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
  ]
    .join('\n')
    .toLowerCase();

  const selectedThreads = dedupeThreadLedgerCandidates(
    input.rows
    .map((row) => {
      const relatedCharacterMatchCount = countNormalizedMatches(row.relatedCharacterNames, normalizedCharacterSet);
      const relatedForeshadowMatchCount = countNormalizedMatches(row.relatedForeshadowTitles, normalizedForeshadowSet);
      const normalizedThreadName = normalizeText(row.name);
      const normalizedCoreQuestion = normalizeText(row.coreQuestion);
      const recentGap =
        typeof row.lastProgressChapterOrder === 'number' &&
        input.currentChapterOrder &&
        input.currentChapterOrder > row.lastProgressChapterOrder
          ? input.currentChapterOrder - row.lastProgressChapterOrder
          : null;
      const chapterHintHit =
        (normalizedThreadName ? chapterHintHaystack.includes(normalizedThreadName) : false) ||
        (normalizedCoreQuestion ? chapterHintHaystack.includes(normalizedCoreQuestion) : false);
      const hasDirectSignal =
        chapterHintHit ||
        relatedForeshadowMatchCount > 0 ||
        relatedCharacterMatchCount >= 2;
      const passesHeatGate =
        row.status !== 'resolved' && (
          row.status === 'active'
            ? row.audienceHeat >= 3 || (row.audienceHeat >= 2 && hasDirectSignal)
            : row.audienceHeat >= 4 || (row.audienceHeat >= 3 && hasDirectSignal)
        );
      const score =
        (row.status === 'active' ? 120 : 50) +
        row.audienceHeat * 20 +
        relatedCharacterMatchCount * 90 +
        relatedForeshadowMatchCount * 75 +
        (chapterHintHit ? 40 : 0) +
        (recentGap === null ? 0 : Math.max(0, 20 - recentGap));

      return {
        row,
        score,
        passesHeatGate,
      };
    })
    .filter((item) => item.passesHeatGate)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.row.status !== right.row.status) {
        return left.row.status === 'active' ? -1 : 1;
      }

      if (left.row.audienceHeat !== right.row.audienceHeat) {
        return right.row.audienceHeat - left.row.audienceHeat;
      }

      return right.row.updatedAt.localeCompare(left.row.updatedAt);
    })
  )
    .slice(0, GENERATION_CONTEXT_LIMITS.threadLedgerBlockMax);

  return selectedThreads;
}

function buildThreadLedgerBlocks(
  selectedThreads: CanonicalThreadLedgerCandidate[],
) {

  return selectedThreads.map(({ row, supplementTexts }, index) => {
      const statusLabel = row.status === 'dormant' ? '休眠' : '活跃';

      if (index >= GENERATION_CONTEXT_LIMITS.threadLedgerFullBlockMax) {
        const compactParts = [`当前阶段：${truncateText(row.currentPhase || row.coreQuestion || '暂无阶段说明', 42)}`];

        if (row.nextTrigger) {
          compactParts.push(`下一触发：${truncateText(row.nextTrigger, 28)}`);
        } else if (row.blockedBy) {
          compactParts.push(`当前卡点：${truncateText(row.blockedBy, 28)}`);
        }

        if (supplementTexts.length > 0) {
          compactParts.push(`补充：${previewSupplementTexts(supplementTexts, 24)}`);
        }

        return `- ${row.name}（${row.type || '未分类'} / ${statusLabel} / 热度 ${row.audienceHeat}）：${compactParts.join('；')}`;
      }

      const lines = [
        `- ${row.name}（${row.type || '未分类'} / ${statusLabel} / 热度 ${row.audienceHeat}）`,
        `核心问题：${truncateText(row.coreQuestion || '暂无核心问题', 120)}`,
        `当前阶段：${truncateText(row.currentPhase || '暂无阶段说明', 140)}`,
      ];

      if (row.lastProgressAt) {
        lines.push(`最近推进：${truncateText(row.lastProgressAt, 120)}`);
      }

      if (row.nextTrigger) {
        lines.push(`下一触发：${truncateText(row.nextTrigger, 120)}`);
      }

      if (row.blockedBy) {
        lines.push(`当前卡点：${truncateText(row.blockedBy, 100)}`);
      }

      if (typeof row.plannedResolveVolume === 'number' && row.plannedResolveVolume > 0) {
        lines.push(`预计收束卷：第${row.plannedResolveVolume}卷`);
      }

      if (supplementTexts.length > 0) {
        lines.push(`补充：${previewSupplementTexts(supplementTexts, 48)}`);
      }

      return lines.join('\n');
    });
}

function normalizeWorldStateTitle(value: string | null | undefined) {
  return normalizeText(value);
}

type WorldStateDimensionKey =
  | 'public_events'
  | 'secret_events'
  | 'power_balance_change'
  | 'institution_change'
  | 'rule_change'
  | 'rumor_state'
  | 'known_by_characters'
  | 'current_risks';

type WorldStateListField = 'publicEvents' | 'secretEvents' | 'knownByCharacterNames' | 'currentRisks';
type WorldStateScalarField = 'powerBalanceChange' | 'institutionChange' | 'ruleChange' | 'rumorState';

const WORLD_STATE_LIST_DIMENSIONS: ReadonlyArray<{
  field: WorldStateListField;
  dimension: WorldStateDimensionKey;
}> = [
  { field: 'publicEvents', dimension: 'public_events' },
  { field: 'secretEvents', dimension: 'secret_events' },
  { field: 'knownByCharacterNames', dimension: 'known_by_characters' },
  { field: 'currentRisks', dimension: 'current_risks' },
];

const WORLD_STATE_SCALAR_DIMENSIONS: ReadonlyArray<{
  field: WorldStateScalarField;
  dimension: WorldStateDimensionKey;
}> = [
  { field: 'powerBalanceChange', dimension: 'power_balance_change' },
  { field: 'institutionChange', dimension: 'institution_change' },
  { field: 'ruleChange', dimension: 'rule_change' },
  { field: 'rumorState', dimension: 'rumor_state' },
];

function buildWorldStateVolumeKey(row: Pick<WorldStateEntryRecord, 'volumeId' | 'volumeTitle'>) {
  return row.volumeId.trim() || normalizeWorldStateTitle(row.volumeTitle);
}

function buildWorldStateConflictKey(volumeKey: string, dimension: WorldStateDimensionKey) {
  return `world:${volumeKey}:${dimension}`;
}

function dedupeWorldStateListValues(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of values) {
    const trimmed = item.trim();
    const normalized = normalizeText(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

function pickLatestWorldStateRow(rows: WorldStateEntryRecord[]) {
  let winner: WorldStateEntryRecord | null = null;

  for (const row of rows) {
    if (!winner || row.updatedAt.localeCompare(winner.updatedAt) > 0) {
      winner = row;
    }
  }

  return winner;
}

function pickWorldStateScalarWinner(rows: WorldStateEntryRecord[], field: WorldStateScalarField) {
  let winner = '';
  let winnerUpdatedAt = '';

  for (const row of rows) {
    const value = row[field].trim();
    if (!value) {
      continue;
    }

    if (!winnerUpdatedAt || row.updatedAt.localeCompare(winnerUpdatedAt) > 0) {
      winner = value;
      winnerUpdatedAt = row.updatedAt;
    }
  }

  return winner;
}

function pickWorldStateListWinner(rows: WorldStateEntryRecord[], field: WorldStateListField) {
  let winner: string[] = [];
  let winnerUpdatedAt = '';

  for (const row of rows) {
    const values = dedupeWorldStateListValues(row[field]);
    if (values.length === 0) {
      continue;
    }

    if (!winnerUpdatedAt || row.updatedAt.localeCompare(winnerUpdatedAt) > 0) {
      winner = values;
      winnerUpdatedAt = row.updatedAt;
    }
  }

  return winner;
}

function mergeWorldStateListWinner(primary: string[], supplement: string[]) {
  return mergeUniqueTextValues(primary, supplement);
}

function buildWorldStateCanonicalEntry(input: {
  rows: WorldStateEntryRecord[];
  milestoneIndex?: number | null;
}) {
  const volumeLevelRows = input.rows.filter((row) => row.milestoneIndex === null);
  const volumeEntry = pickLatestWorldStateRow(volumeLevelRows);

  if (!volumeEntry) {
    return null;
  }

  const volumeKey = buildWorldStateVolumeKey(volumeEntry);
  if (!volumeKey) {
    return null;
  }

  const normalizedMilestoneIndex =
    typeof input.milestoneIndex === 'number' && Number.isFinite(input.milestoneIndex)
      ? Math.max(0, Math.trunc(input.milestoneIndex))
      : null;
  const milestoneRows =
    normalizedMilestoneIndex === null
      ? []
      : input.rows.filter(
        (row) =>
          buildWorldStateVolumeKey(row) === volumeKey && row.milestoneIndex === normalizedMilestoneIndex,
      );
  const dimensionValues = new Map<string, string | string[]>();

  for (const spec of WORLD_STATE_SCALAR_DIMENSIONS) {
    const conflictKey = buildWorldStateConflictKey(volumeKey, spec.dimension);
    const milestoneValue = pickWorldStateScalarWinner(milestoneRows, spec.field);
    const volumeValue = pickWorldStateScalarWinner(volumeLevelRows, spec.field);

    dimensionValues.set(conflictKey, milestoneValue || volumeValue);
  }

  for (const spec of WORLD_STATE_LIST_DIMENSIONS) {
    const conflictKey = buildWorldStateConflictKey(volumeKey, spec.dimension);
    const milestoneValue = pickWorldStateListWinner(milestoneRows, spec.field);
    const volumeValue = pickWorldStateListWinner(volumeLevelRows, spec.field);

    dimensionValues.set(
      conflictKey,
      milestoneValue.length > 0 ? mergeWorldStateListWinner(milestoneValue, volumeValue) : volumeValue,
    );
  }

  return {
    volumeTitle: volumeEntry.volumeTitle,
    publicEvents:
      (dimensionValues.get(buildWorldStateConflictKey(volumeKey, 'public_events')) as string[] | undefined) ?? [],
    secretEvents:
      (dimensionValues.get(buildWorldStateConflictKey(volumeKey, 'secret_events')) as string[] | undefined) ?? [],
    powerBalanceChange:
      (dimensionValues.get(buildWorldStateConflictKey(volumeKey, 'power_balance_change')) as string | undefined) ??
      '',
    institutionChange:
      (dimensionValues.get(buildWorldStateConflictKey(volumeKey, 'institution_change')) as string | undefined) ?? '',
    ruleChange:
      (dimensionValues.get(buildWorldStateConflictKey(volumeKey, 'rule_change')) as string | undefined) ?? '',
    rumorState:
      (dimensionValues.get(buildWorldStateConflictKey(volumeKey, 'rumor_state')) as string | undefined) ?? '',
    knownByCharacterNames:
      (dimensionValues.get(buildWorldStateConflictKey(volumeKey, 'known_by_characters')) as string[] | undefined) ??
      [],
    currentRisks:
      (dimensionValues.get(buildWorldStateConflictKey(volumeKey, 'current_risks')) as string[] | undefined) ?? [],
  };
}

function formatWorldStateEntryBlock(label: string, entry: {
  volumeTitle: string;
  publicEvents: string[];
  secretEvents: string[];
  powerBalanceChange: string;
  institutionChange: string;
  ruleChange: string;
  rumorState: string;
  knownByCharacterNames: string[];
  currentRisks: string[];
}) {
  const lines = [`- ${label}《${entry.volumeTitle || '未命名卷'}》`];

  if (entry.publicEvents.length > 0) {
    lines.push(`公开事件：${entry.publicEvents.join('；')}`);
  }

  if (entry.secretEvents.length > 0) {
    lines.push(`秘密事件：${entry.secretEvents.join('；')}`);
  }

  if (entry.powerBalanceChange) {
    lines.push(`势力变化：${truncateText(entry.powerBalanceChange, 120)}`);
  }

  if (entry.institutionChange) {
    lines.push(`制度变化：${truncateText(entry.institutionChange, 120)}`);
  }

  if (entry.ruleChange) {
    lines.push(`规则变化：${truncateText(entry.ruleChange, 120)}`);
  }

  if (entry.rumorState) {
    lines.push(`舆论状态：${truncateText(entry.rumorState, 120)}`);
  }

  if (entry.knownByCharacterNames.length > 0) {
    lines.push(`关键信息掌握者：${entry.knownByCharacterNames.join('、')}`);
  }

  if (entry.currentRisks.length > 0) {
    lines.push(`当前风险：${entry.currentRisks.join('；')}`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

function buildWorldStateDeltaBlocks(input: {
  rows: WorldStateEntryRecord[];
  volumeTitle?: string;
  milestoneIndex?: number | null;
}) {
  const volumeLevelRows = input.rows
    .filter((row) => row.milestoneIndex === null)
    .sort((left, right) => {
      if (left.volumeOrder !== right.volumeOrder) {
        return right.volumeOrder - left.volumeOrder;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });
  const normalizedCurrentVolumeTitle = normalizeWorldStateTitle(input.volumeTitle);

  if (!normalizedCurrentVolumeTitle) {
    return [] as string[];
  }

  const currentVolumeEntry =
    volumeLevelRows.find((row) => normalizeWorldStateTitle(row.volumeTitle) === normalizedCurrentVolumeTitle) ?? null;

  if (!currentVolumeEntry) {
    return [] as string[];
  }

  const currentVolumeKey = buildWorldStateVolumeKey(currentVolumeEntry);
  if (!currentVolumeKey) {
    return [] as string[];
  }

  const currentVolumeRows = input.rows.filter((row) => buildWorldStateVolumeKey(row) === currentVolumeKey);
  const previousVolumeEntry =
    volumeLevelRows.find((row) => row.volumeOrder < currentVolumeEntry.volumeOrder) ?? null;
  const previousVolumeRows = previousVolumeEntry
    ? input.rows.filter((row) => buildWorldStateVolumeKey(row) === buildWorldStateVolumeKey(previousVolumeEntry))
    : [];
  const currentCanonicalEntry = buildWorldStateCanonicalEntry({
    rows: currentVolumeRows,
    milestoneIndex: input.milestoneIndex ?? null,
  });
  const previousCanonicalEntry = buildWorldStateCanonicalEntry({
    rows: previousVolumeRows,
  });
  const currentBlock = currentCanonicalEntry
    ? formatWorldStateEntryBlock('世界状态-本卷变化', currentCanonicalEntry)
    : '';
  const previousBlock = previousVolumeEntry
    && previousCanonicalEntry
    ? formatWorldStateEntryBlock('世界状态-前一卷残留', previousCanonicalEntry)
    : '';

  return [currentBlock, previousBlock].filter(Boolean);
}

function buildAntagonistAgendaBlocks(input: {
  rows: AntagonistAgendaRecord[];
  focusEntityNames: string[];
  chapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
}) {
  const focusEntitySet = new Set(input.focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));
  const chapterHintHaystack = [
    input.chapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
  ]
    .join('\n')
    .toLowerCase();

  return input.rows
    .filter((row) => row.status === 'active')
    .map((row) => ({
      row,
      score:
        (focusEntitySet.has(normalizeText(row.characterName)) ? 100 : 0) +
        (normalizeText(row.characterName) && chapterHintHaystack.includes(normalizeText(row.characterName)) ? 60 : 0) +
        (row.triggerToStrike ? 20 : 0) +
        (row.currentAction ? 20 : 0) +
        (row.ifProtagonistDoesNothing ? 10 : 0),
    }))
    .filter((item) => item.score >= 25)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return left.row.characterName.localeCompare(right.row.characterName, 'zh-CN');
    })
    .slice(0, GENERATION_CONTEXT_LIMITS.antagonistAgendaBlockMax)
    .map(({ row }, index) => {
      const shouldRenderFull =
        index < GENERATION_CONTEXT_LIMITS.antagonistAgendaFullBlockMax ||
        focusEntitySet.has(normalizeText(row.characterName));

      if (!shouldRenderFull) {
        const compactParts = [];

        if (row.currentObjective) {
          compactParts.push(`目标：${truncateText(row.currentObjective, 26)}`);
        }

        if (row.currentAction) {
          compactParts.push(`动作：${truncateText(row.currentAction, 22)}`);
        }

        return `- ${row.characterName}${row.publicRole ? `（${row.publicRole}）` : ''}：${compactParts.join('；') || '当前仍在推进'}`;
      }

      const lines = [`- ${row.characterName}${row.publicRole ? `（${row.publicRole}）` : ''}`];
      if (row.currentObjective) {
        lines.push(`当前目标：${truncateText(row.currentObjective, 120)}`);
      }
      if (row.currentAction) {
        lines.push(`当前动作：${truncateText(row.currentAction, 120)}`);
      }
      if (row.triggerToStrike) {
        lines.push(`出手触发：${truncateText(row.triggerToStrike, 100)}`);
      }
      if (row.ifProtagonistDoesNothing) {
        lines.push(`主角不动时：${truncateText(row.ifProtagonistDoesNothing, 120)}`);
      }
      return lines.join('\n');
    });
}

function selectEffectivePovPermissions(input: {
  rows: PovPermissionRecord[];
  volumeTitle?: string;
  chapterId?: string;
  milestoneIndex?: number | null;
}) {
  return buildCanonicalPovPermissionEntries(input);
}

function buildPovPermissionBlocks(input: {
  rows: PovPermissionRecord[];
  volumeTitle?: string;
  chapterId?: string;
  milestoneIndex?: number | null;
}) {
  return selectEffectivePovPermissions(input)
    .slice(0, GENERATION_CONTEXT_LIMITS.povPermissionBlockMax)
    .map((entry, index) => {
      const row = entry.row;
      const scopeLabel =
        row.chapterTitle
          ? `章节 ${row.chapterTitle}`
          : entry.scopeLevel === 'milestone'
            ? `${row.volumeTitle || '当前卷'} / 里程碑 ${row.milestoneIndex ?? 0}`
            : row.volumeTitle || '当前卷';
      const shouldRenderFull =
        entry.scopeLevel === 'chapter' ||
        index < GENERATION_CONTEXT_LIMITS.povPermissionFullBlockMax;

      if (!shouldRenderFull) {
        const compactParts = [];

        if (entry.mustHide.length > 0) {
          compactParts.push(`禁止透露：${truncateText(entry.mustHide.join('；'), 28)}`);
        }

        if (entry.canHint.length > 0) {
          compactParts.push(`允许暗示：${truncateText(entry.canHint.join('；'), 28)}`);
        }

        return `- ${row.povCharacterName || '未命名视角'} / ${scopeLabel}${compactParts.length > 0 ? `：${compactParts.join('；')}` : ''}`;
      }

      const lines = [
        `- ${row.povCharacterName || '未命名视角'} / ${scopeLabel}`,
      ];
      if (entry.mustHide.length > 0) {
        lines.push(`禁止透露：${entry.mustHide.join('；')}`);
      }
      if (entry.canHint.length > 0) {
        lines.push(`允许暗示：${entry.canHint.join('；')}`);
      }
      if (entry.forbiddenReveal.length > 0) {
        lines.push(`本单元禁止揭晓：${entry.forbiddenReveal.join('；')}`);
      }
      if (entry.supplementTexts.length > 0) {
        lines.push(`补充：${previewSupplementTexts(entry.supplementTexts, 60)}`);
      }
      return lines.join('\n');
    });
}

function buildStructuredResourceContinuityCandidates(input: {
  rows: ResourceContinuityRecord[];
  focusEntityNames: string[];
  chapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
  highPressure: boolean;
}) {
  const focusEntitySet = new Set(input.focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));
  const chapterHintHaystack = [
    input.chapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
    ...(input.outline?.immutableFacts ?? []),
  ]
    .join('\n')
    .toLowerCase();
  const riskLabelMap: Record<ResourceContinuityRecord['riskLevel'], string> = {
    critical: '致命',
    high: '高',
    medium: '中',
    low: '低',
  };

  return input.rows
    .filter((row) => row.status === 'active' || row.status === 'permanent')
    .map((row) => {
      const hintTerms = getResourceContinuityHintTerms(row.resourceType);
      const hintScore = hintTerms.reduce((total, term) => total + (countTextOccurrences(chapterHintHaystack, term) > 0 ? 18 : 0), 0);
      const riskScore =
        row.riskLevel === 'critical'
          ? 45
          : row.riskLevel === 'high'
            ? 30
            : row.riskLevel === 'medium'
              ? 15
              : 0;

      return {
        row,
        score:
          (focusEntitySet.has(normalizeText(row.ownerCharacterName)) ? 100 : 0) +
          (row.status === 'permanent' ? 30 : 0) +
          riskScore +
          hintScore +
          (input.highPressure && row.riskLevel !== 'low' ? 10 : 0),
      };
    })
    .filter((item) => item.score >= (input.highPressure ? 30 : 15))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return left.row.updatedAt.localeCompare(right.row.updatedAt);
    })
    .slice(0, input.highPressure ? 7 : 5)
    .map(({ row, score }, index): StructuredResourceContinuityCandidate => {
      const fullBlockMax = input.highPressure
        ? GENERATION_CONTEXT_LIMITS.resourceContinuityFullBlockMaxHighPressure
        : GENERATION_CONTEXT_LIMITS.resourceContinuityFullBlockMaxDefault;
      const shouldRenderCompact = index >= fullBlockMax && row.riskLevel !== 'critical';

      if (shouldRenderCompact) {
        const summary =
          row.currentState ||
          row.performanceImpact ||
          row.continuityRisk ||
          row.hiddenCost ||
          row.recoveryCondition ||
          '存在资源连续性压力';

        return {
          source: 'structured',
          row,
          block: `- ${row.ownerCharacterName || '未绑定角色'} / ${row.resourceType}（${riskLabelMap[row.riskLevel]}风险）：${truncateText(summary, 60)}`,
          sortScore: score,
        };
      }

      const lines = [`- ${row.ownerCharacterName || '未绑定角色'} / ${row.resourceType}`];
      lines.push(`风险级别：${riskLabelMap[row.riskLevel]}`);
      if (row.currentState) {
        lines.push(`当前状态：${truncateText(row.currentState, 120)}`);
      }
      if (row.performanceImpact) {
        lines.push(`行动限制：${truncateText(row.performanceImpact, 120)}`);
      }
      if (input.highPressure && row.lastConsumedAt) {
        lines.push(`最近消耗：${truncateText(row.lastConsumedAt, 80)}`);
      }
      if (input.highPressure && row.recoveryCondition) {
        lines.push(`恢复条件：${truncateText(row.recoveryCondition, 100)}`);
      }
      if (row.hiddenCost) {
        lines.push(`隐藏代价：${truncateText(row.hiddenCost, 100)}`);
      }
      if (row.continuityRisk) {
        lines.push(`连续性风险：${truncateText(row.continuityRisk, 100)}`);
      }
      return {
        source: 'structured',
        row,
        block: lines.join('\n'),
        sortScore: score,
      };
    });
}

function buildResourceStateChapterLabel(chapterOrder: number, chapterTitle: string) {
  if (chapterOrder <= 0) {
    return chapterTitle.trim() || '未知章节';
  }

  const trimmedTitle = chapterTitle.trim();
  const prefix = `第${chapterOrder}章`;

  if (trimmedTitle.startsWith(prefix)) {
    return trimmedTitle;
  }

  return `${prefix} ${trimmedTitle}`;
}

function formatResourceStateContinuityBlock(row: ResourceStateRow) {
  const chapterLabel = buildResourceStateChapterLabel(row.chapterOrder, row.chapterTitle);
  return `- ${chapterLabel} ${row.entityName || '未命名资源'} / ${row.field || '状态'}：${row.oldValue || '未知'} -> ${row.newValue || '未知'}`;
}

function buildRuntimeResourceContinuityCandidates(
  rows: ResourceStateRow[],
  currentChapterOrder: number | null,
) {
  return rows
    .filter((row) => {
      if (currentChapterOrder === null) {
        return true;
      }

      return row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder;
    })
    .sort((left, right) => {
      if (left.chapterOrder !== right.chapterOrder) {
        return right.chapterOrder - left.chapterOrder;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .map(
      (row): RuntimeResourceContinuityCandidate => ({
        source: 'runtime',
        row,
        block: formatResourceStateContinuityBlock(row),
        sortScore: row.chapterOrder > 0 ? row.chapterOrder : 0,
      }),
    );
}

function isHighPressureResourceScene(input: {
  chapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
}) {
  if (input.outline?.hookStrength === 'strong') {
    return true;
  }

  const haystack = [
    input.chapterTitle ?? '',
    input.outline?.goal ?? '',
    input.outline?.obstacle ?? '',
    input.outline?.cost ?? '',
    ...(input.outline?.beats ?? []),
    ...(input.outline?.immutableFacts ?? []),
  ]
    .join('\n');

  return /(追杀|围杀|突围|亡命|逃亡|审判|对峙|翻案|搜证|破局|借势|反噬|倒计时|期限|封锁|围捕|潜入|截杀)/u.test(haystack);
}

function buildWorkingMemoryBlocks(
  input: GenerationContextBuildInput,
  currentVolumeSnapshotBlocks: string[],
  activeForeshadowBlocks: string[],
  questionPoolHintBlocks: string[],
) {
  const includeActiveForeshadows = (input.requiredForeshadowTitles?.length ?? 0) === 0;
  const blocks = [
    input.previousSummary?.trim() ? `- 上章承接\n${truncateText(input.previousSummary.trim(), 180)}` : '',
    ...currentVolumeSnapshotBlocks,
    ...(includeActiveForeshadows ? activeForeshadowBlocks.map((block) => `- 激活伏笔\n${block}`) : []),
    ...questionPoolHintBlocks,
  ].filter(Boolean);

  return blocks;
}

function buildRelatedChapterBlocks(items: GenerationRetrievedChunk[]) {
  return items.map((item) => item.block);
}

function buildLightweightRecallItems(items: GenerationRetrievedChunk[]) {
  return items
    .filter(
      (item): item is GenerationRetrievedChunk & { sourceType: 'dormant_foreshadow' | 'volume_recap' } =>
        item.sourceType === 'dormant_foreshadow' || item.sourceType === 'volume_recap',
    )
    .map((item): LightweightRecallBlock => ({
      sourceType: item.sourceType,
      title: item.title,
      block: item.block,
      score: item.score,
      matchedPhrases: item.matchedTerms,
      matchedEntities: item.matchedEntityNames,
      scoreBreakdown: {
        phrase: item.scoreBreakdown.phrase,
        entity: item.scoreBreakdown.entity,
        recency: item.scoreBreakdown.recency,
      },
      updatedAt: item.updatedAt,
    }));
}

function buildEntityBlocks(entityRows: CanonicalEntityRow[], focusEntityNames: string[]) {
  const entityRowMap = new Map<string, CanonicalEntityRow>();

  for (const row of entityRows) {
    for (const term of getEntitySearchTerms(row)) {
      const normalizedTerm = normalizeText(term);

      if (normalizedTerm && !entityRowMap.has(normalizedTerm)) {
        entityRowMap.set(normalizedTerm, row);
      }
    }
  }

  return focusEntityNames
    .map((entityName) => entityRowMap.get(normalizeText(entityName)))
    .filter((row): row is CanonicalEntityRow => Boolean(row))
    .filter((row, index, rows) => {
      return rows.findIndex((candidate) => normalizeText(candidate.entityName) === normalizeText(row.entityName)) === index;
    })
    .slice(0, GENERATION_CONTEXT_LIMITS.entityBlockMax)
    .map((row) => {
      const lines = [`- ${row.entityName}${row.entityType ? `（${row.entityType}）` : ''}`];
      const genericFieldEntries = Object.entries(row.fields)
        .filter(([key]) =>
          !CHARACTER_STATIC_FIELD_LABELS.some(([fieldKey]) => fieldKey === key)
          && !isEntityDynamicFieldKey(key),
        )
        .map(([key, value]) => `${key}=${value}`)
        .slice(0, GENERATION_CONTEXT_LIMITS.entityFieldPreviewMax);
      const staticFieldEntries = CHARACTER_STATIC_FIELD_LABELS
        .map(([fieldKey, label]) => {
          const value = row.fields[fieldKey];
          return value ? `${label}：${value}` : '';
        })
        .filter(Boolean);

      if (row.description) {
        lines.push(`描述：${truncateText(row.description, GENERATION_CONTEXT_LIMITS.entityDescriptionMaxChars)}`);
      }

      if (row.aliases.length > 0) {
        lines.push(`别名：${row.aliases.slice(0, GENERATION_CONTEXT_LIMITS.entityTagPreviewMax).join(' / ')}`);
      }

      if (staticFieldEntries.length > 0) {
        lines.push(`【人格内核-不可改变】${staticFieldEntries.join('；')}`);
      }

      if (genericFieldEntries.length > 0) {
        lines.push(`关键状态：${genericFieldEntries.join('；')}`);
      }

      if (row.tags.length > 0) {
        lines.push(`标签：${row.tags.slice(0, GENERATION_CONTEXT_LIMITS.entityTagPreviewMax).join(' / ')}`);
      }

      if (row.lastSeenChapterTitle) {
        lines.push(`最近出现：${row.lastSeenChapterTitle}`);
      }

      if (row.supplementTexts.length > 0) {
        lines.push(`补充说明：${previewSupplementTexts(row.supplementTexts, 48)}`);
      }

      return lines.join('\n');
    });
}

function buildStableEntityHintSummary(row: GenerationEntityRow) {
  if (row.description.trim()) {
    return row.description.trim();
  }

  const staticRole = row.fields.static_role?.trim();
  if (staticRole) {
    return `角色定位：${staticRole}`;
  }

  for (const [fieldKey, label] of CHARACTER_STATIC_FIELD_LABELS) {
    const value = row.fields[fieldKey]?.trim();
    if (value) {
      return `${label}：${value}`;
    }
  }

  const genericStableField = Object.entries(row.fields).find(([key, value]) => {
    const trimmedValue = value.trim();
    return (
      Boolean(trimmedValue)
      && key !== 'static_role'
      && !CHARACTER_STATIC_FIELD_LABELS.some(([fieldKey]) => fieldKey === key)
      && !isEntityDynamicFieldKey(key)
    );
  });

  if (!genericStableField) {
    return '';
  }

  const [fieldKey, fieldValue] = genericStableField;
  return `${fieldKey}：${fieldValue.trim()}`;
}

function buildAvailableCharacterHintBlocks(
  entityRows: CanonicalEntityRow[],
  availableCharacterNames: string[],
  focusEntityNames: string[],
) {
  const normalizedFocusSet = new Set(focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));
  const entityRowMap = new Map<string, CanonicalEntityRow>();

  for (const row of entityRows) {
    for (const term of getEntitySearchTerms(row)) {
      const normalizedTerm = normalizeText(term);

      if (normalizedTerm && !entityRowMap.has(normalizedTerm)) {
        entityRowMap.set(normalizedTerm, row);
      }
    }
  }

  return createUniqueList(availableCharacterNames)
    .map((entityName) => entityRowMap.get(normalizeText(entityName)))
    .filter((row): row is CanonicalEntityRow => Boolean(row))
    .filter((row) => !normalizedFocusSet.has(normalizeText(row.entityName)))
    .filter((row, index, rows) => {
      return rows.findIndex((candidate) => normalizeText(candidate.entityName) === normalizeText(row.entityName)) === index;
    })
    .slice(0, GENERATION_CONTEXT_LIMITS.availableCharacterBlockMax)
    .map((row) => {
      const summary = buildStableEntityHintSummary(row);

      return [
        `- 候选人物：${row.entityName}${row.entityType ? `（${row.entityType}）` : ''}`,
        '弱提示：可用于分担对话、对照、施压或信息转手，但不要抢走必须出场人物的章节职责。',
        summary ? `当前抓手：${truncateText(summary, 80)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    });
}

function expandFocusEntityNamesByExplicitRelations(
  focusEntityNames: string[],
  relationSnapshots: GenerationRelationSnapshot[],
  allowDraftContext?: boolean,
) {
  const normalizedFocusSet = new Set(focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));

  if (normalizedFocusSet.size === 0 || relationSnapshots.length === 0) {
    return [] as string[];
  }

  return relationSnapshots
    .flatMap((relation) => {
      if (!allowDraftContext && relation.draft) {
        return [] as string[];
      }

      const sourceMatched = normalizedFocusSet.has(normalizeText(relation.sourceEntityName));
      const targetMatched = normalizedFocusSet.has(normalizeText(relation.targetEntityName));

      if (sourceMatched && relation.targetEntityName.trim()) {
        return [relation.targetEntityName.trim()];
      }

      if (targetMatched && relation.sourceEntityName.trim()) {
        return [relation.sourceEntityName.trim()];
      }

      return [] as string[];
    })
    .filter(Boolean);
}

function buildExplicitRelationshipBlocks(input: {
  relationSnapshots: GenerationRelationSnapshot[];
  focusEntityNames: string[];
  allowDraftContext?: boolean;
}) {
  const normalizedFocusSet = new Set(input.focusEntityNames.map((item) => normalizeText(item)).filter(Boolean));

  if (normalizedFocusSet.size === 0 || input.relationSnapshots.length === 0) {
    return {
      blocks: [] as string[],
      coverageKeys: new Set<string>(),
    };
  }

  const blocks: string[] = [];
  const coverageKeys = new Set<string>();

  for (const relation of input.relationSnapshots) {
    if (!input.allowDraftContext && relation.draft) {
      continue;
    }

    const sourceName = relation.sourceEntityName.trim();
    const targetName = relation.targetEntityName.trim();
    const focusMatched =
      normalizedFocusSet.has(normalizeText(sourceName)) || normalizedFocusSet.has(normalizeText(targetName));

    if (!focusMatched || !sourceName || !targetName || !relation.relationType.trim()) {
      continue;
    }

    coverageKeys.add(buildRelationPairKey(sourceName, targetName));
    blocks.push(
      [
        `- 显式关系真源：${sourceName} <-> ${targetName}（${relation.relationType.trim()}）`,
        relation.description.trim() ? `关系本质：${truncateText(relation.description.trim(), 120)}` : '',
        relation.origin.trim() ? `建立原因：${truncateText(relation.origin.trim(), 80)}` : '',
        relation.currentStance.trim() ? `当前态度：${relation.currentStance.trim()}` : '',
        relation.currentIntensity > 0 ? `当前强度：${relation.currentIntensity}` : '',
        relation.stanceReason.trim() ? `态度锚点：${truncateText(relation.stanceReason.trim(), 80)}` : '',
        relation.draft ? '状态：草案' : '状态：已确认',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    if (blocks.length >= GENERATION_CONTEXT_LIMITS.entityBlockMax) {
      break;
    }
  }

  return {
    blocks,
    coverageKeys,
  };
}

function filterAutomaticRelationshipBlocksByExplicitCoverage(
  blocks: string[],
  relationSnapshots: GenerationRelationSnapshot[],
  coverageKeys: Set<string>,
) {
  if (blocks.length === 0 || coverageKeys.size === 0) {
    return blocks;
  }

  const [headerBlock, ...detailBlocks] = blocks;
  const filteredDetailBlocks = detailBlocks.filter((block) => {
    return !relationSnapshots.some((relation) => {
      const pairKey = buildRelationPairKey(relation.sourceEntityName, relation.targetEntityName);

      return (
        coverageKeys.has(pairKey) &&
        block.includes(relation.sourceEntityName) &&
        block.includes(relation.targetEntityName)
      );
    });
  });

  if (filteredDetailBlocks.length === 0) {
    return [] as string[];
  }

  return [headerBlock, ...filteredDetailBlocks];
}

function describeStructuredRelationshipOneHopReason(reason: GenerationStructuredRelationshipQueryReason) {
  if (reason === 'ok') {
    return '命中历史一度关系边';
  }

  if (reason === 'missing_chapter_context') {
    return '缺少有效章节上下文';
  }

  if (reason === 'no_focus_entity') {
    return '未识别可用焦点实体';
  }

  if (reason === 'high_noise') {
    return '候选关系噪音偏高';
  }

  return '历史关系不足';
}

function describeStructuredRelationshipTwoHopReason(reason: GenerationStructuredRelationshipQueryReason) {
  if (reason === 'ok') {
    return '命中稳定二度关系路径';
  }

  if (reason === 'missing_chapter_context') {
    return '缺少有效章节上下文';
  }

  if (reason === 'no_focus_entity') {
    return '未识别可用焦点实体';
  }

  if (reason === 'high_noise') {
    return '候选二度路径噪音偏高';
  }

  return '历史二度关系不足';
}

function buildStructuredRelationshipFallbackHintBlocks(
  chapterRows: ChapterMemoryRow[],
  currentChapterOrder: number,
  focusEntityNames: string[],
) {
  const normalizedFocusSet = new Set(focusEntityNames.map((item) => normalizeText(item)));

  if (normalizedFocusSet.size === 0 || currentChapterOrder <= 0) {
    return [] as string[];
  }

  const hintBlocks: string[] = [];
  const historicalRows = [...chapterRows]
    .filter((row) => row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder)
    .sort((left, right) => right.chapterOrder - left.chapterOrder);

  for (const row of historicalRows) {
    const matchedFocus = row.entitiesAppeared.filter((name) => normalizedFocusSet.has(normalizeText(name)));

    if (matchedFocus.length === 0) {
      continue;
    }

    const coAppeared = row.entitiesAppeared.filter((name) => !normalizedFocusSet.has(normalizeText(name)));

    if (coAppeared.length === 0) {
      continue;
    }

    hintBlocks.push(
      [
        `- 弱提示：${matchedFocus.join('、')} 与 ${coAppeared.slice(0, 4).join('、')} 同章出现`,
        `来源：${buildChapterLabel(row.chapterOrder, row.chapterTitle)}`,
      ].join('\n'),
    );

    if (hintBlocks.length >= 4) {
      break;
    }
  }

  return hintBlocks;
}

function buildStructuredRelationshipNoisyEdgeHintBlocks(edges: StructuredRelationshipEdgeCandidate[]) {
  return edges
    .slice(0, 1)
    .map((edge) =>
      [
        `- 弱结构提示：${edge.sourceEntityName} -> ${edge.targetEntityName}（${edge.relationshipType}）`,
        `来源：${edge.chapterTitle || '未知章节'}`,
        `证据：${truncateText(edge.evidence || edge.description, 80)}`,
        `置信：${edge.confidenceLevel} (${edge.confidence.toFixed(2)})`,
      ].join('\n'),
    );
}

function buildStructuredRelationshipOneHopSignalResult(input: {
  relationshipRows: RelationshipRow[];
  chapterRows: ChapterMemoryRow[];
  focusEntityNames: string[];
  currentChapterOrder: number | null;
  currentChapterId?: string;
}): StructuredRelationshipSignalResult {
  const uniqueFocusEntityNames = createUniqueList(input.focusEntityNames);
  const makeResult = (
    reason: GenerationStructuredRelationshipQueryReason,
    detailBlocks: string[],
  ): StructuredRelationshipSignalResult => {
    return {
      mode: reason === 'ok' ? 'graph_1hop' : 'degraded',
      reason,
      detailBlocks,
      acceptedEdges: [],
      acceptedPaths: [],
    };
  };

  if (input.currentChapterOrder === null || input.currentChapterOrder <= 0) {
    return makeResult('missing_chapter_context', [
      '- 弱提示：无法锁定当前章节顺序，暂不注入结构化关系事实。',
    ]);
  }

  if (uniqueFocusEntityNames.length === 0) {
    return makeResult('no_focus_entity', [
      '- 弱提示：未识别焦点实体，暂不注入结构化关系事实。',
    ]);
  }

  const normalizedFocusSet = new Set(uniqueFocusEntityNames.map((item) => normalizeText(item)));
  const dedupedEdges = new Map<string, StructuredRelationshipEdgeCandidate>();
  let candidateRelationships = 0;

  for (const row of input.relationshipRows) {
    if (row.chapterOrder <= 0 || row.chapterOrder >= input.currentChapterOrder) {
      continue;
    }

    if (input.currentChapterId && row.chapterId === input.currentChapterId) {
      continue;
    }

    const sourceMatched = normalizedFocusSet.has(normalizeText(row.sourceEntityName));
    const targetMatched = normalizedFocusSet.has(normalizeText(row.targetEntityName));

    if (!sourceMatched && !targetMatched) {
      continue;
    }

    const confidence = scoreStructuredRelationshipCandidate({
      sourceKind: row.sourceKind,
      relationshipType: row.relationshipType,
      hasTarget: Boolean(row.targetEntityName),
      evidence: row.evidence || row.description,
    });
    const confidenceLevel = resolveStructuredRelationshipConfidenceLevel(confidence);

    candidateRelationships += 1;

    if (confidenceLevel === 'low') {
      continue;
    }

    const edge: StructuredRelationshipEdgeCandidate = {
      sourceEntityName: row.sourceEntityName || '未知实体',
      targetEntityName: row.targetEntityName || '未知目标',
      relationshipType: row.relationshipType || '关系',
      sourceKind: row.sourceKind || 'unknown',
      evidence: row.evidence,
      description: row.description,
      chapterId: row.chapterId,
      chapterTitle: row.chapterTitle,
      chapterOrder: row.chapterOrder,
      confidence,
      confidenceLevel,
    };
    const dedupeKey = [
      normalizeText(edge.sourceEntityName),
      normalizeText(edge.targetEntityName),
      normalizeText(edge.relationshipType),
    ].join(':');
    const existing = dedupedEdges.get(dedupeKey);

    if (
      !existing ||
      edge.confidence > existing.confidence ||
      (edge.confidence === existing.confidence && edge.chapterOrder > existing.chapterOrder)
    ) {
      dedupedEdges.set(dedupeKey, edge);
    }
  }

  const acceptedEdges = Array.from(dedupedEdges.values())
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return right.chapterOrder - left.chapterOrder;
    })
    .slice(0, 8);

  if (acceptedEdges.length === 0) {
    const hintBlocks = buildStructuredRelationshipFallbackHintBlocks(
      input.chapterRows,
      input.currentChapterOrder,
      uniqueFocusEntityNames,
    );

    return makeResult(
      'no_historical_relationship',
      hintBlocks.length > 0
        ? hintBlocks
        : ['- 弱提示：未命中稳定历史关系边，请结合短期记忆与外部检索综合判断。'],
    );
  }

  const acceptedRatio = candidateRelationships > 0 ? acceptedEdges.length / candidateRelationships : 0;

  if (candidateRelationships >= 5 && acceptedRatio < 0.34) {
    const hintBlocks = buildStructuredRelationshipFallbackHintBlocks(
      input.chapterRows,
      input.currentChapterOrder,
      uniqueFocusEntityNames,
    );
    const noisyEdgeHintBlocks = buildStructuredRelationshipNoisyEdgeHintBlocks(acceptedEdges);

    return makeResult(
      'high_noise',
      [
        ...(noisyEdgeHintBlocks.length > 0 ? noisyEdgeHintBlocks : []),
        ...(hintBlocks.length > 0
          ? hintBlocks
          : ['- 弱提示：历史关系候选噪音偏高，当前不注入强关系事实。']),
      ],
    );
  }

  const edgeBlocks = acceptedEdges.map((edge) =>
    [
      `- 运行态关系观察：${edge.sourceEntityName} -> ${edge.targetEntityName}（${edge.relationshipType}）`,
      `来源：${edge.chapterTitle || '未知章节'}`,
      `证据：${truncateText(edge.evidence || edge.description, 100)}`,
      `置信：${edge.confidenceLevel} (${edge.confidence.toFixed(2)})`,
    ].join('\n'),
  );

  return {
    mode: 'graph_1hop',
    reason: 'ok',
    detailBlocks: edgeBlocks,
    acceptedEdges,
    acceptedPaths: [],
  };
}

function buildStructuredRelationshipTwoHopSignalResult(input: {
  relationshipRows: RelationshipRow[];
  focusEntityNames: string[];
  currentChapterOrder: number | null;
  currentChapterId?: string;
}): StructuredRelationshipSignalResult {
  const uniqueFocusEntityNames = createUniqueList(input.focusEntityNames);
  const makeResult = (
    reason: GenerationStructuredRelationshipQueryReason,
    detailBlocks: string[] = [],
  ): StructuredRelationshipSignalResult => ({
    mode: reason === 'ok' ? 'graph_2hop' : 'degraded',
    reason,
    detailBlocks,
    acceptedEdges: [],
    acceptedPaths: [],
  });

  if (input.currentChapterOrder === null || input.currentChapterOrder <= 0) {
    return makeResult('missing_chapter_context');
  }

  if (uniqueFocusEntityNames.length === 0) {
    return makeResult('no_focus_entity');
  }

  const normalizedFocusSet = new Set(uniqueFocusEntityNames.map((item) => normalizeText(item)));
  const candidateEdges: StructuredRelationshipEdgeCandidate[] = [];

  for (const row of input.relationshipRows) {
    if (row.chapterOrder <= 0 || row.chapterOrder >= input.currentChapterOrder) {
      continue;
    }

    if (input.currentChapterId && row.chapterId === input.currentChapterId) {
      continue;
    }

    const confidence = scoreStructuredRelationshipCandidate({
      sourceKind: row.sourceKind,
      relationshipType: row.relationshipType,
      hasTarget: Boolean(row.targetEntityName),
      evidence: row.evidence || row.description,
    });
    const confidenceLevel = resolveStructuredRelationshipConfidenceLevel(confidence);

    if (confidenceLevel === 'low') {
      continue;
    }

    candidateEdges.push({
      sourceEntityName: row.sourceEntityName || '未知实体',
      targetEntityName: row.targetEntityName || '未知目标',
      relationshipType: row.relationshipType || '关系',
      sourceKind: row.sourceKind || 'unknown',
      evidence: row.evidence,
      description: row.description,
      chapterId: row.chapterId,
      chapterTitle: row.chapterTitle,
      chapterOrder: row.chapterOrder,
      confidence,
      confidenceLevel,
    });
  }

  const adjacency = new Map<string, StructuredRelationshipEdgeCandidate[]>();

  for (const edge of candidateEdges) {
    const sourceKey = normalizeText(edge.sourceEntityName);
    const targetKey = normalizeText(edge.targetEntityName);
    const sourceBucket = adjacency.get(sourceKey) ?? [];
    sourceBucket.push(edge);
    adjacency.set(sourceKey, sourceBucket);

    const targetBucket = adjacency.get(targetKey) ?? [];
    targetBucket.push(edge);
    adjacency.set(targetKey, targetBucket);
  }

  const dedupedPaths = new Map<string, StructuredRelationshipPathCandidate>();
  let candidatePaths = 0;

  for (const focusEntityName of uniqueFocusEntityNames) {
    const firstHopEdges = adjacency.get(normalizeText(focusEntityName)) ?? [];

    for (const firstHopEdge of firstHopEdges) {
      const viaEntityName = normalizeText(firstHopEdge.sourceEntityName) === normalizeText(focusEntityName)
        ? firstHopEdge.targetEntityName
        : firstHopEdge.sourceEntityName;
      const secondHopEdges = adjacency.get(normalizeText(viaEntityName)) ?? [];

      for (const secondHopEdge of secondHopEdges) {
        const targetEntityName = normalizeText(secondHopEdge.sourceEntityName) === normalizeText(viaEntityName)
          ? secondHopEdge.targetEntityName
          : secondHopEdge.sourceEntityName;

        if (!targetEntityName) {
          continue;
        }

        if (normalizeText(targetEntityName) === normalizeText(focusEntityName)) {
          continue;
        }

        if (normalizedFocusSet.has(normalizeText(targetEntityName))) {
          continue;
        }

        if (
          firstHopEdge.chapterId === secondHopEdge.chapterId
          && normalizeText(firstHopEdge.sourceEntityName) === normalizeText(secondHopEdge.sourceEntityName)
          && normalizeText(firstHopEdge.targetEntityName) === normalizeText(secondHopEdge.targetEntityName)
          && normalizeText(firstHopEdge.relationshipType) === normalizeText(secondHopEdge.relationshipType)
        ) {
          continue;
        }

        candidatePaths += 1;
        const confidence = Number(((firstHopEdge.confidence + secondHopEdge.confidence) / 2).toFixed(3));
        const confidenceLevel = resolveStructuredRelationshipConfidenceLevel(confidence);
        const pathCandidate: StructuredRelationshipPathCandidate = {
          focusEntityName,
          viaEntityName,
          targetEntityName,
          edgeA: firstHopEdge,
          edgeB: secondHopEdge,
          confidence,
          confidenceLevel,
        };
        const dedupeKey = [
          normalizeText(focusEntityName),
          normalizeText(viaEntityName),
          normalizeText(targetEntityName),
        ].join('->');
        const existing = dedupedPaths.get(dedupeKey);

        if (
          !existing ||
          pathCandidate.confidence > existing.confidence ||
          (
            pathCandidate.confidence === existing.confidence
            && Math.max(pathCandidate.edgeA.chapterOrder, pathCandidate.edgeB.chapterOrder)
              > Math.max(existing.edgeA.chapterOrder, existing.edgeB.chapterOrder)
          )
        ) {
          dedupedPaths.set(dedupeKey, pathCandidate);
        }
      }
    }
  }

  const acceptedPaths = Array.from(dedupedPaths.values())
    .filter((item) => item.confidenceLevel !== 'low')
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return Math.max(right.edgeA.chapterOrder, right.edgeB.chapterOrder)
        - Math.max(left.edgeA.chapterOrder, left.edgeB.chapterOrder);
    })
    .slice(0, 4);

  if (acceptedPaths.length === 0) {
    return makeResult('no_two_hop_relationship');
  }

  const acceptedRatio = candidatePaths > 0 ? acceptedPaths.length / candidatePaths : 0;

  if (candidatePaths >= 6 && acceptedRatio < 0.34) {
    return makeResult('high_noise');
  }

  const pathBlocks = acceptedPaths.map((path) =>
    [
      `- 二跳路径：${path.focusEntityName} -> ${path.viaEntityName} -> ${path.targetEntityName}`,
      `关系链：${path.focusEntityName} 与 ${path.viaEntityName}（${path.edgeA.relationshipType}）；${path.viaEntityName} 与 ${path.targetEntityName}（${path.edgeB.relationshipType}）`,
      `来源：${path.edgeA.chapterTitle || '未知章节'} -> ${path.edgeB.chapterTitle || '未知章节'}`,
      `置信：${path.confidenceLevel} (${path.confidence.toFixed(2)})`,
    ].join('\n'),
  );

  return {
    mode: 'graph_2hop',
    reason: 'ok',
    detailBlocks: pathBlocks,
    acceptedEdges: [],
    acceptedPaths,
  };
}

function buildStructuredRelationshipContextResult(input: {
  relationshipRows: RelationshipRow[];
  chapterRows: ChapterMemoryRow[];
  focusEntityNames: string[];
  currentChapterOrder: number | null;
  currentChapterId?: string;
}): StructuredRelationshipContextResult {
  const uniqueFocusEntityNames = createUniqueList(input.focusEntityNames);
  const focusLabel = uniqueFocusEntityNames.join('、') || '无';
  const oneHopResult = buildStructuredRelationshipOneHopSignalResult(input);
  const shouldEvaluateTwoHop = oneHopResult.mode !== 'graph_1hop' || oneHopResult.detailBlocks.length <= 2;
  const twoHopResult = shouldEvaluateTwoHop
    ? buildStructuredRelationshipTwoHopSignalResult(input)
    : null;

  if (oneHopResult.mode === 'graph_1hop') {
    const oneHopEntityNames = new Set(
      oneHopResult.acceptedEdges.flatMap((edge) => [
        normalizeText(edge.sourceEntityName),
        normalizeText(edge.targetEntityName),
      ]),
    );
    const twoHopEvaluationLine =
      twoHopResult
        ? twoHopResult.mode === 'graph_2hop'
          ? '补充评估：ok（命中二度路径，但未形成新增实体链）'
          : `补充评估：${twoHopResult.reason}（${describeStructuredRelationshipTwoHopReason(twoHopResult.reason)}）`
        : null;
    const twoHopSupplementBlocks =
      twoHopResult?.mode === 'graph_2hop'
        ? twoHopResult.acceptedPaths
            .filter((path) =>
              !(
                oneHopEntityNames.has(normalizeText(path.focusEntityName)) &&
                oneHopEntityNames.has(normalizeText(path.viaEntityName)) &&
                oneHopEntityNames.has(normalizeText(path.targetEntityName))
              ),
            )
            .slice(0, Math.min(2, Math.max(0, 3 - oneHopResult.detailBlocks.length)))
            .map((path) =>
              [
                `- 二跳路径：${path.focusEntityName} -> ${path.viaEntityName} -> ${path.targetEntityName}`,
                `关系链：${path.focusEntityName} 与 ${path.viaEntityName}（${path.edgeA.relationshipType}）；${path.viaEntityName} 与 ${path.targetEntityName}（${path.edgeB.relationshipType}）`,
                `来源：${path.edgeA.chapterTitle || '未知章节'} -> ${path.edgeB.chapterTitle || '未知章节'}`,
                `置信：${path.confidenceLevel} (${path.confidence.toFixed(2)})`,
              ].join('\n'),
            )
        : [];
    const headerBlock = [
      `- 命中模式：${twoHopSupplementBlocks.length > 0 ? 'graph_1hop（主信号，补充二度路径）' : 'graph_1hop（结构化强信号）'}`,
      '注入层：relationships',
      `原因：${oneHopResult.reason}（${describeStructuredRelationshipOneHopReason(oneHopResult.reason)}）`,
      `焦点实体：${focusLabel}`,
      `接入策略：${twoHopSupplementBlocks.length > 0 ? '一度关系优先，补充少量二度路径。' : '一度关系优先。'}`,
      ...(twoHopSupplementBlocks.length > 0 && twoHopResult
        ? [`补充评估：${twoHopResult.reason}（${describeStructuredRelationshipTwoHopReason(twoHopResult.reason)}）`]
        : twoHopEvaluationLine
          ? [twoHopEvaluationLine]
          : []),
    ].join('\n');
    const detailBlocks = [...oneHopResult.detailBlocks, ...twoHopSupplementBlocks];

    return {
      mode: 'graph_1hop',
      reason: oneHopResult.reason,
      signalCount: detailBlocks.length,
      detailBlocks,
      blocks: [headerBlock, ...detailBlocks],
    };
  }

  if (twoHopResult?.mode === 'graph_2hop') {
    const headerBlock = [
      '- 命中模式：graph_2hop（补位强信号）',
      '注入层：relationships',
      `原因：${twoHopResult.reason}（${describeStructuredRelationshipTwoHopReason(twoHopResult.reason)}）`,
      `焦点实体：${focusLabel}`,
      '接入策略：一度关系不足时，改用二度路径补位。',
      `补位评估：一度 ${oneHopResult.reason}（${describeStructuredRelationshipOneHopReason(oneHopResult.reason)}）`,
    ].join('\n');

    return {
      mode: 'graph_2hop',
      reason: twoHopResult.reason,
      signalCount: twoHopResult.detailBlocks.length,
      detailBlocks: twoHopResult.detailBlocks,
      blocks: [headerBlock, ...twoHopResult.detailBlocks],
    };
  }

  const headerBlock = [
    '- 命中模式：degraded（仅弱提示）',
    '注入层：relationships',
    `原因：${oneHopResult.reason}（${describeStructuredRelationshipOneHopReason(oneHopResult.reason)}）`,
    `焦点实体：${focusLabel}`,
    '接入策略：一度与二度都未形成稳定强信号。',
    ...(twoHopResult
      ? [`补位评估：${twoHopResult.reason}（${describeStructuredRelationshipTwoHopReason(twoHopResult.reason)}）`]
      : []),
  ].join('\n');

  return {
    mode: 'degraded',
    reason: oneHopResult.reason,
    signalCount: 0,
    detailBlocks: oneHopResult.detailBlocks,
    blocks: [headerBlock, ...oneHopResult.detailBlocks],
  };
}

export async function buildGenerationContextBundle(
  env: ServerEnv,
  input: GenerationContextBuildInput,
): Promise<GenerationContextBundleResult> {
  const chapterRows = loadChapterMemoryRows(env, input.projectId);
  const currentChapterOrder = resolveCurrentChapterOrder(input, chapterRows);
  const historicalRows = filterHistoricalChapters(input, chapterRows, currentChapterOrder);
  const recentSummaryRows = historicalRows.slice(-20).reverse();
  const recentTextRows = loadRecentTextRows(env, input.projectId)
    .filter((row) => {
      if (input.chapterId && row.chapterId === input.chapterId) {
        return false;
      }

      if (currentChapterOrder !== null) {
        return row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder;
      }

      return true;
    })
    .sort((left, right) => {
      const leftOrder = left.chapterOrder > 0 ? left.chapterOrder : Number.MIN_SAFE_INTEGER;
      const rightOrder = right.chapterOrder > 0 ? right.chapterOrder : Number.MIN_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return rightOrder - leftOrder;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 5);
  const entityRows = mergeEntityRowsWithSnapshotPriority(
    loadEntityRows(env, input.projectId).filter((row) => input.allowDraftContext || !row.draft),
    input.entitySnapshot,
  ).filter((row) => input.allowDraftContext || !row.draft);
  const relationshipRows = loadRelationshipRows(env, input.projectId);
  const resourceStateRows = loadResourceStateRows(env, input.projectId);
  const storedVolumeRecaps = listGenerationVolumeRecaps(env, input.projectId);
  const foreshadowPlanRows = listForeshadowPlans(env, {
    projectId: input.projectId,
  });
  const worldStateRows = listWorldStateEntries(env, {
    projectId: input.projectId,
  });
  const antagonistAgendaRows = listAntagonistAgendas(env, {
    projectId: input.projectId,
  });
  const questionPoolRows = listQuestionPools(env, {
    projectId: input.projectId,
  });
  const povPermissionRows = listPovPermissions(env, {
    projectId: input.projectId,
  });
  const structuredResourceContinuityRows = listResourceContinuities(env, {
    projectId: input.projectId,
  });
  const threadLedgerRows = listThreadLedgers(env, {
    projectId: input.projectId,
  });
  const storedForeshadowRows = mergeForeshadowRowsWithSnapshotPriority({
    storedRows: listGenerationForeshadows(env, input.projectId).map(
      (row): ForeshadowRow => ({
        id: row.id,
        title: row.title,
        excerpt: row.excerpt,
        notes: row.notes,
        status: row.status,
        lifecycle: deriveGenerationForeshadowLifecycle(row, currentChapterOrder),
        sourceChapterOrder: row.sourceChapterOrder,
        sourceChapterTitle: row.sourceChapterTitle,
        resolvedChapterTitle: row.resolvedChapterTitle,
        updatedAt: row.updatedAt,
      }),
    ),
    chapterRows,
    currentChapterOrder,
    foreshadowSnapshots: input.foreshadowSnapshot,
  });
  const seedFocusEntityNames = createUniqueList([
    ...(input.requiredEntityNames ?? []),
    ...selectFocusEntityNames(input, chapterRows, entityRows),
  ]);
  const focusEntityNames = createUniqueList([
    ...seedFocusEntityNames,
    ...expandFocusEntityNamesByExplicitRelations(seedFocusEntityNames, input.relationSnapshot ?? [], input.allowDraftContext),
  ]);
  const queryPhrases = buildQueryPhrases(input);
  const fallbackContext = parseFallbackContextBundle(input.fallbackContextBundle);
  const volumeRecapBlocks = mergeVolumeRecapBlocks(
    buildVolumeRecapEntriesFromStoredRecaps(storedVolumeRecaps, input.volumeTitle),
    buildVolumeRecapEntriesFromHistoricalRows(historicalRows, input.volumeTitle),
  );
  const currentVolumeSnapshotBlocks = buildCurrentVolumeSnapshotBlocks(historicalRows, input.volumeTitle);
  const retrievalItems = await retrieveGenerationMemoryChunks(env, {
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterOrder: currentChapterOrder ?? undefined,
    volumeTitle: input.volumeTitle,
    queryPhrases,
    focusEntityNames,
    limit: GENERATION_CONTEXT_LIMITS.memoryRetrievalLimit,
    lightweightRecallConfig: input.lightweightRecallConfig,
  });
  const relatedChapterBlocks = buildRelatedChapterBlocks(retrievalItems);
  const lightweightRecallBlocks = buildLightweightRecallItems(retrievalItems);
  const entityBlocks = buildEntityBlocks(entityRows, focusEntityNames);
  const availableCharacterHintBlocks = buildAvailableCharacterHintBlocks(
    entityRows,
    input.availableCharacterNames ?? [],
    focusEntityNames,
  );
  const relationshipFocusEntityNames = selectStructuredRelationshipFocusEntityNames(
    input,
    chapterRows,
    focusEntityNames,
  );
  const structuredRelationshipResult = buildStructuredRelationshipContextResult({
    relationshipRows,
    chapterRows,
    focusEntityNames: relationshipFocusEntityNames,
    currentChapterOrder,
    currentChapterId: input.chapterId,
  });
  const explicitRelationshipResult = buildExplicitRelationshipBlocks({
    relationSnapshots: input.relationSnapshot ?? [],
    focusEntityNames,
    allowDraftContext: input.allowDraftContext,
  });
  const automaticRelationshipBlocks =
    structuredRelationshipResult.mode === 'degraded'
      ? []
      : filterAutomaticRelationshipBlocksByExplicitCoverage(
          structuredRelationshipResult.blocks,
          input.relationSnapshot ?? [],
          explicitRelationshipResult.coverageKeys,
        );
  const relationshipBlocks = [
    ...explicitRelationshipResult.blocks,
    ...automaticRelationshipBlocks,
  ];
  const serverForeshadowBlocks = buildForeshadowBlocks(
    storedForeshadowRows,
    input.requiredForeshadowTitles ?? [],
  );
  const activeForeshadowBlocks =
    input.preferStoredForeshadows ? serverForeshadowBlocks : fallbackContext.activeForeshadowBlocks;
  const foreshadowPlanBlocks = buildForeshadowPlanBlocks({
    plans: foreshadowPlanRows,
    activeForeshadowRows: storedForeshadowRows,
    requiredForeshadowTitles: input.requiredForeshadowTitles,
  });
  const runtimeResourceContinuityCandidates = buildRuntimeResourceContinuityCandidates(
    resourceStateRows,
    currentChapterOrder,
  );
  const highPressureResourceScene = isHighPressureResourceScene({
    chapterTitle: input.chapterTitle,
    outline: input.outline,
  });
  const structuredResourceContinuityCandidates = buildStructuredResourceContinuityCandidates({
    rows: structuredResourceContinuityRows,
    focusEntityNames,
    chapterTitle: input.chapterTitle,
    outline: input.outline,
    highPressure: highPressureResourceScene,
  });
  const resourceContinuityBlocks = dedupeResourceContinuityBlocks({
    structuredCandidates: structuredResourceContinuityCandidates,
    runtimeCandidates: runtimeResourceContinuityCandidates,
    limit: highPressureResourceScene ? 8 : 6,
  });
  const worldStateDeltaBlocks = buildWorldStateDeltaBlocks({
    rows: worldStateRows,
    volumeTitle: input.volumeTitle,
    milestoneIndex: input.milestoneIndex ?? null,
  });
  const antagonistAgendaBlocks = buildAntagonistAgendaBlocks({
    rows: antagonistAgendaRows,
    focusEntityNames,
    chapterTitle: input.chapterTitle,
    outline: input.outline,
  });
  const povPermissionBlocks = buildPovPermissionBlocks({
    rows: povPermissionRows,
    volumeTitle: input.volumeTitle,
    chapterId: input.chapterId,
    milestoneIndex: input.milestoneIndex ?? null,
  });
  const selectedThreadLedgerCandidates = selectThreadLedgerCandidates({
    rows: threadLedgerRows,
    focusEntityNames,
    requiredEntityNames: input.requiredEntityNames,
    availableCharacterNames: input.availableCharacterNames,
    requiredForeshadowTitles: input.requiredForeshadowTitles,
    currentChapterOrder,
    chapterTitle: input.chapterTitle,
    outline: input.outline,
  });
  const threadLedgerBlocks = buildThreadLedgerBlocks(selectedThreadLedgerCandidates);
  const questionPoolHintBlocks = buildQuestionPoolHintBlocks({
    rows: questionPoolRows,
    selectedThreadLedgerRows: selectedThreadLedgerCandidates.map((item) => item.row),
    requiredForeshadowTitles: input.requiredForeshadowTitles,
    chapterTitle: input.chapterTitle,
    outline: input.outline,
  });
  const workingMemoryBlocks = buildWorkingMemoryBlocks(
    input,
    currentVolumeSnapshotBlocks,
    activeForeshadowBlocks,
    questionPoolHintBlocks,
  );
  const sections = [
    createSection('working_memory', '工作记忆', workingMemoryBlocks),
    createSection('thread_ledger', '剧情线提醒', threadLedgerBlocks),
    createSection('foreshadow_plan', '伏笔规划', foreshadowPlanBlocks),
    createSection('antagonist_agenda', '反派议程', antagonistAgendaBlocks),
    createSection('pov_permission', '信息控制', povPermissionBlocks),
    createSection('world_state_delta', '世界状态', worldStateDeltaBlocks),
    createSection('immediate_memory', '即时记忆', buildRecentTextBlocks(recentTextRows)),
    createSection('short_term_memory', '短期记忆', buildRecentSummaryBlocks(recentSummaryRows)),
    createSection('long_term_memory', '长期记忆', volumeRecapBlocks),
    createSection('retrieval_memory', '外部检索', relatedChapterBlocks),
    input.worldState?.trim() ? createSection('physical_engine', '物理引擎', [input.worldState.trim()]) : null,
    createSection('resource_continuity', '资源连续性', resourceContinuityBlocks),
    (input.requiredEntityNames?.length ?? 0) > 0 ? null : createSection('focus_entities', '当前关注实体', entityBlocks),
    (input.availableCharacterNames?.length ?? 0) > 0 ? null : createSection('candidate_entities', '候选出场人物', availableCharacterHintBlocks),
    createSection('relationships', '相关关系', relationshipBlocks),
    fallbackContext.residualBundle
      ? createSection('fallback_context', '前端补充上下文', [fallbackContext.residualBundle])
      : null,
  ].filter((section): section is GenerationContextSection => section !== null);

  return {
    bundle: sections.map((section) => buildSection(section.title, section.blocks)).filter(Boolean).join('\n\n'),
    recentSummaryCount: recentSummaryRows.length,
    recentTextCount: recentTextRows.length,
    volumeRecapCount: volumeRecapBlocks.length,
    relatedChapterCount: retrievalItems.filter((item) => item.sourceType === 'memory_chunk').length,
    dormantForeshadowRecallCount: retrievalItems.filter((item) => item.sourceType === 'dormant_foreshadow').length,
    volumeRecapRecallCount: retrievalItems.filter((item) => item.sourceType === 'volume_recap').length,
    entityCount: entityBlocks.length,
    relationshipCount:
      explicitRelationshipResult.blocks.length +
      Math.max(
        0,
        automaticRelationshipBlocks.length - 1,
      ),
    hasFallbackContext: Boolean(input.fallbackContextBundle?.trim()),
    focusEntityNames,
    queryPhrases,
    lightweightRecallItems: lightweightRecallBlocks,
    sections,
  };
}
