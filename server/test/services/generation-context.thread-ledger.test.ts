import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationContextBundle } from '../../src/services/generation-context.js';
import { createThreadLedger } from '../../src/services/structure-memory-store.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import { createOutline } from '../helpers/seed-generation-context.js';

test('buildGenerationContextBundle 会注入 active 优先、dormant 可见且排除 resolved 的剧情线提醒', async (t) => {
  const context = createTestEnv('generation-context-thread-ledger');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-thread-ledger';

  createThreadLedger(context.env, {
    projectId,
    name: '官府追缉线',
    type: '主线',
    coreQuestion: '林冲如何摆脱追缉',
    currentPhase: '追兵已逼到营外',
    lastProgressAt: '第10章夜探军营',
    lastProgressChapterOrder: 10,
    nextTrigger: '林冲必须在夜里潜入营帐',
    blockedBy: '营门巡夜加密',
    relatedCharacterNames: ['林冲'],
    relatedForeshadowTitles: ['旧案血诏'],
    plannedResolveVolume: 2,
    status: 'active',
    audienceHeat: 4,
  });
  createThreadLedger(context.env, {
    projectId,
    name: '旧案翻线',
    type: '阶段线',
    coreQuestion: '血诏真相何时曝光',
    currentPhase: '线索暂时沉底',
    lastProgressAt: '第7章旧案回溯',
    lastProgressChapterOrder: 7,
    nextTrigger: '等血诏残页再次现身',
    blockedBy: '关键证人失踪',
    relatedCharacterNames: ['林冲'],
    plannedResolveVolume: 3,
    status: 'dormant',
    audienceHeat: 5,
  });
  createThreadLedger(context.env, {
    projectId,
    name: '已收束主线',
    type: '主线',
    coreQuestion: '这条线已经结束',
    currentPhase: '完结',
    relatedCharacterNames: ['林冲'],
    status: 'resolved',
    audienceHeat: 5,
  });
  createThreadLedger(context.env, {
    projectId,
    name: '低热支线',
    type: '支线',
    coreQuestion: '低热不应注入',
    currentPhase: '仍在酝酿',
    relatedCharacterNames: ['林冲'],
    status: 'active',
    audienceHeat: 2,
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-12',
    chapterTitle: '林冲夜探营帐',
    chapterOrder: 12,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
    outline: createOutline({
      goal: '林冲夜探营帐，寻找追缉令来源',
      beats: ['林冲潜入营帐', '林冲翻出旧案卷宗'],
    }),
  });

  const section = result.sections.find((item) => item.key === 'thread_ledger');
  const threadSectionIndex = result.sections.findIndex((item) => item.key === 'thread_ledger');
  const worldStateSectionIndex = result.sections.findIndex((item) => item.key === 'world_state_delta');

  assert.ok(section, '应生成剧情线提醒 section');
  assert.equal(section.title, '剧情线提醒');
  assert.equal(section.blocks.length, 2);
  assert.deepEqual(
    section.blocks,
    [
      [
        '- 官府追缉线（主线 / 活跃 / 热度 4）',
        '核心问题：林冲如何摆脱追缉',
        '当前阶段：追兵已逼到营外',
        '最近推进：第10章夜探军营',
        '下一触发：林冲必须在夜里潜入营帐',
        '当前卡点：营门巡夜加密',
        '预计收束卷：第2卷',
      ].join('\n'),
      [
        '- 旧案翻线（阶段线 / 休眠 / 热度 5）',
        '核心问题：血诏真相何时曝光',
        '当前阶段：线索暂时沉底',
        '最近推进：第7章旧案回溯',
        '下一触发：等血诏残页再次现身',
        '当前卡点：关键证人失踪',
        '预计收束卷：第3卷',
      ].join('\n'),
    ],
  );
  assert.ok(threadSectionIndex >= 0, 'sections 应保留剧情线提醒');
  assert.ok(worldStateSectionIndex < 0 || threadSectionIndex < worldStateSectionIndex, '剧情线提醒应在世界状态前进入正文上下文');
  assert.ok(result.bundle.includes('剧情线提醒：'));
  assert.ok(
    result.bundle.includes(`剧情线提醒：\n\n${section.blocks[0]}\n\n${section.blocks[1]}`),
    'bundle 应内联完整剧情线提醒 section',
  );
  assert.ok(result.bundle.indexOf('官府追缉线') < result.bundle.indexOf('旧案翻线'));
  assert.ok(!result.bundle.includes('已收束主线'));
  assert.ok(!result.bundle.includes('低热支线'));
});

test('buildGenerationContextBundle 会因为章节提示命中而提升剧情线排序', async (t) => {
  const context = createTestEnv('generation-context-thread-ledger-hint-rank');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-thread-ledger-hint-rank';

  createThreadLedger(context.env, {
    projectId,
    name: '夜探营帐',
    type: '主线',
    coreQuestion: '夜探营帐能否找到追缉令来源',
    currentPhase: '林冲决定今夜潜入营帐',
    status: 'active',
    audienceHeat: 4,
  });
  createThreadLedger(context.env, {
    projectId,
    name: '后山接头',
    type: '支线',
    coreQuestion: '后山接头是否会暴露暗线',
    currentPhase: '线人正在山门外等待',
    status: 'active',
    audienceHeat: 5,
  });
  createThreadLedger(context.env, {
    projectId,
    name: '营外围堵',
    type: '阶段线',
    coreQuestion: '围堵会不会进一步升级',
    currentPhase: '兵力暂时潜伏',
    status: 'dormant',
    audienceHeat: 5,
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-hint-rank',
    chapterTitle: '夜探营帐',
    chapterOrder: 12,
    volumeTitle: '第一卷',
    outline: createOutline({
      goal: '林冲趁夜探营帐，确认追缉令来源',
      beats: ['夜探营帐时先绕开巡兵', '翻出追缉文牒'],
    }),
  });

  const section = result.sections.find((item) => item.key === 'thread_ledger');

  assert.ok(section, '应生成剧情线提醒 section');
  assert.equal(section.blocks.length, 3);
  assert.deepEqual(
    [section.blocks[0].split('\n', 1)[0], section.blocks[1].split('\n', 1)[0], section.blocks[2]],
    [
      '- 夜探营帐（主线 / 活跃 / 热度 4）',
      '- 后山接头（支线 / 活跃 / 热度 5）',
      '- 营外围堵（阶段线 / 休眠 / 热度 5）：当前阶段：兵力暂时潜伏',
    ],
  );
  assert.ok(
    result.bundle.indexOf('夜探营帐') < result.bundle.indexOf('后山接头'),
    '章节提示命中的低热 active 线应排在更高热但未命中的 active 线之前',
  );
  assert.ok(!section.blocks[2].includes('\n核心问题：'));
});

test('buildGenerationContextBundle 会对同名剧情线去重并把差异折叠回单个主块', async (t) => {
  const context = createTestEnv('generation-context-thread-ledger-canonical');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-thread-ledger-canonical';

  createThreadLedger(context.env, {
    projectId,
    name: '官府追缉线',
    type: '主线',
    coreQuestion: '林冲如何摆脱追缉',
    currentPhase: '追兵逼近',
    lastProgressAt: '第10章夜探军营',
    lastProgressChapterOrder: 10,
    nextTrigger: '林冲必须在夜里潜入营帐',
    blockedBy: '营门巡夜加密',
    relatedCharacterNames: ['林冲'],
    relatedForeshadowTitles: ['旧案血诏'],
    plannedResolveVolume: 2,
    status: 'active',
    audienceHeat: 5,
  });
  createThreadLedger(context.env, {
    projectId,
    name: '官府追缉线',
    type: '阶段线',
    coreQuestion: '林冲如何摆脱追缉',
    currentPhase: '线索沉底',
    lastProgressAt: '第7章旧案回溯',
    lastProgressChapterOrder: 7,
    nextTrigger: '林冲必须在夜里潜入营帐',
    blockedBy: '关键证人失踪',
    relatedCharacterNames: ['林冲', '柳承业'],
    relatedForeshadowTitles: ['旧案血诏', '血诏残页'],
    plannedResolveVolume: 3,
    status: 'dormant',
    audienceHeat: 4,
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-12',
    chapterTitle: '林冲夜探营帐',
    chapterOrder: 12,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
    outline: createOutline({
      goal: '林冲夜探营帐，寻找追缉令来源',
      beats: ['林冲潜入营帐', '林冲翻出旧案卷宗'],
    }),
  });

  const section = result.sections.find((item) => item.key === 'thread_ledger');

  assert.ok(section, '应生成剧情线提醒 section');
  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /^- 官府追缉线（主线 \/ 活跃 \/ 热度 5）/u);
  assert.match(section.blocks[0], /核心问题：林冲如何摆脱追缉/u);
  assert.match(section.blocks[0], /当前阶段：追兵逼近/u);
  assert.match(section.blocks[0], /下一触发：林冲必须在夜里潜入营帐/u);
  assert.match(section.blocks[0], /当前卡点：营门巡夜加密/u);
  assert.match(section.blocks[0], /补充：阶段补充：线索沉底；卡点补充：关键证人失踪/u);
  assert.equal(result.bundle.split('官府追缉线').length - 1, 1);
});

test('buildGenerationContextBundle 会在低热 active 剧情线直接命中当前章节时放宽保留', async (t) => {
  const context = createTestEnv('generation-context-thread-ledger-low-heat-hit');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-thread-ledger-low-heat-hit';

  createThreadLedger(context.env, {
    projectId,
    name: '夜探营帐',
    type: '支线',
    coreQuestion: '夜探营帐能否拿到账册',
    currentPhase: '今夜必须先潜进去',
    status: 'active',
    audienceHeat: 2,
  });
  createThreadLedger(context.env, {
    projectId,
    name: '外围杂音',
    type: '支线',
    coreQuestion: '外围杂音会不会干扰行动',
    currentPhase: '暂时无实质推进',
    status: 'active',
    audienceHeat: 2,
    relatedCharacterNames: ['林冲'],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-12',
    chapterTitle: '夜探营帐',
    chapterOrder: 12,
    volumeTitle: '第一卷',
    outline: createOutline({
      goal: '林冲趁夜探营帐，确认追缉令来源',
      beats: ['夜探营帐时先绕开巡兵'],
    }),
  });

  const section = result.sections.find((item) => item.key === 'thread_ledger');

  assert.ok(section, '应生成剧情线提醒 section');
  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /^- 夜探营帐（支线 \/ 活跃 \/ 热度 2）/u);
  assert.ok(!result.bundle.includes('外围杂音'));
});
