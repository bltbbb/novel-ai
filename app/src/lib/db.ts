import Dexie, { type Table } from 'dexie';
import { createParagraphDocument, countDocumentCharacters } from '@/lib/editor-content';
import { createId, createTimestamp } from '@/lib/identity';
import { DEFAULT_SETTINGS } from '@/lib/runtime-config';
import type { AppSettings, Chapter, Foreshadow, IdeaCard, Id, LoreEntity, Project, Snapshot } from '@/types';

export interface SettingsRecord {
  key: string;
  value: AppSettings;
  updatedAt: string;
}

export const APP_SETTINGS_KEY = 'app-settings';

class NovelDatabase extends Dexie {
  projects!: Table<Project, Id>;
  chapters!: Table<Chapter, Id>;
  entities!: Table<LoreEntity, Id>;
  foreshadows!: Table<Foreshadow, Id>;
  snapshots!: Table<Snapshot, Id>;
  ideaCards!: Table<IdeaCard, Id>;
  settings!: Table<SettingsRecord, string>;

  constructor() {
    super('ai-novel-studio');

    this.version(1).stores({
      projects: 'id, updatedAt, createdAt',
      chapters: 'id, projectId, [projectId+order], updatedAt',
      entities: 'id, projectId, [projectId+type], name, pinned, updatedAt',
      settings: 'key, updatedAt',
    });

    this.version(2).stores({
      projects: 'id, updatedAt, createdAt',
      chapters: 'id, projectId, [projectId+order], updatedAt',
      entities: 'id, projectId, [projectId+type], name, pinned, updatedAt',
      foreshadows: 'id, projectId, sourceChapterId, resolvedChapterId, [projectId+status], updatedAt',
      settings: 'key, updatedAt',
    });

    this.version(3).stores({
      projects: 'id, updatedAt, createdAt',
      chapters: 'id, projectId, [projectId+order], updatedAt',
      entities: 'id, projectId, [projectId+type], name, pinned, updatedAt',
      foreshadows: 'id, projectId, sourceChapterId, resolvedChapterId, [projectId+status], updatedAt',
      snapshots: 'id, projectId, chapterId, [projectId+chapterId], source, createdAt, updatedAt',
      ideaCards: 'id, projectId, sourceChapterId, source, updatedAt, createdAt',
      settings: 'key, updatedAt',
    });
  }
}

export const db = new NovelDatabase();

export async function saveAppSettings(settings: AppSettings) {
  await db.settings.put({
    key: APP_SETTINGS_KEY,
    value: settings,
    updatedAt: createTimestamp(),
  });
}

export async function loadAppSettings() {
  const settingsRecord = await db.settings.get(APP_SETTINGS_KEY);

  if (!settingsRecord) {
    return DEFAULT_SETTINGS;
  }

  const settings = settingsRecord.value;

  // 将早期默认值 gpt-4o-mini 平滑迁移到当前本地服务可用的默认模型。
  if (
    settings.modelName === 'gpt-4o-mini' &&
    settings.serverUrl === DEFAULT_SETTINGS.serverUrl &&
    settings.stylePrompt === ''
  ) {
    const migratedSettings = {
      ...settings,
      modelName: DEFAULT_SETTINGS.modelName,
    };

    await saveAppSettings(migratedSettings);
    return migratedSettings;
  }

  return settings;
}

export async function touchProject(projectId: Id, patch?: Partial<Project>) {
  await db.projects.update(projectId, {
    ...patch,
    updatedAt: createTimestamp(),
  });
}

export async function recalculateProjectWordCount(projectId: Id) {
  const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
  const wordCount = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);

  await touchProject(projectId, { wordCount });
  return wordCount;
}

export async function deleteProjectCascade(projectId: Id) {
  await db.transaction('rw', db.projects, db.chapters, db.entities, db.foreshadows, db.snapshots, db.ideaCards, async () => {
    await db.projects.delete(projectId);
    await db.chapters.where('projectId').equals(projectId).delete();
    await db.entities.where('projectId').equals(projectId).delete();
    await db.foreshadows.where('projectId').equals(projectId).delete();
    await db.snapshots.where('projectId').equals(projectId).delete();
    await db.ideaCards.where('projectId').equals(projectId).delete();
  });
}

export async function seedDemoData() {
  const projectCount = await db.projects.count();

  if (projectCount > 0) {
    return;
  }

  const now = createTimestamp();
  const projectId = createId();
  const chapterId = createId();
  const entityId = createId();
  const foreshadowId = createId();
  const snapshotId = createId();
  const ideaCardId = createId();
  const chapterContent = createParagraphDocument('灵气枯竭之后，最后一名修仙者在废墟里醒来。');

  const demoProject: Project = {
    id: projectId,
    title: '最后一个修仙者',
    description: '末法时代下的赛博修仙故事。',
    genre: ['仙侠', '赛博朋克'],
    wordCount: countDocumentCharacters(chapterContent),
    createdAt: now,
    updatedAt: now,
  };

  const demoChapter: Chapter = {
    id: chapterId,
    projectId,
    title: '第1章：废墟苏醒',
    order: 1,
    content: chapterContent,
    wordCount: countDocumentCharacters(chapterContent),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };

  const demoEntity: LoreEntity = {
    id: entityId,
    projectId,
    type: 'character',
    name: '林冲',
    description: '青云门最后传人，表面是废品站少年。',
    fields: {
      境界: '结丹期',
      身份: '最后传人',
    },
    tags: ['主角'],
    pinned: true,
    createdAt: now,
    updatedAt: now,
  };

  const demoForeshadow: Foreshadow = {
    id: foreshadowId,
    projectId,
    title: '黑铁片的真实来历',
    excerpt: '灵气枯竭之后，最后一名修仙者在废墟里醒来。',
    notes: '后续进入炼器宗主线时需要回收，解释黑铁片与旧时代的关系。',
    status: 'planted',
    sourceChapterId: chapterId,
    resolvedChapterId: null,
    createdAt: now,
    updatedAt: now,
  };

  const demoSnapshot: Snapshot = {
    id: snapshotId,
    projectId,
    chapterId,
    chapterTitle: demoChapter.title,
    content: chapterContent,
    source: 'manual',
    note: '开篇版本快照',
    createdAt: now,
    updatedAt: now,
  };

  const demoIdeaCard: IdeaCard = {
    id: ideaCardId,
    projectId,
    sourceChapterId: chapterId,
    title: '废墟开篇的氛围方向',
    content: '强化“末法时代 + 赛博废土”的反差感，让开篇同时具备破败感和旧修仙文明残响。',
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction(
    'rw',
    [db.projects, db.chapters, db.entities, db.foreshadows, db.snapshots, db.ideaCards, db.settings],
    async () => {
    await db.projects.add(demoProject);
    await db.chapters.add(demoChapter);
    await db.entities.add(demoEntity);
    await db.foreshadows.add(demoForeshadow);
    await db.snapshots.add(demoSnapshot);
    await db.ideaCards.add(demoIdeaCard);
    await saveAppSettings(DEFAULT_SETTINGS);
    },
  );
}
