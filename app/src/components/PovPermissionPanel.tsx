import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { buildStructureMemorySaveFeedback } from '@/lib/structure-memory-sync';
import { useToast } from '@/components/Toast';
import { useEditorStore, useLoreStore, useOutlineStore, usePovPermissionStore, useVolumeStore } from '@/stores';
import type { Id, POVPermission, VolumeOutline } from '@/types';

interface PovPermissionPanelProps {
  projectId: Id;
  className?: string;
}

interface DraftModel {
  scopeType: 'volume' | 'milestone' | 'chapter';
  volumeId: Id | '';
  milestoneIndex: number | null;
  chapterId: Id | '';
  povCharacterId: Id | '';
  readerKnowsText: string;
  protagonistKnowsText: string;
  antagonistKnowsText: string;
  mustHideText: string;
  canHintText: string;
  forbiddenRevealText: string;
}

function createEmptyDraft(): DraftModel {
  return {
    scopeType: 'volume',
    volumeId: '',
    milestoneIndex: null,
    chapterId: '',
    povCharacterId: '',
    readerKnowsText: '',
    protagonistKnowsText: '',
    antagonistKnowsText: '',
    mustHideText: '',
    canHintText: '',
    forbiddenRevealText: '',
  };
}

function normalizeDelimitedText(value: string) {
  return value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
}

function joinDelimitedText(values: string[]) {
  return values.join('，');
}

function buildDraft(item: POVPermission): DraftModel {
  return {
    scopeType: item.chapterId ? 'chapter' : typeof item.milestoneIndex === 'number' ? 'milestone' : 'volume',
    volumeId: item.volumeId ?? '',
    milestoneIndex: item.milestoneIndex,
    chapterId: item.chapterId ?? '',
    povCharacterId: item.povCharacterId ?? '',
    readerKnowsText: joinDelimitedText(item.readerKnows),
    protagonistKnowsText: joinDelimitedText(item.protagonistKnows),
    antagonistKnowsText: joinDelimitedText(item.antagonistKnows),
    mustHideText: joinDelimitedText(item.mustHide),
    canHintText: joinDelimitedText(item.canHint),
    forbiddenRevealText: joinDelimitedText(item.forbiddenReveal),
  };
}

export function PovPermissionPanel({ projectId, className }: PovPermissionPanelProps) {
  const { toast } = useToast();
  const volumes = useVolumeStore((state) => state.volumes);
  const volumeOutlines = useOutlineStore((state) => state.volumeOutlines);
  const chapters = useEditorStore((state) => state.chapters);
  const entities = useLoreStore((state) => state.entities);
  const povPermissions = usePovPermissionStore((state) => state.povPermissions);
  const syncStatusById = usePovPermissionStore((state) => state.syncStatusById);
  const activePovPermissionId = usePovPermissionStore((state) => state.activePovPermissionId);
  const loadPovPermissions = usePovPermissionStore((state) => state.loadPovPermissions);
  const setActivePovPermission = usePovPermissionStore((state) => state.setActivePovPermission);
  const createPovPermission = usePovPermissionStore((state) => state.createPovPermission);
  const updatePovPermission = usePovPermissionStore((state) => state.updatePovPermission);
  const deletePovPermission = usePovPermissionStore((state) => state.deletePovPermission);
  const [editingId, setEditingId] = useState<Id | 'new' | null>(null);
  const [draft, setDraft] = useState<DraftModel>(createEmptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const projectVolumes = useMemo(() => volumes.filter((item) => item.projectId === projectId), [projectId, volumes]);
  const volumeOutlineMap = useMemo(() => new Map(volumeOutlines.filter((item) => item.projectId === projectId).map((item) => [item.volumeId, item] as const)), [projectId, volumeOutlines]);
  const projectChapters = useMemo(() => chapters.filter((item) => item.projectId === projectId), [chapters, projectId]);
  const characters = useMemo(() => entities.filter((item) => item.projectId === projectId && item.type === 'character' && !item.draft), [entities, projectId]);
  const activePermission = useMemo(() => povPermissions.find((item) => item.id === activePovPermissionId) ?? null, [activePovPermissionId, povPermissions]);
  const unsyncedCount = useMemo(
    () => Object.values(syncStatusById).filter((status) => status && status !== 'synced').length,
    [syncStatusById],
  );
  const selectedVolumeOutline = useMemo<VolumeOutline | null>(() => (draft.volumeId ? volumeOutlineMap.get(draft.volumeId) ?? null : null), [draft.volumeId, volumeOutlineMap]);

  useEffect(() => {
    setEditingId(null);
    setDraft(createEmptyDraft());
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void loadPovPermissions(projectId)
      .catch(() => {
        if (!cancelled) {
          toast('加载视角权限失败', 'error');
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
  }, [loadPovPermissions, projectId, toast]);

  useEffect(() => {
    if (editingId === 'new') {
      return;
    }
    if (activePermission) {
      setEditingId(activePermission.id);
      setDraft(buildDraft(activePermission));
      return;
    }
    if (povPermissions.length === 0) {
      setEditingId('new');
      setDraft(createEmptyDraft());
    }
  }, [activePermission, editingId, povPermissions.length]);

  async function handleSave() {
    const volume = projectVolumes.find((item) => item.id === draft.volumeId) ?? null;
    const chapter = projectChapters.find((item) => item.id === draft.chapterId) ?? null;
    const character = characters.find((item) => item.id === draft.povCharacterId) ?? null;
    const payload = {
      projectId,
      volumeId: draft.scopeType === 'chapter' ? chapter?.volumeId ?? null : volume?.id ?? null,
      volumeTitle: draft.scopeType === 'chapter' ? chapter?.volumeTitle ?? '' : volume?.title ?? '',
      milestoneIndex: draft.scopeType === 'milestone' ? draft.milestoneIndex : null,
      chapterId: draft.scopeType === 'chapter' ? chapter?.id ?? null : null,
      chapterTitle: draft.scopeType === 'chapter' ? chapter?.title ?? '' : '',
      povCharacterId: character?.id ?? null,
      povCharacterName: character?.name ?? '',
      readerKnows: normalizeDelimitedText(draft.readerKnowsText),
      protagonistKnows: normalizeDelimitedText(draft.protagonistKnowsText),
      antagonistKnows: normalizeDelimitedText(draft.antagonistKnowsText),
      mustHide: normalizeDelimitedText(draft.mustHideText),
      canHint: normalizeDelimitedText(draft.canHintText),
      forbiddenReveal: normalizeDelimitedText(draft.forbiddenRevealText),
    };

    if (!character) {
      toast('请先选择视角角色', 'warning');
      return;
    }

    if (draft.scopeType !== 'chapter' && !volume) {
      toast('请先选择卷范围', 'warning');
      return;
    }

    if (draft.scopeType === 'chapter' && !chapter) {
      toast('请先选择章节范围', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId === 'new' || !editingId) {
        const item = await createPovPermission(payload);
        setEditingId(item.id);
        setActivePovPermission(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: usePovPermissionStore.getState().syncStatusById[item.id],
          localOnly: usePovPermissionStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '视角权限已创建',
          entityLabel: '视角权限',
        });
        toast(feedback.message, feedback.tone);
      } else {
        const item = await updatePovPermission(editingId, payload);
        setEditingId(item.id);
        setActivePovPermission(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: usePovPermissionStore.getState().syncStatusById[item.id],
          localOnly: usePovPermissionStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '视角权限已保存',
          entityLabel: '视角权限',
        });
        toast(feedback.message, feedback.tone);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存视角权限失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId || editingId === 'new') {
      setDraft(createEmptyDraft());
      return;
    }
    const confirmed = window.confirm('确认删除这条视角权限吗？');
    if (!confirmed) {
      return;
    }
    setIsDeleting(true);
    try {
      await deletePovPermission(projectId, editingId);
      setEditingId(null);
      toast('视角权限已删除', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除视角权限失败', 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  const containerClassName = ['overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-6', className ?? ''].filter(Boolean).join(' ');

  return (
    <article className={containerClassName}>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-indigo-300">视角与信息权限表</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">把“谁能知道什么”写死进上下文</h3>
          {unsyncedCount > 0 ? <p className="mt-2 text-xs leading-6 text-amber-300">当前有 {unsyncedCount} 条本地草稿或待同步记录，断网时会先保留在 Dexie 镜像里。</p> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => { setActivePovPermission(null); setEditingId('new'); setDraft(createEmptyDraft()); }} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"><Plus size={15} />新建权限</button>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}保存权限</button>
        </div>
      </header>
      <div className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between"><p className="text-sm font-medium text-neutral-200">当前权限</p>{isLoading ? <span className="inline-flex items-center gap-2 text-xs text-neutral-500"><LoaderCircle size={13} className="animate-spin" />正在刷新</span> : null}</div>
          {povPermissions.map((item) => {
            const active = editingId === item.id;
            return <button key={item.id} type="button" onClick={() => { setActivePovPermission(item.id); setEditingId(item.id); }} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${active ? 'border-indigo-400/50 bg-indigo-500/10' : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-600 hover:bg-neutral-900'}`}><p className="text-sm font-medium text-neutral-100">{item.povCharacterName || '未命名视角'}</p><p className="mt-2 text-xs leading-6 text-neutral-500">{item.chapterTitle || item.volumeTitle || '全局'}</p></button>;
          })}
        </aside>
        <section className="rounded-[24px] border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">范围类型</span><select value={draft.scopeType} onChange={(event) => setDraft((previous) => ({ ...previous, scopeType: event.target.value as DraftModel['scopeType'], milestoneIndex: null, chapterId: '' }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"><option value="volume">卷级</option><option value="milestone">里程碑级</option><option value="chapter">章节级</option></select></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">视角角色</span><select value={draft.povCharacterId} onChange={(event) => setDraft((previous) => ({ ...previous, povCharacterId: event.target.value as Id }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"><option value="">请选择角色</option>{characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            {draft.scopeType !== 'chapter' ? <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">卷</span><select value={draft.volumeId} onChange={(event) => setDraft((previous) => ({ ...previous, volumeId: event.target.value as Id, milestoneIndex: null }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"><option value="">请选择卷</option>{projectVolumes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : null}
            {draft.scopeType === 'milestone' ? <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">里程碑</span><select value={typeof draft.milestoneIndex === 'number' ? String(draft.milestoneIndex) : ''} onChange={(event) => setDraft((previous) => ({ ...previous, milestoneIndex: Number(event.target.value) }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"><option value="">请选择里程碑</option>{(selectedVolumeOutline?.milestones ?? []).map((item, index) => <option key={`pov-m-${index}`} value={String(index)}>阶段 {index + 1}{item.title ? ` · ${item.title}` : ''}</option>)}</select></label> : null}
            {draft.scopeType === 'chapter' ? <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium text-neutral-200">章节</span><select value={draft.chapterId} onChange={(event) => setDraft((previous) => ({ ...previous, chapterId: event.target.value as Id }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"><option value="">请选择章节</option>{projectChapters.map((item) => <option key={item.id} value={item.id}>第{item.order}章 {item.title}</option>)}</select></label> : null}
            <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium text-neutral-200">读者可知</span><textarea value={draft.readerKnowsText} onChange={(event) => setDraft((previous) => ({ ...previous, readerKnowsText: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">主角已知</span><textarea value={draft.protagonistKnowsText} onChange={(event) => setDraft((previous) => ({ ...previous, protagonistKnowsText: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">反派已知</span><textarea value={draft.antagonistKnowsText} onChange={(event) => setDraft((previous) => ({ ...previous, antagonistKnowsText: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">必须隐藏</span><textarea value={draft.mustHideText} onChange={(event) => setDraft((previous) => ({ ...previous, mustHideText: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2"><span className="text-sm font-medium text-neutral-200">允许暗示</span><textarea value={draft.canHintText} onChange={(event) => setDraft((previous) => ({ ...previous, canHintText: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
            <label className="space-y-2 md:col-span-2"><span className="text-sm font-medium text-neutral-200">禁止揭晓</span><textarea value={draft.forbiddenRevealText} onChange={(event) => setDraft((previous) => ({ ...previous, forbiddenRevealText: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" /></label>
          </div>
          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5"><p className="text-xs leading-6 text-neutral-500">正文上下文会优先消费章节级，其次卷级；里程碑级数据已可维护。</p><button type="button" onClick={() => void handleDelete()} disabled={isDeleting || editingId === 'new' || !editingId} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 text-sm text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50">{isDeleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}删除权限</button></footer>
        </section>
      </div>
    </article>
  );
}
