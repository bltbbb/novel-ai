import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPlanningRequirements } from '../../../app/src/lib/planning-requirements.ts';
import { buildGenerationContextBundle } from '../../src/services/generation-context.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import { createEntitySnapshot, seedEntities } from '../helpers/seed-generation-context.js';

test('collectPlanningRequirements 会保留人工 availableCharacters，仅把 must/focus/卷纲要求并入 requiredEntityNames', () => {
  const result = collectPlanningRequirements({
    volumeOutline: {
      foreshadowSeeds: ['旧刀线索'],
      requiredEntities: ['谢无咎', '老马'],
      requiredForeshadows: ['血诏真相'],
      milestones: [
        {
          title: '承天城初探',
          targetChapterCount: 3,
          phaseGoal: '先摸清承天城的旧案入口',
          phaseConflict: '城内势力互相牵制',
          entryState: '林冲初到承天城',
          exitState: '林冲掌握承天城入口',
          phasePacing: '中速推进',
          phaseEmotionShift: '从试探转向压迫',
          phasePOV: '林冲',
          keyTurns: ['找到旧案入口'],
          requiredEntities: ['柳承业'],
          mustPlant: ['承天城密钥'],
          mustPayoff: ['旧债回响'],
          requiredForeshadows: ['城门伏笔'],
          powerCeiling: '不得直接翻盘',
        },
      ],
    },
    milestoneIndex: 0,
    chapterBeat: {
      focusCharacter: '林冲',
      mustAppearCharacters: ['赵云', '谢无咎'],
      availableCharacters: ['老马', '谢无咎', '林冲', '老马'],
    },
  });

  assert.deepEqual(result.requiredEntityNames, ['赵云', '谢无咎', '林冲', '老马', '柳承业']);
  assert.deepEqual(result.availableCharacterNames, ['老马', '谢无咎', '林冲']);
  assert.deepEqual(result.requiredForeshadowTitles, ['旧刀线索', '血诏真相', '承天城密钥', '旧债回响', '城门伏笔']);
});

test('buildGenerationContextBundle 候选出场人物 section 只消费 availableCharacterNames，且不会把焦点人物重新塞回候选列表', async (t) => {
  const context = createTestEnv('planning-requirements-available-characters');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-planning-requirements';

  seedEntities(context.env, {
    projectId,
    chapterId: 'chapter-1',
    chapterTitle: '卷一终章',
    entities: [
      createEntitySnapshot('林冲', {
        description: '当前焦点角色',
        pinned: true,
      }),
      createEntitySnapshot('老马', {
        description: '能分担对话与场面压力的老兵',
      }),
      createEntitySnapshot('谢无咎', {
        description: '可以承担施压与对照功能的反派',
      }),
      createEntitySnapshot('周宁', {
        description: '适合承担侧面观察位的角色',
      }),
      createEntitySnapshot('杜康', {
        description: '适合承担资源交接与对照功能',
      }),
      createEntitySnapshot('沈炼', {
        description: '适合承担额外线索转手任务',
      }),
    ],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '承天城夜审',
    chapterOrder: 9,
    volumeTitle: '第二卷',
    requiredEntityNames: ['林冲'],
    availableCharacterNames: ['老马', '谢无咎', '周宁', '杜康', '沈炼', '林冲', '不存在人物'],
  });

  const section = result.sections.find((item) => item.key === 'candidate_entities');
  const expectedCandidateNames = ['老马', '谢无咎', '周宁', '杜康', '沈炼']
    .filter((name) => !result.focusEntityNames.includes(name));

  assert.ok(section, '应生成候选出场人物 section');
  assert.equal(section.title, '候选出场人物');
  assert.deepEqual(
    section.blocks.map((block) => block.split('\n', 1)[0]),
    expectedCandidateNames.map((name) => `- 候选人物：${name}（character）`),
  );
  assert.ok(!result.bundle.includes('候选人物：林冲'));
  assert.ok(!result.bundle.includes('不存在人物'));
  assert.ok(section.blocks.length > 0);
  assert.ok(result.bundle.includes('候选出场人物：'));
});
