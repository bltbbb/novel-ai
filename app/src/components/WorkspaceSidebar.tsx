import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Plus } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { listGenerationJobs } from '@/lib/generation-client';
import { loadGenerationQueue } from '@/lib/generation-storage';
import { richTextToPlainText } from '@/lib/editor-content';
import { useSettingsStore } from '@/stores';
import type { Chapter, GenerationJobStatus, GenerationQueueStatus, Id, Volume } from '@/types';

const UNASSIGNED_VOLUME_ID = '__unassigned__';
const UNASSIGNED_VOLUME_TITLE = '未分卷';

interface WorkspaceSidebarProps {
  projectId: Id;
  chapters: Chapter[];
  volumes: Volume[];
  selectedChapterId: Id | null;
  onSelectChapter: (chapterId: Id) => void;
  onOpenVolumeOutline: (volumeId: Id) => void;
  onCreateChapter: () => void;
  onCreateVolume: () => void;
  className?: string;
}

interface ChapterStatusMeta {
  label: string;
  dotClassName: string;
  textClassName: string;
  isConfirmed: boolean;
}

interface VolumeGroup {
  id: Id | typeof UNASSIGNED_VOLUME_ID;
  title: string;
  order: number;
  chapters: Chapter[];
  isRealVolume: boolean;
}

function getChapterStatusMeta(status: Chapter['status']): ChapterStatusMeta {
  switch (status) {
    case 'published':
      return {
        label: '已发布',
        dotClassName: 'bg-emerald-400',
        textClassName: 'text-emerald-300',
        isConfirmed: true,
      };
    case 'revised':
      return {
        label: '已确认',
        dotClassName: 'bg-sky-400',
        textClassName: 'text-sky-300',
        isConfirmed: true,
      };
    case 'first_draft':
      return {
        label: '草稿',
        dotClassName: 'bg-amber-400',
        textClassName: 'text-amber-300',
        isConfirmed: false,
      };
    case 'draft':
    default:
      return {
        label: '待生成',
        dotClassName: 'bg-neutral-500',
        textClassName: 'text-neutral-400',
        isConfirmed: false,
      };
  }
}

function getDisplayStatusMeta(
  chapter: Chapter,
  queueStatus?: GenerationQueueStatus,
  serverJobStatus?: GenerationJobStatus,
): ChapterStatusMeta {
  switch (serverJobStatus) {
    case 'running':
    case 'queued':
      return {
        label: '生成中',
        dotClassName: 'bg-[color:var(--studio-accent-strong)]',
        textClassName: 'text-[color:var(--studio-accent-strong)]',
        isConfirmed: false,
      };
    case 'paused':
      return {
        label: '已暂停',
        dotClassName: 'bg-sky-400',
        textClassName: 'text-sky-300',
        isConfirmed: false,
      };
    case 'ready':
      return {
        label: '待审核',
        dotClassName: 'bg-yellow-400',
        textClassName: 'text-yellow-300',
        isConfirmed: false,
      };
    case 'error':
      return {
        label: '生成失败',
        dotClassName: 'bg-red-400',
        textClassName: 'text-red-300',
        isConfirmed: false,
      };
    case 'approved':
      return {
        label: '已确认',
        dotClassName: 'bg-emerald-400',
        textClassName: 'text-emerald-300',
        isConfirmed: true,
      };
    default:
      break;
  }

  switch (queueStatus) {
    case 'running':
    case 'queued':
      return {
        label: '生成中',
        dotClassName: 'bg-[color:var(--studio-accent-strong)]',
        textClassName: 'text-[color:var(--studio-accent-strong)]',
        isConfirmed: false,
      };
    case 'ready':
      return {
        label: '待审核',
        dotClassName: 'bg-yellow-400',
        textClassName: 'text-yellow-300',
        isConfirmed: false,
      };
    case 'error':
      return {
        label: '生成失败',
        dotClassName: 'bg-red-400',
        textClassName: 'text-red-300',
        isConfirmed: false,
      };
    case 'approved':
      return {
        label: '已确认',
        dotClassName: 'bg-emerald-400',
        textClassName: 'text-emerald-300',
        isConfirmed: true,
      };
    default:
      return getChapterStatusMeta(chapter.status);
  }
}

function getVolumeDisplayTitle(volume: Volume) {
  const normalized = volume.title.trim();
  return normalized || UNASSIGNED_VOLUME_TITLE;
}

function getContainerClassName(className?: string) {
  return ['studio-shell flex h-full min-h-0 flex-col', className ?? ''].filter(Boolean).join(' ');
}

export function WorkspaceSidebar({
  projectId,
  chapters,
  volumes,
  selectedChapterId,
  onSelectChapter,
  onOpenVolumeOutline,
  onCreateChapter,
  onCreateVolume,
  className,
}: WorkspaceSidebarProps) {
  const { toast } = useToast();
  const settings = useSettingsStore((state) => state.settings);
  const [collapsedVolumeIds, setCollapsedVolumeIds] = useState<Set<Id | typeof UNASSIGNED_VOLUME_ID>>(
    () => new Set(),
  );
  const [hideConfirmedVolumes, setHideConfirmedVolumes] = useState(false);
  const [queueStatusMap, setQueueStatusMap] = useState<Map<Id, string>>(new Map());
  const [serverJobStatusMap, setServerJobStatusMap] = useState<Map<Id, GenerationJobStatus>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function refreshQueue() {
      const items = await loadGenerationQueue(projectId);

      if (cancelled) {
        return;
      }

      setQueueStatusMap(new Map(items.map((item) => [item.chapterId, item.status] as const)));
    }

    void refreshQueue();

    const timer = window.setInterval(() => {
      void refreshQueue();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    async function refreshServerJobs() {
      try {
        const jobs = await listGenerationJobs(settings.serverUrl, projectId);

        if (cancelled) {
          return;
        }

        setServerJobStatusMap(new Map(jobs.map((job) => [job.chapterId, job.status] as const)));
      } catch {
        if (!cancelled) {
          setServerJobStatusMap(new Map());
        }
      }
    }

    void refreshServerJobs();

    const timer = window.setInterval(() => {
      void refreshServerJobs();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId, settings.serverUrl]);

  const groups = useMemo(() => {
    const sortedVolumes = [...volumes].sort((left, right) => left.order - right.order);
    const chapterMap = new Map<Id | typeof UNASSIGNED_VOLUME_ID, Chapter[]>();

    for (const chapter of chapters) {
      const volumeKey = chapter.volumeId ?? UNASSIGNED_VOLUME_ID;
      const list = chapterMap.get(volumeKey) ?? [];
      list.push(chapter);
      chapterMap.set(volumeKey, list);
    }

    for (const [key, list] of chapterMap.entries()) {
      chapterMap.set(
        key,
        [...list].sort((left, right) => left.order - right.order),
      );
    }

    const baseGroups: VolumeGroup[] = sortedVolumes.map((volume) => {
      const volumeChapters = chapterMap.get(volume.id) ?? [];
      return {
        id: volume.id,
        title: getVolumeDisplayTitle(volume),
        order: volume.order,
        chapters: volumeChapters,
        isRealVolume: true,
      };
    });

    const assignedVolumeIds = new Set(sortedVolumes.map((volume) => volume.id));
    const danglingVolumeGroups: VolumeGroup[] = [];

    for (const [volumeId, volumeChapters] of chapterMap.entries()) {
      if (volumeId === UNASSIGNED_VOLUME_ID || assignedVolumeIds.has(volumeId) || volumeChapters.length === 0) {
        continue;
      }

      danglingVolumeGroups.push({
        id: volumeId,
        title: '未知分卷',
        order: Number.MAX_SAFE_INTEGER,
        chapters: volumeChapters,
        isRealVolume: false,
      });
    }

    const unassignedChapters = chapterMap.get(UNASSIGNED_VOLUME_ID) ?? [];
    const allGroups = [...baseGroups, ...danglingVolumeGroups];

    if (unassignedChapters.length > 0) {
      allGroups.push({
        id: UNASSIGNED_VOLUME_ID,
        title: UNASSIGNED_VOLUME_TITLE,
        order: Number.MAX_SAFE_INTEGER,
        chapters: unassignedChapters,
        isRealVolume: false,
      });
    }

    return allGroups;
  }, [chapters, volumes]);

  const visibleGroups = useMemo(() => {
    return groups.filter((group) => {
      if (!hideConfirmedVolumes) {
        return true;
      }

      if (group.chapters.length === 0) {
        return true;
      }

      return !group.chapters.every((chapter) =>
        getDisplayStatusMeta(
          chapter,
          queueStatusMap.get(chapter.id) as GenerationQueueStatus | undefined,
          serverJobStatusMap.get(chapter.id),
        ).isConfirmed,
      );
    });
  }, [groups, hideConfirmedVolumes, queueStatusMap, serverJobStatusMap]);

  const confirmedChapterCount = useMemo(() => {
    return chapters.filter((chapter) =>
      getDisplayStatusMeta(
        chapter,
        queueStatusMap.get(chapter.id) as GenerationQueueStatus | undefined,
        serverJobStatusMap.get(chapter.id),
      ).isConfirmed,
    ).length;
  }, [chapters, queueStatusMap, serverJobStatusMap]);

  const selectedVolumeId = useMemo(() => {
    if (!selectedChapterId) {
      return null;
    }

    const matchedChapter = chapters.find((chapter) => chapter.id === selectedChapterId);
    if (!matchedChapter) {
      return null;
    }

    return matchedChapter.volumeId ?? UNASSIGNED_VOLUME_ID;
  }, [chapters, selectedChapterId]);

  function toggleVolumeCollapse(volumeId: Id | typeof UNASSIGNED_VOLUME_ID) {
    setCollapsedVolumeIds((current) => {
      const next = new Set(current);

      if (next.has(volumeId)) {
        next.delete(volumeId);
      } else {
        next.add(volumeId);
      }

      return next;
    });
  }

  async function handleCopyChapterContent(chapter: Chapter) {
    const plainText = richTextToPlainText(chapter.content).trim();

    if (!plainText) {
      toast(`《${chapter.title}》当前没有可复制的正文`, 'warning');
      return;
    }

    try {
      await navigator.clipboard.writeText(plainText);
      toast(`已复制《${chapter.title}》正文`, 'success');
    } catch {
      toast(`复制《${chapter.title}》正文失败`, 'error');
    }
  }

  return (
    <aside className={getContainerClassName(className)}>
      <div className="border-b border-[color:var(--studio-line)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="studio-overline">Chapter Tree</p>
            <p className="mt-2 text-sm text-[color:var(--studio-muted)]">按卷切换章节、卷纲与正文复制。</p>
          </div>
          <span className="studio-chip studio-chip--compact studio-chip--secondary whitespace-nowrap">
            已确认 {confirmedChapterCount}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="studio-sidebar-stat">
            <span className="studio-sidebar-stat__label">章节</span>
            <strong className="studio-sidebar-stat__value">{chapters.length}</strong>
          </div>
          <div className="studio-sidebar-stat">
            <span className="studio-sidebar-stat__label">分卷</span>
            <strong className="studio-sidebar-stat__value">{volumes.length}</strong>
          </div>
          <div className="studio-sidebar-stat">
            <span className="studio-sidebar-stat__label">展示</span>
            <strong className="studio-sidebar-stat__value">{visibleGroups.length}</strong>
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-[18px] border border-[color:var(--studio-line)] bg-black/10 px-3 py-3 text-sm text-[color:var(--studio-muted)]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[color:var(--studio-line)] bg-transparent text-[color:var(--studio-accent)] focus:ring-[color:var(--studio-accent)]"
            checked={hideConfirmedVolumes}
            onChange={(event) => setHideConfirmedVolumes(event.target.checked)}
          />
          收起已确认卷
        </label>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {visibleGroups.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[color:var(--studio-line)] px-4 py-8 text-center text-sm text-[color:var(--studio-muted)]">
            当前没有可展示的卷
          </div>
        ) : (
          visibleGroups.map((group) => {
            const isCollapsed = collapsedVolumeIds.has(group.id);
            const forceExpanded = selectedVolumeId !== null && selectedVolumeId === group.id;
            const shouldShowChapters = forceExpanded || !isCollapsed;

            return (
              <section key={group.id} className="studio-tree-group">
                <button
                  type="button"
                  onClick={() => toggleVolumeCollapse(group.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[color:var(--studio-text)]">
                    {shouldShowChapters ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span className="truncate">{group.title}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {group.isRealVolume ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenVolumeOutline(group.id as Id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onOpenVolumeOutline(group.id as Id);
                          }
                        }}
                        className="studio-chip min-h-[30px] px-3 py-1 text-[11px]"
                      >
                        编辑卷纲
                      </span>
                    ) : null}
                    <span className="text-xs text-[color:var(--studio-subtle)]">{group.chapters.length}</span>
                  </span>
                </button>

                {shouldShowChapters ? (
                  <div className="space-y-2 border-t border-[color:var(--studio-line)] px-3 py-3">
                    {group.chapters.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-[color:var(--studio-muted)]">本卷暂无章节</p>
                    ) : (
                      group.chapters.map((chapter) => {
                        const statusMeta = getDisplayStatusMeta(
                          chapter,
                          queueStatusMap.get(chapter.id) as GenerationQueueStatus | undefined,
                          serverJobStatusMap.get(chapter.id),
                        );
                        const isSelected = chapter.id === selectedChapterId;

                        return (
                          <div
                            key={chapter.id}
                            data-active={isSelected ? 'true' : 'false'}
                            className="studio-tree-row px-3 py-3"
                          >
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={() => onSelectChapter(chapter.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <p
                                  className={`line-clamp-1 text-sm font-medium ${
                                    isSelected
                                      ? 'text-[color:var(--studio-accent-strong)]'
                                      : 'text-[color:var(--studio-text)]'
                                  }`}
                                >
                                  {chapter.title}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClassName}`} />
                                  <span className={statusMeta.textClassName}>{statusMeta.label}</span>
                                  <span className="text-[color:var(--studio-subtle)]">第 {chapter.order} 章</span>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCopyChapterContent(chapter)}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--studio-line)] bg-black/10 text-[color:var(--studio-muted)] transition hover:border-[color:var(--studio-line-strong)] hover:text-[color:var(--studio-accent-strong)]"
                                aria-label={`复制《${chapter.title}》正文`}
                                title="复制正文"
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </section>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-[color:var(--studio-line)] p-3">
        <button type="button" onClick={onCreateChapter} className="studio-action-button">
          <Plus size={14} />
          新建章节
        </button>
        <button
          type="button"
          onClick={onCreateVolume}
          className="studio-action-button studio-action-button--primary"
        >
          <Plus size={14} />
          新建卷
        </button>
      </div>
    </aside>
  );
}
