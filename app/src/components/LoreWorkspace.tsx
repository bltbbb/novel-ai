import { useEffect, useMemo, useState } from 'react';
import { Pin, PinOff, Plus, Trash2, Users } from 'lucide-react';
import { useLoreStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { Id, LoreEntityType } from '@/types';

interface LoreWorkspaceProps {
  projectId: Id;
}

type LoreFilter = 'all' | LoreEntityType;

const filterOptions: Array<{ key: LoreFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'character', label: '人物' },
  { key: 'faction', label: '势力' },
  { key: 'magic_system', label: '力量体系' },
];

export function LoreWorkspace({ projectId }: LoreWorkspaceProps) {
  const { entities, loadEntities, createEntity, togglePin, deleteEntity } = useLoreStore();
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<LoreFilter>('all');

  useEffect(() => {
    void loadEntities(projectId).catch(() => {
      toast('加载设定失败', 'error');
    });
  }, [loadEntities, projectId, toast]);

  const filteredEntities = useMemo(() => {
    if (activeFilter === 'all') {
      return entities;
    }

    return entities.filter((entity) => entity.type === activeFilter);
  }, [activeFilter, entities]);

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
        {filteredEntities.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-500">
                <Users size={22} />
              </div>
              <h2 className="text-xl font-medium text-neutral-100">当前分类还没有设定</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                这里已经接到真实 Store 数据。现在可以开始创建人物、势力和力量体系条目。
              </p>
            </div>
          </div>
        ) : (
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
                      {entity.type}
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
        )}
      </div>
    </div>
  );
}
