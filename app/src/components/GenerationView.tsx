import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  LoaderCircle,
  PencilLine,
  RotateCcw,
  Sparkles,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { GenerationContextPreviewDialog, type GenerationContextPreviewData } from '@/components/GenerationContextPreviewDialog';
import { useToast } from '@/components/Toast';
import { createChapterOutlineDraft, getChapterWriteUnitCount, getChapterWriteUnitLabels, serializeChapterOutlineDraft } from '@/lib/chapter-outline';
import { buildGenerationContextBundle } from '@/lib/generation-context';
import { buildGenerationEntitySnapshot } from '@/lib/generation-entity-snapshot';
import {
  backfillGenerationMemoryChunks,
  backfillGenerationMemoryEmbeddings,
  backfillGenerationVolumeRecaps,
  fetchGenerationDebugChapters,
  fetchGenerationDebugChapterDetail,
  fetchGenerationDebugContext,
  fetchGenerationDebugEntities,
  fetchGenerationDebugForeshadows,
  fetchGenerationDebugMemoryChunks,
  fetchGenerationDebugOverview,
  fetchGenerationDebugRelationships,
  fetchGenerationDebugRetrieval,
  fetchGenerationDebugVolumeRecaps,
  previewGenerationPrompts,
} from '@/lib/generation-debug-client';
import { buildGenerationForeshadowSnapshot } from '@/lib/generation-foreshadow-snapshot';
import { buildGenerationRelationSnapshot } from '@/lib/generation-relation-snapshot';
import { runGenerationPipeline, type GenerationPipelineStage } from '@/lib/generation-pipeline';
import { buildChapterPromptPayload, runLocalRepetitionChecker } from '@/lib/generation-repetition';
import {
  checkChapterLanguageQa,
  createChapterPlan,
  extractChapterState,
  listGenerationJobs,
  polishChapterDraft,
  reviewChapterDraft,
  styleChapterDraft,
  syncGenerationArtifacts,
  writeChapterBeat,
} from '@/lib/generation-client';
import {
  getEffectiveChapterSummary,
  loadGenerationQueueMap,
  appendStrandHistory,
  deleteChapterOutline,
  deleteChapterStateChanges,
  deleteChapterSummary,
  loadChapterOutline,
  loadChapterStateChanges,
  loadChapterSummary,
  loadGenerationQueue,
  removeStrandHistory,
  replaceChapterStateChanges,
  saveChapterOutline,
  saveChapterSummary,
  saveGenerationQueueItem,
} from '@/lib/generation-storage';
import { createParagraphDocument, richTextToPlainText } from '@/lib/editor-content';
import { buildLoreEntityIdLookup } from '@/lib/lore-entity';
import { buildWorldStateSummary, getStrandLabel } from '@/lib/generation-utils';
import {
  applyLightweightRecallPreset,
  DEFAULT_GENERATION_GATE_CONFIG,
  findMatchingLightweightRecallPreset,
  LIGHTWEIGHT_RECALL_PRESETS,
  normalizeGenerationGateConfig,
} from '@/lib/generation-gate-defaults';
import { buildEffectiveStylePrompt } from '@/lib/project-style';
import { formatPromptSection, mergePromptSections } from '@/lib/project-template';
import { buildModelRequestConfig } from '@/lib/runtime-config';
import { fetchGenerationGateConfig } from '@/lib/server-config-client';
import {
  useChapterBeatStore,
  useEditorStore,
  useEntityRelationStore,
  useForeshadowStore,
  useLoreStore,
  useOutlineStore,
  useProjectStore,
  useSettingsStore,
  useSnapshotStore,
} from '@/stores';
import type {
  ChapterOutlineDraft,
  ChapterSummaryDraft,
  GenerationDebugChapterRecord,
  GenerationDebugChapterDetail,
  GenerationDebugContext,
  GenerationDebugEntityRecord,
  GenerationDebugForeshadowRecord,
  GenerationDebugMemoryChunkRecord,
  GenerationDebugOverview,
  GenerationDebugRelationshipRecord,
  GenerationDebugRetrieval,
  GenerationDebugVolumeRecapRecord,
  GenerationGateConfig,
  GenerationJobRecord,
  GenerationMemoryChunkBackfillResult,
  GenerationMemoryEmbeddingBackfillResult,
  GenerationPromptPreviewStageRequest,
  GenerationQueueItem,
  GenerationVolumeRecapBackfillResult,
  Id,
  StateChange,
  StateChangeDraft,
  StrandType,
} from '@/types';

type GenerationViewMode = 'idle' | 'generating' | 'reviewing' | 'approved';

interface GenerationViewProps {
  projectId: Id;
  projectTitle: string;
  projectDescription?: string;
  onOpenAdvancedConsole?: () => void;
  onOpenEditor?: () => void;
  onOpenOutline?: () => void;
}

const allPipelineStages: Array<{
  key: GenerationPipelineStage;
  label: string;
}> = [
  { key: 'plan', label: 'Plan' },
  { key: 'write', label: 'Write' },
  { key: 'style', label: 'Style' },
  { key: 'review', label: 'Review' },
  { key: 'polish', label: 'Polish' },
  { key: 'editor_refine', label: 'Editor Refine' },
  { key: 'extract', label: 'Extract' },
];

const activeLocalGenerationChapterIds = new Set<Id>();
const localGenerationControllers = new Map<Id, AbortController>();

function markLocalGenerationActive(chapterId: Id) {
  activeLocalGenerationChapterIds.add(chapterId);
}

function clearLocalGenerationActive(chapterId: Id) {
  activeLocalGenerationChapterIds.delete(chapterId);
}

function isLocalGenerationActive(chapterId: Id) {
  return activeLocalGenerationChapterIds.has(chapterId);
}

function setLocalGenerationController(chapterId: Id, controller: AbortController) {
  localGenerationControllers.set(chapterId, controller);
}

function getLocalGenerationController(chapterId: Id) {
  return localGenerationControllers.get(chapterId) ?? null;
}

function clearLocalGenerationController(chapterId: Id) {
  localGenerationControllers.delete(chapterId);
}

function formatChapterStatus(status: string) {
  switch (status) {
    case 'published':
      return '已发布';
    case 'revised':
      return '已确认';
    case 'first_draft':
      return '草稿中';
    case 'draft':
    default:
      return '待生成';
  }
}

function getSeverityBadgeClassName(severity?: string) {
  switch (severity) {
    case 'critical':
      return 'border-red-500/30 bg-red-500/10 text-red-200';
    case 'high':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-200';
    case 'medium':
      return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200';
    case 'low':
    default:
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }
}

function getSeverityWeight(severity?: string) {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
    default:
      return 1;
  }
}

function isRepetitionRelatedReviewIssue(
  checker: 'consistency' | 'continuity' | 'reader_pull',
  issue: {
    title: string;
    description: string;
    suggestion: string;
    evidence: string;
  },
) {
  if (checker !== 'continuity' && checker !== 'reader_pull') {
    return false;
  }

  const haystack = [
    issue.title,
    issue.description,
    issue.suggestion,
    issue.evidence,
  ]
    .join(' ')
    .toLowerCase();

  return [
    '重复',
    '复述',
    '空转',
    '模板',
    '命令',
    '封口',
    '解释性心理',
    '心理复述',
    '追读动力',
    '信息增量',
    '推进不足',
    '同一层',
    '同义',
    '钩子',
  ].some((keyword) => haystack.includes(keyword));
}

function formatLightweightRecallSourceLabel(sourceType: GenerationDebugContext['lightweightRecallItems'][number]['sourceType']) {
  switch (sourceType) {
    case 'dormant_foreshadow':
      return '休眠伏笔';
    case 'volume_recap':
      return '卷总结';
    default:
      return sourceType;
  }
}

function formatRetrievalHitOriginLabel(origin: GenerationDebugRetrieval['items'][number]['retrievalHitOrigin']) {
  switch (origin) {
    case 'lexical_only':
      return '词法命中';
    case 'vector_only':
      return '向量补救';
    case 'hybrid':
      return '混合命中';
    default:
      return origin;
  }
}

function formatForeshadowLifecycleLabel(lifecycle: GenerationDebugForeshadowRecord['lifecycle']) {
  switch (lifecycle) {
    case 'active':
      return '激活';
    case 'dormant':
      return '休眠';
    case 'archived':
      return '归档';
    default:
      return lifecycle;
  }
}

function formatForeshadowStatusLabel(status: GenerationDebugForeshadowRecord['status']) {
  switch (status) {
    case 'planted':
      return '已埋设';
    case 'activated':
      return '已激活';
    case 'resolved':
      return '已回收';
    case 'overdue':
      return '已逾期';
    default:
      return status;
  }
}

function getGenerationErrorMeta(errorMessage: string) {
  const normalizedMessage = errorMessage.trim();
  const isFormatError =
    normalizedMessage.includes('返回格式异常') || normalizedMessage.includes('JSON 无法解析');

  if (isFormatError) {
    return {
      title: '上次生成返回格式异常',
      panelClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
      titleClassName: 'text-amber-50',
    };
  }

  return {
    title: '上次生成失败',
    panelClassName: 'border-red-500/30 bg-red-500/10 text-red-200',
    titleClassName: 'text-red-100',
  };
}

function formatStageDescription(
  stage: GenerationPipelineStage | null,
  beatIndex: number | null,
  beatCount: number | null,
  label?: string,
  stageOptions: Array<{
    key: GenerationPipelineStage;
    label: string;
  }> = allPipelineStages,
) {
  if (label?.trim()) {
    return label.trim();
  }

  if (!stage) {
    return '等待开始';
  }

  if (stage === 'write' && beatIndex !== null && beatCount) {
    return `正在撰写第 ${beatIndex + 1}/${beatCount} 个写作单元`;
  }

  return `正在执行 ${stageOptions.find((item) => item.key === stage)?.label ?? stage}`;
}

function getChapterPlainText(content = createParagraphDocument()) {
  return richTextToPlainText(content).trim();
}

function getQueuePreviewText(queueItem: GenerationQueueItem | null, chapterContent = createParagraphDocument()) {
  const queueText = queueItem?.generatedText?.trim() ?? '';
  return queueText || getChapterPlainText(chapterContent);
}

function normalizeOutlineDraft(outline: ChapterOutlineDraft | NonNullable<Awaited<ReturnType<typeof loadChapterOutline>>>) {
  return createChapterOutlineDraft(outline);
}

function hasManualOutlineSignals(
  outline: NonNullable<Awaited<ReturnType<typeof loadChapterOutline>>> | ChapterOutlineDraft | null | undefined,
) {
  if (!outline) {
    return false;
  }

  return Boolean(
    outline.chapterFunction?.trim() ||
      outline.chapterBoundary?.trim() ||
      outline.revealCeiling?.trim() ||
      outline.openingState?.trim() ||
      outline.closingState?.trim() ||
      outline.focusCharacter?.trim() ||
      (outline.mustAppearCharacters?.length ?? 0) > 0 ||
      (outline.availableCharacters?.length ?? 0) > 0 ||
      outline.mainPlot?.trim() ||
      outline.subPlot?.trim() ||
      outline.coreScene?.trim() ||
      (outline.sceneAnchors?.length ?? 0) > 0 ||
      outline.infoBudget?.trim() ||
      outline.powerShift?.trim() ||
      outline.personalConflict?.trim() ||
      outline.emotionalOutcome?.trim() ||
      outline.chapterHook?.trim() ||
      outline.sceneDecisionNote?.trim() ||
      (outline.foreshadowRefs?.length ?? 0) > 0 ||
      (outline.sceneDrafts?.length ?? 0) > 0 ||
      (outline.beatDrafts?.length ?? 0) > 0
  );
}

function shouldResetOutline(
  outline: NonNullable<Awaited<ReturnType<typeof loadChapterOutline>>> | ChapterOutlineDraft | null | undefined,
) {
  if (!outline) {
    return false;
  }

  if (outline.source === 'generated') {
    return true;
  }

  if (outline.source === 'manual') {
    return false;
  }

  const hasLegacyContractSignals = Boolean(
    outline.goal?.trim() ||
      outline.obstacle?.trim() ||
      outline.cost?.trim() ||
      (outline.beats?.length ?? 0) > 0 ||
      outline.timeAnchor?.trim() ||
      outline.chapterTimeSpan?.trim() ||
      outline.gapFromPrevious?.trim() ||
      outline.hookType?.trim() ||
      (outline.immutableFacts?.length ?? 0) > 0,
  );

  if (hasManualOutlineSignals(outline)) {
    return false;
  }

  return hasLegacyContractSignals;
}

function renderLoadMoreActions(
  currentLimit: number,
  total: number,
  onExpand: () => void,
  onCollapse: () => void,
) {
  if (total <= currentLimit && currentLimit <= 6) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {currentLimit < total ? (
        <button
          type="button"
          onClick={onExpand}
          className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-900"
        >
          显示更多
        </button>
      ) : null}
      {currentLimit > 6 ? (
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-900"
        >
          收起
        </button>
      ) : null}
      <span className="inline-flex items-center px-1 text-xs text-neutral-500">
        已显示 {Math.min(currentLimit, total)} / {total}
      </span>
    </div>
  );
}

export function GenerationView({
  projectId,
  projectTitle,
  projectDescription = '',
  onOpenAdvancedConsole,
  onOpenEditor,
  onOpenOutline,
}: GenerationViewProps) {
  const { toast } = useToast();
  const chapters = useEditorStore((state) => state.chapters);
  const activeChapterId = useEditorStore((state) => state.activeChapterId);
  const setActiveChapter = useEditorStore((state) => state.setActiveChapter);
  const saveChapterContent = useEditorStore((state) => state.saveChapterContent);
  const updateChapterStatus = useEditorStore((state) => state.updateChapterStatus);
  const chapterBeats = useChapterBeatStore((state) => state.chapterBeats);
  const volumeOutlines = useOutlineStore((state) => state.volumeOutlines);
  const loadChapterBeats = useChapterBeatStore((state) => state.loadChapterBeats);
  const settings = useSettingsStore((state) => state.settings);
  const entities = useLoreStore((state) => state.entities);
  const entityRelations = useEntityRelationStore((state) => state.entityRelations);
  const loadEntityRelations = useEntityRelationStore((state) => state.loadEntityRelations);
  const foreshadows = useForeshadowStore((state) => state.foreshadows);
  const foreshadowLoadedProjectId = useForeshadowStore((state) => state.loadedProjectId);
  const isForeshadowLoaded = useForeshadowStore((state) => state.isLoaded);
  const allProjects = useProjectStore((state) => state.projects);
  const currentProject = useProjectStore((state) => state.projects.find((project) => project.id === projectId) ?? null);
  const updateProject = useProjectStore((state) => state.updateProject);
  const effectiveStylePrompt = useMemo(
    () => buildEffectiveStylePrompt(currentProject, settings),
    [
      currentProject?.templateSnapshot?.promptBundle.stylePrompt,
      currentProject?.stylePrompt,
      settings.stylePrompt,
    ],
  );
  const createSnapshot = useSnapshotStore((state) => state.createSnapshot);
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0] ?? null,
    [activeChapterId, chapters],
  );
  const chapterById = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter] as const)),
    [chapters],
  );
  const previousChapter = useMemo(() => {
    if (!selectedChapter) {
      return null;
    }

    return chapters.find((chapter) => chapter.order === selectedChapter.order - 1) ?? null;
  }, [chapters, selectedChapter]);
  const currentChapterBeat = useMemo(
    () =>
      selectedChapter
        ? chapterBeats.find((beat) => beat.chapterId === selectedChapter.id) ?? null
        : null,
    [chapterBeats, selectedChapter],
  );
  const chapterVolumeOutline = useMemo(
    () =>
      selectedChapter?.volumeId
        ? volumeOutlines.find((outline) => outline.volumeId === selectedChapter.volumeId) ?? null
        : null,
    [selectedChapter?.volumeId, volumeOutlines],
  );
  const previousChapterBeats = useMemo(() => {
    if (!selectedChapter) {
      return [];
    }

    return chapterBeats
      .filter((beat) => {
        if (!beat.chapterId) {
          return false;
        }

        const chapter = chapterById.get(beat.chapterId);
        return Boolean(chapter && chapter.order < selectedChapter.order);
      })
      .sort((left, right) => {
        const leftOrder = left.chapterId ? chapterById.get(left.chapterId)?.order ?? 0 : 0;
        const rightOrder = right.chapterId ? chapterById.get(right.chapterId)?.order ?? 0 : 0;
        return leftOrder - rightOrder;
      })
      .slice(-3);
  }, [chapterBeats, chapterById, selectedChapter]);
  const recentChapterTexts = useMemo(() => {
    if (!selectedChapter) {
      return [];
    }

    return [...chapters]
      .filter((chapter) => chapter.order < selectedChapter.order)
      .sort((left, right) => right.order - left.order)
      .slice(0, 5)
      .map((chapter) => richTextToPlainText(chapter.content).trim())
      .filter(Boolean);
  }, [chapters, selectedChapter]);
  const confirmedEntities = useMemo(() => entities.filter((entity) => !entity.draft), [entities]);
  const entitySnapshot = useMemo(() => buildGenerationEntitySnapshot(entities), [entities]);
  const relationSnapshot = useMemo(
    () => buildGenerationRelationSnapshot(entityRelations.filter((relation) => relation.projectId === projectId)),
    [entityRelations, projectId],
  );
  const worldState = useMemo(() => buildWorldStateSummary(confirmedEntities), [confirmedEntities]);
  const foreshadowSnapshot =
    isForeshadowLoaded && foreshadowLoadedProjectId === projectId
      ? buildGenerationForeshadowSnapshot(
          foreshadows.filter((foreshadow) => foreshadow.projectId === projectId),
          chapters,
        )
      : undefined;

  const [mode, setMode] = useState<GenerationViewMode>('idle');
  const [chapterHint, setChapterHint] = useState('');
  const [enableEditorRefine, setEnableEditorRefine] = useState(false);
  const [outline, setOutline] = useState<Awaited<ReturnType<typeof loadChapterOutline>> | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof loadChapterSummary>> | null>(null);
  const [stateChanges, setStateChanges] = useState<StateChange[]>([]);
  const [draftItem, setDraftItem] = useState<GenerationQueueItem | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [progressStage, setProgressStage] = useState<GenerationPipelineStage | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [progressBeatIndex, setProgressBeatIndex] = useState<number | null>(null);
  const [progressBeatCount, setProgressBeatCount] = useState<number | null>(null);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);
  const [activeSingleStep, setActiveSingleStep] = useState<GenerationPipelineStage | null>(null);
  const [showContextPreviewDialog, setShowContextPreviewDialog] = useState(false);
  const [isContextPreviewLoading, setIsContextPreviewLoading] = useState(false);
  const [contextPreviewError, setContextPreviewError] = useState('');
  const [contextPreviewData, setContextPreviewData] = useState<GenerationContextPreviewData | null>(null);

  function buildEffectiveChapterHint(extraHint?: string) {
    return mergePromptSections(
      formatPromptSection(
        '创作模板章节写法约束',
        currentProject?.templateSnapshot?.promptBundle.beatPrompt ||
          currentProject?.templateSnapshot?.promptBundle.writingPrompt,
      ),
      formatPromptSection('创作模板负面约束', currentProject?.templateSnapshot?.promptBundle.negativePrompt),
      extraHint,
    );
  }
  const [localContextPreview, setLocalContextPreview] = useState('');
  const [serverDebugContext, setServerDebugContext] = useState<GenerationDebugContext | null>(null);
  const [serverDebugOverview, setServerDebugOverview] = useState<GenerationDebugOverview | null>(null);
  const [serverDebugChapters, setServerDebugChapters] = useState<GenerationDebugChapterRecord[]>([]);
  const [debugProjectId, setDebugProjectId] = useState<Id>(projectId);
  const [selectedDebugChapterId, setSelectedDebugChapterId] = useState<Id | null>(null);
  const [serverDebugRetrieval, setServerDebugRetrieval] = useState<GenerationDebugRetrieval | null>(null);
  const [serverDebugChapterDetail, setServerDebugChapterDetail] = useState<GenerationDebugChapterDetail | null>(null);
  const [serverDebugEntities, setServerDebugEntities] = useState<GenerationDebugEntityRecord[]>([]);
  const [serverDebugForeshadows, setServerDebugForeshadows] = useState<GenerationDebugForeshadowRecord[]>([]);
  const [serverDebugMemoryChunks, setServerDebugMemoryChunks] = useState<GenerationDebugMemoryChunkRecord[]>([]);
  const [serverDebugRelationships, setServerDebugRelationships] = useState<GenerationDebugRelationshipRecord[]>([]);
  const [serverDebugVolumeRecaps, setServerDebugVolumeRecaps] = useState<GenerationDebugVolumeRecapRecord[]>([]);
  const [effectiveGateConfig, setEffectiveGateConfig] = useState<GenerationGateConfig | null>(null);
  const [serverJobs, setServerJobs] = useState<GenerationJobRecord[]>([]);
  const [isAdvancedLoading, setIsAdvancedLoading] = useState(false);
  const [advancedError, setAdvancedError] = useState('');
  const [debugChapterQuery, setDebugChapterQuery] = useState('');
  const [debugEntityQuery, setDebugEntityQuery] = useState('');
  const [debugRelationshipQuery, setDebugRelationshipQuery] = useState('');
  const [retrievalFilterQuery, setRetrievalFilterQuery] = useState('');
  const [memoryChunkFilterQuery, setMemoryChunkFilterQuery] = useState('');
  const [foreshadowLifecycleFilter, setForeshadowLifecycleFilter] = useState<'all' | 'active' | 'dormant' | 'archived'>('all');
  const [entityPinnedOnly, setEntityPinnedOnly] = useState(false);
  const [retrievalOriginFilter, setRetrievalOriginFilter] = useState<'all' | 'lexical_only' | 'vector_only' | 'hybrid'>('all');
  const [relationshipSourceKindFilter, setRelationshipSourceKindFilter] = useState<'all' | string>('all');
  const [memoryChunkKindFilter, setMemoryChunkKindFilter] = useState<'all' | string>('all');
  const [maintenanceScope, setMaintenanceScope] = useState<'project' | 'chapter'>('chapter');
  const [maintenanceLimitInput, setMaintenanceLimitInput] = useState('');
  const [isChunkBackfilling, setIsChunkBackfilling] = useState(false);
  const [isEmbeddingBackfilling, setIsEmbeddingBackfilling] = useState(false);
  const [isVolumeRecapBackfilling, setIsVolumeRecapBackfilling] = useState(false);
  const [lastChunkBackfill, setLastChunkBackfill] = useState<GenerationMemoryChunkBackfillResult | null>(null);
  const [lastEmbeddingBackfill, setLastEmbeddingBackfill] = useState<GenerationMemoryEmbeddingBackfillResult | null>(null);
  const [lastVolumeRecapBackfill, setLastVolumeRecapBackfill] = useState<GenerationVolumeRecapBackfillResult | null>(null);
  const [projectGateOverrideEnabled, setProjectGateOverrideEnabled] = useState(false);
  const [projectGateOverrideDraft, setProjectGateOverrideDraft] = useState<GenerationGateConfig>(DEFAULT_GENERATION_GATE_CONFIG);
  const [isProjectGateSaving, setIsProjectGateSaving] = useState(false);
  const [chapterIndexLimit, setChapterIndexLimit] = useState(8);
  const [lightweightRecallLimit, setLightweightRecallLimit] = useState(4);
  const [retrievalLimit, setRetrievalLimit] = useState(6);
  const [entityLimit, setEntityLimit] = useState(6);
  const [memoryChunkLimit, setMemoryChunkLimit] = useState(6);
  const [relationshipLimit, setRelationshipLimit] = useState(6);
  const [foreshadowLimit, setForeshadowLimit] = useState(6);
  const [volumeRecapLimit, setVolumeRecapLimit] = useState(6);
  const errorMeta = useMemo(() => getGenerationErrorMeta(errorMessage), [errorMessage]);
  const selectedChapterContentText = useMemo(
    () => getChapterPlainText(selectedChapter?.content),
    [selectedChapter?.id, selectedChapter?.updatedAt],
  );
  const localGenerationGateConfig = useMemo(
    () =>
      normalizeGenerationGateConfig(
        currentProject?.generationGateOverride ?? effectiveGateConfig ?? DEFAULT_GENERATION_GATE_CONFIG,
      ),
    [currentProject?.generationGateOverride, effectiveGateConfig],
  );
  const pipelineStages = useMemo(
    () => allPipelineStages.filter((stage) => enableEditorRefine || stage.key !== 'editor_refine'),
    [enableEditorRefine],
  );

  useEffect(() => {
    let mounted = true;

    if (!selectedChapter) {
      setOutline(null);
      setSummary(null);
      setStateChanges([]);
      setDraftItem(null);
      setReviewText('');
      setErrorMessage('');
      setProgressStage(null);
      setProgressLabel('');
      setProgressBeatIndex(null);
      setProgressBeatCount(null);
      setMode('idle');
      return;
    }

    setOutline(null);
    setSummary(null);
    setStateChanges([]);
    setDraftItem(null);
    setReviewText('');
    setErrorMessage('');
    setProgressStage(null);
    setProgressLabel('');
    setProgressBeatIndex(null);
    setProgressBeatCount(null);
    setMode('idle');

    void (async () => {
      setIsLoadingArtifacts(true);

      try {
        const [nextOutline, nextSummary, nextStateChanges, queueItems] = await Promise.all([
          loadChapterOutline(projectId, selectedChapter.id),
          loadChapterSummary(projectId, selectedChapter.id),
          loadChapterStateChanges(selectedChapter.id),
          loadGenerationQueue(projectId),
        ]);

        if (!mounted) {
          return;
        }

        const queueItem =
          [...queueItems]
            .reverse()
            .find((item) => item.chapterId === selectedChapter.id) ?? null;
        const nextPreviewText = getQueuePreviewText(queueItem, selectedChapter.content);

        setOutline(nextOutline ?? null);
        setSummary(nextSummary ?? null);
        setStateChanges(nextStateChanges);
        setDraftItem(queueItem);
        setErrorMessage(queueItem?.status === 'error' ? queueItem.errorMessage : '');

        if (queueItem?.status === 'running') {
          if (!isLocalGenerationActive(selectedChapter.id)) {
            const interruptedMessage = '上次本地生成已中断，请重新生成本章。';
            const interruptedItem = await saveGenerationQueueItem({
              projectId,
              chapterId: selectedChapter.id,
              chapterTitle: selectedChapter.title,
              status: 'error',
              errorMessage: interruptedMessage,
            });

            if (!mounted) {
              return;
            }

            setDraftItem(interruptedItem);
            setMode('idle');
            setErrorMessage(interruptedMessage);
            setReviewText('');
            setProgressStage(null);
            setProgressLabel('');
            setProgressBeatIndex(null);
            setProgressBeatCount(null);
          } else {
            setMode('generating');
            setProgressStage(queueItem.progressStage ?? null);
            setProgressLabel(queueItem.progressLabel ?? '');
            setProgressBeatIndex(queueItem.progressBeatIndex ?? null);
            setProgressBeatCount(queueItem.progressBeatCount ?? null);
            setReviewText('');
          }
        } else if (queueItem?.status === 'ready') {
          setMode('reviewing');
          setReviewText(nextPreviewText);
        } else if (queueItem?.status === 'approved') {
          setMode('approved');
          setReviewText(nextPreviewText);
        } else {
          setMode('idle');
          setReviewText('');
        }
      } catch (error) {
        if (!mounted) {
          return;
        }

        const message = error instanceof Error ? error.message : '未知错误';
        toast(`加载章节生成信息失败：${message}`, 'error');
      } finally {
        if (mounted) {
          setIsLoadingArtifacts(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [projectId, selectedChapter?.id, selectedChapter?.updatedAt, toast]);

  useEffect(() => {
    if (mode !== 'generating' || !selectedChapter) {
      return;
    }

    let cancelled = false;

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const queueItems = await loadGenerationQueue(projectId);

          if (cancelled) {
            return;
          }

          const queueItem =
            [...queueItems]
              .reverse()
              .find((item) => item.chapterId === selectedChapter.id) ?? null;

          if (!queueItem) {
            return;
          }

          if (queueItem.status === 'running') {
            setDraftItem(queueItem);
            setProgressStage(queueItem.progressStage ?? null);
            setProgressLabel(queueItem.progressLabel ?? '');
            setProgressBeatIndex(queueItem.progressBeatIndex ?? null);
            setProgressBeatCount(queueItem.progressBeatCount ?? null);
            return;
          }

          const nextOutline = await loadChapterOutline(projectId, selectedChapter.id);

          if (cancelled) {
            return;
          }

          setDraftItem(queueItem);
          setOutline(nextOutline ?? null);
          setErrorMessage(queueItem.status === 'error' ? queueItem.errorMessage : '');

          if (queueItem.status === 'ready') {
            setMode('reviewing');
            setReviewText(getQueuePreviewText(queueItem, selectedChapter.content));
          } else if (queueItem.status === 'approved') {
            setMode('approved');
            setReviewText(getQueuePreviewText(queueItem, selectedChapter.content));
          } else if (queueItem.status === 'error') {
            setMode('idle');
            setReviewText('');
          }
          setProgressStage(null);
          setProgressLabel('');
          setProgressBeatIndex(null);
          setProgressBeatCount(null);
        } catch {
          // 轮询只做本地状态收敛，失败时保持当前界面，不额外打断用户。
        }
      })();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mode, projectId, selectedChapter?.id, selectedChapter?.updatedAt]);

  useEffect(() => {
    if (mode !== 'reviewing' || !selectedChapter || !draftItem || draftItem.chapterId !== selectedChapter.id) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'ready',
        generatedText: reviewText,
        outline: draftItem.outline,
        review: draftItem.review,
        languageQa: draftItem.languageQa,
        summary: draftItem.summary,
        stateChanges: draftItem.stateChanges,
        strand: draftItem.strand,
        errorMessage: '',
      });
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftItem, mode, projectId, reviewText, selectedChapter]);

  useEffect(() => {
    if (!showAdvancedPanel || !selectedChapter) {
      return;
    }

    void refreshAdvancedPreview();
  }, [
    showAdvancedPanel,
    selectedChapter?.id,
    selectedChapter?.updatedAt,
    selectedDebugChapterId,
    chapterHint,
    debugChapterQuery,
    debugEntityQuery,
    debugRelationshipQuery,
  ]);

  useEffect(() => {
    if (currentProject?.generationGateOverride) {
      setProjectGateOverrideEnabled(true);
      setProjectGateOverrideDraft(normalizeGenerationGateConfig(currentProject.generationGateOverride));
      return;
    }

    setProjectGateOverrideEnabled(false);
    setProjectGateOverrideDraft(effectiveGateConfig ?? DEFAULT_GENERATION_GATE_CONFIG);
  }, [currentProject?.generationGateOverride, effectiveGateConfig]);

  useEffect(() => {
    void loadChapterBeats(projectId);
  }, [loadChapterBeats, projectId]);

  useEffect(() => {
    void loadEntityRelations(projectId);
  }, [loadEntityRelations, projectId]);

  useEffect(() => {
    setDebugProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!selectedChapter) {
      setSelectedDebugChapterId(null);
      return;
    }

    if (debugProjectId === projectId) {
      setSelectedDebugChapterId((current) => current ?? selectedChapter.id);
    }
  }, [debugProjectId, projectId, selectedChapter?.id]);

  useEffect(() => {
    setSelectedDebugChapterId(null);
  }, [debugProjectId]);

  useEffect(() => {
    if (serverDebugChapters.length === 0) {
      return;
    }

    if (!selectedDebugChapterId || !serverDebugChapters.some((item) => item.chapterId === selectedDebugChapterId)) {
      setSelectedDebugChapterId(serverDebugChapters[0].chapterId);
    }
  }, [serverDebugChapters, selectedDebugChapterId]);

  async function getOutlinePromptPayload(chapterId: Id) {
    const chapter = chapters.find((item) => item.id === chapterId);

    if (!chapter) {
      return {
        bookOutline: undefined,
        volumeOutline: undefined,
        volumeGoal: undefined,
        chapterBeat: undefined,
        nextChapterPreview: undefined,
        forbiddenZone: undefined,
        requiredEntityNames: [],
        availableCharacterNames: [],
        requiredForeshadowTitles: [],
        currentChapterBeat: null,
        nextChapterBeat: null,
        automaticForbiddenZone: {
          phrases: [],
          actionPatterns: [],
          scenePatterns: [],
        },
      };
    }

    return buildChapterPromptPayload(projectId, chapter, chapters);
  }

  async function getPreviousSummaryText(chapter = selectedChapter) {
    if (!chapter) {
      return '';
    }

    const previous = chapters.find((item) => item.order === chapter.order - 1);

    if (!previous) {
      return '';
    }

    const [previousSummary, queueItems] = await Promise.all([
      loadChapterSummary(projectId, previous.id),
      loadGenerationQueueMap(projectId),
    ]);
    const queueMap = new Map(queueItems.map((item) => [item.chapterId, item] as const));

    return getEffectiveChapterSummary(previousSummary ?? null, queueMap.get(previous.id))?.summary ?? '';
  }

  async function getMergedContextBundle(chapter = selectedChapter) {
    if (!chapter) {
      return {
        localBundle: '',
        mergedBundle: '',
      };
    }

    const context = await buildGenerationContextBundle({
      projectId,
      currentChapterId: chapter.id,
      chapters,
      entities,
    });
    const mergedBundle = [
      context.bundle,
      chapterHint.trim() ? `【本章生成提示】\n${chapterHint.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      localBundle: context.bundle,
      mergedBundle,
    };
  }

  async function refreshGenerationContextPreview(chapter = selectedChapter) {
    if (!chapter) {
      return;
    }

    setIsContextPreviewLoading(true);
    setContextPreviewError('');

    try {
      const [context, outlinePromptPayload, previousSummary, savedOutline] = await Promise.all([
        buildGenerationContextBundle({
          projectId,
          currentChapterId: chapter.id,
          chapters,
          entities,
        }),
        getOutlinePromptPayload(chapter.id),
        getPreviousSummaryText(chapter),
        loadChapterOutline(projectId, chapter.id),
      ]);
      const effectiveHint = buildEffectiveChapterHint(chapterHint.trim());
      const chapterHintBlock = effectiveHint.trim() ? `【本章生成提示】\n${effectiveHint.trim()}` : '';
      const mergedBundle = mergePromptSections(context.bundle, chapterHintBlock);
      const activeOutline =
        (outline && getChapterWriteUnitCount(normalizeOutlineDraft(outline)) > 0 ? normalizeOutlineDraft(outline) : null) ??
        (savedOutline && getChapterWriteUnitCount(normalizeOutlineDraft(savedOutline)) > 0 ? normalizeOutlineDraft(savedOutline) : null);
      const reviewOutline =
        (outline && getChapterWriteUnitCount(normalizeOutlineDraft(outline)) > 0 ? normalizeOutlineDraft(outline) : null) ??
        draftItem?.outline ??
        activeOutline;
      const sourceText = getCurrentDraftText();
      const chapterBeatForExecution = reviewOutline ? undefined : outlinePromptPayload.chapterBeat;
      const promptPreviewStages: GenerationPromptPreviewStageRequest[] = [];

      if (!activeOutline) {
        promptPreviewStages.push({
          stage: 'plan',
          label: 'Plan',
          request: {
            projectId,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            chapterOrder: chapter.order,
            volumeTitle: chapter.volumeTitle,
            previousChapterId: previousChapter?.id,
            previousChapterTitle: previousChapter?.title,
            projectTitle,
            projectDescription,
            bookOutline: outlinePromptPayload.bookOutline,
            volumeOutline: outlinePromptPayload.volumeOutline,
            volumeGoal: outlinePromptPayload.volumeGoal,
            chapterBeat: outlinePromptPayload.chapterBeat,
            nextChapterPreview: outlinePromptPayload.nextChapterPreview,
            forbiddenZone: outlinePromptPayload.forbiddenZone,
            previousSummary,
            worldState,
            contextBundle: mergedBundle,
            entitySnapshot,
            relationSnapshot,
            requiredEntityNames: outlinePromptPayload.requiredEntityNames,
            availableCharacterNames: outlinePromptPayload.availableCharacterNames,
            requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
            foreshadowSnapshot,
            ...buildModelRequestConfig(settings),
          },
        });
      }

      if (activeOutline) {
        const writeUnitLabels = getChapterWriteUnitLabels(activeOutline);
        const unitLabel = (activeOutline.sceneDrafts?.length ?? 0) > 0 ? '场景' : '拍';

        writeUnitLabels.forEach((beat, index) => {
          promptPreviewStages.push({
            stage: 'write',
            label: `Write 第 ${index + 1} ${unitLabel}`,
            request: {
              projectId,
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              chapterOrder: chapter.order,
              volumeTitle: chapter.volumeTitle,
              previousChapterId: previousChapter?.id,
              previousChapterTitle: previousChapter?.title,
              projectTitle,
              projectDescription,
              bookOutline: outlinePromptPayload.bookOutline,
              volumeOutline: outlinePromptPayload.volumeOutline,
              volumeGoal: outlinePromptPayload.volumeGoal,
              chapterBeat: undefined,
              nextChapterPreview: outlinePromptPayload.nextChapterPreview,
              forbiddenZone: outlinePromptPayload.forbiddenZone,
              outline: activeOutline,
              beatIndex: index,
              currentBeat: beat,
              previousText: writeUnitLabels.slice(0, index).length > 0 ? '【预检仅展示 prompt，不实际拼接已生成正文】' : '',
              previousSummary,
              worldState,
              contextBundle: mergedBundle,
              entitySnapshot,
              relationSnapshot,
              requiredEntityNames: outlinePromptPayload.requiredEntityNames,
              availableCharacterNames: outlinePromptPayload.availableCharacterNames,
              requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
              foreshadowSnapshot,
              ...buildModelRequestConfig(settings),
            },
          });
        });
      }

      if (sourceText) {
        if (effectiveStylePrompt.trim()) {
          promptPreviewStages.push({
            stage: 'style',
            label: 'Style',
            request: {
              projectId,
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              chapterOrder: chapter.order,
              volumeTitle: chapter.volumeTitle,
              previousChapterId: previousChapter?.id,
              previousChapterTitle: previousChapter?.title,
              projectTitle,
              projectDescription,
              bookOutline: outlinePromptPayload.bookOutline,
              volumeOutline: outlinePromptPayload.volumeOutline,
              outline: reviewOutline ?? null,
              previousSummary,
              worldState,
              contextBundle: mergedBundle,
              entitySnapshot,
              relationSnapshot,
              requiredEntityNames: outlinePromptPayload.requiredEntityNames,
              availableCharacterNames: outlinePromptPayload.availableCharacterNames,
              requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
              foreshadowSnapshot,
              stylePrompt: effectiveStylePrompt,
              content: sourceText,
              ...buildModelRequestConfig(settings),
            },
          });
        }

        promptPreviewStages.push({
          stage: 'review',
          label: 'Review',
          request: {
            projectId,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            chapterOrder: chapter.order,
            volumeTitle: chapter.volumeTitle,
            previousChapterId: previousChapter?.id,
            previousChapterTitle: previousChapter?.title,
            projectTitle,
            projectDescription,
            bookOutline: outlinePromptPayload.bookOutline,
            volumeOutline: outlinePromptPayload.volumeOutline,
            chapterBeat: chapterBeatForExecution,
            outline: reviewOutline ?? null,
            previousSummary,
            worldState,
            contextBundle: mergedBundle,
            entitySnapshot,
            relationSnapshot,
            requiredEntityNames: outlinePromptPayload.requiredEntityNames,
            availableCharacterNames: outlinePromptPayload.availableCharacterNames,
            requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
            foreshadowSnapshot,
            content: sourceText,
            ...buildModelRequestConfig(settings),
          },
        });
        promptPreviewStages.push({
          stage: 'language_qa',
          label: 'Language QA',
          request: {
            projectId,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            chapterOrder: chapter.order,
            volumeTitle: chapter.volumeTitle,
            previousChapterId: previousChapter?.id,
            previousChapterTitle: previousChapter?.title,
            projectTitle,
            projectDescription,
            bookOutline: outlinePromptPayload.bookOutline,
            volumeOutline: outlinePromptPayload.volumeOutline,
            chapterBeat: chapterBeatForExecution,
            outline: reviewOutline ?? null,
            previousSummary,
            worldState,
            contextBundle: mergedBundle,
            entitySnapshot,
            relationSnapshot,
            requiredEntityNames: outlinePromptPayload.requiredEntityNames,
            availableCharacterNames: outlinePromptPayload.availableCharacterNames,
            requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
            foreshadowSnapshot,
            content: sourceText,
            ...buildModelRequestConfig(settings),
          },
        });
        promptPreviewStages.push({
          stage: 'polish',
          label: 'Polish',
          request: {
            projectId,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            chapterOrder: chapter.order,
            volumeTitle: chapter.volumeTitle,
            previousChapterId: previousChapter?.id,
            previousChapterTitle: previousChapter?.title,
            projectTitle,
            projectDescription,
            bookOutline: outlinePromptPayload.bookOutline,
            volumeOutline: outlinePromptPayload.volumeOutline,
            outline: reviewOutline ?? null,
            previousSummary,
            worldState,
            contextBundle: mergedBundle,
            entitySnapshot,
            relationSnapshot,
            requiredEntityNames: outlinePromptPayload.requiredEntityNames,
            availableCharacterNames: outlinePromptPayload.availableCharacterNames,
            requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
            foreshadowSnapshot,
            review: draftItem?.review ?? null,
            languageQa: draftItem?.languageQa ?? null,
            content: sourceText,
            ...buildModelRequestConfig(settings),
          },
        });
        if (enableEditorRefine) {
          promptPreviewStages.push({
            stage: 'editor_refine',
            label: 'Editor Refine',
            request: {
              projectId,
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              chapterOrder: chapter.order,
              volumeTitle: chapter.volumeTitle,
              previousChapterId: previousChapter?.id,
              previousChapterTitle: previousChapter?.title,
              bookOutline: outlinePromptPayload.bookOutline,
              volumeOutline: outlinePromptPayload.volumeOutline,
              outline: reviewOutline ?? null,
              previousSummary,
              entitySnapshot,
              requiredEntityNames: outlinePromptPayload.requiredEntityNames,
              availableCharacterNames: outlinePromptPayload.availableCharacterNames,
              content: sourceText,
              ...buildModelRequestConfig(settings),
            },
          });
        }
        promptPreviewStages.push({
          stage: 'extract',
          label: 'Extract',
          request: {
            projectId,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            chapterOrder: chapter.order,
            chapterBeat: chapterBeatForExecution,
            content: sourceText,
            loreSummary: worldState,
            ...buildModelRequestConfig(settings),
          },
        });
      }
      const promptPreviewResponse =
        promptPreviewStages.length > 0
          ? await previewGenerationPrompts(settings.serverUrl, {
              stages: promptPreviewStages,
            })
          : { previews: [] };

      setContextPreviewData({
        chapterTitle: chapter.title,
        bookOutline: outlinePromptPayload.bookOutline ?? '',
        volumeOutline: outlinePromptPayload.volumeOutline ?? '',
        volumeGoal: outlinePromptPayload.volumeGoal ?? '',
        chapterOutline: activeOutline ? serializeChapterOutlineDraft(activeOutline) : '',
        localBundle: context.bundle,
        effectiveHint,
        mergedBundle,
        rawChapterHint: chapterHint.trim(),
        chapterBeat: outlinePromptPayload.chapterBeat ?? '',
        nextChapterPreview: outlinePromptPayload.nextChapterPreview ?? '',
        forbiddenZone: outlinePromptPayload.forbiddenZone ?? '',
        previousSummary,
        worldState,
        requiredEntityNames: outlinePromptPayload.requiredEntityNames,
        availableCharacterNames: outlinePromptPayload.availableCharacterNames,
        requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
        entitySnapshotCount: entitySnapshot.length,
        relationSnapshotCount: relationSnapshot.length,
        foreshadowSnapshotCount: foreshadowSnapshot?.length ?? 0,
        recentChapterCount: context.recentChapterCount,
        recentSummaryCount: context.recentSummaryCount,
        activeForeshadowCount: context.activeForeshadowCount,
        promptPreviews: promptPreviewResponse.previews,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setContextPreviewError(message);
    } finally {
      setIsContextPreviewLoading(false);
    }
  }

  async function refreshAdvancedPreview() {
    if (!selectedChapter) {
      return;
    }

    const effectiveDebugProjectId = debugProjectId;
    const debugChapterId = selectedDebugChapterId ?? (effectiveDebugProjectId === projectId ? selectedChapter.id : null);

    setIsAdvancedLoading(true);
    setAdvancedError('');

    try {
      const [
        { localBundle },
        nextOverview,
        nextDebugChapters,
        nextServerContext,
        nextRetrieval,
        nextGateConfig,
        nextJobs,
        nextChapterDetail,
        nextEntities,
        nextForeshadows,
        nextMemoryChunks,
        nextRelationships,
        nextVolumeRecaps,
      ] = await Promise.all([
        getMergedContextBundle(selectedChapter),
        fetchGenerationDebugOverview(settings.serverUrl, effectiveDebugProjectId).catch(() => null),
        fetchGenerationDebugChapters(settings.serverUrl, effectiveDebugProjectId, debugChapterQuery).catch(() => []),
        debugChapterId
          ? fetchGenerationDebugContext(settings.serverUrl, effectiveDebugProjectId, debugChapterId).catch(() => null)
          : Promise.resolve(null),
        debugChapterId
          ? fetchGenerationDebugRetrieval(settings.serverUrl, effectiveDebugProjectId, debugChapterId).catch(() => null)
          : Promise.resolve(null),
        fetchGenerationGateConfig(settings.serverUrl).then(normalizeGenerationGateConfig).catch(() => null),
        listGenerationJobs(settings.serverUrl, effectiveDebugProjectId).catch(() => []),
        debugChapterId
          ? fetchGenerationDebugChapterDetail(settings.serverUrl, effectiveDebugProjectId, debugChapterId).catch(() => null)
          : Promise.resolve(null),
        fetchGenerationDebugEntities(settings.serverUrl, effectiveDebugProjectId, debugEntityQuery).catch(() => []),
        fetchGenerationDebugForeshadows(settings.serverUrl, effectiveDebugProjectId, debugChapterQuery).catch(() => []),
        debugChapterId
          ? fetchGenerationDebugMemoryChunks(settings.serverUrl, effectiveDebugProjectId, {
              q: debugChapterQuery,
              chapterId: debugChapterId,
            }).catch(() => [])
          : Promise.resolve([]),
        fetchGenerationDebugRelationships(settings.serverUrl, effectiveDebugProjectId, {
          q: debugRelationshipQuery,
          chapterId: debugChapterId ?? undefined,
        }).catch(() => []),
        fetchGenerationDebugVolumeRecaps(settings.serverUrl, effectiveDebugProjectId, debugChapterQuery).catch(() => []),
      ]);

      setLocalContextPreview(localBundle);
      setServerDebugOverview(nextOverview);
      setServerDebugChapters(nextDebugChapters);
      setServerDebugContext(nextServerContext);
      setServerDebugRetrieval(nextRetrieval);
      setServerDebugChapterDetail(nextChapterDetail);
      setServerDebugEntities(nextEntities);
      setServerDebugForeshadows(nextForeshadows);
      setServerDebugMemoryChunks(nextMemoryChunks);
      setServerDebugRelationships(nextRelationships);
      setServerDebugVolumeRecaps(nextVolumeRecaps);
      setEffectiveGateConfig(nextGateConfig);
      setServerJobs(nextJobs);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setAdvancedError(message);
    } finally {
      setIsAdvancedLoading(false);
    }
  }

  function parseMaintenanceLimit(raw: string) {
    const trimmed = raw.trim();

    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  function buildMaintenanceRequest() {
    if (!selectedChapter) {
      return null;
    }

    const parsedLimit = parseMaintenanceLimit(maintenanceLimitInput);

    if (parsedLimit === null) {
      toast('limit 需要填写大于 0 的整数，留空表示全量', 'warning');
      return null;
    }

    if (maintenanceScope === 'chapter') {
      if (!selectedDebugChapterId) {
        toast('请先选择一个调试章节，再执行当前章节维护', 'warning');
        return null;
      }

      return {
        projectId: debugProjectId,
        chapterId: selectedDebugChapterId,
        limit: parsedLimit,
      };
    }

    return {
      projectId: debugProjectId,
      limit: parsedLimit,
    };
  }

  async function handleBackfillChunks() {
    const request = buildMaintenanceRequest();

    if (!request) {
      return;
    }

    setIsChunkBackfilling(true);

    try {
      const result = await backfillGenerationMemoryChunks(settings.serverUrl, request);
      setLastChunkBackfill(result);
      toast(`切片回填完成：处理 ${result.processedChapters} 章，写入 ${result.totalChunks} 个切片`, 'success');
      if (showAdvancedPanel) {
        await refreshAdvancedPreview();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`回填记忆切片失败：${message}`, 'error');
    } finally {
      setIsChunkBackfilling(false);
    }
  }

  async function handleBackfillEmbeddings() {
    const request = buildMaintenanceRequest();

    if (!request) {
      return;
    }

    setIsEmbeddingBackfilling(true);

    try {
      const result = await backfillGenerationMemoryEmbeddings(settings.serverUrl, request);
      setLastEmbeddingBackfill(result);
      toast(`向量回填完成：新增 ${result.createdChunks}，重建 ${result.rebuiltChunks}，复用 ${result.reusedChunks}`, 'success');
      if (showAdvancedPanel) {
        await refreshAdvancedPreview();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`回填向量缓存失败：${message}`, 'error');
    } finally {
      setIsEmbeddingBackfilling(false);
    }
  }

  async function handleBackfillVolumeRecaps() {
    const parsedLimit = parseMaintenanceLimit(maintenanceLimitInput);

    if (parsedLimit === null) {
      toast('limit 需要填写大于 0 的整数，留空表示全量', 'warning');
      return;
    }

    setIsVolumeRecapBackfilling(true);

    try {
      const result = await backfillGenerationVolumeRecaps(settings.serverUrl, {
        projectId: debugProjectId,
        limit: parsedLimit,
      });
      setLastVolumeRecapBackfill(result);
      toast(`卷总结回填完成：处理 ${result.processedVolumes} 卷，跳过 ${result.skippedVolumes} 卷`, 'success');
      if (showAdvancedPanel) {
        await refreshAdvancedPreview();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`回填卷级总结失败：${message}`, 'error');
    } finally {
      setIsVolumeRecapBackfilling(false);
    }
  }

  async function handleSaveProjectGateOverride() {
    if (!currentProject) {
      return;
    }

    setIsProjectGateSaving(true);

    try {
      const nextOverride = projectGateOverrideEnabled
        ? {
            reviewRewriteMinSeverity: projectGateOverrideDraft.reviewRewriteMinSeverity,
            reviewMaxRewriteCount: Math.max(0, Math.trunc(projectGateOverrideDraft.reviewMaxRewriteCount)),
            reviewScoreThresholds: {
              consistency: Math.max(0, Math.min(100, Math.trunc(projectGateOverrideDraft.reviewScoreThresholds.consistency))),
              continuity: Math.max(0, Math.min(100, Math.trunc(projectGateOverrideDraft.reviewScoreThresholds.continuity))),
              reader_pull: Math.max(0, Math.min(100, Math.trunc(projectGateOverrideDraft.reviewScoreThresholds.reader_pull))),
            },
            polishFailBlockReady: projectGateOverrideDraft.polishFailBlockReady,
            lightweightRecall: {
              minScore: Math.max(0, Math.min(100, Math.trunc(projectGateOverrideDraft.lightweightRecall.minScore))),
              topK: Math.max(0, Math.trunc(projectGateOverrideDraft.lightweightRecall.topK)),
              phraseWeight: Math.max(0, Math.trunc(projectGateOverrideDraft.lightweightRecall.phraseWeight)),
              entityWeight: Math.max(0, Math.trunc(projectGateOverrideDraft.lightweightRecall.entityWeight)),
              recencyWeight: Math.max(0, Math.trunc(projectGateOverrideDraft.lightweightRecall.recencyWeight)),
            },
          }
        : null;

      await updateProject(projectId, {
        generationGateOverride: nextOverride,
      });

      toast(projectGateOverrideEnabled ? '项目级门控覆盖已保存' : '已恢复继承全局门控', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存项目级门控覆盖失败：${message}`, 'error');
    } finally {
      setIsProjectGateSaving(false);
    }
  }

  function getCurrentDraftText() {
    return (
      reviewText.trim() ||
      draftItem?.generatedText.trim() ||
      selectedChapterContentText
    );
  }

  async function syncServerArtifactsForChapter(input: {
    chapterId: Id;
    chapterTitle: string;
    chapterOrder: number;
    volumeTitle?: string;
    previousChapterId?: Id;
    previousChapterTitle?: string;
    content: string;
    outlinePayload: ChapterOutlineDraft | null;
    summaryPayload: ChapterSummaryDraft;
    stateChangesPayload: StateChangeDraft[];
    strandPayload: StrandType;
    reviewPayload?: GenerationQueueItem['review'];
    languageQaPayload?: GenerationQueueItem['languageQa'];
  }) {
    await syncGenerationArtifacts(settings.serverUrl, {
      projectId,
      chapterId: input.chapterId,
      chapterTitle: input.chapterTitle,
      chapterOrder: input.chapterOrder,
      volumeTitle: input.volumeTitle,
      previousChapterId: input.previousChapterId,
      previousChapterTitle: input.previousChapterTitle,
      outline: input.outlinePayload,
      summary: input.summaryPayload,
      stateChanges: input.stateChangesPayload,
      strand: input.strandPayload,
      content: input.content,
      review: input.reviewPayload ?? null,
      languageQa: input.languageQaPayload ?? null,
    });
  }

  function ensureChapterBeatReady() {
    if (currentChapterBeat || outline) {
      return true;
    }

    toast('当前章节还没有章纲或章节拍，请先到「大纲」页补齐章纲，或先补章节拍后再导入。', 'warning');
    return false;
  }

  function ensurePreviousChapterConfirmed() {
    if (!selectedChapter || !previousChapter) {
      return true;
    }

    if (previousChapter.status === 'revised' || previousChapter.status === 'published') {
      return true;
    }

    toast(`请先确认上一章《${previousChapter.title}》，再生成《${selectedChapter.title}》`, 'warning');
    return false;
  }

  async function handleSingleStepPlan() {
    if (!selectedChapter) {
      return;
    }

    if (!ensureChapterBeatReady()) {
      return;
    }

    setActiveSingleStep('plan');

    try {
      const [outlinePromptPayload, previousSummary, { mergedBundle }] = await Promise.all([
        getOutlinePromptPayload(selectedChapter.id),
        getPreviousSummaryText(selectedChapter),
        getMergedContextBundle(selectedChapter),
      ]);
      const chapterBeatForExecution = undefined;
      const response = await createChapterPlan(settings.serverUrl, {
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        chapterOrder: selectedChapter.order,
        volumeTitle: selectedChapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle,
        projectDescription,
        bookOutline: outlinePromptPayload.bookOutline,
        volumeOutline: outlinePromptPayload.volumeOutline,
        volumeGoal: outlinePromptPayload.volumeGoal,
        chapterBeat: outlinePromptPayload.chapterBeat,
        nextChapterPreview: outlinePromptPayload.nextChapterPreview,
        forbiddenZone: outlinePromptPayload.forbiddenZone,
        previousSummary,
        worldState,
        contextBundle: mergePromptSections(
          formatPromptSection(
            '创作模板章节写法约束',
            currentProject?.templateSnapshot?.promptBundle.beatPrompt ||
              currentProject?.templateSnapshot?.promptBundle.writingPrompt,
          ),
          formatPromptSection('创作模板负面约束', currentProject?.templateSnapshot?.promptBundle.negativePrompt),
          mergedBundle,
        ),
        entitySnapshot,
        relationSnapshot,
        requiredEntityNames: outlinePromptPayload.requiredEntityNames,
        availableCharacterNames: outlinePromptPayload.availableCharacterNames,
        requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
        foreshadowSnapshot,
        ...buildModelRequestConfig(settings),
      });

      const savedOutline = await saveChapterOutline(projectId, selectedChapter.id, response.outline, {
        source: 'generated',
      });
      setOutline(savedOutline);
      toast('已完成单步 Plan', 'success');
      if (showAdvancedPanel) {
        await refreshAdvancedPreview();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`单步 Plan 失败：${message}`, 'error');
    } finally {
      setActiveSingleStep(null);
    }
  }

  async function handleSingleStepWrite() {
    if (!selectedChapter) {
      return;
    }

    if (!ensureChapterBeatReady()) {
      return;
    }

    setActiveSingleStep('write');

    try {
      const activeOutline =
        outline && getChapterWriteUnitCount(normalizeOutlineDraft(outline)) > 0 ? normalizeOutlineDraft(outline) : null;

      if (!activeOutline) {
        await handleSingleStepPlan();
      }

      const latestOutline = (outline && getChapterWriteUnitCount(normalizeOutlineDraft(outline)) > 0 ? normalizeOutlineDraft(outline) : null) ??
        (await loadChapterOutline(projectId, selectedChapter.id));

      if (!latestOutline || getChapterWriteUnitCount(normalizeOutlineDraft(latestOutline)) === 0) {
        toast('当前没有可执行的章节契约', 'warning');
        return;
      }

      const [outlinePromptPayload, previousSummary, { mergedBundle }] = await Promise.all([
        getOutlinePromptPayload(selectedChapter.id),
        getPreviousSummaryText(selectedChapter),
        getMergedContextBundle(selectedChapter),
      ]);

      const normalizedOutline = normalizeOutlineDraft(latestOutline);
      const writeUnitLabels = getChapterWriteUnitLabels(normalizedOutline);
      let generatedText = '';
      for (let index = 0; index < writeUnitLabels.length; index += 1) {
        const response = await writeChapterBeat(settings.serverUrl, {
          projectId,
          chapterId: selectedChapter.id,
          chapterTitle: selectedChapter.title,
          chapterOrder: selectedChapter.order,
          volumeTitle: selectedChapter.volumeTitle,
          previousChapterId: previousChapter?.id,
          previousChapterTitle: previousChapter?.title,
          projectTitle,
          projectDescription,
          bookOutline: outlinePromptPayload.bookOutline,
          volumeOutline: outlinePromptPayload.volumeOutline,
          volumeGoal: outlinePromptPayload.volumeGoal,
          chapterBeat: chapterBeatForExecution,
          nextChapterPreview: outlinePromptPayload.nextChapterPreview,
          forbiddenZone: outlinePromptPayload.forbiddenZone,
          outline: normalizedOutline,
          beatIndex: index,
          currentBeat: writeUnitLabels[index],
          previousText: generatedText,
          previousSummary,
          worldState,
          contextBundle: mergePromptSections(
            formatPromptSection(
              '创作模板章节写法约束',
              currentProject?.templateSnapshot?.promptBundle.beatPrompt ||
                currentProject?.templateSnapshot?.promptBundle.writingPrompt,
            ),
            formatPromptSection('创作模板负面约束', currentProject?.templateSnapshot?.promptBundle.negativePrompt),
            mergedBundle,
          ),
          entitySnapshot,
          relationSnapshot,
          requiredEntityNames: outlinePromptPayload.requiredEntityNames,
          availableCharacterNames: outlinePromptPayload.availableCharacterNames,
          requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
          foreshadowSnapshot,
          ...buildModelRequestConfig(settings),
        });

        generatedText = [generatedText, response.content.trim()].filter(Boolean).join('\n\n');
      }

      const nextItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'ready',
        generatedText,
        outline: normalizeOutlineDraft(latestOutline),
        review: null,
        languageQa: null,
        summary: null,
        stateChanges: [],
        strand: null,
        errorMessage: '',
      });

      setDraftItem(nextItem);
      setReviewText(generatedText);
      setMode('reviewing');
      toast('已完成单步 Write，进入审核态', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`单步 Write 失败：${message}`, 'error');
    } finally {
      setActiveSingleStep(null);
    }
  }

  async function handleSingleStepStyle() {
    if (!selectedChapter) {
      return;
    }

    const sourceText = getCurrentDraftText();
    if (!sourceText) {
      toast('当前没有可转译的正文', 'warning');
      return;
    }

    setActiveSingleStep('style');

    try {
      const [outlinePromptPayload, previousSummary, { mergedBundle }] = await Promise.all([
        getOutlinePromptPayload(selectedChapter.id),
        getPreviousSummaryText(selectedChapter),
        getMergedContextBundle(selectedChapter),
      ]);

      const response = await styleChapterDraft(settings.serverUrl, {
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        chapterOrder: selectedChapter.order,
        volumeTitle: selectedChapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle,
        projectDescription,
        bookOutline: outlinePromptPayload.bookOutline,
        volumeOutline: outlinePromptPayload.volumeOutline,
        outline: outline ? normalizeOutlineDraft(outline) : null,
        previousSummary,
        worldState,
        contextBundle: mergedBundle,
        entitySnapshot,
        relationSnapshot,
        requiredEntityNames: outlinePromptPayload.requiredEntityNames,
        availableCharacterNames: outlinePromptPayload.availableCharacterNames,
        requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
        foreshadowSnapshot,
        stylePrompt: effectiveStylePrompt,
        content: sourceText,
        ...buildModelRequestConfig(settings),
      });

      const nextItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'ready',
        generatedText: response.content,
        outline: outline ? normalizeOutlineDraft(outline) : draftItem?.outline ?? null,
        review: null,
        languageQa: null,
        summary: null,
        stateChanges: [],
        strand: null,
        errorMessage: '',
      });

      setDraftItem(nextItem);
      setReviewText(response.content);
      setMode('reviewing');
      toast('已完成单步 Style', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`单步 Style 失败：${message}`, 'error');
    } finally {
      setActiveSingleStep(null);
    }
  }

  async function handleSingleStepReview() {
    if (!selectedChapter) {
      return;
    }

    const sourceText = getCurrentDraftText();
    if (!sourceText) {
      toast('当前没有可审查的正文', 'warning');
      return;
    }

    setActiveSingleStep('review');

    try {
      const [outlinePromptPayload, previousSummary, { mergedBundle }] = await Promise.all([
        getOutlinePromptPayload(selectedChapter.id),
        getPreviousSummaryText(selectedChapter),
        getMergedContextBundle(selectedChapter),
      ]);
      const chapterBeatForExecution = outline || draftItem?.outline ? undefined : outlinePromptPayload.chapterBeat;

      const response = await reviewChapterDraft(settings.serverUrl, {
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        chapterOrder: selectedChapter.order,
        volumeTitle: selectedChapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle,
        projectDescription,
        bookOutline: outlinePromptPayload.bookOutline,
        volumeOutline: outlinePromptPayload.volumeOutline,
        chapterBeat: chapterBeatForExecution,
        outline: outline ? normalizeOutlineDraft(outline) : null,
        previousSummary,
        worldState,
        contextBundle: mergedBundle,
        entitySnapshot,
        relationSnapshot,
        requiredEntityNames: outlinePromptPayload.requiredEntityNames,
        availableCharacterNames: outlinePromptPayload.availableCharacterNames,
        requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
        foreshadowSnapshot,
        content: sourceText,
        ...buildModelRequestConfig(settings),
      });
      const languageQaResponse = await checkChapterLanguageQa(settings.serverUrl, {
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        chapterOrder: selectedChapter.order,
        volumeTitle: selectedChapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle,
        projectDescription,
        bookOutline: outlinePromptPayload.bookOutline,
        volumeOutline: outlinePromptPayload.volumeOutline,
        chapterBeat: chapterBeatForExecution,
        outline: outline ? normalizeOutlineDraft(outline) : null,
        previousSummary,
        worldState,
        contextBundle: mergedBundle,
        entitySnapshot,
        relationSnapshot,
        requiredEntityNames: outlinePromptPayload.requiredEntityNames,
        availableCharacterNames: outlinePromptPayload.availableCharacterNames,
        requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
        foreshadowSnapshot,
        content: sourceText,
        ...buildModelRequestConfig(settings),
      });

      const nextItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'ready',
        generatedText: sourceText,
        outline: outline ? normalizeOutlineDraft(outline) : draftItem?.outline ?? null,
        review: response.review,
        languageQa: languageQaResponse.languageQa,
        summary: draftItem?.summary ?? null,
        stateChanges: draftItem?.stateChanges ?? [],
        strand: draftItem?.strand ?? null,
        errorMessage: '',
      });

      setDraftItem(nextItem);
      setReviewText(sourceText);
      setMode('reviewing');
      toast('已完成单步 Review', response.review.needsRewrite ? 'warning' : 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`单步 Review 失败：${message}`, 'error');
    } finally {
      setActiveSingleStep(null);
    }
  }

  async function handleSingleStepPolish() {
    if (!selectedChapter) {
      return;
    }

    const sourceText = getCurrentDraftText();
    if (!sourceText) {
      toast('当前没有可润色的正文', 'warning');
      return;
    }

    setActiveSingleStep('polish');

    try {
      const [outlinePromptPayload, previousSummary, { mergedBundle }] = await Promise.all([
        getOutlinePromptPayload(selectedChapter.id),
        getPreviousSummaryText(selectedChapter),
        getMergedContextBundle(selectedChapter),
      ]);
      const chapterBeatForExecution = outline || draftItem?.outline ? undefined : outlinePromptPayload.chapterBeat;

      const response = await polishChapterDraft(settings.serverUrl, {
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        chapterOrder: selectedChapter.order,
        volumeTitle: selectedChapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle,
        projectDescription,
        bookOutline: outlinePromptPayload.bookOutline,
        volumeOutline: outlinePromptPayload.volumeOutline,
        chapterBeat: chapterBeatForExecution,
        outline: outline ? normalizeOutlineDraft(outline) : null,
        previousSummary,
        worldState,
        contextBundle: mergedBundle,
        entitySnapshot,
        relationSnapshot,
        requiredEntityNames: outlinePromptPayload.requiredEntityNames,
        availableCharacterNames: outlinePromptPayload.availableCharacterNames,
        requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
        foreshadowSnapshot,
        review: draftItem?.review ?? null,
        languageQa: draftItem?.languageQa ?? null,
        content: sourceText,
        ...buildModelRequestConfig(settings),
      });

      const nextItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'ready',
        generatedText: response.content,
        outline: outline ? normalizeOutlineDraft(outline) : draftItem?.outline ?? null,
        review: draftItem?.review ?? null,
        languageQa: draftItem?.languageQa ?? null,
        summary: draftItem?.summary ?? null,
        stateChanges: draftItem?.stateChanges ?? [],
        strand: draftItem?.strand ?? null,
        errorMessage: '',
      });

      setDraftItem(nextItem);
      setReviewText(response.content);
      setMode('reviewing');
      toast('已完成单步 Polish', response.polish.antiAiForceCheck === 'fail' ? 'warning' : 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`单步 Polish 失败：${message}`, 'error');
    } finally {
      setActiveSingleStep(null);
    }
  }

  async function handleSingleStepExtract() {
    if (!selectedChapter) {
      return;
    }

    const sourceText = getCurrentDraftText();
    if (!sourceText) {
      toast('当前没有可提取的正文', 'warning');
      return;
    }

    setActiveSingleStep('extract');

    try {
      const outlinePromptPayload = await getOutlinePromptPayload(selectedChapter.id);
      const chapterBeatForExecution = outline || draftItem?.outline ? undefined : outlinePromptPayload.chapterBeat;
      const response = await extractChapterState(settings.serverUrl, {
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        chapterOrder: selectedChapter.order,
        chapterBeat: chapterBeatForExecution,
        content: sourceText,
        loreSummary: worldState,
        ...buildModelRequestConfig(settings),
      });
      const savedSummary = await saveChapterSummary(projectId, selectedChapter.id, response.summary);

      await replaceChapterStateChanges(
        projectId,
        selectedChapter.id,
        response.stateChanges,
        buildLoreEntityIdLookup(entities),
      );

      if (response.strand) {
        await appendStrandHistory(projectId, selectedChapter.id, selectedChapter.title, response.strand);
      }

      const nextItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: draftItem?.status ?? 'ready',
        generatedText: sourceText,
        outline: outline ? normalizeOutlineDraft(outline) : draftItem?.outline ?? null,
        review: draftItem?.review ?? null,
        languageQa: draftItem?.languageQa ?? null,
        summary: response.summary,
        stateChanges: response.stateChanges,
        strand: response.strand,
        errorMessage: '',
      });

      setDraftItem(nextItem);
      setSummary(savedSummary);
      setStateChanges(
        response.stateChanges.map((change, index) => ({
          id: `extract-${index}`,
          projectId,
          chapterId: selectedChapter.id,
          entityId: null,
          entityName: change.entityName,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          createdAt: '',
          updatedAt: '',
        })),
      );
      if (response.strand) {
        try {
          await syncServerArtifactsForChapter({
            chapterId: selectedChapter.id,
            chapterTitle: selectedChapter.title,
            chapterOrder: selectedChapter.order,
            volumeTitle: selectedChapter.volumeTitle,
            previousChapterId: previousChapter?.id,
            previousChapterTitle: previousChapter?.title,
            content: sourceText,
            outlinePayload: outline ? normalizeOutlineDraft(outline) : draftItem?.outline ?? null,
            summaryPayload: response.summary,
            stateChangesPayload: response.stateChanges,
            strandPayload: response.strand,
            reviewPayload: draftItem?.review ?? null,
            languageQaPayload: draftItem?.languageQa ?? null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误';
          toast(`本地提取已保存，但服务端状态同步失败：${message}`, 'warning');
        }
      }
      toast('已完成单步 Extract', 'success');
      if (showAdvancedPanel) {
        await refreshAdvancedPreview();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`单步 Extract 失败：${message}`, 'error');
    } finally {
      setActiveSingleStep(null);
    }
  }

  async function handleGenerateChapter() {
    if (!selectedChapter) {
      return;
    }

    if (isLocalGenerationActive(selectedChapter.id)) {
      toast('当前章节正在生成中，请稍候', 'info');
      return;
    }

    if (!ensureChapterBeatReady()) {
      return;
    }

    if (!ensurePreviousChapterConfirmed()) {
      return;
    }

    const hasOutlineOverride = Boolean(outline);
    setMode('generating');
    setErrorMessage('');
    setProgressStage(hasOutlineOverride ? 'write' : 'plan');
    setProgressLabel(hasOutlineOverride ? '读取现有章纲' : '生成章节契约');
    setProgressBeatIndex(null);
    setProgressBeatCount(null);
    markLocalGenerationActive(selectedChapter.id);
    const generationController = new AbortController();
    setLocalGenerationController(selectedChapter.id, generationController);

    try {
      await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'running',
        progressStage: hasOutlineOverride ? 'write' : 'plan',
        progressLabel: hasOutlineOverride ? '读取现有章纲' : '生成章节契约',
        progressBeatIndex: null,
        progressBeatCount: null,
        generatedText: '',
        outline: null,
        review: null,
        languageQa: null,
        summary: null,
        stateChanges: [],
        strand: null,
        errorMessage: '',
      });

      const outlinePromptPayload = await getOutlinePromptPayload(selectedChapter.id);
      const result = await runGenerationPipeline({
        projectId,
        chapter: selectedChapter,
        chapters,
        entities,
        projectTitle,
        projectDescription,
        settings: {
          ...settings,
          stylePrompt: effectiveStylePrompt,
        },
        worldState,
        bookOutline: outlinePromptPayload.bookOutline,
        volumeOutline: outlinePromptPayload.volumeOutline,
        volumeOutlineDraft: chapterVolumeOutline ?? null,
        volumeGoal: outlinePromptPayload.volumeGoal,
        chapterBeat: outline ? undefined : outlinePromptPayload.chapterBeat,
        milestoneIndex: currentChapterBeat?.milestoneIndex ?? null,
        nextChapterPreview: outlinePromptPayload.nextChapterPreview,
        forbiddenZone: outlinePromptPayload.forbiddenZone,
        relationSnapshot,
        requiredEntityNames: outlinePromptPayload.requiredEntityNames,
        availableCharacterNames: outlinePromptPayload.availableCharacterNames,
        requiredForeshadowTitles: outlinePromptPayload.requiredForeshadowTitles,
        foreshadowSnapshot,
        chapterHint: buildEffectiveChapterHint(chapterHint.trim()),
        enableEditorRefine,
        outlineOverride: outline ? normalizeOutlineDraft(outline) : null,
        gateConfig: localGenerationGateConfig,
        signal: generationController.signal,
        onStageChange: async ({ stage, label, beatIndex, beatCount }) => {
          setProgressStage(stage);
          setProgressLabel(label);
          setProgressBeatIndex(typeof beatIndex === 'number' ? beatIndex : null);
          setProgressBeatCount(typeof beatCount === 'number' ? beatCount : null);
          await saveGenerationQueueItem({
            projectId,
            chapterId: selectedChapter.id,
            chapterTitle: selectedChapter.title,
            status: 'running',
            progressStage: stage,
            progressLabel: label,
            progressBeatIndex: typeof beatIndex === 'number' ? beatIndex : null,
            progressBeatCount: typeof beatCount === 'number' ? beatCount : null,
          });
        },
      });
      const savedOutline = await saveChapterOutline(projectId, selectedChapter.id, result.outline, {
        source: 'generated',
      });

      const nextQueueItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'ready',
        generatedText: result.generatedText,
        outline: savedOutline,
        review: result.review,
        languageQa: result.languageQa,
        summary: result.summary,
        stateChanges: result.stateChanges,
        strand: result.strand,
        errorMessage: '',
      });

      setDraftItem(nextQueueItem);
      setOutline(savedOutline);
      setReviewText(result.generatedText);
      setErrorMessage('');
      setMode('reviewing');
      setProgressStage(null);
      setProgressLabel('');
      setProgressBeatIndex(null);
      setProgressBeatCount(null);
      const stillNeedsRewrite =
        result.review.needsRewrite ||
        result.review.antiAiForceCheck === 'fail' ||
        result.review.checkerResults.some(
          (checker) => checker.score < localGenerationGateConfig.reviewScoreThresholds[checker.checker],
        );
      toast(
        stillNeedsRewrite ? '本章已生成，但审查仍未完全通过，请重点修改后再确认' : '本章已生成完成，进入审核状态',
        stillNeedsRewrite ? 'warning' : 'success',
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '未知错误';
      const message = rawMessage === '请求已取消' ? '已取消本地生成' : rawMessage;

      await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'error',
        errorMessage: message,
      });

      setMode('idle');
      setErrorMessage(message);
      setProgressStage(null);
      setProgressLabel('');
      setProgressBeatIndex(null);
      setProgressBeatCount(null);
      toast(
        message === '已取消本地生成' ? message : `生成失败：${message}`,
        message === '已取消本地生成' ? 'warning' : 'error',
      );
    } finally {
      clearLocalGenerationActive(selectedChapter.id);
      clearLocalGenerationController(selectedChapter.id);
    }
  }

  async function handleCancelCurrentGeneration() {
    if (!selectedChapter) {
      return;
    }

    const controller = getLocalGenerationController(selectedChapter.id);

    if (!controller) {
      toast('当前没有可取消的本地生成', 'warning');
      return;
    }

    controller.abort();
    toast('已发送取消请求，正在终止当前生成', 'info');
  }

  async function handleApproveAndNext() {
    if (!selectedChapter || !draftItem) {
      return;
    }

    setIsApproving(true);

    try {
      const currentPlainText = richTextToPlainText(selectedChapter.content).trim();

      if (currentPlainText) {
        await createSnapshot({
          projectId,
          chapterId: selectedChapter.id,
          chapterTitle: selectedChapter.title,
          content: selectedChapter.content,
          source: 'manual',
          note: '通过审核前自动创建快照',
        });
      }

      await saveChapterContent(selectedChapter.id, createParagraphDocument(reviewText));
      await updateChapterStatus(selectedChapter.id, 'revised');

      if (draftItem.outline) {
        await saveChapterOutline(projectId, selectedChapter.id, draftItem.outline);
      }

      if (draftItem.summary) {
        await saveChapterSummary(projectId, selectedChapter.id, draftItem.summary);
      }

      await replaceChapterStateChanges(
        projectId,
        selectedChapter.id,
        draftItem.stateChanges,
        buildLoreEntityIdLookup(entities),
      );

      if (draftItem.strand) {
        await appendStrandHistory(projectId, selectedChapter.id, selectedChapter.title, draftItem.strand);
      }

      const approvedQueueItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'approved',
        generatedText: reviewText,
        outline: draftItem.outline,
        review: draftItem.review,
        languageQa: draftItem.languageQa,
        summary: draftItem.summary,
        stateChanges: draftItem.stateChanges,
        strand: draftItem.strand,
        errorMessage: '',
      });

      if (draftItem.summary && draftItem.strand) {
        try {
          await syncServerArtifactsForChapter({
            chapterId: selectedChapter.id,
            chapterTitle: selectedChapter.title,
            chapterOrder: selectedChapter.order,
            volumeTitle: selectedChapter.volumeTitle,
            previousChapterId: previousChapter?.id,
            previousChapterTitle: previousChapter?.title,
            content: reviewText,
            outlinePayload: draftItem.outline,
            summaryPayload: draftItem.summary,
            stateChangesPayload: draftItem.stateChanges,
            strandPayload: draftItem.strand,
            reviewPayload: draftItem.review,
            languageQaPayload: draftItem.languageQa,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误';
          toast(`正文已通过，但服务端状态同步失败：${message}`, 'warning');
        }
      } else {
        toast('当前章节缺少可同步的摘要或主线标签，服务端状态表暂未更新', 'warning');
      }

      setDraftItem(approvedQueueItem);
      setMode('approved');

      const nextChapter =
        [...chapters]
          .sort((left, right) => left.order - right.order)
          .find((chapter) => chapter.order > selectedChapter.order) ?? null;

      if (nextChapter) {
        setActiveChapter(nextChapter.id);
        toast(`已通过「${selectedChapter.title}」，自动进入下一章`, 'success');
      } else {
        toast(`已通过「${selectedChapter.title}」`, 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`确认通过失败：${message}`, 'error');
    } finally {
      setIsApproving(false);
    }
  }

  async function handleDeepEdit() {
    if (!selectedChapter || !reviewText.trim()) {
      return;
    }

    try {
      await saveChapterContent(selectedChapter.id, createParagraphDocument(reviewText));
      await updateChapterStatus(selectedChapter.id, 'first_draft');
      toast('当前草稿已写入编辑器，可继续深度修改', 'success');
      onOpenEditor?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`写入编辑器失败：${message}`, 'error');
    }
  }

  async function handleRevokeApproved() {
    if (!selectedChapter || !draftItem) {
      return;
    }

    try {
      await updateChapterStatus(selectedChapter.id, 'first_draft');
      const revertedItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'ready',
        generatedText: reviewText || draftItem.generatedText,
        outline: draftItem.outline,
        review: draftItem.review,
        languageQa: draftItem.languageQa,
        summary: draftItem.summary,
        stateChanges: draftItem.stateChanges,
        strand: draftItem.strand,
        errorMessage: '',
      });

      setDraftItem(revertedItem);
      setMode('reviewing');
      toast('已撤回确认，返回审核态', 'warning');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`撤回确认失败：${message}`, 'error');
    }
  }

  async function handleDiscardDraftResult() {
    if (!selectedChapter || !draftItem) {
      return;
    }

    const confirmed = window.confirm(
      shouldResetOutline(outline)
        ? '确认作废当前生成结果吗？这会清空当前审核态正文、本地生成草稿，以及本次生成提取出的摘要和状态变更，并删除自动生成的章纲。'
        : '确认作废当前生成结果吗？这会清空当前审核态正文、本地生成草稿，以及本次生成提取出的摘要和状态变更，但会保留手工维护的章纲。',
    );

    if (!confirmed) {
      return;
    }

    try {
      const discardedItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'discarded',
        generatedText: '',
        outline: shouldResetOutline(outline) ? null : draftItem.outline,
        review: null,
        languageQa: null,
        summary: null,
        stateChanges: [],
        strand: null,
        errorMessage: '',
      });

      if (shouldResetOutline(outline)) {
        await deleteChapterOutline(projectId, selectedChapter.id);
      }
      await deleteChapterSummary(projectId, selectedChapter.id);
      await deleteChapterStateChanges(selectedChapter.id);
      await removeStrandHistory(projectId, selectedChapter.id);

      setDraftItem(discardedItem);
      if (shouldResetOutline(outline)) {
        setOutline(null);
      }
      setSummary(null);
      setStateChanges([]);
      setReviewText('');
      setErrorMessage('');
      setMode('idle');
      toast(
        shouldResetOutline(outline)
          ? '已作废当前生成结果，并清掉自动生成章纲'
          : '已作废当前生成结果，手工章纲已保留',
        'success',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`作废结果失败：${message}`, 'error');
    }
  }

  async function handleResetChapterGenerationState() {
    if (!selectedChapter) {
      return;
    }

    const hasResidualArtifacts =
      Boolean(draftItem) ||
      Boolean(summary) ||
      stateChanges.length > 0 ||
      shouldResetOutline(outline);

    if (!hasResidualArtifacts) {
      toast('当前章节已经是初始状态，无需重置', 'warning');
      return;
    }

    const confirmed = window.confirm(
      shouldResetOutline(outline)
        ? '确认重置本章生成状态吗？这会清空当前生成草稿、摘要、状态变更，并删除自动生成的章纲；不会删除已确认写回的正文主干。'
        : '确认重置本章生成状态吗？这会清空当前生成草稿、摘要、状态变更，但会保留你手工维护的章纲；不会删除已确认写回的正文主干。',
    );

    if (!confirmed) {
      return;
    }

    try {
      const resetQueueItem = await saveGenerationQueueItem({
        projectId,
        chapterId: selectedChapter.id,
        chapterTitle: selectedChapter.title,
        status: 'discarded',
        generatedText: '',
        outline: null,
        review: null,
        languageQa: null,
        summary: null,
        stateChanges: [],
        strand: null,
        errorMessage: '',
      });

      if (shouldResetOutline(outline)) {
        await deleteChapterOutline(projectId, selectedChapter.id);
      }
      await deleteChapterSummary(projectId, selectedChapter.id);
      await deleteChapterStateChanges(selectedChapter.id);
      await removeStrandHistory(projectId, selectedChapter.id);

      setDraftItem(resetQueueItem);
      if (shouldResetOutline(outline)) {
        setOutline(null);
      }
      setSummary(null);
      setStateChanges([]);
      setReviewText('');
      setErrorMessage('');
      setMode('idle');
      toast(
        shouldResetOutline(outline)
          ? '已重置本章生成状态，并清掉自动生成章纲'
          : '已重置本章生成状态，手工章纲已保留',
        'success',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`重置本章生成状态失败：${message}`, 'error');
    }
  }

  const queueRunningCount = serverJobs.filter((job) => job.status === 'running').length;
  const queueReadyCount = serverJobs.filter((job) => job.status === 'ready').length;
  const queuePausedCount = serverJobs.filter((job) => job.status === 'paused').length;
  const queueErrorCount = serverJobs.filter((job) => job.status === 'error').length;
  const recentServerJobs = [...serverJobs]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3);
  const debugChapter = useMemo(
    () =>
      serverDebugChapters.find((item) => item.chapterId === selectedDebugChapterId) ??
      chapters.find((item) => item.id === selectedDebugChapterId) ??
      null,
    [chapters, selectedDebugChapterId, serverDebugChapters],
  );
  const selectedChapterTitle = selectedChapter?.title ?? '未选中章节';
  const debugChapterTitle = useMemo(() => {
    if (!debugChapter) {
      return selectedChapterTitle;
    }

    return 'chapterTitle' in debugChapter ? debugChapter.chapterTitle : debugChapter.title;
  }, [debugChapter, selectedChapterTitle]);
  const matchedProjectLightweightRecallPreset = useMemo(
    () => findMatchingLightweightRecallPreset(projectGateOverrideDraft.lightweightRecall),
    [projectGateOverrideDraft.lightweightRecall],
  );
  const filteredRetrievalItems = useMemo(() => {
    const query = retrievalFilterQuery.trim().toLowerCase();

    if (!serverDebugRetrieval?.items) {
      return [];
    }

    return serverDebugRetrieval.items.filter((item) => {
      if (retrievalOriginFilter !== 'all' && item.retrievalHitOrigin !== retrievalOriginFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        item.title,
        item.chapterTitle,
        item.contentExcerpt,
        item.summaryExcerpt,
        item.matchedTerms.join(' '),
        item.matchedEntityNames.join(' '),
        item.rerankReasons.join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [retrievalFilterQuery, retrievalOriginFilter, serverDebugRetrieval?.items]);
  const filteredMemoryChunks = useMemo(() => {
    const query = memoryChunkFilterQuery.trim().toLowerCase();

    return serverDebugMemoryChunks.filter((item) => {
      if (memoryChunkKindFilter !== 'all' && item.chunkKind !== memoryChunkKindFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        item.chapterTitle,
        item.summaryExcerpt,
        item.content,
        item.entityRefs.join(' '),
        item.locations.join(' '),
        item.sourceKind,
        item.chunkKind,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [memoryChunkFilterQuery, memoryChunkKindFilter, serverDebugMemoryChunks]);
  const filteredForeshadows = useMemo(() => {
    return serverDebugForeshadows.filter((item) => {
      if (foreshadowLifecycleFilter !== 'all' && item.lifecycle !== foreshadowLifecycleFilter) {
        return false;
      }

      return true;
    });
  }, [foreshadowLifecycleFilter, serverDebugForeshadows]);
  const filteredRelationships = useMemo(() => {
    return serverDebugRelationships.filter((item) => {
      if (relationshipSourceKindFilter !== 'all' && item.sourceKind !== relationshipSourceKindFilter) {
        return false;
      }

      return true;
    });
  }, [relationshipSourceKindFilter, serverDebugRelationships]);
  const filteredEntities = useMemo(() => {
    return serverDebugEntities.filter((item) => {
      if (entityPinnedOnly && !item.pinned) {
        return false;
      }

      return true;
    });
  }, [entityPinnedOnly, serverDebugEntities]);
  const relationshipSourceKinds = useMemo(
    () => Array.from(new Set(serverDebugRelationships.map((item) => item.sourceKind).filter(Boolean))).sort(),
    [serverDebugRelationships],
  );
  const memoryChunkKinds = useMemo(
    () => Array.from(new Set(serverDebugMemoryChunks.map((item) => item.chunkKind).filter(Boolean))).sort(),
    [serverDebugMemoryChunks],
  );
  const localRepetitionCheck = useMemo(
    () =>
      runLocalRepetitionChecker({
        currentText: reviewText.trim() || draftItem?.generatedText || '',
        currentChapterBeat,
        previousChapterBeats,
        recentChapterTexts,
      }),
    [currentChapterBeat, draftItem?.generatedText, previousChapterBeats, recentChapterTexts, reviewText],
  );
  const serverRepetitionIssues = useMemo(
    () =>
      draftItem?.review
        ? draftItem.review.checkerResults.flatMap((checker) =>
            checker.issues
              .filter((issue) => isRepetitionRelatedReviewIssue(checker.checker, issue))
              .map((issue) => ({
                ...issue,
                checker: checker.checker,
              })),
          )
        : [],
    [draftItem?.review],
  );
  const repetitionPanelSeverity = useMemo(() => {
    const localSeverity = localRepetitionCheck.severity;
    const serverSeverity =
      serverRepetitionIssues.reduce<string | undefined>((highest, issue) => {
        if (!highest || getSeverityWeight(issue.severity) > getSeverityWeight(highest)) {
          return issue.severity;
        }

        return highest;
      }, undefined) ?? localSeverity;

    return getSeverityWeight(serverSeverity) > getSeverityWeight(localSeverity)
      ? serverSeverity
      : localSeverity;
  }, [localRepetitionCheck.severity, serverRepetitionIssues]);
  const mergedRepetitionSuggestions = useMemo(() => {
    const next = [
      ...serverRepetitionIssues.map((issue) => issue.suggestion).filter(Boolean),
      ...localRepetitionCheck.suggestions,
    ];

    return Array.from(new Set(next));
  }, [localRepetitionCheck.suggestions, serverRepetitionIssues]);

  if (!selectedChapter) {
    return (
      <div className="flex min-h-0 flex-1">
        <EmptyState
          icon={<Sparkles size={22} />}
          title="还没有可生成的章节"
          description="先在左侧创建一章，再进入生成流程。"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-4">
      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">生成</p>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-100">{selectedChapter.title}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              {projectDescription || '当前项目暂无简介。'} 当前章节状态为“{formatChapterStatus(selectedChapter.status)}”。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setShowContextPreviewDialog(true);
                void refreshGenerationContextPreview(selectedChapter);
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              <Eye size={16} />
              预检注入上下文
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">所属卷</p>
            <p className="mt-2 text-sm text-neutral-200">{selectedChapter.volumeTitle || '未分卷'}</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">前序章节</p>
            <p className="mt-2 text-sm text-neutral-200">{previousChapter?.title ?? '无'}</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">现有契约</p>
            <p className="mt-2 text-sm text-neutral-200">
              {outline ? `${getChapterWriteUnitCount(normalizeOutlineDraft(outline))} 个写作单元` : '尚未生成'}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">状态变更</p>
            <p className="mt-2 text-sm text-neutral-200">{stateChanges.length} 条</p>
          </div>
        </div>
      </section>

      {mode === 'idle' ? (
        <section className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
          <article className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
            <div className="flex items-center gap-2 text-sm text-neutral-300">
              <ClipboardList size={16} className="text-indigo-300" />
              当前章节信息
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">章节契约</p>
                {isLoadingArtifacts ? (
                  <p className="mt-3 text-sm text-neutral-500">正在读取章节契约...</p>
                ) : outline ? (
                  <div className="mt-3 space-y-2 text-sm text-neutral-300">
                    <p>目标：{outline.goal || '未填写'}</p>
                    <p>阻力：{outline.obstacle || '未填写'}</p>
                    <p>代价：{outline.cost || '未填写'}</p>
                    <p>Strand：{getStrandLabel(outline.strand)}</p>
                    <p>写作单元：{getChapterWriteUnitLabels(normalizeOutlineDraft(outline)).length > 0 ? getChapterWriteUnitLabels(normalizeOutlineDraft(outline)).join(' / ') : '未生成'}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-neutral-500">当前还没有章节契约，生成时会先执行 Plan。</p>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">当前正文</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                  {selectedChapterContentText || '当前还没有正文，生成通过或写入编辑器后会在这里同步预览。'}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">本章生成提示</p>
                <textarea
                  value={chapterHint}
                  onChange={(event) => setChapterHint(event.target.value)}
                  rows={5}
                  placeholder="可选填写：例如希望本章更强调冲突、悬念或某条关系线。"
                  className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-900/80 px-3 py-3 text-sm leading-6 text-neutral-200 outline-none transition focus:border-indigo-400"
                />
              </div>

              {!currentChapterBeat && !outline ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5" />
                    <div>
                      <p className="font-medium">当前章节缺少章纲或章节拍</p>
                      <p className="mt-2 leading-6 text-amber-100/90">
                        正文生成至少需要章纲或章节拍其一。你可以直接去「大纲」页新建章纲，或先补齐章节拍后再导入为章纲。
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">
                    {outline ? '当前章纲' : '本章节拍'}
                  </p>
                  {outline ? (
                    <div className="mt-3 space-y-2 text-sm leading-6 text-emerald-50/90">
                      <p>本章功能：{outline.chapterFunction || outline.goal || '未填写'}</p>
                      <p>焦点角色：{outline.focusCharacter || '未填写'}</p>
                      <p>主线推进：{outline.mainPlot || '未填写'}</p>
                      <p>章节钩子：{outline.chapterHook || '未填写'}</p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2 text-sm leading-6 text-emerald-50/90">
                      <p>场景功能：{currentChapterBeat?.scenePurpose || '未填写'}</p>
                      <p>焦点角色：{currentChapterBeat?.focusCharacter || '未填写'}</p>
                      <p>章节钩子：{currentChapterBeat?.hookOut || '未填写'}</p>
                      <p>能力变化幅度：{currentChapterBeat?.powerDelta || '未填写'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">开始生成</p>
            <p className="mt-4 text-sm leading-6 text-neutral-400">
              点击后会按
              {enableEditorRefine
                ? ' `Plan → Write → Style → Review → Polish → Editor Refine → Extract` '
                : ' `Plan → Write → Style → Review → Polish → Extract` '}
              运行，`Review` 后会自动补做一次语言校对，并在完成后进入页面内审核态。
            </p>

            <label className="mt-4 flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={enableEditorRefine}
                onChange={(event) => setEnableEditorRefine(event.target.checked)}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-indigo-500"
              />
              <span>启用 Editor Refine 统筹改稿</span>
            </label>

            {errorMessage ? (
              <div className={`mt-4 rounded-2xl border p-4 text-sm ${errorMeta.panelClassName}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <div>
                    <p className={`font-medium ${errorMeta.titleClassName}`}>{errorMeta.title}</p>
                    <p className="mt-2 leading-6">{errorMessage}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleGenerateChapter()}
              disabled={!currentChapterBeat && !outline}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={16} />
              生成本章
            </button>

            {onOpenOutline ? (
              <button
                type="button"
                onClick={onOpenOutline}
                className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/20"
              >
                <WandSparkles size={16} />
                去大纲页修正规划
              </button>
            ) : null}

            {(draftItem || summary || stateChanges.length > 0 || shouldResetOutline(outline)) ? (
              <button
                type="button"
                onClick={() => void handleResetChapterGenerationState()}
                className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/20"
              >
                <XCircle size={16} />
                重置本章生成状态
              </button>
            ) : null}
          </article>
        </section>
      ) : null}

      {mode === 'generating' ? (
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-indigo-200">
              <LoaderCircle size={16} className="animate-spin" />
              {formatStageDescription(progressStage, progressBeatIndex, progressBeatCount, progressLabel, pipelineStages)}
            </div>
            <button
              type="button"
              onClick={() => void handleCancelCurrentGeneration()}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-100 transition-colors hover:bg-red-500/20"
            >
              <XCircle size={16} />
              取消当前生成
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {pipelineStages.map((stage) => {
              const active = progressStage === stage.key;
              const completed =
                progressStage !== null &&
                pipelineStages.findIndex((item) => item.key === stage.key) <
                  pipelineStages.findIndex((item) => item.key === progressStage);

              return (
                <div
                  key={stage.key}
                  className={`rounded-2xl border px-4 py-4 text-sm ${
                    active
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                      : completed
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-neutral-800 bg-neutral-950/70 text-neutral-500'
                  }`}
                >
                  <p className="font-medium">{stage.label}</p>
                  <p className="mt-2 text-xs">
                    {active ? '进行中' : completed ? '已完成' : '等待中'}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {mode === 'reviewing' && draftItem ? (
        <section className="grid min-h-0 gap-5 xl:grid-cols-[1.4fr_1fr]">
          <article className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
            <div className="flex items-center gap-2 text-sm text-neutral-300">
              <PencilLine size={16} className="text-indigo-300" />
              审核态正文
            </div>
            <textarea
              value={reviewText}
              onChange={(event) => setReviewText(event.target.value)}
              rows={24}
              className="mt-4 min-h-[520px] w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-4 text-sm leading-7 text-neutral-200 outline-none transition focus:border-indigo-400"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleApproveAndNext()}
                disabled={isApproving || !reviewText.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isApproving ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                通过并进入下一章
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateChapter()}
                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
              >
                <RotateCcw size={16} />
                重新生成
              </button>
              <button
                type="button"
                onClick={() => void handleSingleStepExtract()}
                disabled={isApproving || activeSingleStep !== null || !reviewText.trim()}
                className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {activeSingleStep === 'extract' ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <ClipboardList size={16} />
                )}
                {activeSingleStep === 'extract' ? 'Extract 中...' : '重新 Extract'}
              </button>
              <button
                type="button"
                onClick={() => void handleDiscardDraftResult()}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-100 transition-colors hover:bg-red-500/20"
              >
                <XCircle size={16} />
                作废结果
              </button>
              <button
                type="button"
                onClick={() => void handleDeepEdit()}
                className="inline-flex items-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-sm text-indigo-200 transition-colors hover:bg-indigo-500/20"
              >
                <ArrowRight size={16} />
                在编辑器中深度修改
              </button>
            </div>
            <p className="mt-3 text-xs leading-6 text-neutral-500">
              如果你在审核态手动改了正文，确认前记得重新 Extract，一并刷新摘要、状态变更和主线标签。
            </p>
          </article>

          <article className="space-y-5 rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">章节契约</p>
              {draftItem.outline ? (
                <div className="mt-3 space-y-2 text-sm text-neutral-300">
                  <p>目标：{draftItem.outline.goal || '未填写'}</p>
                  <p>阻力：{draftItem.outline.obstacle || '未填写'}</p>
                  <p>代价：{draftItem.outline.cost || '未填写'}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">暂无契约信息</p>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">审查结果</p>
              {draftItem.review ? (
                <div className="mt-3 space-y-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${getSeverityBadgeClassName(
                      draftItem.review.overallSeverity,
                    )}`}
                  >
                    {draftItem.review.overallSeverity}
                  </span>
                  <p className="text-sm leading-6 text-neutral-300">{draftItem.review.summary}</p>
                  <div className="space-y-2">
                    {draftItem.review.checkerResults.flatMap((checker) =>
                      checker.issues.slice(0, 2).map((issue, index) => (
                        <div key={`${checker.checker}-${index}`} className="rounded-xl border border-neutral-800 px-3 py-3 text-sm text-neutral-300">
                          <p className="font-medium text-neutral-100">{issue.title}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                            {checker.checker} / {issue.severity}
                          </p>
                          <p className="mt-2 leading-6">{issue.description}</p>
                        </div>
                      )),
                    )}
                    {draftItem.review.checkerResults.every((checker) => checker.issues.length === 0) ? (
                      <p className="text-sm text-neutral-500">当前没有显著问题，可直接人工确认。</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">暂无审查结果</p>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">语言校对</p>
              {draftItem.languageQa ? (
                <div className="mt-3 space-y-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${getSeverityBadgeClassName(
                      draftItem.languageQa.severity,
                    )}`}
                  >
                    {draftItem.languageQa.severity}
                  </span>
                  <p className="text-sm leading-6 text-neutral-300">{draftItem.languageQa.summary}</p>
                  {draftItem.languageQa.formatWarning ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs leading-6 text-amber-100">
                      <p className="font-medium text-amber-50">已自动修复模型返回格式</p>
                      <p className="mt-1">{draftItem.languageQa.formatWarning.message}</p>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {draftItem.languageQa.issues.slice(0, 4).map((issue, index) => (
                      <div key={`language-qa-${index}`} className="rounded-xl border border-neutral-800 px-3 py-3 text-sm text-neutral-300">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-neutral-100">{issue.title}</p>
                          <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                            {issue.severity}
                          </span>
                        </div>
                        <p className="mt-2 leading-6">{issue.description}</p>
                        {issue.suggestion ? (
                          <p className="mt-2 text-xs leading-6 text-neutral-500">建议：{issue.suggestion}</p>
                        ) : null}
                        {issue.evidence ? (
                          <p className="mt-1 text-xs leading-6 text-neutral-500">证据：{issue.evidence}</p>
                        ) : null}
                      </div>
                    ))}
                    {draftItem.languageQa.issues.length === 0 ? (
                      <p className="text-sm text-neutral-500">当前没有明显语言层问题，仍建议人工顺读一遍。</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">尚未执行语言校对</p>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">重复检测</p>
              <div className="mt-3 space-y-3">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${getSeverityBadgeClassName(
                    repetitionPanelSeverity,
                  )}`}
                >
                  {repetitionPanelSeverity}
                </span>

                {serverRepetitionIssues.length > 0 ? (
                  <div className="text-sm text-neutral-300">
                    <p className="font-medium text-neutral-100">服务端审查命中的重复/空转问题</p>
                    <div className="mt-2 space-y-2">
                      {serverRepetitionIssues.map((issue, index) => (
                        <div
                          key={`server-repetition-${issue.checker}-${index}`}
                          className="rounded-xl border border-neutral-800 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-neutral-100">{issue.title}</p>
                            <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                              {issue.checker} / {issue.severity}
                            </span>
                          </div>
                          <p className="mt-2 leading-6">{issue.description}</p>
                          {issue.evidence ? (
                            <p className="mt-2 text-xs leading-6 text-neutral-500">证据：{issue.evidence}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {localRepetitionCheck.repeatedPhrases.length > 0 ? (
                  <div className="text-sm text-neutral-300">
                    <p className="font-medium text-neutral-100">命中的重复短语</p>
                    <p className="mt-2 leading-6">
                      {localRepetitionCheck.repeatedPhrases.join(' / ')}
                    </p>
                  </div>
                ) : null}

                {localRepetitionCheck.metaphorTriggers.length > 0 ? (
                  <div className="text-sm text-neutral-300">
                    <p className="font-medium text-neutral-100">高频比喻触发词</p>
                    <p className="mt-2 leading-6">
                      {localRepetitionCheck.metaphorTriggers.join(' / ')}
                    </p>
                  </div>
                ) : null}

                {localRepetitionCheck.repeatedActionPatterns.length > 0 ? (
                  <div className="text-sm text-neutral-300">
                    <p className="font-medium text-neutral-100">人物动作模板重复</p>
                    <p className="mt-2 leading-6">
                      {localRepetitionCheck.repeatedActionPatterns.join(' / ')}
                    </p>
                  </div>
                ) : null}

                {localRepetitionCheck.repeatedScenePatterns.length > 0 ? (
                  <div className="text-sm text-neutral-300">
                    <p className="font-medium text-neutral-100">命中的重复场景模板</p>
                    <p className="mt-2 leading-6">
                      {localRepetitionCheck.repeatedScenePatterns.join(' / ')}
                    </p>
                  </div>
                ) : null}

                {localRepetitionCheck.repeatedChapterFunctions.length > 0 ? (
                  <div className="text-sm text-neutral-300">
                    <p className="font-medium text-neutral-100">章节功能重复</p>
                    <div className="mt-2 space-y-2">
                      {localRepetitionCheck.repeatedChapterFunctions.map((item, index) => (
                        <p key={`${item}-${index}`} className="leading-6">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                {mergedRepetitionSuggestions.length > 0 ? (
                  <div className="text-sm text-neutral-300">
                    <p className="font-medium text-neutral-100">建议重写方向</p>
                    <div className="mt-2 space-y-2">
                      {mergedRepetitionSuggestions.map((item, index) => (
                        <p key={`${item}-${index}`} className="leading-6">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">
                    当前没有明显重复风险，但仍建议人工再扫一遍句式与章法。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">状态变更</p>
              {draftItem.stateChanges.length > 0 ? (
                <div className="mt-3 space-y-2 text-sm text-neutral-300">
                  {draftItem.stateChanges.map((change, index) => (
                    <p key={`${change.entityName}-${change.field}-${index}`}>
                      {change.entityName} → {change.field}：{change.oldValue} → {change.newValue}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">当前没有提取到状态变更。</p>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">伏笔变动</p>
              {draftItem.summary?.foreshadowings && draftItem.summary.foreshadowings.length > 0 ? (
                <div className="mt-3 space-y-2 text-sm text-neutral-300">
                  {draftItem.summary.foreshadowings.map((item, index) => (
                    <p key={`${item}-${index}`}>{item}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">当前没有提取到伏笔变动。</p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {mode === 'approved' && draftItem ? (
        <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <article className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-2 text-sm text-emerald-200">
              <CheckCircle2 size={16} />
              本章已确认
            </div>
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-200">
                {reviewText.trim() || richTextToPlainText(selectedChapter.content).trim() || '当前没有正文预览。'}
              </p>
            </div>
          </article>

          <article className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">下一步</p>
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">摘要信息</p>
              <p className="mt-3 text-sm leading-6 text-neutral-300">
                {draftItem.summary?.summary || summary?.summary || '当前还没有摘要信息。'}
              </p>
              {(draftItem.summary?.hook || summary?.hook) ? (
                <p className="mt-3 text-sm text-indigo-200">钩子：{draftItem.summary?.hook || summary?.hook}</p>
              ) : null}
            </div>
            <p className="mt-4 text-sm leading-6 text-neutral-400">
              当前章节已经写回主干。你可以重新生成，或切到编辑视图继续精修。
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleRevokeApproved()}
                className="inline-flex items-center gap-2 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-100 transition-colors hover:bg-yellow-500/20"
              >
                <RotateCcw size={16} />
                撤回确认
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateChapter()}
                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
              >
                <RotateCcw size={16} />
                重新生成
              </button>
              {onOpenEditor ? (
                <button
                  type="button"
                  onClick={onOpenEditor}
                  className="inline-flex items-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-sm text-indigo-200 transition-colors hover:bg-indigo-500/20"
                >
                  <ArrowRight size={16} />
                  前往编辑视图
                </button>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70">
        <button
          type="button"
          onClick={() => setShowAdvancedPanel((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">高级选项</p>
            <p className="mt-2 text-sm text-neutral-400">
              页面内查看上下文、检索预览，并执行单步生成。
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 p-2 text-neutral-400">
            {showAdvancedPanel ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </button>

        {showAdvancedPanel ? (
          <div className="border-t border-neutral-800 px-5 py-5">
            <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <article className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-200">单步执行</p>
                    <p className="mt-1 text-xs leading-6 text-neutral-500">
                      直接在当前页面执行单个阶段，便于定点调试。
                    </p>
                  </div>
                  {activeSingleStep ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200">
                      <LoaderCircle size={12} className="animate-spin" />
                      {pipelineStages.find((item) => item.key === activeSingleStep)?.label ?? activeSingleStep}
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleSingleStepPlan()}
                    disabled={mode === 'generating' || isApproving || activeSingleStep !== null}
                    className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    单步 Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSingleStepWrite()}
                    disabled={mode === 'generating' || isApproving || activeSingleStep !== null}
                    className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    单步 Write
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSingleStepStyle()}
                    disabled={mode === 'generating' || isApproving || activeSingleStep !== null || !effectiveStylePrompt.trim()}
                    className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    单步 Style
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSingleStepReview()}
                    disabled={mode === 'generating' || isApproving || activeSingleStep !== null}
                    className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    单步 Review
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSingleStepPolish()}
                    disabled={mode === 'generating' || isApproving || activeSingleStep !== null}
                    className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    单步 Polish
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSingleStepExtract()}
                    disabled={mode === 'generating' || isApproving || activeSingleStep !== null}
                    className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    单步 Extract
                  </button>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 text-xs leading-6 text-neutral-500">
                  当前草稿长度：{getCurrentDraftText().length} 字
                  <br />
                  当前模式：{mode}
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <p className="text-sm font-medium text-neutral-200">服务端队列摘要</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                      <p className="text-neutral-500">运行中</p>
                      <p className="mt-1 text-base font-medium text-indigo-200">{queueRunningCount}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                      <p className="text-neutral-500">待确认</p>
                      <p className="mt-1 text-base font-medium text-yellow-200">{queueReadyCount}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                      <p className="text-neutral-500">已暂停</p>
                      <p className="mt-1 text-base font-medium text-sky-200">{queuePausedCount}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                      <p className="text-neutral-500">失败</p>
                      <p className="mt-1 text-base font-medium text-red-200">{queueErrorCount}</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">最近任务</p>
                    {recentServerJobs.length > 0 ? (
                      recentServerJobs.map((job) => (
                        <div key={job.id} className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                          <p className="font-medium text-neutral-100">{job.chapterTitle}</p>
                          <p className="mt-1 text-neutral-500">
                            {job.status} / {job.currentStep}
                          </p>
                          {job.reviewGateReason ? (
                            <p className="mt-2 leading-6 text-neutral-400">{job.reviewGateReason}</p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs leading-6 text-neutral-500">当前项目还没有服务端队列任务。</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-200">维护入口</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        当前页先回迁最常用的三项回填能力。
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">作用范围</span>
                      <select
                        value={maintenanceScope}
                        onChange={(event) => setMaintenanceScope(event.target.value as 'project' | 'chapter')}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400"
                      >
                        <option value="chapter">当前章节</option>
                        <option value="project">整个项目</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">limit（可留空）</span>
                      <input
                        value={maintenanceLimitInput}
                        onChange={(event) => setMaintenanceLimitInput(event.target.value)}
                        placeholder="留空表示全量"
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-indigo-400"
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => void handleBackfillChunks()}
                      disabled={isChunkBackfilling || isEmbeddingBackfilling || isVolumeRecapBackfilling}
                      className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isChunkBackfilling ? '切片回填中...' : '回填切片'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBackfillEmbeddings()}
                      disabled={isChunkBackfilling || isEmbeddingBackfilling || isVolumeRecapBackfilling}
                      className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isEmbeddingBackfilling ? '向量回填中...' : '回填向量'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBackfillVolumeRecaps()}
                      disabled={isChunkBackfilling || isEmbeddingBackfilling || isVolumeRecapBackfilling}
                      className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isVolumeRecapBackfilling ? '卷总结回填中...' : '回填卷总结'}
                    </button>
                  </div>

                  <div className="mt-3 space-y-2 text-xs leading-6 text-neutral-500">
                    {lastChunkBackfill ? (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-3">
                        <p className="text-neutral-200">最近切片回填结果</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <p>处理章节：{lastChunkBackfill.processedChapters}</p>
                          <p>候选章节：{lastChunkBackfill.totalCandidates}</p>
                          <p>总切片：{lastChunkBackfill.totalChunks}</p>
                          <p>父切片：{lastChunkBackfill.parentChunks}</p>
                          <p>子切片：{lastChunkBackfill.childChunks}</p>
                          <p>缺内容章节：{lastChunkBackfill.missingContentChapters}</p>
                        </div>
                      </div>
                    ) : null}
                    {lastEmbeddingBackfill ? (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-3">
                        <p className="text-neutral-200">最近向量回填结果</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <p>新增：{lastEmbeddingBackfill.createdChunks}</p>
                          <p>重建：{lastEmbeddingBackfill.rebuiltChunks}</p>
                          <p>复用：{lastEmbeddingBackfill.reusedChunks}</p>
                          <p>跳过：{lastEmbeddingBackfill.skippedChunks}</p>
                          <p>写入向量：{lastEmbeddingBackfill.embeddedChunks}</p>
                          <p>模型：{lastEmbeddingBackfill.embeddingModel || '未配置'}</p>
                          <p className="sm:col-span-2">
                            跳过原因：未启用 {lastEmbeddingBackfill.skipReasonCounts.embeddingDisabled} / 空内容 {lastEmbeddingBackfill.skipReasonCounts.emptyContent} / 失败 {lastEmbeddingBackfill.skipReasonCounts.embeddingFailed}
                          </p>
                          <p className="sm:col-span-2">
                            后端：配置 {lastEmbeddingBackfill.vectorBackend.configuredBackend} / 生效 {lastEmbeddingBackfill.vectorBackend.activeBackend}
                          </p>
                          {lastEmbeddingBackfill.vectorBackend.fallbackReason ? (
                            <p className="sm:col-span-2 text-amber-300">
                              回退原因：{lastEmbeddingBackfill.vectorBackend.fallbackReason}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {lastVolumeRecapBackfill ? (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-3">
                        <p className="text-neutral-200">最近卷总结回填结果</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <p>总卷数：{lastVolumeRecapBackfill.totalVolumes}</p>
                          <p>处理卷数：{lastVolumeRecapBackfill.processedVolumes}</p>
                          <p>跳过卷数：{lastVolumeRecapBackfill.skippedVolumes}</p>
                          <p className="sm:col-span-2">
                            已处理：{lastVolumeRecapBackfill.processedVolumeTitles.join('、') || '暂无'}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {!lastChunkBackfill && !lastEmbeddingBackfill && !lastVolumeRecapBackfill ? (
                      <p>当前还没有执行过维护操作。</p>
                    ) : null}
                  </div>
                </div>
              </article>

              <article className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-200">上下文与检索预览</p>
                    <p className="mt-1 text-xs leading-6 text-neutral-500">
                      优先展示当前页面的本地上下文，其次展示服务端调试结果。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshAdvancedPreview()}
                    disabled={isAdvancedLoading}
                    className="rounded-2xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAdvancedLoading ? '刷新中...' : '刷新预览'}
                  </button>
                </div>

                {advancedError ? (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-xs leading-6 text-red-200">
                    读取高级预览失败：{advancedError}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs leading-6 text-neutral-400">
                      <p>
                        当前调试项目：
                        <span className="ml-2 text-neutral-200">
                          {allProjects.find((project) => project.id === debugProjectId)?.title ?? currentProject?.title ?? '未知项目'}
                        </span>
                      </p>
                      <p>
                        当前创作章节：
                        <span className="ml-2 text-neutral-200">{selectedChapter.title}</span>
                      </p>
                      <p>
                        当前调试章节：
                        <span className="ml-2 text-neutral-200">{debugChapterTitle}</span>
                      </p>
                    </div>
                    {selectedDebugChapterId && selectedChapter.id !== selectedDebugChapterId ? (
                      <button
                        type="button"
                        onClick={() => setSelectedDebugChapterId(selectedChapter.id)}
                        className="rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-xs text-indigo-200 transition-colors hover:bg-indigo-500/20"
                      >
                        回到当前创作章节
                      </button>
                    ) : (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
                        调试章节已跟随当前创作章节
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">调试项目</span>
                      <select
                        value={debugProjectId}
                        onChange={(event) => setDebugProjectId(event.target.value)}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400"
                      >
                        {allProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => setDebugProjectId(projectId)}
                        disabled={debugProjectId === projectId}
                        className="rounded-2xl border border-neutral-700 px-4 py-3 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        回到当前项目
                      </button>
                    </div>
                  </div>
                  {debugProjectId !== projectId ? (
                    <p className="mt-3 text-xs leading-6 text-amber-200">
                      当前已切换到跨项目调试模式。下面的服务端调试、队列与维护入口将作用于所选调试项目；“本地上下文包”仍显示当前创作项目章节的本地上下文。
                    </p>
                  ) : null}
                </div>

                {serverDebugOverview ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">项目级总览</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                        <p className="text-neutral-500">生成任务</p>
                        <p className="mt-1 text-base font-medium text-indigo-200">{serverDebugOverview.counts.generationJobs}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                        <p className="text-neutral-500">章节摘要</p>
                        <p className="mt-1 text-base font-medium text-emerald-200">{serverDebugOverview.counts.chapterSummaries}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                        <p className="text-neutral-500">状态变更</p>
                        <p className="mt-1 text-base font-medium text-sky-200">{serverDebugOverview.counts.stateChanges}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                        <p className="text-neutral-500">实体 / 关系</p>
                        <p className="mt-1 text-base font-medium text-fuchsia-200">
                          {serverDebugOverview.counts.entities} / {serverDebugOverview.counts.relationships}
                        </p>
                      </div>
                      <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                        <p className="text-neutral-500">卷总结</p>
                        <p className="mt-1 text-base font-medium text-amber-200">{serverDebugOverview.counts.volumeRecaps}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                        <p className="text-neutral-500">记忆切片 / 向量</p>
                        <p className="mt-1 text-base font-medium text-cyan-200">
                          {serverDebugOverview.counts.memoryChunks} / {serverDebugOverview.counts.memoryEmbeddings}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-400">章节筛选</span>
                    <input
                      value={debugChapterQuery}
                      onChange={(event) => setDebugChapterQuery(event.target.value)}
                      placeholder="章节标题 / 摘要 / beat"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-indigo-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-400">实体筛选</span>
                    <input
                      value={debugEntityQuery}
                      onChange={(event) => setDebugEntityQuery(event.target.value)}
                      placeholder="实体名 / 类型 / 标签"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-indigo-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-400">关系筛选</span>
                    <input
                      value={debugRelationshipQuery}
                      onChange={(event) => setDebugRelationshipQuery(event.target.value)}
                      placeholder="关系词 / 实体 / 证据"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-indigo-400"
                    />
                  </label>
                </div>

                <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">最近任务</p>
                    {serverDebugOverview?.recentJobs.length ? (
                      <div className="mt-3 space-y-2">
                        {serverDebugOverview.recentJobs.map((job) => (
                          <button
                            key={job.id}
                            type="button"
                            onClick={() => setSelectedDebugChapterId(job.chapterId)}
                            className={`w-full rounded-xl border px-3 py-3 text-left text-xs transition-colors ${
                              job.chapterId === selectedDebugChapterId
                                ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                                : 'border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'
                            }`}
                          >
                            <p className="font-medium">{job.chapterTitle}</p>
                            <p className="mt-1 text-neutral-500">{job.status} / {job.currentStep}</p>
                            <p className="mt-1 text-neutral-500">{job.updatedAt}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs leading-6 text-neutral-500">暂无最近任务。</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">章节索引</p>
                    {serverDebugChapters.length ? (
                      <>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {serverDebugChapters.slice(0, chapterIndexLimit).map((item) => (
                            <button
                              key={item.chapterId}
                              type="button"
                              onClick={() => setSelectedDebugChapterId(item.chapterId)}
                              className={`rounded-xl border px-3 py-3 text-left text-xs transition-colors ${
                                item.chapterId === selectedDebugChapterId
                                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                                  : 'border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'
                              }`}
                            >
                              <p className="font-medium text-neutral-100">{item.chapterTitle}</p>
                              <p className="mt-1 text-neutral-500">
                                时间锚点：{item.timeAnchor || '暂无'} / Strand：{item.strand || '暂无'}
                              </p>
                            </button>
                          ))}
                        </div>
                        {renderLoadMoreActions(
                          chapterIndexLimit,
                          serverDebugChapters.length,
                          () => setChapterIndexLimit((current) => current + 8),
                          () => setChapterIndexLimit(8),
                        )}
                      </>
                    ) : (
                      <p className="mt-3 text-xs leading-6 text-neutral-500">当前没有章节索引结果。</p>
                    )}
                  </div>
                </div>

                {serverDebugChapterDetail ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">章节明细</p>
                    <div className="mt-3 space-y-3 text-xs leading-6 text-neutral-300">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <p>章节序号：{serverDebugChapterDetail.chapterOrder || '暂无'}</p>
                        <p>卷名：{serverDebugChapterDetail.volumeTitle || '暂无'}</p>
                        <p>上一章：{serverDebugChapterDetail.previousChapterTitle || '暂无'}</p>
                        <p>时间锚点：{serverDebugChapterDetail.timeAnchor || '暂无'}</p>
                        <p>Strand：{serverDebugChapterDetail.strand || '暂无'}</p>
                        <p>节拍数：{serverDebugChapterDetail.beatCount}</p>
                        <p className="sm:col-span-2">
                          Hook：{serverDebugChapterDetail.hookType || '暂无'} / {serverDebugChapterDetail.hookStrength || '暂无'}
                        </p>
                      </div>
                      <p>实体：{serverDebugChapterDetail.entitiesAppeared.join('、') || '暂无'}</p>
                      <p>地点：{serverDebugChapterDetail.locations.join('、') || '暂无'}</p>
                      <p>摘要：{serverDebugChapterDetail.summaryExcerpt || '暂无'}</p>
                      <p>钩子：{serverDebugChapterDetail.hook || '暂无'}</p>
                      <p>伏笔：{serverDebugChapterDetail.foreshadowings.join('、') || '暂无'}</p>
                      <p>不可变事实：{serverDebugChapterDetail.immutableFacts.join('、') || '暂无'}</p>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">本地上下文包</p>
                  <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-6 text-neutral-300">
                    {localContextPreview || '点击“刷新预览”后显示当前页面会使用的本地上下文。'}
                  </pre>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">服务端 Context 调试</p>
                    {serverDebugContext ? (
                      <div className="mt-3 space-y-3 text-xs leading-6 text-neutral-300">
                        <p>聚焦实体：{serverDebugContext.focusEntityNames.join(' / ') || '无'}</p>
                        <p>检索短语：{serverDebugContext.queryPhrases.join(' / ') || '无'}</p>
                        <p>关系层：{serverDebugContext.relationshipCount} 条</p>
                        <p>轻量召回：{serverDebugContext.lightweightRecallItems.length} 条</p>
                        <p>Bundle 长度：{serverDebugContext.bundle.length} 字符</p>

                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
                          <p className="text-neutral-200">4.3b 关系摘要</p>
                          <div className="mt-2 space-y-1 text-neutral-500">
                            <p>命中模式：{serverDebugContext.structuredRelationshipDebug.mode}</p>
                            <p>命中原因：{serverDebugContext.structuredRelationshipDebug.reason}</p>
                            <p>
                              二度评估：{serverDebugContext.structuredRelationshipDebug.evaluatedTwoHop ? '已评估' : '未评估'}；
                              二跳路径块：{serverDebugContext.structuredRelationshipDebug.hasTwoHopPathBlock ? '有' : '无'}
                            </p>
                            <p>焦点实体：{serverDebugContext.structuredRelationshipDebug.focusEntityNames.join('、') || '无'}</p>
                            <p>接入策略：{serverDebugContext.structuredRelationshipDebug.policy || '暂无'}</p>
                            <p>未触发类别：{serverDebugContext.structuredRelationshipDebug.nonTriggerCategory || '无'}</p>
                            {serverDebugContext.structuredRelationshipDebug.secondaryEvaluation ? (
                              <p>
                                备选评估：{serverDebugContext.structuredRelationshipDebug.secondaryEvaluation.label} /
                                {serverDebugContext.structuredRelationshipDebug.secondaryEvaluation.reason} /
                                {serverDebugContext.structuredRelationshipDebug.secondaryEvaluation.raw || '暂无'}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs leading-6 text-neutral-500">当前还没有拿到服务端 context 调试结果。</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">当前门控摘要</p>
                    {effectiveGateConfig ? (
                      <div className="mt-3 space-y-2 text-xs leading-6 text-neutral-300">
                        <p>Review 门槛：{effectiveGateConfig.reviewRewriteMinSeverity}</p>
                        <p>最大重写：{effectiveGateConfig.reviewMaxRewriteCount}</p>
                        <p>
                          轻量召回：
                          minScore {effectiveGateConfig.lightweightRecall.minScore} / topK {effectiveGateConfig.lightweightRecall.topK}
                        </p>
                        <p>
                          召回权重：
                          词 {effectiveGateConfig.lightweightRecall.phraseWeight} / 实体 {effectiveGateConfig.lightweightRecall.entityWeight} / 时序 {effectiveGateConfig.lightweightRecall.recencyWeight}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs leading-6 text-neutral-500">当前还没有读取到后端门控摘要。</p>
                    )}
                  </div>
                </div>

                {serverDebugContext?.lightweightRecallItems.length ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">轻量召回明细</p>
                    <div className="mt-3 space-y-2">
                      {serverDebugContext.lightweightRecallItems.slice(0, lightweightRecallLimit).map((item, index) => (
                        <button
                          key={`${item.sourceType}-${item.title}-${index}`}
                          type="button"
                          className="rounded-xl border border-neutral-800 px-3 py-3 text-left text-xs text-neutral-300"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200">
                              {formatLightweightRecallSourceLabel(item.sourceType)}
                            </span>
                            <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200">
                              分数 {item.score}
                            </span>
                            <p className="text-neutral-100">{item.title}</p>
                          </div>
                          <p className="mt-2 text-neutral-500">
                            命中词：{item.matchedPhrases.join('、') || '暂无'}；命中实体：{item.matchedEntities.join('、') || '暂无'}
                          </p>
                          <p className="mt-1 text-neutral-500">
                            分项：词 {item.scoreBreakdown.phrase} / 实体 {item.scoreBreakdown.entity} / 时序 {item.scoreBreakdown.recency}
                          </p>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-neutral-400">{item.block}</pre>
                        </button>
                      ))}
                    </div>
                    {renderLoadMoreActions(
                      lightweightRecallLimit,
                      serverDebugContext.lightweightRecallItems.length,
                      () => setLightweightRecallLimit((current) => current + 4),
                      () => setLightweightRecallLimit(4),
                    )}
                  </div>
                ) : null}

                {serverDebugContext?.sections.length ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">Context 分层块</p>
                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                      {serverDebugContext.sections.map((section) => (
                        <div key={section.key} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
                          <p className="text-sm text-neutral-200">{section.title}</p>
                          <div className="mt-2 space-y-2">
                            {section.blocks.map((block, index) => (
                              <pre
                                key={`${section.key}-${index}`}
                                className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-xs leading-6 text-neutral-400"
                              >
                                {block}
                              </pre>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {serverDebugEntities.length ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">实体快照</p>
                      <label className="flex items-center gap-2 text-xs text-neutral-400">
                        <input
                          type="checkbox"
                          checked={entityPinnedOnly}
                          onChange={(event) => setEntityPinnedOnly(event.target.checked)}
                          className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-indigo-500"
                        />
                        仅看钉选
                      </label>
                    </div>
                    <div className="mt-3 grid gap-2 xl:grid-cols-2">
                      {filteredEntities.slice(0, entityLimit).map((item) => (
                        <div key={`${item.entityName}-${item.updatedAt}`} className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                          <p className="font-medium text-neutral-100">{item.entityName}</p>
                          <p className="mt-1 text-neutral-500">
                            类型：{item.entityType || 'unknown'}{item.pinned ? ' / 已钉选' : ''}
                          </p>
                          <p className="mt-1">描述：{item.description || '暂无'}</p>
                          <p className="mt-1">标签：{item.tags.join('、') || '暂无'}</p>
                          <p className="mt-1">最近章节：{item.lastSeenChapterTitle}</p>
                        </div>
                      ))}
                    </div>
                    {renderLoadMoreActions(
                      entityLimit,
                      filteredEntities.length,
                      () => setEntityLimit((current) => current + 6),
                      () => setEntityLimit(6),
                    )}
                  </div>
                ) : null}

                {serverDebugRelationships.length ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">关系抽取</p>
                      <select
                        value={relationshipSourceKindFilter}
                        onChange={(event) => setRelationshipSourceKindFilter(event.target.value)}
                        className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-xs text-neutral-200 outline-none transition focus:border-indigo-400"
                      >
                        <option value="all">全部来源</option>
                        {relationshipSourceKinds.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-3 space-y-2">
                      {filteredRelationships.slice(0, relationshipLimit).map((item) => (
                        <div key={item.id} className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                          <p className="font-medium text-neutral-100">
                            {item.sourceEntityName}
                            <span className="mx-2 text-neutral-600">→</span>
                            {item.targetEntityName || '未识别目标'}
                          </p>
                          <p className="mt-1">类型：{item.relationshipType}</p>
                          <p className="mt-1">来源：{item.sourceKind}</p>
                          <p className="mt-1">证据：{item.evidence || item.description}</p>
                          <p className="mt-1 text-neutral-500">{item.chapterTitle}</p>
                        </div>
                      ))}
                    </div>
                    {renderLoadMoreActions(
                      relationshipLimit,
                      filteredRelationships.length,
                      () => setRelationshipLimit((current) => current + 6),
                      () => setRelationshipLimit(6),
                    )}
                  </div>
                ) : null}

                {serverDebugForeshadows.length ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">服务端伏笔</p>
                      <select
                        value={foreshadowLifecycleFilter}
                        onChange={(event) => setForeshadowLifecycleFilter(event.target.value as 'all' | 'active' | 'dormant' | 'archived')}
                        className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-xs text-neutral-200 outline-none transition focus:border-indigo-400"
                      >
                        <option value="all">全部生命周期</option>
                        <option value="active">仅激活</option>
                        <option value="dormant">仅休眠</option>
                        <option value="archived">仅归档</option>
                      </select>
                    </div>
                    <div className="mt-3 grid gap-2 xl:grid-cols-2">
                      {filteredForeshadows.slice(0, foreshadowLimit).map((item) => (
                        <div key={`${item.id}-${item.updatedAt}`} className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                          <p className="font-medium text-neutral-100">{item.title}</p>
                          <p className="mt-1">生命周期：{formatForeshadowLifecycleLabel(item.lifecycle)}</p>
                          <p className="mt-1">来源状态：{formatForeshadowStatusLabel(item.status)}</p>
                          <p className="mt-1">来源：{item.sourceChapterTitle || '未关联章节'}</p>
                          <p className="mt-1">
                            来源章序：{item.sourceChapterOrder > 0 ? item.sourceChapterOrder : '暂无'}
                            {item.chapterGap === null ? '' : ` / 与最新章节相差 ${item.chapterGap} 章`}
                          </p>
                          <p className="mt-1">回收：{item.resolvedChapterTitle || '尚未回收'}</p>
                          <p className="mt-1 text-neutral-500">{item.excerpt || item.notes || '暂无说明'}</p>
                        </div>
                      ))}
                    </div>
                    {renderLoadMoreActions(
                      foreshadowLimit,
                      filteredForeshadows.length,
                      () => setForeshadowLimit((current) => current + 6),
                      () => setForeshadowLimit(6),
                    )}
                  </div>
                ) : null}

                {serverDebugMemoryChunks.length ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">记忆切片</p>
                      <select
                        value={memoryChunkKindFilter}
                        onChange={(event) => setMemoryChunkKindFilter(event.target.value)}
                        className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-xs text-neutral-200 outline-none transition focus:border-indigo-400"
                      >
                        <option value="all">全部切片类型</option>
                        {memoryChunkKinds.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      value={memoryChunkFilterQuery}
                      onChange={(event) => setMemoryChunkFilterQuery(event.target.value)}
                      placeholder="按章节 / 摘要 / 内容 / 实体 / 地点过滤"
                      className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-indigo-400"
                    />
                    <div className="mt-3 space-y-2">
                      {filteredMemoryChunks.slice(0, memoryChunkLimit).map((item) => (
                        <div key={item.id} className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-neutral-100">{item.chapterTitle}</p>
                            <span className="rounded-full bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300">
                              {item.chunkKind}
                            </span>
                            <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200">
                              {item.sourceKind}
                            </span>
                          </div>
                          <p className="mt-1 text-neutral-500">
                            章序：{item.chapterOrder} / 切片序号：{item.chunkIndex} / token {item.tokenCount}
                          </p>
                          <p className="mt-1 text-neutral-500">
                            实体：{item.entityRefs.join('、') || '暂无'} / 地点：{item.locations.join('、') || '暂无'}
                          </p>
                          <p className="mt-1 text-neutral-500">摘要：{item.summaryExcerpt || '暂无'}</p>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-neutral-400">{item.content || '暂无内容'}</pre>
                        </div>
                      ))}
                    </div>
                    {renderLoadMoreActions(
                      memoryChunkLimit,
                      filteredMemoryChunks.length,
                      () => setMemoryChunkLimit((current) => current + 6),
                      () => setMemoryChunkLimit(6),
                    )}
                  </div>
                ) : null}

                {serverDebugVolumeRecaps.length ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">卷级总结</p>
                    <div className="mt-3 grid gap-2 xl:grid-cols-2">
                      {serverDebugVolumeRecaps.slice(0, volumeRecapLimit).map((item) => (
                        <div key={`${item.volumeTitle}-${item.updatedAt}`} className="rounded-xl border border-neutral-800 px-3 py-3 text-xs text-neutral-300">
                          <p className="font-medium text-neutral-100">{item.volumeTitle}</p>
                          <p className="mt-1">
                            范围：
                            {item.startChapterOrder > 0 && item.endChapterOrder > 0
                              ? `第 ${item.startChapterOrder} - ${item.endChapterOrder} 章`
                              : `累计 ${item.chapterCount} 章`}
                          </p>
                          <p className="mt-1">提要：{item.summary || '暂无'}</p>
                          <p className="mt-1">高亮：{item.highlights.join('、') || '暂无'}</p>
                        </div>
                      ))}
                    </div>
                    {renderLoadMoreActions(
                      volumeRecapLimit,
                      serverDebugVolumeRecaps.length,
                      () => setVolumeRecapLimit((current) => current + 6),
                      () => setVolumeRecapLimit(6),
                    )}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-200">项目级门控参数</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        当前配置会随项目本地保存，并在加入服务端队列时固化到任务请求。
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-neutral-300">
                      <input
                        type="checkbox"
                        checked={projectGateOverrideEnabled}
                        onChange={(event) => setProjectGateOverrideEnabled(event.target.checked)}
                        className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-indigo-500"
                      />
                      项目覆盖
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">Review 自动重写级别</span>
                      <select
                        value={projectGateOverrideDraft.reviewRewriteMinSeverity}
                        onChange={(event) =>
                          setProjectGateOverrideDraft((current) => ({
                            ...current,
                            reviewRewriteMinSeverity: event.target.value as GenerationGateConfig['reviewRewriteMinSeverity'],
                          }))
                        }
                        disabled={!projectGateOverrideEnabled}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="critical">critical</option>
                        <option value="high">high</option>
                        <option value="medium">medium</option>
                        <option value="low">low</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">最大自动重写次数</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={projectGateOverrideDraft.reviewMaxRewriteCount}
                        onChange={(event) =>
                          setProjectGateOverrideDraft((current) => ({
                            ...current,
                            reviewMaxRewriteCount: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          }))
                        }
                        disabled={!projectGateOverrideEnabled}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">一致性最低分</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={projectGateOverrideDraft.reviewScoreThresholds.consistency}
                        onChange={(event) =>
                          setProjectGateOverrideDraft((current) => ({
                            ...current,
                            reviewScoreThresholds: {
                              ...current.reviewScoreThresholds,
                              consistency: Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))),
                            },
                          }))
                        }
                        disabled={!projectGateOverrideEnabled}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">连贯性最低分</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={projectGateOverrideDraft.reviewScoreThresholds.continuity}
                        onChange={(event) =>
                          setProjectGateOverrideDraft((current) => ({
                            ...current,
                            reviewScoreThresholds: {
                              ...current.reviewScoreThresholds,
                              continuity: Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))),
                            },
                          }))
                        }
                        disabled={!projectGateOverrideEnabled}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">追读力最低分</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={projectGateOverrideDraft.reviewScoreThresholds.reader_pull}
                        onChange={(event) =>
                          setProjectGateOverrideDraft((current) => ({
                            ...current,
                            reviewScoreThresholds: {
                              ...current.reviewScoreThresholds,
                              reader_pull: Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))),
                            },
                          }))
                        }
                        disabled={!projectGateOverrideEnabled}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">轻量召回最低分</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={projectGateOverrideDraft.lightweightRecall.minScore}
                        onChange={(event) =>
                          setProjectGateOverrideDraft((current) => ({
                            ...current,
                            lightweightRecall: {
                              ...current.lightweightRecall,
                              minScore: Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))),
                            },
                          }))
                        }
                        disabled={!projectGateOverrideEnabled}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-400">轻量召回 Top-K</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={projectGateOverrideDraft.lightweightRecall.topK}
                        onChange={(event) =>
                          setProjectGateOverrideDraft((current) => ({
                            ...current,
                            lightweightRecall: {
                              ...current.lightweightRecall,
                              topK: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                            },
                          }))
                        }
                        disabled={!projectGateOverrideEnabled}
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                  </div>

                  <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-neutral-200">轻量召回权重预设</p>
                        <p className="mt-1 text-xs leading-6 text-neutral-500">
                          当前：{matchedProjectLightweightRecallPreset ? matchedProjectLightweightRecallPreset.label : '自定义权重'}
                        </p>
                      </div>
                      <p className="text-[11px] text-neutral-500">
                        词 {projectGateOverrideDraft.lightweightRecall.phraseWeight} / 实体 {projectGateOverrideDraft.lightweightRecall.entityWeight} / 时序 {projectGateOverrideDraft.lightweightRecall.recencyWeight}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {LIGHTWEIGHT_RECALL_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() =>
                            setProjectGateOverrideDraft((current) => ({
                              ...current,
                              lightweightRecall: applyLightweightRecallPreset(current.lightweightRecall, preset.key),
                            }))
                          }
                          disabled={!projectGateOverrideEnabled}
                          className="rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="mt-3 flex items-start gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={projectGateOverrideDraft.polishFailBlockReady}
                      onChange={(event) =>
                        setProjectGateOverrideDraft((current) => ({
                          ...current,
                          polishFailBlockReady: event.target.checked,
                        }))
                      }
                      disabled={!projectGateOverrideEnabled}
                      className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <div>
                      <p className="text-sm text-neutral-200">Polish 失败时阻止进入 ready</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        关闭后，即使润色终检返回 fail，任务也允许继续进入待确认。
                      </p>
                    </div>
                  </label>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleSaveProjectGateOverride()}
                      disabled={isProjectGateSaving}
                      className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isProjectGateSaving ? '保存中...' : '保存项目门控'}
                    </button>
                    <p className="text-xs leading-6 text-neutral-500">
                      当前模式：{projectGateOverrideEnabled ? '项目覆盖' : '继承全局'}
                    </p>
                    {onOpenAdvancedConsole ? (
                      <button
                        type="button"
                        onClick={onOpenAdvancedConsole}
                        className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                      >
                        <WandSparkles size={16} />
                        打开兼容控制台
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">检索预览</p>
                  {serverDebugRetrieval ? (
                    <div className="mt-3 space-y-3 text-xs leading-6 text-neutral-300">
                      <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
                        <input
                          value={retrievalFilterQuery}
                          onChange={(event) => setRetrievalFilterQuery(event.target.value)}
                          placeholder="按命中词 / 实体 / 内容 / 重排依据过滤"
                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-600 focus:border-indigo-400"
                        />
                        <select
                          value={retrievalOriginFilter}
                          onChange={(event) => setRetrievalOriginFilter(event.target.value as 'all' | 'lexical_only' | 'vector_only' | 'hybrid')}
                          className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400"
                        >
                          <option value="all">全部命中模式</option>
                          <option value="lexical_only">词法命中</option>
                          <option value="vector_only">向量补救</option>
                          <option value="hybrid">混合命中</option>
                        </select>
                      </div>
                      <p>
                        候选：{filteredRetrievalItems.length} 条 / 向量来源：{serverDebugRetrieval.vectorSearch.source}
                      </p>
                      {filteredRetrievalItems.slice(0, retrievalLimit).map((item) => (
                        <div key={item.id} className="rounded-xl border border-neutral-800 px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-neutral-100">{item.title}</p>
                            <span className="rounded-full bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300">
                              {item.sourceType}
                            </span>
                            <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200">
                              {formatRetrievalHitOriginLabel(item.retrievalHitOrigin)}
                            </span>
                            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                              {item.score.toFixed(2)}
                            </span>
                          </div>
                          <p className="mt-2 text-neutral-500">
                            命中词：{item.matchedTerms.join('、') || '暂无'}
                          </p>
                          <p className="mt-1 text-neutral-500">
                            命中实体：{item.matchedEntityNames.join('、') || '暂无'}
                          </p>
                          <p className="mt-1 text-neutral-500">
                            重排依据：{item.rerankReasons.join('；') || '无'}
                          </p>
                          <p className="mt-1 text-neutral-500">
                            {item.vectorSimilarity !== null ? `向量相似度 ${item.vectorSimilarity.toFixed(3)}` : '无向量相似度'}
                          </p>
                          <p className="mt-2 text-neutral-300">{item.contentExcerpt || item.summaryExcerpt}</p>
                        </div>
                      ))}
                      {renderLoadMoreActions(
                        retrievalLimit,
                        filteredRetrievalItems.length,
                        () => setRetrievalLimit((current) => current + 6),
                        () => setRetrievalLimit(6),
                      )}
                      {filteredRetrievalItems.length === 0 ? (
                        <p className="text-neutral-500">当前没有检索命中。</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-6 text-neutral-500">当前还没有拿到检索调试结果。</p>
                  )}
                </div>
              </article>
            </div>
          </div>
        ) : null}
      </section>

      <GenerationContextPreviewDialog
        open={showContextPreviewDialog}
        loading={isContextPreviewLoading}
        error={contextPreviewError}
        preview={contextPreviewData}
        onClose={() => setShowContextPreviewDialog(false)}
        onRefresh={() => void refreshGenerationContextPreview()}
      />
    </div>
  );
}
