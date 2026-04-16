import assert from 'node:assert/strict';
import test from 'node:test';
import { listQuestionPools } from '../../src/services/question-pool-store.js';
import { listResourceContinuities } from '../../src/services/structured-resource-continuity-store.js';
import { applyStructureMemoryBackfill, previewStructureMemoryBackfill } from '../../src/services/structure-memory-maintenance.js';
import { listThreadLedgers, listWorldStateEntries } from '../../src/services/structure-memory-store.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import { seedBackfillAllNewFixture, seedBackfillFixture } from '../helpers/structure-memory-maintenance-fixtures.js';

test('previewStructureMemoryBackfill 会返回自洽计数与稳定系统顺序，apply 默认只写入 new 候选', () => {
  const context = createTestEnv('structure-memory-backfill-default');
  const { projectId } = seedBackfillFixture(context.env);

  try {
    const preview = previewStructureMemoryBackfill(context.env, {
      projectId,
    });

    assert.equal(preview.totalCandidates, 4);
    assert.equal(preview.newCandidates, 2);
    assert.equal(preview.existingCandidates, 2);
    assert.equal(
      preview.counts.reduce((sum, item) => sum + item.total, 0),
      preview.totalCandidates,
    );
    assert.deepEqual(
      preview.candidates.map((item) => [item.system, item.status]),
      [
        ['thread_ledger', 'new'],
        ['question_pool', 'existing'],
        ['world_state_entry', 'existing'],
        ['resource_continuity', 'new'],
      ],
    );
    const threadCandidate = preview.candidates.find((item) => item.system === 'thread_ledger');
    const resourceCandidate = preview.candidates.find((item) => item.system === 'resource_continuity');

    assert.ok(threadCandidate, '应存在 thread_ledger 预览候选');
    assert.ok(resourceCandidate, '应存在 resource_continuity 预览候选');
    assert.equal(threadCandidate.title, '第一卷阶段线');
    assert.equal(threadCandidate.scopeLabel, '第1卷');
    assert.equal(resourceCandidate.title, '林冲 · 寿命');
    assert.equal(resourceCandidate.scopeLabel, '第1章《卷一终章》');

    const applied = applyStructureMemoryBackfill(context.env, {
      projectId,
    });
    const threadRecords = listThreadLedgers(context.env, { projectId });
    const resourceRecords = listResourceContinuities(context.env, { projectId });
    const createdThread = threadRecords.find((item) => applied.createdRecordIds.includes(item.id));
    const createdResource = resourceRecords.find((item) => applied.createdRecordIds.includes(item.id));

    assert.equal(applied.requestedCandidateCount, 2);
    assert.equal(applied.createdCount, 2);
    assert.equal(applied.skippedExistingCount, 0);
    assert.equal(applied.createdRecordIds.length, 2);
    assert.equal(threadRecords.length, 1);
    assert.equal(listQuestionPools(context.env, { projectId }).length, 1);
    assert.equal(listWorldStateEntries(context.env, { projectId }).length, 1);
    assert.equal(resourceRecords.length, 1);
    assert.ok(createdThread, '应落库 thread_ledger 新候选');
    assert.ok(createdResource, '应落库 resource_continuity 新候选');
    assert.equal(createdThread.name, threadCandidate.title);
    assert.match(createdThread.coreQuestion, /林冲在追缉压力下暂时脱身/u);
    assert.deepEqual(createdThread.relatedForeshadowTitles, ['血诏真相']);
    assert.equal(createdThread.status, 'active');
    assert.equal(createdThread.audienceHeat, 4);
    assert.equal(createdResource.ownerCharacterName, '林冲');
    assert.equal(createdResource.resourceType, '寿命');
    assert.equal(createdResource.lastConsumedAt, resourceCandidate.scopeLabel);
    assert.equal(createdResource.status, 'permanent');
    assert.match(createdResource.continuityRisk, /仅剩三年/u);
  } finally {
    void context.dispose();
  }
});

test('applyStructureMemoryBackfill 传 candidateIds 时只处理选中候选，并把 existing 计入 skippedExistingCount', () => {
  const context = createTestEnv('structure-memory-backfill-selected');
  const { projectId } = seedBackfillFixture(context.env);

  try {
    const preview = previewStructureMemoryBackfill(context.env, {
      projectId,
    });
    const existingQuestion = preview.candidates.find((item) => item.system === 'question_pool');
    const newResource = preview.candidates.find((item) => item.system === 'resource_continuity');

    assert.ok(existingQuestion, '应存在 question_pool 候选');
    assert.ok(newResource, '应存在 resource_continuity 候选');

    const applied = applyStructureMemoryBackfill(context.env, {
      projectId,
      candidateIds: [
        existingQuestion.candidateId,
        newResource.candidateId,
        'unknown-candidate-id',
      ],
    });

    assert.equal(applied.requestedCandidateCount, 2);
    assert.equal(applied.createdCount, 1);
    assert.equal(applied.skippedExistingCount, 1);
    assert.equal(applied.createdRecordIds.length, 1);
    assert.equal(
      applied.counts.find((item) => item.system === 'question_pool')?.skippedExistingCount,
      1,
    );
    assert.equal(
      applied.counts.find((item) => item.system === 'resource_continuity')?.createdCount,
      1,
    );
    const resourceRecords = listResourceContinuities(context.env, { projectId });
    const createdResource = resourceRecords.find((item) => item.id === applied.createdRecordIds[0]);

    assert.equal(resourceRecords.length, 1);
    assert.ok(createdResource, '显式 candidateIds 选择后应只落库资源候选');
    assert.equal(createdResource.ownerCharacterName, '林冲');
    assert.equal(createdResource.resourceType, '寿命');
    assert.equal(createdResource.lastConsumedAt, newResource.scopeLabel);
  } finally {
    void context.dispose();
  }
});

test('previewStructureMemoryBackfill 的预览标题/范围会和最终落库记录逐项对齐', () => {
  const context = createTestEnv('structure-memory-backfill-all-new');
  const { projectId } = seedBackfillAllNewFixture(context.env);

  try {
    const preview = previewStructureMemoryBackfill(context.env, {
      projectId,
    });
    const previewBySystem = new Map(preview.candidates.map((item) => [item.system, item] as const));

    assert.deepEqual(
      preview.candidates.map((item) => [item.system, item.status]),
      [
        ['thread_ledger', 'new'],
        ['question_pool', 'new'],
        ['world_state_entry', 'new'],
        ['resource_continuity', 'new'],
      ],
    );

    const applied = applyStructureMemoryBackfill(context.env, {
      projectId,
    });

    assert.equal(applied.createdCount, 4);
    assert.equal(applied.createdRecordIds.length, 4);

    const createdThread = listThreadLedgers(context.env, { projectId })[0];
    const createdQuestion = listQuestionPools(context.env, { projectId })[0];
    const createdWorldState = listWorldStateEntries(context.env, { projectId })[0];
    const createdResource = listResourceContinuities(context.env, { projectId })[0];

    const threadPreview = previewBySystem.get('thread_ledger');
    const questionPreview = previewBySystem.get('question_pool');
    const worldStatePreview = previewBySystem.get('world_state_entry');
    const resourcePreview = previewBySystem.get('resource_continuity');

    assert.ok(threadPreview);
    assert.ok(questionPreview);
    assert.ok(worldStatePreview);
    assert.ok(resourcePreview);

    assert.equal(createdThread.name, threadPreview.title);
    assert.equal(threadPreview.scopeLabel, '第1卷');
    assert.match(createdThread.currentPhase, /阶段摘要/u);
    assert.match(createdThread.coreQuestion, /林冲在追缉压力下暂时脱身/u);
    assert.ok(threadPreview.evidence.some((item) => createdThread.coreQuestion.includes(item.excerpt)));

    assert.equal(createdQuestion.question, questionPreview.title);
    assert.equal(questionPreview.scopeLabel, '第1卷线索');
    assert.equal(createdQuestion.expectedRevealWindow, '第 1 卷');
    assert.ok(createdQuestion.currentClue.includes(questionPreview.evidence[0]?.excerpt ?? ''));

    assert.equal(worldStatePreview.title, `${createdWorldState.volumeTitle} · 卷级世界状态`);
    assert.equal(worldStatePreview.scopeLabel, `第${createdWorldState.volumeOrder}卷`);
    assert.ok(
      [
        ...createdWorldState.publicEvents,
        ...createdWorldState.secretEvents,
        createdWorldState.rumorState,
      ].some((value) => value && worldStatePreview.evidence.some((item) => value.includes(item.excerpt))),
    );

    assert.equal(resourcePreview.title, `${createdResource.ownerCharacterName} · ${createdResource.resourceType}`);
    assert.equal(createdResource.lastConsumedAt, resourcePreview.scopeLabel);
    assert.ok(
      [createdResource.currentState, createdResource.performanceImpact, createdResource.continuityRisk]
        .some((value) => resourcePreview.evidence.some((item) => value.includes(item.excerpt))),
    );
  } finally {
    void context.dispose();
  }
});
