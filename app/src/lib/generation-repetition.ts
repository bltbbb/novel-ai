import { collectPlanningRequirements } from '@/lib/planning-requirements';
import { collectChapterOutlinePlanningRequirements } from '@/lib/chapter-outline';
import { db } from '@/lib/db';
import {
  getBookOutlineSummary,
  getVolumeMilestoneSummary,
  getVolumeOutlineSummary,
} from '@/lib/outline-summary';
import {
  buildAutomaticForbiddenZone,
  type AutomaticForbiddenZone,
} from './generation-repetition-pure';
import { getEffectiveChapterText, loadGenerationQueueMap } from '@/lib/generation-storage';
import { useChapterBeatStore, useForeshadowStore, useOutlineStore } from '@/stores';
import type {
  Chapter,
  ChapterBeat,
  ChapterBeatFields,
  GenerationQueueItem,
  Id,
  VolumeOutline,
} from '@/types';

export interface ChapterPromptPayload {
  bookOutline?: string;
  volumeOutline?: string;
  volumeGoal?: string;
  chapterBeat?: string;
  nextChapterPreview?: string;
  forbiddenZone?: string;
  requiredEntityNames: string[];
  availableCharacterNames: string[];
  requiredForeshadowTitles: string[];
  currentChapterBeat: ChapterBeat | null;
  nextChapterBeat: ChapterBeat | null;
  automaticForbiddenZone: AutomaticForbiddenZone;
}

function hasManualChapterOutlineControl(
  outline: {
    goal?: string;
    chapterFunction?: string;
    sceneDecisionNote?: string;
    sceneDrafts?: Array<unknown>;
    beatDrafts?: Array<unknown>;
    foreshadowRefs?: Array<unknown>;
    mustAppearCharacters?: Array<unknown>;
    availableCharacters?: Array<unknown>;
  } | null | undefined,
) {
  if (!outline) {
    return false;
  }

  return Boolean(
    outline.goal?.trim() ||
      outline.chapterFunction?.trim() ||
      outline.sceneDecisionNote?.trim() ||
      (outline.sceneDrafts?.length ?? 0) > 0 ||
      (outline.beatDrafts?.length ?? 0) > 0 ||
      (outline.foreshadowRefs?.length ?? 0) > 0 ||
      (outline.mustAppearCharacters?.length ?? 0) > 0 ||
      (outline.availableCharacters?.length ?? 0) > 0,
  );
}

function serializeChapterBeat(beat: ChapterBeat | ChapterBeatFields) {
  return [
    beat.titleHint.trim() ? `标题提示：${beat.titleHint.trim()}` : '',
    beat.scenePurpose.trim() ? `场景功能：${beat.scenePurpose.trim()}` : '',
    beat.focusCharacter.trim() ? `焦点角色：${beat.focusCharacter.trim()}` : '',
    (beat.mustAppearCharacters ?? []).length > 0 ? `必须出场：${(beat.mustAppearCharacters ?? []).join('；')}` : '',
    (beat.availableCharacters ?? []).length > 0 ? `可出场候选：${(beat.availableCharacters ?? []).join('；')}` : '',
    (beat.requiredForeshadows ?? []).length > 0
      ? `必须落地伏笔：${(beat.requiredForeshadows ?? []).join('；')}`
      : '',
    beat.mainPlot.trim() ? `主线推进：${beat.mainPlot.trim()}` : '',
    beat.subPlot.trim() ? `支线推进：${beat.subPlot.trim()}` : '',
    beat.pacing.trim() ? `节奏：${beat.pacing.trim()}` : '',
    beat.hookOut.trim() ? `章节钩子：${beat.hookOut.trim()}` : '',
    beat.noveltyRequirement.trim() ? `新意要求：${beat.noveltyRequirement.trim()}` : '',
    beat.powerDelta.trim() ? `能力变化幅度：${beat.powerDelta.trim()}` : '',
    beat.keyItems.length > 0 ? `关键物件：${beat.keyItems.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function serializeNextChapterPreview(beat: ChapterBeat) {
  return [
    beat.mainPlot.trim() ? `下章主推进：${beat.mainPlot.trim()}` : '',
    beat.hookOut.trim() ? `下章钩子：${beat.hookOut.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildForbiddenZoneText(
  currentChapterBeat: ChapterBeat | null,
  automaticForbiddenZone: AutomaticForbiddenZone,
) {
  const manualPhrases = currentChapterBeat?.forbiddenPhrases ?? [];
  const manualScenePatterns = currentChapterBeat?.forbiddenScenePatterns ?? [];
  const sections = [
    manualPhrases.length > 0 ? `人工禁用短语：${manualPhrases.join('；')}` : '',
    manualScenePatterns.length > 0
      ? `人工禁用模板：${manualScenePatterns.join('；')}`
      : '',
    automaticForbiddenZone.phrases.length > 0
      ? `自动禁用高频词：${automaticForbiddenZone.phrases.join('；')}`
      : '',
    automaticForbiddenZone.actionPatterns.length > 0
      ? `自动禁用动作模板：${automaticForbiddenZone.actionPatterns.join('；')}`
      : '',
    automaticForbiddenZone.scenePatterns.length > 0
      ? `自动禁用场景模板：${automaticForbiddenZone.scenePatterns.join('；')}`
      : '',
  ].filter(Boolean);

  return sections.length > 0 ? sections.join('\n') : undefined;
}

function getCurrentMilestoneSummary(
  volumeOutline: VolumeOutline | undefined,
  milestoneIndex: number | undefined,
) {
  if (!volumeOutline || typeof milestoneIndex !== 'number' || milestoneIndex < 0) {
    return undefined;
  }

  const milestone = volumeOutline.milestones[milestoneIndex] ?? null;
  return milestone ? getVolumeMilestoneSummary(milestone, milestoneIndex) || undefined : undefined;
}

function resolveMilestoneIndexByChapterOrder(
  volumeOutline: VolumeOutline | undefined,
  chapterOrderInVolume: number | null,
) {
  if (!volumeOutline || typeof chapterOrderInVolume !== 'number' || chapterOrderInVolume <= 0) {
    return undefined;
  }

  let chapterCursor = 1;

  for (let index = 0; index < volumeOutline.milestones.length; index += 1) {
    const milestone = volumeOutline.milestones[index];
    const targetChapterCount = Math.max(0, milestone.targetChapterCount);

    if (targetChapterCount <= 0) {
      continue;
    }

    const endChapterNumber = chapterCursor + targetChapterCount - 1;

    if (chapterOrderInVolume >= chapterCursor && chapterOrderInVolume <= endChapterNumber) {
      return index;
    }

    chapterCursor = endChapterNumber + 1;
  }

  return undefined;
}

function getRecentChapterTexts(
  chapters: Chapter[],
  currentChapter: Chapter,
  queueMap: Map<Id, GenerationQueueItem>,
  windowSize = 5,
) {
  return [...chapters]
    .filter((chapter) => chapter.projectId === currentChapter.projectId && chapter.order < currentChapter.order)
    .sort((left, right) => right.order - left.order)
    .slice(0, windowSize)
    .map((chapter) => getEffectiveChapterText(chapter, queueMap.get(chapter.id)))
    .filter(Boolean);
}

function getChapterOrderInVolume(chapters: Chapter[], currentChapter: Chapter) {
  if (!currentChapter.volumeId) {
    return null;
  }

  const volumeChapters = chapters
    .filter((chapter) => chapter.volumeId === currentChapter.volumeId)
    .sort((left, right) => left.order - right.order);
  const index = volumeChapters.findIndex((chapter) => chapter.id === currentChapter.id);

  return index >= 0 ? index + 1 : null;
}

export async function buildChapterPromptPayload(
  projectId: Id,
  chapter: Chapter,
  chapters: Chapter[],
): Promise<ChapterPromptPayload> {
  const outlineStore = useOutlineStore.getState();
  const chapterBeatStore = useChapterBeatStore.getState();
  const [bookOutlineRecord, volumeOutlineRecord, chapterBeatByChapterId, volumeChapterBeats, chapterOutlineRecord] = await Promise.all([
    outlineStore.getBookOutline(projectId),
    chapter.volumeId ? outlineStore.getVolumeOutline(chapter.volumeId) : Promise.resolve(undefined),
    chapterBeatStore.getChapterBeatByChapterId(chapter.id),
    chapter.volumeId ? chapterBeatStore.getVolumeChapterBeats(chapter.volumeId) : Promise.resolve([]),
    db.chapterOutlines.where('[projectId+chapterId]').equals([projectId, chapter.id]).first(),
  ]);
  const foreshadowStore = useForeshadowStore.getState();
  const projectForeshadows =
    foreshadowStore.loadedProjectId === projectId
      ? foreshadowStore.foreshadows.filter((item) => item.projectId === projectId)
      : await db.foreshadows.where('projectId').equals(projectId).toArray();
  const queueItems = await loadGenerationQueueMap(projectId);
  const queueMap = new Map(queueItems.map((item) => [item.chapterId, item] as const));
  const chapterOrderInVolume = getChapterOrderInVolume(chapters, chapter);
  const currentChapterBeat =
    chapterBeatByChapterId ??
    (typeof chapterOrderInVolume === 'number'
      ? volumeChapterBeats.find((beat) => beat.orderInVolume === chapterOrderInVolume) ?? null
      : null);
  const nextChapterBeat =
    currentChapterBeat && chapter.volumeId
      ? volumeChapterBeats.find((beat) => beat.orderInVolume === currentChapterBeat.orderInVolume + 1) ?? null
      : null;
  // 阶段摘要直接跟随卷纲里的里程碑划分，不再优先依赖章节拍。
  // 这样在主要使用章纲、很少维护章节拍的工作流里，
  // 当前章只会拿到所属里程碑的阶段摘要。
  const resolvedMilestoneIndex =
    typeof chapterOutlineRecord?.milestoneIndex === 'number'
      ? chapterOutlineRecord.milestoneIndex
      : resolveMilestoneIndexByChapterOrder(volumeOutlineRecord, chapterOrderInVolume);
  const automaticForbiddenZone = buildAutomaticForbiddenZone(getRecentChapterTexts(chapters, chapter, queueMap));
  const planningRequirements = collectPlanningRequirements({
    volumeOutline: volumeOutlineRecord ?? null,
    milestoneIndex: resolvedMilestoneIndex,
    chapterBeat: currentChapterBeat ?? null,
    foreshadows: projectForeshadows,
  });
  const outlinePlanningRequirements = chapterOutlineRecord
    ? collectChapterOutlinePlanningRequirements(chapterOutlineRecord)
    : null;
  const hasStrictChapterOutline = hasManualChapterOutlineControl(chapterOutlineRecord);

  return {
    bookOutline: bookOutlineRecord ? getBookOutlineSummary(bookOutlineRecord) || undefined : undefined,
    volumeOutline: volumeOutlineRecord ? getVolumeOutlineSummary(volumeOutlineRecord) || undefined : undefined,
    volumeGoal: hasStrictChapterOutline ? undefined : getCurrentMilestoneSummary(volumeOutlineRecord, resolvedMilestoneIndex),
    chapterBeat: hasStrictChapterOutline ? undefined : currentChapterBeat ? serializeChapterBeat(currentChapterBeat) : undefined,
    nextChapterPreview: hasStrictChapterOutline ? undefined : nextChapterBeat ? serializeNextChapterPreview(nextChapterBeat) : undefined,
    forbiddenZone: hasStrictChapterOutline ? undefined : buildForbiddenZoneText(currentChapterBeat ?? null, automaticForbiddenZone),
    requiredEntityNames: hasStrictChapterOutline
      ? (outlinePlanningRequirements?.requiredEntityNames ?? [])
      : (outlinePlanningRequirements?.requiredEntityNames ?? planningRequirements.requiredEntityNames),
    availableCharacterNames: hasStrictChapterOutline
      ? (outlinePlanningRequirements?.availableCharacterNames ?? [])
      : (outlinePlanningRequirements?.availableCharacterNames ?? planningRequirements.availableCharacterNames),
    requiredForeshadowTitles:
      hasStrictChapterOutline
        ? (outlinePlanningRequirements?.requiredForeshadowTitles ?? [])
        : (outlinePlanningRequirements?.requiredForeshadowTitles ?? planningRequirements.requiredForeshadowTitles),
    currentChapterBeat: currentChapterBeat ?? null,
    nextChapterBeat,
    automaticForbiddenZone,
  };
}
export type { AutomaticForbiddenZone, LocalRepetitionCheckerResult } from './generation-repetition-pure';
export { runLocalRepetitionChecker } from './generation-repetition-pure';
