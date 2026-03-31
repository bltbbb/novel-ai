import React from 'react';
import { Plus, BookOpen, Clock, MoreVertical, Sparkles } from 'lucide-react';
import { useToast } from './Toast';

const mockProjects = [
  { 
    id: '1', 
    title: '最后一个修仙者', 
    genre: '仙侠 / 修真', 
    wordCount: '12.5w', 
    lastModified: '2小时前', 
    description: '在灵气枯竭的末法时代，一个带着上古传承的少年如何逆天改命。' 
  },
  { 
    id: '2', 
    title: '深渊凝望', 
    genre: '悬疑 / 克苏鲁', 
    wordCount: '3.2w', 
    lastModified: '昨天', 
    description: '调查员在迷雾小镇中发现的不可名状之物，以及隐藏在血脉中的诅咒。' 
  },
];

export default function ProjectList({ onSelect }: { onSelect: (id: string) => void }) {
  const { toast } = useToast();
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100 mb-2 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                AI
              </div>
              Novel Studio
            </h1>
            <p className="text-neutral-400">管理您的长篇小说项目与灵感库。</p>
          </div>
          <button
            onClick={() => toast('新建项目功能即将上线', 'info')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={18} />
            <span>新建项目</span>
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Create New Card */}
          <div className="group border-2 border-dashed border-neutral-800 hover:border-indigo-500/50 bg-neutral-900/50 hover:bg-neutral-900 rounded-xl p-6 flex flex-col items-center justify-center text-neutral-500 hover:text-indigo-400 transition-all cursor-pointer min-h-[240px]">
            <div className="w-14 h-14 rounded-full bg-neutral-800 group-hover:bg-indigo-500/10 flex items-center justify-center mb-4 transition-colors">
              <Sparkles size={24} />
            </div>
            <h3 className="text-lg font-medium mb-1">开启新故事</h3>
            <p className="text-sm text-center px-4">从一个模糊的灵感开始，让 AI 帮你构建世界观。</p>
          </div>

          {/* Project Cards */}
          {mockProjects.map(project => (
            <div 
              key={project.id} 
              onClick={() => onSelect(project.id)}
              className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl p-5 flex flex-col transition-all cursor-pointer group hover:shadow-xl hover:shadow-black/50"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2.5 bg-neutral-800 rounded-lg text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
                  <BookOpen size={20} />
                </div>
                <button className="text-neutral-500 hover:text-neutral-300 p-1" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical size={18} />
                </button>
              </div>
              
              <h3 className="text-xl font-bold text-neutral-100 mb-2 group-hover:text-indigo-300 transition-colors">{project.title}</h3>
              <p className="text-sm text-neutral-400 mb-6 line-clamp-2 flex-1">{project.description}</p>
              
              <div className="flex items-center justify-between text-xs text-neutral-500 pt-4 border-t border-neutral-800">
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 bg-neutral-800 rounded text-neutral-300">{project.genre}</span>
                  <span>{project.wordCount} 字</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={12} />
                  {project.lastModified}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
