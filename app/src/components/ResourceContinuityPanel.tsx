import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { RESOURCE_CONTINUITY_RISK_LABELS, RESOURCE_CONTINUITY_TYPE_OPTIONS } from '@/lib/resource-continuity';
import { buildStructureMemorySaveFeedback } from '@/lib/structure-memory-sync';
import { useToast } from '@/components/Toast';
import { useLoreStore, useResourceContinuityStore } from '@/stores';
import type { Id, ResourceContinuity, ResourceContinuityRiskLevel, ResourceContinuityStatus } from '@/types';

interface ResourceContinuityPanelProps {
  projectId: Id;
  className?: string;
}

interface DraftModel {
  resourceType: string;
  ownerCharacterId: Id | '';
  currentState: string;
  performanceImpact: string;
  lastConsumedAt: string;
  recoveryCondition: string;
  hiddenCost: string;
  continuityRisk: string;
  status: ResourceContinuityStatus;
}

function createEmptyDraft(): DraftModel {
  return {
    resourceType: '伤势',
    ownerCharacterId: '',
    currentState: '',
    performanceImpact: '',
    lastConsumedAt: '',
    recoveryCondition: '',
    hiddenCost: '',
    continuityRisk: '',
    status: 'active',
  };
}

function buildDraft(item: ResourceContinuity): DraftModel {
  return {
    resourceType: item.resourceType,
    ownerCharacterId: item.ownerCharacterId ?? '',
    currentState: item.currentState,
    performanceImpact: item.performanceImpact,
    lastConsumedAt: item.lastConsumedAt,
    recoveryCondition: item.recoveryCondition,
    hiddenCost: item.hiddenCost,
    continuityRisk: item.continuityRisk,
    status: item.status,
  };
}

export function ResourceContinuityPanel({ projectId, className }: ResourceContinuityPanelProps) {
  const { toast } = useToast();
  const entities = useLoreStore((state) => state.entities);
  const resourceContinuities = useResourceContinuityStore((state) => state.resourceContinuities);
  const syncStatusById = useResourceContinuityStore((state) => state.syncStatusById);
  const activeResourceContinuityId = useResourceContinuityStore((state) => state.activeResourceContinuityId);
  const loadResourceContinuities = useResourceContinuityStore((state) => state.loadResourceContinuities);
  const setActiveResourceContinuity = useResourceContinuityStore((state) => state.setActiveResourceContinuity);
  const createResourceContinuity = useResourceContinuityStore((state) => state.createResourceContinuity);
  const updateResourceContinuity = useResourceContinuityStore((state) => state.updateResourceContinuity);
  const deleteResourceContinuity = useResourceContinuityStore((state) => state.deleteResourceContinuity);
  const [editingId, setEditingId] = useState<Id | 'new' | null>(null);
  const [draft, setDraft] = useState<DraftModel>(createEmptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedResourceType, setSelectedResourceType] = useState('');
  const [selectedOwnerCharacterId, setSelectedOwnerCharacterId] = useState<Id | ''>('');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<ResourceContinuityRiskLevel | ''>('');

  const characters = useMemo(
    () => entities.filter((item) => item.projectId === projectId && item.type === 'character' && !item.draft),
    [entities, projectId],
  );
  const activeRecord = useMemo(
    () => resourceContinuities.find((item) => item.id === activeResourceContinuityId) ?? null,
    [activeResourceContinuityId, resourceContinuities],
  );
  const unsyncedCount = useMemo(
    () => Object.values(syncStatusById).filter((status) => status && status !== 'synced').length,
    [syncStatusById],
  );
  const activeFilters = useMemo(
    () => ({
      ownerCharacterId: selectedOwnerCharacterId || undefined,
      resourceType: selectedResourceType || undefined,
      riskLevel: selectedRiskLevel || undefined,
    }),
    [selectedOwnerCharacterId, selectedResourceType, selectedRiskLevel],
  );

  useEffect(() => {
    setEditingId(null);
    setDraft(createEmptyDraft());
    setSelectedResourceType('');
    setSelectedOwnerCharacterId('');
    setSelectedRiskLevel('');
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void loadResourceContinuities(projectId, activeFilters)
      .catch(() => {
        if (!cancelled) {
          toast('加载资源连续性失败', 'error');
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
  }, [activeFilters, loadResourceContinuities, projectId, toast]);

  useEffect(() => {
    if (editingId === 'new') {
      return;
    }
    if (activeRecord) {
      setEditingId(activeRecord.id);
      setDraft(buildDraft(activeRecord));
      return;
    }
    if (resourceContinuities.length === 0) {
      setEditingId('new');
      setDraft(createEmptyDraft());
    }
  }, [activeRecord, editingId, resourceContinuities.length]);

  async function handleSave() {
    const owner = characters.find((item) => item.id === draft.ownerCharacterId) ?? null;
    const payload = {
      projectId,
      resourceType: draft.resourceType,
      ownerCharacterId: owner?.id ?? null,
      ownerCharacterName: owner?.name ?? '',
      currentState: draft.currentState,
      performanceImpact: draft.performanceImpact,
      lastConsumedAt: draft.lastConsumedAt,
      recoveryCondition: draft.recoveryCondition,
      hiddenCost: draft.hiddenCost,
      continuityRisk: draft.continuityRisk,
      status: draft.status,
    };
    setIsSaving(true);
    try {
      if (editingId === 'new' || !editingId) {
        const item = await createResourceContinuity(payload, activeFilters);
        setEditingId(item.id);
        setActiveResourceContinuity(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useResourceContinuityStore.getState().syncStatusById[item.id],
          localOnly: useResourceContinuityStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '资源连续性已创建',
          entityLabel: '资源连续性',
        });
        toast(feedback.message, feedback.tone);
      } else {
        const item = await updateResourceContinuity(editingId, payload, activeFilters);
        setEditingId(item.id);
        setActiveResourceContinuity(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useResourceContinuityStore.getState().syncStatusById[item.id],
          localOnly: useResourceContinuityStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '资源连续性已保存',
          entityLabel: '资源连续性',
        });
        toast(feedback.message, feedback.tone);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存资源连续性失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId || editingId === 'new') {
      setDraft(createEmptyDraft());
      return;
    }
    const confirmed = window.confirm('确认删除这条资源连续性记录吗？');
    if (!confirmed) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteResourceContinuity(projectId, editingId, activeFilters);
      setEditingId(null);
      toast('资源连续性已删除', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除资源连续性失败', 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  const containerClassName = ['overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-6', className ?? ''].filter(Boolean).join(' ');

  return (
    <article className={containerClassName}>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-indigo-300">资源与代价连续性</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">让伤势、代价和法理反噬真正跨章生效</h3>
          {unsyncedCount > 0 ? <p className="mt-2 text-xs leading-6 text-amber-300">当前有 {unsyncedCount} 条本地草稿或待同步记录，断网时会先保留在 Dexie 镜像里。</p> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => { setActiveResourceContinuity(null); setEditingId('new'); setDraft(createEmptyDraft()); }} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"><Plus size={15} />新建约束</button>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}保存约束</button>
        </div>
      </header>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.2em] text-neutral-500">按资源类型筛选</span>
          <select value={selectedResourceType} onChange={(event) => setSelectedResourceType(event.target.value)} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400">
            <option value="">全部资源类型</option>
            {RESOURCE_CONTINUITY_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.2em] text-neutral-500">按人物筛选</span>
          <select value={selectedOwnerCharacterId} onChange={(event) => setSelectedOwnerCharacterId(event.target.value as Id | '')} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400">
            <option value="">全部人物</option>
            {characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.2em] text-neutral-500">按风险级别筛选</span>
          <select value={selectedRiskLevel} onChange={(event) => setSelectedRiskLevel(event.target.value as ResourceContinuityRiskLevel | '')} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400">
            <option value="">全部风险</option>
            <option value="critical">致命</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </label>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between"><p className="text-sm font-medium text-neutral-200">当前约束</p>{isLoading ? <span className="inline-flex items-center gap-2 text-xs text-neutral-500"><LoaderCircle size={13} className="animate-spin" />正在刷新</span> : null}</div>
          {resourceContinuities.length === 0 ? <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/30 px-4 py-5 text-sm leading-6 text-neutral-500">当前筛选条件下还没有记录。可以先新建一条约束，或切回“全部资源类型 / 全部人物 / 全部风险”。</div> : null}
          {resourceContinuities.map((item) => {
            const active = editingId === item.id;
            return <button key={item.id} type="button" onClick={() => { setActiveResourceContinuity(item.id); setEditingId(item.id); }} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${active ? 'border-indigo-400/50 bg-indigo-500/10' : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-600 hover:bg-neutral-900'}`}><p className="text-sm font-medium text-neutral-100">{item.ownerCharacterName || '无主资源'} · {item.resourceType}</p><p className="mt-2 text-xs leading-6 text-neutral-500">状态：{item.status} · 风险：{RESOURCE_CONTINUITY_RISK_LABELS[item.riskLevel]}</p></button>;
          })}
        </aside>
        <section className="rounded-[24px] border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">资源类型</span><input list="resource-continuity-type-options" value={draft.resourceType} onChange={(event) => setDraft((previous) => ({ ...previous, resourceType: event.target.value }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">持有人</span><select value={draft.ownerCharacterId} onChange={(event) => setDraft((previous) => ({ ...previous, ownerCharacterId: event.target.value as Id }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"><option value="">未绑定角色</option>{characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium text-neutral-200">当前状态</span><textarea value={draft.currentState} onChange={(event) => setDraft((previous) => ({ ...previous, currentState: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">表现限制</span><textarea value={draft.performanceImpact} onChange={(event) => setDraft((previous) => ({ ...previous, performanceImpact: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">最近消耗位置</span><textarea value={draft.lastConsumedAt} onChange={(event) => setDraft((previous) => ({ ...previous, lastConsumedAt: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">恢复条件</span><textarea value={draft.recoveryCondition} onChange={(event) => setDraft((previous) => ({ ...previous, recoveryCondition: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">隐藏代价</span><textarea value={draft.hiddenCost} onChange={(event) => setDraft((previous) => ({ ...previous, hiddenCost: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">连续性风险</span><textarea value={draft.continuityRisk} onChange={(event) => setDraft((previous) => ({ ...previous, continuityRisk: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">状态</span><select value={draft.status} onChange={(event) => setDraft((previous) => ({ ...previous, status: event.target.value as ResourceContinuityStatus }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"><option value="active">active</option><option value="recovered">recovered</option><option value="permanent">permanent</option></select></label>
          </div>
          <datalist id="resource-continuity-type-options">
            {RESOURCE_CONTINUITY_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </datalist>
          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5"><p className="text-xs leading-6 text-neutral-500">正文上下文会优先拉入焦点角色的 active / permanent 约束，并在高压结构章动态扩张注入范围。</p><button type="button" onClick={() => void handleDelete()} disabled={isDeleting || editingId === 'new' || !editingId} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 text-sm text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50">{isDeleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}删除约束</button></footer>
        </section>
      </div>
    </article>
  );
}
