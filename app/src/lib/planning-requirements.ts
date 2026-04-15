import type { ChapterBeatFields, VolumeMilestoneDraft, VolumeOutlineFields } from '@/types';

function dedupeTextList(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() || '')
        .filter(Boolean),
    ),
  );
}

function collectMilestoneForeshadows(milestone: VolumeMilestoneDraft | null | undefined) {
  if (!milestone) {
    return [] as string[];
  }

  return dedupeTextList([
    ...milestone.mustPlant,
    ...milestone.mustPayoff,
    ...(milestone.requiredForeshadows ?? []),
  ]);
}

export function collectPlanningRequirements(input: {
  volumeOutline?: Pick<VolumeOutlineFields, 'foreshadowSeeds' | 'requiredEntities' | 'requiredForeshadows' | 'milestones'> | null;
  milestoneIndex?: number | null;
  chapterBeat?: Pick<ChapterBeatFields, 'focusCharacter' | 'mustAppearCharacters' | 'availableCharacters'> | null;
}) {
  const volumeOutline = input.volumeOutline;
  const chapterBeat = input.chapterBeat;

  if (!volumeOutline) {
    return {
      requiredEntityNames: dedupeTextList([
        ...(chapterBeat?.mustAppearCharacters ?? []),
        chapterBeat?.focusCharacter ?? '',
      ]),
      availableCharacterNames: dedupeTextList([
        ...(chapterBeat?.availableCharacters ?? []),
      ]),
      requiredForeshadowTitles: [] as string[],
    };
  }

  const milestone =
    typeof input.milestoneIndex === 'number' && input.milestoneIndex >= 0
      ? volumeOutline.milestones[input.milestoneIndex] ?? null
      : null;
  const milestoneEntityNames =
    milestone
      ? milestone.requiredEntities ?? []
      : volumeOutline.milestones.flatMap((item) => item.requiredEntities ?? []);
  const milestoneForeshadows =
    milestone
      ? collectMilestoneForeshadows(milestone)
      : volumeOutline.milestones.flatMap((item) => collectMilestoneForeshadows(item));

  return {
    requiredEntityNames: dedupeTextList([
      ...(chapterBeat?.mustAppearCharacters ?? []),
      chapterBeat?.focusCharacter ?? '',
      ...(volumeOutline.requiredEntities ?? []),
      ...milestoneEntityNames,
    ]),
    availableCharacterNames: dedupeTextList([
      ...(chapterBeat?.availableCharacters ?? []),
    ]),
    requiredForeshadowTitles: dedupeTextList([
      ...volumeOutline.foreshadowSeeds,
      ...(volumeOutline.requiredForeshadows ?? []),
      ...milestoneForeshadows,
    ]),
  };
}
