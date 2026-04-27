import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationContextBundle } from '../../src/services/generation-context.js';
import { createResourceContinuity } from '../../src/services/structured-resource-continuity-store.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import { seedChapter } from '../helpers/seed-generation-context.js';

function seedResourceContinuityChapters(
  env: Parameters<typeof seedChapter>[0],
  projectId: string,
) {
  seedChapter(env, {
    projectId,
    chapterId: 'chapter-1',
    chapterTitle: '第1章 雨夜疗伤',
    chapterOrder: 1,
    volumeTitle: '第一卷',
    stateChanges: [
      {
        entityName: '林冲',
        field: '伤药',
        oldValue: '还剩半包',
        newValue: '伤药见底，只够再撑一回',
      },
    ],
  });

  seedChapter(env, {
    projectId,
    chapterId: 'chapter-2',
    chapterTitle: '第2章 夜渡荒河',
    chapterOrder: 2,
    volumeTitle: '第一卷',
    previousChapterId: 'chapter-1',
    previousChapterTitle: '第1章 雨夜疗伤',
  });
}

function getResourceContinuitySection(
  result: Awaited<ReturnType<typeof buildGenerationContextBundle>>,
) {
  const section = result.sections.find((item) => item.key === 'resource_continuity');

  if (!section) {
    assert.fail('应生成资源连续性 section');
  }

  return section;
}

test('buildGenerationContextBundle 会合并同角色同资源的结构化与运行态资源连续性', async (t) => {
  const context = createTestEnv('generation-context-resource-continuity-dedup');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-resource-continuity-dedup';
  seedResourceContinuityChapters(context.env, projectId);

  createResourceContinuity(context.env, {
    projectId,
    resourceType: '伤药',
    ownerCharacterName: '林冲',
    currentState: '伤药见底，只够再撑一回',
    performanceImpact: '下一场硬战前无法再完整处理伤口',
    continuityRisk: '若继续失血，战力会明显下滑',
    status: 'active',
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-2',
    chapterTitle: '第2章 夜渡荒河',
    chapterOrder: 2,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
  });

  const section = getResourceContinuitySection(result);

  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /^- 林冲 \/ 伤药/u);
  assert.match(section.blocks[0], /当前状态：伤药见底，只够再撑一回/u);
  assert.match(section.blocks[0], /行动限制：下一场硬战前无法再完整处理伤口/u);
  assert.ok(
    !section.blocks.some((block) => /^- 第1章 雨夜疗伤 林冲 \/ 伤药：/u.test(block)),
    '运行态命中同一角色同资源时不应再保留独立重复块',
  );
});

test('buildGenerationContextBundle 在缺少结构化资源台账时仍会注入运行态资源变化', async (t) => {
  const context = createTestEnv('generation-context-resource-continuity-runtime-only');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-resource-continuity-runtime-only';
  seedResourceContinuityChapters(context.env, projectId);

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-2',
    chapterTitle: '第2章 夜渡荒河',
    chapterOrder: 2,
    volumeTitle: '第一卷',
  });

  const section = getResourceContinuitySection(result);

  assert.equal(section.blocks.length, 1);
  assert.match(
    section.blocks[0],
    /^- 第1章 雨夜疗伤 林冲 \/ 伤药：还剩半包 -> 伤药见底，只够再撑一回$/u,
  );
});

test('buildGenerationContextBundle 会把低优先级结构化资源条目压成一行摘要', async (t) => {
  const context = createTestEnv('generation-context-resource-continuity-compression');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-resource-continuity-compression';

  createResourceContinuity(context.env, {
    projectId,
    resourceType: '伤药',
    ownerCharacterName: '林冲',
    currentState: '伤药只剩最后一包',
    performanceImpact: '再打一场硬仗就没有余量',
    continuityRisk: '若失手会直接断药',
    riskLevel: 'critical',
    status: 'active',
  });
  createResourceContinuity(context.env, {
    projectId,
    resourceType: '银钱',
    ownerCharacterName: '柳承业',
    currentState: '手里只剩一笔过路钱',
    performanceImpact: '无法再额外收买城门口的差役',
    continuityRisk: '一旦被盯上就周转不开',
    riskLevel: 'high',
    status: 'active',
  });
  createResourceContinuity(context.env, {
    projectId,
    resourceType: '物资',
    ownerCharacterName: '周青',
    currentState: '备用物资已经被抽走大半',
    performanceImpact: '队伍转场时会明显拖慢脚步',
    continuityRisk: '下一次转移可能暴露补给线',
    riskLevel: 'medium',
    status: 'active',
  });
  createResourceContinuity(context.env, {
    projectId,
    resourceType: '粮草',
    ownerCharacterName: '老马',
    currentState: '粮草只够再撑半日',
    performanceImpact: '队伍无法继续绕远线转移',
    continuityRisk: '一旦拖到天亮就会断补给',
    riskLevel: 'medium',
    status: 'active',
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 对账当夜',
    chapterOrder: 9,
    volumeTitle: '第二卷',
    requiredEntityNames: ['林冲', '柳承业', '周青'],
  });

  const section = getResourceContinuitySection(result);

  assert.equal(section.blocks.length, 4);
  assert.match(section.blocks[0], /^- 林冲 \/ 伤药/u);
  assert.match(section.blocks[1], /^- 柳承业 \/ 银钱/u);
  assert.match(section.blocks[2], /^- 周青 \/ 物资/u);
  assert.equal(section.blocks[3], '- 老马 / 粮草（中风险）：粮草只够再撑半日');
  assert.ok(!section.blocks[3].includes('\n风险级别：'));
});

test('buildGenerationContextBundle 会放宽非高压章节下的资源连续性阈值，让章节直命中的高风险条目也能进入正文', async (t) => {
  const context = createTestEnv('generation-context-resource-continuity-threshold');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-resource-continuity-threshold';

  createResourceContinuity(context.env, {
    projectId,
    resourceType: '物资',
    ownerCharacterName: '老马',
    currentState: '补给已经明显吃紧',
    performanceImpact: '再拖下去队伍就会断供',
    continuityRisk: '一旦转移失败就会直接缺粮',
    riskLevel: 'high',
    status: 'active',
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 补给将断',
    chapterOrder: 9,
    volumeTitle: '第二卷',
  });

  const section = getResourceContinuitySection(result);

  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /^- 老马 \/ 物资/u);
});
