import { useMemo } from 'react';
import { Activity, BookOpen, Pin, Sparkles } from 'lucide-react';
import { assembleContinueWritingContext } from '@/lib/context-assembler';
import { estimateTextTokens } from '@/lib/token-counter';
import { useLoreStore, useSettingsStore } from '@/stores';
import { createId } from '@/lib/identity';
import { richTextToPlainText } from '@/lib/editor-content';
import type { Id, RichTextDocument } from '@/types';

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
  const entities = useLoreStore((state) => state.entities);
  const settings = useSettingsStore((state) => state.settings);

  const preview = useMemo(() => {
    return assembleContinueWritingContext({
      projectId,
      chapterId,
      chapterTitle,
      content,
      settings,
      entities,
      messageId: createId(),
      maxReferences: 6,
    });
  }, [chapterId, chapterTitle, content, entities, projectId, settings]);

  const plainText = richTextToPlainText(content);
  const contentTokens = estimateTextTokens(plainText);
  const pinnedCount = entities.filter((entity) => entity.pinned).length;

  return (
    <aside className="hidden w-80 flex-shrink-0 flex-col border-l border-neutral-800 bg-neutral-950/70 2xl:flex">
      <div className="border-b border-neutral-800 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
          <Activity size={15} className="text-indigo-400" />
          AI 监控面板
        </div>
        <p className="mt-2 text-xs leading-6 text-neutral-500">
          当前展示的是前端本地组装出的 prompt 预览，等联调完成后会与真实续写链路共用。
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
