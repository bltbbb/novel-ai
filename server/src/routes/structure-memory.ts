import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerEnv } from '../config/env.js';
import {
  createForeshadowPlan,
  createThreadLedger,
  createWorldStateEntry,
  deleteForeshadowPlan,
  deleteThreadLedger,
  deleteWorldStateEntry,
  listForeshadowPlans,
  listDormantThreadLedgerAlerts,
  listOverdueForeshadowPlanAlerts,
  listThreadLedgers,
  listWorldStateEntries,
  type ForeshadowPlanMutationInput,
  type ThreadLedgerMutationInput,
  type WorldStateEntryMutationInput,
  updateForeshadowPlan,
  updateThreadLedger,
  updateWorldStateEntry,
} from '../services/structure-memory-store.js';
import {
  createQuestionPool,
  deleteQuestionPool,
  listQuestionPoolAlerts,
  listQuestionPools,
  type QuestionPoolMutationInput,
  updateQuestionPool,
} from '../services/question-pool-store.js';
import {
  createAntagonistAgenda,
  deleteAntagonistAgenda,
  listAntagonistAgendas,
  type AntagonistAgendaMutationInput,
  updateAntagonistAgenda,
} from '../services/antagonist-agenda-store.js';
import {
  createPovPermission,
  deletePovPermission,
  listPovPermissions,
  type PovPermissionMutationInput,
  updatePovPermission,
} from '../services/pov-permission-store.js';
import {
  createResourceContinuity,
  deleteResourceContinuity,
  isResourceContinuityRiskLevel,
  listResourceContinuities,
  type ResourceContinuityMutationInput,
  updateResourceContinuity,
} from '../services/structured-resource-continuity-store.js';
import {
  applyStructureMemoryBackfill,
  listStructureMemoryGuardAlerts,
  previewStructureMemoryBackfill,
} from '../services/structure-memory-maintenance.js';

interface ThreadLedgerListQuerystring {
  projectId?: string;
  status?: string;
  currentChapterOrder?: string;
  staleChapterGap?: string;
}

interface ThreadLedgerParams {
  threadLedgerId: string;
}

interface ForeshadowPlanListQuerystring {
  projectId?: string;
  foreshadowId?: string;
  currentVolumeOrder?: string;
  overdueVolumeGap?: string;
}

interface ForeshadowPlanParams {
  foreshadowPlanId: string;
}

interface WorldStateListQuerystring {
  projectId?: string;
  volumeId?: string;
  milestoneIndex?: string;
}

interface WorldStateParams {
  worldStateEntryId: string;
}

interface QuestionPoolListQuerystring {
  projectId?: string;
  status?: string;
  currentVolumeOrder?: string;
}

interface QuestionPoolParams {
  questionPoolId: string;
}

interface AntagonistAgendaListQuerystring {
  projectId?: string;
  status?: string;
}

interface AntagonistAgendaParams {
  antagonistAgendaId: string;
}

interface PovPermissionListQuerystring {
  projectId?: string;
  volumeId?: string;
  chapterId?: string;
}

interface PovPermissionParams {
  povPermissionId: string;
}

interface ResourceContinuityListQuerystring {
  projectId?: string;
  status?: string;
  ownerCharacterId?: string;
  resourceType?: string;
  riskLevel?: string;
}

interface ResourceContinuityParams {
  resourceContinuityId: string;
}

interface StructureMemoryMaintenanceBody {
  projectId?: string;
  systems?: string[];
  candidateIds?: string[];
}

interface StructureMemoryGuardListQuerystring {
  projectId?: string;
  trigger?: string;
  chapterId?: string;
  volumeTitle?: string;
}

function getProjectIdOrReply(reply: FastifyReply, projectId: unknown) {
  if (typeof projectId !== 'string' || !projectId.trim()) {
    reply.status(400).send({
      message: '参数缺少 projectId',
    });
    return null;
  }

  return projectId.trim();
}

function parseOptionalPositiveInteger(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function parseOptionalNonNegativeInteger(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Math.trunc(parsed);
  return normalized >= 0 ? normalized : null;
}

function isOptionalStringArray(value: unknown) {
  return typeof value === 'undefined' || (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string')
  );
}

function isThreadLedgerMutationBody(body: unknown): body is Record<string, unknown> & { projectId: string } {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { projectId?: unknown };
  return typeof candidate.projectId === 'string' && candidate.projectId.trim().length > 0;
}

function isForeshadowPlanMutationBody(body: unknown): body is Record<string, unknown> & { projectId: string } {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { projectId?: unknown };
  return typeof candidate.projectId === 'string' && candidate.projectId.trim().length > 0;
}

function isWorldStateMutationBody(body: unknown): body is Record<string, unknown> & { projectId: string } {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { projectId?: unknown };
  return typeof candidate.projectId === 'string' && candidate.projectId.trim().length > 0;
}

function isQuestionPoolMutationBody(body: unknown): body is Record<string, unknown> & { projectId: string } {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { projectId?: unknown };
  return typeof candidate.projectId === 'string' && candidate.projectId.trim().length > 0;
}

function isAntagonistAgendaMutationBody(body: unknown): body is Record<string, unknown> & { projectId: string } {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { projectId?: unknown };
  return typeof candidate.projectId === 'string' && candidate.projectId.trim().length > 0;
}

function isPovPermissionMutationBody(body: unknown): body is Record<string, unknown> & { projectId: string } {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { projectId?: unknown };
  return typeof candidate.projectId === 'string' && candidate.projectId.trim().length > 0;
}

function isResourceContinuityMutationBody(body: unknown): body is Record<string, unknown> & { projectId: string } {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { projectId?: unknown };
  return typeof candidate.projectId === 'string' && candidate.projectId.trim().length > 0;
}

function isStructureMemoryMaintenanceBody(body: unknown): body is StructureMemoryMaintenanceBody & { projectId: string } {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as StructureMemoryMaintenanceBody;

  return (
    typeof candidate.projectId === 'string' &&
    candidate.projectId.trim().length > 0 &&
    isOptionalStringArray(candidate.systems) &&
    isOptionalStringArray(candidate.candidateIds)
  );
}

export async function registerStructureMemoryRoutes(app: FastifyInstance, env: ServerEnv) {
  app.get(
    '/api/structure-memory/thread-ledgers',
    async (request: FastifyRequest<{ Querystring: ThreadLedgerListQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const status =
        request.query.status === 'active' || request.query.status === 'dormant' || request.query.status === 'resolved'
          ? request.query.status
          : undefined;
      const currentChapterOrder = parseOptionalPositiveInteger(request.query.currentChapterOrder);
      const staleChapterGap = parseOptionalPositiveInteger(request.query.staleChapterGap) ?? 15;

      return {
        items: listThreadLedgers(env, {
          projectId,
          status,
        }),
        alerts:
          currentChapterOrder && currentChapterOrder > 0
            ? listDormantThreadLedgerAlerts(env, {
              projectId,
              currentChapterOrder,
              staleChapterGap,
            })
            : [],
      };
    },
  );

  app.post(
    '/api/structure-memory/thread-ledgers',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isThreadLedgerMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as ThreadLedgerMutationInput;

      return {
        item: createThreadLedger(env, body),
      };
    },
  );

  app.put(
    '/api/structure-memory/thread-ledgers/:threadLedgerId',
    async (
      request: FastifyRequest<{ Params: ThreadLedgerParams }>,
      reply: FastifyReply,
    ) => {
      if (!isThreadLedgerMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as ThreadLedgerMutationInput;
      const item = updateThreadLedger(env, request.params.threadLedgerId, body);

      if (!item) {
        return reply.status(404).send({
          message: '目标剧情线不存在',
        });
      }

      return {
        item,
      };
    },
  );

  app.delete(
    '/api/structure-memory/thread-ledgers/:threadLedgerId',
    async (
      request: FastifyRequest<{ Params: ThreadLedgerParams; Querystring: ThreadLedgerListQuerystring }>,
      reply: FastifyReply,
    ) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const deleted = deleteThreadLedger(env, projectId, request.params.threadLedgerId);

      if (!deleted) {
        return reply.status(404).send({
          message: '目标剧情线不存在',
        });
      }

      return {
        success: true,
      };
    },
  );

  app.get(
    '/api/structure-memory/foreshadow-plans',
    async (request: FastifyRequest<{ Querystring: ForeshadowPlanListQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const currentVolumeOrder = parseOptionalPositiveInteger(request.query.currentVolumeOrder);
      const overdueVolumeGap = parseOptionalPositiveInteger(request.query.overdueVolumeGap) ?? 2;

      return {
        items: listForeshadowPlans(env, {
          projectId,
          foreshadowId: typeof request.query.foreshadowId === 'string' && request.query.foreshadowId.trim()
            ? request.query.foreshadowId.trim()
            : undefined,
        }),
        alerts:
          currentVolumeOrder && currentVolumeOrder > 0
            ? listOverdueForeshadowPlanAlerts(env, {
              projectId,
              currentVolumeOrder,
              overdueVolumeGap,
            })
            : [],
      };
    },
  );

  app.post(
    '/api/structure-memory/foreshadow-plans',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isForeshadowPlanMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as ForeshadowPlanMutationInput;

      return {
        item: createForeshadowPlan(env, body),
      };
    },
  );

  app.put(
    '/api/structure-memory/foreshadow-plans/:foreshadowPlanId',
    async (
      request: FastifyRequest<{ Params: ForeshadowPlanParams }>,
      reply: FastifyReply,
    ) => {
      if (!isForeshadowPlanMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as ForeshadowPlanMutationInput;
      const item = updateForeshadowPlan(env, request.params.foreshadowPlanId, body);

      if (!item) {
        return reply.status(404).send({
          message: '目标伏笔规划不存在',
        });
      }

      return {
        item,
      };
    },
  );

  app.delete(
    '/api/structure-memory/foreshadow-plans/:foreshadowPlanId',
    async (
      request: FastifyRequest<{ Params: ForeshadowPlanParams; Querystring: ForeshadowPlanListQuerystring }>,
      reply: FastifyReply,
    ) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const deleted = deleteForeshadowPlan(env, projectId, request.params.foreshadowPlanId);

      if (!deleted) {
        return reply.status(404).send({
          message: '目标伏笔规划不存在',
        });
      }

      return {
        success: true,
      };
    },
  );

  app.get(
    '/api/structure-memory/world-state-entries',
    async (request: FastifyRequest<{ Querystring: WorldStateListQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      return {
        items: listWorldStateEntries(env, {
          projectId,
          volumeId: typeof request.query.volumeId === 'string' && request.query.volumeId.trim()
            ? request.query.volumeId.trim()
            : undefined,
          milestoneIndex: parseOptionalNonNegativeInteger(request.query.milestoneIndex),
        }),
      };
    },
  );

  app.post(
    '/api/structure-memory/world-state-entries',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isWorldStateMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as WorldStateEntryMutationInput;

      return {
        item: createWorldStateEntry(env, body),
      };
    },
  );

  app.put(
    '/api/structure-memory/world-state-entries/:worldStateEntryId',
    async (
      request: FastifyRequest<{ Params: WorldStateParams }>,
      reply: FastifyReply,
    ) => {
      if (!isWorldStateMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as WorldStateEntryMutationInput;
      const item = updateWorldStateEntry(env, request.params.worldStateEntryId, body);

      if (!item) {
        return reply.status(404).send({
          message: '目标世界状态记录不存在',
        });
      }

      return {
        item,
      };
    },
  );

  app.delete(
    '/api/structure-memory/world-state-entries/:worldStateEntryId',
    async (
      request: FastifyRequest<{ Params: WorldStateParams; Querystring: WorldStateListQuerystring }>,
      reply: FastifyReply,
    ) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const deleted = deleteWorldStateEntry(env, projectId, request.params.worldStateEntryId);

      if (!deleted) {
        return reply.status(404).send({
          message: '目标世界状态记录不存在',
        });
      }

      return {
        success: true,
      };
    },
  );

  app.get(
    '/api/structure-memory/question-pools',
    async (request: FastifyRequest<{ Querystring: QuestionPoolListQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const status =
        request.query.status === 'open' || request.query.status === 'partial' || request.query.status === 'answered'
          ? request.query.status
          : undefined;
      const currentVolumeOrder = parseOptionalPositiveInteger(request.query.currentVolumeOrder);

      return {
        items: listQuestionPools(env, {
          projectId,
          status,
        }),
        alerts: listQuestionPoolAlerts(env, projectId, currentVolumeOrder),
      };
    },
  );

  app.post(
    '/api/structure-memory/question-pools',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isQuestionPoolMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as QuestionPoolMutationInput;

      return {
        item: createQuestionPool(env, body),
      };
    },
  );

  app.put(
    '/api/structure-memory/question-pools/:questionPoolId',
    async (
      request: FastifyRequest<{ Params: QuestionPoolParams }>,
      reply: FastifyReply,
    ) => {
      if (!isQuestionPoolMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as QuestionPoolMutationInput;
      const item = updateQuestionPool(env, request.params.questionPoolId, body);

      if (!item) {
        return reply.status(404).send({
          message: '目标未解问题不存在',
        });
      }

      return {
        item,
      };
    },
  );

  app.delete(
    '/api/structure-memory/question-pools/:questionPoolId',
    async (
      request: FastifyRequest<{ Params: QuestionPoolParams; Querystring: QuestionPoolListQuerystring }>,
      reply: FastifyReply,
    ) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const deleted = deleteQuestionPool(env, projectId, request.params.questionPoolId);

      if (!deleted) {
        return reply.status(404).send({
          message: '目标未解问题不存在',
        });
      }

      return {
        success: true,
      };
    },
  );

  app.get(
    '/api/structure-memory/antagonist-agendas',
    async (request: FastifyRequest<{ Querystring: AntagonistAgendaListQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const status =
        request.query.status === 'active' || request.query.status === 'dormant' || request.query.status === 'defeated'
          ? request.query.status
          : undefined;

      return {
        items: listAntagonistAgendas(env, {
          projectId,
          status,
        }),
      };
    },
  );

  app.post(
    '/api/structure-memory/antagonist-agendas',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isAntagonistAgendaMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as AntagonistAgendaMutationInput;

      return {
        item: createAntagonistAgenda(env, body),
      };
    },
  );

  app.put(
    '/api/structure-memory/antagonist-agendas/:antagonistAgendaId',
    async (
      request: FastifyRequest<{ Params: AntagonistAgendaParams }>,
      reply: FastifyReply,
    ) => {
      if (!isAntagonistAgendaMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as AntagonistAgendaMutationInput;
      const item = updateAntagonistAgenda(env, request.params.antagonistAgendaId, body);

      if (!item) {
        return reply.status(404).send({
          message: '目标反派议程不存在',
        });
      }

      return {
        item,
      };
    },
  );

  app.delete(
    '/api/structure-memory/antagonist-agendas/:antagonistAgendaId',
    async (
      request: FastifyRequest<{ Params: AntagonistAgendaParams; Querystring: AntagonistAgendaListQuerystring }>,
      reply: FastifyReply,
    ) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const deleted = deleteAntagonistAgenda(env, projectId, request.params.antagonistAgendaId);

      if (!deleted) {
        return reply.status(404).send({
          message: '目标反派议程不存在',
        });
      }

      return {
        success: true,
      };
    },
  );

  app.get(
    '/api/structure-memory/pov-permissions',
    async (request: FastifyRequest<{ Querystring: PovPermissionListQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      return {
        items: listPovPermissions(env, {
          projectId,
          volumeId: typeof request.query.volumeId === 'string' && request.query.volumeId.trim()
            ? request.query.volumeId.trim()
            : undefined,
          chapterId: typeof request.query.chapterId === 'string' && request.query.chapterId.trim()
            ? request.query.chapterId.trim()
            : undefined,
        }),
      };
    },
  );

  app.post(
    '/api/structure-memory/pov-permissions',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isPovPermissionMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as PovPermissionMutationInput;

      return {
        item: createPovPermission(env, body),
      };
    },
  );

  app.put(
    '/api/structure-memory/pov-permissions/:povPermissionId',
    async (
      request: FastifyRequest<{ Params: PovPermissionParams }>,
      reply: FastifyReply,
    ) => {
      if (!isPovPermissionMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as PovPermissionMutationInput;
      const item = updatePovPermission(env, request.params.povPermissionId, body);

      if (!item) {
        return reply.status(404).send({
          message: '目标视角权限不存在',
        });
      }

      return {
        item,
      };
    },
  );

  app.delete(
    '/api/structure-memory/pov-permissions/:povPermissionId',
    async (
      request: FastifyRequest<{ Params: PovPermissionParams; Querystring: PovPermissionListQuerystring }>,
      reply: FastifyReply,
    ) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const deleted = deletePovPermission(env, projectId, request.params.povPermissionId);

      if (!deleted) {
        return reply.status(404).send({
          message: '目标视角权限不存在',
        });
      }

      return {
        success: true,
      };
    },
  );

  app.get(
    '/api/structure-memory/resource-continuities',
    async (request: FastifyRequest<{ Querystring: ResourceContinuityListQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const status =
        request.query.status === 'active' || request.query.status === 'recovered' || request.query.status === 'permanent'
          ? request.query.status
          : undefined;
      const resourceType =
        typeof request.query.resourceType === 'string' && request.query.resourceType.trim()
          ? request.query.resourceType.trim()
          : undefined;
      const riskLevel = isResourceContinuityRiskLevel(request.query.riskLevel)
        ? request.query.riskLevel
        : undefined;

      return {
        items: listResourceContinuities(env, {
          projectId,
          status,
          ownerCharacterId:
            typeof request.query.ownerCharacterId === 'string' && request.query.ownerCharacterId.trim()
              ? request.query.ownerCharacterId.trim()
              : undefined,
          resourceType,
          riskLevel,
        }),
      };
    },
  );

  app.post(
    '/api/structure-memory/resource-continuities',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isResourceContinuityMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as ResourceContinuityMutationInput;

      return {
        item: createResourceContinuity(env, body),
      };
    },
  );

  app.put(
    '/api/structure-memory/resource-continuities/:resourceContinuityId',
    async (
      request: FastifyRequest<{ Params: ResourceContinuityParams }>,
      reply: FastifyReply,
    ) => {
      if (!isResourceContinuityMutationBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId',
        });
      }

      const body = request.body as ResourceContinuityMutationInput;
      const item = updateResourceContinuity(env, request.params.resourceContinuityId, body);

      if (!item) {
        return reply.status(404).send({
          message: '目标资源连续性记录不存在',
        });
      }

      return {
        item,
      };
    },
  );

  app.delete(
    '/api/structure-memory/resource-continuities/:resourceContinuityId',
    async (
      request: FastifyRequest<{ Params: ResourceContinuityParams; Querystring: ResourceContinuityListQuerystring }>,
      reply: FastifyReply,
    ) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      const deleted = deleteResourceContinuity(env, projectId, request.params.resourceContinuityId);

      if (!deleted) {
        return reply.status(404).send({
          message: '目标资源连续性记录不存在',
        });
      }

      return {
        success: true,
      };
    },
  );

  app.post(
    '/api/structure-memory/maintenance/backfill-preview',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isStructureMemoryMaintenanceBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId，或 systems / candidateIds 格式不正确',
        });
      }

      const body = request.body as StructureMemoryMaintenanceBody & { projectId: string };

      return previewStructureMemoryBackfill(env, {
        projectId: body.projectId.trim(),
        systems: body.systems?.map((item) => item.trim()).filter(Boolean),
      });
    },
  );

  app.post(
    '/api/structure-memory/maintenance/backfill-apply',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isStructureMemoryMaintenanceBody(request.body)) {
        return reply.status(400).send({
          message: '请求体缺少有效的 projectId，或 systems / candidateIds 格式不正确',
        });
      }

      const body = request.body as StructureMemoryMaintenanceBody & { projectId: string };

      return applyStructureMemoryBackfill(env, {
        projectId: body.projectId.trim(),
        systems: body.systems?.map((item) => item.trim()).filter(Boolean),
        candidateIds: body.candidateIds?.map((item) => item.trim()).filter(Boolean),
      });
    },
  );

  app.get(
    '/api/structure-memory/maintenance/guard-alerts',
    async (request: FastifyRequest<{ Querystring: StructureMemoryGuardListQuerystring }>, reply: FastifyReply) => {
      const projectId = getProjectIdOrReply(reply, request.query.projectId);

      if (!projectId) {
        return reply;
      }

      return listStructureMemoryGuardAlerts(env, {
        projectId,
        trigger: typeof request.query.trigger === 'string' ? request.query.trigger.trim() : undefined,
        chapterId:
          typeof request.query.chapterId === 'string' && request.query.chapterId.trim()
            ? request.query.chapterId.trim()
            : undefined,
        volumeTitle:
          typeof request.query.volumeTitle === 'string' && request.query.volumeTitle.trim()
            ? request.query.volumeTitle.trim()
            : undefined,
      });
    },
  );
}
