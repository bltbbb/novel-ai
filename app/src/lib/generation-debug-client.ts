import type {
  GenerationMaintenanceBackfillRequest,
  GenerationDebugContext,
  GenerationDebugChapterDetail,
  GenerationDebugChapterRecord,
  GenerationDebugMemoryChunkRecord,
  GenerationDebugRetrieval,
  GenerationDebugForeshadowRecord,
  GenerationDebugVolumeRecapRecord,
  GenerationDebugEntityRecord,
  GenerationDebugOverview,
  GenerationDebugRelationshipRecord,
  GenerationMemoryChunkBackfillResult,
  GenerationMemoryEmbeddingBackfillResult,
  GenerationVolumeRecapBackfillResult,
} from '@/types';

function normalizeServerUrl(serverUrl: string) {
  return serverUrl.replace(/\/+$/, '');
}

function extractErrorMessage(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as { message?: string };
    return parsed.message || rawText;
  } catch {
    return rawText;
  }
}

function buildQuerystring(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (!value?.trim()) {
      continue;
    }

    searchParams.set(key, value.trim());
  }

  const querystring = searchParams.toString();
  return querystring ? `?${querystring}` : '';
}

async function getJson<T>(serverUrl: string, path: string) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  return (await response.json()) as T;
}

async function postJson<TRequest, TResponse>(serverUrl: string, path: string, request: TRequest) {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractErrorMessage(errorText) || `请求失败：${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export function fetchGenerationDebugOverview(serverUrl: string, projectId: string) {
  return getJson<GenerationDebugOverview>(
    serverUrl,
    `/api/runtime/generation-debug/overview?projectId=${encodeURIComponent(projectId)}`,
  );
}

export async function fetchGenerationDebugChapters(serverUrl: string, projectId: string, query = '') {
  const response = await getJson<{ items: GenerationDebugChapterRecord[] }>(
    serverUrl,
    `/api/runtime/generation-debug/chapters${buildQuerystring({ projectId, q: query })}`,
  );

  return response.items;
}

export function fetchGenerationDebugChapterDetail(serverUrl: string, projectId: string, chapterId: string) {
  return getJson<GenerationDebugChapterDetail>(
    serverUrl,
    `/api/runtime/generation-debug/chapter-detail?projectId=${encodeURIComponent(projectId)}&chapterId=${encodeURIComponent(chapterId)}`,
  );
}

export function fetchGenerationDebugContext(serverUrl: string, projectId: string, chapterId: string) {
  return getJson<GenerationDebugContext>(
    serverUrl,
    `/api/runtime/generation-debug/context?projectId=${encodeURIComponent(projectId)}&chapterId=${encodeURIComponent(chapterId)}`,
  );
}

export async function fetchGenerationDebugEntities(serverUrl: string, projectId: string, query = '') {
  const response = await getJson<{ items: GenerationDebugEntityRecord[] }>(
    serverUrl,
    `/api/runtime/generation-debug/entities${buildQuerystring({ projectId, q: query })}`,
  );

  return response.items;
}

export async function fetchGenerationDebugForeshadows(serverUrl: string, projectId: string, query = '') {
  const response = await getJson<{ items: GenerationDebugForeshadowRecord[] }>(
    serverUrl,
    `/api/runtime/generation-debug/foreshadows${buildQuerystring({ projectId, q: query })}`,
  );

  return response.items;
}

export async function fetchGenerationDebugVolumeRecaps(serverUrl: string, projectId: string, query = '') {
  const response = await getJson<{ items: GenerationDebugVolumeRecapRecord[] }>(
    serverUrl,
    `/api/runtime/generation-debug/volume-recaps${buildQuerystring({ projectId, q: query })}`,
  );

  return response.items;
}

export async function fetchGenerationDebugRelationships(
  serverUrl: string,
  projectId: string,
  filters?: {
    q?: string;
    chapterId?: string;
    entityName?: string;
  },
) {
  const response = await getJson<{ items: GenerationDebugRelationshipRecord[] }>(
    serverUrl,
    `/api/runtime/generation-debug/relationships${buildQuerystring({
      projectId,
      q: filters?.q,
      chapterId: filters?.chapterId,
      entityName: filters?.entityName,
    })}`,
  );

  return response.items;
}

export async function fetchGenerationDebugMemoryChunks(
  serverUrl: string,
  projectId: string,
  filters?: {
    q?: string;
    chapterId?: string;
  },
) {
  const response = await getJson<{ items: GenerationDebugMemoryChunkRecord[] }>(
    serverUrl,
    `/api/runtime/generation-debug/chunks${buildQuerystring({
      projectId,
      q: filters?.q,
      chapterId: filters?.chapterId,
    })}`,
  );

  return response.items;
}

export function fetchGenerationDebugRetrieval(serverUrl: string, projectId: string, chapterId: string) {
  return getJson<GenerationDebugRetrieval>(
    serverUrl,
    `/api/runtime/generation-debug/retrieval?projectId=${encodeURIComponent(projectId)}&chapterId=${encodeURIComponent(chapterId)}`,
  );
}

export function backfillGenerationMemoryChunks(
  serverUrl: string,
  request: GenerationMaintenanceBackfillRequest,
) {
  return postJson<GenerationMaintenanceBackfillRequest, GenerationMemoryChunkBackfillResult>(
    serverUrl,
    '/api/runtime/generation-maintenance/backfill-memory-chunks',
    request,
  );
}

export function backfillGenerationVolumeRecaps(
  serverUrl: string,
  request: GenerationMaintenanceBackfillRequest,
) {
  return postJson<GenerationMaintenanceBackfillRequest, GenerationVolumeRecapBackfillResult>(
    serverUrl,
    '/api/runtime/generation-maintenance/backfill-volume-recaps',
    request,
  );
}

export function backfillGenerationMemoryEmbeddings(
  serverUrl: string,
  request: GenerationMaintenanceBackfillRequest,
) {
  return postJson<GenerationMaintenanceBackfillRequest, GenerationMemoryEmbeddingBackfillResult>(
    serverUrl,
    '/api/runtime/generation-maintenance/backfill-memory-embeddings',
    request,
  );
}
