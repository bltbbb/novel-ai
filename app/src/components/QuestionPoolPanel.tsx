import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { buildStructureMemorySaveFeedback } from '@/lib/structure-memory-sync';
import { useToast } from '@/components/Toast';
import { useEditorStore, useQuestionPoolStore, useThreadLedgerStore, useVolumeStore } from '@/stores';
import type { Id, QuestionPool, QuestionPoolStatus } from '@/types';

interface QuestionPoolPanelProps {
  projectId: Id;
  className?: string;
}

interface QuestionPoolDraftModel {
  question: string;
  firstRaisedChapterId: Id | '';
  firstRaisedAt: string;
  belongsToThreadId: Id | '';
  currentClue: string;
  falseAnswersText: string;
  expectedRevealWindow: string;
  finalAnswerSummary: string;
  status: QuestionPoolStatus;
}

function createEmptyDraft(): QuestionPoolDraftModel {
  return {
    question: '',
    firstRaisedChapterId: '',
    firstRaisedAt: '',
    belongsToThreadId: '',
    currentClue: '',
    falseAnswersText: '',
    expectedRevealWindow: '',
    finalAnswerSummary: '',
    status: 'open',
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

function buildDraft(item: QuestionPool): QuestionPoolDraftModel {
  return {
    question: item.question,
    firstRaisedChapterId: item.firstRaisedChapterId ?? '',
    firstRaisedAt: item.firstRaisedAt,
    belongsToThreadId: item.belongsToThreadId ?? '',
    currentClue: item.currentClue,
    falseAnswersText: joinDelimitedText(item.falseAnswers),
    expectedRevealWindow: item.expectedRevealWindow,
    finalAnswerSummary: item.finalAnswerSummary,
    status: item.status,
  };
}

export function QuestionPoolPanel({ projectId, className }: QuestionPoolPanelProps) {
  const { toast } = useToast();
  const chapters = useEditorStore((state) => state.chapters);
  const volumes = useVolumeStore((state) => state.volumes);
  const threadLedgers = useThreadLedgerStore((state) => state.threadLedgers);
  const questionPools = useQuestionPoolStore((state) => state.questionPools);
  const alerts = useQuestionPoolStore((state) => state.alerts);
  const syncStatusById = useQuestionPoolStore((state) => state.syncStatusById);
  const activeQuestionPoolId = useQuestionPoolStore((state) => state.activeQuestionPoolId);
  const loadQuestionPools = useQuestionPoolStore((state) => state.loadQuestionPools);
  const setActiveQuestionPool = useQuestionPoolStore((state) => state.setActiveQuestionPool);
  const createQuestionPool = useQuestionPoolStore((state) => state.createQuestionPool);
  const updateQuestionPool = useQuestionPoolStore((state) => state.updateQuestionPool);
  const deleteQuestionPool = useQuestionPoolStore((state) => state.deleteQuestionPool);
  const [editingId, setEditingId] = useState<Id | 'new' | null>(null);
  const [draft, setDraft] = useState<QuestionPoolDraftModel>(createEmptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const projectChapters = useMemo(
    () => [...chapters].filter((item) => item.projectId === projectId).sort((left, right) => right.order - left.order),
    [chapters, projectId],
  );
  const projectThreads = useMemo(
    () => [...threadLedgers].filter((item) => item.projectId === projectId),
    [projectId, threadLedgers],
  );
  const projectVolumes = useMemo(
    () => [...volumes].filter((item) => item.projectId === projectId).sort((left, right) => left.order - right.order),
    [projectId, volumes],
  );
  const currentVolumeOrder = projectVolumes[projectVolumes.length - 1]?.order ?? null;
  const activeQuestionPool = useMemo(
    () => questionPools.find((item) => item.id === activeQuestionPoolId) ?? null,
    [activeQuestionPoolId, questionPools],
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

    void loadQuestionPools(projectId, {
      currentVolumeOrder,
    })
      .catch(() => {
        if (!cancelled) {
          toast('加载未解问题池失败', 'error');
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
  }, [currentVolumeOrder, loadQuestionPools, projectId, toast]);

  useEffect(() => {
    if (editingId === 'new') {
      return;
    }

    if (activeQuestionPool) {
      setEditingId(activeQuestionPool.id);
      setDraft(buildDraft(activeQuestionPool));
      return;
    }

    if (questionPools.length === 0) {
      setEditingId('new');
      setDraft(createEmptyDraft());
    }
  }, [activeQuestionPool, editingId, questionPools.length]);

  async function handleSave() {
    const chapter = projectChapters.find((item) => item.id === draft.firstRaisedChapterId) ?? null;
    const thread = projectThreads.find((item) => item.id === draft.belongsToThreadId) ?? null;
    const payload = {
      projectId,
      question: draft.question,
      firstRaisedChapterId: chapter?.id ?? null,
      firstRaisedAt: draft.firstRaisedAt,
      belongsToThreadId: thread?.id ?? null,
      belongsToThreadName: thread?.name ?? '',
      currentClue: draft.currentClue,
      falseAnswers: normalizeDelimitedText(draft.falseAnswersText),
      expectedRevealWindow: draft.expectedRevealWindow,
      finalAnswerSummary: draft.finalAnswerSummary,
      status: draft.status,
    };

    if (!payload.question.trim()) {
      toast('请先填写问题', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      if (editingId === 'new' || !editingId) {
        const item = await createQuestionPool(payload);
        setEditingId(item.id);
        setActiveQuestionPool(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useQuestionPoolStore.getState().syncStatusById[item.id],
          localOnly: useQuestionPoolStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '未解问题已创建',
          entityLabel: '未解问题',
        });
        toast(feedback.message, feedback.tone);
      } else {
        const item = await updateQuestionPool(editingId, payload);
        setEditingId(item.id);
        setActiveQuestionPool(item.id);
        const feedback = buildStructureMemorySaveFeedback({
          syncStatus: useQuestionPoolStore.getState().syncStatusById[item.id],
          localOnly: useQuestionPoolStore.getState().localOnlyById[item.id] === true,
          syncedMessage: '未解问题已保存',
          entityLabel: '未解问题',
        });
        toast(feedback.message, feedback.tone);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存未解问题失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId || editingId === 'new') {
      setDraft(createEmptyDraft());
      return;
    }

    const confirmed = window.confirm('确认删除这条未解问题吗？');

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteQuestionPool(projectId, editingId);
      setEditingId(null);
      toast('未解问题已删除', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除未解问题失败', 'error');
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
          <p className="text-xs uppercase tracking-[0.24em] text-indigo-300">未解问题池</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">把早期抛出的钩子留在系统里</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            这里维护的是悬念问题本身，不和伏笔规划重复。卷纲生成会优先参考本卷应推进的问题。
          </p>
          {unsyncedCount > 0 ? <p className="mt-2 text-xs leading-6 text-amber-300">当前有 {unsyncedCount} 条本地草稿或待同步记录，断网时会先保留在 Dexie 镜像里。</p> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveQuestionPool(null);
              setEditingId('new');
              setDraft(createEmptyDraft());
            }}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
          >
            <Plus size={15} />
            新建问题
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            保存问题
          </button>
        </div>
      </header>

      {alerts.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {alerts.map((alert) => (
            <div key={alert.questionPoolId} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-50">
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="mt-1 flex-shrink-0 text-amber-300" />
                <div>
                  <p className="font-medium">{alert.question}</p>
                  {alert.currentVolumeOrder ? (
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-amber-300">
                      当前卷：第 {alert.currentVolumeOrder} 卷{alert.overdueVolumeCount > 0 ? ` · 超窗 ${alert.overdueVolumeCount} 卷` : ' · 已到窗口'}
                    </p>
                  ) : null}
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
            <p className="text-sm font-medium text-neutral-200">当前问题</p>
            {isLoading ? (
              <span className="inline-flex items-center gap-2 text-xs text-neutral-500">
                <LoaderCircle size={13} className="animate-spin" />
                正在刷新
              </span>
            ) : null}
          </div>

          {questionPools.map((item) => {
            const active = editingId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveQuestionPool(item.id);
                  setEditingId(item.id);
                }}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  active
                    ? 'border-indigo-400/50 bg-indigo-500/10'
                    : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-600 hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-100">{item.question}</span>
                </div>
                <p className="mt-2 text-xs leading-6 text-neutral-500">{item.status}</p>
              </button>
            );
          })}
        </aside>

        <section className="rounded-[24px] border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">问题</span>
              <textarea value={draft.question} onChange={(event) => setDraft((previous) => ({ ...previous, question: event.target.value }))} rows={2} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">首次提出章节</span>
              <select value={draft.firstRaisedChapterId} onChange={(event) => setDraft((previous) => ({ ...previous, firstRaisedChapterId: event.target.value as Id }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400">
                <option value="">未关联章节</option>
                {projectChapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    第{chapter.order}章 {chapter.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">揭晓窗口</span>
              <input value={draft.expectedRevealWindow} onChange={(event) => setDraft((previous) => ({ ...previous, expectedRevealWindow: event.target.value }))} placeholder="例如：第2卷中段承天城" className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">归属剧情线</span>
              <select value={draft.belongsToThreadId} onChange={(event) => setDraft((previous) => ({ ...previous, belongsToThreadId: event.target.value as Id }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400">
                <option value="">未关联剧情线</option>
                {projectThreads.map((thread) => (
                  <option key={thread.id} value={thread.id}>{thread.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">状态</span>
              <select value={draft.status} onChange={(event) => setDraft((previous) => ({ ...previous, status: event.target.value as QuestionPoolStatus }))} className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-indigo-400">
                <option value="open">open</option>
                <option value="partial">partial</option>
                <option value="answered">answered</option>
              </select>
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">当前线索</span>
              <textarea value={draft.currentClue} onChange={(event) => setDraft((previous) => ({ ...previous, currentClue: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">假答案</span>
              <textarea value={draft.falseAnswersText} onChange={(event) => setDraft((previous) => ({ ...previous, falseAnswersText: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-neutral-200">作者预设答案</span>
              <textarea value={draft.finalAnswerSummary} onChange={(event) => setDraft((previous) => ({ ...previous, finalAnswerSummary: event.target.value }))} rows={3} className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400" />
            </label>
          </div>
          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5">
            <p className="text-xs leading-6 text-neutral-500">卷纲生成会优先参考揭晓窗口已命中的未解问题。</p>
            <button type="button" onClick={() => void handleDelete()} disabled={isDeleting || editingId === 'new' || !editingId} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 text-sm text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50">
              {isDeleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
              删除问题
            </button>
          </footer>
        </section>
      </div>
    </article>
  );
}
