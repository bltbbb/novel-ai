import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Layers3, Play, Save, Sparkles, WandSparkles, X } from 'lucide-react';
import { buildGenerationContextBundle } from '@/lib/generation-context';
import { buildGenerationForeshadowSnapshot } from '@/lib/generation-foreshadow-snapshot';
import {
  createChapterPlan,
  extractChapterState,
  polishChapterDraft,
  reviewChapterDraft,
  styleChapterDraft,
  writeChapterBeat,
} from '@/lib/generation-client';
import {
  appendStrandHistory,
  loadChapterStateChanges,
  loadChapterOutline,
  loadChapterSummary,
  loadStrandTracker,
  replaceChapterStateChanges,
  saveChapterOutline,
  saveChapterSummary,
} from '@/lib/generation-storage';
import { createParagraphDocument, richTextToPlainText } from '@/lib/editor-content';
import { buildWorldStateSummary, findPreviousChapter, getStrandLabel } from '@/lib/generation-utils';
import { useToast } from '@/components/Toast';
import { useForeshadowStore } from '@/stores';
import type {
  AppSettings,
  Chapter,
  ChapterOutline,
  ChapterPolishDraft,
  ChapterReviewDraft,
  ChapterSummary,
  ChapterStyleDraft,
  Id,
  LoreEntity,
  RichTextDocument,
  StateChange,
  StrandType,
  StrandTracker,
} from '@/types';

interface GenerationLabDialogProps {
  open: boolean;
  projectId: Id;
  projectTitle: string;
  projectDescription: string;
  chapter: Chapter | null;
  chapters: Chapter[];
  content: RichTextDocument;
  settings: AppSettings;
  entities: LoreEntity[];
  onClose: () => void;
  onApplyGeneratedContent: (nextDocument: RichTextDocument) => void;
  onCreateSnapshot: () => Promise<void>;
}

function formatRelativeTime(timestamp: string) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GenerationLabDialog({
  open,
  projectId,
  projectTitle,
  projectDescription,
  chapter,
  chapters,
  content,
  settings,
  entities,
  onClose,
  onApplyGeneratedContent,
  onCreateSnapshot,
}: GenerationLabDialogProps) {
  const { toast } = useToast();
  const foreshadows = useForeshadowStore((state) => state.foreshadows);
  const foreshadowLoadedProjectId = useForeshadowStore((state) => state.loadedProjectId);
  const isForeshadowLoaded = useForeshadowStore((state) => state.isLoaded);
  const [outline, setOutline] = useState<ChapterOutline | null>(null);
  const [summary, setSummary] = useState<ChapterSummary | null>(null);
  const [stateChanges, setStateChanges] = useState<StateChange[]>([]);
  const [strandTracker, setStrandTracker] = useState<StrandTracker | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [isStyling, setIsStyling] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [latestGeneratedText, setLatestGeneratedText] = useState('');
  const [styleResult, setStyleResult] = useState<ChapterStyleDraft | null>(null);
  const [reviewResult, setReviewResult] = useState<ChapterReviewDraft | null>(null);
  const [polishResult, setPolishResult] = useState<ChapterPolishDraft | null>(null);

  const previousChapter = useMemo(() => findPreviousChapter(chapters, chapter?.id), [chapter?.id, chapters]);
  const worldState = useMemo(() => buildWorldStateSummary(entities), [entities]);

  useEffect(() => {
    if (!open || !chapter) {
      return;
    }

    void (async () => {
      await refreshArtifacts(chapter.id);
      setLatestGeneratedText('');
      setStyleResult(null);
      setReviewResult(null);
      setPolishResult(null);
    })();
  }, [chapter, open, projectId]);

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

  if (!open || !chapter) {
    return null;
  }

  const activeChapter = chapter;

  async function refreshArtifacts(chapterId: Id) {
    const [nextOutline, nextSummary, nextStateChanges, nextStrandTracker] = await Promise.all([
      loadChapterOutline(projectId, chapterId),
      loadChapterSummary(projectId, chapterId),
      loadChapterStateChanges(chapterId),
      loadStrandTracker(projectId),
    ]);

    setOutline(nextOutline ?? null);
    setSummary(nextSummary ?? null);
    setStateChanges(nextStateChanges);
    setStrandTracker(nextStrandTracker ?? null);
  }

  async function getPreviousSummaryText() {
    if (!previousChapter) {
      return '';
    }

    const previousSummary = await loadChapterSummary(projectId, previousChapter.id);
    return previousSummary?.summary ?? '';
  }

  async function getContextBundle() {
    return buildGenerationContextBundle({
      projectId,
      currentChapterId: activeChapter.id,
      chapters,
      entities,
    });
  }

  const foreshadowSnapshot =
    isForeshadowLoaded && foreshadowLoadedProjectId === projectId
      ? buildGenerationForeshadowSnapshot(
          foreshadows.filter((foreshadow) => foreshadow.projectId === projectId),
          chapters,
        )
      : undefined;

  async function handleGeneratePlan() {
    setIsPlanning(true);

    try {
      const response = await createChapterPlan(settings.serverUrl, {
        projectId,
        chapterId: activeChapter.id,
        chapterTitle: activeChapter.title,
        chapterOrder: activeChapter.order,
        volumeTitle: activeChapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle,
        projectDescription,
        previousSummary: await getPreviousSummaryText(),
        worldState,
        contextBundle: (await getContextBundle()).bundle,
        foreshadowSnapshot,
        model: settings.modelName,
        temperature: settings.temperature,
      });

      const savedOutline = await saveChapterOutline(projectId, activeChapter.id, response.outline);
      setOutline(savedOutline);
      toast('章节契约已生成', 'success');
      return savedOutline;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`生成章节契约失败：${message}`, 'error');
      return null;
    } finally {
      setIsPlanning(false);
    }
  }

  async function handleWriteDraft(targetOutline?: ChapterOutline | null) {
    const activeOutline = targetOutline ?? outline ?? (await handleGeneratePlan());

    if (!activeOutline) {
      return '';
    }

    const existingText = richTextToPlainText(content);

    if (existingText.trim()) {
      const confirmed = window.confirm('当前章节已有正文。是否先创建快照并用生成结果覆盖当前正文？');

      if (!confirmed) {
        return '';
      }

      await onCreateSnapshot();
    }

    setIsWriting(true);

    try {
      if (activeOutline.beats.length === 0) {
        toast('当前章节契约还没有有效 beats，无法生成章节初稿', 'warning');
        return '';
      }

      let accumulatedText = '';
      const previousSummary = await getPreviousSummaryText();
      const contextBundle = await getContextBundle();

      for (let index = 0; index < activeOutline.beats.length; index += 1) {
        const beat = activeOutline.beats[index];
        const response = await writeChapterBeat(settings.serverUrl, {
          projectId,
          chapterId: activeChapter.id,
          chapterTitle: activeChapter.title,
          chapterOrder: activeChapter.order,
          volumeTitle: activeChapter.volumeTitle,
          previousChapterId: previousChapter?.id,
          previousChapterTitle: previousChapter?.title,
          projectTitle,
          projectDescription,
          outline: {
            goal: activeOutline.goal,
            obstacle: activeOutline.obstacle,
            cost: activeOutline.cost,
            beats: activeOutline.beats,
            timeAnchor: activeOutline.timeAnchor,
            chapterTimeSpan: activeOutline.chapterTimeSpan,
            gapFromPrevious: activeOutline.gapFromPrevious,
            strand: activeOutline.strand,
            hookType: activeOutline.hookType,
            hookStrength: activeOutline.hookStrength,
            immutableFacts: activeOutline.immutableFacts,
          },
          beatIndex: index,
          currentBeat: beat,
          previousText: accumulatedText,
          previousSummary,
          worldState,
          contextBundle: contextBundle.bundle,
          foreshadowSnapshot,
          model: settings.modelName,
          temperature: settings.temperature,
        });

        accumulatedText = [accumulatedText, response.content.trim()].filter(Boolean).join('\n\n');
      }

      setLatestGeneratedText(accumulatedText);
      setStyleResult(null);
      setReviewResult(null);
      setPolishResult(null);
      onApplyGeneratedContent(createParagraphDocument(accumulatedText));
      toast('章节初稿已生成并写回编辑器', 'success');
      return accumulatedText;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`生成章节初稿失败：${message}`, 'error');
      return '';
    } finally {
      setIsWriting(false);
    }
  }

  async function handleStyleDraft(contentOverride?: string) {
    const sourceText = (contentOverride ?? latestGeneratedText ?? richTextToPlainText(content)).trim();

    if (!settings.stylePrompt.trim()) {
      toast('当前还没有设置全局文风 Prompt，无法执行风格转译', 'warning');
      return '';
    }

    if (!sourceText) {
      toast('当前还没有可供转译的正文', 'warning');
      return '';
    }

    setIsStyling(true);

    try {
      const response = await styleChapterDraft(settings.serverUrl, {
        projectId,
        chapterId: activeChapter.id,
        chapterTitle: activeChapter.title,
        chapterOrder: activeChapter.order,
        volumeTitle: activeChapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle,
        projectDescription,
        outline: outline
          ? {
              goal: outline.goal,
              obstacle: outline.obstacle,
              cost: outline.cost,
              beats: outline.beats,
              timeAnchor: outline.timeAnchor,
              chapterTimeSpan: outline.chapterTimeSpan,
              gapFromPrevious: outline.gapFromPrevious,
              strand: outline.strand,
              hookType: outline.hookType,
              hookStrength: outline.hookStrength,
              immutableFacts: outline.immutableFacts,
            }
          : null,
        previousSummary: await getPreviousSummaryText(),
        worldState,
        contextBundle: (await getContextBundle()).bundle,
        foreshadowSnapshot,
        stylePrompt: settings.stylePrompt,
        content: sourceText,
        model: settings.modelName,
        temperature: settings.temperature,
      });

      setLatestGeneratedText(response.content);
      setStyleResult(response.style);
      setReviewResult(null);
      setPolishResult(null);
      onApplyGeneratedContent(createParagraphDocument(response.content));
      toast('风格转译已完成并写回编辑器', 'success');
      return response.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`风格转译失败：${message}`, 'error');
      return '';
    } finally {
      setIsStyling(false);
    }
  }

  async function handleReviewDraft(contentOverride?: string) {
    const sourceText = (contentOverride ?? latestGeneratedText ?? richTextToPlainText(content)).trim();

    if (!sourceText) {
      toast('当前还没有可供审查的正文', 'warning');
      return null;
    }

    setIsReviewing(true);

    try {
      const response = await reviewChapterDraft(settings.serverUrl, {
        projectId,
        chapterId: activeChapter.id,
        chapterTitle: activeChapter.title,
        chapterOrder: activeChapter.order,
        volumeTitle: activeChapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle,
        projectDescription,
        outline: outline
          ? {
              goal: outline.goal,
              obstacle: outline.obstacle,
              cost: outline.cost,
              beats: outline.beats,
              timeAnchor: outline.timeAnchor,
              chapterTimeSpan: outline.chapterTimeSpan,
              gapFromPrevious: outline.gapFromPrevious,
              strand: outline.strand,
              hookType: outline.hookType,
              hookStrength: outline.hookStrength,
              immutableFacts: outline.immutableFacts,
            }
          : null,
        previousSummary: await getPreviousSummaryText(),
        worldState,
        contextBundle: (await getContextBundle()).bundle,
        foreshadowSnapshot,
        content: sourceText,
        model: settings.modelName,
        temperature: settings.temperature,
      });

      setReviewResult(response.review);
      setPolishResult(null);
      toast('章节审查已完成', response.review.needsRewrite ? 'warning' : 'success');
      return response.review;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`执行章节审查失败：${message}`, 'error');
      return null;
    } finally {
      setIsReviewing(false);
    }
  }

  async function handlePolishDraft(contentOverride?: string, reviewOverride?: ChapterReviewDraft | null) {
    const sourceText = (contentOverride ?? latestGeneratedText ?? richTextToPlainText(content)).trim();

    if (!sourceText) {
      toast('当前还没有可供润色的正文', 'warning');
      return '';
    }

    setIsPolishing(true);

    try {
      const response = await polishChapterDraft(settings.serverUrl, {
        projectId,
        chapterId: activeChapter.id,
        chapterTitle: activeChapter.title,
        chapterOrder: activeChapter.order,
        volumeTitle: activeChapter.volumeTitle,
        previousChapterId: previousChapter?.id,
        previousChapterTitle: previousChapter?.title,
        projectTitle,
        projectDescription,
        outline: outline
          ? {
              goal: outline.goal,
              obstacle: outline.obstacle,
              cost: outline.cost,
              beats: outline.beats,
              timeAnchor: outline.timeAnchor,
              chapterTimeSpan: outline.chapterTimeSpan,
              gapFromPrevious: outline.gapFromPrevious,
              strand: outline.strand,
              hookType: outline.hookType,
              hookStrength: outline.hookStrength,
              immutableFacts: outline.immutableFacts,
            }
          : null,
        previousSummary: await getPreviousSummaryText(),
        worldState,
        contextBundle: (await getContextBundle()).bundle,
        foreshadowSnapshot,
        review: reviewOverride ?? reviewResult,
        content: sourceText,
        model: settings.modelName,
        temperature: settings.temperature,
      });

      setLatestGeneratedText(response.content);
      setPolishResult(response.polish);
      onApplyGeneratedContent(createParagraphDocument(response.content));
      toast('章节润色已完成并写回编辑器', response.polish.antiAiForceCheck === 'fail' ? 'warning' : 'success');
      return response.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`执行章节润色失败：${message}`, 'error');
      return '';
    } finally {
      setIsPolishing(false);
    }
  }

  async function handleExtractArtifacts(contentOverride?: string) {
    const plainText = (contentOverride ?? richTextToPlainText(content)).trim();

    if (!plainText) {
      toast('当前章节还没有正文，无法提取摘要与状态变更', 'warning');
      return;
    }

    setIsExtracting(true);

    try {
      const response = await extractChapterState(settings.serverUrl, {
        projectId,
        chapterId: activeChapter.id,
        chapterTitle: activeChapter.title,
        content: plainText,
        loreSummary: worldState,
        model: settings.modelName,
        temperature: settings.temperature,
      });

      const savedSummary = await saveChapterSummary(projectId, activeChapter.id, response.summary);
      const entityIdMap = new Map(
        entities.map((entity) => [entity.name.trim().toLowerCase(), entity.id] as const),
      );

      await replaceChapterStateChanges(
        projectId,
        activeChapter.id,
        response.stateChanges,
        new Map(
          Array.from(entityIdMap.entries()).map(([key, value]) => [key, value] as const),
        ),
      );
      await appendStrandHistory(projectId, activeChapter.id, activeChapter.title, response.strand as StrandType);

      setSummary(savedSummary);
      await refreshArtifacts(activeChapter.id);
      toast('章节摘要与状态变更已提取', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`提取章节结果失败：${message}`, 'error');
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleRunPipeline() {
    const activeOutline = await handleGeneratePlan();

    if (!activeOutline) {
      return;
    }

    const generatedText = await handleWriteDraft(activeOutline);

    if (!generatedText) {
      return;
    }

    const styledText = settings.stylePrompt.trim() ? await handleStyleDraft(generatedText) : generatedText;

    if (!styledText) {
      return;
    }

    const review = await handleReviewDraft(styledText);

    if (!review) {
      return;
    }

    if (review.needsRewrite || review.overallSeverity === 'critical') {
      toast('审查结果建议先重写，本次一键流程停在 Review', 'warning');
      return;
    }

    const polishedText = await handlePolishDraft(styledText, review);

    if (!polishedText) {
      return;
    }

    await handleExtractArtifacts(polishedText);
  }

  const stepCards = [
    {
      key: 'plan',
      label: 'Plan',
      status: isPlanning ? 'running' : outline ? 'done' : 'idle',
      description: outline ? `${outline.beats.length} 个 beats` : '尚未生成章节契约',
    },
    {
      key: 'write',
      label: 'Write',
      status: isWriting ? 'running' : latestGeneratedText ? 'done' : 'idle',
      description: latestGeneratedText ? `${latestGeneratedText.length} 字生成结果` : '尚未生成章节初稿',
    },
    {
      key: 'style',
      label: 'Style',
      status: isStyling ? 'running' : styleResult ? 'done' : 'idle',
      description: settings.stylePrompt.trim()
        ? styleResult
          ? `${styleResult.appliedChanges.length} 条风格调整`
          : '尚未执行风格转译'
        : '未启用全局文风 Prompt',
    },
    {
      key: 'review',
      label: 'Review',
      status: isReviewing ? 'running' : reviewResult ? 'done' : 'idle',
      description: reviewResult
        ? `${reviewResult.overallSeverity} / ${reviewResult.checkerResults.length} 个 checker`
        : '尚未执行章节审查',
    },
    {
      key: 'polish',
      label: 'Polish',
      status: isPolishing ? 'running' : polishResult ? 'done' : 'idle',
      description: polishResult
        ? `${polishResult.appliedChanges.length} 条润色调整`
        : '尚未执行章节润色',
    },
    {
      key: 'extract',
      label: 'Extract',
      status: isExtracting ? 'running' : summary ? 'done' : 'idle',
      description: summary ? `${stateChanges.length} 条状态变更` : '尚未提取摘要与状态',
    },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
              <FlaskConical size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">生成实验室</h2>
              <p className="text-sm text-neutral-500">最小验证阶段 1 的 Plan → Write → Style → Review → Polish → Extract 流水线。</p>
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

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-5">
            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Play size={15} className="text-indigo-400" />
                当前流水线状态
              </div>
              <div className="grid gap-3">
                {stepCards.map((step) => (
                  <div
                    key={step.key}
                    className={`rounded-2xl border px-4 py-3 ${
                      step.status === 'running'
                        ? 'border-indigo-500/40 bg-indigo-500/10'
                        : step.status === 'done'
                          ? 'border-emerald-500/30 bg-emerald-500/10'
                          : 'border-neutral-800 bg-neutral-900/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-neutral-100">{step.label}</p>
                      <span className="text-xs text-neutral-500">
                        {step.status === 'running' ? '进行中' : step.status === 'done' ? '已完成' : '待执行'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-neutral-400">{step.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Layers3 size={15} className="text-indigo-400" />
                当前章节
              </div>
              <div className="space-y-2 text-sm text-neutral-400">
                <p className="text-neutral-100">{activeChapter.title}</p>
                <p>项目：{projectTitle}</p>
                <p>当前正文：{richTextToPlainText(content).trim().length} 字</p>
                <p>上一章摘要：{previousChapter ? previousChapter.title : '无'}</p>
              </div>
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <WandSparkles size={15} className="text-indigo-400" />
                生成动作
              </div>
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => void handleGeneratePlan()}
                  disabled={isPlanning || isWriting || isStyling || isReviewing || isPolishing || isExtracting}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles size={15} />
                  {isPlanning ? '生成契约中...' : '生成章节契约'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleWriteDraft()}
                  disabled={isPlanning || isWriting || isStyling || isExtracting}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <WandSparkles size={15} />
                  {isWriting ? '生成正文中...' : '生成章节初稿'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleStyleDraft()}
                  disabled={isPlanning || isWriting || isStyling || isReviewing || isPolishing || isExtracting}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles size={15} />
                  {isStyling ? '转译中...' : '执行风格转译'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleReviewDraft()}
                  disabled={isPlanning || isWriting || isStyling || isReviewing || isPolishing || isExtracting}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Layers3 size={15} />
                  {isReviewing ? '审查中...' : '执行章节审查'}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePolishDraft()}
                  disabled={isPlanning || isWriting || isStyling || isReviewing || isPolishing || isExtracting}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles size={15} />
                  {isPolishing ? '润色中...' : '执行章节润色'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExtractArtifacts()}
                  disabled={isPlanning || isWriting || isStyling || isReviewing || isPolishing || isExtracting}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={15} />
                  {isExtracting ? '提取中...' : '提取摘要与状态'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunPipeline()}
                  disabled={isPlanning || isWriting || isStyling || isReviewing || isPolishing || isExtracting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play size={15} />
                  一键运行 Plan → Write → Style → Review → Polish → Extract
                </button>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">最新章节契约</div>
              {!outline ? (
                <p className="text-sm text-neutral-500">当前还没有生成并保存的章节契约。</p>
              ) : (
                <div className="space-y-3 text-sm text-neutral-400">
                  <p><span className="text-neutral-500">目标：</span>{outline.goal}</p>
                  <p><span className="text-neutral-500">阻力：</span>{outline.obstacle}</p>
                  <p><span className="text-neutral-500">代价：</span>{outline.cost}</p>
                  <p><span className="text-neutral-500">Strand：</span>{outline.strand}</p>
                  <div>
                    <p className="text-neutral-500">Beats</p>
                    <div className="mt-2 space-y-2">
                      {outline.beats.map((beat, index) => (
                        <div key={`${outline.id}-${index}`} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-2">
                          {index + 1}. {beat}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">最新摘要提取</div>
              {!summary ? (
                <p className="text-sm text-neutral-500">当前还没有提取并保存的章节摘要。</p>
              ) : (
                <div className="space-y-3 text-sm text-neutral-400">
                  <p className="leading-6">{summary.summary}</p>
                  <p><span className="text-neutral-500">钩子：</span>{summary.hook}</p>
                  <div>
                    <p className="text-neutral-500">提取到的伏笔</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {summary.foreshadowings.length === 0 ? (
                        <span className="text-xs text-neutral-500">暂无</span>
                      ) : (
                        summary.foreshadowings.map((item) => (
                          <span key={item} className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300">
                            {item}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">风格转译结果</div>
              {!styleResult ? (
                <p className="text-sm text-neutral-500">
                  {settings.stylePrompt.trim() ? '当前还没有执行风格转译。' : '当前未启用全局文风 Prompt。'}
                </p>
              ) : (
                <div className="space-y-3 text-sm text-neutral-400">
                  <p className="leading-6">{styleResult.summary}</p>
                  <div>
                    <p className="text-neutral-500">本次调整</p>
                    <div className="mt-2 space-y-2">
                      {styleResult.appliedChanges.length === 0 ? (
                        <span className="text-xs text-neutral-500">暂无</span>
                      ) : (
                        styleResult.appliedChanges.map((item, index) => (
                          <div key={`${activeChapter.id}-style-${index}`} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-2">
                            {index + 1}. {item}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">章节审查结果</div>
              {!reviewResult ? (
                <p className="text-sm text-neutral-500">当前还没有执行章节审查。</p>
              ) : (
                <div className="space-y-3 text-sm text-neutral-400">
                  <p className="leading-6">{reviewResult.summary}</p>
                  <p><span className="text-neutral-500">严重级别：</span>{reviewResult.overallSeverity}</p>
                  <p><span className="text-neutral-500">建议重写：</span>{reviewResult.needsRewrite ? '是' : '否'}</p>
                  <p><span className="text-neutral-500">Anti-AI：</span>{reviewResult.antiAiForceCheck}</p>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">章节润色结果</div>
              {!polishResult ? (
                <p className="text-sm text-neutral-500">当前还没有执行章节润色。</p>
              ) : (
                <div className="space-y-3 text-sm text-neutral-400">
                  <p className="leading-6">{polishResult.summary}</p>
                  <p><span className="text-neutral-500">Anti-AI：</span>{polishResult.antiAiForceCheck}</p>
                  <div>
                    <p className="text-neutral-500">本次润色</p>
                    <div className="mt-2 space-y-2">
                      {polishResult.appliedChanges.length === 0 ? (
                        <span className="text-xs text-neutral-500">暂无</span>
                      ) : (
                        polishResult.appliedChanges.map((item, index) => (
                          <div key={`${activeChapter.id}-polish-${index}`} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-2">
                            {index + 1}. {item}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">状态变更</div>
              {stateChanges.length === 0 ? (
                <p className="text-sm text-neutral-500">当前还没有提取到结构化状态变更。</p>
              ) : (
                <div className="space-y-3">
                  {stateChanges.map((change) => (
                    <div key={change.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-400">
                      <p className="text-neutral-100">{change.entityName}</p>
                      <p className="mt-2">
                        <span className="text-neutral-500">{change.field}</span>
                        <span className="mx-2 text-neutral-600">：</span>
                        <span className="text-neutral-500">{change.oldValue || '空'}</span>
                        <span className="mx-2 text-neutral-600">→</span>
                        <span className="text-neutral-200">{change.newValue}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">Strand 轨迹</div>
              {!strandTracker || strandTracker.history.length === 0 ? (
                <p className="text-sm text-neutral-500">当前项目还没有 strand 历史。</p>
              ) : (
                <div className="space-y-3">
                  {strandTracker.history
                    .slice()
                    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
                    .slice(0, 6)
                    .map((entry) => (
                      <div key={`${entry.chapterId}-${entry.createdAt}`} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-400">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-neutral-100">{entry.chapterTitle}</p>
                          <span className="text-xs text-neutral-500">{formatRelativeTime(entry.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-xs text-indigo-300">{getStrandLabel(entry.strand)}</p>
                      </div>
                    ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">最近生成结果</div>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-xs leading-6 text-neutral-400">
                {latestGeneratedText || '当前还没有通过生成实验室写回正文的结果。'}
              </pre>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
