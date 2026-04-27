import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationContextBundle } from '../../src/services/generation-context.js';
import { createWorldStateEntry } from '../../src/services/structure-memory-store.js';
import { createTestEnv } from '../helpers/create-test-env.js';

function countOccurrences(text: string, fragment: string) {
  return text.split(fragment).length - 1;
}

test('buildGenerationContextBundle 当前正文主链只消费卷级世界状态与前一卷残留，不启用 milestone 覆盖', async (t) => {
  const context = createTestEnv('generation-context-world-state');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-world-state';

  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-1',
    volumeTitle: '第一卷',
    volumeOrder: 1,
    milestoneIndex: null,
    publicEvents: ['第一卷旧案余波'],
    currentRisks: ['第一卷旧债未清'],
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: null,
    publicEvents: ['卷级公开震荡'],
    secretEvents: ['卷级暗线推进'],
    rumorState: '卷级舆论已发酵',
    currentRisks: ['卷级风险仍在扩大'],
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: 1,
    publicEvents: ['阶段覆盖公开事件'],
    rumorState: '阶段舆论不应进入当前正文主链',
    currentRisks: ['阶段风险不应进入当前正文主链'],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-21',
    chapterTitle: '第二卷当前章节',
    chapterOrder: 21,
    volumeTitle: '第二卷',
  });

  const section = result.sections.find((item) => item.key === 'world_state_delta');

  assert.ok(section, '应生成世界状态 section');
  assert.equal(section.blocks.length, 2);
  assert.match(section.blocks[0], /卷级公开震荡/u);
  assert.match(section.blocks[0], /卷级舆论已发酵/u);
  assert.match(section.blocks[0], /卷级风险仍在扩大/u);
  assert.ok(!section.blocks[0].includes('阶段覆盖公开事件'));
  assert.ok(!section.blocks[0].includes('阶段舆论不应进入当前正文主链'));
  assert.ok(!section.blocks[0].includes('阶段风险不应进入当前正文主链'));
  assert.match(section.blocks[1], /第一卷旧案余波/u);
  assert.match(section.blocks[1], /第一卷旧债未清/u);
});

test('buildGenerationContextBundle 传 milestoneIndex 时会按 milestone > volume 合并当前卷世界状态，并保留卷级兜底字段', async (t) => {
  const context = createTestEnv('generation-context-world-state-milestone');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-world-state-milestone';

  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-1',
    volumeTitle: '第一卷',
    volumeOrder: 1,
    milestoneIndex: null,
    publicEvents: ['第一卷旧案余波'],
    currentRisks: ['第一卷旧债未清'],
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: null,
    publicEvents: ['卷级公开震荡'],
    secretEvents: ['卷级暗线推进'],
    institutionChange: '卷级制度变化仍在生效',
    rumorState: '卷级舆论已发酵',
    currentRisks: ['卷级风险仍在扩大'],
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: 1,
    publicEvents: ['阶段覆盖公开事件'],
    secretEvents: ['阶段暗线推进'],
    institutionChange: '',
    rumorState: '阶段舆论接手当前态势',
    currentRisks: [],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-22',
    chapterTitle: '第二卷里程碑章节',
    chapterOrder: 22,
    volumeTitle: '第二卷',
    milestoneIndex: 1,
  });

  const section = result.sections.find((item) => item.key === 'world_state_delta');

  assert.ok(section, '应生成世界状态 section');
  assert.equal(section.blocks.length, 2);
  assert.match(section.blocks[0], /阶段覆盖公开事件/u);
  assert.match(section.blocks[0], /阶段暗线推进/u);
  assert.match(section.blocks[0], /阶段舆论接手当前态势/u);
  assert.match(section.blocks[0], /卷级制度变化仍在生效/u);
  assert.match(section.blocks[0], /卷级风险仍在扩大/u);
  assert.match(section.blocks[0], /卷级公开震荡/u);
  assert.ok(!section.blocks[0].includes('卷级舆论已发酵'));
  assert.match(section.blocks[1], /第一卷旧案余波/u);
  assert.ok(result.bundle.includes(`世界状态：\n\n${section.blocks[0]}\n\n${section.blocks[1]}`));
});

test('buildGenerationContextBundle 只保留当前卷与前一卷世界状态，不回溯更早卷', async (t) => {
  const context = createTestEnv('generation-context-world-state-two-volume-window');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-world-state-two-volume-window';

  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-1',
    volumeTitle: '第一卷',
    volumeOrder: 1,
    milestoneIndex: null,
    publicEvents: ['第一卷旧都瘟疫余波'],
    currentRisks: ['第一卷旧债未清'],
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: null,
    publicEvents: ['第二卷城门戒严'],
    rumorState: '第二卷民间谣言升高',
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-3',
    volumeTitle: '第三卷',
    volumeOrder: 3,
    milestoneIndex: null,
    publicEvents: ['第三卷新皇即位'],
    secretEvents: ['第三卷内廷调兵'],
    currentRisks: ['第三卷军心未稳'],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-31',
    chapterTitle: '第三卷当前章节',
    chapterOrder: 31,
    volumeTitle: '第三卷',
  });

  const section = result.sections.find((item) => item.key === 'world_state_delta');

  assert.ok(section, '应生成世界状态 section');
  assert.deepEqual(
    section.blocks.map((block) => block.split('\n', 1)[0]),
    [
      '- 世界状态-本卷变化《第三卷》',
      '- 世界状态-前一卷残留《第二卷》',
    ],
  );
  assert.match(section.blocks[0], /第三卷新皇即位/u);
  assert.match(section.blocks[0], /第三卷内廷调兵/u);
  assert.match(section.blocks[0], /第三卷军心未稳/u);
  assert.match(section.blocks[1], /第二卷城门戒严/u);
  assert.match(section.blocks[1], /第二卷民间谣言升高/u);
  assert.ok(!section.blocks[0].includes('第一卷旧都瘟疫余波'));
  assert.ok(!section.blocks[1].includes('第一卷旧都瘟疫余波'));
  assert.ok(!result.bundle.includes('第一卷旧都瘟疫余波'));
});

test('buildGenerationContextBundle 只有当前卷 milestone 才会覆盖当前卷卷级状态', async (t) => {
  const context = createTestEnv('generation-context-world-state-current-volume-milestone-only');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-world-state-current-volume-milestone-only';

  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: null,
    publicEvents: ['第二卷卷级戒严'],
    rumorState: '第二卷卷级风声已走漏',
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: 1,
    publicEvents: ['第二卷阶段谣言不应串到第三卷'],
    rumorState: '第二卷阶段传闻不应覆盖当前卷',
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-3',
    volumeTitle: '第三卷',
    volumeOrder: 3,
    milestoneIndex: null,
    publicEvents: ['第三卷卷级公开变化'],
    institutionChange: '第三卷卷级制度仍在生效',
    currentRisks: ['第三卷卷级风险仍未解除'],
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-3',
    volumeTitle: '第三卷',
    volumeOrder: 3,
    milestoneIndex: 1,
    publicEvents: ['第三卷阶段公开事件'],
    secretEvents: ['第三卷阶段暗线推进'],
    institutionChange: '',
    rumorState: '第三卷阶段舆论接手当前态势',
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-32',
    chapterTitle: '第三卷里程碑章节',
    chapterOrder: 32,
    volumeTitle: '第三卷',
    milestoneIndex: 1,
  });

  const section = result.sections.find((item) => item.key === 'world_state_delta');

  assert.ok(section, '应生成世界状态 section');
  assert.equal(section.blocks.length, 2);
  assert.match(section.blocks[0], /第三卷阶段公开事件/u);
  assert.match(section.blocks[0], /第三卷阶段暗线推进/u);
  assert.match(section.blocks[0], /第三卷阶段舆论接手当前态势/u);
  assert.match(section.blocks[0], /第三卷卷级制度仍在生效/u);
  assert.match(section.blocks[0], /第三卷卷级风险仍未解除/u);
  assert.match(section.blocks[0], /第三卷卷级公开变化/u);
  assert.ok(!section.blocks[0].includes('第二卷阶段谣言不应串到第三卷'));
  assert.ok(!section.blocks[0].includes('第二卷阶段传闻不应覆盖当前卷'));
  assert.match(section.blocks[1], /第二卷卷级戒严/u);
  assert.match(section.blocks[1], /第二卷卷级风声已走漏/u);
  assert.ok(!section.blocks[1].includes('第二卷阶段谣言不应串到第三卷'));
  assert.ok(!section.blocks[1].includes('第二卷阶段传闻不应覆盖当前卷'));
});

test('buildGenerationContextBundle 当前卷同维度冲突时 milestone 非空值优先，卷级仅补并未重复内容', async (t) => {
  const context = createTestEnv('generation-context-world-state-milestone-canonical');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-world-state-milestone-canonical';

  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: null,
    publicEvents: ['卷级公开震荡', '两路都提到的风声'],
    secretEvents: ['卷级暗线推进'],
    institutionChange: '卷级制度变化仍在生效',
    rumorState: '卷级舆论不应保留',
    currentRisks: ['卷级风险仍在扩大', '两路都提到的风声'],
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: 1,
    publicEvents: ['阶段覆盖公开事件', '两路都提到的风声'],
    secretEvents: ['阶段暗线推进'],
    institutionChange: '',
    rumorState: '阶段舆论接手当前态势',
    currentRisks: ['阶段新增风险', '两路都提到的风声'],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-23',
    chapterTitle: '第二卷里程碑冲突章节',
    chapterOrder: 23,
    volumeTitle: '第二卷',
    milestoneIndex: 1,
  });

  const section = result.sections.find((item) => item.key === 'world_state_delta');

  assert.ok(section, '应生成世界状态 section');
  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /公开事件：阶段覆盖公开事件；两路都提到的风声；卷级公开震荡/u);
  assert.match(section.blocks[0], /秘密事件：阶段暗线推进；卷级暗线推进/u);
  assert.match(section.blocks[0], /舆论状态：阶段舆论接手当前态势/u);
  assert.match(section.blocks[0], /制度变化：卷级制度变化仍在生效/u);
  assert.match(section.blocks[0], /当前风险：阶段新增风险；两路都提到的风声；卷级风险仍在扩大/u);
  assert.ok(!section.blocks[0].includes('卷级舆论不应保留'));
});

test('buildGenerationContextBundle 当前卷列表维度补并时重复项只保留一次', async (t) => {
  const context = createTestEnv('generation-context-world-state-list-dedup');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-world-state-list-dedup';

  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: null,
    publicEvents: ['盐引被截', '城门夜封'],
    currentRisks: ['账册外泄', '粮道中断'],
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: 2,
    publicEvents: ['盐引被截', '盐灯熄火'],
    currentRisks: ['账册外泄', '押运线暴露'],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-24',
    chapterTitle: '第二卷列表补并章节',
    chapterOrder: 24,
    volumeTitle: '第二卷',
    milestoneIndex: 2,
  });

  const section = result.sections.find((item) => item.key === 'world_state_delta');

  assert.ok(section, '应生成世界状态 section');
  assert.equal(section.blocks.length, 1);
  assert.equal(countOccurrences(section.blocks[0], '盐引被截'), 1);
  assert.equal(countOccurrences(section.blocks[0], '账册外泄'), 1);
  assert.match(section.blocks[0], /公开事件：盐引被截；盐灯熄火；城门夜封/u);
  assert.match(section.blocks[0], /当前风险：账册外泄；押运线暴露；粮道中断/u);
});

test('buildGenerationContextBundle 只有 milestone 没有当前卷卷级世界状态时不生成当前卷主块', async (t) => {
  const context = createTestEnv('generation-context-world-state-milestone-without-volume-level');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-world-state-milestone-without-volume-level';

  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-1',
    volumeTitle: '第一卷',
    volumeOrder: 1,
    milestoneIndex: null,
    publicEvents: ['第一卷旧案余波'],
    currentRisks: ['第一卷旧债未清'],
  });
  createWorldStateEntry(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: 1,
    publicEvents: ['阶段事件不应单独撑起主块'],
    rumorState: '阶段舆论不应单独进主块',
    currentRisks: ['阶段风险不应单独进主块'],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-25',
    chapterTitle: '第二卷缺卷级条目的里程碑章节',
    chapterOrder: 25,
    volumeTitle: '第二卷',
    milestoneIndex: 1,
  });

  const section = result.sections.find((item) => item.key === 'world_state_delta');

  assert.equal(section, undefined);
  assert.ok(!result.bundle.includes('世界状态：'));
  assert.ok(!result.bundle.includes('阶段事件不应单独撑起主块'));
  assert.ok(!result.bundle.includes('阶段舆论不应单独进主块'));
  assert.ok(!result.bundle.includes('阶段风险不应单独进主块'));
});
