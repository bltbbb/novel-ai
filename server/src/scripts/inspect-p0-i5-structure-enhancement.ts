import { createAntagonistAgenda } from '../services/antagonist-agenda-store.js';
import { buildGenerationContextBundle } from '../services/generation-context.js';
import { createPovPermission } from '../services/pov-permission-store.js';
import { createQuestionPool } from '../services/question-pool-store.js';
import { createResourceContinuity } from '../services/structured-resource-continuity-store.js';
import {
  createForeshadowPlan,
  createThreadLedger,
  createWorldStateEntry,
} from '../services/structure-memory-store.js';
import {
  createEntitySnapshot,
  createOutline,
  createSummary,
  createTestEnv,
  rebuildVolumeRecaps,
  seedChapter,
  seedEntities,
  seedForeshadows,
} from './p0-audit-helpers.js';

interface EnhancementProjection {
  system: string;
  baselineBlockCount: number;
  currentBlockCount: number;
  note: string;
}

interface EnhancementAuditResult {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  projections: EnhancementProjection[];
  currentSections: Array<{
    key: string;
    title: string;
    blockCount: number;
    blocks: string[];
  }>;
  questionPoolHintCount: number;
}

async function main() {
  const context = createTestEnv('p0-i5-structure-enhancement');

  try {
    const projectId = 'p0-i5-structure-enhancement-project';
    const chapterId = 'chapter-9';
    const chapterTitle = '第9章 子时封门';

    seedChapter(context.env, {
      projectId,
      chapterId: 'chapter-1',
      chapterTitle: '第1章 卷一起点',
      chapterOrder: 1,
      volumeTitle: '第一卷',
      outline: createOutline({
        goal: '卷一起点',
        beats: ['沈砚第一次接触灰契'],
      }),
      summary: createSummary({
        summary: '沈砚在卷一起点第一次接触灰契。',
        hook: '灰契的真正归属仍未明。',
      }),
    });
    seedChapter(context.env, {
      projectId,
      chapterId: 'chapter-8',
      chapterTitle: '第8章 封门前夜',
      chapterOrder: 8,
      volumeTitle: '第二卷',
      previousChapterId: 'chapter-1',
      previousChapterTitle: '第1章 卷一起点',
      outline: createOutline({
        goal: '封门前夜完成布置',
        beats: ['沈砚确认第二枚印记仍在回应'],
      }),
      summary: createSummary({
        summary: '沈砚在封门前夜确认井底仍有第二枚印记。',
        hook: '顾沉舟似乎正在等印记自行认主。',
      }),
    });
    seedChapter(context.env, {
      projectId,
      chapterId,
      chapterTitle,
      chapterOrder: 9,
      volumeTitle: '第二卷',
      previousChapterId: 'chapter-8',
      previousChapterTitle: '第8章 封门前夜',
      outline: createOutline({
        goal: '在子时前夜压住封门局势',
        obstacle: '顾沉舟借封门阵逼灰契回应',
        cost: '沈砚必须承担印记反噬',
        beats: ['沈砚靠近井口', '顾沉舟放慢封门节奏', '第二枚印记开始回应', '补给将断'],
      }),
      summary: createSummary({
        summary: '沈砚在子时封门前靠近井口，顾沉舟故意拖慢节奏逼灰契回应。',
        hook: '第二枚印记真正会认谁为主？',
      }),
    });

    seedEntities(context.env, {
      projectId,
      chapterId,
      chapterTitle,
      entities: [
        createEntitySnapshot('沈砚', { description: '当前主视角人物', pinned: true }),
        createEntitySnapshot('顾沉舟', { description: '当前明面对手', pinned: true }),
        createEntitySnapshot('柳承业', { description: '封门当夜的第二阻力', pinned: true }),
      ],
    });

    seedForeshadows(context.env, {
      projectId,
      foreshadows: [
        {
          id: 'foreshadow-a',
          title: '灰契第二枚印记',
          excerpt: '灰契在井口附近开始发热。',
          notes: '第二枚印记的真正归属仍未揭晓。',
          status: 'activated',
          sourceChapterId: 'chapter-1',
          sourceChapterTitle: '第1章 卷一起点',
        },
        {
          id: 'foreshadow-b',
          title: '封门旧印',
          excerpt: '封门旧印仍缺最后一道认印环节。',
          notes: '',
          status: 'activated',
          sourceChapterId: 'chapter-8',
          sourceChapterTitle: '第8章 封门前夜',
        },
        {
          id: 'foreshadow-d',
          title: '城防暗钥',
          excerpt: '城防暗钥仍卡在外圈调度里。',
          notes: '',
          status: 'activated',
          sourceChapterId: 'chapter-8',
          sourceChapterTitle: '第8章 封门前夜',
        },
      ],
    });

    rebuildVolumeRecaps(context.env, projectId, ['第一卷', '第二卷']);

    createThreadLedger(context.env, {
      projectId,
      name: '封门主线',
      type: '主线',
      coreQuestion: '沈砚能否在子时前压住封门局势',
      currentPhase: '封门阵已经启动，第二枚印记开始回应',
      lastProgressAt: '第8章《封门前夜》',
      lastProgressChapterOrder: 8,
      nextTrigger: '沈砚必须在子时前靠近井口',
      blockedBy: '顾沉舟利用封门阵逼灰契认主',
      relatedCharacterNames: ['沈砚', '顾沉舟'],
      relatedForeshadowTitles: ['灰契第二枚印记'],
      plannedResolveVolume: 2,
      status: 'active',
      audienceHeat: 5,
    });
    createThreadLedger(context.env, {
      projectId,
      name: '灰契旁线',
      type: '支线',
      coreQuestion: '第二枚印记什么时候真正认主',
      currentPhase: '第二枚印记开始回应，但仍未完全认主',
      nextTrigger: '灰契第二枚印记必须先通过井口试压',
      relatedForeshadowTitles: ['灰契第二枚印记'],
      status: 'active',
      audienceHeat: 2,
    });
    createThreadLedger(context.env, {
      projectId,
      name: '外围追索',
      type: '阶段线',
      coreQuestion: '外围追索会不会在封门夜里扑上来',
      currentPhase: '谢无咎仍在外围观察',
      nextTrigger: '封门局势一旦失控，外围就会顺势收网',
      relatedCharacterNames: ['沈砚', '顾沉舟'],
      status: 'dormant',
      audienceHeat: 3,
    });
    createThreadLedger(context.env, {
      projectId,
      name: '税印旧账',
      type: '支线',
      coreQuestion: '税印旧账由谁篡改',
      currentPhase: '当前章没有直接推进',
      status: 'active',
      audienceHeat: 2,
    });

    createForeshadowPlan(context.env, {
      projectId,
      foreshadowId: 'foreshadow-a',
      foreshadowTitle: '灰契第二枚印记',
      type: '回收伏笔',
      importance: 'major',
      plannedActivateVolume: 2,
      plannedResolveVolume: 2,
      activationCondition: '顾沉舟启动封门阵，灰契在井口开始发热',
      resolveCondition: '确认第二枚印记真正归属',
      payoffEffect: '反揭顾沉舟的布局',
    });
    createForeshadowPlan(context.env, {
      projectId,
      foreshadowId: 'foreshadow-b',
      foreshadowTitle: '封门旧印',
      type: '主线伏笔',
      importance: 'major',
      plannedResolveVolume: 2,
      resolveCondition: '补齐最后一道认印环节',
    });
    createForeshadowPlan(context.env, {
      projectId,
      foreshadowId: 'foreshadow-c',
      foreshadowTitle: '城门总钥',
      type: '主线伏笔',
      importance: 'major',
      plannedActivateVolume: 2,
      plannedResolveVolume: 3,
      activationCondition: '需要先拿到城防旧印',
      resolveCondition: '确认总钥真正的保管人',
      payoffEffect: '打开城门旧案的最后缺口',
    });
    createForeshadowPlan(context.env, {
      projectId,
      foreshadowId: 'foreshadow-d',
      foreshadowTitle: '城防暗钥',
      type: '支线伏笔',
      importance: 'minor',
      plannedResolveVolume: 3,
      resolveCondition: '确认暗钥对应的外圈调度口',
    });

    createWorldStateEntry(context.env, {
      projectId,
      volumeId: 'volume-1',
      volumeTitle: '第一卷',
      volumeOrder: 1,
      milestoneIndex: null,
      publicEvents: ['灰契第一次被确认会回应井口残纹'],
      currentRisks: ['第二枚印记真实归属未明'],
    });
    createWorldStateEntry(context.env, {
      projectId,
      volumeId: 'volume-2',
      volumeTitle: '第二卷',
      volumeOrder: 2,
      milestoneIndex: null,
      publicEvents: ['封门阵启动前夜，井口开始不稳定回应'],
      rumorState: '顾沉舟正在有意拖慢封门节奏',
      currentRisks: ['若封门失控，第二枚印记可能提前认主'],
    });

    createQuestionPool(context.env, {
      projectId,
      question: '第二枚印记真正会认谁为主？',
      firstRaisedChapterId: chapterId,
      firstRaisedAt: `第9章《${chapterTitle}》`,
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
      belongsToThreadName: '税印旧账',
      currentClue: '目前还没有直接新线索。',
      expectedRevealWindow: '第4卷',
      finalAnswerSummary: '',
      status: 'open',
    });

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
      triggerToStrike: '',
      ifProtagonistDoesNothing: '谢无咎会顺势接手外圈追踪',
      status: 'active',
    });

    createPovPermission(context.env, {
      projectId,
      volumeId: 'volume-2',
      volumeTitle: '第二卷',
      chapterId,
      chapterTitle,
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

    createResourceContinuity(context.env, {
      projectId,
      resourceType: '灰契反噬',
      ownerCharacterName: '沈砚',
      currentState: '血印反噬已经逼近临界点',
      performanceImpact: '若强行触印，沈砚会先被反噬击穿',
      continuityRisk: '封门阵一旦回卷，沈砚会失去主动权',
      riskLevel: 'critical',
      status: 'active',
    });
    createResourceContinuity(context.env, {
      projectId,
      resourceType: '权限',
      ownerCharacterName: '顾沉舟',
      currentState: '封门权限正在被多方质疑',
      performanceImpact: '一旦外圈失手，就无法继续单线封门',
      continuityRisk: '权限链条可能被当场截断',
      riskLevel: 'high',
      status: 'active',
    });
    createResourceContinuity(context.env, {
      projectId,
      resourceType: '证据链',
      ownerCharacterName: '沈砚',
      currentState: '手里只抓到半截旧印证词',
      performanceImpact: '暂时还无法直接坐实顾沉舟',
      continuityRisk: '一旦证人失口，整条证据链会被打回',
      riskLevel: 'medium',
      status: 'active',
    });
    createResourceContinuity(context.env, {
      projectId,
      resourceType: '物资',
      ownerCharacterName: '老马',
      currentState: '补给已经明显吃紧',
      performanceImpact: '再拖下去队伍就会断供',
      continuityRisk: '一旦转移失败就会直接缺粮',
      riskLevel: 'high',
      status: 'active',
    });

    const result = await buildGenerationContextBundle(context.env, {
      projectId,
      chapterId,
      chapterTitle,
      chapterOrder: 9,
      volumeTitle: '第二卷',
      requiredEntityNames: ['沈砚'],
      requiredForeshadowTitles: ['灰契第二枚印记'],
      outline: createOutline({
        goal: '在子时前夜压住封门局势',
        obstacle: '顾沉舟借封门阵逼灰契回应',
        cost: '沈砚必须承担印记反噬',
        beats: ['沈砚靠近井口', '顾沉舟放慢封门节奏', '第二枚印记开始回应', '补给将断'],
      }),
    });

    const sectionMap = new Map(result.sections.map((section) => [section.key, section] as const));
    const workingMemoryBlocks = sectionMap.get('working_memory')?.blocks ?? [];
    const questionPoolHintCount = workingMemoryBlocks.filter((block) => block.includes('未解问题提醒')).length;

    const audit: EnhancementAuditResult = {
      projectId,
      chapterId,
      chapterTitle,
      projections: [
        {
          system: 'thread_ledger',
          baselineBlockCount: 2,
          currentBlockCount: sectionMap.get('thread_ledger')?.blocks.length ?? 0,
          note: '基线规则下 `heat=2` 的直命中 active 旁线不会进入；当前已放宽为 3 条',
        },
        {
          system: 'foreshadow_plan',
          baselineBlockCount: 3,
          currentBlockCount: sectionMap.get('foreshadow_plan')?.blocks.length ?? 0,
          note: '基线规则下未挂 active 事实的 `major` 计划不会进入；当前已放宽为 4 条',
        },
        {
          system: 'world_state_delta',
          baselineBlockCount: 2,
          currentBlockCount: sectionMap.get('world_state_delta')?.blocks.length ?? 0,
          note: '当前卷强保留口径维持不变，本轮增强不追求额外放量',
        },
        {
          system: 'resource_continuity',
          baselineBlockCount: 3,
          currentBlockCount: sectionMap.get('resource_continuity')?.blocks.length ?? 0,
          note: '基线规则下“补给将断”的非焦点高风险物资条目会被旧阈值挡掉；当前已能进入正文并压成摘要',
        },
        {
          system: 'antagonist_agenda',
          baselineBlockCount: 2,
          currentBlockCount: sectionMap.get('antagonist_agenda')?.blocks.length ?? 0,
          note: '当前已放宽到 3 条，后排条目用摘要形式补位',
        },
        {
          system: 'pov_permission',
          baselineBlockCount: 2,
          currentBlockCount: sectionMap.get('pov_permission')?.blocks.length ?? 0,
          note: '当前已放宽到 3 条，低优先级视角压成摘要行',
        },
        {
          system: 'question_pool_hint',
          baselineBlockCount: 0,
          currentBlockCount: questionPoolHintCount,
          note: '基线口径下 QuestionPool 不参与正文主 bundle；当前已以轻量提醒并入 working_memory',
        },
      ],
      currentSections: [
        'working_memory',
        'thread_ledger',
        'foreshadow_plan',
        'antagonist_agenda',
        'pov_permission',
        'world_state_delta',
        'resource_continuity',
      ]
        .map((key) => sectionMap.get(key))
        .filter((section): section is NonNullable<typeof section> => Boolean(section))
        .map((section) => ({
          key: section.key,
          title: section.title,
          blockCount: section.blocks.length,
          blocks: section.blocks,
        })),
      questionPoolHintCount,
    };

    console.log(JSON.stringify(audit, null, 2));
  } finally {
    await context.dispose();
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
