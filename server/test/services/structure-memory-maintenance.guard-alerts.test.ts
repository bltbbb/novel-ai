import assert from 'node:assert/strict';
import test from 'node:test';
import { listStructureMemoryGuardAlerts } from '../../src/services/structure-memory-maintenance.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import { seedGuardFixture } from '../helpers/structure-memory-maintenance-fixtures.js';

test('listStructureMemoryGuardAlerts 会输出稳定字段、按严重级排序，并对重复告警去重', () => {
  const context = createTestEnv('structure-memory-guard-alerts');
  const { projectId, duplicatedAgendaIds, resourceContinuityId, threadLedgerId, worldStateAgendaId } = seedGuardFixture(context.env);

  try {
    const result = listStructureMemoryGuardAlerts(context.env, {
      projectId,
      trigger: 'project_scan',
    });

    assert.equal(result.projectId, projectId);
    assert.equal(result.trigger, 'project_scan');
    assert.equal(result.items.length, 4);
    assert.deepEqual(
      result.items.map((item) => item.severity),
      ['high', 'high', 'high', 'medium'],
    );
    assert.deepEqual(
      result.items.map((item) => ({
        ruleKey: item.ruleKey,
        severity: item.severity,
        title: item.title,
        targetSystem: item.targetSystem,
        targetRecordId: item.targetRecordId,
      })),
      [
        {
          ruleKey: 'antagonist_thread_followup',
          severity: 'high',
          title: '反派动作已压到剧情线：旧案主线',
          targetSystem: 'thread_ledger',
          targetRecordId: threadLedgerId,
        },
        {
          ruleKey: 'foreshadow_worldstate_followup',
          severity: 'high',
          title: '伏笔回收后世界状态未同步：血诏真相',
          targetSystem: 'world_state_entry',
          targetRecordId: null,
        },
        {
          ruleKey: 'resource_continuity_guard',
          severity: 'high',
          title: '章节生成后连续性高风险：卷二终章',
          targetSystem: 'resource_continuity',
          targetRecordId: resourceContinuityId,
        },
        {
          ruleKey: 'worldstate_antagonist_followup',
          severity: 'medium',
          title: '世界状态变化后反派议程待重估：柳承业',
          targetSystem: 'antagonist_agenda',
          targetRecordId: worldStateAgendaId,
        },
      ],
    );
    assert.equal(
      result.items.filter((item) => item.ruleKey === 'antagonist_thread_followup').length,
      1,
    );
    assert.ok(
      duplicatedAgendaIds.every((agendaId) => result.items.every((item) => item.targetRecordId !== agendaId)),
      '重复的谢无咎议程不应在最终结果里各自产生独立 targetRecordId',
    );
    assert.ok(result.items.some((item) => item.ruleKey === 'foreshadow_worldstate_followup'));
    assert.ok(result.items.some((item) => item.ruleKey === 'resource_continuity_guard'));
    assert.ok(result.items.some((item) => item.ruleKey === 'worldstate_antagonist_followup'));
    assert.equal(new Set(result.items.map((item) => item.id)).size, result.items.length);

    for (const item of result.items) {
      assert.ok(item.id);
      assert.ok(item.ruleKey);
      assert.ok(item.title);
      assert.ok(item.message);
      assert.ok(item.targetSystem);
      assert.ok(item.severity === 'high' || item.severity === 'medium' || item.severity === 'low');
    }
  } finally {
    void context.dispose();
  }
});

test('listStructureMemoryGuardAlerts 传 chapterId 时会切换资源守护基线，但保留同批结构守护结果', () => {
  const context = createTestEnv('structure-memory-guard-alerts-chapter-scope');
  const { projectId, chapterIds, threadLedgerId, worldStateAgendaId } = seedGuardFixture(context.env);

  try {
    const result = listStructureMemoryGuardAlerts(context.env, {
      projectId,
      trigger: 'chapter_completed',
      chapterId: chapterIds.first,
    });

    assert.equal(result.trigger, 'chapter_completed');
    assert.ok(!result.items.some((item) => item.ruleKey === 'resource_continuity_guard'));
    assert.deepEqual(
      result.items.map((item) => ({
        ruleKey: item.ruleKey,
        targetRecordId: item.targetRecordId,
      })),
      [
        {
          ruleKey: 'antagonist_thread_followup',
          targetRecordId: threadLedgerId,
        },
        {
          ruleKey: 'foreshadow_worldstate_followup',
          targetRecordId: null,
        },
        {
          ruleKey: 'worldstate_antagonist_followup',
          targetRecordId: worldStateAgendaId,
        },
      ],
    );
  } finally {
    void context.dispose();
  }
});
