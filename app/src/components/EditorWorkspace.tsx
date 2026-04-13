import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, FileText, History, Plus, Save, Settings2, Sparkles, Target, Trash2, WifiOff } from 'lucide-react';
import { streamChat } from '@/lib/ai-client';
import { retrieveChapterSearchResults } from '@/lib/chapter-search';
import { assembleContinueWritingContext } from '@/lib/context-assembler';
import { countDocumentCharacters, createParagraphDocument, richTextToPlainText } from '@/lib/editor-content';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { chapterToMarkdown, downloadMarkdown, projectToMarkdown } from '@/lib/export';
import { createId } from '@/lib/identity';
import { getProjectStylePrompt } from '@/lib/project-style';
import { formatPromptSection, mergePromptSections } from '@/lib/project-template';
import {
  useEditorStore,
  useForeshadowStore,
  useIdeaCardStore,
  useLoreStore,
  useProjectStore,
  useServerStatusStore,
  useSettingsStore,
  useSnapshotStore,
} from '@/stores';
import { useToast } from '@/components/Toast';
import { EMPTY_DOCUMENT, type Chapter, type Id, type RichTextDocument, type SearchResult, type Snapshot } from '@/types';

interface EditorWorkspaceProps {
  projectId: Id;
  projectTitle: string;
  projectDescription?: string;
  onOpenSettings: () => void;
  onOpenForeshadow: () => void;
  hideChapterSidebar?: boolean;
  hideAiWritingEntry?: boolean;
}

const RichTextEditor = lazy(async () => {
  const module = await import('@/components/RichTextEditor');
  return { default: module.RichTextEditor };
});

const ContextInspector = lazy(async () => {
  const module = await import('@/components/ContextInspector');
  return { default: module.ContextInspector };
});

const CreativeRecordsDialog = lazy(async () => {
  const module = await import('@/components/CreativeRecordsDialog');
  return { default: module.CreativeRecordsDialog };
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
  onOpenForeshadow,
  hideChapterSidebar = false,
  hideAiWritingEntry = false,
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
  const createForeshadow = useForeshadowStore((state) => state.createForeshadow);
  const createSnapshot = useSnapshotStore((state) => state.createSnapshot);
  const createIdeaCard = useIdeaCardStore((state) => state.createIdeaCard);
  const entities = useLoreStore((state) => state.entities);
  const settings = useSettingsStore((state) => state.settings);
  const currentProject = useProjectStore((state) => state.projects.find((project) => project.id === projectId) ?? null);
  const serverAvailability = useServerStatusStore((state) => state.availability);
  const serverMessage = useServerStatusStore((state) => state.message);
  const refreshServerStatus = useServerStatusStore((state) => state.refresh);
  const setServerOffline = useServerStatusStore((state) => state.setOffline);
  const { toast } = useToast();
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDocument, setDraftDocument] = useState<RichTextDocument>(EMPTY_DOCUMENT);
  const [isAiWriting, setIsAiWriting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCreativeRecords, setShowCreativeRecords] = useState(false);
  const [lastAiGeneratedText, setLastAiGeneratedText] = useState('');
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const previousAvailabilityRef = useRef(serverAvailability);

  const currentChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0] ?? null,
    [activeChapterId, chapters],
  );
  const draftWordCount = useMemo(() => countDocumentCharacters(draftDocument), [draftDocument]);
  const isAiAvailable = serverAvailability !== 'offline';
  const chapterTitleMap = useMemo(() => {
    return new Map(chapters.map((chapter) => [chapter.id, chapter.title] as const));
  }, [chapters]);
  const effectiveContinueSettings = useMemo(
    () => ({
      ...settings,
      stylePrompt: mergePromptSections(
        formatPromptSection('创作模板正文约束', currentProject?.templateSnapshot?.promptBundle.writingPrompt),
        formatPromptSection('创作模板文风约束', currentProject?.templateSnapshot?.promptBundle.stylePrompt),
        formatPromptSection('创作模板负面约束', currentProject?.templateSnapshot?.promptBundle.negativePrompt),
        formatPromptSection('项目文风', getProjectStylePrompt(currentProject, settings)),
      ),
    }),
    [
      currentProject?.templateSnapshot?.promptBundle.negativePrompt,
      currentProject?.templateSnapshot?.promptBundle.stylePrompt,
      currentProject?.templateSnapshot?.promptBundle.writingPrompt,
      currentProject?.stylePrompt,
      settings,
    ],
  );

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

  useEffect(() => {
    if (!showExportMenu) return;
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

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

    const result = await deleteChapter(currentChapter.id);
    toast(`已删除「${currentChapter.title}」`, 'warning');

    if (!result.rebuildSucceeded) {
      toast(`章节已删除，但服务端生成态重建失败：${result.rebuildError || '未知错误'}`, 'error');
    }
  }

  async function handleCreateForeshadowFromChapter() {
    if (!currentChapter) {
      return;
    }

    await persistCurrentDraft();

    const plainText = richTextToPlainText(draftDocument).trim();

    if (!plainText) {
      toast('请先写一些正文，再将当前章节记为伏笔', 'warning');
      return;
    }

    const suggestedTitle = `${draftTitle || currentChapter.title} 的伏笔`;
    const foreshadowTitle = window.prompt('输入伏笔标题', suggestedTitle)?.trim();

    if (!foreshadowTitle) {
      return;
    }

    const excerpt = plainText.replace(/\s+/g, ' ').slice(0, 120);
    const foreshadow = await createForeshadow({
      projectId,
      title: foreshadowTitle,
      excerpt,
      sourceChapterId: currentChapter.id,
    });

    toast(`已记录伏笔「${foreshadow.title}」`, 'success');
  }

  async function handleCreateManualSnapshot() {
    if (!currentChapter) {
      return;
    }

    try {
      await persistCurrentDraft();

      await createSnapshot({
        projectId,
        chapterId: currentChapter.id,
        chapterTitle: draftTitle || currentChapter.title,
        content: draftDocument,
        source: 'manual',
        note: '手动创建快照',
      });

      toast('已创建章节快照', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`创建快照失败：${message}`, 'error');
    }
  }

  async function handleRestoreSnapshot(snapshot: Snapshot) {
    setDraftDocument(snapshot.content);
    markDirty();
    toast('已恢复到所选快照，内容会自动保存', 'success');
  }

  async function handleCreateManualIdeaCard() {
    if (!currentChapter) {
      return;
    }

    try {
      const plainText = richTextToPlainText(draftDocument).trim();

      if (!plainText) {
        toast('请先写一些正文，再保存为灵感卡片', 'warning');
        return;
      }

      const title = window.prompt('输入灵感卡片标题', `${draftTitle || currentChapter.title} 的灵感`)?.trim();

      if (!title) {
        return;
      }

      const ideaCard = await createIdeaCard({
        projectId,
        sourceChapterId: currentChapter.id,
        title,
        content: plainText,
        source: 'manual',
      });

      toast(`已保存灵感卡片「${ideaCard.title}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存灵感卡片失败：${message}`, 'error');
    }
  }

  async function handleCreateAiIdeaCard() {
    if (!currentChapter) {
      return;
    }

    try {
      const content = lastAiGeneratedText.trim();

      if (!content) {
        toast('最近还没有可保存的 AI 输出', 'warning');
        return;
      }

      const title = window.prompt('输入灵感卡片标题', `${draftTitle || currentChapter.title} 的 AI 灵感`)?.trim();

      if (!title) {
        return;
      }

      const ideaCard = await createIdeaCard({
        projectId,
        sourceChapterId: currentChapter.id,
        title,
        content,
        source: 'ai_output',
      });

      toast(`已保存灵感卡片「${ideaCard.title}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存 AI 灵感失败：${message}`, 'error');
    }
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

    try {
      await createSnapshot({
        projectId,
        chapterId: currentChapter.id,
        chapterTitle: draftTitle || currentChapter.title,
        content: draftDocument,
        source: 'ai_continue',
        note: 'AI 续写前自动快照',
      });
    } catch {
      toast('自动快照创建失败，本次续写仍会继续', 'warning');
    }

    const basePlainText = richTextToPlainText(draftDocument);
    let searchResults: SearchResult[] = [];

    try {
      searchResults = await retrieveChapterSearchResults({
        serverUrl: settings.serverUrl,
        projectId,
        chapterId: currentChapter.id,
        content: draftDocument,
        chapters,
        topK: 3,
      });
    } catch {
      toast('历史检索暂不可用，本次已回退为当前上下文', 'warning');
    }

    const assembled = assembleContinueWritingContext({
      projectId,
      chapterId: currentChapter.id,
      chapterTitle: draftTitle || currentChapter.title,
      content: draftDocument,
      settings: effectiveContinueSettings,
      entities,
      searchResults,
      messageId: createId(),
    });

    let nextPlainText = basePlainText;
    let generatedText = '';

    setIsAiWriting(true);
    setLastAiGeneratedText('');
    toast('AI 正在续写...', 'info');

    try {
      for await (const delta of streamChat(settings.serverUrl, assembled.request)) {
        generatedText += delta;
        nextPlainText += delta;
        setDraftDocument(createParagraphDocument(nextPlainText));
      }

      setLastAiGeneratedText(generatedText.trim());
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
      {!hideChapterSidebar ? (
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
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-neutral-800 px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-neutral-400">
              <span className="text-xs uppercase tracking-[0.2em] text-neutral-500">编辑器</span>
              <span className="text-neutral-700">|</span>
              <span>{formatSavedAt(lastSavedAt)}</span>
              <span className="text-neutral-700">|</span>
              <span>{draftWordCount} 字</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void persistCurrentDraft()}
                disabled={isAiWriting}
                className="inline-flex items-center rounded-xl p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                title="立即保存"
              >
                <Save size={15} />
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteCurrentChapter()}
                disabled={!currentChapter || isAiWriting}
                className="inline-flex items-center rounded-xl p-1.5 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                title="删除当前章节"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleContinueWriting()}
              disabled={!currentChapter || isAiWriting || !isAiAvailable}
              hidden={hideAiWritingEntry}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              title={!isAiAvailable ? `AI 功能暂不可用：${serverMessage}` : undefined}
            >
              <Sparkles size={14} />
              {isAiWriting ? '续写中...' : !isAiAvailable ? 'AI 不可用' : 'AI 续写'}
            </button>
            <button
              type="button"
              onClick={() => void handleCreateForeshadowFromChapter()}
              disabled={!currentChapter || isAiWriting}
              className="hidden items-center gap-1.5 rounded-xl border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 xl:inline-flex"
            >
              <Target size={14} />
              记为伏笔
            </button>
            <button
              type="button"
              onClick={() => setShowCreativeRecords(true)}
              disabled={!currentChapter}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <History size={14} />
              记录
            </button>
            <div ref={exportMenuRef} className="relative hidden xl:block">
              <button
                type="button"
                onClick={() => setShowExportMenu((prev) => !prev)}
                disabled={(!currentChapter && chapters.length === 0) || isAiWriting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={14} />
                导出
                <ChevronDown size={12} />
              </button>
              {showExportMenu && (
                <div className="absolute left-0 top-full z-20 mt-1.5 w-36 rounded-xl border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => { setShowExportMenu(false); void handleExportCurrentChapter(); }}
                    disabled={!currentChapter}
                    className="flex w-full items-center px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    导出章节
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowExportMenu(false); void handleExportProject(); }}
                    disabled={chapters.length === 0}
                    className="flex w-full items-center px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    导出整书
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleCreateChapter()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 xl:hidden"
            >
              <Plus size={14} />
              新建章节
            </button>
            <button
              type="button"
              onClick={onOpenForeshadow}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 xl:hidden"
            >
              <Target size={14} />
              伏笔
            </button>
            <button
              type="button"
              onClick={() => void handleExportCurrentChapter()}
              disabled={!currentChapter || isAiWriting}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 xl:hidden"
            >
              <Download size={14} />
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
                  !hideAiWritingEntry && isAiAvailable
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
                        打开 AI 设置
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <p className="text-xs leading-6 text-neutral-500">
              {hideAiWritingEntry
                ? '当前视图用于人工精修正文；生成与审核入口已集中到“生成”页。'
                : isAiAvailable
                  ? '输入 / 可呼出 AI 指令菜单；创作记录里可以查看快照，生成实验里可以测试 Plan → Write → Extract。'
                  : '当前仅保留本地写作能力，恢复服务连接后 AI 续写会自动可用。'}
            </p>
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

      <Suspense fallback={null}>
        <CreativeRecordsDialog
          open={showCreativeRecords}
          onClose={() => setShowCreativeRecords(false)}
          projectId={projectId}
          currentChapterId={currentChapter?.id ?? null}
          chapterTitleMap={chapterTitleMap}
          hasAiIdeaCandidate={Boolean(lastAiGeneratedText.trim())}
          onCreateManualSnapshot={handleCreateManualSnapshot}
          onRestoreSnapshot={handleRestoreSnapshot}
          onCreateManualIdeaCard={handleCreateManualIdeaCard}
          onCreateAiIdeaCard={handleCreateAiIdeaCard}
        />
      </Suspense>
    </div>
  );
}
