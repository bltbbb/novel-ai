import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { searchCandidates } from '../services/search.js';
import type { SearchRequest } from '../types/ai.js';

function isSearchRequest(body: unknown): body is SearchRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<SearchRequest>;

  if (typeof candidate.projectId !== 'string') {
    return false;
  }

  if (typeof candidate.query !== 'string') {
    return false;
  }

  if (!Array.isArray(candidate.candidates)) {
    return false;
  }

  if (typeof candidate.topK !== 'undefined' && typeof candidate.topK !== 'number') {
    return false;
  }

  return candidate.candidates.every((item) => {
    return (
      item &&
      typeof item === 'object' &&
      typeof item.chapterId === 'string' &&
      typeof item.chapterTitle === 'string' &&
      typeof item.snippet === 'string'
    );
  });
}

export async function registerSearchRoutes(app: FastifyInstance) {
  app.post('/api/search', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isSearchRequest(request.body)) {
      return reply.status(400).send({
        message: '请求体不符合 SearchRequest 结构',
      });
    }

    return searchCandidates(request.body);
  });
}
