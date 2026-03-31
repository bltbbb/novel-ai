import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Eye, GitBranch, LibraryBig, Network, Sparkles, Target } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { buildProjectGraph, type GraphEdge, type GraphNode, type GraphNodeKind } from '@/lib/project-graph';
import { useForeshadowStore, useLoreStore, useEditorStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { Id } from '@/types';

interface GraphWorkspaceProps {
  projectId: Id;
  onOpenChapter: (chapterId: Id) => void;
  onOpenForeshadow: (foreshadowId: Id) => void;
  onOpenLore: () => void;
}

type GraphFilter = 'all' | GraphNodeKind;

const filterOptions: Array<{ key: GraphFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'chapter', label: '章节' },
  { key: 'foreshadow', label: '伏笔' },
  { key: 'entity', label: '设定' },
];

const nodeColorMap: Record<GraphNodeKind, { border: string; background: string; text: string; icon: typeof BookOpen }> = {
  chapter: {
    border: 'border-sky-500/30',
    background: 'bg-sky-500/10',
    text: 'text-sky-200',
    icon: BookOpen,
  },
  foreshadow: {
    border: 'border-yellow-500/30',
    background: 'bg-yellow-500/10',
    text: 'text-yellow-200',
    icon: Target,
  },
  entity: {
    border: 'border-emerald-500/30',
    background: 'bg-emerald-500/10',
    text: 'text-emerald-200',
    icon: LibraryBig,
  },
};

const edgeLabelMap: Record<GraphEdge['kind'], string> = {
  chapter_entity: '正文命中设定',
  foreshadow_source: '来源章节',
  foreshadow_resolved: '回收章节',
  foreshadow_entity: '伏笔涉及设定',
  entity_entity: '设定关联',
};

function getNodeIcon(kind: GraphNodeKind) {
  return nodeColorMap[kind].icon;
}

function createEdgePath(source: GraphNode, target: GraphNode) {
  const startX = source.x + 112;
  const startY = source.y + 32;
  const endX = target.x + 112;
  const endY = target.y + 32;
  const controlOffset = Math.max(Math.abs(endX - startX) * 0.45, 80);

  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
}

export function GraphWorkspace({
  projectId,
  onOpenChapter,
  onOpenForeshadow,
  onOpenLore,
}: GraphWorkspaceProps) {
  const chapters = useEditorStore((state) => state.chapters);
  const entities = useLoreStore((state) => state.entities);
  const {
    foreshadows,
    loadedProjectId,
    loadForeshadows,
    setActiveForeshadow,
  } = useForeshadowStore();
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<GraphFilter>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (loadedProjectId === projectId) {
      return;
    }

    void loadForeshadows(projectId).catch(() => {
      toast('加载图谱数据失败', 'error');
    });
  }, [loadForeshadows, loadedProjectId, projectId, toast]);

  const graph = useMemo(() => {
    return buildProjectGraph({
      chapters,
      foreshadows,
      entities,
    });
  }, [chapters, entities, foreshadows]);

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();

    for (const node of graph.nodes) {
      if (activeFilter === 'all' || node.kind === activeFilter) {
        ids.add(node.id);
      }
    }

    return ids;
  }, [activeFilter, graph.nodes]);

  const visibleEdges = useMemo(() => {
    return graph.edges.filter((edge) => visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId));
  }, [graph.edges, visibleNodeIds]);

  const visibleNodes = useMemo(() => {
    return graph.nodes.filter((node) => visibleNodeIds.has(node.id));
  }, [graph.nodes, visibleNodeIds]);

  const selectedNode = useMemo(() => {
    return visibleNodes.find((node) => node.id === selectedNodeId) ?? visibleNodes[0] ?? null;
  }, [selectedNodeId, visibleNodes]);

  const selectedEdges = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    return visibleEdges.filter((edge) => edge.sourceId === selectedNode.id || edge.targetId === selectedNode.id);
  }, [selectedNode, visibleEdges]);

  const relatedNodeIds = useMemo(() => {
    const ids = new Set<string>();

    if (!selectedNode) {
      return ids;
    }

    ids.add(selectedNode.id);

    for (const edge of selectedEdges) {
      ids.add(edge.sourceId);
      ids.add(edge.targetId);
    }

    return ids;
  }, [selectedEdges, selectedNode]);

  useEffect(() => {
    if (visibleNodes.length === 0) {
      setSelectedNodeId(null);
      return;
    }

    if (!selectedNode || !visibleNodes.some((node) => node.id === selectedNode.id)) {
      setSelectedNodeId(visibleNodes[0].id);
    }
  }, [selectedNode, visibleNodes]);

  async function handleOpenSelectedNode() {
    if (!selectedNode) {
      return;
    }

    if (selectedNode.kind === 'chapter' && selectedNode.chapterId) {
      onOpenChapter(selectedNode.chapterId);
      return;
    }

    if (selectedNode.kind === 'foreshadow' && selectedNode.foreshadowId) {
      setActiveForeshadow(selectedNode.foreshadowId);
      onOpenForeshadow(selectedNode.foreshadowId);
      return;
    }

    if (selectedNode.kind === 'entity') {
      onOpenLore();
    }
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 p-8">
        <EmptyState
          icon={<Network size={22} />}
          title="图谱还没有可展示的节点"
          description="至少需要章节、伏笔或设定数据中的一种，才能在这里自动推导关系图谱。"
          details={
            <OnboardingChecklist
              title="推荐起步顺序"
              items={[
                '先在编辑器中创建章节并写入一些正文。',
                '在设定库中补充人物、地点、物品等基础实体。',
                '记录几条伏笔后，这里会自动把章节、设定和伏笔串起来。',
              ]}
            />
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/70">
      <section className="flex min-w-0 flex-1 flex-col border-r border-neutral-800">
        <div className="border-b border-neutral-800 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">关系图谱</p>
              <p className="mt-1 text-sm text-neutral-400">
                当前共 {graph.nodes.length} 个节点，{graph.edges.length} 条关系。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filterOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setActiveFilter(option.key)}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    activeFilter === option.key
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'bg-neutral-950/70 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="min-w-[1120px] rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="relative" style={{ width: graph.width, height: graph.height }}>
              <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${graph.width} ${graph.height}`} fill="none">
                {visibleEdges.map((edge) => {
                  const source = graph.nodes.find((node) => node.id === edge.sourceId);
                  const target = graph.nodes.find((node) => node.id === edge.targetId);

                  if (!source || !target) {
                    return null;
                  }

                  const isHighlighted = selectedNode ? selectedEdges.some((selectedEdge) => selectedEdge.id === edge.id) : true;

                  return (
                    <path
                      key={edge.id}
                      d={createEdgePath(source, target)}
                      stroke={isHighlighted ? 'rgba(129, 140, 248, 0.6)' : 'rgba(82, 82, 91, 0.45)'}
                      strokeWidth={isHighlighted ? 2.2 : 1.2}
                    />
                  );
                })}
              </svg>

              {visibleNodes.map((node) => {
                const palette = nodeColorMap[node.kind];
                const Icon = getNodeIcon(node.kind);
                const isActive = selectedNode?.id === node.id;
                const isMuted = selectedNode ? !relatedNodeIds.has(node.id) : false;

                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`absolute flex w-[224px] flex-col rounded-2xl border px-4 py-3 text-left transition-all ${
                      isActive
                        ? `${palette.border} ${palette.background} shadow-lg shadow-black/20`
                        : 'border-neutral-800 bg-neutral-900/85 hover:border-neutral-700 hover:bg-neutral-900'
                    } ${isMuted ? 'opacity-45' : 'opacity-100'}`}
                    style={{
                      left: node.x,
                      top: node.y,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-medium ${isActive ? palette.text : 'text-neutral-100'}`}>{node.label}</p>
                        <p className="mt-1 text-xs text-neutral-500">{node.meta}</p>
                      </div>
                      <div className={`rounded-xl p-2 ${isActive ? palette.background : 'bg-neutral-800 text-neutral-400'}`}>
                        <Icon size={14} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <aside className="hidden w-96 flex-shrink-0 flex-col bg-neutral-950/60 xl:flex">
        <div className="border-b border-neutral-800 px-5 py-4">
          <p className="text-sm font-medium text-neutral-100">节点详情</p>
          <p className="mt-2 text-xs leading-6 text-neutral-500">当前图谱会自动推导章节、伏笔和设定之间的关系，帮助你快速回看结构。 </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!selectedNode ? (
            <p className="text-sm text-neutral-500">当前没有可查看的节点。</p>
          ) : (
            <div className="space-y-5">
              <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-4">
                <div className="flex items-center gap-2 text-sm text-neutral-200">
                  <Sparkles size={14} className="text-indigo-400" />
                  当前节点
                </div>
                <div className="mt-4">
                  <p className="text-lg font-semibold text-neutral-100">{selectedNode.label}</p>
                  <p className="mt-2 text-sm text-neutral-500">{selectedNode.meta}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleOpenSelectedNode()}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                >
                  <Eye size={15} />
                  {selectedNode.kind === 'chapter'
                    ? '打开章节'
                    : selectedNode.kind === 'foreshadow'
                      ? '打开伏笔'
                      : '前往设定库'}
                </button>
              </section>

              <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-4">
                <div className="flex items-center gap-2 text-sm text-neutral-200">
                  <GitBranch size={14} className="text-indigo-400" />
                  相关连线
                </div>
                <div className="mt-4 space-y-3 text-sm text-neutral-400">
                  {selectedEdges.length === 0 ? (
                    <p className="text-neutral-500">当前节点还没有推导出关联关系。</p>
                  ) : (
                    selectedEdges.map((edge) => {
                      const relatedNodeId = edge.sourceId === selectedNode.id ? edge.targetId : edge.sourceId;
                      const relatedNode = graph.nodes.find((node) => node.id === relatedNodeId);

                      if (!relatedNode) {
                        return null;
                      }

                      return (
                        <div key={edge.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-3 py-3">
                          <p className="text-sm text-neutral-200">{relatedNode.label}</p>
                          <p className="mt-1 text-xs text-neutral-500">{edge.label || edgeLabelMap[edge.kind]}</p>
                          <p className="mt-2 text-xs text-neutral-500">{relatedNode.meta}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-4">
                <p className="text-sm text-neutral-200">当前推导规则</p>
                <div className="mt-3 space-y-2 text-xs leading-6 text-neutral-500">
                  <p>1. 章节命中设定名称或字段值，会连接章节与设定。</p>
                  <p>2. 伏笔会连接来源章节、回收章节以及提到的设定。</p>
                  <p>3. 设定之间若共享标签或互相提及，会自动建立关联。</p>
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
