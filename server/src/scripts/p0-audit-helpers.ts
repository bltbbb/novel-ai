import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ServerEnv } from '../config/env.js';
import { DEFAULT_PROMPT_CONFIG } from '../prompts/index.js';
import { replaceGenerationStateChanges, upsertGenerationChapterSummary } from '../services/generation-artifact-store.js';
import { replaceGenerationForeshadows } from '../services/generation-foreshadow-store.js';
import { upsertGenerationChapterIndex, upsertGenerationEntitiesSnapshot } from '../services/generation-knowledge-store.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';
import { rebuildGenerationVolumeRecap } from '../services/generation-volume-recap-store.js';
import type {
  ChapterOutlineDraft,
  ChapterSummaryDraft,
  GenerationEntitySnapshot,
  GenerationForeshadowSnapshot,
  StateChangeDraft,
  StrandType,
} from '../types/ai.js';

const DEFAULT_TEST_GATE_CONFIG: ServerEnv['generationGateConfig'] = {
  reviewRewriteMinSeverity: 'critical',
  reviewMaxRewriteCount: 2,
  reviewScoreThresholds: {
    consistency: 60,
    continuity: 60,
    reader_pull: 60,
  },
  polishFailBlockReady: true,
  lightweightRecall: {
    minScore: 3,
    topK: 4,
    phraseWeight: 2,
    entityWeight: 3,
    recencyWeight: 1,
  },
};

export interface ScriptTestEnvContext {
  env: ServerEnv;
  tempDir: string;
  dispose: () => Promise<void>;
}

function normalizeName(value: string) {
  const normalized = value.replace(/[^a-z0-9-]+/giu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '');
  return normalized || 'server-script';
}

export function createTestEnv(name = 'server-script'): ScriptTestEnvContext {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), `novel-ai-${normalizeName(name)}-`));
  const env: ServerEnv = {
    port: 0,
    host: '127.0.0.1',
    corsOrigin: '*',
    openaiProvider: 'openai',
    openaiApiKey: '',
    defaultModel: 'gpt-4o-mini',
    generationVectorBackend: 'json_cache',
    generationDataDir: tempDir,
    generationGateConfig: DEFAULT_TEST_GATE_CONFIG,
    promptConfig: DEFAULT_PROMPT_CONFIG,
  };
  let disposed = false;

  return {
    env,
    tempDir,
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      const dbFilePath = path.join(tempDir, 'generation.sqlite');

      if (existsSync(dbFilePath)) {
        try {
          const db = getGenerationDatabase(env) as { close?: () => void };
          db.close?.();
        } catch {
          // 审计脚本清理阶段不阻断主流程。
        }
      }

      try {
        rmSync(tempDir, {
          recursive: true,
          force: true,
        });
      } catch {
        // Windows 下偶发文件锁不会影响审计结论。
      }
    },
  };
}

export function createOutline(overrides: Partial<ChapterOutlineDraft> = {}): ChapterOutlineDraft {
  return {
    goal: overrides.goal ?? '推进当前主线',
    obstacle: overrides.obstacle ?? '外部阻力正在压近',
    cost: overrides.cost ?? '必须付出额外代价',
    beats: overrides.beats ?? ['角色推进一步'],
    timeAnchor: overrides.timeAnchor ?? '夜半',
    chapterTimeSpan: overrides.chapterTimeSpan ?? '半夜到黎明',
    gapFromPrevious: overrides.gapFromPrevious ?? '紧接上一章',
    strand: overrides.strand ?? 'quest',
    hookType: overrides.hookType ?? '悬念',
    hookStrength: overrides.hookStrength ?? 'medium',
    immutableFacts: overrides.immutableFacts ?? [],
  };
}

export function createSummary(overrides: Partial<ChapterSummaryDraft> = {}): ChapterSummaryDraft {
  return {
    summary: overrides.summary ?? '本章完成一次明确推进。',
    hook: overrides.hook ?? '下一章仍有新压力逼近。',
    foreshadowings: overrides.foreshadowings ?? [],
  };
}

export function createEntitySnapshot(name: string, overrides: Partial<GenerationEntitySnapshot> = {}): GenerationEntitySnapshot {
  return {
    name,
    type: overrides.type ?? 'character',
    description: overrides.description ?? `${name}的当前状态描述`,
    fields: overrides.fields ?? {},
    tags: overrides.tags ?? [],
    aliases: overrides.aliases ?? [],
    pinned: overrides.pinned ?? false,
    draft: overrides.draft ?? false,
  };
}

export function seedChapter(env: ServerEnv, input: {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  volumeTitle: string;
  previousChapterId?: string;
  previousChapterTitle?: string;
  outline?: ChapterOutlineDraft | null;
  summary?: ChapterSummaryDraft;
  strand?: StrandType;
  stateChanges?: StateChangeDraft[];
}) {
  const outline = input.outline ?? createOutline();
  const summary = input.summary ?? createSummary();
  const stateChanges = input.stateChanges ?? [];

  upsertGenerationChapterIndex(env, {
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    chapterOrder: input.chapterOrder,
    volumeTitle: input.volumeTitle,
    previousChapterId: input.previousChapterId,
    previousChapterTitle: input.previousChapterTitle,
    outline,
    summary,
    strand: input.strand ?? outline.strand,
    stateChanges,
  });

  upsertGenerationChapterSummary(env, {
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    summary,
  });

  replaceGenerationStateChanges(env, {
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    stateChanges,
  });
}

export function seedEntities(env: ServerEnv, input: {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  entities: GenerationEntitySnapshot[];
}) {
  upsertGenerationEntitiesSnapshot(env, input);
}

export function seedForeshadows(env: ServerEnv, input: {
  projectId: string;
  foreshadows: Array<
    Omit<GenerationForeshadowSnapshot, 'updatedAt'> & Partial<Pick<GenerationForeshadowSnapshot, 'updatedAt'>>
  >;
}) {
  replaceGenerationForeshadows(env, {
    projectId: input.projectId,
    foreshadows: input.foreshadows.map((item) => ({
      ...item,
      updatedAt: item.updatedAt ?? new Date().toISOString(),
    })),
  });
}

export function rebuildVolumeRecaps(env: ServerEnv, projectId: string, volumeTitles: string[]) {
  for (const volumeTitle of volumeTitles) {
    rebuildGenerationVolumeRecap(env, {
      projectId,
      volumeTitle,
    });
  }
}

export function seedGeneratedJob(env: ServerEnv, input: {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  generatedText: string;
  status?: string;
}) {
  const db = getGenerationDatabase(env);
  const currentTime = new Date().toISOString();

  db.prepare(`
    INSERT INTO generation_jobs (
      id,
      project_id,
      chapter_id,
      chapter_title,
      status,
      priority,
      current_step,
      completed_beat_count,
      total_beat_count,
      current_beat_index,
      current_beat_label,
      attempt_count,
      review_rewrite_count,
      review_gate_reason,
      rewrite_guidance,
      paused_at,
      request_json,
      outline_json,
      generated_text,
      style_json,
      review_json,
      language_qa_json,
      polish_json,
      summary_json,
      state_changes_json,
      strand,
      error_message,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.projectId,
    input.chapterId,
    input.chapterTitle,
    input.status ?? 'ready',
    1,
    'completed',
    1,
    1,
    null,
    '完成',
    1,
    0,
    '',
    '',
    null,
    JSON.stringify({}),
    JSON.stringify(null),
    input.generatedText,
    JSON.stringify(null),
    JSON.stringify(null),
    JSON.stringify(null),
    JSON.stringify(null),
    JSON.stringify(null),
    JSON.stringify([]),
    'quest',
    '',
    currentTime,
    currentTime,
  );
}
