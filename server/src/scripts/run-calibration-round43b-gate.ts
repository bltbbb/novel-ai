import { execSync } from 'node:child_process';
import { loadServerEnv } from '../config/env.js';
import {
  getGenerationDebugStructuredRelationshipQuery,
  getGenerationDebugStructuredRelationshipQueryTwoHop,
} from '../services/generation-debug-store.js';

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
    expectedReason: 'no_two_hop_relationship',
  },
  {
    label: '高噪音',
    projectId: 'calibration-project-relationship-2hop-negative-noise',
    chapterId: 'rel2hop-noise-chapter-020',
    entityName: '顾沉舟',
    expectedReason: 'high_noise',
  },
] as const;

function runSeedCommands() {
  execSync('npm run seed:43b-relationship', {
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

async function main() {
  runSeedCommands();

  const env = loadServerEnv();
  let positivePassCount = 0;
  let negativePassCount = 0;

  console.log('# 4.3b Gate Summary');

  console.log('## Positive Cases');
  for (const sample of POSITIVE_CASES) {
    const twoHop = getGenerationDebugStructuredRelationshipQueryTwoHop(env, sample.projectId, {
      chapterId: sample.chapterId,
      entityName: sample.entityName,
    });
    const oneHop = getGenerationDebugStructuredRelationshipQuery(env, sample.projectId, {
      chapterId: sample.chapterId,
      entityName: sample.entityName,
    });

    const passed = Boolean(twoHop && twoHop.mode === 'graph_2hop' && twoHop.paths.length > 0);

    if (passed) {
      positivePassCount += 1;
    }

    console.log(
      `- ${sample.label}: 2hop=${twoHop?.mode ?? 'null'} paths=${twoHop?.paths.length ?? 0} reason=${twoHop?.reason ?? 'null'} | 1hop=${oneHop?.mode ?? 'null'} edges=${oneHop?.edges.length ?? 0} | pass=${passed ? 'yes' : 'no'}`,
    );
  }

  console.log('');
  console.log('## Negative Cases');
  for (const sample of NEGATIVE_CASES) {
    const twoHop = getGenerationDebugStructuredRelationshipQueryTwoHop(env, sample.projectId, {
      chapterId: sample.chapterId,
      entityName: sample.entityName,
    });

    const passed = Boolean(twoHop && twoHop.mode === 'degraded' && twoHop.reason === sample.expectedReason);

    if (passed) {
      negativePassCount += 1;
    }

    console.log(
      `- ${sample.label}: mode=${twoHop?.mode ?? 'null'} reason=${twoHop?.reason ?? 'null'} candidatePaths=${twoHop?.stats.candidatePaths ?? 0} acceptedPaths=${twoHop?.stats.acceptedPaths ?? 0} droppedNoisyPaths=${twoHop?.stats.droppedNoisyPaths ?? 0} | pass=${passed ? 'yes' : 'no'}`,
    );
  }

  const gatePassed = positivePassCount === POSITIVE_CASES.length && negativePassCount === NEGATIVE_CASES.length;

  console.log('');
  console.log('## Gate Decision');
  console.log(`positivePass=${positivePassCount}/${POSITIVE_CASES.length}`);
  console.log(`negativePass=${negativePassCount}/${NEGATIVE_CASES.length}`);
  console.log(`decision=${gatePassed ? 'pass' : 'hold'}`);
  console.log(
    gatePassed
      ? 'next=可进入 4.3b 最小消费实验'
      : 'next=继续补样本或收口规则，再评估是否进入最小消费实验',
  );
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`4.3b 门槛汇总失败：${message}`);
  process.exitCode = 1;
});
