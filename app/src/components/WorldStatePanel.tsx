import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { buildStructureMemorySaveFeedback } from '@/lib/structure-memory-sync';
import { useToast } from '@/components/Toast';
import { useEditorStore, useForeshadowStore, useLoreStore, useOutlineStore, useVolumeStore, useWorldStateStore } from '@/stores';
import type { Id, VolumeOutline, WorldStateEntry } from '@/types';

interface WorldStatePanelProps {
  projectId: Id;
  className?: string;
}

interface WorldStateDraftModel {
  volumeId: Id | '';
  milestoneIndex: number | null;
  publicEventsText: string;
  secretEventsText: string;
  powerBalanceChange: string;
  institutionChange: string;
  ruleChange: string;
  rumorState: string;
  knownByCharacterNamesText: string;
  currentRisksText: string;
}

function createEmptyDraft(): WorldStateDraftModel {
  return {
    volumeId: '',
    milestoneIndex: null,
    publicEventsText: '',
    secretEventsText: '',
    powerBalanceChange: '',
    institutionChange: '',
    ruleChange: '',
    rumorState: '',
    knownByCharacterNamesText: '',
    currentRisksText: '',
  };
}

function normalizeDelimitedText(value: string) {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinDelimitedText(values: string[]) {
  return values.join('，');
}

function normalizeNameKey(value: string) {
  return value.trim().toLowerCase();
}

interface WorldStateFollowupAlert {
  foreshadowId: Id;
  foreshadowTitle: string;
  volumeId: Id;
  volumeOrder: number;
  volumeLabel: string;
  message: string;
}

function containsAnyKeyword(text: string, keywords: string[]) {
  const normalizedText = normalizeNameKey(text);
  return keywords.some((keyword) => normalizedText.includes(normalizeNameKey(keyword)));
}

function resolveWorldStateNeedCategories(text: string) {
  const categories = new Set<'public' | 'institution' | 'rule' | 'power' | 'risk'>();

  if (containsAnyKeyword(text, ['公开', '曝光', '传开', '昭告', '通告', '传言', '流言', '揭露'])) {
    categories.add('public');
  }

  if (containsAnyKeyword(text, ['衙门', '官署', '司', '院', '诏令', '撤职', '任命', '朝廷', '制度', '规制', '门规'])) {
    categories.add('institution');
  }

  if (containsAnyKeyword(text, ['规则', '法则', '律令', '禁令', '附则', '条款', '法理', '审判'])) {
    categories.add('rule');
  }

  if (containsAnyKeyword(text, ['势力', '宗门', '派系', '兵权', '权柄', '镇守', '家族', '格局'])) {
    categories.add('power');
  }

  if (containsAnyKeyword(text, ['风险', '后患', '反噬', '追查', '追缉', '通缉', '隐患', '代价'])) {
    categories.add('risk');
  }

  return categories;
}

function buildDraftFromWorldStateEntry(item: WorldStateEntry): WorldStateDraftModel {
  return {
    volumeId: item.volumeId,
    milestoneIndex: item.milestoneIndex,
    publicEventsText: joinDelimitedText(item.publicEvents),
    secretEventsText: joinDelimitedText(item.secretEvents),
    powerBalanceChange: item.powerBalanceChange,
    institutionChange: item.institutionChange,
    ruleChange: item.ruleChange,
    rumorState: item.rumorState,
    knownByCharacterNamesText: joinDelimitedText(item.knownByCharacterNames),
    currentRisksText: joinDelimitedText(item.currentRisks),
  };
}

function buildScopeLabel(entry: WorldStateEntry) {
  if (typeof entry.milestoneIndex === 'number' && entry.milestoneIndex >= 0) {
    return `${entry.volumeTitle} · 阶段 ${entry.milestoneIndex + 1}`;
  }

  return `${entry.volumeTitle} · 卷级`;
}

export function WorldStatePanel({ projectId, className }: WorldStatePanelProps) {
  const { toast } = useToast();
  const chapters = useEditorStore((state) => state.chapters);
  const foreshadows = useForeshadowStore((state) => state.foreshadows);
  const volumes = useVolumeStore((state) => state.volumes);
  const volumeOutlines = useOutlineStore((state) => state.volumeOutlines);
  const entities = useLoreStore((state) => state.entities);
  const worldStateEntries = useWorldStateStore((state) => state.worldStateEntries);
  const syncStatusById = useWorldStateStore((state) => state.syncStatusById);
  const activeWorldStateEntryId = useWorldStateStore((state) => state.activeWorldStateEntryId);
  const loadWorldStateEntries = useWorldStateStore((state) => state.loadWorldStateEntries);
  const setActiveWorldStateEntry = useWorldStateStore((state) => state.setActiveWorldStateEntry);
  const createWorldStateEntry = useWorldStateStore((state) => state.createWorldStateEntry);
  const updateWorldStateEntry = useWorldStateStore((state) => state.updateWorldStateEntry);
  const deleteWorldStateEntry = useWorldStateStore((state) => state.deleteWorldStateEntry);
  const [editingId, setEditingId] = useState<Id | 'new' | null>(null);
  const [draft, setDraft] = useState<WorldStateDraftModel>(createEmptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const projectVolumes = useMemo(
    () => [...volumes].filter((item) => item.projectId === projectId).sort((left, right) => left.order - right.order),
    [projectId, volumes],
  );
  const projectChapters = useMemo(
    () => [...chapters].filter((item) => item.projectId === projectId),
    [chapters, projectId],
  );
  const chapterMap = useMemo(
    () => new Map(projectChapters.map((item) => [item.id, item] as const)),
    [projectChapters],
  );
  const volumeOutlineMap = useMemo(
    () =>
      new Map(
        volumeOutlines
          .filter((item) => item.projectId === projectId)
          .map((item) => [item.volumeId, item] as const),
      ),
    [projectId, volumeOutlines],
  );
  const characterNameMap = useMemo(() => {
    const map = new Map<string, { id: Id; name: string }>();

    for (const entity of entities) {
      if (entity.projectId !== projectId || entity.type !== 'character' || entity.draft) {
        continue;
      }

      map.set(normalizeNameKey(entity.name), {
        id: entity.id,
        name: entity.name,
      });
    }

    return map;
  }, [entities, projectId]);
  const activeWorldStateEntry = useMemo(
    () => worldStateEntries.find((item) => item.id === activeWorldStateEntryId) ?? null,
    [activeWorldStateEntryId, worldStateEntries],
  );
  const unsyncedCount = useMemo(
    () => Object.values(syncStatusById).filter((status) => status && status !== 'synced').length,
    [syncStatusById],
  );
  const followupAlerts = useMemo<WorldStateFollowupAlert[]>(() => {
    const entriesByVolumeId = new Map<Id, WorldStateEntry[]>();

    for (const entry of worldStateEntries) {
      const existing = entriesByVolumeId.get(entry.volumeId) ?? [];
      existing.push(entry);
      entriesByVolumeId.set(entry.volumeId, existing);
    }

    return foreshadows
      .filter((item) => item.projectId === projectId && item.status === 'resolved' && item.resolvedChapterId)
      .map((foreshadow) => {
        const resolvedChapter = foreshadow.resolvedChapterId ? chapterMap.get(foreshadow.resolvedChapterId) ?? null : null;

        if (!resolvedChapter?.volumeId) {
          return null;
        }

        const volume = projectVolumes.find((item) => item.id === resolvedChapter.volumeId) ?? null;

        if (!volume) {
          return null;
        }

        const volumeEntries = entriesByVolumeId.get(volume.id) ?? [];
        const impactText = [foreshadow.title, foreshadow.excerpt, foreshadow.notes].filter(Boolean).join('\n');
        const categories = resolveWorldStateNeedCategories(impactText);
        const hasPublicCoverage = volumeEntries.some((entry) => entry.publicEvents.length > 0 || entry.rumorState.trim());
        const hasInstitutionCoverage = volumeEntries.some(
          (entry) => Boolean(entry.institutionChange.trim()) || entry.publicEvents.length > 0 || entry.secretEvents.length > 0,
        );
        const hasRuleCoverage = volumeEntries.some(
          (entry) => Boolean(entry.ruleChange.trim()) || Boolean(entry.institutionChange.trim()),
        );
        const hasPowerCoverage = volumeEntries.some(
          (entry) => Boolean(entry.powerBalanceChange.trim()) || entry.publicEvents.length > 0,
        );
        const hasRiskCoverage = volumeEntries.some(
          (entry) => entry.currentRisks.length > 0 || Boolean(entry.rumorState.trim()),
        );

        if (categories.size === 0) {
          return null;
        }

        const missingCategories: string[] = [];

        if (categories.has('public') && !hasPublicCoverage) {
          missingCategories.push('公开影响');
        }

        if (categories.has('institution') && !hasInstitutionCoverage) {
          missingCategories.push('制度变化');
        }

        if (categories.has('rule') && !hasRuleCoverage) {
          missingCategories.push('规则变化');
        }

        if (categories.has('power') && !hasPowerCoverage) {
          missingCategories.push('势力格局');
        }

        if (categories.has('risk') && !hasRiskCoverage) {
          missingCategories.push('后续风险');
        }

        if (volumeEntries.length === 0) {
          return {
            foreshadowId: foreshadow.id,
            foreshadowTitle: foreshadow.title,
            volumeId: volume.id,
            volumeOrder: volume.order,
            volumeLabel: `第${volume.order}卷《${volume.title}》`,
            message: `这条伏笔已在 ${resolvedChapter.title || '对应章节'} 回收，但本卷还没有世界状态记录，建议至少补一条卷级 delta。`,
          };
        }

        if (missingCategories.length === 0) {
          return null;
        }

        return {
          foreshadowId: foreshadow.id,
          foreshadowTitle: foreshadow.title,
          volumeId: volume.id,
          volumeOrder: volume.order,
          volumeLabel: `第${volume.order}卷《${volume.title}》`,
          message: `这条伏笔已回收，但同卷世界状态里还不明显体现：${missingCategories.join('、')}。建议补到 public / institution / rule / risks 等字段。`,
        };
      })
      .filter((item): item is WorldStateFollowupAlert => Boolean(item))
      .sort((left, right) => right.volumeOrder - left.volumeOrder)
      .slice(0, 4);
  }, [chapterMap, foreshadows, projectId, projectVolumes, worldStateEntries]);
  const selectedVolumeOutline = useMemo<VolumeOutline | null>(
    () => (draft.volumeId ? volumeOutlineMap.get(draft.volumeId) ?? null : null),
    [draft.volumeId, volumeOutlineMap],
  );

  useEffect(() => {
    setEditingId(null);
    setDraft(createEmptyDraft());
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void loadWorldStateEntries(projectId)
      .catch(() => {
        if (!cancelled) {
          toast('加载世界状态失败', 'error');
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
  }, [loadWorldStateEntries, projectId, toast]);

  useEffect(() => {
    if (editingId === 'new') {
      return;
    }

    if (activeWorldStateEntry) {
      setEditingId(activeWorldStateEntry.id);
      setDraft(buildDraftFromWorldStateEntry(activeWorldStateEntry));
      return;
    }

    if (worldStateEntries.length === 0) {
      setEditingId('new');
      setDraft(createEmptyDraft());
    }
  }, [activeWorldStateEntry, editingId, worldStateEntries.length]);

  function handleCreateNew() {
    setActiveWorldStateEntry(null);
    setEditingId('new');
    setDraft(createEmptyDraft());
  }

  function handleSelectWorldStateEntry(worldStateEntryId: Id) {
    setActiveWorldStateEntry(worldStateEntryId);
    setEditingId(worldStateEntryId);
  }

  async function handleSave() {
    const selectedVolume = projectVolumes.find((item) => item.id === draft.volumeId) ?? null;

    if (!selectedVolume) {
      toast('请先选择卷', 'warning');
      return;
    }

    const knownByCharacterNames = normalizeDelimitedText(draft.knownByCharacterNamesText);
    const matchedCharacters = knownByCharacterNames
      .map((name) => characterNameMap.get(normalizeNameKey(name)) ?? null)
      .filter((item): item is { id: Id; name: string } => Boolean(item));
    const sameScopeEntry =
      worldStateEntries.find(
        (item) =>
          item.volumeId === selectedVolume.id &&
          (item.milestoneIndex ?? null) === (draft.milestoneIndex ?? null),
      ) ?? null;
    const payload = {
      projectId,
      volumeId: selectedVolume.id,
      volumeTitle: selectedVolume.title,
      volumeOrder: selectedVolume.order,
      milestoneIndex: draft.milestoneIndex,
      publicEvents: normalizeDelimitedText(draft.publicEventsText),
      secretEvents: normalizeDelimitedText(draft.secretEventsText),
      powerBalanceChange: draft.powerBalanceChange,
      institutionChange: draft.institutionChange,
      ruleChange: draft.ruleChange,
      rumorState: draft.rumorState,
      knownByCharacterIds: matchedCharacters.map((item) => item.id),
      knownByCharacterNames:
        knownByCharacterNames.length > 0 ? knownByCharacterNames : matchedCharacters.map((item) => item.name),
      currentRisks: normalizeDelimitedText(draft.currentRisksText),
    };

    setIsSaving(true);

    try {
      if (editingId === 'new' || !editingId) {
        if (sameScopeEntry) {
          const item = await updateWorldStateEntry(sameScopeEntry.id, payload);
          setEditingId(item.id);
          setActiveWorldStateEntry(item.id);
          const feedback = buildStructureMemorySaveFeedback({
            syncStatus: useWorldStateStore.getState().syncStatusById[item.id],
            localOnly: useWorldStateStore.getState().localOnlyById[item.id] === true,
            syncedMessage: '该范围已有世界状态记录，已更新现有记录',
            entityLabel: '世界状态',
          });
          toast(feedback.message, feedback.tone);
        } else {
          const item = await createWorldStateEntry(payload);
          setEditingId(item.id);
          setActiveWorldStateEntry(item.id);
          const feedback = buildStructureMemorySaveFeedback({
            syncStatus: useWorldStateStore.getState().syncStatusById[item.id],
            localOnly: useWorldStateStore.getState().localOnlyById[item.id] === true,
            syncedMessage: '世界状态已创建',
            entityLabel: '世界状态',
          });
          toast(feedback.message, feedback.tone);
        }
      } else {
        if (sameScopeEntry && sameScopeEntry.id !== editingId) {
          toast('目标卷级/阶段范围已存在一条记录，请先切换到那条记录再编辑', 'warning');
          setIsSaving(false);
          return;
        }

        const item = await updateWorldStateEntry(editingId, payload);
        setEditingId(item.id);
        setActiveWorldStateEntry(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useWorldStateStore.getState().syncStatusById[item.id],
          localOnly: useWorldStateStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '世界状态已保存',
          entityLabel: '世界状态',
        });
        toast(feedback.message, feedback.tone);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存世界状态失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId || editingId === 'new') {
      setDraft(createEmptyDraft());
      return;
    }

    const confirmed = window.confirm('确认删除这条世界状态记录吗？');

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteWorldStateEntry(projectId, editingId);
      setEditingId(null);
      toast('世界状态已删除', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除世界状态失败', 'error');
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
          <p className="text-xs uppercase tracking-[0.24em] text-indigo-300">世界状态表</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">让世界真的随着卷与阶段继续变化</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            这里记录的是世界状态 delta。第一版先支持卷级和里程碑级编辑，正文上下文只消费当前卷与前一卷的变化。
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
            新建状态
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            保存状态
          </button>
        </div>
      </header>

      {followupAlerts.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {followupAlerts.map((alert) => (
            <div key={alert.foreshadowId} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-50">
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="mt-1 flex-shrink-0 text-amber-300" />
                <div>
                  <p className="font-medium">{alert.foreshadowTitle}</p>
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
            <p className="text-sm font-medium text-neutral-200">当前状态记录</p>
            {isLoading ? (
              <span className="inline-flex items-center gap-2 text-xs text-neutral-500">
                <LoaderCircle size={13} className="animate-spin" />
                正在刷新
              </span>
            ) : null}
          </div>

          {worldStateEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 px-4 py-5 text-sm leading-6 text-neutral-500">
              还没有世界状态记录。先从当前卷的卷级变化开始填。
            </div>
          ) : (
            worldStateEntries.map((item) => {
              const active = editingId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectWorldStateEntry(item.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    active
                      ? 'border-indigo-400/50 bg-indigo-500/10'
                      : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-600 hover:bg-neutral-900'
                  }`}
                >
                  <span className="text-sm font-medium text-neutral-100">{buildScopeLabel(item)}</span>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">
                    {item.publicEvents.length > 0 ? `公开事件 ${item.publicEvents.length} 条` : '暂无公开事件'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-neutral-300">
                    {item.powerBalanceChange || item.institutionChange || item.ruleChange || '暂无制度或势力变化说明'}
                  </p>
                </button>
              );
            })
          )}
        </aside>

        <section className="rounded-[24px] border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">卷</span>
              <select
                value={draft.volumeId}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    volumeId: event.target.value as Id,
                    milestoneIndex: null,
                  }))
                }
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
              >
                <option value="">请选择卷</option>
                {projectVolumes.map((volume) => (
                  <option key={volume.id} value={volume.id}>
                    第{volume.order}卷《{volume.title}》
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">范围</span>
              <select
                value={draft.milestoneIndex === null ? 'volume' : `milestone-${draft.milestoneIndex}`}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    milestoneIndex:
                      event.target.value === 'volume'
                        ? null
                        : Math.max(0, Number(event.target.value.replace('milestone-', '')) || 0),
                  }))
                }
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
              >
                <option value="volume">卷级默认状态</option>
                {(selectedVolumeOutline?.milestones ?? []).map((milestone, index) => (
                  <option key={`milestone-scope-${selectedVolumeOutline?.volumeId}-${index}`} value={`milestone-${index}`}>
                    阶段 {index + 1}{milestone.title.trim() ? ` · ${milestone.title.trim()}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">公开事件</span>
              <textarea
                value={draft.publicEventsText}
                onChange={(event) => setDraft((previous) => ({ ...previous, publicEventsText: event.target.value }))}
                placeholder="多个事件用逗号或换行分隔"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">秘密事件</span>
              <textarea
                value={draft.secretEventsText}
                onChange={(event) => setDraft((previous) => ({ ...previous, secretEventsText: event.target.value }))}
                placeholder="多个事件用逗号或换行分隔"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">势力变化</span>
              <textarea
                value={draft.powerBalanceChange}
                onChange={(event) => setDraft((previous) => ({ ...previous, powerBalanceChange: event.target.value }))}
                placeholder="例如：柳镇守使被明升暗降"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">制度变化</span>
              <textarea
                value={draft.institutionChange}
                onChange={(event) => setDraft((previous) => ({ ...previous, institutionChange: event.target.value }))}
                placeholder="例如：积案清查组被撤销"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">规则变化</span>
              <textarea
                value={draft.ruleChange}
                onChange={(event) => setDraft((previous) => ({ ...previous, ruleChange: event.target.value }))}
                placeholder="例如：附则第七条仍为删改版"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">舆论状态</span>
              <textarea
                value={draft.rumorState}
                onChange={(event) => setDraft((previous) => ({ ...previous, rumorState: event.target.value }))}
                placeholder="例如：仙都传言许明一战成名"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">关键信息掌握者</span>
              <textarea
                value={draft.knownByCharacterNamesText}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    knownByCharacterNamesText: event.target.value,
                  }))
                }
                placeholder="多个角色名用逗号或换行分隔"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">当前风险</span>
              <textarea
                value={draft.currentRisksText}
                onChange={(event) => setDraft((previous) => ({ ...previous, currentRisksText: event.target.value }))}
                placeholder="多个风险用逗号或换行分隔"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>
          </div>

          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5">
            <p className="text-xs leading-6 text-neutral-500">
              第一版会保存卷级和里程碑级 delta。正文上下文当前默认消费“当前卷 + 前一卷”，里程碑覆盖位已预留。
            </p>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={isDeleting || editingId === 'new' || !editingId}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 text-sm text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
              删除状态
            </button>
          </footer>
        </section>
      </div>
    </article>
  );
}
