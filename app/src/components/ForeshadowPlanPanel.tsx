import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Download, LoaderCircle, Plus, Save, Trash2, Upload } from 'lucide-react';
import { ForeshadowWorkspace } from '@/components/ForeshadowWorkspace';
import { sanitizeFileName } from '@/lib/export';
import { buildStructureMemorySaveFeedback } from '@/lib/structure-memory-sync';
import { useToast } from '@/components/Toast';
import { useForeshadowPlanStore, useForeshadowStore, useVolumeStore } from '@/stores';
import type { ForeshadowPlan, ForeshadowPlanImportance, Id } from '@/types';

interface ForeshadowPlanPanelProps {
  projectId: Id;
  className?: string;
  onOpenEditor?: () => void;
  onOpenChapter?: (chapterId: Id) => void;
}

type ForeshadowPanelMode = 'facts' | 'plans';

interface ForeshadowPlanDraftModel {
  foreshadowId: string;
  foreshadowTitle: string;
  type: string;
  importance: ForeshadowPlanImportance;
  activationWindow: string;
  resolveWindow: string;
  plannedActivateVolumeText: string;
  plannedResolveVolumeText: string;
  activationCondition: string;
  resolveCondition: string;
  dependsOnForeshadowTitlesText: string;
  dependsOnEventKeysText: string;
  payoffEffect: string;
}

interface ForeshadowPlanJsonData {
  foreshadowId: string;
  foreshadowTitle: string;
  type: string;
  importance: ForeshadowPlanImportance;
  activationWindow?: string;
  resolveWindow?: string;
  plannedActivateVolume?: number | null;
  plannedResolveVolume?: number | null;
  activationCondition?: string;
  resolveCondition?: string;
  dependsOnForeshadowIds?: Id[];
  dependsOnForeshadowTitles?: string[];
  dependsOnEventKeys?: string[];
  relatedQuestionIds?: Id[];
  payoffEffect?: string;
}

interface ForeshadowPlanCollectionJsonEnvelope {
  version: 1;
  type: 'lore-foreshadow-plans';
  exportedAt: string;
  items: ForeshadowPlanJsonData[];
}

const DEFAULT_OVERDUE_VOLUME_GAP = 2;

function createEmptyDraft(): ForeshadowPlanDraftModel {
  return {
    foreshadowId: '',
    foreshadowTitle: '',
    type: '主线伏笔',
    importance: 'minor',
    activationWindow: '',
    resolveWindow: '',
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

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [];
}

function readOptionalPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function readPlanImportance(value: unknown): ForeshadowPlanImportance {
  return value === 'major' ? 'major' : 'minor';
}

function buildPlanJsonData(item: ForeshadowPlan): ForeshadowPlanJsonData {
  return {
    foreshadowId: item.foreshadowId,
    foreshadowTitle: item.foreshadowTitle,
    type: item.type,
    importance: item.importance,
    activationWindow: item.activationWindow ?? '',
    resolveWindow: item.resolveWindow ?? '',
    plannedActivateVolume: item.plannedActivateVolume,
    plannedResolveVolume: item.plannedResolveVolume,
    activationCondition: item.activationCondition,
    resolveCondition: item.resolveCondition,
    dependsOnForeshadowIds: [...item.dependsOnForeshadowIds],
    dependsOnForeshadowTitles: [...item.dependsOnForeshadowTitles],
    dependsOnEventKeys: [...item.dependsOnEventKeys],
    relatedQuestionIds: [...item.relatedQuestionIds],
    payoffEffect: item.payoffEffect,
  };
}

function parseForeshadowPlanJsonItem(raw: unknown): ForeshadowPlanJsonData {
  const root = asRecord(raw);
  const payload = root?.type === 'lore-foreshadow-plan' && root.data ? asRecord(root.data) : root;

  if (!payload) {
    throw new Error('导入文件结构无效');
  }

  const foreshadowId = readString(payload.foreshadowId);
  const foreshadowTitle = readString(payload.foreshadowTitle);

  if (!foreshadowId || !foreshadowTitle) {
    throw new Error('伏笔规划缺少 foreshadowId 或 foreshadowTitle');
  }

  return {
    foreshadowId,
    foreshadowTitle,
    type: readString(payload.type),
    importance: readPlanImportance(payload.importance),
    activationWindow: readString(payload.activationWindow),
    resolveWindow: readString(payload.resolveWindow),
    plannedActivateVolume: readOptionalPositiveInteger(payload.plannedActivateVolume),
    plannedResolveVolume: readOptionalPositiveInteger(payload.plannedResolveVolume),
    activationCondition: readString(payload.activationCondition),
    resolveCondition: readString(payload.resolveCondition),
    dependsOnForeshadowIds: readStringArray(payload.dependsOnForeshadowIds),
    dependsOnForeshadowTitles: readStringArray(payload.dependsOnForeshadowTitles),
    dependsOnEventKeys: readStringArray(payload.dependsOnEventKeys),
    relatedQuestionIds: readStringArray(payload.relatedQuestionIds),
    payoffEffect: readString(payload.payoffEffect),
  };
}

function parseForeshadowPlanJsonItems(raw: unknown): ForeshadowPlanJsonData[] {
  const root = asRecord(raw);

  if (root?.type === 'lore-foreshadow-plans' && Array.isArray(root.items)) {
    return root.items.map((item) => parseForeshadowPlanJsonItem(item));
  }

  if (Array.isArray(raw)) {
    return raw.map((item) => parseForeshadowPlanJsonItem(item));
  }

  return [parseForeshadowPlanJsonItem(raw)];
}

function buildDraftFromForeshadowPlan(item: ForeshadowPlan): ForeshadowPlanDraftModel {
  return {
    foreshadowId: item.foreshadowId,
    foreshadowTitle: item.foreshadowTitle,
    type: item.type,
    importance: item.importance,
    activationWindow: item.activationWindow ?? '',
    resolveWindow: item.resolveWindow ?? '',
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

export function ForeshadowPlanPanel({
  projectId,
  className,
  onOpenEditor,
  onOpenChapter,
}: ForeshadowPlanPanelProps) {
  const { toast } = useToast();
  const volumes = useVolumeStore((state) => state.volumes);
  const foreshadows = useForeshadowStore((state) => state.foreshadows);
  const setActiveForeshadow = useForeshadowStore((state) => state.setActiveForeshadow);
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
  const [activeMode, setActiveMode] = useState<ForeshadowPanelMode>('plans');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

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
  const activeMatchedForeshadow = useMemo(() => {
    if (!activeForeshadowPlan) {
      return null;
    }

    return projectForeshadows.find((item) => {
      return (
        (item.foreshadowId?.trim() && item.foreshadowId === activeForeshadowPlan.foreshadowId) ||
        item.id === activeForeshadowPlan.foreshadowId ||
        normalizeTitleKey(item.title) === normalizeTitleKey(activeForeshadowPlan.foreshadowTitle)
      );
    }) ?? null;
  }, [activeForeshadowPlan, projectForeshadows]);
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

  function handleExportAllForeshadowPlans() {
    if (foreshadowPlans.length === 0) {
      toast('当前没有可导出的伏笔规划', 'warning');
      return;
    }

    const payload: ForeshadowPlanCollectionJsonEnvelope = {
      version: 1,
      type: 'lore-foreshadow-plans',
      exportedAt: new Date().toISOString(),
      items: foreshadowPlans.map((item) => buildPlanJsonData(item)),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = sanitizeFileName(`${projectId}-伏笔规划合集.json`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
  }

  function openImportDialog() {
    if (!importFileInputRef.current) {
      toast('导入控件尚未就绪，请稍后重试', 'warning');
      return;
    }

    importFileInputRef.current.value = '';
    importFileInputRef.current.click();
  }

  function handleSelectForeshadowPlan(foreshadowPlanId: Id) {
    setActiveForeshadowPlan(foreshadowPlanId);
    setEditingId(foreshadowPlanId);
    setActiveMode('plans');
  }

  function handleOpenLinkedFact(foreshadowTitle: string) {
    const matchedForeshadow = projectForeshadows.find((item) => {
      return (
        normalizeTitleKey(item.title) === normalizeTitleKey(foreshadowTitle) ||
        normalizeTitleKey(item.foreshadowId ?? '') === normalizeTitleKey(foreshadowTitle)
      );
    });

    if (!matchedForeshadow) {
      toast('当前规划还没有对应的伏笔事实，请先补录事实项', 'warning');
      return;
    }

    setActiveForeshadow(matchedForeshadow.id);
    setActiveMode('facts');
  }

  function handleOpenLinkedPlan(foreshadowTitle: string) {
    const matchedPlan = foreshadowPlans.find((item) => {
      return normalizeTitleKey(item.foreshadowTitle) === normalizeTitleKey(foreshadowTitle);
    });

    if (!matchedPlan) {
      toast('当前伏笔还没有对应规划，请先补录规划项', 'warning');
      return;
    }

    setActiveForeshadowPlan(matchedPlan.id);
    setEditingId(matchedPlan.id);
    setActiveMode('plans');
  }

  async function handleSave() {
    const normalizedForeshadowId = draft.foreshadowId.trim();
    const normalizedForeshadowTitle = draft.foreshadowTitle.trim();

    if (!normalizedForeshadowId || !normalizedForeshadowTitle) {
      toast('请先填写伏笔 ID 和伏笔标题', 'warning');
      return;
    }

    const dependsOnForeshadowTitles = normalizeDelimitedText(draft.dependsOnForeshadowTitlesText);
    const matchedDependsOnForeshadows = dependsOnForeshadowTitles
      .map((title) => foreshadowTitleMap.get(normalizeTitleKey(title)) ?? null)
      .filter((item): item is { id: Id; title: string } => Boolean(item));
    const existingPlanForForeshadow =
      foreshadowPlans.find((item) => item.foreshadowId === normalizedForeshadowId) ?? null;
    const payload = {
      projectId,
      foreshadowId: normalizedForeshadowId,
      foreshadowTitle: normalizedForeshadowTitle,
      type: draft.type,
      importance: draft.importance,
      activationWindow: draft.activationWindow,
      resolveWindow: draft.resolveWindow,
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

  async function handleImportForeshadowPlans(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    let successCount = 0;
    const failedFiles: string[] = [];
    let lastImportedPlanId: Id | null = null;

    for (const file of files) {
      try {
        const parsed = JSON.parse(await file.text()) as unknown;
        const items = parseForeshadowPlanJsonItems(parsed);

        for (const item of items) {
          const currentItems = useForeshadowPlanStore.getState().foreshadowPlans;
          const existing = currentItems.find((plan) => plan.foreshadowId === item.foreshadowId) ?? null;
          const payload = {
            projectId,
            foreshadowId: item.foreshadowId,
            foreshadowTitle: item.foreshadowTitle,
            type: item.type,
            importance: item.importance,
            activationWindow: item.activationWindow ?? '',
            resolveWindow: item.resolveWindow ?? '',
            plannedActivateVolume: item.plannedActivateVolume ?? null,
            plannedResolveVolume: item.plannedResolveVolume ?? null,
            activationCondition: item.activationCondition ?? '',
            resolveCondition: item.resolveCondition ?? '',
            dependsOnForeshadowIds: item.dependsOnForeshadowIds ?? [],
            dependsOnForeshadowTitles: item.dependsOnForeshadowTitles ?? [],
            dependsOnEventKeys: item.dependsOnEventKeys ?? [],
            relatedQuestionIds: item.relatedQuestionIds ?? [],
            payoffEffect: item.payoffEffect ?? '',
          };
          const saved = existing
            ? await updateForeshadowPlan(existing.id, payload, {
                currentVolumeOrder,
                overdueVolumeGap: DEFAULT_OVERDUE_VOLUME_GAP,
              })
            : await createForeshadowPlan(payload, {
                currentVolumeOrder,
                overdueVolumeGap: DEFAULT_OVERDUE_VOLUME_GAP,
              });
          lastImportedPlanId = saved.id;
          successCount += 1;
        }
      } catch {
        failedFiles.push(file.name);
      }
    }

    if (lastImportedPlanId) {
      setActiveForeshadowPlan(lastImportedPlanId);
      setEditingId(lastImportedPlanId);
      setActiveMode('plans');
    }

    if (successCount > 0) {
      toast(
        failedFiles.length > 0
          ? `已导入 ${successCount} 条伏笔规划，另有 ${failedFiles.length} 个文件失败`
          : `已导入 ${successCount} 条伏笔规划`,
        failedFiles.length > 0 ? 'warning' : 'success',
      );
      return;
    }

    toast(
      failedFiles.length > 0 ? `导入失败：${failedFiles.join('、')}` : '没有可导入的伏笔规划',
      'error',
    );
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
          <p className="text-xs uppercase tracking-[0.24em] text-indigo-300">伏笔事实 / 规划</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">在同一处维护伏笔事实状态与规划安排</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            事实层负责“已经埋下了什么、现在是什么状态”；规划层负责“什么时候动、怎么收”。两边共用同一批标题，后续可直接互相跳转。
          </p>
          {unsyncedCount > 0 ? <p className="mt-2 text-xs leading-6 text-amber-300">当前有 {unsyncedCount} 条本地草稿或待同步记录，断网时会先保留在 Dexie 镜像里。</p> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="inline-flex rounded-2xl border border-neutral-700 bg-neutral-950/80 p-1">
            {[
              { key: 'facts' as const, label: '伏笔事实' },
              { key: 'plans' as const, label: '伏笔规划' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveMode(item.key)}
                className={`rounded-2xl px-4 py-2 text-sm transition ${
                  activeMode === item.key
                    ? 'bg-indigo-400 text-neutral-950'
                    : 'text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {activeMode === 'plans' ? (
            <>
              <button
                type="button"
                onClick={handleExportAllForeshadowPlans}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
              >
                <Download size={15} />
                导出规划
              </button>
              <button
                type="button"
                onClick={openImportDialog}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
              >
                <Upload size={15} />
                导入规划
              </button>
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
            </>
          ) : null}
        </div>
      </header>

      {activeMode === 'plans' && alerts.length > 0 ? (
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

      {activeMode === 'facts' ? (
        <div className="mt-6">
          <ForeshadowWorkspace
            projectId={projectId}
            onOpenEditor={onOpenEditor}
            onOpenChapter={onOpenChapter}
            onOpenLinkedPlan={handleOpenLinkedPlan}
            embedded
          />
        </div>
      ) : (
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
              还没有伏笔规划。先直接建一条规划项，补上激活窗口、回收窗口和回收效果。
            </div>
          ) : (
            foreshadowPlans.map((item) => {
              const active = editingId === item.id;
              const linkedForeshadow = projectForeshadows.find((foreshadow) => {
                return (
                  (foreshadow.foreshadowId?.trim() && foreshadow.foreshadowId === item.foreshadowId) ||
                  foreshadow.id === item.foreshadowId ||
                  normalizeTitleKey(foreshadow.title) === normalizeTitleKey(item.foreshadowTitle)
                );
              }) ?? null;

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
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${linkedForeshadow ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/20 bg-amber-500/10 text-amber-200'}`}>
                      {linkedForeshadow ? '已关联事实' : '未关联事实'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">{item.type || '未分类'}</p>
                  <p className="mt-1 text-xs leading-6 text-neutral-500">
                    {item.activationWindow || item.resolveWindow
                      ? `窗口：${[item.activationWindow, item.resolveWindow].filter(Boolean).join(' -> ')}`
                      : '窗口：暂未填写'}
                  </p>
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
            {activeForeshadowPlan ? (
              <div className="md:col-span-2 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
                <p>
                  {activeMatchedForeshadow
                    ? `已关联伏笔事实：${activeMatchedForeshadow.title}`
                    : '当前规划还没有匹配到伏笔事实，请先在“伏笔事实”里补录对应标题。'}
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenLinkedFact(activeForeshadowPlan.foreshadowTitle)}
                  className="mt-2 inline-flex items-center gap-2 text-sm text-indigo-200 transition-colors hover:text-indigo-100"
                >
                  <Plus size={15} />
                  {activeMatchedForeshadow ? '定位到伏笔事实' : '前往补录伏笔事实'}
                </button>
              </div>
            ) : null}
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">伏笔 ID</span>
              <input
                value={draft.foreshadowId}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    foreshadowId: event.target.value,
                  }))
                }
                placeholder="例如：ff_clause7_missing"
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">伏笔标题</span>
              <input
                value={draft.foreshadowTitle}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    foreshadowTitle: event.target.value,
                  }))
                }
                placeholder="例如：附则第七条缺失"
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">引用已有事实（可选）</span>
              <select
                value=""
                onChange={(event) =>
                  setDraft((previous) => {
                    const selectedValue = event.target.value as Id;
                    const matchedForeshadow =
                      projectForeshadows.find((item) => (item.foreshadowId?.trim() || item.id) === selectedValue) ?? null;

                    if (!matchedForeshadow) {
                      return previous;
                    }

                    return {
                      ...previous,
                      foreshadowId: matchedForeshadow.foreshadowId?.trim() || matchedForeshadow.id,
                      foreshadowTitle: matchedForeshadow.title,
                    };
                  })
                }
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
              >
                <option value="">可从已有伏笔事实快速带入</option>
                {projectForeshadows.map((foreshadow) => (
                  <option key={foreshadow.id} value={foreshadow.foreshadowId?.trim() || foreshadow.id}>
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
              <span className="text-sm font-medium text-neutral-200">激活窗口</span>
              <input
                value={draft.activationWindow}
                onChange={(event) => setDraft((previous) => ({ ...previous, activationWindow: event.target.value }))}
                placeholder="例如：卷一中后段开始推进"
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">回收窗口</span>
              <input
                value={draft.resolveWindow}
                onChange={(event) => setDraft((previous) => ({ ...previous, resolveWindow: event.target.value }))}
                placeholder="例如：卷二末到卷三初"
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
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
              伏笔规划可以独立新建。事实层与规划层优先按 `foreshadowId` 软关联，缺失时再回退到标题匹配，用于核对与导航，不参与写前控制。
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
      )}
      <input
        ref={importFileInputRef}
        type="file"
        accept="application/json,.json"
        multiple
        className="hidden"
        onChange={(event) => void handleImportForeshadowPlans(event)}
      />
    </article>
  );
}
