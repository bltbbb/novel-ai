import type { ChapterBeatFields, Foreshadow, VolumeMilestoneDraft, VolumeOutlineFields } from '@/types';

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
    ...collectStructuredForeshadowTitles(milestone.foreshadowRefs),
  ]);
}

function collectStructuredForeshadowTitles(
  refs: Array<{ foreshadowId: string; foreshadowTitle?: string; action: string; intensity: string }> | undefined,
) {
  return (refs ?? [])
    .filter((item) => !(item.action === 'shadow' && item.intensity === 'light'))
    .map((item) => item.foreshadowTitle?.trim() || item.foreshadowId.trim())
    .filter(Boolean);
}

function buildForeshadowTitleLookup(foreshadows: Pick<Foreshadow, 'id' | 'title' | 'foreshadowId'>[] | undefined) {
  const lookup = new Map<string, string>();

  for (const foreshadow of foreshadows ?? []) {
    const title = foreshadow.title.trim();

    if (!title) {
      continue;
    }

    if (foreshadow.id.trim()) {
      lookup.set(foreshadow.id.trim().toLowerCase(), title);
    }

    if (foreshadow.foreshadowId?.trim()) {
      lookup.set(foreshadow.foreshadowId.trim().toLowerCase(), title);
    }
  }

  return lookup;
}

function resolveForeshadowTitlesByIds(
  ids: Array<string | undefined> | undefined,
  titleLookup: Map<string, string>,
) {
  return (ids ?? [])
    .map((id) => id?.trim() || '')
    .filter(Boolean)
    .map((id) => titleLookup.get(id.toLowerCase()) ?? '')
    .filter(Boolean);
}

export function collectPlanningRequirements(input: {
  volumeOutline?: Pick<VolumeOutlineFields, 'foreshadowSeeds' | 'requiredEntities' | 'requiredForeshadows' | 'requiredForeshadowIds' | 'foreshadowRefs' | 'milestones'> | null;
  milestoneIndex?: number | null;
  chapterBeat?: Pick<ChapterBeatFields, 'focusCharacter' | 'mustAppearCharacters' | 'availableCharacters' | 'requiredForeshadows'> | null;
  foreshadows?: Pick<Foreshadow, 'id' | 'title' | 'foreshadowId'>[];
}) {
  const volumeOutline = input.volumeOutline;
  const chapterBeat = input.chapterBeat;
  const titleLookup = buildForeshadowTitleLookup(input.foreshadows);
  const chapterRequiredEntityNames = dedupeTextList([
    ...(chapterBeat?.mustAppearCharacters ?? []),
    chapterBeat?.focusCharacter ?? '',
  ]);
  const chapterRequiredForeshadowTitles = dedupeTextList(chapterBeat?.requiredForeshadows ?? []);

  if (!volumeOutline) {
    return {
      requiredEntityNames: chapterRequiredEntityNames,
      availableCharacterNames: dedupeTextList([
        ...(chapterBeat?.availableCharacters ?? []),
      ]),
      requiredForeshadowTitles: chapterRequiredForeshadowTitles,
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
  const milestoneForeshadowIds =
    milestone
      ? milestone.requiredForeshadowIds ?? []
      : volumeOutline.milestones.flatMap((item) => item.requiredForeshadowIds ?? []);
  const inheritedRequiredEntityNames =
    milestone
      ? dedupeTextList(
          milestoneEntityNames.length > 0
            ? milestoneEntityNames
            : (volumeOutline.requiredEntities ?? []),
        )
      : dedupeTextList([
          ...(volumeOutline.requiredEntities ?? []),
          ...milestoneEntityNames,
        ]);
  const inheritedRequiredForeshadowTitles =
    milestone
      ? dedupeTextList(
          milestoneForeshadows.length > 0 || milestoneForeshadowIds.length > 0
            ? [
                ...milestoneForeshadows,
                ...resolveForeshadowTitlesByIds(milestoneForeshadowIds, titleLookup),
              ]
            : [
                ...collectStructuredForeshadowTitles(volumeOutline.foreshadowRefs),
                ...(volumeOutline.requiredForeshadows ?? []),
                ...resolveForeshadowTitlesByIds(volumeOutline.requiredForeshadowIds, titleLookup),
                ...volumeOutline.foreshadowSeeds,
              ],
        )
      : dedupeTextList([
          ...collectStructuredForeshadowTitles(volumeOutline.foreshadowRefs),
          ...volumeOutline.foreshadowSeeds,
          ...(volumeOutline.requiredForeshadows ?? []),
          ...resolveForeshadowTitlesByIds(volumeOutline.requiredForeshadowIds, titleLookup),
          ...milestoneForeshadows,
          ...resolveForeshadowTitlesByIds(milestoneForeshadowIds, titleLookup),
        ]);

  return {
    requiredEntityNames:
      chapterRequiredEntityNames.length > 0
        ? chapterRequiredEntityNames
        : inheritedRequiredEntityNames,
    availableCharacterNames: dedupeTextList([
      ...(chapterBeat?.availableCharacters ?? []),
    ]),
    requiredForeshadowTitles:
      chapterRequiredForeshadowTitles.length > 0
        ? chapterRequiredForeshadowTitles
        : inheritedRequiredForeshadowTitles,
  };
}
