import type { ServerEnv } from '../config/env.js';
import { getGenerationDatabase } from './generation-sqlite.js';

export type GenerationColdStorageDecisionReason =
  | 'cold_storage_disabled'
  | 'same_volume_candidate'
  | 'missing_entity_refs'
  | 'focus_entity_hit'
  | 'query_entity_hit'
  | 'query_text_hit'
  | 'no_cold_entity_signal'
  | 'partial_cold_entity_match'
  | 'all_entities_cold_archived';

export interface GenerationColdStorageContextInput {
  projectId: string;
  currentVolumeTitle?: string | null;
  focusEntityNames?: string[];
  queryPhrases?: string[];
}

export interface GenerationColdStorageContext {
  normalizedCurrentVolume: string;
  isColdStorageActive: boolean;
  coldEntityNameSet: Set<string>;
  normalizedFocusEntitySet: Set<string>;
  normalizedQueryTerms: string[];
}

export interface GenerationColdStorageCandidateInput {
  volumeTitle?: string | null;
  entityRefs?: string[];
  textParts?: Array<string | null | undefined>;
}

export interface GenerationColdStorageDecision {
  isColdArchived: boolean;
  reason: GenerationColdStorageDecisionReason;
  chapterDistance: number | null;
  matchedColdEntityRefs: string[];
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
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

function hasQueryHitInEntityRefs(entityRefs: string[], normalizedQueryTerms: string[]) {
  if (entityRefs.length === 0 || normalizedQueryTerms.length === 0) {
    return false;
  }

  return entityRefs.some((entityRef) =>
    normalizedQueryTerms.some((term) => entityRef.includes(term) || term.includes(entityRef)),
  );
}

function hasQueryHitInTextParts(
  textParts: Array<string | null | undefined>,
  normalizedQueryTerms: string[],
) {
  if (textParts.length === 0 || normalizedQueryTerms.length === 0) {
    return false;
  }

  return normalizedQueryTerms.some((term) =>
    textParts.some((part) => normalizeText(part).includes(term)),
  );
}

function createDecision(
  isColdArchived: boolean,
  reason: GenerationColdStorageDecisionReason,
  chapterDistance: number | null = null,
  matchedColdEntityRefs: string[] = [],
): GenerationColdStorageDecision {
  return {
    isColdArchived,
    reason,
    chapterDistance,
    matchedColdEntityRefs,
  };
}

export function buildGenerationColdStorageContext(
  env: ServerEnv,
  input: GenerationColdStorageContextInput,
): GenerationColdStorageContext {
  const normalizedCurrentVolume = normalizeText(input.currentVolumeTitle);
  const normalizedFocusEntitySet = new Set(
    createUniqueList((input.focusEntityNames ?? []).map((item) => normalizeText(item)).filter(Boolean)),
  );
  const normalizedQueryTerms = createUniqueList([...(input.queryPhrases ?? []), ...(input.focusEntityNames ?? [])]
    .map((item) => normalizeText(item))
    .filter(Boolean))
    .slice(0, 24);

  if (!normalizedCurrentVolume) {
    return {
      normalizedCurrentVolume,
      isColdStorageActive: false,
      coldEntityNameSet: new Set<string>(),
      normalizedFocusEntitySet,
      normalizedQueryTerms,
    };
  }

  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          ent.entity_name,
          ent.pinned,
          COALESCE(idx.volume_title, '') AS last_seen_volume_title
        FROM generation_entities ent
        LEFT JOIN generation_chapter_index idx
          ON idx.project_id = ent.project_id AND idx.chapter_id = ent.last_seen_chapter_id
        WHERE ent.project_id = ?
      `,
    )
    .all(input.projectId) as Array<Record<string, unknown>>;

  const hasHistoricalVolumeShift = rows.some((row) => {
    const normalizedLastSeenVolume = normalizeText(asString(row.last_seen_volume_title));
    return Boolean(normalizedLastSeenVolume) && normalizedLastSeenVolume !== normalizedCurrentVolume;
  });

  if (!hasHistoricalVolumeShift) {
    return {
      normalizedCurrentVolume,
      isColdStorageActive: false,
      coldEntityNameSet: new Set<string>(),
      normalizedFocusEntitySet,
      normalizedQueryTerms,
    };
  }

  const coldEntityNameSet = new Set<string>();

  for (const row of rows) {
    const normalizedEntityName = normalizeText(asString(row.entity_name));
    const normalizedLastSeenVolume = normalizeText(asString(row.last_seen_volume_title));
    const pinned = Number(row.pinned ?? 0) > 0;

    if (!normalizedEntityName || !normalizedLastSeenVolume) {
      continue;
    }

    if (normalizedLastSeenVolume === normalizedCurrentVolume) {
      continue;
    }

    if (pinned || normalizedFocusEntitySet.has(normalizedEntityName)) {
      continue;
    }

    if (normalizedQueryTerms.some((term) => normalizedEntityName.includes(term) || term.includes(normalizedEntityName))) {
      continue;
    }

    coldEntityNameSet.add(normalizedEntityName);
  }

  return {
    normalizedCurrentVolume,
    isColdStorageActive: coldEntityNameSet.size > 0,
    coldEntityNameSet,
    normalizedFocusEntitySet,
    normalizedQueryTerms,
  };
}

export function evaluateGenerationColdStorageCandidate(
  context: GenerationColdStorageContext,
  candidate: GenerationColdStorageCandidateInput,
): GenerationColdStorageDecision {
  if (!context.isColdStorageActive) {
    return createDecision(false, 'cold_storage_disabled');
  }

  const normalizedCandidateVolume = normalizeText(candidate.volumeTitle);

  if (normalizedCandidateVolume && normalizedCandidateVolume === context.normalizedCurrentVolume) {
    return createDecision(false, 'same_volume_candidate');
  }

  const normalizedEntityRefs = createUniqueList(
    (candidate.entityRefs ?? []).map((entityRef) => normalizeText(entityRef)).filter(Boolean),
  );

  if (normalizedEntityRefs.length === 0) {
    return createDecision(false, 'missing_entity_refs');
  }

  if (normalizedEntityRefs.some((entityRef) => context.normalizedFocusEntitySet.has(entityRef))) {
    return createDecision(false, 'focus_entity_hit');
  }

  if (hasQueryHitInEntityRefs(normalizedEntityRefs, context.normalizedQueryTerms)) {
    return createDecision(false, 'query_entity_hit');
  }

  if (hasQueryHitInTextParts(candidate.textParts ?? [], context.normalizedQueryTerms)) {
    return createDecision(false, 'query_text_hit');
  }

  const matchedColdEntityRefs = normalizedEntityRefs.filter((entityRef) => context.coldEntityNameSet.has(entityRef));

  if (matchedColdEntityRefs.length === 0) {
    return createDecision(false, 'no_cold_entity_signal');
  }

  if (matchedColdEntityRefs.length < normalizedEntityRefs.length) {
    return createDecision(false, 'partial_cold_entity_match', null, matchedColdEntityRefs);
  }

  return createDecision(true, 'all_entities_cold_archived', null, matchedColdEntityRefs);
}
