import { useEffect, useState } from 'react';
import { Check, ClipboardList, Copy, LoaderCircle, RefreshCw, Sparkles, X } from 'lucide-react';
import type { GenerationPromptPreviewItem } from '@/types';

export interface GenerationContextPreviewData {
  chapterTitle: string;
  bookOutline: string;
  volumeOutline: string;
  volumeGoal: string;
  chapterOutline: string;
  localBundle: string;
  effectiveHint: string;
  mergedBundle: string;
  rawChapterHint: string;
  chapterBeat: string;
  nextChapterPreview: string;
  forbiddenZone: string;
  previousSummary: string;
  worldState: string;
  requiredEntityNames: string[];
  availableCharacterNames: string[];
  requiredForeshadowTitles: string[];
  entitySnapshotCount: number;
  relationSnapshotCount: number;
  foreshadowSnapshotCount: number;
  recentChapterCount: number;
  recentSummaryCount: number;
  activeForeshadowCount: number;
  promptPreviews: GenerationPromptPreviewItem[];
}

interface GenerationContextPreviewDialogProps {
  open: boolean;
  loading: boolean;
  error: string;
  preview: GenerationContextPreviewData | null;
  onClose: () => void;
  onRefresh: () => void;
}

function renderTextList(values: string[], emptyText: string) {
  if (values.length === 0) {
    return <p className="mt-2 text-sm text-neutral-500">{emptyText}</p>;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-1 text-xs text-neutral-200"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function formatTransportLabel(transport: GenerationPromptPreviewItem['transport']) {
  return transport === 'claude_messages' ? 'Claude Messages' : 'OpenAI Chat Completions';
}

function joinTextList(values: string[]) {
  return values.join('、');
}

function buildPromptPreviewStageText(item: GenerationPromptPreviewItem) {
  return [
    `阶段：${item.label}`,
    `模型：${item.model}`,
    `传输方式：${formatTransportLabel(item.transport)}`,
    `请求地址：${item.requestUrl}`,
    '',
    'System Prompt：',
    item.systemPrompt || '当前没有单独的 systemPrompt。',
    '',
    'User Prompt：',
    item.userPrompt || '当前没有可展示的 userPrompt。',
    '',
    '最终请求体：',
    item.requestBody,
  ].join('\n');
}

export function GenerationContextPreviewDialog({
  open,
  loading,
  error,
  preview,
  onClose,
  onRefresh,
}: GenerationContextPreviewDialogProps) {
  const [copiedKey, setCopiedKey] = useState('');

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

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setCopiedKey('');
    }, 1600);

    return () => window.clearTimeout(timerId);
  }, [copiedKey]);

  async function handleCopy(key: string, text: string) {
    const normalized = text.trim();

    if (!normalized) {
      return;
    }

    try {
      await navigator.clipboard.writeText(normalized);
      setCopiedKey(key);
    } catch {
      setCopiedKey('');
    }
  }

  function renderCopyButton(key: string, text: string) {
    const canCopy = Boolean(text.trim());
    const copied = copiedKey === key;

    return (
      <button
        type="button"
        onClick={() => {
          void handleCopy(key, text);
        }}
        disabled={!canCopy}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? '已复制' : '复制'}
      </button>
    );
  }

  function renderBlockHeader(title: string, key: string, text: string) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{title}</p>
        {renderCopyButton(key, text)}
      </div>
    );
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generation-context-preview-title"
        className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
              <ClipboardList size={18} />
            </div>
            <div>
              <h2 id="generation-context-preview-title" className="text-lg font-semibold text-neutral-100">生成前上下文预检</h2>
              <p className="text-sm text-neutral-500">
                这里展示当前“生成本章 / 重新生成”会带入的文本上下文，以及同时随行提交的结构化快照概览。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {loading ? '刷新中...' : '刷新预检'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              aria-label="关闭生成前上下文预检"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm leading-6 text-red-200">
              读取预检数据失败：{error}
            </div>
          ) : null}

          {loading && !preview ? (
            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/30 p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-indigo-300">
                <LoaderCircle size={22} className="animate-spin" />
              </div>
              <h3 className="mt-4 text-lg font-medium text-neutral-100">正在整理预检内容</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                正在读取当前章节的上下文包、重点人物和结构化快照，请稍候。
              </p>
            </div>
          ) : null}

          {!preview && !loading ? (
            <div className="rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/30 p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-indigo-300">
                <Sparkles size={22} />
              </div>
              <h3 className="mt-4 text-lg font-medium text-neutral-100">还没有可显示的预检内容</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                点击右上角“刷新预检”，会重新读取当前章节准备送进生成链路的上下文。
              </p>
            </div>
          ) : null}

          {preview ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-4 text-sm leading-6 text-indigo-100">
                <p className="font-medium">当前章节：{preview.chapterTitle}</p>
                <p className="mt-2 text-indigo-100/85">
                  文本上下文会先以 `contextBundle` 形式从页面发出；服务端随后还会额外叠加实体、关系、伏笔等结构化快照一起参与生成。
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">最近正文</p>
                  <p className="mt-2 text-sm text-neutral-200">{preview.recentChapterCount} 章</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">最近摘要</p>
                  <p className="mt-2 text-sm text-neutral-200">{preview.recentSummaryCount} 章</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">激活伏笔</p>
                  <p className="mt-2 text-sm text-neutral-200">{preview.activeForeshadowCount} 条</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">实体快照</p>
                  <p className="mt-2 text-sm text-neutral-200">{preview.entitySnapshotCount} 条</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">显式关系</p>
                  <p className="mt-2 text-sm text-neutral-200">{preview.relationSnapshotCount} 条</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">伏笔快照</p>
                  <p className="mt-2 text-sm text-neutral-200">{preview.foreshadowSnapshotCount} 条</p>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-5">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    {renderBlockHeader('最终发送的 contextBundle', 'merged-bundle', preview.mergedBundle)}
                    <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-4 text-xs leading-6 text-neutral-200">
                      {preview.mergedBundle || '当前没有可发送的文本上下文。'}
                    </pre>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      {renderBlockHeader('全书大纲', 'book-outline', preview.bookOutline)}
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-4 text-xs leading-6 text-neutral-300">
                        {preview.bookOutline || '当前没有全书大纲。'}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      {renderBlockHeader('当前卷大纲', 'volume-outline', preview.volumeOutline)}
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-4 text-xs leading-6 text-neutral-300">
                        {preview.volumeOutline || '当前没有卷纲。'}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      {renderBlockHeader('基础上下文包', 'local-bundle', preview.localBundle)}
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-4 text-xs leading-6 text-neutral-300">
                        {preview.localBundle || '当前基础上下文为空。'}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      {renderBlockHeader('追加提示层', 'effective-hint', preview.effectiveHint)}
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-4 text-xs leading-6 text-neutral-300">
                        {preview.effectiveHint || '当前没有额外提示或模板约束会作为文本上下文追加。'}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    {renderBlockHeader('当前卷目标', 'volume-goal', preview.volumeGoal)}
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                      {preview.volumeGoal || '当前没有卷目标。'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    {renderBlockHeader('章纲', 'chapter-outline', preview.chapterOutline)}
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-4 text-xs leading-6 text-neutral-300">
                      {preview.chapterOutline || '当前还没有章纲。'}
                    </pre>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    {renderBlockHeader('重点实体', 'required-entities', joinTextList(preview.requiredEntityNames))}
                    {renderTextList(preview.requiredEntityNames, '当前没有强制落地实体。')}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    {renderBlockHeader('候选出场人物', 'available-characters', joinTextList(preview.availableCharacterNames))}
                    {renderTextList(preview.availableCharacterNames, '当前没有额外候选人物。')}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    {renderBlockHeader('本章节拍', 'chapter-beat', preview.chapterBeat)}
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-4 text-xs leading-6 text-neutral-300">
                      {preview.chapterBeat || '当前没有读取到已保存章节拍；如果你刚在大纲页手改过章节拍，请先点“保存本拍”。'}
                    </pre>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      {renderBlockHeader('下章预告', 'next-chapter-preview', preview.nextChapterPreview)}
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                        {preview.nextChapterPreview || '当前没有可用的下章预告。'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      {renderBlockHeader('本章禁区', 'forbidden-zone', preview.forbiddenZone)}
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                        {preview.forbiddenZone || '当前没有禁用短语或场景模板。'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    {renderBlockHeader('必须落地的伏笔', 'required-foreshadows', joinTextList(preview.requiredForeshadowTitles))}
                    {renderTextList(preview.requiredForeshadowTitles, '当前没有强制要求落地的伏笔。')}
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    {renderBlockHeader('当前世界状态', 'world-state', preview.worldState)}
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                      {preview.worldState || '当前没有可用的世界状态摘要。'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    {renderBlockHeader('手工填写的本章提示', 'raw-chapter-hint', preview.rawChapterHint)}
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                      {preview.rawChapterHint || '当前没有手工填写额外提示。'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-indigo-300">后端最终 Prompt</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                      这里展示后端真正送去模型的 `systemPrompt`、`userPrompt`，以及对应的最终请求体预览。
                    </p>
                  </div>
                  <span className="rounded-full border border-indigo-500/30 px-3 py-1 text-xs text-indigo-200">
                    {preview.promptPreviews.length} 项
                  </span>
                </div>

                {preview.promptPreviews.length === 0 ? (
                  <p className="mt-4 text-sm text-neutral-500">当前阶段还没有可展示的完整 Prompt。</p>
                ) : (
                  <div className="mt-5 space-y-5">
                    {preview.promptPreviews.map((item) => (
                      <section
                        key={`${item.stage}-${item.label}`}
                        className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200">
                              {item.label}
                            </span>
                            <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300">
                              {item.model}
                            </span>
                            <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300">
                              {formatTransportLabel(item.transport)}
                            </span>
                          </div>
                          {renderCopyButton(`prompt-stage-${item.stage}-${item.label}`, buildPromptPreviewStageText(item))}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">请求地址</p>
                          {renderCopyButton(`prompt-url-${item.stage}-${item.label}`, item.requestUrl)}
                        </div>
                        <p className="mt-2 break-all text-sm leading-6 text-neutral-300">{item.requestUrl}</p>

                        <div className="mt-4 grid gap-4 xl:grid-cols-2">
                          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
                            {renderBlockHeader('System Prompt', `prompt-system-${item.stage}-${item.label}`, item.systemPrompt)}
                            <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-neutral-200">
                              {item.systemPrompt || '当前没有单独的 systemPrompt。'}
                            </pre>
                          </div>
                          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
                            {renderBlockHeader('User Prompt', `prompt-user-${item.stage}-${item.label}`, item.userPrompt)}
                            <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-neutral-200">
                              {item.userPrompt || '当前没有可展示的 userPrompt。'}
                            </pre>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
                          {renderBlockHeader('最终请求体', `prompt-body-${item.stage}-${item.label}`, item.requestBody)}
                          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-neutral-200">
                            {item.requestBody}
                          </pre>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
