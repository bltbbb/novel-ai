import { richTextToPlainText } from '@/lib/editor-content';
import { estimateTextTokens } from '@/lib/token-counter';
import type {
  AIChatMessage,
  AIChatRequest,
  AIContextReference,
  AppSettings,
  LoreEntity,
  RichTextDocument,
} from '@/types';

export interface ContextAssemblerInput {
  projectId: string;
  chapterId?: string;
  chapterTitle: string;
  content: RichTextDocument;
  messages: AIChatMessage[];
  settings: AppSettings;
  entities: LoreEntity[];
  maxReferences?: number;
}

export interface ContextAssemblerResult {
  request: AIChatRequest;
  references: AIContextReference[];
  matchedEntities: LoreEntity[];
  plainText: string;
  estimatedPromptTokens: number;
}

export interface ContinueWritingContextInput {
  projectId: string;
  chapterId?: string;
  chapterTitle: string;
  content: RichTextDocument;
  settings: AppSettings;
  entities: LoreEntity[];
  messageId: string;
  maxReferences?: number;
}

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function deduplicateEntities(entities: LoreEntity[]) {
  const seen = new Set<string>();

  return entities.filter((entity) => {
    if (seen.has(entity.id)) {
      return false;
    }

    seen.add(entity.id);
    return true;
  });
}

function matchEntitiesByContent(content: string, entities: LoreEntity[]) {
  const normalizedContent = normalizeText(content);

  return entities.filter((entity) => {
    const nameMatched = normalizedContent.includes(normalizeText(entity.name));

    if (nameMatched) {
      return true;
    }

    return Object.values(entity.fields).some((value) => {
      return typeof value === 'string' && value.trim() && normalizedContent.includes(normalizeText(value));
    });
  });
}

function buildEntityReference(entity: LoreEntity): AIContextReference {
  const fieldPreview = Object.entries(entity.fields)
    .slice(0, 4)
    .map(([key, value]) => `${key}：${String(value)}`)
    .join('；');

  return {
    id: entity.id,
    label: entity.name,
    type: 'lore',
    excerpt: [entity.description, fieldPreview].filter(Boolean).join('\n'),
  };
}

function buildSystemPrompt(input: ContextAssemblerInput, references: AIContextReference[]) {
  const sections: string[] = [];

  if (input.settings.stylePrompt.trim()) {
    sections.push(input.settings.stylePrompt.trim());
  }

  sections.push(`你正在辅助长篇小说写作。当前章节标题：${input.chapterTitle || '未命名章节'}。`);

  if (references.length > 0) {
    sections.push(
      [
        '以下上下文由系统自动整理，请优先遵守：',
        ...references.map((reference, index) => {
          return `${index + 1}. ${reference.label}\n${reference.excerpt || ''}`.trim();
        }),
      ].join('\n\n'),
    );
  }

  return sections.join('\n\n');
}

export function assembleChatContext(input: ContextAssemblerInput): ContextAssemblerResult {
  const plainText = richTextToPlainText(input.content);
  const pinnedEntities = input.entities.filter((entity) => entity.pinned);
  const matchedEntities = matchEntitiesByContent(plainText, input.entities);
  const mergedEntities = deduplicateEntities([...pinnedEntities, ...matchedEntities]).slice(
    0,
    input.maxReferences ?? 8,
  );
  const references = mergedEntities.map(buildEntityReference);
  const systemPrompt = buildSystemPrompt(input, references);
  const estimatedPromptTokens =
    estimateTextTokens(systemPrompt) +
    estimateTextTokens(plainText) +
    input.messages.reduce((sum, message) => sum + estimateTextTokens(message.content), 0);

  return {
    request: {
      projectId: input.projectId,
      chapterId: input.chapterId,
      messages: input.messages,
      model: input.settings.modelName,
      temperature: input.settings.temperature,
      systemPrompt,
      references,
    },
    references,
    matchedEntities: mergedEntities,
    plainText,
    estimatedPromptTokens,
  };
}

export function createContinueWritingPrompt(chapterTitle: string, plainText: string) {
  if (plainText.trim().length > 0) {
    return [
      '请延续当前章节正文，保持文风、人物状态和世界观一致。',
      '请只续写 2 到 3 句，控制在 80 到 120 字以内。',
      '直接输出可以插入正文的后续内容，不要解释，不要使用 Markdown 标题。',
      '',
      '当前正文：',
      plainText.slice(-3000),
    ].join('\n');
  }

  return `请根据章节标题《${chapterTitle || '未命名章节'}》写出 2 到 3 句正文开头，控制在 80 到 120 字以内，保持小说叙事感。`;
}

export function assembleContinueWritingContext(input: ContinueWritingContextInput) {
  const plainText = richTextToPlainText(input.content);
  const userPrompt = createContinueWritingPrompt(input.chapterTitle, plainText);

  return assembleChatContext({
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    content: input.content,
    settings: input.settings,
    entities: input.entities,
    maxReferences: input.maxReferences,
    messages: [
      {
        id: input.messageId,
        role: 'user',
        content: userPrompt,
      },
    ],
  });
}
