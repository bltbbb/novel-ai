import React, { useState } from 'react';
import { Activity, Zap, Eye, Pin, PinOff, BookOpen } from 'lucide-react';
import { useToast } from './Toast';

interface PinnedEntity {
  name: string;
  type: string;
  pinned: boolean;
}

export default function ContextInspector({ content }: { content: string }) {
  const { toast } = useToast();

  const hasLinChong = content.includes('林冲');
  const hasIron = content.includes('黑铁片') || content.includes('铁片');

  const [pinnedEntities, setPinnedEntities] = useState<PinnedEntity[]>([
    { name: '青云诀功法规则', type: '力量体系', pinned: true },
    { name: '灵能机械设定', type: '世界观', pinned: false },
  ]);

  const togglePin = (index: number) => {
    setPinnedEntities(prev => {
      const next = [...prev];
      next[index] = { ...next[index], pinned: !next[index].pinned };
      toast(next[index].pinned ? `已钉住「${next[index].name}」到上下文` : `已取消钉住「${next[index].name}」`, 'success');
      return next;
    });
  };

  const pinnedCount = pinnedEntities.filter(e => e.pinned).length;
  const tokenUsed = 16450;
  const tokenTotal = 32000;
  const tokenPercent = Math.round((tokenUsed / tokenTotal) * 100);

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      <div className="p-3 border-b border-neutral-800">
        <h2 className="text-xs font-medium text-neutral-500 uppercase flex items-center gap-2">
          <Activity size={14} className="text-indigo-400" />
          AI 监控面板
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* Token Usage */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-500 uppercase flex items-center gap-1.5">
            <Eye size={12} />
            AI 视野 · {tokenPercent}%
          </h3>
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-neutral-400">Token 占用</span>
              <span className="text-neutral-200 font-mono">{tokenUsed.toLocaleString()} / {tokenTotal.toLocaleString()}</span>
            </div>
            <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden flex">
              <div className="bg-blue-500 h-full" style={{ width: '10%' }} title="基础设定"></div>
              <div className="bg-purple-500 h-full" style={{ width: '40%' }} title="记忆/RAG"></div>
              <div className="bg-green-500 h-full" style={{ width: `${tokenPercent - 50}%` }} title="当前文本"></div>
            </div>
            <div className="mt-2 flex flex-col gap-1 text-xs text-neutral-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> 基础设定</div>
                <span>10%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div> 记忆/RAG</div>
                <span>40%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> 当前文本</div>
                <span className="text-green-400">50%</span>
              </div>
            </div>
          </div>
        </section>

        {/* Pinned Context Entities */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-500 uppercase flex items-center gap-1.5">
            <Pin size={12} />
            上下文钉选 ({pinnedCount})
          </h3>
          <div className="space-y-1.5">
            {pinnedEntities.map((entity, i) => (
              <div
                key={entity.name}
                className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs ${
                  entity.pinned
                    ? 'bg-indigo-500/5 border-indigo-500/20 text-neutral-200'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate">{entity.name}</div>
                  <div className="text-xs text-neutral-500">{entity.type}</div>
                </div>
                <button
                  onClick={() => togglePin(i)}
                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                    entity.pinned
                      ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                  }`}
                  title={entity.pinned ? '取消钉选' : '钉选到上下文'}
                >
                  {entity.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Active Characters */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-500 uppercase">当前在场人物</h3>
          {hasLinChong ? (
            <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 border-l-2 border-l-green-500">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-sm text-neutral-200">林冲</span>
                <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded border border-green-500/20">在场</span>
              </div>
              <div className="text-xs text-neutral-400 space-y-1">
                <p className="flex justify-between"><span className="text-neutral-500">境界：</span><span className="text-neutral-300">结丹期</span></p>
                <p className="flex justify-between"><span className="text-neutral-500">状态：</span><span className="text-red-400">重伤 (70%)</span></p>
                <p className="flex justify-between"><span className="text-neutral-500">目标：</span><span className="text-neutral-300 truncate max-w-[100px]" title="寻找修复丹田的灵药">修复丹田灵药</span></p>
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-600 bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/50 text-center">
              当前未识别到核心人物
            </div>
          )}
        </section>

        {/* AI Reference Log */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-500 uppercase flex items-center gap-1.5">
            <BookOpen size={12} />
            AI 参考依据
          </h3>
          {content.length > 0 ? (
            <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 text-neutral-300">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                青云诀功法描述 (设定库)
              </div>
              {hasLinChong && (
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                  林冲·人物卡 (设定库)
                </div>
              )}
              <div className="flex items-center gap-1.5 text-neutral-300">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                第14章全文 (近期上下文)
              </div>
              <div className="text-xs text-neutral-600 mt-2 pt-2 border-t border-neutral-800 italic">
                以上为 AI 续写时引用的设定条目
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-600 bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/50 text-center">
              开始写作后显示 AI 参考依据
            </div>
          )}
        </section>

        {/* Foreshadowing Alerts */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-500 uppercase flex items-center gap-1.5">
            <Zap size={12} className="text-yellow-500" />
            触发器警报
          </h3>
          {hasIron ? (
            <div className="bg-yellow-500/10 rounded-xl p-3 border border-yellow-500/20">
              <p className="text-xs text-yellow-200/90 leading-relaxed">
                <strong className="text-yellow-400 block mb-1">伏笔提醒</strong>
                您提到了"黑铁片"。这是第15章的一个未回收伏笔（主线级别）。是否需要 AI 在接下来的段落中展开？
              </p>
              <button
                onClick={() => toast('自动回收伏笔功能即将上线', 'info')}
                className="mt-2 w-full py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs transition-colors font-medium"
              >
                自动回收伏笔
              </button>
            </div>
          ) : (
            <div className="text-xs text-neutral-600 bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/50 text-center">
              当前无激活的触发器
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
