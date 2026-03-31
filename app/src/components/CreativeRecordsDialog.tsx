import { useEffect, useMemo, useState } from 'react';
import {
  BookText,
  FileText,
  History,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useIdeaCardStore, useSnapshotStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { Id, Snapshot } from '@/types';

interface CreativeRecordsDialogProps {
  open: boolean;
  projectId: Id;
  currentChapterId: Id | null;
  chapterTitleMap: Map<Id, string>;
  hasAiIdeaCandidate: boolean;
  onClose: () => void;
  onCreateManualSnapshot: () => Promise<void>;
  onRestoreSnapshot: (snapshot: Snapshot) => Promise<void> | void;
  onCreateManualIdeaCard: () => Promise<void>;
  onCreateAiIdeaCard: () => Promise<void>;
}

type DialogTab = 'snapshots' | 'ideas';

function formatTimeLabel(timestamp: string) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const snapshotSourceLabel = {
  manual: '手动快照',
  ai_continue: 'AI 续写前',
} as const;

const ideaSourceLabel = {
  manual: '手动记录',
  ai_output: 'AI 输出',
} as const;

export function CreativeRecordsDialog({
  open,
  projectId,
  currentChapterId,
  chapterTitleMap,
  hasAiIdeaCandidate,
  onClose,
  onCreateManualSnapshot,
  onRestoreSnapshot,
  onCreateManualIdeaCard,
  onCreateAiIdeaCard,
}: CreativeRecordsDialogProps) {
  const { snapshots, loadedProjectId: loadedSnapshotProjectId, loadSnapshots, deleteSnapshot } = useSnapshotStore();
  const { ideaCards, loadedProjectId: loadedIdeaProjectId, loadIdeaCards, deleteIdeaCard } = useIdeaCardStore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<DialogTab>('snapshots');

  const currentChapterSnapshots = useMemo(() => {
    if (!currentChapterId) {
      return [];
    }

    return snapshots.filter((snapshot) => snapshot.chapterId === currentChapterId);
  }, [currentChapterId, snapshots]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab('snapshots');

    if (loadedSnapshotProjectId !== projectId) {
      void loadSnapshots(projectId).catch(() => {
        toast('加载快照失败', 'error');
      });
    }

    if (loadedIdeaProjectId !== projectId) {
      void loadIdeaCards(projectId).catch(() => {
        toast('加载灵感卡片失败', 'error');
      });
    }
  }, [loadIdeaCards, loadSnapshots, loadedIdeaProjectId, loadedSnapshotProjectId, open, projectId, toast]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  async function handleDeleteSnapshot(snapshotId: Id) {
    const confirmed = window.confirm('确认删除这条快照吗？');

    if (!confirmed) {
      return;
    }

    await deleteSnapshot(snapshotId);
    toast('快照已删除', 'warning');
  }

  async function handleDeleteIdeaCard(ideaCardId: Id) {
    const confirmed = window.confirm('确认删除这张灵感卡片吗？');

    if (!confirmed) {
      return;
    }

    await deleteIdeaCard(ideaCardId);
    toast('灵感卡片已删除', 'warning');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
              <History size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">创作记录</h2>
              <p className="text-sm text-neutral-500">集中查看当前章节快照，并把正文或 AI 输出沉淀为灵感卡片。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-neutral-800 px-6 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('snapshots')}
              className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors ${
                activeTab === 'snapshots'
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              <History size={15} />
              快照
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ideas')}
              className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors ${
                activeTab === 'ideas'
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              <Lightbulb size={15} />
              灵感卡片
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {activeTab === 'snapshots' ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-neutral-100">当前章节快照</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    AI 续写前会自动生成快照，也可以手动留档，方便回退正文。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onCreateManualSnapshot()}
                  disabled={!currentChapterId}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <History size={15} />
                  手动创建快照
                </button>
              </div>

              {currentChapterSnapshots.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/30 p-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-indigo-300">
                    <FileText size={22} />
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-neutral-100">当前章节还没有快照</h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-400">
                    先手动创建一次快照，或者直接使用 AI 续写，系统会在续写前自动留档。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentChapterSnapshots.map((snapshot) => (
                    <article
                      key={snapshot.id}
                      className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-300">
                              {snapshotSourceLabel[snapshot.source]}
                            </span>
                            <span className="text-xs text-neutral-500">{formatTimeLabel(snapshot.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-neutral-100">{snapshot.chapterTitle}</p>
                          <p className="mt-2 text-sm leading-6 text-neutral-400">
                            {snapshot.note || '未填写备注'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void onRestoreSnapshot(snapshot)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                          >
                            <RotateCcw size={15} />
                            恢复
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSnapshot(snapshot.id)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <Trash2 size={15} />
                            删除
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-neutral-100">灵感卡片</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    可以把当前正文或最近一次 AI 输出沉淀下来，避免灵感散落在编辑过程中。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onCreateManualIdeaCard()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                  >
                    <BookText size={15} />
                    保存当前正文
                  </button>
                  <button
                    type="button"
                    onClick={() => void onCreateAiIdeaCard()}
                    disabled={!hasAiIdeaCandidate}
                    className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Sparkles size={15} />
                    保存最近 AI 输出
                  </button>
                </div>
              </div>

              {ideaCards.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/30 p-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-indigo-300">
                    <Lightbulb size={22} />
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-neutral-100">还没有灵感卡片</h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-400">
                    可以先保存当前正文，或者在一次 AI 续写完成后把最近输出单独沉淀出来。
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {ideaCards.map((ideaCard) => (
                    <article
                      key={ideaCard.id}
                      className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-yellow-500/10 px-2.5 py-1 text-xs text-yellow-300">
                              {ideaSourceLabel[ideaCard.source]}
                            </span>
                            <span className="text-xs text-neutral-500">{formatTimeLabel(ideaCard.updatedAt)}</span>
                          </div>
                          <h3 className="mt-2 text-base font-medium text-neutral-100">{ideaCard.title}</h3>
                          <p className="mt-2 text-xs text-neutral-500">
                            来源章节：
                            {ideaCard.sourceChapterId
                              ? chapterTitleMap.get(ideaCard.sourceChapterId) ?? '章节已删除'
                              : '未关联章节'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteIdeaCard(ideaCard.id)}
                          className="rounded-2xl p-2 text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                          title="删除灵感卡片"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-400">
                        {ideaCard.content}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
