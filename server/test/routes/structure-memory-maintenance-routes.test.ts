import assert from 'node:assert/strict';
import test from 'node:test';
import { previewStructureMemoryBackfill } from '../../src/services/structure-memory-maintenance.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import { seedBackfillFixture, seedGuardFixture } from '../helpers/structure-memory-maintenance-fixtures.js';

test('maintenance route 在缺少 projectId 或 body 结构错误时返回 400', async (t) => {
  const context = createTestEnv('structure-memory-maintenance-route-invalid');
  const app = await context.createStructureMemoryApp();

  t.after(async () => {
    await app.close();
    await context.dispose();
  });

  const previewResponse = await app.inject({
    method: 'POST',
    url: '/api/structure-memory/maintenance/backfill-preview',
    payload: {
      systems: ['thread_ledger'],
    },
  });
  const guardResponse = await app.inject({
    method: 'GET',
    url: '/api/structure-memory/maintenance/guard-alerts',
  });

  assert.equal(previewResponse.statusCode, 400);
  assert.match(previewResponse.body, /projectId/u);
  assert.equal(guardResponse.statusCode, 400);
  assert.match(guardResponse.body, /projectId/u);
});

test('backfill-preview route 会 trim projectId/systems，并忽略 candidateIds 对预览范围的影响', async (t) => {
  const context = createTestEnv('structure-memory-maintenance-route-preview');
  const app = await context.createStructureMemoryApp();
  const { projectId } = seedBackfillFixture(context.env);

  t.after(async () => {
    await app.close();
    await context.dispose();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/structure-memory/maintenance/backfill-preview',
    payload: {
      projectId: `  ${projectId}  `,
      systems: [' thread_ledger ', ' question_pool '],
      candidateIds: ['non-existent-candidate'],
    },
  });
  const body = JSON.parse(response.body) as {
    projectId: string;
    totalCandidates: number;
    counts: Array<{ system: string; total: number }>;
  };

  assert.equal(response.statusCode, 200);
  assert.equal(body.projectId, projectId);
  assert.equal(body.totalCandidates, 2);
  assert.deepEqual(
    body.counts.filter((item) => item.total > 0).map((item) => item.system),
    ['thread_ledger', 'question_pool'],
  );
});

test('backfill-apply route 会 trim candidateIds，并只处理实际命中的 new/existing 候选', async (t) => {
  const context = createTestEnv('structure-memory-maintenance-route-apply');
  const app = await context.createStructureMemoryApp();
  const { projectId } = seedBackfillFixture(context.env);
  const preview = previewStructureMemoryBackfill(context.env, {
    projectId,
  });
  const existingQuestion = preview.candidates.find((item) => item.system === 'question_pool');
  const newResource = preview.candidates.find((item) => item.system === 'resource_continuity');

  t.after(async () => {
    await app.close();
    await context.dispose();
  });

  assert.ok(existingQuestion);
  assert.ok(newResource);

  const response = await app.inject({
    method: 'POST',
    url: '/api/structure-memory/maintenance/backfill-apply',
    payload: {
      projectId: `  ${projectId}  `,
      systems: [' question_pool ', ' resource_continuity '],
      candidateIds: [
        ` ${existingQuestion.candidateId} `,
        ` ${newResource.candidateId} `,
        ' unknown-candidate-id ',
      ],
    },
  });
  const body = JSON.parse(response.body) as {
    requestedCandidateCount: number;
    createdCount: number;
    skippedExistingCount: number;
  };

  assert.equal(response.statusCode, 200);
  assert.equal(body.requestedCandidateCount, 2);
  assert.equal(body.createdCount, 1);
  assert.equal(body.skippedExistingCount, 1);
});

test('guard-alerts route 会 trim query 参数并返回规范化后的 trigger/projectId', async (t) => {
  const context = createTestEnv('structure-memory-maintenance-route-guard');
  const app = await context.createStructureMemoryApp();
  const { projectId } = seedGuardFixture(context.env);

  t.after(async () => {
    await app.close();
    await context.dispose();
  });

  const params = new URLSearchParams({
    projectId: `  ${projectId}  `,
    trigger: '  chapter_completed  ',
    chapterId: '  chapter-2  ',
    volumeTitle: '  第二卷  ',
  });
  const response = await app.inject({
    method: 'GET',
    url: `/api/structure-memory/maintenance/guard-alerts?${params.toString()}`,
  });
  const body = JSON.parse(response.body) as {
    projectId: string;
    trigger: string;
    items: Array<{ title: string }>;
  };

  assert.equal(response.statusCode, 200);
  assert.equal(body.projectId, projectId);
  assert.equal(body.trigger, 'chapter_completed');
  assert.ok(body.items.length > 0);
});
