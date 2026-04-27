process.env.GENERATION_DATA_DIR = 'server/.data';

import { loadServerEnv } from '../config/env.js';
import { upsertGenerationChapterSummary, replaceGenerationStateChanges } from '../services/generation-artifact-store.js';
import { replaceGenerationForeshadows } from '../services/generation-foreshadow-store.js';
import {
  upsertGenerationChapterIndex,
  upsertGenerationEntitiesSnapshot,
  replaceGenerationRelationshipsFromStateChanges,
} from '../services/generation-knowledge-store.js';
import { rebuildGenerationVolumeRecap } from '../services/generation-volume-recap-store.js';
import { createAntagonistAgenda } from '../services/antagonist-agenda-store.js';
import { createPovPermission } from '../services/pov-permission-store.js';
import { createResourceContinuity } from '../services/structured-resource-continuity-store.js';
import {
  createForeshadowPlan,
  createThreadLedger,
  createWorldStateEntry,
} from '../services/structure-memory-store.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';
import type {
  ChapterOutlineDraft,
  ChapterSummaryDraft,
  GenerationEntitySnapshot,
  GenerationForeshadowSnapshot,
  StateChangeDraft,
  StrandType,
} from '../types/ai.js';

const PROJECT_ID = 'p0-audit-structure-sample';
const RECOMMENDED_CHAPTER_ID = 'p0-audit-chapter-009';
const RECOMMENDED_CHAPTER_TITLE = '第9章：子时封门';

const PROJECT_TABLES = [
  'generation_chapter_index',
  'generation_chapter_summaries',
  'generation_state_changes',
  'generation_entities',
  'generation_foreshadows',
  'generation_relationships',
  'generation_jobs',
  'generation_review_metrics',
  'generation_language_qa_metrics',
  'generation_memory_chunks',
  'generation_memory_embeddings',
  'generation_memory_embedding_vec_index',
  'generation_volume_recaps',
  'thread_ledgers',
  'foreshadow_plans',
  'world_state_entries',
  'resource_continuities',
  'pov_permissions',
  'antagonist_agendas',
  'question_pools',
] as const;

function createOutline(overrides: Partial<ChapterOutlineDraft> = {}): ChapterOutlineDraft {
  return {
    goal: overrides.goal ?? '推进当前主线',
    obstacle: overrides.obstacle ?? '外部阻力逐步压近',
    cost: overrides.cost ?? '必须承担额外代价',
    beats: overrides.beats ?? ['推进一次主线动作'],
    timeAnchor: overrides.timeAnchor ?? '入夜',
    chapterTimeSpan: overrides.chapterTimeSpan ?? '一更到子时前',
    gapFromPrevious: overrides.gapFromPrevious ?? '紧接上一章',
    strand: overrides.strand ?? 'quest',
    hookType: overrides.hookType ?? '悬念',
    hookStrength: overrides.hookStrength ?? 'medium',
    immutableFacts: overrides.immutableFacts ?? [],
  };
}

function createSummary(overrides: Partial<ChapterSummaryDraft> = {}): ChapterSummaryDraft {
  return {
    summary: overrides.summary ?? '本章完成一次阶段推进。',
    hook: overrides.hook ?? '后续压力继续逼近。',
    foreshadowings: overrides.foreshadowings ?? [],
  };
}

function seedChapter(
  env: ReturnType<typeof loadServerEnv>,
  input: {
    chapterId: string;
    chapterTitle: string;
    chapterOrder: number;
    volumeTitle: string;
    previousChapterId?: string;
    previousChapterTitle?: string;
    outline: ChapterOutlineDraft;
    summary: ChapterSummaryDraft;
    strand?: StrandType;
    stateChanges?: StateChangeDraft[];
  },
) {
  const stateChanges = input.stateChanges ?? [];

  upsertGenerationChapterIndex(env, {
    projectId: PROJECT_ID,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    chapterOrder: input.chapterOrder,
    volumeTitle: input.volumeTitle,
    previousChapterId: input.previousChapterId,
    previousChapterTitle: input.previousChapterTitle,
    outline: input.outline,
    summary: input.summary,
    strand: input.strand ?? input.outline.strand,
    stateChanges,
  });

  upsertGenerationChapterSummary(env, {
    projectId: PROJECT_ID,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    summary: input.summary,
  });

  replaceGenerationStateChanges(env, {
    projectId: PROJECT_ID,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    stateChanges,
  });

  replaceGenerationRelationshipsFromStateChanges(env, {
    projectId: PROJECT_ID,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    stateChanges,
    summary: input.summary.summary,
  });
}

function clearProjectData(env: ReturnType<typeof loadServerEnv>) {
  const db = getGenerationDatabase(env);

  for (const tableName of PROJECT_TABLES) {
    db.prepare(`DELETE FROM ${tableName} WHERE project_id = ?`).run(PROJECT_ID);
  }
}

function seedEntities(env: ReturnType<typeof loadServerEnv>) {
  const entities: GenerationEntitySnapshot[] = [
    {
      name: '沈砚',
      type: 'character',
      description: '背着灰契追查焚井旧令的主视角角色。',
      fields: {
        static_desire: '抢在封门前拿到第二枚印记',
        static_values: '先守住井口真相，再谈生死代价',
        static_trueNature: '宁肯以伤换路，也不愿把主动权让给顾沉舟',
      },
      tags: ['主角', '焚井线'],
      aliases: [],
      pinned: true,
      draft: false,
    },
    {
      name: '顾沉舟',
      type: 'character',
      description: '井坊监印人，表面维持封门秩序，实则在等第二枚印记认主。',
      fields: {
        static_desire: '把第二枚印记逼到自己手里',
        static_values: '先控局，再取印，再杀人',
      },
      tags: ['反派', '封门礼'],
      aliases: [],
      pinned: true,
      draft: false,
    },
    {
      name: '灰契',
      type: 'item',
      description: '会在前夜时刻回应焚井旧令的钥印碎契。',
      fields: {
        current_state: '井口前会自行发热',
        origin: '焚井旧令的残缺钥印',
      },
      tags: ['核心道具'],
      aliases: [],
      pinned: true,
      draft: false,
    },
    {
      name: '焚井',
      type: 'location',
      description: '旧井口遗迹，前夜封门礼与第二枚印记都指向这里。',
      fields: {
        status: '井口已被封门阵覆盖',
        risk: '子时后封门礼会彻底锁死井口',
      },
      tags: ['核心地点'],
      aliases: [],
      pinned: true,
      draft: false,
    },
    {
      name: '裴照',
      type: 'character',
      description: '替沈砚送回井钥的人，知道顾沉舟布锁的细节。',
      fields: {
        static_desire: '活着把井钥送回焚井',
      },
      tags: ['侧线角色'],
      aliases: [],
      pinned: false,
      draft: false,
    },
  ];

  upsertGenerationEntitiesSnapshot(env, {
    projectId: PROJECT_ID,
    chapterId: RECOMMENDED_CHAPTER_ID,
    chapterTitle: RECOMMENDED_CHAPTER_TITLE,
    entities,
  });
}

function seedForeshadows(env: ReturnType<typeof loadServerEnv>) {
  const foreshadows: GenerationForeshadowSnapshot[] = [
    {
      id: 'p0-audit-foreshadow-gray-seal',
      title: '灰契第二枚印记',
      excerpt: '井壁另一枚印记会在子时前回应灰契。',
      notes: '第二卷必须决定是谁先碰到第二枚印记。',
      status: 'activated',
      sourceChapterId: 'p0-audit-chapter-001',
      sourceChapterTitle: '第1章：灰契示警',
      resolvedChapterId: '',
      resolvedChapterTitle: '',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p0-audit-foreshadow-seal-purpose',
      title: '顾沉舟的封门礼真目的',
      excerpt: '顾沉舟一直在等第二枚印记主动认主。',
      notes: '真正目的不是守井，而是逼沈砚先触印。',
      status: 'planted',
      sourceChapterId: 'p0-audit-chapter-005',
      sourceChapterTitle: '第5章：旧誓回声',
      resolvedChapterId: '',
      resolvedChapterTitle: '',
      updatedAt: new Date().toISOString(),
    },
  ];

  replaceGenerationForeshadows(env, {
    projectId: PROJECT_ID,
    foreshadows,
  });
}

function seedStructureMemory(env: ReturnType<typeof loadServerEnv>) {
  createThreadLedger(env, {
    projectId: PROJECT_ID,
    name: '焚井前夜线',
    type: '主线',
    coreQuestion: '沈砚能否在顾沉舟封门前拿到第二枚印记',
    currentPhase: '封门阵已起，灰契在子时前夜开始回应井壁',
    lastProgressAt: '第8章《第8章：前夜布锁》',
    lastProgressChapterId: 'p0-audit-chapter-008',
    lastProgressChapterTitle: '第8章：前夜布锁',
    lastProgressChapterOrder: 8,
    nextTrigger: '沈砚必须在子时前反破封门礼',
    blockedBy: '顾沉舟掌握旧礼完整步骤',
    relatedCharacterNames: ['沈砚', '顾沉舟', '裴照'],
    relatedForeshadowIds: ['p0-audit-foreshadow-gray-seal'],
    relatedForeshadowTitles: ['灰契第二枚印记'],
    plannedResolveVolume: 2,
    status: 'active',
    audienceHeat: 5,
  });

  createForeshadowPlan(env, {
    projectId: PROJECT_ID,
    foreshadowId: 'p0-audit-foreshadow-gray-seal',
    foreshadowTitle: '灰契第二枚印记',
    type: '回收伏笔',
    importance: 'major',
    plannedActivateVolume: 2,
    plannedResolveVolume: 2,
    activationCondition: '顾沉舟启动封门阵，灰契在井口开始发热',
    resolveCondition: '沈砚在子时前夜反破封门礼并逼出第二枚印记',
    payoffEffect: '确认第二枚印记真正归属，并反揭顾沉舟的布局',
  });

  createWorldStateEntry(env, {
    projectId: PROJECT_ID,
    volumeId: 'p0-audit-volume-1',
    volumeTitle: '第一卷',
    volumeOrder: 1,
    publicEvents: ['灰契会在夜潮前发热', '顾沉舟曾接触前夜封门礼'],
    rumorState: '井坊流言都指向焚井旧令重新启动',
    currentRisks: ['第二枚印记去向不明'],
    knownByCharacterNames: ['沈砚', '顾沉舟'],
  });

  createWorldStateEntry(env, {
    projectId: PROJECT_ID,
    volumeId: 'p0-audit-volume-2',
    volumeTitle: '第二卷',
    volumeOrder: 2,
    publicEvents: ['顾沉舟在前夜前布下封门阵', '沈砚必须先破锁再下井'],
    secretEvents: ['第二枚印记仍在井底回应灰契'],
    rumorState: '井坊都在等谁会先碰到第二枚印记',
    currentRisks: ['顾沉舟的封门礼真目的'],
    knownByCharacterNames: ['沈砚', '顾沉舟', '裴照'],
  });

  createResourceContinuity(env, {
    projectId: PROJECT_ID,
    resourceType: '血印反噬',
    ownerCharacterName: '沈砚',
    currentState: '反噬沿右臂上爬，不能久持灰契',
    performanceImpact: '若强行破阵会先失去握印稳定',
    lastConsumedAt: '第8章《第8章：前夜布锁》',
    recoveryCondition: '必须在子时前用井水压印',
    hiddenCost: '每次强压都会被顾沉舟追踪',
    continuityRisk: '若继续硬扛，顾沉舟会先锁定沈砚气机',
    status: 'active',
  });

  createPovPermission(env, {
    projectId: PROJECT_ID,
    volumeId: 'p0-audit-volume-2',
    volumeTitle: '第二卷',
    chapterId: RECOMMENDED_CHAPTER_ID,
    chapterTitle: RECOMMENDED_CHAPTER_TITLE,
    povCharacterName: '沈砚',
    mustHide: ['顾沉舟其实在等第二枚印记主动认主'],
    canHint: ['顾沉舟故意放慢封门节奏'],
    forbiddenReveal: ['第二枚印记的真正持有人'],
  });

  createAntagonistAgenda(env, {
    projectId: PROJECT_ID,
    characterName: '顾沉舟',
    publicRole: '井坊监印人',
    hiddenAgenda: '借封门礼逼沈砚先触印，再夺走第二枚印记',
    currentObjective: '在沈砚靠近井口前完成封门并逼出灰契回应',
    currentAction: '利用封门阵诱出沈砚血印反噬',
    triggerToStrike: '沈砚在子时前夜主动触印',
    bottomLine: '绝不让第二枚印记先认沈砚',
    resourceBase: '井坊旧礼、人手与封门阵图',
    nextMoveWindow: '子时前一刻',
    intelligenceBlindSpot: '低估裴照已经把井钥送回焚井',
    ifProtagonistDoesNothing: '顾沉舟会在子时后独吞第二枚印记',
    status: 'active',
  });
}

function seedChapters(env: ReturnType<typeof loadServerEnv>) {
  seedChapter(env, {
    chapterId: 'p0-audit-chapter-001',
    chapterTitle: '第1章：灰契示警',
    chapterOrder: 1,
    volumeTitle: '第一卷',
    outline: createOutline({
      goal: '确认灰契为什么会在焚井外自行发热',
      beats: ['沈砚在焚井外试印', '确认井壁还有第二枚印记回应'],
      immutableFacts: ['灰契会在焚井前夜发热'],
      timeAnchor: '黄昏',
    }),
    summary: createSummary({
      summary: '沈砚在焚井外第一次确认灰契会在夜潮前发热，并察觉井壁另一枚印记正在回应。',
      hook: '谁在井壁留下了第二枚印记？',
      foreshadowings: ['灰契第二枚印记'],
    }),
    stateChanges: [
      {
        entityName: '沈砚',
        field: '状态',
        oldValue: '只知焚井旧名',
        newValue: '确认灰契会在焚井前夜发热',
      },
      {
        entityName: '灰契',
        field: '状态',
        oldValue: '沉寂',
        newValue: '夜潮前开始发热',
      },
      {
        entityName: '焚井',
        field: '状态',
        oldValue: '封死旧井',
        newValue: '井壁回应灰契',
      },
    ],
  });

  seedChapter(env, {
    chapterId: 'p0-audit-chapter-005',
    chapterTitle: '第5章：旧誓回声',
    chapterOrder: 5,
    volumeTitle: '第一卷',
    previousChapterId: 'p0-audit-chapter-001',
    previousChapterTitle: '第1章：灰契示警',
    outline: createOutline({
      goal: '查清顾沉舟为什么熟悉焚井前夜旧礼',
      beats: ['翻出井坊旧誓残页', '确认顾沉舟接触过封门礼'],
      immutableFacts: ['顾沉舟掌握过前夜封门礼'],
      timeAnchor: '深夜',
    }),
    summary: createSummary({
      summary: '沈砚在井坊旧库确认顾沉舟掌握过前夜封门礼，同时意识到自己体内血印开始反噬。',
      hook: '顾沉舟为什么没有提前取走第二枚印记？',
      foreshadowings: ['顾沉舟的封门礼真目的'],
    }),
    stateChanges: [
      {
        entityName: '顾沉舟',
        field: '关系',
        oldValue: '暗中监视沈砚',
        newValue: '与沈砚互探底牌',
      },
      {
        entityName: '沈砚',
        field: '血印',
        oldValue: '微烫',
        newValue: '反噬初现',
      },
      {
        entityName: '灰契',
        field: '状态',
        oldValue: '夜潮前开始发热',
        newValue: '与前夜旧礼产生共振',
      },
    ],
  });

  seedChapter(env, {
    chapterId: 'p0-audit-chapter-008',
    chapterTitle: '第8章：前夜布锁',
    chapterOrder: 8,
    volumeTitle: '第二卷',
    previousChapterId: 'p0-audit-chapter-005',
    previousChapterTitle: '第5章：旧誓回声',
    outline: createOutline({
      goal: '在顾沉舟启动封门阵前找到破锁入口',
      beats: ['顾沉舟提前布下封门阵', '裴照带回井钥线索'],
      immutableFacts: ['第二卷必须先破锁再下井'],
      timeAnchor: '一更',
    }),
    summary: createSummary({
      summary: '顾沉舟在前夜前布下封门阵，沈砚确认第二卷必须先破锁再下井，裴照则带回井钥消息。',
      hook: '裴照能否在子时前送回井钥？',
      foreshadowings: ['灰契第二枚印记', '井钥的持有人'],
    }),
    stateChanges: [
      {
        entityName: '顾沉舟',
        field: '状态',
        oldValue: '只掌握旧礼残页',
        newValue: '封门阵已启动',
      },
      {
        entityName: '沈砚',
        field: '血印',
        oldValue: '反噬初现',
        newValue: '反噬沿右臂上爬',
      },
      {
        entityName: '焚井',
        field: '状态',
        oldValue: '井壁回应灰契',
        newValue: '井口被封门阵覆盖',
      },
      {
        entityName: '裴照',
        field: '状态',
        oldValue: '失联',
        newValue: '已带回井钥消息',
      },
    ],
  });

  seedChapter(env, {
    chapterId: RECOMMENDED_CHAPTER_ID,
    chapterTitle: RECOMMENDED_CHAPTER_TITLE,
    chapterOrder: 9,
    volumeTitle: '第二卷',
    previousChapterId: 'p0-audit-chapter-008',
    previousChapterTitle: '第8章：前夜布锁',
    outline: createOutline({
      goal: '沈砚要在子时前夜借顾沉舟的盲区反破封门礼',
      obstacle: '顾沉舟就在焚井口等灰契回应',
      cost: '血印反噬会进一步暴露气机',
      beats: ['顾沉舟守在井口外层', '沈砚准备借裴照送回的井钥反破旧礼'],
      immutableFacts: ['第二枚印记仍在井底回应灰契'],
      timeAnchor: '子时前夜',
    }),
    summary: createSummary({
      summary: '沈砚在子时前夜抵达焚井封门口，决定借顾沉舟的盲区反破封门礼，逼出第二枚印记先回应。',
      hook: '第二枚印记会先回应谁？',
      foreshadowings: ['灰契第二枚印记', '顾沉舟的封门礼真目的'],
    }),
    stateChanges: [
      {
        entityName: '沈砚',
        field: '状态',
        oldValue: '准备破锁下井',
        newValue: '决定在子时前夜反破封门礼',
      },
      {
        entityName: '顾沉舟',
        field: '状态',
        oldValue: '封门阵已启动',
        newValue: '守在井口等灰契先回应',
      },
      {
        entityName: '灰契',
        field: '状态',
        oldValue: '与前夜旧礼产生共振',
        newValue: '在井口前夜剧烈发热',
      },
      {
        entityName: '焚井',
        field: '状态',
        oldValue: '井口被封门阵覆盖',
        newValue: '井底第二枚印记开始回应灰契',
      },
    ],
  });
}

function seedVolumeRecaps(env: ReturnType<typeof loadServerEnv>) {
  rebuildGenerationVolumeRecap(env, {
    projectId: PROJECT_ID,
    volumeTitle: '第一卷',
  });
}

async function main() {
  const env = loadServerEnv();

  clearProjectData(env);
  seedChapters(env);
  seedEntities(env);
  seedForeshadows(env);
  seedStructureMemory(env);
  seedVolumeRecaps(env);

  console.log('P0-0 结构记忆审计样本已写入。');
  console.log(`projectId=${PROJECT_ID}`);
  console.log(`chapterId=${RECOMMENDED_CHAPTER_ID}`);
  console.log(`chapterTitle=${RECOMMENDED_CHAPTER_TITLE}`);
}

void main().catch((error) => {
  console.error('P0-0 结构记忆审计样本写入失败：');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
