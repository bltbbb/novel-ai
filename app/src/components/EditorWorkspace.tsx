import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Plus, Save, Settings2, Sparkles, Trash2, WifiOff } from 'lucide-react';
import { streamChat } from '@/lib/ai-client';
import { assembleContinueWritingContext } from '@/lib/context-assembler';
import { countDocumentCharacters, createParagraphDocument, richTextToPlainText } from '@/lib/editor-content';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { chapterToMarkdown, downloadMarkdown, projectToMarkdown } from '@/lib/export';
import { createId } from '@/lib/identity';
import { useEditorStore, useLoreStore, useServerStatusStore, useSettingsStore } from '@/stores';
import { useToast } from '@/components/Toast';
import { EMPTY_DOCUMENT, type Chapter, type Id, type RichTextDocument } from '@/types';

interface EditorWorkspaceProps {
  projectId: Id;
  projectTitle: string;
  projectDescription?: string;
  onOpenSettings: () => void;
}

const RichTextEditor = lazy(async () => {
  const module = await import('@/components/RichTextEditor');
  return { default: module.RichTextEditor };
});

const ContextInspector = lazy(async () => {
  const module = await import('@/components/ContextInspector');
  return { default: module.ContextInspector };
});

function EditorChunkFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-950/60 text-sm text-neutral-500">
      正在加载{label}...
    </div>
  );
}

function formatSavedAt(savedAt: string | null) {
  if (!savedAt) {
    return '尚未保存';
  }

  return `上次保存：${new Date(savedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

export function EditorWorkspace({
  projectId,
  projectTitle,
  projectDescription = '',
  onOpenSettings,
}: EditorWorkspaceProps) {
  const {
    chapters,
    activeChapterId,
    lastSavedAt,
    isDirty,
    loadChapters,
    setActiveChapter,
    createChapter,
    updateChapterTitle,
    saveChapterContent,
    deleteChapter,
    markDirty,
    clearDirty,
  } = useEditorStore();
  const entities = useLoreStore((state) => state.entities);
  const settings = useSettingsStore((state) => state.settings);
  const serverAvailability = useServerStatusStore((state) => state.availability);
  const serverMessage = useServerStatusStore((state) => state.message);
  const refreshServerStatus = useServerStatusStore((state) => state.refresh);
  const setServerOffline = useServerStatusStore((state) => state.setOffline);
  const { toast } = useToast();
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDocument, setDraftDocument] = useState<RichTextDocument>(EMPTY_DOCUMENT);
  const [isAiWriting, setIsAiWriting] = useState(false);
  const previousAvailabilityRef = useRef(serverAvailability);

  const currentChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0] ?? null,
    [activeChapterId, chapters],
  );
  const draftWordCount = useMemo(() => countDocumentCharacters(draftDocument), [draftDocument]);
  const isAiAvailable = serverAvailability !== 'offline';

  useEffect(() => {
    void loadChapters(projectId).catch(() => {
      toast('加载章节失败', 'error');
    });
  }, [loadChapters, projectId, toast]);

  useEffect(() => {
    if (!activeChapterId && chapters[0]) {
      setActiveChapter(chapters[0].id);
    }
  }, [activeChapterId, chapters, setActiveChapter]);

  useEffect(() => {
    if (!currentChapter) {
      setDraftTitle('');
      setDraftDocument(EMPTY_DOCUMENT);
      return;
    }

    setDraftTitle(currentChapter.title);
    setDraftDocument(currentChapter.content);
  }, [currentChapter?.id, currentChapter?.updatedAt]);

  useEffect(() => {
    if (previousAvailabilityRef.current === serverAvailability) {
      return;
    }

    if (serverAvailability === 'offline') {
      toast(`AI 功能已禁用：${serverMessage}`, 'warning');
    }

    if (previousAvailabilityRef.current === 'offline' && serverAvailability === 'online') {
      toast('AI 服务已恢复，可继续续写', 'success');
    }

    previousAvailabilityRef.current = serverAvailability;
  }, [serverAvailability, serverMessage, toast]);

  useEffect(() => {
    if (!currentChapter || !isDirty || isAiWriting) {
      return;
    }

    const currentJson = JSON.stringify(currentChapter.content ?? EMPTY_DOCUMENT);
    const draftJson = JSON.stringify(draftDocument ?? EMPTY_DOCUMENT);

    if (currentJson === draftJson) {
      clearDirty();
      return;
    }

    const timer = window.setTimeout(() => {
      void saveChapterContent(currentChapter.id, draftDocument);
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearDirty, currentChapter, draftDocument, isAiWriting, isDirty, saveChapterContent]);

  async function persistCurrentDraft() {
    if (!currentChapter) {
      return;
    }

    if (draftTitle !== currentChapter.title) {
      await updateChapterTitle(currentChapter.id, draftTitle);
    }

    const currentJson = JSON.stringify(currentChapter.content ?? EMPTY_DOCUMENT);
    const draftJson = JSON.stringify(draftDocument ?? EMPTY_DOCUMENT);

    if (draftJson !== currentJson) {
      await saveChapterContent(currentChapter.id, draftDocument);
    }
  }

  async function handleCreateChapter() {
    await persistCurrentDraft();
    const chapter = await createChapter({ projectId });
    setDraftTitle(chapter.title);
    setDraftDocument(chapter.content);
    toast(`已创建「${chapter.title}」`, 'success');
  }

  async function handleSelectChapter(chapterId: Id) {
    await persistCurrentDraft();
    setActiveChapter(chapterId);
  }

  async function handleDeleteCurrentChapter() {
    if (!currentChapter) {
      return;
    }

    const confirmed = window.confirm(`确认删除章节「${currentChapter.title}」吗？`);

    if (!confirmed) {
      return;
    }

    await deleteChapter(currentChapter.id);
    toast(`已删除「${currentChapter.title}」`, 'warning');
  }

  async function handleContinueWriting() {
    if (!currentChapter) {
      return;
    }

    const serverReachable =
      serverAvailability === 'online'
        ? true
        : await refreshServerStatus(settings.serverUrl);

    if (!serverReachable) {
      toast(`AI 功能暂不可用：${useServerStatusStore.getState().message}`, 'warning');
      return;
    }

    await persistCurrentDraft();

    const basePlainText = richTextToPlainText(draftDocument);
    const assembled = assembleContinueWritingContext({
      projectId,
      chapterId: currentChapter.id,
      chapterTitle: draftTitle || currentChapter.title,
      content: draftDocument,
      settings,
      entities,
      messageId: createId(),
    });

    let nextPlainText = basePlainText;

    setIsAiWriting(true);
    toast('AI 正在续写...', 'info');

    try {
      for await (const delta of streamChat(settings.serverUrl, assembled.request)) {
        nextPlainText += delta;
        setDraftDocument(createParagraphDocument(nextPlainText));
      }

      markDirty();
      toast('AI 续写完成', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setServerOffline(message);
      toast(`AI 续写失败：${message}`, 'error');
    } finally {
      setIsAiWriting(false);
    }
  }

  function buildCurrentChapterSnapshot(): Chapter | null {
    if (!currentChapter) {
      return null;
    }

    return {
      ...currentChapter,
      title: draftTitle || currentChapter.title,
      content: draftDocument,
      wordCount: draftWordCount,
    };
  }

  function buildProjectChapterSnapshot() {
    const chapterSnapshot = buildCurrentChapterSnapshot();

    if (!chapterSnapshot) {
      return chapters;
    }

    return chapters.map((chapter) => (chapter.id === chapterSnapshot.id ? chapterSnapshot : chapter));
  }

  async function handleExportCurrentChapter() {
    const chapterSnapshot = buildCurrentChapterSnapshot();

    if (!chapterSnapshot) {
      return;
    }

    await persistCurrentDraft();

    const markdown = chapterToMarkdown(chapterSnapshot);
    downloadMarkdown(`${projectTitle}-${chapterSnapshot.title}.md`, markdown);
    toast(`已导出章节「${chapterSnapshot.title}」`, 'success');
  }

  async function handleExportProject() {
    if (chapters.length === 0) {
      return;
    }

    await persistCurrentDraft();

    const markdown = projectToMarkdown(
      {
        title: projectTitle,
        description: projectDescription,
      },
      buildProjectChapterSnapshot(),
    );

    downloadMarkdown(`${projectTitle}.md`, markdown);
    toast(`已导出项目「${projectTitle}」`, 'success');
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/70">
      <aside className="hidden w-72 flex-shrink-0 border-r border-neutral-800 bg-neutral-950/70 xl:flex xl:flex-col">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">章节</p>
            <p className="mt-1 text-sm text-neutral-300">{chapters.length} 个章节</p>
          </div>
          <button
            type="button"
            onClick={() => void handleCreateChapter()}
            className="rounded-xl bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-500"
            title="新建章节"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {chapters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
              还没有章节，先创建一章开始写作。
            </div>
          ) : (
            <div className="space-y-2">
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => void handleSelectChapter(chapter.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                    chapter.id === currentChapter?.id
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                      : 'border-neutral-800 bg-neutral-900/70 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'
                  }`}
                >
                  <p className="text-sm font-medium">{chapter.title}</p>
                  <p className="mt-1 text-xs text-neutral-500">{chapter.wordCount} 字</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">编辑器</p>
            <p className="mt-1 text-sm text-neutral-400">
              {formatSavedAt(lastSavedAt)}
              <span className="mx-2 text-neutral-600">|</span>
              当前 {draftWordCount} 字
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCreateChapter()}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 xl:hidden"
            >
              <Plus size={15} />
              新建章节
            </button>
            <button
              type="button"
              onClick={() => void handleExportCurrentChapter()}
              disabled={!currentChapter || isAiWriting}
              className="hidden items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 xl:inline-flex"
            >
              <Download size={15} />
              导出章节
            </button>
            <button
              type="button"
              onClick={() => void handleExportProject()}
              disabled={chapters.length === 0 || isAiWriting}
              className="hidden items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 xl:inline-flex"
            >
              <Download size={15} />
              导出整书
            </button>
            <button
              type="button"
              onClick={() => void handleContinueWriting()}
              disabled={!currentChapter || isAiWriting || !isAiAvailable}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              title={!isAiAvailable ? `AI 功能暂不可用：${serverMessage}` : undefined}
            >
              <Sparkles size={15} />
              {isAiWriting ? 'AI 续写中' : !isAiAvailable ? 'AI 不可用' : 'AI 续写'}
            </button>
            <button
              type="button"
              onClick={() => void handleExportCurrentChapter()}
              disabled={!currentChapter || isAiWriting}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 xl:hidden"
            >
              <Download size={15} />
              导出
            </button>
            <button
              type="button"
              onClick={() => void persistCurrentDraft()}
              disabled={isAiWriting}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              <Save size={15} />
              立即保存
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteCurrentChapter()}
              disabled={!currentChapter || isAiWriting}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={15} />
              删除
            </button>
          </div>
        </div>

        {!currentChapter ? (
          <div className="flex flex-1 p-8">
            <EmptyState
              icon={<FileText size={22} />}
              title="还没有章节内容"
              description="这个项目已经创建完成，下一步可以先建立第一章，再开始正文写作。"
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => void handleCreateChapter()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    <Plus size={16} />
                    创建第一章
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-2 rounded-2xl border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                  >
                    <Settings2 size={15} />
                    检查 AI 设置
                  </button>
                </>
              }
              details={
                <OnboardingChecklist
                  title="推荐起步顺序"
                  items={[
                    '先创建第一章，确定一个明确的章节标题。',
                    '写几句开头正文后，再尝试使用 AI 续写。',
                    '如果 AI 按钮不可用，先检查后端地址和服务状态。',
                  ]}
                />
              }
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 px-5 py-5">
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={() => void persistCurrentDraft()}
              placeholder="章节标题"
              className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-2xl font-semibold text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
            />
            <Suspense fallback={<EditorChunkFallback label="编辑器" />}>
              <RichTextEditor
                value={draftDocument}
                disabled={isAiWriting}
                onChange={(nextDocument) => {
                  setDraftDocument(nextDocument);
                  markDirty();
                }}
                slashCommands={
                  isAiAvailable
                    ? [
                        {
                          key: 'continue',
                          label: '续写当前段落',
                          description: '调用 AI 基于当前正文继续往下写。',
                        },
                      ]
                    : []
                }
                onSelectSlashCommand={async (commandKey) => {
                  if (commandKey === 'continue') {
                    await handleContinueWriting();
                  }
                }}
              />
            </Suspense>
            {!isAiAvailable && (
              <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-4 text-sm text-yellow-200">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-yellow-300">
                    <WifiOff size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-yellow-100">AI 服务暂时不可用</p>
                    <p className="mt-2 leading-6">
                      当前状态：{serverMessage}。本地写作、自动保存和 Markdown 导出仍然可正常使用。
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="inline-flex items-center gap-2 rounded-2xl border border-yellow-400/30 px-3 py-2 text-sm text-yellow-100 transition-colors hover:bg-yellow-500/10"
                      >
                        <Settings2 size={15} />
                        打开设置
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <p className="text-xs leading-6 text-neutral-500">
              {isAiAvailable
                ? '当前已接入最小 Slash Menu。输入 `/` 后可执行“续写当前段落”。'
                : '当前仅保留本地写作能力。恢复服务连接后，Slash Menu 和 AI 续写会自动可用。'}
            </p>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 px-4 py-3 text-sm text-neutral-400">
              <p className="mb-2 text-neutral-300">正文纯文本预览</p>
              <p className="line-clamp-3 whitespace-pre-wrap text-neutral-500">
                {richTextToPlainText(draftDocument) || '暂无正文内容'}
              </p>
            </div>
          </div>
        )}
      </section>

      {currentChapter && (
        <Suspense fallback={<div className="hidden w-80 2xl:block" />}>
          <ContextInspector
            projectId={projectId}
            chapterId={currentChapter.id}
            chapterTitle={draftTitle || currentChapter.title}
            content={draftDocument}
            isAiWriting={isAiWriting}
          />
        </Suspense>
      )}
    </div>
  );
}
