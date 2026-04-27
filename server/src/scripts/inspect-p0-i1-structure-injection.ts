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

interface StructureInjectionAuditResult {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  structureMemorySystems: Array<{
    system: string;
    seeded: boolean;
    injectedSectionKey: string | null;
    injectedTitle: string | null;
    blockCount: number;
    sampleBlock: string;
    note: string;
  }>;
  bundleSectionKeys: string[];
}

async function main() {
  const context = createTestEnv('p0-i1-structure-injection');

  try {
    const projectId = 'p0-i1-structure-injection-project';
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
        beats: ['沈砚靠近井口', '顾沉舟放慢封门节奏', '第二枚印记开始回应'],
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
        createEntitySnapshot('沈砚', {
          description: '当前主视角人物',
          pinned: true,
        }),
        createEntitySnapshot('顾沉舟', {
          description: '当前明面对手',
          pinned: true,
        }),
      ],
    });

    seedForeshadows(context.env, {
      projectId,
      foreshadows: [
        {
          id: 'foreshadow-1',
          title: '灰契第二枚印记',
          excerpt: '灰契在井口附近开始发热。',
          notes: '第二枚印记的真正归属仍未揭晓。',
          status: 'activated',
          sourceChapterId: 'chapter-1',
          sourceChapterTitle: '第1章 卷一起点',
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
      lastProgressChapterId: 'chapter-8',
      lastProgressChapterTitle: '第8章 封门前夜',
      lastProgressChapterOrder: 8,
      nextTrigger: '沈砚必须在子时前靠近井口',
      blockedBy: '顾沉舟利用封门阵逼灰契认主',
      relatedCharacterNames: ['沈砚', '顾沉舟'],
      relatedForeshadowTitles: ['灰契第二枚印记'],
      plannedResolveVolume: 2,
      status: 'active',
      audienceHeat: 5,
    });

    createForeshadowPlan(context.env, {
      projectId,
      foreshadowId: 'foreshadow-1',
      foreshadowTitle: '灰契第二枚印记',
      type: '回收伏笔',
      importance: 'major',
      plannedActivateVolume: 2,
      plannedResolveVolume: 2,
      activationCondition: '顾沉舟启动封门阵，灰契在井口开始发热',
      resolveCondition: '确认第二枚印记真正归属',
      payoffEffect: '反揭顾沉舟的布局',
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

    createAntagonistAgenda(context.env, {
      projectId,
      characterName: '顾沉舟',
      publicRole: '井坊监印人',
      currentObjective: '在沈砚靠近井口前完成封门并逼出灰契回应',
      currentAction: '利用封门阵诱出沈砚血印反噬',
      triggerToStrike: '沈砚在子时前夜主动触印',
      ifProtagonistDoesNothing: '顾沉舟会在子时后独吞第二枚印记',
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

    createResourceContinuity(context.env, {
      projectId,
      resourceType: '灰契反噬',
      ownerCharacterName: '沈砚',
      currentState: '血印反噬已经逼近临界点',
      performanceImpact: '若强行触印，沈砚会先被反噬击穿',
      continuityRisk: '封门阵一旦回卷，沈砚会失去主动权',
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
        beats: ['沈砚靠近井口', '顾沉舟放慢封门节奏', '第二枚印记开始回应'],
      }),
    });

    const sectionMap = new Map(result.sections.map((section) => [section.key, section] as const));

    const audit: StructureInjectionAuditResult = {
      projectId,
      chapterId,
      chapterTitle,
      structureMemorySystems: [
        {
          system: 'thread_ledger',
          seeded: true,
          injectedSectionKey: sectionMap.get('thread_ledger')?.key ?? null,
          injectedTitle: sectionMap.get('thread_ledger')?.title ?? null,
          blockCount: sectionMap.get('thread_ledger')?.blocks.length ?? 0,
          sampleBlock: sectionMap.get('thread_ledger')?.blocks[0] ?? '',
          note: '已进入正文 bundle',
        },
        {
          system: 'foreshadow_plan',
          seeded: true,
          injectedSectionKey: sectionMap.get('foreshadow_plan')?.key ?? null,
          injectedTitle: sectionMap.get('foreshadow_plan')?.title ?? null,
          blockCount: sectionMap.get('foreshadow_plan')?.blocks.length ?? 0,
          sampleBlock: sectionMap.get('foreshadow_plan')?.blocks[0] ?? '',
          note: '已进入正文 bundle',
        },
        {
          system: 'world_state',
          seeded: true,
          injectedSectionKey: sectionMap.get('world_state_delta')?.key ?? null,
          injectedTitle: sectionMap.get('world_state_delta')?.title ?? null,
          blockCount: sectionMap.get('world_state_delta')?.blocks.length ?? 0,
          sampleBlock: sectionMap.get('world_state_delta')?.blocks[0] ?? '',
          note: '已进入正文 bundle',
        },
        {
          system: 'question_pool',
          seeded: true,
          injectedSectionKey: null,
          injectedTitle: null,
          blockCount: 0,
          sampleBlock: '',
          note: '未进入 buildGenerationContextBundle；当前只走卷纲/里程碑生成的 questionPoolBundle 链路',
        },
        {
          system: 'antagonist_agenda',
          seeded: true,
          injectedSectionKey: sectionMap.get('antagonist_agenda')?.key ?? null,
          injectedTitle: sectionMap.get('antagonist_agenda')?.title ?? null,
          blockCount: sectionMap.get('antagonist_agenda')?.blocks.length ?? 0,
          sampleBlock: sectionMap.get('antagonist_agenda')?.blocks[0] ?? '',
          note: '已进入正文 bundle',
        },
        {
          system: 'pov_permission',
          seeded: true,
          injectedSectionKey: sectionMap.get('pov_permission')?.key ?? null,
          injectedTitle: sectionMap.get('pov_permission')?.title ?? null,
          blockCount: sectionMap.get('pov_permission')?.blocks.length ?? 0,
          sampleBlock: sectionMap.get('pov_permission')?.blocks[0] ?? '',
          note: '已进入正文 bundle',
        },
        {
          system: 'resource_continuity',
          seeded: true,
          injectedSectionKey: sectionMap.get('resource_continuity')?.key ?? null,
          injectedTitle: sectionMap.get('resource_continuity')?.title ?? null,
          blockCount: sectionMap.get('resource_continuity')?.blocks.length ?? 0,
          sampleBlock: sectionMap.get('resource_continuity')?.blocks[0] ?? '',
          note: '已进入正文 bundle',
        },
      ],
      bundleSectionKeys: result.sections.map((section) => section.key),
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
