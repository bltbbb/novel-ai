import { useRef, useState, type ChangeEvent } from 'react';
import { BookOpen, Clock3, Download, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { ProjectTemplateDialog } from '@/components/ProjectTemplateDialog';
import { useProjectStore } from '@/stores';
import { useToast } from '@/components/Toast';
import { downloadProjectArchive, parseProjectArchive } from '@/lib/project-archive';

function formatWordCount(wordCount: number) {
  if (wordCount >= 10000) {
    return `${(wordCount / 10000).toFixed(1)}w`;
  }

  return `${wordCount}`;
}

function formatUpdatedAt(updatedAt: string) {
  return new Date(updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectList() {
  const { projects, createProject, deleteProject, exportProjectArchive, importProjectArchive, setActiveProject } =
    useProjectStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);

  async function handleCreateProject(input: {
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
  }) {
    try {
      const project = await createProject({
        title: input.title,
        description: input.description,
        genre: input.genre,
        seedChapters: input.seedChapters,
        seedEntities: input.seedEntities,
      });

      setShowTemplateDialog(false);
      toast(`已创建项目「${project.title}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`创建项目失败：${message}`, 'error');
      throw error;
    }
  }

  async function handleDeleteProject(projectId: string, projectTitle: string) {
    const confirmed = window.confirm(`确认删除项目「${projectTitle}」吗？章节和设定也会一起删除。`);

    if (!confirmed) {
      return;
    }

    await deleteProject(projectId);
    toast(`已删除项目「${projectTitle}」`, 'warning');
  }

  async function handleExportProject(projectId: string, projectTitle: string) {
    try {
      const archive = await exportProjectArchive(projectId);
      downloadProjectArchive(`${projectTitle}.archive.json`, archive);
      toast(`已导出项目「${projectTitle}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`导出项目失败：${message}`, 'error');
    }
  }

  function handleOpenImport() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const archive = parseProjectArchive(raw);
      const project = await importProjectArchive(archive);
      toast(`已导入项目「${project.title}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`导入项目失败：${message}`, 'error');
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 lg:px-10">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleImportFile(event)}
          className="hidden"
        />
        <header className="mb-10 flex flex-col gap-5 rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6 backdrop-blur md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm text-indigo-300">AI Novel Studio</p>
            <h1 className="text-3xl font-semibold tracking-tight">项目列表</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              正式工程现在已经接上本地数据库。你可以在这里创建项目，随后进入工作台继续写作和维护设定。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleOpenImport}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              <Upload size={16} />
              导入项目
            </button>
            <button
              type="button"
              onClick={() => setShowTemplateDialog(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <Plus size={16} />
              创建项目
            </button>
          </div>
        </header>

        {projects.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={22} />}
            title="还没有正式项目"
            description="现在可以先创建第一部作品，再进入工作台写作、维护设定并使用 AI 续写。"
            actions={
              <>
                <button
                  type="button"
                  onClick={handleOpenImport}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                  <Upload size={16} />
                  导入已有项目
                </button>
                <button
                  type="button"
                  onClick={() => setShowTemplateDialog(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  <Plus size={16} />
                  创建第一个项目
                </button>
                <div className="inline-flex items-center gap-2 rounded-2xl border border-neutral-800 px-4 py-2.5 text-sm text-neutral-400">
                  <Sparkles size={15} className="text-indigo-300" />
                  开发环境会自动注入演示数据
                </div>
              </>
            }
            details={
              <OnboardingChecklist
                title="推荐起步顺序"
                items={[
                  '先创建一个项目，填好标题和一句项目简介。',
                  '进入工作台后建立第一章，再开始正文写作。',
                  '如果要使用 AI，先在设置里确认后端地址和模型配置。',
                ]}
              />
            }
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <article
                key={project.id}
                className="group flex cursor-pointer flex-col rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
                onClick={() => setActiveProject(project.id)}
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
                    <BookOpen size={18} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleExportProject(project.id, project.title);
                      }}
                      className="rounded-xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-indigo-300"
                      title="导出项目归档"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteProject(project.id, project.title);
                      }}
                      className="rounded-xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-red-400"
                      title="删除项目"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h2 className="mb-2 text-xl font-semibold text-neutral-100 transition-colors group-hover:text-indigo-300">
                  {project.title}
                </h2>
                <p className="mb-5 min-h-[44px] text-sm leading-6 text-neutral-400">
                  {project.description || '暂无项目简介。'}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-4 text-xs text-neutral-500">
                  <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-neutral-300">
                    {project.genre.length > 0 ? project.genre.join(' / ') : '未分类'}
                  </span>
                  <span>{formatWordCount(project.wordCount)} 字</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={12} />
                    {formatUpdatedAt(project.updatedAt)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ProjectTemplateDialog
        open={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
}
