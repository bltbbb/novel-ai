import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CheckCircle2, ChevronDown, Download, Pin, PinOff, Plus, Save, Trash2, Upload, Users } from 'lucide-react';
import {
  fetchGenerationDebugChapters,
  fetchGenerationDebugEntities,
  fetchGenerationDebugRelationships,
} from '@/lib/generation-debug-client';
import { sanitizeFileName } from '@/lib/export';
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
import { getLoreEntityTypeLabel, isLoreEntityType } from '@/lib/lore-meta';
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

interface LoreFieldDefinition {
  key: string;
  label: string;
  placeholder: string;
  rows?: number;
}

type LoreFilter = 'all' | LoreEntityType;
type LoreCardJsonType =
  | 'lore-character-card'
  | 'lore-functional-role-card'
  | 'lore-faction-card'
  | 'lore-scene-anchor-card'
  | 'lore-location-card'
  | 'lore-system-card'
  | 'lore-item-card'
  | 'lore-event-card';
type NewEntityImportType = LoreEntityType | 'scene_anchor';

interface LoreCardJsonPayload {
  version: 1;
  type: LoreCardJsonType;
  exportedAt: string;
  data: {
    name: string;
    description: string;
    tags: string[];
    aliases: string[];
    draft: boolean;
    fields: Record<string, string>;
  };
}

const SUPPORTED_LORE_CARD_TYPES: LoreEntityType[] = [
  'character',
  'functional_role',
  'faction',
  'location',
  'magic_system',
  'item',
  'event',
];

const LORE_CARD_JSON_TYPE_MAP: Record<LoreEntityType, LoreCardJsonType> = {
  character: 'lore-character-card',
  functional_role: 'lore-functional-role-card',
  faction: 'lore-faction-card',
  location: 'lore-location-card',
  magic_system: 'lore-system-card',
  item: 'lore-item-card',
  event: 'lore-event-card',
};

const SCENE_ANCHOR_TAG = '场景锚点';
const LIGHTWEIGHT_TAG = '轻量';

const IMPORT_MENU_OPTIONS: Array<{ key: NewEntityImportType; label: string }> = [
  { key: 'character', label: '人物' },
  { key: 'functional_role', label: '功能角色' },
  { key: 'scene_anchor', label: '场景锚点' },
  { key: 'faction', label: '势力' },
  { key: 'location', label: '地点' },
  { key: 'magic_system', label: '力量体系' },
  { key: 'item', label: '物品' },
  { key: 'event', label: '事件' },
];

const filterOptions: Array<{ key: LoreFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'character', label: '人物' },
  { key: 'functional_role', label: '功能角色' },
  { key: 'faction', label: '势力' },
  { key: 'location', label: '地点' },
  { key: 'magic_system', label: '力量体系' },
  { key: 'item', label: '物品' },
  { key: 'event', label: '事件' },
];

const FUNCTIONAL_ROLE_FIELD_DEFINITIONS: LoreFieldDefinition[] = [
  { key: 'public_role', label: '表面职能', placeholder: '他/她在场面上承担什么角色', rows: 2 },
  { key: 'true_function', label: '真实功能', placeholder: '这个角色在剧情中的真正作用', rows: 2 },
  { key: 'system_position', label: '系统位置', placeholder: '他/她属于哪个机构、哪条链路或哪种岗位', rows: 2 },
  { key: 'relation_anchor', label: '关系锚点', placeholder: '和核心人物或主线的关系是什么', rows: 2 },
  { key: 'first_appearance', label: '首次出场', placeholder: '第一次出场发生在哪种场面', rows: 2 },
  { key: 'volume_function', label: '卷内功能', placeholder: '这一卷里主要承担什么叙事作用', rows: 2 },
  { key: 'signature_line', label: '锚点台词', placeholder: '一句能让读者记住他/她的台词', rows: 2 },
  { key: 'hidden_tension', label: '隐藏张力', placeholder: '表面之下压着什么东西', rows: 2 },
  { key: 'exit_or_followup', label: '退场/后续', placeholder: '后续是否还会出现，或会留下什么余波', rows: 2 },
  ...CHARACTER_STATIC_FIELD_DEFINITIONS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    placeholder: definition.placeholder,
    rows: 2,
  })),
];

const FACTION_FIELD_DEFINITIONS: LoreFieldDefinition[] = [
  { key: 'public_role', label: '公开身份', placeholder: '这个势力对外的主要身份或职能', rows: 2 },
  { key: 'true_core', label: '真实核心', placeholder: '它真正把持或守护的东西', rows: 2 },
  { key: 'core_values', label: '核心价值', placeholder: '这个势力最看重什么', rows: 2 },
  { key: 'core_desire', label: '核心欲望', placeholder: '这个势力最想达成什么', rows: 2 },
  { key: 'core_fear', label: '核心恐惧', placeholder: '这个势力最怕什么失控', rows: 2 },
  { key: 'power_source', label: '权力来源', placeholder: '它依靠什么形成影响力', rows: 2 },
  { key: 'internal_structure', label: '内部结构', placeholder: '内部层级、部门或构成', rows: 2 },
  { key: 'key_members', label: '关键成员', placeholder: '与这个势力强相关的人', rows: 2 },
  { key: 'external_relations', label: '外部关系', placeholder: '它和其他势力的关系', rows: 2 },
  { key: 'internal_contradiction', label: '内部矛盾', placeholder: '这个势力内部最大的撕扯', rows: 2 },
  { key: 'volume1_function', label: '卷一功能', placeholder: '在第一卷里主要承担什么作用', rows: 2 },
  { key: 'hidden_risk', label: '隐藏风险', placeholder: '表面之下潜伏的风险', rows: 2 },
  { key: 'future_hook', label: '后续钩子', placeholder: '后面还能牵出什么', rows: 2 },
];

const LOCATION_FIELD_DEFINITIONS: LoreFieldDefinition[] = [
  { key: 'location_type', label: '地点类型', placeholder: '例如：官署、库房、街巷、厅堂', rows: 2 },
  { key: 'public_function', label: '公开用途', placeholder: '这个地点明面上的功能', rows: 2 },
  { key: 'true_function', label: '真实用途', placeholder: '它实际承载的深层功能', rows: 2 },
  { key: 'anchor_role', label: '场景作用', placeholder: '这个场景锚点主要负责承托什么场面或情绪', rows: 2 },
  { key: 'first_appearance', label: '首次出场', placeholder: '第一次出现在哪一章或哪种场面', rows: 2 },
  { key: 'trigger_condition', label: '触发条件', placeholder: '什么情况下会被再次使用或被想起', rows: 2 },
  { key: 'physical_impression', label: '空间印象', placeholder: '视觉、材质、布局或感官印象', rows: 2 },
  { key: 'atmosphere', label: '场域氛围', placeholder: '这个地点给人的情绪感受', rows: 2 },
  { key: 'symbolic_meaning', label: '象征意义', placeholder: '它在叙事上象征什么', rows: 2 },
  { key: 'controllers', label: '掌控者', placeholder: '谁名义或实质控制它', rows: 2 },
  { key: 'key_people', label: '关键人物', placeholder: '哪些人和这个地点高度绑定', rows: 2 },
  { key: 'entry_threshold', label: '进入门槛', placeholder: '谁能进、谁不能进、需要什么条件', rows: 2 },
  { key: 'danger_level', label: '危险等级', placeholder: '危险高低与来源', rows: 2 },
  { key: 'hidden_layers', label: '隐藏层', placeholder: '暗格、夹层、旧痕、隐藏空间', rows: 2 },
  { key: 'scene_payload', label: '场景承载', placeholder: '这个地点承载什么信息、对峙、记忆或气氛', rows: 2 },
  { key: 'volume1_function', label: '卷一功能', placeholder: '在第一卷里主要承担什么作用', rows: 2 },
  { key: 'future_hook', label: '后续钩子', placeholder: '后面还能牵出什么', rows: 2 },
];

const MAGIC_SYSTEM_FIELD_DEFINITIONS: LoreFieldDefinition[] = [
  { key: 'source', label: '力量来源', placeholder: '这套体系的力量源头是什么', rows: 2 },
  { key: 'core_logic', label: '核心逻辑', placeholder: '它是如何运作的', rows: 2 },
  { key: 'awakening_condition', label: '觉醒条件', placeholder: '需要什么前提才能触发', rows: 2 },
  { key: 'progression_path', label: '进阶路径', placeholder: '这套体系如何分层或升级', rows: 2 },
  { key: 'volume1_stage', label: '卷一阶段', placeholder: '第一卷推进到什么层次', rows: 2 },
  { key: 'capabilities', label: '能力表现', placeholder: '能做什么', rows: 2 },
  { key: 'limitations', label: '限制条件', placeholder: '不能做什么，依赖什么', rows: 2 },
  { key: 'costs', label: '代价', placeholder: '使用后会付出什么代价', rows: 2 },
  { key: 'taboos', label: '禁忌', placeholder: '绝不能触碰的边界', rows: 2 },
  { key: 'counters', label: '克制方式', placeholder: '它会被什么针对或压制', rows: 2 },
  { key: 'social_position', label: '社会位置', placeholder: '这套体系在世界中的位置', rows: 2 },
  { key: 'narrative_function', label: '叙事功能', placeholder: '它在故事中承担什么作用', rows: 2 },
];

const ITEM_FIELD_DEFINITIONS: LoreFieldDefinition[] = [
  { key: 'item_type', label: '物品类型', placeholder: '例如：印信、武器、证物、法器', rows: 2 },
  { key: 'public_identity', label: '公开身份', placeholder: '表面上它是什么', rows: 2 },
  { key: 'true_identity', label: '真实身份', placeholder: '本质上它是什么', rows: 2 },
  { key: 'origin', label: '来源', placeholder: '它来自哪里', rows: 2 },
  { key: 'current_holder', label: '当前持有者', placeholder: '现在掌握在谁手里', rows: 2 },
  { key: 'material_or_form', label: '材质/形制', placeholder: '它看起来是什么样', rows: 2 },
  { key: 'core_function', label: '核心功能', placeholder: '它最关键的用途是什么', rows: 2 },
  { key: 'story_value', label: '剧情价值', placeholder: '它在剧情里的主要价值', rows: 2 },
  { key: 'proof_value', label: '证据价值', placeholder: '它能证明什么', rows: 2 },
  { key: 'conflict_value', label: '冲突价值', placeholder: '它会引发或加剧什么冲突', rows: 2 },
  { key: 'symbolic_meaning', label: '象征意义', placeholder: '它象征什么', rows: 2 },
  { key: 'activation_or_reveal', label: '激活/揭示方式', placeholder: '何时、以什么方式显出意义', rows: 2 },
  { key: 'limitations', label: '限制', placeholder: '它的局限或前提', rows: 2 },
  { key: 'risks', label: '风险', placeholder: '使用或公开它会带来什么风险', rows: 2 },
  { key: 'volume1_function', label: '卷一功能', placeholder: '在第一卷里主要承担什么作用', rows: 2 },
  { key: 'future_hook', label: '后续钩子', placeholder: '后面还能牵出什么', rows: 2 },
];

const EVENT_FIELD_DEFINITIONS: LoreFieldDefinition[] = [
  { key: 'public_name', label: '公开称呼', placeholder: '事件对外通常怎么被叫', rows: 2 },
  { key: 'true_nature', label: '真实本质', placeholder: '这个事件真正是什么', rows: 2 },
  { key: 'trigger', label: '触发条件', placeholder: '它因为什么被引发', rows: 2 },
  { key: 'participants', label: '关键参与方', placeholder: '谁卷入其中', rows: 2 },
  { key: 'surface_impact', label: '表层影响', placeholder: '表面看造成了什么后果', rows: 2 },
  { key: 'deep_impact', label: '深层影响', placeholder: '真正改变了什么', rows: 2 },
  { key: 'current_status', label: '当前状态', placeholder: '现在推进到哪一步', rows: 2 },
  { key: 'future_hook', label: '后续钩子', placeholder: '后面还能牵出什么', rows: 2 },
];

const LORE_FIELD_DEFINITIONS: Partial<Record<LoreEntityType, LoreFieldDefinition[]>> = {
  functional_role: FUNCTIONAL_ROLE_FIELD_DEFINITIONS,
  faction: FACTION_FIELD_DEFINITIONS,
  location: LOCATION_FIELD_DEFINITIONS,
  magic_system: MAGIC_SYSTEM_FIELD_DEFINITIONS,
  item: ITEM_FIELD_DEFINITIONS,
  event: EVENT_FIELD_DEFINITIONS,
};

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

function getLoreFieldDefinitions(type: LoreEntityType) {
  return LORE_FIELD_DEFINITIONS[type] ?? [];
}

function getLoreFieldDefinition(type: LoreEntityType, key: string) {
  return getLoreFieldDefinitions(type).find((definition) => definition.key === key) ?? null;
}

function getLoreFieldLabel(type: LoreEntityType, key: string) {
  return getLoreFieldDefinition(type, key)?.label ?? key;
}

function buildEntityFieldDrafts(entity: LoreEntity) {
  return Object.fromEntries(
    Object.entries(entity.fields).map(([key, value]) => [key, value == null ? '' : String(value)]),
  ) as Record<string, string>;
}

function buildNonCharacterFieldsFromDrafts(baseFields: LoreEntityFields, drafts: Record<string, string>) {
  const nextFields: LoreEntityFields = {
    ...baseFields,
  };

  for (const [key, value] of Object.entries(drafts)) {
    const trimmed = value.trim();
    nextFields[key] = trimmed || null;
  }

  return nextFields;
}

function getOrderedLoreFieldEntries(type: LoreEntityType, fields: LoreEntityFields) {
  const orderedKeys = getLoreFieldDefinitions(type).map((definition) => definition.key);
  const remainingKeys = Object.keys(fields).filter((key) => !orderedKeys.includes(key)).sort((left, right) => left.localeCompare(right, 'zh-CN'));

  return [...orderedKeys, ...remainingKeys]
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .map((key) => [key, fields[key]] as const)
    .filter(([, value]) => typeof value !== 'undefined' && value !== null && String(value).trim());
}

function shortenPreviewText(value: string, maxLength = 44) {
  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function buildCharacterFieldDrafts(entity: LoreEntity) {
  return Object.fromEntries(
    CHARACTER_STATIC_FIELD_DEFINITIONS.map((definition) => [
      definition.key,
      typeof entity.fields[definition.key] === 'string' ? String(entity.fields[definition.key]) : '',
    ]),
  ) as Record<string, string>;
}

function buildCharacterFieldsFromDrafts(baseFields: LoreEntityFields, drafts: Record<string, string>) {
  const nextFields: LoreEntityFields = {
    ...baseFields,
  };

  for (const definition of CHARACTER_STATIC_FIELD_DEFINITIONS) {
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
  return `${completeness.filled}/${CHARACTER_CARD_FIELD_TOTAL} 稳定事实层`;
}

function normalizeCompletenessLevel(level: string): 'low' | 'medium' | 'high' {
  if (level === 'high' || level === 'medium') {
    return level;
  }

  return 'low';
}

function normalizeRuntimeEntityFields(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return [key, value];
      }

      return [key, String(value)];
    }),
  ) as LoreEntityFields;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return parseTextList(value);
  }

  return [] as string[];
}

function readLoreFieldValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  return String(value ?? '');
}

function readLoreEntityFields(value: unknown) {
  const record = asRecord(value);

  if (!record) {
    return {} as LoreEntityFields;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, fieldValue]) => [key, readLoreFieldValue(fieldValue)]),
  ) as LoreEntityFields;
}

function resolveLoreEntityTypeFromJsonType(type: string): LoreEntityType | null {
  const normalizedType = type.trim();

  return (
    SUPPORTED_LORE_CARD_TYPES.find((entityType) => LORE_CARD_JSON_TYPE_MAP[entityType] === normalizedType) ?? null
  );
}

function parseLoreCardPayload(raw: unknown) {
  const rootRecord = asRecord(raw);
  const rawType = readString(rootRecord?.type).trim();
  const isSceneAnchorPayload = rawType === 'lore-scene-anchor-card';
  const payloadEntityType = isSceneAnchorPayload
    ? 'location'
    : resolveLoreEntityTypeFromJsonType(rawType);
  const payloadRecord =
    rootRecord && (payloadEntityType || isSceneAnchorPayload) && 'data' in rootRecord
      ? asRecord(rootRecord.data)
      : rootRecord;

  if (!payloadRecord) {
    throw new Error('导入文件结构无效');
  }

  const importedFields = readLoreEntityFields(payloadRecord.fields);

  return {
    payloadEntityType,
    importedFieldDrafts: Object.fromEntries(
      CHARACTER_STATIC_FIELD_DEFINITIONS.map((definition) => [
        definition.key,
        typeof importedFields[definition.key] === 'string' ? String(importedFields[definition.key]) : '',
      ]),
    ) as Record<string, string>,
    importedName: readString(payloadRecord.name).trim(),
    importedDescription: readString(payloadRecord.description).trim(),
    importedTags: Array.from(
      new Set([
        ...readStringList(payloadRecord.tags),
        ...(isSceneAnchorPayload ? [SCENE_ANCHOR_TAG, LIGHTWEIGHT_TAG] : []),
      ]),
    ),
    importedAliases: readStringList(payloadRecord.aliases),
    importedDraft: typeof payloadRecord.draft === 'boolean' ? payloadRecord.draft : true,
    importedFields,
    isSceneAnchorPayload,
  };
}

function getLoreCardDisplayLabel(entityType: LoreEntityType, tags?: string[]) {
  return entityType === 'location' && (tags ?? []).includes(SCENE_ANCHOR_TAG)
    ? SCENE_ANCHOR_TAG
    : getLoreEntityTypeLabel(entityType);
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
  const [entityFieldDrafts, setEntityFieldDrafts] = useState<Record<string, string>>({});
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
  const entityCardImportInputRef = useRef<HTMLInputElement | null>(null);
  const newEntityCardImportInputRef = useRef<HTMLInputElement | null>(null);
  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingNewEntityImportTypeRef = useRef<NewEntityImportType | null>(null);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [showSceneAnchorsOnly, setShowSceneAnchorsOnly] = useState(false);

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

  useEffect(() => {
    if (!isImportMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!importMenuRef.current?.contains(event.target as Node)) {
        setIsImportMenuOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isImportMenuOpen]);

  useEffect(() => {
    if (activeFilter !== 'location' && showSceneAnchorsOnly) {
      setShowSceneAnchorsOnly(false);
    }
  }, [activeFilter, showSceneAnchorsOnly]);

  const filteredEntities = useMemo(() => {
    if (activeFilter === 'all') {
      return entities.map((entity) => normalizeLoreEntity(entity)).filter((entity): entity is LoreEntity => Boolean(entity));
    }

    return entities
      .filter((entity) => entity.type === activeFilter)
      .map((entity) => normalizeLoreEntity(entity))
      .filter((entity): entity is LoreEntity => Boolean(entity));
  }, [activeFilter, entities]);
  const filterScopedEntities = useMemo(
    () =>
      activeFilter === 'location' && showSceneAnchorsOnly
        ? filteredEntities.filter((entity) => entity.tags.includes(SCENE_ANCHOR_TAG))
        : filteredEntities,
    [activeFilter, filteredEntities, showSceneAnchorsOnly],
  );
  const confirmedEntities = useMemo(
    () => filterScopedEntities.filter((entity) => !entity.draft),
    [filterScopedEntities],
  );
  const candidateDraftEntities = useMemo(
    () => filterScopedEntities.filter((entity) => entity.draft),
    [filterScopedEntities],
  );
  const primaryEditableEntities = confirmedEntities.length > 0 ? confirmedEntities : candidateDraftEntities;
  const isDraftPrimaryMode = confirmedEntities.length === 0 && candidateDraftEntities.length > 0;
  const activeFilterLabel = activeFilter === 'all' ? '全部设定' : getLoreEntityTypeLabel(activeFilter);
  const manualDraftCount = candidateDraftEntities.length;
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

      if (activeFilter === 'location' && showSceneAnchorsOnly && !entity.tags.includes(SCENE_ANCHOR_TAG)) {
        return false;
      }

      return !localNameSet.has(entity.entityName.trim().toLowerCase());
    });
  }, [activeFilter, entities, runtimeEntities, showSceneAnchorsOnly]);
  const selectedEntity = useMemo(() => {
    return filterScopedEntities.find((entity) => entity.id === selectedEntityId) ?? filterScopedEntities[0] ?? null;
  }, [filterScopedEntities, selectedEntityId]);
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
    if (filterScopedEntities.length === 0) {
      setSelectedEntityId(null);
      return;
    }

    if (!selectedEntityId || !filterScopedEntities.some((entity) => entity.id === selectedEntityId)) {
      setSelectedEntityId(filterScopedEntities[0].id);
    }
  }, [filterScopedEntities, selectedEntityId]);

  useEffect(() => {
    if (!selectedEntity) {
      setDraftName('');
      setDraftDescription('');
      setDraftTagsText('');
      setDraftAliasesText('');
      setDraftFlag(false);
      setCharacterFieldDrafts({});
      setEntityFieldDrafts({});
      return;
    }

    setDraftName(selectedEntity.name);
    setDraftDescription(selectedEntity.description || '');
    setDraftTagsText((selectedEntity.tags ?? []).join('，'));
    setDraftAliasesText((selectedEntity.aliases ?? []).join('，'));
    setDraftFlag(Boolean(selectedEntity.draft));
    setCharacterFieldDrafts(buildCharacterFieldDrafts(selectedEntity));
    setEntityFieldDrafts(buildEntityFieldDrafts(selectedEntity));
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

  async function handleAdoptRuntimeEntityAsDraft(entity: GenerationDebugEntityRecord) {
    const nextType = isLoreEntityType(entity.entityType) ? entity.entityType : 'event';
    const created = await createEntity({
      projectId,
      type: nextType,
      name: entity.entityName,
      description: entity.description,
      fields: normalizeRuntimeEntityFields(entity.fields),
      tags: entity.tags,
      pinned: entity.pinned,
      draft: true,
    });

    setSelectedEntityId(created.id);
    toast(`已将「${entity.entityName}」收为候选设定`, 'success');
  }

  function openSelectedEntityImportDialog() {
    if (!selectedEntity || !SUPPORTED_LORE_CARD_TYPES.includes(selectedEntity.type)) {
      toast('请先选中可导入的设定卡', 'warning');
      return;
    }

    if (!entityCardImportInputRef.current) {
      toast('导入控件尚未就绪，请稍后重试', 'warning');
      return;
    }

    entityCardImportInputRef.current.value = '';
    entityCardImportInputRef.current.click();
  }

  function openNewEntityImportDialog(entityType: NewEntityImportType) {
    pendingNewEntityImportTypeRef.current = entityType;
    setIsImportMenuOpen(false);

    if (!newEntityCardImportInputRef.current) {
      toast('导入控件尚未就绪，请稍后重试', 'warning');
      return;
    }

    newEntityCardImportInputRef.current.value = '';
    newEntityCardImportInputRef.current.click();
  }

  function buildSelectedEntityPayloadData(entity: LoreEntity) {
    const name = draftName.trim() || entity.name;
    const description = draftDescription.trim();
    const tags = parseTextList(draftTagsText);
    const aliases = parseTextList(draftAliasesText);
    const fields =
      entity.type === 'character'
        ? buildCharacterFieldsFromDrafts(entity.fields ?? {}, characterFieldDrafts)
        : buildNonCharacterFieldsFromDrafts(entity.fields ?? {}, entityFieldDrafts);

    return {
      name,
      description,
      tags,
      aliases,
      draft: draftFlag,
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, value == null ? '' : String(value)]),
      ),
    };
  }

  function handleExportSelectedEntityCard() {
    if (!selectedEntity || !SUPPORTED_LORE_CARD_TYPES.includes(selectedEntity.type)) {
      toast('请先选中可导出的设定卡', 'warning');
      return;
    }

    const payloadData = buildSelectedEntityPayloadData(selectedEntity);
    const exportJsonType =
      selectedEntity.type === 'location' && payloadData.tags.includes(SCENE_ANCHOR_TAG)
        ? 'lore-scene-anchor-card'
        : LORE_CARD_JSON_TYPE_MAP[selectedEntity.type];

    const payload: LoreCardJsonPayload = {
      version: 1,
      type: exportJsonType,
      exportedAt: new Date().toISOString(),
      data: payloadData,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = sanitizeFileName(
      `${payload.data.name || selectedEntity.name}-${getLoreCardDisplayLabel(selectedEntity.type, payloadData.tags)}卡.json`,
    );
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
  }

  async function handleImportSelectedEntityCard(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!selectedEntity || !SUPPORTED_LORE_CARD_TYPES.includes(selectedEntity.type)) {
      toast('请先选中可导入的设定卡', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const {
        payloadEntityType,
        importedFieldDrafts,
        importedName,
        importedDescription,
        importedTags,
        importedAliases,
        importedDraft,
        importedFields,
        isSceneAnchorPayload,
      } = parseLoreCardPayload(parsed);

      if (payloadEntityType && payloadEntityType !== selectedEntity.type) {
        throw new Error(`导入文件类型为「${getLoreEntityTypeLabel(payloadEntityType)}」，与当前设定类型不一致`);
      }

      const resolvedName = importedName || selectedEntity.name;
      const nextFields =
        selectedEntity.type === 'character'
          ? buildCharacterFieldsFromDrafts(
              {
                ...(selectedEntity.fields ?? {}),
                ...importedFields,
              },
              importedFieldDrafts,
            )
          : importedFields;
      const resolvedTags = Array.from(
        new Set([
          ...importedTags,
          ...(selectedEntity.type === 'location' && isSceneAnchorPayload ? [SCENE_ANCHOR_TAG, LIGHTWEIGHT_TAG] : []),
        ]),
      );

      setDraftName(resolvedName);
      setDraftDescription(importedDescription);
      setDraftTagsText(resolvedTags.join('，'));
      setDraftAliasesText(importedAliases.join('，'));
      setDraftFlag(importedDraft);
      if (selectedEntity.type === 'character') {
        setCharacterFieldDrafts(importedFieldDrafts);
      } else {
        setEntityFieldDrafts(buildEntityFieldDrafts({
          ...selectedEntity,
          fields: nextFields,
        }));
      }

      await updateEntity(selectedEntity.id, {
        name: resolvedName,
        description: importedDescription,
        tags: resolvedTags,
        aliases: importedAliases,
        fields: nextFields,
        draft: importedDraft,
      });
      toast(`已导入${getLoreCardDisplayLabel(selectedEntity.type, resolvedTags)}卡「${resolvedName}」`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`导入设定卡失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImportEntityCardAsNewEntity(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const selectedImportType = pendingNewEntityImportTypeRef.current;
    pendingNewEntityImportTypeRef.current = null;

    if (files.length === 0) {
      return;
    }

    setIsSaving(true);

    try {
      const successes: Array<{ entity: LoreEntity; name: string; type: LoreEntityType; isSceneAnchor: boolean }> = [];
      const failures: string[] = [];

      for (const file of files) {
        try {
          const parsed = JSON.parse(await file.text()) as unknown;
          const {
            payloadEntityType,
            importedFieldDrafts,
            importedName,
            importedDescription,
            importedTags,
            importedAliases,
            importedDraft,
            importedFields,
            isSceneAnchorPayload,
          } = parseLoreCardPayload(parsed);
          const selectedImportEntityType =
            selectedImportType === 'scene_anchor' ? 'location' : selectedImportType;
          const resolvedEntityType = payloadEntityType ?? selectedImportEntityType;
          const resolvedTags = Array.from(
            new Set([
              ...importedTags,
              ...(selectedImportType === 'scene_anchor' || isSceneAnchorPayload
                ? [SCENE_ANCHOR_TAG, LIGHTWEIGHT_TAG]
                : []),
            ]),
          );

          if (!resolvedEntityType) {
            throw new Error('无法判断导入卡片类型');
          }

          if (selectedImportType === 'scene_anchor' && payloadEntityType && payloadEntityType !== 'location') {
            throw new Error(
              `你选择导入的是「场景锚点」，但文件类型是「${getLoreEntityTypeLabel(payloadEntityType)}」`,
            );
          }

          if (
            selectedImportType &&
            selectedImportType !== 'scene_anchor' &&
            payloadEntityType &&
            selectedImportType !== payloadEntityType
          ) {
            throw new Error(
              `你选择导入的是「${getLoreEntityTypeLabel(selectedImportType)}」，但文件类型是「${getLoreEntityTypeLabel(payloadEntityType)}」`,
            );
          }

          if (!importedName) {
            throw new Error('设定卡缺少名称，无法导入');
          }

          const created = await createEntity({
            projectId,
            type: resolvedEntityType,
            name: importedName,
            description: importedDescription,
            fields:
              resolvedEntityType === 'character'
                ? buildCharacterFieldsFromDrafts(importedFields, importedFieldDrafts)
                : importedFields,
            tags: resolvedTags,
            aliases: importedAliases,
            draft: importedDraft,
          });

          successes.push({
            entity: created,
            name: importedName,
            type: resolvedEntityType,
            isSceneAnchor:
              resolvedEntityType === 'location' && resolvedTags.includes(SCENE_ANCHOR_TAG),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误';
          failures.push(`${file.name}：${message}`);
        }
      }

      if (successes.length > 0) {
        const lastSuccess = successes[successes.length - 1];

        if (lastSuccess.isSceneAnchor) {
          setActiveFilter('location');
          setShowSceneAnchorsOnly(true);
        } else if (activeFilter !== 'all' && activeFilter !== lastSuccess.type) {
          setActiveFilter(lastSuccess.type);
        }

        setSelectedEntityId(lastSuccess.entity.id);
        toast(
          successes.length === 1
            ? `已导入${lastSuccess.isSceneAnchor ? '场景锚点' : getLoreEntityTypeLabel(lastSuccess.type)}卡并创建「${lastSuccess.name}」`
            : `已批量导入 ${successes.length} 张设定卡`,
          'success',
        );
      }

      if (failures.length > 0) {
        const failurePreview = failures.slice(0, 2).join('；');
        const suffix = failures.length > 2 ? ` 等 ${failures.length} 项` : '';
        toast(`部分导入失败：${failurePreview}${suffix}`, successes.length > 0 ? 'warning' : 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`导入设定卡失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
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
          : buildNonCharacterFieldsFromDrafts(baseFields, entityFieldDrafts);

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
            当前共 {entities.length} 条设定，当前筛选下正式 {confirmedEntities.length} 条、候选 {manualDraftCount + runtimeOnlyEntities.length} 条
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
          <div ref={importMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsImportMenuOpen((current) => !current)}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={15} />
              导入
              <ChevronDown size={14} className={`transition-transform ${isImportMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {isImportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl shadow-black/40">
                <div className="border-b border-neutral-800 px-4 py-3 text-xs uppercase tracking-[0.18em] text-neutral-500">
                  选择类型
                </div>
                <div className="py-2">
                  {IMPORT_MENU_OPTIONS.map((option) => (
                    <button
                      key={`import-type-${option.key}`}
                      type="button"
                      onClick={() => openNewEntityImportDialog(option.key)}
                      className="flex w-full items-center px-4 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-900"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {activeFilter === 'location' ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSceneAnchorsOnly(false)}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  !showSceneAnchorsOnly
                    ? 'bg-amber-500/15 text-amber-200'
                    : 'bg-neutral-950/70 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
              >
                全部地点
              </button>
              <button
                type="button"
                onClick={() => setShowSceneAnchorsOnly(true)}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  showSceneAnchorsOnly
                    ? 'bg-amber-500/15 text-amber-200'
                    : 'bg-neutral-950/70 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
              >
                场景锚点
              </button>
            </div>
          ) : null}
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

      <div className="min-h-0 flex-1 overflow-hidden p-5">
        {filterScopedEntities.length === 0 && runtimeOnlyEntities.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-500">
                <Users size={22} />
              </div>
              <h2 className="text-xl font-medium text-neutral-100">当前分类还没有设定</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                {activeFilter === 'all'
                  ? '创建人物、势力、地点、物品和事件条目，为你的故事构建完整世界观。'
                  : activeFilter === 'location' && showSceneAnchorsOnly
                    ? '当前还没有场景锚点，可以先导入一批轻量地点锚点。'
                    : `当前还没有${activeFilterLabel}条目，可以先从最关键的一条开始补。`}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_380px]">
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="space-y-8">
                {primaryEditableEntities.length > 0 ? (
                  <section className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                        {confirmedEntities.length > 0 ? '正式设定' : '候选设定'}
                      </p>
                      <p className="mt-1 text-sm text-neutral-400">
                        {confirmedEntities.length > 0
                          ? '这里默认维护稳定事实层。人物卡只编辑人格内核、静态标签与别名，动态状态请交给结构记忆。'
                          : '当前筛选下还没有正式设定，先在候选区整理并确认后再转成稳定事实层。'}
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                    {primaryEditableEntities.map((rawEntity) => {
                      const entity = normalizeLoreEntity(rawEntity);

                      if (!entity) {
                        return null;
                      }

                      const completeness = entity.type === 'character' ? getCharacterCardCompleteness(entity) : null;

                      return (
                        <article
                          key={entity.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedEntityId(entity.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedEntityId(entity.id);
                            }
                          }}
                          className={`flex flex-col rounded-3xl border bg-neutral-950/60 p-4 transition-colors ${
                            selectedEntity?.id === entity.id
                              ? 'border-indigo-500/40 ring-1 ring-indigo-500/20'
                              : entity.draft
                                ? 'border-dashed border-neutral-700'
                                : 'border-neutral-800'
                          } ${entity.draft ? 'opacity-90' : 'opacity-100'} cursor-pointer`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
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
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleTogglePin(entity.id, entity.name, entity.pinned);
                                }}
                                className="rounded-xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-indigo-300"
                                title={entity.pinned ? '取消钉选' : '钉选到上下文'}
                              >
                                {entity.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteEntity(entity.id, entity.name);
                                }}
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
                                  稳定事实层：{completeness?.filled ?? 0}/{CHARACTER_CARD_FIELD_TOTAL}
                                </p>
                                <p className="text-neutral-500">
                                  历史动态记录：{CHARACTER_DYNAMIC_FIELD_DEFINITIONS.some((definition) => {
                                    const value = entity.fields[definition.key];
                                    return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
                                  })
                                    ? '已保留，待迁移到结构记忆'
                                    : '暂无待迁移信息'}
                                </p>
                              </div>
                            ) : Object.keys(entity.fields).length === 0 ? (
                              <p className="text-neutral-500">暂无结构化字段</p>
                            ) : (
                              getOrderedLoreFieldEntries(entity.type, entity.fields).slice(0, 2).map(([field, value]) => (
                                <div key={field} className="space-y-1">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                                    {getLoreFieldLabel(entity.type, field)}
                                  </p>
                                  <p className="text-sm leading-6 text-neutral-300">
                                    {shortenPreviewText(String(value))}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </article>
                      );
                    })}
                    </div>
                  </section>
                ) : null}

                {(!isDraftPrimaryMode && candidateDraftEntities.length > 0) || runtimeOnlyEntities.length > 0 ? (
                  <section className="space-y-4">
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-4 text-sm text-amber-100">
                      AI 发现的新设定先进入候选区。确认后再转成正式设定，避免把不稳定推断直接写成真源。
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">候选设定 / 待确认</p>
                      <p className="mt-1 text-sm text-neutral-400">
                        当前筛选下本地草案 {candidateDraftEntities.length} 条，运行态候选 {runtimeOnlyEntities.length} 条。
                      </p>
                      {isDraftPrimaryMode ? (
                        <p className="mt-2 text-xs text-neutral-500">
                          当前还没有正式设定，上方已经进入候选编辑模式，这里只保留额外候选入口，避免重复遮挡工作区。
                        </p>
                      ) : null}
                      {runtimeError ? <p className="mt-2 text-xs text-yellow-400">读取失败：{runtimeError}</p> : null}
                    </div>
                    {!isDraftPrimaryMode && candidateDraftEntities.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-neutral-200">本地候选</p>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {candidateDraftEntities.map((entity) => (
                            <article
                              key={entity.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedEntityId(entity.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelectedEntityId(entity.id);
                                }
                              }}
                              className={`flex cursor-pointer flex-col rounded-3xl border p-4 transition-colors ${
                                selectedEntity?.id === entity.id
                                  ? 'border-amber-500/40 bg-amber-500/10 ring-1 ring-amber-500/20'
                                  : 'border-dashed border-amber-500/20 bg-amber-500/5'
                              }`}
                            >
                              <div className="mb-3 flex items-center gap-2">
                                <h2 className="text-lg font-medium text-neutral-100">{entity.name}</h2>
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                                  待确认
                                </span>
                              </div>
                              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                                {getLoreEntityTypeLabel(entity.type)}
                              </p>
                              <p className="mt-3 min-h-[44px] text-sm leading-6 text-neutral-300">
                                {entity.description || '暂无描述。'}
                              </p>
                              <p className="mt-4 text-xs text-neutral-500">点击后可在右侧确认收录或继续整理。</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {runtimeOnlyEntities.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-neutral-200">运行态候选</p>
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
                                  {getLoreEntityTypeLabel(isLoreEntityType(entity.entityType) ? entity.entityType : 'event')}
                                </p>
                              </div>
                              <p className="mb-4 min-h-[44px] text-sm leading-6 text-neutral-300">
                                {entity.description || '暂无描述。'}
                              </p>
                              <div className="space-y-2 border-t border-neutral-800 pt-3 text-sm text-neutral-300">
                              {Object.keys(entity.fields).length === 0 ? (
                                <p className="text-neutral-500">暂无结构化字段</p>
                              ) : (
                                getOrderedLoreFieldEntries(
                                  isLoreEntityType(entity.entityType) ? entity.entityType : 'event',
                                  entity.fields as LoreEntityFields,
                                ).slice(0, 2).map(([field, value]) => (
                                  <div key={field} className="space-y-1">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                                      {getLoreFieldLabel(isLoreEntityType(entity.entityType) ? entity.entityType : 'event', field)}
                                    </p>
                                    <p className="text-sm leading-6 text-neutral-300">
                                      {shortenPreviewText(String(value))}
                                    </p>
                                  </div>
                                ))
                              )}
                                <p className="pt-2 text-xs text-neutral-500">最近出现：{entity.lastSeenChapterTitle || '未知章节'}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleAdoptRuntimeEntityAsDraft(entity)}
                                className="mt-4 inline-flex items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 transition-colors hover:bg-sky-500/20"
                              >
                                收为候选
                              </button>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </div>

            <aside className="min-h-0 overflow-y-auto rounded-3xl border border-neutral-800 bg-neutral-950/50 p-4">
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
                              <div>
                                <p className="text-sm font-medium text-neutral-200">历史动态记录 / 待迁移信息</p>
                                <p className="mt-1 text-xs text-neutral-500">
                                  当前阶段状态不再在人物卡内编辑，建议迁移到结构记忆里的世界状态、资源连续性或剧情线账本。
                                </p>
                              </div>
                              <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 px-3 py-3">
                                {CHARACTER_DYNAMIC_FIELD_DEFINITIONS.some((definition) => {
                                  const value = selectedEntity.fields[definition.key];
                                  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
                                }) ? (
                                  <div className="space-y-2">
                                    {CHARACTER_DYNAMIC_FIELD_DEFINITIONS.map((definition) => {
                                      const value = selectedEntity.fields[definition.key];
                                      const text = typeof value === 'string' ? value.trim() : '';

                                      if (!text) {
                                        return null;
                                      }

                                      return (
                                        <div key={definition.key} className="flex items-start justify-between gap-3 text-sm">
                                          <span className="text-neutral-500">{definition.label}</span>
                                          <span className="text-right text-neutral-300">{text}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-sm text-neutral-500">暂无待迁移的 current_* 字段。</p>
                                )}
                              </div>
                            </div>

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
                          <div className="space-y-4 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-4">
                            <div>
                              <p className="text-sm font-medium text-neutral-200">结构字段</p>
                              <p className="mt-1 text-xs text-neutral-500">
                                这里维护该设定类型的稳定结构信息，会直接参与后续上下文生成。
                              </p>
                            </div>

                            {getLoreFieldDefinitions(selectedEntity.type).map((definition) => (
                              <label key={definition.key} className="block space-y-2">
                                <span className="text-sm text-neutral-300">{definition.label}</span>
                                <textarea
                                  value={entityFieldDrafts[definition.key] ?? ''}
                                  rows={definition.rows ?? 2}
                                  placeholder={definition.placeholder}
                                  onChange={(event) =>
                                    setEntityFieldDrafts((current) => ({
                                      ...current,
                                      [definition.key]: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                />
                              </label>
                            ))}

                            {Object.entries(entityFieldDrafts).some(
                              ([key, value]) =>
                                !getLoreFieldDefinitions(selectedEntity.type).some((definition) => definition.key === key) &&
                                value.trim(),
                            ) ? (
                              <div className="border-t border-neutral-800 pt-4">
                                <p className="text-sm font-medium text-neutral-200">附加字段</p>
                                <p className="mt-1 text-xs text-neutral-500">
                                  以下是未收录到当前模板中的自定义字段，仍会随保存一起保留。
                                </p>
                                <div className="mt-3 space-y-3">
                                  {Object.entries(entityFieldDrafts)
                                    .filter(
                                      ([key, value]) =>
                                        !getLoreFieldDefinitions(selectedEntity.type).some((definition) => definition.key === key) &&
                                        value.trim(),
                                    )
                                    .map(([key, value]) => (
                                      <label key={`extra-${key}`} className="block space-y-2">
                                        <span className="text-sm text-neutral-300">{getLoreFieldLabel(selectedEntity.type, key)}</span>
                                        <textarea
                                          value={value}
                                          rows={2}
                                          onChange={(event) =>
                                            setEntityFieldDrafts((current) => ({
                                              ...current,
                                              [key]: event.target.value,
                                            }))
                                          }
                                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                                        />
                                      </label>
                                    ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {SUPPORTED_LORE_CARD_TYPES.includes(selectedEntity.type) ? (
                            <>
                              <button
                                type="button"
                                onClick={handleExportSelectedEntityCard}
                                disabled={isSaving}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                                title={`导出${getLoreCardDisplayLabel(selectedEntity.type, parseTextList(draftTagsText))}卡 JSON`}
                                aria-label={`导出${getLoreCardDisplayLabel(selectedEntity.type, parseTextList(draftTagsText))}卡 JSON`}
                              >
                                <Download size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={openSelectedEntityImportDialog}
                                disabled={isSaving}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                                title={`导入${getLoreCardDisplayLabel(selectedEntity.type, parseTextList(draftTagsText))}卡 JSON`}
                                aria-label={`导入${getLoreCardDisplayLabel(selectedEntity.type, parseTextList(draftTagsText))}卡 JSON`}
                              >
                                <Upload size={15} />
                              </button>
                            </>
                          ) : null}
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
        )}
      </div>
      <input
        ref={entityCardImportInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handleImportSelectedEntityCard(event)}
        className="hidden"
      />
      <input
        ref={newEntityCardImportInputRef}
        type="file"
        accept="application/json,.json"
        multiple
        onChange={(event) => void handleImportEntityCardAsNewEntity(event)}
        className="hidden"
      />
    </div>
  );
}
