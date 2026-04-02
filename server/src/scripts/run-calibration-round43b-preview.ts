import { execSync } from 'node:child_process';
import { loadServerEnv } from '../config/env.js';
import { getGenerationDebugStructuredRelationshipConsumptionPreview } from '../services/generation-debug-store.js';

const POSITIVE_CASES = [
  {
    label: '师承敌对链',
    projectId: 'calibration-project-relationship-2hop-master-enemy',
    chapterId: 'rel2hop-master-enemy-chapter-031',
    entityName: '林冲',
  },
  {
    label: '血脉守门链',
    projectId: 'calibration-project-relationship-2hop-lineage-gate',
    chapterId: 'rel2hop-lineage-gate-chapter-029',
    entityName: '苏照夜',
  },
  {
    label: '地图追索链',
    projectId: 'calibration-project-relationship-2hop-map-trail',
    chapterId: 'rel2hop-map-trail-chapter-033',
    entityName: '顾沉舟',
  },
] as const;

const NEGATIVE_CASES = [
  {
    label: '边不足',
    projectId: 'calibration-project-relationship-2hop-negative-empty',
    chapterId: 'rel2hop-empty-chapter-018',
    entityName: '顾沉舟',
  },
  {
    label: '高噪音',
    projectId: 'calibration-project-relationship-2hop-negative-noise',
    chapterId: 'rel2hop-noise-chapter-020',
    entityName: '顾沉舟',
  },
] as const;

function runSeedCommands() {
  execSync('npm run calibration:round43b-expansion', {
    stdio: 'inherit',
    env: {
      ...process.env,
      TSX_DISABLE_CACHE: '1',
    },
  });
  execSync('npm run seed:43b-relationship-negative', {
    stdio: 'inherit',
    env: {
      ...process.env,
      TSX_DISABLE_CACHE: '1',
    },
  });
}

function printPreviewCase(
  title: string,
  preview: NonNullable<ReturnType<typeof getGenerationDebugStructuredRelationshipConsumptionPreview>>,
) {
  console.log(`- ${title}: mode=${preview.mode} reason=${preview.reason} blocks=${preview.blocks.length} acceptedPaths=${preview.stats.acceptedPaths} droppedNoisyPaths=${preview.stats.droppedNoisyPaths}`);
  for (const block of preview.blocks) {
    console.log(`  ${block.replace(/\n/g, ' | ')}`);
  }
}

async function main() {
  runSeedCommands();

  const env = loadServerEnv();
  let positivePassCount = 0;
  let negativePassCount = 0;

  console.log('# 4.3b Preview Consumption');
  console.log('## Positive Cases');

  for (const sample of POSITIVE_CASES) {
    const preview = getGenerationDebugStructuredRelationshipConsumptionPreview(env, sample.projectId, {
      chapterId: sample.chapterId,
      entityName: sample.entityName,
    });

    if (!preview) {
      console.log(`- ${sample.label}: preview=null`);
      continue;
    }

    const passed = preview.mode === 'graph_2hop'
      && preview.injectionLayer === 'relationships_experimental_2hop'
      && preview.blocks.length >= 2;

    if (passed) {
      positivePassCount += 1;
    }

    printPreviewCase(sample.label, preview);
  }

  console.log('');
  console.log('## Negative Cases');

  for (const sample of NEGATIVE_CASES) {
    const preview = getGenerationDebugStructuredRelationshipConsumptionPreview(env, sample.projectId, {
      chapterId: sample.chapterId,
      entityName: sample.entityName,
    });

    if (!preview) {
      console.log(`- ${sample.label}: preview=null`);
      continue;
    }

    const passed = preview.mode === 'degraded' && preview.blocks.length >= 2;

    if (passed) {
      negativePassCount += 1;
    }

    printPreviewCase(sample.label, preview);
  }

  console.log('');
  console.log('## Preview Decision');
  console.log(`positivePass=${positivePassCount}/${POSITIVE_CASES.length}`);
  console.log(`negativePass=${negativePassCount}/${NEGATIVE_CASES.length}`);
  console.log(`decision=${positivePassCount === POSITIVE_CASES.length && negativePassCount === NEGATIVE_CASES.length ? 'pass' : 'hold'}`);
  console.log(
    positivePassCount === POSITIVE_CASES.length && negativePassCount === NEGATIVE_CASES.length
      ? 'next=可进入 4.3b 主链接入评估'
      : 'next=继续补充 preview 样本或收口降级规则',
  );
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`4.3b 最小消费实验失败：${message}`);
  process.exitCode = 1;
});
