export const GENERATION_COLD_ARCHIVE_RECENT_CHAPTER_WINDOW = 36;
export const GENERATION_COLD_ARCHIVE_DISTANCE_BUDGET = 180;

export type GenerationColdArchiveDecisionReason =
  | 'insufficient_chapter_context'
  | 'missing_volume_boundary'
  | 'same_volume'
  | 'recent_chapter'
  | 'focus_entity_hit'
  | 'location_hit'
  | 'query_hit'
  | 'distance_within_budget'
  | 'cross_volume_far_without_hit';

export interface GenerationColdArchiveContextInput {
  chapterOrder?: number | null;
  volumeTitle?: string | null;
  queryPhrases?: string[];
  focusEntityNames?: string[];
}

export interface GenerationColdArchiveContext {
  currentChapterOrder: number;
  normalizedCurrentVolume: string;
  normalizedFocusEntitySet: Set<string>;
  normalizedLocationTerms: string[];
  normalizedQueryTerms: string[];
}

export interface GenerationColdArchiveCandidateInput {
  chapterOrder?: number | null;
  volumeTitle?: string | null;
  entityRefs?: string[];
  locations?: string[];
  textParts?: Array<string | null | undefined>;
}

export interface GenerationColdArchiveDecision {
  isColdArchived: boolean;
  reason: GenerationColdArchiveDecisionReason;
  chapterDistance: number | null;
  matchedSignals: {
    sameVolume: boolean;
    focusEntityHit: boolean;
    locationHit: boolean;
    queryHit: boolean;
  };
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

function hasLocationHit(candidateLocations: string[], normalizedLocationTerms: string[]) {
  if (candidateLocations.length === 0 || normalizedLocationTerms.length === 0) {
    return false;
  }

  const normalizedCandidateLocations = candidateLocations
    .map((location) => normalizeText(location))
    .filter(Boolean);

  return normalizedCandidateLocations.some((location) =>
    normalizedLocationTerms.some((term) => location.includes(term) || term.includes(location)),
  );
}

function hasQueryHit(textParts: Array<string | null | undefined>, normalizedQueryTerms: string[]) {
  if (textParts.length === 0 || normalizedQueryTerms.length === 0) {
    return false;
  }

  return normalizedQueryTerms.some((term) =>
    textParts.some((part) => normalizeText(part).includes(term)),
  );
}

function createDecision(
  isColdArchived: boolean,
  reason: GenerationColdArchiveDecisionReason,
  chapterDistance: number | null,
  matchedSignals: GenerationColdArchiveDecision['matchedSignals'],
): GenerationColdArchiveDecision {
  return {
    isColdArchived,
    reason,
    chapterDistance,
    matchedSignals,
  };
}

export function buildGenerationColdArchiveContext(
  input: GenerationColdArchiveContextInput,
): GenerationColdArchiveContext {
  const normalizedFocusEntities = createUniqueList(
    (input.focusEntityNames ?? []).map((name) => normalizeText(name)).filter(Boolean),
  );
  const normalizedLocationTerms = createUniqueList(
    [...(input.queryPhrases ?? []).filter((phrase) => phrase.length <= 12), ...(input.focusEntityNames ?? [])]
      .map((term) => normalizeText(term))
      .filter(Boolean),
  ).slice(0, 20);
  const normalizedQueryTerms = createUniqueList([...(input.queryPhrases ?? []), ...(input.focusEntityNames ?? [])]
    .map((term) => normalizeText(term))
    .filter(Boolean))
    .slice(0, 24);

  return {
    currentChapterOrder: Math.trunc(input.chapterOrder ?? 0),
    normalizedCurrentVolume: normalizeText(input.volumeTitle),
    normalizedFocusEntitySet: new Set(normalizedFocusEntities),
    normalizedLocationTerms,
    normalizedQueryTerms,
  };
}

export function evaluateGenerationColdArchiveCandidate(
  context: GenerationColdArchiveContext,
  candidate: GenerationColdArchiveCandidateInput,
): GenerationColdArchiveDecision {
  const currentChapterOrder = context.currentChapterOrder;
  const candidateChapterOrder = Math.trunc(candidate.chapterOrder ?? 0);

  if (currentChapterOrder <= 0 || candidateChapterOrder <= 0) {
    return createDecision(false, 'insufficient_chapter_context', null, {
      sameVolume: false,
      focusEntityHit: false,
      locationHit: false,
      queryHit: false,
    });
  }

  const chapterDistance = currentChapterOrder - candidateChapterOrder;

  if (chapterDistance <= 0) {
    return createDecision(false, 'recent_chapter', chapterDistance, {
      sameVolume: false,
      focusEntityHit: false,
      locationHit: false,
      queryHit: false,
    });
  }

  const normalizedCandidateVolume = normalizeText(candidate.volumeTitle);

  if (!context.normalizedCurrentVolume || !normalizedCandidateVolume) {
    return createDecision(false, 'missing_volume_boundary', chapterDistance, {
      sameVolume: false,
      focusEntityHit: false,
      locationHit: false,
      queryHit: false,
    });
  }

  const sameVolume = context.normalizedCurrentVolume === normalizedCandidateVolume;

  if (sameVolume) {
    return createDecision(false, 'same_volume', chapterDistance, {
      sameVolume,
      focusEntityHit: false,
      locationHit: false,
      queryHit: false,
    });
  }

  if (chapterDistance <= GENERATION_COLD_ARCHIVE_RECENT_CHAPTER_WINDOW) {
    return createDecision(false, 'recent_chapter', chapterDistance, {
      sameVolume,
      focusEntityHit: false,
      locationHit: false,
      queryHit: false,
    });
  }

  const focusEntityHit =
    context.normalizedFocusEntitySet.size > 0 &&
    (candidate.entityRefs ?? []).some((entityRef) =>
      context.normalizedFocusEntitySet.has(normalizeText(entityRef)),
    );

  if (focusEntityHit) {
    return createDecision(false, 'focus_entity_hit', chapterDistance, {
      sameVolume,
      focusEntityHit,
      locationHit: false,
      queryHit: false,
    });
  }

  const locationHit = hasLocationHit(candidate.locations ?? [], context.normalizedLocationTerms);

  if (locationHit) {
    return createDecision(false, 'location_hit', chapterDistance, {
      sameVolume,
      focusEntityHit,
      locationHit,
      queryHit: false,
    });
  }

  const queryHit = hasQueryHit(candidate.textParts ?? [], context.normalizedQueryTerms);

  if (queryHit) {
    return createDecision(false, 'query_hit', chapterDistance, {
      sameVolume,
      focusEntityHit,
      locationHit,
      queryHit,
    });
  }

  if (chapterDistance <= GENERATION_COLD_ARCHIVE_DISTANCE_BUDGET) {
    return createDecision(false, 'distance_within_budget', chapterDistance, {
      sameVolume,
      focusEntityHit,
      locationHit,
      queryHit,
    });
  }

  return createDecision(true, 'cross_volume_far_without_hit', chapterDistance, {
    sameVolume,
    focusEntityHit,
    locationHit,
    queryHit,
  });
}
