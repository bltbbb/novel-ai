import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestEnv } from '../helpers/create-test-env.js';
import { createOutline, createRelationSnapshot } from '../helpers/seed-generation-context.js';

function createReviewResultJson() {
  return JSON.stringify({
    summary: '整体可读。',
    overallSeverity: 'low',
    needsRewrite: false,
    antiAiForceCheck: 'pass',
    checkerResults: [
      {
        checker: 'consistency',
        score: 90,
        summary: '一致性正常。',
        issues: [],
      },
      {
        checker: 'continuity',
        score: 88,
        summary: '衔接正常。',
        issues: [],
      },
      {
        checker: 'reader_pull',
        score: 86,
        summary: '追读动力正常。',
        issues: [],
      },
    ],
  });
}

test('generation 包装层会按 plan/write/review 区分 relationSnapshot 的消费方式', async (t) => {
  const context = createTestEnv('generation-relation-wrapper');
  const generationContextCalls: Array<Record<string, unknown>> = [];
  const openaiRequests: Array<{ projectId: string; messages: Array<{ content: string }> }> = [];

  const generationContextMock = t.mock.module('../../src/services/generation-context.js', {
    namedExports: {
      buildGenerationContextBundle: async (_env: unknown, input: Record<string, unknown>) => {
        generationContextCalls.push(input);

        return {
          bundle: input.allowDraftContext
            ? '显式关系：林冲 <-> 谢无咎\n状态：草案'
            : '',
        };
      },
    },
  });
  const openaiMock = t.mock.module('../../src/services/openai.js', {
    namedExports: {
      completeChatCompletion: async (
        _env: unknown,
        request: {
          projectId: string;
          messages: Array<{ content: string }>;
        },
      ) => {
        openaiRequests.push(request);

        switch (request.projectId) {
          case 'project-plan':
            return JSON.stringify({
              goal: '推进主线',
              obstacle: '反派封锁',
              cost: '暴露风险',
              beats: ['潜入营帐', '翻出密卷'],
              timeAnchor: '夜半',
              chapterTimeSpan: '半夜到天明',
              gapFromPrevious: '紧接上一章',
              strand: 'quest',
              hookType: '悬念',
              hookStrength: 'medium',
              immutableFacts: [],
            });
          case 'project-write':
            return '```正文片段```';
          case 'project-review':
            return createReviewResultJson();
          default:
            throw new Error(`未预期的 projectId: ${request.projectId}`);
        }
      },
    },
  });

  t.after(async () => {
    openaiMock.restore();
    generationContextMock.restore();
    await context.dispose();
  });

  const generationModule = await import(`../../src/services/generation.js?t=${Date.now()}`);
  const { generateChapterOutline, generateBeatDraft, reviewChapterDraft } = generationModule;

  await t.test('generateChapterOutline(plan) 会显式打开 allowDraftContext，让 draft 关系进入规划提示', async () => {
    generationContextCalls.length = 0;
    openaiRequests.length = 0;

    const response = await generateChapterOutline(context.env, {
      projectId: 'project-plan',
      chapterTitle: '第一章',
      model: 'gpt-test',
      temperature: 0,
      relationSnapshot: [
        createRelationSnapshot({
          sourceEntityName: '林冲',
          targetEntityName: '谢无咎',
          draft: true,
        }),
      ],
    });

    assert.equal(generationContextCalls.length, 1);
    assert.equal(generationContextCalls[0]?.allowDraftContext, true);
    assert.equal(openaiRequests.length, 1);
    assert.match(openaiRequests[0]!.messages[0]!.content, /显式关系：林冲 <-> 谢无咎/u);
    assert.match(openaiRequests[0]!.messages[0]!.content, /状态：草案/u);
    assert.deepEqual(response.outline.beats, ['潜入营帐', '翻出密卷']);
  });

  await t.test('generateBeatDraft(write) 默认不打开 allowDraftContext，因此不会把 draft 关系带进正文提示', async () => {
    generationContextCalls.length = 0;
    openaiRequests.length = 0;

    const response = await generateBeatDraft(context.env, {
      projectId: 'project-write',
      chapterTitle: '第一章',
      chapterOrder: 3,
      model: 'gpt-test',
      temperature: 0,
      beatIndex: 0,
      currentBeat: '林冲潜入营帐',
      outline: createOutline({
        beats: ['林冲潜入营帐'],
      }),
      relationSnapshot: [
        createRelationSnapshot({
          sourceEntityName: '林冲',
          targetEntityName: '谢无咎',
          draft: true,
        }),
      ],
    });

    assert.equal(generationContextCalls.length, 1);
    assert.notEqual(generationContextCalls[0]?.allowDraftContext, true);
    assert.equal(openaiRequests.length, 1);
    assert.doesNotMatch(openaiRequests[0]!.messages[0]!.content, /状态：草案/u);
    assert.doesNotMatch(openaiRequests[0]!.messages[0]!.content, /显式关系：林冲 <-> 谢无咎/u);
    assert.equal(response.content, '正文片段');
  });

  await t.test('reviewChapterDraft 会在包装层直接消费已确认关系，而不只依赖 contextBundle', async () => {
    generationContextCalls.length = 0;
    openaiRequests.length = 0;

    const response = await reviewChapterDraft(context.env, {
      projectId: 'project-review',
      chapterId: 'chapter-1',
      chapterTitle: '第一章',
      chapterOrder: 5,
      content: '林冲盯着谢无咎，手已经按上刀柄。谢无咎没有退，只是冷冷看着他。',
      model: 'gpt-test',
      temperature: 0,
      relationSnapshot: [
        createRelationSnapshot({
          sourceEntityName: '林冲',
          targetEntityName: '谢无咎',
          relationType: '对立',
          currentStance: '敌对',
          draft: false,
        }),
      ],
    });

    assert.equal(generationContextCalls.length, 1);
    assert.notEqual(generationContextCalls[0]?.allowDraftContext, true);
    assert.equal(openaiRequests.length, 1);
    assert.doesNotMatch(openaiRequests[0]!.messages[0]!.content, /补充上下文：\n显式关系/u);
    assert.match(openaiRequests[0]!.messages[0]!.content, /已确认显式关系：林冲-谢无咎（对立 \/ 敌对）/u);
    assert.match(
      openaiRequests[0]!.messages[0]!.content,
      /特别注意：如果已确认的显式关系角色在本章同场出现/u,
    );

    const consistencyChecker = response.review.checkerResults.find((item) => item.checker === 'consistency');

    assert.ok(consistencyChecker);
    assert.ok(
      consistencyChecker.issues.some((issue) => issue.title === '显式关系同场未落地'),
      '即使 contextBundle 为空，也应基于已确认关系注入轻质检问题',
    );
  });
});
