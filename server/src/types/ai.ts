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
  systemPrompt?: string;
  references?: AIContextReference[];
}

export interface AIStreamChunk {
  delta: string;
  done: boolean;
  error?: string;
}
