export type AIChatRole = 'system' | 'user' | 'assistant';

export interface AIChatMessage {
  id: string;
  role: AIChatRole;
  content: string;
}

export type AIContextReferenceType = 'chapter' | 'lore' | 'setting' | 'manual';

export interface AIContextReference {
  id: string;
  label: string;
  type: AIContextReferenceType;
  excerpt?: string;
}

export interface AIChatRequest {
  projectId: string;
  chapterId?: string;
  messages: AIChatMessage[];
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
  systemPrompt?: string;
  references?: AIContextReference[];
}

export interface AIStreamChunk {
  delta: string;
  done: boolean;
  error?: string;
}

export interface SearchCandidate {
  chapterId: string;
  chapterTitle: string;
  snippet: string;
}

export interface SearchResult {
  chapterId: string;
  chapterTitle: string;
  snippet: string;
  score: number;
}

export interface SearchRequest {
  projectId: string;
  chapterId?: string;
  query: string;
  candidates: SearchCandidate[];
  topK?: number;
}

export interface SearchResponse {
  results: SearchResult[];
}

export type StrandType = 'quest' | 'fire' | 'constellation';
export type HookStrength = 'soft' | 'medium' | 'strong';
export type AIReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ReviewCheckerType = 'consistency' | 'continuity' | 'reader_pull';
export type AntiAIForceCheck = 'pass' | 'fail';
export type AIProviderPreset = 'openai' | 'deepseek' | 'siliconflow' | 'openrouter' | 'dashscope' | 'zhipu' | 'custom';

export interface AIRuntimeConfig {
  provider: AIProviderPreset;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  embeddingModel?: string;
}

export interface AIRuntimeModelOption {
  id: string;
}

export interface AIRuntimeModelProbeRequest {
  provider?: AIProviderPreset;
  apiKey?: string;
  baseUrl?: string;
}

export interface ReviewScoreThresholds {
  consistency: number;
  continuity: number;
  reader_pull: number;
}

export interface LightweightRecallConfig {
  minScore: number;
  topK: number;
  phraseWeight: number;
  entityWeight: number;
  recencyWeight: number;
}

export type GenerationVectorBackendKind = 'json_cache' | 'sqlite_vec';

export interface GenerationVectorBackendStatus {
  configuredBackend: GenerationVectorBackendKind;
  activeBackend: GenerationVectorBackendKind;
  embeddingModel: string | null;
  isVectorEnabled: boolean;
  supportsIndexedSearch: boolean;
  fallbackReason: string | null;
}

export type GenerationMemoryEmbeddingSkipReason =
  | 'embedding_disabled'
  | 'empty_content'
  | 'embedding_failed';

export interface GenerationMemoryEmbeddingSkipReasonCounts {
  embeddingDisabled: number;
  emptyContent: number;
  embeddingFailed: number;
}

export type GenerationDebugRetrievalHitOrigin = 'lexical_only' | 'vector_only' | 'hybrid';

export interface GenerationDebugVectorSearch {
  status: 'active' | 'disabled' | 'failed';
  source: 'sqlite_vec' | 'json_cache' | 'none';
  candidatePoolSize: number;
  matchedCandidateCount: number;
  topK: number;
  minScore: number;
  minSimilarity: number;
  fallbackReason: string | null;
}

export interface GenerationDebugRetrievalPipeline {
  metadataFilter: {
    inputCandidates: number;
    outputCandidates: number;
    filteredOutCandidates: number;
  };
  hybridRecall: {
    candidateCount: number;
    lexicalOnlyCount: number;
    vectorOnlyCount: number;
    hybridCount: number;
  };
  dedupeRerank: {
    inputCandidates: number;
    dedupedCandidates: number;
    mergedAwayCandidates: number;
  };
  selection: {
    inputCandidates: number;
    selectedCandidates: number;
    thresholdSelectedCandidates: number;
    rescuedVectorOnlyCandidates: number;
    droppedBelowThresholdCandidates: number;
    droppedByLimitCandidates: number;
    limit: number;
    topScore: number | null;
    dynamicThreshold: number | null;
    rescuedVectorOnlyChunkIds: string[];
    droppedVectorOnlyChunkIds: string[];
  };
}

export interface GenerationGateConfig {
  reviewRewriteMinSeverity: ReviewSeverity;
  reviewMaxRewriteCount: number;
  reviewScoreThresholds: ReviewScoreThresholds;
  polishFailBlockReady: boolean;
  lightweightRecall: LightweightRecallConfig;
}

export interface GenerationEntitySnapshot {
  name: string;
  type: string;
  description: string;
  fields: Record<string, unknown>;
  tags: string[];
  pinned: boolean;
}

export type GenerationForeshadowSnapshotStatus = 'planted' | 'activated' | 'resolved' | 'overdue';
export type GenerationForeshadowLifecycle = 'active' | 'dormant' | 'archived';

export interface GenerationForeshadowSnapshot {
  id: string;
  title: string;
  excerpt: string;
  notes: string;
  status: GenerationForeshadowSnapshotStatus;
  sourceChapterId?: string | null;
  sourceChapterTitle?: string;
  resolvedChapterId?: string | null;
  resolvedChapterTitle?: string;
  updatedAt: string;
}

export interface BookOutlineFields {
  premise: string;
  centralConflict: string;
  protagonistArc: string;
  thematicCore: string;
  worldRules: string[];
  endgameHint: string;
  toneGuide: string;
}

export interface VolumeMilestoneDraft {
  title: string;
  targetChapterCount: number;
  phaseGoal: string;
  phaseConflict: string;
  entryState: string;
  exitState: string;
  keyTurns: string[];
  mustPlant: string[];
  mustPayoff: string[];
  powerCeiling: string;
}

export interface VolumeOutlineFields {
  goal: string;
  keyConflict: string;
  arcSummary: string;
  entryState: string;
  exitState: string;
  keyEvents: string[];
  foreshadowSeeds: string[];
  estimatedChapterCount: number;
  milestones: VolumeMilestoneDraft[];
}

export interface ChapterBeatFields {
  orderInVolume: number;
  titleHint: string;
  scenePurpose: string;
  focusCharacter: string;
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

export interface ChapterOutlineDraft {
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
}

export interface ChapterSummaryDraft {
  summary: string;
  hook: string;
  foreshadowings: string[];
}

export interface StateChangeDraft {
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface ReviewIssue {
  severity: ReviewSeverity;
  title: string;
  description: string;
  suggestion: string;
  evidence: string;
}

export interface ReviewCheckerResult {
  checker: ReviewCheckerType;
  score: number;
  summary: string;
  issues: ReviewIssue[];
}

export interface ChapterReviewDraft {
  summary: string;
  overallSeverity: ReviewSeverity;
  needsRewrite: boolean;
  antiAiForceCheck: AntiAIForceCheck;
  checkerResults: ReviewCheckerResult[];
}

export interface ChapterLanguageQaDraft {
  severity: ReviewSeverity;
  summary: string;
  issues: ReviewIssue[];
}

export interface ChapterStyleDraft {
  summary: string;
  appliedChanges: string[];
}

export interface ChapterPolishDraft {
  summary: string;
  antiAiForceCheck: AntiAIForceCheck;
  appliedChanges: string[];
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

export interface AIPlanRequest {
  projectId: string;
  chapterId?: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  bookOutline?: string;
  volumeOutline?: string;
  volumeGoal?: string;
  chapterBeat?: string;
  nextChapterPreview?: string;
  forbiddenZone?: string;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIPlanResponse {
  outline: ChapterOutlineDraft;
  rawText: string;
}

export interface AIWriteRequest {
  projectId: string;
  chapterId?: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  bookOutline?: string;
  volumeOutline?: string;
  volumeGoal?: string;
  chapterBeat?: string;
  nextChapterPreview?: string;
  forbiddenZone?: string;
  currentStateTable?: string;
  outline: ChapterOutlineDraft;
  beatIndex: number;
  currentBeat: string;
  previousText?: string;
  previousSummary?: string;
  worldState?: string;
  rewriteGuidance?: string;
  stylePrompt?: string;
  contextBundle?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIWriteResponse {
  content: string;
  rawText: string;
}

export interface AIReviewRequest {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  bookOutline?: string;
  volumeOutline?: string;
  chapterBeat?: string;
  currentStateTable?: string;
  outline?: ChapterOutlineDraft | null;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
  content: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIReviewResponse {
  review: ChapterReviewDraft;
  rawText: string;
}

export interface AILanguageQaRequest {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  bookOutline?: string;
  volumeOutline?: string;
  chapterBeat?: string;
  currentStateTable?: string;
  outline?: ChapterOutlineDraft | null;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
  content: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AILanguageQaResponse {
  languageQa: ChapterLanguageQaDraft;
  rawText: string;
}

export interface AIStyleRequest {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  bookOutline?: string;
  volumeOutline?: string;
  chapterBeat?: string;
  outline?: ChapterOutlineDraft | null;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
  stylePrompt: string;
  content: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIStyleResponse {
  content: string;
  style: ChapterStyleDraft;
  rawText: string;
}

export interface AIPolishRequest {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  bookOutline?: string;
  volumeOutline?: string;
  outline?: ChapterOutlineDraft | null;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
  review?: ChapterReviewDraft | null;
  languageQa?: ChapterLanguageQaDraft | null;
  content: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIPolishResponse {
  content: string;
  polish: ChapterPolishDraft;
  rawText: string;
}

export type BookAnalysisRange = 'full' | 'opening' | 'middle' | 'ending' | 'custom';

export interface AIBookAnalysisRequest {
  sourceTitle: string;
  sourceAuthor?: string;
  content: string;
  analysisRange?: BookAnalysisRange;
  rangeStartIndex?: number;
  rangeEndIndex?: number;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIBookAnalysisResponse {
  template: TemplateLibraryDraft;
  meta: TemplateAnalysisMeta;
}

export interface AIEpubExtractRequest {
  fileName: string;
  contentBase64: string;
}

export interface AIEpubExtractResponse {
  title: string;
  content: string;
  chapterCount: number;
}

export type BookAnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type BookAnalysisJobStage =
  | 'pending'
  | 'preprocessing'
  | 'light_analyzing'
  | 'sampling'
  | 'chunk_analyzing'
  | 'aggregating'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BookAnalysisJobRecord {
  id: string;
  sourceTitle: string;
  sourceAuthor: string;
  analysisRange: BookAnalysisRange;
  rangeStartIndex: number | null;
  rangeEndIndex: number | null;
  status: BookAnalysisJobStatus;
  progressStage: BookAnalysisJobStage;
  progressPercent: number;
  message: string;
  totalSegments: number;
  sampledSegments: number;
  finishedSegments: number;
  estimatedWordCount: number;
  errorMessage: string;
  result: AIBookAnalysisResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIBookOutlineRequest {
  projectTitle: string;
  projectDescription: string;
  genre: string[];
  seedOutline?: Partial<BookOutlineFields>;
  hint?: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIBookOutlineResponse extends BookOutlineFields {}

export interface AIVolumeOutlineRequest {
  projectTitle: string;
  projectDescription: string;
  bookOutline: string;
  previousVolumeOutline?: string;
  volumeRecaps?: string;
  volumeTitle: string;
  volumeOrder: number;
  seedOutline?: Partial<VolumeOutlineFields>;
  hint?: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIVolumeOutlineResponse extends VolumeOutlineFields {}

export interface AIVolumeMilestonesRequest {
  projectTitle: string;
  projectDescription: string;
  bookOutline: string;
  previousVolumeOutline?: string;
  volumeRecaps?: string;
  volumeTitle: string;
  volumeOrder: number;
  seedOutline?: Partial<VolumeOutlineFields>;
  hint?: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIVolumeMilestonesResponse {
  estimatedChapterCount: number;
  milestones: VolumeMilestoneDraft[];
}

export interface VolumeBeatChapterSlot {
  chapterId?: string;
  chapterTitle?: string;
  chapterNumber: number;
}

export interface VolumeBeatDraft extends Omit<ChapterBeatFields, 'orderInVolume'> {
  chapterId?: string;
  chapterTitle?: string;
  chapterNumber: number;
}

export interface HistoryChapterSummary {
  chapterNumber: number;
  chapterTitle: string;
  summary: string;
  source: 'extract' | 'beat';
}

export interface AIVolumeBeatsRequest {
  projectTitle: string;
  projectDescription: string;
  bookOutline: string;
  volumeOutline: string;
  volumeTitle: string;
  volumeOrder: number;
  overwriteTitles?: boolean;
  chapterSlots?: VolumeBeatChapterSlot[];
  chapterCount?: number;
  milestoneIndex?: number;
  startChapterNumber?: number;
  endChapterNumber?: number;
  estimatedTotalChapters?: number;
  currentMilestone?: string;
  historySummaries?: HistoryChapterSummary[];
  hint?: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIVolumeBeatsResponse {
  beats: VolumeBeatDraft[];
}

export type GenerationJobStatus = 'queued' | 'running' | 'paused' | 'ready' | 'approved' | 'discarded' | 'error';
export type GenerationJobStep = 'queued' | 'plan' | 'write' | 'style' | 'review' | 'polish' | 'extract' | 'complete';

export interface GenerationJobRequest {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  bookOutline?: string;
  volumeOutline?: string;
  volumeGoal?: string;
  chapterBeat?: string;
  nextChapterPreview?: string;
  forbiddenZone?: string;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  stylePrompt?: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
  priority?: number;
  gateConfigOverride?: GenerationGateConfig | null;
  outlineOverride?: ChapterOutlineDraft | null;
  entitySnapshot?: GenerationEntitySnapshot[];
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
}

export interface GenerationJobRecord {
  id: string;
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  status: GenerationJobStatus;
  priority: number;
  currentStep: GenerationJobStep;
  completedBeatCount: number;
  totalBeatCount: number;
  currentBeatIndex: number | null;
  currentBeatLabel: string;
  attemptCount: number;
  reviewRewriteCount: number;
  reviewGateReason: string;
  rewriteGuidance: string;
  pausedAt: string | null;
  request: GenerationJobRequest;
  outline: ChapterOutlineDraft | null;
  generatedText: string;
  style: ChapterStyleDraft | null;
  review: ChapterReviewDraft | null;
  languageQa: ChapterLanguageQaDraft | null;
  polish: ChapterPolishDraft | null;
  summary: ChapterSummaryDraft | null;
  stateChanges: StateChangeDraft[];
  strand: StrandType | null;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationJobBatchRequest {
  jobs: GenerationJobRequest[];
}

export interface GenerationJobBatchResponse {
  jobs: GenerationJobRecord[];
}

export type GenerationJobBatchAction = 'approve' | 'discard';

export interface GenerationJobBatchActionRequest {
  jobIds: string[];
  action: GenerationJobBatchAction;
}

export interface GenerationJobBatchActionResponse {
  jobs: GenerationJobRecord[];
}

export interface GenerationJobListResponse {
  jobs: GenerationJobRecord[];
}

export interface GenerationJobPriorityRequest {
  priority: number;
}

export type GenerationJobRollbackStage = 'review' | 'polish';

export interface GenerationJobRollbackRequest {
  stage: GenerationJobRollbackStage;
}

export interface GenerationProjectArtifactRebuildChapterInput {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  content: string;
  outline?: ChapterOutlineDraft | null;
  summary?: ChapterSummaryDraft | null;
  stateChanges?: StateChangeDraft[];
  strand?: StrandType | null;
  review?: ChapterReviewDraft | null;
  languageQa?: ChapterLanguageQaDraft | null;
}

export interface GenerationProjectArtifactRebuildRequest {
  projectId: string;
  chapters: GenerationProjectArtifactRebuildChapterInput[];
  entitySnapshot: GenerationEntitySnapshot[];
  foreshadowSnapshot: GenerationForeshadowSnapshot[];
}

export interface GenerationProjectArtifactRebuildResponse {
  ok: boolean;
  rebuiltChapterCount: number;
  rebuiltVolumeCount: number;
}

export interface GenerationDebugOverview {
  projectId: string;
  counts: {
    generationJobs: number;
    chapterSummaries: number;
    stateChanges: number;
    reviewMetrics: number;
    entities: number;
    relationships: number;
    foreshadows: number;
    chapterIndex: number;
    volumeRecaps: number;
    memoryChunks: number;
    memoryEmbeddings: number;
  };
  recentJobs: Array<{
    id: string;
    chapterId: string;
    chapterTitle: string;
    status: GenerationJobStatus;
    currentStep: GenerationJobStep;
    updatedAt: string;
  }>;
}

export interface GenerationDebugChapterRecord {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  previousChapterId: string;
  previousChapterTitle: string;
  timeAnchor: string;
  strand: string;
  beatCount: number;
  beats: string[];
  immutableFacts: string[];
  hookType: string;
  hookStrength: string;
  entitiesAppeared: string[];
  locations: string[];
  summaryExcerpt: string;
  hook: string;
  foreshadowings: string[];
  review: {
    overallSeverity: ReviewSeverity;
    needsRewrite: boolean;
    antiAiForceCheck: AntiAIForceCheck;
    checkerResults: ReviewCheckerResult[];
  } | null;
  updatedAt: string;
}

export interface GenerationDebugStateChangeRecord {
  id: string;
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
  updatedAt: string;
}

export interface GenerationDebugChapterDetail extends GenerationDebugChapterRecord {
  stateChanges: GenerationDebugStateChangeRecord[];
  relationships: GenerationDebugRelationshipRecord[];
}

export interface GenerationDebugContextSection {
  key: string;
  title: string;
  blocks: string[];
}

export type GenerationDebugLightweightRecallSource = 'dormant_foreshadow' | 'volume_recap';

export interface GenerationDebugLightweightRecallScoreBreakdown {
  phrase: number;
  entity: number;
  recency: number;
}

export interface GenerationDebugLightweightRecallItem {
  sourceType: GenerationDebugLightweightRecallSource;
  title: string;
  score: number;
  matchedPhrases: string[];
  matchedEntities: string[];
  scoreBreakdown: GenerationDebugLightweightRecallScoreBreakdown;
  updatedAt: string;
  block: string;
}

export interface GenerationDebugStructuredRelationshipSecondaryEvaluation {
  label: 'supplement' | 'fallback';
  reason: GenerationStructuredRelationshipQueryReason | 'unknown';
  raw: string;
}

export type GenerationDebugStructuredRelationshipNonTriggerCategory =
  | 'onehop_sufficient'
  | 'twohop_redundant'
  | 'sparse_history'
  | 'onehop_noise_without_twohop'
  | 'unknown';

export interface GenerationDebugStructuredRelationshipSummary {
  mode: GenerationStructuredRelationshipQueryMode | 'unknown';
  reason: GenerationStructuredRelationshipQueryReason | 'unknown';
  focusEntityNames: string[];
  policy: string;
  secondaryEvaluation: GenerationDebugStructuredRelationshipSecondaryEvaluation | null;
  evaluatedTwoHop: boolean;
  hasTwoHopPathBlock: boolean;
  nonTriggerCategory: GenerationDebugStructuredRelationshipNonTriggerCategory | null;
}

export interface GenerationDebugContext {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
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
  lightweightRecallItems: GenerationDebugLightweightRecallItem[];
  structuredRelationshipDebug: GenerationDebugStructuredRelationshipSummary;
  sections: GenerationDebugContextSection[];
}

export interface GenerationDebugVolumeRecapRecord {
  volumeTitle: string;
  startChapterId: string;
  startChapterOrder: number;
  endChapterId: string;
  endChapterOrder: number;
  chapterCount: number;
  summary: string;
  highlights: string[];
  updatedAt: string;
}

export interface GenerationDebugMemoryChunkRecord {
  id: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  chunkKind: string;
  sourceKind: string;
  chunkIndex: number;
  timeAnchor: string;
  summaryExcerpt: string;
  tokenCount: number;
  entityRefs: string[];
  locations: string[];
  content: string;
  updatedAt: string;
}

export interface GenerationDebugRetrievalHit {
  id: string;
  sourceType: 'memory_chunk' | 'dormant_foreshadow' | 'volume_recap';
  title: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  chunkKind: string;
  sourceKind: string;
  chunkIndex: number;
  timeAnchor: string;
  summaryExcerpt: string;
  entityRefs: string[];
  locations: string[];
  score: number;
  matchedTerms: string[];
  matchedEntityNames: string[];
  matchedLocations: string[];
  contentExcerpt: string;
  updatedAt: string;
  block: string;
  retrievalHitOrigin: GenerationDebugRetrievalHitOrigin;
  retrievalSignals: Array<'lexical' | 'vector'>;
  vectorSimilarity: number | null;
  preRerankScore: number;
  rerankDelta: number;
  rerankReasons: string[];
  mergedCandidateCount: number;
  scoreBreakdown: {
    sameVolume: number;
    phrase: number;
    entity: number;
    location: number;
    recency: number;
    chunkKind: number;
    embedding: number;
  };
}

export interface GenerationDebugRetrieval {
  chapterId: string;
  chapterTitle: string;
  queryPhrases: string[];
  focusEntityNames: string[];
  vectorBackend: GenerationVectorBackendStatus;
  vectorSearch: GenerationDebugVectorSearch;
  pipeline: GenerationDebugRetrievalPipeline;
  items: GenerationDebugRetrievalHit[];
}

export interface GenerationDebugEntityRecord {
  entityName: string;
  entityType: string;
  description: string;
  fields: Record<string, unknown>;
  tags: string[];
  pinned: boolean;
  lastSeenChapterId: string;
  lastSeenChapterTitle: string;
  updatedAt: string;
}

export interface GenerationDebugForeshadowRecord {
  id: string;
  title: string;
  excerpt: string;
  notes: string;
  status: GenerationForeshadowSnapshotStatus;
  lifecycle: GenerationForeshadowLifecycle;
  sourceChapterId: string | null;
  sourceChapterTitle: string;
  sourceChapterOrder: number;
  resolvedChapterId: string | null;
  resolvedChapterTitle: string;
  resolvedChapterOrder: number;
  chapterGap: number | null;
  updatedAt: string;
}

export interface GenerationDebugRelationshipRecord {
  id: string;
  sourceEntityName: string;
  targetEntityName: string | null;
  relationshipType: string;
  sourceKind: string;
  description: string;
  evidence: string;
  chapterId: string;
  chapterTitle: string;
  updatedAt: string;
}

export type GenerationStructuredRelationshipQueryMode = 'graph_1hop' | 'graph_2hop' | 'degraded';
export type GenerationStructuredRelationshipQueryReason =
  | 'ok'
  | 'missing_chapter_context'
  | 'no_focus_entity'
  | 'no_historical_relationship'
  | 'no_two_hop_relationship'
  | 'high_noise';
export type GenerationStructuredRelationshipConfidenceLevel = 'high' | 'medium' | 'low';
export type GenerationStructuredRelationshipFallbackKind = 'chapter_coappearance';

export interface GenerationStructuredRelationshipNode {
  entityName: string;
  entityType: string;
  role: 'focus' | 'neighbor';
  description: string;
  tags: string[];
  pinned: boolean;
  lastSeenChapterTitle: string;
}

export interface GenerationStructuredRelationshipEdge {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: string;
  sourceKind: string;
  description: string;
  evidence: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  confidence: number;
  confidenceLevel: GenerationStructuredRelationshipConfidenceLevel;
}

export interface GenerationStructuredRelationshipFallbackHint {
  kind: GenerationStructuredRelationshipFallbackKind;
  text: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
}

export interface GenerationStructuredRelationshipPath {
  focusEntityName: string;
  viaEntityName: string;
  targetEntityName: string;
  edgeCount: number;
  confidence: number;
  confidenceLevel: GenerationStructuredRelationshipConfidenceLevel;
  sourceKinds: string[];
  chapterOrders: number[];
}

export interface GenerationStructuredRelationshipQueryResult {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  focusEntityNames: string[];
  mode: GenerationStructuredRelationshipQueryMode;
  reason: GenerationStructuredRelationshipQueryReason;
  nodes: GenerationStructuredRelationshipNode[];
  edges: GenerationStructuredRelationshipEdge[];
  paths: GenerationStructuredRelationshipPath[];
  fallbackHints: GenerationStructuredRelationshipFallbackHint[];
  stats: {
    candidateRelationships: number;
    acceptedRelationships: number;
    droppedLowConfidence: number;
    candidatePaths: number;
    acceptedPaths: number;
    droppedNoisyPaths: number;
  };
}

export interface GenerationStructuredRelationshipConsumptionPreview {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  focusEntityNames: string[];
  mode: GenerationStructuredRelationshipQueryMode;
  reason: GenerationStructuredRelationshipQueryReason;
  injectionLayer: 'relationships_experimental_2hop';
  blocks: string[];
  stats: GenerationStructuredRelationshipQueryResult['stats'];
}

export interface GenerationVolumeRecapBackfillResult {
  projectId: string;
  totalVolumes: number;
  processedVolumes: number;
  skippedVolumes: number;
  processedVolumeTitles: string[];
}

export interface AIExtractRequest {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder?: number;
  chapterBeat?: string;
  currentStateTable?: string;
  content: string;
  loreSummary?: string;
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIExtractResponse {
  summary: ChapterSummaryDraft;
  stateChanges: StateChangeDraft[];
  strand: StrandType;
  rawText: string;
}

export interface GenerationArtifactSyncRequest {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
  summary: ChapterSummaryDraft;
  stateChanges: StateChangeDraft[];
  strand: StrandType;
  content: string;
  review?: ChapterReviewDraft | null;
  languageQa?: ChapterLanguageQaDraft | null;
}

export interface GenerationArtifactSyncResponse {
  ok: boolean;
}
