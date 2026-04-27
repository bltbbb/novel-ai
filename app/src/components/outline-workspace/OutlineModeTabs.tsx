export type OutlineWorkspaceMode = 'book' | 'volume' | 'milestone' | 'beats' | 'outline';

interface OutlineModeTabsProps {
  value: OutlineWorkspaceMode;
  onChange: (mode: OutlineWorkspaceMode) => void;
  disabledModes?: Partial<Record<OutlineWorkspaceMode, boolean>>;
}

const MODE_ITEMS: Array<{
  value: OutlineWorkspaceMode;
  label: string;
  detail: string;
}> = [
  {
    value: 'book',
    label: '全书总纲',
    detail: '只处理整本书的方向、冲突和世界规则。',
  },
  {
    value: 'volume',
    label: '当前卷纲',
    detail: '聚焦当前卷的目标、弧线和关键事件。',
  },
  {
    value: 'milestone',
    label: '里程碑',
    detail: '按阶段维护目标、冲突和范围。',
  },
  {
    value: 'beats',
    label: '章节拍',
    detail: '用紧凑列表定位章节，再到检查器里细改。',
  },
  {
    value: 'outline',
    label: '章纲',
    detail: '逐章维护正文前的执行纲要与伏笔安排。',
  },
];

export function OutlineModeTabs({
  value,
  onChange,
  disabledModes,
}: OutlineModeTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {MODE_ITEMS.map((item) => {
        const selected = item.value === value;
        const disabled = disabledModes?.[item.value] === true;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            disabled={disabled}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              selected
                ? 'border-emerald-400/50 bg-emerald-500/12 text-emerald-50 shadow-[0_12px_28px_rgba(16,185,129,0.12)]'
                : 'border-neutral-800 bg-neutral-950/50 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900/70'
            } min-w-[124px] disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <p className="text-sm font-medium">{item.label}</p>
          </button>
        );
      })}
    </div>
  );
}
