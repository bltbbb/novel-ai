import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { buildStructureMemorySaveFeedback } from '@/lib/structure-memory-sync';
import { useToast } from '@/components/Toast';
import { useAntagonistAgendaStore, useLoreStore, useWorldStateStore } from '@/stores';
import type { AntagonistAgenda, AntagonistAgendaStatus, Id } from '@/types';

interface AntagonistAgendaPanelProps {
  projectId: Id;
  className?: string;
}

interface DraftModel {
  characterEntityId: Id | '';
  publicRole: string;
  hiddenAgenda: string;
  currentObjective: string;
  currentAction: string;
  triggerToStrike: string;
  bottomLine: string;
  resourceBase: string;
  nextMoveWindow: string;
  intelligenceBlindSpot: string;
  ifProtagonistDoesNothing: string;
  status: AntagonistAgendaStatus;
}

function createEmptyDraft(): DraftModel {
  return {
    characterEntityId: '',
    publicRole: '',
    hiddenAgenda: '',
    currentObjective: '',
    currentAction: '',
    triggerToStrike: '',
    bottomLine: '',
    resourceBase: '',
    nextMoveWindow: '',
    intelligenceBlindSpot: '',
    ifProtagonistDoesNothing: '',
    status: 'active',
  };
}

function buildDraft(item: AntagonistAgenda): DraftModel {
  return {
    characterEntityId: item.characterEntityId ?? '',
    publicRole: item.publicRole,
    hiddenAgenda: item.hiddenAgenda,
    currentObjective: item.currentObjective,
    currentAction: item.currentAction,
    triggerToStrike: item.triggerToStrike,
    bottomLine: item.bottomLine,
    resourceBase: item.resourceBase,
    nextMoveWindow: item.nextMoveWindow,
    intelligenceBlindSpot: item.intelligenceBlindSpot,
    ifProtagonistDoesNothing: item.ifProtagonistDoesNothing,
    status: item.status,
  };
}

interface AntagonistWorldStateAlert {
  agendaId: Id;
  characterName: string;
  volumeLabel: string;
  message: string;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function containsAnyKeyword(text: string, keywords: string[]) {
  const normalized = normalizeText(text);
  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
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

function resolveAgendaWorldStateCategories(text: string) {
  const categories = new Set<'public' | 'institution' | 'rule' | 'power' | 'risk'>();

  if (containsAnyKeyword(text, ['公开', '曝光', '传言', '舆论', '昭告', '揭露'])) {
    categories.add('public');
  }

  if (containsAnyKeyword(text, ['官署', '朝廷', '司', '院', '任命', '撤职', '制度', '规制'])) {
    categories.add('institution');
  }

  if (containsAnyKeyword(text, ['规则', '禁令', '律令', '附则', '法理', '审判'])) {
    categories.add('rule');
  }

  if (containsAnyKeyword(text, ['势力', '宗门', '派系', '权柄', '兵权', '镇守', '家族'])) {
    categories.add('power');
  }

  if (containsAnyKeyword(text, ['风险', '后患', '追查', '追缉', '通缉', '反噬', '隐患'])) {
    categories.add('risk');
  }

  return categories;
}

export function AntagonistAgendaPanel({ projectId, className }: AntagonistAgendaPanelProps) {
  const { toast } = useToast();
  const entities = useLoreStore((state) => state.entities);
  const worldStateEntries = useWorldStateStore((state) => state.worldStateEntries);
  const antagonistAgendas = useAntagonistAgendaStore((state) => state.antagonistAgendas);
  const syncStatusById = useAntagonistAgendaStore((state) => state.syncStatusById);
  const activeAntagonistAgendaId = useAntagonistAgendaStore((state) => state.activeAntagonistAgendaId);
  const loadAntagonistAgendas = useAntagonistAgendaStore((state) => state.loadAntagonistAgendas);
  const setActiveAntagonistAgenda = useAntagonistAgendaStore((state) => state.setActiveAntagonistAgenda);
  const createAntagonistAgenda = useAntagonistAgendaStore((state) => state.createAntagonistAgenda);
  const updateAntagonistAgenda = useAntagonistAgendaStore((state) => state.updateAntagonistAgenda);
  const deleteAntagonistAgenda = useAntagonistAgendaStore((state) => state.deleteAntagonistAgenda);
  const [editingId, setEditingId] = useState<Id | 'new' | null>(null);
  const [draft, setDraft] = useState<DraftModel>(createEmptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const characters = useMemo(
    () => entities.filter((item) => item.projectId === projectId && item.type === 'character' && !item.draft),
    [entities, projectId],
  );
  const activeAgenda = useMemo(
    () => antagonistAgendas.find((item) => item.id === activeAntagonistAgendaId) ?? null,
    [activeAntagonistAgendaId, antagonistAgendas],
  );
  const unsyncedCount = useMemo(
    () => Object.values(syncStatusById).filter((status) => status && status !== 'synced').length,
    [syncStatusById],
  );
  const worldStateAlerts = useMemo<AntagonistWorldStateAlert[]>(() => {
    const latestVolumeOrder = worldStateEntries
      .filter((item) => item.projectId === projectId)
      .reduce((max, item) => Math.max(max, item.volumeOrder), 0);

    if (latestVolumeOrder <= 0) {
      return [] as AntagonistWorldStateAlert[];
    }

    const latestEntries = worldStateEntries.filter((item) => item.projectId === projectId && item.volumeOrder === latestVolumeOrder);
    const latestVolumeTitle = latestEntries[0]?.volumeTitle ?? `第${latestVolumeOrder}卷`;
    const latestWorldStateText = latestEntries
      .flatMap((entry) => [
        ...entry.publicEvents,
        ...entry.secretEvents,
        ...entry.currentRisks,
        entry.powerBalanceChange,
        entry.institutionChange,
        entry.ruleChange,
        entry.rumorState,
      ])
      .filter(Boolean)
      .join('\n');
    const hasPublicCoverage = latestEntries.some((entry) => entry.publicEvents.length > 0 || entry.rumorState.trim());
    const hasInstitutionCoverage = latestEntries.some(
      (entry) => Boolean(entry.institutionChange.trim()) || entry.publicEvents.length > 0 || entry.secretEvents.length > 0,
    );
    const hasRuleCoverage = latestEntries.some(
      (entry) => Boolean(entry.ruleChange.trim()) || Boolean(entry.institutionChange.trim()),
    );
    const hasPowerCoverage = latestEntries.some(
      (entry) => Boolean(entry.powerBalanceChange.trim()) || entry.publicEvents.length > 0,
    );
    const hasRiskCoverage = latestEntries.some(
      (entry) => entry.currentRisks.length > 0 || Boolean(entry.rumorState.trim()),
    );

    return antagonistAgendas
      .filter((item) => item.projectId === projectId && item.status === 'active')
      .map((agenda) => {
        const agendaText = [
          agenda.publicRole,
          agenda.currentObjective,
          agenda.currentAction,
          agenda.triggerToStrike,
          agenda.ifProtagonistDoesNothing,
        ]
          .filter(Boolean)
          .join('\n');
        const categories = resolveAgendaWorldStateCategories(agendaText);
        const matchedCategoryLabels: string[] = [];
        const directHitCount = countMatchedTerms(latestWorldStateText, [agenda.characterName, agenda.publicRole]);

        if (categories.has('public') && hasPublicCoverage) {
          matchedCategoryLabels.push('公开变化');
        }
        if (categories.has('institution') && hasInstitutionCoverage) {
          matchedCategoryLabels.push('制度变化');
        }
        if (categories.has('rule') && hasRuleCoverage) {
          matchedCategoryLabels.push('规则变化');
        }
        if (categories.has('power') && hasPowerCoverage) {
          matchedCategoryLabels.push('势力变化');
        }
        if (categories.has('risk') && hasRiskCoverage) {
          matchedCategoryLabels.push('风险变化');
        }

        if (directHitCount <= 0 && matchedCategoryLabels.length === 0) {
          return null;
        }

        return {
          agendaId: agenda.id,
          characterName: agenda.characterName || '未命名反派',
          volumeLabel: `第${latestVolumeOrder}卷《${latestVolumeTitle}》`,
          message:
            directHitCount > 0
              ? `最新世界状态已经直接提到这名反派或其公开身份，建议重新检查当前动作和出手触发是否需要调整。`
              : `最新世界状态已出现 ${matchedCategoryLabels.join('、')}，与该反派的当前动作/触发条件存在耦合，建议重新评估是否要改写 currentAction。`,
        };
      })
      .filter((item): item is AntagonistWorldStateAlert => Boolean(item))
      .slice(0, 4);
  }, [antagonistAgendas, projectId, worldStateEntries]);

  useEffect(() => {
    setEditingId(null);
    setDraft(createEmptyDraft());
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void loadAntagonistAgendas(projectId)
      .catch(() => {
        if (!cancelled) {
          toast('加载反派议程失败', 'error');
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
  }, [loadAntagonistAgendas, projectId, toast]);

  useEffect(() => {
    if (editingId === 'new') {
      return;
    }

    if (activeAgenda) {
      setEditingId(activeAgenda.id);
      setDraft(buildDraft(activeAgenda));
      return;
    }

    if (antagonistAgendas.length === 0) {
      setEditingId('new');
      setDraft(createEmptyDraft());
    }
  }, [activeAgenda, antagonistAgendas.length, editingId]);

  async function handleSave() {
    const character = characters.find((item) => item.id === draft.characterEntityId) ?? null;
    const payload = {
      projectId,
      characterEntityId: character?.id ?? null,
      characterName: character?.name ?? '',
      publicRole: draft.publicRole,
      hiddenAgenda: draft.hiddenAgenda,
      currentObjective: draft.currentObjective,
      currentAction: draft.currentAction,
      triggerToStrike: draft.triggerToStrike,
      bottomLine: draft.bottomLine,
      resourceBase: draft.resourceBase,
      nextMoveWindow: draft.nextMoveWindow,
      intelligenceBlindSpot: draft.intelligenceBlindSpot,
      ifProtagonistDoesNothing: draft.ifProtagonistDoesNothing,
      status: draft.status,
    };

    if (!character) {
      toast('请先选择反派角色', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      if (editingId === 'new' || !editingId) {
        const item = await createAntagonistAgenda(payload);
        setEditingId(item.id);
        setActiveAntagonistAgenda(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useAntagonistAgendaStore.getState().syncStatusById[item.id],
          localOnly: useAntagonistAgendaStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '反派议程已创建',
          entityLabel: '反派议程',
        });
        toast(feedback.message, feedback.tone);
      } else {
        const item = await updateAntagonistAgenda(editingId, payload);
        setEditingId(item.id);
        setActiveAntagonistAgenda(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useAntagonistAgendaStore.getState().syncStatusById[item.id],
          localOnly: useAntagonistAgendaStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '反派议程已保存',
          entityLabel: '反派议程',
        });
        toast(feedback.message, feedback.tone);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存反派议程失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId || editingId === 'new') {
      setDraft(createEmptyDraft());
      return;
    }

    const confirmed = window.confirm('确认删除这条反派议程吗？');

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteAntagonistAgenda(projectId, editingId);
      setEditingId(null);
      toast('反派议程已删除', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除反派议程失败', 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  const containerClassName = ['overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-6', className ?? ''].filter(Boolean).join(' ');

  return (
    <article className={containerClassName}>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-indigo-300">反派议程板</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">让反派在主角不动时也会动</h3>
          {unsyncedCount > 0 ? <p className="mt-2 text-xs leading-6 text-amber-300">当前有 {unsyncedCount} 条本地草稿或待同步记录，断网时会先保留在 Dexie 镜像里。</p> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => { setActiveAntagonistAgenda(null); setEditingId('new'); setDraft(createEmptyDraft()); }} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"><Plus size={15} />新建议程</button>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}保存议程</button>
        </div>
      </header>

      {worldStateAlerts.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {worldStateAlerts.map((alert) => (
            <div key={alert.agendaId} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-50">
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="mt-1 flex-shrink-0 text-amber-300" />
                <div>
                  <p className="font-medium">{alert.characterName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-amber-300">{alert.volumeLabel}</p>
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
            <p className="text-sm font-medium text-neutral-200">当前反派</p>
            {isLoading ? <span className="inline-flex items-center gap-2 text-xs text-neutral-500"><LoaderCircle size={13} className="animate-spin" />正在刷新</span> : null}
          </div>
          {antagonistAgendas.map((item) => {
            const active = editingId === item.id;
            return (
              <button key={item.id} type="button" onClick={() => { setActiveAntagonistAgenda(item.id); setEditingId(item.id); }} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${active ? 'border-indigo-400/50 bg-indigo-500/10' : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-600 hover:bg-neutral-900'}`}>
                <p className="text-sm font-medium text-neutral-100">{item.characterName}</p>
                <p className="mt-2 text-xs leading-6 text-neutral-500">{item.status}</p>
              </button>
            );
          })}
        </aside>
        <section className="rounded-[24px] border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium text-neutral-200">反派角色</span><select value={draft.characterEntityId} onChange={(event) => setDraft((previous) => ({ ...previous, characterEntityId: event.target.value as Id }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"><option value="">请选择角色</option>{characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">公开身份</span><textarea value={draft.publicRole} onChange={(event) => setDraft((previous) => ({ ...previous, publicRole: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">隐藏目标</span><textarea value={draft.hiddenAgenda} onChange={(event) => setDraft((previous) => ({ ...previous, hiddenAgenda: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">当前目标</span><textarea value={draft.currentObjective} onChange={(event) => setDraft((previous) => ({ ...previous, currentObjective: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">当前动作</span><textarea value={draft.currentAction} onChange={(event) => setDraft((previous) => ({ ...previous, currentAction: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">出手触发</span><textarea value={draft.triggerToStrike} onChange={(event) => setDraft((previous) => ({ ...previous, triggerToStrike: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">底线</span><textarea value={draft.bottomLine} onChange={(event) => setDraft((previous) => ({ ...previous, bottomLine: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">资源基础</span><textarea value={draft.resourceBase} onChange={(event) => setDraft((previous) => ({ ...previous, resourceBase: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">下一行动窗口</span><textarea value={draft.nextMoveWindow} onChange={(event) => setDraft((previous) => ({ ...previous, nextMoveWindow: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">信息盲区</span><textarea value={draft.intelligenceBlindSpot} onChange={(event) => setDraft((previous) => ({ ...previous, intelligenceBlindSpot: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">主角不动会怎样</span><textarea value={draft.ifProtagonistDoesNothing} onChange={(event) => setDraft((previous) => ({ ...previous, ifProtagonistDoesNothing: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium text-neutral-200">状态</span><select value={draft.status} onChange={(event) => setDraft((previous) => ({ ...previous, status: event.target.value as AntagonistAgendaStatus }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"><option value="active">active</option><option value="dormant">dormant</option><option value="defeated">defeated</option></select></label>
          </div>
          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5">
            <p className="text-xs leading-6 text-neutral-500">正文上下文会优先拉入活跃反派的当前目标、动作和出手触发。</p>
            <button type="button" onClick={() => void handleDelete()} disabled={isDeleting || editingId === 'new' || !editingId} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 text-sm text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50">{isDeleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}删除议程</button>
          </footer>
        </section>
      </div>
    </article>
  );
}
