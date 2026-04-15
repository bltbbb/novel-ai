import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { AntagonistAgendaPanel } from '@/components/AntagonistAgendaPanel';
import { ForeshadowPlanPanel } from '@/components/ForeshadowPlanPanel';
import { PovPermissionPanel } from '@/components/PovPermissionPanel';
import { QuestionPoolPanel } from '@/components/QuestionPoolPanel';
import { ResourceContinuityPanel } from '@/components/ResourceContinuityPanel';
import { ThreadLedgerPanel } from '@/components/ThreadLedgerPanel';
import { WorldStatePanel } from '@/components/WorldStatePanel';
import { db } from '@/lib/db';
import { buildVolumeForeshadowPlanBundle } from '@/lib/foreshadow-plan';
import { createBookOutline, createVolumeBeats, createVolumeMilestones, createVolumeOutline, reconcileVolumePlan } from '@/lib/generation-client';
import {
  buildHistorySummaries,
  computeMilestoneEndChapter,
  computeMilestoneStartChapter,
} from '@/lib/history-summary';
import { serializeSingleMilestone, serializeBookOutline, serializeVolumeOutline } from '@/lib/outline-serializer';
import { collectPlanningRequirements } from '@/lib/planning-requirements';
import { buildVolumeQuestionPoolBundle } from '@/lib/question-pool';
import { formatPromptSection, mergePromptSections } from '@/lib/project-template';
import { buildModelRequestConfig } from '@/lib/runtime-config';
import { useChapterBeatStore, useEditorStore, useForeshadowPlanStore, useForeshadowStore, useLoreStore, useOutlineStore, useProjectStore, useQuestionPoolStore, useSettingsStore, useVolumeStore } from '@/stores';
import type {
  AIVolumePlanReconcileResponse,
  BookCharacterArcDraft,
  BookOutlineFields,
  ChapterBeat,
  ChapterBeatFields,
  Id,
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
  className?: string;
}

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
  beat: ChapterBeat | null;
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

type MilestoneProgressStatus = 'empty' | 'planned' | 'progressed';
type FissionDialogMode = 'milestone' | 'volume';

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
    estimatedChapterCount: 0,
    milestones: [],
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
    milestones: draft.milestones.map(cloneVolumeMilestoneDraft),
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

function parseMultilineList(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

export function OutlineView({
  projectId,
  projectTitle,
  projectDescription,
  genre,
  focusVolumeId = null,
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
  const foreshadowPlans = useForeshadowPlanStore((state) => state.foreshadowPlans);
  const foreshadowPlanLoadedProjectId = useForeshadowPlanStore((state) => state.loadedProjectId);
  const loadForeshadowPlans = useForeshadowPlanStore((state) => state.loadForeshadowPlans);
  const questionPools = useQuestionPoolStore((state) => state.questionPools);
  const questionPoolLoadedProjectId = useQuestionPoolStore((state) => state.loadedProjectId);
  const loadQuestionPools = useQuestionPoolStore((state) => state.loadQuestionPools);
  const loadChapterBeats = useChapterBeatStore((state) => state.loadChapterBeats);
  const saveChapterBeat = useChapterBeatStore((state) => state.saveChapterBeat);
  const saveVolumeChapterBeats = useChapterBeatStore((state) => state.saveVolumeChapterBeats);
  const replaceVolumeChapterBeatsInRange = useChapterBeatStore(
    (state) => state.replaceVolumeChapterBeatsInRange,
  );
  const moveChapterBeat = useChapterBeatStore((state) => state.moveChapterBeat);

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
  const [expandedVolumeId, setExpandedVolumeId] = useState<Id | null>(null);
  const [openVolumeMenuId, setOpenVolumeMenuId] = useState<Id | null>(null);
  const [bookHint, setBookHint] = useState('');
  const [bookDraft, setBookDraft] = useState<BookOutlineFields>(createEmptyBookDraft());
  const [volumeDraftMap, setVolumeDraftMap] = useState<Record<string, VolumeOutlineFields>>({});
  const [chapterBeatDraftMap, setChapterBeatDraftMap] = useState<Record<string, ChapterBeatFields>>({});
  const [volumeHintMap, setVolumeHintMap] = useState<Record<string, string>>({});
  const [beatHintMap, setBeatHintMap] = useState<Record<string, string>>({});
  const [beatChapterCountMap, setBeatChapterCountMap] = useState<Record<string, string>>({});
  const [selectedMilestoneIndexMap, setSelectedMilestoneIndexMap] = useState<Record<string, number | null>>({});
  const [chapterSummaryChapterIds, setChapterSummaryChapterIds] = useState<Set<Id>>(new Set());
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

  function buildTemplateHint(...sections: Array<string | null | undefined>) {
    return mergePromptSections(...sections);
  }

  const volumeCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const volumeMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const sortedVolumes = useMemo(
    () => [...volumes].sort((left, right) => left.order - right.order),
    [volumes],
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
          beat,
        });
      }

      next.set(volume.id, rows);
    }

    return next;
  }, [chapterBeats, chapters, chaptersByVolumeId, sortedVolumes]);
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
              })),
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
          next[volume.id] = 0;
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
          next[volume.id] = 0;
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
    if (!openVolumeMenuId) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const currentMenuId = openVolumeMenuId;
      const currentMenu = currentMenuId ? volumeMenuRefs.current[currentMenuId] : null;

      if (!currentMenu || !(event.target instanceof Node) || currentMenu.contains(event.target)) {
        return;
      }

      setOpenVolumeMenuId(null);
    }

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [openVolumeMenuId]);

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
      await saveBookOutline(projectId, bookDraft);
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

      setBookDraft(generated);
      setBookHint('');
      await saveBookOutline(projectId, generated);
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
      await saveVolumeOutline(projectId, volumeId, draft);
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
      const foreshadowPlanBundle = await resolveVolumeForeshadowPlanBundle(
        volume.order,
        seedOutline.requiredForeshadows,
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

      setVolumeDraftMap((previous) => ({
        ...previous,
        [volumeId]: {
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
          })),
        },
      }));
      setVolumeHintMap((previous) => ({
        ...previous,
        [volumeId]: '',
      }));
      await saveVolumeOutline(projectId, volumeId, generated);
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
      const foreshadowPlanBundle = await resolveVolumeForeshadowPlanBundle(
        volume.order,
        currentDraft.requiredForeshadows,
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
        })),
      };

      setVolumeDraftMap((previous) => ({
        ...previous,
        [volumeId]: mergedDraft,
      }));
      await saveVolumeOutline(projectId, volumeId, mergedDraft);
      toast(`《${volume.title}》里程碑已补全`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`补全里程碑失败：${message}`, 'error');
    } finally {
      setGeneratingMilestonesVolumeId(null);
    }
  }

  function buildReconcileLoreSummary(draft: VolumeOutlineFields) {
    const planningRequirements = collectPlanningRequirements({
      volumeOutline: draft,
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

    await saveVolumeOutline(projectId, volumePlanReconcilePreview.volumeId, nextDraft);
    setVolumeDraftMap((previous) => ({
      ...previous,
      [volumePlanReconcilePreview.volumeId]: nextDraft,
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

    setVolumeDraftMap((previous) => ({
      ...previous,
      [volumeId]: nextDraft,
    }));
    setSavingVolumeId(volumeId);

    try {
      await saveVolumeOutline(projectId, volumeId, nextDraft);
      toast('里程碑已删除并保存', 'success');
    } catch (error) {
      setVolumeDraftMap((previous) =>
        previous[volumeId] === nextDraft
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
          'min-h-0 flex-1 space-y-6 overflow-y-auto pb-6',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <article className="overflow-hidden rounded-[28px] border border-indigo-500/20 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_38%),linear-gradient(180deg,rgba(23,23,23,0.96),rgba(10,10,10,0.96))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-indigo-300">全书大纲</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">{projectTitle}</h2>
            <p className="mt-2 text-sm text-neutral-300">定义你整本书的方向。</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              {projectDescription || '还没有项目简介。先把核心前提、主线冲突和世界规则定下来，后面的章节生成会稳很多。'}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-200">
            <BookOpen size={20} />
          </div>
        </header>

        {isBookGuideVisible ? (
          <div className="mt-5 rounded-2xl border border-dashed border-indigo-400/30 bg-indigo-500/10 px-4 py-4 text-sm leading-6 text-indigo-100">
            还没有大纲，点击「AI 生成」让 AI 帮你起草，或手动填写各字段。
          </div>
        ) : null}

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

        <footer className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
        </footer>
      </article>

      <ThreadLedgerPanel projectId={projectId} />

      <ForeshadowPlanPanel projectId={projectId} />

      <WorldStatePanel projectId={projectId} />

      <QuestionPoolPanel projectId={projectId} />

      <AntagonistAgendaPanel projectId={projectId} />

      <PovPermissionPanel projectId={projectId} />

      <ResourceContinuityPanel projectId={projectId} />

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
            const draft = volumeDraftMap[volume.id] ?? createEmptyVolumeDraft();
            const isSavingCurrent = savingVolumeId === volume.id;
            const isGeneratingCurrent = generatingVolumeId === volume.id;
            const isGeneratingMilestonesCurrent = generatingMilestonesVolumeId === volume.id;
            const isExpanded = expandedVolumeId === volume.id;
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
                          label="伏笔安排"
                          values={draft.foreshadowSeeds}
                          addPlaceholder="输入一条伏笔安排，回车直接添加"
                          textModePlaceholder={
                            '每行一条伏笔安排，例：\n黑铁片对古井产生异常共鸣\n谢无咎真实立场暂不揭露'
                          }
                          emptyText="未填写 · 点击展开编辑或使用 AI 生成。"
                          mode={listFieldModes[`volume.${volume.id}.foreshadowSeeds`] ?? 'cards'}
                          inputValue={listFieldInputs[`volume.${volume.id}.foreshadowSeeds`] ?? ''}
                          onInputChange={(value) =>
                            setListFieldInput(`volume.${volume.id}.foreshadowSeeds`, value)
                          }
                          onChange={(values) => updateVolumeDraft(volume.id, { foreshadowSeeds: values })}
                          onToggleMode={() =>
                            setListFieldMode(
                              `volume.${volume.id}.foreshadowSeeds`,
                              (listFieldModes[`volume.${volume.id}.foreshadowSeeds`] ?? 'cards') === 'cards'
                                ? 'text'
                                : 'cards',
                            )
                          }
                        />
                      </div>

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

                      <div>
                        <ListFieldEditor
                          label="必需伏笔"
                          values={draft.requiredForeshadows ?? []}
                          addPlaceholder="输入一个本卷必须持续关注的伏笔"
                          textModePlaceholder={'每行一条必需伏笔，例：\n黑铁片的真实来历\n谢无咎的真实立场'}
                          emptyText="未填写 · 只有必须强关注的长线暗线才需要写。"
                          helperText="用于把本卷关键长线伏笔优先注入 working/retrieval memory。"
                          mode={listFieldModes[`volume.${volume.id}.requiredForeshadows`] ?? 'cards'}
                          inputValue={listFieldInputs[`volume.${volume.id}.requiredForeshadows`] ?? ''}
                          onInputChange={(value) =>
                            setListFieldInput(`volume.${volume.id}.requiredForeshadows`, value)
                          }
                          onChange={(values) => updateVolumeDraft(volume.id, { requiredForeshadows: values })}
                          onToggleMode={() =>
                            setListFieldMode(
                              `volume.${volume.id}.requiredForeshadows`,
                              (listFieldModes[`volume.${volume.id}.requiredForeshadows`] ?? 'cards') === 'cards'
                                ? 'text'
                                : 'cards',
                            )
                          }
                        />
                      </div>

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
                                      label="必埋伏笔"
                                      placeholder="每行一条，这一阶段必须埋下哪些伏笔"
                                      values={milestone.mustPlant}
                                      rows={3}
                                      onChange={(values) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { mustPlant: values })
                                      }
                                    />

                                    <TextListField
                                      label="必回收"
                                      placeholder="每行一条，这一阶段必须兑现或回收哪些伏笔"
                                      values={milestone.mustPayoff}
                                      rows={3}
                                      onChange={(values) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { mustPayoff: values })
                                      }
                                      className="md:col-span-2"
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

                                    <TextListField
                                      label="阶段必需伏笔"
                                      placeholder="每行一条，这一阶段必须强关注哪些伏笔"
                                      values={milestone.requiredForeshadows ?? []}
                                      rows={3}
                                      onChange={(values) =>
                                        updateVolumeMilestoneDraft(volume.id, milestoneIndex, { requiredForeshadows: values })
                                      }
                                    />
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <footer className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <button
                        type="button"
                        onClick={() => void handleSaveVolumeOutline(volume.id)}
                        disabled={isSavingCurrent || isGeneratingCurrent}
                        className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingCurrent ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
                        保存卷大纲
                      </button>

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
                      </div>
                    </footer>

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
                  </div>
                ) : null}
              </article>
            );
          })
        )}
        </section>
      </section>

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
    </>
  );
}
