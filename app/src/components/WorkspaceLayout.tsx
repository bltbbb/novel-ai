import { useEffect, useMemo, useState } from 'react';
import { BookOpen, FlaskConical, PenSquare, Settings2 } from 'lucide-react';
import { EditorView } from '@/components/EditorView';
import { GenerationView } from '@/components/GenerationView';
import { OutlineView } from '@/components/OutlineView';
import { WorkspaceSidebar } from '@/components/WorkspaceSidebar';
import { DEFAULT_VOLUME_TITLE } from '@/lib/db';
import { useEditorStore, useOutlineStore, useVolumeStore } from '@/stores';
import type { Id } from '@/types';

type WorkspaceTabKey = 'outline' | 'generation' | 'editor';
type StructureWorkspaceSectionKey =
  | 'thread-ledger'
  | 'foreshadow-plan'
  | 'world-state'
  | 'question-pool'
  | 'antagonist-agenda'
  | 'pov-permission'
  | 'resource-continuity';

interface WorkspaceLayoutProps {
  projectId: Id;
  projectTitle: string;
  projectDescription?: string;
  genre?: string[];
  onOpenSettings: () => void;
  onOpenProjectSettings: () => void;
  onOpenForeshadow: () => void;
  onOpenStructureMemory?: (sectionKey: StructureWorkspaceSectionKey) => void;
  onOpenAdvancedGeneration?: () => void;
  initialTab?: WorkspaceTabKey;
}

const tabItems: Array<{
  key: WorkspaceTabKey;
  label: string;
  icon: typeof BookOpen;
}> = [
  { key: 'outline', label: '大纲', icon: BookOpen },
  { key: 'generation', label: '生成', icon: FlaskConical },
  { key: 'editor', label: '编辑', icon: PenSquare },
];

export function WorkspaceLayout({
  projectId,
  projectTitle,
  projectDescription = '',
  genre = [],
  onOpenSettings,
  onOpenProjectSettings,
  onOpenForeshadow,
  onOpenStructureMemory,
  onOpenAdvancedGeneration,
  initialTab = 'outline',
}: WorkspaceLayoutProps) {
  const chapters = useEditorStore((state) => state.chapters);
  const activeChapterId = useEditorStore((state) => state.activeChapterId);
  const setActiveChapter = useEditorStore((state) => state.setActiveChapter);
  const createChapter = useEditorStore((state) => state.createChapter);
  const volumes = useVolumeStore((state) => state.volumes);
  const loadVolumes = useVolumeStore((state) => state.loadVolumes);
  const createVolume = useVolumeStore((state) => state.createVolume);
  const loadOutlines = useOutlineStore((state) => state.loadOutlines);
  const [activeTab, setActiveTab] = useState<WorkspaceTabKey>(initialTab);
  const [focusedVolumeId, setFocusedVolumeId] = useState<Id | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, projectId]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      await Promise.all([loadVolumes(projectId), loadOutlines(projectId)]);

      if (!mounted) {
        return;
      }

      const currentVolumes = useVolumeStore.getState().volumes.filter((volume) => volume.projectId === projectId);

      if (currentVolumes.length === 0) {
        await createVolume({
          projectId,
          title: DEFAULT_VOLUME_TITLE,
        });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [createVolume, loadOutlines, loadVolumes, projectId]);

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0] ?? null,
    [activeChapterId, chapters],
  );

  async function handleCreateVolume() {
    const nextOrder = volumes.length + 1;
    const draftTitle = window.prompt('输入新卷标题', nextOrder === 1 ? DEFAULT_VOLUME_TITLE : `第${nextOrder}卷`)?.trim();

    if (!draftTitle) {
      return;
    }

    await createVolume({
      projectId,
      title: draftTitle,
    });
  }

  async function handleCreateChapter() {
    const fallbackVolume =
      (selectedChapter?.volumeId
        ? volumes.find((volume) => volume.id === selectedChapter.volumeId) ?? null
        : null) ??
      volumes[0] ??
      null;
    const suggestedTitle = `第${chapters.length + 1}章`;
    const chapterTitle = window.prompt('输入章节标题', suggestedTitle)?.trim();

    if (!chapterTitle) {
      return;
    }

    const chapter = await createChapter({
      projectId,
      title: chapterTitle,
      volumeId: fallbackVolume?.id,
      volumeTitle: fallbackVolume?.title,
    });

    setActiveChapter(chapter.id);
    setActiveTab('editor');
  }

  return (
    <div className="flex min-h-0 flex-1 gap-5 overflow-hidden">
      <WorkspaceSidebar
        className="hidden w-80 flex-shrink-0 lg:flex"
        projectId={projectId}
        chapters={chapters}
        volumes={volumes}
        selectedChapterId={selectedChapter?.id ?? null}
        onSelectChapter={(chapterId) => setActiveChapter(chapterId)}
        onOpenVolumeOutline={(volumeId) => {
          setFocusedVolumeId(volumeId);
          setActiveTab('outline');
        }}
        onCreateChapter={() => void handleCreateChapter()}
        onCreateVolume={() => void handleCreateVolume()}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">创作工作台</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-neutral-100">{projectTitle}</h2>
                <span className="rounded-full bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                  {genre.length > 0 ? genre.join(' / ') : '小说项目'}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                {projectDescription || '当前项目暂无简介。'}
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenProjectSettings}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
            >
              <Settings2 size={16} />
              项目设置
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {tabItems.map((item) => {
              const Icon = item.icon;
              const active = item.key === activeTab;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-200'
                      : 'border border-neutral-800 bg-neutral-950/70 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 lg:hidden">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.18em] text-neutral-500">当前章节</span>
              <select
                value={selectedChapter?.id ?? ''}
                onChange={(event) => {
                  if (event.target.value) {
                    setActiveChapter(event.target.value);
                  }
                }}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-indigo-400"
              >
                {chapters.length === 0 ? <option value="">暂无章节</option> : null}
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCreateChapter()}
                className="rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
              >
                新建章节
              </button>
              <button
                type="button"
                onClick={() => void handleCreateVolume()}
                className="rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200 transition-colors hover:bg-indigo-500/20"
              >
                新建卷
              </button>
            </div>
          </div>
        </section>

        <div className="flex min-h-0 min-w-0 flex-1">
          {activeTab === 'outline' ? (
            <OutlineView
              projectId={projectId}
              projectTitle={projectTitle}
              projectDescription={projectDescription}
              genre={genre}
              focusVolumeId={focusedVolumeId}
              onOpenStructureMemory={onOpenStructureMemory}
            />
          ) : activeTab === 'generation' ? (
            <GenerationView
              key={selectedChapter?.id ?? 'generation-empty'}
              projectId={projectId}
              projectTitle={projectTitle}
              projectDescription={projectDescription}
              onOpenAdvancedConsole={onOpenAdvancedGeneration}
              onOpenEditor={() => setActiveTab('editor')}
              onOpenOutline={() => setActiveTab('outline')}
            />
          ) : (
            <EditorView
              projectId={projectId}
              projectTitle={projectTitle}
              projectDescription={projectDescription}
              onOpenSettings={onOpenSettings}
              onOpenForeshadow={onOpenForeshadow}
            />
          )}
        </div>
      </div>
    </div>
  );
}
