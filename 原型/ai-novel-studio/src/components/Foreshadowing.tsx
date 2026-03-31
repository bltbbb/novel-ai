import React from 'react';
import { CheckCircle2, Circle, Clock, AlertTriangle, Plus } from 'lucide-react';
import { useToast } from './Toast';

type Priority = 'critical' | 'normal' | 'optional';
type Status = '未回收' | '已回收' | '超期';

interface Foreshadow {
  id: string;
  content: string;
  chapter: string;
  status: Status;
  priority: Priority;
  trigger: string;
  relatedCharacters?: string[];
  chaptersSincePlanted?: number;
}

const mockPits: Foreshadow[] = [
  {
    id: 'pit_001',
    content: '获得神秘黑铁片',
    chapter: '第15章',
    status: '未回收',
    priority: 'critical',
    trigger: '当进入[炼器宗]时触发',
    relatedCharacters: ['林冲'],
    chaptersSincePlanted: 0,
  },
  {
    id: 'pit_002',
    content: '赵长老临终前关于血月的遗言',
    chapter: '第3章',
    status: '已回收',
    priority: 'critical',
    trigger: '在血月大典期间',
    relatedCharacters: ['赵长老', '林冲'],
    chaptersSincePlanted: 12,
  },
  {
    id: 'pit_003',
    content: '主角灵兽的异常反应',
    chapter: '第22章',
    status: '超期',
    priority: 'normal',
    trigger: '遇到高阶妖兽时',
    relatedCharacters: ['林冲'],
    chaptersSincePlanted: 80,
  },
  {
    id: 'pit_004',
    content: '下城区废墟中的神秘符文',
    chapter: '第8章',
    status: '未回收',
    priority: 'optional',
    trigger: '探索深渊教团据点时',
    relatedCharacters: [],
    chaptersSincePlanted: 7,
  },
];

const priorityConfig: Record<Priority, { label: string; color: string; bg: string }> = {
  critical: { label: '主线', color: 'text-red-400', bg: 'bg-red-500/10' },
  normal: { label: '支线', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  optional: { label: '氛围', color: 'text-blue-400', bg: 'bg-blue-500/10' },
};

const statusConfig: Record<Status, { icon: React.ReactNode; color: string }> = {
  '未回收': { icon: <Circle size={14} />, color: 'text-yellow-500' },
  '已回收': { icon: <CheckCircle2 size={14} />, color: 'text-green-500' },
  '超期': { icon: <AlertTriangle size={14} />, color: 'text-red-500' },
};

export default function Foreshadowing() {
  const { toast } = useToast();

  const unresolvedCount = mockPits.filter(p => p.status !== '已回收').length;
  const overdueCount = mockPits.filter(p => p.status === '超期').length;

  return (
    <div className="p-6 md:p-8 h-full flex flex-col max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-neutral-100 mb-1">因果与伏笔追踪系统</h1>
          <p className="text-sm text-neutral-400">
            追踪 {mockPits.length} 条伏笔
            <span className="mx-1.5 text-neutral-600">|</span>
            <span className="text-yellow-400">{unresolvedCount} 未回收</span>
            {overdueCount > 0 && (
              <>
                <span className="mx-1.5 text-neutral-600">|</span>
                <span className="text-red-400">{overdueCount} 超期</span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => toast('添加伏笔功能即将上线', 'info')}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          添加伏笔
        </button>
      </div>

      {/* Desktop: table view */}
      <div className="hidden md:block bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex-1">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-950 border-b border-neutral-800 text-neutral-400">
            <tr>
              <th className="px-5 py-3 font-medium">伏笔内容</th>
              <th className="px-5 py-3 font-medium w-24">来源</th>
              <th className="px-5 py-3 font-medium">触发条件</th>
              <th className="px-5 py-3 font-medium w-20">优先级</th>
              <th className="px-5 py-3 font-medium w-20">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {mockPits.map(pit => (
              <tr key={pit.id} className="hover:bg-neutral-800/50 transition-colors cursor-pointer">
                <td className="px-5 py-3">
                  <div className="text-neutral-200 font-medium">{pit.content}</div>
                  {pit.relatedCharacters && pit.relatedCharacters.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {pit.relatedCharacters.map(c => (
                        <span key={c} className="text-xs px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded">{c}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-neutral-400">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} />
                    {pit.chapter}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center px-2 py-1 rounded bg-neutral-800 text-neutral-300 text-xs border border-neutral-700">
                    {pit.trigger}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${priorityConfig[pit.priority].bg} ${priorityConfig[pit.priority].color}`}>
                    {priorityConfig[pit.priority].label}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className={`flex items-center gap-1.5 ${statusConfig[pit.status].color}`}>
                    {statusConfig[pit.status].icon}
                    <span className="text-xs font-medium">{pit.status}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card view */}
      <div className="md:hidden flex-1 overflow-auto space-y-3">
        {mockPits.map(pit => (
          <div
            key={pit.id}
            className={`bg-neutral-900 border rounded-lg p-4 ${
              pit.status === '超期' ? 'border-red-500/30' : 'border-neutral-800'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium text-neutral-200 text-sm">{pit.content}</h3>
              <div className={`flex items-center gap-1 ${statusConfig[pit.status].color}`}>
                {statusConfig[pit.status].icon}
                <span className="text-xs">{pit.status}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className={`text-xs px-1.5 py-0.5 rounded ${priorityConfig[pit.priority].bg} ${priorityConfig[pit.priority].color}`}>
                {priorityConfig[pit.priority].label}
              </span>
              <span className="text-xs px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded flex items-center gap-1">
                <Clock size={10} />{pit.chapter}
              </span>
            </div>
            <p className="text-xs text-neutral-400">{pit.trigger}</p>
            {pit.relatedCharacters && pit.relatedCharacters.length > 0 && (
              <div className="flex gap-1 mt-2 pt-2 border-t border-neutral-800">
                {pit.relatedCharacters.map(c => (
                  <span key={c} className="text-xs px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded">{c}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
