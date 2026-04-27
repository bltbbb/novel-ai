import { buildGenerationContextBundle } from '@/lib/generation-context';
import { buildGenerationEntitySnapshot } from '@/lib/generation-entity-snapshot';
import { DEFAULT_GENERATION_GATE_CONFIG, normalizeGenerationGateConfig } from '@/lib/generation-gate-defaults';
import { collectPlanningRequirements } from '@/lib/planning-requirements';
import { createChapterOutlineDraft, getChapterWriteUnitLabels } from '@/lib/chapter-outline';
import { buildModelRequestConfig } from '@/lib/runtime-config';
import {
  checkChapterLanguageQa,
  createChapterPlan,
  editorRefineChapterDraft,
  extractChapterState,
  polishChapterDraft,
  reviewChapterDraft,
  styleChapterDraft,
  writeChapterBeat,
} from '@/lib/generation-client';
import { getEffectiveChapterSummary, loadChapterSummary, loadGenerationQueueMap } from '@/lib/generation-storage';
import type {
  AppSettings,
  Chapter,
  ChapterLanguageQaDraft,
  ChapterEditorRefineDraft,
  ChapterOutline,
  ChapterOutlineDraft,
  ChapterPolishDraft,
  ChapterReviewDraft,
  GenerationRelationSnapshot,
  ChapterStyleDraft,
  ChapterSummaryDraft,
  GenerationGateConfig,
  GenerationForeshadowSnapshot,
  Id,
  LoreEntity,
  ReviewSeverity,
  StateChangeDraft,
  StrandType,
  VolumeOutlineFields,
} from '@/types';

export type GenerationPipelineStage =
  | 'plan'
  | 'write'
  | 'style'
  | 'review'
  | 'polish'
  | 'editor_refine'
  | 'extract';

interface StageChangePayload {
  stage: GenerationPipelineStage;
  label: string;
  beatIndex?: number;
  beatCount?: number;
}

interface RunGenerationPipelineInput {
  projectId: Id;
  chapter: Chapter;
  chapters: Chapter[];
  entities: LoreEntity[];
  projectTitle: string;
  projectDescription?: string;
  settings: AppSettings;
  worldState: string;
  relationSnapshot?: GenerationRelationSnapshot[];
  requiredEntityNames?: string[];
  availableCharacterNames?: string[];
  requiredForeshadowTitles?: string[];
  bookOutline?: string;
  volumeOutline?: string;
  volumeOutlineDraft?: VolumeOutlineFields | null;
  volumeGoal?: string;
  chapterBeat?: string;
  milestoneIndex?: number | null;
  nextChapterPreview?: string;
  forbiddenZone?: string;
  foreshadowSnapshot?: GenerationForeshadowSnapshot[];
  chapterHint?: string;
  enableEditorRefine?: boolean;
  outlineOverride?: ChapterOutline | ChapterOutlineDraft | null;
  gateConfig?: GenerationGateConfig | null;
  signal?: AbortSignal;
  onStageChange?: (payload: StageChangePayload) => void | Promise<void>;
}

export interface GenerationPipelineResult {
  generatedText: string;
  outline: ChapterOutlineDraft;
  style: ChapterStyleDraft | null;
  review: ChapterReviewDraft;
  languageQa: ChapterLanguageQaDraft | null;
  polish: ChapterPolishDraft | null;
  editorRefine: ChapterEditorRefineDraft | null;
  summary: ChapterSummaryDraft | null;
  stateChanges: StateChangeDraft[];
  strand: StrandType | null;
}

function normalizeOutlineDraft(outline: ChapterOutline | ChapterOutlineDraft): ChapterOutlineDraft {
  return createChapterOutlineDraft(outline);
}

const REVIEW_SEVERITY_WEIGHTS: Record<ReviewSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function dedupeTextList(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? '')
        .filter(Boolean),
    ),
  );
}

function hasStrictChapterOutlineControl(outline: ChapterOutline | ChapterOutlineDraft | null | undefined) {
  if (!outline) {
    return false;
  }

  return Boolean(
    outline.goal?.trim() ||
      outline.chapterFunction?.trim() ||
      outline.focusCharacter?.trim() ||
      outline.sceneDecisionNote?.trim() ||
      (outline.mustAppearCharacters?.length ?? 0) > 0 ||
      (outline.availableCharacters?.length ?? 0) > 0 ||
      (outline.foreshadowRefs?.length ?? 0) > 0 ||
      (outline.sceneDrafts?.length ?? 0) > 0 ||
      (outline.beatDrafts?.length ?? 0) > 0,
  );
}

function getReviewSeverityWeight(severity: ReviewSeverity) {
  return REVIEW_SEVERITY_WEIGHTS[severity] ?? REVIEW_SEVERITY_WEIGHTS.low;
}

function findScoreThresholdViolation(review: ChapterReviewDraft, gateConfig: GenerationGateConfig) {
  return (
    review.checkerResults.find((checker) => checker.score < gateConfig.reviewScoreThresholds[checker.checker]) ??
    null
  );
}

function shouldRewriteForReviewWithConfig(review: ChapterReviewDraft, gateConfig: GenerationGateConfig) {
  return (
    review.needsRewrite ||
    review.antiAiForceCheck === 'fail' ||
    Boolean(findScoreThresholdViolation(review, gateConfig)) ||
    getReviewSeverityWeight(review.overallSeverity) >=
      getReviewSeverityWeight(gateConfig.reviewRewriteMinSeverity)
  );
}

function buildRewriteGuidance(
  review: ChapterReviewDraft,
  gateConfig: GenerationGateConfig,
  languageQa: ChapterLanguageQaDraft | null,
) {
  const issueLines = review.checkerResults
    .flatMap((checker) =>
      checker.issues.map((issue) => {
        const parts = [`[${checker.checker}] ${issue.title}`, issue.description];

        if (issue.suggestion) {
          parts.push(`修改建议：${issue.suggestion}`);
        }

        if (issue.evidence) {
          parts.push(`证据：${issue.evidence}`);
        }

        return parts.join('；');
      }),
    )
    .slice(0, 4);
  const scoreLines = review.checkerResults
    .filter((checker) => checker.score < gateConfig.reviewScoreThresholds[checker.checker])
    .map(
      (checker) =>
        `[${checker.checker}] 当前分数 ${checker.score}，低于门槛 ${gateConfig.reviewScoreThresholds[checker.checker]}；优先修复：${checker.summary}`,
    )
    .slice(0, 3);
  const languageQaLines = languageQa
    ? languageQa.issues.slice(0, 3).map((issue) => {
        const parts = [`[language_qa] ${issue.title}`, issue.description];

        if (issue.suggestion) {
          parts.push(`修改建议：${issue.suggestion}`);
        }

        if (issue.evidence) {
          parts.push(`证据：${issue.evidence}`);
        }

        return parts.join('；');
      })
    : [];

  return [
    review.summary ? `总问题：${review.summary}` : '',
    review.antiAiForceCheck === 'fail'
      ? 'Anti-AI 未通过：必须整体改写表达，减少重复句式、套话与空转情绪。'
      : '',
    ...scoreLines,
    ...issueLines,
    ...languageQaLines,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function runGenerationPipeline(
  input: RunGenerationPipelineInput,
): Promise<GenerationPipelineResult> {
  const previousChapter =
    input.chapters.find((chapter) => chapter.order === input.chapter.order - 1) ?? null;
  const previousSummary = previousChapter
    ? await Promise.all([
        loadChapterSummary(input.projectId, previousChapter.id),
        loadGenerationQueueMap(input.projectId),
      ]).then(([summaryRecord, queueItems]) => {
        const queueMap = new Map(queueItems.map((item) => [item.chapterId, item] as const));
        return getEffectiveChapterSummary(summaryRecord ?? null, queueMap.get(previousChapter.id))?.summary ?? '';
      })
    : '';
  const contextBundle = await buildGenerationContextBundle({
    projectId: input.projectId,
    currentChapterId: input.chapter.id,
    chapters: input.chapters,
    entities: input.entities,
  });
  const mergedContextBundle = [
    contextBundle.bundle,
    input.chapterHint?.trim() ? `【本章生成提示】\n${input.chapterHint.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const effectiveGateConfig = normalizeGenerationGateConfig(input.gateConfig ?? DEFAULT_GENERATION_GATE_CONFIG);
  const hasStrictOutlineControl = hasStrictChapterOutlineControl(input.outlineOverride ?? null);
  const derivedPlanningRequirements = collectPlanningRequirements({
    volumeOutline: input.volumeOutlineDraft,
    milestoneIndex: input.milestoneIndex ?? undefined,
    foreshadows: input.foreshadowSnapshot,
  });
  const planningRequirements = {
    requiredEntityNames: hasStrictOutlineControl
      ? dedupeTextList([...(input.requiredEntityNames ?? [])])
      : dedupeTextList([
          ...(input.requiredEntityNames ?? []),
          ...derivedPlanningRequirements.requiredEntityNames,
        ]),
    availableCharacterNames: hasStrictOutlineControl
      ? dedupeTextList([...(input.availableCharacterNames ?? [])])
      : dedupeTextList([
          ...(input.availableCharacterNames ?? []),
          ...derivedPlanningRequirements.availableCharacterNames,
        ]),
    requiredForeshadowTitles: hasStrictOutlineControl
      ? dedupeTextList([...(input.requiredForeshadowTitles ?? [])])
      : dedupeTextList([
          ...(input.requiredForeshadowTitles ?? []),
          ...derivedPlanningRequirements.requiredForeshadowTitles,
        ]),
  };
  const entitySnapshot = buildGenerationEntitySnapshot(input.entities);
  const hasOutlineOverride = Boolean(input.outlineOverride);

  if (!hasOutlineOverride) {
    await input.onStageChange?.({
      stage: 'plan',
      label: '生成章节契约',
    });
  }

  const outline = hasOutlineOverride
    ? normalizeOutlineDraft(input.outlineOverride)
    : (
        await createChapterPlan(input.settings.serverUrl, {
          projectId: input.projectId,
          chapterId: input.chapter.id,
          chapterTitle: input.chapter.title,
          chapterOrder: input.chapter.order,
          volumeTitle: input.chapter.volumeTitle,
          previousChapterId: previousChapter?.id,
          previousChapterTitle: previousChapter?.title,
          projectTitle: input.projectTitle,
          projectDescription: input.projectDescription,
          bookOutline: input.bookOutline,
          volumeOutline: input.volumeOutline,
          volumeGoal: input.volumeGoal,
          chapterBeat: input.chapterBeat,
          nextChapterPreview: input.nextChapterPreview,
          forbiddenZone: input.forbiddenZone,
          previousSummary,
          worldState: input.worldState,
          contextBundle: mergedContextBundle,
          entitySnapshot,
          relationSnapshot: input.relationSnapshot,
          requiredEntityNames: planningRequirements.requiredEntityNames,
          availableCharacterNames: planningRequirements.availableCharacterNames,
          requiredForeshadowTitles: planningRequirements.requiredForeshadowTitles,
          foreshadowSnapshot: input.foreshadowSnapshot,
          gateConfigOverride: effectiveGateConfig,
          ...buildModelRequestConfig(input.settings),
        }, {
          signal: input.signal,
        })
      ).outline;
  const chapterBeatForExecution = undefined;

  let generatedText = '';
  let style: ChapterStyleDraft | null = null;
  let reviewResponse: Awaited<ReturnType<typeof reviewChapterDraft>>;
  let languageQaResponse: Awaited<ReturnType<typeof checkChapterLanguageQa>>;
  let rewriteGuidance = '';
  let rewriteCount = 0;

  while (true) {
    generatedText = '';
    style = null;
    const writeUnitLabels = getChapterWriteUnitLabels(outline);

    if (rewriteCount > 0) {
      await input.onStageChange?.({
        stage: 'write',
        label: `审查未通过，开始第 ${rewriteCount} 次自动重写`,
      });
    }

    if (writeUnitLabels.length === 0) {
      throw new Error('章节契约没有可执行的写作单元');
    }

    const unitLabel = (outline.sceneDrafts?.length ?? 0) > 0 ? '场景' : '拍';

    for (let index = 0; index < writeUnitLabels.length; index += 1) {
      const beat = writeUnitLabels[index];
      await input.onStageChange?.({
        stage: 'write',
        label: `撰写第 ${index + 1}/${writeUnitLabels.length} 个${unitLabel}`,
        beatIndex: index,
        beatCount: writeUnitLabels.length,
      });

      const response = await writeChapterBeat(input.settings.serverUrl, {
        projectId: input.projectId,
        chapterId: input.chapter.id,
        chapterTitle: input.chapter.title,
        chapterOrder: input.chapter.order,
        volumeTitle: input.chapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle: input.projectTitle,
        projectDescription: input.projectDescription,
        bookOutline: input.bookOutline,
        volumeOutline: input.volumeOutline,
        volumeGoal: input.volumeGoal,
        chapterBeat: chapterBeatForExecution,
        nextChapterPreview: input.nextChapterPreview,
        forbiddenZone: input.forbiddenZone,
        outline,
        beatIndex: index,
        currentBeat: beat,
        previousText: generatedText,
        previousSummary,
        worldState: input.worldState,
        rewriteGuidance: rewriteGuidance || undefined,
        contextBundle: mergedContextBundle,
        entitySnapshot,
        relationSnapshot: input.relationSnapshot,
        requiredEntityNames: planningRequirements.requiredEntityNames,
        availableCharacterNames: planningRequirements.availableCharacterNames,
        requiredForeshadowTitles: planningRequirements.requiredForeshadowTitles,
        foreshadowSnapshot: input.foreshadowSnapshot,
        gateConfigOverride: effectiveGateConfig,
        ...buildModelRequestConfig(input.settings),
      }, {
        signal: input.signal,
      });

      generatedText = [generatedText, response.content.trim()].filter(Boolean).join('\n\n');
    }

    if (input.settings.stylePrompt.trim()) {
      await input.onStageChange?.({
        stage: 'style',
        label: '执行风格转译',
      });

      const styleResponse = await styleChapterDraft(input.settings.serverUrl, {
        projectId: input.projectId,
        chapterId: input.chapter.id,
        chapterTitle: input.chapter.title,
        chapterOrder: input.chapter.order,
        volumeTitle: input.chapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle: input.projectTitle,
        projectDescription: input.projectDescription,
        bookOutline: input.bookOutline,
        volumeOutline: input.volumeOutline,
        outline,
        previousSummary,
        worldState: input.worldState,
        contextBundle: mergedContextBundle,
        entitySnapshot,
        relationSnapshot: input.relationSnapshot,
        requiredEntityNames: planningRequirements.requiredEntityNames,
        availableCharacterNames: planningRequirements.availableCharacterNames,
        requiredForeshadowTitles: planningRequirements.requiredForeshadowTitles,
        foreshadowSnapshot: input.foreshadowSnapshot,
        gateConfigOverride: effectiveGateConfig,
        stylePrompt: input.settings.stylePrompt,
        content: generatedText,
        ...buildModelRequestConfig(input.settings),
      }, {
        signal: input.signal,
      });

      generatedText = styleResponse.content;
      style = styleResponse.style;
    }

    await input.onStageChange?.({
      stage: 'review',
      label: '执行章节审查',
    });

    reviewResponse = await reviewChapterDraft(input.settings.serverUrl, {
      projectId: input.projectId,
      chapterId: input.chapter.id,
      chapterTitle: input.chapter.title,
      chapterOrder: input.chapter.order,
      volumeTitle: input.chapter.volumeTitle,
      previousChapterId: previousChapter?.id,
      previousChapterTitle: previousChapter?.title,
      projectTitle: input.projectTitle,
      projectDescription: input.projectDescription,
      bookOutline: input.bookOutline,
      volumeOutline: input.volumeOutline,
      chapterBeat: chapterBeatForExecution,
      outline,
      previousSummary,
      worldState: input.worldState,
      contextBundle: mergedContextBundle,
      entitySnapshot,
      relationSnapshot: input.relationSnapshot,
      requiredEntityNames: planningRequirements.requiredEntityNames,
      availableCharacterNames: planningRequirements.availableCharacterNames,
      requiredForeshadowTitles: planningRequirements.requiredForeshadowTitles,
      foreshadowSnapshot: input.foreshadowSnapshot,
      gateConfigOverride: effectiveGateConfig,
      content: generatedText,
      ...buildModelRequestConfig(input.settings),
    }, {
      signal: input.signal,
    });
    await input.onStageChange?.({
      stage: 'review',
      label: '执行语言校对',
    });
    languageQaResponse = await checkChapterLanguageQa(input.settings.serverUrl, {
      projectId: input.projectId,
      chapterId: input.chapter.id,
      chapterTitle: input.chapter.title,
      chapterOrder: input.chapter.order,
      volumeTitle: input.chapter.volumeTitle,
      previousChapterId: previousChapter?.id,
      previousChapterTitle: previousChapter?.title,
      projectTitle: input.projectTitle,
      projectDescription: input.projectDescription,
      bookOutline: input.bookOutline,
      volumeOutline: input.volumeOutline,
      chapterBeat: chapterBeatForExecution,
      outline,
      previousSummary,
      worldState: input.worldState,
      contextBundle: mergedContextBundle,
      entitySnapshot,
      relationSnapshot: input.relationSnapshot,
      requiredEntityNames: planningRequirements.requiredEntityNames,
      availableCharacterNames: planningRequirements.availableCharacterNames,
      requiredForeshadowTitles: planningRequirements.requiredForeshadowTitles,
      foreshadowSnapshot: input.foreshadowSnapshot,
      gateConfigOverride: effectiveGateConfig,
      content: generatedText,
      ...buildModelRequestConfig(input.settings),
    }, {
      signal: input.signal,
    });

    const shouldRewrite = shouldRewriteForReviewWithConfig(
      reviewResponse.review,
      effectiveGateConfig,
    );

    if (!shouldRewrite || rewriteCount >= effectiveGateConfig.reviewMaxRewriteCount) {
      break;
    }

    rewriteCount += 1;
    rewriteGuidance = buildRewriteGuidance(
      reviewResponse.review,
      effectiveGateConfig,
      languageQaResponse.languageQa,
    );
  }

  let polish: ChapterPolishDraft | null = null;
  let editorRefine: ChapterEditorRefineDraft | null = null;
  let summary: ChapterSummaryDraft | null = null;
  let stateChanges: StateChangeDraft[] = [];
  let strand: StrandType | null = null;

  if (!reviewResponse.review.needsRewrite && reviewResponse.review.overallSeverity !== 'critical') {
    await input.onStageChange?.({
      stage: 'polish',
      label: '执行章节润色',
    });

    const polishResponse = await polishChapterDraft(input.settings.serverUrl, {
      projectId: input.projectId,
      chapterId: input.chapter.id,
      chapterTitle: input.chapter.title,
      chapterOrder: input.chapter.order,
      volumeTitle: input.chapter.volumeTitle,
      previousChapterId: previousChapter?.id,
      previousChapterTitle: previousChapter?.title,
      projectTitle: input.projectTitle,
      projectDescription: input.projectDescription,
      bookOutline: input.bookOutline,
      volumeOutline: input.volumeOutline,
      outline,
      previousSummary,
      worldState: input.worldState,
      contextBundle: mergedContextBundle,
      entitySnapshot,
      relationSnapshot: input.relationSnapshot,
      requiredEntityNames: planningRequirements.requiredEntityNames,
      availableCharacterNames: planningRequirements.availableCharacterNames,
      requiredForeshadowTitles: planningRequirements.requiredForeshadowTitles,
      foreshadowSnapshot: input.foreshadowSnapshot,
      review: reviewResponse.review,
      languageQa: languageQaResponse.languageQa,
      content: generatedText,
      ...buildModelRequestConfig(input.settings),
    }, {
      signal: input.signal,
    });

    generatedText = polishResponse.content;
    polish = polishResponse.polish;

    if (input.enableEditorRefine) {
      await input.onStageChange?.({
        stage: 'editor_refine',
        label: '执行整章统筹改稿',
      });

      const editorRefineResponse = await editorRefineChapterDraft(input.settings.serverUrl, {
        projectId: input.projectId,
        chapterId: input.chapter.id,
        chapterTitle: input.chapter.title,
        chapterOrder: input.chapter.order,
        volumeTitle: input.chapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        bookOutline: input.bookOutline,
        volumeOutline: input.volumeOutline,
        previousSummary,
        outline,
        entitySnapshot,
        requiredEntityNames: planningRequirements.requiredEntityNames,
        availableCharacterNames: planningRequirements.availableCharacterNames,
        content: generatedText,
        ...buildModelRequestConfig(input.settings),
      }, {
        signal: input.signal,
      });

      generatedText = editorRefineResponse.content;
      editorRefine = editorRefineResponse.editorRefine;
    }

    await input.onStageChange?.({
      stage: 'extract',
      label: '提取摘要与状态变更',
    });

    const extractResponse = await extractChapterState(input.settings.serverUrl, {
      projectId: input.projectId,
      chapterId: input.chapter.id,
      chapterTitle: input.chapter.title,
      chapterOrder: input.chapter.order,
      chapterBeat: chapterBeatForExecution,
      content: generatedText,
      loreSummary: input.worldState,
      ...buildModelRequestConfig(input.settings),
    }, {
      signal: input.signal,
    });

    summary = extractResponse.summary;
    stateChanges = extractResponse.stateChanges;
    strand = extractResponse.strand;
  }

  return {
    generatedText,
    outline,
    style,
    review: reviewResponse.review,
    languageQa: languageQaResponse.languageQa,
    polish,
    editorRefine,
    summary,
    stateChanges,
    strand,
  };
}
