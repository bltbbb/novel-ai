import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { buildStructureMemorySaveFeedback } from '@/lib/structure-memory-sync';
import { useToast } from '@/components/Toast';
import { useForeshadowPlanStore, useForeshadowStore, useVolumeStore } from '@/stores';
import type { ForeshadowPlan, ForeshadowPlanImportance, Id } from '@/types';

interface ForeshadowPlanPanelProps {
  projectId: Id;
  className?: string;
}

interface ForeshadowPlanDraftModel {
  foreshadowId: Id | '';
  type: string;
  importance: ForeshadowPlanImportance;
  plannedActivateVolumeText: string;
  plannedResolveVolumeText: string;
  activationCondition: string;
  resolveCondition: string;
  dependsOnForeshadowTitlesText: string;
  dependsOnEventKeysText: string;
  payoffEffect: string;
}

const DEFAULT_OVERDUE_VOLUME_GAP = 2;

function createEmptyDraft(): ForeshadowPlanDraftModel {
  return {
    foreshadowId: '',
    type: '主线伏笔',
    importance: 'minor',
    plannedActivateVolumeText: '',
    plannedResolveVolumeText: '',
    activationCondition: '',
    resolveCondition: '',
    dependsOnForeshadowTitlesText: '',
    dependsOnEventKeysText: '',
    payoffEffect: '',
  };
}

function normalizeDelimitedText(value: string) {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function normalizeTitleKey(value: string) {
  return value.trim().toLowerCase();
}

function buildDraftFromForeshadowPlan(item: ForeshadowPlan): ForeshadowPlanDraftModel {
  return {
    foreshadowId: item.foreshadowId,
    type: item.type,
    importance: item.importance,
    plannedActivateVolumeText:
      typeof item.plannedActivateVolume === 'number' && Number.isFinite(item.plannedActivateVolume)
        ? String(item.plannedActivateVolume)
        : '',
    plannedResolveVolumeText:
      typeof item.plannedResolveVolume === 'number' && Number.isFinite(item.plannedResolveVolume)
        ? String(item.plannedResolveVolume)
        : '',
    activationCondition: item.activationCondition,
    resolveCondition: item.resolveCondition,
    dependsOnForeshadowTitlesText: item.dependsOnForeshadowTitles.join('，'),
    dependsOnEventKeysText: item.dependsOnEventKeys.join('，'),
    payoffEffect: item.payoffEffect,
  };
}

function getImportanceBadgeClassName(importance: ForeshadowPlanImportance, active: boolean) {
  if (importance === 'major') {
    return active
      ? 'border-rose-400/50 bg-rose-500/20 text-rose-100'
      : 'border-rose-500/20 bg-rose-500/10 text-rose-200';
  }

  return active
    ? 'border-sky-400/50 bg-sky-500/20 text-sky-100'
    : 'border-sky-500/20 bg-sky-500/10 text-sky-200';
}

export function ForeshadowPlanPanel({ projectId, className }: ForeshadowPlanPanelProps) {
  const { toast } = useToast();
  const volumes = useVolumeStore((state) => state.volumes);
  const foreshadows = useForeshadowStore((state) => state.foreshadows);
  const foreshadowPlans = useForeshadowPlanStore((state) => state.foreshadowPlans);
  const alerts = useForeshadowPlanStore((state) => state.alerts);
  const syncStatusById = useForeshadowPlanStore((state) => state.syncStatusById);
  const activeForeshadowPlanId = useForeshadowPlanStore((state) => state.activeForeshadowPlanId);
  const loadForeshadowPlans = useForeshadowPlanStore((state) => state.loadForeshadowPlans);
  const setActiveForeshadowPlan = useForeshadowPlanStore((state) => state.setActiveForeshadowPlan);
  const createForeshadowPlan = useForeshadowPlanStore((state) => state.createForeshadowPlan);
  const updateForeshadowPlan = useForeshadowPlanStore((state) => state.updateForeshadowPlan);
  const deleteForeshadowPlan = useForeshadowPlanStore((state) => state.deleteForeshadowPlan);
  const [editingId, setEditingId] = useState<Id | 'new' | null>(null);
  const [draft, setDraft] = useState<ForeshadowPlanDraftModel>(createEmptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const projectVolumes = useMemo(
    () => [...volumes].filter((item) => item.projectId === projectId).sort((left, right) => left.order - right.order),
    [projectId, volumes],
  );
  const currentVolumeOrder = projectVolumes[projectVolumes.length - 1]?.order ?? null;
  const projectForeshadows = useMemo(
    () => [...foreshadows].filter((item) => item.projectId === projectId),
    [foreshadows, projectId],
  );
  const foreshadowTitleMap = useMemo(() => {
    const map = new Map<string, { id: Id; title: string }>();

    for (const foreshadow of projectForeshadows) {
      map.set(normalizeTitleKey(foreshadow.title), {
        id: foreshadow.id,
        title: foreshadow.title,
      });
    }

    return map;
  }, [projectForeshadows]);
  const activeForeshadowPlan = useMemo(
    () => foreshadowPlans.find((item) => item.id === activeForeshadowPlanId) ?? null,
    [activeForeshadowPlanId, foreshadowPlans],
  );
  const unsyncedCount = useMemo(
    () => Object.values(syncStatusById).filter((status) => status && status !== 'synced').length,
    [syncStatusById],
  );

  useEffect(() => {
    setEditingId(null);
    setDraft(createEmptyDraft());
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void loadForeshadowPlans(projectId, {
      currentVolumeOrder,
      overdueVolumeGap: DEFAULT_OVERDUE_VOLUME_GAP,
    })
      .catch(() => {
        if (!cancelled) {
          toast('加载伏笔规划失败', 'error');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentVolumeOrder, loadForeshadowPlans, projectId, toast]);

  useEffect(() => {
    if (editingId === 'new') {
      return;
    }

    if (activeForeshadowPlan) {
      setEditingId(activeForeshadowPlan.id);
      setDraft(buildDraftFromForeshadowPlan(activeForeshadowPlan));
      return;
    }

    if (foreshadowPlans.length === 0) {
      setEditingId('new');
      setDraft(createEmptyDraft());
    }
  }, [activeForeshadowPlan, editingId, foreshadowPlans.length]);

  function handleCreateNew() {
    setActiveForeshadowPlan(null);
    setEditingId('new');
    setDraft(createEmptyDraft());
  }

  function handleSelectForeshadowPlan(foreshadowPlanId: Id) {
    setActiveForeshadowPlan(foreshadowPlanId);
    setEditingId(foreshadowPlanId);
  }

  async function handleSave() {
    const selectedForeshadow = projectForeshadows.find((item) => item.id === draft.foreshadowId) ?? null;

    if (!selectedForeshadow) {
      toast('请先选择关联伏笔', 'warning');
      return;
    }

    const dependsOnForeshadowTitles = normalizeDelimitedText(draft.dependsOnForeshadowTitlesText);
    const matchedDependsOnForeshadows = dependsOnForeshadowTitles
      .map((title) => foreshadowTitleMap.get(normalizeTitleKey(title)) ?? null)
      .filter((item): item is { id: Id; title: string } => Boolean(item));
    const existingPlanForForeshadow =
      foreshadowPlans.find((item) => item.foreshadowId === selectedForeshadow.id) ?? null;
    const payload = {
      projectId,
      foreshadowId: selectedForeshadow.id,
      foreshadowTitle: selectedForeshadow.title,
      type: draft.type,
      importance: draft.importance,
      plannedActivateVolume: parsePositiveInteger(draft.plannedActivateVolumeText),
      plannedResolveVolume: parsePositiveInteger(draft.plannedResolveVolumeText),
      activationCondition: draft.activationCondition,
      resolveCondition: draft.resolveCondition,
      dependsOnForeshadowIds: matchedDependsOnForeshadows.map((item) => item.id),
      dependsOnForeshadowTitles:
        dependsOnForeshadowTitles.length > 0 ? dependsOnForeshadowTitles : matchedDependsOnForeshadows.map((item) => item.title),
      dependsOnEventKeys: normalizeDelimitedText(draft.dependsOnEventKeysText),
      relatedQuestionIds: [],
      payoffEffect: draft.payoffEffect,
    };

    setIsSaving(true);

    try {
      if (editingId === 'new' || !editingId) {
        const targetPlanId = existingPlanForForeshadow?.id ?? null;

        if (targetPlanId) {
          const item = await updateForeshadowPlan(targetPlanId, payload, {
            currentVolumeOrder,
            overdueVolumeGap: DEFAULT_OVERDUE_VOLUME_GAP,
          });
          setEditingId(item.id);
          setActiveForeshadowPlan(item.id);
          const feedback = buildStructureMemorySaveFeedback({
            syncStatus: useForeshadowPlanStore.getState().syncStatusById[item.id],
            localOnly: useForeshadowPlanStore.getState().localOnlyById[item.id] === true,
            syncedMessage: '该伏笔已有规划记录，已更新现有记录',
            entityLabel: '伏笔规划',
          });
          toast(feedback.message, feedback.tone);
        } else {
          const item = await createForeshadowPlan(payload, {
            currentVolumeOrder,
            overdueVolumeGap: DEFAULT_OVERDUE_VOLUME_GAP,
          });
          setEditingId(item.id);
          setActiveForeshadowPlan(item.id);
          const feedback = buildStructureMemorySaveFeedback({
            syncStatus: useForeshadowPlanStore.getState().syncStatusById[item.id],
            localOnly: useForeshadowPlanStore.getState().localOnlyById[item.id] === true,
            syncedMessage: '伏笔规划已创建',
            entityLabel: '伏笔规划',
          });
          toast(feedback.message, feedback.tone);
        }
      } else {
        const item = await updateForeshadowPlan(editingId, payload, {
          currentVolumeOrder,
          overdueVolumeGap: DEFAULT_OVERDUE_VOLUME_GAP,
        });
        setEditingId(item.id);
        setActiveForeshadowPlan(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useForeshadowPlanStore.getState().syncStatusById[item.id],
          localOnly: useForeshadowPlanStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '伏笔规划已保存',
          entityLabel: '伏笔规划',
        });
        toast(feedback.message, feedback.tone);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存伏笔规划失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId || editingId === 'new') {
      setDraft(createEmptyDraft());
      return;
    }

    const confirmed = window.confirm('确认删除这条伏笔规划吗？');

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteForeshadowPlan(projectId, editingId, {
        currentVolumeOrder,
        overdueVolumeGap: DEFAULT_OVERDUE_VOLUME_GAP,
      });
      setEditingId(null);
      toast('伏笔规划已删除', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除伏笔规划失败', 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  const containerClassName = [
    'overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-6',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={containerClassName}>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-indigo-300">伏笔规划账本</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">把“埋了什么”升级成“什么时候动、怎么收”</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            这里维护的是伏笔规划层，不替代现有状态机。第一版先围绕激活卷、回收卷、条件和回收效果，把核心伏笔的调度权拿回来。
          </p>
          {unsyncedCount > 0 ? <p className="mt-2 text-xs leading-6 text-amber-300">当前有 {unsyncedCount} 条本地草稿或待同步记录，断网时会先保留在 Dexie 镜像里。</p> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
          >
            <Plus size={15} />
            新建规划
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            保存规划
          </button>
        </div>
      </header>

      {alerts.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {alerts.map((alert) => (
            <div
              key={alert.foreshadowPlanId}
              className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-50"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="mt-1 flex-shrink-0 text-amber-300" />
                <div>
                  <p className="font-medium">{alert.foreshadowTitle}</p>
                  <p className="mt-1 leading-6 text-amber-100">{alert.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-200">当前规划</p>
            {isLoading ? (
              <span className="inline-flex items-center gap-2 text-xs text-neutral-500">
                <LoaderCircle size={13} className="animate-spin" />
                正在刷新
              </span>
            ) : null}
          </div>

          {foreshadowPlans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 px-4 py-5 text-sm leading-6 text-neutral-500">
              还没有伏笔规划。先挑核心伏笔，补上激活窗口、回收窗口和回收效果。
            </div>
          ) : (
            foreshadowPlans.map((item) => {
              const active = editingId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectForeshadowPlan(item.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    active
                      ? 'border-indigo-400/50 bg-indigo-500/10'
                      : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-600 hover:bg-neutral-900'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-neutral-100">{item.foreshadowTitle}</span>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] ${getImportanceBadgeClassName(item.importance, active)}`}
                    >
                      {item.importance === 'major' ? '核心' : '次级'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">{item.type || '未分类'}</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-300">
                    {item.resolveCondition || item.payoffEffect || '暂无回收条件说明'}
                  </p>
                </button>
              );
            })
          )}
        </aside>

        <section className="rounded-[24px] border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">关联伏笔</span>
              <select
                value={draft.foreshadowId}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    foreshadowId: event.target.value as Id,
                  }))
                }
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
              >
                <option value="">请选择已有伏笔</option>
                {projectForeshadows.map((foreshadow) => (
                  <option key={foreshadow.id} value={foreshadow.id}>
                    {foreshadow.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">类型</span>
              <input
                value={draft.type}
                onChange={(event) => setDraft((previous) => ({ ...previous, type: event.target.value }))}
                placeholder="主线伏笔 / 支线伏笔 / 规则伏笔 / 反转伏笔"
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">重要性</span>
              <select
                value={draft.importance}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    importance: event.target.value as ForeshadowPlanImportance,
                  }))
                }
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
              >
                <option value="major">核心</option>
                <option value="minor">次级</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">计划激活卷</span>
              <input
                value={draft.plannedActivateVolumeText}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    plannedActivateVolumeText: event.target.value,
                  }))
                }
                placeholder="例如：2"
                inputMode="numeric"
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">计划回收卷</span>
              <input
                value={draft.plannedResolveVolumeText}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    plannedResolveVolumeText: event.target.value,
                  }))
                }
                placeholder="例如：4"
                inputMode="numeric"
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">激活条件</span>
              <textarea
                value={draft.activationCondition}
                onChange={(event) => setDraft((previous) => ({ ...previous, activationCondition: event.target.value }))}
                placeholder="例如：许明拿到公审资格时"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">回收条件</span>
              <textarea
                value={draft.resolveCondition}
                onChange={(event) => setDraft((previous) => ({ ...previous, resolveCondition: event.target.value }))}
                placeholder="例如：余化及当庭道心崩塌时"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">依赖伏笔</span>
              <textarea
                value={draft.dependsOnForeshadowTitlesText}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    dependsOnForeshadowTitlesText: event.target.value,
                  }))
                }
                placeholder="多个标题用逗号或换行分隔"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">依赖事件键</span>
              <textarea
                value={draft.dependsOnEventKeysText}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    dependsOnEventKeysText: event.target.value,
                  }))
                }
                placeholder="多个事件键用逗号或换行分隔"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">回收效果</span>
              <textarea
                value={draft.payoffEffect}
                onChange={(event) => setDraft((previous) => ({ ...previous, payoffEffect: event.target.value }))}
                placeholder="例如：量天司合法性被连根拔起"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>
          </div>

          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5">
            <p className="text-xs leading-6 text-neutral-500">
              当前按“一条伏笔对应一条规划”管理。后续 QuestionPool 落地后，再把相关未解问题关联补进来。
            </p>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={isDeleting || editingId === 'new' || !editingId}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 text-sm text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
              删除规划
            </button>
          </footer>
        </section>
      </div>
    </article>
  );
}
