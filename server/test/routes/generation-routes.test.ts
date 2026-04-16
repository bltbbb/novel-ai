import assert from 'node:assert/strict';
import Fastify from 'fastify';
import test from 'node:test';
import { createTestEnv } from '../helpers/create-test-env.js';
import { createOutline, createRelationSnapshot } from '../helpers/seed-generation-context.js';

function createRouteReviewResponse() {
  return {
    review: {
      summary: '通过。',
      overallSeverity: 'low',
      needsRewrite: false,
      antiAiForceCheck: 'pass',
      checkerResults: [],
    },
    rawText: '{}',
  };
}

test('generation routes 对 /plan /write /review 的非法请求会返回 400', async (t) => {
  const generationMock = t.mock.module('../../src/services/generation.js', {
    namedExports: {
      generateChapterOutline: async () => ({ outline: createOutline(), rawText: '{}' }),
      generateBeatDraft: async () => ({ content: '正文', rawText: '正文' }),
      reviewChapterDraft: async () => createRouteReviewResponse(),
      extractChapterArtifacts: async () => ({ summary: { summary: '', hook: '', foreshadowings: [] }, stateChanges: [], strand: 'quest', rawText: '{}' }),
      checkChapterLanguageQa: async () => ({ languageQa: { summary: '', severity: 'low', issues: [] }, rawText: '{}' }),
      generateInspirationBlueprint: async () => ({}),
      generateBookOutline: async () => ({}),
      generateVolumeBeats: async () => ({ beats: [] }),
      generateVolumeMilestones: async () => ({ estimatedChapterCount: 0, milestones: [] }),
      generateVolumeOutline: async () => ({}),
      polishChapterDraft: async () => ({ content: '', polish: { summary: '', antiAiForceCheck: 'pass', appliedChanges: [] }, rawText: '{}' }),
      reconcileVolumePlan: async () => ({}),
      styleChapterDraft: async () => ({ content: '', style: { summary: '', appliedChanges: [] }, rawText: '{}' }),
    },
  });
  const context = createTestEnv('generation-routes-invalid');
  const { registerGenerationRoutes } = await import(`../../src/routes/generation.js?t=${Date.now()}`);
  const app = Fastify({
    logger: false,
  });

  await registerGenerationRoutes(app, context.env);
  await app.ready();

  t.after(async () => {
    await app.close();
    generationMock.restore();
    await context.dispose();
  });

  const [planResponse, writeResponse, reviewResponse] = await Promise.all([
    app.inject({
      method: 'POST',
      url: '/api/ai/plan',
      payload: {
        projectId: 'project-plan',
      },
    }),
    app.inject({
      method: 'POST',
      url: '/api/ai/write',
      payload: {
        projectId: 'project-write',
        chapterTitle: '第一章',
        model: 'gpt-test',
        temperature: 0,
      },
    }),
    app.inject({
      method: 'POST',
      url: '/api/ai/review',
      payload: {
        projectId: 'project-review',
        chapterTitle: '第一章',
        model: 'gpt-test',
        temperature: 0,
      },
    }),
  ]);

  assert.equal(planResponse.statusCode, 400);
  assert.match(planResponse.body, /AIPlanRequest/u);
  assert.equal(writeResponse.statusCode, 400);
  assert.match(writeResponse.body, /AIWriteRequest/u);
  assert.equal(reviewResponse.statusCode, 400);
  assert.match(reviewResponse.body, /AIReviewRequest/u);
});

test('generation routes 会把 /plan /write /review 的最小合法 payload 转发给对应服务', async (t) => {
  const planCalls: unknown[] = [];
  const writeCalls: unknown[] = [];
  const reviewCalls: unknown[] = [];
  const generationMock = t.mock.module('../../src/services/generation.js', {
    namedExports: {
      generateChapterOutline: async (_env: unknown, request: unknown) => {
        planCalls.push(request);
        return {
          outline: createOutline(),
          rawText: '{}',
        };
      },
      generateBeatDraft: async (_env: unknown, request: unknown) => {
        writeCalls.push(request);
        return {
          content: '正文片段',
          rawText: '正文片段',
        };
      },
      reviewChapterDraft: async (_env: unknown, request: unknown) => {
        reviewCalls.push(request);
        return createRouteReviewResponse();
      },
      extractChapterArtifacts: async () => ({ summary: { summary: '', hook: '', foreshadowings: [] }, stateChanges: [], strand: 'quest', rawText: '{}' }),
      checkChapterLanguageQa: async () => ({ languageQa: { summary: '', severity: 'low', issues: [] }, rawText: '{}' }),
      generateInspirationBlueprint: async () => ({}),
      generateBookOutline: async () => ({}),
      generateVolumeBeats: async () => ({ beats: [] }),
      generateVolumeMilestones: async () => ({ estimatedChapterCount: 0, milestones: [] }),
      generateVolumeOutline: async () => ({}),
      polishChapterDraft: async () => ({ content: '', polish: { summary: '', antiAiForceCheck: 'pass', appliedChanges: [] }, rawText: '{}' }),
      reconcileVolumePlan: async () => ({}),
      styleChapterDraft: async () => ({ content: '', style: { summary: '', appliedChanges: [] }, rawText: '{}' }),
    },
  });
  const context = createTestEnv('generation-routes-valid');
  const { registerGenerationRoutes } = await import(`../../src/routes/generation.js?t=${Date.now()}-valid`);
  const app = Fastify({
    logger: false,
  });

  await registerGenerationRoutes(app, context.env);
  await app.ready();

  t.after(async () => {
    await app.close();
    generationMock.restore();
    await context.dispose();
  });

  const draftRelation = createRelationSnapshot({
    sourceEntityName: '林冲',
    targetEntityName: '谢无咎',
    draft: true,
  });
  const confirmedRelation = createRelationSnapshot({
    sourceEntityName: '林冲',
    targetEntityName: '谢无咎',
    draft: false,
  });

  const [planResponse, writeResponse, reviewResponse] = await Promise.all([
    app.inject({
      method: 'POST',
      url: '/api/ai/plan',
      payload: {
        projectId: 'project-plan',
        chapterTitle: '第一章',
        model: 'gpt-test',
        temperature: 0,
        relationSnapshot: [draftRelation],
      },
    }),
    app.inject({
      method: 'POST',
      url: '/api/ai/write',
      payload: {
        projectId: 'project-write',
        chapterTitle: '第一章',
        model: 'gpt-test',
        temperature: 0,
        beatIndex: 0,
        currentBeat: '林冲潜入营帐',
        outline: createOutline(),
        relationSnapshot: [draftRelation],
      },
    }),
    app.inject({
      method: 'POST',
      url: '/api/ai/review',
      payload: {
        projectId: 'project-review',
        chapterId: 'chapter-1',
        chapterTitle: '第一章',
        content: '林冲与谢无咎对峙。',
        model: 'gpt-test',
        temperature: 0,
        relationSnapshot: [confirmedRelation],
      },
    }),
  ]);

  assert.equal(planResponse.statusCode, 200);
  assert.equal(writeResponse.statusCode, 200);
  assert.equal(reviewResponse.statusCode, 200);
  assert.equal(planCalls.length, 1);
  assert.equal(writeCalls.length, 1);
  assert.equal(reviewCalls.length, 1);
  assert.deepEqual((planCalls[0] as { relationSnapshot?: unknown[] }).relationSnapshot, [draftRelation]);
  assert.deepEqual((writeCalls[0] as { relationSnapshot?: unknown[] }).relationSnapshot, [draftRelation]);
  assert.deepEqual((reviewCalls[0] as { relationSnapshot?: unknown[] }).relationSnapshot, [confirmedRelation]);
});
