import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Blocks,
  CircleAlert,
  Compass,
  Download,
  Filter,
  GitBranch,
  Globe2,
  KeyRound,
  LoaderCircle,
  RefreshCcw,
  Shield,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { AntagonistAgendaPanel } from '@/components/AntagonistAgendaPanel';
import { ForeshadowPlanPanel } from '@/components/ForeshadowPlanPanel';
import { PovPermissionPanel } from '@/components/PovPermissionPanel';
import { QuestionPoolPanel } from '@/components/QuestionPoolPanel';
import { ResourceContinuityPanel } from '@/components/ResourceContinuityPanel';
import { StructureWorkspaceIndex } from '@/components/StructureWorkspaceIndex';
import { ThreadLedgerPanel } from '@/components/ThreadLedgerPanel';
import { useToast } from '@/components/Toast';
import { WorldStatePanel } from '@/components/WorldStatePanel';
import {
  applyStructureMemoryBackfill,
  fetchStructureMemoryGuardAlerts,
  previewStructureMemoryBackfill,
} from '@/lib/structure-memory-client';
import {
  useAntagonistAgendaStore,
  useForeshadowStore,
  useForeshadowPlanStore,
  usePovPermissionStore,
  useQuestionPoolStore,
  useResourceContinuityStore,
  useSettingsStore,
  useThreadLedgerStore,
  useWorldStateStore,
} from '@/stores';
import type {
  Id,
  StructureMemoryBackfillApplyResult,
  StructureMemoryBackfillPreviewResult,
  StructureMemoryGuardAlert,
  StructureMemorySystemKey,
} from '@/types';

interface StructureWorkspaceProps {
  projectId: Id;
  initialSectionKey?: string | null;
  navigationToken?: number;
  onOpenEditor?: () => void;
  onOpenChapter?: (chapterId: Id) => void;
}

type SectionFilterMode = 'all' | 'attention' | 'unsynced';
type SectionGroupMode = 'all' | 'planning' | 'world' | 'control' | 'continuity';

interface SectionSummary {
  key: string;
  label: string;
  icon: typeof Blocks;
  count: number;
  attentionCount: number;
  unsyncedCount: number;
  description: string;
  group: SectionGroupMode;
  render: () => ReactNode;
}

const BACKFILL_SYSTEM_LABELS: Record<
  StructureMemoryBackfillPreviewResult['counts'][number]['system'],
  string
> = {
  thread_ledger: '剧情线账本',
  question_pool: '未解问题',
  world_state_entry: '世界状态',
  resource_continuity: '资源连续性',
};

function getGuardSectionSystemKey(system: StructureMemorySystemKey) {
  switch (system) {
    case 'thread_ledger':
      return 'thread-ledger';
    case 'foreshadow_plan':
      return 'foreshadow-plan';
    case 'world_state_entry':
      return 'world-state';
    case 'question_pool':
      return 'question-pool';
    case 'antagonist_agenda':
      return 'antagonist-agenda';
    case 'pov_permission':
      return 'pov-permission';
    case 'resource_continuity':
    default:
      return 'resource-continuity';
  }
}

function scrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

export function StructureWorkspace({
  projectId,
  initialSectionKey = null,
  navigationToken = 0,
  onOpenEditor,
  onOpenChapter,
}: StructureWorkspaceProps) {
  const { toast } = useToast();
  const settings = useSettingsStore((state) => state.settings);
  const [filterMode, setFilterMode] = useState<SectionFilterMode>('all');
  const [groupMode, setGroupMode] = useState<SectionGroupMode>('all');
  const [activeSectionKey, setActiveSectionKey] = useState<string>('thread-ledger');
  const [backfillPreview, setBackfillPreview] = useState<StructureMemoryBackfillPreviewResult | null>(null);
  const [lastBackfillApply, setLastBackfillApply] = useState<StructureMemoryBackfillApplyResult | null>(null);
  const [guardAlerts, setGuardAlerts] = useState<StructureMemoryGuardAlert[]>([]);
  const [isGuardLoading, setIsGuardLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isBackfillApplying, setIsBackfillApplying] = useState(false);
  const threadLedgers = useThreadLedgerStore((state) => state.threadLedgers);
  const threadAlerts = useThreadLedgerStore((state) => state.alerts);
  const threadSyncStatusById = useThreadLedgerStore((state) => state.syncStatusById);
  const loadThreadLedgers = useThreadLedgerStore((state) => state.loadThreadLedgers);
  const foreshadows = useForeshadowStore((state) => state.foreshadows);
  const foreshadowPlans = useForeshadowPlanStore((state) => state.foreshadowPlans);
  const foreshadowAlerts = useForeshadowPlanStore((state) => state.alerts);
  const foreshadowSyncStatusById = useForeshadowPlanStore((state) => state.syncStatusById);
  const loadForeshadowPlans = useForeshadowPlanStore((state) => state.loadForeshadowPlans);
  const worldStateEntries = useWorldStateStore((state) => state.worldStateEntries);
  const worldStateSyncStatusById = useWorldStateStore((state) => state.syncStatusById);
  const loadWorldStateEntries = useWorldStateStore((state) => state.loadWorldStateEntries);
  const questionPools = useQuestionPoolStore((state) => state.questionPools);
  const questionAlerts = useQuestionPoolStore((state) => state.alerts);
  const questionSyncStatusById = useQuestionPoolStore((state) => state.syncStatusById);
  const loadQuestionPools = useQuestionPoolStore((state) => state.loadQuestionPools);
  const antagonistAgendas = useAntagonistAgendaStore((state) => state.antagonistAgendas);
  const antagonistSyncStatusById = useAntagonistAgendaStore((state) => state.syncStatusById);
  const loadAntagonistAgendas = useAntagonistAgendaStore((state) => state.loadAntagonistAgendas);
  const povPermissions = usePovPermissionStore((state) => state.povPermissions);
  const povSyncStatusById = usePovPermissionStore((state) => state.syncStatusById);
  const loadPovPermissions = usePovPermissionStore((state) => state.loadPovPermissions);
  const resourceContinuities = useResourceContinuityStore((state) => state.resourceContinuities);
  const resourceSyncStatusById = useResourceContinuityStore((state) => state.syncStatusById);
  const loadResourceContinuities = useResourceContinuityStore((state) => state.loadResourceContinuities);

  const guardAlertCountBySystem = useMemo(() => {
    return guardAlerts.reduce<Record<string, number>>((accumulator, alert) => {
      const key = getGuardSectionSystemKey(alert.targetSystem);
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [guardAlerts]);

  const newBackfillCandidates = useMemo(
    () => backfillPreview?.candidates.filter((item) => item.status === 'new') ?? [],
    [backfillPreview],
  );

  async function reloadStructureMemory() {
    await Promise.all([
      loadThreadLedgers(projectId),
      loadForeshadowPlans(projectId),
      loadWorldStateEntries(projectId),
      loadQuestionPools(projectId),
      loadAntagonistAgendas(projectId),
      loadPovPermissions(projectId),
      loadResourceContinuities(projectId),
    ]);
  }

  async function refreshGuardAlerts(silent = false) {
    setIsGuardLoading(true);

    try {
      const result = await fetchStructureMemoryGuardAlerts(settings.serverUrl, projectId);
      setGuardAlerts(result.items);

      if (!silent) {
        toast(`守护扫描完成：发现 ${result.items.length} 条联动告警`, 'success');
      }
    } catch (error) {
      if (!silent) {
        toast(error instanceof Error ? error.message : '刷新守护告警失败', 'error');
      }
    } finally {
      setIsGuardLoading(false);
    }
  }

  async function handlePreviewBackfill(silent = false) {
    setIsPreviewLoading(true);

    try {
      const result = await previewStructureMemoryBackfill(settings.serverUrl, {
        projectId,
      });
      setBackfillPreview(result);
      if (!silent) {
        toast(`历史回填预览已刷新：新增 ${result.newCandidates} 条候选`, 'success');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '历史回填预览失败', 'error');
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleApplyBackfill() {
    if (newBackfillCandidates.length === 0) {
      toast('当前没有可写入的新候选，请先刷新预览', 'warning');
      return;
    }

    setIsBackfillApplying(true);

    try {
      const result = await applyStructureMemoryBackfill(settings.serverUrl, {
        projectId,
        candidateIds: newBackfillCandidates.map((item) => item.candidateId),
      });
      setLastBackfillApply(result);
      await reloadStructureMemory();
      await Promise.all([handlePreviewBackfill(true), refreshGuardAlerts(true)]);
      toast(`历史回填已写入 ${result.createdCount} 条结构记忆草稿`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '写入历史回填失败', 'error');
    } finally {
      setIsBackfillApplying(false);
    }
  }

  useEffect(() => {
    setBackfillPreview(null);
    setLastBackfillApply(null);
    void refreshGuardAlerts(true);
  }, [projectId, settings.serverUrl]);

  useEffect(() => {
    if (!initialSectionKey) {
      return;
    }

    setFilterMode('all');
    setGroupMode('all');
    setActiveSectionKey(initialSectionKey);

    const timer = window.setTimeout(() => {
      scrollToSection(initialSectionKey);
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [initialSectionKey, navigationToken]);

  const sectionSummaries = useMemo<SectionSummary[]>(() => {
    const countUnsynced = (map: Record<string, string>) => Object.values(map).filter((value) => value && value !== 'synced').length;

    return [
      {
        key: 'thread-ledger',
        label: '剧情线账本',
        icon: GitBranch,
        count: threadLedgers.filter((item) => item.projectId === projectId).length,
        attentionCount: threadAlerts.length + (guardAlertCountBySystem['thread-ledger'] ?? 0),
        unsyncedCount: countUnsynced(threadSyncStatusById),
        description: '查看主线、支线、暗线和情感线当前推进状态。',
        group: 'planning',
        render: () => <ThreadLedgerPanel projectId={projectId} />,
      },
      {
        key: 'foreshadow-plan',
        label: '伏笔事实 / 规划',
        icon: Sparkles,
        count:
          foreshadows.filter((item) => item.projectId === projectId).length +
          foreshadowPlans.filter((item) => item.projectId === projectId).length,
        attentionCount: foreshadowAlerts.length + (guardAlertCountBySystem['foreshadow-plan'] ?? 0),
        unsyncedCount: countUnsynced(foreshadowSyncStatusById),
        description: '在同一处维护伏笔事实状态与规划安排，并支持互相跳转。',
        group: 'planning',
        render: () => (
          <ForeshadowPlanPanel
            projectId={projectId}
            onOpenEditor={onOpenEditor}
            onOpenChapter={onOpenChapter}
          />
        ),
      },
      {
        key: 'world-state',
        label: '世界状态',
        icon: Globe2,
        count: worldStateEntries.filter((item) => item.projectId === projectId).length,
        attentionCount: guardAlertCountBySystem['world-state'] ?? 0,
        unsyncedCount: countUnsynced(worldStateSyncStatusById),
        description: '集中维护卷级和里程碑级 delta，不用来回切大纲面板。',
        group: 'world',
        render: () => <WorldStatePanel projectId={projectId} />,
      },
      {
        key: 'question-pool',
        label: '未解问题',
        icon: Compass,
        count: questionPools.filter((item) => item.projectId === projectId).length,
        attentionCount: questionAlerts.length + (guardAlertCountBySystem['question-pool'] ?? 0),
        unsyncedCount: countUnsynced(questionSyncStatusById),
        description: '汇总悬念窗口、问题状态和推进提醒。',
        group: 'planning',
        render: () => <QuestionPoolPanel projectId={projectId} />,
      },
      {
        key: 'antagonist-agenda',
        label: '反派议程',
        icon: CircleAlert,
        count: antagonistAgendas.filter((item) => item.projectId === projectId).length,
        attentionCount: guardAlertCountBySystem['antagonist-agenda'] ?? 0,
        unsyncedCount: countUnsynced(antagonistSyncStatusById),
        description: '统一维护反派目标、动作、触发条件和世界状态反馈。',
        group: 'world',
        render: () => <AntagonistAgendaPanel projectId={projectId} />,
      },
      {
        key: 'pov-permission',
        label: '信息权限',
        icon: Shield,
        count: povPermissions.filter((item) => item.projectId === projectId).length,
        attentionCount: guardAlertCountBySystem['pov-permission'] ?? 0,
        unsyncedCount: countUnsynced(povSyncStatusById),
        description: '集中查看卷级、里程碑级和章节级信息控制。',
        group: 'control',
        render: () => <PovPermissionPanel projectId={projectId} />,
      },
      {
        key: 'resource-continuity',
        label: '资源连续性',
        icon: KeyRound,
        count: resourceContinuities.filter((item) => item.projectId === projectId).length,
        attentionCount: guardAlertCountBySystem['resource-continuity'] ?? 0,
        unsyncedCount: countUnsynced(resourceSyncStatusById),
        description: '统一管理核心代价与扩展资源约束，并观察待同步记录。',
        group: 'continuity',
        render: () => <ResourceContinuityPanel projectId={projectId} />,
      },
    ];
  }, [
    antagonistAgendas,
    foreshadows,
    antagonistSyncStatusById,
    guardAlertCountBySystem,
    foreshadowAlerts.length,
    foreshadowPlans,
    foreshadowSyncStatusById,
    povPermissions,
    povSyncStatusById,
    projectId,
    questionAlerts.length,
    questionPools,
    questionSyncStatusById,
    resourceContinuities,
    resourceSyncStatusById,
    threadAlerts.length,
    threadLedgers,
    threadSyncStatusById,
    worldStateEntries,
    worldStateSyncStatusById,
  ]);

  const visibleSections = useMemo(() => {
    return sectionSummaries.filter((section) => {
      if (groupMode !== 'all' && section.group !== groupMode) {
        return false;
      }

      if (filterMode === 'attention') {
        return section.attentionCount > 0;
      }

      if (filterMode === 'unsynced') {
        return section.unsyncedCount > 0;
      }

      return true;
    });
  }, [filterMode, groupMode, sectionSummaries]);

  useEffect(() => {
    if (visibleSections.length === 0) {
      return;
    }

    if (!visibleSections.some((section) => section.key === activeSectionKey)) {
      setActiveSectionKey(visibleSections[0].key);
    }
  }, [activeSectionKey, visibleSections]);

  const totalAttentionCount = useMemo(
    () => sectionSummaries.reduce((sum, section) => sum + section.attentionCount, 0),
    [sectionSummaries],
  );
  const totalUnsyncedCount = useMemo(
    () => sectionSummaries.reduce((sum, section) => sum + section.unsyncedCount, 0),
    [sectionSummaries],
  );
  const totalRecordCount = useMemo(
    () => sectionSummaries.reduce((sum, section) => sum + section.count, 0),
    [sectionSummaries],
  );
  const activeSection = useMemo(
    () => visibleSections.find((section) => section.key === activeSectionKey) ?? visibleSections[0] ?? null,
    [activeSectionKey, visibleSections],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <section className="rounded-[28px] border border-neutral-800 bg-[linear-gradient(180deg,rgba(18,31,42,0.96),rgba(10,19,27,0.94))] px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--studio-secondary)]">Structure Workspace</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">结构记忆统一工作台</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-300">
              这里把分散在各面板里的结构记忆收拢成统一入口。先做统一汇总、统一筛选、统一跳转，后续再继续扩成完整工作台。
            </p>
          </div>

          <div className="grid min-w-[280px] gap-3 sm:grid-cols-3 xl:w-[380px]">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">总记录数</p>
              <p className="mt-2 text-2xl font-semibold text-white">{totalRecordCount}</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-amber-300">联动提醒</p>
              <p className="mt-2 text-2xl font-semibold text-amber-100">{totalAttentionCount}</p>
            </div>
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-sky-300">待同步</p>
              <p className="mt-2 text-2xl font-semibold text-sky-100">{totalUnsyncedCount}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`rounded-2xl px-4 py-2.5 text-sm transition ${filterMode === 'all' ? 'bg-indigo-400 text-neutral-950' : 'border border-neutral-800 bg-neutral-950/70 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'}`}
          >
            全部系统
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('attention')}
            className={`rounded-2xl px-4 py-2.5 text-sm transition ${filterMode === 'attention' ? 'bg-amber-300 text-neutral-950' : 'border border-neutral-800 bg-neutral-950/70 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'}`}
          >
            只看有提醒
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('unsynced')}
            className={`rounded-2xl px-4 py-2.5 text-sm transition ${filterMode === 'unsynced' ? 'bg-sky-300 text-neutral-950' : 'border border-neutral-800 bg-neutral-950/70 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'}`}
          >
            只看待同步
          </button>
          <span className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/60 px-3 py-1.5 text-neutral-400">
            <Filter size={12} />
            分组
          </span>
          {[
            { key: 'all' as const, label: '全部' },
            { key: 'planning' as const, label: '规划层' },
            { key: 'world' as const, label: '世界与反派' },
            { key: 'control' as const, label: '信息控制' },
            { key: 'continuity' as const, label: '连续性约束' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setGroupMode(item.key)}
              className={`rounded-full px-3 py-1.5 transition ${
                groupMode === item.key
                  ? 'bg-neutral-100 text-neutral-950'
                  : 'border border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Maintenance</p>
              <h3 className="mt-2 text-2xl font-semibold text-neutral-100">历史回填与守护任务</h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
                D3 会基于历史卷总结、状态变化和伏笔记录生成结构记忆候选；D4 会做跨系统守护扫描，把漏同步的联动问题集中提上来。
              </p>
            </div>
            <div className="grid min-w-[280px] gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">新增候选</p>
                <p className="mt-3 text-2xl font-semibold text-white">{backfillPreview?.newCandidates ?? '—'}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-300">最近写入</p>
                <p className="mt-3 text-2xl font-semibold text-emerald-50">{lastBackfillApply?.createdCount ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-rose-300">守护告警</p>
                <p className="mt-3 text-2xl font-semibold text-rose-50">{guardAlerts.length}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handlePreviewBackfill()}
              disabled={isPreviewLoading || isBackfillApplying}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-300 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPreviewLoading ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
              {isPreviewLoading ? '预览生成中...' : '预览历史回填'}
            </button>
            <button
              type="button"
              onClick={() => void handleApplyBackfill()}
              disabled={isPreviewLoading || isBackfillApplying || newBackfillCandidates.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-2.5 text-sm font-medium text-neutral-100 transition hover:border-neutral-600 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBackfillApplying ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {isBackfillApplying ? '写入中...' : '写入全部新候选'}
            </button>
            <button
              type="button"
              onClick={() => void refreshGuardAlerts()}
              disabled={isGuardLoading}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-2.5 text-sm font-medium text-neutral-100 transition hover:border-neutral-600 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGuardLoading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
              {isGuardLoading ? '扫描中...' : '刷新守护告警'}
            </button>
          </div>

          {backfillPreview ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {backfillPreview.counts
                .filter((item) => item.total > 0)
                .map((item) => (
                  <span
                    key={item.system}
                    className="rounded-full border border-neutral-800 bg-neutral-950/60 px-3 py-1.5 text-xs text-neutral-300"
                  >
                    {BACKFILL_SYSTEM_LABELS[item.system]} {item.newCount}/{item.total}
                  </span>
                ))}
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-4 text-sm leading-7 text-neutral-400">
            {backfillPreview
              ? `最近一次预览生成于 ${backfillPreview.generatedAt}。当前共有 ${backfillPreview.totalCandidates} 条候选，其中 ${backfillPreview.existingCandidates} 条与现有结构记忆撞键，写入时会自动跳过。`
              : '先点“预览历史回填”，再决定是否把候选草稿批量写入服务端结构记忆表。'}
          </div>
        </div>

        <div className="flex h-[560px] max-h-[70vh] min-h-0 flex-col rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-5">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-rose-300" />
            <p className="text-sm font-medium text-neutral-200">最近候选预览</p>
          </div>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-3">
            {!backfillPreview ? (
              <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-4 py-6 text-sm leading-6 text-neutral-500">
                还没有历史回填预览结果。预览后这里会显示本轮最值得先检查的候选草稿。
              </div>
            ) : backfillPreview.candidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-4 py-6 text-sm leading-6 text-neutral-500">
                当前没有可生成的历史回填候选，说明服务端历史生成资产还不够，或现有结构记忆已经覆盖主要项。
              </div>
            ) : (
              backfillPreview.candidates.slice(0, 6).map((candidate) => (
                <button
                  key={candidate.candidateId}
                  type="button"
                  onClick={() => setActiveSectionKey(getGuardSectionSystemKey(candidate.system))}
                  className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-4 text-left transition hover:border-neutral-700 hover:bg-neutral-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-neutral-100">{candidate.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-500">
                        {BACKFILL_SYSTEM_LABELS[candidate.system]} · {candidate.scopeLabel}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        candidate.status === 'new'
                          ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                          : 'border border-neutral-700 bg-neutral-900 text-neutral-300'
                      }`}
                    >
                      {candidate.status === 'new' ? '可写入' : '已存在'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-300">{candidate.summary}</p>
                  {candidate.evidence[0] ? (
                    <p className="mt-3 text-xs leading-6 text-neutral-500">
                      依据：{candidate.evidence[0].excerpt}
                    </p>
                  ) : null}
                </button>
              ))
            )}
            </div>
          </div>
        </div>
      </section>

      <StructureWorkspaceIndex
        projectId={projectId}
        guardAlerts={guardAlerts}
        onOpenSection={(sectionId) => setActiveSectionKey(sectionId)}
      />

      {visibleSections.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-neutral-800 bg-neutral-900/40 px-6 py-10 text-sm leading-7 text-neutral-400">
          当前筛选下没有命中的结构记忆模块。可以切回“全部系统”，或者先处理待同步/提醒后再回来。
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {visibleSections.map((section) => {
              const Icon = section.icon;
              const active = activeSection?.key === section.key;

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSectionKey(section.key)}
                  className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-emerald-400/40 bg-emerald-500/12 text-emerald-50'
                      : 'border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900'
                  }`}
                >
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${
                      active ? 'bg-emerald-500/15 text-emerald-100' : 'bg-neutral-950/70 text-neutral-400'
                    }`}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{section.label}</span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      记录 {section.count}
                      {section.attentionCount > 0 ? ` · 提醒 ${section.attentionCount}` : ''}
                      {section.unsyncedCount > 0 ? ` · 待同步 ${section.unsyncedCount}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {activeSection ? (
            <section key={activeSection.key} id={activeSection.key} className="scroll-mt-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Structure Section</p>
                  <h3 className="mt-2 text-2xl font-semibold text-neutral-100">{activeSection.label}</h3>
                  <p className="mt-2 text-sm leading-7 text-neutral-400">{activeSection.description}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1.5 text-neutral-300">
                    记录 {activeSection.count}
                  </span>
                  {activeSection.attentionCount > 0 ? (
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-amber-100">
                      提醒 {activeSection.attentionCount}
                    </span>
                  ) : null}
                  {activeSection.unsyncedCount > 0 ? (
                    <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-sky-100">
                      待同步 {activeSection.unsyncedCount}
                    </span>
                  ) : null}
                </div>
              </div>
              {activeSection.render()}
            </section>
          ) : null}
        </section>
      )}
    </div>
  );
}
