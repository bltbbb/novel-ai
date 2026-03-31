import { BookOpen, Clock3, Plus, Sparkles, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { useProjectStore } from '@/stores';
import { useToast } from '@/components/Toast';

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
  const { projects, createProject, deleteProject, setActiveProject } = useProjectStore();
  const { toast } = useToast();

  async function handleCreateProject() {
    const title = window.prompt('输入项目名称', '未命名项目');

    if (title === null) {
      return;
    }

    const description = window.prompt('输入项目简介（可选）', '') ?? '';
    const project = await createProject({
      title,
      description,
    });

    toast(`已创建项目「${project.title}」`, 'success');
  }

  async function handleDeleteProject(projectId: string, projectTitle: string) {
    const confirmed = window.confirm(`确认删除项目「${projectTitle}」吗？章节和设定也会一起删除。`);

    if (!confirmed) {
      return;
    }

    await deleteProject(projectId);
    toast(`已删除项目「${projectTitle}」`, 'warning');
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 lg:px-10">
        <header className="mb-10 flex flex-col gap-5 rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6 backdrop-blur md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm text-indigo-300">AI Novel Studio</p>
            <h1 className="text-3xl font-semibold tracking-tight">项目列表</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              正式工程现在已经接上本地数据库。你可以在这里创建项目，随后进入工作台继续写作和维护设定。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCreateProject()}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus size={16} />
            创建项目
          </button>
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
                  onClick={() => void handleCreateProject()}
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
    </div>
  );
}
