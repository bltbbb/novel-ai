import type { Id } from './domain';

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
