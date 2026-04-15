import type { Table } from 'dexie';
import { countDocumentCharacters } from '@/lib/editor-content';
import { DEFAULT_GENERATION_GATE_CONFIG, normalizeLightweightRecallConfig } from '@/lib/generation-gate-defaults';
import { db, DEFAULT_VOLUME_TITLE } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { normalizeLoreEntityAliases, normalizeLoreEntityFields } from '@/lib/lore-entity';
import { cloneTemplateSubTemplates } from '@/lib/project-template';
import type {
  BookOutline,
  Chapter,
  ChapterBeat,
  EntityRelation,
  Foreshadow,
  IdeaCard,
  Id,
  LoreEntity,
  Project,
  ProjectGenerationGateOverride,
  ProjectArchive,
  Snapshot,
  Volume,
  VolumeMilestoneDraft,
  VolumeOutline,
} from '@/types';

export const PROJECT_ARCHIVE_SCHEMA_VERSION = 4;

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'novel-project';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function assertProjectArchiveShape(value: unknown): asserts value is ProjectArchive {
  if (!isRecord(value)) {
    throw new Error('归档文件不是有效的 JSON 对象');
  }

  if (typeof value.schemaVersion !== 'number') {
    throw new Error('归档文件缺少 schemaVersion');
  }

  if (
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2 &&
    value.schemaVersion !== 3 &&
    value.schemaVersion !== PROJECT_ARCHIVE_SCHEMA_VERSION
  ) {
    throw new Error(
      `归档版本不兼容：当前支持 schemaVersion=1、2、3 或 ${PROJECT_ARCHIVE_SCHEMA_VERSION}，导入文件为 ${value.schemaVersion}`,
    );
  }

  if (!isString(value.exportedAt)) {
    throw new Error('归档文件缺少 exportedAt');
  }

  if (!isRecord(value.project) || !isString(value.project.id) || !isString(value.project.title)) {
    throw new Error('归档文件中的 project 结构不完整');
  }

  if (!isArray(value.chapters) || !isArray(value.entities) || !isArray(value.foreshadows) || !isArray(value.snapshots) || !isArray(value.ideaCards)) {
    throw new Error('归档文件缺少必要的数据数组');
  }

  if (
    typeof value.entityRelations !== 'undefined' &&
    !isArray(value.entityRelations)
  ) {
    throw new Error('归档文件中的 entityRelations 结构不合法');
  }

  if (
    typeof value.volumes !== 'undefined' &&
    !isArray(value.volumes)
  ) {
    throw new Error('归档文件中的 volumes 结构不合法');
  }

  if (
    typeof value.bookOutlines !== 'undefined' &&
    !isArray(value.bookOutlines)
  ) {
    throw new Error('归档文件中的 bookOutlines 结构不合法');
  }

  if (
    typeof value.volumeOutlines !== 'undefined' &&
    !isArray(value.volumeOutlines)
  ) {
    throw new Error('归档文件中的 volumeOutlines 结构不合法');
  }

  if (
    typeof value.chapterBeats !== 'undefined' &&
    !isArray(value.chapterBeats)
  ) {
    throw new Error('归档文件中的 chapterBeats 结构不合法');
  }
}

export async function buildProjectArchive(projectId: Id): Promise<ProjectArchive> {
  const project = await db.projects.get(projectId);

  if (!project) {
    throw new Error('目标项目不存在');
  }

  const [chapters, volumes, bookOutlines, volumeOutlines, chapterBeats, entities, entityRelations, foreshadows, snapshots, ideaCards] = await Promise.all([
    db.chapters.where('projectId').equals(projectId).sortBy('order'),
    db.volumes.where('projectId').equals(projectId).sortBy('order'),
    db.bookOutlines.where('projectId').equals(projectId).toArray(),
    db.volumeOutlines.where('projectId').equals(projectId).toArray(),
    db.chapterBeats.where('projectId').equals(projectId).toArray(),
    db.entities.where('projectId').equals(projectId).toArray(),
    db.entityRelations.where('projectId').equals(projectId).toArray(),
    db.foreshadows.where('projectId').equals(projectId).toArray(),
    db.snapshots.where('projectId').equals(projectId).toArray(),
    db.ideaCards.where('projectId').equals(projectId).toArray(),
  ]);

  return {
    schemaVersion: PROJECT_ARCHIVE_SCHEMA_VERSION,
    exportedAt: createTimestamp(),
    project,
    chapters,
    volumes,
    bookOutlines,
    volumeOutlines,
    chapterBeats,
    entities,
    entityRelations,
    foreshadows,
    snapshots,
    ideaCards,
  };
}

export function serializeProjectArchive(archive: ProjectArchive) {
  return JSON.stringify(archive, null, 2);
}

export function downloadProjectArchive(fileName: string, archive: ProjectArchive) {
  const blob = new Blob([serializeProjectArchive(archive)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = sanitizeFileName(fileName);
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function parseProjectArchive(raw: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('导入文件不是合法的 JSON');
  }

  assertProjectArchiveShape(parsed);
  return parsed;
}

function remapProject(project: Project, chapters: Chapter[]) {
  const now = createTimestamp();
  const projectId = createId();
  const wordCount = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  const generationGateOverride =
    project.generationGateOverride &&
    typeof project.generationGateOverride.reviewRewriteMinSeverity === 'string' &&
    typeof project.generationGateOverride.reviewMaxRewriteCount === 'number' &&
    typeof project.generationGateOverride.reviewScoreThresholds === 'object' &&
    typeof project.generationGateOverride.polishFailBlockReady === 'boolean'
      ? ({
          reviewRewriteMinSeverity: project.generationGateOverride.reviewRewriteMinSeverity,
          reviewMaxRewriteCount: Math.max(0, Math.trunc(project.generationGateOverride.reviewMaxRewriteCount)),
          reviewScoreThresholds: {
            consistency: Math.max(0, Math.min(100, Math.trunc(project.generationGateOverride.reviewScoreThresholds?.consistency ?? DEFAULT_GENERATION_GATE_CONFIG.reviewScoreThresholds.consistency))),
            continuity: Math.max(0, Math.min(100, Math.trunc(project.generationGateOverride.reviewScoreThresholds?.continuity ?? DEFAULT_GENERATION_GATE_CONFIG.reviewScoreThresholds.continuity))),
            reader_pull: Math.max(0, Math.min(100, Math.trunc(project.generationGateOverride.reviewScoreThresholds?.reader_pull ?? DEFAULT_GENERATION_GATE_CONFIG.reviewScoreThresholds.reader_pull))),
          },
          polishFailBlockReady: project.generationGateOverride.polishFailBlockReady,
          lightweightRecall: normalizeLightweightRecallConfig(project.generationGateOverride.lightweightRecall),
        } satisfies ProjectGenerationGateOverride)
      : null;

  const nextProject: Project = {
    ...project,
    id: projectId,
    title: project.title.trim() || '未命名项目',
    description: project.description?.trim() || '',
    genre: [...project.genre],
    stylePrompt: project.stylePrompt?.trim() || '',
    templateSnapshot: project.templateSnapshot
      ? {
          ...project.templateSnapshot,
          tags: [...project.templateSnapshot.tags],
          promptBundle: {
            ...project.templateSnapshot.promptBundle,
          },
          subTemplates: cloneTemplateSubTemplates(project.templateSnapshot.subTemplates),
        }
      : null,
    generationGateOverride,
    wordCount,
    updatedAt: now,
  };

  return nextProject;
}

function remapChapters(chapters: Chapter[]) {
  const chapterIdMap = new Map<Id, Id>();

  const nextChapters = chapters
    .map((chapter) => {
      const nextId = createId();
      chapterIdMap.set(chapter.id, nextId);

      const nextChapter: Chapter = {
        ...chapter,
        id: nextId,
        title: chapter.title.trim() || '未命名章节',
        wordCount: countDocumentCharacters(chapter.content),
      };

      return nextChapter;
    })
    .sort((a, b) => a.order - b.order)
    .map((chapter, index) => ({
      ...chapter,
      order: index + 1,
    }));

  return {
    chapterIdMap,
    chapters: nextChapters,
  };
}

function normalizeVolumeTitle(volumeTitle?: string | null) {
  const normalized = volumeTitle?.trim() ?? '';
  return normalized || DEFAULT_VOLUME_TITLE;
}

function normalizeStringList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function normalizeOptionalStringList(values: unknown) {
  return Array.isArray(values)
    ? normalizeStringList(values.filter((item): item is string => typeof item === 'string'))
    : [];
}

function normalizeBookCharacterArcs(values: unknown): BookOutline['characterArcs'] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((item) => {
      const candidate =
        item && typeof item === 'object'
          ? (item as { characterId?: unknown; characterName?: unknown; arc?: unknown })
          : {};

      return {
        characterId: typeof candidate.characterId === 'string' ? candidate.characterId : null,
        characterName: typeof candidate.characterName === 'string' ? candidate.characterName.trim() : '',
        arc: typeof candidate.arc === 'string' ? candidate.arc.trim() : '',
      };
    })
    .filter((item) => item.characterName || item.arc);
}

function normalizeInheritedThreads(values: unknown): VolumeOutline['inheritedThreads'] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((item) => {
      const candidate =
        item && typeof item === 'object'
          ? (item as { threadId?: unknown; threadName?: unknown; note?: unknown })
          : {};

      return {
        threadId: typeof candidate.threadId === 'string' ? candidate.threadId : null,
        threadName: typeof candidate.threadName === 'string' ? candidate.threadName.trim() : '',
        note: typeof candidate.note === 'string' ? candidate.note.trim() : '',
      };
    })
    .filter((item) => item.threadName || item.note);
}

function normalizePositiveInteger(value: unknown, fallback = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function normalizeVolumeMilestones(milestones: unknown): VolumeMilestoneDraft[] {
  if (!Array.isArray(milestones)) {
    return [];
  }

  return milestones
    .map((milestone) => {
      const candidate: Partial<VolumeMilestoneDraft> =
        milestone && typeof milestone === 'object'
          ? (milestone as Partial<VolumeMilestoneDraft>)
          : {};

      return {
        title: typeof candidate.title === 'string' ? candidate.title.trim() : '',
        targetChapterCount: normalizePositiveInteger(candidate.targetChapterCount),
        phaseGoal: typeof candidate.phaseGoal === 'string' ? candidate.phaseGoal.trim() : '',
        phaseConflict: typeof candidate.phaseConflict === 'string' ? candidate.phaseConflict.trim() : '',
        entryState: typeof candidate.entryState === 'string' ? candidate.entryState.trim() : '',
        exitState: typeof candidate.exitState === 'string' ? candidate.exitState.trim() : '',
        phasePacing: typeof candidate.phasePacing === 'string' ? candidate.phasePacing.trim() : '',
        phaseEmotionShift: typeof candidate.phaseEmotionShift === 'string' ? candidate.phaseEmotionShift.trim() : '',
        phasePOV: typeof candidate.phasePOV === 'string' ? candidate.phasePOV.trim() : '',
        keyTurns: Array.isArray(candidate.keyTurns)
          ? normalizeStringList(candidate.keyTurns.filter((item): item is string => typeof item === 'string'))
          : [],
        mustPlant: Array.isArray(candidate.mustPlant)
          ? normalizeStringList(candidate.mustPlant.filter((item): item is string => typeof item === 'string'))
          : [],
        mustPayoff: Array.isArray(candidate.mustPayoff)
          ? normalizeStringList(candidate.mustPayoff.filter((item): item is string => typeof item === 'string'))
          : [],
        powerCeiling: typeof candidate.powerCeiling === 'string' ? candidate.powerCeiling.trim() : '',
        requiredEntities: normalizeOptionalStringList(candidate.requiredEntities),
        requiredForeshadows: normalizeOptionalStringList(candidate.requiredForeshadows),
      };
    })
    .filter(
      (milestone) =>
        milestone.title ||
        milestone.phaseGoal ||
        milestone.phaseConflict ||
        milestone.entryState ||
        milestone.exitState ||
        milestone.phasePacing ||
        milestone.phaseEmotionShift ||
        milestone.phasePOV ||
        milestone.keyTurns.length > 0 ||
        milestone.mustPlant.length > 0 ||
        milestone.mustPayoff.length > 0 ||
        milestone.requiredEntities.length > 0 ||
        milestone.requiredForeshadows.length > 0 ||
        milestone.powerCeiling ||
        milestone.targetChapterCount > 0,
    );
}

function remapVolumesFromChapters(projectId: Id, chapters: Chapter[]) {
  const volumeIdByTitle = new Map<string, Id>();
  const volumeOrderByTitle = new Map<string, number>();
  const nextVolumes: Volume[] = [];
  const sortedChapters = [...chapters].sort((left, right) => left.order - right.order);

  for (const chapter of sortedChapters) {
    const normalizedTitle = normalizeVolumeTitle(chapter.volumeTitle);

    if (volumeIdByTitle.has(normalizedTitle)) {
      continue;
    }

    const nextId = createId();
    const nextOrder = volumeOrderByTitle.size + 1;

    volumeIdByTitle.set(normalizedTitle, nextId);
    volumeOrderByTitle.set(normalizedTitle, nextOrder);
    nextVolumes.push({
      id: nextId,
      projectId,
      title: normalizedTitle,
      order: nextOrder,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
    });
  }

  if (nextVolumes.length === 0) {
    nextVolumes.push({
      id: createId(),
      projectId,
      title: DEFAULT_VOLUME_TITLE,
      order: 1,
      createdAt: createTimestamp(),
      updatedAt: createTimestamp(),
    });
    volumeIdByTitle.set(DEFAULT_VOLUME_TITLE, nextVolumes[0].id);
  }

  const normalizedChapters = sortedChapters.map((chapter) => {
    const normalizedTitle = normalizeVolumeTitle(chapter.volumeTitle);
    const volumeId = volumeIdByTitle.get(normalizedTitle) ?? nextVolumes[0].id;

    return {
      ...chapter,
      volumeId,
      volumeTitle: normalizedTitle,
    };
  });

  return {
    volumes: nextVolumes,
    chapters: normalizedChapters,
    volumeIdMap: new Map(nextVolumes.map((volume) => [volume.id, volume.id] as const)),
  };
}

function remapVolumes(
  volumes: Volume[],
  projectId: Id,
  chapters: Chapter[],
): {
  volumes: Volume[];
  chapters: Chapter[];
  volumeIdMap: Map<Id, Id>;
} {
  const sortedVolumes = [...volumes].sort((left, right) => {
    if (left.order === right.order) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.order - right.order;
  });
  const volumeIdMap = new Map<Id, Id>();
  const nextVolumes: Volume[] = sortedVolumes.map((volume, index) => {
    const nextId = createId();
    volumeIdMap.set(volume.id, nextId);

    return {
      ...volume,
      id: nextId,
      projectId,
      title: normalizeVolumeTitle(volume.title),
      order: index + 1,
    };
  });
  const fallbackVolume =
    nextVolumes.find((volume) => volume.title === DEFAULT_VOLUME_TITLE) ??
    nextVolumes[0] ??
    {
      id: createId(),
      projectId,
      title: DEFAULT_VOLUME_TITLE,
      order: 1,
      createdAt: createTimestamp(),
      updatedAt: createTimestamp(),
    };

  if (!nextVolumes.some((volume) => volume.id === fallbackVolume.id)) {
    nextVolumes.push(fallbackVolume);
  }

  const titleToVolumeId = new Map(
    nextVolumes.map((volume) => [normalizeVolumeTitle(volume.title), volume.id] as const),
  );
  const volumeTitleById = new Map(nextVolumes.map((volume) => [volume.id, volume.title] as const));
  const normalizedChapters = chapters.map((chapter) => {
    const normalizedTitle = normalizeVolumeTitle(chapter.volumeTitle);
    const mappedVolumeId = chapter.volumeId ? volumeIdMap.get(chapter.volumeId) : undefined;
    const nextVolumeId = mappedVolumeId ?? titleToVolumeId.get(normalizedTitle) ?? fallbackVolume.id;

    return {
      ...chapter,
      volumeId: nextVolumeId,
      volumeTitle: volumeTitleById.get(nextVolumeId) ?? DEFAULT_VOLUME_TITLE,
    };
  });

  return {
    volumes: nextVolumes,
    chapters: normalizedChapters,
    volumeIdMap,
  };
}

function remapBookOutlines(bookOutlines: BookOutline[], projectId: Id): BookOutline[] {
  return bookOutlines
    .filter((outline) => outline && typeof outline === 'object')
    .map((outline): BookOutline => ({
      ...outline,
      id: createId(),
      projectId,
      premise: typeof outline.premise === 'string' ? outline.premise.trim() : '',
      centralConflict: typeof outline.centralConflict === 'string' ? outline.centralConflict.trim() : '',
      protagonistArc: typeof outline.protagonistArc === 'string' ? outline.protagonistArc.trim() : '',
      thematicCore: typeof outline.thematicCore === 'string' ? outline.thematicCore.trim() : '',
      subPlots: normalizeOptionalStringList((outline as Partial<BookOutline>).subPlots),
      characterArcs: normalizeBookCharacterArcs((outline as Partial<BookOutline>).characterArcs),
      powerSystem: typeof (outline as Partial<BookOutline>).powerSystem === 'string' ? (outline as Partial<BookOutline>).powerSystem!.trim() : '',
      antagonistSystem:
        typeof (outline as Partial<BookOutline>).antagonistSystem === 'string'
          ? (outline as Partial<BookOutline>).antagonistSystem!.trim()
          : '',
      narrativeArc:
        typeof (outline as Partial<BookOutline>).narrativeArc === 'string'
          ? (outline as Partial<BookOutline>).narrativeArc!.trim()
          : '',
      logline: typeof (outline as Partial<BookOutline>).logline === 'string' ? (outline as Partial<BookOutline>).logline!.trim() : '',
      worldRules: Array.isArray(outline.worldRules)
        ? normalizeStringList(outline.worldRules.filter((item): item is string => typeof item === 'string'))
        : [],
      endgameHint: typeof outline.endgameHint === 'string' ? outline.endgameHint.trim() : '',
      toneGuide: typeof outline.toneGuide === 'string' ? outline.toneGuide.trim() : '',
    }));
}

function remapVolumeOutlines(
  volumeOutlines: VolumeOutline[],
  projectId: Id,
  volumeIdMap: Map<Id, Id>,
): VolumeOutline[] {
  return volumeOutlines
    .filter((outline) => outline && typeof outline === 'object')
    .flatMap((outline): VolumeOutline[] => {
      const mappedVolumeId = volumeIdMap.get(outline.volumeId);

      if (!mappedVolumeId) {
        return [];
      }

      return [
        {
          ...outline,
          id: createId(),
          projectId,
          volumeId: mappedVolumeId,
          goal: typeof outline.goal === 'string' ? outline.goal.trim() : '',
          keyConflict: typeof outline.keyConflict === 'string' ? outline.keyConflict.trim() : '',
          arcSummary: typeof outline.arcSummary === 'string' ? outline.arcSummary.trim() : '',
          entryState: typeof outline.entryState === 'string' ? outline.entryState.trim() : '',
          exitState: typeof outline.exitState === 'string' ? outline.exitState.trim() : '',
          antagonist: typeof (outline as Partial<VolumeOutline>).antagonist === 'string' ? (outline as Partial<VolumeOutline>).antagonist!.trim() : '',
          subPlot: typeof (outline as Partial<VolumeOutline>).subPlot === 'string' ? (outline as Partial<VolumeOutline>).subPlot!.trim() : '',
          inheritedThreads: normalizeInheritedThreads((outline as Partial<VolumeOutline>).inheritedThreads),
          protagonistGrowth:
            typeof (outline as Partial<VolumeOutline>).protagonistGrowth === 'string'
              ? (outline as Partial<VolumeOutline>).protagonistGrowth!.trim()
              : '',
          emotionalArc:
            typeof (outline as Partial<VolumeOutline>).emotionalArc === 'string'
              ? (outline as Partial<VolumeOutline>).emotionalArc!.trim()
              : '',
          estimatedWordCount: normalizePositiveInteger((outline as Partial<VolumeOutline>).estimatedWordCount),
          povPlan: typeof (outline as Partial<VolumeOutline>).povPlan === 'string' ? (outline as Partial<VolumeOutline>).povPlan!.trim() : '',
          keyEvents: Array.isArray(outline.keyEvents)
            ? normalizeStringList(outline.keyEvents.filter((item): item is string => typeof item === 'string'))
            : [],
          foreshadowSeeds: Array.isArray(outline.foreshadowSeeds)
            ? normalizeStringList(outline.foreshadowSeeds.filter((item): item is string => typeof item === 'string'))
            : [],
          requiredEntities: normalizeOptionalStringList((outline as Partial<VolumeOutline>).requiredEntities),
          requiredForeshadows: normalizeOptionalStringList((outline as Partial<VolumeOutline>).requiredForeshadows),
          estimatedChapterCount: normalizePositiveInteger(
            (outline as Partial<VolumeOutline>).estimatedChapterCount,
          ),
          milestones: normalizeVolumeMilestones(
            (outline as Partial<VolumeOutline>).milestones,
          ),
        },
      ];
    });
}

function remapChapterBeats(
  chapterBeats: ChapterBeat[],
  projectId: Id,
  chapterIdMap: Map<Id, Id>,
  volumeIdMap: Map<Id, Id>,
): ChapterBeat[] {
  return chapterBeats
    .filter((beat) => beat && typeof beat === 'object')
    .flatMap((beat): ChapterBeat[] => {
      const mappedVolumeId = volumeIdMap.get(beat.volumeId);

      if (!mappedVolumeId) {
        return [];
      }

      const nextChapterId = beat.chapterId ? chapterIdMap.get(beat.chapterId) : undefined;

      return [
        {
          ...beat,
          id: createId(),
          projectId,
          volumeId: mappedVolumeId,
          chapterId: nextChapterId,
          orderInVolume:
            typeof beat.orderInVolume === 'number' && Number.isFinite(beat.orderInVolume)
              ? Math.max(1, Math.trunc(beat.orderInVolume))
              : 1,
          titleHint: typeof beat.titleHint === 'string' ? beat.titleHint.trim() : '',
          scenePurpose: typeof beat.scenePurpose === 'string' ? beat.scenePurpose.trim() : '',
          focusCharacter: typeof beat.focusCharacter === 'string' ? beat.focusCharacter.trim() : '',
          mustAppearCharacters: normalizeOptionalStringList((beat as Partial<ChapterBeat>).mustAppearCharacters),
          availableCharacters: normalizeOptionalStringList((beat as Partial<ChapterBeat>).availableCharacters),
          mainPlot: typeof beat.mainPlot === 'string' ? beat.mainPlot.trim() : '',
          subPlot: typeof beat.subPlot === 'string' ? beat.subPlot.trim() : '',
          pacing: typeof beat.pacing === 'string' ? beat.pacing.trim() : '',
          hookOut: typeof beat.hookOut === 'string' ? beat.hookOut.trim() : '',
          noveltyRequirement:
            typeof beat.noveltyRequirement === 'string' ? beat.noveltyRequirement.trim() : '',
          powerDelta: typeof beat.powerDelta === 'string' ? beat.powerDelta.trim() : '',
          forbiddenPhrases: Array.isArray(beat.forbiddenPhrases)
            ? normalizeStringList(
                beat.forbiddenPhrases.filter((item): item is string => typeof item === 'string'),
              )
            : [],
          forbiddenScenePatterns: Array.isArray(beat.forbiddenScenePatterns)
            ? normalizeStringList(
                beat.forbiddenScenePatterns.filter((item): item is string => typeof item === 'string'),
              )
            : [],
          keyItems: Array.isArray(beat.keyItems)
            ? normalizeStringList(beat.keyItems.filter((item): item is string => typeof item === 'string'))
            : [],
          milestoneIndex:
            typeof beat.milestoneIndex === 'number' &&
            Number.isFinite(beat.milestoneIndex) &&
            beat.milestoneIndex >= 0
              ? Math.trunc(beat.milestoneIndex)
              : undefined,
        },
      ];
    })
    .sort((left, right) => left.orderInVolume - right.orderInVolume);
}

function remapEntities(entities: LoreEntity[], projectId: Id) {
  return entities.map((entity) => ({
    ...entity,
    id: createId(),
    projectId,
    name: entity.name.trim() || '未命名设定',
    description: entity.description?.trim() || '',
    tags: [...entity.tags],
    fields: normalizeLoreEntityFields(entity.fields),
    aliases: normalizeLoreEntityAliases(entity.aliases),
    draft: Boolean(entity.draft),
  }));
}

function remapEntityRelations(
  entityRelations: EntityRelation[],
  projectId: Id,
  entityNameToIdMap: Map<string, Id>,
) {
  return entityRelations
    .filter((relation) => relation && typeof relation === 'object')
    .map((relation) => {
      const sourceEntityName = relation.sourceEntityName?.trim() || '';
      const targetEntityName = relation.targetEntityName?.trim() || '';
      const sourceEntityId =
        entityNameToIdMap.get(sourceEntityName) ??
        entityNameToIdMap.get(sourceEntityName.toLowerCase()) ??
        relation.sourceEntityId;
      const targetEntityId =
        entityNameToIdMap.get(targetEntityName) ??
        entityNameToIdMap.get(targetEntityName.toLowerCase()) ??
        relation.targetEntityId;

      return {
        ...relation,
        id: createId(),
        projectId,
        sourceEntityId,
        targetEntityId,
        sourceEntityName,
        targetEntityName,
        relationType: relation.relationType?.trim() || '',
        origin: relation.origin?.trim() || '',
        description: relation.description?.trim() || '',
        currentStance: relation.currentStance?.trim() || '',
        currentIntensity: normalizePositiveInteger(relation.currentIntensity, 0),
        stanceReason: relation.stanceReason?.trim() || '',
        draft: Boolean(relation.draft),
      } satisfies EntityRelation;
    })
    .filter((relation) => relation.sourceEntityName && relation.targetEntityName);
}

function remapForeshadows(foreshadows: Foreshadow[], projectId: Id, chapterIdMap: Map<Id, Id>) {
  return foreshadows.map((foreshadow) => ({
    ...foreshadow,
    id: createId(),
    projectId,
    title: foreshadow.title.trim() || '未命名伏笔',
    excerpt: foreshadow.excerpt?.trim() || '',
    notes: foreshadow.notes?.trim() || '',
    sourceChapterId: foreshadow.sourceChapterId ? chapterIdMap.get(foreshadow.sourceChapterId) ?? null : null,
    resolvedChapterId: foreshadow.resolvedChapterId ? chapterIdMap.get(foreshadow.resolvedChapterId) ?? null : null,
  }));
}

function remapSnapshots(snapshots: Snapshot[], projectId: Id, chapterIdMap: Map<Id, Id>, chapters: Chapter[]) {
  const chapterTitleMap = new Map(chapters.map((chapter) => [chapter.id, chapter.title] as const));

  const remappedSnapshots: Snapshot[] = [];

  for (const snapshot of snapshots) {
    const nextChapterId = chapterIdMap.get(snapshot.chapterId);

    if (!nextChapterId) {
      continue;
    }

    remappedSnapshots.push({
      ...snapshot,
      id: createId(),
      projectId,
      chapterId: nextChapterId,
      chapterTitle: chapterTitleMap.get(nextChapterId) ?? snapshot.chapterTitle,
      note: snapshot.note?.trim() || '',
    });
  }

  return remappedSnapshots;
}

function remapIdeaCards(ideaCards: IdeaCard[], projectId: Id, chapterIdMap: Map<Id, Id>) {
  return ideaCards.map((ideaCard) => ({
    ...ideaCard,
    id: createId(),
    projectId,
    sourceChapterId: ideaCard.sourceChapterId ? chapterIdMap.get(ideaCard.sourceChapterId) ?? null : null,
    title: ideaCard.title.trim() || '未命名灵感',
    content: ideaCard.content.trim(),
  }));
}

export async function importProjectArchive(archive: ProjectArchive) {
  const parsedArchive = parseProjectArchive(serializeProjectArchive(archive));
  const { project, chapters, entities, entityRelations = [], foreshadows, snapshots, ideaCards } = parsedArchive;
  const { chapterIdMap, chapters: nextChapters } = remapChapters(chapters);
  const nextProject = remapProject(project, nextChapters);
  let normalizedChapters = nextChapters.map((chapter) => ({
    ...chapter,
    projectId: nextProject.id,
  }));
  const archivedVolumes = Array.isArray(parsedArchive.volumes) ? parsedArchive.volumes : [];
  const shouldUseArchiveVolumes =
    parsedArchive.schemaVersion >= 2 && archivedVolumes.length > 0;
  const volumeRemapResult = shouldUseArchiveVolumes
    ? remapVolumes(archivedVolumes, nextProject.id, normalizedChapters)
    : remapVolumesFromChapters(nextProject.id, normalizedChapters);
  const normalizedVolumes = volumeRemapResult.volumes;
  normalizedChapters = volumeRemapResult.chapters;
  const normalizedBookOutlines =
    parsedArchive.schemaVersion >= 2
      ? remapBookOutlines(
          Array.isArray(parsedArchive.bookOutlines) ? parsedArchive.bookOutlines : [],
          nextProject.id,
        )
      : [];
  const normalizedVolumeOutlines =
    parsedArchive.schemaVersion >= 2
      ? remapVolumeOutlines(
          Array.isArray(parsedArchive.volumeOutlines) ? parsedArchive.volumeOutlines : [],
          nextProject.id,
          volumeRemapResult.volumeIdMap,
        )
      : [];
  const normalizedChapterBeats =
    parsedArchive.schemaVersion >= 3
      ? remapChapterBeats(
          Array.isArray(parsedArchive.chapterBeats) ? parsedArchive.chapterBeats : [],
          nextProject.id,
          chapterIdMap,
          volumeRemapResult.volumeIdMap,
        )
      : [];
  const normalizedEntities = remapEntities(entities, nextProject.id);
  const entityNameToIdMap = new Map(
    normalizedEntities.flatMap((entity) => {
      const names = [entity.name, ...(entity.aliases ?? [])]
        .map((item) => item.trim())
        .filter(Boolean);

      return names.flatMap((name) => [
        [name, entity.id] as const,
        [name.toLowerCase(), entity.id] as const,
      ]);
    }),
  );
  const normalizedEntityRelations =
    parsedArchive.schemaVersion >= 4
      ? remapEntityRelations(entityRelations, nextProject.id, entityNameToIdMap)
      : [];
  const normalizedForeshadows = remapForeshadows(foreshadows, nextProject.id, chapterIdMap);
  const normalizedSnapshots = remapSnapshots(snapshots, nextProject.id, chapterIdMap, normalizedChapters);
  const normalizedIdeaCards = remapIdeaCards(ideaCards, nextProject.id, chapterIdMap);

  const tables: Table<any, any>[] = [
    db.projects,
    db.chapters as Table<any, any>,
    db.volumes,
    db.bookOutlines,
    db.volumeOutlines,
    db.chapterBeats,
    db.entities,
    db.entityRelations,
    db.foreshadows,
    db.snapshots,
    db.ideaCards,
  ];

  await db.transaction(
    'rw',
    tables,
    async () => {
      await db.projects.add(nextProject);
      if (normalizedChapters.length > 0) {
        await db.chapters.bulkAdd(normalizedChapters);
      }
      if (normalizedVolumes.length > 0) {
        await db.volumes.bulkAdd(normalizedVolumes);
      }
      if (normalizedBookOutlines.length > 0) {
        await db.bookOutlines.bulkAdd(normalizedBookOutlines);
      }
      if (normalizedVolumeOutlines.length > 0) {
        await db.volumeOutlines.bulkAdd(normalizedVolumeOutlines);
      }
      if (normalizedChapterBeats.length > 0) {
        await db.chapterBeats.bulkAdd(normalizedChapterBeats);
      }
      if (normalizedEntities.length > 0) {
        await db.entities.bulkAdd(normalizedEntities);
      }
      if (normalizedEntityRelations.length > 0) {
        await db.entityRelations.bulkAdd(normalizedEntityRelations);
      }
      if (normalizedForeshadows.length > 0) {
        await db.foreshadows.bulkAdd(normalizedForeshadows);
      }
      if (normalizedSnapshots.length > 0) {
        await db.snapshots.bulkAdd(normalizedSnapshots);
      }
      if (normalizedIdeaCards.length > 0) {
        await db.ideaCards.bulkAdd(normalizedIdeaCards);
      }
    },
  );

  return nextProject;
}
