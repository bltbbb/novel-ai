import { loadServerEnv } from '../config/env.js';
import { listGenerationDebugChapterRecords, getGenerationDebugRetrieval } from '../services/generation-debug-store.js';
import { retrieveGenerationMemoryChunks, type GenerationRetrievedChunk } from '../services/generation-retrieval.js';
import type { LightweightRecallConfig } from '../types/ai.js';

const PROJECT_ID = 'demo-project-last-cultivator';
const SAMPLE_CHAPTER_TITLES = ['第13章：旧坊市线索', '第24章：归炉前夜'] as const;
const RETRIEVAL_LIMIT = 8;
const DISPLAY_LIMIT = 6;

interface RecallPreset {
  key: 'balanced' | 'entity_first' | 'entity_aggressive';
  label: string;
  phraseWeight: number;
  entityWeight: number;
  recencyWeight: number;
}

const RECALL_PRESETS: RecallPreset[] = [
  {
    key: 'balanced',
    label: 'balanced(2/3/1)',
    phraseWeight: 2,
    entityWeight: 3,
    recencyWeight: 1,
  },
  {
    key: 'entity_first',
    label: 'entity_first(1/4/1)',
    phraseWeight: 1,
    entityWeight: 4,
    recencyWeight: 1,
  },
  {
    key: 'entity_aggressive',
    label: 'entity_aggressive(1/5/1)',
    phraseWeight: 1,
    entityWeight: 5,
    recencyWeight: 1,
  },
];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join('、') : '无';
}

function formatScoreBreakdown(item: GenerationRetrievedChunk) {
  const { scoreBreakdown } = item;

  return [
    `sameVolume=${scoreBreakdown.sameVolume}`,
    `phrase=${scoreBreakdown.phrase}`,
    `entity=${scoreBreakdown.entity}`,
    `location=${scoreBreakdown.location}`,
    `recency=${scoreBreakdown.recency}`,
    `chunkKind=${scoreBreakdown.chunkKind}`,
    `embedding=${scoreBreakdown.embedding}`,
  ].join(' | ');
}

function toPresetConfig(base: LightweightRecallConfig, preset: RecallPreset): LightweightRecallConfig {
  return {
    minScore: base.minScore,
    topK: base.topK,
    phraseWeight: preset.phraseWeight,
    entityWeight: preset.entityWeight,
    recencyWeight: preset.recencyWeight,
  };
}

function printHit(item: GenerationRetrievedChunk, index: number) {
  console.log(
    `${index + 1}. sourceType=${item.sourceType} | score=${item.score} | title=${item.title} | chapter=${item.chapterTitle}`,
  );
  console.log(`   matchedTerms=${formatList(item.matchedTerms)} | matchedEntities=${formatList(item.matchedEntityNames)}`);
  console.log(`   breakdown=${formatScoreBreakdown(item)}`);
}

async function main() {
  const env = loadServerEnv();
  const chapterRecords = listGenerationDebugChapterRecords(env, PROJECT_ID);

  if (chapterRecords.length === 0) {
    throw new Error(`未找到 projectId=${PROJECT_ID} 的章节数据，请先执行 npm run seed:calibration`);
  }

  const chapterMap = new Map(chapterRecords.map((record) => [normalizeText(record.chapterTitle), record] as const));
  const baseRecallConfig = env.generationGateConfig.lightweightRecall;

  console.log('# Retrieval Calibration Round2');
  console.log(`projectId: ${PROJECT_ID}`);
  console.log(`samples: ${SAMPLE_CHAPTER_TITLES.join('、')}`);
  console.log(`baseConfig: minScore=${baseRecallConfig.minScore}, topK=${baseRecallConfig.topK}`);
  console.log('');

  for (const chapterTitle of SAMPLE_CHAPTER_TITLES) {
    const chapterRecord = chapterMap.get(normalizeText(chapterTitle));

    if (!chapterRecord) {
      throw new Error(`未找到样本章节：${chapterTitle}`);
    }

    const debugRetrieval = await getGenerationDebugRetrieval(env, PROJECT_ID, chapterRecord.chapterId);

    if (!debugRetrieval) {
      throw new Error(`无法构建样本章节检索上下文：${chapterTitle} (${chapterRecord.chapterId})`);
    }

    console.log(`## 样本章节：${chapterRecord.chapterTitle}`);
    console.log(`chapterId: ${chapterRecord.chapterId}`);
    console.log(`chapterOrder: ${chapterRecord.chapterOrder} | volume: ${chapterRecord.volumeTitle}`);
    console.log(`queryPhrases: ${formatList(debugRetrieval.queryPhrases)}`);
    console.log(`focusEntities: ${formatList(debugRetrieval.focusEntityNames)}`);
    console.log('');

    for (const preset of RECALL_PRESETS) {
      const presetConfig = toPresetConfig(baseRecallConfig, preset);
      const items = await retrieveGenerationMemoryChunks(env, {
        projectId: PROJECT_ID,
        chapterId: chapterRecord.chapterId,
        chapterOrder: chapterRecord.chapterOrder,
        volumeTitle: chapterRecord.volumeTitle,
        queryPhrases: debugRetrieval.queryPhrases,
        focusEntityNames: debugRetrieval.focusEntityNames,
        limit: RETRIEVAL_LIMIT,
        lightweightRecallConfig: presetConfig,
      });

      console.log(`### preset=${preset.label}`);
      console.log(
        `weights: phrase=${presetConfig.phraseWeight}, entity=${presetConfig.entityWeight}, recency=${presetConfig.recencyWeight} | minScore=${presetConfig.minScore}, topK=${presetConfig.topK}`,
      );

      if (items.length === 0) {
        console.log('1. 无命中');
      } else {
        for (const [index, item] of items.slice(0, DISPLAY_LIMIT).entries()) {
          printHit(item, index);
        }
      }

      console.log('');
    }
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Round2 标定执行失败：${message}`);
  process.exitCode = 1;
});
