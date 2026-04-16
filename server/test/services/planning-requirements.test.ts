import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPlanningRequirements } from '../../../app/src/lib/planning-requirements.ts';

test('collectPlanningRequirements 在没有 volumeOutline 时只返回章节拍自身约束', () => {
  const result = collectPlanningRequirements({
    chapterBeat: {
      focusCharacter: ' 林冲 ',
      mustAppearCharacters: ['谢无咎', ' 林冲 ', ''],
      availableCharacters: ['柳承业', ' 林冲 ', ''],
    },
  });

  assert.deepEqual(result.requiredEntityNames, ['谢无咎', '林冲']);
  assert.deepEqual(result.availableCharacterNames, ['柳承业', '林冲']);
  assert.deepEqual(result.requiredForeshadowTitles, []);
});

test('collectPlanningRequirements 命中 milestoneIndex 时只合并当前里程碑的实体与伏笔', () => {
  const result = collectPlanningRequirements({
    milestoneIndex: 1,
    chapterBeat: {
      focusCharacter: '林冲',
      mustAppearCharacters: ['谢无咎'],
      availableCharacters: ['柳承业'],
    },
    volumeOutline: {
      foreshadowSeeds: ['血诏真相'],
      requiredEntities: ['镇北司'],
      requiredForeshadows: ['旧案回潮'],
      milestones: [
        {
          title: '第一阶段',
          objective: '',
          conflictUpgrade: '',
          statusShift: '',
          keyEvents: [],
          mustPlant: ['旧债伏笔'],
          mustPayoff: [],
          requiredEntities: ['第一阶段角色'],
          requiredForeshadows: [],
        },
        {
          title: '第二阶段',
          objective: '',
          conflictUpgrade: '',
          statusShift: '',
          keyEvents: [],
          mustPlant: ['承天城引线'],
          mustPayoff: ['旧案回潮'],
          requiredEntities: ['第二阶段角色', '谢无咎'],
          requiredForeshadows: ['阶段回收'],
        },
      ],
    },
  });

  assert.deepEqual(
    result.requiredEntityNames,
    ['谢无咎', '林冲', '镇北司', '第二阶段角色'],
  );
  assert.deepEqual(result.availableCharacterNames, ['柳承业']);
  assert.deepEqual(
    result.requiredForeshadowTitles,
    ['血诏真相', '旧案回潮', '承天城引线', '阶段回收'],
  );
});

test('collectPlanningRequirements 在 milestoneIndex 缺失或越界时会回退到全里程碑聚合并自动去重', () => {
  const result = collectPlanningRequirements({
    milestoneIndex: 99,
    chapterBeat: {
      focusCharacter: ' 林冲 ',
      mustAppearCharacters: ['谢无咎'],
      availableCharacters: ['柳承业'],
    },
    volumeOutline: {
      foreshadowSeeds: ['血诏真相', '血诏真相', '  '],
      requiredEntities: ['镇北司', '林冲'],
      requiredForeshadows: ['旧案回潮', '血诏真相'],
      milestones: [
        {
          title: '第一阶段',
          objective: '',
          conflictUpgrade: '',
          statusShift: '',
          keyEvents: [],
          mustPlant: ['承天城引线'],
          mustPayoff: [],
          requiredEntities: ['第一阶段角色', '谢无咎'],
          requiredForeshadows: [''],
        },
        {
          title: '第二阶段',
          objective: '',
          conflictUpgrade: '',
          statusShift: '',
          keyEvents: [],
          mustPlant: [],
          mustPayoff: ['旧案回潮'],
          requiredEntities: ['第一阶段角色', '柳承业'],
          requiredForeshadows: ['阶段回收'],
        },
      ],
    },
  });

  assert.deepEqual(
    result.requiredEntityNames,
    ['谢无咎', '林冲', '镇北司', '第一阶段角色', '柳承业'],
  );
  assert.deepEqual(result.availableCharacterNames, ['柳承业']);
  assert.deepEqual(
    result.requiredForeshadowTitles,
    ['血诏真相', '旧案回潮', '承天城引线', '阶段回收'],
  );
});
