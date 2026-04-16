import { serializeBookOutline, serializeVolumeOutline } from '@/lib/outline-serializer';
import { collectPlanningRequirements } from '@/lib/planning-requirements';
import {
  buildAutomaticForbiddenZone,
  type AutomaticForbiddenZone,
} from './generation-repetition-pure';
import { getEffectiveChapterText, loadGenerationQueueMap } from '@/lib/generation-storage';
import { useChapterBeatStore, useOutlineStore } from '@/stores';
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

function serializeChapterBeat(beat: ChapterBeat | ChapterBeatFields) {
  return [
    beat.titleHint.trim() ? `标题提示：${beat.titleHint.trim()}` : '',
    beat.scenePurpose.trim() ? `场景功能：${beat.scenePurpose.trim()}` : '',
    beat.focusCharacter.trim() ? `焦点角色：${beat.focusCharacter.trim()}` : '',
    (beat.mustAppearCharacters ?? []).length > 0 ? `必须出场：${(beat.mustAppearCharacters ?? []).join('；')}` : '',
    (beat.availableCharacters ?? []).length > 0 ? `可出场候选：${(beat.availableCharacters ?? []).join('；')}` : '',
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

function getVolumeGoal(volumeOutline?: VolumeOutline) {
  return volumeOutline?.goal.trim() || undefined;
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

export async function buildChapterPromptPayload(
  projectId: Id,
  chapter: Chapter,
  chapters: Chapter[],
): Promise<ChapterPromptPayload> {
  const outlineStore = useOutlineStore.getState();
  const chapterBeatStore = useChapterBeatStore.getState();
  const [bookOutlineRecord, volumeOutlineRecord, currentChapterBeat] = await Promise.all([
    outlineStore.getBookOutline(projectId),
    chapter.volumeId ? outlineStore.getVolumeOutline(chapter.volumeId) : Promise.resolve(undefined),
    chapterBeatStore.getChapterBeatByChapterId(chapter.id),
  ]);
  const queueItems = await loadGenerationQueueMap(projectId);
  const queueMap = new Map(queueItems.map((item) => [item.chapterId, item] as const));

  const volumeChapterBeats =
    chapter.volumeId && currentChapterBeat
      ? await chapterBeatStore.getVolumeChapterBeats(chapter.volumeId)
      : [];
  const nextChapterBeat =
    currentChapterBeat && chapter.volumeId
      ? volumeChapterBeats.find((beat) => beat.orderInVolume === currentChapterBeat.orderInVolume + 1) ?? null
      : null;
  const automaticForbiddenZone = buildAutomaticForbiddenZone(getRecentChapterTexts(chapters, chapter, queueMap));
  const planningRequirements = collectPlanningRequirements({
    volumeOutline: volumeOutlineRecord ?? null,
    milestoneIndex: currentChapterBeat?.milestoneIndex,
    chapterBeat: currentChapterBeat ?? null,
  });

  return {
    bookOutline: bookOutlineRecord ? serializeBookOutline(bookOutlineRecord) : undefined,
    volumeOutline: volumeOutlineRecord ? serializeVolumeOutline(volumeOutlineRecord) : undefined,
    volumeGoal: getVolumeGoal(volumeOutlineRecord),
    chapterBeat: currentChapterBeat ? serializeChapterBeat(currentChapterBeat) : undefined,
    nextChapterPreview: nextChapterBeat ? serializeNextChapterPreview(nextChapterBeat) : undefined,
    forbiddenZone: buildForbiddenZoneText(currentChapterBeat ?? null, automaticForbiddenZone),
    requiredEntityNames: planningRequirements.requiredEntityNames,
    availableCharacterNames: planningRequirements.availableCharacterNames,
    requiredForeshadowTitles: planningRequirements.requiredForeshadowTitles,
    currentChapterBeat: currentChapterBeat ?? null,
    nextChapterBeat,
    automaticForbiddenZone,
  };
}
export type { AutomaticForbiddenZone, LocalRepetitionCheckerResult } from './generation-repetition-pure';
export { runLocalRepetitionChecker } from './generation-repetition-pure';
