import assert from 'node:assert/strict';
import test from 'node:test';
import { createAntagonistAgenda } from '../../src/services/antagonist-agenda-store.js';
import { buildGenerationContextBundle } from '../../src/services/generation-context.js';
import { createQuestionPool } from '../../src/services/question-pool-store.js';
import { createThreadLedger } from '../../src/services/structure-memory-store.js';
import { createTestEnv } from '../helpers/create-test-env.js';
import { createOutline } from '../helpers/seed-generation-context.js';

test('buildGenerationContextBundle 会放宽反派议程的保留上限，并把低优先级条目压成摘要', async (t) => {
  const context = createTestEnv('generation-context-antagonist-agenda-enhancement');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-antagonist-agenda-enhancement';

  createAntagonistAgenda(context.env, {
    projectId,
    characterName: '顾沉舟',
    publicRole: '井坊监印人',
    currentObjective: '逼出灰契真正的持有者',
    currentAction: '利用封门阵逼沈砚触印',
    triggerToStrike: '沈砚靠近井口',
    ifProtagonistDoesNothing: '顾沉舟会在子时后独吞第二枚印记',
    status: 'active',
  });
  createAntagonistAgenda(context.env, {
    projectId,
    characterName: '柳承业',
    publicRole: '监军',
    currentObjective: '借封门混乱切断外援',
    currentAction: '拖慢城门轮换，准备截断退路',
    triggerToStrike: '顾沉舟开始封门',
    ifProtagonistDoesNothing: '柳承业会把封门失控栽到沈砚头上',
    status: 'active',
  });
  createAntagonistAgenda(context.env, {
    projectId,
    characterName: '谢无咎',
    publicRole: '旧案追猎者',
    currentObjective: '趁乱摸清灰契流向',
    currentAction: '先在外围布置接应线',
    triggerToStrike: '封门局势失控',
    ifProtagonistDoesNothing: '谢无咎会顺势接手外圈追踪',
    status: 'active',
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '顾沉舟封门当夜',
    chapterOrder: 9,
    volumeTitle: '第二卷',
    requiredEntityNames: ['顾沉舟'],
    outline: createOutline({
      goal: '柳承业拖慢封门节奏，顾沉舟逼灰契回应',
      beats: ['顾沉舟开始封门', '柳承业放缓轮换', '谢无咎仍在外围观察'],
    }),
  });

  const section = result.sections.find((item) => item.key === 'antagonist_agenda');

  assert.ok(section, '应生成反派议程 section');
  assert.equal(section.blocks.length, 3);
  assert.match(section.blocks[0], /^- 顾沉舟（井坊监印人）/u);
  assert.match(section.blocks[1], /^- 柳承业（监军）/u);
  assert.equal(section.blocks[2], '- 谢无咎（旧案追猎者）：目标：趁乱摸清灰契流向；动作：先在外围布置接应线');
});

test('buildGenerationContextBundle 会让 QuestionPool 以轻量提醒参与 working_memory，而不升成独立主 section', async (t) => {
  const context = createTestEnv('generation-context-question-pool-hint');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-question-pool-hint';

  createThreadLedger(context.env, {
    projectId,
    name: '封门主线',
    type: '主线',
    coreQuestion: '沈砚能否在子时前压住封门局势',
    currentPhase: '封门阵已经启动，第二枚印记开始回应',
    nextTrigger: '沈砚必须在子时前靠近井口',
    blockedBy: '顾沉舟利用封门阵逼灰契认主',
    relatedForeshadowTitles: ['灰契第二枚印记'],
    status: 'active',
    audienceHeat: 5,
  });

  createQuestionPool(context.env, {
    projectId,
    question: '第二枚印记真正会认谁为主？',
    belongsToThreadName: '封门主线',
    currentClue: '顾沉舟故意放慢封门节奏，像在等印记主动回应。',
    expectedRevealWindow: '第2卷',
    finalAnswerSummary: '真正持有者会在封门阵反噬时显形。',
    status: 'open',
  });
  createQuestionPool(context.env, {
    projectId,
    question: '灰契第二枚印记究竟缺了哪一步前置仪轨？',
    belongsToThreadName: '',
    currentClue: '灰契第二枚印记开始发热，但仍未完全认主。',
    expectedRevealWindow: '第2卷',
    finalAnswerSummary: '缺失的是反向认主的那一步。',
    status: 'open',
  });
  createQuestionPool(context.env, {
    projectId,
    question: '多年以前的盐路旧账由谁篡改？',
    belongsToThreadName: '旧案支线',
    currentClue: '目前还没有直接新线索。',
    expectedRevealWindow: '第4卷',
    finalAnswerSummary: '',
    status: 'open',
  });

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 子时封门',
    chapterOrder: 9,
    volumeTitle: '第二卷',
    requiredForeshadowTitles: ['灰契第二枚印记'],
    outline: createOutline({
      goal: '在子时前夜压住封门局势',
      obstacle: '顾沉舟借封门阵逼灰契回应',
      cost: '沈砚必须承担印记反噬',
      beats: ['沈砚靠近井口', '顾沉舟放慢封门节奏', '灰契第二枚印记开始回应'],
    }),
  });

  const workingMemorySection = result.sections.find((item) => item.key === 'working_memory');
  const questionPoolSection = result.sections.find((item) => item.key === 'question_pool');

  assert.ok(workingMemorySection, '应生成工作记忆 section');
  assert.equal(questionPoolSection, undefined);
  assert.ok(
    workingMemorySection.blocks.some((block) => block.includes('问题：第二枚印记真正会认谁为主？')),
    '强命中的未解问题应以完整提醒进入 working_memory',
  );
  assert.ok(
    workingMemorySection.blocks.some((block) => block.includes('未解问题提醒：灰契第二枚印记究竟缺了哪一步前置仪轨？')),
    '后续命中的问题应以摘要形式参与',
  );
  assert.ok(
    workingMemorySection.blocks.every((block) => !block.includes('多年以前的盐路旧账由谁篡改')),
    '无当前章直连的问题不应混入正文主提醒',
  );
});

test('buildGenerationContextBundle 的 working_memory 不再重复注入章节契约，章纲约束应保留给独立 prompt 块', async (t) => {
  const context = createTestEnv('generation-context-working-memory-outline-dedup');
  t.after(async () => {
    await context.dispose();
  });

  const projectId = 'project-working-memory-outline-dedup';

  const result = await buildGenerationContextBundle(context.env, {
    projectId,
    chapterId: 'chapter-9',
    chapterTitle: '第9章 子时封门',
    chapterOrder: 9,
    volumeTitle: '第二卷',
    previousSummary: '上一章里，沈砚已经逼近井口，顾沉舟开始放缓封门节奏。',
    outline: createOutline({
      goal: '压住封门局势',
      obstacle: '顾沉舟逼灰契回应',
      cost: '沈砚必须承担反噬',
      beats: ['沈砚逼近井口', '顾沉舟继续拖慢封门', '灰契开始回应'],
      immutableFacts: ['灰契尚未完全认主'],
    }),
  });

  const workingMemorySection = result.sections.find((item) => item.key === 'working_memory');

  assert.ok(workingMemorySection, '应生成工作记忆 section');
  assert.deepEqual(workingMemorySection.blocks, [
    '- 上章承接\n上一章里，沈砚已经逼近井口，顾沉舟开始放缓封门节奏。',
  ]);
  assert.ok(
    workingMemorySection.blocks.every(
      (block) =>
        !block.includes('本章目标：') &&
        !block.includes('阻力：') &&
        !block.includes('代价：') &&
        !block.includes('Beats：') &&
        !block.includes('不可变事实：'),
    ),
    '工作记忆不应再内联章节契约字段',
  );
});
