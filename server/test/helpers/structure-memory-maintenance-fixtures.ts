import type { ServerEnv } from '../../src/config/env.js';
import { createAntagonistAgenda } from '../../src/services/antagonist-agenda-store.js';
import { createQuestionPool } from '../../src/services/question-pool-store.js';
import { createResourceContinuity } from '../../src/services/structured-resource-continuity-store.js';
import { createThreadLedger, createWorldStateEntry } from '../../src/services/structure-memory-store.js';
import {
  createOutline,
  createSummary,
  rebuildVolumeRecaps,
  seedChapter,
  seedForeshadows,
  seedGeneratedJob,
} from './seed-generation-context.js';

function seedBackfillBaseFixture(env: ServerEnv, input: {
  projectId: string;
  preseedQuestionPool: boolean;
  preseedWorldStateEntry: boolean;
}) {
  const { projectId } = input;
  seedChapter(env, {
    projectId,
    chapterId: 'chapter-1',
    chapterTitle: '卷一终章',
    chapterOrder: 1,
    volumeTitle: '第一卷',
    outline: createOutline({
      goal: '林冲从追缉中脱身',
    }),
    summary: createSummary({
      summary: '林冲在追缉压力下暂时脱身，但旧案与寿命代价都压了上来。',
      hook: '官府将继续沿着血诏真相追杀林冲。',
      foreshadowings: ['血诏真相露出一角'],
    }),
    stateChanges: [
      {
        entityName: '林冲',
        field: '寿命',
        oldValue: '十年',
        newValue: '仅剩三年',
      },
      {
        entityName: '镇北司',
        field: '势力',
        oldValue: '按兵不动',
        newValue: '公开追缉林冲',
      },
    ],
  });

  rebuildVolumeRecaps(env, projectId, ['第一卷']);
  seedForeshadows(env, {
    projectId,
    foreshadows: [
      {
        id: 'foreshadow-1',
        title: '血诏真相',
        excerpt: '血诏真相已露出一角',
        notes: '这条线索将牵出旧案',
        status: 'activated',
        sourceChapterId: 'chapter-1',
        sourceChapterTitle: '卷一终章',
      },
    ],
  });

  if (input.preseedQuestionPool) {
    createQuestionPool(env, {
      projectId,
      question: '血诏真相 最终会如何兑现？',
      firstRaisedChapterId: 'chapter-1',
      firstRaisedAt: '第1章《卷一终章》',
      status: 'partial',
    });
  }

  if (input.preseedWorldStateEntry) {
    createWorldStateEntry(env, {
      projectId,
      volumeId: 'volume-1',
      volumeTitle: '第一卷',
      volumeOrder: 1,
      milestoneIndex: null,
      publicEvents: ['卷级世界状态已补过'],
    });
  }

  return {
    projectId,
  };
}

export function seedBackfillFixture(env: ServerEnv) {
  return seedBackfillBaseFixture(env, {
    projectId: 'project-backfill',
    preseedQuestionPool: true,
    preseedWorldStateEntry: true,
  });
}

export function seedBackfillAllNewFixture(env: ServerEnv) {
  return seedBackfillBaseFixture(env, {
    projectId: 'project-backfill-all-new',
    preseedQuestionPool: false,
    preseedWorldStateEntry: false,
  });
}

export function seedGuardFixture(env: ServerEnv) {
  const projectId = 'project-guard';

  seedChapter(env, {
    projectId,
    chapterId: 'chapter-1',
    chapterTitle: '卷一收束',
    chapterOrder: 1,
    volumeTitle: '第一卷',
    outline: createOutline({
      goal: '卷一收束旧案表层',
    }),
    summary: createSummary({
      summary: '卷一表面收束，但血诏真相与林冲的伤势都留下了后患。',
      hook: '真正的报复将在卷二显形。',
      foreshadowings: ['血诏真相', '旧案回潮'],
    }),
  });
  seedChapter(env, {
    projectId,
    chapterId: 'chapter-2',
    chapterTitle: '卷二终章',
    chapterOrder: 2,
    volumeTitle: '第二卷',
    previousChapterId: 'chapter-1',
    previousChapterTitle: '卷一收束',
    outline: createOutline({
      goal: '卷二完成权力改组',
    }),
    summary: createSummary({
      summary: '朝廷改组后，镇北司扩权，卷内局势全面倾斜。',
      hook: '下一步将有人借改组夺权。',
    }),
  });

  seedForeshadows(env, {
    projectId,
    foreshadows: [
      {
        id: 'foreshadow-resolved',
        title: '血诏真相',
        excerpt: '血诏真相终于在卷一浮出水面',
        notes: '公开后会冲击朝局与旧案追查',
        status: 'resolved',
        sourceChapterId: 'chapter-1',
        sourceChapterTitle: '卷一收束',
        resolvedChapterId: 'chapter-1',
        resolvedChapterTitle: '卷一收束',
      },
    ],
  });

  const threadLedger = createThreadLedger(env, {
    projectId,
    name: '旧案主线',
    type: '主线',
    coreQuestion: '血诏真相曝光后谁会被清算',
    currentPhase: '表层真相已出，后续追杀已起',
    lastProgressAt: '第1章《卷一收束》',
    lastProgressChapterId: 'chapter-1',
    lastProgressChapterTitle: '卷一收束',
    lastProgressChapterOrder: 1,
    relatedCharacterNames: ['林冲'],
    relatedForeshadowTitles: ['血诏真相'],
    status: 'dormant',
    audienceHeat: 5,
  });

  const duplicatedAgendaA = createAntagonistAgenda(env, {
    projectId,
    characterName: '谢无咎',
    currentObjective: '继续追缉林冲，逼出血诏余线',
    currentAction: '追缉林冲以逼出血诏真相',
    triggerToStrike: '只要林冲露面就立刻收网',
    ifProtagonistDoesNothing: '继续扩大追杀范围',
    status: 'active',
  });
  const duplicatedAgendaB = createAntagonistAgenda(env, {
    projectId,
    characterName: '谢无咎',
    currentObjective: '继续追缉林冲，逼出血诏余线',
    currentAction: '追缉林冲以逼出血诏真相',
    triggerToStrike: '只要林冲露面就立刻收网',
    ifProtagonistDoesNothing: '继续扩大追杀范围',
    status: 'active',
  });
  const worldStateLinkedAgenda = createAntagonistAgenda(env, {
    projectId,
    characterName: '柳承业',
    publicRole: '督军',
    currentObjective: '借改组夺权',
    currentAction: '准备通过官署调令清洗旧部',
    triggerToStrike: '朝廷正式下令',
    ifProtagonistDoesNothing: '进一步接管镇北司',
    status: 'active',
  });

  const worldStateEntry = createWorldStateEntry(env, {
    projectId,
    volumeId: 'volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    milestoneIndex: null,
    institutionChange: '朝廷改组，镇北司扩权',
  });

  const resourceContinuity = createResourceContinuity(env, {
    projectId,
    resourceType: '伤势',
    ownerCharacterName: '林冲',
    currentState: '重伤未愈',
    performanceImpact: '不能久战',
    continuityRisk: '失血严重',
    status: 'active',
  });

  seedGeneratedJob(env, {
    projectId,
    chapterId: 'chapter-2',
    chapterTitle: '卷二终章',
    generatedText: '林冲毫发无伤，再次全力冲杀追兵，仿佛先前重伤从未存在。',
  });

  return {
    projectId,
    chapterIds: {
      first: 'chapter-1',
      current: 'chapter-2',
    },
    threadLedgerId: threadLedger.id,
    duplicatedAgendaIds: [duplicatedAgendaA.id, duplicatedAgendaB.id],
    worldStateAgendaId: worldStateLinkedAgenda.id,
    worldStateEntryId: worldStateEntry.id,
    resourceContinuityId: resourceContinuity.id,
  };
}
