import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowRight,
  BookOpen,
  Clock3,
  Download,
  LibraryBig,
  Lightbulb,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { InspirationDialog } from '@/components/InspirationDialog';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { ProjectTemplateDialog } from '@/components/ProjectTemplateDialog';
import { TemplateLibraryDialog } from '@/components/TemplateLibraryDialog';
import { useProjectStore } from '@/stores';
import { useToast } from '@/components/Toast';
import { downloadProjectArchive, parseProjectArchive } from '@/lib/project-archive';
import type { ProjectTemplateSnapshot } from '@/types';

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

interface ProjectListProps {
  onOpenTemplateLibraryPage?: () => void;
  onOpenGlobalSettings?: () => void;
}

export function ProjectList({ onOpenTemplateLibraryPage, onOpenGlobalSettings }: ProjectListProps = {}) {
  const { projects, createProject, deleteProject, exportProjectArchive, importProjectArchive, setActiveProject } =
    useProjectStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showInspirationDialog, setShowInspirationDialog] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);

  const projectStats = useMemo(() => {
    const totalWordCount = projects.reduce((sum, project) => sum + project.wordCount, 0);
    const templatedCount = projects.filter((project) => project.templateSnapshot).length;
    const latestProject =
      [...projects].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ??
      null;

    return {
      totalWordCount,
      templatedCount,
      latestProject,
    };
  }, [projects]);

  function handleOpenTemplateLibrary() {
    if (onOpenTemplateLibraryPage) {
      onOpenTemplateLibraryPage();
      return;
    }

    setShowTemplateLibrary(true);
  }

  async function handleCreateProject(input: {
    title: string;
    description: string;
    genre: string[];
    templateSnapshot: ProjectTemplateSnapshot | null;
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
        templateSnapshot: input.templateSnapshot,
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
    <div className="min-h-screen text-[color:var(--studio-text)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-6 md:px-6 lg:px-8">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleImportFile(event)}
          className="hidden"
        />

        <section className="studio-panel studio-shell-float mb-8 p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
            <div className="flex flex-col gap-6">
              <div>
                <p className="studio-overline">AI Novel Studio</p>
                <h1 className="studio-heading mt-4 max-w-4xl text-4xl font-semibold leading-tight text-[color:var(--studio-text)] md:text-5xl">
                  把灵感、结构、正文与 AI 调度，收进同一座写作指挥舱。
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-[color:var(--studio-muted)]">
                  这里不只是项目列表，而是你的创作入口。新建作品、选择模板、导入归档、切换 AI
                  配置，都被整理成更清晰的启动层。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowTemplateDialog(true)}
                  className="studio-action-button studio-action-button--primary"
                >
                  <Plus size={18} />
                  创建新作品
                </button>
                <button type="button" onClick={() => setShowInspirationDialog(true)} className="studio-action-button">
                  <Lightbulb size={18} />
                  灵感入口
                </button>
                <button type="button" onClick={handleOpenTemplateLibrary} className="studio-action-button">
                  <Sparkles size={18} />
                  打开模板库
                </button>
                <button type="button" onClick={handleOpenImport} className="studio-action-button">
                  <Upload size={18} />
                  导入归档
                </button>
                {onOpenGlobalSettings ? (
                  <button
                    type="button"
                    onClick={onOpenGlobalSettings}
                    className="studio-action-button studio-action-button--ghost"
                  >
                    <Settings2 size={18} />
                    AI 设置
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="studio-panel-soft p-4">
                  <p className="studio-overline">Step 01</p>
                  <p className="mt-3 text-lg font-medium text-[color:var(--studio-text)]">先收束概念</p>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--studio-muted)]">
                    通过灵感入口快速整理题材、人物关系和核心卖点。
                  </p>
                </div>
                <div className="studio-panel-soft p-4">
                  <p className="studio-overline">Step 02</p>
                  <p className="mt-3 text-lg font-medium text-[color:var(--studio-text)]">再绑定模板</p>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--studio-muted)]">
                    模板库把长篇结构、分卷节奏和世界观脚手架直接铺好。
                  </p>
                </div>
                <div className="studio-panel-soft p-4">
                  <p className="studio-overline">Step 03</p>
                  <p className="mt-3 text-lg font-medium text-[color:var(--studio-text)]">进入工作台</p>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--studio-muted)]">
                    在一个界面内维护大纲、设定、伏笔与正文生成链路。
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="studio-metric">
                <p className="studio-metric-label">已建项目</p>
                <p className="studio-metric-value">{projects.length}</p>
                <p className="studio-metric-note">每个项目都带独立章节、设定和模板快照。</p>
              </div>
              <div className="studio-metric">
                <p className="studio-metric-label">累计字数</p>
                <p className="studio-metric-value">{formatWordCount(projectStats.totalWordCount)}</p>
                <p className="studio-metric-note">系统会持续汇总当前工程内的正文总量。</p>
              </div>
              <div className="studio-metric sm:col-span-2 xl:col-span-1">
                <p className="studio-metric-label">模板覆盖</p>
                <p className="studio-metric-value">{projectStats.templatedCount}</p>
                <p className="studio-metric-note">
                  {projectStats.latestProject
                    ? `最近活跃：${projectStats.latestProject.title} · ${formatUpdatedAt(projectStats.latestProject.updatedAt)}`
                    : '创建第一个项目后，这里会显示最近活跃作品。'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="studio-overline">Project Deck</p>
              <h2 className="studio-heading mt-3 text-3xl font-semibold text-[color:var(--studio-text)]">现有作品</h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--studio-muted)]">
                每一张卡片都对应一个完整创作空间，点击即可进入工作台继续推进。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="studio-chip studio-chip--secondary">
                <LibraryBig size={15} />
                模板项目 {projectStats.templatedCount}
              </span>
              <span className="studio-chip">
                <BookOpen size={15} />
                总字数 {formatWordCount(projectStats.totalWordCount)}
              </span>
            </div>
          </div>

          {projects.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={24} />}
              title="还没有正式项目"
              description="从一个点子、一个模板或一份归档开始都可以。先建立第一部作品，再进入工作台继续维护章节、设定和 AI 生成流程。"
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setShowInspirationDialog(true)}
                    className="studio-action-button"
                  >
                    <Lightbulb size={16} />
                    先聊灵感
                  </button>
                  <button type="button" onClick={handleOpenTemplateLibrary} className="studio-action-button">
                    <Sparkles size={16} />
                    打开模板库
                  </button>
                  <button type="button" onClick={handleOpenImport} className="studio-action-button">
                    <Upload size={16} />
                    导入已有项目
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTemplateDialog(true)}
                    className="studio-action-button studio-action-button--primary"
                  >
                    <Plus size={16} />
                    创建第一个项目
                  </button>
                </>
              }
              details={
                <OnboardingChecklist
                  title="推荐起步顺序"
                  items={[
                    '如果只是一个模糊点子，先点“灵感入口”和 AI 多轮讨论。',
                    '先创建一个项目，填好标题和一句项目简介。',
                    '先在入口右上角确认全局 AI 设置和模型。',
                    '进入工作台后建立第一章，再开始正文写作。',
                    '项目内的文风 Prompt 现在单独放在项目设置里维护。',
                  ]}
                />
              }
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {projects.map((project, index) => (
                <article
                  key={project.id}
                  className="studio-project-card group"
                  onClick={() => setActiveProject(project.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-[color:var(--studio-line)] bg-[color:var(--studio-accent-soft)] text-[color:var(--studio-accent-strong)]">
                      <BookOpen size={18} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleExportProject(project.id, project.title);
                        }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--studio-line)] bg-black/10 text-[color:var(--studio-muted)] transition hover:border-[color:var(--studio-line-strong)] hover:text-[color:var(--studio-accent-strong)]"
                        title="导出项目归档"
                        aria-label={`导出项目《${project.title}》`}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteProject(project.id, project.title);
                        }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--studio-line)] bg-black/10 text-[color:var(--studio-muted)] transition hover:border-[color:var(--studio-danger)] hover:text-[color:var(--studio-danger)]"
                        title="删除项目"
                        aria-label={`删除项目《${project.title}》`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--studio-subtle)]">
                      Project {String(index + 1).padStart(2, '0')}
                    </p>
                    <h3 className="studio-heading mt-3 text-2xl font-semibold text-[color:var(--studio-text)] transition group-hover:text-[color:var(--studio-accent-strong)]">
                      {project.title}
                    </h3>
                    <p className="mt-3 min-h-[72px] text-sm leading-7 text-[color:var(--studio-muted)]">
                      {project.description || '暂无项目简介，点击进入工作台后继续完善世界观与章节路线。'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="studio-chip">
                      {project.genre.length > 0 ? project.genre.join(' / ') : '未分类'}
                    </span>
                    <span className="studio-chip">
                      <BookOpen size={14} />
                      {formatWordCount(project.wordCount)} 字
                    </span>
                    {project.templateSnapshot ? (
                      <span className="studio-chip studio-chip--accent">
                        <Sparkles size={14} />
                        {project.templateSnapshot.templateName}
                      </span>
                    ) : null}
                  </div>

                  <div className="studio-divider mt-auto" />

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-[color:var(--studio-muted)]">
                      <Clock3 size={14} />
                      <span>{formatUpdatedAt(project.updatedAt)}</span>
                    </div>
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--studio-accent-strong)]">
                      进入工作台
                      <ArrowRight size={16} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <ProjectTemplateDialog
        open={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        onCreate={handleCreateProject}
      />
      <InspirationDialog open={showInspirationDialog} onClose={() => setShowInspirationDialog(false)} />
      <TemplateLibraryDialog open={showTemplateLibrary} onClose={() => setShowTemplateLibrary(false)} />
    </div>
  );
}
