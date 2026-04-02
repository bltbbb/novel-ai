import { loadServerEnv } from '../config/env.js';
import {
  getGenerationDebugContext,
  getGenerationDebugStructuredRelationshipQuery,
  listGenerationDebugChapterRecords,
} from '../services/generation-debug-store.js';
import type {
  GenerationDebugChapterRecord,
  GenerationDebugContextSection,
  GenerationStructuredRelationshipQueryMode,
} from '../types/ai.js';

const DEFAULT_PROJECT_ID = 'demo-project-last-cultivator';
const MODE_ORDER: GenerationStructuredRelationshipQueryMode[] = ['graph_1hop', 'degraded'];

interface ComparisonSample {
  mode: GenerationStructuredRelationshipQueryMode;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  reason: string;
  focusEntityNames: string[];
  beforeBlocks: string[];
  afterBlocks: string[];
  addedLines: string[];
  removedLines: string[];
  stats: {
    candidateRelationships: number;
    acceptedRelationships: number;
    droppedLowConfidence: number;
  };
}

function resolveProjectId() {
  const raw = process.env.CALIBRATION_PROJECT_ID?.trim();
  return raw || DEFAULT_PROJECT_ID;
}

function compareChapterRecords(left: GenerationDebugChapterRecord, right: GenerationDebugChapterRecord) {
  const leftOrder = left.chapterOrder > 0 ? left.chapterOrder : Number.MIN_SAFE_INTEGER;
  const rightOrder = right.chapterOrder > 0 ? right.chapterOrder : Number.MIN_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return rightOrder - leftOrder;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function getRelationshipBlocks(sections: GenerationDebugContextSection[]) {
  const section = sections.find((item) => item.key === 'relationships');
  return section?.blocks ?? [];
}

function flattenBlockLines(blocks: string[]) {
  return blocks
    .flatMap((block) => block.split('\n').map((line) => line.trim()))
    .filter(Boolean);
}

function buildLineCountMap(lines: string[]) {
  const countMap = new Map<string, number>();

  for (const line of lines) {
    countMap.set(line, (countMap.get(line) ?? 0) + 1);
  }

  return countMap;
}

function diffLines(beforeLines: string[], afterLines: string[]) {
  const beforeCount = buildLineCountMap(beforeLines);
  const afterCount = buildLineCountMap(afterLines);
  const added: string[] = [];
  const removed: string[] = [];

  for (const [line, count] of afterCount.entries()) {
    const previousCount = beforeCount.get(line) ?? 0;

    if (count > previousCount) {
      for (let index = 0; index < count - previousCount; index += 1) {
        added.push(line);
      }
    }
  }

  for (const [line, count] of beforeCount.entries()) {
    const nextCount = afterCount.get(line) ?? 0;

    if (count > nextCount) {
      for (let index = 0; index < count - nextCount; index += 1) {
        removed.push(line);
      }
    }
  }

  return {
    added,
    removed,
  };
}

function modeLabel(mode: GenerationStructuredRelationshipQueryMode) {
  return mode === 'graph_1hop' ? 'graph_1hop（结构化强信号）' : 'degraded（仅弱提示）';
}

function printBlocks(title: string, blocks: string[]) {
  console.log(title);

  if (blocks.length === 0) {
    console.log('(空)');
    return;
  }

  for (const [index, block] of blocks.entries()) {
    console.log(`[block ${index + 1}]`);
    console.log(block);
  }
}

function printLineList(title: string, lines: string[]) {
  console.log(title);
  console.log(lines.length > 0 ? lines.map((line) => `- ${line}`).join('\n') : '- （无）');
}

async function buildComparisonSample(
  env: ReturnType<typeof loadServerEnv>,
  projectId: string,
  chapter: GenerationDebugChapterRecord,
) {
  const relationshipQuery = getGenerationDebugStructuredRelationshipQuery(env, projectId, {
    chapterId: chapter.chapterId,
  });

  if (!relationshipQuery) {
    return null;
  }

  const context = await getGenerationDebugContext(env, projectId, chapter.chapterId);

  if (!context) {
    return null;
  }

  const beforeBlocks: string[] = [];
  const afterBlocks = getRelationshipBlocks(context.sections);
  const { added, removed } = diffLines(beforeBlocks, flattenBlockLines(afterBlocks));

  const sample: ComparisonSample = {
    mode: relationshipQuery.mode,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    chapterOrder: chapter.chapterOrder,
    reason: relationshipQuery.reason,
    focusEntityNames: relationshipQuery.focusEntityNames,
    beforeBlocks,
    afterBlocks,
    addedLines: added,
    removedLines: removed,
    stats: relationshipQuery.stats,
  };

  return sample;
}

async function main() {
  const env = loadServerEnv();
  const projectId = resolveProjectId();
  const chapterRecords = listGenerationDebugChapterRecords(env, projectId).sort(compareChapterRecords);

  if (chapterRecords.length === 0) {
    throw new Error(`未找到 projectId=${projectId} 的章节数据，请先准备样本后再执行。`);
  }

  const sampleByMode = new Map<GenerationStructuredRelationshipQueryMode, ComparisonSample>();

  for (const chapter of chapterRecords) {
    if (sampleByMode.size >= MODE_ORDER.length) {
      break;
    }

    const sample = await buildComparisonSample(env, projectId, chapter);

    if (!sample || sampleByMode.has(sample.mode)) {
      continue;
    }

    sampleByMode.set(sample.mode, sample);
  }

  console.log('# 4.3a Context Relationships 差异对比');
  console.log(`projectId: ${projectId}`);
  console.log(`章节扫描数: ${chapterRecords.length}`);
  console.log('接入前基线定义: Context 的 relationships 层不消费 4.3a 结构化关系（固定为空）。');
  console.log('');

  for (const mode of MODE_ORDER) {
    const sample = sampleByMode.get(mode);

    console.log(`## 模式：${modeLabel(mode)}`);

    if (!sample) {
      console.log('未找到该模式样本章节。');
      console.log('');
      continue;
    }

    console.log(`chapter: 第${sample.chapterOrder}章 ${sample.chapterTitle} (${sample.chapterId})`);
    console.log(`reason: ${sample.reason}`);
    console.log(`focusEntities: ${sample.focusEntityNames.length > 0 ? sample.focusEntityNames.join('、') : '无'}`);
    console.log(
      `stats: candidate=${sample.stats.candidateRelationships}, accepted=${sample.stats.acceptedRelationships}, dropped=${sample.stats.droppedLowConfidence}`,
    );
    console.log(
      `复核接口: /api/runtime/generation-debug/relationship-query?projectId=${projectId}&chapterId=${sample.chapterId}`,
    );
    console.log(`复核接口: /api/runtime/generation-debug/context?projectId=${projectId}&chapterId=${sample.chapterId}`);
    console.log('');
    printBlocks('### before.relationships', sample.beforeBlocks);
    console.log('');
    printBlocks('### after.relationships', sample.afterBlocks);
    console.log('');
    printLineList('### delta.addedLines', sample.addedLines);
    console.log('');
    printLineList('### delta.removedLines', sample.removedLines);
    console.log('');
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`4.3a Context 差异对比失败：${message}`);
  process.exitCode = 1;
});
