import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVolumeQuestionPoolBundle } from '../../../app/src/lib/question-pool.ts';
import {
  createQuestionPool,
  listQuestionPoolAlerts,
  parseQuestionPoolExpectedVolumeOrder,
} from '../../src/services/question-pool-store.js';
import { createTestEnv } from '../helpers/create-test-env.js';

test('parseQuestionPoolExpectedVolumeOrder 只稳定识别阿拉伯数字卷号', () => {
  assert.equal(parseQuestionPoolExpectedVolumeOrder('第2卷中段承天城'), 2);
  assert.equal(parseQuestionPoolExpectedVolumeOrder('第 02 卷末'), 2);
  assert.equal(parseQuestionPoolExpectedVolumeOrder('第二卷末'), null);
  assert.equal(parseQuestionPoolExpectedVolumeOrder('承天城中段'), null);
  assert.equal(parseQuestionPoolExpectedVolumeOrder(''), null);
});

test('listQuestionPoolAlerts 当前只会对可解析卷号的 open 问题生成提醒', () => {
  const context = createTestEnv('question-pool-alert-boundaries');
  const projectId = 'project-question-pool-alerts';

  try {
    createQuestionPool(context.env, {
      projectId,
      question: '数字卷号问题',
      expectedRevealWindow: '第2卷中段承天城',
      status: 'open',
    });
    createQuestionPool(context.env, {
      projectId,
      question: '超期问题',
      expectedRevealWindow: '第1卷末',
      status: 'open',
    });
    createQuestionPool(context.env, {
      projectId,
      question: '中文卷号问题',
      expectedRevealWindow: '第二卷末',
      status: 'open',
    });
    createQuestionPool(context.env, {
      projectId,
      question: '纯地点问题',
      expectedRevealWindow: '承天城中段',
      status: 'open',
    });
    createQuestionPool(context.env, {
      projectId,
      question: '空窗口问题',
      expectedRevealWindow: '',
      status: 'open',
    });
    createQuestionPool(context.env, {
      projectId,
      question: '已回答问题',
      expectedRevealWindow: '第1卷末',
      status: 'answered',
    });

    const alerts = listQuestionPoolAlerts(context.env, projectId, 2);

    assert.deepEqual(
      alerts.map((item) => ({
        question: item.question,
        overdueVolumeCount: item.overdueVolumeCount,
      })),
      [
        {
          question: '超期问题',
          overdueVolumeCount: 1,
        },
        {
          question: '数字卷号问题',
          overdueVolumeCount: 0,
        },
      ],
    );
    assert.ok(alerts[0]?.message.includes('已经超出 1 卷'));
    assert.ok(alerts[1]?.message.includes('建议本卷至少推进一次线索'));
  } finally {
    void context.dispose();
  }
});

test('buildVolumeQuestionPoolBundle 当前只按可解析卷号命中，不把中文卷号/地点/空值当成可靠窗口', () => {
  const bundle = buildVolumeQuestionPoolBundle({
    volumeOrder: 2,
    questionPools: [
      {
        id: 'question-1',
        projectId: 'project-question-pool-bundle',
        question: '数字卷号问题',
        currentClue: '旧案线索已经指向承天城',
        expectedRevealWindow: '第2卷中段承天城',
        finalAnswerSummary: '',
        status: 'open',
        updatedAt: '2026-04-16T10:00:00.000Z',
      },
      {
        id: 'question-2',
        projectId: 'project-question-pool-bundle',
        question: '超期问题',
        currentClue: '血诏回收已拖到卷二',
        expectedRevealWindow: '第1卷末',
        finalAnswerSummary: '',
        status: 'open',
        updatedAt: '2026-04-16T09:00:00.000Z',
      },
      {
        id: 'question-3',
        projectId: 'project-question-pool-bundle',
        question: '中文卷号问题',
        currentClue: '仍只写了自然语言窗口',
        expectedRevealWindow: '第二卷末',
        finalAnswerSummary: '',
        status: 'open',
        updatedAt: '2026-04-16T08:00:00.000Z',
      },
      {
        id: 'question-4',
        projectId: 'project-question-pool-bundle',
        question: '纯地点问题',
        currentClue: '只写地点，没有卷号',
        expectedRevealWindow: '承天城中段',
        finalAnswerSummary: '',
        status: 'open',
        updatedAt: '2026-04-16T07:00:00.000Z',
      },
      {
        id: 'question-5',
        projectId: 'project-question-pool-bundle',
        question: '空窗口问题',
        currentClue: '',
        expectedRevealWindow: '',
        finalAnswerSummary: '',
        status: 'open',
        updatedAt: '2026-04-16T06:00:00.000Z',
      },
      {
        id: 'question-6',
        projectId: 'project-question-pool-bundle',
        question: '已回答问题',
        currentClue: '已经回收',
        expectedRevealWindow: '第2卷',
        finalAnswerSummary: '答案已经明确',
        status: 'answered',
        updatedAt: '2026-04-16T05:00:00.000Z',
      },
    ],
  });

  assert.ok(bundle.includes('超期问题'));
  assert.ok(bundle.includes('数字卷号问题'));
  assert.ok(!bundle.includes('中文卷号问题'));
  assert.ok(!bundle.includes('纯地点问题'));
  assert.ok(!bundle.includes('空窗口问题'));
  assert.ok(!bundle.includes('已回答问题'));
  assert.ok(bundle.indexOf('超期问题') < bundle.indexOf('数字卷号问题'));
});
