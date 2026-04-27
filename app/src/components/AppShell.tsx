import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  LibraryBig,
  LoaderCircle,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import { ShellCommandDeck } from '@/components/shell/ShellCommandDeck';
import { useToast } from '@/components/Toast';
import { seedDemoData } from '@/lib/db';
import {
  useAntagonistAgendaStore,
  useEditorStore,
  useForeshadowPlanStore,
  useForeshadowStore,
  useLoreStore,
  usePovPermissionStore,
  useProjectStore,
  useQuestionPoolStore,
  useResourceContinuityStore,
  useServerStatusStore,
  useSettingsStore,
  useThreadLedgerStore,
  useWorldStateStore,
} from '@/stores';

type AppView = 'workspace' | 'structure' | 'lore' | 'graph';
type StructureWorkspaceSectionKey =
  | 'thread-ledger'
  | 'foreshadow-plan'
  | 'world-state'
  | 'question-pool'
  | 'antagonist-agenda'
  | 'pov-permission'
  | 'resource-continuity';

const navItems = [
  { key: 'workspace' as const, label: '创作工作台', note: '大纲、生成与正文写作', icon: BookOpen },
  { key: 'structure' as const, label: '结构记忆', note: '线程账本与全局约束', icon: Sparkles },
  { key: 'lore' as const, label: '设定库', note: '角色、地点与世界观', icon: LibraryBig },
  { key: 'graph' as const, label: '关系图谱展示', note: '关系观察与诊断视图', icon: Share2 },
];

const viewLabels: Record<AppView, string> = {
  workspace: '创作工作台',
  structure: '结构记忆',
  lore: '设定库',
  graph: '关系图谱展示',
};

const ProjectList = lazy(async () => {
  const module = await import('@/components/ProjectList');
  return { default: module.ProjectList };
});

const TemplateLibraryPage = lazy(async () => {
  const module = await import('@/components/TemplateLibraryPage');
  return { default: module.TemplateLibraryPage };
});

const WorkspaceLayout = lazy(async () => {
  const module = await import('@/components/WorkspaceLayout');
  return { default: module.WorkspaceLayout };
});

const StructureWorkspace = lazy(async () => {
  const module = await import('@/components/StructureWorkspace');
  return { default: module.StructureWorkspace };
});

const LoreWorkspace = lazy(async () => {
  const module = await import('@/components/LoreWorkspace');
  return { default: module.LoreWorkspace };
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

const ProjectSettingsDialog = lazy(async () => {
  const module = await import('@/components/ProjectSettingsDialog');
  return { default: module.ProjectSettingsDialog };
});

const TemplateLibraryDialog = lazy(async () => {
  const module = await import('@/components/TemplateLibraryDialog');
  return { default: module.TemplateLibraryDialog };
});

const ProjectTemplateBindingDialog = lazy(async () => {
  const module = await import('@/components/ProjectTemplateBindingDialog');
  return { default: module.ProjectTemplateBindingDialog };
});

function ViewLoadingFallback({ label }: { label: string }) {
  return (
    <div className="studio-panel flex min-h-[320px] items-center justify-center px-6 py-10 text-sm text-[color:var(--studio-muted)]">
      <div className="flex items-center gap-3 rounded-full border border-[color:var(--studio-line)] bg-black/10 px-5 py-3">
        <LoaderCircle size={18} className="animate-spin text-[color:var(--studio-accent-strong)]" />
        正在加载{label}...
      </div>
    </div>
  );
}

export function AppShell() {
  const { projects, activeProjectId, loadProjects, setActiveProject } = useProjectStore();
  const chapters = useEditorStore((state) => state.chapters);
  const { loadChapters, setActiveChapter } = useEditorStore();
  const { loadForeshadows } = useForeshadowStore();
  const { loadForeshadowPlans } = useForeshadowPlanStore();
  const { loadThreadLedgers } = useThreadLedgerStore();
  const { loadWorldStateEntries } = useWorldStateStore();
  const { loadQuestionPools } = useQuestionPoolStore();
  const { loadAntagonistAgendas } = useAntagonistAgendaStore();
  const { loadPovPermissions } = usePovPermissionStore();
  const { loadResourceContinuities } = useResourceContinuityStore();
  const entities = useLoreStore((state) => state.entities);
  const { loadEntities } = useLoreStore();
  const settings = useSettingsStore((state) => state.settings);
  const { loadSettings } = useSettingsStore();
  const serverAvailability = useServerStatusStore((state) => state.availability);
  const serverMessage = useServerStatusStore((state) => state.message);
  const refreshServerStatus = useServerStatusStore((state) => state.refresh);
  const { toast } = useToast();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [activeView, setActiveView] = useState<AppView>('workspace');
  const [showLandingTemplateLibraryPage, setShowLandingTemplateLibraryPage] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showTemplateBinding, setShowTemplateBinding] = useState(false);
  const [showCompatibilityConsole, setShowCompatibilityConsole] = useState(false);
  const [structureWorkspaceFocus, setStructureWorkspaceFocus] = useState<{
    sectionKey: StructureWorkspaceSectionKey;
    navigationToken: number;
  } | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );
  const activeViewLabel = useMemo(() => viewLabels[activeView], [activeView]);
  const activeTemplateLabel = activeProject?.templateSnapshot?.templateName ?? '未绑定模板';
  const genreLabel = activeProject?.genre.length ? activeProject.genre.join(' / ') : '小说项目';

  const serverStatusMeta = useMemo(() => {
    if (serverAvailability === 'online') {
      return {
        label: 'AI 服务在线',
        note: '本地服务响应正常，可以直接发起生成。',
        dotClassName: 'bg-emerald-400',
        textClassName: 'text-emerald-300',
      };
    }

    if (serverAvailability === 'offline') {
      return {
        label: 'AI 服务离线',
        note: serverMessage || '当前无法连接到本地服务。',
        dotClassName: 'bg-amber-400',
        textClassName: 'text-amber-300',
      };
    }

    return {
      label: 'AI 服务检测中',
      note: '正在刷新可用性状态。',
      dotClassName: 'bg-slate-400',
      textClassName: 'text-slate-300',
    };
  }, [serverAvailability, serverMessage]);

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

    void Promise.all([
      loadChapters(activeProjectId),
      loadEntities(activeProjectId),
      loadForeshadows(activeProjectId),
      loadForeshadowPlans(activeProjectId),
      loadThreadLedgers(activeProjectId),
      loadWorldStateEntries(activeProjectId),
      loadQuestionPools(activeProjectId),
      loadAntagonistAgendas(activeProjectId),
      loadPovPermissions(activeProjectId),
      loadResourceContinuities(activeProjectId),
    ]).catch(() => {
      toast('加载项目数据失败', 'error');
    });
  }, [
    activeProjectId,
    loadAntagonistAgendas,
    loadChapters,
    loadEntities,
    loadForeshadows,
    loadForeshadowPlans,
    loadPovPermissions,
    loadQuestionPools,
    loadResourceContinuities,
    loadThreadLedgers,
    loadWorldStateEntries,
    toast,
  ]);

  useEffect(() => {
    if (activeProjectId) {
      return;
    }

    setShowProjectSettings(false);
    setShowTemplateBinding(false);
    setShowCompatibilityConsole(false);
  }, [activeProjectId]);

  function openEditor(chapterId?: string | null) {
    if (chapterId) {
      setActiveChapter(chapterId);
    }

    setStructureWorkspaceFocus(null);
    setActiveView('workspace');
  }

  function openStructureWorkspace(sectionKey?: StructureWorkspaceSectionKey | null) {
    if (sectionKey) {
      setStructureWorkspaceFocus({
        sectionKey,
        navigationToken: Date.now(),
      });
    }

    setActiveView('structure');
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
      <div className="flex min-h-screen items-center justify-center px-4 text-[color:var(--studio-text)]">
        <div className="studio-panel flex items-center gap-3 px-6 py-4">
          <LoaderCircle size={18} className="animate-spin text-[color:var(--studio-accent-strong)]" />
          正在初始化创作指挥舱...
        </div>
      </div>
    );
  }

  if (!activeProject) {
    if (showLandingTemplateLibraryPage) {
      return (
        <>
          <Suspense fallback={<ViewLoadingFallback label="模板库" />}>
            <TemplateLibraryPage onClose={() => setShowLandingTemplateLibraryPage(false)} />
          </Suspense>
          <Suspense fallback={null}>
            <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
          </Suspense>
        </>
      );
    }

    return (
      <>
        <Suspense fallback={<ViewLoadingFallback label="项目列表" />}>
          <ProjectList
            onOpenTemplateLibraryPage={() => setShowLandingTemplateLibraryPage(true)}
            onOpenGlobalSettings={() => setShowSettings(true)}
          />
        </Suspense>
        <Suspense fallback={null}>
          <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
        </Suspense>
      </>
    );
  }

  return (
    <div className="min-h-dvh overflow-hidden text-[color:var(--studio-text)]">
      <div className="flex h-dvh w-full gap-3 overflow-hidden px-0 py-0">
        <aside className="studio-shell hidden w-[272px] flex-shrink-0 flex-col overflow-hidden lg:flex xl:w-[288px]">
          <div className="border-b border-[color:var(--studio-line)] px-5 py-5">
            <p className="studio-overline">Story File</p>
            <h1 className="studio-heading mt-4 text-[2rem] font-semibold text-[color:var(--studio-text)]">
              {activeProject.title}
            </h1>
            <p className="mt-3 line-clamp-3 text-sm leading-7 text-[color:var(--studio-muted)]">
              {activeProject.description || '给这部作品补一段简介，会更方便在多项目之间快速切换。'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="studio-chip studio-chip--accent studio-chip--compact">{activeViewLabel}</span>
              <span className="studio-chip studio-chip--compact">{genreLabel}</span>
              <span className="studio-chip studio-chip--compact">模板：{activeTemplateLabel}</span>
            </div>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  data-active={active ? 'true' : 'false'}
                  onClick={() => {
                    setStructureWorkspaceFocus(null);
                    setActiveView(item.key);
                  }}
                  className="studio-nav-button"
                >
                  <span className="studio-nav-icon">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="studio-nav-title">{item.label}</span>
                    <span className="studio-nav-note block">{item.note}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <ShellCommandDeck
            activeViewLabel={activeViewLabel}
            wordCount={activeProject.wordCount}
            chapterCount={chapters.length}
            entityCount={entities.length}
            serverStatusMeta={serverStatusMeta}
            onOpenProjectSettings={() => setShowProjectSettings(true)}
            onOpenSettings={() => setShowSettings(true)}
            onOpenTemplateBinding={() => setShowTemplateBinding(true)}
            onOpenTemplateLibrary={() => setShowTemplateLibrary(true)}
            onOpenCompatibilityConsole={() => setShowCompatibilityConsole(true)}
            onBackToProjects={() => setActiveProject(null)}
          />

          <div className="studio-panel-soft flex gap-2 overflow-x-auto p-2 lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  data-active={active ? 'true' : 'false'}
                  onClick={() => {
                    setStructureWorkspaceFocus(null);
                    setActiveView(item.key);
                  }}
                  className="studio-tab-button whitespace-nowrap"
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <Suspense fallback={<ViewLoadingFallback label={activeViewLabel} />}>
            {activeView === 'workspace' ? (
              <WorkspaceLayout
                projectId={activeProject.id}
                projectTitle={activeProject.title}
                projectDescription={activeProject.description}
                genre={activeProject.genre}
                onOpenSettings={() => setShowSettings(true)}
                onOpenForeshadow={() => openStructureWorkspace('foreshadow-plan')}
                onOpenStructureMemory={(sectionKey) => openStructureWorkspace(sectionKey)}
              />
            ) : activeView === 'structure' ? (
              <StructureWorkspace
                projectId={activeProject.id}
                initialSectionKey={structureWorkspaceFocus?.sectionKey ?? null}
                navigationToken={structureWorkspaceFocus?.navigationToken ?? 0}
                onOpenEditor={() => openEditor()}
                onOpenChapter={(chapterId) => openEditor(chapterId)}
              />
            ) : activeView === 'lore' ? (
              <LoreWorkspace projectId={activeProject.id} />
            ) : (
              <GraphWorkspace
                projectId={activeProject.id}
                onOpenChapter={(chapterId) => openEditor(chapterId)}
                onOpenForeshadow={(_foreshadowId) => openStructureWorkspace('foreshadow-plan')}
                onOpenLore={() => setActiveView('lore')}
              />
            )}
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <ProjectSettingsDialog
          open={showProjectSettings}
          projectId={activeProject.id}
          onClose={() => setShowProjectSettings(false)}
        />
      </Suspense>
      <Suspense fallback={null}>
        <TemplateLibraryDialog open={showTemplateLibrary} onClose={() => setShowTemplateLibrary(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <ProjectTemplateBindingDialog
          open={showTemplateBinding}
          projectId={activeProject.id}
          currentTemplateSnapshot={activeProject.templateSnapshot}
          onClose={() => setShowTemplateBinding(false)}
          onOpenTemplateLibrary={() => {
            setShowTemplateBinding(false);
            setShowTemplateLibrary(true);
          }}
        />
      </Suspense>

      {showCompatibilityConsole ? (
        <Suspense fallback={<ViewLoadingFallback label="兼容控制台" />}>
          <div className="fixed inset-0 z-40 bg-black/55 px-4 py-4 backdrop-blur-sm md:px-6">
            <div className="flex h-full w-full flex-col gap-4">
              <div className="studio-panel flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="studio-overline">兼容控制台</p>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--studio-muted)]">
                    旧版队列、调试与维护入口。主创作链路已经迁到“创作工作台”。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCompatibilityConsole(false)}
                  className="studio-action-button"
                >
                  <X size={16} />
                  关闭
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                <GenerationWorkspace
                  projectId={activeProject.id}
                  projectTitle={activeProject.title}
                  projectDescription={activeProject.description}
                  onOpenChapter={(chapterId) => {
                    setShowCompatibilityConsole(false);
                    openEditor(chapterId);
                  }}
                  onReturnToWorkspace={() => setShowCompatibilityConsole(false)}
                />
              </div>
            </div>
          </div>
        </Suspense>
      ) : null}
    </div>
  );
}
