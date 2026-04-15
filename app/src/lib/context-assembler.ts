import { richTextToPlainText } from '@/lib/editor-content';
import {
  CHARACTER_DYNAMIC_FIELD_DEFINITIONS,
  CHARACTER_STATIC_FIELD_DEFINITIONS,
  getLoreEntityMatchTerms,
} from '@/lib/lore-entity';
import { buildWritingRulesPrompt } from '@/lib/prompt-rules';
import { buildModelRequestConfig } from '@/lib/runtime-config';
import { estimateTextTokens } from '@/lib/token-counter';
import type {
  AIChatMessage,
  AIChatRequest,
  AIContextReference,
  AppSettings,
  LoreEntity,
  RichTextDocument,
  SearchResult,
} from '@/types';

export interface ContextAssemblerInput {
  projectId: string;
  chapterId?: string;
  chapterTitle: string;
  content: RichTextDocument;
  messages: AIChatMessage[];
  settings: AppSettings;
  entities: LoreEntity[];
  searchResults?: SearchResult[];
  writingRules?: string;
  maxReferences?: number;
}

const CONTEXT_ASSEMBLER_LIMITS = {
  maxReferencesDefault: 8,
  entityFieldPreviewMax: 4,
  continueWritingTailChars: 3000,
} as const;

export interface ContextAssemblerResult {
  request: AIChatRequest;
  references: AIContextReference[];
  matchedEntities: LoreEntity[];
  searchResults: SearchResult[];
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
  searchResults?: SearchResult[];
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
    if (entity.draft) {
      return false;
    }

    if (getLoreEntityMatchTerms(entity).some((term) => normalizedContent.includes(term))) {
      return true;
    }

    return Object.values(entity.fields).some((value) => {
      return typeof value === 'string' && value.trim() && normalizedContent.includes(normalizeText(value));
    });
  });
}

function buildEntityReference(entity: LoreEntity): AIContextReference {
  const orderedFieldKeys =
    entity.type === 'character'
      ? [
          ...CHARACTER_STATIC_FIELD_DEFINITIONS.map((item) => item.key),
          ...CHARACTER_DYNAMIC_FIELD_DEFINITIONS.map((item) => item.key),
          ...Object.keys(entity.fields),
        ]
      : Object.keys(entity.fields);
  const seenFieldKeys = new Set<string>();
  const fieldPreview = orderedFieldKeys
    .filter((key) => {
      if (seenFieldKeys.has(key)) {
        return false;
      }

      seenFieldKeys.add(key);
      return true;
    })
    .map((key) => [key, entity.fields[key]] as const)
    .filter(([, value]) => typeof value !== 'undefined' && value !== null && String(value).trim())
    .slice(0, CONTEXT_ASSEMBLER_LIMITS.entityFieldPreviewMax)
    .map(([key, value]) => `${key}：${String(value)}`)
    .join('；');
  const aliasPreview = (entity.aliases ?? []).slice(0, 4).join('、');

  return {
    id: entity.id,
    label: entity.name,
    type: 'lore',
    excerpt: [entity.description, aliasPreview ? `别名：${aliasPreview}` : '', fieldPreview].filter(Boolean).join('\n'),
  };
}

function buildSearchReference(result: SearchResult): AIContextReference {
  return {
    id: `${result.chapterId}:${result.score}`,
    label: result.chapterTitle,
    type: 'chapter',
    excerpt: result.snippet,
  };
}

function buildSystemPrompt(input: ContextAssemblerInput, references: AIContextReference[]) {
  const sections: string[] = [];
  const writingRules = input.writingRules?.trim() || buildWritingRulesPrompt();

  if (input.settings.stylePrompt.trim()) {
    sections.push(input.settings.stylePrompt.trim());
  }

  sections.push(`你正在辅助长篇小说写作。当前章节标题：${input.chapterTitle || '未命名章节'}。`);

  if (writingRules) {
    sections.push(writingRules);
  }

  if (references.length > 0) {
    sections.push(
      [
        '─── 以下为上下文参考 ───',
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
  const searchResults = input.searchResults ?? [];
  const chapterReferences = searchResults.map(buildSearchReference);
  const confirmedEntities = input.entities.filter((entity) => !entity.draft);
  const pinnedEntities = confirmedEntities.filter((entity) => entity.pinned);
  const matchedEntities = matchEntitiesByContent(plainText, confirmedEntities);
  const mergedEntities = deduplicateEntities([...pinnedEntities, ...matchedEntities]).slice(
    0,
    input.maxReferences ?? CONTEXT_ASSEMBLER_LIMITS.maxReferencesDefault,
  );
  const loreReferences = mergedEntities.map(buildEntityReference);
  const references = [...chapterReferences, ...loreReferences].slice(
    0,
    input.maxReferences ?? CONTEXT_ASSEMBLER_LIMITS.maxReferencesDefault,
  );
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
      ...buildModelRequestConfig(input.settings),
      systemPrompt,
      references,
    },
    references,
    matchedEntities: mergedEntities,
    searchResults,
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
      plainText.slice(-CONTEXT_ASSEMBLER_LIMITS.continueWritingTailChars),
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
    searchResults: input.searchResults,
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
