import { countDocumentCharacters } from '@/lib/editor-content';
import { db } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import type {
  Chapter,
  Foreshadow,
  IdeaCard,
  Id,
  LoreEntity,
  Project,
  ProjectArchive,
  Snapshot,
} from '@/types';

export const PROJECT_ARCHIVE_SCHEMA_VERSION = 1;

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

  if (value.schemaVersion !== PROJECT_ARCHIVE_SCHEMA_VERSION) {
    throw new Error(
      `归档版本不兼容：当前支持 schemaVersion=${PROJECT_ARCHIVE_SCHEMA_VERSION}，导入文件为 ${value.schemaVersion}`,
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
}

export async function buildProjectArchive(projectId: Id): Promise<ProjectArchive> {
  const project = await db.projects.get(projectId);

  if (!project) {
    throw new Error('目标项目不存在');
  }

  const [chapters, entities, foreshadows, snapshots, ideaCards] = await Promise.all([
    db.chapters.where('projectId').equals(projectId).sortBy('order'),
    db.entities.where('projectId').equals(projectId).toArray(),
    db.foreshadows.where('projectId').equals(projectId).toArray(),
    db.snapshots.where('projectId').equals(projectId).toArray(),
    db.ideaCards.where('projectId').equals(projectId).toArray(),
  ]);

  return {
    schemaVersion: PROJECT_ARCHIVE_SCHEMA_VERSION,
    exportedAt: createTimestamp(),
    project,
    chapters,
    entities,
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

  const nextProject: Project = {
    ...project,
    id: projectId,
    title: project.title.trim() || '未命名项目',
    description: project.description?.trim() || '',
    genre: [...project.genre],
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

function remapEntities(entities: LoreEntity[], projectId: Id) {
  return entities.map((entity) => ({
    ...entity,
    id: createId(),
    projectId,
    name: entity.name.trim() || '未命名设定',
    description: entity.description?.trim() || '',
    tags: [...entity.tags],
    fields: { ...entity.fields },
  }));
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

  return snapshots
    .map((snapshot) => {
      const nextChapterId = chapterIdMap.get(snapshot.chapterId);

      if (!nextChapterId) {
        return null;
      }

      return {
        ...snapshot,
        id: createId(),
        projectId,
        chapterId: nextChapterId,
        chapterTitle: chapterTitleMap.get(nextChapterId) ?? snapshot.chapterTitle,
        note: snapshot.note?.trim() || '',
      };
    })
    .filter((snapshot): snapshot is Snapshot => snapshot !== null);
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
  const { project, chapters, entities, foreshadows, snapshots, ideaCards } = parsedArchive;
  const { chapterIdMap, chapters: nextChapters } = remapChapters(chapters);
  const nextProject = remapProject(project, nextChapters);
  const normalizedChapters = nextChapters.map((chapter) => ({
    ...chapter,
    projectId: nextProject.id,
  }));

  const normalizedEntities = remapEntities(entities, nextProject.id);
  const normalizedForeshadows = remapForeshadows(foreshadows, nextProject.id, chapterIdMap);
  const normalizedSnapshots = remapSnapshots(snapshots, nextProject.id, chapterIdMap, normalizedChapters);
  const normalizedIdeaCards = remapIdeaCards(ideaCards, nextProject.id, chapterIdMap);

  await db.transaction(
    'rw',
    [db.projects, db.chapters, db.entities, db.foreshadows, db.snapshots, db.ideaCards],
    async () => {
      await db.projects.add(nextProject);
      if (normalizedChapters.length > 0) {
        await db.chapters.bulkAdd(normalizedChapters);
      }
      if (normalizedEntities.length > 0) {
        await db.entities.bulkAdd(normalizedEntities);
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
