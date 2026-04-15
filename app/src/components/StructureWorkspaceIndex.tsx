import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Search } from 'lucide-react';
import { getStructureMemorySyncLabel } from '@/lib/structure-memory-sync';
import {
  useAntagonistAgendaStore,
  useForeshadowPlanStore,
  usePovPermissionStore,
  useQuestionPoolStore,
  useResourceContinuityStore,
  useThreadLedgerStore,
  useWorldStateStore,
} from '@/stores';
import type { Id, StructureMemoryGuardAlert, StructureMemorySyncStatus, StructureMemorySystemKey } from '@/types';

interface StructureWorkspaceIndexProps {
  projectId: Id;
  guardAlerts?: StructureMemoryGuardAlert[];
}

interface IndexAlert {
  key: string;
  title: string;
  detail: string;
  sectionKey: string;
  tone: 'amber' | 'sky' | 'rose';
  onOpen: () => void;
}

interface SearchResultItem {
  key: string;
  label: string;
  sectionLabel: string;
  description: string;
  keywords: string[];
  syncLabel: string;
  unsynced: boolean;
  onOpen: () => void;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function scrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function toneClassName(tone: IndexAlert['tone']) {
  if (tone === 'sky') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-50';
  }

  if (tone === 'rose') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-50';
  }

  return 'border-amber-500/30 bg-amber-500/10 text-amber-50';
}

function toneTextClassName(tone: IndexAlert['tone']) {
  if (tone === 'sky') {
    return 'text-sky-300';
  }

  if (tone === 'rose') {
    return 'text-rose-300';
  }

  return 'text-amber-300';
}

function getSectionMeta(system: StructureMemorySystemKey) {
  switch (system) {
    case 'thread_ledger':
      return { sectionId: 'thread-ledger', sectionLabel: '剧情线账本' };
    case 'foreshadow_plan':
      return { sectionId: 'foreshadow-plan', sectionLabel: '伏笔规划' };
    case 'world_state_entry':
      return { sectionId: 'world-state', sectionLabel: '世界状态' };
    case 'question_pool':
      return { sectionId: 'question-pool', sectionLabel: '未解问题' };
    case 'antagonist_agenda':
      return { sectionId: 'antagonist-agenda', sectionLabel: '反派议程' };
    case 'pov_permission':
      return { sectionId: 'pov-permission', sectionLabel: '信息权限' };
    case 'resource_continuity':
    default:
      return { sectionId: 'resource-continuity', sectionLabel: '资源连续性' };
  }
}

function countMatchedTerms(text: string, terms: string[]) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return 0;
  }

  return terms.reduce((count, term) => {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm || normalizedTerm.length < 2) {
      return count;
    }
    return normalized.includes(normalizedTerm) ? count + 1 : count;
  }, 0);
}

export function StructureWorkspaceIndex({ projectId, guardAlerts = [] }: StructureWorkspaceIndexProps) {
  const [searchText, setSearchText] = useState('');

  const threadLedgers = useThreadLedgerStore((state) => state.threadLedgers);
  const threadAlerts = useThreadLedgerStore((state) => state.alerts);
  const threadSyncStatusById = useThreadLedgerStore((state) => state.syncStatusById);
  const threadLocalOnlyById = useThreadLedgerStore((state) => state.localOnlyById);
  const setActiveThreadLedger = useThreadLedgerStore((state) => state.setActiveThreadLedger);

  const foreshadowPlans = useForeshadowPlanStore((state) => state.foreshadowPlans);
  const foreshadowAlerts = useForeshadowPlanStore((state) => state.alerts);
  const foreshadowSyncStatusById = useForeshadowPlanStore((state) => state.syncStatusById);
  const foreshadowLocalOnlyById = useForeshadowPlanStore((state) => state.localOnlyById);
  const setActiveForeshadowPlan = useForeshadowPlanStore((state) => state.setActiveForeshadowPlan);

  const worldStateEntries = useWorldStateStore((state) => state.worldStateEntries);
  const worldStateSyncStatusById = useWorldStateStore((state) => state.syncStatusById);
  const worldStateLocalOnlyById = useWorldStateStore((state) => state.localOnlyById);
  const setActiveWorldStateEntry = useWorldStateStore((state) => state.setActiveWorldStateEntry);

  const questionPools = useQuestionPoolStore((state) => state.questionPools);
  const questionAlerts = useQuestionPoolStore((state) => state.alerts);
  const questionSyncStatusById = useQuestionPoolStore((state) => state.syncStatusById);
  const questionLocalOnlyById = useQuestionPoolStore((state) => state.localOnlyById);
  const setActiveQuestionPool = useQuestionPoolStore((state) => state.setActiveQuestionPool);

  const antagonistAgendas = useAntagonistAgendaStore((state) => state.antagonistAgendas);
  const antagonistSyncStatusById = useAntagonistAgendaStore((state) => state.syncStatusById);
  const antagonistLocalOnlyById = useAntagonistAgendaStore((state) => state.localOnlyById);
  const setActiveAntagonistAgenda = useAntagonistAgendaStore((state) => state.setActiveAntagonistAgenda);

  const povPermissions = usePovPermissionStore((state) => state.povPermissions);
  const povSyncStatusById = usePovPermissionStore((state) => state.syncStatusById);
  const povLocalOnlyById = usePovPermissionStore((state) => state.localOnlyById);
  const setActivePovPermission = usePovPermissionStore((state) => state.setActivePovPermission);

  const resourceContinuities = useResourceContinuityStore((state) => state.resourceContinuities);
  const resourceSyncStatusById = useResourceContinuityStore((state) => state.syncStatusById);
  const resourceLocalOnlyById = useResourceContinuityStore((state) => state.localOnlyById);
  const setActiveResourceContinuity = useResourceContinuityStore((state) => state.setActiveResourceContinuity);

  const searchItems = useMemo<SearchResultItem[]>(() => {
    const buildItem = (
      key: string,
      label: string,
      sectionLabel: string,
      description: string,
      keywords: string[],
      syncStatus: StructureMemorySyncStatus | undefined,
      localOnly: boolean,
      onOpen: () => void,
    ): SearchResultItem => ({
      key,
      label,
      sectionLabel,
      description,
      keywords,
      syncLabel: getStructureMemorySyncLabel(syncStatus, localOnly),
      unsynced: localOnly || (syncStatus ?? 'synced') !== 'synced',
      onOpen,
    });

    return [
      ...threadLedgers.filter((item) => item.projectId === projectId).map((item) =>
        buildItem(
          `thread:${item.id}`,
          item.name,
          '剧情线账本',
          item.coreQuestion || item.currentPhase || '暂无阶段描述',
          [item.type, ...item.relatedCharacterNames, ...item.relatedForeshadowTitles],
          threadSyncStatusById[item.id],
          threadLocalOnlyById[item.id] === true,
          () => {
            setActiveThreadLedger(item.id);
            scrollToSection('thread-ledger');
          },
        ),
      ),
      ...foreshadowPlans.filter((item) => item.projectId === projectId).map((item) =>
        buildItem(
          `foreshadow:${item.id}`,
          item.foreshadowTitle,
          '伏笔规划',
          item.resolveCondition || item.payoffEffect || '暂无回收说明',
          [item.type, ...item.dependsOnForeshadowTitles, ...item.dependsOnEventKeys],
          foreshadowSyncStatusById[item.id],
          foreshadowLocalOnlyById[item.id] === true,
          () => {
            setActiveForeshadowPlan(item.id);
            scrollToSection('foreshadow-plan');
          },
        ),
      ),
      ...worldStateEntries.filter((item) => item.projectId === projectId).map((item) =>
        buildItem(
          `world:${item.id}`,
          `${item.volumeTitle}${typeof item.milestoneIndex === 'number' ? ` · 阶段 ${item.milestoneIndex + 1}` : ' · 卷级'}`,
          '世界状态',
          item.powerBalanceChange || item.institutionChange || item.ruleChange || '暂无制度或势力变化说明',
          [...item.publicEvents, ...item.secretEvents, ...item.currentRisks],
          worldStateSyncStatusById[item.id],
          worldStateLocalOnlyById[item.id] === true,
          () => {
            setActiveWorldStateEntry(item.id);
            scrollToSection('world-state');
          },
        ),
      ),
      ...questionPools.filter((item) => item.projectId === projectId).map((item) =>
        buildItem(
          `question:${item.id}`,
          item.question,
          '未解问题',
          item.currentClue || item.expectedRevealWindow || '暂无窗口说明',
          [item.belongsToThreadName, ...item.falseAnswers],
          questionSyncStatusById[item.id],
          questionLocalOnlyById[item.id] === true,
          () => {
            setActiveQuestionPool(item.id);
            scrollToSection('question-pool');
          },
        ),
      ),
      ...antagonistAgendas.filter((item) => item.projectId === projectId).map((item) =>
        buildItem(
          `antagonist:${item.id}`,
          item.characterName,
          '反派议程',
          item.currentObjective || item.currentAction || '暂无当前动作说明',
          [item.publicRole, item.triggerToStrike, item.nextMoveWindow],
          antagonistSyncStatusById[item.id],
          antagonistLocalOnlyById[item.id] === true,
          () => {
            setActiveAntagonistAgenda(item.id);
            scrollToSection('antagonist-agenda');
          },
        ),
      ),
      ...povPermissions.filter((item) => item.projectId === projectId).map((item) =>
        buildItem(
          `pov:${item.id}`,
          item.povCharacterName || '未命名视角',
          '信息权限',
          item.chapterTitle || item.volumeTitle || '全局范围',
          [...item.mustHide, ...item.canHint, ...item.forbiddenReveal],
          povSyncStatusById[item.id],
          povLocalOnlyById[item.id] === true,
          () => {
            setActivePovPermission(item.id);
            scrollToSection('pov-permission');
          },
        ),
      ),
      ...resourceContinuities.filter((item) => item.projectId === projectId).map((item) =>
        buildItem(
          `resource:${item.id}`,
          `${item.ownerCharacterName || '无主资源'} · ${item.resourceType}`,
          '资源连续性',
          item.currentState || item.performanceImpact || '暂无代价说明',
          [item.recoveryCondition, item.hiddenCost, item.continuityRisk],
          resourceSyncStatusById[item.id],
          resourceLocalOnlyById[item.id] === true,
          () => {
            setActiveResourceContinuity(item.id);
            scrollToSection('resource-continuity');
          },
        ),
      ),
    ];
  }, [
    antagonistAgendas,
    antagonistLocalOnlyById,
    antagonistSyncStatusById,
    foreshadowLocalOnlyById,
    foreshadowPlans,
    foreshadowSyncStatusById,
    povLocalOnlyById,
    povPermissions,
    povSyncStatusById,
    projectId,
    questionLocalOnlyById,
    questionPools,
    questionSyncStatusById,
    resourceContinuities,
    resourceLocalOnlyById,
    resourceSyncStatusById,
    setActiveAntagonistAgenda,
    setActiveForeshadowPlan,
    setActivePovPermission,
    setActiveQuestionPool,
    setActiveResourceContinuity,
    setActiveThreadLedger,
    setActiveWorldStateEntry,
    threadLedgers,
    threadLocalOnlyById,
    threadSyncStatusById,
    worldStateEntries,
    worldStateLocalOnlyById,
    worldStateSyncStatusById,
  ]);

  const filteredSearchResults = useMemo(() => {
    const normalizedSearch = normalizeText(searchText);

    if (!normalizedSearch) {
      return searchItems.slice(0, 10);
    }

    return searchItems
      .filter((item) =>
        countMatchedTerms(
          `${item.label}\n${item.sectionLabel}\n${item.description}\n${item.keywords.join('\n')}`,
          [normalizedSearch],
        ) > 0,
      )
      .slice(0, 12);
  }, [searchItems, searchText]);

  function openGuardAlert(alert: StructureMemoryGuardAlert) {
    const { sectionId } = getSectionMeta(alert.targetSystem);

    switch (alert.targetSystem) {
      case 'thread_ledger':
        if (alert.targetRecordId) {
          setActiveThreadLedger(alert.targetRecordId);
        }
        break;
      case 'foreshadow_plan':
        if (alert.targetRecordId) {
          setActiveForeshadowPlan(alert.targetRecordId);
        }
        break;
      case 'world_state_entry':
        if (alert.targetRecordId) {
          setActiveWorldStateEntry(alert.targetRecordId);
        }
        break;
      case 'question_pool':
        if (alert.targetRecordId) {
          setActiveQuestionPool(alert.targetRecordId);
        }
        break;
      case 'antagonist_agenda':
        if (alert.targetRecordId) {
          setActiveAntagonistAgenda(alert.targetRecordId);
        }
        break;
      case 'pov_permission':
        if (alert.targetRecordId) {
          setActivePovPermission(alert.targetRecordId);
        }
        break;
      case 'resource_continuity':
        if (alert.targetRecordId) {
          setActiveResourceContinuity(alert.targetRecordId);
        }
        break;
      default:
        break;
    }

    scrollToSection(sectionId);
  }

  const unifiedAlerts = useMemo<IndexAlert[]>(() => {
    const alerts: IndexAlert[] = [
      ...guardAlerts.map((alert) => {
        const { sectionLabel } = getSectionMeta(alert.targetSystem);
        return {
          key: `guard-alert:${alert.id}`,
          title: alert.title,
          detail: alert.evidence ? `${alert.message} 证据：${alert.evidence}` : alert.message,
          sectionKey: sectionLabel,
          tone:
            alert.severity === 'high'
              ? 'rose'
              : alert.severity === 'medium'
                ? 'amber'
                : 'sky',
          onOpen: () => openGuardAlert(alert),
        } satisfies IndexAlert;
      }),
      ...threadAlerts.map((alert) => ({
        key: `thread-alert:${alert.threadLedgerId}`,
        title: alert.name,
        detail: alert.message,
        sectionKey: '剧情线账本',
        tone: 'amber' as const,
        onOpen: () => {
          setActiveThreadLedger(alert.threadLedgerId);
          scrollToSection('thread-ledger');
        },
      })),
      ...foreshadowAlerts.map((alert) => ({
        key: `foreshadow-alert:${alert.foreshadowPlanId}`,
        title: alert.foreshadowTitle,
        detail: alert.message,
        sectionKey: '伏笔规划',
        tone: 'amber' as const,
        onOpen: () => {
          setActiveForeshadowPlan(alert.foreshadowPlanId);
          scrollToSection('foreshadow-plan');
        },
      })),
      ...questionAlerts.map((alert) => ({
        key: `question-alert:${alert.questionPoolId}`,
        title: alert.question,
        detail: alert.message,
        sectionKey: '未解问题',
        tone: 'amber' as const,
        onOpen: () => {
          setActiveQuestionPool(alert.questionPoolId);
          scrollToSection('question-pool');
        },
      })),
      ...searchItems
        .filter((item) => item.unsynced)
        .slice(0, 6)
        .map((item) => ({
          key: `sync-alert:${item.key}`,
          title: item.label,
          detail: `${item.sectionLabel}当前为「${item.syncLabel}」，建议优先打开检查并重试保存。`,
          sectionKey: item.sectionLabel,
          tone: 'sky' as const,
          onOpen: item.onOpen,
        })),
    ];

    return alerts.slice(0, 10);
  }, [
    guardAlerts,
    foreshadowAlerts,
    openGuardAlert,
    questionAlerts,
    searchItems,
    setActiveAntagonistAgenda,
    setActiveForeshadowPlan,
    setActivePovPermission,
    setActiveQuestionPool,
    setActiveResourceContinuity,
    setActiveThreadLedger,
    setActiveWorldStateEntry,
    threadAlerts,
  ]);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-5">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-sky-300" />
            <p className="text-sm font-medium text-neutral-200">跨系统搜索</p>
          </div>
          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
            <Search size={16} className="text-neutral-500" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索线名、伏笔、角色、卷名、代价、触发条件..."
              className="w-full bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </label>
          <div className="mt-4 grid gap-3">
            {filteredSearchResults.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onOpen}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-4 text-left transition hover:border-neutral-700 hover:bg-neutral-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-neutral-100">{item.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-500">{item.sectionLabel}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-300">{item.description}</p>
                  </div>
                  <ArrowRight size={16} className="text-neutral-500" />
                </div>
                {item.unsynced ? (
                  <div className="mt-3">
                    <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100">
                      {item.syncLabel}
                    </span>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-300" />
            <p className="text-sm font-medium text-neutral-200">统一提醒区</p>
          </div>
          <div className="mt-4 grid gap-3">
            {unifiedAlerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-4 py-6 text-sm leading-6 text-neutral-500">
                当前没有需要优先处理的统一提醒。可以直接按系统分区继续维护结构记忆。
              </div>
            ) : (
              unifiedAlerts.map((alert) => (
                <button
                  key={alert.key}
                  type="button"
                  onClick={alert.onOpen}
                  className={`rounded-2xl border px-4 py-4 text-left transition hover:brightness-110 ${toneClassName(alert.tone)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className={`mt-1 text-xs uppercase tracking-[0.18em] ${toneTextClassName(alert.tone)}`}>
                        {alert.sectionKey}
                      </p>
                      <p className="mt-2 leading-6">{alert.detail}</p>
                    </div>
                    <ArrowRight size={16} className={toneTextClassName(alert.tone)} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
