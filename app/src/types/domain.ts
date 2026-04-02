import type { RichTextDocument } from './editor';

export type Id = string;
export type Timestamp = string;

export type ChapterStatus = 'draft' | 'first_draft' | 'revised' | 'published';
export type ForeshadowStatus = 'planted' | 'activated' | 'resolved' | 'overdue';
export type SnapshotSource = 'manual' | 'ai_continue';
export type IdeaCardSource = 'manual' | 'ai_output';
export type StrandType = 'quest' | 'fire' | 'constellation';
export type HookStrength = 'soft' | 'medium' | 'strong';
export type ProjectGateSeverity = 'critical' | 'high' | 'medium' | 'low';
export type GenerationQueueStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'approved'
  | 'discarded'
  | 'error';

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

export interface Project {
  id: Id;
  title: string;
  description: string;
  genre: string[];
  generationGateOverride: ProjectGenerationGateOverride | null;
  wordCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Chapter {
  id: Id;
  projectId: Id;
  volumeTitle?: string;
  title: string;
  order: number;
  content: RichTextDocument;
  wordCount: number;
  status: ChapterStatus;
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

export interface GenerationQueueItem {
  id: Id;
  projectId: Id;
  chapterId: Id;
  chapterTitle: string;
  status: GenerationQueueStatus;
  generatedText: string;
  outline: GenerationQueueOutline | null;
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
}

export interface AppSettings {
  serverUrl: string;
  modelName: string;
  temperature: number;
  stylePrompt: string;
}
