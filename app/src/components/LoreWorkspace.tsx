import { useEffect, useMemo, useState } from 'react';
import { Pin, PinOff, Plus, Trash2, Users } from 'lucide-react';
import { fetchGenerationDebugEntities } from '@/lib/generation-debug-client';
import { getLoreEntityTypeLabel } from '@/lib/lore-meta';
import { useLoreStore, useSettingsStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { GenerationDebugEntityRecord, Id, LoreEntityType } from '@/types';

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

export function LoreWorkspace({ projectId }: LoreWorkspaceProps) {
  const { entities, loadEntities, createEntity, togglePin, deleteEntity } = useLoreStore();
  const settings = useSettingsStore((state) => state.settings);
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<LoreFilter>('all');
  const [runtimeEntities, setRuntimeEntities] = useState<GenerationDebugEntityRecord[]>([]);
  const [runtimeError, setRuntimeError] = useState('');

  useEffect(() => {
    void loadEntities(projectId).catch(() => {
      toast('加载设定失败', 'error');
    });
  }, [loadEntities, projectId, toast]);

  useEffect(() => {
    let cancelled = false;

    void fetchGenerationDebugEntities(settings.serverUrl, projectId)
      .then((items) => {
        if (!cancelled) {
          setRuntimeEntities(items);
          setRuntimeError('');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRuntimeEntities([]);
          setRuntimeError(error instanceof Error ? error.message : '未知错误');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, settings.serverUrl]);

  const filteredEntities = useMemo(() => {
    if (activeFilter === 'all') {
      return entities;
    }

    return entities.filter((entity) => entity.type === activeFilter);
  }, [activeFilter, entities]);
  const activeFilterLabel = activeFilter === 'all' ? '全部设定' : getLoreEntityTypeLabel(activeFilter);
  const runtimeOnlyEntities = useMemo(() => {
    const localNameSet = new Set(entities.map((entity) => entity.name.trim().toLowerCase()));

    return runtimeEntities.filter((entity) => {
      if (activeFilter !== 'all' && entity.entityType !== activeFilter) {
        return false;
      }

      return !localNameSet.has(entity.entityName.trim().toLowerCase());
    });
  }, [activeFilter, entities, runtimeEntities]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-neutral-800 bg-neutral-900/70">
      <div className="flex flex-col gap-4 border-b border-neutral-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">设定库</p>
          <p className="mt-1 text-sm text-neutral-400">当前共 {entities.length} 条设定</p>
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
                  <p className="mt-1 text-sm text-neutral-400">你手动维护的正式设定条目。</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredEntities.map((entity) => (
                    <article
                      key={entity.id}
                      className="flex flex-col rounded-3xl border border-neutral-800 bg-neutral-950/60 p-4"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-medium text-neutral-100">{entity.name}</h2>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                            {getLoreEntityTypeLabel(entity.type)}
                          </p>
                        </div>
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

                      <div className="space-y-2 border-t border-neutral-800 pt-3 text-sm text-neutral-300">
                        {Object.keys(entity.fields).length === 0 ? (
                          <p className="text-neutral-500">暂无结构化字段</p>
                        ) : (
                          Object.entries(entity.fields).map(([field, value]) => (
                            <div key={field} className="flex items-center justify-between gap-3">
                              <span className="text-neutral-500">{field}</span>
                              <span className="text-right text-neutral-300">{String(value)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </article>
                  ))}
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
