import type { HookStrength, Id, StrandType } from './domain';

export type AIChatRole = 'system' | 'user' | 'assistant';

export interface AIChatMessage {
  id: Id;
  role: AIChatRole;
  content: string;
}

export type AIContextReferenceType = 'chapter' | 'lore' | 'setting' | 'manual';

export interface AIContextReference {
  id: Id;
  label: string;
  type: AIContextReferenceType;
  excerpt?: string;
}

export interface AIChatRequest {
  projectId: Id;
  chapterId?: Id;
  messages: AIChatMessage[];
  model: string;
  temperature: number;
  systemPrompt?: string;
  references?: AIContextReference[];
}

export interface AIStreamChunk {
  delta: string;
  done: boolean;
  error?: string;
}

export interface SearchCandidate {
  chapterId: Id;
  chapterTitle: string;
  snippet: string;
}

export interface SearchResult {
  chapterId: Id;
  chapterTitle: string;
  snippet: string;
  score: number;
}

export interface SearchRequest {
  projectId: Id;
  chapterId?: Id;
  query: string;
  candidates: SearchCandidate[];
  topK?: number;
}

export interface SearchResponse {
  results: SearchResult[];
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

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ReviewCheckerType = 'consistency' | 'continuity' | 'reader_pull';
export type AntiAIForceCheck = 'pass' | 'fail';

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
  id: Id;
  title: string;
  excerpt: string;
  notes: string;
  status: GenerationForeshadowSnapshotStatus;
  sourceChapterId?: Id | null;
  sourceChapterTitle?: string;
  resolvedChapterId?: Id | null;
  resolvedChapterTitle?: string;
  updatedAt: string;
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

export interface ChapterStyleDraft {
  summary: string;
  appliedChanges: string[];
}

export interface ChapterPolishDraft {
  summary: string;
  antiAiForceCheck: AntiAIForceCheck;
  appliedChanges: string[];
}

export interface AIPlanRequest {
  projectId: Id;
  chapterId?: Id;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: Id;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  volumeOutline?: string;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
  model: string;
  temperature: number;
}

export interface AIPlanResponse {
  outline: ChapterOutlineDraft;
  rawText: string;
}

export interface AIWriteRequest {
  projectId: Id;
  chapterId?: Id;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: Id;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
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
}

export interface AIWriteResponse {
  content: string;
  rawText: string;
}

export interface AIReviewRequest {
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: Id;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  outline?: ChapterOutlineDraft | null;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
  content: string;
  model: string;
  temperature: number;
}

export interface AIReviewResponse {
  review: ChapterReviewDraft;
  rawText: string;
}

export interface AIStyleRequest {
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: Id;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
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
}

export interface AIStyleResponse {
  content: string;
  style: ChapterStyleDraft;
  rawText: string;
}

export interface AIPolishRequest {
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: Id;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  outline?: ChapterOutlineDraft | null;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  gateConfigOverride?: GenerationGateConfig | null;
  review?: ChapterReviewDraft | null;
  content: string;
  model: string;
  temperature: number;
}

export interface AIPolishResponse {
  content: string;
  polish: ChapterPolishDraft;
  rawText: string;
}

export type GenerationJobStatus = 'queued' | 'running' | 'paused' | 'ready' | 'approved' | 'discarded' | 'error';
export type GenerationJobStep = 'queued' | 'plan' | 'write' | 'style' | 'review' | 'polish' | 'extract' | 'complete';

export interface GenerationJobRequest {
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  chapterOrder?: number;
  volumeTitle?: string;
  previousChapterId?: Id;
  previousChapterTitle?: string;
  projectTitle?: string;
  projectDescription?: string;
  previousSummary?: string;
  worldState?: string;
  contextBundle?: string;
  stylePrompt?: string;
  model: string;
  temperature: number;
  priority?: number;
  gateConfigOverride?: GenerationGateConfig | null;
  outlineOverride?: ChapterOutlineDraft | null;
  entitySnapshot?: GenerationEntitySnapshot[];
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
}

export interface GenerationJobRecord {
  id: Id;
  projectId: Id;
  chapterId: Id;
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
  jobIds: Id[];
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

export interface GenerationMaintenanceBackfillRequest {
  projectId: Id;
  chapterId?: Id;
  limit?: number;
}

export interface GenerationMemoryChunkBackfillResult {
  projectId: Id;
  totalCandidates: number;
  processedChapters: number;
  skippedChapters: number;
  missingContentChapters: number;
  totalChunks: number;
  parentChunks: number;
  childChunks: number;
  processedChapterIds: Id[];
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

export interface GenerationMemoryEmbeddingBackfillResult {
  projectId: Id;
  totalCandidates: number;
  createdChunks: number;
  rebuiltChunks: number;
  embeddedChunks: number;
  reusedChunks: number;
  skippedChunks: number;
  skipReasonCounts: GenerationMemoryEmbeddingSkipReasonCounts;
  processedChunkIds: string[];
  embeddingModel: string | null;
  vectorBackend: GenerationVectorBackendStatus;
}

export interface GenerationVolumeRecapBackfillResult {
  projectId: Id;
  totalVolumes: number;
  processedVolumes: number;
  skippedVolumes: number;
  processedVolumeTitles: string[];
}

export interface GenerationDebugOverview {
  projectId: Id;
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
    id: Id;
    chapterId: Id;
    chapterTitle: string;
    status: GenerationJobStatus;
    currentStep: GenerationJobStep;
    updatedAt: string;
  }>;
}

export interface GenerationDebugChapterRecord {
  chapterId: Id;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  previousChapterId: Id;
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

export interface GenerationDebugContext {
  chapterId: Id;
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
  sections: GenerationDebugContextSection[];
}

export interface GenerationDebugVolumeRecapRecord {
  volumeTitle: string;
  startChapterId: Id;
  startChapterOrder: number;
  endChapterId: Id;
  endChapterOrder: number;
  chapterCount: number;
  summary: string;
  highlights: string[];
  updatedAt: string;
}

export interface GenerationDebugMemoryChunkRecord {
  id: string;
  chapterId: Id;
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
  chapterId: Id;
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
  chapterId: Id;
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
  lastSeenChapterId: Id;
  lastSeenChapterTitle: string;
  updatedAt: string;
}

export interface GenerationDebugForeshadowRecord {
  id: Id;
  title: string;
  excerpt: string;
  notes: string;
  status: GenerationForeshadowSnapshotStatus;
  lifecycle: GenerationForeshadowLifecycle;
  sourceChapterId: Id | null;
  sourceChapterTitle: string;
  sourceChapterOrder: number;
  resolvedChapterId: Id | null;
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
  chapterId: Id;
  chapterTitle: string;
  updatedAt: string;
}

export interface AIExtractRequest {
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  content: string;
  loreSummary?: string;
  model: string;
  temperature: number;
}

export interface AIExtractResponse {
  summary: ChapterSummaryDraft;
  stateChanges: StateChangeDraft[];
  strand: StrandType;
  rawText: string;
}
