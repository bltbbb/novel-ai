import type { RichTextDocument } from './editor';

export type Id = string;
export type Timestamp = string;

export type ChapterStatus = 'draft' | 'first_draft' | 'revised' | 'published';
export type ForeshadowStatus = 'planted' | 'activated' | 'resolved' | 'overdue';
export type ThreadLedgerStatus = 'active' | 'dormant' | 'resolved';
export type ForeshadowPlanImportance = 'major' | 'minor';
export type QuestionPoolStatus = 'open' | 'partial' | 'answered';
export type AntagonistAgendaStatus = 'active' | 'defeated' | 'dormant';
export type ResourceContinuityStatus = 'active' | 'recovered' | 'permanent';
export type ResourceContinuityRiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type StructureMemorySyncStatus = 'synced' | 'pending_push' | 'sync_error';
export type SnapshotSource = 'manual' | 'ai_continue';
export type IdeaCardSource = 'manual' | 'ai_output';
export type StrandType = 'quest' | 'fire' | 'constellation';
export type HookStrength = 'soft' | 'medium' | 'strong';
export type ForeshadowAction = 'shadow' | 'plant' | 'advance' | 'payoff';
export type ForeshadowIntensity = 'light' | 'medium' | 'heavy';
export type ChapterOutlineSource = 'manual' | 'generated';
export type PromptModuleKey = 'strand_weave' | 'cool_points';
export type ChapterGenerationModeHint = 'single-scene-chapter' | 'scene-by-scene';
export type AIReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type ReasoningEffortSetting = 'model_default' | AIReasoningEffort;
export type ProjectGateSeverity = 'critical' | 'high' | 'medium' | 'low';
export type GenerationQueueStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'approved'
  | 'discarded'
  | 'error';
export type GenerationQueueProgressStage =
  | 'plan'
  | 'write'
  | 'style'
  | 'review'
  | 'polish'
  | 'editor_refine'
  | 'extract';

export type LoreEntityType =
  | 'character'
  | 'functional_role'
  | 'faction'
  | 'location'
  | 'magic_system'
  | 'item'
  | 'event';

export type LoreEntityFieldValue = string | number | boolean | null;
export type LoreEntityFields = Record<string, LoreEntityFieldValue>;

export interface ProjectGenerationGateOverride {
  reviewRewriteMinSeverity: ProjectGateSeverity;
  reviewMaxRewriteCount: number;
  reviewScoreThresholds: {
    consistency: number;
    continuity: number;
    reader_pull: number;
  };
  polishFailBlockReady: boolean;
  lightweightRecall: {
    minScore: number;
    topK: number;
    phraseWeight: number;
    entityWeight: number;
    recencyWeight: number;
  };
}

export interface TemplatePromptBundle {
  bookOutlinePrompt: string;
  volumeOutlinePrompt: string;
  milestonePrompt: string;
  beatPrompt: string;
  writingPrompt: string;
  stylePrompt: string;
  negativePrompt: string;
}

export interface TemplateAnalysisMeta {
  method: string;
  totalSegments: number;
  sampledSegments: number;
  estimatedWordCount: number;
  paragraphCount?: number;
  averageParagraphLength?: number;
  dialogueParagraphRatio?: number;
  headingSegmentCount?: number;
  dominantPerspective?: string;
  topTransitionWords?: string[];
  evidenceSnippets?: Array<{
    title: string;
    excerpt: string;
  }>;
}

export interface TemplateSubPromptBundle {
  beatPrompt: string;
  writingPrompt: string;
  stylePrompt: string;
  negativePrompt: string;
}

export interface TemplateSubTemplateDraft {
  summary: string;
  usage: string;
  promptBundle: TemplateSubPromptBundle;
}

export interface TemplateSubTemplates {
  opening: TemplateSubTemplateDraft;
  middle: TemplateSubTemplateDraft;
  climax: TemplateSubTemplateDraft;
  ending: TemplateSubTemplateDraft;
}

export interface TemplateLibraryDraft {
  name: string;
  sourceTitle: string;
  sourceAuthor: string;
  tags: string[];
  summary: string;
  narrativeStyle: string;
  pacingStyle: string;
  conflictStyle: string;
  characterStyle: string;
  dialogueStyle: string;
  openingStyle: string;
  endingHookStyle: string;
  commonPatterns: string[];
  forbiddenPatterns: string[];
  promptBundle: TemplatePromptBundle;
  subTemplates: TemplateSubTemplates;
  analysisMeta: TemplateAnalysisMeta | null;
}

export interface TemplateLibraryItem extends TemplateLibraryDraft {
  id: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProjectTemplateSnapshot {
  templateId: Id | null;
  templateName: string;
  sourceTitle: string;
  sourceAuthor: string;
  summary: string;
  tags: string[];
  promptBundle: TemplatePromptBundle;
  subTemplates: TemplateSubTemplates;
  boundAt: Timestamp;
}

export interface Project {
  id: Id;
  title: string;
  description: string;
  genre: string[];
  stylePrompt: string;
  templateSnapshot: ProjectTemplateSnapshot | null;
  generationGateOverride: ProjectGenerationGateOverride | null;
  wordCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Chapter {
  id: Id;
  projectId: Id;
  volumeId?: Id;
  volumeTitle?: string;
  title: string;
  order: number;
  content: RichTextDocument;
  wordCount: number;
  status: ChapterStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Volume {
  id: Id;
  projectId: Id;
  title: string;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BookCharacterArcDraft {
  characterId: Id | null;
  characterName: string;
  arc: string;
}

export interface BookOutlineFields {
  premise: string;
  centralConflict: string;
  protagonistArc: string;
  thematicCore: string;
  subPlots: string[];
  characterArcs: BookCharacterArcDraft[];
  powerSystem: string;
  antagonistSystem: string;
  narrativeArc: string;
  logline: string;
  worldRules: string[];
  endgameHint: string;
  toneGuide: string;
  summary?: string;
}

export interface BookOutline extends BookOutlineFields {
  id: Id;
  projectId: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VolumeMilestoneDraft {
  title: string;
  targetChapterCount: number;
  phaseGoal: string;
  phaseConflict: string;
  entryState: string;
  exitState: string;
  phasePacing: string;
  phaseEmotionShift: string;
  phasePOV: string;
  keyTurns: string[];
  mustPlant: string[];
  mustPayoff: string[];
  powerCeiling: string;
  requiredEntities?: string[];
  requiredForeshadows?: string[];
  requiredForeshadowIds?: string[];
  foreshadowRefs?: ForeshadowRef[];
  summary?: string;
}

export interface VolumeInheritedThreadDraft {
  threadId: Id | null;
  threadName: string;
  note: string;
}

export interface VolumeOutlineFields {
  goal: string;
  keyConflict: string;
  arcSummary: string;
  entryState: string;
  exitState: string;
  antagonist: string;
  subPlot: string;
  inheritedThreads: VolumeInheritedThreadDraft[];
  protagonistGrowth: string;
  emotionalArc: string;
  estimatedWordCount: number;
  povPlan: string;
  keyEvents: string[];
  foreshadowSeeds: string[];
  requiredEntities?: string[];
  requiredForeshadows?: string[];
  requiredForeshadowIds?: string[];
  foreshadowRefs?: ForeshadowRef[];
  estimatedChapterCount: number;
  milestones: VolumeMilestoneDraft[];
  summary?: string;
}

export interface VolumeOutline extends VolumeOutlineFields {
  id: Id;
  projectId: Id;
  volumeId: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChapterBeatFields {
  orderInVolume: number;
  titleHint: string;
  scenePurpose: string;
  focusCharacter: string;
  mustAppearCharacters?: string[];
  availableCharacters?: string[];
  requiredForeshadows?: string[];
  mainPlot: string;
  subPlot: string;
  pacing: string;
  hookOut: string;
  noveltyRequirement: string;
  powerDelta: string;
  forbiddenPhrases: string[];
  forbiddenScenePatterns: string[];
  keyItems: string[];
  milestoneIndex?: number;
}

export interface ChapterBeat extends ChapterBeatFields {
  id: Id;
  projectId: Id;
  volumeId: Id;
  chapterId?: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ForeshadowRef {
  foreshadowId: string;
  foreshadowTitle?: string;
  action: ForeshadowAction;
  intensity: ForeshadowIntensity;
  note?: string;
}

export type ChapterSceneActorRole = 'focus' | 'support' | 'candidate';

export interface ChapterSceneActorRef {
  characterId: string;
  role: ChapterSceneActorRole;
  sceneFocus?: string;
  sceneTask?: string;
  weakHint?: string;
}

export interface ChapterOutlineBeatDraft {
  beatId?: string;
  sceneId?: string;
  beatTitle: string;
  scene: string;
  anchors: string[];
  actors: string[];
  progress: string;
  result: string;
  entityRefs: string[];
  foreshadowRefs: ForeshadowRef[];
  forbiddenNotes: string[];
}

export interface PromptModuleHints {
  extraPrewriteModules?: PromptModuleKey[];
}

export interface ChapterSceneDraft {
  sceneId: string;
  sceneTitle: string;
  macroScene: string;
  sceneRole: string;
  sceneGoal: string;
  sceneObstacle: string;
  sceneTimeSpan: string;
  scenePacing: string;
  sceneResult: string;
  sceneHook: string;
  estimatedWords: number;
  actors: ChapterSceneActorRef[];
  availableCharacters: ChapterSceneActorRef[];
  sceneAnchors: string[];
  infoBudget: string;
  powerShift: string;
  personalConflict: string;
  foreshadowRefs: ForeshadowRef[];
  forbiddenNotes: string[];
  beatRefs: string[];
}

export interface LoreEntity {
  id: Id;
  projectId: Id;
  type: LoreEntityType;
  name: string;
  description: string;
  fields: LoreEntityFields;
  tags: string[];
  pinned: boolean;
  aliases?: string[];
  draft?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EntityRelation {
  id: Id;
  projectId: Id;
  sourceEntityId: Id;
  targetEntityId: Id;
  sourceEntityName: string;
  targetEntityName: string;
  relationType: string;
  origin: string;
  description: string;
  currentStance: string;
  currentIntensity: number;
  stanceReason: string;
  draft: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Foreshadow {
  id: Id;
  projectId: Id;
  foreshadowId?: string | null;
  title: string;
  excerpt: string;
  notes: string;
  status: ForeshadowStatus;
  sourceChapterId: Id | null;
  resolvedChapterId: Id | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Snapshot {
  id: Id;
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  content: RichTextDocument;
  source: SnapshotSource;
  note: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface IdeaCard {
  id: Id;
  projectId: Id;
  sourceChapterId: Id | null;
  title: string;
  content: string;
  source: IdeaCardSource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChapterOutline {
  id: Id;
  projectId: Id;
  chapterId: Id;
  source?: ChapterOutlineSource;
  milestoneIndex?: number | null;
  goal: string;
  obstacle: string;
  cost: string;
  beats: string[];
  timeAnchor: string;
  chapterTimeSpan: string;
  gapFromPrevious: string;
  strand: StrandType;
  hookType: string;
  hookStrength: HookStrength;
  immutableFacts: string[];
  chapterFunction?: string;
  chapterBoundary?: string;
  revealCeiling?: string;
  openingState?: string;
  closingState?: string;
  focusCharacter?: string;
  mustAppearCharacters?: string[];
  availableCharacters?: string[];
  mainPlot?: string;
  subPlot?: string;
  coreScene?: string;
  sceneAnchors?: string[];
  infoBudget?: string;
  powerShift?: string;
  personalConflict?: string;
  emotionalOutcome?: string;
  chapterHook?: string;
  generationModeHint?: ChapterGenerationModeHint;
  sceneDecisionNote?: string;
  foreshadowRefs?: ForeshadowRef[];
  sceneDrafts?: ChapterSceneDraft[];
  beatDrafts?: ChapterOutlineBeatDraft[];
  promptModuleHints?: PromptModuleHints;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChapterSummary {
  id: Id;
  projectId: Id;
  chapterId: Id;
  summary: string;
  hook: string;
  foreshadowings: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StateChange {
  id: Id;
  projectId: Id;
  chapterId: Id;
  entityId: Id | null;
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StrandHistoryEntry {
  chapterId: Id;
  chapterTitle: string;
  strand: StrandType;
  createdAt: Timestamp;
}

export interface StrandTracker {
  projectId: Id;
  history: StrandHistoryEntry[];
  lastQuestChapterId: Id | null;
  lastFireChapterId: Id | null;
  lastConstellationChapterId: Id | null;
  updatedAt: Timestamp;
}

export interface ThreadLedger {
  id: Id;
  projectId: Id;
  name: string;
  type: string;
  coreQuestion: string;
  currentPhase: string;
  lastProgressAt: string;
  lastProgressChapterId: Id | null;
  lastProgressChapterTitle: string;
  lastProgressChapterOrder: number | null;
  nextTrigger: string;
  blockedBy: string;
  relatedCharacterIds: Id[];
  relatedCharacterNames: string[];
  relatedForeshadowIds: Id[];
  relatedForeshadowTitles: string[];
  plannedResolveVolume: number | null;
  status: ThreadLedgerStatus;
  audienceHeat: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ThreadLedgerAlert {
  threadLedgerId: Id;
  projectId: Id;
  name: string;
  lastProgressAt: string;
  lastProgressChapterOrder: number | null;
  currentChapterOrder: number;
  overdueChapterCount: number;
  staleChapterGap: number;
  message: string;
}

export interface ForeshadowPlan {
  id: Id;
  projectId: Id;
  foreshadowId: string;
  foreshadowTitle: string;
  type: string;
  importance: ForeshadowPlanImportance;
  activationWindow?: string;
  resolveWindow?: string;
  plannedActivateVolume: number | null;
  plannedResolveVolume: number | null;
  activationCondition: string;
  resolveCondition: string;
  dependsOnForeshadowIds: Id[];
  dependsOnForeshadowTitles: string[];
  dependsOnEventKeys: string[];
  relatedQuestionIds: Id[];
  payoffEffect: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ForeshadowPlanAlert {
  foreshadowPlanId: Id;
  projectId: Id;
  foreshadowId: string;
  foreshadowTitle: string;
  plannedResolveVolume: number | null;
  currentVolumeOrder: number;
  overdueVolumeCount: number;
  message: string;
}

export interface WorldStateEntry {
  id: Id;
  projectId: Id;
  volumeId: Id;
  volumeTitle: string;
  volumeOrder: number;
  milestoneIndex: number | null;
  publicEvents: string[];
  secretEvents: string[];
  powerBalanceChange: string;
  institutionChange: string;
  ruleChange: string;
  rumorState: string;
  knownByCharacterIds: Id[];
  knownByCharacterNames: string[];
  currentRisks: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface QuestionPool {
  id: Id;
  projectId: Id;
  question: string;
  firstRaisedChapterId: Id | null;
  firstRaisedAt: string;
  belongsToThreadId: Id | null;
  belongsToThreadName: string;
  currentClue: string;
  falseAnswers: string[];
  expectedRevealWindow: string;
  finalAnswerSummary: string;
  status: QuestionPoolStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface QuestionPoolAlert {
  questionPoolId: Id;
  projectId: Id;
  question: string;
  expectedRevealWindow: string;
  currentVolumeOrder: number | null;
  overdueVolumeCount: number;
  message: string;
}

export interface AntagonistAgenda {
  id: Id;
  projectId: Id;
  characterEntityId: Id | null;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface POVPermission {
  id: Id;
  projectId: Id;
  volumeId: Id | null;
  volumeTitle: string;
  milestoneIndex: number | null;
  chapterId: Id | null;
  chapterTitle: string;
  povCharacterId: Id | null;
  povCharacterName: string;
  readerKnows: string[];
  protagonistKnows: string[];
  antagonistKnows: string[];
  mustHide: string[];
  canHint: string[];
  forbiddenReveal: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ResourceContinuity {
  id: Id;
  projectId: Id;
  resourceType: string;
  ownerCharacterId: Id | null;
  ownerCharacterName: string;
  currentState: string;
  performanceImpact: string;
  lastConsumedAt: string;
  recoveryCondition: string;
  hiddenCost: string;
  continuityRisk: string;
  status: ResourceContinuityStatus;
  riskLevel: ResourceContinuityRiskLevel;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type StructureMemorySystemKey =
  | 'thread_ledger'
  | 'foreshadow_plan'
  | 'world_state_entry'
  | 'question_pool'
  | 'antagonist_agenda'
  | 'pov_permission'
  | 'resource_continuity';

export type StructureMemoryBackfillSystem =
  | 'thread_ledger'
  | 'question_pool'
  | 'world_state_entry'
  | 'resource_continuity';

export interface StructureMemoryBackfillEvidence {
  sourceType: 'volume_recap' | 'chapter_summary' | 'state_change' | 'foreshadow' | 'generated_text';
  sourceLabel: string;
  excerpt: string;
}

export interface StructureMemoryBackfillCandidate {
  candidateId: Id;
  system: StructureMemoryBackfillSystem;
  status: 'new' | 'existing';
  title: string;
  scopeLabel: string;
  summary: string;
  evidence: StructureMemoryBackfillEvidence[];
}

export interface StructureMemoryBackfillSystemCount {
  system: StructureMemoryBackfillSystem;
  total: number;
  newCount: number;
  existingCount: number;
}

export interface StructureMemoryBackfillPreviewResult {
  projectId: Id;
  generatedAt: Timestamp;
  totalCandidates: number;
  newCandidates: number;
  existingCandidates: number;
  counts: StructureMemoryBackfillSystemCount[];
  candidates: StructureMemoryBackfillCandidate[];
}

export interface StructureMemoryBackfillApplyResult {
  projectId: Id;
  generatedAt: Timestamp;
  requestedCandidateCount: number;
  createdCount: number;
  skippedExistingCount: number;
  counts: Array<{
    system: StructureMemoryBackfillSystem;
    requestedCount: number;
    createdCount: number;
    skippedExistingCount: number;
  }>;
  createdRecordIds: Id[];
}

export type StructureMemoryGuardTrigger =
  | 'project_scan'
  | 'chapter_completed'
  | 'volume_completed'
  | 'structure_memory_updated';

export type StructureMemoryGuardAlertSeverity = 'high' | 'medium' | 'low';

export interface StructureMemoryGuardAlert {
  id: Id;
  ruleKey: string;
  trigger: StructureMemoryGuardTrigger;
  severity: StructureMemoryGuardAlertSeverity;
  title: string;
  message: string;
  evidence: string;
  targetSystem: StructureMemorySystemKey;
  targetRecordId: Id | null;
}

export interface StructureMemoryGuardAlertResult {
  projectId: Id;
  scannedAt: Timestamp;
  trigger: StructureMemoryGuardTrigger;
  items: StructureMemoryGuardAlert[];
}

export interface GenerationQueueOutline {
  goal: string;
  obstacle: string;
  cost: string;
  beats: string[];
  timeAnchor: string;
  chapterTimeSpan: string;
  gapFromPrevious: string;
  strand: StrandType;
  hookType: string;
  hookStrength: HookStrength;
  immutableFacts: string[];
  chapterFunction?: string;
  chapterBoundary?: string;
  revealCeiling?: string;
  openingState?: string;
  closingState?: string;
  focusCharacter?: string;
  mustAppearCharacters?: string[];
  availableCharacters?: string[];
  mainPlot?: string;
  subPlot?: string;
  coreScene?: string;
  sceneAnchors?: string[];
  infoBudget?: string;
  powerShift?: string;
  personalConflict?: string;
  emotionalOutcome?: string;
  chapterHook?: string;
  foreshadowRefs?: ForeshadowRef[];
  beatDrafts?: ChapterOutlineBeatDraft[];
}

export interface GenerationQueueSummary {
  summary: string;
  hook: string;
  foreshadowings: string[];
}

export interface GenerationQueueStateChange {
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface GenerationQueueReviewIssue {
  severity: ProjectGateSeverity;
  title: string;
  description: string;
  suggestion: string;
  evidence: string;
}

export interface GenerationQueueReviewCheckerResult {
  checker: 'consistency' | 'continuity' | 'reader_pull';
  score: number;
  summary: string;
  issues: GenerationQueueReviewIssue[];
}

export interface GenerationQueueReview {
  summary: string;
  overallSeverity: ProjectGateSeverity;
  needsRewrite: boolean;
  antiAiForceCheck: 'pass' | 'fail';
  checkerResults: GenerationQueueReviewCheckerResult[];
}

export interface GenerationQueueLanguageQa {
  severity: ProjectGateSeverity;
  summary: string;
  issues: GenerationQueueReviewIssue[];
}

export interface GenerationQueueItem {
  id: Id;
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  status: GenerationQueueStatus;
  progressStage?: GenerationQueueProgressStage | null;
  progressLabel?: string;
  progressBeatIndex?: number | null;
  progressBeatCount?: number | null;
  generatedText: string;
  outline: GenerationQueueOutline | null;
  review: GenerationQueueReview | null;
  languageQa: GenerationQueueLanguageQa | null;
  summary: GenerationQueueSummary | null;
  stateChanges: GenerationQueueStateChange[];
  strand: StrandType | null;
  errorMessage: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProjectArchive {
  schemaVersion: number;
  exportedAt: Timestamp;
  project: Project;
  chapters: Chapter[];
  entities: LoreEntity[];
  entityRelations?: EntityRelation[];
  foreshadows: Foreshadow[];
  snapshots: Snapshot[];
  ideaCards: IdeaCard[];
  volumes?: Volume[];
  bookOutlines?: BookOutline[];
  volumeOutlines?: VolumeOutline[];
  chapterBeats?: ChapterBeat[];
}

export interface AppSettings {
  serverUrl: string;
  modelName: string;
  temperature: number;
  stylePrompt: string;
  reasoningEffort: ReasoningEffortSetting;
}
