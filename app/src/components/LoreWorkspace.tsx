import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Pin, PinOff, Plus, Save, Trash2, Users } from 'lucide-react';
import {
  fetchGenerationDebugChapters,
  fetchGenerationDebugEntities,
  fetchGenerationDebugRelationships,
} from '@/lib/generation-debug-client';
import { buildGenerationRelationSnapshot } from '@/lib/generation-relation-snapshot';
import {
  CHARACTER_CARD_FIELD_TOTAL,
  CHARACTER_DYNAMIC_FIELD_DEFINITIONS,
  CHARACTER_STATIC_FIELD_DEFINITIONS,
  getCharacterCardCompleteness,
  normalizeLoreEntity,
  normalizeLoreEntityAliases,
} from '@/lib/lore-entity';
import { analyzeExplicitRelationCoverage } from '@/lib/lore-consistency';
import { getLoreEntityTypeLabel } from '@/lib/lore-meta';
import { useEntityRelationStore, useLoreStore, useSettingsStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type {
  EntityRelation,
  GenerationDebugChapterRecord,
  GenerationDebugEntityRecord,
  GenerationDebugRelationshipRecord,
  Id,
  LoreEntity,
  LoreEntityFields,
  LoreEntityType,
} from '@/types';

interface LoreWorkspaceProps {
  projectId: Id;
}

type LoreFilter = 'all' | LoreEntityType;

const filterOptions: Array<{ key: LoreFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'character', label: '人物' },
  { key: 'faction', label: '势力' },
  { key: 'location', label: '地点' },
  { key: 'magic_system', label: '力量体系' },
  { key: 'item', label: '物品' },
  { key: 'event', label: '事件' },
];

function parseTextList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[，,\n]/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseOptionalInteger(value: string) {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(5, Math.trunc(parsed)));
}

function buildCharacterFieldDrafts(entity: LoreEntity) {
  return Object.fromEntries(
    [...CHARACTER_STATIC_FIELD_DEFINITIONS, ...CHARACTER_DYNAMIC_FIELD_DEFINITIONS].map((definition) => [
      definition.key,
      typeof entity.fields[definition.key] === 'string' ? String(entity.fields[definition.key]) : '',
    ]),
  ) as Record<string, string>;
}

function buildCharacterFieldsFromDrafts(baseFields: LoreEntityFields, drafts: Record<string, string>) {
  const nextFields: LoreEntityFields = {
    ...baseFields,
  };

  for (const definition of [...CHARACTER_STATIC_FIELD_DEFINITIONS, ...CHARACTER_DYNAMIC_FIELD_DEFINITIONS]) {
    const value = drafts[definition.key]?.trim() ?? '';
    nextFields[definition.key] = value || null;
  }

  return nextFields;
}

function getCompletenessBadgeClass(level: 'low' | 'medium' | 'high') {
  if (level === 'high') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }

  if (level === 'medium') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }

  return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
}

function getCompletenessText(entity: LoreEntity) {
  const completeness = getCharacterCardCompleteness(entity);
  return `${completeness.filled}/${CHARACTER_CARD_FIELD_TOTAL} 完整`;
}

function normalizeCompletenessLevel(level: string): 'low' | 'medium' | 'high' {
  if (level === 'high' || level === 'medium') {
    return level;
  }

  return 'low';
}

export function LoreWorkspace({ projectId }: LoreWorkspaceProps) {
  const { entities, loadEntities, createEntity, updateEntity, togglePin, deleteEntity } = useLoreStore();
  const {
    entityRelations,
    loadEntityRelations,
    createEntityRelation,
    updateEntityRelation,
    deleteEntityRelation,
  } = useEntityRelationStore();
  const settings = useSettingsStore((state) => state.settings);
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<LoreFilter>('all');
  const [selectedEntityId, setSelectedEntityId] = useState<Id | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftTagsText, setDraftTagsText] = useState('');
  const [draftAliasesText, setDraftAliasesText] = useState('');
  const [draftFlag, setDraftFlag] = useState(false);
  const [characterFieldDrafts, setCharacterFieldDrafts] = useState<Record<string, string>>({});
  const [selectedRelationId, setSelectedRelationId] = useState<Id | null>(null);
  const [relationTargetEntityId, setRelationTargetEntityId] = useState('');
  const [relationTypeDraft, setRelationTypeDraft] = useState('');
  const [relationOriginDraft, setRelationOriginDraft] = useState('');
  const [relationDescriptionDraft, setRelationDescriptionDraft] = useState('');
  const [relationCurrentStanceDraft, setRelationCurrentStanceDraft] = useState('');
  const [relationIntensityDraft, setRelationIntensityDraft] = useState('3');
  const [relationStanceReasonDraft, setRelationStanceReasonDraft] = useState('');
  const [relationDraftFlag, setRelationDraftFlag] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [runtimeEntities, setRuntimeEntities] = useState<GenerationDebugEntityRecord[]>([]);
  const [runtimeChapters, setRuntimeChapters] = useState<GenerationDebugChapterRecord[]>([]);
  const [runtimeRelationships, setRuntimeRelationships] = useState<GenerationDebugRelationshipRecord[]>([]);
  const [runtimeError, setRuntimeError] = useState('');

  useEffect(() => {
    void loadEntities(projectId).catch(() => {
      toast('加载设定失败', 'error');
    });
  }, [loadEntities, projectId, toast]);

  useEffect(() => {
    void loadEntityRelations(projectId).catch(() => {
      toast('加载关系失败', 'error');
    });
  }, [loadEntityRelations, projectId, toast]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetchGenerationDebugEntities(settings.serverUrl, projectId).catch(() => [] as GenerationDebugEntityRecord[]),
      fetchGenerationDebugChapters(settings.serverUrl, projectId).catch(() => [] as GenerationDebugChapterRecord[]),
      fetchGenerationDebugRelationships(settings.serverUrl, projectId).catch(() => [] as GenerationDebugRelationshipRecord[]),
    ])
      .then(([nextEntities, nextChapters, nextRelationships]) => {
        if (!cancelled) {
          setRuntimeEntities(nextEntities);
          setRuntimeChapters(nextChapters);
          setRuntimeRelationships(nextRelationships);
          setRuntimeError('');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRuntimeEntities([]);
          setRuntimeChapters([]);
          setRuntimeRelationships([]);
          setRuntimeError(error instanceof Error ? error.message : '未知错误');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, settings.serverUrl]);

  const filteredEntities = useMemo(() => {
    if (activeFilter === 'all') {
      return entities.map((entity) => normalizeLoreEntity(entity)).filter((entity): entity is LoreEntity => Boolean(entity));
    }

    return entities
      .filter((entity) => entity.type === activeFilter)
      .map((entity) => normalizeLoreEntity(entity))
      .filter((entity): entity is LoreEntity => Boolean(entity));
  }, [activeFilter, entities]);
  const activeFilterLabel = activeFilter === 'all' ? '全部设定' : getLoreEntityTypeLabel(activeFilter);
  const manualDraftCount = useMemo(
    () => filteredEntities.filter((entity) => entity.draft).length,
    [filteredEntities],
  );
  const runtimeOnlyEntities = useMemo(() => {
    const localNameSet = new Set(
      entities.flatMap((rawEntity) => {
        const entity = normalizeLoreEntity(rawEntity);

        if (!entity) {
          return [] as string[];
        }

        return [entity.name, ...(entity.aliases ?? [])]
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);
      }),
    );

    return runtimeEntities.filter((entity) => {
      if (activeFilter !== 'all' && entity.entityType !== activeFilter) {
        return false;
      }

      return !localNameSet.has(entity.entityName.trim().toLowerCase());
    });
  }, [activeFilter, entities, runtimeEntities]);
  const selectedEntity = useMemo(() => {
    return filteredEntities.find((entity) => entity.id === selectedEntityId) ?? filteredEntities[0] ?? null;
  }, [filteredEntities, selectedEntityId]);
  const selectableRelationTargets = useMemo(() => {
    return entities
      .map((entity) => normalizeLoreEntity(entity))
      .filter((entity): entity is LoreEntity => Boolean(entity))
      .filter((entity) => entity.type === 'character' && entity.id !== selectedEntity?.id);
  }, [entities, selectedEntity?.id]);
  const selectedEntityRelations = useMemo(() => {
    if (!selectedEntity) {
      return [] as EntityRelation[];
    }

    return entityRelations.filter((relation) => {
      return relation.projectId === projectId && relation.sourceEntityId === selectedEntity.id;
    });
  }, [entityRelations, projectId, selectedEntity]);
  const selectedRelation = useMemo(() => {
    return selectedEntityRelations.find((relation) => relation.id === selectedRelationId) ?? null;
  }, [selectedEntityRelations, selectedRelationId]);
  const relationCoverageHints = useMemo(() => {
    if (!selectedEntity || selectedEntity.type !== 'character') {
      return [];
    }

    return analyzeExplicitRelationCoverage({
      relations: selectedEntityRelations,
      chapterRecords: runtimeChapters,
      runtimeRelationships,
    });
  }, [runtimeChapters, runtimeRelationships, selectedEntity, selectedEntityRelations]);

  useEffect(() => {
    if (filteredEntities.length === 0) {
      setSelectedEntityId(null);
      return;
    }

    if (!selectedEntityId || !filteredEntities.some((entity) => entity.id === selectedEntityId)) {
      setSelectedEntityId(filteredEntities[0].id);
    }
  }, [filteredEntities, selectedEntityId]);

  useEffect(() => {
    if (!selectedEntity) {
      setDraftName('');
      setDraftDescription('');
      setDraftTagsText('');
      setDraftAliasesText('');
      setDraftFlag(false);
      setCharacterFieldDrafts({});
      return;
    }

    setDraftName(selectedEntity.name);
    setDraftDescription(selectedEntity.description || '');
    setDraftTagsText((selectedEntity.tags ?? []).join('，'));
    setDraftAliasesText((selectedEntity.aliases ?? []).join('，'));
    setDraftFlag(Boolean(selectedEntity.draft));
    setCharacterFieldDrafts(buildCharacterFieldDrafts(selectedEntity));
  }, [selectedEntity?.id, selectedEntity?.updatedAt]);

  useEffect(() => {
    if (!selectedEntity || selectedEntity.type !== 'character') {
      setSelectedRelationId(null);
      setRelationTargetEntityId('');
      setRelationTypeDraft('');
      setRelationOriginDraft('');
      setRelationDescriptionDraft('');
      setRelationCurrentStanceDraft('');
      setRelationIntensityDraft('3');
      setRelationStanceReasonDraft('');
      setRelationDraftFlag(true);
      return;
    }

    if (selectedRelation) {
      setRelationTargetEntityId(selectedRelation.targetEntityId);
      setRelationTypeDraft(selectedRelation.relationType);
      setRelationOriginDraft(selectedRelation.origin);
      setRelationDescriptionDraft(selectedRelation.description);
      setRelationCurrentStanceDraft(selectedRelation.currentStance);
      setRelationIntensityDraft(String(selectedRelation.currentIntensity || 0));
      setRelationStanceReasonDraft(selectedRelation.stanceReason);
      setRelationDraftFlag(Boolean(selectedRelation.draft));
      return;
    }

    setRelationTargetEntityId(selectableRelationTargets[0]?.id ?? '');
    setRelationTypeDraft('');
    setRelationOriginDraft('');
    setRelationDescriptionDraft('');
    setRelationCurrentStanceDraft('');
    setRelationIntensityDraft('3');
    setRelationStanceReasonDraft('');
    setRelationDraftFlag(true);
  }, [selectedEntity?.id, selectedRelation?.id, selectedRelation?.updatedAt, selectableRelationTargets]);

  async function handleCreateEntity() {
    const targetType = activeFilter === 'all' ? 'character' : activeFilter;
    const targetLabel = filterOptions.find((option) => option.key === targetType)?.label ?? '设定';
    const name = window.prompt(`输入${targetLabel}名称`, '');

    if (!name) {
      return;
    }

    const entity = await createEntity({
      projectId,
      type: targetType,
      name,
    });

    setSelectedEntityId(entity.id);
    toast(`已创建设定「${entity.name}」`, 'success');
  }

  async function handleTogglePin(entityId: Id, entityName: string, pinned: boolean) {
    await togglePin(entityId);
    toast(pinned ? `已取消钉选「${entityName}」` : `已钉选「${entityName}」`, 'info');
  }

  async function handleDeleteEntity(entityId: Id, entityName: string) {
    const confirmed = window.confirm(`确认删除设定「${entityName}」吗？`);

    if (!confirmed) {
      return;
    }

    await deleteEntity(entityId);
    toast(`已删除设定「${entityName}」`, 'warning');
  }

  async function persistSelectedEntity(nextDraftFlag?: boolean) {
    if (!selectedEntity) {
      return;
    }

    setIsSaving(true);

    try {
      const baseFields = selectedEntity.fields ?? {};
      const nextFields =
        selectedEntity.type === 'character'
          ? buildCharacterFieldsFromDrafts(baseFields, characterFieldDrafts)
          : baseFields;

      await updateEntity(selectedEntity.id, {
        name: draftName.trim() || selectedEntity.name,
        description: draftDescription.trim(),
        tags: parseTextList(draftTagsText),
        aliases: normalizeLoreEntityAliases(parseTextList(draftAliasesText)),
        fields: nextFields,
        draft: typeof nextDraftFlag === 'boolean' ? nextDraftFlag : draftFlag,
      });

      toast(
        typeof nextDraftFlag === 'boolean'
          ? nextDraftFlag
            ? `已将「${selectedEntity.name}」设为草案`
            : `已确认「${selectedEntity.name}」`
          : `已保存「${selectedEntity.name}」`,
        'success',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存设定失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function persistSelectedRelation(nextDraftValue?: boolean) {
    if (!selectedEntity || selectedEntity.type !== 'character') {
      return;
    }

    const targetEntity = selectableRelationTargets.find((entity) => entity.id === relationTargetEntityId);

    if (!targetEntity) {
      toast('请选择关系对手方', 'warning');
      return;
    }

    if (!relationTypeDraft.trim()) {
      toast('请先填写关系类型', 'warning');
      return;
    }

    const nextDraft = typeof nextDraftValue === 'boolean' ? nextDraftValue : relationDraftFlag;

    try {
      if (selectedRelation) {
        await updateEntityRelation(selectedRelation.id, {
          targetEntityId: targetEntity.id,
          targetEntityName: targetEntity.name,
          relationType: relationTypeDraft,
          origin: relationOriginDraft,
          description: relationDescriptionDraft,
          currentStance: relationCurrentStanceDraft,
          currentIntensity: parseOptionalInteger(relationIntensityDraft),
          stanceReason: relationStanceReasonDraft,
          draft: nextDraft,
        });
        toast(`已更新关系「${selectedRelation.sourceEntityName} - ${targetEntity.name}」`, 'success');
      } else {
        const relation = await createEntityRelation({
          projectId,
          sourceEntityId: selectedEntity.id,
          targetEntityId: targetEntity.id,
          sourceEntityName: selectedEntity.name,
          targetEntityName: targetEntity.name,
          relationType: relationTypeDraft,
          origin: relationOriginDraft,
          description: relationDescriptionDraft,
          currentStance: relationCurrentStanceDraft,
          currentIntensity: parseOptionalInteger(relationIntensityDraft),
          stanceReason: relationStanceReasonDraft,
          draft: nextDraft,
        });
        setSelectedRelationId(relation.id);
        toast(`已创建关系「${selectedEntity.name} - ${targetEntity.name}」`, 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存关系失败：${message}`, 'error');
    }
  }

  async function handleDeleteRelation(relation: EntityRelation) {
    const confirmed = window.confirm(`确认删除关系「${relation.sourceEntityName} - ${relation.targetEntityName}」吗？`);

    if (!confirmed) {
      return;
    }

    await deleteEntityRelation(relation.id);
    setSelectedRelationId(null);
    toast(`已删除关系「${relation.sourceEntityName} - ${relation.targetEntityName}」`, 'warning');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-neutral-800 bg-neutral-900/70">
      <div className="flex flex-col gap-4 border-b border-neutral-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">设定库</p>
          <p className="mt-1 text-sm text-neutral-400">
            当前共 {entities.length} 条设定，当前筛选下 {filteredEntities.length} 条，其中草案 {manualDraftCount} 条
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
          <button
            type="button"
            onClick={() => void handleCreateEntity()}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus size={15} />
            新建设定
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {filteredEntities.length === 0 && runtimeOnlyEntities.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-500">
                <Users size={22} />
              </div>
              <h2 className="text-xl font-medium text-neutral-100">当前分类还没有设定</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                {activeFilter === 'all'
                  ? '创建人物、势力、地点、物品和事件条目，为你的故事构建完整世界观。'
                  : `当前还没有${activeFilterLabel}条目，可以先从最关键的一条开始补。`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredEntities.length > 0 ? (
              <section className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">手工设定</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    人物条目支持人格卡编辑、别名维护、草案确认与完整度提示。
                  </p>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_380px]">
                  <div className="grid gap-4 md:grid-cols-2">
                    {filteredEntities.map((rawEntity) => {
                      const entity = normalizeLoreEntity(rawEntity);

                      if (!entity) {
                        return null;
                      }

                      const completeness = entity.type === 'character' ? getCharacterCardCompleteness(entity) : null;

                      return (
                        <article
                          key={entity.id}
                          className={`flex flex-col rounded-3xl border bg-neutral-950/60 p-4 transition-colors ${
                            selectedEntity?.id === entity.id
                              ? 'border-indigo-500/40'
                              : entity.draft
                                ? 'border-dashed border-neutral-700'
                                : 'border-neutral-800'
                          } ${entity.draft ? 'opacity-90' : 'opacity-100'}`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedEntityId(entity.id)}
                              className="min-w-0 text-left"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-lg font-medium text-neutral-100">{entity.name}</h2>
                                {entity.draft ? (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                                    待确认
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                                    正式
                                  </span>
                                )}
                                {completeness ? (
                                  <span className={`rounded-full border px-2 py-1 text-[11px] ${getCompletenessBadgeClass(normalizeCompletenessLevel(completeness.level))}`}>
                                    {getCompletenessText(entity)}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                                {getLoreEntityTypeLabel(entity.type)}
                              </p>
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void handleTogglePin(entity.id, entity.name, entity.pinned)}
                                className="rounded-xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-indigo-300"
                                title={entity.pinned ? '取消钉选' : '钉选到上下文'}
                              >
                                {entity.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteEntity(entity.id, entity.name)}
                                className="rounded-xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-red-400"
                                title="删除设定"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          <p className="mb-4 min-h-[44px] text-sm leading-6 text-neutral-400">
                            {entity.description || '暂无描述。'}
                          </p>

                          {(entity.aliases ?? []).length > 0 ? (
                            <p className="mb-3 text-xs text-neutral-500">别名：{entity.aliases?.join('、')}</p>
                          ) : null}

                          <div className="space-y-2 border-t border-neutral-800 pt-3 text-sm text-neutral-300">
                            {entity.type === 'character' ? (
                              <div className="space-y-2">
                                <p className="text-neutral-500">
                                  人物卡完整度：{completeness?.filled ?? 0}/{CHARACTER_CARD_FIELD_TOTAL}
                                </p>
                                <p className="text-neutral-500">
                                  动态状态：{String(entity.fields.current_stance || '未填写')}
                                </p>
                              </div>
                            ) : Object.keys(entity.fields).length === 0 ? (
                              <p className="text-neutral-500">暂无结构化字段</p>
                            ) : (
                              Object.entries(entity.fields).slice(0, 5).map(([field, value]) => (
                                <div key={field} className="flex items-center justify-between gap-3">
                                  <span className="text-neutral-500">{field}</span>
                                  <span className="text-right text-neutral-300">{String(value)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <aside className="rounded-3xl border border-neutral-800 bg-neutral-950/50 p-4">
                    {selectedEntity ? (
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">编辑面板</p>
                            <h2 className="mt-2 text-lg font-medium text-neutral-100">{selectedEntity.name}</h2>
                            <p className="mt-1 text-sm text-neutral-400">{getLoreEntityTypeLabel(selectedEntity.type)}</p>
                          </div>
                          {selectedEntity.type === 'character' ? (
                            <span className={`rounded-full border px-2 py-1 text-[11px] ${getCompletenessBadgeClass(normalizeCompletenessLevel(getCharacterCardCompleteness(selectedEntity).level))}`}>
                              {getCompletenessText(selectedEntity)}
                            </span>
                          ) : null}
                        </div>

                        <label className="block space-y-2">
                          <span className="text-sm text-neutral-300">名称</span>
                          <input
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                            className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                          />
                        </label>

                        <label className="block space-y-2">
                          <span className="text-sm text-neutral-300">描述</span>
                          <textarea
                            value={draftDescription}
                            rows={4}
                            onChange={(event) => setDraftDescription(event.target.value)}
                            className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                          />
                        </label>

                        <label className="block space-y-2">
                          <span className="text-sm text-neutral-300">标签</span>
                          <input
                            value={draftTagsText}
                            onChange={(event) => setDraftTagsText(event.target.value)}
                            placeholder="用逗号分隔，如：主角，核心视角"
                            className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                          />
                        </label>

                        <label className="block space-y-2">
                          <span className="text-sm text-neutral-300">别名</span>
                          <input
                            value={draftAliasesText}
                            onChange={(event) => setDraftAliasesText(event.target.value)}
                            placeholder="用逗号分隔，如：绳，绳姐，第三执事"
                            className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                          />
                        </label>

                        {selectedEntity.type === 'character' ? (
                          <div className="space-y-4 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-4">
                            <div>
                              <p className="text-sm font-medium text-neutral-200">人格内核</p>
                              <p className="mt-1 text-xs text-neutral-500">这一层原则上不应随剧情随意改动。</p>
                            </div>
                            {CHARACTER_STATIC_FIELD_DEFINITIONS.map((definition) => (
                              <label key={definition.key} className="block space-y-2">
                                <span className="text-sm text-neutral-300">{definition.label}</span>
                                <textarea
                                  value={characterFieldDrafts[definition.key] ?? ''}
                                  rows={2}
                                  placeholder={definition.placeholder}
                                  onChange={(event) =>
                                    setCharacterFieldDrafts((current) => ({
                                      ...current,
                                      [definition.key]: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                />
                              </label>
                            ))}

                            <div className="border-t border-neutral-800 pt-4">
                              <p className="text-sm font-medium text-neutral-200">当前阶段状态</p>
                              <p className="mt-1 text-xs text-neutral-500">这一层允许跟着卷、阶段与里程碑变化。</p>
                            </div>
                            {CHARACTER_DYNAMIC_FIELD_DEFINITIONS.map((definition) => (
                              <label key={definition.key} className="block space-y-2">
                                <span className="text-sm text-neutral-300">{definition.label}</span>
                                <textarea
                                  value={characterFieldDrafts[definition.key] ?? ''}
                                  rows={2}
                                  placeholder={definition.placeholder}
                                  onChange={(event) =>
                                    setCharacterFieldDrafts((current) => ({
                                      ...current,
                                      [definition.key]: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                />
                              </label>
                            ))}

                            <div className="border-t border-neutral-800 pt-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-neutral-200">显式关系</p>
                                  <p className="mt-1 text-xs text-neutral-500">
                                    已配置 {buildGenerationRelationSnapshot(selectedEntityRelations).length} 条与当前人物相关的规划关系。
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedRelationId(null)}
                                  className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
                                >
                                  新关系
                                </button>
                              </div>

                              <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3">
                                <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">关系质检</p>
                                {relationCoverageHints.length === 0 ? (
                                  <p className="mt-2 text-sm text-neutral-500">最近没有发现“同场未覆盖”的显式关系。</p>
                                ) : (
                                  <div className="mt-3 space-y-2">
                                    {relationCoverageHints.map((hint) => (
                                      <div
                                        key={hint.id}
                                        className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-3"
                                      >
                                        <p className="text-sm text-amber-100">{hint.title}</p>
                                        <p className="mt-1 text-xs leading-6 text-amber-200/80">{hint.description}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {selectedEntityRelations.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {selectedEntityRelations.map((relation) => (
                                    <button
                                      key={relation.id}
                                      type="button"
                                      onClick={() => setSelectedRelationId(relation.id)}
                                      className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                                        selectedRelation?.id === relation.id
                                          ? 'border-indigo-500/40 bg-indigo-500/10'
                                          : relation.draft
                                            ? 'border-dashed border-neutral-700 bg-neutral-950/60'
                                            : 'border-neutral-800 bg-neutral-950/60'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-sm text-neutral-100">
                                            {relation.sourceEntityName} <span className="text-neutral-500">-&gt;</span> {relation.targetEntityName}
                                          </p>
                                          <p className="mt-1 text-xs text-neutral-500">
                                            {relation.relationType || '未命名关系'} / {relation.currentStance || '未填态度'}
                                          </p>
                                        </div>
                                        <span className={`rounded-full border px-2 py-1 text-[11px] ${relation.draft ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
                                          {relation.draft ? '草案' : '正式'}
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-neutral-500">当前人物还没有手工关系，下面可直接补录。</p>
                              )}

                              <div className="mt-4 grid gap-3">
                                <label className="block space-y-2">
                                  <span className="text-sm text-neutral-300">对手方</span>
                                  <select
                                    value={relationTargetEntityId}
                                    onChange={(event) => setRelationTargetEntityId(event.target.value)}
                                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                  >
                                    <option value="">请选择角色</option>
                                    {selectableRelationTargets.map((entity) => (
                                      <option key={entity.id} value={entity.id}>
                                        {entity.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="block space-y-2">
                                  <span className="text-sm text-neutral-300">关系类型</span>
                                  <input
                                    value={relationTypeDraft}
                                    onChange={(event) => setRelationTypeDraft(event.target.value)}
                                    placeholder="如：搭档 / 师徒 / 镜像 / 宿敌"
                                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                  />
                                </label>

                                <label className="block space-y-2">
                                  <span className="text-sm text-neutral-300">关系本质</span>
                                  <textarea
                                    value={relationDescriptionDraft}
                                    rows={2}
                                    onChange={(event) => setRelationDescriptionDraft(event.target.value)}
                                    placeholder="如：绳是许明的镜子，都从裂缝里爬出来"
                                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                  />
                                </label>

                                <label className="block space-y-2">
                                  <span className="text-sm text-neutral-300">建立原因</span>
                                  <textarea
                                    value={relationOriginDraft}
                                    rows={2}
                                    onChange={(event) => setRelationOriginDraft(event.target.value)}
                                    placeholder="如：第一卷公审后结为搭档"
                                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                  />
                                </label>

                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="block space-y-2">
                                    <span className="text-sm text-neutral-300">当前态度</span>
                                    <input
                                      value={relationCurrentStanceDraft}
                                      onChange={(event) => setRelationCurrentStanceDraft(event.target.value)}
                                      placeholder="如：信任 / 冷战 / 防备"
                                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                    />
                                  </label>
                                  <label className="block space-y-2">
                                    <span className="text-sm text-neutral-300">强度 0-5</span>
                                    <input
                                      value={relationIntensityDraft}
                                      onChange={(event) => setRelationIntensityDraft(event.target.value)}
                                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                    />
                                  </label>
                                </div>

                                <label className="block space-y-2">
                                  <span className="text-sm text-neutral-300">态度锚点</span>
                                  <textarea
                                    value={relationStanceReasonDraft}
                                    rows={2}
                                    onChange={(event) => setRelationStanceReasonDraft(event.target.value)}
                                    placeholder="如：第三卷伪造证据后进入冷战"
                                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                  />
                                </label>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void persistSelectedRelation()}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
                                  >
                                    <Save size={15} />
                                    {selectedRelation ? '保存关系' : '创建关系'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRelationDraftFlag(!relationDraftFlag);
                                      void persistSelectedRelation(!relationDraftFlag);
                                    }}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
                                  >
                                    <CheckCircle2 size={15} />
                                    {relationDraftFlag ? '确认关系' : '转为草案'}
                                  </button>
                                  {selectedRelation ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteRelation(selectedRelation)}
                                      className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 transition-colors hover:bg-red-500/20"
                                    >
                                      <Trash2 size={15} />
                                      删除关系
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
                            当前阶段先重点支持人物卡编辑。非人物条目的结构化字段暂保留只读，现有字段会在保存时原样保留。
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void persistSelectedEntity()}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Save size={15} />
                            保存设定
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDraftFlag(!draftFlag);
                              void persistSelectedEntity(!draftFlag);
                            }}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <CheckCircle2 size={15} />
                            {draftFlag ? '确认设定' : '转为草案'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-center text-sm text-neutral-500">
                        选中左侧设定卡片后，可在这里编辑人物卡、别名和草案状态。
                      </div>
                    )}
                  </aside>
                </div>
              </section>
            ) : null}

            {runtimeOnlyEntities.length > 0 ? (
              <section className="space-y-4">
                <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-4 text-sm text-sky-100">
                  这里展示的是生成系统内部自动沉淀的运行态设定，当前为只读视图，还没有自动转成正式设定条目。
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">运行态设定</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    已从生成章节中提炼出 {runtimeOnlyEntities.length} 条未入库设定。
                  </p>
                  {runtimeError ? <p className="mt-2 text-xs text-yellow-400">读取失败：{runtimeError}</p> : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {runtimeOnlyEntities.map((entity) => (
                    <article
                      key={`${entity.entityName}-${entity.updatedAt}`}
                      className="flex flex-col rounded-3xl border border-sky-500/20 bg-sky-500/5 p-4"
                    >
                      <div className="mb-3">
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-medium text-neutral-100">{entity.entityName}</h2>
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200">
                            运行态
                          </span>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                          {getLoreEntityTypeLabel((entity.entityType as LoreEntityType) || 'event')}
                        </p>
                      </div>
                      <p className="mb-4 min-h-[44px] text-sm leading-6 text-neutral-300">
                        {entity.description || '暂无描述。'}
                      </p>
                      <div className="space-y-2 border-t border-neutral-800 pt-3 text-sm text-neutral-300">
                        {Object.keys(entity.fields).length === 0 ? (
                          <p className="text-neutral-500">暂无结构化字段</p>
                        ) : (
                          Object.entries(entity.fields).slice(0, 5).map(([field, value]) => (
                            <div key={field} className="flex items-center justify-between gap-3">
                              <span className="text-neutral-500">{field}</span>
                              <span className="text-right text-neutral-300">{String(value)}</span>
                            </div>
                          ))
                        )}
                        <p className="pt-2 text-xs text-neutral-500">最近出现：{entity.lastSeenChapterTitle || '未知章节'}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
