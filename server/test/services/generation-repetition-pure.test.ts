import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAutomaticForbiddenZone,
  runLocalRepetitionChecker,
} from '../../../app/src/lib/generation-repetition-pure.ts';

function createBeat(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'beat-id',
    projectId: 'project-id',
    volumeId: 'volume-id',
    orderInVolume: 1,
    titleHint: '',
    scenePurpose: '',
    focusCharacter: '',
    mustAppearCharacters: [],
    availableCharacters: [],
    mainPlot: '',
    subPlot: '',
    pacing: '',
    hookOut: '',
    noveltyRequirement: '',
    powerDelta: '',
    forbiddenPhrases: [],
    forbiddenScenePatterns: [],
    keyItems: [],
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
    ...overrides,
  };
}

test('buildAutomaticForbiddenZone 会识别高频词、动作模板和场景模板', () => {
  const result = buildAutomaticForbiddenZone([
    '父亲最后说，像潮水，像钩索，像阴影一样的寒意沿着掌心往上爬，他低声低声地摸黑试探，没立刻伸手。',
    '他像被寒意攥住，像被旧案拖回原地，掌心发紧，喉结滚动，仍旧低声摸索试探，没立刻抬手。',
    '林冲像被钉在夜里，像被人扼住喉结，掌心发麻。',
  ]);

  assert.ok(result.phrases.includes('像'));
  assert.ok(result.phrases.includes('低声'));
  assert.ok(result.phrases.includes('掌心'));
  assert.ok(result.actionPatterns.includes('低声'));
  assert.ok(result.actionPatterns.includes('没立刻'));
  assert.ok(result.scenePatterns.includes('父亲总结段'));
  assert.ok(result.scenePatterns.includes('摸黑试探段'));
  assert.ok(result.scenePatterns.includes('长比喻连续堆叠'));
});

test('runLocalRepetitionChecker 会把高频模板、场景复用与章节功能重复提升到高风险', () => {
  const result = runLocalRepetitionChecker({
    currentText:
      '林冲像被夜色扼住，像被寒意钉在原地，掌心发紧，喉结发涩，只能低声试探，没立刻把异物藏起。',
    currentChapterBeat: createBeat({
      scenePurpose: '摸黑试探敌营，确认卷宗去向',
      focusCharacter: '林冲',
    }),
    previousChapterBeats: [
      createBeat({
        id: 'beat-1',
        orderInVolume: 1,
        scenePurpose: '摸黑试探敌营，确认卷宗去向',
        focusCharacter: '林冲',
      }),
      createBeat({
        id: 'beat-2',
        orderInVolume: 2,
        scenePurpose: '摸黑试探敌营，确认卷宗去向',
        focusCharacter: '林冲',
      }),
    ],
    recentChapterTexts: [
      '父亲最后说，像潮水，像钩索，像阴影一样的寒意沿着掌心往上爬，他低声摸黑试探，没立刻伸手。',
      '他像被寒意攥住，像被旧案拖回原地，像被人从背后按住，掌心发紧，喉结滚动，仍旧低声摸索试探，没立刻抬手。',
    ],
  });

  assert.equal(result.severity, 'high');
  assert.ok(result.repeatedPhrases.includes('像'));
  assert.ok(result.repeatedPhrases.includes('低声'));
  assert.ok(result.metaphorTriggers.includes('像'));
  assert.ok(result.repeatedActionPatterns.includes('低声'));
  assert.ok(result.repeatedActionPatterns.includes('没立刻'));
  assert.ok(result.repeatedScenePatterns.includes('摸黑试探段'));
  assert.ok(result.repeatedChapterFunctions.some((item) => item.includes('场景功能与前章重复')));
  assert.ok(result.repeatedChapterFunctions.some((item) => item.includes('焦点角色连续重复')));
  assert.ok(result.suggestions.includes('替换高频词，优先改掉明显 AI 腔触发词。'));
  assert.ok(result.suggestions.includes('调整本章功能分配或焦点角色，拉开与前章的差异。'));
});
