import type { RichTextDocument } from './editor';

export type Id = string;
export type Timestamp = string;

export type ChapterStatus = 'draft' | 'first_draft' | 'revised' | 'published';

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

export interface AppSettings {
  serverUrl: string;
  modelName: string;
  temperature: number;
  stylePrompt: string;
}
