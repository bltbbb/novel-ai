import { CheckCircle2, Circle, CircleDashed, FileText } from 'lucide-react';

type ChapterBeatStatus = 'empty' | 'planned' | 'progressed';

interface ChapterBeatListItem {
  key: string;
  chapterNumber: number;
  displayChapterNumber: number | null;
  chapterLabel: string;
  focusCharacter: string;
  mainPlot: string;
  hookOut: string;
  milestoneLabel: string;
  status: ChapterBeatStatus;
  selected: boolean;
  isBoundChapter: boolean;
}

interface ChapterBeatCompactListProps {
  items: ChapterBeatListItem[];
  emptyTitle: string;
  emptyDescription: string;
  onSelect: (rowKey: string) => void;
  registerRowNode?: (rowKey: string, node: HTMLButtonElement | null) => void;
}

function getStatusMeta(status: ChapterBeatStatus) {
  switch (status) {
    case 'progressed':
      return {
        label: '已推进',
        icon: CheckCircle2,
        className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100',
      };
    case 'planned':
      return {
        label: '已规划',
        icon: Circle,
        className: 'border-sky-500/20 bg-sky-500/10 text-sky-100',
      };
    case 'empty':
    default:
      return {
        label: '未规划',
        icon: CircleDashed,
        className: 'border-neutral-800 bg-neutral-950/70 text-neutral-400',
      };
  }
}

export function ChapterBeatCompactList({
  items,
  emptyTitle,
  emptyDescription,
  onSelect,
  registerRowNode,
}: ChapterBeatCompactListProps) {
  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-[28px] border border-dashed border-neutral-800 bg-neutral-950/35 px-6 py-10 text-center">
        <div className="max-w-md">
          <p className="text-base font-medium text-neutral-100">{emptyTitle}</p>
          <p className="mt-3 text-sm leading-7 text-neutral-500">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const status = getStatusMeta(item.status);
        const StatusIcon = status.icon;

        return (
          <button
            key={item.key}
            type="button"
            ref={(node) => registerRowNode?.(item.key, node)}
            onClick={() => onSelect(item.key)}
            className={`w-full rounded-[24px] border p-4 text-left transition ${
              item.selected
                ? 'border-emerald-400/45 bg-emerald-500/10 shadow-[0_18px_40px_rgba(16,185,129,0.12)]'
                : 'border-neutral-800 bg-neutral-950/45 hover:border-neutral-700 hover:bg-neutral-900/70'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-neutral-800 bg-neutral-950/80 px-2.5 py-1 text-[11px] text-neutral-400">
                    {item.displayChapterNumber !== null ? `第 ${item.displayChapterNumber} 章` : `卷内第 ${item.chapterNumber} 拍`}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${status.className}`}>
                    <StatusIcon size={12} />
                    {status.label}
                  </span>
                  {item.milestoneLabel ? (
                    <span className="rounded-full border border-neutral-800 bg-neutral-950/80 px-2.5 py-1 text-[11px] text-neutral-400">
                      {item.milestoneLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-base font-medium text-neutral-100">{item.chapterLabel}</p>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950/70 px-2.5 py-1 text-[11px] text-neutral-400">
                <FileText size={12} />
                {item.isBoundChapter ? '已绑定章节' : '未绑定章节'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">焦点角色</p>
                <p className="mt-2 text-sm leading-6 text-neutral-200">{item.focusCharacter || '未填写'}</p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">主线推进</p>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-200">{item.mainPlot || '未填写'}</p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-6 text-neutral-500">
              章节钩子：{item.hookOut || '未填写'}
            </p>
          </button>
        );
      })}
    </div>
  );
}
