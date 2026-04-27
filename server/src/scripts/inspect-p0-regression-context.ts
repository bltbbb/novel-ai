import { buildGenerationContextBundle } from '../services/generation-context.js';
import {
  createForeshadowPlan,
  createWorldStateEntry,
} from '../services/structure-memory-store.js';
import { createResourceContinuity } from '../services/structured-resource-continuity-store.js';
import {
  createEntitySnapshot,
  createOutline,
  createTestEnv,
  seedChapter,
  seedEntities,
  seedForeshadows,
} from './p0-audit-helpers.js';

interface ScenarioOutput {
  key: string;
  title: string;
  projectId: string;
  chapterId: string;
  sectionSummaries: Array<{
    key: string;
    title: string;
    blockCount: number;
    blocks: string[];
  }>;
  bundle: string;
}

function pickSections(
  result: Awaited<ReturnType<typeof buildGenerationContextBundle>>,
  keys: string[],
) {
  return keys
    .map((key) => result.sections.find((section) => section.key === key))
    .filter((section): section is NonNullable<typeof section> => Boolean(section))
    .map((section) => ({
      key: section.key,
      title: section.title,
      blockCount: section.blocks.length,
      blocks: section.blocks,
    }));
}

async function inspectEntityScenario(): Promise<ScenarioOutput> {
  const context = createTestEnv('p0-5-entity');

  try {
    const projectId = 'p0-5-entity-project';
    const chapterId = 'p0-5-entity-chapter';

    seedEntities(context.env, {
      projectId,
      chapterId: 'chapter-1',
      chapterTitle: '第1章 旧版实体',
      entities: [
        createEntitySnapshot('林冲', {
          description: '旧运行态对林冲的补充描述',
          fields: {
            static_values: '先护住证人，再谈翻案',
            static_role: '被追缉的军中旧将',
          },
          tags: ['旧案线'],
          aliases: ['豹子头'],
        }),
      ],
    });

    const result = await buildGenerationContextBundle(context.env, {
      projectId,
      chapterId,
      chapterTitle: '第2章 新版实体',
      chapterOrder: 2,
      volumeTitle: '第一卷',
      requiredEntityNames: ['林冲'],
      entitySnapshot: [
        {
          name: '林冲',
          type: 'character',
          description: '设定库正式描述',
          fields: {
            static_desire: '翻出旧案真相',
          },
          tags: ['正式设定'],
          aliases: [],
          pinned: true,
          draft: false,
        },
      ],
    });

    return {
      key: 'entity',
      title: '实体 winner + supplement',
      projectId,
      chapterId,
      sectionSummaries: pickSections(result, ['focus_entities']),
      bundle: result.bundle,
    };
  } finally {
    await context.dispose();
  }
}

async function inspectForeshadowScenario(): Promise<ScenarioOutput> {
  const context = createTestEnv('p0-5-foreshadow');

  try {
    const projectId = 'p0-5-foreshadow-project';
    const chapterId = 'p0-5-foreshadow-chapter';

    seedForeshadows(context.env, {
      projectId,
      foreshadows: [
        {
          id: 'generation-foreshadow-old',
          title: '旧印缺页',
          excerpt: '',
          notes: '旧运行态备注里补充了缺页曾被火漆封存。',
          status: 'activated',
          sourceChapterId: 'chapter-1',
          sourceChapterTitle: '第1章 埋设',
          resolvedChapterTitle: '第8章 回响',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    });

    createForeshadowPlan(context.env, {
      projectId,
      foreshadowId: 'generation-foreshadow-old',
      foreshadowTitle: '旧印缺页',
      type: '回收伏笔',
      importance: 'major',
      plannedActivateVolume: 2,
      plannedResolveVolume: 2,
      activationCondition: '对账桌上出现原页痕迹',
      resolveCondition: '确认缺页真正去向',
      payoffEffect: '旧案证据链重新闭合',
    });

    const result = await buildGenerationContextBundle(context.env, {
      projectId,
      chapterId,
      chapterTitle: '第9章 对账当夜',
      chapterOrder: 9,
      volumeTitle: '第二卷',
      preferStoredForeshadows: true,
      requiredForeshadowTitles: ['旧印缺页'],
      outline: createOutline({
        goal: '把缺页之谜推到对账桌正面',
        beats: ['旧印缺页开始被当场追问'],
      }),
      foreshadowSnapshot: [
        {
          id: 'manual-foreshadow-new',
          title: '旧印缺页',
          excerpt: '正式伏笔摘要',
          notes: '',
          status: 'activated',
          sourceChapterId: '',
          sourceChapterTitle: '',
          updatedAt: '2026-04-16T00:00:00.000Z',
        },
      ],
    });

    return {
      key: 'foreshadow',
      title: '伏笔 winner + supplement',
      projectId,
      chapterId,
      sectionSummaries: pickSections(result, ['working_memory', 'foreshadow_plan']),
      bundle: result.bundle,
    };
  } finally {
    await context.dispose();
  }
}

async function inspectWorldStateScenario(): Promise<ScenarioOutput> {
  const context = createTestEnv('p0-5-world-state');

  try {
    const projectId = 'p0-5-world-state-project';
    const chapterId = 'p0-5-world-state-chapter';

    createWorldStateEntry(context.env, {
      projectId,
      volumeId: 'volume-1',
      volumeTitle: '第一卷',
      volumeOrder: 1,
      milestoneIndex: null,
      publicEvents: ['第一卷旧案余波'],
      currentRisks: ['第一卷旧债未清'],
    });
    createWorldStateEntry(context.env, {
      projectId,
      volumeId: 'volume-2',
      volumeTitle: '第二卷',
      volumeOrder: 2,
      milestoneIndex: null,
      publicEvents: ['卷级公开震荡', '两路都提到的风声'],
      secretEvents: ['卷级暗线推进'],
      institutionChange: '卷级制度变化仍在生效',
      rumorState: '卷级舆论不应保留',
      currentRisks: ['卷级风险仍在扩大', '两路都提到的风声'],
    });
    createWorldStateEntry(context.env, {
      projectId,
      volumeId: 'volume-2',
      volumeTitle: '第二卷',
      volumeOrder: 2,
      milestoneIndex: 1,
      publicEvents: ['阶段覆盖公开事件', '两路都提到的风声'],
      secretEvents: ['阶段暗线推进'],
      institutionChange: '',
      rumorState: '阶段舆论接手当前态势',
      currentRisks: ['阶段新增风险', '两路都提到的风声'],
    });

    const result = await buildGenerationContextBundle(context.env, {
      projectId,
      chapterId,
      chapterTitle: '第23章 里程碑冲突章节',
      chapterOrder: 23,
      volumeTitle: '第二卷',
      milestoneIndex: 1,
    });

    return {
      key: 'world_state',
      title: '世界状态 canonical 合并',
      projectId,
      chapterId,
      sectionSummaries: pickSections(result, ['world_state_delta']),
      bundle: result.bundle,
    };
  } finally {
    await context.dispose();
  }
}

async function inspectResourceScenario(): Promise<ScenarioOutput> {
  const context = createTestEnv('p0-5-resource');

  try {
    const projectId = 'p0-5-resource-project';
    const chapterId = 'chapter-2';

    seedChapter(context.env, {
      projectId,
      chapterId: 'chapter-1',
      chapterTitle: '第1章 雨夜疗伤',
      chapterOrder: 1,
      volumeTitle: '第一卷',
      stateChanges: [
        {
          entityName: '林冲',
          field: '伤药',
          oldValue: '还剩半包',
          newValue: '伤药见底，只够再撑一回',
        },
      ],
    });

    seedChapter(context.env, {
      projectId,
      chapterId,
      chapterTitle: '第2章 夜渡荒河',
      chapterOrder: 2,
      volumeTitle: '第一卷',
      previousChapterId: 'chapter-1',
      previousChapterTitle: '第1章 雨夜疗伤',
    });

    createResourceContinuity(context.env, {
      projectId,
      resourceType: '伤药',
      ownerCharacterName: '林冲',
      currentState: '伤药见底，只够再撑一回',
      performanceImpact: '下一场硬战前无法再完整处理伤口',
      continuityRisk: '若继续失血，战力会明显下滑',
      riskLevel: 'critical',
      status: 'active',
    });
    createResourceContinuity(context.env, {
      projectId,
      resourceType: '银钱',
      ownerCharacterName: '柳承业',
      currentState: '手里只剩一笔过路钱',
      performanceImpact: '无法再额外收买城门口的差役',
      continuityRisk: '一旦被盯上就周转不开',
      riskLevel: 'high',
      status: 'active',
    });
    createResourceContinuity(context.env, {
      projectId,
      resourceType: '物资',
      ownerCharacterName: '周青',
      currentState: '备用物资已经被抽走大半',
      performanceImpact: '队伍转场时会明显拖慢脚步',
      continuityRisk: '下一次转移可能暴露补给线',
      riskLevel: 'medium',
      status: 'active',
    });

    const result = await buildGenerationContextBundle(context.env, {
      projectId,
      chapterId,
      chapterTitle: '第2章 夜渡荒河',
      chapterOrder: 2,
      volumeTitle: '第一卷',
      requiredEntityNames: ['林冲', '柳承业', '周青'],
    });

    return {
      key: 'resource',
      title: '资源连续性主块 + 运行态补充 + 摘要压缩',
      projectId,
      chapterId,
      sectionSummaries: pickSections(result, ['resource_continuity']),
      bundle: result.bundle,
    };
  } finally {
    await context.dispose();
  }
}

async function main() {
  const outputs = await Promise.all([
    inspectEntityScenario(),
    inspectForeshadowScenario(),
    inspectWorldStateScenario(),
    inspectResourceScenario(),
  ]);

  console.log(JSON.stringify(outputs, null, 2));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
