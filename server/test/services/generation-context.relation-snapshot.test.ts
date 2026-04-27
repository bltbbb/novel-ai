import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationContextBundle } from '../../src/services/generation-context.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import { createEntitySnapshot, createRelationSnapshot, seedEntities } from '../helpers/seed-generation-context.js';

function seedRelationEntities(env: Parameters<typeof seedEntities>[0], projectId: string) {
  seedEntities(env, {
    projectId,
    chapterId: 'chapter-1',
    chapterTitle: '第一章',
    entities: [
      createEntitySnapshot('林冲', {
        description: '被追缉的主角',
        pinned: true,
      }),
      createEntitySnapshot('谢无咎', {
        description: '追缉林冲的反派',
      }),
    ],
  });
}

test('显式关系快照会扩展焦点人物并进入关系 section', async (t) => {
  const context = createTestEnv('generation-context-relation-confirmed');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-relation-confirmed';
  seedRelationEntities(context.env, projectId);

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterTitle: '林冲夜探营帐',
    chapterOrder: 8,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
    relationSnapshot: [
      createRelationSnapshot({
        sourceEntityName: '林冲',
        targetEntityName: '谢无咎',
      }),
    ],
  });

  const relationshipSection = result.sections.find((item) => item.key === 'relationships');

  assert.ok(relationshipSection, '应生成关系 section');
  assert.ok(result.focusEntityNames.includes('林冲'));
  assert.ok(result.focusEntityNames.includes('谢无咎'));
  assert.ok(relationshipSection.blocks.some((block) => block.includes('显式关系真源：林冲 <-> 谢无咎')));
});

test('draft 关系在默认正文上下文中不会进入关系 section，也不会扩展焦点人物', async (t) => {
  const context = createTestEnv('generation-context-relation-draft-blocked');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-relation-draft-blocked';
  seedRelationEntities(context.env, projectId);

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterTitle: '林冲夜探营帐',
    chapterOrder: 8,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
    relationSnapshot: [
      createRelationSnapshot({
        sourceEntityName: '林冲',
        targetEntityName: '谢无咎',
        draft: true,
      }),
    ],
  });

  const relationshipSection = result.sections.find((item) => item.key === 'relationships');

  assert.ok(result.focusEntityNames.includes('林冲'));
  assert.ok(!result.focusEntityNames.includes('谢无咎'));
  assert.ok(!relationshipSection || relationshipSection.blocks.every((block) => !block.includes('显式关系：林冲 <-> 谢无咎')));
});

test('plan 场景打开 allowDraftContext 后，draft 关系会进入上下文并扩展焦点人物', async (t) => {
  const context = createTestEnv('generation-context-relation-draft-allowed');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-relation-draft-allowed';
  seedRelationEntities(context.env, projectId);

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterTitle: '林冲夜探营帐',
    chapterOrder: 8,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
    allowDraftContext: true,
    relationSnapshot: [
      createRelationSnapshot({
        sourceEntityName: '林冲',
        targetEntityName: '谢无咎',
        draft: true,
      }),
    ],
  });

  const relationshipSection = result.sections.find((item) => item.key === 'relationships');

  assert.ok(relationshipSection, '允许草案上下文时应生成关系 section');
  assert.ok(result.focusEntityNames.includes('谢无咎'));
  assert.ok(relationshipSection.blocks.some((block) => block.includes('状态：草案')));
});
