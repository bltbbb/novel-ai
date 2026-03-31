import type { SearchRequest, SearchResponse, SearchResult } from '../types/ai.js';

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractLatinTokens(text: string) {
  return normalizeText(text).match(/[a-z0-9]+/g) ?? [];
}

function extractCjkBigrams(text: string) {
  const normalized = normalizeText(text).replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  const bigrams: string[] = [];

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const token = normalized.slice(index, index + 2);

    if (token.length === 2) {
      bigrams.push(token);
    }
  }

  return bigrams;
}

function tokenize(text: string) {
  const tokens = [...extractLatinTokens(text), ...extractCjkBigrams(text)];
  return [...new Set(tokens)];
}

function scoreCandidate(query: string, snippet: string) {
  const queryTokens = tokenize(query);
  const snippetTokens = tokenize(snippet);

  if (queryTokens.length === 0 || snippetTokens.length === 0) {
    return 0;
  }

  const overlapCount = queryTokens.filter((token) => snippetTokens.includes(token)).length;

  if (overlapCount === 0) {
    return 0;
  }

  const coverage = overlapCount / queryTokens.length;
  const density = overlapCount / snippetTokens.length;
  const exactMatchBonus =
    normalizeText(query).length >= 8 && normalizeText(snippet).includes(normalizeText(query).slice(0, 8))
      ? 0.15
      : 0;

  return Number((coverage * 0.75 + density * 0.25 + exactMatchBonus).toFixed(4));
}

export function searchCandidates(request: SearchRequest): SearchResponse {
  const query = request.query.trim();

  if (!query) {
    return { results: [] };
  }

  const topK = Math.min(Math.max(request.topK ?? 3, 1), 8);
  const scoredResults: SearchResult[] = request.candidates
    .map((candidate) => ({
      chapterId: candidate.chapterId,
      chapterTitle: candidate.chapterTitle,
      snippet: candidate.snippet.trim(),
      score: scoreCandidate(query, candidate.snippet),
    }))
    .filter((result) => result.snippet && result.score > 0.02)
    .sort((left, right) => right.score - left.score);

  const uniqueChapterResults: SearchResult[] = [];
  const seenChapters = new Set<string>();

  for (const result of scoredResults) {
    if (seenChapters.has(result.chapterId)) {
      continue;
    }

    seenChapters.add(result.chapterId);
    uniqueChapterResults.push(result);

    if (uniqueChapterResults.length >= topK) {
      break;
    }
  }

  return {
    results: uniqueChapterResults,
  };
}
