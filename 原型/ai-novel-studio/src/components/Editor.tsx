import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, PenTool, ListTree, Users, Shield, ChevronRight, ChevronDown, Search, FileText, AlignLeft } from 'lucide-react';
import { useToast } from './Toast';

interface EditorProps {
  content: string;
  setContent: (c: string) => void;
  activeLeftTab: 'outline' | 'characters' | 'factions';
}

export default function Editor({ content, setContent, activeLeftTab }: EditorProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
  const [isAiWriting, setIsAiWriting] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('第15章：神秘黑铁片');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const slashCommands = [
    { key: 'continue', icon: <PenTool size={16} />, label: '续写当前段落', shortcut: '⌘J' },
    { key: 'expand', icon: <ListTree size={16} />, label: '扩展大纲', shortcut: '⌘E' },
    { key: 'check', icon: <Sparkles size={16} />, label: '检查前后文逻辑矛盾', shortcut: '⌘D' },
    { key: 'rewrite', icon: <AlignLeft size={16} />, label: '润色当前段落', shortcut: '' },
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMenuIndex(prev => (prev + 1) % slashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMenuIndex(prev => (prev - 1 + slashCommands.length) % slashCommands.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommand(slashCommands[selectedMenuIndex].key);
        return;
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
        return;
      }
      // Any other printable key closes the menu
      if (e.key.length === 1 && e.key !== '/') {
        setShowSlashMenu(false);
      }
      return;
    }

    if (e.key === '/') {
      setSelectedMenuIndex(0);
      setShowSlashMenu(true);
    }
  };

  const handleCommand = (command: string) => {
    setShowSlashMenu(false);
    // Remove trailing slash
    const cleaned = content.endsWith('/') ? content.slice(0, -1) : content;

    if (command === 'continue') {
      setIsAiWriting(true);
      setContent(cleaned);
      toast('AI 正在续写...', 'info');
      setTimeout(() => {
        setContent(cleaned + '\n\n林冲深吸一口气，强压下体内翻涌的气血。他知道，这块黑铁片绝非凡物，上面隐约流转的纹路，竟与青云诀的运转路线有几分暗合。');
        setIsAiWriting(false);
        toast('续写完成', 'success');
      }, 1500);
    } else if (command === 'expand') {
      toast('扩展大纲功能即将上线', 'warning');
    } else if (command === 'check') {
      toast('逻辑检查完成：未发现明显矛盾', 'success');
    } else if (command === 'rewrite') {
      toast('润色功能即将上线', 'warning');
    }
  };

  // Click outside to close slash menu
  useEffect(() => {
    const handleClickOutside = () => setShowSlashMenu(false);
    if (showSlashMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showSlashMenu]);

  const wordCount = content.replace(/\s/g, '').length;

  return (
    <div className="flex h-full w-full bg-neutral-950 flex-1 min-w-0">
      {/* Left panel: outline / characters / factions — now controlled by Layout */}
      <div className="w-56 bg-neutral-900 border-r border-neutral-800 flex-col hidden xl:flex flex-shrink-0 overflow-y-auto p-3">
        {activeLeftTab === 'outline' && <OutlineTree />}
        {activeLeftTab === 'characters' && <CharacterSidebarList />}
        {activeLeftTab === 'factions' && <FactionSidebarMap />}
      </div>

      {/* Main editor pane */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <div className="max-w-3xl mx-auto w-full px-6 py-8 md:px-10 md:py-10 h-full flex flex-col">
          {/* Chapter title */}
          <div className="mb-6">
            <input
              type="text"
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              className="text-2xl md:text-3xl font-bold bg-transparent border-none outline-none text-neutral-100 w-full placeholder-neutral-700"
              placeholder="章节标题..."
            />
          </div>

          {/* Editor area */}
          <div className="flex-1 relative">
            {content.length === 0 && !isAiWriting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-neutral-600 gap-3">
                <FileText size={48} strokeWidth={1} />
                <p className="text-sm">输入 <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400 text-xs">/</kbd> 唤出 AI 指令，或直接开始写作</p>
              </div>
            )}

            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAiWriting}
              className={`w-full h-full bg-transparent border-none outline-none text-lg text-neutral-300 resize-none leading-loose placeholder-neutral-700 font-serif ${isAiWriting ? 'opacity-70' : ''}`}
              placeholder=""
            />

            {/* AI writing indicator */}
            {isAiWriting && (
              <div className="absolute bottom-4 left-0 flex items-center gap-2 text-indigo-400 text-sm">
                <div className="ai-typing flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                </div>
                <span>AI 正在续写...</span>
              </div>
            )}

            {/* Slash command menu */}
            {showSlashMenu && (
              <div
                className="absolute z-10 w-64 bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden top-2 left-0"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-700 bg-neutral-900/50">
                  AI 指令
                </div>
                <div className="p-1">
                  {slashCommands.map((cmd, i) => (
                    <button
                      key={cmd.key}
                      onClick={() => handleCommand(cmd.key)}
                      onMouseEnter={() => setSelectedMenuIndex(i)}
                      className={`w-full flex items-center justify-between px-2 py-2 text-sm rounded transition-colors ${
                        i === selectedMenuIndex
                          ? 'bg-indigo-600 text-white'
                          : 'text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {cmd.icon}
                        <span>{cmd.label}</span>
                      </div>
                      {cmd.shortcut && <span className="text-xs opacity-50">{cmd.shortcut}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom status bar */}
        <div className="h-8 border-t border-neutral-800 bg-neutral-900 flex items-center px-4 justify-between text-xs text-neutral-500 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span>{wordCount} 字</span>
            <span>{chapterTitle}</span>
          </div>
          <div className="flex items-center gap-4">
            {isAiWriting && <span className="text-indigo-400">AI 续写中...</span>}
            <span>自动保存</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Sub-components (outline, characters, factions) --- */

function OutlineTree() {
  return (
    <div className="space-y-1">
      <TreeFolder title="第一卷：末法余晖" defaultOpen={true}>
        <TreeItem title="第1章：废品站的少年" />
        <TreeItem title="第2章：灵能机械的轰鸣" />
        <TreeItem title="第3章：赵长老的遗言" />
        <TreeItem title="第4章：觉醒的青云诀" />
      </TreeFolder>
      <TreeFolder title="第二卷：下城区的暗流" defaultOpen={true}>
        <TreeItem title="第14章：黑市交易" />
        <TreeItem title="第15章：神秘黑铁片" active={true} />
        <TreeItem title="第16章：财阀的猎犬" />
      </TreeFolder>
      <TreeFolder title="第三卷：渊石之秘" defaultOpen={false}>
        <div className="pl-6 py-2 text-xs text-neutral-600 italic">暂无章节...</div>
      </TreeFolder>
    </div>
  );
}

function TreeFolder({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 rounded transition-colors"
      >
        {isOpen ? <ChevronDown size={14} className="text-neutral-500 flex-shrink-0" /> : <ChevronRight size={14} className="text-neutral-500 flex-shrink-0" />}
        <span className="font-medium truncate">{title}</span>
      </button>
      {isOpen && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

function TreeItem({ title, active = false }: { title: string; active?: boolean }) {
  return (
    <button
      className={`w-full flex items-center pl-7 pr-2 py-1.5 text-sm rounded transition-colors ${
        active ? 'bg-indigo-500/10 text-indigo-400 font-medium' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
      }`}
    >
      <span className="truncate">{title}</span>
    </button>
  );
}

function CharacterSidebarList() {
  return (
    <div className="space-y-3">
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
        <input type="text" placeholder="搜索人物..." className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors" />
      </div>
      <div className="space-y-1">
        {[
          { name: '林冲 (主角)', desc: '青云门最后传人', status: '' },
          { name: '苏婉儿', desc: '黑市情报商', status: '' },
          { name: '赵长老', desc: '已陨落', status: 'dead' },
        ].map((c) => (
          <div key={c.name} className="px-2 py-1.5 hover:bg-neutral-800 rounded cursor-pointer group">
            <div className="text-sm text-neutral-300 group-hover:text-indigo-400">{c.name}</div>
            <div className={`text-xs ${c.status === 'dead' ? 'text-red-400/70' : 'text-neutral-500'}`}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactionSidebarMap() {
  return (
    <div className="space-y-2">
      {[
        { name: '青云门 (覆灭)', desc: '曾经的修仙大派，现仅存主角一人。', color: 'text-indigo-400' },
        { name: '天工财阀', desc: '掌控下城区灵能机械制造的巨头。', color: 'text-red-400' },
        { name: '深渊教团', desc: '崇拜渊石的神秘组织。', color: 'text-purple-400' },
      ].map((f) => (
        <div key={f.name} className="p-3 bg-neutral-800/50 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors cursor-pointer">
          <div className={`text-sm font-medium ${f.color} mb-1`}>{f.name}</div>
          <div className="text-xs text-neutral-400">{f.desc}</div>
        </div>
      ))}
    </div>
  );
}
