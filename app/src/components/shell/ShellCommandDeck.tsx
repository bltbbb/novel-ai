import { ArrowLeft, FlaskConical, LibraryBig, Settings2, Sparkles } from 'lucide-react';
import { ShellActionMenu } from '@/components/shell/ShellActionMenu';

interface ShellCommandDeckProps {
  activeViewLabel: string;
  wordCount: number;
  chapterCount: number;
  entityCount: number;
  serverStatusMeta: {
    label: string;
    note: string;
    dotClassName: string;
    textClassName: string;
  };
  onOpenProjectSettings: () => void;
  onOpenSettings: () => void;
  onOpenTemplateBinding: () => void;
  onOpenTemplateLibrary: () => void;
  onOpenCompatibilityConsole: () => void;
  onBackToProjects: () => void;
}

const numberFormatter = new Intl.NumberFormat('zh-CN');

export function ShellCommandDeck({
  activeViewLabel,
  wordCount,
  chapterCount,
  entityCount,
  serverStatusMeta,
  onOpenProjectSettings,
  onOpenSettings,
  onOpenTemplateBinding,
  onOpenTemplateLibrary,
  onOpenCompatibilityConsole,
  onBackToProjects,
}: ShellCommandDeckProps) {
  return (
    <header className="studio-shell studio-command-deck">
      <div className="studio-command-deck__identity">
        <div className="flex flex-wrap items-center gap-2">
          <p className="studio-overline">Command Deck</p>
          <span className="studio-chip studio-chip--accent studio-chip--compact">{activeViewLabel}</span>
        </div>
      </div>

      <div className="studio-command-deck__meta">
        <div
          className={`studio-status-pill studio-status-pill--compact ${serverStatusMeta.textClassName}`}
          title={serverStatusMeta.note}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${serverStatusMeta.dotClassName}`} />
          {serverStatusMeta.label}
        </div>
        <span className="studio-command-metric">
          <span className="studio-command-metric__label">正文</span>
          <strong className="studio-command-metric__value">{numberFormatter.format(wordCount)}</strong>
        </span>
        <span className="studio-command-metric">
          <span className="studio-command-metric__label">章节</span>
          <strong className="studio-command-metric__value">{numberFormatter.format(chapterCount)}</strong>
        </span>
        <span className="studio-command-metric">
          <span className="studio-command-metric__label">设定</span>
          <strong className="studio-command-metric__value">{numberFormatter.format(entityCount)}</strong>
        </span>
      </div>

      <div className="studio-command-deck__actions">
        <ShellActionMenu
          label="设置"
          icon={Settings2}
          items={[
            {
              icon: Settings2,
              label: '项目设置',
              note: '项目元信息、风格与运行配置',
              onSelect: onOpenProjectSettings,
            },
            {
              icon: Sparkles,
              label: 'AI 设置',
              note: '模型、服务地址与提示参数',
              onSelect: onOpenSettings,
            },
          ]}
        />
        <ShellActionMenu
          label="模板"
          icon={Sparkles}
          items={[
            {
              icon: Sparkles,
              label: '管理项目模板',
              note: '绑定或替换当前项目模板',
              onSelect: onOpenTemplateBinding,
            },
            {
              icon: LibraryBig,
              label: '打开模板库',
              note: '浏览与筛选全部模板资源',
              onSelect: onOpenTemplateLibrary,
            },
          ]}
        />
        <button type="button" onClick={onOpenCompatibilityConsole} className="studio-command-button">
          <FlaskConical size={15} />
          兼容控制台
        </button>
        <button
          type="button"
          onClick={onBackToProjects}
          className="studio-command-button studio-command-button--ghost"
        >
          <ArrowLeft size={15} />
          返回项目列表
        </button>
      </div>
    </header>
  );
}
