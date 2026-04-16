import { randomUUID } from 'node:crypto';
import type { ServerEnv } from '../../src/config/env.js';
import { replaceGenerationStateChanges, upsertGenerationChapterSummary } from '../../src/services/generation-artifact-store.js';
import { replaceGenerationForeshadows } from '../../src/services/generation-foreshadow-store.js';
import { upsertGenerationChapterIndex, upsertGenerationEntitiesSnapshot } from '../../src/services/generation-knowledge-store.js';
import { getGenerationDatabase } from '../../src/services/generation-sqlite.js';
import { rebuildGenerationVolumeRecap } from '../../src/services/generation-volume-recap-store.js';
import type {
  ChapterOutlineDraft,
  ChapterSummaryDraft,
  GenerationEntitySnapshot,
  GenerationForeshadowSnapshot,
  GenerationRelationSnapshot,
  StateChangeDraft,
  StrandType,
} from '../../src/types/ai.js';

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

export function createRelationSnapshot(
  overrides: Partial<GenerationRelationSnapshot> & Pick<GenerationRelationSnapshot, 'sourceEntityName' | 'targetEntityName'>,
): GenerationRelationSnapshot {
  return {
    id: overrides.id ?? randomUUID(),
    sourceEntityId: overrides.sourceEntityId ?? `${overrides.sourceEntityName}-id`,
    targetEntityId: overrides.targetEntityId ?? `${overrides.targetEntityName}-id`,
    sourceEntityName: overrides.sourceEntityName,
    targetEntityName: overrides.targetEntityName,
    relationType: overrides.relationType ?? '对立',
    origin: overrides.origin ?? '旧案牵连',
    description: overrides.description ?? `${overrides.sourceEntityName}与${overrides.targetEntityName}存在强对立关系`,
    currentStance: overrides.currentStance ?? '敌对',
    currentIntensity: overrides.currentIntensity ?? 4,
    stanceReason: overrides.stanceReason ?? '曾在旧案中互相追杀',
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
