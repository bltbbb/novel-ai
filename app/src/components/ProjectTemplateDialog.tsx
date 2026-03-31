import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Layers3, Plus, WandSparkles, X } from 'lucide-react';
import { PROJECT_TEMPLATES, getProjectTemplate } from '@/lib/project-templates';

interface CreateProjectPayload {
  title: string;
  description: string;
  genre: string[];
  seedChapters: Array<{
    title: string;
    content?: string;
  }>;
  seedEntities: Array<{
    type: 'character' | 'faction' | 'location' | 'magic_system' | 'item' | 'event';
    name: string;
    description?: string;
    fields?: Record<string, string | number | boolean | null>;
    tags?: string[];
    pinned?: boolean;
  }>;
  templateKey: string;
}

interface ProjectTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: CreateProjectPayload) => Promise<void>;
}

export function ProjectTemplateDialog({ open, onClose, onCreate }: ProjectTemplateDialogProps) {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('blank');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hasEditedDescription, setHasEditedDescription] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selectedTemplate = useMemo(() => getProjectTemplate(selectedTemplateKey), [selectedTemplateKey]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedTemplateKey('blank');
    setTitle('');
    setDescription('');
    setHasEditedDescription(false);
    setIsCreating(false);
  }, [open]);

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

  async function handleCreate() {
    setIsCreating(true);

    try {
      await onCreate({
        title: title.trim() || selectedTemplate.suggestedTitle,
        description: description.trim(),
        genre: [...selectedTemplate.genres],
        seedChapters: selectedTemplate.chapters.map((chapter) => ({
          title: chapter.title,
          content: chapter.content,
        })),
        seedEntities: selectedTemplate.entities.map((entity) => ({
          type: entity.type,
          name: entity.name,
          description: entity.description,
          fields: entity.fields,
          tags: entity.tags,
          pinned: entity.pinned,
        })),
        templateKey: selectedTemplate.key,
      });
    } finally {
      setIsCreating(false);
    }
  }

  function handleSelectTemplate(templateKey: string) {
    const template = getProjectTemplate(templateKey);
    setSelectedTemplateKey(templateKey);

    if (!hasEditedDescription) {
      setDescription(template.suggestedDescription);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
              <WandSparkles size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">创建项目</h2>
              <p className="text-sm text-neutral-500">可以从空白项目开始，也可以直接套用模板快速起步。</p>
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

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
              <Layers3 size={15} className="text-indigo-400" />
              选择模板
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {PROJECT_TEMPLATES.map((template) => {
                const isActive = selectedTemplateKey === template.key;

                return (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => handleSelectTemplate(template.key)}
                    className={`rounded-3xl border p-4 text-left transition-colors ${
                      isActive
                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-100'
                        : 'border-neutral-800 bg-neutral-950/40 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-950/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-medium">{template.label}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">{template.subtitle}</p>
                      </div>
                      {template.genres.length > 0 && (
                        <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-400">
                          {template.genres[0]}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-neutral-400">{template.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-500">
                      <span>{template.chapters.length} 个起始章节</span>
                      <span>{template.entities.length} 条基础设定</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <BookOpen size={15} className="text-indigo-400" />
                项目信息
              </div>
              <label className="block">
                <span className="mb-2 block text-sm text-neutral-300">项目标题</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={selectedTemplate.suggestedTitle}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                />
              </label>
              <label className="mt-4 block">
                <span className="mb-2 block text-sm text-neutral-300">项目简介</span>
                <textarea
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setHasEditedDescription(true);
                  }}
                  rows={5}
                  placeholder={selectedTemplate.suggestedDescription || '输入一句项目简介（可选）'}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                />
              </label>
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">模板预览</div>
              <div className="space-y-3 text-sm text-neutral-400">
                <div>
                  <p className="text-neutral-500">题材标签</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedTemplate.genres.length === 0 ? (
                      <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs text-neutral-500">空白项目</span>
                    ) : (
                      selectedTemplate.genres.map((genre) => (
                        <span key={genre} className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300">
                          {genre}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-neutral-500">起步内容</p>
                  <p className="mt-2 leading-6">
                    会自动创建 {selectedTemplate.chapters.length} 个起始章节和 {selectedTemplate.entities.length} 条基础设定。
                  </p>
                </div>
                {selectedTemplate.chapters[0] && (
                  <div>
                    <p className="text-neutral-500">首章预览</p>
                    <p className="mt-2 text-neutral-300">{selectedTemplate.chapters[0].title}</p>
                    <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-neutral-500">
                      {selectedTemplate.chapters[0].content}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-neutral-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-6 text-neutral-500">模板只负责快速起步，后续章节、设定和工作流都仍然可以自由调整。</p>
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
              onClick={() => void handleCreate()}
              disabled={isCreating}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={15} />
              {isCreating ? '创建中...' : '创建项目'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
