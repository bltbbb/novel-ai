import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationContextBundle } from '../../src/services/generation-context.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import { createEntitySnapshot, seedEntities } from '../helpers/seed-generation-context.js';

function getSection(
  result: Awaited<ReturnType<typeof buildGenerationContextBundle>>,
  key: string,
  label: string,
) {
  const section = result.sections.find((item) => item.key === key);

  if (!section) {
    assert.fail(`应生成${label} section`);
  }

  return section;
}

test('buildGenerationContextBundle 的 focus_entities 主块会保留静态人格内核并过滤 current_* 动态字段', async (t) => {
  const context = createTestEnv('generation-context-entity-current-fields-focus');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-entity-current-fields-focus';

  seedEntities(context.env, {
    projectId,
    chapterId: 'chapter-1',
    chapterTitle: '第1章 旧案初起',
    entities: [
      createEntitySnapshot('林冲', {
        description: '负责追索旧案真相的主视角人物',
        pinned: true,
        fields: {
          static_desire: '翻出旧案真相',
          static_values: '先保同伴，再谈翻案',
          current_goal: '今夜先护送证人出城',
          current_stance: '暂与柳承业结盟',
          current_wound: '右肩箭伤未愈',
          current_disguise: '盐帮脚夫',
        },
        tags: ['主视角', '旧案线'],
      }),
    ],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-2',
    chapterTitle: '第2章 夜渡城门',
    chapterOrder: 2,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
  });

  const section = getSection(result, 'focus_entities', '当前关注实体');

  assert.equal(section.title, '当前关注实体');
  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /^- 林冲（character）/u);
  assert.match(section.blocks[0], /描述：负责追索旧案真相的主视角人物/u);
  assert.match(section.blocks[0], /【人格内核-不可改变】/u);
  assert.match(section.blocks[0], /欲望：翻出旧案真相/u);
  assert.match(section.blocks[0], /价值排序：先保同伴，再谈翻案/u);
  assert.ok(!section.blocks[0].includes('【当前阶段状态】'));
  assert.ok(!section.blocks[0].includes('今夜先护送证人出城'));
  assert.ok(!section.blocks[0].includes('暂与柳承业结盟'));
  assert.ok(!section.blocks[0].includes('右肩箭伤未愈'));
  assert.ok(!section.blocks[0].includes('盐帮脚夫'));
  assert.ok(!result.bundle.includes('今夜先护送证人出城'));
});

test('buildGenerationContextBundle 的 candidate_entities 不再把 current_* 动态字段当作摘要抓手', async (t) => {
  const context = createTestEnv('generation-context-entity-current-fields-candidate');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-entity-current-fields-candidate';

  seedEntities(context.env, {
    projectId,
    chapterId: 'chapter-1',
    chapterTitle: '第1章 暗巷换手',
    entities: [
      createEntitySnapshot('林冲', {
        description: '当前焦点人物',
        pinned: true,
      }),
      createEntitySnapshot('老马', {
        description: '',
        fields: {
          static_desire: '保住送信的孩子',
          current_goal: '先把密钥送出城',
          current_stance: '准备暂避官军耳目',
        },
      }),
    ],
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-2',
    chapterTitle: '第2章 夜审前的交接',
    chapterOrder: 2,
    volumeTitle: '第一卷',
    requiredEntityNames: ['林冲'],
    availableCharacterNames: ['老马'],
  });

  const section = getSection(result, 'candidate_entities', '候选出场人物');

  assert.equal(section.title, '候选出场人物');
  assert.equal(section.blocks.length, 1);
  assert.match(section.blocks[0], /^- 候选人物：老马（character）/u);
  assert.match(section.blocks[0], /当前抓手：欲望：保住送信的孩子/u);
  assert.ok(!section.blocks[0].includes('先把密钥送出城'));
  assert.ok(!section.blocks[0].includes('准备暂避官军耳目'));
  assert.ok(!section.blocks[0].includes('current_goal'));
  assert.ok(!section.blocks[0].includes('current_stance'));
  assert.ok(!result.bundle.includes('先把密钥送出城'));
});
