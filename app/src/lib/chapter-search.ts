import { searchProject } from '@/lib/ai-client';
import { richTextToPlainText } from '@/lib/editor-content';
import type { Chapter, Id, RichTextDocument, SearchCandidate } from '@/types';

interface RetrieveChapterSearchInput {
  serverUrl: string;
  projectId: Id;
  chapterId?: Id;
  content: RichTextDocument;
  chapters: Chapter[];
  topK?: number;
  signal?: AbortSignal;
}

function normalizeSnippet(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function splitIntoSearchSnippets(text: string, maxLength = 280, overlap = 80) {
  const normalized = normalizeSnippet(text);

  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const snippets: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + maxLength, normalized.length);
    const snippet = normalized.slice(start, end).trim();

    if (snippet) {
      snippets.push(snippet);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return snippets;
}

function buildSearchCandidates(chapters: Chapter[], currentChapterId?: Id) {
  const candidates: SearchCandidate[] = [];

  for (const chapter of chapters) {
    if (chapter.id === currentChapterId) {
      continue;
    }

    const plainText = richTextToPlainText(chapter.content);

    for (const snippet of splitIntoSearchSnippets(plainText)) {
      candidates.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        snippet,
      });
    }
  }

  return candidates;
}

function buildSearchQuery(content: RichTextDocument) {
  const plainText = normalizeSnippet(richTextToPlainText(content));

  if (!plainText) {
    return '';
  }

  return plainText.slice(-1600);
}

export async function retrieveChapterSearchResults(input: RetrieveChapterSearchInput) {
  const query = buildSearchQuery(input.content);

  if (query.length < 24) {
    return [];
  }

  const candidates = buildSearchCandidates(input.chapters, input.chapterId);

  if (candidates.length === 0) {
    return [];
  }

  return searchProject(
    input.serverUrl,
    {
      projectId: input.projectId,
      chapterId: input.chapterId,
      query,
      candidates,
      topK: input.topK ?? 3,
    },
    input.signal,
  );
}
