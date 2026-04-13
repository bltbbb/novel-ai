import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { BookOpen, Copy, Download, FileUp, Library, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import {
  cancelBookAnalysisJob,
  createBookAnalysisJob,
  extractEpubForBookAnalysis,
  getBookAnalysisJob,
  listBookAnalysisJobs,
  retryBookAnalysisJob,
} from '@/lib/generation-client';
import {
  cloneTemplateLibraryDraft,
  EMPTY_TEMPLATE_LIBRARY_DRAFT,
  joinTemplateList,
  joinTemplateTags,
  normalizeTemplateLibraryDraft,
  splitTemplateTags,
  splitTemplateTextList,
} from '@/lib/project-template';
import { buildModelRequestConfig } from '@/lib/runtime-config';
import { useSettingsStore, useTemplateLibraryStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { BookAnalysisJobRecord, BookAnalysisRange, Id, TemplateLibraryDraft } from '@/types';

interface TemplateLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  variant?: 'dialog' | 'page';
}

function createBlankDraft() {
  return cloneTemplateLibraryDraft(EMPTY_TEMPLATE_LIBRARY_DRAFT);
}

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'template';
}

function formatJobStatus(status: BookAnalysisJobRecord['status']) {
  switch (status) {
    case 'pending':
      return '等待中';
    case 'running':
      return '分析中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

function formatJobStage(stage: BookAnalysisJobRecord['progressStage']) {
  switch (stage) {
    case 'pending':
      return '等待执行';
    case 'preprocessing':
      return '预处理';
    case 'light_analyzing':
      return '轻分析';
    case 'sampling':
      return '采样';
    case 'chunk_analyzing':
      return '分段分析';
    case 'aggregating':
      return '结果聚合';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    default:
      return stage;
  }
}

function formatAnalysisRange(range: BookAnalysisRange) {
  switch (range) {
    case 'opening':
      return '开篇';
    case 'middle':
      return '中段';
    case 'ending':
      return '结尾';
    case 'custom':
      return '自定义区间';
    case 'full':
    default:
      return '全文';
  }
}

export function TemplateLibraryDialog({
  open,
  onClose,
  variant = 'dialog',
}: TemplateLibraryDialogProps) {
  const templates = useTemplateLibraryStore((state) => state.templates);
  const loadTemplates = useTemplateLibraryStore((state) => state.loadTemplates);
  const createTemplate = useTemplateLibraryStore((state) => state.createTemplate);
  const updateTemplate = useTemplateLibraryStore((state) => state.updateTemplate);
  const deleteTemplate = useTemplateLibraryStore((state) => state.deleteTemplate);
  const settings = useSettingsStore((state) => state.settings);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateImportInputRef = useRef<HTMLInputElement>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id | null>(null);
  const [draft, setDraft] = useState<TemplateLibraryDraft>(createBlankDraft());
  const [analysisContent, setAnalysisContent] = useState('');
  const [importedAnalysisContent, setImportedAnalysisContent] = useState<string | null>(null);
  const [importedContentMeta, setImportedContentMeta] = useState<{
    kind: 'txt' | 'epub';
    fileName: string;
    contentLength: number;
    title?: string;
    chapterCount?: number;
  } | null>(null);
  const [analysisRange, setAnalysisRange] = useState<BookAnalysisRange>('full');
  const [rangeStartInput, setRangeStartInput] = useState('1');
  const [rangeEndInput, setRangeEndInput] = useState('20');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [jobs, setJobs] = useState<BookAnalysisJobRecord[]>([]);
  const [activeJobId, setActiveJobId] = useState<Id | null>(null);
  const [compareTemplateId, setCompareTemplateId] = useState<Id | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const compareTemplate = useMemo(
    () => templates.find((item) => item.id === compareTemplateId) ?? null,
    [compareTemplateId, templates],
  );
  useEffect(() => {
    if (!open) {
      return;
    }

    void loadTemplates();
    void listBookAnalysisJobs(settings.serverUrl)
      .then((nextJobs) => setJobs(nextJobs))
      .catch(() => undefined);
  }, [loadTemplates, open, settings.serverUrl]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const hasRunningJob = jobs.some((job) => job.status === 'pending' || job.status === 'running');

    if (!hasRunningJob) {
      return;
    }

    let cancelled = false;

    async function refreshJobs() {
      try {
        const nextJobs = await listBookAnalysisJobs(settings.serverUrl);

        if (cancelled) {
          return;
        }

        setJobs(nextJobs);

        if (activeJobId) {
          const matched = nextJobs.find((job) => job.id === activeJobId);

          if (!matched) {
            return;
          }

          if (matched.status === 'completed' && matched.result) {
            setDraft(cloneTemplateLibraryDraft(matched.result.template));
            setIsAnalyzing(false);
          }

          if (matched.status === 'failed') {
            setIsAnalyzing(false);
          }
        }
      } catch {
        // 轮询失败时保持静默，避免打扰用户当前编辑
      }
    }

    void refreshJobs();
    const timer = window.setInterval(() => {
      void refreshJobs();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJobId, jobs, open, settings.serverUrl]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!selectedTemplate) {
      return;
    }

    setDraft(cloneTemplateLibraryDraft(selectedTemplate));
  }, [open, selectedTemplate]);

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

  function handleCreateNew() {
    setSelectedTemplateId(null);
    setDraft(createBlankDraft());
  }

  function handleSelectTemplate(templateId: Id) {
    setSelectedTemplateId(templateId);
    if (compareTemplateId === templateId) {
      setCompareTemplateId(null);
    }
  }

  async function handleUploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      if (file.name.toLowerCase().endsWith('.epub')) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';

        for (let index = 0; index < bytes.length; index += 1) {
          binary += String.fromCharCode(bytes[index]);
        }

        const response = await extractEpubForBookAnalysis(settings.serverUrl, {
          fileName: file.name,
          contentBase64: btoa(binary),
        });

        setImportedAnalysisContent(response.content);
        setImportedContentMeta({
          kind: 'epub',
          fileName: file.name,
          title: response.title.trim() || undefined,
          chapterCount: response.chapterCount,
          contentLength: response.content.length,
        });

        if (!draft.sourceTitle.trim() && response.title.trim()) {
          updateDraft('sourceTitle', response.title.trim());
        }

        toast(`已提取 EPUB「${file.name}」，共 ${response.chapterCount} 章`, 'success');
        return;
      }

      const text = await file.text();
      setImportedAnalysisContent(text);
      setImportedContentMeta({
        kind: 'txt',
        fileName: file.name,
        contentLength: text.length,
      });
      toast(`已载入文件「${file.name}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`读取文件失败：${message}`, 'error');
    }
  }

  function handleClearImportedContent() {
    setImportedAnalysisContent(null);
    setImportedContentMeta(null);
  }

  async function handleImportTemplateFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsSaving(true);

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('模板文件不是有效对象');
      }

      const normalized = normalizeTemplateLibraryDraft(
        cloneTemplateLibraryDraft(parsed as Partial<TemplateLibraryDraft>),
      );

      if (!normalized.name) {
        throw new Error('模板文件缺少模板名称');
      }

      if (!normalized.sourceTitle) {
        throw new Error('模板文件缺少来源作品名');
      }

      const imported = await createTemplate(normalized);
      setSelectedTemplateId(imported.id);
      setDraft(cloneTemplateLibraryDraft(imported));
      toast(`已导入模板「${imported.name}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`导入模板失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAnalyze() {
    if (!draft.sourceTitle.trim()) {
      toast('请先填写来源作品名', 'warning');
      return;
    }

    const effectiveAnalysisContent = (importedAnalysisContent ?? analysisContent).trim();

    if (!effectiveAnalysisContent) {
      toast('请先粘贴作品文本或导入 txt / epub 文件', 'warning');
      return;
    }

    const rangeStartIndex =
      analysisRange === 'custom'
        ? Math.max(1, Math.trunc(Number(rangeStartInput.trim()) || 0))
        : undefined;
    const rangeEndIndex =
      analysisRange === 'custom'
        ? Math.max(rangeStartIndex ?? 1, Math.trunc(Number(rangeEndInput.trim()) || 0))
        : undefined;

    if (analysisRange === 'custom' && (!rangeStartIndex || !rangeEndIndex)) {
      toast('自定义区间请填写有效的起止章节序号', 'warning');
      return;
    }

    setIsAnalyzing(true);

    try {
      const job = await createBookAnalysisJob(settings.serverUrl, {
        sourceTitle: draft.sourceTitle.trim(),
        sourceAuthor: draft.sourceAuthor.trim() || undefined,
        content: effectiveAnalysisContent,
        analysisRange,
        rangeStartIndex,
        rangeEndIndex,
        ...buildModelRequestConfig(settings),
      });
      setActiveJobId(job.id);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      toast('拆书任务已创建，正在后台分析', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`拆书分析失败：${message}`, 'error');
      setIsAnalyzing(false);
    } finally {
      // 任务改为后台轮询，这里不主动结束 loading
    }
  }

  async function handleUseJobResult(jobId: Id) {
    try {
      const job = await getBookAnalysisJob(settings.serverUrl, jobId);
      setJobs((current) => current.map((item) => (item.id === job.id ? job : item)));
      setActiveJobId(job.id);

      if (!job.result) {
        toast('当前任务还没有可用结果', 'warning');
        return;
      }

      setDraft(cloneTemplateLibraryDraft(job.result.template));
      toast(`已载入任务「${job.sourceTitle}」的分析结果`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`读取任务结果失败：${message}`, 'error');
    }
  }

  async function handleCancelJob(jobId: Id) {
    try {
      const cancelled = await cancelBookAnalysisJob(settings.serverUrl, jobId);
      setJobs((current) => current.map((item) => (item.id === cancelled.id ? cancelled : item)));

      if (activeJobId === jobId) {
        setIsAnalyzing(false);
      }

      toast(`已取消任务「${cancelled.sourceTitle}」`, 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`取消任务失败：${message}`, 'error');
    }
  }

  async function handleRetryJob(jobId: Id) {
    try {
      const retried = await retryBookAnalysisJob(settings.serverUrl, jobId);
      setActiveJobId(retried.id);
      setJobs((current) => current.map((item) => (item.id === retried.id ? retried : item)));
      setIsAnalyzing(true);
      toast(`已重试任务「${retried.sourceTitle}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`重试任务失败：${message}`, 'error');
    }
  }

  async function handleSave() {
    const normalized = normalizeTemplateLibraryDraft(draft);

    if (!normalized.name) {
      toast('请填写模板名称', 'warning');
      return;
    }

    if (!normalized.sourceTitle) {
      toast('请填写来源作品名', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      const saved = selectedTemplateId
        ? await updateTemplate(selectedTemplateId, normalized)
        : await createTemplate(normalized);

      if (!saved) {
        throw new Error('模板不存在或已被删除');
      }

      setSelectedTemplateId(saved.id);
      setDraft(cloneTemplateLibraryDraft(saved));
      toast(`模板「${saved.name}」已保存`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存模板失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedTemplate) {
      return;
    }

    const confirmed = window.confirm(`确认删除模板「${selectedTemplate.name}」吗？`);

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteTemplate(selectedTemplate.id);
      handleCreateNew();
      toast(`已删除模板「${selectedTemplate.name}」`, 'warning');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`删除模板失败：${message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDuplicate() {
    const normalized = normalizeTemplateLibraryDraft(draft);

    if (!normalized.name) {
      toast('请先填写模板名称后再复制', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      const duplicated = await createTemplate({
        ...normalized,
        name: `${normalized.name}（副本）`,
      });
      setSelectedTemplateId(duplicated.id);
      setDraft(cloneTemplateLibraryDraft(duplicated));
      toast(`已复制模板「${duplicated.name}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`复制模板失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  function handleExport() {
    const normalized = normalizeTemplateLibraryDraft(draft);

    if (!normalized.name) {
      toast('当前模板还没有名称，无法导出', 'warning');
      return;
    }

    const blob = new Blob([JSON.stringify(normalized, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${sanitizeFileName(normalized.name)}.template.json`;
    document.body.append(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    toast(`已导出模板「${normalized.name}」`, 'success');
  }

  function updateDraft<K extends keyof TemplateLibraryDraft>(key: K, value: TemplateLibraryDraft[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function renderTextareaField(
    label: string,
    value: string,
    onChange: (value: string) => void,
    rows = 4,
    placeholder = '',
  ) {
    return (
      <label className="block">
        <span className="mb-2 block text-sm text-neutral-300">{label}</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
        />
      </label>
    );
  }

  function renderSubTemplateEditor(
    subTemplateKey: 'opening' | 'middle' | 'climax' | 'ending',
    label: string,
  ) {
    const subTemplate = draft.subTemplates[subTemplateKey];

    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
        <div className="mb-4 text-sm font-medium text-neutral-200">{label}</div>
        <div className="grid gap-4 md:grid-cols-2">
          {renderTextareaField(`${label}摘要`, subTemplate.summary, (value) =>
            updateDraft('subTemplates', {
              ...draft.subTemplates,
              [subTemplateKey]: {
                ...subTemplate,
                summary: value,
              },
            }),
          )}
          {renderTextareaField(`${label}适用说明`, subTemplate.usage, (value) =>
            updateDraft('subTemplates', {
              ...draft.subTemplates,
              [subTemplateKey]: {
                ...subTemplate,
                usage: value,
              },
            }),
          )}
          {renderTextareaField(`${label}节拍 Prompt`, subTemplate.promptBundle.beatPrompt, (value) =>
            updateDraft('subTemplates', {
              ...draft.subTemplates,
              [subTemplateKey]: {
                ...subTemplate,
                promptBundle: {
                  ...subTemplate.promptBundle,
                  beatPrompt: value,
                },
              },
            }),
          )}
          {renderTextareaField(`${label}正文 Prompt`, subTemplate.promptBundle.writingPrompt, (value) =>
            updateDraft('subTemplates', {
              ...draft.subTemplates,
              [subTemplateKey]: {
                ...subTemplate,
                promptBundle: {
                  ...subTemplate.promptBundle,
                  writingPrompt: value,
                },
              },
            }),
          )}
          {renderTextareaField(`${label}文风 Prompt`, subTemplate.promptBundle.stylePrompt, (value) =>
            updateDraft('subTemplates', {
              ...draft.subTemplates,
              [subTemplateKey]: {
                ...subTemplate,
                promptBundle: {
                  ...subTemplate.promptBundle,
                  stylePrompt: value,
                },
              },
            }),
          )}
          {renderTextareaField(`${label}负面约束`, subTemplate.promptBundle.negativePrompt, (value) =>
            updateDraft('subTemplates', {
              ...draft.subTemplates,
              [subTemplateKey]: {
                ...subTemplate,
                promptBundle: {
                  ...subTemplate.promptBundle,
                  negativePrompt: value,
                },
              },
            }),
          )}
        </div>
      </div>
    );
  }

  const containerClassName =
    variant === 'page'
      ? 'flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/30'
      : 'flex max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40';

  const content = (
    <div className={containerClassName}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.epub,text/plain,application/epub+zip"
        onChange={(event) => void handleUploadFile(event)}
        className="hidden"
      />
      <input
        ref={templateImportInputRef}
        type="file"
        accept="application/json,.json,.template.json"
        onChange={(event) => void handleImportTemplateFile(event)}
        className="hidden"
      />
      <aside className="flex w-[320px] flex-shrink-0 flex-col border-r border-neutral-800 bg-neutral-950/70">
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
                <Library size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-100">模板库</h2>
                <p className="text-sm text-neutral-500">保存拆书沉淀下来的创作模板。</p>
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

          <div className="border-b border-neutral-800 px-5 py-4">
            <button
              type="button"
              onClick={handleCreateNew}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <Plus size={15} />
              新建模板
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-800 px-4 py-6 text-sm leading-6 text-neutral-500">
                还没有模板。可以先在右侧导入文本，做一次拆书分析后保存。
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => {
                  const active = template.id === selectedTemplateId;

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleSelectTemplate(template.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                        active
                          ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-100'
                          : 'border-neutral-800 bg-neutral-950/40 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900/70'
                      }`}
                    >
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {template.sourceTitle}
                        {template.sourceAuthor ? ` / ${template.sourceAuthor}` : ''}
                      </p>
                      <p className="mt-3 line-clamp-3 text-xs leading-6 text-neutral-400">{template.summary || '暂无摘要'}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
            <section className="space-y-5 rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                  <BookOpen size={15} className="text-indigo-400" />
                  拆书分析
                </div>
                <p className="mt-2 text-xs leading-6 text-neutral-500">
                  当前已接入拆书任务制。支持粘贴作品文本或导入 `.txt / .epub`，服务端会按片段采样后在后台分析并生成模板草稿。
                </p>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm text-neutral-300">来源作品名</span>
                <input
                  value={draft.sourceTitle}
                  onChange={(event) => updateDraft('sourceTitle', event.target.value)}
                  placeholder="例如：某部网文作品名"
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-neutral-300">作者名</span>
                <input
                  value={draft.sourceAuthor}
                  onChange={(event) => updateDraft('sourceAuthor', event.target.value)}
                  placeholder="可选"
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-neutral-300">分析范围</span>
                <select
                  value={analysisRange}
                  onChange={(event) => setAnalysisRange(event.target.value as BookAnalysisRange)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                >
                  <option value="full">全文</option>
                  <option value="opening">开篇</option>
                  <option value="middle">中段</option>
                  <option value="ending">结尾</option>
                  <option value="custom">自定义区间</option>
                </select>
              </label>

              {analysisRange === 'custom' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm text-neutral-300">起始章节序号</span>
                    <input
                      value={rangeStartInput}
                      onChange={(event) => setRangeStartInput(event.target.value)}
                      placeholder="例如：1"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm text-neutral-300">结束章节序号</span>
                    <input
                      value={rangeEndInput}
                      onChange={(event) => setRangeEndInput(event.target.value)}
                      placeholder="例如：20"
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                    />
                  </label>
                </div>
              ) : null}

              <label className="block">
                <span className="mb-2 block text-sm text-neutral-300">作品文本</span>
                <textarea
                  value={analysisContent}
                  onChange={(event) => setAnalysisContent(event.target.value)}
                  rows={14}
                  placeholder="用于手动粘贴作品正文。大文件请直接导入 txt / epub，导入内容不会回填到文本框。"
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                />
              </label>

              {importedContentMeta ? (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-xs leading-6 text-neutral-400">
                  <p className="text-sm text-neutral-200">已导入文件</p>
                  <p className="mt-2">类型：{importedContentMeta.kind === 'epub' ? 'EPUB' : 'TXT'}</p>
                  <p>文件名：{importedContentMeta.fileName}</p>
                  {importedContentMeta.title ? <p>书名：{importedContentMeta.title}</p> : null}
                  {typeof importedContentMeta.chapterCount === 'number' ? <p>章节数：{importedContentMeta.chapterCount}</p> : null}
                  <p>内容长度：{importedContentMeta.contentLength} 字</p>
                  <p className="mt-2 text-neutral-500">
                    导入内容只保存在内存中用于拆书分析，不回填到文本框，避免大文本导致页面卡顿。
                  </p>
                  <button
                    type="button"
                    onClick={handleClearImportedContent}
                    className="mt-3 rounded-full border border-neutral-700 px-3 py-1.5 text-[11px] text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                  >
                    清除导入内容
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                >
                  <FileUp size={15} />
                  导入 txt / epub
                </button>
                <button
                  type="button"
                  onClick={() => void handleAnalyze()}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles size={15} />
                  {isAnalyzing ? '分析中...' : '开始拆书'}
                </button>
                <button
                  type="button"
                  onClick={() => templateImportInputRef.current?.click()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FileUp size={15} />
                  导入模板
                </button>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-xs leading-6 text-neutral-400">
                <p>当前模型：{settings.modelName}</p>
                <p>后端地址：{settings.serverUrl}</p>
                {draft.analysisMeta ? (
                  <>
                    <p>分析方式：{draft.analysisMeta.method}</p>
                    <p>总片段：{draft.analysisMeta.totalSegments}</p>
                    <p>采样片段：{draft.analysisMeta.sampledSegments}</p>
                    <p>估算字数：{draft.analysisMeta.estimatedWordCount}</p>
                    <p>段落数：{draft.analysisMeta.paragraphCount ?? '暂无'}</p>
                    <p>平均段长：{draft.analysisMeta.averageParagraphLength ?? '暂无'}</p>
                    <p>对白段占比：{draft.analysisMeta.dialogueParagraphRatio ?? '暂无'}</p>
                    <p>章节标题片段数：{draft.analysisMeta.headingSegmentCount ?? '暂无'}</p>
                    <p>叙事视角倾向：{draft.analysisMeta.dominantPerspective ?? '暂无'}</p>
                    <p>高频转折词：{draft.analysisMeta.topTransitionWords?.join('，') || '暂无'}</p>
                    {draft.analysisMeta.evidenceSnippets && draft.analysisMeta.evidenceSnippets.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-neutral-300">采样证据</p>
                        {draft.analysisMeta.evidenceSnippets.map((snippet, index) => (
                          <div key={`${snippet.title}-${index}`} className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                            <p className="text-neutral-200">{snippet.title}</p>
                            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-neutral-500">
                              {snippet.excerpt}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>当前还没有分析结果。</p>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                <div className="mb-3 text-sm font-medium text-neutral-200">拆书任务</div>
                {jobs.length === 0 ? (
                  <p className="text-xs leading-6 text-neutral-500">当前还没有拆书任务。</p>
                ) : (
                  <div className="space-y-3">
                    {jobs.slice(0, 6).map((job) => {
                      const active = job.id === activeJobId;

                      return (
                        <div
                          key={job.id}
                          className={`rounded-2xl border px-4 py-3 text-xs ${
                            active
                              ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-100'
                              : 'border-neutral-800 bg-neutral-950/40 text-neutral-400'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-neutral-200">{job.sourceTitle}</p>
                              <p className="mt-1 text-neutral-500">
                                {formatJobStatus(job.status)} / {formatJobStage(job.progressStage)}
                              </p>
                              <p className="mt-1 text-neutral-500">
                                范围：
                                {job.analysisRange === 'custom'
                                  ? `第 ${job.rangeStartIndex ?? 1} - ${job.rangeEndIndex ?? job.rangeStartIndex ?? 1} 章`
                                  : formatAnalysisRange(job.analysisRange)}
                              </p>
                            </div>
                            <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-400">
                              {job.progressPercent}%
                            </span>
                          </div>
                          <p className="mt-2 leading-6 text-neutral-500">{job.message || '暂无说明'}</p>
                          {job.sampledSegments > 0 ? (
                            <p className="mt-1 text-neutral-500">
                              片段 {job.finishedSegments}/{job.sampledSegments}
                            </p>
                          ) : null}
                          {job.errorMessage ? (
                            <p className="mt-1 text-red-300">{job.errorMessage}</p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleUseJobResult(job.id)}
                              className="rounded-full border border-neutral-700 px-3 py-1.5 text-[11px] text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                            >
                              使用结果
                            </button>
                            {(job.status === 'pending' || job.status === 'running') ? (
                              <button
                                type="button"
                                onClick={() => void handleCancelJob(job.id)}
                                className="rounded-full border border-neutral-700 px-3 py-1.5 text-[11px] text-neutral-300 transition-colors hover:border-red-500/40 hover:bg-red-500/10"
                              >
                                取消任务
                              </button>
                            ) : null}
                            {(job.status === 'failed' || job.status === 'cancelled') ? (
                              <button
                                type="button"
                                onClick={() => void handleRetryJob(job.id)}
                                className="rounded-full border border-neutral-700 px-3 py-1.5 text-[11px] text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                              >
                                重试任务
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-5 rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-neutral-200">模板编辑</div>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">
                    拆书结果会先落到这里。你可以手工修改后再保存进模板库。
                  </p>
                </div>
                {selectedTemplate ? (
                  <div className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-neutral-400">
                    编辑中：{selectedTemplate.name}
                  </div>
                ) : (
                  <div className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-neutral-400">
                    新模板
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-neutral-300">模板对比</span>
                  <select
                    value={compareTemplateId ?? ''}
                    onChange={(event) => setCompareTemplateId(event.target.value || null)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  >
                    <option value="">不对比</option>
                    {templates
                      .filter((template) => template.id !== selectedTemplateId)
                      .map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                  </select>
                </label>

                {compareTemplate ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4 text-xs leading-6 text-neutral-400">
                      <p className="text-sm text-neutral-200">当前编辑模板</p>
                      <p className="mt-2 text-neutral-300">{draft.name || '未命名模板'}</p>
                      <p className="mt-2">摘要：{draft.summary || '暂无'}</p>
                      <p className="mt-2">叙事：{draft.narrativeStyle || '暂无'}</p>
                      <p className="mt-2">节奏：{draft.pacingStyle || '暂无'}</p>
                      <p className="mt-2">冲突：{draft.conflictStyle || '暂无'}</p>
                      <p className="mt-2">正文 Prompt：{draft.promptBundle.writingPrompt || '暂无'}</p>
                      <p className="mt-2">文风 Prompt：{draft.promptBundle.stylePrompt || '暂无'}</p>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4 text-xs leading-6 text-neutral-400">
                      <p className="text-sm text-neutral-200">对比模板</p>
                      <p className="mt-2 text-neutral-300">{compareTemplate.name}</p>
                      <p className="mt-2">摘要：{compareTemplate.summary || '暂无'}</p>
                      <p className="mt-2">叙事：{compareTemplate.narrativeStyle || '暂无'}</p>
                      <p className="mt-2">节奏：{compareTemplate.pacingStyle || '暂无'}</p>
                      <p className="mt-2">冲突：{compareTemplate.conflictStyle || '暂无'}</p>
                      <p className="mt-2">正文 Prompt：{compareTemplate.promptBundle.writingPrompt || '暂无'}</p>
                      <p className="mt-2">文风 Prompt：{compareTemplate.promptBundle.stylePrompt || '暂无'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-6 text-neutral-500">
                    选择另一条模板后，这里会显示两条模板的摘要、风格与关键 Prompt 对比。
                  </p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm text-neutral-300">模板名称</span>
                  <input
                    value={draft.name}
                    onChange={(event) => updateDraft('name', event.target.value)}
                    placeholder="例如：强钩子升级流模板"
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm text-neutral-300">标签</span>
                  <input
                    value={joinTemplateTags(draft.tags)}
                    onChange={(event) => updateDraft('tags', splitTemplateTags(event.target.value))}
                    placeholder="例如：升级流，强节奏，爆点密集"
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                  />
                </label>
              </div>

              {renderTextareaField('模板摘要', draft.summary, (value) => updateDraft('summary', value), 4)}
              {renderTextareaField('叙事风格', draft.narrativeStyle, (value) => updateDraft('narrativeStyle', value), 4)}
              {renderTextareaField('节奏风格', draft.pacingStyle, (value) => updateDraft('pacingStyle', value), 4)}
              {renderTextareaField('冲突设计', draft.conflictStyle, (value) => updateDraft('conflictStyle', value), 4)}
              {renderTextareaField('人物塑造', draft.characterStyle, (value) => updateDraft('characterStyle', value), 4)}
              {renderTextareaField('对白习惯', draft.dialogueStyle, (value) => updateDraft('dialogueStyle', value), 4)}
              {renderTextareaField('开头写法', draft.openingStyle, (value) => updateDraft('openingStyle', value), 4)}
              {renderTextareaField('结尾钩子', draft.endingHookStyle, (value) => updateDraft('endingHookStyle', value), 4)}

              <div className="grid gap-4 md:grid-cols-2">
                {renderTextareaField(
                  '常见推进套路',
                  joinTemplateList(draft.commonPatterns),
                  (value) => updateDraft('commonPatterns', splitTemplateTextList(value)),
                  6,
                  '每行一条',
                )}
                {renderTextareaField(
                  '避免写法',
                  joinTemplateList(draft.forbiddenPatterns),
                  (value) => updateDraft('forbiddenPatterns', splitTemplateTextList(value)),
                  6,
                  '每行一条',
                )}
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
                <div className="mb-4 text-sm font-medium text-neutral-200">生成提示词包</div>
                <div className="grid gap-4 md:grid-cols-2">
                  {renderTextareaField('书纲 Prompt', draft.promptBundle.bookOutlinePrompt, (value) =>
                    updateDraft('promptBundle', {
                      ...draft.promptBundle,
                      bookOutlinePrompt: value,
                    }),
                  )}
                  {renderTextareaField('卷纲 Prompt', draft.promptBundle.volumeOutlinePrompt, (value) =>
                    updateDraft('promptBundle', {
                      ...draft.promptBundle,
                      volumeOutlinePrompt: value,
                    }),
                  )}
                  {renderTextareaField('里程碑 Prompt', draft.promptBundle.milestonePrompt, (value) =>
                    updateDraft('promptBundle', {
                      ...draft.promptBundle,
                      milestonePrompt: value,
                    }),
                  )}
                  {renderTextareaField('节拍 Prompt', draft.promptBundle.beatPrompt, (value) =>
                    updateDraft('promptBundle', {
                      ...draft.promptBundle,
                      beatPrompt: value,
                    }),
                  )}
                  {renderTextareaField('正文 Prompt', draft.promptBundle.writingPrompt, (value) =>
                    updateDraft('promptBundle', {
                      ...draft.promptBundle,
                      writingPrompt: value,
                    }),
                  )}
                  {renderTextareaField('风格 Prompt', draft.promptBundle.stylePrompt, (value) =>
                    updateDraft('promptBundle', {
                      ...draft.promptBundle,
                      stylePrompt: value,
                    }),
                  )}
                </div>
                <div className="mt-4">
                  {renderTextareaField('负面约束 Prompt', draft.promptBundle.negativePrompt, (value) =>
                    updateDraft('promptBundle', {
                      ...draft.promptBundle,
                      negativePrompt: value,
                    }),
                  )}
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                <div className="text-sm font-medium text-neutral-200">子模板</div>
                <p className="text-xs leading-6 text-neutral-500">
                  用于把整本拆书结果进一步拆成开篇、中段、爆点、收尾四段写法模板。
                </p>
                <div className="grid gap-4">
                  {renderSubTemplateEditor('opening', '开篇模板')}
                  {renderSubTemplateEditor('middle', '中段模板')}
                  {renderSubTemplateEditor('climax', '爆点模板')}
                  {renderSubTemplateEditor('ending', '收尾模板')}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={15} />
                  {isSaving ? '保存中...' : '保存到模板库'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDuplicate()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Copy size={15} />
                  复制模板
                </button>
                <button
                  type="button"
                  onClick={() => handleExport()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                >
                  <Download size={15} />
                  导出模板
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={!selectedTemplate || isDeleting}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:border-red-500/40 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={15} />
                  {isDeleting ? '删除中...' : '删除模板'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
  );

  if (variant === 'page') {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      {content}
    </div>
  );
}
