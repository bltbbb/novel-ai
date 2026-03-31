import type { RichTextDocument } from './editor';

export type Id = string;
export type Timestamp = string;

export type ChapterStatus = 'draft' | 'first_draft' | 'revised' | 'published';
export type ForeshadowStatus = 'planted' | 'activated' | 'resolved' | 'overdue';
export type SnapshotSource = 'manual' | 'ai_continue';
export type IdeaCardSource = 'manual' | 'ai_output';

export type LoreEntityType =
  | 'character'
  | 'faction'
  | 'location'
  | 'magic_system'
  | 'item'
  | 'event';

export type LoreEntityFieldValue = string | number | boolean | null;
export type LoreEntityFields = Record<string, LoreEntityFieldValue>;

export interface Project {
  id: Id;
  title: string;
  description: string;
  genre: string[];
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
