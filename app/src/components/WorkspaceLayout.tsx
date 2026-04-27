import { useEffect, useMemo, useState } from 'react';
import { BookOpen, FlaskConical, PenSquare } from 'lucide-react';
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
  onOpenForeshadow: () => void;
  onOpenStructureMemory?: (sectionKey: StructureWorkspaceSectionKey) => void;
  initialTab?: WorkspaceTabKey;
}

const tabItems: Array<{
  key: WorkspaceTabKey;
  label: string;
  icon: typeof BookOpen;
  note: string;
}> = [
  { key: 'outline', label: '大纲', icon: BookOpen, note: '结构拆解与卷纲推进' },
  { key: 'generation', label: '生成', icon: FlaskConical, note: '调度 AI 生成与审核' },
  { key: 'editor', label: '编辑', icon: PenSquare, note: '落正文与局部润色' },
];

export function WorkspaceLayout({
  projectId,
  projectTitle,
  projectDescription = '',
  genre = [],
  onOpenSettings,
  onOpenForeshadow,
  onOpenStructureMemory,
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

  const confirmedChapterCount = useMemo(
    () => chapters.filter((chapter) => chapter.status === 'revised' || chapter.status === 'published').length,
    [chapters],
  );
  const isOutlineTab = activeTab === 'outline';

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
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
      {!isOutlineTab ? (
        <WorkspaceSidebar
          className="hidden w-[284px] flex-shrink-0 lg:flex xl:w-[304px]"
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
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        <section className={`studio-shell px-4 md:px-5 ${isOutlineTab ? 'py-2.5' : 'py-3'}`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {tabItems.map((item) => {
                const Icon = item.icon;
                const active = item.key === activeTab;

                return (
                  <button
                    key={item.key}
                    type="button"
                    data-active={active ? 'true' : 'false'}
                    onClick={() => setActiveTab(item.key)}
                    className="studio-tab-button"
                    title={item.note}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {!isOutlineTab ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="studio-chip studio-chip--compact">章节 {chapters.length}</span>
                <span className="studio-chip studio-chip--compact">分卷 {volumes.length}</span>
                <span className="studio-chip studio-chip--compact">已确认 {confirmedChapterCount}</span>
                <span
                  className="studio-chip studio-chip--compact studio-chip--secondary max-w-full md:max-w-[420px]"
                  title={selectedChapter?.title ?? '尚未选择章节'}
                >
                  <span className="truncate">
                    当前聚焦：{selectedChapter?.title ?? '尚未选择章节'}
                  </span>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="studio-chip studio-chip--compact">卷 {volumes.length}</span>
                <span className="studio-chip studio-chip--compact">已确认 {confirmedChapterCount}</span>
                <span className="studio-chip studio-chip--compact studio-chip--secondary">
                  大纲独占工作区
                </span>
              </div>
            )}
          </div>

          <div className={`grid gap-3 lg:hidden ${isOutlineTab ? 'mt-2 hidden' : 'mt-3'}`}>
            <div className="studio-panel-soft p-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--studio-subtle)]">当前章节</span>
                <select
                  value={selectedChapter?.id ?? ''}
                  onChange={(event) => {
                    if (event.target.value) {
                      setActiveChapter(event.target.value);
                    }
                  }}
                  className="w-full rounded-[18px] border border-[color:var(--studio-line)] bg-black/10 px-3 py-3 text-sm text-[color:var(--studio-text)] outline-none transition focus:border-[color:var(--studio-line-strong)]"
                >
                  {chapters.length === 0 ? <option value="">暂无章节</option> : null}
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCreateChapter()}
                className="studio-action-button"
              >
                新建章节
              </button>
              <button
                type="button"
                onClick={() => void handleCreateVolume()}
                className="studio-action-button studio-action-button--primary"
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
