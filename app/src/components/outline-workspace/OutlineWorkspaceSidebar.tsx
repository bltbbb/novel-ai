import { BookOpenText, Filter, Layers3, Search } from 'lucide-react';

type BeatFilterStatus = 'all' | 'empty' | 'planned' | 'progressed';
type MilestoneProgressStatus = 'empty' | 'planned' | 'progressed';

interface VolumeSummaryItem {
  id: string;
  order: number;
  title: string;
  progressLabel: string;
  chapterCount: number;
  beatCount: number;
  milestoneCount: number;
  selected: boolean;
}

interface MilestoneSummaryItem {
  index: number;
  title: string;
  targetChapterCount: number;
  startChapterNumber: number;
  endChapterNumber: number;
  status: MilestoneProgressStatus;
  selected: boolean;
}

interface OutlineWorkspaceSidebarProps {
  volumes: VolumeSummaryItem[];
  milestones: MilestoneSummaryItem[];
  activeVolumeTitle: string | null;
  chapterJumpValue: string;
  beatFilterStatus: BeatFilterStatus;
  onChapterJumpValueChange: (value: string) => void;
  onJumpChapter: () => void;
  onSelectVolume: (volumeId: string) => void;
  onSelectMilestone: (milestoneIndex: number | null) => void;
  onBeatFilterStatusChange: (status: BeatFilterStatus) => void;
  onOpenVolumeSummary: (volumeId: string) => void;
  onOpenMilestoneSummary: (milestoneIndex: number) => void;
  registerVolumeNode?: (volumeId: string, node: HTMLButtonElement | null) => void;
}

const STATUS_ITEMS: Array<{ value: BeatFilterStatus; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'empty', label: '未规划' },
  { value: 'planned', label: '已规划' },
  { value: 'progressed', label: '已推进' },
];

function getMilestoneStatusTone(status: MilestoneProgressStatus, selected: boolean) {
  if (selected) {
    return 'border-emerald-400/50 bg-emerald-500/12 text-emerald-50';
  }

  switch (status) {
    case 'progressed':
      return 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100';
    case 'planned':
      return 'border-sky-500/20 bg-sky-500/5 text-sky-100';
    case 'empty':
    default:
      return 'border-neutral-800 bg-neutral-950/70 text-neutral-300';
  }
}

function getMilestoneStatusLabel(status: MilestoneProgressStatus) {
  switch (status) {
    case 'progressed':
      return '已推进';
    case 'planned':
      return '已规划';
    case 'empty':
    default:
      return '未规划';
  }
}

export function OutlineWorkspaceSidebar({
  volumes,
  milestones,
  activeVolumeTitle,
  chapterJumpValue,
  beatFilterStatus,
  onChapterJumpValueChange,
  onJumpChapter,
  onSelectVolume,
  onSelectMilestone,
  onBeatFilterStatusChange,
  onOpenVolumeSummary,
  onOpenMilestoneSummary,
  registerVolumeNode,
}: OutlineWorkspaceSidebarProps) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpenText size={15} className="text-emerald-200" />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">卷目录</p>
            <p className="mt-1 text-sm text-neutral-400">从这里切换当前工作卷。</p>
          </div>
        </div>

        {volumes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-4 text-sm text-neutral-500">
            还没有卷。先去卷管理创建卷，再回到这里规划。
          </div>
        ) : (
          <div className="space-y-2">
            {volumes.map((volume) => (
              <div key={volume.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  ref={(node) => registerVolumeNode?.(volume.id, node)}
                  onClick={() => onSelectVolume(volume.id)}
                  className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 text-left transition ${
                    volume.selected
                      ? 'border-emerald-400/50 bg-emerald-500/12 text-emerald-50 shadow-[0_18px_40px_rgba(16,185,129,0.14)]'
                      : 'border-neutral-800 bg-neutral-950/50 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">第 {volume.order} 卷</p>
                      <p className="mt-2 truncate text-sm font-medium">{volume.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">{volume.progressLabel}</p>
                    </div>
                    <div className="grid shrink-0 gap-1 text-right text-[11px] text-neutral-500">
                      <span>{volume.chapterCount} 章</span>
                      <span>{volume.beatCount} 拍</span>
                      <span>{volume.milestoneCount} 阶段</span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenVolumeSummary(volume.id)}
                  className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-950/50 px-3 py-3 text-xs text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900/70 hover:text-neutral-100"
                >
                  摘要
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers3 size={15} className="text-sky-200" />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">里程碑树</p>
            <p className="mt-1 text-sm text-neutral-400">
              {activeVolumeTitle ? `当前跟随《${activeVolumeTitle}》` : '先选择一卷，再按阶段过滤章节。'}
            </p>
          </div>
        </div>

        {milestones.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-4 text-sm text-neutral-500">
            当前卷还没有里程碑。可以先切到“当前卷纲”或“里程碑”模式补齐阶段。
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onSelectMilestone(null)}
              className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                milestones.every((item) => !item.selected)
                  ? 'border-indigo-400/40 bg-indigo-500/12 text-indigo-50'
                  : 'border-neutral-800 bg-neutral-950/50 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900/70'
              }`}
            >
              <p className="font-medium">查看整卷</p>
              <p className="mt-1 text-xs leading-6 text-neutral-500">不过滤里程碑，直接浏览整卷章节拍。</p>
            </button>

            {milestones.map((milestone) => (
              <div key={`${milestone.index}-${milestone.title}`} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => onSelectMilestone(milestone.index)}
                  className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 text-left text-sm transition ${getMilestoneStatusTone(
                    milestone.status,
                    milestone.selected,
                  )}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        阶段 {milestone.index + 1}
                        {milestone.title.trim() ? ` · ${milestone.title.trim()}` : ''}
                      </p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        第 {milestone.startChapterNumber} 章 - 第 {milestone.endChapterNumber} 章
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-[11px]">
                      {getMilestoneStatusLabel(milestone.status)}
                    </span>
                  </div>
                  {milestone.targetChapterCount > 0 ? (
                    <p className="mt-2 text-xs text-neutral-500">目标约 {milestone.targetChapterCount} 章</p>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenMilestoneSummary(milestone.index)}
                  className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-950/50 px-3 py-3 text-xs text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900/70 hover:text-neutral-100"
                >
                  摘要
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Search size={15} className="text-amber-200" />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">跳章 / 筛选</p>
            <p className="mt-1 text-sm text-neutral-400">输入章号即可快速定位到对应章节拍。</p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
          <div className="grid gap-2">
            <input
              value={chapterJumpValue}
              onChange={(event) => onChapterJumpValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onJumpChapter();
                }
              }}
              inputMode="numeric"
              placeholder="输入章号，如 500"
              className="h-11 flex-1 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-amber-400"
            />
            <button
              type="button"
              onClick={onJumpChapter}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20"
            >
              定位
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-neutral-500">
            <Filter size={13} />
            章节状态
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_ITEMS.map((item) => {
              const selected = item.value === beatFilterStatus;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onBeatFilterStatusChange(item.value)}
                  className={`rounded-2xl border px-3 py-2 text-sm transition ${
                    selected
                      ? 'border-emerald-400/40 bg-emerald-500/12 text-emerald-50'
                      : 'border-neutral-800 bg-neutral-950/50 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900/70'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
