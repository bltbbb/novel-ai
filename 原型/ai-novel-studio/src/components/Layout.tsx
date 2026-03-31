import React, { useState } from 'react';
import { Book, Users, Target, Settings, Sparkles, Lightbulb, ChevronLeft, ListTree, Shield, PanelRightOpen, PanelRightClose } from 'lucide-react';
import Editor from './Editor';
import ContextInspector from './ContextInspector';
import LoreDatabase from './LoreDatabase';
import Foreshadowing from './Foreshadowing';
import ProjectList from './ProjectList';
import Brainstorming from './Brainstorming';

const mockProjects: Record<string, string> = {
  '1': '最后一个修仙者',
  '2': '深渊凝望',
};

export default function Layout() {
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'brainstorm' | 'editor' | 'lore' | 'foreshadow'>('brainstorm');
  const [content, setContent] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  // Editor sub-tabs managed here to avoid nested sidebar
  const [editorLeftTab, setEditorLeftTab] = useState<'outline' | 'characters' | 'factions'>('outline');

  if (!activeProject) {
    return (
      <ProjectList
        onSelect={(id) => {
          setActiveProject(id);
          setActiveView('brainstorm');
        }}
      />
    );
  }

  const projectName = mockProjects[activeProject] || '未命名项目';

  const viewLabels: Record<string, string> = {
    brainstorm: '前期大纲构建',
    editor: '智能编辑器',
    lore: '设定与世界观',
    foreshadow: '伏笔追踪',
  };

  // Build nav items based on current view
  const navItems = [
    { key: 'brainstorm' as const, icon: <Lightbulb size={20} />, label: '灵感发散' },
    { key: 'editor' as const, icon: <Book size={20} />, label: '智能编辑器' },
    { key: 'lore' as const, icon: <Users size={20} />, label: '设定与世界观' },
    { key: 'foreshadow' as const, icon: <Target size={20} />, label: '伏笔追踪' },
  ];

  // Editor sub-nav tabs (shown below main nav when in editor view)
  const editorSubTabs = [
    { key: 'outline' as const, icon: <ListTree size={16} />, label: '大纲树' },
    { key: 'characters' as const, icon: <Users size={16} />, label: '人物' },
    { key: 'factions' as const, icon: <Shield size={16} />, label: '势力' },
  ];

  return (
    <div className="flex h-screen bg-neutral-900 text-neutral-300 font-sans overflow-hidden">
      {/* Left Sidebar - unified navigation */}
      <div className={`${sidebarCollapsed ? 'w-16' : 'w-56'} bg-neutral-950 border-r border-neutral-800 flex flex-col flex-shrink-0 transition-all duration-200`}>
        {/* Logo */}
        <div className="p-3 border-b border-neutral-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            AI
          </div>
          {!sidebarCollapsed && <span className="font-bold text-white text-sm truncate">Novel Studio</span>}
        </div>

        {/* Back to projects */}
        <div className="p-2 border-b border-neutral-800">
          <button
            onClick={() => setActiveProject(null)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 rounded transition-colors"
            title="返回项目列表"
          >
            <ChevronLeft size={14} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>返回项目列表</span>}
          </button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 py-3 flex flex-col gap-1 overflow-y-auto">
          {navItems.map(item => (
            <NavItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              active={activeView === item.key}
              collapsed={sidebarCollapsed}
              onClick={() => setActiveView(item.key)}
            />
          ))}

          {/* Editor sub-tabs: inline under "编辑器" when active */}
          {activeView === 'editor' && !sidebarCollapsed && (
            <div className="ml-4 mt-1 pl-3 border-l border-neutral-800 space-y-0.5">
              {editorSubTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setEditorLeftTab(tab.key)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors ${
                    editorLeftTab === tab.key
                      ? 'text-indigo-400 bg-indigo-500/10'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Bottom: settings + collapse toggle */}
        <div className="border-t border-neutral-800">
          <NavItem icon={<Settings size={20} />} label="系统设置" active={false} collapsed={sidebarCollapsed} onClick={() => {}} />
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center py-2 text-neutral-500 hover:text-neutral-300 transition-colors"
            title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            {sidebarCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-neutral-800 bg-neutral-900 flex items-center px-4 justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-neutral-400 min-w-0">
            <span className="truncate">项目：{projectName}</span>
            <span className="text-neutral-600">/</span>
            <span className="text-neutral-200 truncate">{viewLabels[activeView]}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {activeView === 'editor' && (
              <button
                onClick={() => setShowRightPanel(!showRightPanel)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded text-xs transition-colors"
                title={showRightPanel ? '隐藏 AI 面板' : '显示 AI 面板'}
              >
                {showRightPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                <span className="hidden sm:inline">AI 面板</span>
              </button>
            )}
            <button className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Sparkles size={14} />
              <span className="hidden sm:inline">AI 辅助</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden bg-neutral-900 flex">
          {activeView === 'brainstorm' && <Brainstorming />}
          {activeView === 'editor' && (
            <>
              <Editor content={content} setContent={setContent} activeLeftTab={editorLeftTab} />
              {showRightPanel && (
                <div className="w-72 xl:w-80 bg-neutral-950 border-l border-neutral-800 flex-col hidden lg:flex flex-shrink-0">
                  <ContextInspector content={content} />
                </div>
              )}
            </>
          )}
          {activeView === 'lore' && <LoreDatabase />}
          {activeView === 'foreshadow' && <Foreshadowing />}
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, collapsed, onClick }: { icon: React.ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-4 py-2 transition-colors ${
        active
          ? 'bg-neutral-800 text-white border-r-2 border-indigo-500'
          : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
      }`}
    >
      <div className="flex-shrink-0">{icon}</div>
      {!collapsed && <span className="text-sm font-medium text-left truncate">{label}</span>}
    </button>
  );
}
