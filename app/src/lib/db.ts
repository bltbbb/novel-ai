import Dexie, { type Table } from 'dexie';
import { createParagraphDocument, countDocumentCharacters } from '@/lib/editor-content';
import { createId, createTimestamp } from '@/lib/identity';
import { DEFAULT_SETTINGS } from '@/lib/runtime-config';
import type { AppSettings, Chapter, Id, LoreEntity, Project } from '@/types';

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
  settings!: Table<SettingsRecord, string>;

  constructor() {
    super('ai-novel-studio');

    this.version(1).stores({
      projects: 'id, updatedAt, createdAt',
      chapters: 'id, projectId, [projectId+order], updatedAt',
      entities: 'id, projectId, [projectId+type], name, pinned, updatedAt',
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
  await db.transaction('rw', db.projects, db.chapters, db.entities, async () => {
    await db.projects.delete(projectId);
    await db.chapters.where('projectId').equals(projectId).delete();
    await db.entities.where('projectId').equals(projectId).delete();
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

  await db.transaction('rw', db.projects, db.chapters, db.entities, db.settings, async () => {
    await db.projects.add(demoProject);
    await db.chapters.add(demoChapter);
    await db.entities.add(demoEntity);
    await saveAppSettings(DEFAULT_SETTINGS);
  });
}
