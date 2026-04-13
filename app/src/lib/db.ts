import Dexie, { type Table } from 'dexie';
import { createParagraphDocument, countDocumentCharacters } from '@/lib/editor-content';
import { createId, createTimestamp } from '@/lib/identity';
import { DEFAULT_SETTINGS, normalizeReasoningEffortSetting } from '@/lib/runtime-config';
import type {
  AppSettings,
  BookOutline,
  Chapter,
  ChapterBeat,
  ChapterOutline,
  ChapterSummary,
  Foreshadow,
  GenerationQueueItem,
  IdeaCard,
  Id,
  LoreEntity,
  Project,
  Snapshot,
  StateChange,
  StrandTracker,
  TemplateLibraryItem,
  Volume,
  VolumeOutline,
} from '@/types';

export interface SettingsRecord {
  key: string;
  value: AppSettings;
  updatedAt: string;
}

export const APP_SETTINGS_KEY = 'app-settings';
export const DEFAULT_VOLUME_TITLE = '未分卷';

interface ChapterMigrationRecord extends Chapter {
  volumeId?: Id;
  volumeTitle?: string;
}

function normalizeVolumeTitle(volumeTitle?: string | null) {
  const normalized = volumeTitle?.trim() ?? '';
  return normalized || DEFAULT_VOLUME_TITLE;
}

class NovelDatabase extends Dexie {
  projects!: Table<Project, Id>;
  chapters!: Table<Chapter, Id>;
  volumes!: Table<Volume, Id>;
  bookOutlines!: Table<BookOutline, Id>;
  volumeOutlines!: Table<VolumeOutline, Id>;
  chapterBeats!: Table<ChapterBeat, Id>;
  entities!: Table<LoreEntity, Id>;
  foreshadows!: Table<Foreshadow, Id>;
  snapshots!: Table<Snapshot, Id>;
  ideaCards!: Table<IdeaCard, Id>;
  chapterOutlines!: Table<ChapterOutline, Id>;
  chapterSummaries!: Table<ChapterSummary, Id>;
  stateChanges!: Table<StateChange, Id>;
  strandTrackers!: Table<StrandTracker, Id>;
  generationQueue!: Table<GenerationQueueItem, Id>;
  templateLibrary!: Table<TemplateLibraryItem, Id>;
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

    this.version(4).stores({
      projects: 'id, updatedAt, createdAt',
      chapters: 'id, projectId, [projectId+order], updatedAt',
      entities: 'id, projectId, [projectId+type], name, pinned, updatedAt',
      foreshadows: 'id, projectId, sourceChapterId, resolvedChapterId, [projectId+status], updatedAt',
      snapshots: 'id, projectId, chapterId, [projectId+chapterId], source, createdAt, updatedAt',
      ideaCards: 'id, projectId, sourceChapterId, source, updatedAt, createdAt',
      chapterOutlines: 'id, projectId, chapterId, [projectId+chapterId], strand, updatedAt',
      chapterSummaries: 'id, projectId, chapterId, [projectId+chapterId], updatedAt',
      stateChanges: 'id, projectId, chapterId, entityId, updatedAt',
      strandTrackers: 'projectId, updatedAt',
      settings: 'key, updatedAt',
    });

    this.version(5).stores({
      projects: 'id, updatedAt, createdAt',
      chapters: 'id, projectId, [projectId+order], updatedAt',
      entities: 'id, projectId, [projectId+type], name, pinned, updatedAt',
      foreshadows: 'id, projectId, sourceChapterId, resolvedChapterId, [projectId+status], updatedAt',
      snapshots: 'id, projectId, chapterId, [projectId+chapterId], source, createdAt, updatedAt',
      ideaCards: 'id, projectId, sourceChapterId, source, updatedAt, createdAt',
      chapterOutlines: 'id, projectId, chapterId, [projectId+chapterId], strand, updatedAt',
      chapterSummaries: 'id, projectId, chapterId, [projectId+chapterId], updatedAt',
      stateChanges: 'id, projectId, chapterId, entityId, updatedAt',
      strandTrackers: 'projectId, updatedAt',
      generationQueue: 'id, projectId, chapterId, [projectId+chapterId], status, updatedAt',
      settings: 'key, updatedAt',
    });

    this.version(6)
      .stores({
        projects: 'id, updatedAt, createdAt',
        chapters: 'id, projectId, volumeId, [projectId+order], updatedAt',
        volumes: 'id, projectId, [projectId+order], title, updatedAt',
        bookOutlines: 'id, projectId, updatedAt',
        volumeOutlines: 'id, projectId, volumeId, [projectId+volumeId], updatedAt',
        entities: 'id, projectId, [projectId+type], name, pinned, updatedAt',
        foreshadows: 'id, projectId, sourceChapterId, resolvedChapterId, [projectId+status], updatedAt',
        snapshots: 'id, projectId, chapterId, [projectId+chapterId], source, createdAt, updatedAt',
        ideaCards: 'id, projectId, sourceChapterId, source, updatedAt, createdAt',
        chapterOutlines: 'id, projectId, chapterId, [projectId+chapterId], strand, updatedAt',
        chapterSummaries: 'id, projectId, chapterId, [projectId+chapterId], updatedAt',
        stateChanges: 'id, projectId, chapterId, entityId, updatedAt',
        strandTrackers: 'projectId, updatedAt',
        generationQueue: 'id, projectId, chapterId, [projectId+chapterId], status, updatedAt',
        settings: 'key, updatedAt',
      })
      .upgrade(async (tx) => {
        const chapterTable = tx.table<ChapterMigrationRecord, Id>('chapters');
        const volumeTable = tx.table<Volume, Id>('volumes');
        const chapters = await chapterTable.toArray();

        if (chapters.length === 0) {
          return;
        }

        chapters.sort((left, right) => {
          if (left.projectId === right.projectId) {
            return left.order - right.order;
          }

          return left.projectId.localeCompare(right.projectId);
        });

        const volumeIdMap = new Map<string, Id>();
        const volumeOrderMap = new Map<Id, number>();
        const nextVolumes: Volume[] = [];
        const nextChapters: ChapterMigrationRecord[] = [];

        for (const chapter of chapters) {
          const normalizedVolumeTitle = normalizeVolumeTitle(chapter.volumeTitle);
          const volumeKey = `${chapter.projectId}::${normalizedVolumeTitle}`;
          let volumeId = volumeIdMap.get(volumeKey);

          if (!volumeId) {
            volumeId = createId();
            volumeIdMap.set(volumeKey, volumeId);

            const order = (volumeOrderMap.get(chapter.projectId) ?? 0) + 1;
            volumeOrderMap.set(chapter.projectId, order);

            nextVolumes.push({
              id: volumeId,
              projectId: chapter.projectId,
              title: normalizedVolumeTitle,
              order,
              createdAt: chapter.createdAt,
              updatedAt: chapter.updatedAt,
            });
          }

          nextChapters.push({
            ...chapter,
            volumeId,
            volumeTitle: normalizedVolumeTitle,
          });
        }

        if (nextVolumes.length > 0) {
          await volumeTable.bulkPut(nextVolumes);
        }

        await chapterTable.bulkPut(nextChapters);
      });

    this.version(7).stores({
      projects: 'id, updatedAt, createdAt',
      chapters: 'id, projectId, volumeId, [projectId+order], updatedAt',
      volumes: 'id, projectId, [projectId+order], title, updatedAt',
      bookOutlines: 'id, projectId, updatedAt',
      volumeOutlines: 'id, projectId, volumeId, [projectId+volumeId], updatedAt',
      chapterBeats:
        'id, projectId, volumeId, chapterId, orderInVolume, [volumeId+orderInVolume], [projectId+volumeId], updatedAt',
      entities: 'id, projectId, [projectId+type], name, pinned, updatedAt',
      foreshadows: 'id, projectId, sourceChapterId, resolvedChapterId, [projectId+status], updatedAt',
      snapshots: 'id, projectId, chapterId, [projectId+chapterId], source, createdAt, updatedAt',
      ideaCards: 'id, projectId, sourceChapterId, source, updatedAt, createdAt',
      chapterOutlines: 'id, projectId, chapterId, [projectId+chapterId], strand, updatedAt',
      chapterSummaries: 'id, projectId, chapterId, [projectId+chapterId], updatedAt',
      stateChanges: 'id, projectId, chapterId, entityId, updatedAt',
      strandTrackers: 'projectId, updatedAt',
      generationQueue: 'id, projectId, chapterId, [projectId+chapterId], status, updatedAt',
      settings: 'key, updatedAt',
    });

    this.version(8).stores({
      projects: 'id, updatedAt, createdAt',
      chapters: 'id, projectId, volumeId, [projectId+order], updatedAt',
      volumes: 'id, projectId, [projectId+order], title, updatedAt',
      bookOutlines: 'id, projectId, updatedAt',
      volumeOutlines: 'id, projectId, volumeId, [projectId+volumeId], updatedAt',
      chapterBeats:
        'id, projectId, volumeId, chapterId, orderInVolume, [volumeId+orderInVolume], [projectId+volumeId], updatedAt',
      entities: 'id, projectId, [projectId+type], name, pinned, updatedAt',
      foreshadows: 'id, projectId, sourceChapterId, resolvedChapterId, [projectId+status], updatedAt',
      snapshots: 'id, projectId, chapterId, [projectId+chapterId], source, createdAt, updatedAt',
      ideaCards: 'id, projectId, sourceChapterId, source, updatedAt, createdAt',
      chapterOutlines: 'id, projectId, chapterId, [projectId+chapterId], strand, updatedAt',
      chapterSummaries: 'id, projectId, chapterId, [projectId+chapterId], updatedAt',
      stateChanges: 'id, projectId, chapterId, entityId, updatedAt',
      strandTrackers: 'projectId, updatedAt',
      generationQueue: 'id, projectId, chapterId, [projectId+chapterId], status, updatedAt',
      templateLibrary: 'id, updatedAt, createdAt, name, sourceTitle',
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

  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...settingsRecord.value,
    serverUrl: DEFAULT_SETTINGS.serverUrl,
    reasoningEffort: normalizeReasoningEffortSetting(settingsRecord.value.reasoningEffort),
  };

  const shouldMigrateServerUrl =
    typeof settingsRecord.value.serverUrl === 'string' &&
    settingsRecord.value.serverUrl.trim() !== DEFAULT_SETTINGS.serverUrl;
  const shouldMigrateDefaultModel =
    settings.modelName === 'gpt-4o-mini' &&
    settings.stylePrompt === '';

  if (shouldMigrateServerUrl || shouldMigrateDefaultModel) {
    const migratedSettings = {
      ...settings,
      ...(shouldMigrateDefaultModel ? { modelName: DEFAULT_SETTINGS.modelName } : {}),
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
  const tables: Table<any, any>[] = [
    db.projects,
    db.chapters as Table<any, any>,
    db.volumes,
    db.bookOutlines,
    db.volumeOutlines,
    db.chapterBeats,
    db.entities,
    db.foreshadows,
    db.snapshots,
    db.ideaCards,
    db.chapterOutlines,
    db.chapterSummaries,
    db.stateChanges,
    db.strandTrackers,
    db.generationQueue,
  ];

  await db.transaction(
    'rw',
    tables,
    async () => {
      await db.projects.delete(projectId);
      await db.chapters.where('projectId').equals(projectId).delete();
      await db.volumes.where('projectId').equals(projectId).delete();
      await db.bookOutlines.where('projectId').equals(projectId).delete();
      await db.volumeOutlines.where('projectId').equals(projectId).delete();
      await db.chapterBeats.where('projectId').equals(projectId).delete();
      await db.entities.where('projectId').equals(projectId).delete();
      await db.foreshadows.where('projectId').equals(projectId).delete();
      await db.snapshots.where('projectId').equals(projectId).delete();
      await db.ideaCards.where('projectId').equals(projectId).delete();
      await db.chapterOutlines.where('projectId').equals(projectId).delete();
      await db.chapterSummaries.where('projectId').equals(projectId).delete();
      await db.stateChanges.where('projectId').equals(projectId).delete();
      await db.strandTrackers.where('projectId').equals(projectId).delete();
      await db.generationQueue.where('projectId').equals(projectId).delete();
    },
  );
}

export async function seedDemoData() {
  const projectCount = await db.projects.count();

  if (projectCount > 0) {
    return;
  }

  const now = createTimestamp();
  const projectId = 'demo-project-last-cultivator';
  const entityIds = {
    linChong: 'demo-entity-linchong',
    blackIronShard: 'demo-entity-black-iron-shard',
    guiluWell: 'demo-entity-guilu-well',
    xieWuJiu: 'demo-entity-xie-wujiu',
    refiningSect: 'demo-entity-refining-sect',
    hanShanZhou: 'demo-entity-han-shanzhou',
    mistSaltGuild: 'demo-entity-mist-salt-guild',
    mistSaltStation: 'demo-entity-mist-salt-station',
    copperCrowLedger: 'demo-entity-copper-crow-ledger',
  } as const;
  const demoVolumeIds = {
    volume1: 'demo-volume-1',
    volume2: 'demo-volume-2',
  } as const;
  const chapterSeeds = [
    {
      id: 'demo-chapter-001',
      title: '第1章：废墟苏醒',
      order: 1,
      volumeTitle: '第一卷',
      content:
        '灵气枯竭后的废墟还残留着昨夜风暴卷起的尘灰。林冲从塌陷的楼阁间醒来，掌心里那枚黑铁片忽然变得微热，像是在回应远处古井壁上的残缺铭纹。',
      outline: {
        goal: '确认苏醒后的处境与第一条异常信号',
        obstacle: '废墟陌生且灵气稀薄',
        cost: '必须暴露残存修为自保',
        beats: ['在废墟中苏醒', '黑铁片第一次发热', '古井残纹与铁片共鸣'],
        timeAnchor: '清晨',
        chapterTimeSpan: '半个时辰',
        gapFromPrevious: '故事开篇',
        strand: 'quest' as const,
        hookType: '异物共鸣',
        hookStrength: 'medium' as const,
        immutableFacts: ['林冲是最后一名修仙者', '黑铁片来历未知'],
      },
      summary: {
        summary: '林冲在废墟中苏醒，第一次确认黑铁片会对古井残纹产生异常共鸣。',
        hook: '黑铁片为何会在古井前突然发热？',
        foreshadowings: ['黑铁片的真实来历', '归炉井入口仍然存在'],
      },
      stateChanges: [
        { entityName: '林冲', field: '位置', oldValue: '未知', newValue: '废墟' },
        { entityName: '林冲', field: '状态', oldValue: '沉睡', newValue: '苏醒' },
        { entityName: '黑铁片', field: '状态', oldValue: '沉寂', newValue: '微热' },
      ],
    },
    {
      id: 'demo-chapter-003',
      title: '第3章：古井微光',
      order: 3,
      volumeTitle: '第一卷',
      content:
        '林冲沿着废墟下层的裂缝找到一口封死多年的古井。井壁上的炼器铭文在黑铁片靠近时泛起冷光，他确认这口井和失落多年的归炉井体系有关，但入口坐标仍然残缺。',
      outline: {
        goal: '确认黑铁片与古井遗迹的关系',
        obstacle: '井壁铭文残缺，坐标不完整',
        cost: '必须深入废墟下层冒险',
        beats: ['进入古井区', '铭文亮起', '确认归炉井线索'],
        timeAnchor: '午后',
        chapterTimeSpan: '一个时辰',
        gapFromPrevious: '两日后',
        strand: 'quest' as const,
        hookType: '遗迹解锁',
        hookStrength: 'medium' as const,
        immutableFacts: ['古井是旧炼器体系遗迹', '入口坐标仍不完整'],
      },
      summary: {
        summary: '林冲在古井井壁发现旧炼器铭文，确认黑铁片与归炉井体系直接相关。',
        hook: '谁拿走了入口坐标缺失的一角？',
        foreshadowings: ['归炉井入口坐标'],
      },
      stateChanges: [
        { entityName: '林冲', field: '位置', oldValue: '废墟', newValue: '古井区' },
        { entityName: '归炉井', field: '状态', oldValue: '封闭', newValue: '出现微光' },
      ],
    },
    {
      id: 'demo-chapter-008',
      title: '第8章：黑铁片异响',
      order: 8,
      volumeTitle: '第一卷',
      content:
        '旧坊市的废炉群在夜里同时回响，黑铁片的震动频率与炉火残响完全重叠。谢无咎第一次点破“炼器宗钥印”这个说法，并提出愿意拿一张残图换林冲手里的情报。',
      outline: {
        goal: '让黑铁片异响进入公开线索',
        obstacle: '谢无咎意图不明',
        cost: '必须让渡部分情报试探对方',
        beats: ['抵达旧坊市', '废炉群回响', '谢无咎提出交换'],
        timeAnchor: '深夜',
        chapterTimeSpan: '两个时辰',
        gapFromPrevious: '五日后',
        strand: 'fire' as const,
        hookType: '人物揭示',
        hookStrength: 'strong' as const,
        immutableFacts: ['谢无咎知道黑铁片的旧称', '黑铁片与炼器宗有关'],
      },
      summary: {
        summary: '黑铁片在旧坊市废炉前异响，谢无咎首次提出“炼器宗钥印”的说法。',
        hook: '谢无咎为什么会知道黑铁片的旧称？',
        foreshadowings: ['谢无咎的真实立场'],
      },
      stateChanges: [
        { entityName: '林冲', field: '位置', oldValue: '古井区', newValue: '旧坊市' },
        { entityName: '谢无咎', field: '身份', oldValue: '陌生线人', newValue: '掌握炼器宗线索的人' },
        { entityName: '谢无咎', field: '关系', oldValue: '与林冲互不信任', newValue: '与林冲达成暂时合作' },
      ],
    },
    {
      id: 'demo-chapter-010',
      title: '第10章：雾盐旧账',
      order: 10,
      volumeTitle: '第一卷',
      content:
        '雾盐驿站的账房在夜雨里翻出一册铜鸦账册，韩山舟与雾盐帮为三年前的矿票争执不休。账册只记录盐路运价与仓单暗号，牵出的焦点是驿站税印究竟由谁偷换。',
      outline: {
        goal: '交代旧卷侧线冲突并埋入可冷归档噪音样本',
        obstacle: '账册信息只涉及盐路旧账，难以追溯责任方',
        cost: '必须公开驿站税印失窃事实',
        beats: ['账房翻出铜鸦账册', '韩山舟与雾盐帮对峙', '税印失窃成为唯一线索'],
        timeAnchor: '夜雨',
        chapterTimeSpan: '一个时辰',
        gapFromPrevious: '两日后',
        strand: 'fire' as const,
        hookType: '侧线纠纷',
        hookStrength: 'soft' as const,
        immutableFacts: ['冲突仅围绕盐路账务', '侧线人物尚未进入主线'],
      },
      summary: {
        summary: '雾盐驿站爆出税印失窃，韩山舟与雾盐帮围绕铜鸦账册展开旧账争执。',
        hook: '谁在三年前调换了驿站税印？',
        foreshadowings: ['雾盐驿站税印失窃案'],
      },
      stateChanges: [
        { entityName: '韩山舟', field: '立场', oldValue: '中立账房', newValue: '公开指控雾盐帮' },
        { entityName: '雾盐帮', field: '状态', oldValue: '低调经营', newValue: '卷入税印纠纷' },
        { entityName: '雾盐驿站', field: '状态', oldValue: '账务封存', newValue: '税印失窃曝光' },
        { entityName: '铜鸦账册', field: '状态', oldValue: '封存', newValue: '被翻出对账' },
      ],
    },
    {
      id: 'demo-chapter-013',
      title: '第13章：旧坊市线索',
      order: 13,
      volumeTitle: '第一卷',
      content:
        '林冲用黑铁片在旧坊市换来了一张残缺炉图，终于确认第二卷的主线会指向归炉井。残图缺失的一角被标注为“北城库房”，而谢无咎只肯透露入口坐标已经有人先一步动过。',
      outline: {
        goal: '把归炉井从传闻推进到明确目标',
        obstacle: '残图缺角且信息不完整',
        cost: '必须接受谢无咎的条件',
        beats: ['换到残缺炉图', '确认第二卷目标', '入口坐标被提前动过'],
        timeAnchor: '黄昏',
        chapterTimeSpan: '一个时辰',
        gapFromPrevious: '七日后',
        strand: 'constellation' as const,
        hookType: '路线确认',
        hookStrength: 'medium' as const,
        immutableFacts: ['归炉井是下一阶段主目标', '残图缺角位于北城库房'],
      },
      summary: {
        summary: '林冲得到残缺炉图，明确第二卷将前往归炉井，但入口坐标已经被人提前触动。',
        hook: '谁比林冲更早接触归炉井入口？',
        foreshadowings: ['归炉井入口坐标', '谢无咎的真实立场'],
      },
      stateChanges: [
        { entityName: '林冲', field: '位置', oldValue: '旧坊市', newValue: '北城库房' },
        { entityName: '黑铁片', field: '状态', oldValue: '微热', newValue: '持续震动' },
      ],
    },
    {
      id: 'demo-chapter-015',
      title: '第15章：钥印底纹',
      order: 15,
      volumeTitle: '第一卷',
      content:
        '北城库房残图的夹层里藏着一段抄录，明确写明黑铁片是归炉井前夜仪轨的首枚钥印。抄录还提醒若缺少同频回响，开井礼会在子时前反噬施礼者。',
      outline: {
        goal: '在旧卷中明确跨阶段关键线索',
        obstacle: '抄录内容缺失下半段仪轨细节',
        cost: '必须提前暴露开井礼失败风险',
        beats: ['拆开残图夹层', '确认黑铁片与前夜仪轨绑定', '记录开井礼反噬条件'],
        timeAnchor: '子时前',
        chapterTimeSpan: '半个时辰',
        gapFromPrevious: '一日后',
        strand: 'quest' as const,
        hookType: '关键情报',
        hookStrength: 'strong' as const,
        immutableFacts: ['黑铁片与归炉井前夜仪轨直接相关', '开井礼存在反噬门槛'],
      },
      summary: {
        summary: '残图抄录确认黑铁片是归炉井前夜仪轨的首枚钥印，并揭示开井礼反噬条件。',
        hook: '谁掌握了抄录缺失的下半段仪轨？',
        foreshadowings: ['前夜仪轨全貌', '开井礼反噬机制'],
      },
      stateChanges: [
        { entityName: '黑铁片', field: '认知', oldValue: '来历未知碎片', newValue: '前夜仪轨首枚钥印' },
        { entityName: '归炉井', field: '进入条件', oldValue: '入口坐标残缺', newValue: '需前夜仪轨同频开启' },
      ],
    },
    {
      id: 'demo-chapter-021',
      title: '第21章：归炉井残图',
      order: 21,
      volumeTitle: '第二卷',
      content:
        '进入第二卷后，林冲凭残图抵达归炉井外围，发现入口并不是自然松动，而像是被人按照炼器宗旧礼节打开过。黑铁片在井口前再次沉寂，让他意识到最后一步必须等到“前夜”时刻。',
      outline: {
        goal: '完成第二卷场景切换并确认入口异常',
        obstacle: '入口开启痕迹过于整齐',
        cost: '必须暂缓强行进入归炉井',
        beats: ['进入归炉井外围', '发现入口开启痕迹', '确认必须等到前夜'],
        timeAnchor: '入夜前',
        chapterTimeSpan: '两个时辰',
        gapFromPrevious: '八日后',
        strand: 'quest' as const,
        hookType: '场景切换',
        hookStrength: 'medium' as const,
        immutableFacts: ['第二卷场景切换到归炉井', '入口已经被人提前打开过'],
      },
      summary: {
        summary: '林冲抵达归炉井外围，确认入口曾被人按旧礼节打开过，真正进入时机仍未到。',
        hook: '谁在林冲之前完成了开井礼节？',
        foreshadowings: ['黑铁片的真实来历', '归炉井入口坐标'],
      },
      stateChanges: [
        { entityName: '林冲', field: '位置', oldValue: '北城库房', newValue: '归炉井外环' },
        { entityName: '归炉井', field: '状态', oldValue: '出现微光', newValue: '入口松动' },
      ],
    },
    {
      id: 'demo-chapter-024',
      title: '第24章：归炉前夜',
      order: 24,
      volumeTitle: '第二卷',
      content:
        '归炉前夜，黑铁片终于在井口前显出完整纹路。林冲确认它并不是普通碎片，而是炼器宗最后留下的钥印之一；第一卷埋下的那条旧伏笔开始回收，但井底深处仍然回荡着第二枚钥印的回声。',
      outline: {
        goal: '回收第一卷核心伏笔并开启下一层悬念',
        obstacle: '钥印只揭开部分真相',
        cost: '必须正式踏入归炉井',
        beats: ['等待前夜时刻', '钥印显出完整纹路', '确认井底仍有第二枚钥印'],
        timeAnchor: '深夜子时',
        chapterTimeSpan: '半个时辰',
        gapFromPrevious: '三日后',
        strand: 'quest' as const,
        hookType: '伏笔回收',
        hookStrength: 'strong' as const,
        immutableFacts: ['黑铁片是炼器宗钥印', '井底仍有第二枚钥印'],
      },
      summary: {
        summary: '归炉前夜，林冲确认黑铁片是炼器宗钥印之一，第一卷核心伏笔开始正式回收。',
        hook: '井底深处的第二枚钥印为何还在回应？',
        foreshadowings: ['第二枚钥印', '谢无咎的真实立场'],
      },
      stateChanges: [
        { entityName: '林冲', field: '位置', oldValue: '归炉井外环', newValue: '归炉井前厅' },
        { entityName: '黑铁片', field: '身份', oldValue: '未知碎片', newValue: '炼器宗钥印' },
      ],
    },
  ] as const;

  const chapterContentMap = new Map(
    chapterSeeds.map((seed) => [seed.id, createParagraphDocument(seed.content)] as const),
  );
  const volumeIdByTitle = new Map<string, Id>([
    ['第一卷', demoVolumeIds.volume1],
    ['第二卷', demoVolumeIds.volume2],
  ]);
  const demoChapters: Chapter[] = chapterSeeds.map((seed) => {
    const content = chapterContentMap.get(seed.id)!;

    return {
      id: seed.id,
      projectId,
      volumeId: volumeIdByTitle.get(seed.volumeTitle) ?? demoVolumeIds.volume1,
      volumeTitle: seed.volumeTitle,
      title: seed.title,
      order: seed.order,
      content,
      wordCount: countDocumentCharacters(content),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
  });
  const demoVolumes: Volume[] = [
    {
      id: demoVolumeIds.volume1,
      projectId,
      title: '第一卷',
      order: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: demoVolumeIds.volume2,
      projectId,
      title: '第二卷',
      order: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const demoBookOutline: BookOutline = {
    id: 'demo-book-outline',
    projectId,
    premise: '末法时代，最后一名修仙者在废墟中追索失落炼器文明。',
    centralConflict: '林冲必须在旧势力争夺前，找到归炉井并掌握钥印真相。',
    protagonistArc: '林冲从被动求生转向主动布局，逐步成为新秩序的制定者。',
    thematicCore: '传承与断代之间，个人选择如何改写时代命运。',
    worldRules: ['末法时代灵气稀薄', '归炉井仪轨需要同频钥印', '越级施礼会触发反噬'],
    endgameHint: '黑铁片只是第一枚钥印，真正终局在更深层遗迹。',
    toneGuide: '废土仙侠+悬疑推进，节奏偏紧，情绪克制但有爆点。',
    createdAt: now,
    updatedAt: now,
  };
  const demoVolumeOutlines: VolumeOutline[] = [
    {
      id: 'demo-volume-outline-1',
      projectId,
      volumeId: demoVolumeIds.volume1,
      goal: '确认黑铁片与归炉井体系的关系，建立主线任务。',
      keyConflict: '线索残缺且多方势力试探，主角信息长期不对称。',
      arcSummary: '从废墟苏醒到钥印底纹确认，完成“线索期”主弧。',
      entryState: '林冲刚苏醒，黑铁片来历未知。',
      exitState: '确认黑铁片是钥印，进入开井前夜准备阶段。',
      keyEvents: ['古井铭纹共鸣', '谢无咎提出钥印说', '钥印底纹抄录曝光'],
      foreshadowSeeds: ['开井礼反噬条件', '第二枚钥印回声'],
      estimatedChapterCount: 100,
      milestones: [
        {
          title: '废墟苏醒与线索起手',
          targetChapterCount: 30,
          phaseGoal: '让林冲站稳脚跟，并确认黑铁片与归炉井存在直接联系。',
          phaseConflict: '信息残缺，谢无咎等人试探不断，主角始终处于信息劣势。',
          entryState: '林冲刚苏醒，黑铁片来历未知。',
          exitState: '林冲确认钥印体系存在，开始主动追线。',
          keyTurns: ['古井铭纹第一次共鸣', '谢无咎提出钥印说'],
          mustPlant: ['开井礼反噬条件', '第二枚钥印回声'],
          mustPayoff: [],
          powerCeiling: '只能小幅恢复与试探，不能提前掌握完整炼器体系。',
        },
        {
          title: '钥印确认与前夜准备',
          targetChapterCount: 35,
          phaseGoal: '围绕钥印底纹、归炉井入口和开井前夜做持续推进。',
          phaseConflict: '各方势力逐步下场，主角必须在暴露与隐藏之间找平衡。',
          entryState: '钥印体系被初步确认。',
          exitState: '进入开井前夜，局势明显收紧。',
          keyTurns: ['钥印底纹抄录曝光', '前夜仪轨条件逐渐完整'],
          mustPlant: ['谁提前开启入口', '谢无咎真实立场'],
          mustPayoff: ['第二枚钥印回声'],
          powerCeiling: '主角仍以布局和试探为主，不能提前无代价破局。',
        },
        {
          title: '归炉井开启与卷末抛悬',
          targetChapterCount: 35,
          phaseGoal: '推进归炉井真正开启，并把卷末悬念立住。',
          phaseConflict: '未知对手先手布置，入口异常开启带来新的威胁。',
          entryState: '开井前夜准备完成。',
          exitState: '黑铁片钥印身份确认，第二枚钥印成为新主问题。',
          keyTurns: ['归炉井外围侦查', '第二枚钥印回声出现'],
          mustPlant: ['更深层遗迹', '旧时代炼器文明真空'],
          mustPayoff: ['开井礼反噬条件'],
          powerCeiling: '卷末只能完成阶段性突破，不能把深层遗迹主谜团一次性写完。',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-volume-outline-2',
      projectId,
      volumeId: demoVolumeIds.volume2,
      goal: '推进归炉井开启并回收第一卷核心伏笔。',
      keyConflict: '入口被提前动过，主角必须在未知对手前完成开井。',
      arcSummary: '完成场景切换并回收主伏笔，同时抛出更深层悬念。',
      entryState: '林冲抵达归炉井外围，入口已有异常开启痕迹。',
      exitState: '黑铁片钥印身份确认，第二枚钥印成为新主问题。',
      keyEvents: ['归炉井外围侦查', '前夜仪轨触发', '第二枚钥印回声出现'],
      foreshadowSeeds: ['谁提前开启入口', '谢无咎真实立场'],
      estimatedChapterCount: 120,
      milestones: [
        {
          title: '外围侦查与敌意显形',
          targetChapterCount: 40,
          phaseGoal: '摸清归炉井外围局势，确认谁先动了入口。',
          phaseConflict: '对手隐藏在暗处，主角每推进一步都可能暴露底牌。',
          entryState: '林冲抵达归炉井外围。',
          exitState: '入口异动背后的敌意被初步锁定。',
          keyTurns: ['外围侦查', '异常开启痕迹被确认'],
          mustPlant: ['谁提前开启入口'],
          mustPayoff: [],
          powerCeiling: '只能局部试探，不应无准备正面碾压敌手。',
        },
        {
          title: '前夜仪轨与阵营洗牌',
          targetChapterCount: 45,
          phaseGoal: '围绕前夜仪轨推进，并让盟友与对手关系重组。',
          phaseConflict: '仪轨触发条件苛刻，局势在合作与背刺之间反复摇摆。',
          entryState: '敌意来源初步浮出水面。',
          exitState: '主角完成关键前夜布置，但代价明显。',
          keyTurns: ['前夜仪轨触发', '谢无咎立场摇摆'],
          mustPlant: ['更深层遗迹线索'],
          mustPayoff: ['谁提前开启入口'],
          powerCeiling: '只能完成阶段准备，不能直接写成终局战。',
        },
        {
          title: '钥印确认与新主问题抛出',
          targetChapterCount: 35,
          phaseGoal: '确认黑铁片钥印身份，并抛出更大的主线问题。',
          phaseConflict: '真相越清晰，真正的争夺者越逼近。',
          entryState: '前夜布置完成。',
          exitState: '第二枚钥印成为下一卷核心问题。',
          keyTurns: ['第二枚钥印回声出现', '黑铁片身份确认'],
          mustPlant: ['第二枚钥印真正持有者'],
          mustPayoff: ['谢无咎真实立场'],
          powerCeiling: '卷末只能完成身份确认，不能把所有敌手与终局全部揭穿。',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
  const demoProject: Project = {
    id: projectId,
    title: '最后一个修仙者',
    description: '末法时代下的赛博修仙故事；当前内置为稀疏章序的检索参数标定样本。',
    genre: ['仙侠', '赛博朋克'],
    stylePrompt: '',
    templateSnapshot: null,
    generationGateOverride: null,
    wordCount: demoChapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    createdAt: now,
    updatedAt: now,
  };
  const demoEntities: LoreEntity[] = [
    {
      id: entityIds.linChong,
      projectId,
      type: 'character',
      name: '林冲',
      description: '青云门最后传人，沿着黑铁片与归炉井线索追查旧时代遗迹。',
      fields: {
        境界: '结丹期',
        当前目标: '确认归炉井与黑铁片的关系',
      },
      tags: ['主角'],
      pinned: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: entityIds.blackIronShard,
      projectId,
      type: 'item',
      name: '黑铁片',
      description: '第一卷起就伴随林冲的神秘碎片，第二卷确认其为炼器宗钥印。',
      fields: {
        初始状态: '沉寂',
        当前状态: '炼器宗钥印',
      },
      tags: ['核心道具'],
      pinned: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: entityIds.guiluWell,
      projectId,
      type: 'location',
      name: '归炉井',
      description: '旧炼器宗遗留的封闭遗迹，入口会对钥印和前夜时刻作出回应。',
      fields: {
        状态: '入口松动',
        风险: '井底仍有未知回响',
      },
      tags: ['核心地点'],
      pinned: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: entityIds.xieWuJiu,
      projectId,
      type: 'character',
      name: '谢无咎',
      description: '掌握旧炼器宗线索的灰色线人，与林冲保持短暂合作。',
      fields: {
        身份: '灰色线人',
        立场: '待确认',
      },
      tags: ['关键配角'],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: entityIds.refiningSect,
      projectId,
      type: 'faction',
      name: '炼器宗',
      description: '失落已久的旧时代宗门，黑铁片与归炉井都指向其遗产。',
      fields: {
        状态: '失落',
        核心遗产: '钥印与归炉井',
      },
      tags: ['旧时代宗门'],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: entityIds.hanShanZhou,
      projectId,
      type: 'character',
      name: '韩山舟',
      description: '雾盐驿站账房，长期处理盐路矿票与仓单，卷入税印旧账风波。',
      fields: {
        身份: '驿站账房',
        当前冲突: '公开指控雾盐帮偷换税印',
      },
      tags: ['侧线人物'],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: entityIds.mistSaltGuild,
      projectId,
      type: 'faction',
      name: '雾盐帮',
      description: '经营盐路与矿票的地方帮会，在旧账对峙中成为争议中心。',
      fields: {
        核心业务: '盐路运价与仓单流转',
        当前状态: '卷入税印纠纷',
      },
      tags: ['侧线势力'],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: entityIds.mistSaltStation,
      projectId,
      type: 'location',
      name: '雾盐驿站',
      description: '旧盐路中转站，保管矿票账册与税印凭证。',
      fields: {
        状态: '税印失窃曝光',
        风险: '账务追责未了',
      },
      tags: ['侧线地点'],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: entityIds.copperCrowLedger,
      projectId,
      type: 'item',
      name: '铜鸦账册',
      description: '记录盐路运价与仓单暗号的旧账簿，是税印纠纷的核心证据。',
      fields: {
        状态: '被翻出对账',
        用途: '核对三年前矿票流向',
      },
      tags: ['侧线道具'],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const entityIdByName = new Map(
    demoEntities.map((entity) => [entity.name, entity.id] as const),
  );
  const demoForeshadows: Foreshadow[] = [
    {
      id: 'demo-foreshadow-origin',
      projectId,
      title: '黑铁片的真实来历',
      excerpt: '黑铁片会对古井残纹产生异常共鸣。',
      notes: '在归炉前夜回收，确认它其实是炼器宗钥印。',
      status: 'planted',
      sourceChapterId: 'demo-chapter-001',
      resolvedChapterId: 'demo-chapter-024',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-foreshadow-map',
      projectId,
      title: '归炉井入口坐标',
      excerpt: '古井铭文只给出了一半入口坐标。',
      notes: '在第二卷中继续推进，保持激活状态用于近期检索。',
      status: 'activated',
      sourceChapterId: 'demo-chapter-013',
      resolvedChapterId: 'demo-chapter-024',
      createdAt: now,
      updatedAt: now,
    },
  ];
  const demoSnapshots: Snapshot[] = [
    {
      id: 'demo-snapshot-opening',
      projectId,
      chapterId: 'demo-chapter-001',
      chapterTitle: '第1章：废墟苏醒',
      content: chapterContentMap.get('demo-chapter-001')!,
      source: 'manual',
      note: '标定样本开篇快照',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-snapshot-pre-night',
      projectId,
      chapterId: 'demo-chapter-024',
      chapterTitle: '第24章：归炉前夜',
      content: chapterContentMap.get('demo-chapter-024')!,
      source: 'manual',
      note: '用于观察核心伏笔回收前后的章节状态',
      createdAt: now,
      updatedAt: now,
    },
  ];
  const demoIdeaCards: IdeaCard[] = [
    {
      id: 'demo-idea-calibration-route',
      projectId,
      sourceChapterId: 'demo-chapter-013',
      title: '参数标定观察线',
      content: '优先观察“黑铁片的真实来历”是否能在第24章进入前列，以及近期章节切片是否会被旧伏笔挤掉。',
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    },
  ];
  const demoChapterOutlines: ChapterOutline[] = chapterSeeds.map((seed) => ({
    id: `outline-${seed.id}`,
    projectId,
    chapterId: seed.id,
    goal: seed.outline.goal,
    obstacle: seed.outline.obstacle,
    cost: seed.outline.cost,
    beats: [...seed.outline.beats],
    timeAnchor: seed.outline.timeAnchor,
    chapterTimeSpan: seed.outline.chapterTimeSpan,
    gapFromPrevious: seed.outline.gapFromPrevious,
    strand: seed.outline.strand,
    hookType: seed.outline.hookType,
    hookStrength: seed.outline.hookStrength,
    immutableFacts: [...seed.outline.immutableFacts],
    createdAt: now,
    updatedAt: now,
  }));
  const demoChapterSummaries: ChapterSummary[] = chapterSeeds.map((seed) => ({
    id: `summary-${seed.id}`,
    projectId,
    chapterId: seed.id,
    summary: seed.summary.summary,
    hook: seed.summary.hook,
    foreshadowings: [...seed.summary.foreshadowings],
    createdAt: now,
    updatedAt: now,
  }));
  const demoStateChanges: StateChange[] = chapterSeeds.flatMap((seed, chapterIndex) =>
    seed.stateChanges.map((change, changeIndex) => ({
      id: `state-${chapterIndex + 1}-${changeIndex + 1}`,
      projectId,
      chapterId: seed.id,
      entityId: entityIdByName.get(change.entityName) ?? null,
      entityName: change.entityName,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const demoStrandTracker: StrandTracker = {
    projectId,
    history: chapterSeeds.map((seed) => ({
      chapterId: seed.id,
      chapterTitle: seed.title,
      strand: seed.outline.strand,
      createdAt: now,
    })),
    lastQuestChapterId: 'demo-chapter-024',
    lastFireChapterId: 'demo-chapter-008',
    lastConstellationChapterId: 'demo-chapter-013',
    updatedAt: now,
  };

  const tables: Table<any, any>[] = [
    db.projects,
    db.chapters as Table<any, any>,
    db.volumes,
    db.bookOutlines,
    db.volumeOutlines,
    db.entities,
    db.foreshadows,
    db.snapshots,
    db.ideaCards,
    db.chapterOutlines,
    db.chapterSummaries,
    db.stateChanges,
    db.strandTrackers,
    db.settings,
  ];

  await db.transaction(
    'rw',
    tables,
    async () => {
      await db.projects.add(demoProject);
      await db.chapters.bulkAdd(demoChapters);
      await db.volumes.bulkAdd(demoVolumes);
      await db.bookOutlines.put(demoBookOutline);
      await db.volumeOutlines.bulkAdd(demoVolumeOutlines);
      await db.entities.bulkAdd(demoEntities);
      await db.foreshadows.bulkAdd(demoForeshadows);
      await db.snapshots.bulkAdd(demoSnapshots);
      await db.ideaCards.bulkAdd(demoIdeaCards);
      await db.chapterOutlines.bulkAdd(demoChapterOutlines);
      await db.chapterSummaries.bulkAdd(demoChapterSummaries);
      await db.stateChanges.bulkAdd(demoStateChanges);
      await db.strandTrackers.put(demoStrandTracker);
      await saveAppSettings(DEFAULT_SETTINGS);
    },
  );
}
