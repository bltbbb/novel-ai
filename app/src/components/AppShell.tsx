import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { BookOpen, FlaskConical, LibraryBig, LoaderCircle, Settings2, Share2, Sparkles, Target } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { seedDemoData } from '@/lib/db';
import {
  useEditorStore,
  useForeshadowStore,
  useLoreStore,
  useProjectStore,
  useServerStatusStore,
  useSettingsStore,
} from '@/stores';

type AppView = 'editor' | 'lore' | 'foreshadow' | 'graph' | 'generation';

const navItems = [
  { key: 'editor' as const, label: '编辑器', icon: BookOpen },
  { key: 'generation' as const, label: '生成控制台', icon: FlaskConical },
  { key: 'lore' as const, label: '设定库', icon: LibraryBig },
  { key: 'foreshadow' as const, label: '伏笔追踪', icon: Target },
  { key: 'graph' as const, label: '关系图谱', icon: Share2 },
];

const ProjectList = lazy(async () => {
  const module = await import('@/components/ProjectList');
  return { default: module.ProjectList };
});

const EditorWorkspace = lazy(async () => {
  const module = await import('@/components/EditorWorkspace');
  return { default: module.EditorWorkspace };
});

const LoreWorkspace = lazy(async () => {
  const module = await import('@/components/LoreWorkspace');
  return { default: module.LoreWorkspace };
});

const ForeshadowWorkspace = lazy(async () => {
  const module = await import('@/components/ForeshadowWorkspace');
  return { default: module.ForeshadowWorkspace };
});

const GraphWorkspace = lazy(async () => {
  const module = await import('@/components/GraphWorkspace');
  return { default: module.GraphWorkspace };
});

const GenerationWorkspace = lazy(async () => {
  const module = await import('@/components/GenerationWorkspace');
  return { default: module.GenerationWorkspace };
});

const SettingsDialog = lazy(async () => {
  const module = await import('@/components/SettingsDialog');
  return { default: module.SettingsDialog };
});

function ViewLoadingFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-900/70 text-sm text-neutral-400">
      正在加载{label}...
    </div>
  );
}

export function AppShell() {
  const { projects, activeProjectId, loadProjects, setActiveProject } = useProjectStore();
  const { loadChapters, setActiveChapter } = useEditorStore();
  const { loadForeshadows } = useForeshadowStore();
  const { loadEntities } = useLoreStore();
  const settings = useSettingsStore((state) => state.settings);
  const { loadSettings } = useSettingsStore();
  const serverAvailability = useServerStatusStore((state) => state.availability);
  const serverMessage = useServerStatusStore((state) => state.message);
  const refreshServerStatus = useServerStatusStore((state) => state.refresh);
  const { toast } = useToast();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [activeView, setActiveView] = useState<AppView>('editor');
  const [showSettings, setShowSettings] = useState(false);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );
  const activeViewLabel = useMemo(
    () => navItems.find((item) => item.key === activeView)?.label ?? '编辑器',
    [activeView],
  );

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        if (import.meta.env.DEV) {
          await seedDemoData();
        }

        await Promise.all([loadProjects(), loadSettings()]);
      } catch (error) {
        toast('应用初始化失败', 'error');
      } finally {
        if (mounted) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [loadProjects, loadSettings, toast]);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }

    void Promise.all([loadChapters(activeProjectId), loadEntities(activeProjectId), loadForeshadows(activeProjectId)]).catch(() => {
      toast('加载项目数据失败', 'error');
    });
  }, [activeProjectId, loadChapters, loadEntities, loadForeshadows, toast]);

  function openEditor(chapterId?: string | null) {
    if (chapterId) {
      setActiveChapter(chapterId);
    }

    setActiveView('editor');
  }

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    void refreshServerStatus(settings.serverUrl);

    const intervalId = window.setInterval(() => {
      void refreshServerStatus(settings.serverUrl);
    }, 30000);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refreshServerStatus(settings.serverUrl);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isBootstrapping, refreshServerStatus, settings.serverUrl]);

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-300">
        <div className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-5 py-4">
          <LoaderCircle size={18} className="animate-spin text-indigo-400" />
          正在初始化正式工程...
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <Suspense fallback={<ViewLoadingFallback label="项目列表" />}>
        <ProjectList />
      </Suspense>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex h-full w-full max-w-[1440px] gap-6 px-6 py-6 lg:px-8">
        <aside className="hidden w-64 flex-shrink-0 flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/70 p-4 backdrop-blur lg:flex">
          <div className="mb-6 rounded-2xl bg-neutral-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">AI Novel Studio</p>
            <h1 className="mt-2 text-lg font-semibold text-neutral-100">{activeProject.title}</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              {activeProject.description || '暂无项目简介'}
            </p>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveView(item.key)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-200'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                >
                  <Icon size={17} />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="mt-4 flex items-center gap-3 rounded-2xl border border-neutral-800 px-3 py-3 text-left text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          >
            <Settings2 size={16} />
            打开设置
          </button>

          <button
            type="button"
            onClick={() => setActiveProject(null)}
            className="mt-auto rounded-2xl border border-neutral-800 px-3 py-3 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          >
            返回项目列表
          </button>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-col gap-4 rounded-3xl border border-neutral-800 bg-neutral-900/70 px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">当前项目</p>
              <div className="mt-2 flex items-center gap-3">
                <h2 className="text-2xl font-semibold text-neutral-100">{activeProject.title}</h2>
                <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-300">
                  {activeViewLabel}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                {activeProject.description || '暂无项目简介。'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="rounded-2xl border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                设置
              </button>
              <button
                type="button"
                onClick={() => setActiveProject(null)}
                className="rounded-2xl border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800 lg:hidden"
              >
                返回项目
              </button>
              <div className="rounded-2xl bg-neutral-950/70 px-4 py-3 text-sm text-neutral-400">
                <div className="flex items-center gap-2 text-neutral-300">
                  <Sparkles size={15} className="text-indigo-400" />
                  {activeProject.genre.length > 0 ? activeProject.genre.join(' / ') : '小说项目'}
                </div>
                <p className="mt-2">{activeProject.wordCount} 字</p>
                <p className={`mt-1 text-xs ${serverAvailability === 'online' ? 'text-green-400' : serverAvailability === 'offline' ? 'text-yellow-400' : 'text-neutral-500'}`}>
                  {serverAvailability === 'online'
                    ? 'AI 服务在线'
                    : serverAvailability === 'offline'
                      ? `AI 服务不可用：${serverMessage}`
                      : '正在检测 AI 服务'}
                </p>
              </div>
            </div>
          </header>

          <div className="flex gap-2 lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveView(item.key)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'bg-neutral-900/70 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <Suspense fallback={<ViewLoadingFallback label={activeViewLabel} />}>
            {activeView === 'editor' ? (
              <EditorWorkspace
                projectId={activeProject.id}
                projectTitle={activeProject.title}
                projectDescription={activeProject.description}
                onOpenSettings={() => setShowSettings(true)}
                onOpenForeshadow={() => setActiveView('foreshadow')}
              />
            ) : activeView === 'generation' ? (
              <GenerationWorkspace
                projectId={activeProject.id}
                projectTitle={activeProject.title}
                projectDescription={activeProject.description}
                onOpenChapter={(chapterId) => openEditor(chapterId)}
              />
            ) : activeView === 'lore' ? (
              <LoreWorkspace projectId={activeProject.id} />
            ) : activeView === 'foreshadow' ? (
              <ForeshadowWorkspace
                projectId={activeProject.id}
                onOpenEditor={() => openEditor()}
                onOpenChapter={(chapterId) => openEditor(chapterId)}
              />
            ) : (
              <GraphWorkspace
                projectId={activeProject.id}
                onOpenChapter={(chapterId) => openEditor(chapterId)}
                onOpenForeshadow={(_foreshadowId) => setActiveView('foreshadow')}
                onOpenLore={() => setActiveView('lore')}
              />
            )}
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      </Suspense>
    </div>
  );
}
