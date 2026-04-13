import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BookOpen, Pin, Search, Sparkles } from 'lucide-react';
import { assembleContinueWritingContext } from '@/lib/context-assembler';
import { retrieveChapterSearchResults } from '@/lib/chapter-search';
import { analyzeLoreConsistency } from '@/lib/lore-consistency';
import { withProjectStylePrompt } from '@/lib/project-style';
import { estimateTextTokens } from '@/lib/token-counter';
import { useEditorStore, useLoreStore, useProjectStore, useSettingsStore } from '@/stores';
import { createId } from '@/lib/identity';
import { richTextToPlainText } from '@/lib/editor-content';
import type { Id, RichTextDocument, SearchResult } from '@/types';

interface ContextInspectorProps {
  projectId: Id;
  chapterId?: Id;
  chapterTitle: string;
  content: RichTextDocument;
  isAiWriting: boolean;
}

export function ContextInspector({
  projectId,
  chapterId,
  chapterTitle,
  content,
  isAiWriting,
}: ContextInspectorProps) {
  const chapters = useEditorStore((state) => state.chapters);
  const entities = useLoreStore((state) => state.entities);
  const settings = useSettingsStore((state) => state.settings);
  const currentProject = useProjectStore((state) => state.projects.find((project) => project.id === projectId) ?? null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'ready' | 'degraded'>('idle');

  const preview = useMemo(() => {
    return assembleContinueWritingContext({
      projectId,
      chapterId,
      chapterTitle,
      content,
      settings: withProjectStylePrompt(settings, currentProject),
      entities,
      searchResults,
      messageId: createId(),
      maxReferences: 6,
    });
  }, [chapterId, chapterTitle, content, currentProject, entities, projectId, searchResults, settings]);

  const plainText = richTextToPlainText(content);
  const contentTokens = estimateTextTokens(plainText);
  const pinnedCount = entities.filter((entity) => entity.pinned).length;
  const consistencyHints = useMemo(() => {
    return analyzeLoreConsistency({
      content,
      matchedEntities: preview.matchedEntities,
      allEntities: entities,
      searchResults: preview.searchResults,
    });
  }, [content, entities, preview.matchedEntities, preview.searchResults]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSearchResults() {
      setSearchState('loading');

      try {
        const results = await retrieveChapterSearchResults({
          serverUrl: settings.serverUrl,
          projectId,
          chapterId,
          content,
          chapters,
          topK: 3,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setSearchResults(results);
        setSearchState('ready');
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setSearchResults([]);
        setSearchState('degraded');
      }
    }

    void loadSearchResults();

    return () => {
      controller.abort();
    };
  }, [chapterId, chapters, content, projectId, settings.serverUrl]);

  return (
    <aside className="hidden w-80 flex-shrink-0 flex-col overflow-hidden border-l border-neutral-800 bg-neutral-950/70 2xl:flex">
      <div className="border-b border-neutral-800 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
          <Activity size={15} className="text-indigo-400" />
          AI 监控面板
        </div>
        <p className="mt-2 text-xs leading-6 text-neutral-500">
          实时展示 AI 续写时的上下文组装情况。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <section className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-neutral-200">
            <Sparkles size={14} className="text-indigo-400" />
            当前状态
          </div>
          <div className="space-y-2 text-xs text-neutral-400">
            <p>模型：{settings.modelName}</p>
            <p>温度：{settings.temperature}</p>
            <p>思考等级：{settings.reasoningEffort === 'model_default' ? '模型默认' : settings.reasoningEffort}</p>
            <p>服务端：{settings.serverUrl}</p>
            <p className={isAiWriting ? 'text-indigo-300' : 'text-neutral-400'}>
              AI 状态：{isAiWriting ? '续写中' : '待命'}
            </p>
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-neutral-200">
            <BookOpen size={14} className="text-indigo-400" />
            Token 预估
          </div>
          <div className="space-y-2 text-xs text-neutral-400">
            <p>正文预估：{contentTokens}</p>
            <p>总 prompt 预估：{preview.estimatedPromptTokens}</p>
            <p>参考条目数：{preview.references.length}</p>
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-neutral-200">
            <Search size={14} className="text-indigo-400" />
            历史检索
          </div>
          <div className="space-y-2 text-xs text-neutral-400">
            <p>
              检索状态：
              {searchState === 'loading'
                ? '检索中'
                : searchState === 'degraded'
                  ? '已降级'
                  : '可用'}
            </p>
            <p>命中条数：{preview.searchResults.length}</p>
            {preview.searchResults.length === 0 ? (
              <p className="text-neutral-500">
                {searchState === 'degraded' ? '检索不可用，当前已回退为 Lite 上下文。' : '当前没有命中的历史章节片段。'}
              </p>
            ) : (
              preview.searchResults.map((result) => (
                <div key={`${result.chapterId}-${result.score}`} className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-neutral-200">{result.chapterTitle}</p>
                    <span className="text-[11px] text-neutral-500">score {result.score.toFixed(2)}</span>
                  </div>
                  <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-neutral-500">{result.snippet}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-neutral-200">
            <AlertTriangle size={14} className="text-indigo-400" />
            一致性提示
          </div>
          <div className="space-y-3 text-xs text-neutral-400">
            {consistencyHints.length === 0 ? (
              <p className="text-neutral-500">当前没有明显的一致性风险。</p>
            ) : (
              consistencyHints.map((hint) => (
                <div
                  key={hint.id}
                  className={`rounded-xl border px-3 py-3 ${
                    hint.level === 'warning'
                      ? 'border-yellow-500/30 bg-yellow-500/10'
                      : 'border-neutral-800 bg-neutral-950/60'
                  }`}
                >
                  <p className={hint.level === 'warning' ? 'text-sm text-yellow-100' : 'text-sm text-neutral-200'}>
                    {hint.title}
                  </p>
                  <p className={`mt-2 whitespace-pre-wrap leading-5 ${hint.level === 'warning' ? 'text-yellow-200/80' : 'text-neutral-500'}`}>
                    {hint.description}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-neutral-200">
            <Pin size={14} className="text-indigo-400" />
            命中设定
          </div>
          <div className="space-y-2 text-xs text-neutral-400">
            <p>全局钉选：{pinnedCount}</p>
            {preview.matchedEntities.length === 0 ? (
              <p className="text-neutral-500">当前正文还没有命中设定实体。</p>
            ) : (
              preview.matchedEntities.map((entity) => (
                <div key={entity.id} className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2">
                  <p className="text-sm text-neutral-200">{entity.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">{entity.type}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="mb-3 text-sm text-neutral-200">参考依据预览</div>
          <div className="space-y-3 text-xs text-neutral-400">
            {preview.references.length === 0 ? (
              <p className="text-neutral-500">暂无可注入的参考条目。</p>
            ) : (
              preview.references.map((reference) => (
                <div key={reference.id} className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3">
                  <p className="text-sm text-neutral-200">{reference.label}</p>
                  <p className="mt-1 text-neutral-500">{reference.type}</p>
                  {reference.excerpt && (
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-neutral-500">{reference.excerpt}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="mb-3 text-sm text-neutral-200">实际请求预览</div>
          <div className="space-y-4 text-xs text-neutral-400">
            <div>
              <p className="mb-2 text-neutral-300">System Prompt</p>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-neutral-500">
                {preview.request.systemPrompt || '无'}
              </pre>
            </div>
            <div>
              <p className="mb-2 text-neutral-300">User Prompt</p>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-neutral-500">
                {preview.request.messages[0]?.content || '无'}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}
