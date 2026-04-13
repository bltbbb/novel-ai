import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Link2, Sparkles, Unlink2, X } from 'lucide-react';
import { buildProjectTemplateSnapshot } from '@/lib/project-template';
import { useProjectStore, useTemplateLibraryStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { Id, ProjectTemplateSnapshot } from '@/types';

interface ProjectTemplateBindingDialogProps {
  open: boolean;
  projectId: Id;
  currentTemplateSnapshot: ProjectTemplateSnapshot | null;
  onClose: () => void;
  onOpenTemplateLibrary?: () => void;
}

export function ProjectTemplateBindingDialog({
  open,
  projectId,
  currentTemplateSnapshot,
  onClose,
  onOpenTemplateLibrary,
}: ProjectTemplateBindingDialogProps) {
  const templates = useTemplateLibraryStore((state) => state.templates);
  const loadTemplates = useTemplateLibraryStore((state) => state.loadTemplates);
  const updateProject = useProjectStore((state) => state.updateProject);
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadTemplates();
    setSelectedTemplateId(currentTemplateSnapshot?.templateId ?? null);
  }, [currentTemplateSnapshot?.templateId, loadTemplates, open]);

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

  async function handleBind() {
    if (!selectedTemplate) {
      toast('请先选择一个模板', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      await updateProject(projectId, {
        templateSnapshot: buildProjectTemplateSnapshot(selectedTemplate),
      });
      toast(`已绑定模板「${selectedTemplate.name}」`, 'success');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`绑定模板失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUnbind() {
    setIsSaving(true);

    try {
      await updateProject(projectId, {
        templateSnapshot: null,
      });
      toast('已解除当前项目模板', 'success');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`解绑模板失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
              <BookOpen size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">项目创作模板</h2>
              <p className="text-sm text-neutral-500">为当前项目绑定、切换或解绑模板库中的创作模板。</p>
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
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-neutral-200">模板列表</div>
              {onOpenTemplateLibrary ? (
                <button
                  type="button"
                  onClick={onOpenTemplateLibrary}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                >
                  <Sparkles size={14} />
                  打开模板库
                </button>
              ) : null}
            </div>

            {templates.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-neutral-800 px-5 py-6 text-sm leading-6 text-neutral-500">
                当前还没有模板。可以先进入模板库做拆书并保存模板，再回来绑定到当前项目。
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => {
                  const active = selectedTemplateId === template.id;

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={`w-full rounded-3xl border p-4 text-left transition-colors ${
                        active
                          ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-100'
                          : 'border-neutral-800 bg-neutral-950/40 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-950/60'
                      }`}
                    >
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {template.sourceTitle}
                        {template.sourceAuthor ? ` / ${template.sourceAuthor}` : ''}
                      </p>
                      <p className="mt-3 line-clamp-3 text-xs leading-6 text-neutral-400">
                        {template.summary || '暂无模板摘要'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">当前绑定</div>
              {!currentTemplateSnapshot ? (
                <p className="text-sm leading-6 text-neutral-500">当前项目还没有绑定创作模板。</p>
              ) : (
                <div className="space-y-3 text-sm text-neutral-400">
                  <div>
                    <p className="text-neutral-500">模板名</p>
                    <p className="mt-1 text-neutral-200">{currentTemplateSnapshot.templateName}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">来源</p>
                    <p className="mt-1 text-neutral-300">
                      {currentTemplateSnapshot.sourceTitle}
                      {currentTemplateSnapshot.sourceAuthor ? ` / ${currentTemplateSnapshot.sourceAuthor}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-500">摘要</p>
                    <p className="mt-1 whitespace-pre-wrap leading-6">{currentTemplateSnapshot.summary || '暂无摘要'}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">待应用模板</div>
              {!selectedTemplate ? (
                <p className="text-sm leading-6 text-neutral-500">从左侧选择一个模板后，这里会显示模板摘要与应用入口。</p>
              ) : (
                <div className="space-y-3 text-sm text-neutral-400">
                  <div>
                    <p className="text-neutral-500">模板名</p>
                    <p className="mt-1 text-neutral-200">{selectedTemplate.name}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">来源</p>
                    <p className="mt-1 text-neutral-300">
                      {selectedTemplate.sourceTitle}
                      {selectedTemplate.sourceAuthor ? ` / ${selectedTemplate.sourceAuthor}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-500">摘要</p>
                    <p className="mt-1 whitespace-pre-wrap leading-6">{selectedTemplate.summary || '暂无摘要'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-neutral-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleUnbind()}
              disabled={!currentTemplateSnapshot || isSaving}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Unlink2 size={15} />
              解绑模板
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleBind()}
              disabled={!selectedTemplate || isSaving}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Link2 size={15} />
              {isSaving ? '应用中...' : '应用到当前项目'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

