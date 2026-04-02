import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  RefreshCcw,
  Server,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import { GenerationLabDialog } from '@/components/GenerationLabDialog';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { useToast } from '@/components/Toast';
import { db } from '@/lib/db';
import {
  backfillGenerationMemoryChunks,
  backfillGenerationMemoryEmbeddings,
  backfillGenerationVolumeRecaps,
  fetchGenerationDebugContext,
  fetchGenerationDebugChapterDetail,
  fetchGenerationDebugChapters,
  fetchGenerationDebugMemoryChunks,
  fetchGenerationDebugRetrieval,
  fetchGenerationDebugEntities,
  fetchGenerationDebugForeshadows,
  fetchGenerationDebugOverview,
  fetchGenerationDebugRelationships,
  fetchGenerationDebugVolumeRecaps,
} from '@/lib/generation-debug-client';
import {
  DEFAULT_GENERATION_GATE_CONFIG,
  applyLightweightRecallPreset,
  findMatchingLightweightRecallPreset,
  LIGHTWEIGHT_RECALL_PRESETS,
  normalizeGenerationGateConfig,
} from '@/lib/generation-gate-defaults';
import { buildGenerationForeshadowSnapshot } from '@/lib/generation-foreshadow-snapshot';
import { buildGenerationContextBundle } from '@/lib/generation-context';
import {
  approveGenerationJob,
  batchUpdateGenerationJobs,
  clearResolvedGenerationJobs,
  createChapterPlan,
  discardGenerationJob,
  enqueueGenerationJobs,
  listGenerationJobs,
  pauseGenerationJob,
  reprioritizeGenerationJob,
  rollbackGenerationJobStage,
  resumeGenerationJob,
  retryGenerationJob,
} from '@/lib/generation-client';
import { fetchGenerationGateConfig } from '@/lib/server-config-client';
import {
  appendStrandHistory,
  loadChapterSummary,
  loadStrandTracker,
  replaceChapterStateChanges,
  saveChapterOutline,
  saveChapterSummary,
} from '@/lib/generation-storage';
import { createParagraphDocument } from '@/lib/editor-content';
import { buildWorldStateSummary, findPreviousChapter, getStrandLabel } from '@/lib/generation-utils';
import { useEditorStore, useForeshadowStore, useLoreStore, useProjectStore, useSettingsStore, useSnapshotStore } from '@/stores';
import type {
  ChapterOutlineDraft,
  ChapterOutline,
  ChapterSummary,
  GenerationDebugContext,
  GenerationDebugChapterDetail,
  GenerationDebugChapterRecord,
  GenerationDebugForeshadowRecord,
  GenerationMaintenanceBackfillRequest,
  GenerationDebugMemoryChunkRecord,
  GenerationDebugRetrieval,
  GenerationDebugVolumeRecapRecord,
  GenerationDebugEntityRecord,
  GenerationDebugOverview,
  GenerationDebugRelationshipRecord,
  GenerationGateConfig,
  GenerationJobRecord,
  GenerationMemoryChunkBackfillResult,
  GenerationMemoryEmbeddingBackfillResult,
  GenerationVolumeRecapBackfillResult,
  Id,
  ProjectGenerationGateOverride,
  StateChange,
  StrandTracker,
} from '@/types';

interface GenerationWorkspaceProps {
  projectId: Id;
  projectTitle: string;
  projectDescription?: string;
  onOpenChapter: (chapterId: Id) => void;
}

type GenerationMaintenanceScope = 'project' | 'chapter';

interface GenerationMaintenanceRunSnapshot {
  kind: 'chunks' | 'volume-recaps' | 'embeddings';
  scope: GenerationMaintenanceScope;
  chapterTitle: string;
  limit?: number;
}

interface GenerationMaintenanceResultSnapshot<T> {
  scope: GenerationMaintenanceScope;
  chapterTitle: string;
  limit?: number;
  finishedAt: string;
  result: T;
}

function createStateChangeMap(changes: StateChange[]) {
  const map = new Map<Id, number>();

  for (const change of changes) {
    map.set(change.chapterId, (map.get(change.chapterId) ?? 0) + 1);
  }

  return map;
}

function createEmptyOutlineDraft(): ChapterOutlineDraft {
  return {
    goal: '',
    obstacle: '',
    cost: '',
    beats: [],
    timeAnchor: '',
    chapterTimeSpan: '',
    gapFromPrevious: '',
    strand: 'quest',
    hookType: '',
    hookStrength: 'medium',
    immutableFacts: [],
  };
}

function createOutlineDraft(outline?: ChapterOutline | ChapterOutlineDraft | null): ChapterOutlineDraft {
  if (!outline) {
    return createEmptyOutlineDraft();
  }

  return {
    goal: outline.goal,
    obstacle: outline.obstacle,
    cost: outline.cost,
    beats: [...outline.beats],
    timeAnchor: outline.timeAnchor,
    chapterTimeSpan: outline.chapterTimeSpan,
    gapFromPrevious: outline.gapFromPrevious,
    strand: outline.strand,
    hookType: outline.hookType,
    hookStrength: outline.hookStrength,
    immutableFacts: [...outline.immutableFacts],
  };
}

function normalizeOutlineDraft(draft: ChapterOutlineDraft): ChapterOutlineDraft {
  return {
    goal: draft.goal.trim(),
    obstacle: draft.obstacle.trim(),
    cost: draft.cost.trim(),
    beats: draft.beats.map((item) => item.trim()).filter(Boolean),
    timeAnchor: draft.timeAnchor.trim(),
    chapterTimeSpan: draft.chapterTimeSpan.trim(),
    gapFromPrevious: draft.gapFromPrevious.trim(),
    strand: draft.strand,
    hookType: draft.hookType.trim(),
    hookStrength: draft.hookStrength,
    immutableFacts: draft.immutableFacts.map((item) => item.trim()).filter(Boolean),
  };
}

function splitMultilineList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function areOutlineDraftsEqual(left: ChapterOutlineDraft, right: ChapterOutlineDraft) {
  return JSON.stringify(normalizeOutlineDraft(left)) === JSON.stringify(normalizeOutlineDraft(right));
}

function formatTimeLabel(timestamp: string) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatJobStatus(status: GenerationJobRecord['status']) {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '生成中';
    case 'paused':
      return '已暂停';
    case 'ready':
      return '待确认';
    case 'approved':
      return '已写回';
    case 'discarded':
      return '已丢弃';
    case 'error':
      return '失败';
    default:
      return status;
  }
}

function formatJobStep(step: GenerationJobRecord['currentStep'], status?: GenerationJobRecord['status']) {
  if (status === 'approved' || status === 'discarded') {
    return '流程结束';
  }

  switch (step) {
    case 'queued':
      return '等待调度';
    case 'plan':
      return '生成契约';
    case 'write':
      return '扩写正文';
    case 'review':
      return '质量审查';
    case 'polish':
      return '润色终检';
    case 'extract':
      return '提取摘要';
    case 'complete':
      return status === 'ready' ? '等待人工确认' : '生成完成';
    default:
      return step;
  }
}

function formatJobProgress(job: GenerationJobRecord) {
  if (job.currentStep === 'write' && job.totalBeatCount > 0) {
    return `${job.completedBeatCount}/${job.totalBeatCount} 节拍`;
  }

  if (job.totalBeatCount > 0 && job.completedBeatCount === job.totalBeatCount) {
    return `已完成 ${job.totalBeatCount} 个节拍`;
  }

  return '暂无进度';
}

function formatReviewSeverity(severity: NonNullable<GenerationJobRecord['review']>['overallSeverity']) {
  switch (severity) {
    case 'critical':
      return '严重';
    case 'high':
      return '高';
    case 'medium':
      return '中';
    case 'low':
      return '低';
    default:
      return severity;
  }
}

function formatCheckerLabel(checker: NonNullable<GenerationJobRecord['review']>['checkerResults'][number]['checker']) {
  switch (checker) {
    case 'consistency':
      return '一致性检查';
    case 'continuity':
      return '连贯性检查';
    case 'reader_pull':
      return '追读力检查';
    default:
      return checker;
  }
}

function parseMaintenanceLimit(rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.trunc(parsed);
}

function formatMaintenanceScopeLabel(scope: GenerationMaintenanceScope, chapterTitle = '') {
  if (scope === 'project') {
    return '当前项目';
  }

  return chapterTitle ? `当前调试章节：${chapterTitle}` : '当前调试章节';
}

function formatMaintenanceLimitLabel(limit?: number) {
  return typeof limit === 'number' ? `limit ${limit}` : '全量';
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
      return '超期';
    default:
      return status;
  }
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

function formatLightweightRecallBreakdown(item: GenerationDebugContext['lightweightRecallItems'][number]) {
  return `词 ${item.scoreBreakdown.phrase} / 实体 ${item.scoreBreakdown.entity} / 时序 ${item.scoreBreakdown.recency}`;
}

function formatRetrievalSourceLabel(sourceType: GenerationDebugRetrieval['items'][number]['sourceType']) {
  switch (sourceType) {
    case 'memory_chunk':
      return '记忆切片';
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
    case 'hybrid':
      return '混合';
    case 'vector_only':
      return '向量';
    case 'lexical_only':
    default:
      return '关键词';
  }
}

function formatRetrievalItemTitle(item: GenerationDebugRetrieval['items'][number]) {
  switch (item.sourceType) {
    case 'dormant_foreshadow':
    case 'volume_recap':
      return item.title;
    case 'memory_chunk':
    default:
      return `${item.chapterTitle} / ${item.chunkKind} #${item.chunkIndex + 1}`;
  }
}

export function GenerationWorkspace({
  projectId,
  projectTitle,
  projectDescription = '',
  onOpenChapter,
}: GenerationWorkspaceProps) {
  const chapters = useEditorStore((state) => state.chapters);
  const saveChapterContent = useEditorStore((state) => state.saveChapterContent);
  const entities = useLoreStore((state) => state.entities);
  const foreshadows = useForeshadowStore((state) => state.foreshadows);
  const foreshadowLoadedProjectId = useForeshadowStore((state) => state.loadedProjectId);
  const isForeshadowLoaded = useForeshadowStore((state) => state.isLoaded);
  const currentProject = useProjectStore((state) => state.projects.find((project) => project.id === projectId) ?? null);
  const updateProject = useProjectStore((state) => state.updateProject);
  const settings = useSettingsStore((state) => state.settings);
  const createSnapshot = useSnapshotStore((state) => state.createSnapshot);
  const { toast } = useToast();
  const [selectedChapterId, setSelectedChapterId] = useState<Id | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Id[]>([]);
  const [showGenerationLab, setShowGenerationLab] = useState(false);
  const [chapterOutlines, setChapterOutlines] = useState<ChapterOutline[]>([]);
  const [chapterSummaries, setChapterSummaries] = useState<ChapterSummary[]>([]);
  const [strandTracker, setStrandTracker] = useState<StrandTracker | null>(null);
  const [stateChangeMap, setStateChangeMap] = useState<Map<Id, number>>(new Map());
  const [serverJobs, setServerJobs] = useState<GenerationJobRecord[]>([]);
  const [gateConfig, setGateConfig] = useState<GenerationGateConfig | null>(null);
  const [debugOverview, setDebugOverview] = useState<GenerationDebugOverview | null>(null);
  const [debugChapters, setDebugChapters] = useState<GenerationDebugChapterRecord[]>([]);
  const [selectedDebugChapterId, setSelectedDebugChapterId] = useState<Id | null>(null);
  const [debugChapterDetail, setDebugChapterDetail] = useState<GenerationDebugChapterDetail | null>(null);
  const [debugContext, setDebugContext] = useState<GenerationDebugContext | null>(null);
  const [debugMemoryChunks, setDebugMemoryChunks] = useState<GenerationDebugMemoryChunkRecord[]>([]);
  const [debugRetrieval, setDebugRetrieval] = useState<GenerationDebugRetrieval | null>(null);
  const [debugVolumeRecaps, setDebugVolumeRecaps] = useState<GenerationDebugVolumeRecapRecord[]>([]);
  const [debugEntities, setDebugEntities] = useState<GenerationDebugEntityRecord[]>([]);
  const [debugForeshadows, setDebugForeshadows] = useState<GenerationDebugForeshadowRecord[]>([]);
  const [debugRelationships, setDebugRelationships] = useState<GenerationDebugRelationshipRecord[]>([]);
  const [debugChapterQuery, setDebugChapterQuery] = useState('');
  const [debugEntityQuery, setDebugEntityQuery] = useState('');
  const [debugRelationshipQuery, setDebugRelationshipQuery] = useState('');
  const [maintenanceScope, setMaintenanceScope] = useState<GenerationMaintenanceScope>('project');
  const [maintenanceLimitInput, setMaintenanceLimitInput] = useState('');
  const [isChunkBackfilling, setIsChunkBackfilling] = useState(false);
  const [isVolumeRecapBackfilling, setIsVolumeRecapBackfilling] = useState(false);
  const [isEmbeddingBackfilling, setIsEmbeddingBackfilling] = useState(false);
  const [activeMaintenanceRun, setActiveMaintenanceRun] = useState<GenerationMaintenanceRunSnapshot | null>(null);
  const [lastChunkBackfill, setLastChunkBackfill] =
    useState<GenerationMaintenanceResultSnapshot<GenerationMemoryChunkBackfillResult> | null>(null);
  const [lastVolumeRecapBackfill, setLastVolumeRecapBackfill] =
    useState<GenerationMaintenanceResultSnapshot<GenerationVolumeRecapBackfillResult> | null>(null);
  const [lastEmbeddingBackfill, setLastEmbeddingBackfill] =
    useState<GenerationMaintenanceResultSnapshot<GenerationMemoryEmbeddingBackfillResult> | null>(null);
  const [debugSelectionRefreshKey, setDebugSelectionRefreshKey] = useState(0);
  const [outlineDraft, setOutlineDraft] = useState<ChapterOutlineDraft>(createEmptyOutlineDraft());
  const [projectGateOverrideEnabled, setProjectGateOverrideEnabled] = useState(false);
  const [projectGateOverrideDraft, setProjectGateOverrideDraft] = useState<GenerationGateConfig>(DEFAULT_GENERATION_GATE_CONFIG);
  const [isBatchPlanning, setIsBatchPlanning] = useState(false);
  const [isQueueSubmitting, setIsQueueSubmitting] = useState(false);
  const [isBatchApproving, setIsBatchApproving] = useState(false);
  const [isBatchDiscarding, setIsBatchDiscarding] = useState(false);
  const [isJobMutating, setIsJobMutating] = useState(false);
  const [isOutlineSaving, setIsOutlineSaving] = useState(false);
  const [isProjectGateSaving, setIsProjectGateSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0] ?? null,
    [chapters, selectedChapterId],
  );

  const outlineMap = useMemo(
    () => new Map(chapterOutlines.map((outline) => [outline.chapterId, outline] as const)),
    [chapterOutlines],
  );
  const summaryMap = useMemo(
    () => new Map(chapterSummaries.map((summary) => [summary.chapterId, summary] as const)),
    [chapterSummaries],
  );
  const strandMap = useMemo(
    () => new Map((strandTracker?.history ?? []).map((entry) => [entry.chapterId, entry.strand] as const)),
    [strandTracker],
  );
  const serverJobMap = useMemo(
    () => new Map(serverJobs.map((job) => [job.chapterId, job] as const)),
    [serverJobs],
  );
  const chapterOrderMap = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter.order] as const)),
    [chapters],
  );
  const entityIdMap = useMemo(
    () =>
      new Map(
        entities.map((entity) => [entity.name.trim().toLowerCase(), entity.id] as const),
      ),
    [entities],
  );
  const worldState = useMemo(() => buildWorldStateSummary(entities), [entities]);
  const selectedServerJobs = useMemo(
    () =>
      selectedChapterIds
        .map((chapterId) => serverJobMap.get(chapterId) ?? null)
        .filter((job): job is GenerationJobRecord => job !== null),
    [selectedChapterIds, serverJobMap],
  );
  const readySelectedJobs = useMemo(
    () => selectedServerJobs.filter((job) => job.status === 'ready' && job.generatedText.trim()),
    [selectedServerJobs],
  );
  const discardableSelectedJobs = useMemo(
    () => selectedServerJobs.filter((job) => job.status !== 'approved' && job.status !== 'discarded'),
    [selectedServerJobs],
  );
  const globalGateConfig = gateConfig ? normalizeGenerationGateConfig(gateConfig) : DEFAULT_GENERATION_GATE_CONFIG;
  const projectGateConfig = currentProject?.generationGateOverride ?? null;
  const selectedDebugChapter = useMemo(
    () => debugChapters.find((item) => item.chapterId === selectedDebugChapterId) ?? null,
    [debugChapters, selectedDebugChapterId],
  );
  const selectedOutline = selectedChapter ? outlineMap.get(selectedChapter.id) ?? null : null;
  const selectedSummary = selectedChapter ? summaryMap.get(selectedChapter.id) ?? null : null;
  const selectedStateChangeCount = selectedChapter ? stateChangeMap.get(selectedChapter.id) ?? 0 : 0;
  const selectedStrand = selectedChapter ? strandMap.get(selectedChapter.id) ?? null : null;
  const selectedServerJob = selectedChapter ? serverJobMap.get(selectedChapter.id) ?? null : null;
  const hasOutlineDraftChanges = !areOutlineDraftsEqual(outlineDraft, createOutlineDraft(selectedOutline));
  const selectedEffectiveGateConfig = normalizeGenerationGateConfig(
    selectedServerJob?.request.gateConfigOverride ?? projectGateConfig ?? globalGateConfig,
  );
  const selectedEffectiveGateSource = selectedServerJob?.request.gateConfigOverride
    ? '当前任务覆盖'
    : projectGateConfig
      ? '项目覆盖'
      : '全局门控';
  const selectedEffectiveLightweightRecallPreset = useMemo(
    () => findMatchingLightweightRecallPreset(selectedEffectiveGateConfig.lightweightRecall),
    [selectedEffectiveGateConfig.lightweightRecall],
  );
  const matchedProjectLightweightRecallPreset = useMemo(
    () => findMatchingLightweightRecallPreset(projectGateOverrideDraft.lightweightRecall),
    [projectGateOverrideDraft.lightweightRecall],
  );
  const isMaintenanceRunning = isChunkBackfilling || isVolumeRecapBackfilling || isEmbeddingBackfilling;
  const isMaintenanceActionDisabled =
    isMaintenanceRunning || (maintenanceScope === 'chapter' && !selectedDebugChapterId);
  const maintenanceScopeLabel = formatMaintenanceScopeLabel(maintenanceScope, selectedDebugChapter?.chapterTitle);
  const currentForeshadowSnapshot =
    isForeshadowLoaded && foreshadowLoadedProjectId === projectId
      ? buildGenerationForeshadowSnapshot(
          foreshadows.filter((foreshadow) => foreshadow.projectId === projectId),
          chapters,
        )
      : undefined;

  useEffect(() => {
    if (chapters.length === 0) {
      setSelectedChapterId(null);
      setSelectedChapterIds([]);
      return;
    }

    if (!selectedChapterId || !chapters.some((chapter) => chapter.id === selectedChapterId)) {
      setSelectedChapterId(chapters[0].id);
    }

    setSelectedChapterIds((current) =>
      current.filter((chapterId) => chapters.some((chapter) => chapter.id === chapterId)),
    );
  }, [chapters, selectedChapterId]);

  useEffect(() => {
    void refreshOverview(false);
  }, [debugChapterQuery, debugEntityQuery, debugRelationshipQuery, projectId, chapters]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshOverview(false);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [debugChapterQuery, debugEntityQuery, debugRelationshipQuery, projectId, chapters, settings.serverUrl]);

  useEffect(() => {
    const nextGlobalGateConfig = gateConfig ? normalizeGenerationGateConfig(gateConfig) : DEFAULT_GENERATION_GATE_CONFIG;

    if (currentProject?.generationGateOverride) {
      setProjectGateOverrideEnabled(true);
      setProjectGateOverrideDraft(normalizeGenerationGateConfig(currentProject.generationGateOverride));
      return;
    }

    setProjectGateOverrideEnabled(false);
    setProjectGateOverrideDraft(nextGlobalGateConfig);
  }, [currentProject?.generationGateOverride, gateConfig]);

  useEffect(() => {
    if (debugChapters.length === 0) {
      setSelectedDebugChapterId(null);
      setDebugChapterDetail(null);
      return;
    }

    if (!selectedDebugChapterId || !debugChapters.some((item) => item.chapterId === selectedDebugChapterId)) {
      setSelectedDebugChapterId(debugChapters[0].chapterId);
    }
  }, [debugChapters, selectedDebugChapterId]);

  useEffect(() => {
    if (!selectedDebugChapterId) {
      setDebugChapterDetail(null);
      setDebugContext(null);
      return;
    }

    void fetchGenerationDebugChapterDetail(settings.serverUrl, projectId, selectedDebugChapterId)
      .then((detail) => {
        setDebugChapterDetail(detail);
      })
      .catch(() => {
        setDebugChapterDetail(null);
      });
  }, [debugChapters, debugSelectionRefreshKey, projectId, selectedDebugChapterId, settings.serverUrl]);

  useEffect(() => {
    if (!selectedDebugChapterId) {
      setDebugContext(null);
      setDebugMemoryChunks([]);
      setDebugRetrieval(null);
      return;
    }

    setDebugContext(null);
    void fetchGenerationDebugContext(settings.serverUrl, projectId, selectedDebugChapterId)
      .then((detail) => {
        setDebugContext(detail);
      })
      .catch(() => {
        setDebugContext(null);
      });
  }, [debugChapters, debugSelectionRefreshKey, projectId, selectedDebugChapterId, settings.serverUrl]);

  useEffect(() => {
    if (!selectedDebugChapterId) {
      setDebugMemoryChunks([]);
      return;
    }

    void fetchGenerationDebugMemoryChunks(settings.serverUrl, projectId, {
      q: debugChapterQuery,
      chapterId: selectedDebugChapterId,
    })
      .then((items) => {
        setDebugMemoryChunks(items);
      })
      .catch(() => {
        setDebugMemoryChunks([]);
      });
  }, [debugChapterQuery, debugSelectionRefreshKey, projectId, selectedDebugChapterId, settings.serverUrl]);

  useEffect(() => {
    if (!selectedDebugChapterId) {
      setDebugRetrieval(null);
      return;
    }

    void fetchGenerationDebugRetrieval(settings.serverUrl, projectId, selectedDebugChapterId)
      .then((detail) => {
        setDebugRetrieval(detail);
      })
      .catch(() => {
        setDebugRetrieval(null);
      });
  }, [debugSelectionRefreshKey, projectId, selectedDebugChapterId, settings.serverUrl]);

  useEffect(() => {
    setOutlineDraft(createOutlineDraft(selectedOutline));
  }, [selectedOutline?.chapterId, selectedOutline?.updatedAt, selectedChapter?.id]);

  async function refreshOverview(showBusy = true) {
    if (showBusy) {
      setIsRefreshing(true);
    }

    try {
      const [
        nextOutlines,
        nextSummaries,
        nextStateChanges,
        nextStrandTracker,
        nextServerJobs,
        nextGateConfig,
        nextDebugOverview,
        nextDebugChapters,
        nextDebugVolumeRecaps,
        nextDebugEntities,
        nextDebugForeshadows,
        nextDebugRelationships,
      ] =
        await Promise.all([
        db.chapterOutlines.where('projectId').equals(projectId).toArray(),
        db.chapterSummaries.where('projectId').equals(projectId).toArray(),
        db.stateChanges.where('projectId').equals(projectId).toArray(),
        loadStrandTracker(projectId),
        listGenerationJobs(settings.serverUrl, projectId),
        fetchGenerationGateConfig(settings.serverUrl).catch(() => null),
        fetchGenerationDebugOverview(settings.serverUrl, projectId).catch(() => null),
        fetchGenerationDebugChapters(settings.serverUrl, projectId, debugChapterQuery).catch(() => []),
        fetchGenerationDebugVolumeRecaps(settings.serverUrl, projectId, debugChapterQuery).catch(() => []),
        fetchGenerationDebugEntities(settings.serverUrl, projectId, debugEntityQuery).catch(() => []),
        fetchGenerationDebugForeshadows(settings.serverUrl, projectId, debugChapterQuery).catch(() => []),
        fetchGenerationDebugRelationships(settings.serverUrl, projectId, {
          q: debugRelationshipQuery,
        }).catch(() => []),
      ]);

      setChapterOutlines(nextOutlines);
      setChapterSummaries(nextSummaries);
      setStateChangeMap(createStateChangeMap(nextStateChanges));
      setStrandTracker(nextStrandTracker ?? null);
      setServerJobs(nextServerJobs.filter((job) => chapters.some((chapter) => chapter.id === job.chapterId)));
      setGateConfig(nextGateConfig ? normalizeGenerationGateConfig(nextGateConfig) : null);
      setDebugOverview(nextDebugOverview);
      setDebugChapters(nextDebugChapters);
      setDebugVolumeRecaps(nextDebugVolumeRecaps);
      setDebugEntities(nextDebugEntities);
      setDebugForeshadows(nextDebugForeshadows);
      setDebugRelationships(nextDebugRelationships);
    } catch (error) {
      if (showBusy) {
        const message = error instanceof Error ? error.message : '未知错误';
        toast(`刷新生成控制台失败：${message}`, 'error');
      }
    } finally {
      if (showBusy) {
        setIsRefreshing(false);
      }
    }
  }

  async function handleRefreshConsole() {
    await refreshOverview(true);
    setDebugSelectionRefreshKey((current) => current + 1);
  }

  function buildMaintenanceRequest() {
    const parsedLimit = parseMaintenanceLimit(maintenanceLimitInput);

    if (parsedLimit === null) {
      toast('limit 需要填写大于 0 的整数，留空表示全量', 'warning');
      return null;
    }

    if (maintenanceScope === 'chapter') {
      if (!selectedDebugChapterId) {
        toast('请先在章节索引里选择一个章节，再执行当前调试章节回填', 'warning');
        return null;
      }

      const request: GenerationMaintenanceBackfillRequest = {
        projectId,
        chapterId: selectedDebugChapterId,
        limit: parsedLimit,
      };

      return {
        request,
        scope: maintenanceScope,
        chapterTitle: selectedDebugChapter?.chapterTitle || '',
      };
    }

    const request: GenerationMaintenanceBackfillRequest = {
      projectId,
      limit: parsedLimit,
    };

    return {
      request,
      scope: maintenanceScope,
      chapterTitle: '',
    };
  }

  async function handleBackfillMemoryChunks() {
    const payload = buildMaintenanceRequest();

    if (!payload) {
      return;
    }

    setIsChunkBackfilling(true);
    setActiveMaintenanceRun({
      kind: 'chunks',
      scope: payload.scope,
      chapterTitle: payload.chapterTitle,
      limit: payload.request.limit,
    });

    try {
      const result = await backfillGenerationMemoryChunks(settings.serverUrl, payload.request);

      setLastChunkBackfill({
        scope: payload.scope,
        chapterTitle: payload.chapterTitle,
        limit: payload.request.limit,
        finishedAt: new Date().toISOString(),
        result,
      });
      await refreshOverview(false);
      setDebugSelectionRefreshKey((current) => current + 1);
      toast(`切片回填完成：处理 ${result.processedChapters} 章，写入 ${result.totalChunks} 个切片`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`回填记忆切片失败：${message}`, 'error');
    } finally {
      setIsChunkBackfilling(false);
      setActiveMaintenanceRun(null);
    }
  }

  async function handleBackfillVolumeRecaps() {
    const payload = buildMaintenanceRequest();

    if (!payload) {
      return;
    }

    setIsVolumeRecapBackfilling(true);
    setActiveMaintenanceRun({
      kind: 'volume-recaps',
      scope: payload.scope,
      chapterTitle: payload.chapterTitle,
      limit: payload.request.limit,
    });

    try {
      const result = await backfillGenerationVolumeRecaps(settings.serverUrl, payload.request);

      setLastVolumeRecapBackfill({
        scope: payload.scope,
        chapterTitle: payload.chapterTitle,
        limit: payload.request.limit,
        finishedAt: new Date().toISOString(),
        result,
      });
      await refreshOverview(false);
      setDebugSelectionRefreshKey((current) => current + 1);
      toast(`卷总结回填完成：处理 ${result.processedVolumes} 卷，跳过 ${result.skippedVolumes} 卷`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`回填卷级总结失败：${message}`, 'error');
    } finally {
      setIsVolumeRecapBackfilling(false);
      setActiveMaintenanceRun(null);
    }
  }

  async function handleBackfillMemoryEmbeddings() {
    const payload = buildMaintenanceRequest();

    if (!payload) {
      return;
    }

    setIsEmbeddingBackfilling(true);
    setActiveMaintenanceRun({
      kind: 'embeddings',
      scope: payload.scope,
      chapterTitle: payload.chapterTitle,
      limit: payload.request.limit,
    });

    try {
      const result = await backfillGenerationMemoryEmbeddings(settings.serverUrl, payload.request);

      setLastEmbeddingBackfill({
        scope: payload.scope,
        chapterTitle: payload.chapterTitle,
        limit: payload.request.limit,
        finishedAt: new Date().toISOString(),
        result,
      });
      await refreshOverview(false);
      setDebugSelectionRefreshKey((current) => current + 1);
      toast(`向量回填完成：新增 ${result.createdChunks}，失效重建 ${result.rebuiltChunks}，复用 ${result.reusedChunks}，跳过 ${result.skippedChunks}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`回填向量缓存失败：${message}`, 'error');
    } finally {
      setIsEmbeddingBackfilling(false);
      setActiveMaintenanceRun(null);
    }
  }

  async function handleSaveProjectGateOverride() {
    if (!currentProject) {
      return;
    }

    setIsProjectGateSaving(true);

    try {
      const nextOverride: ProjectGenerationGateOverride | null = projectGateOverrideEnabled
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

      toast(projectGateOverrideEnabled ? '项目门控覆盖已保存' : '已恢复继承全局门控', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存项目门控覆盖失败：${message}`, 'error');
    } finally {
      setIsProjectGateSaving(false);
    }
  }

  async function handleSaveOutlineDraft() {
    if (!selectedChapter) {
      return;
    }

    const normalizedDraft = normalizeOutlineDraft(outlineDraft);

    if (normalizedDraft.beats.length === 0) {
      toast('至少需要填写 1 条 beat 才能保存章节契约', 'warning');
      return;
    }

    setIsOutlineSaving(true);

    try {
      await saveChapterOutline(projectId, selectedChapter.id, normalizedDraft);
      await refreshOverview(false);
      toast(`已保存章节「${selectedChapter.title}」的契约草稿`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存章节契约失败：${message}`, 'error');
    } finally {
      setIsOutlineSaving(false);
    }
  }

  function toggleChapterSelection(chapterId: Id) {
    setSelectedChapterIds((current) => {
      if (current.includes(chapterId)) {
        return current.filter((item) => item !== chapterId);
      }

      return [...current, chapterId];
    });
  }

  function selectAllChapters() {
    setSelectedChapterIds(chapters.map((chapter) => chapter.id));
  }

  function clearSelectedChapters() {
    setSelectedChapterIds([]);
  }

  async function handleBatchGenerateOutlines() {
    if (selectedChapterIds.length === 0) {
      toast('请先选择至少一个章节', 'warning');
      return;
    }

    setIsBatchPlanning(true);

    try {
      const orderedChapters = chapters
        .filter((chapter) => selectedChapterIds.includes(chapter.id))
        .sort((left, right) => left.order - right.order);

      for (const chapter of orderedChapters) {
        const previousChapter = findPreviousChapter(chapters, chapter.id);
        const previousSummary = previousChapter ? await loadChapterSummary(projectId, previousChapter.id) : null;
        const contextBundle = await buildGenerationContextBundle({
          projectId,
          currentChapterId: chapter.id,
          chapters,
          entities,
        });
        const response = await createChapterPlan(settings.serverUrl, {
          projectId,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          chapterOrder: chapter.order,
          volumeTitle: chapter.volumeTitle,
          previousChapterId: previousChapter?.id,
          previousChapterTitle: previousChapter?.title,
          projectTitle,
          projectDescription,
          previousSummary: previousSummary?.summary ?? '',
          worldState,
          contextBundle: contextBundle.bundle,
          foreshadowSnapshot: currentForeshadowSnapshot,
          model: settings.modelName,
          temperature: settings.temperature,
        });

        await saveChapterOutline(projectId, chapter.id, response.outline);
      }

      await refreshOverview(false);
      toast(`已为 ${selectedChapterIds.length} 个章节生成契约`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`批量生成章节契约失败：${message}`, 'error');
    } finally {
      setIsBatchPlanning(false);
    }
  }

  async function handleQueueSelectedChapters() {
    if (selectedChapterIds.length === 0) {
      toast('请先选择至少一个章节', 'warning');
      return;
    }

    setIsQueueSubmitting(true);

    try {
      const orderedChapters = chapters
        .filter((chapter) => selectedChapterIds.includes(chapter.id))
        .sort((left, right) => left.order - right.order);

      const jobs = await Promise.all(
        orderedChapters.map(async (chapter, index) => {
          const previousChapter = findPreviousChapter(chapters, chapter.id);
          const previousSummary = previousChapter ? await loadChapterSummary(projectId, previousChapter.id) : null;
          const savedOutline = outlineMap.get(chapter.id) ?? null;
          const contextBundle = await buildGenerationContextBundle({
            projectId,
            currentChapterId: chapter.id,
            chapters,
            entities,
          });

          return {
            projectId,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            chapterOrder: chapter.order,
            volumeTitle: chapter.volumeTitle,
            previousChapterId: previousChapter?.id,
            previousChapterTitle: previousChapter?.title,
            projectTitle,
            projectDescription,
            previousSummary: previousSummary?.summary ?? '',
            worldState,
            contextBundle: contextBundle.bundle,
            stylePrompt: settings.stylePrompt.trim() || undefined,
            model: settings.modelName,
            temperature: settings.temperature,
            priority: orderedChapters.length - index,
            gateConfigOverride: currentProject?.generationGateOverride ?? null,
            outlineOverride: savedOutline ? createOutlineDraft(savedOutline) : null,
            entitySnapshot: entities.map((entity) => ({
              name: entity.name,
              type: entity.type,
              description: entity.description,
              fields: entity.fields,
              tags: entity.tags,
              pinned: entity.pinned,
            })),
            foreshadowSnapshot: currentForeshadowSnapshot,
          };
        }),
      );

      await enqueueGenerationJobs(settings.serverUrl, { jobs });
      await refreshOverview(false);
      toast(`已将 ${selectedChapterIds.length} 个章节加入服务端队列`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`加入服务端队列失败：${message}`, 'error');
    } finally {
      setIsQueueSubmitting(false);
    }
  }

  async function applyReadyJobResult(job: GenerationJobRecord) {
    if (job.status !== 'ready' || !job.generatedText.trim()) {
      return false;
    }

    const chapter = chapters.find((item) => item.id === job.chapterId);

    if (!chapter) {
      return false;
    }

    if (chapter.content.content.length > 0) {
      await createSnapshot({
        projectId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        content: chapter.content,
        source: 'manual',
        note: '服务端队列写回前快照',
      });
    }

    await saveChapterContent(chapter.id, createParagraphDocument(job.generatedText));

    if (job.outline) {
      await saveChapterOutline(projectId, chapter.id, job.outline);
    }

    if (job.summary) {
      await saveChapterSummary(projectId, chapter.id, job.summary);
    }

    await replaceChapterStateChanges(projectId, chapter.id, job.stateChanges, entityIdMap);

    if (job.strand) {
      await appendStrandHistory(projectId, chapter.id, chapter.title, job.strand);
    }

    await approveGenerationJob(settings.serverUrl, job.id);
    return true;
  }

  async function handleApproveServerJob() {
    if (!selectedChapter) {
      return;
    }

    const job = serverJobMap.get(selectedChapter.id);

    if (!job || job.status !== 'ready' || !job.generatedText.trim()) {
      toast('当前章节没有可确认写回的服务端结果', 'warning');
      return;
    }

    setIsJobMutating(true);

    try {
      const applied = await applyReadyJobResult(job);

      if (!applied) {
        toast('当前章节没有可确认写回的服务端结果', 'warning');
        return;
      }

      await refreshOverview(false);
      toast(`已写回章节「${selectedChapter.title}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`写回章节失败：${message}`, 'error');
    } finally {
      setIsJobMutating(false);
    }
  }

  async function handleBatchApproveServerJobs() {
    if (readySelectedJobs.length === 0) {
      toast('当前选择里没有可批量确认的服务端结果', 'warning');
      return;
    }

    setIsBatchApproving(true);

    try {
      const orderedJobs = [...readySelectedJobs].sort((left, right) => {
        return (chapterOrderMap.get(left.chapterId) ?? 0) - (chapterOrderMap.get(right.chapterId) ?? 0);
      });
      let approvedCount = 0;

      for (const job of orderedJobs) {
        if (await applyReadyJobResult(job)) {
          approvedCount += 1;
        }
      }

      await refreshOverview(false);
      toast(`已批量写回 ${approvedCount} 个章节`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`批量写回失败：${message}`, 'error');
    } finally {
      setIsBatchApproving(false);
    }
  }

  async function handleDiscardServerJob() {
    if (!selectedChapter) {
      return;
    }

    const job = serverJobMap.get(selectedChapter.id);

    if (!job) {
      return;
    }

    setIsJobMutating(true);

    try {
      await discardGenerationJob(settings.serverUrl, job.id);
      await refreshOverview(false);
      toast(
        job.status === 'ready'
          ? `已丢弃「${selectedChapter.title}」的服务端结果`
          : `已取消「${selectedChapter.title}」的服务端任务`,
        'info',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`丢弃服务端结果失败：${message}`, 'error');
    } finally {
      setIsJobMutating(false);
    }
  }

  async function handleBatchDiscardServerJobs() {
    if (discardableSelectedJobs.length === 0) {
      toast('当前选择里没有可批量丢弃的任务', 'warning');
      return;
    }

    setIsBatchDiscarding(true);

    try {
      await batchUpdateGenerationJobs(settings.serverUrl, {
        action: 'discard',
        jobIds: discardableSelectedJobs.map((job) => job.id),
      });
      await refreshOverview(false);
      toast(`已批量丢弃 ${discardableSelectedJobs.length} 个任务`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`批量丢弃任务失败：${message}`, 'error');
    } finally {
      setIsBatchDiscarding(false);
    }
  }

  async function handleRetryServerJob() {
    if (!selectedChapter) {
      return;
    }

    const job = serverJobMap.get(selectedChapter.id);

    if (!job) {
      return;
    }

    setIsJobMutating(true);

    try {
      await retryGenerationJob(settings.serverUrl, job.id);
      await refreshOverview(false);
      toast(`已重新排队「${selectedChapter.title}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`重新排队失败：${message}`, 'error');
    } finally {
      setIsJobMutating(false);
    }
  }

  async function handlePauseServerJob() {
    if (!selectedChapter) {
      return;
    }

    const job = serverJobMap.get(selectedChapter.id);

    if (!job) {
      return;
    }

    setIsJobMutating(true);

    try {
      await pauseGenerationJob(settings.serverUrl, job.id);
      await refreshOverview(false);
      toast(job.status === 'running' ? '暂停请求已提交，将在当前检查点停下' : '已暂停当前任务', 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`暂停任务失败：${message}`, 'error');
    } finally {
      setIsJobMutating(false);
    }
  }

  async function handleResumeServerJob() {
    if (!selectedChapter) {
      return;
    }

    const job = serverJobMap.get(selectedChapter.id);

    if (!job) {
      return;
    }

    setIsJobMutating(true);

    try {
      await resumeGenerationJob(settings.serverUrl, job.id);
      await refreshOverview(false);
      toast('已恢复当前任务并重新加入调度队列', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`恢复任务失败：${message}`, 'error');
    } finally {
      setIsJobMutating(false);
    }
  }

  async function handleReprioritizeServerJob(delta: number) {
    if (!selectedChapter) {
      return;
    }

    const job = serverJobMap.get(selectedChapter.id);

    if (!job || (job.status === 'approved' || job.status === 'discarded')) {
      return;
    }

    setIsJobMutating(true);

    try {
      const nextPriority = Math.max(0, job.priority + delta);
      await reprioritizeGenerationJob(settings.serverUrl, job.id, nextPriority);
      await refreshOverview(false);
      toast(`已将当前任务优先级调整为 P${nextPriority}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`调整优先级失败：${message}`, 'error');
    } finally {
      setIsJobMutating(false);
    }
  }

  async function handleRollbackServerJob(stage: 'review' | 'polish') {
    if (!selectedChapter) {
      return;
    }

    const job = serverJobMap.get(selectedChapter.id);

    if (!job) {
      return;
    }

    setIsJobMutating(true);

    try {
      await rollbackGenerationJobStage(settings.serverUrl, job.id, { stage });
      await refreshOverview(false);
      toast(stage === 'review' ? '已回退到 Review 阶段并重新入队' : '已回退到 Polish 阶段并重新入队', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`阶段回退失败：${message}`, 'error');
    } finally {
      setIsJobMutating(false);
    }
  }

  async function handleClearResolvedServerJobs() {
    try {
      await clearResolvedGenerationJobs(settings.serverUrl, projectId);
      await refreshOverview(false);
      toast('已清理服务端已处理结果', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`清理服务端结果失败：${message}`, 'error');
    }
  }

  const outlinedCount = chapterOutlines.length;
  const summarizedCount = chapterSummaries.length;
  const queueReadyCount = serverJobs.filter((job) => job.status === 'ready').length;
  const queuePausedCount = serverJobs.filter((job) => job.status === 'paused').length;
  const queueErrorCount = serverJobs.filter((job) => job.status === 'error').length;

  if (chapters.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 p-8">
        <EmptyState
          icon={<FlaskConical size={22} />}
          title="先准备章节，再进入生成控制台"
          description="生成控制台会基于现有章节执行 Plan → Write → Extract 流程，当前项目还没有章节可供实验。"
          actions={
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300"
            >
              <BookOpen size={16} />
              暂无章节可选
            </button>
          }
          details={
            <OnboardingChecklist
              title="推荐起步顺序"
              items={[
                '先在编辑器里创建至少一个章节。',
                '补一句项目简介和几条核心设定，便于模型生成章节契约。',
                '回到这里后，可以先尝试“生成章节契约”，再决定是否生成正文。',
              ]}
            />
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/70">
      <aside className="hidden w-80 flex-shrink-0 flex-col border-r border-neutral-800 bg-neutral-950/70 xl:flex">
        <div className="border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">生成控制台</p>
              <p className="mt-1 text-sm text-neutral-300">当前共 {chapters.length} 个章节</p>
            </div>
            <button
              type="button"
              onClick={() => void handleRefreshConsole()}
              disabled={isRefreshing}
              className="rounded-2xl p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
              title="刷新服务端状态"
            >
              <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-center">
              <p className="text-neutral-500">已生成契约</p>
              <p className="mt-1 text-base font-medium text-indigo-300">{outlinedCount}</p>
            </div>
            <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-center">
              <p className="text-neutral-500">已提取摘要</p>
              <p className="mt-1 text-base font-medium text-emerald-300">{summarizedCount}</p>
            </div>
            <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-center">
              <p className="text-neutral-500">待确认结果</p>
              <p className="mt-1 text-base font-medium text-yellow-300">{queueReadyCount}</p>
            </div>
            <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-center">
              <p className="text-neutral-500">已暂停任务</p>
              <p className="mt-1 text-base font-medium text-sky-300">{queuePausedCount}</p>
            </div>
            <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-center">
              <p className="text-neutral-500">生成失败</p>
              <p className="mt-1 text-base font-medium text-red-300">{queueErrorCount}</p>
            </div>
          </div>
        </div>

        <div className="border-b border-neutral-800 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllChapters}
              className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              全选
            </button>
            <button
              type="button"
              onClick={clearSelectedChapters}
              className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              清空
            </button>
            <button
              type="button"
              onClick={() => void handleBatchGenerateOutlines()}
              disabled={isBatchPlanning}
              className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBatchPlanning ? '生成中...' : '批量生成契约'}
            </button>
            <button
              type="button"
              onClick={() => void handleQueueSelectedChapters()}
              disabled={isQueueSubmitting}
              className="rounded-full bg-yellow-500/15 px-3 py-1.5 text-xs font-medium text-yellow-300 transition-colors hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isQueueSubmitting ? '入队中...' : '加入服务端队列'}
            </button>
            <button
              type="button"
              onClick={() => void handleBatchApproveServerJobs()}
              disabled={isBatchApproving || readySelectedJobs.length === 0}
              className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBatchApproving ? '写回中...' : `批量确认 ${readySelectedJobs.length}`}
            </button>
            <button
              type="button"
              onClick={() => void handleBatchDiscardServerJobs()}
              disabled={isBatchDiscarding || discardableSelectedJobs.length === 0}
              className="rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBatchDiscarding ? '处理中...' : `批量丢弃 ${discardableSelectedJobs.length}`}
            </button>
            <button
              type="button"
              onClick={() => void handleClearResolvedServerJobs()}
              className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              清理已处理
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {chapters.map((chapter) => {
              const isSelected = selectedChapterIds.includes(chapter.id);
              const hasOutline = outlineMap.has(chapter.id);
              const hasSummary = summaryMap.has(chapter.id);
              const strand = strandMap.get(chapter.id);
              const serverJob = serverJobMap.get(chapter.id);

              return (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => setSelectedChapterId(chapter.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                    chapter.id === selectedChapter?.id
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                      : 'border-neutral-800 bg-neutral-900/70 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleChapterSelection(chapter.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-indigo-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{chapter.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className={`rounded-full px-2 py-1 ${hasOutline ? 'bg-indigo-500/15 text-indigo-300' : 'bg-neutral-800 text-neutral-500'}`}>
                          契约{hasOutline ? '已生成' : '未生成'}
                        </span>
                        <span className={`rounded-full px-2 py-1 ${hasSummary ? 'bg-emerald-500/15 text-emerald-300' : 'bg-neutral-800 text-neutral-500'}`}>
                          摘要{hasSummary ? '已提取' : '未提取'}
                        </span>
                        {strand && (
                          <span className="rounded-full bg-yellow-500/15 px-2 py-1 text-yellow-300">
                            {getStrandLabel(strand)}
                          </span>
                        )}
                        {serverJob && (
                          <span className={`rounded-full px-2 py-1 ${
                            serverJob.status === 'ready'
                              ? 'bg-yellow-500/15 text-yellow-300'
                              : serverJob.status === 'paused'
                                ? 'bg-sky-500/15 text-sky-300'
                                : serverJob.status === 'approved'
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : serverJob.status === 'error'
                                    ? 'bg-red-500/15 text-red-300'
                                  : 'bg-neutral-800 text-neutral-400'
                          }`}>
                            {formatJobStatus(serverJob.status)}
                          </span>
                        )}
                        {serverJob && (
                          <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-300">
                            P{serverJob.priority}
                          </span>
                        )}
                        {serverJob?.review && (
                          <span
                            className={`rounded-full px-2 py-1 ${
                              serverJob.review.overallSeverity === 'critical'
                                ? 'bg-red-500/15 text-red-300'
                                : serverJob.review.overallSeverity === 'high'
                                  ? 'bg-orange-500/15 text-orange-300'
                                  : serverJob.review.overallSeverity === 'medium'
                                    ? 'bg-yellow-500/15 text-yellow-300'
                                    : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            审查{formatReviewSeverity(serverJob.review.overallSeverity)}
                          </span>
                        )}
                        {serverJob?.style && (
                          <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-cyan-300">
                            风格已转译
                          </span>
                        )}
                        {serverJob?.polish && (
                          <span
                            className={`rounded-full px-2 py-1 ${
                              serverJob.polish.antiAiForceCheck === 'fail'
                                ? 'bg-red-500/15 text-red-300'
                                : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            润色{serverJob.polish.antiAiForceCheck === 'fail' ? '未通过' : '已通过'}
                          </span>
                        )}
                      </div>
                      {serverJob && (
                        <p className="mt-2 text-[11px] text-neutral-500">
                          {formatJobStep(serverJob.currentStep, serverJob.status)} · {formatJobProgress(serverJob)}
                          {serverJob.currentBeatLabel ? ` · ${serverJob.currentBeatLabel}` : ''}
                          {serverJob.reviewRewriteCount > 0 ? ` · 已重写 ${serverJob.reviewRewriteCount} 次` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-neutral-800 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">当前章节</p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-100">
                {selectedChapter?.title ?? '未选择章节'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                契约生成仍可本地批量执行，正文生成和待确认结果优先走服务端任务队列。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => selectedChapter && onOpenChapter(selectedChapter.id)}
                disabled={!selectedChapter}
                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BookOpen size={15} />
                打开章节
              </button>
              <button
                type="button"
                onClick={() => setShowGenerationLab(true)}
                disabled={!selectedChapter}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FlaskConical size={15} />
                本地实验室
              </button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-5">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                  <ClipboardList size={15} className="text-indigo-400" />
                  章节契约编辑器
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOutlineDraft(createOutlineDraft(selectedOutline))}
                    disabled={!hasOutlineDraftChanges}
                    className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    恢复已保存
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveOutlineDraft()}
                    disabled={isOutlineSaving || !hasOutlineDraftChanges}
                    className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isOutlineSaving ? '保存中...' : '保存契约'}
                  </button>
                </div>
              </div>
              <p className="mb-4 text-xs leading-6 text-neutral-500">
                {selectedOutline
                  ? '这里编辑的是本地章节契约，保存后会影响后续加入服务端队列时的输入。'
                  : '当前章节还没有已保存契约。你可以先手动填写，再保存为本地契约草稿。'}
              </p>
              <div className="space-y-4 text-sm text-neutral-400">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">目标</span>
                    <input
                      value={outlineDraft.goal}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          goal: event.target.value,
                        }))
                      }
                      placeholder="本章目标"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">阻力</span>
                    <input
                      value={outlineDraft.obstacle}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          obstacle: event.target.value,
                        }))
                      }
                      placeholder="核心阻力"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">代价</span>
                    <input
                      value={outlineDraft.cost}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          cost: event.target.value,
                        }))
                      }
                      placeholder="推进代价"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">Strand</span>
                    <select
                      value={outlineDraft.strand}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          strand: event.target.value as ChapterOutlineDraft['strand'],
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    >
                      <option value="quest">quest</option>
                      <option value="fire">fire</option>
                      <option value="constellation">constellation</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">钩子强度</span>
                    <select
                      value={outlineDraft.hookStrength}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          hookStrength: event.target.value as ChapterOutlineDraft['hookStrength'],
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    >
                      <option value="soft">soft</option>
                      <option value="medium">medium</option>
                      <option value="strong">strong</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">钩子类型</span>
                    <input
                      value={outlineDraft.hookType}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          hookType: event.target.value,
                        }))
                      }
                      placeholder="例如：悬念推进"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">时间锚点</span>
                    <input
                      value={outlineDraft.timeAnchor}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          timeAnchor: event.target.value,
                        }))
                      }
                      placeholder="例如：次日午后"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">章内跨度</span>
                    <input
                      value={outlineDraft.chapterTimeSpan}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          chapterTimeSpan: event.target.value,
                        }))
                      }
                      placeholder="例如：半天"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-neutral-300">与上章时间差</span>
                  <input
                    value={outlineDraft.gapFromPrevious}
                    onChange={(event) =>
                      setOutlineDraft((current) => ({
                        ...current,
                        gapFromPrevious: event.target.value,
                      }))
                    }
                    placeholder="例如：紧接上一章"
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">节拍列表（每行一条）</span>
                    <textarea
                      value={outlineDraft.beats.join('\n')}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          beats: splitMultilineList(event.target.value),
                        }))
                      }
                      placeholder={'开场建立场景\n冲突升级\n抛出下一章钩子'}
                      className="min-h-[180px] w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-7 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">不可变事实（每行一条）</span>
                    <textarea
                      value={outlineDraft.immutableFacts.join('\n')}
                      onChange={(event) =>
                        setOutlineDraft((current) => ({
                          ...current,
                          immutableFacts: splitMultilineList(event.target.value),
                        }))
                      }
                      placeholder={'人物身份不能变化\n道具已损坏\n地点仍处于封锁中'}
                      className="min-h-[180px] w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-7 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-xs text-neutral-500">
                  <p>当前节拍数：{outlineDraft.beats.length}</p>
                  <p className="mt-1">当前不可变事实数：{outlineDraft.immutableFacts.length}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <WandSparkles size={15} className="text-indigo-400" />
                提取结果总览
              </div>
              {!selectedSummary ? (
                <p className="text-sm text-neutral-500">当前章节还没有提取摘要与状态变更。</p>
              ) : (
                <div className="space-y-3 text-sm text-neutral-400">
                  <p className="leading-6">{selectedSummary.summary}</p>
                  <p><span className="text-neutral-500">钩子：</span>{selectedSummary.hook}</p>
                  <p><span className="text-neutral-500">状态变更：</span>{selectedStateChangeCount} 条</p>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-5">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Server size={15} className="text-indigo-400" />
                项目级门控覆盖
              </div>
              <div className="space-y-4 text-sm text-neutral-400">
                <p>
                  当前模式：
                  <span className="ml-2 text-neutral-200">
                    {projectGateOverrideEnabled ? '项目覆盖' : '继承全局'}
                  </span>
                </p>
                <p className="text-xs leading-6 text-neutral-500">
                  这里的配置会跟随当前项目本地保存，并在加入服务端队列时写入任务请求。已入队任务不会被后续修改追溯覆盖。
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">Review 自动重写最低级别</span>
                    <select
                      value={projectGateOverrideDraft.reviewRewriteMinSeverity}
                      onChange={(event) =>
                        setProjectGateOverrideDraft((current) => ({
                          ...current,
                          reviewRewriteMinSeverity: event.target.value as GenerationGateConfig['reviewRewriteMinSeverity'],
                        }))
                      }
                      disabled={!projectGateOverrideEnabled}
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="critical">critical</option>
                      <option value="high">high</option>
                      <option value="medium">medium</option>
                      <option value="low">low</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">最大自动重写次数</span>
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
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">一致性最低分</span>
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
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">连贯性最低分</span>
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
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">追读力最低分</span>
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
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回最低分</span>
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
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回 Top-K</span>
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
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回词命中权重</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={projectGateOverrideDraft.lightweightRecall.phraseWeight}
                      onChange={(event) =>
                        setProjectGateOverrideDraft((current) => ({
                          ...current,
                          lightweightRecall: {
                            ...current.lightweightRecall,
                            phraseWeight: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          },
                        }))
                      }
                      disabled={!projectGateOverrideEnabled}
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回实体命中权重</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={projectGateOverrideDraft.lightweightRecall.entityWeight}
                      onChange={(event) =>
                        setProjectGateOverrideDraft((current) => ({
                          ...current,
                          lightweightRecall: {
                            ...current.lightweightRecall,
                            entityWeight: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          },
                        }))
                      }
                      disabled={!projectGateOverrideEnabled}
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回时序权重</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={projectGateOverrideDraft.lightweightRecall.recencyWeight}
                      onChange={(event) =>
                        setProjectGateOverrideDraft((current) => ({
                          ...current,
                          lightweightRecall: {
                            ...current.lightweightRecall,
                            recencyWeight: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          },
                        }))
                      }
                      disabled={!projectGateOverrideEnabled}
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-neutral-200">项目级轻量召回权重预设</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        当前：{matchedProjectLightweightRecallPreset ? matchedProjectLightweightRecallPreset.label : '自定义权重'}
                      </p>
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      词 {projectGateOverrideDraft.lightweightRecall.phraseWeight} / 实体 {projectGateOverrideDraft.lightweightRecall.entityWeight} / 时序 {projectGateOverrideDraft.lightweightRecall.recencyWeight}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {LIGHTWEIGHT_RECALL_PRESETS.map((preset) => {
                      const active = matchedProjectLightweightRecallPreset?.key === preset.key;

                      return (
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
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            active
                              ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                              : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900'
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                          title={preset.description}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs leading-6 text-neutral-500">
                    {matchedProjectLightweightRecallPreset?.description ?? '当前权重不是内置预设，可继续细调后保存。'}
                  </p>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
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

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectGateOverrideEnabled(false);
                      setProjectGateOverrideDraft(globalGateConfig);
                    }}
                    className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
                  >
                    继承全局
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProjectGateOverrideEnabled(true);
                      setProjectGateOverrideDraft(projectGateConfig ?? globalGateConfig);
                    }}
                    className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
                  >
                    启用项目覆盖
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveProjectGateOverride()}
                    disabled={isProjectGateSaving}
                    className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isProjectGateSaving ? '保存中...' : '保存项目覆盖'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Server size={15} className="text-indigo-400" />
                服务端任务队列
              </div>
              <div className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-xs text-neutral-400">
                <p className="text-neutral-200">当前生效门控</p>
                {!gateConfig && (
                  <p className="mt-2 text-orange-300">后端门控配置暂未读取成功，当前展示为本地默认兜底或项目覆盖推断结果。</p>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <p>来源：{selectedEffectiveGateSource}</p>
                  <p>Review 自动重写级别：{formatReviewSeverity(selectedEffectiveGateConfig.reviewRewriteMinSeverity)}</p>
                  <p>最大自动重写：{selectedEffectiveGateConfig.reviewMaxRewriteCount} 次</p>
                  <p>一致性最低分：{selectedEffectiveGateConfig.reviewScoreThresholds.consistency}</p>
                  <p>连贯性最低分：{selectedEffectiveGateConfig.reviewScoreThresholds.continuity}</p>
                  <p>追读力最低分：{selectedEffectiveGateConfig.reviewScoreThresholds.reader_pull}</p>
                  <p>轻量召回最低分：{selectedEffectiveGateConfig.lightweightRecall.minScore}</p>
                  <p>轻量召回 Top-K：{selectedEffectiveGateConfig.lightweightRecall.topK}</p>
                  <p>轻量召回权重：词 {selectedEffectiveGateConfig.lightweightRecall.phraseWeight} / 实体 {selectedEffectiveGateConfig.lightweightRecall.entityWeight} / 时序 {selectedEffectiveGateConfig.lightweightRecall.recencyWeight}</p>
                  <p>轻量召回预设：{selectedEffectiveLightweightRecallPreset ? selectedEffectiveLightweightRecallPreset.label : '自定义权重'}</p>
                  <p>
                    Polish 终检放行：
                    {selectedEffectiveGateConfig.polishFailBlockReady ? 'fail 阻断 ready' : 'fail 也允许进入 ready'}
                  </p>
                </div>
              </div>
              {!selectedServerJob ? (
                <p className="text-sm text-neutral-500">当前章节还没有服务端任务。可以先加入服务端队列。</p>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-400">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-neutral-100">{selectedServerJob.chapterTitle}</p>
                      <span className="text-xs text-neutral-500">{formatJobStatus(selectedServerJob.status)}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-neutral-500 sm:grid-cols-2">
                      <p>当前步骤：{formatJobStep(selectedServerJob.currentStep, selectedServerJob.status)}</p>
                      <p>调度优先级：P{selectedServerJob.priority}</p>
                      <p>Beat 进度：{formatJobProgress(selectedServerJob)}</p>
                      <p>尝试次数：{selectedServerJob.attemptCount}</p>
                      <p>自动重写：{selectedServerJob.reviewRewriteCount} 次</p>
                    </div>
                    {selectedServerJob.reviewGateReason && (
                      <p className="mt-3 text-xs text-orange-300">门控原因：{selectedServerJob.reviewGateReason}</p>
                    )}
                    {selectedServerJob.rewriteGuidance && (
                      <div className="mt-3 rounded-2xl border border-orange-500/20 bg-orange-500/5 px-3 py-3">
                        <p className="text-xs text-orange-300">重写提示</p>
                        <pre className="mt-2 whitespace-pre-wrap text-xs leading-6 text-orange-100/80">
                          {selectedServerJob.rewriteGuidance}
                        </pre>
                      </div>
                    )}
                    {selectedServerJob.currentBeatLabel && (
                      <p className="mt-3 text-xs text-neutral-500">当前 beat：{selectedServerJob.currentBeatLabel}</p>
                    )}
                    {selectedServerJob.pausedAt && (
                      <p className="mt-2 text-xs text-sky-300">暂停时间：{formatTimeLabel(selectedServerJob.pausedAt)}</p>
                    )}
                    {selectedServerJob.errorMessage && (
                      <p className="mt-2 text-xs text-red-300">{selectedServerJob.errorMessage}</p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedServerJob.status === 'ready' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleApproveServerJob()}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                          >
                            <CheckCircle2 size={15} />
                            确认写回
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDiscardServerJob()}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <XCircle size={15} />
                            丢弃结果
                          </button>
                        </>
                      )}
                      {(selectedServerJob.status === 'queued' || selectedServerJob.status === 'running') && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handlePauseServerJob()}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-300"
                          >
                            <XCircle size={15} />
                            暂停任务
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDiscardServerJob()}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <XCircle size={15} />
                            取消任务
                          </button>
                        </>
                      )}
                      {selectedServerJob.status === 'paused' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleResumeServerJob()}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
                          >
                            <RefreshCcw size={15} />
                            恢复任务
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDiscardServerJob()}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <XCircle size={15} />
                            取消任务
                          </button>
                        </>
                      )}
                      {selectedServerJob.status === 'error' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRetryServerJob()}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                          >
                            <RefreshCcw size={15} />
                            重新排队
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDiscardServerJob()}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <XCircle size={15} />
                            取消任务
                          </button>
                        </>
                      )}
                      {selectedServerJob.status !== 'approved' && selectedServerJob.status !== 'discarded' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleReprioritizeServerJob(1)}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                          >
                            提升优先级
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReprioritizeServerJob(-1)}
                            disabled={isJobMutating || selectedServerJob.priority === 0}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            降低优先级
                          </button>
                        </>
                      )}
                      {(selectedServerJob.status === 'ready' || selectedServerJob.status === 'error' || selectedServerJob.status === 'paused') && selectedServerJob.generatedText.trim() && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRollbackServerJob('review')}
                            disabled={isJobMutating}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300"
                          >
                            回退到 Review
                          </button>
                          {selectedServerJob.review && (
                            <button
                              type="button"
                              onClick={() => void handleRollbackServerJob('polish')}
                              disabled={isJobMutating}
                              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300"
                            >
                              回退到 Polish
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {selectedServerJob.generatedText && (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                      <p className="mb-2 text-sm text-neutral-200">服务端生成预览</p>
                      <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-neutral-400">
                        {selectedServerJob.generatedText}
                      </pre>
                    </div>
                  )}

                  {selectedServerJob.summary && (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                      <p className="mb-2 text-sm text-neutral-200">服务端提取预览</p>
                      <p className="text-xs leading-6 text-neutral-400">{selectedServerJob.summary.summary}</p>
                      <p className="mt-2 text-xs text-neutral-500">
                        Strand：{selectedServerJob.strand ? getStrandLabel(selectedServerJob.strand) : '暂无'}
                      </p>
                      <p className="mt-2 text-xs text-neutral-500">
                        状态变更：{selectedServerJob.stateChanges.length} 条
                      </p>
                    </div>
                  )}

                  {selectedServerJob.review && (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-neutral-200">服务端审查报告</p>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] ${
                            selectedServerJob.review.overallSeverity === 'critical'
                              ? 'bg-red-500/15 text-red-300'
                              : selectedServerJob.review.overallSeverity === 'high'
                                ? 'bg-orange-500/15 text-orange-300'
                                : selectedServerJob.review.overallSeverity === 'medium'
                                  ? 'bg-yellow-500/15 text-yellow-300'
                                  : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          严重级别：{formatReviewSeverity(selectedServerJob.review.overallSeverity)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] ${
                            selectedServerJob.review.antiAiForceCheck === 'fail'
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          Anti-AI：{selectedServerJob.review.antiAiForceCheck === 'fail' ? '未通过' : '通过'}
                        </span>
                        {selectedServerJob.review.needsRewrite && (
                          <span className="rounded-full bg-red-500/15 px-2 py-1 text-[11px] text-red-300">
                            建议重写
                          </span>
                        )}
                        {selectedServerJob.reviewRewriteCount > 0 && (
                          <span className="rounded-full bg-orange-500/15 px-2 py-1 text-[11px] text-orange-300">
                            已自动重写 {selectedServerJob.reviewRewriteCount} 次
                          </span>
                        )}
                      </div>
                      {selectedServerJob.reviewGateReason && (
                        <p className="mt-3 text-xs leading-6 text-orange-300">门控原因：{selectedServerJob.reviewGateReason}</p>
                      )}
                      <p className="mt-3 text-xs leading-6 text-neutral-400">{selectedServerJob.review.summary}</p>
                      <div className="mt-4 space-y-3">
                        {selectedServerJob.review.checkerResults.map((checker) => (
                          <div key={checker.checker} className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-neutral-200">{formatCheckerLabel(checker.checker)}</span>
                              <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                                分数 {checker.score}
                              </span>
                              <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                                问题 {checker.issues.length}
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-6 text-neutral-500">{checker.summary}</p>
                            {checker.issues.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {checker.issues.map((issue, index) => (
                                  <div key={`${checker.checker}-${index}`} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                                    <p className="text-neutral-200">
                                      {index + 1}. {issue.title} · {formatReviewSeverity(issue.severity)}
                                    </p>
                                    <p className="mt-1 leading-6">{issue.description}</p>
                                    {issue.suggestion && (
                                      <p className="mt-1 text-neutral-500">建议：{issue.suggestion}</p>
                                    )}
                                    {issue.evidence && (
                                      <p className="mt-1 text-neutral-500">证据：{issue.evidence}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedServerJob.style && (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                      <p className="mb-2 text-sm text-neutral-200">服务端风格转译</p>
                      <p className="text-xs leading-6 text-neutral-400">{selectedServerJob.style.summary}</p>
                      {selectedServerJob.style.appliedChanges.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {selectedServerJob.style.appliedChanges.map((change, index) => (
                            <p key={`${selectedServerJob.id}-style-${index}`} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs leading-6 text-neutral-500">
                              {index + 1}. {change}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedServerJob.polish && (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-neutral-200">服务端润色结果</p>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] ${
                            selectedServerJob.polish.antiAiForceCheck === 'fail'
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          Anti-AI：{selectedServerJob.polish.antiAiForceCheck === 'fail' ? '未通过' : '通过'}
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-6 text-neutral-400">{selectedServerJob.polish.summary}</p>
                      {selectedServerJob.polish.appliedChanges.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {selectedServerJob.polish.appliedChanges.map((change, index) => (
                            <p key={`${selectedServerJob.id}-polish-${index}`} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs leading-6 text-neutral-500">
                              {index + 1}. {change}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <CheckCircle2 size={15} className="text-indigo-400" />
                当前章节状态
              </div>
              <div className="space-y-3 text-sm text-neutral-400">
                <p>正文长度：{selectedChapter ? selectedChapter.wordCount : 0} 字</p>
                <p>契约状态：{selectedOutline ? '已生成' : '未生成'}</p>
                <p>摘要状态：{selectedSummary ? '已提取' : '未提取'}</p>
                <p>最近 Strand：{selectedStrand ? getStrandLabel(selectedStrand) : '暂无'}</p>
                <p>服务端状态：{selectedServerJob ? formatJobStatus(selectedServerJob.status) : '未入队'}</p>
                <p>当前步骤：{selectedServerJob ? formatJobStep(selectedServerJob.currentStep, selectedServerJob.status) : '暂无'}</p>
                <p>优先级：{selectedServerJob ? `P${selectedServerJob.priority}` : '暂无'}</p>
                <p>Beat 进度：{selectedServerJob ? formatJobProgress(selectedServerJob) : '暂无'}</p>
                <p>自动重写：{selectedServerJob ? `${selectedServerJob.reviewRewriteCount} 次` : '暂无'}</p>
                <p>审查级别：{selectedServerJob?.review ? formatReviewSeverity(selectedServerJob.review.overallSeverity) : '暂无'}</p>
                <p>风格层：{selectedServerJob?.style ? '已执行' : (settings.stylePrompt.trim() ? '待执行/未入队' : '未启用')}</p>
                <p>润色终检：{selectedServerJob?.polish ? (selectedServerJob.polish.antiAiForceCheck === 'fail' ? '未通过' : '通过') : '暂无'}</p>
                <p>门控原因：{selectedServerJob?.reviewGateReason || '暂无'}</p>
                <p>重写提示：{selectedServerJob?.rewriteGuidance ? '已生成' : '暂无'}</p>
                <p>生效门控来源：{selectedEffectiveGateSource}</p>
                <p>生效严重级别门槛：{formatReviewSeverity(selectedEffectiveGateConfig.reviewRewriteMinSeverity)}</p>
                <p>生效最大重写：{selectedEffectiveGateConfig.reviewMaxRewriteCount} 次</p>
                <p>生效分数门槛：一{selectedEffectiveGateConfig.reviewScoreThresholds.consistency} / 连{selectedEffectiveGateConfig.reviewScoreThresholds.continuity} / 追{selectedEffectiveGateConfig.reviewScoreThresholds.reader_pull}</p>
                <p>生效轻量召回最低分：{selectedEffectiveGateConfig.lightweightRecall.minScore}</p>
                <p>生效轻量召回 Top-K：{selectedEffectiveGateConfig.lightweightRecall.topK}</p>
                <p>生效轻量召回权重：词 {selectedEffectiveGateConfig.lightweightRecall.phraseWeight} / 实体 {selectedEffectiveGateConfig.lightweightRecall.entityWeight} / 时序 {selectedEffectiveGateConfig.lightweightRecall.recencyWeight}</p>
                <p>生效轻量召回预设：{selectedEffectiveLightweightRecallPreset ? selectedEffectiveLightweightRecallPreset.label : '自定义权重'}</p>
                <p>生效 Polish 放行：{selectedEffectiveGateConfig.polishFailBlockReady ? 'fail 阻断 ready' : 'fail 允许进入 ready'}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Server size={15} className="text-indigo-400" />
                SQLite 调试面板
              </div>
              {!debugOverview ? (
                <p className="text-sm text-neutral-500">当前还没有读取到 SQLite 调试数据。</p>
              ) : (
                <div className="space-y-4 text-sm text-neutral-400">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">任务</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.generationJobs}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">摘要</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.chapterSummaries}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">状态变更</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.stateChanges}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">审查指标</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.reviewMetrics}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">实体</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.entities}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">关系</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.relationships}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">伏笔</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.foreshadows}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">卷总结</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.volumeRecaps}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">记忆切片</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.memoryChunks}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 px-3 py-3">
                      <p className="text-neutral-500">向量缓存</p>
                      <p className="mt-1 text-neutral-200">{debugOverview.counts.memoryEmbeddings}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-neutral-200">维护入口</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          作用范围：{maintenanceScopeLabel}。向量回填使用服务端当前 `OPENAI_EMBEDDING_MODEL`。
                        </p>
                      </div>
                      {activeMaintenanceRun && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 text-[11px] text-indigo-200">
                          <RefreshCcw size={12} className="animate-spin" />
                          正在执行：
                          {activeMaintenanceRun.kind === 'chunks'
                            ? '记忆切片'
                            : activeMaintenanceRun.kind === 'volume-recaps'
                              ? '卷级总结'
                              : '向量缓存'}
                          {' / '}
                          {formatMaintenanceScopeLabel(activeMaintenanceRun.scope, activeMaintenanceRun.chapterTitle)}
                          {' / '}
                          {formatMaintenanceLimitLabel(activeMaintenanceRun.limit)}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto_auto]">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-neutral-300">作用范围</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setMaintenanceScope('project')}
                            className={`rounded-full border px-3 py-2 text-xs transition-colors ${
                              maintenanceScope === 'project'
                                ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                                : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900'
                            }`}
                          >
                            当前项目
                          </button>
                          <button
                            type="button"
                            onClick={() => setMaintenanceScope('chapter')}
                            disabled={!selectedDebugChapterId}
                            className={`rounded-full border px-3 py-2 text-xs transition-colors ${
                              maintenanceScope === 'chapter'
                                ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                                : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900'
                            } disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600`}
                          >
                            当前调试章节
                          </button>
                        </div>
                        <p className="text-[11px] text-neutral-500">
                          当前章节：{selectedDebugChapter?.chapterTitle || '请先在章节索引里选择'}
                        </p>
                      </div>

                      <label className="block">
                        <span className="mb-2 block text-xs font-medium text-neutral-300">limit</span>
                        <input
                          value={maintenanceLimitInput}
                          onChange={(event) => setMaintenanceLimitInput(event.target.value.replace(/[^\d]/g, ''))}
                          placeholder="留空表示全量"
                          inputMode="numeric"
                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-xs text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => void handleBackfillMemoryChunks()}
                        disabled={isMaintenanceActionDisabled}
                        className="inline-flex items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-600"
                      >
                        {isChunkBackfilling ? '切片回填中...' : '回填记忆切片'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleBackfillVolumeRecaps()}
                        disabled={isMaintenanceActionDisabled}
                        className="inline-flex items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-200 transition-colors hover:border-amber-500/50 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-950/70 disabled:text-neutral-600"
                      >
                        {isVolumeRecapBackfilling ? '卷总结回填中...' : '回填卷级总结'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleBackfillMemoryEmbeddings()}
                        disabled={isMaintenanceActionDisabled}
                        className="inline-flex items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-xs font-medium text-indigo-200 transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/15 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-950/70 disabled:text-neutral-600"
                      >
                        {isEmbeddingBackfilling ? '向量回填中...' : '回填向量缓存'}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-3">
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4 text-xs text-neutral-400">
                        <p className="text-sm text-neutral-200">切片回填结果</p>
                        {!lastChunkBackfill ? (
                          <p className="mt-2 text-neutral-500">暂无执行记录。</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <p className="text-neutral-500">
                              {formatTimeLabel(lastChunkBackfill.finishedAt)}
                              {' / '}
                              {formatMaintenanceScopeLabel(lastChunkBackfill.scope, lastChunkBackfill.chapterTitle)}
                              {' / '}
                              {formatMaintenanceLimitLabel(lastChunkBackfill.limit)}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <p>候选章节：{lastChunkBackfill.result.totalCandidates}</p>
                              <p>已处理：{lastChunkBackfill.result.processedChapters}</p>
                              <p>跳过空摘要：{lastChunkBackfill.result.skippedChapters}</p>
                              <p>缺正文：{lastChunkBackfill.result.missingContentChapters}</p>
                              <p>总切片：{lastChunkBackfill.result.totalChunks}</p>
                              <p>Parent / Child：{lastChunkBackfill.result.parentChunks} / {lastChunkBackfill.result.childChunks}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4 text-xs text-neutral-400">
                        <p className="text-sm text-neutral-200">卷总结回填结果</p>
                        {!lastVolumeRecapBackfill ? (
                          <p className="mt-2 text-neutral-500">暂无执行记录。</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <p className="text-neutral-500">
                              {formatTimeLabel(lastVolumeRecapBackfill.finishedAt)}
                              {' / '}
                              {formatMaintenanceScopeLabel(lastVolumeRecapBackfill.scope, lastVolumeRecapBackfill.chapterTitle)}
                              {' / '}
                              {formatMaintenanceLimitLabel(lastVolumeRecapBackfill.limit)}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <p>候选卷：{lastVolumeRecapBackfill.result.totalVolumes}</p>
                              <p>已处理：{lastVolumeRecapBackfill.result.processedVolumes}</p>
                              <p className="sm:col-span-2">跳过：{lastVolumeRecapBackfill.result.skippedVolumes}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4 text-xs text-neutral-400">
                        <p className="text-sm text-neutral-200">向量回填结果</p>
                        {!lastEmbeddingBackfill ? (
                          <p className="mt-2 text-neutral-500">暂无执行记录。</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <p className="text-neutral-500">
                              {formatTimeLabel(lastEmbeddingBackfill.finishedAt)}
                              {' / '}
                              {formatMaintenanceScopeLabel(lastEmbeddingBackfill.scope, lastEmbeddingBackfill.chapterTitle)}
                              {' / '}
                              {formatMaintenanceLimitLabel(lastEmbeddingBackfill.limit)}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <p>候选切片：{lastEmbeddingBackfill.result.totalCandidates}</p>
                              <p>新增向量：{lastEmbeddingBackfill.result.createdChunks}</p>
                              <p>失效重建：{lastEmbeddingBackfill.result.rebuiltChunks}</p>
                              <p>写入向量：{lastEmbeddingBackfill.result.embeddedChunks}</p>
                              <p>复用缓存：{lastEmbeddingBackfill.result.reusedChunks}</p>
                              <p>跳过：{lastEmbeddingBackfill.result.skippedChunks}</p>
                              <p>
                                跳过原因：未启用 {lastEmbeddingBackfill.result.skipReasonCounts.embeddingDisabled}
                                {' / '}
                                空内容 {lastEmbeddingBackfill.result.skipReasonCounts.emptyContent}
                                {' / '}
                                失败 {lastEmbeddingBackfill.result.skipReasonCounts.embeddingFailed}
                              </p>
                              <p>
                                配置后端：{lastEmbeddingBackfill.result.vectorBackend.configuredBackend}
                                {' / '}
                                生效后端：{lastEmbeddingBackfill.result.vectorBackend.activeBackend}
                              </p>
                              <p className="sm:col-span-2">
                                当前模型：{lastEmbeddingBackfill.result.embeddingModel || '未配置'}
                              </p>
                              {lastEmbeddingBackfill.result.vectorBackend.fallbackReason && (
                                <p className="sm:col-span-2 text-amber-300">
                                  后端回退：{lastEmbeddingBackfill.result.vectorBackend.fallbackReason}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-300">章节筛选</span>
                      <input
                        value={debugChapterQuery}
                        onChange={(event) => setDebugChapterQuery(event.target.value)}
                        placeholder="章节标题 / 摘要 / beat"
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-xs text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-300">实体筛选</span>
                      <input
                        value={debugEntityQuery}
                        onChange={(event) => setDebugEntityQuery(event.target.value)}
                        placeholder="实体名 / 类型 / 标签"
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-xs text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-neutral-300">关系筛选</span>
                      <input
                        value={debugRelationshipQuery}
                        onChange={(event) => setDebugRelationshipQuery(event.target.value)}
                        placeholder="关系词 / 实体 / 证据"
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-xs text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <p className="mb-2 text-sm text-neutral-200">最近任务</p>
                    {debugOverview.recentJobs.length === 0 ? (
                      <p className="text-xs text-neutral-500">暂无</p>
                    ) : (
                      <div className="space-y-2">
                        {debugOverview.recentJobs.map((job) => (
                          <div key={job.id} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                            <p className="text-neutral-200">{job.chapterTitle}</p>
                            <p className="mt-1">{formatJobStatus(job.status)} / {formatJobStep(job.currentStep, job.status)}</p>
                            <p className="mt-1 text-neutral-500">{formatTimeLabel(job.updatedAt)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <p className="mb-2 text-sm text-neutral-200">章节索引</p>
                    {debugChapters.length === 0 ? (
                      <p className="text-xs text-neutral-500">暂无</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          {debugChapters.slice(0, 6).map((item) => (
                            <button
                              key={item.chapterId}
                              type="button"
                              onClick={() => setSelectedDebugChapterId(item.chapterId)}
                              className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                                item.chapterId === selectedDebugChapterId
                                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                                  : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900'
                              }`}
                            >
                              <p className="text-neutral-200">{item.chapterTitle}</p>
                              <p className="mt-1">时间锚点：{item.timeAnchor || '暂无'} / Strand：{item.strand || '暂无'}</p>
                            </button>
                          ))}
                        </div>

                        {debugChapterDetail && (
                          <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-3 text-xs text-neutral-400">
                            <p className="text-sm text-neutral-200">{debugChapterDetail.chapterTitle}</p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <p>章节序号：{debugChapterDetail.chapterOrder || '暂无'}</p>
                              <p>卷名：{debugChapterDetail.volumeTitle || '暂无'}</p>
                              <p>上一章：{debugChapterDetail.previousChapterTitle || '暂无'}</p>
                              <p>时间锚点：{debugChapterDetail.timeAnchor || '暂无'}</p>
                              <p>Strand：{debugChapterDetail.strand || '暂无'}</p>
                              <p>节拍数：{debugChapterDetail.beatCount}</p>
                              <p>Hook：{debugChapterDetail.hookType || '暂无'} / {debugChapterDetail.hookStrength || '暂无'}</p>
                            </div>
                            <p className="mt-2">实体：{debugChapterDetail.entitiesAppeared.join('、') || '暂无'}</p>
                            <p className="mt-1">地点：{debugChapterDetail.locations.join('、') || '暂无'}</p>
                            <p className="mt-1">摘要：{debugChapterDetail.summaryExcerpt || '暂无'}</p>
                            <p className="mt-1">钩子：{debugChapterDetail.hook || '暂无'}</p>
                            <p className="mt-1">伏笔：{debugChapterDetail.foreshadowings.join('、') || '暂无'}</p>
                            <p className="mt-1">不可变事实：{debugChapterDetail.immutableFacts.join('、') || '暂无'}</p>

                            <div className="mt-3">
                              <p className="text-neutral-300">Beats</p>
                              <div className="mt-2 space-y-1">
                                {debugChapterDetail.beats.length === 0 ? (
                                  <p className="text-neutral-500">暂无</p>
                                ) : (
                                  debugChapterDetail.beats.map((beat, index) => (
                                    <p key={`${debugChapterDetail.chapterId}-beat-${index}`}>{index + 1}. {beat}</p>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="mt-3">
                              <p className="text-neutral-300">状态变更</p>
                              <div className="mt-2 space-y-1">
                                {debugChapterDetail.stateChanges.length === 0 ? (
                                  <p className="text-neutral-500">暂无</p>
                                ) : (
                                  debugChapterDetail.stateChanges.slice(0, 6).map((change) => (
                                    <p key={change.id}>
                                      {change.entityName} · {change.field}：{change.oldValue || '空'} → {change.newValue}
                                    </p>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="mt-3">
                              <p className="text-neutral-300">关系</p>
                              <div className="mt-2 space-y-1">
                                {debugChapterDetail.relationships.length === 0 ? (
                                  <p className="text-neutral-500">暂无</p>
                                ) : (
                                  debugChapterDetail.relationships.slice(0, 6).map((relationship) => (
                                    <div key={relationship.id} className="rounded-xl border border-neutral-800 px-3 py-2">
                                      <p>
                                        {relationship.sourceEntityName}
                                        <span className="mx-1 text-neutral-600">→</span>
                                        {relationship.targetEntityName || '未识别目标'}
                                        <span className="mx-1 text-neutral-600">/</span>
                                        {relationship.relationshipType}
                                      </p>
                                      <p className="mt-1 text-neutral-500">来源：{relationship.sourceKind}</p>
                                      <p className="mt-1 text-neutral-500">证据：{relationship.evidence || relationship.description}</p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <p className="mb-2 text-sm text-neutral-200">实体快照</p>
                    {debugEntities.length === 0 ? (
                      <p className="text-xs text-neutral-500">暂无</p>
                    ) : (
                      <div className="space-y-2">
                        {debugEntities.slice(0, 4).map((item) => (
                          <div key={`${item.entityName}-${item.updatedAt}`} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                            <p className="text-neutral-200">{item.entityName}</p>
                            <p className="mt-1">类型：{item.entityType || 'unknown'}{item.pinned ? ' / 已钉选' : ''}</p>
                            <p className="mt-1">描述：{item.description || '暂无'}</p>
                            <p className="mt-1">标签：{item.tags.join('、') || '暂无'}</p>
                            <p className="mt-1">最近章节：{item.lastSeenChapterTitle}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <p className="mb-2 text-sm text-neutral-200">关系抽取</p>
                    {debugRelationships.length === 0 ? (
                      <p className="text-xs text-neutral-500">暂无</p>
                    ) : (
                      <div className="space-y-2">
                        {debugRelationships.slice(0, 4).map((item) => (
                          <div key={item.id} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                            <p className="text-neutral-200">
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
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <p className="mb-2 text-sm text-neutral-200">服务端伏笔</p>
                    {debugForeshadows.length === 0 ? (
                      <p className="text-xs text-neutral-500">当前还没有读取到服务端伏笔快照。</p>
                    ) : (
                      <div className="space-y-2">
                        {debugForeshadows.slice(0, 4).map((item) => (
                          <div key={`${item.id}-${item.updatedAt}`} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                            <p className="text-neutral-200">{item.title}</p>
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
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <p className="mb-2 text-sm text-neutral-200">卷级总结</p>
                    {debugVolumeRecaps.length === 0 ? (
                      <p className="text-xs text-neutral-500">当前还没有读取到卷级总结。</p>
                    ) : (
                      <div className="space-y-2">
                        {debugVolumeRecaps.slice(0, 4).map((item) => (
                          <div key={`${item.volumeTitle}-${item.updatedAt}`} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                            <p className="text-neutral-200">{item.volumeTitle}</p>
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
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                    <p className="mb-2 text-sm text-neutral-200">记忆切片</p>
                    {debugMemoryChunks.length === 0 ? (
                      <p className="text-xs text-neutral-500">当前章节暂无记忆切片。</p>
                    ) : (
                      <div className="space-y-2">
                        {debugMemoryChunks.slice(0, 6).map((item) => (
                          <div key={item.id} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                            <p className="text-neutral-200">
                              {item.chunkKind} / {item.sourceKind} / #{item.chunkIndex + 1}
                            </p>
                            <p className="mt-1">Token 估算：{item.tokenCount}</p>
                            <p className="mt-1">实体：{item.entityRefs.join('、') || '暂无'}</p>
                            <p className="mt-1">地点：{item.locations.join('、') || '暂无'}</p>
                            <p className="mt-1 text-neutral-500">{item.content.slice(0, 160) || '暂无内容'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 md:col-span-2">
                    <p className="mb-2 text-sm text-neutral-200">检索候选</p>
                    {!selectedDebugChapterId ? (
                      <p className="text-xs text-neutral-500">请先选择一个章节。</p>
                    ) : !debugRetrieval ? (
                      <p className="text-xs text-neutral-500">当前还没有读取到检索调试数据。</p>
                    ) : debugRetrieval.items.length === 0 ? (
                      <div className="space-y-2 text-xs text-neutral-500">
                        <p>当前没有命中的检索候选。</p>
                        <p>查询短语：{debugRetrieval.queryPhrases.join(' / ') || '暂无'}</p>
                      </div>
                    ) : (
                      <div className="space-y-3 text-xs text-neutral-400">
                        <p>
                          查询短语：{debugRetrieval.queryPhrases.join(' / ') || '暂无'}；聚焦实体：
                          {debugRetrieval.focusEntityNames.join('、') || '暂无'}
                        </p>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-500">
                          <p>
                            向量后端：配置 {debugRetrieval.vectorBackend.configuredBackend} / 生效 {debugRetrieval.vectorBackend.activeBackend}
                          </p>
                          <p>Embedding 模型：{debugRetrieval.vectorBackend.embeddingModel || '未配置'}</p>
                          <p>向量检索状态：{debugRetrieval.vectorBackend.isVectorEnabled ? '已启用' : '未启用'}</p>
                          <p>索引检索能力：{debugRetrieval.vectorBackend.supportsIndexedSearch ? '已启用' : '未启用'}</p>
                          <p>
                            向量候选池：{debugRetrieval.vectorSearch.candidatePoolSize} / Top-K {debugRetrieval.vectorSearch.topK} / 命中 {debugRetrieval.vectorSearch.matchedCandidateCount}
                          </p>
                          <p>向量候选来源：{debugRetrieval.vectorSearch.source}</p>
                          <p>
                            向量门槛：分数 {debugRetrieval.vectorSearch.minScore} / 相似度 {debugRetrieval.vectorSearch.minSimilarity.toFixed(2)}
                          </p>
                          <p>向量通道：{debugRetrieval.vectorSearch.status}</p>
                          <p>
                            Metadata Filter：输入 {debugRetrieval.pipeline.metadataFilter.inputCandidates} / 输出 {debugRetrieval.pipeline.metadataFilter.outputCandidates} / 过滤 {debugRetrieval.pipeline.metadataFilter.filteredOutCandidates}
                          </p>
                          <p>
                            Hybrid Recall：总计 {debugRetrieval.pipeline.hybridRecall.candidateCount} / 关键词 {debugRetrieval.pipeline.hybridRecall.lexicalOnlyCount} / 向量 {debugRetrieval.pipeline.hybridRecall.vectorOnlyCount} / 混合 {debugRetrieval.pipeline.hybridRecall.hybridCount}
                          </p>
                          <p>
                            Dedupe/Rerank：输入 {debugRetrieval.pipeline.dedupeRerank.inputCandidates} / 去重后 {debugRetrieval.pipeline.dedupeRerank.dedupedCandidates} / 合并 {debugRetrieval.pipeline.dedupeRerank.mergedAwayCandidates}
                          </p>
                          <p>
                            Selection：输入 {debugRetrieval.pipeline.selection.inputCandidates} / 阈值内 {debugRetrieval.pipeline.selection.thresholdSelectedCandidates} / 选中 {debugRetrieval.pipeline.selection.selectedCandidates} / vector-only 补位 {debugRetrieval.pipeline.selection.rescuedVectorOnlyCandidates} / limit {debugRetrieval.pipeline.selection.limit} / 阈值 {debugRetrieval.pipeline.selection.dynamicThreshold ?? '未触发'}
                          </p>
                          <p>
                            Selection 明细：阈值淘汰 {debugRetrieval.pipeline.selection.droppedBelowThresholdCandidates} / limit 淘汰 {debugRetrieval.pipeline.selection.droppedByLimitCandidates}
                          </p>
                          {debugRetrieval.pipeline.selection.rescuedVectorOnlyChunkIds.length > 0 && (
                            <p className="mt-1 text-emerald-300">
                              vector-only 保留：{debugRetrieval.pipeline.selection.rescuedVectorOnlyChunkIds.join('、')}
                            </p>
                          )}
                          {debugRetrieval.pipeline.selection.droppedVectorOnlyChunkIds.length > 0 && (
                            <p className="mt-1 text-amber-300">
                              vector-only 未保留：{debugRetrieval.pipeline.selection.droppedVectorOnlyChunkIds.join('、')}
                            </p>
                          )}
                          {debugRetrieval.vectorSearch.fallbackReason && (
                            <p className="mt-1 text-amber-300">向量通道说明：{debugRetrieval.vectorSearch.fallbackReason}</p>
                          )}
                          {debugRetrieval.vectorBackend.fallbackReason && (
                            <p className="mt-1 text-amber-300">后端回退：{debugRetrieval.vectorBackend.fallbackReason}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          {debugRetrieval.items.slice(0, 6).map((item) => (
                            <div key={item.id} className="rounded-xl border border-neutral-800 px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200">
                                  {formatRetrievalSourceLabel(item.sourceType)}
                                </span>
                                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                                  {formatRetrievalHitOriginLabel(item.retrievalHitOrigin)}
                                </span>
                                <p className="text-neutral-200">
                                  {formatRetrievalItemTitle(item)}
                                </p>
                                <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200">
                                  分数 {item.score}
                                </span>
                              </div>
                              <p className="mt-1">命中词：{item.matchedTerms.join('、') || '暂无'}</p>
                              <p className="mt-1">命中实体：{item.matchedEntityNames.join('、') || '暂无'}</p>
                              <p className="mt-1">命中地点：{item.matchedLocations.join('、') || '暂无'}</p>
                              <p className="mt-1">
                                命中来源：{item.retrievalSignals.join(' + ') || '暂无'}
                                {item.vectorSimilarity !== null ? `；向量相似度 ${item.vectorSimilarity.toFixed(3)}` : ''}
                              </p>
                              <p className="mt-1">
                                去重/重排：合并 {item.mergedCandidateCount} 条；初始 {item.preRerankScore} -> 最终 {item.score}
                                {item.rerankDelta === 0 ? '（未调整）' : `（${item.rerankDelta > 0 ? '+' : ''}${item.rerankDelta}）`}
                              </p>
                              <p className="mt-1 text-neutral-500">
                                重排依据：{item.rerankReasons.join('；') || '无'}
                              </p>
                              <p className="mt-1 text-neutral-500">
                                分项：卷 {item.scoreBreakdown.sameVolume} / 词 {item.scoreBreakdown.phrase} / 实体 {item.scoreBreakdown.entity} / 地点 {item.scoreBreakdown.location} / 时序 {item.scoreBreakdown.recency} / 切片 {item.scoreBreakdown.chunkKind} / 向量 {item.scoreBreakdown.embedding}
                              </p>
                              <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs leading-6 text-neutral-500">
                                {item.block || item.contentExcerpt || item.summaryExcerpt || '暂无摘要'}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 md:col-span-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-neutral-200">Context 预览</p>
                      {debugContext && (
                        <>
                          <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200">
                            摘要 {debugContext.recentSummaryCount}
                          </span>
                          <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200">
                            尾部 {debugContext.recentTextCount}
                          </span>
                          <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                            卷总结 {debugContext.volumeRecapCount}
                          </span>
                          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                            相关章节 {debugContext.relatedChapterCount}
                          </span>
                          <span className="rounded-full bg-orange-500/10 px-2 py-1 text-[11px] text-orange-200">
                            休眠伏笔召回 {debugContext.dormantForeshadowRecallCount}
                          </span>
                          <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200">
                            卷总结召回 {debugContext.volumeRecapRecallCount}
                          </span>
                          <span className="rounded-full bg-fuchsia-500/10 px-2 py-1 text-[11px] text-fuchsia-200">
                            实体 {debugContext.entityCount} / 关系 {debugContext.relationshipCount}
                          </span>
                          {debugContext.hasFallbackContext && (
                            <span className="rounded-full bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-200">
                              含前端补充上下文
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {!selectedDebugChapterId ? (
                      <p className="mt-3 text-xs text-neutral-500">请先选择一个章节。</p>
                    ) : !debugContext ? (
                      <p className="mt-3 text-xs text-neutral-500">当前还没有读取到 Context 调试数据。</p>
                    ) : (
                      <div className="mt-3 space-y-4 text-xs text-neutral-400">
                        <p>
                          聚焦实体：{debugContext.focusEntityNames.join('、') || '暂无'}；检索短语：
                          {debugContext.queryPhrases.join(' / ') || '暂无'}
                        </p>

                        {debugContext.lightweightRecallItems.length > 0 && (
                          <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                            <p className="text-sm text-neutral-200">轻量召回排序</p>
                            <div className="mt-2 space-y-2">
                              {debugContext.lightweightRecallItems.map((item, index) => (
                                <div key={`${item.sourceType}-${item.title}-${index}`} className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200">
                                      {formatLightweightRecallSourceLabel(item.sourceType)}
                                    </span>
                                    <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200">
                                      分数 {item.score}
                                    </span>
                                    <p className="text-neutral-200">{item.title}</p>
                                  </div>
                                  <p className="mt-2 text-xs text-neutral-500">
                                    分项：{formatLightweightRecallBreakdown(item)}
                                  </p>
                                  <p className="mt-1 text-xs text-neutral-500">
                                    命中词：{item.matchedPhrases.join('、') || '暂无'}；命中实体：{item.matchedEntities.join('、') || '暂无'}
                                  </p>
                                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-6 text-neutral-500">
                                    {item.block}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid gap-3 xl:grid-cols-2">
                          {debugContext.sections.map((section) => (
                            <div key={section.key} className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                              <p className="text-sm text-neutral-200">{section.title}</p>
                              <div className="mt-2 space-y-2">
                                {section.blocks.map((block, index) => (
                                  <pre
                                    key={`${section.key}-${index}`}
                                    className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 font-sans text-xs leading-6 text-neutral-400"
                                  >
                                    {block}
                                  </pre>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                          <p className="text-sm text-neutral-200">最终 contextBundle</p>
                          <pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-3 font-sans text-xs leading-6 text-neutral-400">
                            {debugContext.bundle || '暂无'}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      <GenerationLabDialog
        open={showGenerationLab}
        onClose={() => {
          setShowGenerationLab(false);
          void refreshOverview(false);
        }}
        projectId={projectId}
        projectTitle={projectTitle}
        projectDescription={projectDescription}
        chapter={selectedChapter}
        chapters={chapters}
        content={selectedChapter?.content ?? { type: 'doc', content: [] }}
        settings={settings}
        entities={entities}
        onApplyGeneratedContent={(nextDocument) => {
          if (!selectedChapter) {
            return;
          }

          void saveChapterContent(selectedChapter.id, nextDocument);
        }}
        onCreateSnapshot={async () => {
          if (!selectedChapter) {
            return;
          }

          await createSnapshot({
            projectId,
            chapterId: selectedChapter.id,
            chapterTitle: selectedChapter.title,
            content: selectedChapter.content,
            source: 'manual',
            note: '生成控制台手动快照',
          });
        }}
      />
    </div>
  );
}
