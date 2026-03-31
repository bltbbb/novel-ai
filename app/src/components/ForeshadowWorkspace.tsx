import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightCircle,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Plus,
  Save,
  Target,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { useToast } from '@/components/Toast';
import { richTextToPlainText } from '@/lib/editor-content';
import { useEditorStore, useForeshadowStore } from '@/stores';
import type { ForeshadowStatus, Id } from '@/types';

interface ForeshadowWorkspaceProps {
  projectId: Id;
  onOpenEditor: () => void;
  onOpenChapter: (chapterId: Id) => void;
}

type StatusFilter = 'all' | ForeshadowStatus;

const statusOptions: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'planted', label: '已埋设' },
  { key: 'activated', label: '已激活' },
  { key: 'resolved', label: '已回收' },
  { key: 'overdue', label: '超期' },
];

const statusMeta: Record<
  ForeshadowStatus,
  {
    label: string;
    badgeClass: string;
    icon: typeof CircleDashed;
  }
> = {
  planted: {
    label: '已埋设',
    badgeClass: 'bg-sky-500/10 text-sky-300',
    icon: CircleDashed,
  },
  activated: {
    label: '已激活',
    badgeClass: 'bg-yellow-500/10 text-yellow-300',
    icon: Clock3,
  },
  resolved: {
    label: '已回收',
    badgeClass: 'bg-emerald-500/10 text-emerald-300',
    icon: CheckCircle2,
  },
  overdue: {
    label: '超期',
    badgeClass: 'bg-red-500/10 text-red-300',
    icon: AlertTriangle,
  },
};

function createExcerptPreview(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function resolveChapterLabel(chapterTitleMap: Map<Id, string>, chapterId: Id | null, emptyLabel: string) {
  if (!chapterId) {
    return emptyLabel;
  }

  return chapterTitleMap.get(chapterId) ?? '章节已删除';
}

export function ForeshadowWorkspace({ projectId, onOpenEditor, onOpenChapter }: ForeshadowWorkspaceProps) {
  const chapters = useEditorStore((state) => state.chapters);
  const activeChapterId = useEditorStore((state) => state.activeChapterId);
  const {
    foreshadows,
    activeForeshadowId,
    loadedProjectId,
    loadForeshadows,
    setActiveForeshadow,
    createForeshadow,
    updateForeshadow,
    deleteForeshadow,
  } = useForeshadowStore();
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftExcerpt, setDraftExcerpt] = useState('');
  const [draftNotes, setDraftNotes] = useState('');

  const chapterTitleMap = useMemo(() => {
    return new Map(chapters.map((chapter) => [chapter.id, chapter.title] as const));
  }, [chapters]);

  const filteredForeshadows = useMemo(() => {
    if (activeFilter === 'all') {
      return foreshadows;
    }

    return foreshadows.filter((item) => item.status === activeFilter);
  }, [activeFilter, foreshadows]);

  const currentForeshadow = useMemo(() => {
    return foreshadows.find((item) => item.id === activeForeshadowId) ?? null;
  }, [activeForeshadowId, foreshadows]);

  const plantedCount = useMemo(
    () => foreshadows.filter((item) => item.status === 'planted').length,
    [foreshadows],
  );
  const activatedCount = useMemo(
    () => foreshadows.filter((item) => item.status === 'activated').length,
    [foreshadows],
  );
  const overdueCount = useMemo(
    () => foreshadows.filter((item) => item.status === 'overdue').length,
    [foreshadows],
  );

  useEffect(() => {
    if (loadedProjectId === projectId) {
      return;
    }

    void loadForeshadows(projectId).catch(() => {
      toast('加载伏笔失败', 'error');
    });
  }, [loadForeshadows, loadedProjectId, projectId, toast]);

  useEffect(() => {
    if (filteredForeshadows.length === 0) {
      if (activeFilter !== 'all') {
        setActiveForeshadow(null);
      }
      return;
    }

    if (!currentForeshadow || !filteredForeshadows.some((item) => item.id === currentForeshadow.id)) {
      setActiveForeshadow(filteredForeshadows[0].id);
    }
  }, [activeFilter, currentForeshadow, filteredForeshadows, setActiveForeshadow]);

  useEffect(() => {
    if (!currentForeshadow) {
      setDraftTitle('');
      setDraftExcerpt('');
      setDraftNotes('');
      return;
    }

    setDraftTitle(currentForeshadow.title);
    setDraftExcerpt(currentForeshadow.excerpt);
    setDraftNotes(currentForeshadow.notes);
  }, [currentForeshadow?.id, currentForeshadow?.updatedAt]);

  async function persistDraft() {
    if (!currentForeshadow) {
      return;
    }

    const nextTitle = draftTitle.trim() || currentForeshadow.title;
    const nextExcerpt = draftExcerpt.trim();
    const nextNotes = draftNotes.trim();

    if (
      nextTitle === currentForeshadow.title &&
      nextExcerpt === currentForeshadow.excerpt &&
      nextNotes === currentForeshadow.notes
    ) {
      return;
    }

    await updateForeshadow(currentForeshadow.id, {
      title: nextTitle,
      excerpt: nextExcerpt,
      notes: nextNotes,
    });
  }

  async function handleCreateForeshadow() {
    const sourceChapter = chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0] ?? null;
    const excerpt = sourceChapter ? createExcerptPreview(richTextToPlainText(sourceChapter.content)) : '';
    const foreshadow = await createForeshadow({
      projectId,
      title: sourceChapter ? `${sourceChapter.title} 的新伏笔` : '新伏笔',
      excerpt,
      sourceChapterId: sourceChapter?.id ?? null,
    });

    setActiveFilter('all');
    setActiveForeshadow(foreshadow.id);
    toast(`已创建伏笔「${foreshadow.title}」`, 'success');
  }

  async function handleSelectForeshadow(foreshadowId: Id) {
    await persistDraft();
    setActiveForeshadow(foreshadowId);
  }

  async function handleStatusChange(nextStatus: ForeshadowStatus) {
    if (!currentForeshadow) {
      return;
    }

    await persistDraft();
    await updateForeshadow(currentForeshadow.id, {
      status: nextStatus,
      resolvedChapterId:
        nextStatus === 'resolved'
          ? currentForeshadow.resolvedChapterId ?? activeChapterId ?? currentForeshadow.sourceChapterId ?? null
          : null,
    });
  }

  async function handleSourceChapterChange(nextChapterId: string) {
    if (!currentForeshadow) {
      return;
    }

    await persistDraft();
    await updateForeshadow(currentForeshadow.id, {
      sourceChapterId: nextChapterId || null,
    });
  }

  async function handleResolvedChapterChange(nextChapterId: string) {
    if (!currentForeshadow) {
      return;
    }

    await persistDraft();
    await updateForeshadow(currentForeshadow.id, {
      resolvedChapterId: nextChapterId || null,
    });
  }

  async function handleDeleteCurrentForeshadow() {
    if (!currentForeshadow) {
      return;
    }

    const confirmed = window.confirm(`确认删除伏笔「${currentForeshadow.title}」吗？`);

    if (!confirmed) {
      return;
    }

    await deleteForeshadow(currentForeshadow.id);
    toast(`已删除伏笔「${currentForeshadow.title}」`, 'warning');
  }

  async function handleOpenLinkedChapter(chapterId: Id | null, fallbackMessage: string) {
    await persistDraft();

    if (!chapterId) {
      toast(fallbackMessage, 'warning');
      return;
    }

    if (!chapterTitleMap.has(chapterId)) {
      toast('关联章节已不存在', 'warning');
      return;
    }

    onOpenChapter(chapterId);
  }

  const sourceChapterLabel = currentForeshadow
    ? resolveChapterLabel(chapterTitleMap, currentForeshadow.sourceChapterId, '未关联章节')
    : '未关联章节';
  const resolvedChapterLabel = currentForeshadow
    ? resolveChapterLabel(chapterTitleMap, currentForeshadow.resolvedChapterId, '尚未回收')
    : '尚未回收';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/70 xl:flex-row">
      <aside className="flex w-full flex-shrink-0 flex-col border-b border-neutral-800 bg-neutral-950/70 xl:w-80 xl:border-b-0 xl:border-r">
        <div className="border-b border-neutral-800 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">伏笔追踪</p>
              <p className="mt-1 text-sm text-neutral-300">当前共 {foreshadows.length} 条伏笔</p>
            </div>
            <button
              type="button"
              onClick={() => void handleCreateForeshadow()}
              disabled={chapters.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={15} />
              新建
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-center">
              <p className="text-neutral-500">已埋设</p>
              <p className="mt-1 text-base font-medium text-sky-300">{plantedCount}</p>
            </div>
            <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-center">
              <p className="text-neutral-500">已激活</p>
              <p className="mt-1 text-base font-medium text-yellow-300">{activatedCount}</p>
            </div>
            <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-center">
              <p className="text-neutral-500">超期</p>
              <p className="mt-1 text-base font-medium text-red-300">{overdueCount}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveFilter(option.key)}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  activeFilter === option.key
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filteredForeshadows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-800 p-4 text-sm leading-6 text-neutral-500">
              {foreshadows.length === 0
                ? '还没有伏笔，先从当前章节创建第一条。'
                : '当前筛选条件下没有匹配的伏笔。'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredForeshadows.map((foreshadow) => {
                const meta = statusMeta[foreshadow.status];
                const StatusIcon = meta.icon;

                return (
                  <button
                    key={foreshadow.id}
                    type="button"
                    onClick={() => void handleSelectForeshadow(foreshadow.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                      foreshadow.id === currentForeshadow?.id
                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                        : 'border-neutral-800 bg-neutral-900/70 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{foreshadow.title}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${meta.badgeClass}`}>
                        <StatusIcon size={12} />
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">
                      {foreshadow.excerpt || '暂无摘录内容'}
                    </p>
                    <p className="mt-2 text-xs text-neutral-500">
                      来源：{resolveChapterLabel(chapterTitleMap, foreshadow.sourceChapterId, '未关联章节')}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!currentForeshadow ? (
          <div className="flex flex-1 p-8">
            <EmptyState
              icon={<Target size={22} />}
              title={
                foreshadows.length > 0
                  ? '当前筛选条件下没有匹配的伏笔'
                  : chapters.length === 0
                    ? '先准备章节，再记录伏笔'
                    : '从当前章节开始记录第一条伏笔'
              }
              description={
                foreshadows.length > 0
                  ? '可以切回“全部”查看已有伏笔，或者继续调整筛选条件。'
                  : chapters.length === 0
                  ? '当前项目还没有章节，建议先回到编辑器创建正文，再把关键悬念和线索收录到伏笔系统。'
                  : '从章节创建伏笔，在这里统一维护状态和备注。'
              }
              actions={
                <button
                  type="button"
                  onClick={
                    foreshadows.length > 0
                      ? () => setActiveFilter('all')
                      : chapters.length === 0
                        ? onOpenEditor
                        : () => void handleCreateForeshadow()
                  }
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  {foreshadows.length > 0 ? <Target size={16} /> : chapters.length === 0 ? <BookOpen size={16} /> : <Plus size={16} />}
                  {foreshadows.length > 0 ? '查看全部伏笔' : chapters.length === 0 ? '前往编辑器' : '创建第一条伏笔'}
                </button>
              }
              details={
                <OnboardingChecklist
                  title="推荐起步顺序"
                  items={
                    foreshadows.length > 0
                      ? [
                          '先切回“全部”确认已有伏笔的整体情况。',
                          '如果需要专门查看某一类状态，再重新应用筛选。',
                          '筛选只影响当前视图，不会修改伏笔本身的数据。',
                        ]
                      : chapters.length === 0
                      ? [
                          '先在编辑器里创建至少一个章节。',
                          '写下关键情节或悬念后，再回到伏笔页整理。',
                          '后续可以在这里持续跟踪激活、回收和超期状态。',
                        ]
                      : [
                          '先从当前活动章节创建一条伏笔。',
                          '补充摘录和备注，明确这条线索未来要如何回收。',
                          '在剧情推进过程中及时更新状态和回收章节。',
                        ]
                  }
                />
              }
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">当前伏笔</p>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-100">{currentForeshadow.title}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void persistDraft()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                >
                  <Save size={15} />
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteCurrentForeshadow()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 size={15} />
                  删除
                </button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
              <div className="space-y-4 rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-300">伏笔标题</label>
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onBlur={() => void persistDraft()}
                    placeholder="例如：黑铁片的真正来历"
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-300">来源摘录</label>
                  <textarea
                    value={draftExcerpt}
                    onChange={(event) => setDraftExcerpt(event.target.value)}
                    onBlur={() => void persistDraft()}
                    rows={5}
                    placeholder="记录这条伏笔在正文里是怎样被埋下的。"
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-300">备注</label>
                  <textarea
                    value={draftNotes}
                    onChange={(event) => setDraftNotes(event.target.value)}
                    onBlur={() => void persistDraft()}
                    rows={6}
                    placeholder="补充触发条件、预期回收方式，或需要提醒自己的剧情意图。"
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-300">当前状态</label>
                  <select
                    value={currentForeshadow.status}
                    onChange={(event) => void handleStatusChange(event.target.value as ForeshadowStatus)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  >
                    {statusOptions
                      .filter((option) => option.key !== 'all')
                      .map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-300">来源章节</label>
                  <select
                    value={currentForeshadow.sourceChapterId ?? ''}
                    onChange={(event) => void handleSourceChapterChange(event.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  >
                    <option value="">未关联章节</option>
                    {chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleOpenLinkedChapter(currentForeshadow.sourceChapterId, '当前还没有关联来源章节')}
                    className="mt-3 inline-flex items-center gap-2 text-sm text-indigo-300 transition-colors hover:text-indigo-200"
                  >
                    <ArrowRightCircle size={15} />
                    打开来源章节
                  </button>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-300">回收章节</label>
                  <select
                    value={currentForeshadow.resolvedChapterId ?? ''}
                    onChange={(event) => void handleResolvedChapterChange(event.target.value)}
                    disabled={currentForeshadow.status !== 'resolved'}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">尚未回收</option>
                    {chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleOpenLinkedChapter(currentForeshadow.resolvedChapterId, '当前还没有关联回收章节')}
                    disabled={!currentForeshadow.resolvedChapterId}
                    className="mt-3 inline-flex items-center gap-2 text-sm text-indigo-300 transition-colors hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowRightCircle size={15} />
                    打开回收章节
                  </button>
                </div>

                <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-sm">
                  <div>
                    <p className="text-neutral-500">状态概览</p>
                    <div className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${statusMeta[currentForeshadow.status].badgeClass}`}>
                      {(() => {
                        const StatusIcon = statusMeta[currentForeshadow.status].icon;
                        return <StatusIcon size={14} />;
                      })()}
                      {statusMeta[currentForeshadow.status].label}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-neutral-400">
                    <p>来源：{sourceChapterLabel}</p>
                    <p className="mt-2">回收：{resolvedChapterLabel}</p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs leading-6 text-neutral-500">
              伏笔支持记录来源章节、摘录、备注和状态，帮助你追踪剧情线索的埋设与回收。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
