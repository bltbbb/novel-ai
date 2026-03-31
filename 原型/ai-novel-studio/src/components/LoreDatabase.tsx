import React, { useState } from 'react';
import { Search, Plus, User, Map, Shield, Swords, Package, Calendar } from 'lucide-react';
import { useToast } from './Toast';

interface Entity {
  id: number;
  name: string;
  fields: Record<string, string>;
  status?: string;
  statusColor?: string;
  tags?: string[];
}

const mockData: Record<string, Entity[]> = {
  characters: [
    { id: 1, name: '林冲', fields: { '境界': '结丹期', '势力': '青云门', '身份': '最后传人', '动机': '寻找修复丹田的灵药' }, status: '存活', statusColor: 'green', tags: ['主角', '修仙者'] },
    { id: 2, name: '赵长老', fields: { '境界': '元婴期', '势力': '青云门', '身份': '前任长老', '死因': '护派战死' }, status: '陨落', statusColor: 'red', tags: ['NPC', '已故'] },
    { id: 3, name: '血魔老祖', fields: { '境界': '化神期', '势力': '血魔教', '身份': '教主', '威胁等级': '极高' }, status: '封印中', statusColor: 'purple', tags: ['反派', 'BOSS'] },
    { id: 4, name: '苏婉儿', fields: { '境界': '筑基期', '势力': '无', '身份': '黑市情报商', '动机': '赚取灵石' }, status: '存活', statusColor: 'green', tags: ['NPC', '盟友'] },
  ],
  locations: [
    { id: 10, name: '下城区废品回收站', fields: { '所属势力': '无（灰色地带）', '环境': '机械残骸堆积、灵气稀薄', '重要性': '主角据点' }, tags: ['主场景'] },
    { id: 11, name: '天工财阀总部', fields: { '所属势力': '天工财阀', '环境': '高科技灵能建筑群', '重要性': '敌方核心' }, tags: ['敌方'] },
    { id: 12, name: '青云门遗址', fields: { '所属势力': '青云门（已覆灭）', '环境': '灵气残留、阵法残破', '重要性': '传承之地' }, tags: ['遗迹'] },
  ],
  factions: [
    { id: 20, name: '青云门', fields: { '宗旨': '守护天地正气', '领袖': '赵长老（已故）', '现状': '仅存林冲一人' }, status: '覆灭', statusColor: 'red', tags: ['正道'] },
    { id: 21, name: '天工财阀', fields: { '宗旨': '垄断灵能科技', '领袖': '未知', '核心资源': '灵能机械制造技术' }, status: '活跃', statusColor: 'green', tags: ['势力', '敌对'] },
    { id: 22, name: '深渊教团', fields: { '宗旨': '崇拜渊石', '领袖': '大祭司', '核心资源': '渊石碎片' }, status: '暗中活动', statusColor: 'purple', tags: ['神秘'] },
  ],
  magic: [],
  items: [],
  events: [],
};

const tabs = [
  { key: 'characters', icon: <User size={16} />, label: '人物' },
  { key: 'locations', icon: <Map size={16} />, label: '地点' },
  { key: 'factions', icon: <Shield size={16} />, label: '势力' },
  { key: 'magic', icon: <Swords size={16} />, label: '力量体系' },
  { key: 'items', icon: <Package size={16} />, label: '物品' },
  { key: 'events', icon: <Calendar size={16} />, label: '事件' },
];

export default function LoreDatabase() {
  const [activeTab, setActiveTab] = useState('characters');
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const entities = mockData[activeTab] || [];
  const filtered = searchQuery
    ? entities.filter(e => e.name.includes(searchQuery) || Object.values(e.fields).some(v => v.includes(searchQuery)))
    : entities;

  return (
    <div className="p-6 md:p-8 h-full flex flex-col max-w-6xl mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-neutral-100">设定与世界观图谱</h1>
        <button
          onClick={() => toast('新建实体功能即将上线', 'info')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">新建实体</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-neutral-800 pb-px overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-5 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索实体..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-sm text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <EmptyState tab={activeTab} hasSearch={!!searchQuery} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(entity => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntityCard({ entity }: { entity: Entity }) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-500/10 text-green-400',
    red: 'bg-red-500/10 text-red-400',
    purple: 'bg-purple-500/10 text-purple-400',
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors cursor-pointer group">
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-medium text-neutral-200 group-hover:text-indigo-400 transition-colors">{entity.name}</h3>
        {entity.status && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${colorMap[entity.statusColor || 'green']}`}>
            {entity.status}
          </span>
        )}
      </div>
      <div className="space-y-1.5 text-xs text-neutral-400 mb-3">
        {Object.entries(entity.fields).map(([key, value]) => (
          <p key={key} className="flex justify-between gap-2">
            <span className="text-neutral-500 flex-shrink-0">{key}：</span>
            <span className="text-neutral-300 text-right truncate">{value}</span>
          </p>
        ))}
      </div>
      {entity.tags && entity.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap pt-2 border-t border-neutral-800">
          {entity.tags.map(tag => (
            <span key={tag} className="text-xs px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ tab, hasSearch }: { tab: string; hasSearch: boolean }) {
  const tabLabel = tabs.find(t => t.key === tab)?.label || tab;

  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
        <Search size={40} strokeWidth={1} className="mb-3 text-neutral-600" />
        <p className="text-sm">没有找到匹配的{tabLabel}</p>
        <p className="text-xs mt-1 text-neutral-600">尝试其他关键词</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
      <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center mb-4">
        <Plus size={24} className="text-neutral-600" />
      </div>
      <p className="text-sm mb-1">暂无{tabLabel}设定</p>
      <p className="text-xs text-neutral-600">点击"新建实体"开始构建世界观</p>
    </div>
  );
}
