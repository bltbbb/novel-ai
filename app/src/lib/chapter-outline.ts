import type {
  ChapterGenerationModeHint,
  ChapterOutline,
  ChapterOutlineBeatDraft,
  ChapterSceneActorRef,
  ChapterSceneDraft,
  ForeshadowAction,
  ForeshadowIntensity,
  ForeshadowRef,
  HookStrength,
  PromptModuleHints,
  PromptModuleKey,
} from '@/types/domain';
import type { ChapterOutlineDraft } from '@/types/ai';

function normalizeText(value: string | undefined | null) {
  return value?.trim() ?? '';
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeStringList(values: Array<string | undefined | null> | undefined) {
  return (values ?? []).map((item) => normalizeText(item)).filter(Boolean);
}

function dedupeTextList(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

const EXTRA_PREWRITE_PROMPT_MODULE_ORDER = ['strand_weave', 'cool_points'] as const satisfies readonly PromptModuleKey[];

function hasOwnField(value: object, field: string) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function normalizePromptModuleKey(value: unknown): PromptModuleKey | null {
  return value === 'strand_weave' || value === 'cool_points' ? value : null;
}

function normalizePromptModuleHints(input: unknown): PromptModuleHints {
  const record = asRecord(input);
  const selectedModules = new Set<PromptModuleKey>();

  for (const value of Array.isArray(record?.extraPrewriteModules) ? record.extraPrewriteModules : []) {
    const normalizedValue = normalizePromptModuleKey(value);

    if (normalizedValue) {
      selectedModules.add(normalizedValue);
    }
  }

  return {
    extraPrewriteModules: EXTRA_PREWRITE_PROMPT_MODULE_ORDER.filter((moduleKey) => selectedModules.has(moduleKey)),
  };
}

function normalizeGenerationModeHint(value: unknown, sceneCount = 0): ChapterGenerationModeHint {
  if (value === 'single-scene-chapter' || value === 'scene-by-scene') {
    return value;
  }

  return sceneCount <= 1 ? 'single-scene-chapter' : 'scene-by-scene';
}

function normalizeForeshadowAction(value: unknown): ForeshadowAction {
  return value === 'shadow' || value === 'plant' || value === 'advance' || value === 'payoff'
    ? value
    : 'shadow';
}

function normalizeForeshadowIntensity(value: unknown): ForeshadowIntensity {
  return value === 'light' || value === 'medium' || value === 'heavy' ? value : 'light';
}

export function createEmptyForeshadowRef(): ForeshadowRef {
  return {
    foreshadowId: '',
    foreshadowTitle: '',
    action: 'shadow',
    intensity: 'light',
    note: '',
  };
}

export function normalizeForeshadowRef(input: Partial<ForeshadowRef> | null | undefined): ForeshadowRef {
  const foreshadowId = normalizeText(input?.foreshadowId);
  const foreshadowTitle = normalizeText(input?.foreshadowTitle);

  return {
    foreshadowId,
    foreshadowTitle,
    action: normalizeForeshadowAction(input?.action),
    intensity: normalizeForeshadowIntensity(input?.intensity),
    note: normalizeText(input?.note),
  };
}

export function normalizeForeshadowRefs(values: Array<Partial<ForeshadowRef> | null | undefined> | undefined) {
  return (values ?? [])
    .map((item) => normalizeForeshadowRef(item))
    .filter((item) => item.foreshadowId || item.foreshadowTitle);
}

function normalizeSceneActorRole(
  value: unknown,
  fallbackRole: ChapterSceneActorRef['role'] = 'support',
): ChapterSceneActorRef['role'] {
  return value === 'focus' || value === 'support' || value === 'candidate' ? value : fallbackRole;
}

export function normalizeSceneActorRef(
  input: Partial<ChapterSceneActorRef> | string | null | undefined,
  fallbackRole: ChapterSceneActorRef['role'] = 'support',
): ChapterSceneActorRef | null {
  if (typeof input === 'string') {
    const characterId = normalizeText(input);

    return characterId
      ? {
          characterId,
          role: fallbackRole,
        }
      : null;
  }

  const record = asRecord(input);
  const characterId = normalizeText(
    typeof input === 'object' && input
      ? input.characterId
      : record?.characterId ?? record?.name ?? record?.entityId,
  );

  if (!characterId) {
    return null;
  }

  return {
    characterId,
    role: normalizeSceneActorRole(record?.role, fallbackRole),
    sceneFocus: normalizeText(record?.sceneFocus),
    sceneTask: normalizeText(record?.sceneTask),
    weakHint: normalizeText(record?.weakHint),
  };
}

export function normalizeSceneActorRefs(
  values: Array<Partial<ChapterSceneActorRef> | string | null | undefined> | undefined,
  fallbackRole: ChapterSceneActorRef['role'] = 'support',
) {
  return (values ?? [])
    .map((item) => normalizeSceneActorRef(item, fallbackRole))
    .filter((item): item is ChapterSceneActorRef => Boolean(item));
}

export function getSceneActorName(actor: Pick<ChapterSceneActorRef, 'characterId'> | string | null | undefined) {
  if (typeof actor === 'string') {
    return normalizeText(actor);
  }

  return normalizeText(actor?.characterId);
}

export function getSceneActorNames(
  actors: Array<Pick<ChapterSceneActorRef, 'characterId'> | string | null | undefined> | undefined,
) {
  return dedupeTextList((actors ?? []).map((actor) => getSceneActorName(actor)).filter(Boolean));
}

export function createEmptyOutlineBeatDraft(): ChapterOutlineBeatDraft {
  return {
    beatId: '',
    sceneId: '',
    beatTitle: '',
    scene: '',
    anchors: [],
    actors: [],
    progress: '',
    result: '',
    entityRefs: [],
    foreshadowRefs: [],
    forbiddenNotes: [],
  };
}

export function normalizeOutlineBeatDraft(
  input: Partial<ChapterOutlineBeatDraft> | null | undefined,
): ChapterOutlineBeatDraft {
  return {
    beatId: normalizeText(input?.beatId),
    sceneId: normalizeText(input?.sceneId),
    beatTitle: normalizeText(input?.beatTitle),
    scene: normalizeText(input?.scene),
    anchors: normalizeStringList(input?.anchors),
    actors: normalizeStringList(input?.actors),
    progress: normalizeText(input?.progress),
    result: normalizeText(input?.result),
    entityRefs: normalizeStringList(input?.entityRefs),
    foreshadowRefs: normalizeForeshadowRefs(input?.foreshadowRefs),
    forbiddenNotes: normalizeStringList(input?.forbiddenNotes),
  };
}

export function readOutlineBeatDraft(value: unknown) {
  const record = asRecord(value);
  return normalizeOutlineBeatDraft({
    beatId: readString(record?.beatId),
    sceneId: readString(record?.sceneId),
    beatTitle: readString(record?.beatTitle),
    scene: readString(record?.scene),
    anchors: readStringList(record?.anchors),
    actors: readStringList(record?.actors),
    progress: readString(record?.progress),
    result: readString(record?.result),
    entityRefs: readStringList(record?.entityRefs),
    foreshadowRefs: Array.isArray(record?.foreshadowRefs) ? record?.foreshadowRefs as Array<Partial<ForeshadowRef>> : [],
    forbiddenNotes: readStringList(record?.forbiddenNotes),
  });
}

export function summarizeOutlineBeatDraft(beat: ChapterOutlineBeatDraft) {
  return (
    [
      normalizeText(beat.beatId),
      normalizeText(beat.beatTitle),
      normalizeText(beat.progress),
      normalizeText(beat.result),
      normalizeText(beat.scene),
    ].find(Boolean) ?? ''
  );
}

function normalizeHookStrength(value: unknown): HookStrength {
  return value === 'soft' || value === 'medium' || value === 'strong' ? value : 'medium';
}

export function createEmptyChapterSceneDraft(): ChapterSceneDraft {
  return {
    sceneId: '',
    sceneTitle: '',
    macroScene: '',
    sceneRole: '',
    sceneGoal: '',
    sceneObstacle: '',
    sceneTimeSpan: '',
    scenePacing: '',
    sceneResult: '',
    sceneHook: '',
    estimatedWords: 0,
    actors: [],
    availableCharacters: [],
    sceneAnchors: [],
    infoBudget: '',
    powerShift: '',
    personalConflict: '',
    foreshadowRefs: [],
    forbiddenNotes: [],
    beatRefs: [],
  };
}

export function normalizeChapterSceneDraft(
  input: Partial<ChapterSceneDraft> | null | undefined,
): ChapterSceneDraft {
  return {
    sceneId: normalizeText(input?.sceneId),
    sceneTitle: normalizeText(input?.sceneTitle),
    macroScene: normalizeText(input?.macroScene),
    sceneRole: normalizeText(input?.sceneRole),
    sceneGoal: normalizeText(input?.sceneGoal),
    sceneObstacle: normalizeText(input?.sceneObstacle),
    sceneTimeSpan: normalizeText(input?.sceneTimeSpan),
    scenePacing: normalizeText(input?.scenePacing),
    sceneResult: normalizeText(input?.sceneResult),
    sceneHook: normalizeText(input?.sceneHook),
    estimatedWords: Math.max(0, Math.trunc(readNumber(input?.estimatedWords))),
    actors: normalizeSceneActorRefs(input?.actors, 'support'),
    availableCharacters: normalizeSceneActorRefs(input?.availableCharacters, 'candidate'),
    sceneAnchors: normalizeStringList(input?.sceneAnchors),
    infoBudget: normalizeText(input?.infoBudget),
    powerShift: normalizeText(input?.powerShift),
    personalConflict: normalizeText(input?.personalConflict),
    foreshadowRefs: normalizeForeshadowRefs(input?.foreshadowRefs),
    forbiddenNotes: normalizeStringList(input?.forbiddenNotes),
    beatRefs: normalizeStringList(input?.beatRefs),
  };
}

export function readChapterSceneDraft(value: unknown) {
  const record = asRecord(value);
  return normalizeChapterSceneDraft({
    sceneId: readString(record?.sceneId),
    sceneTitle: readString(record?.sceneTitle),
    macroScene: readString(record?.macroScene),
    sceneRole: readString(record?.sceneRole),
    sceneGoal: readString(record?.sceneGoal),
    sceneObstacle: readString(record?.sceneObstacle),
    sceneTimeSpan: readString(record?.sceneTimeSpan),
    scenePacing: readString(record?.scenePacing),
    sceneResult: readString(record?.sceneResult),
    sceneHook: readString(record?.sceneHook),
    estimatedWords: readNumber(record?.estimatedWords),
    actors: Array.isArray(record?.actors) ? record.actors as Array<Partial<ChapterSceneActorRef> | string> : [],
    availableCharacters: Array.isArray(record?.availableCharacters)
      ? record.availableCharacters as Array<Partial<ChapterSceneActorRef> | string>
      : [],
    sceneAnchors: readStringList(record?.sceneAnchors),
    infoBudget: readString(record?.infoBudget),
    powerShift: readString(record?.powerShift),
    personalConflict: readString(record?.personalConflict),
    foreshadowRefs: Array.isArray(record?.foreshadowRefs) ? record.foreshadowRefs as Array<Partial<ForeshadowRef>> : [],
    forbiddenNotes: readStringList(record?.forbiddenNotes),
    beatRefs: readStringList(record?.beatRefs),
  });
}

export function summarizeChapterSceneDraft(scene: ChapterSceneDraft) {
  return (
    [
      normalizeText(scene.sceneTitle),
      normalizeText(scene.sceneGoal),
      normalizeText(scene.sceneResult),
      normalizeText(scene.sceneRole),
      normalizeText(scene.macroScene),
    ].find(Boolean) ?? ''
  );
}

export function createEmptyChapterOutlineDraft(): ChapterOutlineDraft {
  return {
    goal: '',
    obstacle: '',
    cost: '',
    beats: [],
    timeAnchor: '',
    chapterTimeSpan: '',
    gapFromPrevious: '',
    strand: 'quest',
    hookType: '',
    hookStrength: 'medium',
    immutableFacts: [],
    chapterFunction: '',
    chapterBoundary: '',
    revealCeiling: '',
    openingState: '',
    closingState: '',
    focusCharacter: '',
    mustAppearCharacters: [],
    availableCharacters: [],
    mainPlot: '',
    subPlot: '',
    coreScene: '',
    sceneAnchors: [],
    infoBudget: '',
    powerShift: '',
    personalConflict: '',
    emotionalOutcome: '',
    chapterHook: '',
    generationModeHint: 'single-scene-chapter',
    sceneDecisionNote: '',
    foreshadowRefs: [],
    sceneDrafts: [],
    beatDrafts: [],
    promptModuleHints: {
      extraPrewriteModules: [],
    },
  };
}

export function createChapterOutlineDraft(
  outline?: ChapterOutline | ChapterOutlineDraft | null,
): ChapterOutlineDraft {
  if (!outline) {
    return createEmptyChapterOutlineDraft();
  }

  return normalizeChapterOutlineDraft({
    ...createEmptyChapterOutlineDraft(),
    ...outline,
    beats: Array.isArray(outline.beats) ? [...outline.beats] : [],
    immutableFacts: Array.isArray(outline.immutableFacts) ? [...outline.immutableFacts] : [],
    mustAppearCharacters: Array.isArray(outline.mustAppearCharacters) ? [...outline.mustAppearCharacters] : [],
    availableCharacters: Array.isArray(outline.availableCharacters) ? [...outline.availableCharacters] : [],
    sceneAnchors: Array.isArray(outline.sceneAnchors) ? [...outline.sceneAnchors] : [],
    foreshadowRefs: Array.isArray(outline.foreshadowRefs) ? [...outline.foreshadowRefs] : [],
    sceneDrafts: Array.isArray(outline.sceneDrafts) ? [...outline.sceneDrafts] : [],
    beatDrafts: Array.isArray(outline.beatDrafts) ? [...outline.beatDrafts] : [],
  });
}

export function readChapterOutlineDraft(value: unknown) {
  const record = asRecord(value);
  const draft = createEmptyChapterOutlineDraft();
  const hasPromptModuleHints = Boolean(record && hasOwnField(record, 'promptModuleHints'));

  return normalizeChapterOutlineDraft({
    ...draft,
    goal: readString(record?.goal) || readString(record?.chapterGoal),
    obstacle: readString(record?.obstacle),
    cost: readString(record?.cost),
    beats: readStringList(record?.beats),
    timeAnchor: readString(record?.timeAnchor),
    chapterTimeSpan: readString(record?.chapterTimeSpan),
    gapFromPrevious: readString(record?.gapFromPrevious),
    strand: record?.strand === 'fire' || record?.strand === 'constellation' ? record.strand : 'quest',
    hookType: readString(record?.hookType),
    hookStrength:
      record?.hookStrength === 'soft' || record?.hookStrength === 'strong' ? record.hookStrength : 'medium',
    immutableFacts: readStringList(record?.immutableFacts),
    chapterFunction: readString(record?.chapterFunction),
    chapterBoundary: readString(record?.chapterBoundary),
    revealCeiling: readString(record?.revealCeiling),
    openingState: readString(record?.openingState),
    closingState: readString(record?.closingState),
    focusCharacter: readString(record?.focusCharacter),
    mustAppearCharacters: readStringList(record?.mustAppearCharacters),
    availableCharacters: readStringList(record?.availableCharacters),
    mainPlot: readString(record?.mainPlot),
    subPlot: readString(record?.subPlot),
    coreScene: readString(record?.coreScene),
    sceneAnchors: readStringList(record?.sceneAnchors),
    infoBudget: readString(record?.infoBudget),
    powerShift: readString(record?.powerShift),
    personalConflict: readString(record?.personalConflict),
    emotionalOutcome: readString(record?.emotionalOutcome),
    chapterHook: readString(record?.chapterHook),
    generationModeHint: normalizeGenerationModeHint(record?.generationModeHint),
    sceneDecisionNote: readString(record?.sceneDecisionNote),
    foreshadowRefs: Array.isArray(record?.foreshadowRefs) ? record?.foreshadowRefs as Array<Partial<ForeshadowRef>> : [],
    sceneDrafts: Array.isArray(record?.sceneDrafts) ? record.sceneDrafts.map((item) => readChapterSceneDraft(item)) : [],
    beatDrafts: Array.isArray(record?.beatDrafts) ? record.beatDrafts.map((item) => readOutlineBeatDraft(item)) : [],
    ...(hasPromptModuleHints ? { promptModuleHints: normalizePromptModuleHints(record?.promptModuleHints) } : {}),
  });
}

export function normalizeChapterOutlineDraft(draft: ChapterOutlineDraft): ChapterOutlineDraft {
  const sceneDrafts = (draft.sceneDrafts ?? [])
    .map((item) => normalizeChapterSceneDraft(item))
    .filter(
      (item) =>
        item.sceneId ||
        item.sceneTitle ||
        item.sceneGoal ||
        item.sceneResult ||
        item.sceneRole ||
        item.macroScene,
    );
  const beatDrafts = (draft.beatDrafts ?? [])
    .map((item) => normalizeOutlineBeatDraft(item))
    .filter((item) => item.beatId || item.beatTitle || item.progress || item.result || item.scene);
  const beats = sceneDrafts.length > 0
    ? sceneDrafts.map((item) => summarizeChapterSceneDraft(item)).filter(Boolean)
    : beatDrafts.length > 0
      ? beatDrafts.map((item) => summarizeOutlineBeatDraft(item)).filter(Boolean)
      : normalizeStringList(draft.beats);
  const normalizedChapterBoundary = normalizeText(draft.chapterBoundary);
  const normalizedRevealCeiling = normalizeText(draft.revealCeiling);
  const normalizedOpeningState = normalizeText(draft.openingState);
  const normalizedClosingState = normalizeText(draft.closingState);
  const rawImmutableFacts = normalizeStringList(draft.immutableFacts);
  const sanitizedSceneImmutableFacts = rawImmutableFacts.filter((item) => {
    const normalizedItem = normalizeText(item);

    return (
      normalizedItem &&
      normalizedItem !== normalizedChapterBoundary &&
      normalizedItem !== normalizedRevealCeiling &&
      normalizedItem !== normalizedOpeningState &&
      normalizedItem !== normalizedClosingState
    );
  });
  const immutableFacts =
    rawImmutableFacts.length > 0
      ? sceneDrafts.length > 0
        ? sanitizedSceneImmutableFacts
        : rawImmutableFacts
      : sceneDrafts.length > 0
        ? []
        : dedupeTextList([
            normalizedChapterBoundary,
            normalizedRevealCeiling,
            normalizedOpeningState,
            normalizedClosingState,
          ]);
  const hasPromptModuleHints = hasOwnField(draft, 'promptModuleHints');
  const normalizedPromptModuleHints = hasPromptModuleHints ? normalizePromptModuleHints(draft.promptModuleHints) : undefined;
  const sceneAnchors = normalizeStringList(draft.sceneAnchors);
  const sceneLevelAnchors = dedupeTextList(sceneDrafts.flatMap((item) => item.sceneAnchors));
  const normalizedForeshadowRefs = normalizeForeshadowRefs(draft.foreshadowRefs);
  const sceneLevelForeshadowRefs = sceneDrafts.flatMap((item) => item.foreshadowRefs);
  const sceneLevelAvailableCharacters = dedupeTextList(sceneDrafts.flatMap((item) => getSceneActorNames(item.availableCharacters)));
  const sceneLevelActors = dedupeTextList(sceneDrafts.flatMap((item) => getSceneActorNames(item.actors)));
  const derivedCoreScene =
    normalizeText(draft.coreScene) ||
    sceneDrafts.map((item) => [item.sceneTitle, item.macroScene].find(Boolean) ?? '').find(Boolean) ||
    '';
  const derivedInfoBudget = normalizeText(draft.infoBudget) || sceneDrafts.map((item) => item.infoBudget).find(Boolean) || '';
  const derivedPowerShift = normalizeText(draft.powerShift) || sceneDrafts.map((item) => item.powerShift).find(Boolean) || '';
  const derivedPersonalConflict =
    normalizeText(draft.personalConflict) || sceneDrafts.map((item) => item.personalConflict).find(Boolean) || '';
  const derivedChapterHook = normalizeText(draft.chapterHook) || [...sceneDrafts].reverse().map((item) => item.sceneHook).find(Boolean) || '';
  const derivedGenerationModeHint = normalizeGenerationModeHint(draft.generationModeHint, sceneDrafts.length);
  const normalizedGoal = normalizeText(draft.goal) || normalizeText(draft.chapterFunction) || normalizeText(draft.mainPlot) || sceneDrafts.map((item) => item.sceneGoal).find(Boolean) || '';
  const rawObstacle = normalizeText(draft.obstacle);
  const rawCost = normalizeText(draft.cost);
  const normalizedObstacle =
    sceneDrafts.length > 0
      ? (
          rawObstacle && rawObstacle !== normalizedChapterBoundary
            ? rawObstacle
            : sceneDrafts.map((item) => item.sceneObstacle).find(Boolean) || ''
        )
      : normalizeText(draft.obstacle) ||
        normalizedChapterBoundary ||
        normalizeText(draft.personalConflict) ||
        sceneDrafts.map((item) => item.sceneObstacle).find(Boolean) ||
        '';
  const normalizedCost =
    sceneDrafts.length > 0
      ? (
          rawCost &&
          rawCost !== derivedInfoBudget &&
          rawCost !== derivedPowerShift
            ? rawCost
            : ''
        )
      : rawCost || normalizeText(draft.infoBudget) || normalizeText(draft.powerShift);

  return {
    goal: normalizedGoal,
    obstacle: normalizedObstacle,
    cost: normalizedCost,
    beats,
    timeAnchor: normalizeText(draft.timeAnchor),
    chapterTimeSpan: normalizeText(draft.chapterTimeSpan),
    gapFromPrevious: normalizeText(draft.gapFromPrevious),
    strand: draft.strand ?? 'quest',
    hookType: normalizeText(draft.hookType) || (normalizeText(draft.chapterHook) ? '章纲钩子' : ''),
    hookStrength: normalizeHookStrength(draft.hookStrength),
    immutableFacts,
    chapterFunction: normalizeText(draft.chapterFunction),
    chapterBoundary: normalizeText(draft.chapterBoundary),
    revealCeiling: normalizeText(draft.revealCeiling),
    openingState: normalizeText(draft.openingState),
    closingState: normalizeText(draft.closingState),
    focusCharacter: normalizeText(draft.focusCharacter),
    mustAppearCharacters: dedupeTextList([
      ...normalizeStringList(draft.mustAppearCharacters),
      ...sceneLevelActors,
    ]),
    availableCharacters: dedupeTextList([
      ...normalizeStringList(draft.availableCharacters),
      ...sceneLevelAvailableCharacters,
    ]),
    mainPlot: normalizeText(draft.mainPlot),
    subPlot: normalizeText(draft.subPlot),
    coreScene: derivedCoreScene,
    sceneAnchors: dedupeTextList([...sceneAnchors, ...sceneLevelAnchors]),
    infoBudget: derivedInfoBudget,
    powerShift: derivedPowerShift,
    personalConflict: derivedPersonalConflict,
    emotionalOutcome: normalizeText(draft.emotionalOutcome),
    chapterHook: derivedChapterHook,
    generationModeHint: derivedGenerationModeHint,
    sceneDecisionNote: normalizeText(draft.sceneDecisionNote),
    foreshadowRefs:
      normalizedForeshadowRefs.length > 0
        ? normalizedForeshadowRefs
        : normalizeForeshadowRefs(sceneLevelForeshadowRefs),
    sceneDrafts,
    beatDrafts,
    ...(hasPromptModuleHints ? { promptModuleHints: normalizedPromptModuleHints } : {}),
  };
}

export function serializeForeshadowRef(ref: ForeshadowRef) {
  const title = ref.foreshadowTitle?.trim() || ref.foreshadowId.trim();
  const suffix = [`${ref.action}/${ref.intensity}`, normalizeText(ref.note)].filter(Boolean).join(' | ');
  return suffix ? `${title}（${suffix}）` : title;
}

export function serializeChapterOutlineDraft(draft: ChapterOutlineDraft) {
  const normalized = normalizeChapterOutlineDraft(draft);

  return [
    normalized.goal ? `章节目标：${normalized.goal}` : '',
    normalized.chapterFunction ? `本章功能：${normalized.chapterFunction}` : '',
    normalized.generationModeHint === 'single-scene-chapter' ? '写作模式：单场景直出整章' : '写作模式：按场景推进',
    normalized.sceneDecisionNote ? `场景决策说明：${normalized.sceneDecisionNote}` : '',
    normalized.chapterBoundary ? `章节边界：${normalized.chapterBoundary}` : '',
    normalized.revealCeiling ? `揭露上限：${normalized.revealCeiling}` : '',
    normalized.openingState ? `开章状态：${normalized.openingState}` : '',
    normalized.closingState ? `收章状态：${normalized.closingState}` : '',
    normalized.focusCharacter ? `焦点角色：${normalized.focusCharacter}` : '',
    normalized.sceneDrafts.length > 0
      ? [
          '场景清单：',
          ...normalized.sceneDrafts.map((scene, index) =>
            `${index + 1}. ${[
              scene.sceneTitle || `场景${index + 1}`,
              scene.sceneGoal ? `目标：${scene.sceneGoal}` : '',
              scene.sceneResult ? `结果：${scene.sceneResult}` : '',
              scene.sceneHook ? `钩子：${scene.sceneHook}` : '',
            ].filter(Boolean).join(' / ')}`,
          ),
        ].join('\n')
      : '',
    normalized.foreshadowRefs.length > 0
      ? `伏笔安排：${normalized.foreshadowRefs.map((item) => serializeForeshadowRef(item)).join('；')}`
      : '',
    normalized.beatDrafts.length > 0
      ? [
          '段级推进：',
          ...normalized.beatDrafts.map((item, index) =>
            `${index + 1}. ${[
              item.beatTitle,
              item.progress,
              item.result ? `结果：${item.result}` : '',
            ].filter(Boolean).join(' / ')}`,
          ),
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function collectChapterOutlinePlanningRequirements(draft: ChapterOutlineDraft) {
  const normalized = normalizeChapterOutlineDraft(draft);

  return {
    requiredEntityNames: dedupeTextList([
      normalized.focusCharacter,
      ...(normalized.mustAppearCharacters ?? []),
      ...(normalized.sceneDrafts ?? []).flatMap((item) => getSceneActorNames(item.actors)),
    ]),
    availableCharacterNames: dedupeTextList([
      ...(normalized.availableCharacters ?? []),
      ...(normalized.sceneDrafts ?? []).flatMap((item) => getSceneActorNames(item.availableCharacters)),
    ]),
    requiredForeshadowTitles: dedupeTextList(
      [
        ...(normalized.foreshadowRefs ?? []),
        ...(normalized.sceneDrafts ?? []).flatMap((item) => item.foreshadowRefs),
      ]
        .filter((item) => !(item.action === 'shadow' && item.intensity === 'light'))
        .map((item) => item.foreshadowTitle?.trim() || item.foreshadowId.trim()),
    ),
  };
}

export function getChapterWriteUnitLabels(draft: ChapterOutlineDraft) {
  const normalized = normalizeChapterOutlineDraft(draft);

  if (normalized.sceneDrafts.length > 0) {
    return normalized.sceneDrafts.map((scene, index) => scene.sceneTitle || scene.sceneRole || `场景 ${index + 1}`);
  }

  return normalized.beats;
}

export function getChapterWriteUnitCount(draft: ChapterOutlineDraft) {
  return getChapterWriteUnitLabels(draft).length;
}
