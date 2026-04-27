import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Compass,
  Download,
  GitBranch,
  Globe2,
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ChapterBeatCompactList } from '@/components/outline-workspace/ChapterBeatCompactList';
import { OutlineModeTabs, type OutlineWorkspaceMode } from '@/components/outline-workspace/OutlineModeTabs';
import { OutlineWorkspaceSidebar } from '@/components/outline-workspace/OutlineWorkspaceSidebar';
import { useToast } from '@/components/Toast';
import {
  createChapterOutlineDraft,
  createEmptyChapterSceneDraft,
  createEmptyChapterOutlineDraft,
  createEmptyForeshadowRef,
  createEmptyOutlineBeatDraft,
  getSceneActorNames,
  getChapterWriteUnitCount,
  normalizeChapterOutlineDraft,
  normalizeForeshadowRefs,
  normalizeForeshadowRef,
  normalizeSceneActorRefs,
  readChapterOutlineDraft,
  serializeChapterOutlineDraft,
} from '@/lib/chapter-outline';
import { db } from '@/lib/db';
import { sanitizeFileName } from '@/lib/export';
import { buildVolumeForeshadowPlanBundle } from '@/lib/foreshadow-plan';
import {
  createBookOutline,
  createVolumeBeats,
  createVolumeMilestones,
  createVolumeOutline,
  reconcileVolumePlan,
} from '@/lib/generation-client';
import {
  buildHistorySummaries,
  computeMilestoneEndChapter,
  computeMilestoneStartChapter,
} from '@/lib/history-summary';
import { saveChapterOutline } from '@/lib/generation-storage';
import { serializeSingleMilestone, serializeBookOutline, serializeVolumeOutline } from '@/lib/outline-serializer';
import {
  resolveBookOutlineWithAiSummary,
  resolveVolumeOutlineWithAiSummary,
} from '@/lib/outline-summary-client';
import {
  buildBookOutlineSummary,
  buildVolumeMilestoneSummary,
  buildVolumeOutlineSummary,
} from '@/lib/outline-summary';
import { collectPlanningRequirements } from '@/lib/planning-requirements';
import { buildVolumeQuestionPoolBundle } from '@/lib/question-pool';
import { formatPromptSection, mergePromptSections } from '@/lib/project-template';
import { buildModelRequestConfig } from '@/lib/runtime-config';
import {
  useAntagonistAgendaStore,
  useChapterBeatStore,
  useEditorStore,
  useForeshadowPlanStore,
  useForeshadowStore,
  useLoreStore,
  useOutlineStore,
  usePovPermissionStore,
  useProjectStore,
  useQuestionPoolStore,
  useResourceContinuityStore,
  useSettingsStore,
  useThreadLedgerStore,
  useVolumeStore,
  useWorldStateStore,
} from '@/stores';
import type {
  AIVolumePlanReconcileResponse,
  BookCharacterArcDraft,
  BookOutlineFields,
  ChapterBeat,
  ChapterBeatFields,
  ChapterOutline,
  ChapterOutlineBeatDraft,
  ChapterSceneDraft,
  ForeshadowRef,
  Id,
  PromptModuleKey,
  VolumeInheritedThreadDraft,
  VolumeMilestoneDraft,
  VolumeOutlineFields,
} from '@/types';

interface OutlineViewProps {
  projectId: Id;
  projectTitle: string;
  projectDescription: string;
  genre: string[];
  focusVolumeId?: Id | null;
  onOpenStructureMemory?: (sectionKey: StructureWorkspaceSectionKey) => void;
  className?: string;
}

type StructureWorkspaceSectionKey =
  | 'thread-ledger'
  | 'foreshadow-plan'
  | 'world-state'
  | 'question-pool'
  | 'antagonist-agenda'
  | 'pov-permission'
  | 'resource-continuity';

interface TextAreaFieldProps {
  label: string;
  placeholder: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
  className?: string;
}

interface ListFieldEditorProps {
  label: string;
  values: string[];
  addPlaceholder: string;
  textModePlaceholder: string;
  emptyText: string;
  helperText?: string;
  mode: 'cards' | 'text';
  inputValue: string;
  onInputChange: (value: string) => void;
  onChange: (values: string[]) => void;
  onToggleMode: () => void;
}

interface TextListFieldProps {
  label: string;
  placeholder: string;
  values: string[];
  rows: number;
  onChange: (values: string[]) => void;
  className?: string;
}

interface ChapterBeatRowModel {
  key: string;
  beatId?: Id;
  volumeId: Id;
  chapterId?: Id;
  chapterLabel: string;
  chapterNumber: number;
  displayChapterNumber: number | null;
  beat: ChapterBeat | null;
}

interface ChapterOutlineRowModel {
  chapterId: Id;
  volumeId: Id;
  chapterTitle: string;
  chapterNumber: number;
  milestoneIndex: number | null;
  outline: ChapterOutline | null;
}

interface StructureMemorySummaryCardProps {
  label: string;
  detail: string;
  count: number;
  attentionCount?: number;
  icon: typeof GitBranch;
  onOpen?: () => void;
}

interface VolumePlanReconcilePreview {
  volumeId: Id;
  volumeTitle: string;
  currentOutlineText: string;
  currentMilestonesText: string;
  proposedOutlineText: string;
  proposedMilestonesText: string;
  response: AIVolumePlanReconcileResponse;
}

type OutlineJsonExportType =
  | 'book-outline'
  | 'volume-outline'
  | 'volume-milestone'
  | 'chapter-beats'
  | 'chapter-outline'
  | 'chapter-scene-outline';
type ChapterBeatExportScope = 'volume' | 'milestone';
type OutlineImportTarget =
  | { type: 'book-outline' }
  | { type: 'volume-outline'; volumeId: Id }
  | { type: 'volume-milestone'; volumeId: Id; milestoneIndex: number }
  | { type: 'chapter-beats'; volumeId: Id; milestoneIndex: number | null }
  | { type: 'chapter-outline'; chapterId: Id };

interface OutlineJsonEnvelope<T> {
  version: 1;
  type: OutlineJsonExportType;
  projectTitle: string;
  exportedAt: string;
  data: T;
  meta?: Record<string, unknown>;
}

type MilestoneProgressStatus = 'empty' | 'planned' | 'progressed';
type FissionDialogMode = 'milestone' | 'volume';
type BeatFilterStatus = 'all' | MilestoneProgressStatus;
type OutlineSummaryDialogState = {
  title: string;
  summary: string;
  description: string;
} | null;

function createEmptyBookDraft(): BookOutlineFields {
  return {
    premise: '',
    centralConflict: '',
    protagonistArc: '',
    thematicCore: '',
    subPlots: [],
    characterArcs: [],
    powerSystem: '',
    antagonistSystem: '',
    narrativeArc: '',
    logline: '',
    worldRules: [],
    endgameHint: '',
    toneGuide: '',
    summary: '',
  };
}

function createEmptyVolumeDraft(): VolumeOutlineFields {
  return {
    goal: '',
    keyConflict: '',
    arcSummary: '',
    entryState: '',
    exitState: '',
    antagonist: '',
    subPlot: '',
    inheritedThreads: [],
    protagonistGrowth: '',
    emotionalArc: '',
    estimatedWordCount: 0,
    povPlan: '',
    keyEvents: [],
    foreshadowSeeds: [],
    requiredEntities: [],
    requiredForeshadows: [],
    requiredForeshadowIds: [],
    foreshadowRefs: [],
    estimatedChapterCount: 0,
    milestones: [],
    summary: '',
  };
}

function cloneVolumeMilestoneDraft(milestone: VolumeMilestoneDraft): VolumeMilestoneDraft {
  return {
    ...milestone,
    phasePacing: milestone.phasePacing,
    phaseEmotionShift: milestone.phaseEmotionShift,
    phasePOV: milestone.phasePOV,
    keyTurns: [...milestone.keyTurns],
    mustPlant: [...milestone.mustPlant],
    mustPayoff: [...milestone.mustPayoff],
    requiredEntities: [...(milestone.requiredEntities ?? [])],
    requiredForeshadows: [...(milestone.requiredForeshadows ?? [])],
    requiredForeshadowIds: [...(milestone.requiredForeshadowIds ?? [])],
    foreshadowRefs: normalizeForeshadowRefs(milestone.foreshadowRefs),
    summary: milestone.summary ?? '',
  };
}

function cloneVolumeDraft(draft: VolumeOutlineFields): VolumeOutlineFields {
  return {
    ...draft,
    keyEvents: [...draft.keyEvents],
    foreshadowSeeds: [...draft.foreshadowSeeds],
    inheritedThreads: draft.inheritedThreads.map((item) => ({ ...item })),
    requiredEntities: [...(draft.requiredEntities ?? [])],
    requiredForeshadows: [...(draft.requiredForeshadows ?? [])],
    requiredForeshadowIds: [...(draft.requiredForeshadowIds ?? [])],
    foreshadowRefs: normalizeForeshadowRefs(draft.foreshadowRefs),
    milestones: draft.milestones.map(cloneVolumeMilestoneDraft),
    summary: draft.summary ?? '',
  };
}

function createEmptyVolumeMilestoneDraft(): VolumeMilestoneDraft {
  return {
    title: '',
    targetChapterCount: 0,
    phaseGoal: '',
    phaseConflict: '',
    entryState: '',
    exitState: '',
    phasePacing: '',
    phaseEmotionShift: '',
    phasePOV: '',
    keyTurns: [],
    mustPlant: [],
    mustPayoff: [],
    powerCeiling: '',
    requiredEntities: [],
    requiredForeshadows: [],
    requiredForeshadowIds: [],
    foreshadowRefs: [],
    summary: '',
  };
}

function createEmptyChapterBeatDraft(orderInVolume = 1): ChapterBeatFields {
  return {
    orderInVolume,
    titleHint: '',
    scenePurpose: '',
    focusCharacter: '',
    mustAppearCharacters: [],
    availableCharacters: [],
    requiredForeshadows: [],
    mainPlot: '',
    subPlot: '',
    pacing: '',
    hookOut: '',
    noveltyRequirement: '',
    powerDelta: '',
    forbiddenPhrases: [],
    forbiddenScenePatterns: [],
    keyItems: [],
  };
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

function readInteger(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readBookCharacterArcs(value: unknown): BookCharacterArcDraft[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const record = asRecord(item);
          if (!record) {
            return null;
          }

          return {
            characterId: typeof record.characterId === 'string' ? record.characterId : null,
            characterName: readString(record.characterName),
            arc: readString(record.arc),
          } satisfies BookCharacterArcDraft;
        })
        .filter((item): item is BookCharacterArcDraft => item !== null)
    : [];
}

function readInheritedThreads(value: unknown): VolumeInheritedThreadDraft[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const record = asRecord(item);
          if (!record) {
            return null;
          }

          return {
            threadId: typeof record.threadId === 'string' ? record.threadId : null,
            threadName: readString(record.threadName),
            note: readString(record.note),
          } satisfies VolumeInheritedThreadDraft;
        })
        .filter((item): item is VolumeInheritedThreadDraft => item !== null)
    : [];
}

function readVolumeMilestoneDraft(value: unknown): VolumeMilestoneDraft {
  const record = asRecord(value);

  return {
    title: readString(record?.title),
    targetChapterCount: readInteger(record?.targetChapterCount),
    phaseGoal: readString(record?.phaseGoal),
    phaseConflict: readString(record?.phaseConflict),
    entryState: readString(record?.entryState),
    exitState: readString(record?.exitState),
    phasePacing: readString(record?.phasePacing),
    phaseEmotionShift: readString(record?.phaseEmotionShift),
    phasePOV: readString(record?.phasePOV),
    keyTurns: readStringList(record?.keyTurns),
    mustPlant: readStringList(record?.mustPlant),
    mustPayoff: readStringList(record?.mustPayoff),
    powerCeiling: readString(record?.powerCeiling),
    requiredEntities: readStringList(record?.requiredEntities),
    requiredForeshadows: readStringList(record?.requiredForeshadows),
    requiredForeshadowIds: readStringList(record?.requiredForeshadowIds),
    foreshadowRefs: normalizeForeshadowRefs(record?.foreshadowRefs as Array<Partial<ForeshadowRef>> | undefined),
    summary: readString(record?.summary),
  };
}

function readVolumeMilestoneDrafts(value: unknown) {
  return Array.isArray(value) ? value.map((item) => readVolumeMilestoneDraft(item)) : [];
}

function readBookOutlineFields(value: unknown): BookOutlineFields {
  const record = asRecord(value);

  return {
    premise: readString(record?.premise),
    centralConflict: readString(record?.centralConflict),
    protagonistArc: readString(record?.protagonistArc),
    thematicCore: readString(record?.thematicCore),
    subPlots: readStringList(record?.subPlots),
    characterArcs: readBookCharacterArcs(record?.characterArcs),
    powerSystem: readString(record?.powerSystem),
    antagonistSystem: readString(record?.antagonistSystem),
    narrativeArc: readString(record?.narrativeArc),
    logline: readString(record?.logline),
    worldRules: readStringList(record?.worldRules),
    endgameHint: readString(record?.endgameHint),
    toneGuide: readString(record?.toneGuide),
    summary: readString(record?.summary),
  };
}

function readVolumeOutlineFields(value: unknown): VolumeOutlineFields {
  const record = asRecord(value);

  return {
    goal: readString(record?.goal),
    keyConflict: readString(record?.keyConflict),
    arcSummary: readString(record?.arcSummary),
    entryState: readString(record?.entryState),
    exitState: readString(record?.exitState),
    antagonist: readString(record?.antagonist),
    subPlot: readString(record?.subPlot),
    inheritedThreads: readInheritedThreads(record?.inheritedThreads),
    protagonistGrowth: readString(record?.protagonistGrowth),
    emotionalArc: readString(record?.emotionalArc),
    estimatedWordCount: readInteger(record?.estimatedWordCount),
    povPlan: readString(record?.povPlan),
    keyEvents: readStringList(record?.keyEvents),
    foreshadowSeeds: readStringList(record?.foreshadowSeeds),
    requiredEntities: readStringList(record?.requiredEntities),
    requiredForeshadows: readStringList(record?.requiredForeshadows),
    requiredForeshadowIds: readStringList(record?.requiredForeshadowIds),
    foreshadowRefs: normalizeForeshadowRefs(record?.foreshadowRefs as Array<Partial<ForeshadowRef>> | undefined),
    estimatedChapterCount: readInteger(record?.estimatedChapterCount),
    milestones: readVolumeMilestoneDrafts(record?.milestones),
    summary: readString(record?.summary),
  };
}

function readChapterBeatFields(value: unknown, fallbackOrderInVolume: number): ChapterBeatFields {
  const record = asRecord(value);

  return {
    orderInVolume: readInteger(record?.orderInVolume, fallbackOrderInVolume) || fallbackOrderInVolume,
    titleHint: readString(record?.titleHint),
    scenePurpose: readString(record?.scenePurpose),
    focusCharacter: readString(record?.focusCharacter),
    mustAppearCharacters: readStringList(record?.mustAppearCharacters),
    availableCharacters: readStringList(record?.availableCharacters),
    requiredForeshadows: readStringList(record?.requiredForeshadows),
    mainPlot: readString(record?.mainPlot),
    subPlot: readString(record?.subPlot),
    pacing: readString(record?.pacing),
    hookOut: readString(record?.hookOut),
    noveltyRequirement: readString(record?.noveltyRequirement),
    powerDelta: readString(record?.powerDelta),
    forbiddenPhrases: readStringList(record?.forbiddenPhrases),
    forbiddenScenePatterns: readStringList(record?.forbiddenScenePatterns),
    keyItems: readStringList(record?.keyItems),
    milestoneIndex:
      typeof record?.milestoneIndex === 'number' && Number.isFinite(record.milestoneIndex) && record.milestoneIndex >= 0
        ? Math.trunc(record.milestoneIndex)
        : undefined,
  };
}

function readChapterBeatFieldList(value: unknown, startOrderInVolume: number) {
  if (Array.isArray(value)) {
    return value.map((item, index) => readChapterBeatFields(item, startOrderInVolume + index));
  }

  const record = asRecord(value);
  if (record && Array.isArray(record.beats)) {
    return record.beats.map((item, index) => readChapterBeatFields(item, startOrderInVolume + index));
  }

  return [];
}

function unwrapOutlineJsonData(value: unknown, expectedType: OutlineJsonExportType | OutlineJsonExportType[]) {
  const record = asRecord(value);

  if (!record || !('type' in record) || !('data' in record)) {
    return value;
  }

  const expectedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];

  if (!expectedTypes.includes(record.type as OutlineJsonExportType)) {
    throw new Error(`导入文件类型不匹配，当前需要 ${expectedTypes.join(' / ')}`);
  }

  return record.data;
}

function hasChapterBeatDraftContent(draft: ChapterBeatFields) {
  return Boolean(
    draft.titleHint.trim() ||
      draft.scenePurpose.trim() ||
      draft.focusCharacter.trim() ||
      draft.mainPlot.trim() ||
      draft.subPlot.trim() ||
      draft.pacing.trim() ||
      draft.hookOut.trim() ||
      draft.noveltyRequirement.trim() ||
      draft.powerDelta.trim() ||
      (draft.mustAppearCharacters ?? []).length > 0 ||
      (draft.availableCharacters ?? []).length > 0 ||
      (draft.requiredForeshadows ?? []).length > 0 ||
      draft.forbiddenPhrases.length > 0 ||
      draft.forbiddenScenePatterns.length > 0 ||
      draft.keyItems.length > 0 ||
      typeof draft.milestoneIndex === 'number'
  );
}

function parseMultilineList(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function dedupeTextList(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      values
        .map((item) => item?.trim() || '')
        .filter(Boolean),
    ),
  );
}

function parseExpectedVolumeOrderHint(windowText: string) {
  const matched = windowText.match(/第\s*(\d+)\s*卷/u) ?? windowText.match(/(\d+)/u);

  if (!matched) {
    return null;
  }

  const parsed = Number(matched[1]);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(1, Math.trunc(parsed));
}

function joinMultilineList(values: string[]) {
  return values.join('\n');
}

function parseNamedDetailLine(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      name: '',
      detail: '',
    };
  }

  const matched = trimmed.match(/^([^:：]+)[:：]\s*(.+)$/u);

  if (!matched) {
    return {
      name: trimmed,
      detail: '',
    };
  }

  return {
    name: matched[1].trim(),
    detail: matched[2].trim(),
  };
}

function serializeCharacterArcLines(values: BookCharacterArcDraft[]) {
  return values
    .map((item) => {
      const characterName = item.characterName.trim();
      const arc = item.arc.trim();

      if (!characterName && !arc) {
        return '';
      }

      return arc ? `${characterName}：${arc}` : characterName;
    })
    .filter(Boolean);
}

function parseCharacterArcLines(values: string[]): BookCharacterArcDraft[] {
  return values
    .map((value) => {
      const { name, detail } = parseNamedDetailLine(value);
      return {
        characterId: null,
        characterName: name,
        arc: detail,
      } satisfies BookCharacterArcDraft;
    })
    .filter((item) => item.characterName || item.arc);
}

function serializeInheritedThreadLines(values: VolumeInheritedThreadDraft[]) {
  return values
    .map((item) => {
      const threadName = item.threadName.trim();
      const note = item.note.trim();

      if (!threadName && !note) {
        return '';
      }

      return note ? `${threadName}：${note}` : threadName;
    })
    .filter(Boolean);
}

function parseInheritedThreadLines(values: string[]): VolumeInheritedThreadDraft[] {
  return values
    .map((value) => {
      const { name, detail } = parseNamedDetailLine(value);
      return {
        threadId: null,
        threadName: name,
        note: detail,
      } satisfies VolumeInheritedThreadDraft;
    })
    .filter((item) => item.threadName || item.note);
}

function serializeMilestoneCollection(milestones: VolumeMilestoneDraft[]) {
  return milestones
    .map((milestone, index) => serializeSingleMilestone(milestone, index))
    .filter(Boolean)
    .join('\n\n');
}

function hasText(value: string) {
  return value.trim().length > 0;
}

function isBookDraftEmpty(draft: BookOutlineFields) {
  return (
    !hasText(draft.premise) &&
    !hasText(draft.centralConflict) &&
    !hasText(draft.protagonistArc) &&
    !hasText(draft.thematicCore) &&
    draft.subPlots.length === 0 &&
    draft.characterArcs.length === 0 &&
    !hasText(draft.powerSystem) &&
    !hasText(draft.antagonistSystem) &&
    !hasText(draft.narrativeArc) &&
    !hasText(draft.logline) &&
    draft.worldRules.length === 0 &&
    !hasText(draft.endgameHint) &&
    !hasText(draft.toneGuide)
  );
}

function countFilledVolumeFields(draft: VolumeOutlineFields) {
  return [
    draft.goal,
    draft.keyConflict,
    draft.arcSummary,
    draft.entryState,
    draft.exitState,
    draft.antagonist,
    draft.subPlot,
    draft.protagonistGrowth,
    draft.emotionalArc,
    draft.povPlan,
  ].filter(hasText).length +
    (draft.keyEvents.length > 0 ? 1 : 0) +
    (draft.inheritedThreads.length > 0 ? 1 : 0) +
    (draft.foreshadowSeeds.length > 0 ? 1 : 0) +
    (draft.estimatedChapterCount > 0 ? 1 : 0) +
    (draft.estimatedWordCount > 0 ? 1 : 0) +
    (draft.milestones.length > 0 ? 1 : 0);
}

function getVolumeProgressLabel(draft: VolumeOutlineFields) {
  const filledCount = countFilledVolumeFields(draft);

  if (filledCount === 0) {
    return '未填写 · 点击展开编辑或使用 AI 生成';
  }

  return `已填 ${filledCount}/16 字段`;
}

function extractChapterBeatDraft(beat: ChapterBeat): ChapterBeatFields {
  return {
    orderInVolume: beat.orderInVolume,
    titleHint: beat.titleHint,
    scenePurpose: beat.scenePurpose,
    focusCharacter: beat.focusCharacter,
    mustAppearCharacters: [...(beat.mustAppearCharacters ?? [])],
    availableCharacters: [...(beat.availableCharacters ?? [])],
    requiredForeshadows: [...(beat.requiredForeshadows ?? [])],
    mainPlot: beat.mainPlot,
    subPlot: beat.subPlot,
    pacing: beat.pacing,
    hookOut: beat.hookOut,
    noveltyRequirement: beat.noveltyRequirement,
    powerDelta: beat.powerDelta,
    forbiddenPhrases: [...beat.forbiddenPhrases],
    forbiddenScenePatterns: [...beat.forbiddenScenePatterns],
    keyItems: [...beat.keyItems],
    milestoneIndex: beat.milestoneIndex,
  };
}

function getMilestoneIndexForChapterNumber(
  milestones: VolumeMilestoneDraft[],
  chapterNumber: number,
) {
  if (milestones.length === 0 || chapterNumber <= 0) {
    return undefined;
  }

  for (let index = 0; index < milestones.length; index += 1) {
    const startChapterNumber = computeMilestoneStartChapter(milestones, index);
    const endChapterNumber = computeMilestoneEndChapter(milestones, index);

    if (chapterNumber >= startChapterNumber && chapterNumber <= endChapterNumber) {
      return index;
    }
  }

  return undefined;
}

function getMilestoneStatusBadgeClassName(status: MilestoneProgressStatus, selected: boolean) {
  if (selected) {
    return 'border-emerald-400 bg-emerald-500/15 text-emerald-100';
  }

  switch (status) {
    case 'progressed':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
    case 'planned':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-200';
    case 'empty':
    default:
      return 'border-neutral-700 bg-neutral-950/70 text-neutral-400';
  }
}

function getMilestoneStatusLabel(status: MilestoneProgressStatus) {
  switch (status) {
    case 'progressed':
      return '已推进';
    case 'planned':
      return '已规划';
    case 'empty':
    default:
      return '未规划';
  }
}

function getChapterBeatProgressStatus(input: {
  beat: ChapterBeat | null;
  chapterId?: Id;
  chapterSummaryChapterIds: Set<Id>;
}): MilestoneProgressStatus {
  if (input.chapterId && input.chapterSummaryChapterIds.has(input.chapterId)) {
    return 'progressed' satisfies MilestoneProgressStatus;
  }

  if (input.beat) {
    return 'planned' satisfies MilestoneProgressStatus;
  }

  return 'empty' satisfies MilestoneProgressStatus;
}

function isPlaceholderChapterTitle(title: string) {
  return /^第\s*\d+\s*章$/u.test(title.trim());
}

function resolveSuggestedChapterTitle(input: { chapterTitle?: string; titleHint?: string }) {
  const chapterTitle = input.chapterTitle?.trim() ?? '';

  if (chapterTitle) {
    return chapterTitle;
  }

  const titleHint = input.titleHint?.trim() ?? '';

  if (titleHint && titleHint.length <= 24) {
    return titleHint;
  }

  if (titleHint) {
    const firstClause = titleHint
      .split(/[，。！？；：,.!?;:]/u)
      .map((part) => part.trim())
      .find(Boolean);

    if (firstClause && firstClause.length >= 2 && firstClause.length <= 18) {
      return firstClause;
    }
  }

  return '';
}

function findFirstMissingChapterNumberInRange(
  plannedChapterNumbers: Set<number>,
  startChapterNumber: number,
  endChapterNumber: number,
) {
  for (let chapterNumber = startChapterNumber; chapterNumber <= endChapterNumber; chapterNumber += 1) {
    if (!plannedChapterNumbers.has(chapterNumber)) {
      return chapterNumber;
    }
  }

  return null;
}

function reconcileSceneActorRefs(
  existing: ChapterSceneDraft['actors'] | ChapterSceneDraft['availableCharacters'],
  nextNames: string[],
  fallbackRole: 'support' | 'candidate',
) {
  const existingMap = new Map(
    (existing ?? [])
      .map((item) => {
        const characterId = item.characterId.trim();
        return characterId ? [characterId, item] as const : null;
      })
      .filter(Boolean) as Array<readonly [string, ChapterSceneDraft['actors'][number]]>,
  );

  return normalizeSceneActorRefs(
    nextNames.map((name) => {
      const characterId = name.trim();
      return existingMap.get(characterId) ?? { characterId, role: fallbackRole };
    }),
    fallbackRole,
  );
}

function TextAreaField({
  label,
  placeholder,
  value,
  rows,
  onChange,
  className,
}: TextAreaFieldProps) {
  return (
    <label className={['space-y-2', className ?? ''].filter(Boolean).join(' ')}>
      <span className="text-sm font-medium text-neutral-200">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
      />
    </label>
  );
}

function TextListField({
  label,
  placeholder,
  values,
  rows,
  onChange,
  className,
}: TextListFieldProps) {
  return (
    <label className={['space-y-2', className ?? ''].filter(Boolean).join(' ')}>
      <span className="text-sm font-medium text-neutral-200">{label}</span>
      <textarea
        value={joinMultilineList(values)}
        onChange={(event) => onChange(parseMultilineList(event.target.value))}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
      />
    </label>
  );
}

function ListFieldEditor({
  label,
  values,
  addPlaceholder,
  textModePlaceholder,
  emptyText,
  helperText,
  mode,
  inputValue,
  onInputChange,
  onChange,
  onToggleMode,
}: ListFieldEditorProps) {
  const canAdd = inputValue.trim().length > 0;

  function handleAddItem() {
    const nextValue = inputValue.trim();

    if (!nextValue) {
      return;
    }

    onChange([...values, nextValue]);
    onInputChange('');
  }

  function handleRemoveItem(index: number) {
    onChange(values.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-neutral-200">{label}</span>
        <button
          type="button"
          onClick={onToggleMode}
          className="text-xs text-neutral-500 transition hover:text-neutral-300"
        >
          {mode === 'text' ? '切换为卡片编辑' : '切换为文本编辑'}
        </button>
      </div>

      {helperText ? <p className="text-xs leading-6 text-neutral-500">{helperText}</p> : null}

      {mode === 'text' ? (
        <textarea
          value={joinMultilineList(values)}
          onChange={(event) => onChange(parseMultilineList(event.target.value))}
          rows={5}
          placeholder={textModePlaceholder}
          className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
        />
      ) : (
        <>
          {values.length > 0 ? (
            <div className="space-y-3">
              {values.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200">
                      {item}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-neutral-700 text-neutral-400 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-200"
                      aria-label={`删除${label}条目 ${index + 1}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 px-4 py-4 text-sm text-neutral-500">
              {emptyText}
            </div>
          )}

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <textarea
                value={inputValue}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleAddItem();
                  }
                }}
                rows={2}
                placeholder={addPlaceholder}
                className="min-h-[72px] flex-1 rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 py-3 text-sm leading-6 text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
              />
              <button
                type="button"
                onClick={handleAddItem}
                disabled={!canAdd}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={15} />
                添加
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StructureMemorySummaryCard({
  label,
  detail,
  count,
  attentionCount = 0,
  icon: Icon,
  onOpen,
}: StructureMemorySummaryCardProps) {
  return (
    <article className="rounded-3xl border border-neutral-800 bg-neutral-950/50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-200">
            <Icon size={18} />
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-100">{label}</p>
            <p className="mt-1 text-xs text-neutral-500">{detail}</p>
          </div>
        </div>
        <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300">
          {count} 条
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {attentionCount > 0 ? (
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-amber-100">
              提醒 {attentionCount}
            </span>
          ) : (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-100">
              当前无提醒
            </span>
          )}
        </div>

        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-800"
          >
            去结构记忆处理
            <ArrowRight size={15} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function OutlineView({
  projectId,
  projectTitle,
  projectDescription,
  genre,
  focusVolumeId = null,
  onOpenStructureMemory,
  className,
}: OutlineViewProps) {
  const { toast } = useToast();
  const settings = useSettingsStore((state) => state.settings);
  const currentProject = useProjectStore((state) => state.projects.find((project) => project.id === projectId) ?? null);
  const chapters = useEditorStore((state) => state.chapters);
  const activeChapterId = useEditorStore((state) => state.activeChapterId);
  const setActiveChapter = useEditorStore((state) => state.setActiveChapter);
  const createChapter = useEditorStore((state) => state.createChapter);
  const updateChapterTitle = useEditorStore((state) => state.updateChapterTitle);
  const volumes = useVolumeStore((state) => state.volumes);
  const loadVolumes = useVolumeStore((state) => state.loadVolumes);
  const chapterBeats = useChapterBeatStore((state) => state.chapterBeats);
  const entities = useLoreStore((state) => state.entities);
  const foreshadows = useForeshadowStore((state) => state.foreshadows);
  const threadLedgers = useThreadLedgerStore((state) => state.threadLedgers);
  const threadAlerts = useThreadLedgerStore((state) => state.alerts);
  const foreshadowPlans = useForeshadowPlanStore((state) => state.foreshadowPlans);
  const foreshadowAlerts = useForeshadowPlanStore((state) => state.alerts);
  const foreshadowPlanLoadedProjectId = useForeshadowPlanStore((state) => state.loadedProjectId);
  const loadForeshadowPlans = useForeshadowPlanStore((state) => state.loadForeshadowPlans);
  const worldStateEntries = useWorldStateStore((state) => state.worldStateEntries);
  const questionPools = useQuestionPoolStore((state) => state.questionPools);
  const questionAlerts = useQuestionPoolStore((state) => state.alerts);
  const questionPoolLoadedProjectId = useQuestionPoolStore((state) => state.loadedProjectId);
  const loadQuestionPools = useQuestionPoolStore((state) => state.loadQuestionPools);
  const antagonistAgendas = useAntagonistAgendaStore((state) => state.antagonistAgendas);
  const povPermissions = usePovPermissionStore((state) => state.povPermissions);
  const resourceContinuities = useResourceContinuityStore((state) => state.resourceContinuities);
  const loadChapterBeats = useChapterBeatStore((state) => state.loadChapterBeats);
  const saveChapterBeat = useChapterBeatStore((state) => state.saveChapterBeat);
  const saveVolumeChapterBeats = useChapterBeatStore((state) => state.saveVolumeChapterBeats);
  const replaceVolumeChapterBeatsInRange = useChapterBeatStore(
    (state) => state.replaceVolumeChapterBeatsInRange,
  );
  const moveChapterBeat = useChapterBeatStore((state) => state.moveChapterBeat);
  const deleteChapterBeat = useChapterBeatStore((state) => state.deleteChapterBeat);

  const bookOutline = useOutlineStore((state) => state.bookOutline);
  const volumeOutlines = useOutlineStore((state) => state.volumeOutlines);
  const loadOutlines = useOutlineStore((state) => state.loadOutlines);
  const saveBookOutline = useOutlineStore((state) => state.saveBookOutline);
  const saveVolumeOutline = useOutlineStore((state) => state.saveVolumeOutline);
  const updateVolume = useVolumeStore((state) => state.updateVolume);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSavingBook, setIsSavingBook] = useState(false);
  const [isGeneratingBook, setIsGeneratingBook] = useState(false);
  const [savingVolumeId, setSavingVolumeId] = useState<Id | null>(null);
  const [generatingVolumeId, setGeneratingVolumeId] = useState<Id | null>(null);
  const [generatingMilestonesVolumeId, setGeneratingMilestonesVolumeId] = useState<Id | null>(null);
  const [savingBeatKey, setSavingBeatKey] = useState<string | null>(null);
  const [generatingBeatVolumeId, setGeneratingBeatVolumeId] = useState<Id | null>(null);
  const [outlineMode, setOutlineMode] = useState<OutlineWorkspaceMode>(focusVolumeId ? 'beats' : 'volume');
  const [showStructureMemoryOverview, setShowStructureMemoryOverview] = useState(false);
  const [expandedVolumeId, setExpandedVolumeId] = useState<Id | null>(null);
  const [bookHint, setBookHint] = useState('');
  const [bookDraft, setBookDraft] = useState<BookOutlineFields>(createEmptyBookDraft());
  const [outlineSummaryDialog, setOutlineSummaryDialog] = useState<OutlineSummaryDialogState>(null);
  const [volumeDraftMap, setVolumeDraftMap] = useState<Record<string, VolumeOutlineFields>>({});
  const [chapterBeatDraftMap, setChapterBeatDraftMap] = useState<Record<string, ChapterBeatFields>>({});
  const [chapterOutlines, setChapterOutlines] = useState<ChapterOutline[]>([]);
  const [chapterOutlineDraftMap, setChapterOutlineDraftMap] = useState<Record<string, ReturnType<typeof createEmptyChapterOutlineDraft>>>({});
  const [volumeHintMap, setVolumeHintMap] = useState<Record<string, string>>({});
  const [beatHintMap, setBeatHintMap] = useState<Record<string, string>>({});
  const [beatChapterCountMap, setBeatChapterCountMap] = useState<Record<string, string>>({});
  const [selectedMilestoneIndexMap, setSelectedMilestoneIndexMap] = useState<Record<string, number | null>>({});
  const [selectedBeatRowKeyMap, setSelectedBeatRowKeyMap] = useState<Record<string, string | null>>({});
  const [selectedOutlineChapterIdMap, setSelectedOutlineChapterIdMap] = useState<Record<string, Id | null>>({});
  const [beatFilterStatus, setBeatFilterStatus] = useState<BeatFilterStatus>('all');
  const [chapterJumpValue, setChapterJumpValue] = useState('');
  const [chapterSummaryChapterIds, setChapterSummaryChapterIds] = useState<Set<Id>>(new Set());
  const [openVolumeMenuId, setOpenVolumeMenuId] = useState<Id | null>(null);
  const [fissionDialogVolumeId, setFissionDialogVolumeId] = useState<Id | null>(null);
  const [fissionDialogMode, setFissionDialogMode] = useState<FissionDialogMode>('volume');
  const [fissionDialogMilestoneIndex, setFissionDialogMilestoneIndex] = useState<number | null>(null);
  const [fissionDialogChapterCount, setFissionDialogChapterCount] = useState('');
  const [fissionDialogBatchCount, setFissionDialogBatchCount] = useState('');
  const [fissionDialogOverwriteTitles, setFissionDialogOverwriteTitles] = useState(false);
  const [listFieldModes, setListFieldModes] = useState<Record<string, 'cards' | 'text'>>({});
  const [listFieldInputs, setListFieldInputs] = useState<Record<string, string>>({});
  const [reconcilingVolumeId, setReconcilingVolumeId] = useState<Id | null>(null);
  const [volumePlanReconcilePreview, setVolumePlanReconcilePreview] = useState<VolumePlanReconcilePreview | null>(null);
  const [savingOutlineChapterId, setSavingOutlineChapterId] = useState<Id | null>(null);

  function buildTemplateHint(...sections: Array<string | null | undefined>) {
    return mergePromptSections(...sections);
  }

  const volumeCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const volumeMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const beatRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImportTargetRef = useRef<OutlineImportTarget | null>(null);

  const sortedVolumes = useMemo(
    () => [...volumes].sort((left, right) => left.order - right.order),
    [volumes],
  );
  const activeStructureVolume = useMemo(
    () =>
      sortedVolumes.find((volume) => volume.id === expandedVolumeId) ??
      sortedVolumes.find((volume) => volume.id === focusVolumeId) ??
      sortedVolumes[0] ??
      null,
    [expandedVolumeId, focusVolumeId, sortedVolumes],
  );
  const volumeOutlineById = useMemo(
    () => new Map(volumeOutlines.map((outline) => [outline.volumeId, outline] as const)),
    [volumeOutlines],
  );
  const chaptersByVolumeId = useMemo(() => {
    const next = new Map<Id, typeof chapters>();

    for (const volume of sortedVolumes) {
      next.set(
        volume.id,
        chapters
          .filter((chapter) => chapter.volumeId === volume.id)
          .sort((left, right) => left.order - right.order),
      );
    }

    return next;
  }, [chapters, sortedVolumes]);
  const chapterBeatRowsByVolumeId = useMemo(() => {
    const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter] as const));
    const next = new Map<Id, ChapterBeatRowModel[]>();

    for (const volume of sortedVolumes) {
      const volumeChapters = chaptersByVolumeId.get(volume.id) ?? [];
      const volumeBeats = chapterBeats
        .filter((beat) => beat.volumeId === volume.id)
        .sort((left, right) => left.orderInVolume - right.orderInVolume);
      const beatByOrder = new Map(
        volumeBeats.map((beat) => [beat.orderInVolume, beat] as const),
      );
      const maxOrder = Math.max(
        volumeChapters.length,
        volumeBeats.reduce((current, beat) => Math.max(current, beat.orderInVolume), 0),
      );
      const rows: ChapterBeatRowModel[] = [];

      for (let order = 1; order <= maxOrder; order += 1) {
        const beat = beatByOrder.get(order) ?? null;
        const chapter = beat?.chapterId
          ? chapterById.get(beat.chapterId) ?? null
          : volumeChapters[order - 1] ?? null;

        rows.push({
          key: beat?.id ?? `volume:${volume.id}:slot:${chapter?.id ?? order}`,
          beatId: beat?.id,
          volumeId: volume.id,
          chapterId: beat?.chapterId ?? chapter?.id,
          chapterLabel: chapter?.title ?? '未绑定章节',
          chapterNumber: order,
          displayChapterNumber: chapter?.order ?? null,
          beat,
        });
      }

      next.set(volume.id, rows);
    }

    return next;
  }, [chapterBeats, chapters, chaptersByVolumeId, sortedVolumes]);
  const structureMemorySummaries = useMemo(() => {
    const activeVolumeOrder = activeStructureVolume?.order ?? null;
    const activeVolumeId = activeStructureVolume?.id ?? null;
    const activeVolumeTitle = activeStructureVolume?.title ?? '当前卷';

    const projectThreadLedgers = threadLedgers.filter((item) => item.projectId === projectId);
    const projectForeshadowPlans = foreshadowPlans.filter((item) => item.projectId === projectId);
    const projectWorldStateEntries = worldStateEntries.filter((item) => item.projectId === projectId);
    const projectQuestionPools = questionPools.filter((item) => item.projectId === projectId);
    const projectAntagonistAgendas = antagonistAgendas.filter((item) => item.projectId === projectId);
    const projectPovPermissions = povPermissions.filter((item) => item.projectId === projectId);
    const projectResourceContinuities = resourceContinuities.filter((item) => item.projectId === projectId);

    const hotThreadCount = projectThreadLedgers.filter(
      (item) => item.status !== 'resolved' && item.audienceHeat >= 3,
    ).length;
    const dormantThreadCount = projectThreadLedgers.filter(
      (item) => item.status === 'dormant' && item.audienceHeat >= 3,
    ).length;
    const currentVolumeForeshadowCount =
      activeVolumeOrder === null
        ? 0
        : projectForeshadowPlans.filter(
            (item) =>
              item.plannedActivateVolume === activeVolumeOrder ||
              item.plannedResolveVolume === activeVolumeOrder,
          ).length;
    const currentVolumeWorldStateEntries = projectWorldStateEntries.filter(
      (item) => item.volumeId === activeVolumeId,
    );
    const currentVolumeQuestionCount =
      activeVolumeOrder === null
        ? 0
        : projectQuestionPools.filter(
            (item) =>
              item.status !== 'answered' &&
              (() => {
                const parsedVolumeOrder = parseExpectedVolumeOrderHint(item.expectedRevealWindow);
                if (parsedVolumeOrder !== null) {
                  return parsedVolumeOrder <= activeVolumeOrder;
                }
                return item.expectedRevealWindow.includes(`第${activeVolumeOrder}卷`);
              })(),
          ).length;
    const activeAgendaCount = projectAntagonistAgendas.filter((item) => item.status === 'active').length;
    const currentVolumePermissionCount = projectPovPermissions.filter(
      (item) => item.volumeId === null || item.volumeId === activeVolumeId,
    ).length;
    const activeResourceCount = projectResourceContinuities.filter((item) => item.status === 'active').length;
    const highRiskResourceCount = projectResourceContinuities.filter(
      (item) => item.status === 'active' && (item.riskLevel === 'critical' || item.riskLevel === 'high'),
    ).length;

    return [
      {
        key: 'thread-ledger' as const,
        label: '剧情线账本',
        icon: GitBranch,
        count: projectThreadLedgers.length,
        attentionCount: threadAlerts.length,
        detail:
          hotThreadCount > 0
            ? `${hotThreadCount} 条高热未收束剧情线，${dormantThreadCount} 条处于休眠待捡回`
            : '当前没有高热剧情线提醒',
      },
      {
        key: 'foreshadow-plan' as const,
        label: '伏笔规划',
        icon: Sparkles,
        count: projectForeshadowPlans.length,
        attentionCount: foreshadowAlerts.length,
        detail:
          activeVolumeOrder === null
            ? '进入卷纲后可查看本卷激活 / 回收窗口'
            : `${activeVolumeTitle} 有 ${currentVolumeForeshadowCount} 条直接相关的伏笔规划`,
      },
      {
        key: 'world-state' as const,
        label: '世界状态',
        icon: Globe2,
        count: projectWorldStateEntries.length,
        attentionCount: 0,
        detail:
          activeVolumeId === null
            ? '优先维护卷级默认状态与关键里程碑变化'
            : `${activeVolumeTitle} 已维护 ${currentVolumeWorldStateEntries.length} 条世界状态，其中 ${currentVolumeWorldStateEntries.filter((item) => typeof item.milestoneIndex === 'number').length} 条是里程碑级`,
      },
      {
        key: 'question-pool' as const,
        label: '未解问题',
        icon: Compass,
        count: projectQuestionPools.length,
        attentionCount: questionAlerts.length,
        detail:
          activeVolumeOrder === null
            ? `${projectQuestionPools.filter((item) => item.status !== 'answered').length} 条问题仍未回答`
            : `${currentVolumeQuestionCount} 条问题与 ${activeVolumeTitle} 窗口直接相关`,
      },
      {
        key: 'antagonist-agenda' as const,
        label: '反派议程',
        icon: CircleAlert,
        count: projectAntagonistAgendas.length,
        attentionCount: 0,
        detail: `${activeAgendaCount} 条活跃议程，建议在正文前确认触发条件与当前动作`,
      },
      {
        key: 'pov-permission' as const,
        label: '信息权限',
        icon: Shield,
        count: projectPovPermissions.length,
        attentionCount: 0,
        detail:
          activeVolumeId === null
            ? '统一维护卷级、章节级的信息限制与可暗示范围'
            : `${currentVolumePermissionCount} 条当前卷 / 全局权限规则正在生效`,
      },
      {
        key: 'resource-continuity' as const,
        label: '资源连续性',
        icon: KeyRound,
        count: projectResourceContinuities.length,
        attentionCount: 0,
        detail: `${activeResourceCount} 条 active 约束，${highRiskResourceCount} 条处于高风险状态`,
      },
    ];
  }, [
    activeStructureVolume,
    antagonistAgendas,
    foreshadowAlerts.length,
    foreshadowPlans,
    povPermissions,
    projectId,
    questionAlerts.length,
    questionPools,
    resourceContinuities,
    threadAlerts.length,
    threadLedgers,
    worldStateEntries,
  ]);
  const milestoneStatusMapByVolumeId = useMemo(() => {
    const next = new Map<Id, MilestoneProgressStatus[]>();

    for (const volume of sortedVolumes) {
      const draft = volumeDraftMap[volume.id] ?? createEmptyVolumeDraft();
      const rows = chapterBeatRowsByVolumeId.get(volume.id) ?? [];
      const volumeChapterIds = new Set(
        (chaptersByVolumeId.get(volume.id) ?? []).map((chapter) => chapter.id),
      );

      const statuses = draft.milestones.map((_, milestoneIndex) => {
        const startChapterNumber = computeMilestoneStartChapter(draft.milestones, milestoneIndex);
        const endChapterNumber = computeMilestoneEndChapter(draft.milestones, milestoneIndex);
        const rowsInRange = rows.filter(
          (row) => row.chapterNumber >= startChapterNumber && row.chapterNumber <= endChapterNumber,
        );
        const hasPlannedBeat = rowsInRange.some(
          (row) =>
            row.beat !== null &&
            (row.beat.milestoneIndex === milestoneIndex || typeof row.beat.milestoneIndex === 'undefined'),
        );
        const hasProgressedChapter = rowsInRange.some(
          (row) =>
            row.chapterId &&
            volumeChapterIds.has(row.chapterId) &&
            chapterSummaryChapterIds.has(row.chapterId),
        );

        if (hasProgressedChapter) {
          return 'progressed';
        }

        return hasPlannedBeat ? 'planned' : 'empty';
      });

      next.set(volume.id, statuses);
    }

    return next;
  }, [chapterBeatRowsByVolumeId, chapterSummaryChapterIds, chaptersByVolumeId, sortedVolumes, volumeDraftMap]);
  const isBookGuideVisible = useMemo(() => isBookDraftEmpty(bookDraft), [bookDraft]);
  const hasVolumes = sortedVolumes.length > 0;
  const activeVolume = activeStructureVolume;
  const activeVolumeDraft = useMemo(
    () => (activeVolume ? volumeDraftMap[activeVolume.id] ?? createEmptyVolumeDraft() : createEmptyVolumeDraft()),
    [activeVolume, volumeDraftMap],
  );
  const activeVolumeChapters = useMemo(
    () => (activeVolume ? chaptersByVolumeId.get(activeVolume.id) ?? [] : []),
    [activeVolume, chaptersByVolumeId],
  );
  const activeVolumeBeatRows = useMemo(
    () => (activeVolume ? chapterBeatRowsByVolumeId.get(activeVolume.id) ?? [] : []),
    [activeVolume, chapterBeatRowsByVolumeId],
  );
  const activeSelectedMilestoneIndex = useMemo(() => {
    if (!activeVolume) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(selectedMilestoneIndexMap, activeVolume.id)) {
      return selectedMilestoneIndexMap[activeVolume.id];
    }

    return null;
  }, [activeVolume, selectedMilestoneIndexMap]);
  const chapterOutlineByChapterId = useMemo(
    () => new Map(chapterOutlines.map((outline) => [outline.chapterId, outline] as const)),
    [chapterOutlines],
  );
  const activeVolumeOutlineRows = useMemo(
    () =>
      activeVolumeChapters
        .map((chapter, index): ChapterOutlineRowModel => {
          const chapterNumber = index + 1;
          const milestoneIndex = getMilestoneIndexForChapterNumber(activeVolumeDraft.milestones, chapterNumber);

          return {
            chapterId: chapter.id,
            volumeId: chapter.volumeId as Id,
            chapterTitle: chapter.title,
            chapterNumber,
            milestoneIndex: typeof milestoneIndex === 'number' ? milestoneIndex : null,
            outline: chapterOutlineByChapterId.get(chapter.id) ?? null,
          };
        })
        .filter((row) =>
          typeof activeSelectedMilestoneIndex === 'number'
            ? row.milestoneIndex === activeSelectedMilestoneIndex
            : true,
        ),
    [activeSelectedMilestoneIndex, activeVolumeChapters, activeVolumeDraft.milestones, chapterOutlineByChapterId],
  );
  const activeMilestoneStatuses = useMemo(
    () => (activeVolume ? milestoneStatusMapByVolumeId.get(activeVolume.id) ?? [] : []),
    [activeVolume, milestoneStatusMapByVolumeId],
  );
  const activeFilteredMilestone =
    typeof activeSelectedMilestoneIndex === 'number'
      ? activeVolumeDraft.milestones[activeSelectedMilestoneIndex] ?? null
      : null;
  const activeVolumeDefaultChapterCount =
    activeVolumeDraft.estimatedChapterCount > 0
      ? activeVolumeDraft.estimatedChapterCount
      : activeVolumeDraft.milestones.reduce((sum, milestone) => sum + Math.max(0, milestone.targetChapterCount), 0) || 12;
  const activeVolumeBeatRowsWithMeta = useMemo(
    () =>
      activeVolumeBeatRows.map((row, rowIndex, rows) => {
        const draft = chapterBeatDraftMap[row.key] ?? createEmptyChapterBeatDraft(row.chapterNumber);
        const milestoneIndex =
          row.beat?.milestoneIndex ?? getMilestoneIndexForChapterNumber(activeVolumeDraft.milestones, row.chapterNumber);
        const milestone =
          typeof milestoneIndex === 'number' ? activeVolumeDraft.milestones[milestoneIndex] ?? null : null;
        const status = getChapterBeatProgressStatus({
          beat: row.beat,
          chapterId: row.chapterId,
          chapterSummaryChapterIds,
        });
        const previousMilestoneIndex =
          rowIndex > 0
            ? rows[rowIndex - 1]?.beat?.milestoneIndex ??
              getMilestoneIndexForChapterNumber(
                activeVolumeDraft.milestones,
                rows[rowIndex - 1]?.chapterNumber ?? 0,
              )
            : undefined;

        return {
          row,
          rowIndex,
          rowCount: rows.length,
          draft,
          milestoneIndex,
          milestone,
          status,
          isMilestoneStart:
            typeof milestoneIndex === 'number' && milestoneIndex !== previousMilestoneIndex,
        };
      }),
    [activeVolumeBeatRows, activeVolumeDraft.milestones, chapterBeatDraftMap, chapterSummaryChapterIds],
  );
  const filteredBeatRows = useMemo(
    () =>
      activeVolumeBeatRowsWithMeta.filter((item) => {
        if (
          typeof activeSelectedMilestoneIndex === 'number' &&
          item.milestoneIndex !== activeSelectedMilestoneIndex
        ) {
          return false;
        }

        if (beatFilterStatus !== 'all' && item.status !== beatFilterStatus) {
          return false;
        }

        return true;
      }),
    [activeSelectedMilestoneIndex, activeVolumeBeatRowsWithMeta, beatFilterStatus],
  );
  const selectedBeatRowKey = activeVolume ? selectedBeatRowKeyMap[activeVolume.id] ?? null : null;
  const selectedBeatRow = useMemo(() => {
    const fromFiltered =
      selectedBeatRowKey === null ? null : filteredBeatRows.find((item) => item.row.key === selectedBeatRowKey) ?? null;

    if (fromFiltered) {
      return fromFiltered;
    }

    const fromAll =
      selectedBeatRowKey === null
        ? null
        : activeVolumeBeatRowsWithMeta.find((item) => item.row.key === selectedBeatRowKey) ?? null;

    return fromAll ?? filteredBeatRows[0] ?? activeVolumeBeatRowsWithMeta[0] ?? null;
  }, [activeVolumeBeatRowsWithMeta, filteredBeatRows, selectedBeatRowKey]);
  const beatStatusCounts = useMemo(() => {
    return activeVolumeBeatRowsWithMeta.reduce(
      (totals, item) => {
        totals.all += 1;
        totals[item.status] += 1;
        return totals;
      },
      {
        all: 0,
        empty: 0,
        planned: 0,
        progressed: 0,
      } satisfies Record<BeatFilterStatus, number>,
    );
  }, [activeVolumeBeatRowsWithMeta]);
  const showBeatInspector = outlineMode === 'beats';
  const selectedOutlineChapterId = activeVolume ? selectedOutlineChapterIdMap[activeVolume.id] ?? null : null;
  const selectedOutlineRow = useMemo(() => {
    if (activeVolumeOutlineRows.length === 0) {
      return null;
    }

    return (
      activeVolumeOutlineRows.find((item) => item.chapterId === selectedOutlineChapterId) ??
      activeVolumeOutlineRows[0]
    );
  }, [activeVolumeOutlineRows, selectedOutlineChapterId]);
  const selectedOutlineDraft = useMemo(
    () =>
      selectedOutlineRow
        ? chapterOutlineDraftMap[selectedOutlineRow.chapterId] ?? createEmptyChapterOutlineDraft()
        : null,
    [chapterOutlineDraftMap, selectedOutlineRow],
  );
  const volumeSummaryItems = useMemo(
    () =>
      sortedVolumes.map((volume) => {
        const draft = volumeDraftMap[volume.id] ?? createEmptyVolumeDraft();
        const volumeRows = chapterBeatRowsByVolumeId.get(volume.id) ?? [];

        return {
          id: volume.id,
          order: volume.order,
          title: volume.title,
          progressLabel: getVolumeProgressLabel(draft),
          chapterCount: (chaptersByVolumeId.get(volume.id) ?? []).length,
          beatCount: volumeRows.filter((row) => row.beat !== null).length,
          milestoneCount: draft.milestones.length,
          selected: activeVolume?.id === volume.id,
        };
      }),
    [activeVolume?.id, chapterBeatRowsByVolumeId, chaptersByVolumeId, sortedVolumes, volumeDraftMap],
  );
  const milestoneSummaryItems = useMemo(
    () =>
      activeVolumeDraft.milestones.map((milestone, milestoneIndex) => ({
        index: milestoneIndex,
        title: milestone.title,
        targetChapterCount: milestone.targetChapterCount,
        startChapterNumber: computeMilestoneStartChapter(activeVolumeDraft.milestones, milestoneIndex),
        endChapterNumber: computeMilestoneEndChapter(activeVolumeDraft.milestones, milestoneIndex),
        status: activeMilestoneStatuses[milestoneIndex] ?? 'empty',
        selected: activeSelectedMilestoneIndex === milestoneIndex,
      })),
    [activeMilestoneStatuses, activeSelectedMilestoneIndex, activeVolumeDraft.milestones],
  );

  function openBookSummaryDialog() {
    setOutlineSummaryDialog({
      title: '全书摘要',
      summary: bookDraft.summary?.trim() || '当前还没有模型摘要，请先保存全书大纲。',
      description: '这份摘要会在保存或导入全书大纲时由模型生成并固化，正文生成只读取这份摘要，不再塞完整书纲。',
    });
  }

  function openVolumeSummaryDialog(volumeId: Id) {
    const volume = sortedVolumes.find((item) => item.id === volumeId) ?? null;
    const draft = volumeDraftMap[volumeId] ?? volumeOutlineById.get(volumeId) ?? createEmptyVolumeDraft();

    setOutlineSummaryDialog({
      title: volume ? `《${volume.title}》卷摘要` : '当前卷摘要',
      summary: draft.summary?.trim() || '当前还没有模型摘要，请先保存当前卷纲。',
      description: '这份摘要会在保存或导入卷纲时由模型生成并固化，章节生成只读取这份卷级摘要。',
    });
  }

  function openMilestoneSummaryDialog(milestoneIndex: number) {
    const milestone = activeVolumeDraft.milestones[milestoneIndex] ?? null;

    if (!milestone) {
      toast('未找到目标阶段摘要', 'warning');
      return;
    }

    setOutlineSummaryDialog({
      title: milestone.title.trim()
        ? `阶段 ${milestoneIndex + 1} · ${milestone.title.trim()}`
        : `阶段 ${milestoneIndex + 1} 摘要`,
      summary: milestone.summary?.trim() || '当前还没有模型摘要，请先保存当前卷纲。',
      description: '这份摘要会在保存卷纲或导入里程碑时由模型生成并固化，章节生成只读取当前阶段摘要，不再整段灌入阶段结构。',
    });
  }

  async function resolveBookOutlineWithSummary(fields: BookOutlineFields) {
    const result = await resolveBookOutlineWithAiSummary({
      serverUrl: settings.serverUrl,
      modelConfig: buildModelRequestConfig(settings),
      projectTitle,
      projectDescription,
      genre,
      fields,
    });

    if (result.usedFallback) {
      toast(`模型摘要失败，已回退本地摘要：${result.errorMessage || '未知错误'}`, 'warning');
    }

    return result.fields;
  }

  async function resolveVolumeOutlineWithSummary(volumeId: Id, fields: VolumeOutlineFields) {
    const volume = sortedVolumes.find((item) => item.id === volumeId) ?? null;

    if (!volume) {
      return {
        ...fields,
        summary: buildVolumeOutlineSummary(fields),
        milestones: fields.milestones.map((milestone, index) => ({
          ...milestone,
          summary: buildVolumeMilestoneSummary(milestone, index),
        })),
      } satisfies VolumeOutlineFields;
    }

    const result = await resolveVolumeOutlineWithAiSummary({
      serverUrl: settings.serverUrl,
      modelConfig: buildModelRequestConfig(settings),
      projectTitle,
      projectDescription,
      volumeTitle: volume.title,
      volumeOrder: volume.order,
      bookOutlineSummary: buildBookOutlineSummary(bookDraft),
      fields,
    });

    if (result.usedFallback) {
      toast(`卷级模型摘要失败，已回退本地摘要：${result.errorMessage || '未知错误'}`, 'warning');
    }

    return result.fields;
  }

  const chapterBeatListItems = useMemo(
    () =>
      filteredBeatRows.map((item) => ({
        key: item.row.key,
        chapterNumber: item.row.chapterNumber,
        displayChapterNumber: item.row.displayChapterNumber,
        chapterLabel: item.row.chapterLabel,
        focusCharacter: item.draft.focusCharacter,
        mainPlot: item.draft.mainPlot,
        hookOut: item.draft.hookOut,
        milestoneLabel:
          typeof item.milestoneIndex === 'number'
            ? `阶段 ${item.milestoneIndex + 1}${item.milestone?.title?.trim() ? ` · ${item.milestone.title.trim()}` : ''}`
            : '',
        status: item.status,
        selected: selectedBeatRow?.row.key === item.row.key,
        isBoundChapter: Boolean(item.row.chapterId),
      })),
    [filteredBeatRows, selectedBeatRow],
  );

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setIsBootstrapping(true);
      try {
        await Promise.all([
          loadVolumes(projectId),
          loadOutlines(projectId),
          loadChapterBeats(projectId),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        toast(`加载大纲数据失败：${message}`, 'error');
      } finally {
        if (mounted) {
          setIsBootstrapping(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadChapterBeats, loadOutlines, loadVolumes, projectId, toast]);

  useEffect(() => {
    if (!bookOutline) {
      setBookDraft(createEmptyBookDraft());
      return;
    }

    setBookDraft({
      premise: bookOutline.premise,
      centralConflict: bookOutline.centralConflict,
      protagonistArc: bookOutline.protagonistArc,
      thematicCore: bookOutline.thematicCore,
      subPlots: [...bookOutline.subPlots],
      characterArcs: bookOutline.characterArcs.map((item) => ({ ...item })),
      powerSystem: bookOutline.powerSystem,
      antagonistSystem: bookOutline.antagonistSystem,
      narrativeArc: bookOutline.narrativeArc,
      logline: bookOutline.logline,
      worldRules: [...bookOutline.worldRules],
      endgameHint: bookOutline.endgameHint,
      toneGuide: bookOutline.toneGuide,
      summary: bookOutline.summary ?? '',
    });
  }, [bookOutline?.id, bookOutline?.updatedAt]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const summaries = await db.chapterSummaries.where('projectId').equals(projectId).toArray();

      if (!mounted) {
        return;
      }

      setChapterSummaryChapterIds(new Set(summaries.map((summary) => summary.chapterId)));
    })();

    return () => {
      mounted = false;
    };
  }, [projectId, chapters.length, chapterBeats.length]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const outlines = await db.chapterOutlines.where('projectId').equals(projectId).toArray();

      if (!mounted) {
        return;
      }

      setChapterOutlines(outlines);
    })();

    return () => {
      mounted = false;
    };
  }, [projectId, chapters.length]);

  useEffect(() => {
    setVolumeDraftMap((previous) => {
      const next: Record<string, VolumeOutlineFields> = {};

      for (const volume of sortedVolumes) {
        const persisted = volumeOutlineById.get(volume.id);
        next[volume.id] = persisted
          ? {
              goal: persisted.goal,
              keyConflict: persisted.keyConflict,
              arcSummary: persisted.arcSummary,
              entryState: persisted.entryState,
              exitState: persisted.exitState,
              antagonist: persisted.antagonist,
              subPlot: persisted.subPlot,
              inheritedThreads: persisted.inheritedThreads.map((item) => ({ ...item })),
              protagonistGrowth: persisted.protagonistGrowth,
              emotionalArc: persisted.emotionalArc,
              estimatedWordCount: persisted.estimatedWordCount,
              povPlan: persisted.povPlan,
              keyEvents: [...persisted.keyEvents],
              foreshadowSeeds: [...persisted.foreshadowSeeds],
              requiredEntities: [...(persisted.requiredEntities ?? [])],
              requiredForeshadows: [...(persisted.requiredForeshadows ?? [])],
              requiredForeshadowIds: [...(persisted.requiredForeshadowIds ?? [])],
              foreshadowRefs: normalizeForeshadowRefs(persisted.foreshadowRefs),
              estimatedChapterCount: persisted.estimatedChapterCount,
              milestones: persisted.milestones.map((milestone) => ({
                ...milestone,
                phasePacing: milestone.phasePacing,
                phaseEmotionShift: milestone.phaseEmotionShift,
                phasePOV: milestone.phasePOV,
                keyTurns: [...milestone.keyTurns],
                mustPlant: [...milestone.mustPlant],
                mustPayoff: [...milestone.mustPayoff],
                requiredEntities: [...(milestone.requiredEntities ?? [])],
                requiredForeshadows: [...(milestone.requiredForeshadows ?? [])],
                requiredForeshadowIds: [...(milestone.requiredForeshadowIds ?? [])],
                foreshadowRefs: normalizeForeshadowRefs(milestone.foreshadowRefs),
                summary: milestone.summary ?? '',
              })),
              summary: persisted.summary ?? '',
            }
          : previous[volume.id] ?? createEmptyVolumeDraft();
      }

      return next;
    });
  }, [sortedVolumes, volumeOutlineById]);

  useEffect(() => {
    setChapterBeatDraftMap((previous) => {
      const next: Record<string, ChapterBeatFields> = {};

      for (const rows of chapterBeatRowsByVolumeId.values()) {
        for (const row of rows) {
          next[row.key] = row.beat
            ? extractChapterBeatDraft(row.beat)
            : previous[row.key] ?? createEmptyChapterBeatDraft(row.chapterNumber);
        }
      }

      return next;
    });
  }, [chapterBeatRowsByVolumeId]);

  useEffect(() => {
    setChapterOutlineDraftMap((previous) => {
      const next = { ...previous };
      const outlineByChapterId = new Map(chapterOutlines.map((outline) => [outline.chapterId, outline] as const));

      for (const chapter of chapters) {
        const persisted = outlineByChapterId.get(chapter.id);
        next[chapter.id] = persisted
          ? createChapterOutlineDraft(persisted)
          : previous[chapter.id] ?? createEmptyChapterOutlineDraft();
      }

      return next;
    });
  }, [chapterOutlines, chapters]);

  useEffect(() => {
    setSelectedMilestoneIndexMap((previous) => {
      const next = { ...previous };

      for (const volume of sortedVolumes) {
        const milestones = (volumeDraftMap[volume.id] ?? createEmptyVolumeDraft()).milestones;
        const currentSelected = previous[volume.id];
        const hasStoredSelection = Object.prototype.hasOwnProperty.call(previous, volume.id);

        if (milestones.length === 0) {
          next[volume.id] = null;
          continue;
        }

        if (!hasStoredSelection) {
          next[volume.id] = null;
          continue;
        }

        if (
          currentSelected !== null &&
          typeof currentSelected !== 'number' ||
          (typeof currentSelected === 'number' &&
            (!Number.isFinite(currentSelected) ||
              currentSelected < 0 ||
              currentSelected >= milestones.length))
        ) {
          next[volume.id] = null;
        }
      }

      return next;
    });
  }, [sortedVolumes, volumeDraftMap]);

  useEffect(() => {
    if (!focusVolumeId) {
      return;
    }

    setExpandedVolumeId(focusVolumeId);
    setOutlineMode('beats');
    const timer = window.setTimeout(() => {
      const target = volumeCardRefs.current[focusVolumeId];

      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, [focusVolumeId, sortedVolumes.length]);

  useEffect(() => {
    if (hasVolumes) {
      return;
    }

    setOutlineMode('book');
  }, [hasVolumes]);

  useEffect(() => {
    if (!fissionDialogVolumeId) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeFissionDialog();
      }
    }

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [fissionDialogVolumeId]);

  useEffect(() => {
    if (!activeVolume) {
      return;
    }

    setSelectedBeatRowKeyMap((previous) => {
      const currentSelected = previous[activeVolume.id] ?? null;

      if (filteredBeatRows.length === 0) {
        if (currentSelected === null) {
          return previous;
        }

        return {
          ...previous,
          [activeVolume.id]: null,
        };
      }

      if (currentSelected && filteredBeatRows.some((item) => item.row.key === currentSelected)) {
        return previous;
      }

      return {
        ...previous,
        [activeVolume.id]: filteredBeatRows[0]?.row.key ?? null,
      };
    });
  }, [activeVolume, filteredBeatRows]);

  function setListFieldMode(fieldKey: string, nextMode: 'cards' | 'text') {
    setListFieldModes((previous) => ({
      ...previous,
      [fieldKey]: nextMode,
    }));
  }

  function setListFieldInput(fieldKey: string, value: string) {
    setListFieldInputs((previous) => ({
      ...previous,
      [fieldKey]: value,
    }));
  }

  async function handleSaveBookOutline() {
    setIsSavingBook(true);

    try {
      const summarizedBookDraft = await resolveBookOutlineWithSummary(bookDraft);
      setBookDraft(summarizedBookDraft);
      await saveBookOutline(projectId, summarizedBookDraft);
      toast('全书大纲已保存', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存全书大纲失败：${message}`, 'error');
    } finally {
      setIsSavingBook(false);
    }
  }

  async function handleGenerateBookOutline() {
    setIsGeneratingBook(true);

    try {
      const generated = await createBookOutline(settings.serverUrl, {
        projectTitle,
        projectDescription,
        genre,
        seedOutline: bookDraft,
        hint:
          buildTemplateHint(
            formatPromptSection('创作模板书纲约束', currentProject?.templateSnapshot?.promptBundle.bookOutlinePrompt),
            formatPromptSection('创作模板负面约束', currentProject?.templateSnapshot?.promptBundle.negativePrompt),
            bookHint.trim(),
          ) || undefined,
        ...buildModelRequestConfig(settings),
      });

      const summarizedBookDraft = await resolveBookOutlineWithSummary(generated);
      setBookDraft(summarizedBookDraft);
      setBookHint('');
      await saveBookOutline(projectId, summarizedBookDraft);
      toast('AI 全书大纲已生成并保存', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`生成全书大纲失败：${message}`, 'error');
    } finally {
      setIsGeneratingBook(false);
    }
  }

  async function handleSaveVolumeOutline(volumeId: Id) {
    const draft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    setSavingVolumeId(volumeId);

    try {
      const summarizedDraft = await resolveVolumeOutlineWithSummary(volumeId, draft);
      updateVolumeDraft(volumeId, summarizedDraft);
      await saveVolumeOutline(projectId, volumeId, summarizedDraft);
      toast('卷大纲已保存', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存卷大纲失败：${message}`, 'error');
    } finally {
      setSavingVolumeId(null);
    }
  }

  async function handleGenerateVolumeOutline(volumeId: Id) {
    const volumeIndex = sortedVolumes.findIndex((volume) => volume.id === volumeId);
    const volume = sortedVolumes[volumeIndex];

    if (!volume) {
      toast('未找到目标卷', 'warning');
      return;
    }

    const serializedBookOutline = serializeBookOutline(bookDraft).trim();
    if (!serializedBookOutline) {
      toast('请先补充全书大纲，再生成卷大纲', 'warning');
      return;
    }

    const previousVolume = volumeIndex > 0 ? sortedVolumes[volumeIndex - 1] : null;
    const previousDraft = previousVolume ? volumeDraftMap[previousVolume.id] : null;
    const serializedPreviousVolumeOutline =
      previousDraft && previousVolume
        ? serializeVolumeOutline(previousDraft).trim() || undefined
        : undefined;

    setGeneratingVolumeId(volumeId);

    try {
      const seedOutline = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
      const seedPlanningRequirements = collectPlanningRequirements({
        volumeOutline: seedOutline,
        foreshadows,
      });
      const foreshadowPlanBundle = await resolveVolumeForeshadowPlanBundle(
        volume.order,
        seedPlanningRequirements.requiredForeshadowTitles,
      );
      const questionPoolBundle = await resolveVolumeQuestionPoolBundle(volume.order);
      const generated = await createVolumeOutline(settings.serverUrl, {
        projectTitle,
        projectDescription,
        bookOutline: serializedBookOutline,
        previousVolumeOutline: serializedPreviousVolumeOutline,
        foreshadowPlanBundle: foreshadowPlanBundle || undefined,
        questionPoolBundle: questionPoolBundle || undefined,
        volumeTitle: volume.title,
        volumeOrder: volume.order,
        seedOutline,
        hint:
          buildTemplateHint(
            formatPromptSection('创作模板卷纲约束', currentProject?.templateSnapshot?.promptBundle.volumeOutlinePrompt),
            formatPromptSection('创作模板负面约束', currentProject?.templateSnapshot?.promptBundle.negativePrompt),
            volumeHintMap[volumeId]?.trim(),
          ) || undefined,
        ...buildModelRequestConfig(settings),
      });

      const nextDraft: VolumeOutlineFields = {
        goal: generated.goal,
        keyConflict: generated.keyConflict,
        arcSummary: generated.arcSummary,
        entryState: generated.entryState,
        exitState: generated.exitState,
        antagonist: generated.antagonist,
        subPlot: generated.subPlot,
        inheritedThreads: generated.inheritedThreads.map((item) => ({ ...item })),
        protagonistGrowth: generated.protagonistGrowth,
        emotionalArc: generated.emotionalArc,
        estimatedWordCount: generated.estimatedWordCount,
        povPlan: generated.povPlan,
        keyEvents: [...generated.keyEvents],
        foreshadowSeeds: [...generated.foreshadowSeeds],
        requiredEntities: [...(generated.requiredEntities ?? [])],
        requiredForeshadows: [...(generated.requiredForeshadows ?? [])],
        requiredForeshadowIds: [...(generated.requiredForeshadowIds ?? [])],
        foreshadowRefs: normalizeForeshadowRefs(generated.foreshadowRefs),
        estimatedChapterCount: generated.estimatedChapterCount,
        milestones: generated.milestones.map((milestone) => ({
          ...milestone,
          phasePacing: milestone.phasePacing,
          phaseEmotionShift: milestone.phaseEmotionShift,
          phasePOV: milestone.phasePOV,
          keyTurns: [...milestone.keyTurns],
          mustPlant: [...milestone.mustPlant],
          mustPayoff: [...milestone.mustPayoff],
          requiredEntities: [...(milestone.requiredEntities ?? [])],
          requiredForeshadows: [...(milestone.requiredForeshadows ?? [])],
          requiredForeshadowIds: [...(milestone.requiredForeshadowIds ?? [])],
          foreshadowRefs: normalizeForeshadowRefs(milestone.foreshadowRefs),
          summary: milestone.summary ?? '',
        })),
        summary: generated.summary ?? '',
      };
      const summarizedDraft = await resolveVolumeOutlineWithSummary(volumeId, nextDraft);

      setVolumeDraftMap((previous) => ({
        ...previous,
        [volumeId]: summarizedDraft,
      }));
      setVolumeHintMap((previous) => ({
        ...previous,
        [volumeId]: '',
      }));
      await saveVolumeOutline(projectId, volumeId, summarizedDraft);
      toast(`《${volume.title}》卷大纲已生成并保存`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`生成卷大纲失败：${message}`, 'error');
    } finally {
      setGeneratingVolumeId(null);
    }
  }

  async function handleGenerateVolumeMilestones(volumeId: Id) {
    const volumeIndex = sortedVolumes.findIndex((volume) => volume.id === volumeId);
    const volume = sortedVolumes[volumeIndex];

    if (!volume) {
      toast('未找到目标卷', 'warning');
      return;
    }

    const serializedBookOutline = serializeBookOutline(bookDraft).trim();

    if (!serializedBookOutline) {
      toast('请先补充全书大纲，再补全里程碑', 'warning');
      return;
    }

    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const serializedCurrentVolumeOutline = serializeVolumeOutline(currentDraft).trim();

    if (!serializedCurrentVolumeOutline) {
      toast('请先补充当前卷大纲，再补全里程碑', 'warning');
      return;
    }

    const previousVolume = volumeIndex > 0 ? sortedVolumes[volumeIndex - 1] : null;
    const previousDraft = previousVolume ? volumeDraftMap[previousVolume.id] : null;
    const serializedPreviousVolumeOutline =
      previousDraft && previousVolume
        ? serializeVolumeOutline(previousDraft).trim() || undefined
        : undefined;

    setGeneratingMilestonesVolumeId(volumeId);

    try {
      const milestonePlanningRequirements = collectPlanningRequirements({
        volumeOutline: currentDraft,
        foreshadows,
      });
      const foreshadowPlanBundle = await resolveVolumeForeshadowPlanBundle(
        volume.order,
        milestonePlanningRequirements.requiredForeshadowTitles,
      );
      const questionPoolBundle = await resolveVolumeQuestionPoolBundle(volume.order);
      const generated = await createVolumeMilestones(settings.serverUrl, {
        projectTitle,
        projectDescription,
        bookOutline: serializedBookOutline,
        previousVolumeOutline: serializedPreviousVolumeOutline,
        foreshadowPlanBundle: foreshadowPlanBundle || undefined,
        questionPoolBundle: questionPoolBundle || undefined,
        volumeTitle: volume.title,
        volumeOrder: volume.order,
        seedOutline: currentDraft,
        hint:
          buildTemplateHint(
            formatPromptSection('创作模板卷纲约束', currentProject?.templateSnapshot?.promptBundle.volumeOutlinePrompt),
            formatPromptSection('创作模板里程碑约束', currentProject?.templateSnapshot?.promptBundle.milestonePrompt),
            formatPromptSection('创作模板负面约束', currentProject?.templateSnapshot?.promptBundle.negativePrompt),
            volumeHintMap[volumeId]?.trim(),
          ) || undefined,
        ...buildModelRequestConfig(settings),
      });
      const mergedDraft: VolumeOutlineFields = {
        ...currentDraft,
        estimatedChapterCount: generated.estimatedChapterCount,
        milestones: generated.milestones.map((milestone) => ({
          ...milestone,
          keyTurns: [...milestone.keyTurns],
          mustPlant: [...milestone.mustPlant],
          mustPayoff: [...milestone.mustPayoff],
          requiredEntities: [...(milestone.requiredEntities ?? [])],
          requiredForeshadows: [...(milestone.requiredForeshadows ?? [])],
          requiredForeshadowIds: [...(milestone.requiredForeshadowIds ?? [])],
        })),
      };

      const summarizedDraft = await resolveVolumeOutlineWithSummary(volumeId, mergedDraft);
      setVolumeDraftMap((previous) => ({
        ...previous,
        [volumeId]: summarizedDraft,
      }));
      await saveVolumeOutline(projectId, volumeId, summarizedDraft);
      toast(`《${volume.title}》里程碑已补全`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`补全里程碑失败：${message}`, 'error');
    } finally {
      setGeneratingMilestonesVolumeId(null);
    }
  }

  function downloadJsonFile(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = sanitizeFileName(filename);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
  }

  function openImportDialog(target: OutlineImportTarget) {
    pendingImportTargetRef.current = target;

    if (!importFileInputRef.current) {
      toast('导入控件尚未就绪，请稍后重试', 'warning');
      return;
    }

    importFileInputRef.current.value = '';
    importFileInputRef.current.click();
  }

  function handleExportBookOutline() {
    const payload: OutlineJsonEnvelope<BookOutlineFields> = {
      version: 1,
      type: 'book-outline',
      projectTitle,
      exportedAt: new Date().toISOString(),
      data: bookDraft,
    };

    downloadJsonFile(`${projectTitle}-全书大纲.json`, payload);
  }

  function handleExportVolumeOutline(volumeId: Id) {
    const volume = sortedVolumes.find((item) => item.id === volumeId);

    if (!volume) {
      toast('未找到目标卷', 'warning');
      return;
    }

    const payload: OutlineJsonEnvelope<VolumeOutlineFields> = {
      version: 1,
      type: 'volume-outline',
      projectTitle,
      exportedAt: new Date().toISOString(),
      data: volumeDraftMap[volumeId] ?? createEmptyVolumeDraft(),
      meta: {
        volumeTitle: volume.title,
        volumeOrder: volume.order,
      },
    };

    downloadJsonFile(`${projectTitle}-第${volume.order}卷-${volume.title}-卷纲.json`, payload);
  }

  function handleExportVolumeMilestone(volumeId: Id, milestoneIndex: number) {
    const volume = sortedVolumes.find((item) => item.id === volumeId);
    const milestone = (volumeDraftMap[volumeId] ?? createEmptyVolumeDraft()).milestones[milestoneIndex] ?? null;

    if (!volume || !milestone) {
      toast('未找到目标里程碑', 'warning');
      return;
    }

    const payload: OutlineJsonEnvelope<VolumeMilestoneDraft> = {
      version: 1,
      type: 'volume-milestone',
      projectTitle,
      exportedAt: new Date().toISOString(),
      data: cloneVolumeMilestoneDraft(milestone),
      meta: {
        volumeTitle: volume.title,
        volumeOrder: volume.order,
        milestoneIndex,
      },
    };

    downloadJsonFile(`${projectTitle}-第${volume.order}卷-${volume.title}-阶段${milestoneIndex + 1}.json`, payload);
  }

  function handleExportChapterBeats(volumeId: Id, milestoneIndex: number | null) {
    const volume = sortedVolumes.find((item) => item.id === volumeId);
    const draft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const rows = chapterBeatRowsByVolumeId.get(volumeId) ?? [];
    const scopedRows = rows.filter((row) => {
      if (typeof milestoneIndex !== 'number') {
        return true;
      }

      const currentMilestoneIndex =
        row.beat?.milestoneIndex ?? getMilestoneIndexForChapterNumber(draft.milestones, row.chapterNumber);
      return currentMilestoneIndex === milestoneIndex;
    });
    const beats = scopedRows
      .map((row) => {
        const beatDraft = chapterBeatDraftMap[row.key] ?? createEmptyChapterBeatDraft(row.chapterNumber);
        return {
          ...beatDraft,
          orderInVolume: row.chapterNumber,
        };
      })
      .filter((item) => hasChapterBeatDraftContent(item));

    if (!volume) {
      toast('未找到目标卷', 'warning');
      return;
    }

    if (beats.length === 0) {
      toast('当前范围还没有可导出的章节拍数据', 'warning');
      return;
    }

    const scope: ChapterBeatExportScope = typeof milestoneIndex === 'number' ? 'milestone' : 'volume';
    const scopeLabel =
      typeof milestoneIndex === 'number'
        ? `阶段${milestoneIndex + 1}`
        : '全卷';
    const payload: OutlineJsonEnvelope<{ scope: ChapterBeatExportScope; beats: ChapterBeatFields[] }> = {
      version: 1,
      type: 'chapter-beats',
      projectTitle,
      exportedAt: new Date().toISOString(),
      data: {
        scope,
        beats,
      },
      meta: {
        volumeTitle: volume.title,
        volumeOrder: volume.order,
        milestoneIndex,
      },
    };

    downloadJsonFile(`${projectTitle}-第${volume.order}卷-${volume.title}-${scopeLabel}-章节拍.json`, payload);
  }

  function handleExportChapterOutline(row: ChapterOutlineRowModel) {
    const draft = normalizeChapterOutlineDraft(
      chapterOutlineDraftMap[row.chapterId] ?? createChapterOutlineDraft(row.outline),
    );
    const payload: OutlineJsonEnvelope<{
      chapterRef: string;
      chapterGoal: string;
      chapterFunction: string;
      generationModeHint: string;
      promptModuleHints: NonNullable<ReturnType<typeof normalizeChapterOutlineDraft>['promptModuleHints']>;
      sceneDecisionNote: string;
      focusCharacter: string;
      chapterBoundary: string;
      revealCeiling: string;
      openingState: string;
      closingState: string;
      sceneDrafts: NonNullable<ReturnType<typeof normalizeChapterOutlineDraft>['sceneDrafts']>;
      beatDrafts: NonNullable<ReturnType<typeof normalizeChapterOutlineDraft>['beatDrafts']>;
    }> = {
      version: 1,
      type: 'chapter-scene-outline',
      projectTitle,
      exportedAt: new Date().toISOString(),
      data: {
        chapterRef: `章纲/${projectTitle}-第${String(row.chapterNumber).padStart(2, '0')}章-${row.chapterTitle}-章纲.json`,
        chapterGoal: draft.goal,
        chapterFunction: draft.chapterFunction ?? '',
        generationModeHint:
          draft.generationModeHint ??
          ((draft.sceneDrafts?.length ?? 0) <= 1 ? 'single-scene-chapter' : 'scene-by-scene'),
        promptModuleHints: draft.promptModuleHints ?? { extraPrewriteModules: [] },
        sceneDecisionNote: draft.sceneDecisionNote ?? '',
        focusCharacter: draft.focusCharacter ?? '',
        chapterBoundary: draft.chapterBoundary ?? '',
        revealCeiling: draft.revealCeiling ?? '',
        openingState: draft.openingState ?? '',
        closingState: draft.closingState ?? '',
        sceneDrafts: draft.sceneDrafts ?? [],
        beatDrafts: draft.beatDrafts ?? [],
      },
      meta: {
        chapterTitle: row.chapterTitle,
        sourceType: 'chapter-outline',
      },
    };

    downloadJsonFile(`${projectTitle}-第${row.chapterNumber}章-${row.chapterTitle}-场景章纲.json`, payload);
  }

  async function importBookOutlineJson(raw: unknown) {
    const fields = readBookOutlineFields(unwrapOutlineJsonData(raw, 'book-outline'));
    setIsSavingBook(true);

    try {
      const summarizedBookDraft = await resolveBookOutlineWithSummary(fields);
      setBookDraft(summarizedBookDraft);
      await saveBookOutline(projectId, summarizedBookDraft);
      toast('全书大纲已导入', 'success');
    } finally {
      setIsSavingBook(false);
    }
  }

  async function importVolumeOutlineJson(volumeId: Id, raw: unknown) {
    const fields = readVolumeOutlineFields(unwrapOutlineJsonData(raw, 'volume-outline'));
    setSavingVolumeId(volumeId);

    try {
      const summarizedDraft = await resolveVolumeOutlineWithSummary(volumeId, fields);
      updateVolumeDraft(volumeId, summarizedDraft);
      await saveVolumeOutline(projectId, volumeId, summarizedDraft);
      toast('卷大纲已导入', 'success');
    } finally {
      setSavingVolumeId(null);
    }
  }

  async function importVolumeMilestoneJson(volumeId: Id, milestoneIndex: number, raw: unknown) {
    const milestone = readVolumeMilestoneDraft(unwrapOutlineJsonData(raw, 'volume-milestone'));
    const currentDraft = cloneVolumeDraft(volumeDraftMap[volumeId] ?? createEmptyVolumeDraft());

    if (milestoneIndex < 0 || milestoneIndex >= currentDraft.milestones.length) {
      throw new Error('目标里程碑不存在，无法导入');
    }

    const nextDraft: VolumeOutlineFields = {
      ...currentDraft,
      milestones: currentDraft.milestones.map((item, index) =>
        index === milestoneIndex ? milestone : item,
      ),
    };

    setSavingVolumeId(volumeId);

    try {
      const summarizedDraft = await resolveVolumeOutlineWithSummary(volumeId, nextDraft);
      setVolumeDraftMap((previous) => ({
        ...previous,
        [volumeId]: summarizedDraft,
      }));
      await saveVolumeOutline(projectId, volumeId, summarizedDraft);
      toast(`阶段 ${milestoneIndex + 1} 里程碑已导入`, 'success');
    } finally {
      setSavingVolumeId(null);
    }
  }

  async function importChapterBeatsJson(volumeId: Id, milestoneIndex: number | null, raw: unknown) {
    const draft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const rows = chapterBeatRowsByVolumeId.get(volumeId) ?? [];
    const startOrderInVolume =
      typeof milestoneIndex === 'number'
        ? computeMilestoneStartChapter(draft.milestones, milestoneIndex)
        : 1;
    const endOrderInVolume =
      typeof milestoneIndex === 'number'
        ? computeMilestoneEndChapter(draft.milestones, milestoneIndex)
        : Number.MAX_SAFE_INTEGER;
    const beats = readChapterBeatFieldList(
      unwrapOutlineJsonData(raw, 'chapter-beats'),
      startOrderInVolume,
    );

    if (beats.length === 0) {
      throw new Error('导入文件中没有可写入的章节拍数据');
    }

    const inputs = beats
      .map((beat, index) => {
        const fallbackOrderInVolume = startOrderInVolume + index;
        const resolvedOrderInVolume =
          typeof milestoneIndex === 'number' && (beat.orderInVolume < startOrderInVolume || beat.orderInVolume > endOrderInVolume)
            ? fallbackOrderInVolume
            : beat.orderInVolume;
        const matchedRow = rows.find((row) => row.chapterNumber === resolvedOrderInVolume) ?? null;

        return {
          ...beat,
          chapterId: matchedRow?.chapterId,
          orderInVolume: resolvedOrderInVolume,
          milestoneIndex:
            typeof milestoneIndex === 'number'
              ? milestoneIndex
              : beat.milestoneIndex ?? getMilestoneIndexForChapterNumber(draft.milestones, resolvedOrderInVolume),
        };
      })
      .sort((left, right) => left.orderInVolume - right.orderInVolume);

    if (typeof milestoneIndex === 'number') {
      await replaceVolumeChapterBeatsInRange(
        projectId,
        volumeId,
        startOrderInVolume,
        endOrderInVolume,
        inputs,
      );
      toast(`阶段 ${milestoneIndex + 1} 章节拍已导入`, 'success');
      return;
    }

    await saveVolumeChapterBeats(projectId, volumeId, inputs);
    toast('章节拍已导入', 'success');
  }

  async function importChapterOutlineJson(chapterId: Id, raw: unknown) {
    const draft = readChapterOutlineDraft(unwrapOutlineJsonData(raw, ['chapter-outline', 'chapter-scene-outline']));
    const targetRow = activeVolumeOutlineRows.find((item) => item.chapterId === chapterId) ?? null;
    setChapterOutlineDraftMap((previous) => ({
      ...previous,
      [chapterId]: draft,
    }));
    setSavingOutlineChapterId(chapterId);

    try {
      const saved = await saveChapterOutline(projectId, chapterId, draft, {
        milestoneIndex: targetRow?.milestoneIndex ?? null,
      });
      setChapterOutlines((previous) => [
        ...previous.filter((item) => item.chapterId !== chapterId),
        saved,
      ]);
      toast('章纲已导入', 'success');
    } finally {
      setSavingOutlineChapterId(null);
    }
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const target = pendingImportTargetRef.current;
    pendingImportTargetRef.current = null;
    event.target.value = '';

    if (!file || !target) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;

      if (target.type === 'book-outline') {
        await importBookOutlineJson(parsed);
        return;
      }

      if (target.type === 'volume-outline') {
        await importVolumeOutlineJson(target.volumeId, parsed);
        return;
      }

      if (target.type === 'volume-milestone') {
        await importVolumeMilestoneJson(target.volumeId, target.milestoneIndex, parsed);
        return;
      }

      if (target.type === 'chapter-outline') {
        await importChapterOutlineJson(target.chapterId, parsed);
        return;
      }

      await importChapterBeatsJson(target.volumeId, target.milestoneIndex, parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`导入 JSON 失败：${message}`, 'error');
    }
  }

  function buildReconcileLoreSummary(draft: VolumeOutlineFields) {
    const planningRequirements = collectPlanningRequirements({
      volumeOutline: draft,
      foreshadows,
    });
    const requiredEntitySet = new Set(planningRequirements.requiredEntityNames.map((item) => item.trim().toLowerCase()));
    const selectedEntities = entities
      .filter((entity) => entity.pinned || requiredEntitySet.has(entity.name.trim().toLowerCase()))
      .slice(0, 12);

    return selectedEntities
      .map((entity) => {
        const fieldPreview = Object.entries(entity.fields)
          .slice(0, 4)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join('；');

        return [
          `- ${entity.name}（${entity.type}）`,
          entity.description ? `描述：${entity.description}` : '',
          fieldPreview ? `关键状态：${fieldPreview}` : '',
          entity.tags.length > 0 ? `标签：${entity.tags.join(' / ')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');
  }

  function buildReconcileForeshadowSummary(draft: VolumeOutlineFields) {
    const planningRequirements = collectPlanningRequirements({
      volumeOutline: draft,
      foreshadows,
    });
    const requiredForeshadowSet = new Set(
      planningRequirements.requiredForeshadowTitles.map((item) => item.trim().toLowerCase()),
    );
    const selectedForeshadows = foreshadows
      .filter((foreshadow) => {
        if (foreshadow.status === 'activated' || foreshadow.status === 'overdue') {
          return true;
        }

        return requiredForeshadowSet.has(foreshadow.title.trim().toLowerCase());
      })
      .slice(0, 12);

    return selectedForeshadows
      .map((foreshadow) =>
        [
          `- ${foreshadow.title}`,
          `状态：${foreshadow.status}`,
          foreshadow.excerpt ? `摘要：${foreshadow.excerpt}` : '',
          foreshadow.notes ? `备注：${foreshadow.notes}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n');
  }

  async function resolveVolumeForeshadowPlanBundle(
    volumeOrder: number,
    requiredForeshadowTitles: string[] | undefined,
  ) {
    const latestVolumeOrder = sortedVolumes[sortedVolumes.length - 1]?.order ?? volumeOrder;

    if (foreshadowPlanLoadedProjectId !== projectId) {
      await loadForeshadowPlans(projectId, {
        currentVolumeOrder: latestVolumeOrder,
        overdueVolumeGap: 2,
      });
    }

    return buildVolumeForeshadowPlanBundle({
      foreshadowPlans:
        foreshadowPlanLoadedProjectId === projectId
          ? foreshadowPlans
          : useForeshadowPlanStore.getState().foreshadowPlans,
      volumeOrder,
      requiredForeshadowTitles,
    });
  }

  async function resolveVolumeQuestionPoolBundle(volumeOrder: number) {
    if (questionPoolLoadedProjectId !== projectId) {
      await loadQuestionPools(projectId);
    }

    return buildVolumeQuestionPoolBundle({
      questionPools:
        questionPoolLoadedProjectId === projectId
          ? questionPools
          : useQuestionPoolStore.getState().questionPools,
      volumeOrder,
    });
  }

  async function handleReconcileVolumePlan(volumeId: Id) {
    const volume = sortedVolumes.find((item) => item.id === volumeId);

    if (!volume) {
      toast('未找到目标卷', 'warning');
      return;
    }

    const serializedBookOutline = serializeBookOutline(bookDraft).trim();

    if (!serializedBookOutline) {
      toast('请先补充全书大纲，再修正当前卷规划', 'warning');
      return;
    }

    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const currentOutlineText = serializeVolumeOutline(currentDraft).trim();
    const currentMilestonesText = serializeMilestoneCollection(currentDraft.milestones).trim();

    if (!currentOutlineText) {
      toast('当前卷还没有卷纲，无法执行修正', 'warning');
      return;
    }

    setReconcilingVolumeId(volumeId);

    try {
      const volumeChapters = (chaptersByVolumeId.get(volumeId) ?? []).slice(0, 30);
      const chapterIds = new Set(volumeChapters.map((chapter) => chapter.id));
      const summaryRows = (await db.chapterSummaries.where('projectId').equals(projectId).toArray())
        .filter((summary) => chapterIds.has(summary.chapterId))
        .sort((left, right) => {
          const leftChapter = volumeChapters.find((chapter) => chapter.id === left.chapterId);
          const rightChapter = volumeChapters.find((chapter) => chapter.id === right.chapterId);
          return (leftChapter?.order ?? 0) - (rightChapter?.order ?? 0);
        });
      const chapterSummariesText = volumeChapters
        .map((chapter) => {
          const summary = summaryRows.find((item) => item.chapterId === chapter.id);
          return `- 第${chapter.order}章《${chapter.title}》：${summary?.summary || '暂无摘要'}`;
        })
        .join('\n');
      const response = await reconcileVolumePlan(settings.serverUrl, {
        projectTitle,
        projectDescription,
        volumeTitle: volume.title,
        volumeOrder: volume.order,
        bookOutline: serializedBookOutline,
        currentVolumeOutline: currentOutlineText,
        currentMilestones: currentMilestonesText || '暂无里程碑',
        chapterSummaries: chapterSummariesText || '暂无已生成章节摘要',
        loreSummary: buildReconcileLoreSummary(currentDraft) || undefined,
        foreshadowSummary: buildReconcileForeshadowSummary(currentDraft) || undefined,
        ...buildModelRequestConfig(settings),
      });

      setVolumePlanReconcilePreview({
        volumeId,
        volumeTitle: volume.title,
        currentOutlineText,
        currentMilestonesText: currentMilestonesText || '暂无里程碑',
        proposedOutlineText: serializeVolumeOutline(response.proposedVolumeOutline).trim() || '暂无建议卷纲',
        proposedMilestonesText: serializeMilestoneCollection(response.proposedMilestones).trim() || '暂无建议里程碑',
        response,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`修正当前卷规划失败：${message}`, 'error');
    } finally {
      setReconcilingVolumeId(null);
    }
  }

  async function handleApplyVolumePlanReconcile() {
    if (!volumePlanReconcilePreview) {
      return;
    }

    const nextDraft: VolumeOutlineFields = {
      ...volumePlanReconcilePreview.response.proposedVolumeOutline,
      milestones: volumePlanReconcilePreview.response.proposedMilestones,
    };

    const summarizedDraft = await resolveVolumeOutlineWithSummary(
      volumePlanReconcilePreview.volumeId,
      nextDraft,
    );
    await saveVolumeOutline(projectId, volumePlanReconcilePreview.volumeId, summarizedDraft);
    setVolumeDraftMap((previous) => ({
      ...previous,
      [volumePlanReconcilePreview.volumeId]: summarizedDraft,
    }));
    toast(`《${volumePlanReconcilePreview.volumeTitle}》卷规划已更新`, 'success');
    setVolumePlanReconcilePreview(null);
  }

  async function handleRenameVolume(volumeId: Id) {
    const target = sortedVolumes.find((volume) => volume.id === volumeId);

    if (!target) {
      return;
    }

    const nextTitle = window.prompt('输入新的卷标题', target.title)?.trim();

    if (!nextTitle || nextTitle === target.title) {
      return;
    }

    try {
      await useVolumeStore.getState().updateVolume(volumeId, { title: nextTitle });
      toast(`已重命名为《${nextTitle}》`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`重命名卷失败：${message}`, 'error');
    }
  }

  async function handleMoveVolume(volumeId: Id, direction: 'up' | 'down') {
    const target = sortedVolumes.find((volume) => volume.id === volumeId);

    if (!target) {
      return;
    }

    const nextOrder = direction === 'up' ? target.order - 1 : target.order + 1;

    if (nextOrder < 1 || nextOrder > sortedVolumes.length) {
      return;
    }

    try {
      await updateVolume(volumeId, { order: nextOrder });
      toast(direction === 'up' ? '已上移卷顺序' : '已下移卷顺序', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`调整卷顺序失败：${message}`, 'error');
    }
  }

  async function handleSaveChapterBeat(row: ChapterBeatRowModel) {
    const draft = chapterBeatDraftMap[row.key] ?? createEmptyChapterBeatDraft(row.chapterNumber);
    const milestones = (volumeDraftMap[row.volumeId] ?? createEmptyVolumeDraft()).milestones;
    setSavingBeatKey(row.key);

    try {
      await saveChapterBeat(projectId, row.volumeId, {
        chapterId: row.chapterId,
        ...draft,
        orderInVolume: row.chapterNumber,
        milestoneIndex:
          typeof draft.milestoneIndex === 'number'
            ? draft.milestoneIndex
            : getMilestoneIndexForChapterNumber(milestones, row.chapterNumber),
      });
      toast(`第 ${row.chapterNumber} 拍已保存`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存章节拍失败：${message}`, 'error');
    } finally {
      setSavingBeatKey(null);
    }
  }

  async function handleMoveChapterBeat(row: ChapterBeatRowModel, direction: 'up' | 'down') {
    if (!row.beatId) {
      toast('请先保存该章节拍，再调整顺序', 'warning');
      return;
    }

    try {
      await moveChapterBeat(row.beatId, direction);
      toast(direction === 'up' ? '已上移章节拍' : '已下移章节拍', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`调整章节拍顺序失败：${message}`, 'error');
    }
  }

  async function handleDeleteChapterBeat(row: ChapterBeatRowModel) {
    const draft = chapterBeatDraftMap[row.key] ?? createEmptyChapterBeatDraft(row.chapterNumber);
    const hasDraftContent = hasChapterBeatDraftContent(draft);

    if (!row.beatId && !hasDraftContent) {
      toast('当前章节拍没有可删除的内容', 'warning');
      return;
    }

    const confirmed = window.confirm(
      row.beatId
        ? `确认删除第 ${row.chapterNumber} 拍吗？会清空这一拍已保存内容，但保留章节槽。`
        : `确认清空第 ${row.chapterNumber} 拍当前未保存草稿吗？`,
    );

    if (!confirmed) {
      return;
    }

    try {
      if (row.beatId) {
        await deleteChapterBeat(row.beatId);
      }

      setChapterBeatDraftMap((previous) => ({
        ...previous,
        [row.key]: createEmptyChapterBeatDraft(row.chapterNumber),
      }));

      if (activeVolume) {
        setSelectedBeatRowKeyMap((previous) => ({
          ...previous,
          [activeVolume.id]: null,
        }));
      }

      toast(row.beatId ? `第 ${row.chapterNumber} 拍已删除` : `第 ${row.chapterNumber} 拍草稿已清空`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`删除章节拍失败：${message}`, 'error');
    }
  }

  async function handleGenerateVolumeBeats(
    volumeId: Id,
    options?: {
      forcedMilestoneIndex?: number | null;
      forcedChapterCount?: number;
      forcedStartChapterNumber?: number;
      forcedEndChapterNumber?: number;
      forceOverwriteTitles?: boolean;
    },
  ) {
    const volume = sortedVolumes.find((item) => item.id === volumeId);

    if (!volume) {
      toast('未找到目标卷', 'warning');
      return;
    }

    const volumeDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const milestones = volumeDraft.milestones;
    const volumeChapters = chaptersByVolumeId.get(volumeId) ?? [];
    const hasExistingChapters = volumeChapters.length > 0;
    const selectedMilestoneIndex =
      typeof options?.forcedMilestoneIndex !== 'undefined'
        ? options.forcedMilestoneIndex
        : Object.prototype.hasOwnProperty.call(selectedMilestoneIndexMap, volumeId)
          ? selectedMilestoneIndexMap[volumeId]
          : milestones.length > 0
            ? 0
            : null;
    const normalizedMilestoneIndex =
      typeof selectedMilestoneIndex === 'number' && Number.isFinite(selectedMilestoneIndex)
        ? Math.max(0, Math.trunc(selectedMilestoneIndex))
        : undefined;
    const isMilestoneMode =
      milestones.length > 0 &&
      typeof normalizedMilestoneIndex === 'number' &&
      normalizedMilestoneIndex < milestones.length;
    const activeMilestoneIndex = isMilestoneMode ? normalizedMilestoneIndex : 0;
    const targetMilestone = isMilestoneMode ? milestones[activeMilestoneIndex] : null;
    const rawTargetCount = beatChapterCountMap[volumeId]?.trim() ?? '';
    const defaultWholeVolumeChapterCount =
      volumeDraft.estimatedChapterCount > 0
        ? volumeDraft.estimatedChapterCount
        : milestones.reduce((sum, milestone) => sum + Math.max(0, milestone.targetChapterCount), 0) || 12;
    const parsedTargetCount =
      typeof options?.forcedChapterCount === 'number' && Number.isFinite(options.forcedChapterCount)
        ? Math.max(1, Math.trunc(options.forcedChapterCount))
        : rawTargetCount.length === 0
          ? defaultWholeVolumeChapterCount
          : Number(rawTargetCount);

    if (
      !isMilestoneMode &&
      !hasExistingChapters &&
      (!Number.isFinite(parsedTargetCount) || parsedTargetCount <= 0)
    ) {
      toast('请输入有效的目标章节数，再裂变本卷', 'warning');
      return;
    }
    if (isMilestoneMode && (!targetMilestone || targetMilestone.targetChapterCount <= 0)) {
      toast('当前里程碑还没有有效的目标章数，请先补齐后再裂变', 'warning');
      return;
    }
    const targetChapterCount = isMilestoneMode
      ? Math.max(1, Math.trunc(targetMilestone?.targetChapterCount ?? 0))
      : !hasExistingChapters
        ? Math.max(1, Math.min(200, Math.trunc(parsedTargetCount)))
        : volumeChapters.length;
    const milestoneStartChapterNumber = isMilestoneMode
      ? computeMilestoneStartChapter(milestones, activeMilestoneIndex)
      : 1;
    const milestoneEndChapterNumber = isMilestoneMode
      ? computeMilestoneEndChapter(milestones, activeMilestoneIndex)
      : targetChapterCount;
    const plannedChapterNumbersInMilestone = new Set(
      chapterBeats
        .filter(
          (beat) =>
            beat.volumeId === volumeId &&
            beat.orderInVolume >= milestoneStartChapterNumber &&
            beat.orderInVolume <= milestoneEndChapterNumber,
        )
        .map((beat) => beat.orderInVolume),
    );
    const nextSuggestedStartChapterNumber = isMilestoneMode
      ? findFirstMissingChapterNumberInRange(
          plannedChapterNumbersInMilestone,
          milestoneStartChapterNumber,
          milestoneEndChapterNumber,
        ) ?? milestoneStartChapterNumber
      : 1;
    const startChapterNumber =
      isMilestoneMode && typeof options?.forcedStartChapterNumber === 'number'
        ? Math.max(
            milestoneStartChapterNumber,
            Math.min(milestoneEndChapterNumber, Math.trunc(options.forcedStartChapterNumber)),
          )
        : nextSuggestedStartChapterNumber;
    const endChapterNumber =
      isMilestoneMode && typeof options?.forcedEndChapterNumber === 'number'
        ? Math.max(
            startChapterNumber,
            Math.min(milestoneEndChapterNumber, Math.trunc(options.forcedEndChapterNumber)),
          )
        : isMilestoneMode
          ? Math.min(milestoneEndChapterNumber, startChapterNumber + targetChapterCount - 1)
          : targetChapterCount;
    const effectiveChapterCount = isMilestoneMode
      ? Math.max(1, endChapterNumber - startChapterNumber + 1)
      : targetChapterCount;

    const serializedBookOutline = serializeBookOutline(bookDraft).trim();
    const serializedVolumeOutline = serializeVolumeOutline(
      volumeDraft,
    ).trim();

    if (!serializedBookOutline) {
      toast('请先补充全书大纲，再裂变章节拍', 'warning');
      return;
    }

    if (!serializedVolumeOutline) {
      toast('请先补充当前卷大纲，再裂变章节拍', 'warning');
      return;
    }

    setGeneratingBeatVolumeId(volumeId);

    try {
      const shouldOverwriteTitles = options?.forceOverwriteTitles === true;
      const existingChaptersInRange = isMilestoneMode
        ? volumeChapters.slice(startChapterNumber - 1, endChapterNumber)
        : volumeChapters;
      const historySummaries =
        isMilestoneMode && startChapterNumber > 1
          ? await buildHistorySummaries(projectId, volumeId, startChapterNumber - 1)
          : [];
      const generated = await createVolumeBeats(settings.serverUrl, {
        projectTitle,
        projectDescription,
        bookOutline: serializedBookOutline,
        volumeOutline: serializedVolumeOutline,
        volumeTitle: volume.title,
        volumeOrder: volume.order,
        overwriteTitles: shouldOverwriteTitles,
        ...(isMilestoneMode
          ? {
              chapterSlots: Array.from({ length: effectiveChapterCount }, (_, index) => {
                const chapterNumber = startChapterNumber + index;
                const existingChapter = existingChaptersInRange[index];

                return {
                  chapterId: existingChapter?.id,
                  chapterTitle:
                    existingChapter &&
                    !shouldOverwriteTitles &&
                    !isPlaceholderChapterTitle(existingChapter.title)
                      ? existingChapter.title
                      : undefined,
                  chapterNumber,
                };
              }),
              milestoneIndex: activeMilestoneIndex,
              startChapterNumber,
              endChapterNumber,
              estimatedTotalChapters: volumeDraft.estimatedChapterCount || undefined,
              currentMilestone: targetMilestone
                ? serializeSingleMilestone(targetMilestone, activeMilestoneIndex)
                : undefined,
              historySummaries,
            }
          : hasExistingChapters
          ? {
              chapterSlots: volumeChapters.map((chapter, index) => ({
                chapterId: chapter.id,
                chapterTitle:
                  !shouldOverwriteTitles && !isPlaceholderChapterTitle(chapter.title)
                    ? chapter.title
                    : undefined,
                chapterNumber: index + 1,
              })),
            }
          : {
              chapterCount: effectiveChapterCount,
            }),
        hint:
          buildTemplateHint(
            formatPromptSection('创作模板章节节拍约束', currentProject?.templateSnapshot?.promptBundle.beatPrompt),
            formatPromptSection('创作模板负面约束', currentProject?.templateSnapshot?.promptBundle.negativePrompt),
            beatHintMap[volumeId]?.trim(),
          ) || undefined,
        ...buildModelRequestConfig(settings),
      });
      const createdChapters = isMilestoneMode
        ? await Promise.all(
            generated.beats.map((beat, index) => {
              const existingChapter = existingChaptersInRange[index];

              if (existingChapter) {
                return Promise.resolve(existingChapter);
              }

              return createChapter({
                projectId,
                volumeId: volume.id,
                volumeTitle: volume.title,
                title: resolveSuggestedChapterTitle(beat) || `第${beat.chapterNumber}章`,
              });
            }),
          )
        : hasExistingChapters
        ? volumeChapters
        : await Promise.all(
            generated.beats.map((beat, index) =>
              createChapter({
                projectId,
                volumeId: volume.id,
                volumeTitle: volume.title,
                title: resolveSuggestedChapterTitle(beat) || `第${index + 1}章`,
              }),
            ),
          );
      await Promise.all(
        createdChapters.map((chapter, index) => {
          const suggestedTitle = resolveSuggestedChapterTitle(generated.beats[index] ?? {});

          if (
            !chapter ||
            !suggestedTitle ||
            (!shouldOverwriteTitles && !isPlaceholderChapterTitle(chapter.title)) ||
            chapter.title === suggestedTitle
          ) {
            return Promise.resolve();
          }

          return updateChapterTitle(chapter.id, suggestedTitle);
        }),
      );

      const beatInputs = generated.beats.map((beat, index) => ({
        chapterId: createdChapters[index]?.id,
        orderInVolume: beat.chapterNumber,
        titleHint: beat.titleHint,
        scenePurpose: beat.scenePurpose,
        focusCharacter: beat.focusCharacter,
        mustAppearCharacters: beat.mustAppearCharacters ?? [],
        availableCharacters: beat.availableCharacters ?? [],
        requiredForeshadows: beat.requiredForeshadows ?? [],
        mainPlot: beat.mainPlot,
        subPlot: beat.subPlot,
        pacing: beat.pacing,
        hookOut: beat.hookOut,
        noveltyRequirement: beat.noveltyRequirement,
        powerDelta: beat.powerDelta,
        forbiddenPhrases: beat.forbiddenPhrases,
        forbiddenScenePatterns: beat.forbiddenScenePatterns,
        keyItems: beat.keyItems,
        milestoneIndex: isMilestoneMode ? activeMilestoneIndex : beat.milestoneIndex,
      }));

      if (isMilestoneMode) {
        await replaceVolumeChapterBeatsInRange(
          projectId,
          volumeId,
          startChapterNumber,
          endChapterNumber,
          beatInputs,
        );
      } else {
        await saveVolumeChapterBeats(projectId, volumeId, beatInputs);
      }
      setBeatHintMap((previous) => ({
        ...previous,
        [volumeId]: '',
      }));
      if (isMilestoneMode) {
        toast(
          `《${volume.title}》第 ${activeMilestoneIndex + 1} 阶段已裂变完成${
            historySummaries.length > 0 ? `，已锚定前 ${startChapterNumber - 1} 章进度` : ''
          }`,
          'success',
        );
      } else if (!hasExistingChapters) {
        setBeatChapterCountMap((previous) => ({
          ...previous,
          [volumeId]: String(targetChapterCount),
        }));
        if (!activeChapterId && createdChapters[0]) {
          setActiveChapter(createdChapters[0].id);
        }
        toast(`《${volume.title}》已自动创建 ${createdChapters.length} 章并裂变章节拍`, 'success');
      } else {
        toast(`《${volume.title}》章节拍已裂变完成`, 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`裂变章节拍失败：${message}`, 'error');
    } finally {
      setGeneratingBeatVolumeId(null);
    }
  }

  function updateVolumeDraft(volumeId: Id, patch: Partial<VolumeOutlineFields>) {
    setVolumeDraftMap((previous) => ({
      ...previous,
      [volumeId]: {
        ...(previous[volumeId] ?? createEmptyVolumeDraft()),
        ...patch,
      },
    }));
  }

  function updateVolumeMilestoneDraft(
    volumeId: Id,
    milestoneIndex: number,
    patch: Partial<VolumeMilestoneDraft>,
  ) {
    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const currentMilestones = currentDraft.milestones.length > 0
      ? currentDraft.milestones
      : [createEmptyVolumeMilestoneDraft()];

    updateVolumeDraft(volumeId, {
      milestones: currentMilestones.map((milestone, index) =>
        index === milestoneIndex
          ? {
              ...milestone,
              ...patch,
            }
          : milestone,
      ),
    });
  }

  function addVolumeForeshadowRef(volumeId: Id) {
    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    updateVolumeDraft(volumeId, {
      foreshadowRefs: [...(currentDraft.foreshadowRefs ?? []), createEmptyForeshadowRef()],
    });
  }

  function updateVolumeForeshadowRef(volumeId: Id, index: number, patch: Partial<ForeshadowRef>) {
    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    updateVolumeDraft(volumeId, {
      foreshadowRefs: (currentDraft.foreshadowRefs ?? []).map((item, itemIndex) =>
        itemIndex === index ? normalizeForeshadowRef({ ...item, ...patch }) : item,
      ),
    });
  }

  function removeVolumeForeshadowRef(volumeId: Id, index: number) {
    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    updateVolumeDraft(volumeId, {
      foreshadowRefs: (currentDraft.foreshadowRefs ?? []).filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function addMilestoneForeshadowRef(volumeId: Id, milestoneIndex: number) {
    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const milestone = currentDraft.milestones[milestoneIndex] ?? createEmptyVolumeMilestoneDraft();
    updateVolumeMilestoneDraft(volumeId, milestoneIndex, {
      foreshadowRefs: [...(milestone.foreshadowRefs ?? []), createEmptyForeshadowRef()],
    });
  }

  function updateMilestoneForeshadowRef(
    volumeId: Id,
    milestoneIndex: number,
    index: number,
    patch: Partial<ForeshadowRef>,
  ) {
    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const milestone = currentDraft.milestones[milestoneIndex] ?? createEmptyVolumeMilestoneDraft();
    updateVolumeMilestoneDraft(volumeId, milestoneIndex, {
      foreshadowRefs: (milestone.foreshadowRefs ?? []).map((item, itemIndex) =>
        itemIndex === index ? normalizeForeshadowRef({ ...item, ...patch }) : item,
      ),
    });
  }

  function removeMilestoneForeshadowRef(volumeId: Id, milestoneIndex: number, index: number) {
    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const milestone = currentDraft.milestones[milestoneIndex] ?? createEmptyVolumeMilestoneDraft();
    updateVolumeMilestoneDraft(volumeId, milestoneIndex, {
      foreshadowRefs: (milestone.foreshadowRefs ?? []).filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function addVolumeMilestone(volumeId: Id) {
    const currentDraft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();

    updateVolumeDraft(volumeId, {
      milestones: [...currentDraft.milestones, createEmptyVolumeMilestoneDraft()],
    });
  }

  async function removeVolumeMilestone(volumeId: Id, milestoneIndex: number) {
    const currentDraft = cloneVolumeDraft(volumeDraftMap[volumeId] ?? createEmptyVolumeDraft());
    const nextMilestones = currentDraft.milestones.filter((_, index) => index !== milestoneIndex);

    if (nextMilestones.length === currentDraft.milestones.length) {
      return;
    }

    const nextDraft: VolumeOutlineFields = {
      ...currentDraft,
      milestones: nextMilestones,
    };

    setSavingVolumeId(volumeId);
    let appliedDraft = nextDraft;

    try {
      const summarizedDraft = await resolveVolumeOutlineWithSummary(volumeId, nextDraft);
      appliedDraft = summarizedDraft;
      setVolumeDraftMap((previous) => ({
        ...previous,
        [volumeId]: summarizedDraft,
      }));
      await saveVolumeOutline(projectId, volumeId, summarizedDraft);
      toast('里程碑已删除并保存', 'success');
    } catch (error) {
      setVolumeDraftMap((previous) =>
        previous[volumeId] === appliedDraft
          ? {
              ...previous,
              [volumeId]: currentDraft,
            }
          : previous,
      );
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`删除里程碑失败：${message}`, 'error');
    } finally {
      setSavingVolumeId(null);
    }
  }

  function updateChapterBeatDraft(rowKey: string, patch: Partial<ChapterBeatFields>) {
    setChapterBeatDraftMap((previous) => ({
      ...previous,
      [rowKey]: {
        ...(previous[rowKey] ?? createEmptyChapterBeatDraft()),
        ...patch,
      },
    }));
  }

  function updateChapterOutlineDraft(chapterId: Id, patch: Partial<ReturnType<typeof createEmptyChapterOutlineDraft>>) {
    setChapterOutlineDraftMap((previous) => ({
      ...previous,
      [chapterId]: normalizeChapterOutlineDraft({
        ...(previous[chapterId] ?? createEmptyChapterOutlineDraft()),
        ...patch,
      }),
    }));
  }

  function selectBeatRow(rowKey: string) {
    if (!activeVolume) {
      return;
    }

    setSelectedBeatRowKeyMap((previous) => ({
      ...previous,
      [activeVolume.id]: rowKey,
    }));
  }

  function selectOutlineChapter(chapterId: Id) {
    if (!activeVolume) {
      return;
    }

    setSelectedOutlineChapterIdMap((previous) => ({
      ...previous,
      [activeVolume.id]: chapterId,
    }));
  }

  function createOutlineDraftFromBeat(beat: ChapterBeat | null | undefined) {
    if (!beat) {
      return createEmptyChapterOutlineDraft();
    }

    const derivedBeatId = `beat_${String(beat.orderInVolume).padStart(2, '0')}`;
    const derivedSceneId = 'scene_01';

    return normalizeChapterOutlineDraft({
      ...createEmptyChapterOutlineDraft(),
      goal: beat.mainPlot,
      chapterFunction: beat.scenePurpose,
      generationModeHint: 'single-scene-chapter',
      sceneDecisionNote: '当前由章节拍导入，先按单场景直出整章处理；beat 仅作为场景内部推进骨架。',
      focusCharacter: beat.focusCharacter,
      mustAppearCharacters: [...(beat.mustAppearCharacters ?? [])],
      availableCharacters: [...(beat.availableCharacters ?? [])],
      mainPlot: beat.mainPlot,
      subPlot: beat.subPlot,
      coreScene: beat.scenePurpose,
      sceneAnchors: [...beat.keyItems],
      infoBudget: beat.noveltyRequirement,
      powerShift: beat.powerDelta,
      chapterHook: beat.hookOut,
      foreshadowRefs: (beat.requiredForeshadows ?? []).map((title) =>
        normalizeForeshadowRef({
          foreshadowId: '',
          foreshadowTitle: title,
          action: 'advance',
          intensity: 'medium',
        }),
      ),
      sceneDrafts: [
        {
          ...createEmptyChapterSceneDraft(),
          sceneId: derivedSceneId,
          sceneTitle: beat.titleHint || '场景 1',
          macroScene: beat.scenePurpose,
          sceneRole: beat.scenePurpose,
          sceneGoal: beat.mainPlot,
          sceneResult: beat.hookOut,
          sceneHook: beat.hookOut,
          actors: normalizeSceneActorRefs([
            beat.focusCharacter
              ? {
                  characterId: beat.focusCharacter,
                  role: 'focus',
                }
              : null,
            ...dedupeTextList(beat.mustAppearCharacters ?? [])
              .filter((name) => name !== beat.focusCharacter)
              .map((characterId) => ({
                characterId,
                role: 'support' as const,
              })),
          ], 'support'),
          availableCharacters: normalizeSceneActorRefs(
            (beat.availableCharacters ?? []).map((characterId) => ({
              characterId,
              role: 'candidate' as const,
            })),
            'candidate',
          ),
          infoBudget: beat.noveltyRequirement,
          powerShift: beat.powerDelta,
          forbiddenNotes: [...beat.forbiddenPhrases],
          beatRefs: [derivedBeatId],
          foreshadowRefs: (beat.requiredForeshadows ?? []).map((title) =>
            normalizeForeshadowRef({
              foreshadowId: '',
              foreshadowTitle: title,
              action: 'advance',
              intensity: 'medium',
            }),
          ),
        } satisfies ChapterSceneDraft,
      ],
      beatDrafts: [
        {
          ...createEmptyOutlineBeatDraft(),
          beatId: derivedBeatId,
          sceneId: derivedSceneId,
          beatTitle: beat.titleHint || '章节主推进',
          scene: beat.scenePurpose,
          actors: dedupeTextList([
            beat.focusCharacter,
            ...(beat.mustAppearCharacters ?? []),
          ]),
          progress: beat.mainPlot,
          result: beat.hookOut,
          foreshadowRefs: (beat.requiredForeshadows ?? []).map((title) =>
            normalizeForeshadowRef({
              foreshadowId: '',
              foreshadowTitle: title,
              action: 'advance',
              intensity: 'medium',
            }),
          ),
          forbiddenNotes: [...beat.forbiddenPhrases],
        } satisfies ChapterOutlineBeatDraft,
      ],
      beats: [],
    });
  }

  async function handleImportOutlineFromBeat(row: ChapterOutlineRowModel) {
    const matchedBeat =
      activeVolumeBeatRowsWithMeta.find((item) => item.row.chapterId === row.chapterId)?.row.beat ??
      activeVolumeBeatRows.find((item) => item.chapterId === row.chapterId)?.beat ??
      null;

    if (!matchedBeat) {
      toast('当前章节还没有章节拍可导入', 'warning');
      return;
    }

    const imported = createOutlineDraftFromBeat(matchedBeat);
    setChapterOutlineDraftMap((previous) => ({
      ...previous,
      [row.chapterId]: imported,
    }));
    selectOutlineChapter(row.chapterId);
    toast('已从章节拍带入章纲草稿', 'success');
  }

  async function handleSaveChapterOutline(row: ChapterOutlineRowModel) {
    const draft = chapterOutlineDraftMap[row.chapterId] ?? createEmptyChapterOutlineDraft();
    setSavingOutlineChapterId(row.chapterId);

    try {
      const saved = await saveChapterOutline(projectId, row.chapterId, draft, {
        milestoneIndex: row.milestoneIndex ?? null,
      });
      setChapterOutlines((previous) => [
        ...previous.filter((item) => item.chapterId !== row.chapterId),
        saved,
      ]);
      toast(`《${row.chapterTitle}》章纲已保存`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存章纲失败：${message}`, 'error');
    } finally {
      setSavingOutlineChapterId(null);
    }
  }

  function addOutlineForeshadowRef(chapterId: Id) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    updateChapterOutlineDraft(chapterId, {
      foreshadowRefs: [...(draft.foreshadowRefs ?? []), createEmptyForeshadowRef()],
    });
  }

  function updateOutlineForeshadowRef(chapterId: Id, index: number, patch: Partial<ForeshadowRef>) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    updateChapterOutlineDraft(chapterId, {
      foreshadowRefs: (draft.foreshadowRefs ?? []).map((item, itemIndex) =>
        itemIndex === index ? normalizeForeshadowRef({ ...item, ...patch }) : item,
      ),
    });
  }

  function removeOutlineForeshadowRef(chapterId: Id, index: number) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    updateChapterOutlineDraft(chapterId, {
      foreshadowRefs: (draft.foreshadowRefs ?? []).filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function addOutlineBeatDraft(chapterId: Id) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    updateChapterOutlineDraft(chapterId, {
      beatDrafts: [...(draft.beatDrafts ?? []), createEmptyOutlineBeatDraft()],
    });
  }

  function addOutlineSceneDraft(chapterId: Id) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    const nextIndex = (draft.sceneDrafts?.length ?? 0) + 1;
    const sceneId = `scene_${String(nextIndex).padStart(2, '0')}`;
    updateChapterOutlineDraft(chapterId, {
      sceneDrafts: [
        ...(draft.sceneDrafts ?? []),
        {
          ...createEmptyChapterSceneDraft(),
          sceneId,
          sceneTitle: `场景 ${nextIndex}`,
        },
      ],
    });
  }

  function updateOutlineSceneDraft(chapterId: Id, index: number, patch: Partial<ChapterSceneDraft>) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    updateChapterOutlineDraft(chapterId, {
      sceneDrafts: (draft.sceneDrafts ?? []).map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    });
  }

  function removeOutlineSceneDraft(chapterId: Id, index: number) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    updateChapterOutlineDraft(chapterId, {
      sceneDrafts: (draft.sceneDrafts ?? []).filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function toggleOutlinePromptModule(chapterId: Id, moduleKey: PromptModuleKey) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    const currentModules = new Set(draft.promptModuleHints?.extraPrewriteModules ?? []);

    if (currentModules.has(moduleKey)) {
      currentModules.delete(moduleKey);
    } else {
      currentModules.add(moduleKey);
    }

    updateChapterOutlineDraft(chapterId, {
      promptModuleHints: {
        extraPrewriteModules: ['strand_weave', 'cool_points'].filter((item): item is PromptModuleKey => currentModules.has(item)),
      },
    });
  }

  function updateOutlineBeatDraft(chapterId: Id, index: number, patch: Partial<ChapterOutlineBeatDraft>) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    updateChapterOutlineDraft(chapterId, {
      beatDrafts: (draft.beatDrafts ?? []).map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    });
  }

  function removeOutlineBeatDraft(chapterId: Id, index: number) {
    const draft = chapterOutlineDraftMap[chapterId] ?? createEmptyChapterOutlineDraft();
    updateChapterOutlineDraft(chapterId, {
      beatDrafts: (draft.beatDrafts ?? []).filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function handleSelectVolume(volumeId: Id) {
    setExpandedVolumeId(volumeId);
    setChapterJumpValue('');

    if (outlineMode === 'book') {
      setOutlineMode('volume');
    }
  }

  function handleSelectMilestone(milestoneIndex: number | null) {
    if (!activeVolume) {
      return;
    }

    setSelectedMilestoneIndexMap((previous) => ({
      ...previous,
      [activeVolume.id]: milestoneIndex,
    }));
    setBeatFilterStatus('all');

    if (outlineMode === 'milestone') {
      return;
    }

    setOutlineMode('beats');
  }

  function handleJumpToChapter() {
    if (!activeVolume) {
      toast('请先选择一卷，再定位章节', 'warning');
      return;
    }

    const parsedChapterNumber = Number(chapterJumpValue.trim());

    if (!Number.isFinite(parsedChapterNumber) || parsedChapterNumber <= 0) {
      toast('请输入有效的章号', 'warning');
      return;
    }

    const target = activeVolumeBeatRowsWithMeta.find(
      (item) => item.row.chapterNumber === Math.trunc(parsedChapterNumber),
    );

    if (!target) {
      toast(`《${activeVolume.title}》还没有第 ${Math.trunc(parsedChapterNumber)} 章的章节拍`, 'warning');
      return;
    }

    setOutlineMode('beats');
    setBeatFilterStatus('all');
    setSelectedMilestoneIndexMap((previous) => ({
      ...previous,
      [activeVolume.id]:
        typeof target.milestoneIndex === 'number' ? target.milestoneIndex : previous[activeVolume.id] ?? null,
    }));
    setSelectedBeatRowKeyMap((previous) => ({
      ...previous,
      [activeVolume.id]: target.row.key,
    }));

    window.setTimeout(() => {
      beatRowRefs.current[target.row.key]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 60);
  }

  function openFissionDialog(volumeId: Id, milestoneIndex?: number | null) {
    const draft = volumeDraftMap[volumeId] ?? createEmptyVolumeDraft();
    const milestones = draft.milestones;
    const defaultWholeVolumeChapterCount =
      draft.estimatedChapterCount > 0
        ? draft.estimatedChapterCount
        : milestones.reduce((sum, milestone) => sum + Math.max(0, milestone.targetChapterCount), 0) || 12;
    const initialMilestoneIndex =
      typeof milestoneIndex === 'number'
        ? milestoneIndex
        : Object.prototype.hasOwnProperty.call(selectedMilestoneIndexMap, volumeId)
          ? selectedMilestoneIndexMap[volumeId]
          : milestones.length > 0
            ? 0
            : null;
    const normalizedInitialMilestoneIndex =
      typeof initialMilestoneIndex === 'number' && initialMilestoneIndex >= 0 && initialMilestoneIndex < milestones.length
        ? initialMilestoneIndex
        : null;
    const initialMilestone =
      typeof normalizedInitialMilestoneIndex === 'number'
        ? milestones[normalizedInitialMilestoneIndex] ?? null
        : null;
    const milestoneStartChapterNumber =
      typeof normalizedInitialMilestoneIndex === 'number'
        ? computeMilestoneStartChapter(milestones, normalizedInitialMilestoneIndex)
        : 1;
    const milestoneEndChapterNumber =
      typeof normalizedInitialMilestoneIndex === 'number'
        ? computeMilestoneEndChapter(milestones, normalizedInitialMilestoneIndex)
        : 0;
    const plannedChapterNumbers = new Set(
      chapterBeats
        .filter(
          (beat) =>
            beat.volumeId === volumeId &&
            beat.orderInVolume >= milestoneStartChapterNumber &&
            beat.orderInVolume <= milestoneEndChapterNumber,
        )
        .map((beat) => beat.orderInVolume),
    );
    const remainingMilestoneChapterCount =
      typeof normalizedInitialMilestoneIndex === 'number'
        ? Math.max(
            0,
            (initialMilestone?.targetChapterCount ?? 0) - plannedChapterNumbers.size,
          )
        : 0;
    const recommendedBatchCount =
      typeof normalizedInitialMilestoneIndex === 'number'
        ? Math.max(
            1,
            Math.min(
              20,
              remainingMilestoneChapterCount > 0
                ? remainingMilestoneChapterCount
                : initialMilestone?.targetChapterCount ?? 1,
            ),
          )
        : defaultWholeVolumeChapterCount;

    setFissionDialogVolumeId(volumeId);
    setFissionDialogMode(
      milestones.length > 0 && typeof normalizedInitialMilestoneIndex === 'number' ? 'milestone' : 'volume',
    );
    setFissionDialogMilestoneIndex(
      normalizedInitialMilestoneIndex,
    );
    setFissionDialogChapterCount(beatChapterCountMap[volumeId]?.trim() || String(defaultWholeVolumeChapterCount));
    setFissionDialogBatchCount(String(recommendedBatchCount));
    setFissionDialogOverwriteTitles(false);
  }

  function closeFissionDialog() {
    setFissionDialogVolumeId(null);
  }

  async function handleConfirmFissionDialog() {
    if (!fissionDialogVolumeId) {
      return;
    }

    const volumeId = fissionDialogVolumeId;

    if (fissionDialogMode === 'milestone' && typeof fissionDialogMilestoneIndex === 'number') {
      const startChapterNumber = computeMilestoneStartChapter(
        (volumeDraftMap[volumeId] ?? createEmptyVolumeDraft()).milestones,
        fissionDialogMilestoneIndex,
      );
      const milestoneEndChapterNumber = computeMilestoneEndChapter(
        (volumeDraftMap[volumeId] ?? createEmptyVolumeDraft()).milestones,
        fissionDialogMilestoneIndex,
      );
      const parsedBatchCount = Number(fissionDialogBatchCount.trim());

      if (!Number.isFinite(parsedBatchCount) || parsedBatchCount <= 0) {
        toast('请输入有效的本次规划章数', 'warning');
        return;
      }

      const plannedChapterNumbers = new Set(
        chapterBeats
          .filter(
            (beat) =>
              beat.volumeId === volumeId &&
              beat.orderInVolume >= startChapterNumber &&
              beat.orderInVolume <= milestoneEndChapterNumber,
          )
          .map((beat) => beat.orderInVolume),
      );
      const nextStartChapterNumber =
        findFirstMissingChapterNumberInRange(
          plannedChapterNumbers,
          startChapterNumber,
          milestoneEndChapterNumber,
        ) ?? startChapterNumber;
      const nextEndChapterNumber = Math.min(
        milestoneEndChapterNumber,
        nextStartChapterNumber + Math.max(1, Math.trunc(parsedBatchCount)) - 1,
      );

      setSelectedMilestoneIndexMap((previous) => ({
        ...previous,
        [volumeId]: fissionDialogMilestoneIndex,
      }));
      closeFissionDialog();
      await handleGenerateVolumeBeats(volumeId, {
        forcedMilestoneIndex: fissionDialogMilestoneIndex,
        forcedStartChapterNumber: nextStartChapterNumber,
        forcedEndChapterNumber: nextEndChapterNumber,
        forceOverwriteTitles: fissionDialogOverwriteTitles,
      });
      return;
    }

    const parsedChapterCount = Number(fissionDialogChapterCount.trim());

    if (!Number.isFinite(parsedChapterCount) || parsedChapterCount <= 0) {
      toast('请输入有效的目标章节数', 'warning');
      return;
    }

    setSelectedMilestoneIndexMap((previous) => ({
      ...previous,
      [volumeId]: null,
    }));
    setBeatChapterCountMap((previous) => ({
      ...previous,
      [volumeId]: String(Math.max(1, Math.trunc(parsedChapterCount))),
    }));
    closeFissionDialog();
    await handleGenerateVolumeBeats(volumeId, {
      forcedMilestoneIndex: null,
      forcedChapterCount: Math.max(1, Math.trunc(parsedChapterCount)),
      forceOverwriteTitles: fissionDialogOverwriteTitles,
    });
  }

  function toggleVolumeExpanded(volumeId: Id) {
    setOpenVolumeMenuId(null);
    setExpandedVolumeId((previous) => (previous === volumeId ? null : volumeId));
  }

  const fissionDialogVolume = useMemo(
    () => (fissionDialogVolumeId ? sortedVolumes.find((volume) => volume.id === fissionDialogVolumeId) ?? null : null),
    [fissionDialogVolumeId, sortedVolumes],
  );
  const fissionDialogDraft = useMemo(
    () => (fissionDialogVolume ? volumeDraftMap[fissionDialogVolume.id] ?? createEmptyVolumeDraft() : createEmptyVolumeDraft()),
    [fissionDialogVolume, volumeDraftMap],
  );
  const fissionDialogMilestone =
    fissionDialogMode === 'milestone' && typeof fissionDialogMilestoneIndex === 'number'
      ? fissionDialogDraft.milestones[fissionDialogMilestoneIndex] ?? null
      : null;
  const fissionDialogDefaultChapterCount =
    fissionDialogDraft.estimatedChapterCount > 0
      ? fissionDialogDraft.estimatedChapterCount
      : fissionDialogDraft.milestones.reduce((sum, milestone) => sum + Math.max(0, milestone.targetChapterCount), 0) || 12;
  const fissionDialogMilestoneStartChapterNumber =
    fissionDialogMilestone && typeof fissionDialogMilestoneIndex === 'number'
      ? computeMilestoneStartChapter(fissionDialogDraft.milestones, fissionDialogMilestoneIndex)
      : 1;
  const fissionDialogMilestoneEndChapterNumber =
    fissionDialogMilestone && typeof fissionDialogMilestoneIndex === 'number'
      ? computeMilestoneEndChapter(fissionDialogDraft.milestones, fissionDialogMilestoneIndex)
      : 0;
  const fissionDialogPlannedChapterNumbers = new Set(
    chapterBeats
      .filter(
        (beat) =>
          fissionDialogVolume &&
          beat.volumeId === fissionDialogVolume.id &&
          beat.orderInVolume >= fissionDialogMilestoneStartChapterNumber &&
          beat.orderInVolume <= fissionDialogMilestoneEndChapterNumber,
      )
      .map((beat) => beat.orderInVolume),
  );
  const fissionDialogNextStartChapterNumber =
    fissionDialogMilestone
      ? findFirstMissingChapterNumberInRange(
          fissionDialogPlannedChapterNumbers,
          fissionDialogMilestoneStartChapterNumber,
          fissionDialogMilestoneEndChapterNumber,
        ) ?? fissionDialogMilestoneStartChapterNumber
      : 1;
  const fissionDialogRemainingChapterCount =
    fissionDialogMilestone
      ? Math.max(0, (fissionDialogMilestone.targetChapterCount || 0) - fissionDialogPlannedChapterNumbers.size)
      : 0;
  const fissionDialogParsedBatchCount = Math.max(1, Math.trunc(Number(fissionDialogBatchCount) || 1));
  const fissionDialogPreviewEndChapterNumber =
    fissionDialogMilestone
      ? Math.min(
          fissionDialogMilestoneEndChapterNumber,
          fissionDialogNextStartChapterNumber + fissionDialogParsedBatchCount - 1,
        )
      : 0;
  const fissionDialogOverwriteChapterCount =
    fissionDialogMilestone
      ? Array.from(fissionDialogPlannedChapterNumbers).filter(
          (chapterNumber) =>
            chapterNumber >= fissionDialogNextStartChapterNumber &&
            chapterNumber <= fissionDialogPreviewEndChapterNumber,
        ).length
      : 0;

  return (
    <>
      <section
        className={[
          'min-h-0 flex-1 overflow-hidden',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className={`grid h-full gap-4 ${
            showBeatInspector
              ? 'xl:grid-cols-[250px_minmax(0,1fr)_340px] 2xl:grid-cols-[270px_minmax(0,1fr)_380px]'
              : 'xl:grid-cols-[250px_minmax(0,1fr)] 2xl:grid-cols-[270px_minmax(0,1fr)]'
          }`}
        >
          <aside className="min-h-0 overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-900/70 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
            <div className="h-full overflow-y-auto p-4">
              <OutlineWorkspaceSidebar
                volumes={volumeSummaryItems}
                milestones={milestoneSummaryItems}
                activeVolumeTitle={activeVolume?.title ?? null}
                chapterJumpValue={chapterJumpValue}
                beatFilterStatus={beatFilterStatus}
                onChapterJumpValueChange={setChapterJumpValue}
                onJumpChapter={handleJumpToChapter}
                onSelectVolume={handleSelectVolume}
                onSelectMilestone={handleSelectMilestone}
                onBeatFilterStatusChange={setBeatFilterStatus}
                onOpenVolumeSummary={openVolumeSummaryDialog}
                onOpenMilestoneSummary={openMilestoneSummaryDialog}
                registerVolumeNode={(volumeId, node) => {
                  volumeCardRefs.current[volumeId] = node;
                }}
              />
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto pb-6 pr-1">
            <div className="space-y-4">
              <section className="rounded-[24px] border border-neutral-800 bg-neutral-900/70 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <OutlineModeTabs
                      value={outlineMode}
                      onChange={setOutlineMode}
                      disabledModes={{
                        volume: !hasVolumes,
                        milestone: !hasVolumes,
                        beats: !hasVolumes,
                        outline: !hasVolumes,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowStructureMemoryOverview((current) => !current)}
                      className={`inline-flex min-h-[48px] items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition ${
                        showStructureMemoryOverview
                          ? 'border-emerald-400/40 bg-emerald-500/12 text-emerald-50'
                          : 'border-neutral-800 bg-neutral-950/50 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900/70'
                      }`}
                    >
                      <GitBranch size={15} />
                      {showStructureMemoryOverview ? '收起结构记忆概览' : '结构记忆概览'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                      当前卷：{activeVolume?.title ?? '未选择'}
                    </span>
                    <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                      阶段：
                      {typeof activeSelectedMilestoneIndex === 'number'
                        ? `阶段 ${activeSelectedMilestoneIndex + 1}`
                        : '整卷'}
                    </span>
                    {showBeatInspector ? (
                      <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                        章节拍：{beatStatusCounts.all}
                      </span>
                    ) : null}
                  </div>
                </div>
              </section>

              {showStructureMemoryOverview ? (
                <section className="rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">结构记忆概览</p>
                      <h3 className="mt-2 text-xl font-semibold text-neutral-100">当前项目 / 当前卷摘要</h3>
                      <p className="mt-2 text-sm leading-7 text-neutral-400">
                        当前摘要默认跟随《{activeStructureVolume?.title ?? '当前卷'}》。这里先看摘要，正式维护统一去结构记忆工作台。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenStructureMemory?.('thread-ledger')}
                      className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-2.5 text-sm text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-800"
                    >
                      打开结构记忆工作台
                      <ArrowRight size={15} />
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {structureMemorySummaries.map((item) => (
                      <StructureMemorySummaryCard
                        key={item.key}
                        label={item.label}
                        detail={item.detail}
                        count={item.count}
                        attentionCount={item.attentionCount}
                        icon={item.icon}
                        onOpen={onOpenStructureMemory ? () => onOpenStructureMemory(item.key) : undefined}
                      />
                    ))}
                  </div>
                </section>
              ) : outlineMode === 'book' ? (
                <>
                  <article className="overflow-hidden rounded-[28px] border border-neutral-800 bg-[linear-gradient(180deg,rgba(18,31,42,0.96),rgba(10,19,27,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--studio-secondary)]">全书大纲</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">{projectTitle}</h2>
            <p className="mt-2 text-sm text-neutral-300">定义你整本书的方向。</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              {projectDescription || '还没有项目简介。先把核心前提、主线冲突和世界规则定下来，后面的章节生成会稳很多。'}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--studio-line)] bg-[color:var(--studio-secondary-soft)] text-[color:var(--studio-secondary)]">
            <BookOpen size={20} />
          </div>
        </header>

        {isBookGuideVisible ? (
          <div className="mt-5 rounded-2xl border border-dashed border-[color:var(--studio-line-strong)] bg-[color:var(--studio-secondary-soft)] px-4 py-4 text-sm leading-6 text-[color:var(--studio-text)]">
            还没有大纲，点击「AI 生成」让 AI 帮你起草，或手动填写各字段。
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 border-y border-neutral-800/80 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSaveBookOutline()}
              disabled={isSavingBook || isGeneratingBook}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingBook ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
              保存全书大纲
            </button>
            <button
              type="button"
              onClick={openBookSummaryDialog}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800"
            >
              摘要
            </button>
            <button
              type="button"
              onClick={() => handleExportBookOutline()}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800"
            >
              <Download size={15} />
              导出 JSON
            </button>
            <button
              type="button"
              onClick={() => openImportDialog({ type: 'book-outline' })}
              disabled={isSavingBook || isGeneratingBook}
              className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={15} />
              导入 JSON
            </button>
            <p className="text-xs text-neutral-500">
              题材标签：{genre.length > 0 ? genre.join(' / ') : '未设置'}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[420px] xl:flex-row xl:items-center">
            <input
              value={bookHint}
              onChange={(event) => setBookHint(event.target.value)}
              placeholder="输入灵感提示词（可选）"
              className="h-11 flex-1 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={() => void handleGenerateBookOutline()}
              disabled={isSavingBook || isGeneratingBook}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGeneratingBook ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
              AI 生成全书大纲
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TextAreaField
            label="核心前提"
            placeholder="一句话概括你的故事，例：废土少年偶获上古传承，在末法时代重开修仙路"
            value={bookDraft.premise}
            rows={2}
            onChange={(value) => setBookDraft((previous) => ({ ...previous, premise: value }))}
            className="md:col-span-2"
          />

          <TextAreaField
            label="贯穿全书的核心冲突"
            placeholder="驱动整个故事的根本矛盾是什么？"
            value={bookDraft.centralConflict}
            rows={2}
            onChange={(value) =>
              setBookDraft((previous) => ({
                ...previous,
                centralConflict: value,
              }))
            }
          />

          <TextAreaField
            label="主题内核"
            placeholder="故事想要表达的深层主题，例：牺牲与救赎"
            value={bookDraft.thematicCore}
            rows={3}
            onChange={(value) =>
              setBookDraft((previous) => ({
                ...previous,
                thematicCore: value,
              }))
            }
          />

          <TextAreaField
            label="主角成长弧线"
            placeholder="主角从开头到结尾会经历怎样的转变？"
            value={bookDraft.protagonistArc}
            rows={4}
            onChange={(value) =>
              setBookDraft((previous) => ({
                ...previous,
                protagonistArc: value,
              }))
            }
          />

          <TextAreaField
            label="一句话卖点"
            placeholder="用一句话说清这本书最抓人的卖点"
            value={bookDraft.logline}
            rows={2}
            onChange={(value) =>
              setBookDraft((previous) => ({
                ...previous,
                logline: value,
              }))
            }
            className="md:col-span-2"
          />

          <TextAreaField
            label="能力体系"
            placeholder="这本书的修炼 / 战斗 / 规则体系如何运转？"
            value={bookDraft.powerSystem}
            rows={3}
            onChange={(value) =>
              setBookDraft((previous) => ({
                ...previous,
                powerSystem: value,
              }))
            }
          />

          <TextAreaField
            label="对抗体系"
            placeholder="主角长期对抗的敌对系统、秩序或压制机制是什么？"
            value={bookDraft.antagonistSystem}
            rows={3}
            onChange={(value) =>
              setBookDraft((previous) => ({
                ...previous,
                antagonistSystem: value,
              }))
            }
          />

          <TextAreaField
            label="叙事弧线"
            placeholder="例如：开篇求生 -> 中段扩张 -> 后段清算 -> 终局重构"
            value={bookDraft.narrativeArc}
            rows={2}
            onChange={(value) =>
              setBookDraft((previous) => ({
                ...previous,
                narrativeArc: value,
              }))
            }
            className="md:col-span-2"
          />

          <TextAreaField
            label="结局方向"
            placeholder="故事大致朝什么方向收束？不需要详细剧透"
            value={bookDraft.endgameHint}
            rows={3}
            onChange={(value) =>
              setBookDraft((previous) => ({
                ...previous,
                endgameHint: value,
              }))
            }
          />

          <div className="md:col-span-2">
            <ListFieldEditor
              label="世界核心规则"
              values={bookDraft.worldRules}
              addPlaceholder="输入一条不可违反的世界规则，回车直接添加"
              textModePlaceholder={
                '不可违反的设定，每行一条。例：\n灵气枯竭后修炼速度降低十倍\n破碎空间无法使用传送阵'
              }
              emptyText="还没有世界规则。逐条添加之后，AI 在生成章节时更容易守住设定边界。"
              helperText="不可违反的设定会直接影响后续所有生成步骤。"
              mode={listFieldModes['book.worldRules'] ?? 'cards'}
              inputValue={listFieldInputs['book.worldRules'] ?? ''}
              onInputChange={(value) => setListFieldInput('book.worldRules', value)}
              onChange={(values) =>
                setBookDraft((previous) => ({
                  ...previous,
                  worldRules: values,
                }))
              }
              onToggleMode={() =>
                setListFieldMode(
                  'book.worldRules',
                  (listFieldModes['book.worldRules'] ?? 'cards') === 'cards' ? 'text' : 'cards',
                )
              }
            />
          </div>

          <div>
            <ListFieldEditor
              label="副线规划"
              values={bookDraft.subPlots}
              addPlaceholder="输入一条副线 / 暗线，回车直接添加"
              textModePlaceholder={'每行一条副线，例：\n量天司线\n情感线\n宗门权力线'}
              emptyText="还没有副线规划。长篇建议至少提前写出 2 到 4 条持续副线。"
              helperText="这里写的是长期存在的副线，不是单章支线。"
              mode={listFieldModes['book.subPlots'] ?? 'cards'}
              inputValue={listFieldInputs['book.subPlots'] ?? ''}
              onInputChange={(value) => setListFieldInput('book.subPlots', value)}
              onChange={(values) =>
                setBookDraft((previous) => ({
                  ...previous,
                  subPlots: values,
                }))
              }
              onToggleMode={() =>
                setListFieldMode(
                  'book.subPlots',
                  (listFieldModes['book.subPlots'] ?? 'cards') === 'cards' ? 'text' : 'cards',
                )
              }
            />
          </div>

          <TextListField
            label="角色弧线"
            placeholder={'每行一条，使用“角色名：弧线说明”格式，例如：\n许明：从相信律法到重写律法\n秦小昭：从复仇到底到重新选择归处'}
            values={serializeCharacterArcLines(bookDraft.characterArcs)}
            rows={5}
            onChange={(values) =>
              setBookDraft((previous) => ({
                ...previous,
                characterArcs: parseCharacterArcLines(values),
              }))
            }
            className="md:col-span-2"
          />

          <TextAreaField
            label="整体基调"
            placeholder="例：前期压抑沉重，中期燃血热血，后期苍凉厚重"
            value={bookDraft.toneGuide}
            rows={2}
            onChange={(value) =>
              setBookDraft((previous) => ({
                ...previous,
                toneGuide: value,
              }))
            }
            className="md:col-span-2"
          />
        </div>

      </article>

                </>
              ) : null}

              {outlineMode === 'outline' ? (
                <section className="space-y-4 rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">章纲工作区</p>
                      <h3 className="mt-2 text-xl font-semibold text-neutral-100">
                        {activeVolume ? `《${activeVolume.title}》章纲` : '先选择一卷'}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-neutral-400">
                        这里维护正文前的执行纲要。章纲可直接新建，不依赖章节拍；若当前章已有章节拍，也可以一键导入作为起稿。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                        当前章纲：{activeVolumeOutlineRows.filter((item) => item.outline !== null).length}/{activeVolumeOutlineRows.length}
                      </span>
                    </div>
                  </div>

                  {!activeVolume ? (
                    <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 px-4 py-5 text-sm text-neutral-500">
                      当前还没有可操作的卷。先在左侧创建或选择一卷，再进入章纲工作区。
                    </div>
                  ) : activeVolumeOutlineRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 px-4 py-5 text-sm text-neutral-500">
                      当前卷下还没有章节。先新建章节，再为每一章补章纲。
                    </div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="space-y-2">
                        {activeVolumeOutlineRows.map((row) => {
                          const active = selectedOutlineRow?.chapterId === row.chapterId;
                          const outlineSummary = row.outline ? serializeChapterOutlineDraft(createChapterOutlineDraft(row.outline)) : '';

                          return (
                            <button
                              key={row.chapterId}
                              type="button"
                              onClick={() => selectOutlineChapter(row.chapterId)}
                              className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                                active
                                  ? 'border-emerald-400/40 bg-emerald-500/10'
                                  : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700 hover:bg-neutral-900'
                              }`}
                            >
                              <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">第 {row.chapterNumber} 章</p>
                              <p className="mt-2 text-sm font-medium text-neutral-100">{row.chapterTitle}</p>
                              {typeof row.milestoneIndex === 'number' ? (
                                <p className="mt-2 text-xs text-neutral-500">阶段 {row.milestoneIndex + 1}</p>
                              ) : null}
                              <p className="mt-2 line-clamp-3 text-xs leading-6 text-neutral-500">
                                {outlineSummary || '当前还没有章纲，可直接手工新建，或从章节拍导入。'}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      {selectedOutlineRow && selectedOutlineDraft ? (
                        <section className="space-y-4 rounded-3xl border border-neutral-800 bg-neutral-950/50 p-5">
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">当前章纲</p>
                              <p className="mt-2 text-sm text-neutral-500">
                                第 {selectedOutlineRow.chapterNumber} 章标题直接复用现有章节名；修改这里会同步写回章节本体。
                              </p>
                              <p className="mt-2 text-xs text-neutral-500">
                                当前写作单位：{getChapterWriteUnitCount(selectedOutlineDraft)} 个
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleExportChapterOutline(selectedOutlineRow)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-2.5 text-sm text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900"
                              >
                                <Download size={15} />
                                导出 JSON
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  openImportDialog({
                                    type: 'chapter-outline',
                                    chapterId: selectedOutlineRow.chapterId,
                                  })
                                }
                                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-2.5 text-sm text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900"
                              >
                                <Upload size={15} />
                                导入 JSON
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleImportOutlineFromBeat(selectedOutlineRow)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 py-2.5 text-sm text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900"
                              >
                                <Sparkles size={15} />
                                从章节拍导入
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSaveChapterOutline(selectedOutlineRow)}
                                disabled={savingOutlineChapterId === selectedOutlineRow.chapterId}
                                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingOutlineChapterId === selectedOutlineRow.chapterId ? (
                                  <LoaderCircle size={15} className="animate-spin" />
                                ) : (
                                  <Save size={15} />
                                )}
                                保存章纲
                              </button>
                            </div>
                          </div>

                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-neutral-200">章节标题</span>
                            <input
                              value={selectedOutlineRow.chapterTitle}
                              onChange={(event) => void updateChapterTitle(selectedOutlineRow.chapterId, event.target.value)}
                              className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-4 text-sm text-neutral-100 outline-none transition focus:border-emerald-400"
                            />
                          </label>

                          <TextAreaField
                            label="章节目标"
                            placeholder="这一章完成之后，读者必须明确得到什么推进？"
                            value={selectedOutlineDraft.goal}
                            rows={2}
                            onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { goal: value })}
                          />

                          <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-neutral-200">写作模块开关</p>
                                <p className="mt-1 text-xs leading-6 text-neutral-500">这里只控制额外注入到写作阶段 system prompt 的模块，不会出现在章纲正文文本里。</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {[
                                ['strand_weave', '三线节奏'],
                                ['cool_points', '爽点逻辑'],
                              ].map(([moduleKey, label]) => {
                                const active = (selectedOutlineDraft.promptModuleHints?.extraPrewriteModules ?? []).includes(
                                  moduleKey as PromptModuleKey,
                                );

                                return (
                                  <button
                                    key={moduleKey}
                                    type="button"
                                    onClick={() => toggleOutlinePromptModule(selectedOutlineRow.chapterId, moduleKey as PromptModuleKey)}
                                    className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                                      active
                                        ? 'border-emerald-400/40 bg-emerald-500/12 text-emerald-50'
                                        : 'border-neutral-700 bg-neutral-950/60 text-neutral-200 hover:border-neutral-600 hover:bg-neutral-900'
                                    }`}
                                  >
                                    <CheckCircle2 size={14} className={active ? 'opacity-100' : 'opacity-40'} />
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </section>

                          <div className="grid gap-4 md:grid-cols-2">
                            <TextAreaField
                              label="写作模式说明"
                              placeholder="例如：单场景直出整章 / 按场景推进"
                              value={selectedOutlineDraft.generationModeHint === 'scene-by-scene' ? '按场景推进' : '单场景直出整章'}
                              rows={2}
                              onChange={(value) =>
                                updateChapterOutlineDraft(selectedOutlineRow.chapterId, {
                                  generationModeHint: value.includes('场景推进') ? 'scene-by-scene' : 'single-scene-chapter',
                                })
                              }
                            />
                            <TextAreaField
                              label="场景决策说明"
                              placeholder="为什么这一章应该按一个完整场景，或按多个场景拆写？"
                              value={selectedOutlineDraft.sceneDecisionNote ?? ''}
                              rows={3}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { sceneDecisionNote: value })}
                            />
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <TextAreaField
                              label="本章功能"
                              placeholder="这一章整体承担什么作用？"
                              value={selectedOutlineDraft.chapterFunction ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { chapterFunction: value })}
                            />
                            <TextAreaField
                              label="章节边界"
                              placeholder="这章不能越过什么线？"
                              value={selectedOutlineDraft.chapterBoundary ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { chapterBoundary: value })}
                            />
                            <TextAreaField
                              label="揭露上限"
                              placeholder="这章最多揭露到哪一步？"
                              value={selectedOutlineDraft.revealCeiling ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { revealCeiling: value })}
                            />
                            <TextAreaField
                              label="焦点角色"
                              placeholder="这一章的主要观察点/发力点是谁？"
                              value={selectedOutlineDraft.focusCharacter ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { focusCharacter: value })}
                            />
                            <TextAreaField
                              label="开章状态"
                              placeholder="这一章一开始人物/局势处于什么状态？"
                              value={selectedOutlineDraft.openingState ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { openingState: value })}
                            />
                            <TextAreaField
                              label="收章状态"
                              placeholder="这一章结束后人物/局势落在哪？"
                              value={selectedOutlineDraft.closingState ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { closingState: value })}
                            />
                            <TextAreaField
                              label="主线推进"
                              placeholder="这一章主线发生什么变化？"
                              value={selectedOutlineDraft.mainPlot ?? ''}
                              rows={3}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { mainPlot: value })}
                              className="md:col-span-2"
                            />
                            <TextAreaField
                              label="支线推进"
                              placeholder="支线或角色线怎么动？"
                              value={selectedOutlineDraft.subPlot ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { subPlot: value })}
                            />
                            <TextAreaField
                              label="核心场景"
                              placeholder="这一章的主场景是什么？"
                              value={selectedOutlineDraft.coreScene ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { coreScene: value })}
                            />
                            <TextListField
                              label="必须出场"
                              placeholder="每行一条"
                              values={selectedOutlineDraft.mustAppearCharacters ?? []}
                              rows={3}
                              onChange={(values) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { mustAppearCharacters: values })}
                            />
                            <TextListField
                              label="可出场候选"
                              placeholder="每行一条"
                              values={selectedOutlineDraft.availableCharacters ?? []}
                              rows={3}
                              onChange={(values) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { availableCharacters: values })}
                            />
                            <TextListField
                              label="场景锚点"
                              placeholder="每行一条"
                              values={selectedOutlineDraft.sceneAnchors ?? []}
                              rows={3}
                              onChange={(values) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { sceneAnchors: values })}
                            />
                            <TextAreaField
                              label="信息预算"
                              placeholder="本章允许揭露多少、保留多少？"
                              value={selectedOutlineDraft.infoBudget ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { infoBudget: value })}
                            />
                            <TextAreaField
                              label="力量变化"
                              placeholder="力量、代价、限制怎么变化？"
                              value={selectedOutlineDraft.powerShift ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { powerShift: value })}
                            />
                            <TextAreaField
                              label="人身冲突点"
                              placeholder="本章最硬的人身冲突是什么？"
                              value={selectedOutlineDraft.personalConflict ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { personalConflict: value })}
                            />
                            <TextAreaField
                              label="情绪落点"
                              placeholder="本章结束时情绪落在哪？"
                              value={selectedOutlineDraft.emotionalOutcome ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { emotionalOutcome: value })}
                            />
                            <TextAreaField
                              label="章节钩子"
                              placeholder="本章结尾把读者推向哪里？"
                              value={selectedOutlineDraft.chapterHook ?? ''}
                              rows={2}
                              onChange={(value) => updateChapterOutlineDraft(selectedOutlineRow.chapterId, { chapterHook: value })}
                              className="md:col-span-2"
                            />
                          </div>

                          <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-neutral-200">场景清单</p>
                                <p className="mt-1 text-xs leading-6 text-neutral-500">场景是正文生成的主控单位；如果这里只有一个场景，系统会直接按整章生成。</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => addOutlineSceneDraft(selectedOutlineRow.chapterId)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900"
                              >
                                <Plus size={13} />
                                新增场景
                              </button>
                            </div>
                            {(selectedOutlineDraft.sceneDrafts ?? []).length === 0 ? (
                              <p className="text-xs text-neutral-500">当前还没有场景草稿，建议先补 1 到 3 个 scene，再决定是否保留 beat 骨架。</p>
                            ) : (
                              <div className="space-y-3">
                                {(selectedOutlineDraft.sceneDrafts ?? []).map((scene, index) => (
                                  <div key={`${selectedOutlineRow.chapterId}-scene-${index}`} className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <TextAreaField
                                        label={`Scene ${index + 1} 标题`}
                                        placeholder="例如：第七房旧卷桌前"
                                        value={scene.sceneTitle}
                                        rows={2}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { sceneTitle: value })}
                                      />
                                      <TextAreaField
                                        label="场景 ID"
                                        placeholder="例如：scene_01"
                                        value={scene.sceneId}
                                        rows={2}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { sceneId: value })}
                                      />
                                      <TextAreaField
                                        label="宏观场景"
                                        placeholder="例如：刑律司第七房"
                                        value={scene.macroScene}
                                        rows={2}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { macroScene: value })}
                                      />
                                      <TextAreaField
                                        label="场景作用"
                                        placeholder="这一场主要承担什么叙事职责？"
                                        value={scene.sceneRole}
                                        rows={2}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { sceneRole: value })}
                                      />
                                      <TextAreaField
                                        label="场景目标"
                                        placeholder="这场必须完成什么推进？"
                                        value={scene.sceneGoal}
                                        rows={3}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { sceneGoal: value })}
                                      />
                                      <TextAreaField
                                        label="场景阻力"
                                        placeholder="这场最大的阻力是什么？"
                                        value={scene.sceneObstacle}
                                        rows={3}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { sceneObstacle: value })}
                                      />
                                      <TextAreaField
                                        label="时间跨度"
                                        placeholder="例如：半天内连续推进，无明显切场"
                                        value={scene.sceneTimeSpan}
                                        rows={2}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { sceneTimeSpan: value })}
                                      />
                                      <TextAreaField
                                        label="场景节奏"
                                        placeholder="例如：冷压慢起，尾部极轻收钩"
                                        value={scene.scenePacing}
                                        rows={2}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { scenePacing: value })}
                                      />
                                      <TextAreaField
                                        label="场景结果"
                                        placeholder="这场结束后，读者具体得到什么结果？"
                                        value={scene.sceneResult}
                                        rows={3}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { sceneResult: value })}
                                      />
                                      <TextAreaField
                                        label="场景钩子"
                                        placeholder="这场结尾如何把读者推到下一步？"
                                        value={scene.sceneHook}
                                        rows={3}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { sceneHook: value })}
                                      />
                                      <label className="space-y-2">
                                        <span className="text-xs font-medium text-neutral-300">预计字数</span>
                                        <input
                                          type="number"
                                          min={0}
                                          value={scene.estimatedWords || ''}
                                          onChange={(event) =>
                                            updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                              estimatedWords: Number(event.target.value) || 0,
                                            })
                                          }
                                          className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                        />
                                      </label>
                                      <div />
                                      <TextListField
                                        label="参与角色"
                                        placeholder="每行一条"
                                        values={getSceneActorNames(scene.actors)}
                                        rows={3}
                                        onChange={(values) =>
                                          updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                            actors: reconcileSceneActorRefs(scene.actors, values, 'support'),
                                          })
                                        }
                                      />
                                      <TextListField
                                        label="可出场候选"
                                        placeholder="每行一条"
                                        values={getSceneActorNames(scene.availableCharacters)}
                                        rows={3}
                                        onChange={(values) =>
                                          updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                            availableCharacters: reconcileSceneActorRefs(scene.availableCharacters, values, 'candidate'),
                                          })
                                        }
                                      />
                                      <TextListField
                                        label="场景锚点"
                                        placeholder="每行一条"
                                        values={scene.sceneAnchors}
                                        rows={3}
                                        onChange={(values) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { sceneAnchors: values })}
                                      />
                                      <TextListField
                                        label="beat 引用"
                                        placeholder="每行一条 beatId"
                                        values={scene.beatRefs}
                                        rows={3}
                                        onChange={(values) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { beatRefs: values })}
                                      />
                                      <TextAreaField
                                        label="信息预算"
                                        placeholder="本场允许揭到哪，不揭到哪？"
                                        value={scene.infoBudget}
                                        rows={2}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { infoBudget: value })}
                                      />
                                      <TextAreaField
                                        label="力量变化"
                                        placeholder="本场的能力/代价/限制怎么变化？"
                                        value={scene.powerShift}
                                        rows={2}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { powerShift: value })}
                                      />
                                      <TextAreaField
                                        label="人身冲突点"
                                        placeholder="本场最硬的人身冲突是什么？"
                                        value={scene.personalConflict}
                                        rows={2}
                                        onChange={(value) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { personalConflict: value })}
                                      />
                                      <TextListField
                                        label="禁区提示"
                                        placeholder="每行一条"
                                        values={scene.forbiddenNotes}
                                        rows={3}
                                        onChange={(values) => updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, { forbiddenNotes: values })}
                                      />
                                    </div>
                                    <div className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3 md:grid-cols-2">
                                      <div className="md:col-span-2 flex items-center justify-between">
                                        <p className="text-xs font-medium text-neutral-300">场景级伏笔引用</p>
                                      </div>
                                      {(scene.foreshadowRefs ?? []).length === 0 ? (
                                        <p className="md:col-span-2 text-xs text-neutral-500">当前场景还没有伏笔引用。</p>
                                      ) : null}
                                      {(scene.foreshadowRefs ?? []).map((ref, refIndex) => (
                                        <div key={`${scene.sceneId || index}-scene-foreshadow-${refIndex}`} className="grid gap-3 md:col-span-2 md:grid-cols-2">
                                          <label className="space-y-2">
                                            <span className="text-xs font-medium text-neutral-300">伏笔 ID</span>
                                            <input
                                              value={ref.foreshadowId}
                                              onChange={(event) =>
                                                updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                                  foreshadowRefs: (scene.foreshadowRefs ?? []).map((item, itemIndex) =>
                                                    itemIndex === refIndex ? normalizeForeshadowRef({ ...item, foreshadowId: event.target.value }) : item,
                                                  ),
                                                })
                                              }
                                              className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                            />
                                          </label>
                                          <label className="space-y-2">
                                            <span className="text-xs font-medium text-neutral-300">伏笔标题</span>
                                            <input
                                              value={ref.foreshadowTitle ?? ''}
                                              onChange={(event) =>
                                                updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                                  foreshadowRefs: (scene.foreshadowRefs ?? []).map((item, itemIndex) =>
                                                    itemIndex === refIndex ? normalizeForeshadowRef({ ...item, foreshadowTitle: event.target.value }) : item,
                                                  ),
                                                })
                                              }
                                              className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                            />
                                          </label>
                                          <label className="space-y-2">
                                            <span className="text-xs font-medium text-neutral-300">动作</span>
                                            <select
                                              value={ref.action}
                                              onChange={(event) =>
                                                updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                                  foreshadowRefs: (scene.foreshadowRefs ?? []).map((item, itemIndex) =>
                                                    itemIndex === refIndex ? normalizeForeshadowRef({ ...item, action: event.target.value as ForeshadowRef['action'] }) : item,
                                                  ),
                                                })
                                              }
                                              className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                            >
                                              <option value="shadow">留影</option>
                                              <option value="plant">埋设</option>
                                              <option value="advance">推进</option>
                                              <option value="payoff">回收</option>
                                            </select>
                                          </label>
                                          <label className="space-y-2">
                                            <span className="text-xs font-medium text-neutral-300">强度</span>
                                            <select
                                              value={ref.intensity}
                                              onChange={(event) =>
                                                updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                                  foreshadowRefs: (scene.foreshadowRefs ?? []).map((item, itemIndex) =>
                                                    itemIndex === refIndex ? normalizeForeshadowRef({ ...item, intensity: event.target.value as ForeshadowRef['intensity'] }) : item,
                                                  ),
                                                })
                                              }
                                              className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                            >
                                              <option value="light">轻</option>
                                              <option value="medium">中</option>
                                              <option value="heavy">重</option>
                                            </select>
                                          </label>
                                          <label className="space-y-2 md:col-span-2">
                                            <span className="text-xs font-medium text-neutral-300">备注</span>
                                            <textarea
                                              value={ref.note ?? ''}
                                              onChange={(event) =>
                                                updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                                  foreshadowRefs: (scene.foreshadowRefs ?? []).map((item, itemIndex) =>
                                                    itemIndex === refIndex ? normalizeForeshadowRef({ ...item, note: event.target.value }) : item,
                                                  ),
                                                })
                                              }
                                              rows={2}
                                              className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400"
                                            />
                                          </label>
                                          <div className="md:col-span-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                                  foreshadowRefs: (scene.foreshadowRefs ?? []).filter((_, itemIndex) => itemIndex !== refIndex),
                                                })
                                              }
                                              className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-500/20"
                                            >
                                              <X size={13} />
                                              删除场景伏笔
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                      <div className="md:col-span-2 flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateOutlineSceneDraft(selectedOutlineRow.chapterId, index, {
                                              foreshadowRefs: [...(scene.foreshadowRefs ?? []), createEmptyForeshadowRef()],
                                            })
                                          }
                                          className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900"
                                        >
                                          <Plus size={13} />
                                          新增场景伏笔
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeOutlineSceneDraft(selectedOutlineRow.chapterId, index)}
                                          className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-500/20"
                                        >
                                          <X size={13} />
                                          删除场景
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>

                          <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-neutral-200">伏笔引用</p>
                              <button
                                type="button"
                                onClick={() => addOutlineForeshadowRef(selectedOutlineRow.chapterId)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900"
                              >
                                <Plus size={13} />
                                新增伏笔
                              </button>
                            </div>
                            {(selectedOutlineDraft.foreshadowRefs ?? []).length === 0 ? (
                              <p className="text-xs text-neutral-500">当前还没有章节级伏笔引用，正文会回退到里程碑或卷纲层。</p>
                            ) : (
                              <div className="space-y-3">
                                {(selectedOutlineDraft.foreshadowRefs ?? []).map((ref, index) => (
                                  <div key={`${selectedOutlineRow.chapterId}-foreshadow-${index}`} className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3 md:grid-cols-2">
                                    <label className="space-y-2">
                                      <span className="text-xs font-medium text-neutral-300">伏笔 ID</span>
                                      <input
                                        value={ref.foreshadowId}
                                        onChange={(event) =>
                                          updateOutlineForeshadowRef(selectedOutlineRow.chapterId, index, {
                                            foreshadowId: event.target.value,
                                          })
                                        }
                                        className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                      />
                                    </label>
                                    <label className="space-y-2">
                                      <span className="text-xs font-medium text-neutral-300">伏笔标题</span>
                                      <input
                                        value={ref.foreshadowTitle ?? ''}
                                        onChange={(event) =>
                                          updateOutlineForeshadowRef(selectedOutlineRow.chapterId, index, {
                                            foreshadowTitle: event.target.value,
                                          })
                                        }
                                        className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                      />
                                    </label>
                                    <label className="space-y-2">
                                      <span className="text-xs font-medium text-neutral-300">动作</span>
                                      <select
                                        value={ref.action}
                                        onChange={(event) =>
                                          updateOutlineForeshadowRef(selectedOutlineRow.chapterId, index, {
                                            action: event.target.value as ForeshadowRef['action'],
                                          })
                                        }
                                        className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                      >
                                        <option value="shadow">留影</option>
                                        <option value="plant">埋设</option>
                                        <option value="advance">推进</option>
                                        <option value="payoff">回收</option>
                                      </select>
                                    </label>
                                    <label className="space-y-2">
                                      <span className="text-xs font-medium text-neutral-300">强度</span>
                                      <select
                                        value={ref.intensity}
                                        onChange={(event) =>
                                          updateOutlineForeshadowRef(selectedOutlineRow.chapterId, index, {
                                            intensity: event.target.value as ForeshadowRef['intensity'],
                                          })
                                        }
                                        className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                      >
                                        <option value="light">轻</option>
                                        <option value="medium">中</option>
                                        <option value="heavy">重</option>
                                      </select>
                                    </label>
                                    <label className="space-y-2 md:col-span-2">
                                      <span className="text-xs font-medium text-neutral-300">备注</span>
                                      <textarea
                                        value={ref.note ?? ''}
                                        onChange={(event) =>
                                          updateOutlineForeshadowRef(selectedOutlineRow.chapterId, index, {
                                            note: event.target.value,
                                          })
                                        }
                                        rows={2}
                                        className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400"
                                      />
                                    </label>
                                    <div className="md:col-span-2">
                                      <button
                                        type="button"
                                        onClick={() => removeOutlineForeshadowRef(selectedOutlineRow.chapterId, index)}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-500/20"
                                      >
                                        <X size={13} />
                                        删除伏笔引用
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>

                          <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-neutral-200">场景内部推进骨架</p>
                                <p className="mt-1 text-xs leading-6 text-neutral-500">beats 只承担场景内部推进骨架，不再直接作为写作切分单位。</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => addOutlineBeatDraft(selectedOutlineRow.chapterId)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900"
                              >
                                <Plus size={13} />
                                新增 beat
                              </button>
                            </div>
                            {(selectedOutlineDraft.beatDrafts ?? []).length === 0 ? (
                              <p className="text-xs text-neutral-500">当前还没有场景内部 beat 骨架；如果场景本身已经足够完整，也可以不强制细拆。</p>
                            ) : (
                              <div className="space-y-3">
                                {(selectedOutlineDraft.beatDrafts ?? []).map((beat, index) => (
                                  <div key={`${selectedOutlineRow.chapterId}-beat-${index}`} className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3 md:grid-cols-2">
                                    <TextAreaField
                                      label={`Beat ${index + 1} 标题`}
                                      placeholder="这一小段在干什么？"
                                      value={beat.beatTitle}
                                      rows={2}
                                      onChange={(value) => updateOutlineBeatDraft(selectedOutlineRow.chapterId, index, { beatTitle: value })}
                                    />
                                    <TextAreaField
                                      label="场景"
                                      placeholder="这一拍主要发生在哪？"
                                      value={beat.scene}
                                      rows={2}
                                      onChange={(value) => updateOutlineBeatDraft(selectedOutlineRow.chapterId, index, { scene: value })}
                                    />
                                    <TextListField
                                      label="场景锚点"
                                      placeholder="每行一条"
                                      values={beat.anchors}
                                      rows={3}
                                      onChange={(values) => updateOutlineBeatDraft(selectedOutlineRow.chapterId, index, { anchors: values })}
                                    />
                                    <TextListField
                                      label="参与角色"
                                      placeholder="每行一条"
                                      values={beat.actors}
                                      rows={3}
                                      onChange={(values) => updateOutlineBeatDraft(selectedOutlineRow.chapterId, index, { actors: values })}
                                    />
                                    <TextAreaField
                                      label="推进动作"
                                      placeholder="这一拍到底推进了什么？"
                                      value={beat.progress}
                                      rows={3}
                                      onChange={(value) => updateOutlineBeatDraft(selectedOutlineRow.chapterId, index, { progress: value })}
                                      className="md:col-span-2"
                                    />
                                    <TextAreaField
                                      label="结果落点"
                                      placeholder="这一拍结束时局势落在哪？"
                                      value={beat.result}
                                      rows={2}
                                      onChange={(value) => updateOutlineBeatDraft(selectedOutlineRow.chapterId, index, { result: value })}
                                    />
                                    <TextListField
                                      label="实体引用"
                                      placeholder="每行一条"
                                      values={beat.entityRefs}
                                      rows={3}
                                      onChange={(values) => updateOutlineBeatDraft(selectedOutlineRow.chapterId, index, { entityRefs: values })}
                                    />
                                    <TextListField
                                      label="禁区提示"
                                      placeholder="每行一条"
                                      values={beat.forbiddenNotes}
                                      rows={3}
                                      onChange={(values) => updateOutlineBeatDraft(selectedOutlineRow.chapterId, index, { forbiddenNotes: values })}
                                    />
                                    <div className="md:col-span-2">
                                      <button
                                        type="button"
                                        onClick={() => removeOutlineBeatDraft(selectedOutlineRow.chapterId, index)}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-500/20"
                                      >
                                        <X size={13} />
                                        删除 beat
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>
                        </section>
                      ) : null}
                    </div>
                  )}
                </section>
              ) : outlineMode === 'beats' ? (
                <section className="space-y-4 rounded-[28px] border border-neutral-800 bg-neutral-900/70 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">章节拍工作区</p>
                      <h3 className="mt-2 text-xl font-semibold text-neutral-100">
                        {activeVolume ? `《${activeVolume.title}》章节拍` : '先选择一卷'}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-neutral-400">
                        用紧凑列表先定位章节，再在右侧检查器中完成细改。几百章场景下不再需要整页长滚动。
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {activeVolume ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleExportChapterBeats(activeVolume.id, activeSelectedMilestoneIndex)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-1.5 text-xs text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900"
                          >
                            <Download size={13} />
                            导出 JSON
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openImportDialog({
                                type: 'chapter-beats',
                                volumeId: activeVolume.id,
                                milestoneIndex: activeSelectedMilestoneIndex,
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-1.5 text-xs text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900"
                          >
                            <Upload size={13} />
                            导入 JSON
                          </button>
                        </>
                      ) : null}
                      <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                        全部 {beatStatusCounts.all}
                      </span>
                      <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                        未规划 {beatStatusCounts.empty}
                      </span>
                      <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                        已规划 {beatStatusCounts.planned}
                      </span>
                      <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                        已推进 {beatStatusCounts.progressed}
                      </span>
                    </div>
                  </div>

                  {activeVolume ? (
                    <>
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                        {activeSelectedMilestoneIndex === null && activeVolumeChapters.length === 0 ? (
                          <input
                            value={beatChapterCountMap[activeVolume.id] ?? ''}
                            onChange={(event) =>
                              setBeatChapterCountMap((previous) => ({
                                ...previous,
                                [activeVolume.id]: event.target.value,
                              }))
                            }
                            placeholder={`目标章节数（默认 ${activeVolumeDefaultChapterCount}）`}
                            inputMode="numeric"
                            className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-emerald-400 xl:w-[180px]"
                          />
                        ) : null}
                        <input
                          value={beatHintMap[activeVolume.id] ?? ''}
                          onChange={(event) =>
                            setBeatHintMap((previous) => ({
                              ...previous,
                              [activeVolume.id]: event.target.value,
                            }))
                          }
                          placeholder="输入裂变提示词（可选）"
                          className="h-11 flex-1 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
                        />
                        <button
                          type="button"
                          onClick={() => openFissionDialog(activeVolume.id)}
                          disabled={generatingBeatVolumeId === activeVolume.id}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {generatingBeatVolumeId === activeVolume.id ? (
                            <LoaderCircle size={15} className="animate-spin" />
                          ) : (
                            <Sparkles size={15} />
                          )}
                          {activeFilteredMilestone
                            ? `AI 裂变阶段 ${activeSelectedMilestoneIndex! + 1}`
                            : 'AI 裂变本卷'}
                        </button>
                      </div>

                      {activeFilteredMilestone ? (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs leading-6 text-neutral-300">
                          <p>
                            当前已按里程碑过滤：
                            {activeFilteredMilestone.title.trim()
                              ? activeFilteredMilestone.title.trim()
                              : `阶段 ${(activeSelectedMilestoneIndex ?? 0) + 1}`}。
                            范围为第{' '}
                            {computeMilestoneStartChapter(
                              activeVolumeDraft.milestones,
                              activeSelectedMilestoneIndex ?? 0,
                            )}{' '}
                            章到第{' '}
                            {computeMilestoneEndChapter(
                              activeVolumeDraft.milestones,
                              activeSelectedMilestoneIndex ?? 0,
                            )}{' '}
                            章。
                          </p>
                          <p className="mt-1 text-neutral-500">
                            左侧切换里程碑会直接过滤章节列表，右侧检查器继续编辑单章细节。
                          </p>
                        </div>
                      ) : null}

                      <ChapterBeatCompactList
                        items={chapterBeatListItems}
                        emptyTitle="当前筛选下没有可显示的章节拍"
                        emptyDescription={
                          beatFilterStatus === 'all'
                            ? '当前卷还没有任何章节拍。你可以先裂变当前卷，或者先补齐里程碑后按阶段裂变。'
                            : '当前筛选条件下没有命中的章节拍，试着切换里程碑或状态筛选。'
                        }
                        onSelect={selectBeatRow}
                        registerRowNode={(rowKey, node) => {
                          beatRowRefs.current[rowKey] = node;
                        }}
                      />
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 px-4 py-5 text-sm text-neutral-500">
                      当前还没有可操作的卷。先在左侧创建或选择一卷，再进入章节拍工作区。
                    </div>
                  )}
                </section>
              ) : outlineMode === 'book' ? null : (
              <section className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">卷大纲</p>
            <h3 className="mt-2 text-xl font-semibold text-neutral-100">把每一卷拆成阶段目标与弧线</h3>
          </div>
          {isBootstrapping ? (
            <span className="inline-flex items-center gap-2 text-xs text-neutral-500">
              <LoaderCircle size={13} className="animate-spin" />
              正在加载
            </span>
          ) : null}
        </header>

        {sortedVolumes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/40 p-6 text-sm text-neutral-400">
            当前项目还没有卷，请先在卷管理中创建卷后再填写卷大纲。
          </div>
        ) : (
          sortedVolumes.map((volume, index) => {
            if (activeVolume?.id !== volume.id) {
              return null;
            }

            const draft = volumeDraftMap[volume.id] ?? createEmptyVolumeDraft();
            const isSavingCurrent = savingVolumeId === volume.id;
            const isGeneratingCurrent = generatingVolumeId === volume.id;
            const isGeneratingMilestonesCurrent = generatingMilestonesVolumeId === volume.id;
            const isExpanded = true;
            const progressLabel = getVolumeProgressLabel(draft);
            const milestoneStatuses = milestoneStatusMapByVolumeId.get(volume.id) ?? [];
            const selectedMilestoneIndex = Object.prototype.hasOwnProperty.call(selectedMilestoneIndexMap, volume.id)
              ? selectedMilestoneIndexMap[volume.id]
              : draft.milestones.length > 0
                ? 0
                : null;
            const selectedMilestone =
              typeof selectedMilestoneIndex === 'number' && selectedMilestoneIndex >= 0
                ? draft.milestones[selectedMilestoneIndex] ?? null
                : null;
            const selectedMilestoneStatus =
              selectedMilestone && typeof selectedMilestoneIndex === 'number'
                ? milestoneStatuses[selectedMilestoneIndex] ?? 'empty'
                : null;
            const beatRows = chapterBeatRowsByVolumeId.get(volume.id) ?? [];
            const defaultWholeVolumeChapterCount =
              draft.estimatedChapterCount > 0
                ? draft.estimatedChapterCount
                : draft.milestones.reduce((sum, milestone) => sum + Math.max(0, milestone.targetChapterCount), 0) || 12;
            const cardBaseClassName =
              focusVolumeId === volume.id
                ? 'border-indigo-500/40 shadow-[0_0_0_1px_rgba(99,102,241,0.18)]'
                : 'border-neutral-800';

            return (
              <article
                key={volume.id}
                ref={(node) => {
                  volumeCardRefs.current[volume.id] = node;
                }}
                className={`rounded-3xl border bg-neutral-900/70 ${cardBaseClassName}`}
              >
                <div className="flex items-start gap-3 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => toggleVolumeExpanded(volume.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">第 {volume.order} 卷</p>
                      <div className="mt-2 flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3">
                        <h4 className="truncate text-base font-semibold text-neutral-100">{volume.title}</h4>
                        <span className="text-xs text-neutral-500">{progressLabel}</span>
                      </div>
                    </div>
                    <span className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950/70 text-neutral-400">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                  </button>

                  <div
                    ref={(node) => {
                      volumeMenuRefs.current[volume.id] = node;
                    }}
                    className="relative flex-shrink-0"
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenVolumeMenuId((previous) => (previous === volume.id ? null : volume.id));
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950/70 text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200"
                      aria-label={`打开《${volume.title}》更多操作`}
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {openVolumeMenuId === volume.id ? (
                      <div className="absolute right-0 top-full z-10 mt-2 w-40 rounded-2xl border border-neutral-800 bg-neutral-950/95 p-2 shadow-2xl shadow-black/40">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenVolumeMenuId(null);
                            void handleRenameVolume(volume.id);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-900"
                        >
                          重命名卷
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenVolumeMenuId(null);
                            void handleMoveVolume(volume.id, 'up');
                          }}
                          disabled={index === 0}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          上移
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenVolumeMenuId(null);
                            void handleMoveVolume(volume.id, 'down');
                          }}
                          disabled={index === sortedVolumes.length - 1}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          下移
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-t border-neutral-800 px-5 py-5">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-neutral-500">
                        {index > 0 ? '生成时会参考上一卷大纲，帮助本卷承接前文。' : '首卷会主要依赖全书大纲来建立方向。'}
                      </p>
                      <span className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs text-neutral-400">
                        {progressLabel}
                      </span>
                    </div>

                    {outlineMode !== 'milestone' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <TextAreaField
                        label="本卷目标"
                        placeholder="这一卷最核心的推进目标是什么？"
                        value={draft.goal}
                        rows={2}
                        onChange={(value) => updateVolumeDraft(volume.id, { goal: value })}
                      />

                      <TextAreaField
                        label="核心冲突"
                        placeholder="这一卷最主要的对抗和阻力是什么？"
                        value={draft.keyConflict}
                        rows={2}
                        onChange={(value) => updateVolumeDraft(volume.id, { keyConflict: value })}
                      />

                      <TextAreaField
                        label="弧线概述"
                        placeholder="用一段话说明本卷如何起、承、转、合"
                        value={draft.arcSummary}
                        rows={4}
                        onChange={(value) => updateVolumeDraft(volume.id, { arcSummary: value })}
                        className="md:col-span-2"
                      />

                      <TextAreaField
                        label="卷初状态"
                        placeholder="开卷时主角、局势或关系处于什么状态？"
                        value={draft.entryState}
                        rows={3}
                        onChange={(value) => updateVolumeDraft(volume.id, { entryState: value })}
                      />

                      <TextAreaField
                        label="卷末状态"
                        placeholder="收卷时人物和局势会推进到哪里？"
                        value={draft.exitState}
                        rows={3}
                        onChange={(value) => updateVolumeDraft(volume.id, { exitState: value })}
                      />

                      <TextAreaField
                        label="明面对手"
                        placeholder="这一卷最直接的对手、势力或压制者是谁？"
                        value={draft.antagonist}
                        rows={2}
                        onChange={(value) => updateVolumeDraft(volume.id, { antagonist: value })}
                      />

                      <TextAreaField
                        label="本卷暗线"
                        placeholder="这一卷主要承接或推进哪条暗线？"
                        value={draft.subPlot}
                        rows={2}
                        onChange={(value) => updateVolumeDraft(volume.id, { subPlot: value })}
                      />

                      <TextAreaField
                        label="主角成长"
                        placeholder="主角在这一卷会完成什么成长、认知升级或能力变化？"
                        value={draft.protagonistGrowth}
                        rows={3}
                        onChange={(value) => updateVolumeDraft(volume.id, { protagonistGrowth: value })}
                      />

                      <TextAreaField
                        label="情感推进"
                        placeholder="这一卷的关系位移、情感张力或情绪主轴是什么？"
                        value={draft.emotionalArc}
                        rows={3}
                        onChange={(value) => updateVolumeDraft(volume.id, { emotionalArc: value })}
                      />

                      <TextAreaField
                        label="视角规划"
                        placeholder="例如：主视角跟许明，个别章切秦小昭，不进入反派内心"
                        value={draft.povPlan}
                        rows={3}
                        onChange={(value) => updateVolumeDraft(volume.id, { povPlan: value })}
                        className="md:col-span-2"
                      />

                      <label className="space-y-2">
                        <span className="text-sm font-medium text-neutral-200">预估总章数</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={draft.estimatedChapterCount > 0 ? String(draft.estimatedChapterCount) : ''}
                          onChange={(event) =>
                            updateVolumeDraft(volume.id, {
                              estimatedChapterCount: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                            })
                          }
                          placeholder="例如：100"
                          className="h-12 w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm font-medium text-neutral-200">预估字数</span>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={draft.estimatedWordCount > 0 ? String(draft.estimatedWordCount) : ''}
                          onChange={(event) =>
                            updateVolumeDraft(volume.id, {
                              estimatedWordCount: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                            })
                          }
                          placeholder="例如：300000"
                          className="h-12 w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
                        />
                      </label>

                      <div>
                        <ListFieldEditor
                          label="关键事件"
                          values={draft.keyEvents}
                          addPlaceholder="输入一条关键事件，回车直接添加"
                          textModePlaceholder={
                            '每行一条关键事件，例：\n主角第一次见到归炉井残碑\n谢无咎提出交换条件'
                          }
                          emptyText="未填写 · 先拆出几个关键节点，后续生成会更有方向。"
                          mode={listFieldModes[`volume.${volume.id}.keyEvents`] ?? 'cards'}
                          inputValue={listFieldInputs[`volume.${volume.id}.keyEvents`] ?? ''}
                          onInputChange={(value) => setListFieldInput(`volume.${volume.id}.keyEvents`, value)}
                          onChange={(values) => updateVolumeDraft(volume.id, { keyEvents: values })}
                          onToggleMode={() =>
                            setListFieldMode(
                              `volume.${volume.id}.keyEvents`,
                              (listFieldModes[`volume.${volume.id}.keyEvents`] ?? 'cards') === 'cards'
                                ? 'text'
                                : 'cards',
                            )
                          }
                        />
                      </div>

                      <TextListField
                        label="继承线头"
                        placeholder={'每行一条，使用“线名：承接说明”格式，例如：\n量天司线：上一卷只知道名字，这一卷要查到合法性来源\n秦小昭关系线：从临时合作推进到互相担保'}
                        values={serializeInheritedThreadLines(draft.inheritedThreads)}
                        rows={4}
                        onChange={(values) =>
                          updateVolumeDraft(volume.id, {
                            inheritedThreads: parseInheritedThreadLines(values),
                          })
                        }
                        className="md:col-span-2"
                      />

                      <div>
                        <ListFieldEditor
                          label="必需实体"
                          values={draft.requiredEntities ?? []}
                          addPlaceholder="输入一个本卷必需重点关注的实体"
                          textModePlaceholder={'每行一条必需实体，例：\n李四\n谢无咎\n归炉井'}
                          emptyText="未填写 · 只有必须持续挂在上下文里的实体才需要写。"
                          helperText="用于把本卷关键角色、势力或地点优先加入上下文。"
                          mode={listFieldModes[`volume.${volume.id}.requiredEntities`] ?? 'cards'}
                          inputValue={listFieldInputs[`volume.${volume.id}.requiredEntities`] ?? ''}
                          onInputChange={(value) =>
                            setListFieldInput(`volume.${volume.id}.requiredEntities`, value)
                          }
                          onChange={(values) => updateVolumeDraft(volume.id, { requiredEntities: values })}
                          onToggleMode={() =>
                            setListFieldMode(
                              `volume.${volume.id}.requiredEntities`,
                              (listFieldModes[`volume.${volume.id}.requiredEntities`] ?? 'cards') === 'cards'
                                ? 'text'
                                : 'cards',
                            )
                          }
                        />
                      </div>

                      <section className="md:col-span-2 space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-neutral-200">卷级伏笔引用</p>
                            <p className="mt-1 text-xs leading-6 text-neutral-500">
                              这里定义本卷整体要如何使用某条伏笔。强度和动作会作为卷级基线，后续可被里程碑和章纲覆盖。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addVolumeForeshadowRef(volume.id)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
                          >
                            <Plus size={14} />
                            新增伏笔引用
                          </button>
                        </div>

                        {(draft.foreshadowRefs ?? []).length === 0 ? (
                          <p className="text-xs text-neutral-500">当前还没有卷级伏笔引用。若这一卷只想给出整体基线，可以先从这里补。</p>
                        ) : (
                          <div className="space-y-3">
                            {(draft.foreshadowRefs ?? []).map((ref, index) => (
                              <div
                                key={`volume-${volume.id}-foreshadow-ref-${index}`}
                                className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3 md:grid-cols-2"
                              >
                                <label className="space-y-2">
                                  <span className="text-xs font-medium text-neutral-300">伏笔 ID</span>
                                  <input
                                    value={ref.foreshadowId}
                                    onChange={(event) =>
                                      updateVolumeForeshadowRef(volume.id, index, { foreshadowId: event.target.value })
                                    }
                                    className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                  />
                                </label>
                                <label className="space-y-2">
                                  <span className="text-xs font-medium text-neutral-300">伏笔标题</span>
                                  <input
                                    value={ref.foreshadowTitle ?? ''}
                                    onChange={(event) =>
                                      updateVolumeForeshadowRef(volume.id, index, { foreshadowTitle: event.target.value })
                                    }
                                    className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                  />
                                </label>
                                <label className="space-y-2">
                                  <span className="text-xs font-medium text-neutral-300">动作</span>
                                  <select
                                    value={ref.action}
                                    onChange={(event) =>
                                      updateVolumeForeshadowRef(volume.id, index, {
                                        action: event.target.value as ForeshadowRef['action'],
                                      })
                                    }
                                    className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                  >
                                    <option value="shadow">留影</option>
                                    <option value="plant">埋设</option>
                                    <option value="advance">推进</option>
                                    <option value="payoff">回收</option>
                                  </select>
                                </label>
                                <label className="space-y-2">
                                  <span className="text-xs font-medium text-neutral-300">强度</span>
                                  <select
                                    value={ref.intensity}
                                    onChange={(event) =>
                                      updateVolumeForeshadowRef(volume.id, index, {
                                        intensity: event.target.value as ForeshadowRef['intensity'],
                                      })
                                    }
                                    className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                  >
                                    <option value="light">轻</option>
                                    <option value="medium">中</option>
                                    <option value="heavy">重</option>
                                  </select>
                                </label>
                                <label className="space-y-2 md:col-span-2">
                                  <span className="text-xs font-medium text-neutral-300">备注</span>
                                  <textarea
                                    value={ref.note ?? ''}
                                    onChange={(event) =>
                                      updateVolumeForeshadowRef(volume.id, index, { note: event.target.value })
                                    }
                                    rows={2}
                                    className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400"
                                  />
                                </label>
                                <div className="md:col-span-2">
                                  <button
                                    type="button"
                                    onClick={() => removeVolumeForeshadowRef(volume.id, index)}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-500/20"
                                  >
                                    <Trash2 size={13} />
                                    删除伏笔引用
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>

                    </div>
                    ) : null}

                    {outlineMode === 'milestone' ? (
                      <div className="md:col-span-2">
                        <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-medium text-neutral-200">阶段里程碑</p>
                              <p className="mt-1 text-xs leading-6 text-neutral-500">
                                把长卷拆成 3 到 5 个阶段目标。后续滚动规划和批次裂变会优先参考这里。
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-neutral-500">
                                当前合计 {draft.milestones.reduce((sum, milestone) => sum + milestone.targetChapterCount, 0)} 章
                              </span>
                              <button
                                type="button"
                                onClick={() => addVolumeMilestone(volume.id)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
                              >
                                <Plus size={14} />
                                新增里程碑
                              </button>
                            </div>
                          </div>

                          {draft.milestones.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-neutral-800 px-4 py-5 text-sm text-neutral-500">
                              还没有阶段里程碑。建议先拆出 3 到 5 个阶段，每个阶段写清目标、冲突和大致章数。
                            </div>
                          ) : (
                            <div className="mt-4 space-y-4">
                              {draft.milestones.map((milestone, milestoneIndex) => (
                                <article key={`milestone-${volume.id}-${milestoneIndex}`} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                                        阶段 {milestoneIndex + 1}
                                      </p>
                                      <p className="mt-1 text-sm text-neutral-400">
                                        用来承接长卷中的一个叙事阶段，而不是单独某一章。
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleExportVolumeMilestone(volume.id, milestoneIndex)}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
                                      >
                                        <Download size={14} />
                                        导出
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openImportDialog({
                                            type: 'volume-milestone',
                                            volumeId: volume.id,
                                            milestoneIndex,
                                          })
                                        }
                                        disabled={isSavingCurrent}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <Upload size={14} />
                                        导入
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void removeVolumeMilestone(volume.id, milestoneIndex)}
                                        disabled={isSavingCurrent}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-neutral-700 text-neutral-400 transition hover:border-neutral-500 hover:bg-neutral-900 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label={`删除第 ${milestoneIndex + 1} 个里程碑`}
                                      >
                                        <X size={15} />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <TextAreaField
                                      label="阶段标题"
                                      placeholder="例如：初入中州，站稳脚跟"
                                      value={milestone.title}
                                      rows={2}
                                      onChange={(value) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { title: value })
                                      }
                                    />

                                    <label className="space-y-2">
                                      <span className="text-sm font-medium text-neutral-200">目标章数</span>
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={milestone.targetChapterCount > 0 ? String(milestone.targetChapterCount) : ''}
                                        onChange={(event) =>
                                          updateVolumeMilestoneDraft(volume.id, milestoneIndex, {
                                            targetChapterCount: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                                          })
                                        }
                                        placeholder="例如：30"
                                        className="h-12 w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
                                      />
                                    </label>

                                    <TextAreaField
                                      label="阶段目标"
                                      placeholder="这一阶段必须完成什么推进？"
                                      value={milestone.phaseGoal}
                                      rows={3}
                                      onChange={(value) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { phaseGoal: value })
                                      }
                                    />

                                    <TextAreaField
                                      label="阶段冲突"
                                      placeholder="这一阶段最主要的阻力和矛盾是什么？"
                                      value={milestone.phaseConflict}
                                      rows={3}
                                      onChange={(value) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { phaseConflict: value })
                                      }
                                    />

                                    <TextAreaField
                                      label="进入状态"
                                      placeholder="进入这一阶段时，人物和局势是什么状态？"
                                      value={milestone.entryState}
                                      rows={3}
                                      onChange={(value) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { entryState: value })
                                      }
                                    />

                                    <TextAreaField
                                      label="结束状态"
                                      placeholder="这一阶段结束后，要把局势推进到哪里？"
                                      value={milestone.exitState}
                                      rows={3}
                                      onChange={(value) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { exitState: value })
                                      }
                                    />

                                    <TextAreaField
                                      label="阶段节奏"
                                      placeholder="例如：高压 / 蓄力 / 过渡 / 反扑"
                                      value={milestone.phasePacing}
                                      rows={2}
                                      onChange={(value) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { phasePacing: value })
                                      }
                                    />

                                    <TextAreaField
                                      label="情感变化"
                                      placeholder="这一阶段的情绪曲线或关系氛围如何变化？"
                                      value={milestone.phaseEmotionShift}
                                      rows={2}
                                      onChange={(value) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { phaseEmotionShift: value })
                                      }
                                    />

                                    <TextAreaField
                                      label="阶段视角"
                                      placeholder="这一阶段主要跟谁的视角？是否允许辅视角？"
                                      value={milestone.phasePOV}
                                      rows={2}
                                      onChange={(value) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { phasePOV: value })
                                      }
                                      className="md:col-span-2"
                                    />

                                    <TextAreaField
                                      label="能力上限"
                                      placeholder="例如：只能站稳脚跟，不能提前无代价击穿终局敌手"
                                      value={milestone.powerCeiling}
                                      rows={3}
                                      onChange={(value) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { powerCeiling: value })
                                      }
                                      className="md:col-span-2"
                                    />

                                    <TextListField
                                      label="关键转折"
                                      placeholder="每行一条，例如：秘境入口开启 / 死敌第一次正面露面"
                                      values={milestone.keyTurns}
                                      rows={3}
                                      onChange={(values) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { keyTurns: values })
                                      }
                                    />

                                    <TextListField
                                      label="阶段必需实体"
                                      placeholder="每行一条，这一阶段必须强关注哪些实体"
                                      values={milestone.requiredEntities ?? []}
                                      rows={3}
                                      onChange={(values) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { requiredEntities: values })
                                      }
                                    />

                                    <section className="md:col-span-2 space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-medium text-neutral-200">阶段伏笔引用</p>
                                          <p className="mt-1 text-xs leading-6 text-neutral-500">
                                            这里定义这一阶段要如何使用伏笔。章纲会在此基础上继续细化到单章。
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => addMilestoneForeshadowRef(volume.id, milestoneIndex)}
                                          className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
                                        >
                                          <Plus size={14} />
                                          新增伏笔引用
                                        </button>
                                      </div>

                                      {(milestone.foreshadowRefs ?? []).length === 0 ? (
                                        <p className="text-xs text-neutral-500">当前还没有阶段级伏笔引用。你可以在这里决定这一阶段是留影、埋设、推进还是回收。</p>
                                      ) : (
                                        <div className="space-y-3">
                                          {(milestone.foreshadowRefs ?? []).map((ref, index) => (
                                            <div
                                              key={`milestone-${volume.id}-${milestoneIndex}-foreshadow-ref-${index}`}
                                              className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3 md:grid-cols-2"
                                            >
                                              <label className="space-y-2">
                                                <span className="text-xs font-medium text-neutral-300">伏笔 ID</span>
                                                <input
                                                  value={ref.foreshadowId}
                                                  onChange={(event) =>
                                                    updateMilestoneForeshadowRef(volume.id, milestoneIndex, index, {
                                                      foreshadowId: event.target.value,
                                                    })
                                                  }
                                                  className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                                />
                                              </label>
                                              <label className="space-y-2">
                                                <span className="text-xs font-medium text-neutral-300">伏笔标题</span>
                                                <input
                                                  value={ref.foreshadowTitle ?? ''}
                                                  onChange={(event) =>
                                                    updateMilestoneForeshadowRef(volume.id, milestoneIndex, index, {
                                                      foreshadowTitle: event.target.value,
                                                    })
                                                  }
                                                  className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                                />
                                              </label>
                                              <label className="space-y-2">
                                                <span className="text-xs font-medium text-neutral-300">动作</span>
                                                <select
                                                  value={ref.action}
                                                  onChange={(event) =>
                                                    updateMilestoneForeshadowRef(volume.id, milestoneIndex, index, {
                                                      action: event.target.value as ForeshadowRef['action'],
                                                    })
                                                  }
                                                  className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                                >
                                                  <option value="shadow">留影</option>
                                                  <option value="plant">埋设</option>
                                                  <option value="advance">推进</option>
                                                  <option value="payoff">回收</option>
                                                </select>
                                              </label>
                                              <label className="space-y-2">
                                                <span className="text-xs font-medium text-neutral-300">强度</span>
                                                <select
                                                  value={ref.intensity}
                                                  onChange={(event) =>
                                                    updateMilestoneForeshadowRef(volume.id, milestoneIndex, index, {
                                                      intensity: event.target.value as ForeshadowRef['intensity'],
                                                    })
                                                  }
                                                  className="h-10 w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 text-sm text-neutral-100 outline-none transition focus:border-indigo-400"
                                                >
                                                  <option value="light">轻</option>
                                                  <option value="medium">中</option>
                                                  <option value="heavy">重</option>
                                                </select>
                                              </label>
                                              <label className="space-y-2 md:col-span-2">
                                                <span className="text-xs font-medium text-neutral-300">备注</span>
                                                <textarea
                                                  value={ref.note ?? ''}
                                                  onChange={(event) =>
                                                    updateMilestoneForeshadowRef(volume.id, milestoneIndex, index, {
                                                      note: event.target.value,
                                                    })
                                                  }
                                                  rows={2}
                                                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-sm leading-6 text-neutral-100 outline-none transition focus:border-indigo-400"
                                                />
                                              </label>
                                              <div className="md:col-span-2">
                                                <button
                                                  type="button"
                                                  onClick={() => removeMilestoneForeshadowRef(volume.id, milestoneIndex, index)}
                                                  className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-500/20"
                                                >
                                                  <Trash2 size={13} />
                                                  删除伏笔引用
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </section>

                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <footer className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void handleSaveVolumeOutline(volume.id)}
                          disabled={isSavingCurrent || isGeneratingCurrent}
                          className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSavingCurrent ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
                          {outlineMode === 'milestone' ? '保存里程碑' : '保存卷大纲'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportVolumeOutline(volume.id)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800"
                        >
                          <Download size={15} />
                          导出 JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => openImportDialog({ type: 'volume-outline', volumeId: volume.id })}
                          disabled={isSavingCurrent || isGeneratingCurrent || isGeneratingMilestonesCurrent}
                          className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Upload size={15} />
                          导入 JSON
                        </button>
                      </div>

                      <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[420px] xl:flex-row xl:items-center">
                        <input
                          value={volumeHintMap[volume.id] ?? ''}
                          onChange={(event) =>
                            setVolumeHintMap((previous) => ({
                              ...previous,
                              [volume.id]: event.target.value,
                            }))
                          }
                          placeholder="输入灵感提示词（可选）"
                          className="h-11 flex-1 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
                        />
                        {outlineMode === 'milestone' ? (
                          <button
                            type="button"
                            onClick={() => void handleGenerateVolumeMilestones(volume.id)}
                            disabled={isSavingCurrent || isGeneratingCurrent || isGeneratingMilestonesCurrent || isGeneratingBook}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isGeneratingMilestonesCurrent ? (
                              <LoaderCircle size={15} className="animate-spin" />
                            ) : (
                              <Sparkles size={15} />
                            )}
                            AI 补全里程碑
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleReconcileVolumePlan(volume.id)}
                          disabled={isSavingCurrent || isGeneratingCurrent || isGeneratingMilestonesCurrent || isGeneratingBook || reconcilingVolumeId === volume.id}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reconcilingVolumeId === volume.id ? (
                            <LoaderCircle size={15} className="animate-spin" />
                          ) : (
                            <Sparkles size={15} />
                          )}
                          修正规划
                        </button>
                        {outlineMode === 'volume' ? (
                          <button
                            type="button"
                            onClick={() => void handleGenerateVolumeOutline(volume.id)}
                            disabled={isSavingCurrent || isGeneratingCurrent || isGeneratingMilestonesCurrent || isGeneratingBook}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isGeneratingCurrent ? (
                              <LoaderCircle size={15} className="animate-spin" />
                            ) : (
                              <Sparkles size={15} />
                            )}
                            AI 生成卷大纲
                          </button>
                        ) : null}
                      </div>
                    </footer>

                    {showBeatInspector ? (
                      <section className="mt-6 border-t border-neutral-800 pt-6">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">章节拍表</p>
                          <h5 className="mt-2 text-lg font-semibold text-neutral-100">
                            给这一卷拆出每章承担的功能
                          </h5>
                          <p className="mt-2 text-sm leading-6 text-neutral-400">
                            先定义每章要负责什么，再让生成链路去执行，会比直接堆卷大纲更稳。
                          </p>
                        </div>
                        <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[420px]">
                          {draft.milestones.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {draft.milestones.map((milestone, milestoneIndex) => {
                                const status = milestoneStatuses[milestoneIndex] ?? 'empty';
                                const isSelected = selectedMilestoneIndex === milestoneIndex;

                                return (
                                  <button
                                    key={`milestone-tab-${volume.id}-${milestoneIndex}`}
                                    type="button"
                                    onClick={() =>
                                      setSelectedMilestoneIndexMap((previous) => ({
                                        ...previous,
                                        [volume.id]: milestoneIndex,
                                      }))
                                    }
                                    className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${getMilestoneStatusBadgeClassName(
                                      status,
                                      isSelected,
                                    )}`}
                                  >
                                    {status === 'progressed' ? <CheckCircle2 size={14} /> : null}
                                    <span>
                                      阶段 {milestoneIndex + 1}
                                      {milestone.title.trim() ? ` · ${milestone.title.trim()}` : ''}
                                      {milestone.targetChapterCount > 0 ? ` (${milestone.targetChapterCount}章)` : ''}
                                      {` · ${getMilestoneStatusLabel(status)}`}
                                    </span>
                                  </button>
                                );
                              })}
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedMilestoneIndexMap((previous) => ({
                                    ...previous,
                                    [volume.id]: null,
                                  }))
                                }
                                className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                                  selectedMilestoneIndex === null
                                    ? 'border-indigo-400 bg-indigo-500/15 text-indigo-100'
                                    : 'border-neutral-700 bg-neutral-950/70 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
                                }`}
                              >
                                全卷裂变
                              </button>
                            </div>
                          ) : null}

                          <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center">
                            {selectedMilestone === null && (chaptersByVolumeId.get(volume.id) ?? []).length === 0 ? (
                              <input
                                value={beatChapterCountMap[volume.id] ?? ''}
                                onChange={(event) =>
                                  setBeatChapterCountMap((previous) => ({
                                    ...previous,
                                    [volume.id]: event.target.value,
                                  }))
                                }
                                placeholder={`目标章节数（默认 ${defaultWholeVolumeChapterCount}）`}
                                inputMode="numeric"
                                className="h-11 w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-emerald-400 xl:w-[160px]"
                              />
                            ) : null}
                            <input
                              value={beatHintMap[volume.id] ?? ''}
                              onChange={(event) =>
                                setBeatHintMap((previous) => ({
                                  ...previous,
                                  [volume.id]: event.target.value,
                                }))
                              }
                              placeholder="输入裂变提示词（可选）"
                              className="h-11 flex-1 rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
                            />
                            <button
                              type="button"
                              onClick={() => openFissionDialog(volume.id)}
                              disabled={generatingBeatVolumeId === volume.id || isGeneratingCurrent}
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 text-sm font-medium text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {generatingBeatVolumeId === volume.id ? (
                                <LoaderCircle size={15} className="animate-spin" />
                              ) : (
                                <Sparkles size={15} />
                              )}
                              {selectedMilestone ? `AI 裂变阶段 ${(selectedMilestoneIndex ?? 0) + 1}` : 'AI 裂变本卷'}
                            </button>
                          </div>

                          {selectedMilestone ? (
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs leading-6 text-neutral-300">
                              <p>
                                当前将按里程碑裂变：{selectedMilestone.title.trim() || `阶段 ${(selectedMilestoneIndex ?? 0) + 1}`}。
                                起止范围预计为第 {computeMilestoneStartChapter(draft.milestones, selectedMilestoneIndex ?? 0)} 章到第 {computeMilestoneEndChapter(draft.milestones, selectedMilestoneIndex ?? 0)} 章。
                                {computeMilestoneStartChapter(draft.milestones, selectedMilestoneIndex ?? 0) > 1
                                  ? ` 会自动参考前 ${computeMilestoneStartChapter(draft.milestones, selectedMilestoneIndex ?? 0) - 1} 章的已落库进度。`
                                  : ''}
                              </p>
                              <p className="mt-1 text-neutral-500">
                                当前阶段状态：{getMilestoneStatusLabel(selectedMilestoneStatus ?? 'empty')}。如果这个阶段已经有章节，重新裂变默认保留现有章节标题，只更新章节拍内容。
                              </p>
                            </div>
                          ) : null}

                          {draft.milestones.length > 0 ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              {draft.milestones.map((milestone, milestoneIndex) => {
                                const status = milestoneStatuses[milestoneIndex] ?? 'empty';

                                if (status !== 'empty') {
                                  return null;
                                }

                                return (
                                  <div
                                    key={`milestone-placeholder-${volume.id}-${milestoneIndex}`}
                                    className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/50 px-4 py-4"
                                  >
                                    <p className="text-sm font-medium text-neutral-200">
                                      阶段 {milestoneIndex + 1}
                                      {milestone.title.trim() ? ` · ${milestone.title.trim()}` : ''}
                                    </p>
                                    <p className="mt-2 text-xs leading-6 text-neutral-500">
                                      该阶段还没有裂变章节拍。
                                      {milestone.targetChapterCount > 0 ? ` 目标约 ${milestone.targetChapterCount} 章。` : ''}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedMilestoneIndexMap((previous) => ({
                                          ...previous,
                                          [volume.id]: milestoneIndex,
                                        }));
                                        openFissionDialog(volume.id, milestoneIndex);
                                      }}
                                      className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
                                    >
                                      裂变此阶段
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {beatRows.length === 0 ? (
                        <div className="mt-4 rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/40 px-4 py-5 text-sm text-neutral-500">
                          {draft.milestones.length > 0
                            ? '当前卷还没有任何章节拍。你可以先选中一个里程碑，只裂变当前阶段；也可以切到“全卷裂变”作为回退模式。'
                            : (chaptersByVolumeId.get(volume.id) ?? []).length === 0
                              ? '当前卷还是空卷。现在可以直接填写目标章节数并点击「AI 裂变本卷」，系统会自动建章并写入章节拍。'
                              : '当前卷已有章节，但还没有裂变出章节拍。点击「AI 裂变本卷」即可按现有章节槽位生成。'}
                        </div>
                      ) : (
                        <div className="mt-5 space-y-4">
                          {beatRows.map((row, rowIndex, rows) => {
                            const beatDraft =
                              chapterBeatDraftMap[row.key] ?? createEmptyChapterBeatDraft(row.chapterNumber);
                            const isSavingBeat = savingBeatKey === row.key;
                            const currentMilestoneIndex =
                              row.beat?.milestoneIndex ??
                              getMilestoneIndexForChapterNumber(
                                draft.milestones,
                                row.chapterNumber,
                              );
                            const previousMilestoneIndex =
                              rowIndex > 0
                                ? rows[rowIndex - 1]?.beat?.milestoneIndex ??
                                  getMilestoneIndexForChapterNumber(
                                    draft.milestones,
                                    rows[rowIndex - 1]?.chapterNumber ?? 0,
                                  )
                                : undefined;
                            const shouldRenderMilestoneHeader =
                              typeof currentMilestoneIndex === 'number' &&
                              currentMilestoneIndex !== previousMilestoneIndex;
                            const currentMilestone =
                              typeof currentMilestoneIndex === 'number'
                                ? draft.milestones[currentMilestoneIndex] ?? null
                                : null;

                            return (
                              <div key={row.key} className="space-y-4">
                                {shouldRenderMilestoneHeader && currentMilestone ? (
                                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-3">
                                      <p className="text-sm font-medium text-emerald-100">
                                        阶段 {currentMilestoneIndex + 1}
                                        {currentMilestone.title.trim() ? ` · ${currentMilestone.title.trim()}` : ''}
                                      </p>
                                      {currentMilestone.targetChapterCount > 0 ? (
                                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                                          {currentMilestone.targetChapterCount} 章
                                        </span>
                                      ) : null}
                                    </div>
                                    {currentMilestone.phaseGoal.trim() ? (
                                      <p className="mt-2 text-xs leading-6 text-emerald-100/80">
                                        阶段目标：{currentMilestone.phaseGoal.trim()}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}

                                <article className="rounded-3xl border border-neutral-800 bg-neutral-950/50 p-4">
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                                      第 {row.chapterNumber} 拍
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                      <h6 className="text-base font-semibold text-neutral-100">
                                        {row.chapterLabel}
                                      </h6>
                                      <span className="rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1 text-xs text-neutral-400">
                                        {row.chapterId ? '已绑定章节' : '未绑定章节'}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void handleMoveChapterBeat(row, 'up')}
                                      disabled={!row.beatId || rowIndex === 0}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-700 text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                                      aria-label={`上移第 ${row.chapterNumber} 拍`}
                                    >
                                      <ArrowUp size={16} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleMoveChapterBeat(row, 'down')}
                                      disabled={!row.beatId || rowIndex === rows.length - 1}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-700 text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                                      aria-label={`下移第 ${row.chapterNumber} 拍`}
                                    >
                                      <ArrowDown size={16} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleSaveChapterBeat(row)}
                                      disabled={isSavingBeat || generatingBeatVolumeId === volume.id}
                                      className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {isSavingBeat ? (
                                        <LoaderCircle size={15} className="animate-spin" />
                                      ) : (
                                        <Save size={15} />
                                      )}
                                      保存本拍
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                  <TextAreaField
                                    label="标题提示"
                                    placeholder="给这一拍一个临时标题或意象提示"
                                    value={beatDraft.titleHint}
                                    rows={2}
                                    onChange={(value) =>
                                      updateChapterBeatDraft(row.key, { titleHint: value })
                                    }
                                  />

                                  <TextAreaField
                                    label="场景功能"
                                    placeholder="这一章核心承担什么功能？例如：换地图、反打认知、关系试探"
                                    value={beatDraft.scenePurpose}
                                    rows={2}
                                    onChange={(value) =>
                                      updateChapterBeatDraft(row.key, { scenePurpose: value })
                                    }
                                  />

                                  <TextAreaField
                                    label="焦点角色"
                                    placeholder="本章视角或发力重点更偏向谁？"
                                    value={beatDraft.focusCharacter}
                                    rows={2}
                                    onChange={(value) =>
                                      updateChapterBeatDraft(row.key, { focusCharacter: value })
                                    }
                                  />

                                  <TextListField
                                    label="必须出场"
                                    placeholder="每行一条，例如：许明、秦小昭"
                                    values={beatDraft.mustAppearCharacters ?? []}
                                    rows={3}
                                    onChange={(values) =>
                                      updateChapterBeatDraft(row.key, { mustAppearCharacters: values })
                                    }
                                  />

                                  <TextListField
                                    label="可出场候选"
                                    placeholder="每行一条，例如：绳、余化及、茶铺老板"
                                    values={beatDraft.availableCharacters ?? []}
                                    rows={3}
                                    onChange={(values) =>
                                      updateChapterBeatDraft(row.key, { availableCharacters: values })
                                    }
                                  />

                                  <TextListField
                                    label="必须落地伏笔"
                                    placeholder="每行一条，例如：慎之发光、空白页现"
                                    values={beatDraft.requiredForeshadows ?? []}
                                    rows={3}
                                    onChange={(values) =>
                                      updateChapterBeatDraft(row.key, { requiredForeshadows: values })
                                    }
                                  />

                                  <TextAreaField
                                    label="节奏"
                                    placeholder="例：慢压迫 / 中速推进 / 快爆点"
                                    value={beatDraft.pacing}
                                    rows={2}
                                    onChange={(value) =>
                                      updateChapterBeatDraft(row.key, { pacing: value })
                                    }
                                  />

                                  <TextAreaField
                                    label="主线推进"
                                    placeholder="这一章主线实际会发生什么变化？"
                                    value={beatDraft.mainPlot}
                                    rows={3}
                                    onChange={(value) =>
                                      updateChapterBeatDraft(row.key, { mainPlot: value })
                                    }
                                    className="md:col-span-2"
                                  />

                                  <TextAreaField
                                    label="支线推进"
                                    placeholder="如果有支线、情感线或角色线，在这里补充"
                                    value={beatDraft.subPlot}
                                    rows={2}
                                    onChange={(value) =>
                                      updateChapterBeatDraft(row.key, { subPlot: value })
                                    }
                                  />

                                  <TextAreaField
                                    label="新意要求"
                                    placeholder="明确这一章必须和前几章不一样的地方"
                                    value={beatDraft.noveltyRequirement}
                                    rows={2}
                                    onChange={(value) =>
                                      updateChapterBeatDraft(row.key, {
                                        noveltyRequirement: value,
                                      })
                                    }
                                  />

                                  <TextAreaField
                                    label="章节钩子"
                                    placeholder="本章结尾拿什么把读者推向下一章？"
                                    value={beatDraft.hookOut}
                                    rows={2}
                                    onChange={(value) =>
                                      updateChapterBeatDraft(row.key, { hookOut: value })
                                    }
                                    className="md:col-span-2"
                                  />

                                  <TextAreaField
                                    label="力量变化"
                                    placeholder="建议写清：本章能力变化幅度、敌方/环境限制、是一次性爆发还是稳定成长"
                                    value={beatDraft.powerDelta}
                                    rows={2}
                                    onChange={(value) =>
                                      updateChapterBeatDraft(row.key, { powerDelta: value })
                                    }
                                  />

                                  <TextListField
                                    label="关键物件"
                                    placeholder="每行一条，例如：黑铁片、古井残图、铜鸦账簿"
                                    values={beatDraft.keyItems}
                                    rows={3}
                                    onChange={(values) =>
                                      updateChapterBeatDraft(row.key, { keyItems: values })
                                    }
                                  />

                                  <TextListField
                                    label="禁用短语"
                                    placeholder="每行一条，列出这一章不想再出现的词句"
                                    values={beatDraft.forbiddenPhrases}
                                    rows={3}
                                    onChange={(values) =>
                                      updateChapterBeatDraft(row.key, { forbiddenPhrases: values })
                                    }
                                  />

                                  <TextListField
                                    label="禁用场景模板"
                                    placeholder="每行一条，例如：发现异物后立刻封口 / 父辈收尾总结"
                                    values={beatDraft.forbiddenScenePatterns}
                                    rows={3}
                                    onChange={(values) =>
                                      updateChapterBeatDraft(row.key, {
                                        forbiddenScenePatterns: values,
                                      })
                                    }
                                  />
                                </div>
                                </article>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
        </section>
              )}
            </div>
          </div>

          {showBeatInspector ? (
          <aside className="min-h-0 overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-900/70 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
            <div className="h-full overflow-y-auto p-4">
              {selectedBeatRow ? (
                  <div className="space-y-4">
                    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">章节拍检查器</p>
                      <div className="mt-3">
                        <p className="text-sm text-neutral-500">
                          {selectedBeatRow.row.displayChapterNumber !== null
                            ? `第 ${selectedBeatRow.row.displayChapterNumber} 章`
                            : `卷内第 ${selectedBeatRow.row.chapterNumber} 拍`}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-neutral-100">
                          {selectedBeatRow.row.chapterLabel}
                        </h3>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-neutral-300">
                            {selectedBeatRow.row.chapterId ? '已绑定章节' : '未绑定章节'}
                          </span>
                          {selectedBeatRow.milestone ? (
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">
                              阶段 {selectedBeatRow.milestoneIndex! + 1}
                              {selectedBeatRow.milestone.title.trim()
                                ? ` · ${selectedBeatRow.milestone.title.trim()}`
                                : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleMoveChapterBeat(selectedBeatRow.row, 'up')}
                          disabled={!selectedBeatRow.row.beatId || selectedBeatRow.rowIndex === 0}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-700 text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`上移第 ${selectedBeatRow.row.chapterNumber} 拍`}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMoveChapterBeat(selectedBeatRow.row, 'down')}
                          disabled={
                            !selectedBeatRow.row.beatId || selectedBeatRow.rowIndex === selectedBeatRow.rowCount - 1
                          }
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-700 text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`下移第 ${selectedBeatRow.row.chapterNumber} 拍`}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveChapterBeat(selectedBeatRow.row)}
                          disabled={savingBeatKey === selectedBeatRow.row.key}
                          className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingBeatKey === selectedBeatRow.row.key ? (
                            <LoaderCircle size={15} className="animate-spin" />
                          ) : (
                            <Save size={15} />
                          )}
                          保存本拍
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteChapterBeat(selectedBeatRow.row)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-100 transition hover:bg-red-500/20"
                        >
                          <Trash2 size={15} />
                          删除本拍
                        </button>
                      </div>
                    </section>

                    <section className="space-y-4 rounded-3xl border border-neutral-800 bg-neutral-950/50 p-4">
                      <TextAreaField
                        label="标题提示"
                        placeholder="给这一拍一个临时标题或意象提示"
                        value={selectedBeatRow.draft.titleHint}
                        rows={2}
                        onChange={(value) => updateChapterBeatDraft(selectedBeatRow.row.key, { titleHint: value })}
                      />
                      <TextAreaField
                        label="场景功能"
                        placeholder="这一章核心承担什么功能？例如：换地图、反打认知、关系试探"
                        value={selectedBeatRow.draft.scenePurpose}
                        rows={3}
                        onChange={(value) => updateChapterBeatDraft(selectedBeatRow.row.key, { scenePurpose: value })}
                      />
                      <TextAreaField
                        label="焦点角色"
                        placeholder="本章视角或发力重点更偏向谁？"
                        value={selectedBeatRow.draft.focusCharacter}
                        rows={2}
                        onChange={(value) =>
                          updateChapterBeatDraft(selectedBeatRow.row.key, { focusCharacter: value })
                        }
                      />
                      <TextAreaField
                        label="主线推进"
                        placeholder="这一章主线实际会发生什么变化？"
                        value={selectedBeatRow.draft.mainPlot}
                        rows={4}
                        onChange={(value) => updateChapterBeatDraft(selectedBeatRow.row.key, { mainPlot: value })}
                      />
                      <TextAreaField
                        label="支线推进"
                        placeholder="如果有支线、情感线或角色线，在这里补充"
                        value={selectedBeatRow.draft.subPlot}
                        rows={3}
                        onChange={(value) => updateChapterBeatDraft(selectedBeatRow.row.key, { subPlot: value })}
                      />
                      <TextAreaField
                        label="章节钩子"
                        placeholder="本章结尾拿什么把读者推向下一章？"
                        value={selectedBeatRow.draft.hookOut}
                        rows={3}
                        onChange={(value) => updateChapterBeatDraft(selectedBeatRow.row.key, { hookOut: value })}
                      />
                      <TextListField
                        label="必须出场"
                        placeholder="每行一条，例如：许明、秦小昭"
                        values={selectedBeatRow.draft.mustAppearCharacters ?? []}
                        rows={3}
                        onChange={(values) =>
                          updateChapterBeatDraft(selectedBeatRow.row.key, { mustAppearCharacters: values })
                        }
                      />
                      <TextListField
                        label="可出场候选"
                        placeholder="每行一条，例如：绳、余化及、茶铺老板"
                        values={selectedBeatRow.draft.availableCharacters ?? []}
                        rows={3}
                        onChange={(values) =>
                          updateChapterBeatDraft(selectedBeatRow.row.key, { availableCharacters: values })
                        }
                      />
                      <TextListField
                        label="必须落地伏笔"
                        placeholder="每行一条，例如：慎之发光、空白页现"
                        values={selectedBeatRow.draft.requiredForeshadows ?? []}
                        rows={3}
                        onChange={(values) =>
                          updateChapterBeatDraft(selectedBeatRow.row.key, { requiredForeshadows: values })
                        }
                      />
                      <TextAreaField
                        label="节奏"
                        placeholder="例：慢压迫 / 中速推进 / 快爆点"
                        value={selectedBeatRow.draft.pacing}
                        rows={2}
                        onChange={(value) => updateChapterBeatDraft(selectedBeatRow.row.key, { pacing: value })}
                      />
                      <TextAreaField
                        label="新意要求"
                        placeholder="明确这一章必须和前几章不一样的地方"
                        value={selectedBeatRow.draft.noveltyRequirement}
                        rows={3}
                        onChange={(value) =>
                          updateChapterBeatDraft(selectedBeatRow.row.key, { noveltyRequirement: value })
                        }
                      />
                      <TextAreaField
                        label="力量变化"
                        placeholder="写清能力变化幅度、环境限制以及成长方式"
                        value={selectedBeatRow.draft.powerDelta}
                        rows={3}
                        onChange={(value) => updateChapterBeatDraft(selectedBeatRow.row.key, { powerDelta: value })}
                      />
                    </section>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-10 text-center">
                    <div className="max-w-sm">
                      <p className="text-base font-medium text-neutral-100">先选择一个章节拍</p>
                      <p className="mt-3 text-sm leading-7 text-neutral-500">
                        中栏列表只负责定位，右侧检查器才承载单章细节编辑。
                      </p>
                    </div>
                  </div>
              )}
            </div>
          </aside>
          ) : null}
        </div>
      </section>

      {outlineSummaryDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 px-4 py-6 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-800 px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">摘要</p>
                <h3 className="mt-2 text-lg font-semibold text-neutral-100">{outlineSummaryDialog.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-500">{outlineSummaryDialog.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setOutlineSummaryDialog(null)}
                className="rounded-2xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-6">
              <div className="rounded-3xl border border-neutral-800 bg-neutral-950/60 p-5">
                <pre className="whitespace-pre-wrap text-sm leading-7 text-neutral-200">
                  {outlineSummaryDialog.summary || '当前还没有可展示的摘要。'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end border-t border-neutral-800 px-6 py-5">
              <button
                type="button"
                onClick={() => setOutlineSummaryDialog(null)}
                className="rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-800"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fissionDialogVolume ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-neutral-100">裂变设置</h3>
                <p className="mt-1 text-sm text-neutral-500">《{fissionDialogVolume.title}》将按你当前选择的模式进行章节拍规划。</p>
              </div>
              <button
                type="button"
                onClick={closeFissionDialog}
                className="rounded-2xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-6">
              {fissionDialogDraft.milestones.length > 0 ? (
                <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <p className="text-sm font-medium text-neutral-200">规划模式</p>
                  <div className="mt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => setFissionDialogMode('volume')}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        fissionDialogMode === 'volume'
                          ? 'border-indigo-400 bg-indigo-500/15 text-indigo-100'
                          : 'border-neutral-700 bg-neutral-950/70 text-neutral-300 hover:border-neutral-500'
                      }`}
                    >
                      <p className="text-sm font-medium">全卷回退模式</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        按整卷目标重新规划。适合初次建卷，或你想暂时不按里程碑分批。
                      </p>
                    </button>

                    <div className="grid gap-2">
                      {fissionDialogDraft.milestones.map((milestone, milestoneIndex) => (
                        <button
                          key={`fission-dialog-milestone-${fissionDialogVolume.id}-${milestoneIndex}`}
                          type="button"
                          onClick={() => {
                            setFissionDialogMode('milestone');
                            setFissionDialogMilestoneIndex(milestoneIndex);
                            const startChapterNumber = computeMilestoneStartChapter(
                              fissionDialogDraft.milestones,
                              milestoneIndex,
                            );
                            const endChapterNumber = computeMilestoneEndChapter(
                              fissionDialogDraft.milestones,
                              milestoneIndex,
                            );
                            const plannedChapterNumbers = new Set(
                              chapterBeats
                                .filter(
                                  (beat) =>
                                    fissionDialogVolume &&
                                    beat.volumeId === fissionDialogVolume.id &&
                                    beat.orderInVolume >= startChapterNumber &&
                                    beat.orderInVolume <= endChapterNumber,
                                )
                                .map((beat) => beat.orderInVolume),
                            );
                            const remainingChapterCount = Math.max(
                              0,
                              (milestone.targetChapterCount || 0) - plannedChapterNumbers.size,
                            );
                            setFissionDialogBatchCount(
                              String(
                                Math.max(
                                  1,
                                  Math.min(
                                    20,
                                    remainingChapterCount > 0
                                      ? remainingChapterCount
                                      : Math.max(1, milestone.targetChapterCount || 1),
                                  ),
                                ),
                              ),
                            );
                          }}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            fissionDialogMode === 'milestone' && fissionDialogMilestoneIndex === milestoneIndex
                              ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                              : 'border-neutral-700 bg-neutral-950/70 text-neutral-300 hover:border-neutral-500'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm font-medium">
                              阶段 {milestoneIndex + 1}
                              {milestone.title.trim() ? ` · ${milestone.title.trim()}` : ''}
                            </p>
                            {milestone.targetChapterCount > 0 ? (
                              <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-400">
                                {milestone.targetChapterCount} 章
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs leading-6 text-neutral-500">
                            {milestone.phaseGoal.trim() || '尚未填写阶段目标'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {fissionDialogMode === 'volume' ? (
                <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <p className="text-sm font-medium text-neutral-200">全卷裂变设置</p>
                  <p className="mt-1 text-xs leading-6 text-neutral-500">
                    这会按整卷大纲规划章节拍。长卷更推荐先按里程碑分批裂变。
                  </p>
                  <label className="mt-4 block space-y-2">
                    <span className="text-sm text-neutral-300">目标章节数</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={fissionDialogChapterCount}
                      onChange={(event) => setFissionDialogChapterCount(event.target.value)}
                      placeholder={String(fissionDialogDefaultChapterCount)}
                      className="h-12 w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-indigo-400"
                    />
                  </label>
                </section>
              ) : fissionDialogMilestone ? (
                <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-sm font-medium text-emerald-100">
                    阶段 {(fissionDialogMilestoneIndex ?? 0) + 1}
                    {fissionDialogMilestone.title.trim() ? ` · ${fissionDialogMilestone.title.trim()}` : ''}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-emerald-100/80">
                    预计范围：第 {fissionDialogMilestoneStartChapterNumber} 章
                    到第 {fissionDialogMilestoneEndChapterNumber} 章。
                    {fissionDialogMilestoneStartChapterNumber > 1
                      ? ` 会自动锚定前 ${fissionDialogMilestoneStartChapterNumber - 1} 章的已落库进度。`
                      : ''}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-neutral-400">
                    重新裂变时默认保留已有章节标题，只更新该阶段的章节拍内容。
                  </p>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">
                    当前将从第 {fissionDialogNextStartChapterNumber} 章继续规划。
                    {fissionDialogRemainingChapterCount > 0
                      ? ` 当前阶段还剩 ${fissionDialogRemainingChapterCount} 章未规划。`
                      : ' 当前阶段已全部规划，本次会从阶段起点重新覆盖你选择的批次范围。'}
                  </p>
                  <label className="mt-4 block space-y-2">
                    <span className="text-sm text-neutral-300">本次规划章数</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={fissionDialogBatchCount}
                      onChange={(event) => setFissionDialogBatchCount(event.target.value)}
                      placeholder={String(
                        Math.max(
                          1,
                          Math.min(
                            20,
                            fissionDialogRemainingChapterCount > 0
                              ? fissionDialogRemainingChapterCount
                              : fissionDialogMilestone.targetChapterCount || 1,
                          ),
                        ),
                      )}
                      className="h-12 w-full rounded-2xl border border-neutral-700 bg-neutral-950/70 px-4 text-sm text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:border-emerald-400"
                    />
                  </label>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">
                    开篇或前 30 章更推荐先按 6 到 10 章做滚动规划；进入中后段后，再按 10 到 15 章推进。
                  </p>
                  <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-xs leading-6 text-neutral-400">
                    <p>
                      本次预计处理范围：第 {fissionDialogNextStartChapterNumber} 章到第 {fissionDialogPreviewEndChapterNumber} 章。
                    </p>
                    {fissionDialogOverwriteChapterCount > 0 ? (
                      <p className="mt-1 text-amber-300">
                        注意：这次会覆盖其中 {fissionDialogOverwriteChapterCount} 章已有章节拍，
                        {fissionDialogOverwriteTitles ? '并同步改写这些章节的现有标题。' : '但仍会保留现有章节标题。'}
                      </p>
                    ) : (
                      <p className="mt-1 text-emerald-300">
                        这次只会补齐尚未规划的章节拍，不会覆盖已规划范围。
                      </p>
                    )}
                    <label className="mt-3 flex items-start gap-3 text-neutral-300">
                      <input
                        type="checkbox"
                        checked={fissionDialogOverwriteTitles}
                        onChange={(event) => setFissionDialogOverwriteTitles(event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border border-neutral-600 bg-neutral-950 text-emerald-300 accent-emerald-400"
                      />
                      <span>
                        同步覆盖现有章节标题
                        <span className="block text-neutral-500">
                          默认只更新章节拍，不改已有正式标题。勾选后会把本次范围内的章节标题改成新裂变结果。
                        </span>
                      </span>
                    </label>
                  </div>
                </section>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-neutral-800 px-6 py-5">
              <button
                type="button"
                onClick={closeFissionDialog}
                className="rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmFissionDialog()}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-300"
              >
                <Sparkles size={15} />
                {fissionDialogMode === 'milestone' && fissionDialogOverwriteChapterCount > 0
                  ? '确认覆盖并裂变'
                  : '开始裂变'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {volumePlanReconcilePreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-neutral-100">卷规划修正建议</h3>
                <p className="mt-1 text-sm text-neutral-500">《{volumePlanReconcilePreview.volumeTitle}》已根据最新正文与设定生成修正稿。</p>
              </div>
              <button
                type="button"
                onClick={() => setVolumePlanReconcilePreview(null)}
                className="rounded-2xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto px-6 py-6">
              <section className="mb-5 rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
                <p className="text-sm font-medium text-neutral-200">修正说明</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-400">
                  {volumePlanReconcilePreview.response.changeSummary}
                </p>
                {volumePlanReconcilePreview.response.riskNotes.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">风险提示</p>
                    {volumePlanReconcilePreview.response.riskNotes.map((note) => (
                      <div key={note} className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-400">
                        {note}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
                  <p className="text-sm font-medium text-neutral-200">当前规划</p>
                  <div className="mt-4 grid gap-4">
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">卷纲</p>
                      <pre className="whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-4 text-sm leading-7 text-neutral-400">{volumePlanReconcilePreview.currentOutlineText}</pre>
                    </div>
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">里程碑</p>
                      <pre className="whitespace-pre-wrap rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-4 text-sm leading-7 text-neutral-400">{volumePlanReconcilePreview.currentMilestonesText}</pre>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                  <p className="text-sm font-medium text-emerald-100">建议规划</p>
                  <div className="mt-4 grid gap-4">
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-emerald-200/70">卷纲</p>
                      <pre className="whitespace-pre-wrap rounded-2xl border border-emerald-500/20 bg-neutral-950/80 px-4 py-4 text-sm leading-7 text-emerald-50">{volumePlanReconcilePreview.proposedOutlineText}</pre>
                    </div>
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-emerald-200/70">里程碑</p>
                      <pre className="whitespace-pre-wrap rounded-2xl border border-emerald-500/20 bg-neutral-950/80 px-4 py-4 text-sm leading-7 text-emerald-50">{volumePlanReconcilePreview.proposedMilestonesText}</pre>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-neutral-800 px-6 py-5">
              <button
                type="button"
                onClick={() => setVolumePlanReconcilePreview(null)}
                className="rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleApplyVolumePlanReconcile()}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-300"
              >
                <CheckCircle2 size={15} />
                一键覆盖当前卷规划
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={importFileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handleImportFileChange(event)}
        className="hidden"
      />
    </>
  );
}
