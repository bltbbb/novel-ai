import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { buildStructureMemorySaveFeedback } from '@/lib/structure-memory-sync';
import { useToast } from '@/components/Toast';
import { useAntagonistAgendaStore, useEditorStore, useForeshadowStore, useLoreStore, useThreadLedgerStore } from '@/stores';
import type { Id, ThreadLedger, ThreadLedgerStatus } from '@/types';

interface ThreadLedgerPanelProps {
  projectId: Id;
  className?: string;
}

interface ThreadLedgerDraftModel {
  name: string;
  type: string;
  coreQuestion: string;
  currentPhase: string;
  lastProgressAt: string;
  lastProgressChapterId: Id | null;
  nextTrigger: string;
  blockedBy: string;
  relatedCharacterNamesText: string;
  relatedForeshadowTitlesText: string;
  plannedResolveVolumeText: string;
  status: ThreadLedgerStatus;
  audienceHeat: number;
}

const DEFAULT_STALE_CHAPTER_GAP = 15;

function createEmptyDraft(): ThreadLedgerDraftModel {
  return {
    name: '',
    type: '支线',
    coreQuestion: '',
    currentPhase: '',
    lastProgressAt: '',
    lastProgressChapterId: null,
    nextTrigger: '',
    blockedBy: '',
    relatedCharacterNamesText: '',
    relatedForeshadowTitlesText: '',
    plannedResolveVolumeText: '',
    status: 'active',
    audienceHeat: 3,
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

function buildDraftFromThreadLedger(item: ThreadLedger): ThreadLedgerDraftModel {
  return {
    name: item.name,
    type: item.type,
    coreQuestion: item.coreQuestion,
    currentPhase: item.currentPhase,
    lastProgressAt: item.lastProgressAt,
    lastProgressChapterId: item.lastProgressChapterId,
    nextTrigger: item.nextTrigger,
    blockedBy: item.blockedBy,
    relatedCharacterNamesText: joinDelimitedText(item.relatedCharacterNames),
    relatedForeshadowTitlesText: joinDelimitedText(item.relatedForeshadowTitles),
    plannedResolveVolumeText:
      typeof item.plannedResolveVolume === 'number' && Number.isFinite(item.plannedResolveVolume)
        ? String(item.plannedResolveVolume)
        : '',
    status: item.status,
    audienceHeat: item.audienceHeat,
  };
}

function buildStatusLabel(status: ThreadLedgerStatus) {
  switch (status) {
    case 'resolved':
      return '已收束';
    case 'dormant':
      return '休眠';
    case 'active':
    default:
      return '活跃';
  }
}

function getStatusBadgeClassName(status: ThreadLedgerStatus, active: boolean) {
  if (status === 'resolved') {
    return active
      ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
      : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
  }

  if (status === 'dormant') {
    return active
      ? 'border-amber-400/50 bg-amber-500/20 text-amber-100'
      : 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  }

  return active
    ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100'
    : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-200';
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function normalizeNameKey(value: string) {
  return value.trim().toLowerCase();
}

interface AntagonistThreadFollowupAlert {
  threadLedgerId: Id;
  threadName: string;
  antagonistName: string;
  message: string;
}

function countMatchedTerms(text: string, terms: string[]) {
  const normalizedText = normalizeNameKey(text);

  if (!normalizedText) {
    return 0;
  }

  return terms.reduce((count, term) => {
    const normalizedTerm = normalizeNameKey(term);

    if (!normalizedTerm || normalizedTerm.length < 2) {
      return count;
    }

    return normalizedText.includes(normalizedTerm) ? count + 1 : count;
  }, 0);
}

export function ThreadLedgerPanel({ projectId, className }: ThreadLedgerPanelProps) {
  const { toast } = useToast();
  const chapters = useEditorStore((state) => state.chapters);
  const entities = useLoreStore((state) => state.entities);
  const foreshadows = useForeshadowStore((state) => state.foreshadows);
  const antagonistAgendas = useAntagonistAgendaStore((state) => state.antagonistAgendas);
  const threadLedgers = useThreadLedgerStore((state) => state.threadLedgers);
  const alerts = useThreadLedgerStore((state) => state.alerts);
  const syncStatusById = useThreadLedgerStore((state) => state.syncStatusById);
  const activeThreadLedgerId = useThreadLedgerStore((state) => state.activeThreadLedgerId);
  const loadThreadLedgers = useThreadLedgerStore((state) => state.loadThreadLedgers);
  const setActiveThreadLedger = useThreadLedgerStore((state) => state.setActiveThreadLedger);
  const createThreadLedger = useThreadLedgerStore((state) => state.createThreadLedger);
  const updateThreadLedger = useThreadLedgerStore((state) => state.updateThreadLedger);
  const deleteThreadLedger = useThreadLedgerStore((state) => state.deleteThreadLedger);
  const [editingId, setEditingId] = useState<Id | 'new' | null>(null);
  const [draft, setDraft] = useState<ThreadLedgerDraftModel>(createEmptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const sortedChapters = useMemo(
    () => [...chapters].sort((left, right) => right.order - left.order),
    [chapters],
  );
  const chapterMap = useMemo(
    () => new Map(sortedChapters.map((chapter) => [chapter.id, chapter] as const)),
    [sortedChapters],
  );
  const currentChapterOrder = sortedChapters[0]?.order ?? null;
  const activeThreadLedger = useMemo(
    () => threadLedgers.find((item) => item.id === activeThreadLedgerId) ?? null,
    [activeThreadLedgerId, threadLedgers],
  );
  const unsyncedCount = useMemo(
    () => Object.values(syncStatusById).filter((status) => status && status !== 'synced').length,
    [syncStatusById],
  );
  const antagonistTriggerAlerts = useMemo<AntagonistThreadFollowupAlert[]>(() => {
    return threadLedgers
      .filter((item) => item.projectId === projectId && item.status !== 'resolved')
      .flatMap((thread) => {
        const matchingTerms = [
          thread.name,
          thread.coreQuestion,
          ...thread.relatedCharacterNames,
          ...thread.relatedForeshadowTitles,
        ].filter(Boolean);

        if (matchingTerms.length === 0) {
          return [] as AntagonistThreadFollowupAlert[];
        }

        return antagonistAgendas
          .filter((agenda) => agenda.projectId === projectId && agenda.status === 'active')
          .map((agenda) => {
            const agendaSignalText = [
              agenda.currentObjective,
              agenda.currentAction,
              agenda.triggerToStrike,
              agenda.ifProtagonistDoesNothing,
            ]
              .filter(Boolean)
              .join('\n');
            const hitCount = countMatchedTerms(agendaSignalText, matchingTerms);

            if (hitCount <= 0) {
              return null;
            }

            const staleGap =
              currentChapterOrder && thread.lastProgressChapterOrder && currentChapterOrder > thread.lastProgressChapterOrder
                ? currentChapterOrder - thread.lastProgressChapterOrder
                : 0;
            const suggestedAction =
              thread.status === 'dormant'
                ? '建议把这条线从休眠拉回活跃'
                : staleGap >= 3
                  ? `这条线距离上次推进已过去 ${staleGap} 章，建议尽快补一次推进`
                  : '建议在后续章节里确认是否要追加推进节点';

            return {
              threadLedgerId: thread.id,
              threadName: thread.name,
              antagonistName: agenda.characterName || '未命名反派',
              message: `反派「${agenda.characterName || '未命名反派'}」的出手条件或当前动作已经明显压到这条线。${suggestedAction}。`,
            };
          })
          .filter((item): item is AntagonistThreadFollowupAlert => Boolean(item));
      })
      .sort((left, right) => left.threadName.localeCompare(right.threadName, 'zh-CN'))
      .slice(0, 4);
  }, [antagonistAgendas, currentChapterOrder, projectId, threadLedgers]);
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
  const foreshadowTitleMap = useMemo(() => {
    const map = new Map<string, { id: Id; title: string }>();

    for (const foreshadow of foreshadows) {
      if (foreshadow.projectId !== projectId) {
        continue;
      }

      map.set(normalizeNameKey(foreshadow.title), {
        id: foreshadow.id,
        title: foreshadow.title,
      });
    }

    return map;
  }, [foreshadows, projectId]);

  useEffect(() => {
    setEditingId(null);
    setDraft(createEmptyDraft());
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void loadThreadLedgers(projectId, {
      currentChapterOrder,
      staleChapterGap: DEFAULT_STALE_CHAPTER_GAP,
    })
      .catch(() => {
        if (!cancelled) {
          toast('加载剧情线账本失败', 'error');
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
  }, [currentChapterOrder, loadThreadLedgers, projectId, toast]);

  useEffect(() => {
    if (editingId === 'new') {
      return;
    }

    if (activeThreadLedger) {
      setEditingId(activeThreadLedger.id);
      setDraft(buildDraftFromThreadLedger(activeThreadLedger));
      return;
    }

    if (threadLedgers.length === 0) {
      setEditingId('new');
      setDraft(createEmptyDraft());
    }
  }, [activeThreadLedger, editingId, threadLedgers.length]);

  function handleCreateNew() {
    setActiveThreadLedger(null);
    setEditingId('new');
    setDraft(createEmptyDraft());
  }

  function handleSelectThreadLedger(threadLedgerId: Id) {
    setActiveThreadLedger(threadLedgerId);
    setEditingId(threadLedgerId);
  }

  function handleChapterChange(chapterId: string) {
    if (!chapterId) {
      setDraft((previous) => ({
        ...previous,
        lastProgressChapterId: null,
      }));
      return;
    }

    const matchedChapter = chapterMap.get(chapterId) ?? null;

    setDraft((previous) => ({
      ...previous,
      lastProgressChapterId: matchedChapter?.id ?? null,
      lastProgressAt:
        (previous.lastProgressAt.trim() || !matchedChapter)
          ? previous.lastProgressAt
          : `第${matchedChapter.order}章 ${matchedChapter.title}`,
    }));
  }

  async function handleSave() {
    const relatedCharacterNames = normalizeDelimitedText(draft.relatedCharacterNamesText);
    const relatedForeshadowTitles = normalizeDelimitedText(draft.relatedForeshadowTitlesText);
    const matchedCharacters = relatedCharacterNames
      .map((name) => characterNameMap.get(normalizeNameKey(name)) ?? null)
      .filter((item): item is { id: Id; name: string } => Boolean(item));
    const matchedForeshadows = relatedForeshadowTitles
      .map((title) => foreshadowTitleMap.get(normalizeNameKey(title)) ?? null)
      .filter((item): item is { id: Id; title: string } => Boolean(item));
    const lastProgressChapter =
      draft.lastProgressChapterId ? chapterMap.get(draft.lastProgressChapterId) ?? null : null;
    const payload = {
      projectId,
      name: draft.name,
      type: draft.type,
      coreQuestion: draft.coreQuestion,
      currentPhase: draft.currentPhase,
      lastProgressAt: draft.lastProgressAt,
      lastProgressChapterId: lastProgressChapter?.id ?? null,
      lastProgressChapterTitle: lastProgressChapter?.title ?? '',
      lastProgressChapterOrder: lastProgressChapter?.order ?? null,
      nextTrigger: draft.nextTrigger,
      blockedBy: draft.blockedBy,
      relatedCharacterIds: matchedCharacters.map((item) => item.id),
      relatedCharacterNames:
        relatedCharacterNames.length > 0 ? relatedCharacterNames : matchedCharacters.map((item) => item.name),
      relatedForeshadowIds: matchedForeshadows.map((item) => item.id),
      relatedForeshadowTitles:
        relatedForeshadowTitles.length > 0 ? relatedForeshadowTitles : matchedForeshadows.map((item) => item.title),
      plannedResolveVolume: parsePositiveInteger(draft.plannedResolveVolumeText),
      status: draft.status,
      audienceHeat: draft.audienceHeat,
    };

    if (!payload.name.trim()) {
      toast('请先填写剧情线名称', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      if (editingId === 'new' || !editingId) {
        const item = await createThreadLedger(payload, {
          currentChapterOrder,
          staleChapterGap: DEFAULT_STALE_CHAPTER_GAP,
        });
        setEditingId(item.id);
        setActiveThreadLedger(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useThreadLedgerStore.getState().syncStatusById[item.id],
          localOnly: useThreadLedgerStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '剧情线已创建',
          entityLabel: '剧情线',
        });
        toast(feedback.message, feedback.tone);
      } else {
        const item = await updateThreadLedger(editingId, payload, {
          currentChapterOrder,
          staleChapterGap: DEFAULT_STALE_CHAPTER_GAP,
        });
        setEditingId(item.id);
        setActiveThreadLedger(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useThreadLedgerStore.getState().syncStatusById[item.id],
          localOnly: useThreadLedgerStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '剧情线已保存',
          entityLabel: '剧情线',
        });
        toast(feedback.message, feedback.tone);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存剧情线失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId || editingId === 'new') {
      setDraft(createEmptyDraft());
      return;
    }

    const confirmed = window.confirm('确认删除这条剧情线吗？');

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteThreadLedger(projectId, editingId, {
        currentChapterOrder,
        staleChapterGap: DEFAULT_STALE_CHAPTER_GAP,
      });
      setEditingId(null);
      toast('剧情线已删除', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除剧情线失败', 'error');
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
          <p className="text-xs uppercase tracking-[0.24em] text-indigo-300">剧情线账本</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">把长线推进从“记得住”变成“查得到”</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            这里维护的是剧情线规划层，不替代现有自动记录。先把主线、支线、暗线和情感线明确下来，生成时才知道该捡哪一条。
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
            新建剧情线
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            保存账本
          </button>
        </div>
      </header>

      {alerts.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {alerts.map((alert) => (
            <div
              key={alert.threadLedgerId}
              className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-50"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="mt-1 flex-shrink-0 text-amber-300" />
                <div>
                  <p className="font-medium">{alert.name}</p>
                  <p className="mt-1 leading-6 text-amber-100">{alert.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {antagonistTriggerAlerts.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {antagonistTriggerAlerts.map((alert) => (
            <div
              key={`${alert.threadLedgerId}-${alert.antagonistName}`}
              className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-50"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="mt-1 flex-shrink-0 text-rose-300" />
                <div>
                  <p className="font-medium">{alert.threadName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-rose-300">反派触发提醒 · {alert.antagonistName}</p>
                  <p className="mt-1 leading-6 text-rose-100">{alert.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-200">当前剧情线</p>
            {isLoading ? (
              <span className="inline-flex items-center gap-2 text-xs text-neutral-500">
                <LoaderCircle size={13} className="animate-spin" />
                正在刷新
              </span>
            ) : null}
          </div>

          {threadLedgers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 px-4 py-5 text-sm leading-6 text-neutral-500">
              还没有剧情线。先建 1 到 3 条真正决定中后期承接的主线或支线。
            </div>
          ) : (
            threadLedgers.map((item) => {
              const active = editingId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectThreadLedger(item.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    active
                      ? 'border-indigo-400/50 bg-indigo-500/10'
                      : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-600 hover:bg-neutral-900'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-neutral-100">{item.name}</span>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] ${getStatusBadgeClassName(item.status, active)}`}
                    >
                      {buildStatusLabel(item.status)}
                    </span>
                    <span className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400">
                      热度 {item.audienceHeat}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">{item.type || '未分类'}</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-300">
                    {item.coreQuestion || item.currentPhase || '暂无核心问题说明'}
                  </p>
                </button>
              );
            })
          )}
        </aside>

        <section className="rounded-[24px] border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">线名</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="例如：翻案线 / 量天司线 / 情感线"
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">类型</span>
              <input
                value={draft.type}
                onChange={(event) => setDraft((previous) => ({ ...previous, type: event.target.value }))}
                placeholder="主线 / 支线 / 暗线 / 情感线 / 成长线"
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">状态</span>
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    status: event.target.value as ThreadLedgerStatus,
                  }))
                }
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
              >
                <option value="active">活跃</option>
                <option value="dormant">休眠</option>
                <option value="resolved">已收束</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">读者期待度</span>
              <select
                value={String(draft.audienceHeat)}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    audienceHeat: Math.max(1, Math.min(5, Math.trunc(Number(event.target.value) || 3))),
                  }))
                }
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">核心问题</span>
              <textarea
                value={draft.coreQuestion}
                onChange={(event) => setDraft((previous) => ({ ...previous, coreQuestion: event.target.value }))}
                placeholder="这条线真正吊着读者和系统的问题是什么？"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">当前阶段</span>
              <textarea
                value={draft.currentPhase}
                onChange={(event) => setDraft((previous) => ({ ...previous, currentPhase: event.target.value }))}
                placeholder="例如：已知道其存在，但尚未正面接触"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">最近推进章节</span>
              <select
                value={draft.lastProgressChapterId ?? ''}
                onChange={(event) => handleChapterChange(event.target.value)}
                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
              >
                <option value="">未关联章节</option>
                {sortedChapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    第{chapter.order}章 {chapter.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">预计收束卷</span>
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
              <span className="text-sm font-medium text-neutral-200">最近推进点</span>
              <textarea
                value={draft.lastProgressAt}
                onChange={(event) => setDraft((previous) => ({ ...previous, lastProgressAt: event.target.value }))}
                placeholder="例如：第47章许明拿到附则第七条原文"
                rows={2}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">下一触发点</span>
              <textarea
                value={draft.nextTrigger}
                onChange={(event) => setDraft((previous) => ({ ...previous, nextTrigger: event.target.value }))}
                placeholder="什么情况下一定要把这条线捡起来？"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">当前卡点</span>
              <textarea
                value={draft.blockedBy}
                onChange={(event) => setDraft((previous) => ({ ...previous, blockedBy: event.target.value }))}
                placeholder="系统或角色当前为什么还不能推进？"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">关联人物</span>
              <textarea
                value={draft.relatedCharacterNamesText}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    relatedCharacterNamesText: event.target.value,
                  }))
                }
                placeholder="多个名字用逗号或换行分隔；保存时会按已有角色名尝试回填 Id"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">关联伏笔</span>
              <textarea
                value={draft.relatedForeshadowTitlesText}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    relatedForeshadowTitlesText: event.target.value,
                  }))
                }
                placeholder="多个标题用逗号或换行分隔；保存时会按现有伏笔标题尝试回填 Id"
                rows={3}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
            </label>
          </div>

          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5">
            <p className="text-xs leading-6 text-neutral-500">
              当前为服务端权威态保存。第一版先保证剧情线能被生成链路消费，后续再补完整结构记忆工作台。
            </p>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={isDeleting || editingId === 'new' || !editingId}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 text-sm text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
              删除剧情线
            </button>
          </footer>
        </section>
      </div>
    </article>
  );
}
