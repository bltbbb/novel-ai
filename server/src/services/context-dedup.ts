import type { ResourceStateRow } from './generation-resource-continuity.js';
import {
  type ResourceContinuityRecord,
} from './structured-resource-continuity-store.js';

type ResourceConflictBucket = 'supply' | 'salt' | 'grain' | 'medicine' | 'money';

interface ResourceConflictProfile {
  key: ResourceConflictBucket;
  terms: string[];
}

export interface StructuredResourceContinuityCandidate {
  source: 'structured';
  row: ResourceContinuityRecord;
  block: string;
  sortScore: number;
}

export interface RuntimeResourceContinuityCandidate {
  source: 'runtime';
  row: ResourceStateRow;
  block: string;
  sortScore: number;
}

type ResourceContinuityCandidate =
  | StructuredResourceContinuityCandidate
  | RuntimeResourceContinuityCandidate;

interface ResourceConflictIdentity {
  primaryKey: string;
  conflictKeys: string[];
}

interface ResourceContinuityGroup {
  primary: ResourceContinuityCandidate;
  runtimeSupplement: RuntimeResourceContinuityCandidate | null;
}

const RESOURCE_CONFLICT_PROFILES: ResourceConflictProfile[] = [
  {
    key: 'salt',
    terms: ['盐', '盐巴', '盐水'],
  },
  {
    key: 'grain',
    terms: ['米粮', '米', '粮', '米缸', '粮袋', '米汤', '粥', '粮草'],
  },
  {
    key: 'medicine',
    terms: ['伤药', '药', '药膏', '药粉', '纱布', '药材'],
  },
  {
    key: 'money',
    terms: ['钱银', '钱', '银', '铜钱', '银钱', '碎银'],
  },
  {
    key: 'supply',
    terms: ['物资', '钱粮', '军资', '补给', '药材', '粮草'],
  },
];

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

function includesAnyNormalizedTerm(sourceTerms: string[], targetTerms: string[]) {
  const normalizedSources = sourceTerms.map((term) => normalizeText(term)).filter(Boolean);

  if (normalizedSources.length === 0) {
    return false;
  }

  return targetTerms.some((term) => {
    const normalizedTarget = normalizeText(term);

    if (!normalizedTarget) {
      return false;
    }

    return normalizedSources.some(
      (source) => source.includes(normalizedTarget) || normalizedTarget.includes(source),
    );
  });
}

function resolveMatchedConflictBuckets(terms: string[]) {
  const matchedSpecificBuckets = RESOURCE_CONFLICT_PROFILES
    .filter((profile) => profile.key !== 'supply' && includesAnyNormalizedTerm(terms, profile.terms))
    .map((profile) => profile.key);
  const matchedSupplyBucket =
    matchedSpecificBuckets.length > 0 ||
    includesAnyNormalizedTerm(
      terms,
      RESOURCE_CONFLICT_PROFILES.find((profile) => profile.key === 'supply')?.terms ?? [],
    );

  return {
    specificBuckets: matchedSpecificBuckets,
    hasSupplyBucket: matchedSupplyBucket,
  };
}

function resolveStructuredCandidateIdentity(
  candidate: StructuredResourceContinuityCandidate,
): ResourceConflictIdentity {
  const ownerKey = normalizeText(candidate.row.ownerCharacterName) || 'unbound';
  const directMatchedBuckets = resolveMatchedConflictBuckets([candidate.row.resourceType]);
  const primaryBucket =
    directMatchedBuckets.specificBuckets.length === 1
      ? directMatchedBuckets.specificBuckets[0]
      : directMatchedBuckets.hasSupplyBucket || directMatchedBuckets.specificBuckets.length > 1
        ? 'supply'
        : '';
  const fallbackKey = normalizeText(candidate.row.resourceType) || 'resource';
  const primaryKey = `${ownerKey}::${primaryBucket || fallbackKey}`;

  return {
    primaryKey,
    conflictKeys: [primaryKey],
  };
}

function resolveRuntimeCandidateIdentity(
  candidate: RuntimeResourceContinuityCandidate,
): ResourceConflictIdentity {
  const ownerKey = normalizeText(candidate.row.entityName) || 'unbound';
  const runtimeTerms = createUniqueList([
    candidate.row.entityName,
    candidate.row.field,
    candidate.row.oldValue,
    candidate.row.newValue,
  ]);
  const matchedBuckets = resolveMatchedConflictBuckets(runtimeTerms);
  const primaryBucket = matchedBuckets.specificBuckets[0];
  const fallbackKey = normalizeText(candidate.row.field) || 'resource';
  const primaryKey = `${ownerKey}::${primaryBucket || fallbackKey}`;
  const supplyKey = `${ownerKey}::supply`;

  return {
    primaryKey,
    conflictKeys:
      matchedBuckets.hasSupplyBucket && primaryKey !== supplyKey
        ? [primaryKey, supplyKey]
        : [primaryKey],
  };
}

function resolveCandidateIdentity(candidate: ResourceContinuityCandidate) {
  return candidate.source === 'structured'
    ? resolveStructuredCandidateIdentity(candidate)
    : resolveRuntimeCandidateIdentity(candidate);
}

function getCandidateUpdatedAt(candidate: ResourceContinuityCandidate) {
  return candidate.row.updatedAt;
}

function compareCandidates(left: ResourceContinuityCandidate, right: ResourceContinuityCandidate) {
  const sourcePriority = (candidate: ResourceContinuityCandidate) =>
    candidate.source === 'structured' ? 0 : 1;
  const leftSourcePriority = sourcePriority(left);
  const rightSourcePriority = sourcePriority(right);

  if (leftSourcePriority !== rightSourcePriority) {
    return leftSourcePriority - rightSourcePriority;
  }

  if (left.sortScore !== right.sortScore) {
    return right.sortScore - left.sortScore;
  }

  return getCandidateUpdatedAt(right).localeCompare(getCandidateUpdatedAt(left));
}

function compareRuntimeCandidates(
  left: RuntimeResourceContinuityCandidate,
  right: RuntimeResourceContinuityCandidate,
) {
  if (left.sortScore !== right.sortScore) {
    return right.sortScore - left.sortScore;
  }

  return right.row.updatedAt.localeCompare(left.row.updatedAt);
}

function registerGroupKey(
  keyIndex: Map<string, ResourceContinuityGroup>,
  key: string,
  group: ResourceContinuityGroup,
) {
  if (!keyIndex.has(key)) {
    keyIndex.set(key, group);
  }
}

function registerCandidateGroup(
  keyIndex: Map<string, ResourceContinuityGroup>,
  group: ResourceContinuityGroup,
  candidate: ResourceContinuityCandidate,
  identity: ResourceConflictIdentity,
) {
  if (candidate.source === 'structured') {
    for (const key of identity.conflictKeys) {
      registerGroupKey(keyIndex, key, group);
    }
    return;
  }

  registerGroupKey(keyIndex, identity.primaryKey, group);
}

function stripLeadingListMarker(block: string) {
  return block.trim().replace(/^- /u, '');
}

function renderGroupBlock(group: ResourceContinuityGroup) {
  if (group.primary.source !== 'structured' || !group.runtimeSupplement) {
    return group.primary.block;
  }

  return `${group.primary.block}\n运行态补充：${stripLeadingListMarker(group.runtimeSupplement.block)}`;
}

export function dedupeResourceContinuityBlocks(input: {
  structuredCandidates: StructuredResourceContinuityCandidate[];
  runtimeCandidates: RuntimeResourceContinuityCandidate[];
  limit: number;
}) {
  const groups: ResourceContinuityGroup[] = [];
  const keyIndex = new Map<string, ResourceContinuityGroup>();
  const candidates = [...input.structuredCandidates, ...input.runtimeCandidates].sort(compareCandidates);

  for (const candidate of candidates) {
    const identity = resolveCandidateIdentity(candidate);
    const matchedKey = identity.conflictKeys.find((key) => keyIndex.has(key));
    const existingGroup = matchedKey ? keyIndex.get(matchedKey) ?? null : null;

    if (!existingGroup) {
      const group: ResourceContinuityGroup = {
        primary: candidate,
        runtimeSupplement: null,
      };
      groups.push(group);
      registerCandidateGroup(keyIndex, group, candidate, identity);
      continue;
    }

    if (candidate.source === 'runtime') {
      if (existingGroup.primary.source === 'structured') {
        if (
          !existingGroup.runtimeSupplement ||
          compareRuntimeCandidates(candidate, existingGroup.runtimeSupplement) < 0
        ) {
          existingGroup.runtimeSupplement = candidate;
        }
        continue;
      }

      if (
        compareRuntimeCandidates(candidate, existingGroup.primary as RuntimeResourceContinuityCandidate) < 0
      ) {
        existingGroup.primary = candidate;
      }
      continue;
    }

    if (existingGroup.primary.source === 'runtime') {
      existingGroup.runtimeSupplement = existingGroup.primary;
      existingGroup.primary = candidate;
      registerCandidateGroup(keyIndex, existingGroup, candidate, identity);
      continue;
    }

    if (compareCandidates(candidate, existingGroup.primary) < 0) {
      existingGroup.primary = candidate;
      registerCandidateGroup(keyIndex, existingGroup, candidate, identity);
    }
  }

  return groups.map(renderGroupBlock).filter((block) => block.trim()).slice(0, input.limit);
}
