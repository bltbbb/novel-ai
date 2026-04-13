import type { RichTextDocument } from './editor';

export type Id = string;
export type Timestamp = string;

export type ChapterStatus = 'draft' | 'first_draft' | 'revised' | 'published';
export type ForeshadowStatus = 'planted' | 'activated' | 'resolved' | 'overdue';
export type SnapshotSource = 'manual' | 'ai_continue';
export type IdeaCardSource = 'manual' | 'ai_output';
export type StrandType = 'quest' | 'fire' | 'constellation';
export type HookStrength = 'soft' | 'medium' | 'strong';
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
  | 'extract';

export type LoreEntityType =
  | 'character'
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

export interface BookOutlineFields {
  premise: string;
  centralConflict: string;
  protagonistArc: string;
  thematicCore: string;
  worldRules: string[];
  endgameHint: string;
  toneGuide: string;
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

export interface LoreEntity {
  id: Id;
  projectId: Id;
  type: LoreEntityType;
  name: string;
  description: string;
  fields: LoreEntityFields;
  tags: string[];
  pinned: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Foreshadow {
  id: Id;
  projectId: Id;
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
