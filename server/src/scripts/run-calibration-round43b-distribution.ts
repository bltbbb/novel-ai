import { execSync } from 'node:child_process';
import { loadServerEnv } from '../config/env.js';
import {
  getGenerationDebugContext,
  listGenerationDebugChapterRecords,
} from '../services/generation-debug-store.js';

const SYNTHETIC_TARGETS = [
  {
    label: '旧令追索补位链',
    projectId: 'calibration-project-relationship-2hop-mainchain-map-trail',
    chapterId: 'rel2hop-mainchain-map-trail-chapter-018',
  },
  {
    label: '血契守门补充链',
    projectId: 'calibration-project-relationship-2hop-mainchain-bloodline',
    chapterId: 'rel2hop-mainchain-bloodline-chapter-019',
  },
  {
    label: '朝堂密诏补位链',
    projectId: 'calibration-project-relationship-2hop-mainchain-edict',
    chapterId: 'rel2hop-mainchain-edict-chapter-026',
  },
  {
    label: '一度强信号已足够',
    projectId: 'calibration-project-relationship-2hop-nontrigger-onehop-sufficient',
    chapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-016',
  },
  {
    label: '二跳路径冗余未补充',
    projectId: 'calibration-project-relationship-2hop-nontrigger-redundant',
    chapterId: 'rel2hop-nontrigger-redundant-chapter-019',
  },
  {
    label: '历史关系稀薄',
    projectId: 'calibration-project-relationship-2hop-nontrigger-sparse',
    chapterId: 'rel2hop-nontrigger-sparse-chapter-017',
  },
  {
    label: '一度噪音高且二度不足',
    projectId: 'calibration-project-relationship-2hop-nontrigger-noise',
    chapterId: 'rel2hop-nontrigger-noise-chapter-020',
  },
] as const;

const DEMO_PROJECT_ID = 'demo-project-last-cultivator';

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function formatCountMap(map: Map<string, number>) {
  return Array.from(map.entries())
    .sort((left, right) => left[0].localeCompare(right[0], 'en-US'))
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
}

function runPrerequisiteScripts() {
  for (const command of ['npm run calibration:round43b-context', 'npm run calibration:round43b-nontrigger']) {
    execSync(command, {
      stdio: 'pipe',
      env: {
        ...process.env,
        TSX_DISABLE_CACHE: '1',
      },
    });
  }
}

async function main() {
  runPrerequisiteScripts();

  const env = loadServerEnv();
  const syntheticModeCounts = new Map<string, number>();
  const syntheticCategoryCounts = new Map<string, number>();

  console.log('# 4.3b Distribution');
  console.log('## Synthetic Targets');

  for (const target of SYNTHETIC_TARGETS) {
    const context = await getGenerationDebugContext(env, target.projectId, target.chapterId);

    if (!context) {
      console.log(`- ${target.label}: context=null`);
      continue;
    }

    const mode = context.structuredRelationshipDebug.mode;
    const category = context.structuredRelationshipDebug.nonTriggerCategory;
    incrementCount(syntheticModeCounts, mode);

    if (category) {
      incrementCount(syntheticCategoryCounts, category);
    }

    console.log(
      `- ${target.label}: mode=${mode} reason=${context.structuredRelationshipDebug.reason} nonTrigger=${category ?? 'null'} policy=${context.structuredRelationshipDebug.policy || '暂无'}`,
    );
  }

  console.log('');
  console.log('## Synthetic Summary');
  console.log('### Mode Counts');
  console.log(formatCountMap(syntheticModeCounts) || '- （无）');
  console.log('### Nontrigger Category Counts');
  console.log(formatCountMap(syntheticCategoryCounts) || '- （无）');

  const demoChapterRecords = listGenerationDebugChapterRecords(env, DEMO_PROJECT_ID)
    .filter((record) => record.chapterOrder > 0)
    .sort((left, right) => left.chapterOrder - right.chapterOrder);

  if (demoChapterRecords.length === 0) {
    console.log('');
    console.log('## Demo Summary');
    console.log('- demo 项目不存在或尚未 seed，已跳过。');
    return;
  }

  const demoModeCounts = new Map<string, number>();
  const demoCategoryCounts = new Map<string, number>();

  console.log('');
  console.log('## Demo Summary');

  for (const chapterRecord of demoChapterRecords) {
    const context = await getGenerationDebugContext(env, DEMO_PROJECT_ID, chapterRecord.chapterId);

    if (!context) {
      continue;
    }

    const mode = context.structuredRelationshipDebug.mode;
    const category = context.structuredRelationshipDebug.nonTriggerCategory;
    incrementCount(demoModeCounts, mode);

    if (category) {
      incrementCount(demoCategoryCounts, category);
    }

    console.log(
      `- 第${chapterRecord.chapterOrder}章 ${chapterRecord.chapterTitle}: mode=${mode} reason=${context.structuredRelationshipDebug.reason} nonTrigger=${category ?? 'null'}`,
    );
  }

  console.log('### Mode Counts');
  console.log(formatCountMap(demoModeCounts) || '- （无）');
  console.log('### Nontrigger Category Counts');
  console.log(formatCountMap(demoCategoryCounts) || '- （无）');
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`4.3b 分布统计失败：${message}`);
  process.exitCode = 1;
});
