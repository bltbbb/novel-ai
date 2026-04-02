import { loadServerEnv } from '../config/env.js';
import { createEmbeddings } from '../services/openai.js';

const QUERY_TEXT = '炼器宗钥印 归炉井';

const SAMPLE_CHUNKS = [
  {
    id: 'calibration-vector-lexical',
    label: 'lexical 对照',
    text: '林冲确认炼器宗钥印会在归炉井前发光，钥印与井口禁制同时震鸣。',
  },
  {
    id: 'calibration-vector-semantic',
    label: '弱语义相关',
    text: '那枚失传门派留下的通行残券指向一处废弃工坊旧址，只能证明凭证与旧门遗产有关，但没有出现即时回应或开启迹象。',
  },
  {
    id: 'calibration-vector-vectoronly',
    label: '目标 vector-only',
    text: '那枚旧门凭证靠近井状遗迹入口时，封闭多年的通行纹路忽然泛起回声般的共鸣，像是在识别来者身份并尝试解开入口锁闭。',
  },
] as const;

function countNonZero(values: number[]) {
  return values.filter((value) => value !== 0).length;
}

function hasInvalidNumber(values: number[]) {
  return values.some((value) => Number.isNaN(value) || !Number.isFinite(value));
}

function computeL2Norm(values: number[]) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function computeMin(values: number[]) {
  return values.length > 0 ? Math.min(...values) : null;
}

function computeMax(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function computeDotProduct(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return null;
  }

  let dot = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
  }

  return dot;
}

function computeCosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return null;
  }

  const dot = computeDotProduct(left, right);

  if (dot === null) {
    return null;
  }

  const leftNorm = computeL2Norm(left);
  const rightNorm = computeL2Norm(right);

  if (leftNorm <= 0 || rightNorm <= 0) {
    return null;
  }

  return dot / (leftNorm * rightNorm);
}

function formatNumber(value: number | null, digits = 6) {
  return value === null ? 'null' : value.toFixed(digits);
}

function printVectorStats(label: string, vector: number[]) {
  const preview = vector.slice(0, 8).map((value) => value.toFixed(6)).join(', ');
  const l2Norm = computeL2Norm(vector);
  const nonZeroCount = countNonZero(vector);

  console.log(`## ${label}`);
  console.log(`dimension: ${vector.length}`);
  console.log(`l2Norm: ${formatNumber(l2Norm)}`);
  console.log(`allZero: ${nonZeroCount === 0 ? 'true' : 'false'}`);
  console.log(`nonZeroCount: ${nonZeroCount}`);
  console.log(`min: ${formatNumber(computeMin(vector))}`);
  console.log(`max: ${formatNumber(computeMax(vector))}`);
  console.log(`hasNaNOrInfinity: ${hasInvalidNumber(vector) ? 'true' : 'false'}`);
  console.log(`firstValues: [${preview}]`);
  console.log('');
}

async function main() {
  const env = loadServerEnv();
  const embeddingModel = process.env.CALIBRATION_VECTOR_EMBEDDING_MODEL?.trim()
    || env.openaiEmbeddingModel
    || '未配置';

  if (embeddingModel === '未配置') {
    throw new Error('当前未配置 OPENAI_EMBEDDING_MODEL，也未传 CALIBRATION_VECTOR_EMBEDDING_MODEL');
  }

  const texts = [QUERY_TEXT, ...SAMPLE_CHUNKS.map((item) => item.text)];
  const vectors = await createEmbeddings(
    {
      ...env,
      openaiEmbeddingModel: embeddingModel,
    },
    texts,
    embeddingModel,
  );

  const queryVector = vectors[0] ?? [];
  const chunkVectors = SAMPLE_CHUNKS.map((item, index) => ({
    ...item,
    vector: vectors[index + 1] ?? [],
  }));

  console.log('# 4.5 Embedding Vector Health');
  console.log(`embeddingModel: ${embeddingModel}`);
  console.log(`queryText: ${QUERY_TEXT}`);
  console.log('');

  printVectorStats('query', queryVector);

  for (const chunk of chunkVectors) {
    printVectorStats(`${chunk.id} / ${chunk.label}`, chunk.vector);
  }

  console.log('## Pairwise Similarity');

  for (const chunk of chunkVectors) {
    const dotProduct = computeDotProduct(queryVector, chunk.vector);
    const cosineSimilarity = computeCosineSimilarity(queryVector, chunk.vector);

    console.log(
      `${chunk.id} | dotProduct=${formatNumber(dotProduct)} | cosineSimilarity=${formatNumber(cosineSimilarity)}`,
    );
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Round45 embedding 向量有效性诊断失败：${message}`);
  process.exitCode = 1;
});
