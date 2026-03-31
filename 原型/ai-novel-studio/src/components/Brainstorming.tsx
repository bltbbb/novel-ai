import React, { useState } from 'react';
import { Sparkles, Send, Pin, Plus, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useToast } from './Toast';

export default function Brainstorming() {
  const [input, setInput] = useState('');
  const [showIdeas, setShowIdeas] = useState(false);
  const { toast } = useToast();

  const handleSend = () => {
    if (!input.trim()) return;
    toast('AI 对话功能即将上线', 'info');
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* Left: AI Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900">
          <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
            <Sparkles className="text-indigo-400" size={18} />
            灵感发散引擎
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-1 rounded hidden sm:block">Claude 3.5 Sonnet</span>
            {/* Toggle ideas panel on smaller screens */}
            <button
              onClick={() => setShowIdeas(!showIdeas)}
              className="lg:hidden flex items-center gap-1.5 px-2 py-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded text-xs transition-colors"
              title={showIdeas ? '隐藏灵感板' : '显示灵感板'}
            >
              {showIdeas ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              <span>灵感板</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-neutral-900">
          {/* AI message */}
          <ChatBubble role="ai">
            <p>你好！我是你的专属网文架构师。关于《最后一个修仙者》，我们目前只有一个粗略的想法："在灵气枯竭的末法时代，一个带着上古传承的少年如何逆天改命。"</p>
            <p className="mt-2">你想从哪个方面开始发散？</p>
            <ul className="mt-2 space-y-1 text-indigo-300">
              <li className="cursor-pointer hover:underline">1. 设定"末法时代"的具体社会形态和力量体系</li>
              <li className="cursor-pointer hover:underline">2. 构思主角的"上古传承"到底是什么金手指</li>
              <li className="cursor-pointer hover:underline">3. 设计开局的第一个核心冲突（退婚、灭门、还是捡漏？）</li>
            </ul>
          </ChatBubble>

          {/* User message */}
          <ChatBubble role="user">
            <p>我想先设定"末法时代"。灵气枯竭后，修仙者不再高高在上，而是被凡人利用科技或者某种新力量压制。主角是底层的一个废柴。</p>
          </ChatBubble>

          {/* AI reply */}
          <ChatBubble role="ai">
            <p>这个反差设定非常有张力！"修仙者跌落神坛"能带来强烈的冲突感。我们可以引入一种名为<strong>"灵能机械"</strong>或<strong>"渊石驱动"</strong>的新体系。</p>
            <p className="mt-2"><strong>初步构思：</strong></p>
            <p className="mt-1 text-neutral-400">凡人财阀掌握了提取残存灵气驱动机械的技术（机甲、灵能枪），传统的吐纳修仙因为灵气稀薄变得极其缓慢且容易走火入魔。修仙者甚至沦为了财阀的"人体电池"或"稀有实验材料"。</p>
            <p className="mt-2">主角作为一个传统修仙门派的最后传人，隐藏在贫民窟的废品回收站里。你觉得这个背景基调怎么样？如果满意，我们可以把它固定到右侧的【核心设定板】中。</p>
          </ChatBubble>
        </div>

        {/* Input area */}
        <div className="p-3 md:p-4 border-t border-neutral-800 bg-neutral-950">
          <div className="relative max-w-3xl mx-auto">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的想法，让 AI 帮你完善... (Enter 发送, Shift+Enter 换行)"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl pl-4 pr-12 py-3 text-sm text-neutral-200 focus:outline-none focus:border-indigo-500 resize-none h-14"
            />
            <button
              onClick={handleSend}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Pinned Ideas — visible on lg or when toggled */}
      <div className={`w-80 bg-neutral-950 flex-col border-l border-neutral-800 flex-shrink-0 ${showIdeas ? 'flex' : 'hidden lg:flex'}`}>
        <div className="p-4 border-b border-neutral-800">
          <h2 className="text-xs font-medium text-neutral-500 uppercase flex items-center gap-2">
            <Pin size={14} />
            灵感收集板
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <IdeaCard
            title="核心世界观：赛博修仙"
            content="灵气枯竭，凡人财阀利用'灵能机械'统治世界。传统修仙者沦为底层、异端甚至'人体电池'。"
            tags={['世界观', '基调']}
          />
          <IdeaCard
            title="主角开局身份"
            content="隐藏在下城区废品回收站的少年，表面是机械修理工，暗地里是古老门派'青云门'的最后传人。"
            tags={['主角', '开局']}
          />
          <div className="border-2 border-dashed border-neutral-800 rounded-xl p-4 flex flex-col items-center justify-center text-neutral-500 text-sm cursor-pointer hover:bg-neutral-900 hover:border-neutral-600 transition-colors">
            <Plus size={20} className="mb-2" />
            <span>手动添加灵感卡片</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ role, children }: { role: 'ai' | 'user'; children: React.ReactNode }) {
  if (role === 'user') {
    return (
      <div className="flex gap-3 flex-row-reverse">
        <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-neutral-300">我</span>
        </div>
        <div className="bg-indigo-600 rounded-2xl rounded-tr-none p-4 text-sm text-white max-w-[85%] leading-relaxed">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
        <Sparkles size={14} className="text-white" />
      </div>
      <div className="bg-neutral-800 rounded-2xl rounded-tl-none p-4 text-sm text-neutral-200 max-w-[85%] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function IdeaCard({ title, content, tags }: { title: string; content: string; tags: string[] }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 group hover:border-neutral-700 transition-colors">
      <div className="flex justify-between items-start mb-1.5">
        <h3 className="font-medium text-neutral-200 text-sm">{title}</h3>
        <button className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none">
          &times;
        </button>
      </div>
      <p className="text-xs text-neutral-400 leading-relaxed mb-2">{content}</p>
      <div className="flex gap-1.5 flex-wrap">
        {tags.map(tag => (
          <span key={tag} className="text-xs px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
