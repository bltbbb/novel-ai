import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestEnv } from '../helpers/create-test-env.js';

test('ForeshadowPlan route round-trip 会保留 relatedQuestionIds 空数组，并在 GET 中原样读回', async (t) => {
  const context = createTestEnv('foreshadow-plan-routes-round-trip');
  const app = await context.createStructureMemoryApp();

  t.after(async () => {
    await app.close();
    await context.dispose();
  });

  const projectId = 'project-foreshadow-plan-round-trip';
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/structure-memory/foreshadow-plans',
    payload: {
      projectId,
      foreshadowId: 'foreshadow-blood-order',
      foreshadowTitle: '血诏真相',
      type: '主线伏笔',
      importance: 'major',
      plannedActivateVolume: 1,
      plannedResolveVolume: 2,
      activationCondition: '血诏残页浮现',
      resolveCondition: '旧案卷宗被打开',
      relatedQuestionIds: [],
      payoffEffect: '揭开追缉令背后的旧案链条',
    },
  });
  const createdBody = JSON.parse(createResponse.body) as {
    item: {
      id: string;
      relatedQuestionIds: string[];
      plannedResolveVolume: number | null;
    };
  };

  assert.equal(createResponse.statusCode, 200);
  assert.deepEqual(createdBody.item.relatedQuestionIds, []);

  const updateResponse = await app.inject({
    method: 'PUT',
    url: `/api/structure-memory/foreshadow-plans/${createdBody.item.id}`,
    payload: {
      projectId,
      foreshadowId: 'foreshadow-blood-order',
      foreshadowTitle: '血诏真相',
      type: '主线伏笔',
      importance: 'major',
      plannedActivateVolume: 1,
      plannedResolveVolume: 3,
      activationCondition: '血诏残页再次现身',
      resolveCondition: '旧案证词被当庭翻出',
      relatedQuestionIds: [],
      payoffEffect: '把旧案与追缉令重新串回主线',
    },
  });
  const updatedBody = JSON.parse(updateResponse.body) as {
    item: {
      id: string;
      relatedQuestionIds: string[];
      plannedResolveVolume: number | null;
    };
  };

  assert.equal(updateResponse.statusCode, 200);
  assert.deepEqual(updatedBody.item.relatedQuestionIds, []);
  assert.equal(updatedBody.item.plannedResolveVolume, 3);

  const getResponse = await app.inject({
    method: 'GET',
    url: `/api/structure-memory/foreshadow-plans?projectId=${projectId}&foreshadowId=foreshadow-blood-order`,
  });
  const getBody = JSON.parse(getResponse.body) as {
    items: Array<{
      id: string;
      relatedQuestionIds: string[];
      plannedResolveVolume: number | null;
    }>;
    alerts: unknown[];
  };

  assert.equal(getResponse.statusCode, 200);
  assert.equal(getBody.items.length, 1);
  assert.equal(getBody.items[0]?.id, createdBody.item.id);
  assert.ok(getBody.items[0] && 'relatedQuestionIds' in getBody.items[0]);
  assert.deepEqual(getBody.items[0]?.relatedQuestionIds, []);
  assert.equal(getBody.items[0]?.plannedResolveVolume, 3);
  assert.deepEqual(getBody.alerts, []);
});

test('ForeshadowPlan alerts 不受 relatedQuestionIds 是否为空影响', async (t) => {
  const context = createTestEnv('foreshadow-plan-routes-alerts');
  const app = await context.createStructureMemoryApp();

  t.after(async () => {
    await app.close();
    await context.dispose();
  });

  const projectId = 'project-foreshadow-plan-alerts';
  const emptyRelatedResponse = await app.inject({
    method: 'POST',
    url: '/api/structure-memory/foreshadow-plans',
    payload: {
      projectId,
      foreshadowId: 'foreshadow-empty-related',
      foreshadowTitle: '血诏真相',
      type: '主线伏笔',
      importance: 'major',
      plannedResolveVolume: 2,
      relatedQuestionIds: [],
    },
  });
  const linkedRelatedResponse = await app.inject({
    method: 'POST',
    url: '/api/structure-memory/foreshadow-plans',
    payload: {
      projectId,
      foreshadowId: 'foreshadow-linked-related',
      foreshadowTitle: '天机符印',
      type: '主线伏笔',
      importance: 'major',
      plannedResolveVolume: 1,
      relatedQuestionIds: ['question-1', 'question-2'],
    },
  });

  const emptyRelatedBody = JSON.parse(emptyRelatedResponse.body) as {
    item: { id: string; relatedQuestionIds: string[] };
  };
  const linkedRelatedBody = JSON.parse(linkedRelatedResponse.body) as {
    item: { id: string; relatedQuestionIds: string[] };
  };

  assert.equal(emptyRelatedResponse.statusCode, 200);
  assert.equal(linkedRelatedResponse.statusCode, 200);
  assert.deepEqual(emptyRelatedBody.item.relatedQuestionIds, []);
  assert.deepEqual(linkedRelatedBody.item.relatedQuestionIds, ['question-1', 'question-2']);

  const getResponse = await app.inject({
    method: 'GET',
    url: `/api/structure-memory/foreshadow-plans?projectId=${projectId}&currentVolumeOrder=5`,
  });
  const getBody = JSON.parse(getResponse.body) as {
    items: Array<{
      id: string;
      foreshadowTitle: string;
      relatedQuestionIds: string[];
    }>;
    alerts: Array<{
      foreshadowPlanId: string;
      foreshadowTitle: string;
      overdueVolumeCount: number;
    }>;
  };

  assert.equal(getResponse.statusCode, 200);
  assert.deepEqual(
    getBody.items.map((item) => ({
      id: item.id,
      relatedQuestionIds: item.relatedQuestionIds,
    })),
    [
      {
        id: linkedRelatedBody.item.id,
        relatedQuestionIds: ['question-1', 'question-2'],
      },
      {
        id: emptyRelatedBody.item.id,
        relatedQuestionIds: [],
      },
    ],
  );
  assert.ok(getBody.alerts.every((item) => !('relatedQuestionIds' in item)));
  assert.deepEqual(
    getBody.alerts
      .map((item) => ({
        foreshadowPlanId: item.foreshadowPlanId,
        foreshadowTitle: item.foreshadowTitle,
        overdueVolumeCount: item.overdueVolumeCount,
      }))
      .sort((left, right) => left.foreshadowTitle.localeCompare(right.foreshadowTitle, 'zh-CN')),
    [
      {
        foreshadowPlanId: linkedRelatedBody.item.id,
        foreshadowTitle: '天机符印',
        overdueVolumeCount: 4,
      },
      {
        foreshadowPlanId: emptyRelatedBody.item.id,
        foreshadowTitle: '血诏真相',
        overdueVolumeCount: 3,
      },
    ],
  );
});
