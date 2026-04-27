import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationContextBundle } from '../../src/services/generation-context.js';
import { createPovPermission } from '../../src/services/pov-permission-store.js';
import { createTestEnv } from '../helpers/create-test-env.js';

test('buildGenerationContextBundle 会按 chapter > milestone > volume 合并同视角信息权限，并保留其他视角的卷级约束', async (t) => {
  const context = createTestEnv('generation-context-pov-permission-canonical');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-pov-permission-canonical';

  createPovPermission(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    povCharacterName: '沈砚',
    mustHide: ['卷级秘密'],
    canHint: ['卷级暗示'],
    forbiddenReveal: ['卷级揭晓禁令'],
  });
  createPovPermission(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    milestoneIndex: 1,
    povCharacterName: '沈砚',
    mustHide: ['里程碑秘密'],
    canHint: ['里程碑暗示'],
  });
  createPovPermission(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    milestoneIndex: 1,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 子时封门',
    povCharacterName: '沈砚',
    mustHide: ['章节秘密'],
    forbiddenReveal: ['章节揭晓禁令'],
  });
  createPovPermission(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    povCharacterName: '顾沉舟',
    mustHide: ['顾沉舟卷级秘密'],
    canHint: ['顾沉舟可以放缓节奏'],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 子时封门',
    chapterOrder: 9,
    volumeTitle: '第二卷',
    milestoneIndex: 1,
  });

  const section = result.sections.find((item) => item.key === 'pov_permission');

  assert.ok(section, '应生成信息控制 section');
  assert.equal(section.blocks.length, 2);
  assert.match(section.blocks[0], /^- 沈砚 \/ 章节 第9章 子时封门/u);
  assert.match(section.blocks[0], /禁止透露：章节秘密；里程碑秘密；卷级秘密/u);
  assert.match(section.blocks[0], /允许暗示：里程碑暗示；卷级暗示/u);
  assert.match(section.blocks[0], /本单元禁止揭晓：章节揭晓禁令；卷级揭晓禁令/u);
  assert.match(section.blocks[0], /补充：第二卷 \/ 里程碑 1补充：禁止透露：里程碑秘密；允许暗示：里程碑暗示/u);
  assert.match(section.blocks[0], /第二卷补充：禁止透露：卷级秘密；允许暗示：卷级暗示；禁止揭晓：卷级揭晓禁令/u);
  assert.match(section.blocks[1], /^- 顾沉舟 \/ 第二卷/u);
  assert.match(section.blocks[1], /禁止透露：顾沉舟卷级秘密/u);
  assert.match(section.blocks[1], /允许暗示：顾沉舟可以放缓节奏/u);
});

test('buildGenerationContextBundle 会放宽信息控制的保留上限，并把低优先级视角压成摘要', async (t) => {
  const context = createTestEnv('generation-context-pov-permission-enhancement');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-pov-permission-enhancement';

  createPovPermission(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    chapterId: 'chapter-9',
    chapterTitle: '第9章 子时封门',
    povCharacterName: '沈砚',
    mustHide: ['顾沉舟其实在等第二枚印记主动认主'],
    canHint: ['顾沉舟故意放慢封门节奏'],
    forbiddenReveal: ['第二枚印记的真正持有人'],
  });
  createPovPermission(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    povCharacterName: '顾沉舟',
    mustHide: ['顾沉舟并未真正封死退路'],
    canHint: ['顾沉舟仍在等外圈回信'],
  });
  createPovPermission(context.env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    povCharacterName: '柳承业',
    mustHide: ['柳承业已经预留切断外援的后手'],
    canHint: ['柳承业会继续拖慢轮换'],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 子时封门',
    chapterOrder: 9,
    volumeTitle: '第二卷',
    milestoneIndex: 1,
  });

  const section = result.sections.find((item) => item.key === 'pov_permission');

  assert.ok(section, '应生成信息控制 section');
  assert.equal(section.blocks.length, 3);
  assert.match(section.blocks[0], /^- 沈砚 \/ 章节 第9章 子时封门/u);
  assert.match(section.blocks[1], /^- 顾沉舟 \/ 第二卷/u);
  assert.match(section.blocks[2], /^- 柳承业 \/ 第二卷：禁止透露：/u);
  assert.match(section.blocks[2], /允许暗示：/u);
});
