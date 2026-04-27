import type {
  AntagonistAgenda,
  AntagonistAgendaStatus,
  ForeshadowPlan,
  ForeshadowPlanAlert,
  ForeshadowPlanImportance,
  Id,
  POVPermission,
  QuestionPool,
  QuestionPoolAlert,
  QuestionPoolStatus,
  ResourceContinuity,
  StructureMemoryBackfillApplyResult,
  StructureMemoryBackfillPreviewResult,
  StructureMemoryBackfillSystem,
  StructureMemoryGuardAlertResult,
  ResourceContinuityRiskLevel,
  ResourceContinuityStatus,
  ThreadLedger,
  ThreadLedgerAlert,
  ThreadLedgerStatus,
  WorldStateEntry,
} from '@/types';

function normalizeServerUrl(serverUrl: string) {
  return serverUrl.replace(/\/+$/, '');
}

function extractErrorMessage(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as { message?: string };
    return parsed.message || rawText;
  } catch {
    return rawText;
  }
}

async function parseJsonResponse<T>(response: Response) {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  return response.json() as Promise<T>;
}

export interface ThreadLedgerMutationInput {
  projectId: Id;
  name?: string;
  type?: string;
  coreQuestion?: string;
  currentPhase?: string;
  lastProgressAt?: string;
  lastProgressChapterId?: Id | null;
  lastProgressChapterTitle?: string;
  lastProgressChapterOrder?: number | null;
  nextTrigger?: string;
  blockedBy?: string;
  relatedCharacterIds?: Id[];
  relatedCharacterNames?: string[];
  relatedForeshadowIds?: Id[];
  relatedForeshadowTitles?: string[];
  plannedResolveVolume?: number | null;
  status?: ThreadLedgerStatus;
  audienceHeat?: number;
}

export interface FetchThreadLedgersOptions {
  status?: ThreadLedgerStatus;
  currentChapterOrder?: number | null;
  staleChapterGap?: number;
}

export interface FetchThreadLedgersResult {
  items: ThreadLedger[];
  alerts: ThreadLedgerAlert[];
}

export async function fetchThreadLedgers(
  serverUrl: string,
  projectId: Id,
  options: FetchThreadLedgersOptions = {},
) {
  const params = new URLSearchParams({
    projectId,
  });

  if (options.status) {
    params.set('status', options.status);
  }

  if (typeof options.currentChapterOrder === 'number' && Number.isFinite(options.currentChapterOrder)) {
    params.set('currentChapterOrder', String(Math.trunc(options.currentChapterOrder)));
  }

  if (typeof options.staleChapterGap === 'number' && Number.isFinite(options.staleChapterGap)) {
    params.set('staleChapterGap', String(Math.max(1, Math.trunc(options.staleChapterGap))));
  }

  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/thread-ledgers?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseJsonResponse<FetchThreadLedgersResult>(response);
}

export async function createThreadLedger(serverUrl: string, input: ThreadLedgerMutationInput) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/structure-memory/thread-ledgers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseJsonResponse<{ item: ThreadLedger }>(response);
  return parsed.item;
}

export async function updateThreadLedger(serverUrl: string, threadLedgerId: Id, input: ThreadLedgerMutationInput) {
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/thread-ledgers/${encodeURIComponent(threadLedgerId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const parsed = await parseJsonResponse<{ item: ThreadLedger }>(response);
  return parsed.item;
}

export async function deleteThreadLedger(serverUrl: string, projectId: Id, threadLedgerId: Id) {
  const params = new URLSearchParams({
    projectId,
  });
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/thread-ledgers/${encodeURIComponent(threadLedgerId)}?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  await parseJsonResponse<{ success: boolean }>(response);
}

export interface ForeshadowPlanMutationInput {
  projectId: Id;
  foreshadowId?: Id;
  foreshadowTitle?: string;
  type?: string;
  importance?: ForeshadowPlanImportance;
  activationWindow?: string;
  resolveWindow?: string;
  plannedActivateVolume?: number | null;
  plannedResolveVolume?: number | null;
  activationCondition?: string;
  resolveCondition?: string;
  dependsOnForeshadowIds?: Id[];
  dependsOnForeshadowTitles?: string[];
  dependsOnEventKeys?: string[];
  relatedQuestionIds?: Id[];
  payoffEffect?: string;
}

export interface FetchForeshadowPlansOptions {
  foreshadowId?: Id;
  currentVolumeOrder?: number | null;
  overdueVolumeGap?: number;
}

export interface FetchForeshadowPlansResult {
  items: ForeshadowPlan[];
  alerts: ForeshadowPlanAlert[];
}

export async function fetchForeshadowPlans(
  serverUrl: string,
  projectId: Id,
  options: FetchForeshadowPlansOptions = {},
) {
  const params = new URLSearchParams({
    projectId,
  });

  if (options.foreshadowId) {
    params.set('foreshadowId', options.foreshadowId);
  }

  if (typeof options.currentVolumeOrder === 'number' && Number.isFinite(options.currentVolumeOrder)) {
    params.set('currentVolumeOrder', String(Math.trunc(options.currentVolumeOrder)));
  }

  if (typeof options.overdueVolumeGap === 'number' && Number.isFinite(options.overdueVolumeGap)) {
    params.set('overdueVolumeGap', String(Math.max(1, Math.trunc(options.overdueVolumeGap))));
  }

  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/foreshadow-plans?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseJsonResponse<FetchForeshadowPlansResult>(response);
}

export async function createForeshadowPlan(serverUrl: string, input: ForeshadowPlanMutationInput) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/structure-memory/foreshadow-plans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseJsonResponse<{ item: ForeshadowPlan }>(response);
  return parsed.item;
}

export async function updateForeshadowPlan(serverUrl: string, foreshadowPlanId: Id, input: ForeshadowPlanMutationInput) {
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/foreshadow-plans/${encodeURIComponent(foreshadowPlanId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const parsed = await parseJsonResponse<{ item: ForeshadowPlan }>(response);
  return parsed.item;
}

export async function deleteForeshadowPlan(serverUrl: string, projectId: Id, foreshadowPlanId: Id) {
  const params = new URLSearchParams({
    projectId,
  });
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/foreshadow-plans/${encodeURIComponent(foreshadowPlanId)}?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  await parseJsonResponse<{ success: boolean }>(response);
}

export interface WorldStateEntryMutationInput {
  projectId: Id;
  volumeId?: Id;
  volumeTitle?: string;
  volumeOrder?: number;
  milestoneIndex?: number | null;
  publicEvents?: string[];
  secretEvents?: string[];
  powerBalanceChange?: string;
  institutionChange?: string;
  ruleChange?: string;
  rumorState?: string;
  knownByCharacterIds?: Id[];
  knownByCharacterNames?: string[];
  currentRisks?: string[];
}

export interface FetchWorldStateEntriesOptions {
  volumeId?: Id;
  milestoneIndex?: number | null;
}

export interface FetchWorldStateEntriesResult {
  items: WorldStateEntry[];
}

export async function fetchWorldStateEntries(
  serverUrl: string,
  projectId: Id,
  options: FetchWorldStateEntriesOptions = {},
) {
  const params = new URLSearchParams({
    projectId,
  });

  if (options.volumeId) {
    params.set('volumeId', options.volumeId);
  }

  if (typeof options.milestoneIndex === 'number' && Number.isFinite(options.milestoneIndex)) {
    params.set('milestoneIndex', String(Math.trunc(options.milestoneIndex)));
  }

  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/world-state-entries?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseJsonResponse<FetchWorldStateEntriesResult>(response);
}

export async function createWorldStateEntry(serverUrl: string, input: WorldStateEntryMutationInput) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/structure-memory/world-state-entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseJsonResponse<{ item: WorldStateEntry }>(response);
  return parsed.item;
}

export async function updateWorldStateEntry(serverUrl: string, worldStateEntryId: Id, input: WorldStateEntryMutationInput) {
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/world-state-entries/${encodeURIComponent(worldStateEntryId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const parsed = await parseJsonResponse<{ item: WorldStateEntry }>(response);
  return parsed.item;
}

export async function deleteWorldStateEntry(serverUrl: string, projectId: Id, worldStateEntryId: Id) {
  const params = new URLSearchParams({
    projectId,
  });
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/world-state-entries/${encodeURIComponent(worldStateEntryId)}?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  await parseJsonResponse<{ success: boolean }>(response);
}

export interface QuestionPoolMutationInput {
  projectId: Id;
  question?: string;
  firstRaisedChapterId?: Id | null;
  firstRaisedAt?: string;
  belongsToThreadId?: Id | null;
  belongsToThreadName?: string;
  currentClue?: string;
  falseAnswers?: string[];
  expectedRevealWindow?: string;
  finalAnswerSummary?: string;
  status?: QuestionPoolStatus;
}

export interface FetchQuestionPoolsOptions {
  status?: QuestionPoolStatus;
  currentVolumeOrder?: number | null;
}

export interface FetchQuestionPoolsResult {
  items: QuestionPool[];
  alerts: QuestionPoolAlert[];
}

export async function fetchQuestionPools(
  serverUrl: string,
  projectId: Id,
  options: FetchQuestionPoolsOptions = {},
) {
  const params = new URLSearchParams({
    projectId,
  });

  if (options.status) {
    params.set('status', options.status);
  }

  if (typeof options.currentVolumeOrder === 'number' && Number.isFinite(options.currentVolumeOrder)) {
    params.set('currentVolumeOrder', String(Math.trunc(options.currentVolumeOrder)));
  }

  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/question-pools?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseJsonResponse<FetchQuestionPoolsResult>(response);
}

export async function createQuestionPool(serverUrl: string, input: QuestionPoolMutationInput) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/structure-memory/question-pools`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseJsonResponse<{ item: QuestionPool }>(response);
  return parsed.item;
}

export async function updateQuestionPool(serverUrl: string, questionPoolId: Id, input: QuestionPoolMutationInput) {
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/question-pools/${encodeURIComponent(questionPoolId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const parsed = await parseJsonResponse<{ item: QuestionPool }>(response);
  return parsed.item;
}

export async function deleteQuestionPool(serverUrl: string, projectId: Id, questionPoolId: Id) {
  const params = new URLSearchParams({
    projectId,
  });
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/question-pools/${encodeURIComponent(questionPoolId)}?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  await parseJsonResponse<{ success: boolean }>(response);
}

export interface AntagonistAgendaMutationInput {
  projectId: Id;
  characterEntityId?: Id | null;
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

export interface FetchAntagonistAgendasOptions {
  status?: AntagonistAgendaStatus;
}

export interface FetchAntagonistAgendasResult {
  items: AntagonistAgenda[];
}

export async function fetchAntagonistAgendas(
  serverUrl: string,
  projectId: Id,
  options: FetchAntagonistAgendasOptions = {},
) {
  const params = new URLSearchParams({
    projectId,
  });

  if (options.status) {
    params.set('status', options.status);
  }

  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/antagonist-agendas?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseJsonResponse<FetchAntagonistAgendasResult>(response);
}

export async function createAntagonistAgenda(serverUrl: string, input: AntagonistAgendaMutationInput) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/structure-memory/antagonist-agendas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseJsonResponse<{ item: AntagonistAgenda }>(response);
  return parsed.item;
}

export async function updateAntagonistAgenda(serverUrl: string, antagonistAgendaId: Id, input: AntagonistAgendaMutationInput) {
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/antagonist-agendas/${encodeURIComponent(antagonistAgendaId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const parsed = await parseJsonResponse<{ item: AntagonistAgenda }>(response);
  return parsed.item;
}

export async function deleteAntagonistAgenda(serverUrl: string, projectId: Id, antagonistAgendaId: Id) {
  const params = new URLSearchParams({
    projectId,
  });
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/antagonist-agendas/${encodeURIComponent(antagonistAgendaId)}?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  await parseJsonResponse<{ success: boolean }>(response);
}

export interface POVPermissionMutationInput {
  projectId: Id;
  volumeId?: Id | null;
  volumeTitle?: string;
  milestoneIndex?: number | null;
  chapterId?: Id | null;
  chapterTitle?: string;
  povCharacterId?: Id | null;
  povCharacterName?: string;
  readerKnows?: string[];
  protagonistKnows?: string[];
  antagonistKnows?: string[];
  mustHide?: string[];
  canHint?: string[];
  forbiddenReveal?: string[];
}

export interface FetchPovPermissionsOptions {
  volumeId?: Id;
  chapterId?: Id;
}

export interface FetchPovPermissionsResult {
  items: POVPermission[];
}

export async function fetchPovPermissions(
  serverUrl: string,
  projectId: Id,
  options: FetchPovPermissionsOptions = {},
) {
  const params = new URLSearchParams({
    projectId,
  });

  if (options.volumeId) {
    params.set('volumeId', options.volumeId);
  }

  if (options.chapterId) {
    params.set('chapterId', options.chapterId);
  }

  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/pov-permissions?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseJsonResponse<FetchPovPermissionsResult>(response);
}

export async function createPovPermission(serverUrl: string, input: POVPermissionMutationInput) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/structure-memory/pov-permissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseJsonResponse<{ item: POVPermission }>(response);
  return parsed.item;
}

export async function updatePovPermission(serverUrl: string, povPermissionId: Id, input: POVPermissionMutationInput) {
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/pov-permissions/${encodeURIComponent(povPermissionId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const parsed = await parseJsonResponse<{ item: POVPermission }>(response);
  return parsed.item;
}

export async function deletePovPermission(serverUrl: string, projectId: Id, povPermissionId: Id) {
  const params = new URLSearchParams({
    projectId,
  });
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/pov-permissions/${encodeURIComponent(povPermissionId)}?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  await parseJsonResponse<{ success: boolean }>(response);
}

export interface ResourceContinuityMutationInput {
  projectId: Id;
  resourceType?: string;
  ownerCharacterId?: Id | null;
  ownerCharacterName?: string;
  currentState?: string;
  performanceImpact?: string;
  lastConsumedAt?: string;
  recoveryCondition?: string;
  hiddenCost?: string;
  continuityRisk?: string;
  status?: ResourceContinuityStatus;
}

export interface FetchResourceContinuitiesOptions {
  status?: ResourceContinuityStatus;
  ownerCharacterId?: Id;
  resourceType?: string;
  riskLevel?: ResourceContinuityRiskLevel;
}

export interface FetchResourceContinuitiesResult {
  items: ResourceContinuity[];
}

export async function fetchResourceContinuities(
  serverUrl: string,
  projectId: Id,
  options: FetchResourceContinuitiesOptions = {},
) {
  const params = new URLSearchParams({
    projectId,
  });

  if (options.status) {
    params.set('status', options.status);
  }

  if (options.ownerCharacterId) {
    params.set('ownerCharacterId', options.ownerCharacterId);
  }

  if (options.resourceType) {
    params.set('resourceType', options.resourceType);
  }

  if (options.riskLevel) {
    params.set('riskLevel', options.riskLevel);
  }

  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/resource-continuities?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseJsonResponse<FetchResourceContinuitiesResult>(response);
}

export async function createResourceContinuity(serverUrl: string, input: ResourceContinuityMutationInput) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/structure-memory/resource-continuities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseJsonResponse<{ item: ResourceContinuity }>(response);
  return parsed.item;
}

export async function updateResourceContinuity(serverUrl: string, resourceContinuityId: Id, input: ResourceContinuityMutationInput) {
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/resource-continuities/${encodeURIComponent(resourceContinuityId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const parsed = await parseJsonResponse<{ item: ResourceContinuity }>(response);
  return parsed.item;
}

export async function deleteResourceContinuity(serverUrl: string, projectId: Id, resourceContinuityId: Id) {
  const params = new URLSearchParams({
    projectId,
  });
  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/resource-continuities/${encodeURIComponent(resourceContinuityId)}?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  await parseJsonResponse<{ success: boolean }>(response);
}

export interface StructureMemoryBackfillRequest {
  projectId: Id;
  systems?: StructureMemoryBackfillSystem[];
  candidateIds?: Id[];
}

export interface FetchStructureMemoryGuardAlertsOptions {
  trigger?: 'project_scan' | 'chapter_completed' | 'volume_completed' | 'structure_memory_updated';
  chapterId?: Id;
  volumeTitle?: string;
}

export async function previewStructureMemoryBackfill(serverUrl: string, request: StructureMemoryBackfillRequest) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/structure-memory/maintenance/backfill-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(request),
  });

  return parseJsonResponse<StructureMemoryBackfillPreviewResult>(response);
}

export async function applyStructureMemoryBackfill(serverUrl: string, request: StructureMemoryBackfillRequest) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/structure-memory/maintenance/backfill-apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(request),
  });

  return parseJsonResponse<StructureMemoryBackfillApplyResult>(response);
}

export async function fetchStructureMemoryGuardAlerts(
  serverUrl: string,
  projectId: Id,
  options: FetchStructureMemoryGuardAlertsOptions = {},
) {
  const params = new URLSearchParams({
    projectId,
  });

  if (options.trigger) {
    params.set('trigger', options.trigger);
  }

  if (options.chapterId) {
    params.set('chapterId', options.chapterId);
  }

  if (options.volumeTitle?.trim()) {
    params.set('volumeTitle', options.volumeTitle.trim());
  }

  const response = await fetch(
    `${normalizeServerUrl(serverUrl)}/api/structure-memory/maintenance/guard-alerts?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseJsonResponse<StructureMemoryGuardAlertResult>(response);
}
