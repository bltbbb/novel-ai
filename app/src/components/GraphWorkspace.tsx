import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Eye, GitBranch, LibraryBig, Network, Sparkles, Target } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import {
  fetchGenerationDebugEntities,
  fetchGenerationDebugForeshadows,
  fetchGenerationDebugRelationships,
} from '@/lib/generation-debug-client';
import { buildProjectGraph, type GraphEdge, type GraphNode, type GraphNodeKind } from '@/lib/project-graph';
import { useEntityRelationStore, useForeshadowStore, useLoreStore, useEditorStore, useSettingsStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type {
  EntityRelation,
  GenerationDebugEntityRecord,
  GenerationDebugForeshadowRecord,
  GenerationDebugRelationshipRecord,
  Id,
} from '@/types';

interface GraphWorkspaceProps {
  projectId: Id;
  onOpenChapter: (chapterId: Id) => void;
  onOpenForeshadow: (foreshadowId: Id) => void;
  onOpenLore: () => void;
}

type GraphFilter = 'all' | GraphNodeKind;
type GraphViewMode = 'overview' | 'relations';

interface RelationGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  meta: string;
  kind: 'explicit' | 'automatic';
  draft?: boolean;
}

interface CharacterRelationGraph {
  nodes: GraphNode[];
  edges: RelationGraphEdge[];
  width: number;
  height: number;
  explicitEdgeCount: number;
  automaticEdgeCount: number;
}

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

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function createRelationNodeId(entityId: string) {
  return `relation:entity:${entityId}`;
}

function buildRelationPairKey(left: string, right: string) {
  return [normalizeText(left), normalizeText(right)].sort().join('::');
}

function isExplicitSnapshotSourceKind(value: string) {
  return value === 'explicit_manual' || value === 'explicit_manual_draft';
}

function layoutRelationNodes(characters: Array<{ id: string; name: string; meta: string }>) {
  const columnCount = Math.max(2, Math.ceil(Math.sqrt(Math.max(characters.length, 1))));
  const rowGap = 112;
  const columnGap = 260;
  const originX = 96;
  const originY = 88;

  const nodes = characters.map((character, index) => {
    const rowIndex = Math.floor(index / columnCount);
    const columnIndex = index % columnCount;

    return {
      id: createRelationNodeId(character.id),
      entityId: character.id,
      kind: 'entity' as const,
      label: character.name,
      meta: character.meta,
      x: originX + columnIndex * columnGap,
      y: originY + rowIndex * rowGap,
    } satisfies GraphNode;
  });

  const rowCount = Math.max(1, Math.ceil(characters.length / columnCount));

  return {
    nodes,
    width: Math.max(1120, originX * 2 + columnCount * columnGap),
    height: Math.max(520, originY * 2 + rowCount * rowGap),
  };
}

function buildCharacterRelationGraph(input: {
  entities: Array<{ id: string; name: string; meta: string }>;
  explicitRelations: EntityRelation[];
  runtimeRelationships: GenerationDebugRelationshipRecord[];
}) {
  const sortedCharacters = [...input.entities].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  const { nodes, width, height } = layoutRelationNodes(sortedCharacters);
  const entityIdSet = new Set(sortedCharacters.map((item) => item.id));
  const nameToEntity = new Map(sortedCharacters.map((item) => [normalizeText(item.name), item] as const));
  const explicitEdges = input.explicitRelations
    .filter((relation) => entityIdSet.has(relation.sourceEntityId) && entityIdSet.has(relation.targetEntityId))
    .map((relation) => ({
      id: `explicit:${relation.id}`,
      sourceId: createRelationNodeId(relation.sourceEntityId),
      targetId: createRelationNodeId(relation.targetEntityId),
      label: [relation.relationType.trim(), relation.currentStance.trim()].filter(Boolean).join(' / ') || '未命名关系',
      meta: relation.draft ? '显式关系草案（候选）' : '显式关系真源',
      kind: 'explicit' as const,
      draft: relation.draft,
    }));
  const automaticEdgeMap = new Map<string, RelationGraphEdge>();

  for (const item of input.runtimeRelationships) {
    if (isExplicitSnapshotSourceKind(item.sourceKind)) {
      continue;
    }

    const sourceEntity = nameToEntity.get(normalizeText(item.sourceEntityName || ''));
    const targetEntity = nameToEntity.get(normalizeText(item.targetEntityName || ''));

    if (!sourceEntity || !targetEntity || sourceEntity.id === targetEntity.id) {
      continue;
    }

    const dedupeKey = `${buildRelationPairKey(sourceEntity.name, targetEntity.name)}::${normalizeText(item.relationshipType || '关系')}`;

    if (automaticEdgeMap.has(dedupeKey)) {
      continue;
    }

    automaticEdgeMap.set(dedupeKey, {
      id: `automatic:${item.id}`,
      sourceId: createRelationNodeId(sourceEntity.id),
      targetId: createRelationNodeId(targetEntity.id),
      label: item.relationshipType || '关系',
      meta: ['运行态观察', item.sourceKind, item.chapterTitle].filter(Boolean).join(' / '),
      kind: 'automatic',
    });
  }

  return {
    nodes,
    edges: [...explicitEdges, ...automaticEdgeMap.values()],
    width,
    height,
    explicitEdgeCount: explicitEdges.length,
    automaticEdgeCount: automaticEdgeMap.size,
  } satisfies CharacterRelationGraph;
}

export function GraphWorkspace({
  projectId,
  onOpenChapter,
  onOpenForeshadow,
  onOpenLore,
}: GraphWorkspaceProps) {
  const chapters = useEditorStore((state) => state.chapters);
  const entities = useLoreStore((state) => state.entities);
  const entityRelations = useEntityRelationStore((state) => state.entityRelations);
  const loadEntityRelations = useEntityRelationStore((state) => state.loadEntityRelations);
  const settings = useSettingsStore((state) => state.settings);
  const {
    foreshadows,
    loadedProjectId,
    loadForeshadows,
    setActiveForeshadow,
  } = useForeshadowStore();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<GraphViewMode>('overview');
  const [activeFilter, setActiveFilter] = useState<GraphFilter>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runtimeEntities, setRuntimeEntities] = useState<GenerationDebugEntityRecord[]>([]);
  const [runtimeForeshadows, setRuntimeForeshadows] = useState<GenerationDebugForeshadowRecord[]>([]);
  const [runtimeRelationships, setRuntimeRelationships] = useState<GenerationDebugRelationshipRecord[]>([]);

  useEffect(() => {
    if (loadedProjectId === projectId) {
      return;
    }

    void loadForeshadows(projectId).catch(() => {
      toast('加载图谱数据失败', 'error');
    });
  }, [loadForeshadows, loadedProjectId, projectId, toast]);

  useEffect(() => {
    void loadEntityRelations(projectId).catch(() => {
      toast('加载人物关系失败', 'error');
    });
  }, [loadEntityRelations, projectId, toast]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetchGenerationDebugEntities(settings.serverUrl, projectId).catch(() => []),
      fetchGenerationDebugForeshadows(settings.serverUrl, projectId).catch(() => []),
      fetchGenerationDebugRelationships(settings.serverUrl, projectId).catch(() => []),
    ]).then(([nextEntities, nextForeshadows, nextRelationships]) => {
      if (cancelled) {
        return;
      }

      setRuntimeEntities(nextEntities);
      setRuntimeForeshadows(nextForeshadows);
      setRuntimeRelationships(nextRelationships);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, settings.serverUrl]);

  const graph = useMemo(() => {
    return buildProjectGraph({
      chapters,
      foreshadows,
      entities,
    });
  }, [chapters, entities, foreshadows]);
  const relationGraph = useMemo(() => {
    return buildCharacterRelationGraph({
      entities: entities
        .filter((entity) => entity.projectId === projectId && entity.type === 'character')
        .map((entity) => ({
          id: entity.id,
          name: entity.name,
          meta: entity.draft ? '人物 / 草案' : '人物 / 正式',
        })),
      explicitRelations: entityRelations.filter((relation) => relation.projectId === projectId),
      runtimeRelationships,
    });
  }, [entities, entityRelations, projectId, runtimeRelationships]);
  const isRelationView = viewMode === 'relations';

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
  const activeNodes = useMemo(() => {
    return isRelationView ? relationGraph.nodes : visibleNodes;
  }, [isRelationView, relationGraph.nodes, visibleNodes]);
  const activeEdges = useMemo(() => {
    return isRelationView ? relationGraph.edges : visibleEdges;
  }, [isRelationView, relationGraph.edges, visibleEdges]);
  const activeNodeMap = useMemo(
    () => new Map(activeNodes.map((node) => [node.id, node] as const)),
    [activeNodes],
  );
  const activeCanvasSize = useMemo(
    () => ({
      width: isRelationView ? relationGraph.width : graph.width,
      height: isRelationView ? relationGraph.height : graph.height,
    }),
    [graph.height, graph.width, isRelationView, relationGraph.height, relationGraph.width],
  );

  const selectedNode = useMemo(() => {
    return activeNodes.find((node) => node.id === selectedNodeId) ?? activeNodes[0] ?? null;
  }, [activeNodes, selectedNodeId]);

  const selectedEdges = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    return activeEdges.filter((edge) => edge.sourceId === selectedNode.id || edge.targetId === selectedNode.id);
  }, [activeEdges, selectedNode]);

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
    if (activeNodes.length === 0) {
      setSelectedNodeId(null);
      return;
    }

    if (!selectedNode || !activeNodes.some((node) => node.id === selectedNode.id)) {
      setSelectedNodeId(activeNodes[0].id);
    }
  }, [activeNodes, selectedNode]);

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

  if (
    graph.nodes.length === 0 &&
    relationGraph.nodes.length === 0 &&
    runtimeEntities.length === 0 &&
    runtimeForeshadows.length === 0 &&
    runtimeRelationships.length === 0
  ) {
    return (
      <div className="flex min-h-0 flex-1 p-8">
        <EmptyState
          icon={<Network size={22} />}
          title="图谱还没有可展示的节点"
          description="至少需要章节、伏笔或设定数据中的一种，才能在这里生成关系展示视图。"
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
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">关系图谱展示</p>
              <p className="mt-1 text-sm text-neutral-400">
                {isRelationView
                  ? `当前共 ${relationGraph.nodes.length} 位人物，${relationGraph.explicitEdgeCount} 条显式关系真源，${relationGraph.automaticEdgeCount} 条运行态观察关系。`
                  : `当前共 ${graph.nodes.length} 个节点，${graph.edges.length} 条展示关系。`}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-xs leading-6 text-neutral-500">
                这里是展示 / 观察 / 诊断视图，不是正式关系维护台账。显式关系优先，运行态关系只作观察补充。
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('overview')}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    viewMode === 'overview'
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'bg-neutral-950/70 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                >
                  综合图谱
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('relations')}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    viewMode === 'relations'
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'bg-neutral-950/70 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                >
                  关系视图
                </button>
              </div>
              {viewMode === 'overview' ? (
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
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1">显式关系真源</span>
                  <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1">运行态关系观察</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="min-w-[1120px] rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="relative" style={{ width: activeCanvasSize.width, height: activeCanvasSize.height }}>
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${activeCanvasSize.width} ${activeCanvasSize.height}`}
                fill="none"
              >
                {activeEdges.map((edge) => {
                  const source = activeNodeMap.get(edge.sourceId);
                  const target = activeNodeMap.get(edge.targetId);

                  if (!source || !target) {
                    return null;
                  }

                  const isHighlighted = selectedNode ? selectedEdges.some((selectedEdge) => selectedEdge.id === edge.id) : true;
                  const relationEdge = isRelationView ? (edge as RelationGraphEdge) : null;
                  const stroke = relationEdge
                    ? relationEdge.kind === 'explicit'
                      ? relationEdge.draft
                        ? 'rgba(245, 158, 11, 0.65)'
                        : 'rgba(16, 185, 129, 0.75)'
                      : 'rgba(56, 189, 248, 0.7)'
                    : isHighlighted
                      ? 'rgba(129, 140, 248, 0.6)'
                      : 'rgba(82, 82, 91, 0.45)';
                  const strokeWidth = relationEdge
                    ? isHighlighted
                      ? 2.4
                      : 1.5
                    : isHighlighted
                      ? 2.2
                      : 1.2;
                  const strokeDasharray = relationEdge
                    ? relationEdge.kind === 'automatic'
                      ? '8 6'
                      : relationEdge.draft
                        ? '5 5'
                        : undefined
                    : undefined;

                  return (
                    <path
                      key={edge.id}
                      d={createEdgePath(source, target)}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDasharray}
                      opacity={isHighlighted ? 1 : 0.38}
                    />
                  );
                })}
              </svg>

              {activeNodes.map((node) => {
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
          <p className="mt-2 text-xs leading-6 text-neutral-500">
            {isRelationView
              ? '关系视图会把人物作为主节点，并把显式关系真源与运行态观察关系拆开显示，方便直接检查人物关系层。'
              : '当前页面只负责把章节、伏笔和设定之间的关联展示出来，帮助你观察结构与诊断问题。'}
          </p>
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
                      const relatedNode = activeNodeMap.get(relatedNodeId);

                      if (!relatedNode) {
                        return null;
                      }

                      const relationEdge = isRelationView ? (edge as RelationGraphEdge) : null;

                      return (
                        <div key={edge.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-3 py-3">
                          <p className="text-sm text-neutral-200">{relatedNode.label}</p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {relationEdge ? relationEdge.label : (edge as GraphEdge).label || edgeLabelMap[(edge as GraphEdge).kind]}
                          </p>
                          <p className="mt-2 text-xs text-neutral-500">
                            {relationEdge ? relationEdge.meta : relatedNode.meta}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-4">
                <p className="text-sm text-neutral-200">当前推导规则</p>
                <div className="mt-3 space-y-2 text-xs leading-6 text-neutral-500">
                  {isRelationView ? (
                    <>
                      <p>1. 人物节点只保留 `character` 条目，避免综合图谱的章节与伏笔噪音干扰人物关系判断。</p>
                      <p>2. 显式关系使用实体关系表直连，是当前正式关系真源，边标签显示“关系类型 / 当前态度”。</p>
                      <p>3. 运行态关系来自服务端已沉淀的章节关系抽取，用虚线与显式关系区分，只作为观察层补充。</p>
                    </>
                  ) : (
                    <>
                      <p>1. 章节命中设定名称或字段值，会连接章节与设定。</p>
                      <p>2. 伏笔会连接来源章节、回收章节以及提到的设定。</p>
                      <p>3. 设定之间若共享标签或互相提及，会自动建立展示关系；这仍是观察视图，不等于正式维护台账。</p>
                    </>
                  )}
                </div>
              </section>

              {(runtimeRelationships.length > 0 || runtimeEntities.length > 0 || runtimeForeshadows.length > 0) ? (
                <section className="rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                  <p className="text-sm text-neutral-200">运行态观察层</p>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">
                    这里展示的是生成系统内部已经沉淀的运行态关系、设定和伏笔，用于观察与排查，不替代正式维护台账。
                  </p>

                  {runtimeRelationships.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">运行态关系观察</p>
                      {runtimeRelationships
                        .filter((item) => !isExplicitSnapshotSourceKind(item.sourceKind))
                        .slice(0, 6)
                        .map((item) => (
                        <div key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                          <p className="text-neutral-100">
                            {item.sourceEntityName} {item.relationshipType} {item.targetEntityName || '未知对象'}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">{[item.sourceKind, item.chapterTitle].filter(Boolean).join(' / ')}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {runtimeEntities.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">运行态设定</p>
                      {runtimeEntities.slice(0, 4).map((item) => (
                        <div key={`${item.entityName}-${item.updatedAt}`} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                          <p className="text-neutral-100">{item.entityName}</p>
                          <p className="mt-1 text-xs text-neutral-500">{item.lastSeenChapterTitle || '未知章节'}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {runtimeForeshadows.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">运行态伏笔</p>
                      {runtimeForeshadows.slice(0, 4).map((item) => (
                        <div key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
                          <p className="text-neutral-100">{item.title}</p>
                          <p className="mt-1 text-xs text-neutral-500">{item.sourceChapterTitle || '未关联章节'}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
