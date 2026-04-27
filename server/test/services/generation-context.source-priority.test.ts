import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationContextBundle } from '../../src/services/generation-context.js';
import { createForeshadowPlan } from '../../src/services/structure-memory-store.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import {
  createEntitySnapshot,
  createOutline,
  seedEntities,
  seedForeshadows,
} from '../helpers/seed-generation-context.js';

test('buildGenerationContextBundle 在同名实体冲突时优先使用 entitySnapshot', async (t) => {
  const context = createTestEnv('generation-context-source-priority-entity');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-source-priority-entity';

  seedEntities(context.env, {
    projectId,
    chapterId: 'chapter-1',
    chapterTitle: '第1章 旧版实体',
    entities: [
      createEntitySnapshot('林冲', {
        description: '旧运行态描述',
        fields: {
          static_desire: '旧欲望',
          static_values: '旧价值排序',
        },
      }),
    ],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-2',
    chapterTitle: '第2章 新版实体',
    chapterOrder: 2,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
    entitySnapshot: [
      {
        name: '林冲',
        type: 'character',
        description: '设定库正式描述',
        fields: {
          static_desire: '正式欲望',
          static_values: '正式价值排序',
        },
        tags: ['正式设定'],
        aliases: [],
        pinned: true,
        draft: false,
      },
    ],
  });

  const section = result.sections.find((item) => item.key === 'focus_entities');

  assert.ok(section, '应生成当前关注实体 section');
  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /描述：设定库正式描述/u);
  assert.match(section.blocks[0], /欲望：正式欲望/u);
  assert.match(section.blocks[0], /价值排序：正式价值排序/u);
  assert.ok(!section.blocks[0].includes('旧运行态描述'));
  assert.ok(!section.blocks[0].includes('旧欲望'));
  assert.ok(!section.blocks[0].includes('旧价值排序'));
});

test('buildGenerationContextBundle 会把同名实体的非冲突补充信息折叠回 winner 主块', async (t) => {
  const context = createTestEnv('generation-context-source-priority-entity-supplement');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-source-priority-entity-supplement';

  seedEntities(context.env, {
    projectId,
    chapterId: 'chapter-1',
    chapterTitle: '第1章 旧版实体',
    entities: [
      createEntitySnapshot('林冲', {
        description: '旧运行态对林冲的补充描述',
        fields: {
          static_values: '先护住证人，再谈翻案',
          static_role: '被追缉的军中旧将',
        },
        tags: ['旧案线'],
        aliases: ['豹子头'],
      }),
    ],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-2',
    chapterTitle: '第2章 新版实体',
    chapterOrder: 2,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
    entitySnapshot: [
      {
        name: '林冲',
        type: 'character',
        description: '设定库正式描述',
        fields: {
          static_desire: '翻出旧案真相',
        },
        tags: ['正式设定'],
        aliases: [],
        pinned: true,
        draft: false,
      },
    ],
  });

  const section = result.sections.find((item) => item.key === 'focus_entities');

  assert.ok(section, '应生成当前关注实体 section');
  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /描述：设定库正式描述/u);
  assert.match(section.blocks[0], /别名：豹子头/u);
  assert.match(section.blocks[0], /欲望：翻出旧案真相/u);
  assert.match(section.blocks[0], /价值排序：先护住证人，再谈翻案/u);
  assert.match(section.blocks[0], /关键状态：static_role=被追缉的军中旧将/u);
  assert.match(section.blocks[0], /标签：正式设定 \/ 旧案线/u);
  assert.match(section.blocks[0], /补充说明：旧运行态对林冲的补充描述/u);
});

test('buildGenerationContextBundle 在同标题伏笔冲突时优先使用 foreshadowSnapshot', async (t) => {
  const context = createTestEnv('generation-context-source-priority-foreshadow');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-source-priority-foreshadow';

  seedForeshadows(context.env, {
    projectId,
    foreshadows: [
      {
        id: 'generation-foreshadow-old',
        title: '旧印缺页',
        excerpt: '旧运行态摘要',
        notes: '旧运行态备注',
        status: 'planted',
        sourceChapterId: 'chapter-1',
        sourceChapterTitle: '第1章 埋设',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
  });

  createForeshadowPlan(context.env, {
    projectId,
    foreshadowId: 'generation-foreshadow-old',
    foreshadowTitle: '旧印缺页',
    type: '回收伏笔',
    importance: 'major',
    plannedActivateVolume: 2,
    plannedResolveVolume: 2,
    activationCondition: '对账桌上出现原页痕迹',
    resolveCondition: '确认缺页真正去向',
    payoffEffect: '旧案证据链重新闭合',
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 对账当夜',
    chapterOrder: 9,
    volumeTitle: '第二卷',
    preferStoredForeshadows: true,
    requiredForeshadowTitles: ['旧印缺页'],
    outline: createOutline({
      goal: '把缺页之谜推到对账桌正面',
      beats: ['旧印缺页开始被当场追问'],
    }),
    foreshadowSnapshot: [
      {
        id: 'manual-foreshadow-new',
        title: '旧印缺页',
        excerpt: '正式伏笔摘要',
        notes: '正式伏笔备注',
        status: 'activated',
        sourceChapterId: 'chapter-1',
        sourceChapterTitle: '第1章 埋设',
        updatedAt: '2026-04-16T00:00:00.000Z',
      },
    ],
  });

  const workingMemorySection = result.sections.find((item) => item.key === 'working_memory');
  const foreshadowPlanSection = result.sections.find((item) => item.key === 'foreshadow_plan');

  assert.ok(workingMemorySection, '应生成工作记忆 section');
  assert.ok(foreshadowPlanSection, '应生成伏笔规划 section');
  assert.ok(
    workingMemorySection.blocks.some((block) => block.includes('正式伏笔摘要')),
    '工作记忆中的激活伏笔应采用 snapshot 版本摘要',
  );
  assert.ok(
    workingMemorySection.blocks.every((block) => !block.includes('旧运行态摘要')),
    '工作记忆不应继续保留旧 generation 版本摘要',
  );
  assert.ok(
    foreshadowPlanSection.blocks.some((block) => block.includes('当前状态：已激活')),
    '伏笔规划应采用 snapshot 版本的激活状态',
  );
});

test('buildGenerationContextBundle 会把同标题伏笔的来源章与备注补充折叠回 winner 主块', async (t) => {
  const context = createTestEnv('generation-context-source-priority-foreshadow-supplement');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-source-priority-foreshadow-supplement';

  seedForeshadows(context.env, {
    projectId,
    foreshadows: [
      {
        id: 'generation-foreshadow-old',
        title: '旧印缺页',
        excerpt: '',
        notes: '旧运行态备注里补充了缺页曾被火漆封存。',
        status: 'activated',
        sourceChapterId: 'chapter-1',
        sourceChapterTitle: '第1章 埋设',
        resolvedChapterTitle: '第8章 回响',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 对账当夜',
    chapterOrder: 9,
    volumeTitle: '第二卷',
    preferStoredForeshadows: true,
    foreshadowSnapshot: [
      {
        id: 'manual-foreshadow-new',
        title: '旧印缺页',
        excerpt: '正式伏笔摘要',
        notes: '',
        status: 'activated',
        sourceChapterId: '',
        sourceChapterTitle: '',
        updatedAt: '2026-04-16T00:00:00.000Z',
      },
    ],
  });

  const workingMemorySection = result.sections.find((item) => item.key === 'working_memory');

  assert.ok(workingMemorySection, '应生成工作记忆 section');
  assert.ok(
    workingMemorySection.blocks.some((block) => block.includes('摘要：正式伏笔摘要')),
    '主摘要应继续采用 snapshot 版本',
  );
  assert.ok(
    workingMemorySection.blocks.some((block) => block.includes('来源：第1章 埋设')),
    '缺失的来源章节应从旧记录补回',
  );
  assert.ok(
    workingMemorySection.blocks.some((block) => block.includes('预期回收：第8章 回响')),
    '缺失的回收章节应从旧记录补回',
  );
  assert.ok(
    workingMemorySection.blocks.some((block) => block.includes('补充：旧运行态备注里补充了缺页曾被火漆封存。')),
    '备注类补充应折叠回主块而不是另起重复块',
  );
  assert.ok(
    workingMemorySection.blocks.every((block) => !block.includes('旧运行态摘要')),
    '旧运行态摘要不应重新回灌成并列事实',
  );
});

test('buildGenerationContextBundle 会把次级伏笔规划压成一行摘要块', async (t) => {
  const context = createTestEnv('generation-context-foreshadow-plan-compression');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-foreshadow-plan-compression';

  seedForeshadows(context.env, {
    projectId,
    foreshadows: [
      {
        id: 'foreshadow-a',
        title: '血诏残页',
        excerpt: '血诏残页已被带到对账桌前。',
        notes: '',
        status: 'activated',
        sourceChapterId: 'chapter-1',
        sourceChapterTitle: '第1章 埋设',
      },
      {
        id: 'foreshadow-b',
        title: '城门旧钥',
        excerpt: '旧钥去向开始牵出内鬼。',
        notes: '',
        status: 'activated',
        sourceChapterId: 'chapter-2',
        sourceChapterTitle: '第2章 埋设',
      },
      {
        id: 'foreshadow-c',
        title: '盐票暗记',
        excerpt: '盐票上的暗记还未彻底解释。',
        notes: '',
        status: 'activated',
        sourceChapterId: 'chapter-3',
        sourceChapterTitle: '第3章 埋设',
      },
      {
        id: 'foreshadow-d',
        title: '井底回声',
        excerpt: '井底回声仍在拖住最终解释。',
        notes: '',
        status: 'activated',
        sourceChapterId: 'chapter-4',
        sourceChapterTitle: '第4章 埋设',
      },
    ],
  });

  createForeshadowPlan(context.env, {
    projectId,
    foreshadowId: 'foreshadow-a',
    foreshadowTitle: '血诏残页',
    type: '主线伏笔',
    importance: 'major',
    plannedResolveVolume: 2,
    resolveCondition: '在对账桌前补齐残页来源',
  });
  createForeshadowPlan(context.env, {
    projectId,
    foreshadowId: 'foreshadow-b',
    foreshadowTitle: '城门旧钥',
    type: '主线伏笔',
    importance: 'major',
    plannedResolveVolume: 2,
    resolveCondition: '锁定真正的持钥人',
  });
  createForeshadowPlan(context.env, {
    projectId,
    foreshadowId: 'foreshadow-c',
    foreshadowTitle: '盐票暗记',
    type: '支线伏笔',
    importance: 'minor',
    plannedResolveVolume: 3,
    resolveCondition: '确认暗记对应的盐道',
  });
  createForeshadowPlan(context.env, {
    projectId,
    foreshadowId: 'foreshadow-d',
    foreshadowTitle: '井底回声',
    type: '支线伏笔',
    importance: 'minor',
    plannedResolveVolume: 3,
    resolveCondition: '确认井底回声究竟来自哪一边',
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 对账当夜',
    chapterOrder: 9,
    volumeTitle: '第二卷',
  });

  const section = result.sections.find((item) => item.key === 'foreshadow_plan');

  assert.ok(section, '应生成伏笔规划 section');
  assert.equal(section.blocks.length, 4);
  assert.ok(section.blocks[0].includes('\n当前状态：已激活'));
  assert.ok(section.blocks[1].includes('\n当前状态：已激活'));
  assert.ok(section.blocks[2].includes('\n当前状态：已激活'));
  assert.equal(section.blocks[3], '- 井底回声（支线伏笔 / 次级伏笔）：当前状态：已激活；计划回收：第3卷；回收条件：确认井底回声究竟来自哪一边');
});

test('buildGenerationContextBundle 会放宽保留核心伏笔规划，即使当前未挂 active 事实也可进入 section', async (t) => {
  const context = createTestEnv('generation-context-foreshadow-plan-major-without-active');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-foreshadow-plan-major-without-active';

  createForeshadowPlan(context.env, {
    projectId,
    foreshadowId: 'foreshadow-major-only',
    foreshadowTitle: '城门总钥',
    type: '主线伏笔',
    importance: 'major',
    plannedActivateVolume: 2,
    plannedResolveVolume: 3,
    activationCondition: '需要先拿到城防旧印',
    resolveCondition: '确认总钥真正的保管人',
    payoffEffect: '打开城门旧案的最后缺口',
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 对账当夜',
    chapterOrder: 9,
    volumeTitle: '第二卷',
  });

  const section = result.sections.find((item) => item.key === 'foreshadow_plan');

  assert.ok(section, '应生成伏笔规划 section');
  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /^- 城门总钥（主线伏笔 \/ 核心伏笔）/u);
  assert.ok(!section.blocks[0].includes('当前状态：已激活'));
  assert.match(section.blocks[0], /计划激活：第2卷/u);
  assert.match(section.blocks[0], /计划回收：第3卷/u);
});
