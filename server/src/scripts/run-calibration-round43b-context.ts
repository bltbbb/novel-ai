import { loadServerEnv } from '../config/env.js';
import { getGenerationDebugContext } from '../services/generation-debug-store.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';

interface ChapterSeed {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  previousChapterId: string;
  previousChapterTitle: string;
  entitiesAppeared: string[];
  locations: string[];
}

interface EntitySeed {
  name: string;
  type: string;
  description: string;
  pinned: number;
  lastSeenChapterId?: string;
  lastSeenChapterTitle?: string;
}

interface RelationshipSeed {
  id: string;
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: string;
  sourceKind: 'state_change' | 'sentence_pattern';
  description: string;
  evidence: string;
  chapterId: string;
  chapterTitle: string;
}

interface MainchainScenario {
  key: string;
  label: string;
  projectId: string;
  currentChapterId: string;
  currentChapterTitle: string;
  currentChapterOrder: number;
  previousChapterId: string;
  previousChapterTitle: string;
  previousSummary: string;
  volumeTitle: string;
  outline: {
    goal: string;
    obstacle: string;
    cost: string;
    beats: string[];
    immutableFacts: string[];
  };
  expectedModePrefix: 'graph_1hop' | 'graph_2hop';
  expectedPath: [string, string, string];
  expectedPolicyKeyword: string;
  expectedSecondaryPrefix: '补位评估：' | '补充评估：' | null;
  chapters: ChapterSeed[];
  entities: EntitySeed[];
  relationships: RelationshipSeed[];
}

const CURRENT_TIME = new Date().toISOString();

const SCENARIOS: MainchainScenario[] = [
  {
    key: 'map-trail-fallback',
    label: '旧令追索补位链',
    projectId: 'calibration-project-relationship-2hop-mainchain-map-trail',
    currentChapterId: 'rel2hop-mainchain-map-trail-chapter-018',
    currentChapterTitle: '第18章：沉舟断案',
    currentChapterOrder: 18,
    previousChapterId: 'rel2hop-mainchain-map-trail-chapter-012',
    previousChapterTitle: '第12章：锈令旧闻',
    previousSummary: '顾沉舟掌握了若干旧线索，但真假混杂，仍未锁定真正关键人。',
    volumeTitle: '第二卷',
    outline: {
      goal: '顾沉舟判断旧线索真假并确认下一步调查方向',
      obstacle: '风闻和传闻大量混入，直接关系信号噪音偏高',
      cost: '必须在嘈杂线索中保留真正关键链条',
      beats: ['整理杂讯', '排除低质量关系', '确认真正关键的下一跳'],
      immutableFacts: ['顾沉舟仍在追查旧令牌线索'],
    },
    expectedModePrefix: 'graph_2hop',
    expectedPath: ['顾沉舟', '灰手甲', '锈门令'],
    expectedPolicyKeyword: '二度路径补位',
    expectedSecondaryPrefix: '补位评估：',
    chapters: [
      {
        chapterId: 'rel2hop-mainchain-map-trail-chapter-004',
        chapterTitle: '第4章：灰市借印',
        chapterOrder: 4,
        previousChapterId: '',
        previousChapterTitle: '',
        entitiesAppeared: ['顾沉舟', '灰手甲'],
        locations: ['灰市'],
      },
      {
        chapterId: 'rel2hop-mainchain-map-trail-chapter-006',
        chapterTitle: '第6章：风闻杂讯',
        chapterOrder: 6,
        previousChapterId: 'rel2hop-mainchain-map-trail-chapter-004',
        previousChapterTitle: '第4章：灰市借印',
        entitiesAppeared: ['顾沉舟', '雾客甲'],
        locations: ['旧坊市'],
      },
      {
        chapterId: 'rel2hop-mainchain-map-trail-chapter-007',
        chapterTitle: '第7章：旧巷传闻',
        chapterOrder: 7,
        previousChapterId: 'rel2hop-mainchain-map-trail-chapter-006',
        previousChapterTitle: '第6章：风闻杂讯',
        entitiesAppeared: ['顾沉舟', '雾客乙'],
        locations: ['旧巷'],
      },
      {
        chapterId: 'rel2hop-mainchain-map-trail-chapter-008',
        chapterTitle: '第8章：摊前耳报',
        chapterOrder: 8,
        previousChapterId: 'rel2hop-mainchain-map-trail-chapter-007',
        previousChapterTitle: '第7章：旧巷传闻',
        entitiesAppeared: ['顾沉舟', '雾客丙'],
        locations: ['灯市'],
      },
      {
        chapterId: 'rel2hop-mainchain-map-trail-chapter-009',
        chapterTitle: '第9章：桥洞碎话',
        chapterOrder: 9,
        previousChapterId: 'rel2hop-mainchain-map-trail-chapter-008',
        previousChapterTitle: '第8章：摊前耳报',
        entitiesAppeared: ['顾沉舟', '雾客丁'],
        locations: ['桥洞'],
      },
      {
        chapterId: 'rel2hop-mainchain-map-trail-chapter-010',
        chapterTitle: '第10章：旧门影子',
        chapterOrder: 10,
        previousChapterId: 'rel2hop-mainchain-map-trail-chapter-009',
        previousChapterTitle: '第9章：桥洞碎话',
        entitiesAppeared: ['顾沉舟', '雾客戊'],
        locations: ['旧门外街'],
      },
      {
        chapterId: 'rel2hop-mainchain-map-trail-chapter-011',
        chapterTitle: '第11章：散市流言',
        chapterOrder: 11,
        previousChapterId: 'rel2hop-mainchain-map-trail-chapter-010',
        previousChapterTitle: '第10章：旧门影子',
        entitiesAppeared: ['顾沉舟', '雾客己'],
        locations: ['散市'],
      },
      {
        chapterId: 'rel2hop-mainchain-map-trail-chapter-012',
        chapterTitle: '第12章：锈令旧闻',
        chapterOrder: 12,
        previousChapterId: 'rel2hop-mainchain-map-trail-chapter-011',
        previousChapterTitle: '第11章：散市流言',
        entitiesAppeared: ['灰手甲', '锈门令'],
        locations: ['旧典铺'],
      },
      {
        chapterId: 'rel2hop-mainchain-map-trail-chapter-018',
        chapterTitle: '第18章：沉舟断案',
        chapterOrder: 18,
        previousChapterId: 'rel2hop-mainchain-map-trail-chapter-012',
        previousChapterTitle: '第12章：锈令旧闻',
        entitiesAppeared: ['顾沉舟'],
        locations: ['北库审案房'],
      },
    ],
    entities: [
      { name: '顾沉舟', type: 'character', description: '当前主视角调查者。', pinned: 1 },
      { name: '灰手甲', type: 'character', description: '掌握旧令牌去向的中继线人。', pinned: 0 },
      { name: '锈门令', type: 'item', description: '旧门令牌。', pinned: 0 },
      { name: '雾客甲', type: 'character', description: '噪音线人之一。', pinned: 0 },
      { name: '雾客乙', type: 'character', description: '噪音线人之一。', pinned: 0 },
      { name: '雾客丙', type: 'character', description: '噪音线人之一。', pinned: 0 },
      { name: '雾客丁', type: 'character', description: '噪音线人之一。', pinned: 0 },
      { name: '雾客戊', type: 'character', description: '噪音线人之一。', pinned: 0 },
      { name: '雾客己', type: 'character', description: '噪音线人之一。', pinned: 0 },
    ],
    relationships: [
      {
        id: 'rel2hop-mainchain-map-trail-edge-focus-via',
        sourceEntityName: '顾沉舟',
        targetEntityName: '灰手甲',
        relationshipType: '秘密接头',
        sourceKind: 'state_change',
        description: '顾沉舟曾通过灰市暗号与灰手甲接头。',
        evidence: '灰市接头关系被确认',
        chapterId: 'rel2hop-mainchain-map-trail-chapter-004',
        chapterTitle: '第4章：灰市借印',
      },
      {
        id: 'rel2hop-mainchain-map-trail-edge-via-target',
        sourceEntityName: '灰手甲',
        targetEntityName: '锈门令',
        relationshipType: '掌握旧令去向',
        sourceKind: 'state_change',
        description: '灰手甲确认自己知道锈门令真正下落。',
        evidence: '旧令去向关系被确认',
        chapterId: 'rel2hop-mainchain-map-trail-chapter-012',
        chapterTitle: '第12章：锈令旧闻',
      },
      {
        id: 'rel2hop-mainchain-map-trail-noise-1',
        sourceEntityName: '顾沉舟',
        targetEntityName: '雾客甲',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '顾沉舟与雾客甲有模糊关联。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-map-trail-chapter-006',
        chapterTitle: '第6章：风闻杂讯',
      },
      {
        id: 'rel2hop-mainchain-map-trail-noise-2',
        sourceEntityName: '顾沉舟',
        targetEntityName: '雾客乙',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '顾沉舟与雾客乙有模糊关联。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-map-trail-chapter-007',
        chapterTitle: '第7章：旧巷传闻',
      },
      {
        id: 'rel2hop-mainchain-map-trail-noise-3',
        sourceEntityName: '顾沉舟',
        targetEntityName: '雾客丙',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '顾沉舟与雾客丙有模糊关联。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-map-trail-chapter-008',
        chapterTitle: '第8章：摊前耳报',
      },
      {
        id: 'rel2hop-mainchain-map-trail-noise-4',
        sourceEntityName: '顾沉舟',
        targetEntityName: '雾客丁',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '顾沉舟与雾客丁有模糊关联。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-map-trail-chapter-009',
        chapterTitle: '第9章：桥洞碎话',
      },
      {
        id: 'rel2hop-mainchain-map-trail-noise-5',
        sourceEntityName: '顾沉舟',
        targetEntityName: '雾客戊',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '顾沉舟与雾客戊有模糊关联。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-map-trail-chapter-010',
        chapterTitle: '第10章：旧门影子',
      },
      {
        id: 'rel2hop-mainchain-map-trail-noise-6',
        sourceEntityName: '顾沉舟',
        targetEntityName: '雾客己',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '顾沉舟与雾客己有模糊关联。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-map-trail-chapter-011',
        chapterTitle: '第11章：散市流言',
      },
    ],
  },
  {
    key: 'bloodline-supplement',
    label: '血契守门补充链',
    projectId: 'calibration-project-relationship-2hop-mainchain-bloodline',
    currentChapterId: 'rel2hop-mainchain-bloodline-chapter-019',
    currentChapterTitle: '第19章：照夜验契',
    currentChapterOrder: 19,
    previousChapterId: 'rel2hop-mainchain-bloodline-chapter-011',
    previousChapterTitle: '第11章：井门旧印',
    previousSummary: '苏照夜确认谢无咎知道旧契来历，但还没锁定真正的入口地点。',
    volumeTitle: '第三卷',
    outline: {
      goal: '苏照夜确认旧契血印该指向哪条真正的祖脉线',
      obstacle: '线人说话半遮半掩，关键入口信息没有直说',
      cost: '苏照夜必须在暴露血印前先判断是否值得继续追查',
      beats: ['复盘旧契线', '核对谢无咎的话', '确认下一步该追的人'],
      immutableFacts: ['苏照夜手里的旧契血印仍未解锁'],
    },
    expectedModePrefix: 'graph_1hop',
    expectedPath: ['苏照夜', '谢无咎', '沉井遗迹'],
    expectedPolicyKeyword: '补充少量二度路径',
    expectedSecondaryPrefix: '补充评估：',
    chapters: [
      {
        chapterId: 'rel2hop-mainchain-bloodline-chapter-005',
        chapterTitle: '第5章：旧契留名',
        chapterOrder: 5,
        previousChapterId: '',
        previousChapterTitle: '',
        entitiesAppeared: ['苏照夜', '谢无咎'],
        locations: ['旧坊市'],
      },
      {
        chapterId: 'rel2hop-mainchain-bloodline-chapter-011',
        chapterTitle: '第11章：井门旧印',
        chapterOrder: 11,
        previousChapterId: 'rel2hop-mainchain-bloodline-chapter-005',
        previousChapterTitle: '第5章：旧契留名',
        entitiesAppeared: ['谢无咎', '沉井遗迹'],
        locations: ['沉井遗迹'],
      },
      {
        chapterId: 'rel2hop-mainchain-bloodline-chapter-019',
        chapterTitle: '第19章：照夜验契',
        chapterOrder: 19,
        previousChapterId: 'rel2hop-mainchain-bloodline-chapter-011',
        previousChapterTitle: '第11章：井门旧印',
        entitiesAppeared: ['苏照夜'],
        locations: ['祖井外廊'],
      },
    ],
    entities: [
      { name: '苏照夜', type: 'character', description: '携带旧契血印的旁系后人。', pinned: 1 },
      { name: '谢无咎', type: 'character', description: '掌握井门旧契线索。', pinned: 0 },
      { name: '沉井遗迹', type: 'location', description: '旧门封闭入口。', pinned: 0 },
      { name: '祖井外廊', type: 'location', description: '当前试印地点。', pinned: 0 },
    ],
    relationships: [
      {
        id: 'rel2hop-mainchain-bloodline-edge-focus-via',
        sourceEntityName: '苏照夜',
        targetEntityName: '谢无咎',
        relationshipType: '持契求证',
        sourceKind: 'state_change',
        description: '苏照夜拿旧契残印向谢无咎求证血脉来源。',
        evidence: '血印与线人建立联系',
        chapterId: 'rel2hop-mainchain-bloodline-chapter-005',
        chapterTitle: '第5章：旧契留名',
      },
      {
        id: 'rel2hop-mainchain-bloodline-edge-via-target',
        sourceEntityName: '谢无咎',
        targetEntityName: '沉井遗迹',
        relationshipType: '知晓入口封印',
        sourceKind: 'state_change',
        description: '谢无咎确认沉井遗迹的入口封印与旧契相关。',
        evidence: '入口封印关系被说明',
        chapterId: 'rel2hop-mainchain-bloodline-chapter-011',
        chapterTitle: '第11章：井门旧印',
      },
      {
        id: 'rel2hop-mainchain-bloodline-noise-1',
        sourceEntityName: '苏照夜',
        targetEntityName: '祖井外廊',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '苏照夜曾在祖井外廊停留整夜。',
        evidence: '风闻',
        chapterId: 'rel2hop-mainchain-bloodline-chapter-019',
        chapterTitle: '第19章：照夜验契',
      },
    ],
  },
  {
    key: 'imperial-edict-fallback',
    label: '朝堂密诏补位链',
    projectId: 'calibration-project-relationship-2hop-mainchain-edict',
    currentChapterId: 'rel2hop-mainchain-edict-chapter-026',
    currentChapterTitle: '第26章：临渊夜审',
    currentChapterOrder: 26,
    previousChapterId: 'rel2hop-mainchain-edict-chapter-014',
    previousChapterTitle: '第14章：裴印旧案',
    previousSummary: '谢临渊翻完北库旧卷，只知道裴掌印曾碰过一封不能公开的旧诏。',
    volumeTitle: '第四卷',
    outline: {
      goal: '谢临渊确认旧案背后真正压着哪一道密诏',
      obstacle: '北库里关于旧案的传闻太多，直接关系候选噪音偏高',
      cost: '若判断失误，就会惊动内库司和东阙台',
      beats: ['筛掉散碎传闻', '锁定真正关键的中继人物', '确认下一跳目标'],
      immutableFacts: ['谢临渊正在追查北库旧案'],
    },
    expectedModePrefix: 'graph_2hop',
    expectedPath: ['谢临渊', '裴掌印', '乌鳞密诏'],
    expectedPolicyKeyword: '二度路径补位',
    expectedSecondaryPrefix: '补位评估：',
    chapters: [
      {
        chapterId: 'rel2hop-mainchain-edict-chapter-003',
        chapterTitle: '第3章：夜访掌印',
        chapterOrder: 3,
        previousChapterId: '',
        previousChapterTitle: '',
        entitiesAppeared: ['谢临渊', '裴掌印'],
        locations: ['内库司'],
      },
      {
        chapterId: 'rel2hop-mainchain-edict-chapter-006',
        chapterTitle: '第6章：外朝杂闻',
        chapterOrder: 6,
        previousChapterId: 'rel2hop-mainchain-edict-chapter-003',
        previousChapterTitle: '第3章：夜访掌印',
        entitiesAppeared: ['谢临渊', '台谏甲'],
        locations: ['午门外街'],
      },
      {
        chapterId: 'rel2hop-mainchain-edict-chapter-007',
        chapterTitle: '第7章：北库风声',
        chapterOrder: 7,
        previousChapterId: 'rel2hop-mainchain-edict-chapter-006',
        previousChapterTitle: '第6章：外朝杂闻',
        entitiesAppeared: ['谢临渊', '台谏乙'],
        locations: ['北库'],
      },
      {
        chapterId: 'rel2hop-mainchain-edict-chapter-008',
        chapterTitle: '第8章：东阙议论',
        chapterOrder: 8,
        previousChapterId: 'rel2hop-mainchain-edict-chapter-007',
        previousChapterTitle: '第7章：北库风声',
        entitiesAppeared: ['谢临渊', '校尉甲'],
        locations: ['东阙台'],
      },
      {
        chapterId: 'rel2hop-mainchain-edict-chapter-009',
        chapterTitle: '第9章：库吏碎语',
        chapterOrder: 9,
        previousChapterId: 'rel2hop-mainchain-edict-chapter-008',
        previousChapterTitle: '第8章：东阙议论',
        entitiesAppeared: ['谢临渊', '库吏甲'],
        locations: ['北库侧廊'],
      },
      {
        chapterId: 'rel2hop-mainchain-edict-chapter-010',
        chapterTitle: '第10章：旧牍转述',
        chapterOrder: 10,
        previousChapterId: 'rel2hop-mainchain-edict-chapter-009',
        previousChapterTitle: '第9章：库吏碎语',
        entitiesAppeared: ['谢临渊', '库吏乙'],
        locations: ['旧牍库'],
      },
      {
        chapterId: 'rel2hop-mainchain-edict-chapter-011',
        chapterTitle: '第11章：中官秘闻',
        chapterOrder: 11,
        previousChapterId: 'rel2hop-mainchain-edict-chapter-010',
        previousChapterTitle: '第10章：旧牍转述',
        entitiesAppeared: ['谢临渊', '中官甲'],
        locations: ['内东门'],
      },
      {
        chapterId: 'rel2hop-mainchain-edict-chapter-014',
        chapterTitle: '第14章：裴印旧案',
        chapterOrder: 14,
        previousChapterId: 'rel2hop-mainchain-edict-chapter-011',
        previousChapterTitle: '第11章：中官秘闻',
        entitiesAppeared: ['裴掌印', '乌鳞密诏'],
        locations: ['北库密室'],
      },
      {
        chapterId: 'rel2hop-mainchain-edict-chapter-026',
        chapterTitle: '第26章：临渊夜审',
        chapterOrder: 26,
        previousChapterId: 'rel2hop-mainchain-edict-chapter-014',
        previousChapterTitle: '第14章：裴印旧案',
        entitiesAppeared: ['谢临渊'],
        locations: ['夜审房'],
      },
    ],
    entities: [
      { name: '谢临渊', type: 'character', description: '追查北库旧案的年轻御史。', pinned: 1 },
      { name: '裴掌印', type: 'character', description: '掌握旧案密钥的中继人物。', pinned: 0 },
      { name: '乌鳞密诏', type: 'item', description: '旧案真正牵出的密诏。', pinned: 0 },
      { name: '台谏甲', type: 'character', description: '噪音人物之一。', pinned: 0 },
      { name: '台谏乙', type: 'character', description: '噪音人物之一。', pinned: 0 },
      { name: '校尉甲', type: 'character', description: '噪音人物之一。', pinned: 0 },
      { name: '库吏甲', type: 'character', description: '噪音人物之一。', pinned: 0 },
      { name: '库吏乙', type: 'character', description: '噪音人物之一。', pinned: 0 },
      { name: '中官甲', type: 'character', description: '噪音人物之一。', pinned: 0 },
    ],
    relationships: [
      {
        id: 'rel2hop-mainchain-edict-edge-focus-via',
        sourceEntityName: '谢临渊',
        targetEntityName: '裴掌印',
        relationshipType: '夜访追查',
        sourceKind: 'state_change',
        description: '谢临渊夜访裴掌印，想确认北库旧案的真正源头。',
        evidence: '夜访掌印关系被确认',
        chapterId: 'rel2hop-mainchain-edict-chapter-003',
        chapterTitle: '第3章：夜访掌印',
      },
      {
        id: 'rel2hop-mainchain-edict-edge-via-target',
        sourceEntityName: '裴掌印',
        targetEntityName: '乌鳞密诏',
        relationshipType: '掌握密诏藏处',
        sourceKind: 'state_change',
        description: '裴掌印知道乌鳞密诏实际被压在哪间北库密室里。',
        evidence: '密诏藏处被确认',
        chapterId: 'rel2hop-mainchain-edict-chapter-014',
        chapterTitle: '第14章：裴印旧案',
      },
      {
        id: 'rel2hop-mainchain-edict-noise-1',
        sourceEntityName: '谢临渊',
        targetEntityName: '台谏甲',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '谢临渊与台谏甲之间有过模糊接触。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-edict-chapter-006',
        chapterTitle: '第6章：外朝杂闻',
      },
      {
        id: 'rel2hop-mainchain-edict-noise-2',
        sourceEntityName: '谢临渊',
        targetEntityName: '台谏乙',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '谢临渊与台谏乙之间有过模糊接触。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-edict-chapter-007',
        chapterTitle: '第7章：北库风声',
      },
      {
        id: 'rel2hop-mainchain-edict-noise-3',
        sourceEntityName: '谢临渊',
        targetEntityName: '校尉甲',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '谢临渊与校尉甲之间有过模糊接触。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-edict-chapter-008',
        chapterTitle: '第8章：东阙议论',
      },
      {
        id: 'rel2hop-mainchain-edict-noise-4',
        sourceEntityName: '谢临渊',
        targetEntityName: '库吏甲',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '谢临渊与库吏甲之间有过模糊接触。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-edict-chapter-009',
        chapterTitle: '第9章：库吏碎语',
      },
      {
        id: 'rel2hop-mainchain-edict-noise-5',
        sourceEntityName: '谢临渊',
        targetEntityName: '库吏乙',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '谢临渊与库吏乙之间有过模糊接触。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-edict-chapter-010',
        chapterTitle: '第10章：旧牍转述',
      },
      {
        id: 'rel2hop-mainchain-edict-noise-6',
        sourceEntityName: '谢临渊',
        targetEntityName: '中官甲',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '谢临渊与中官甲之间有过模糊接触。',
        evidence: '传闻',
        chapterId: 'rel2hop-mainchain-edict-chapter-011',
        chapterTitle: '第11章：中官秘闻',
      },
    ],
  },
] as const;

function clearProject(db: ReturnType<typeof getGenerationDatabase>, projectId: string) {
  const tables = [
    'generation_jobs',
    'generation_chapter_summaries',
    'generation_state_changes',
    'generation_review_metrics',
    'generation_entities',
    'generation_relationships',
    'generation_foreshadows',
    'generation_chapter_index',
    'generation_volume_recaps',
    'generation_memory_chunks',
    'generation_memory_embeddings',
  ];

  for (const table of tables) {
    db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(projectId);
  }
}

function seedScenario(db: ReturnType<typeof getGenerationDatabase>, scenario: MainchainScenario) {
  clearProject(db, scenario.projectId);

  const insertChapter = db.prepare(`
    INSERT INTO generation_chapter_index (
      project_id,
      chapter_id,
      chapter_title,
      chapter_order,
      volume_title,
      previous_chapter_id,
      previous_chapter_title,
      time_anchor,
      strand,
      entities_appeared_json,
      locations_json,
      summary_excerpt,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const chapter of scenario.chapters) {
    insertChapter.run(
      scenario.projectId,
      chapter.chapterId,
      chapter.chapterTitle,
      chapter.chapterOrder,
      scenario.volumeTitle,
      chapter.previousChapterId,
      chapter.previousChapterTitle,
      '深夜',
      'quest',
      JSON.stringify(chapter.entitiesAppeared),
      JSON.stringify(chapter.locations),
      `${scenario.label} / 4.3b 主链压测样本`,
      CURRENT_TIME,
      CURRENT_TIME,
    );
  }

  const insertEntity = db.prepare(`
    INSERT INTO generation_entities (
      project_id,
      entity_name,
      entity_type,
      description,
      fields_json,
      tags_json,
      pinned,
      last_seen_chapter_id,
      last_seen_chapter_title,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const entity of scenario.entities) {
    insertEntity.run(
      scenario.projectId,
      entity.name,
      entity.type,
      entity.description,
      JSON.stringify({ 状态: '校准样本' }),
      JSON.stringify([]),
      entity.pinned,
      entity.lastSeenChapterId ?? scenario.currentChapterId,
      entity.lastSeenChapterTitle ?? scenario.currentChapterTitle,
      CURRENT_TIME,
      CURRENT_TIME,
    );
  }

  const insertRelationship = db.prepare(`
    INSERT INTO generation_relationships (
      id,
      project_id,
      source_entity_name,
      target_entity_name,
      relationship_type,
      source_kind,
      description,
      evidence,
      chapter_id,
      chapter_title,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const relationship of scenario.relationships) {
    insertRelationship.run(
      relationship.id,
      scenario.projectId,
      relationship.sourceEntityName,
      relationship.targetEntityName,
      relationship.relationshipType,
      relationship.sourceKind,
      relationship.description,
      relationship.evidence,
      relationship.chapterId,
      relationship.chapterTitle,
      CURRENT_TIME,
      CURRENT_TIME,
    );
  }

  const requestJson = JSON.stringify({
    projectId: scenario.projectId,
    chapterId: scenario.currentChapterId,
    chapterTitle: scenario.currentChapterTitle,
    chapterOrder: scenario.currentChapterOrder,
    volumeTitle: scenario.volumeTitle,
    previousChapterId: scenario.previousChapterId,
    previousChapterTitle: scenario.previousChapterTitle,
    previousSummary: scenario.previousSummary,
    model: 'gpt-5.4-mini',
    temperature: 0.7,
    priority: 0,
    outlineOverride: {
      goal: scenario.outline.goal,
      obstacle: scenario.outline.obstacle,
      cost: scenario.outline.cost,
      beats: scenario.outline.beats,
      timeAnchor: '深夜',
      chapterTimeSpan: '半个时辰',
      gapFromPrevious: '数日后',
      strand: 'quest',
      hookType: '追索',
      hookStrength: 'strong',
      immutableFacts: scenario.outline.immutableFacts,
    },
  });

  const insertJob = db.prepare(`
    INSERT INTO generation_jobs (
      id,
      project_id,
      chapter_id,
      chapter_title,
      status,
      priority,
      current_step,
      completed_beat_count,
      total_beat_count,
      current_beat_index,
      current_beat_label,
      attempt_count,
      review_rewrite_count,
      review_gate_reason,
      rewrite_guidance,
      paused_at,
      request_json,
      outline_json,
      generated_text,
      style_json,
      review_json,
      polish_json,
      summary_json,
      state_changes_json,
      strand,
      error_message,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertJob.run(
    `job-${scenario.key}`,
    scenario.projectId,
    scenario.currentChapterId,
    scenario.currentChapterTitle,
    'queued',
    0,
    'queued',
    0,
    scenario.outline.beats.length,
    null,
    '',
    0,
    0,
    '',
    '',
    null,
    requestJson,
    null,
    '',
    null,
    null,
    null,
    null,
    '[]',
    'quest',
    '',
    CURRENT_TIME,
    CURRENT_TIME,
  );
}

function extractHeaderValue(header: string, prefix: string) {
  const line = header
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  return line ? line.replace(prefix, '').trim() : '';
}

async function main() {
  const env = loadServerEnv();
  const db = getGenerationDatabase(env);

  db.exec('BEGIN');

  try {
    for (const scenario of SCENARIOS) {
      seedScenario(db, scenario);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  let passCount = 0;

  console.log('# 4.3b Mainchain Context Expansion');

  for (const scenario of SCENARIOS) {
    const context = await getGenerationDebugContext(env, scenario.projectId, scenario.currentChapterId);

    if (!context) {
      console.log(`## ${scenario.label}`);
      console.log('context=null');
      console.log('');
      continue;
    }

    const section = context.sections.find((item) => item.key === 'relationships');

    if (!section || section.blocks.length === 0) {
      console.log(`## ${scenario.label}`);
      console.log('relationships section missing');
      console.log('');
      continue;
    }

    const headerBlock = section.blocks[0];
    const mode = extractHeaderValue(headerBlock, '- 命中模式：');
    const reason = extractHeaderValue(headerBlock, '原因：').split('（')[0]?.trim() || '';
    const policy = extractHeaderValue(headerBlock, '接入策略：');
    const hasExpectedPath = section.blocks.some((block) =>
      block.includes(`- 二跳路径：${scenario.expectedPath.join(' -> ')}`),
    );
    const hasExpectedSecondary = scenario.expectedSecondaryPrefix
      ? headerBlock.includes(scenario.expectedSecondaryPrefix)
      : true;
    const passed =
      mode.startsWith(scenario.expectedModePrefix)
      && reason === 'ok'
      && policy.includes(scenario.expectedPolicyKeyword)
      && hasExpectedPath
      && hasExpectedSecondary;

    if (passed) {
      passCount += 1;
    }

    console.log(`## ${scenario.label}`);
    console.log(`projectId: ${scenario.projectId}`);
    console.log(`chapterId: ${scenario.currentChapterId}`);
    console.log(`relationshipCount: ${context.relationshipCount}`);
    console.log(`mode: ${mode || 'unknown'}`);
    console.log(`reason: ${reason || 'unknown'}`);
    console.log(`policy: ${policy || 'unknown'}`);
    console.log(`expectedPath: ${scenario.expectedPath.join(' -> ')}`);
    console.log(`hasExpectedPath: ${hasExpectedPath ? 'yes' : 'no'}`);
    console.log(`decision: ${passed ? 'pass' : 'hold'}`);

    for (const [index, block] of section.blocks.entries()) {
      console.log(`[block-${index}] ${block.replace(/\n/g, ' | ')}`);
    }

    console.log('');
  }

  console.log('## Summary');
  console.log(`pass=${passCount}/${SCENARIOS.length}`);
  console.log(`decision=${passCount === SCENARIOS.length ? 'pass' : 'hold'}`);

  if (passCount !== SCENARIOS.length) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`4.3b 主链 context 扩样失败：${message}`);
  process.exitCode = 1;
});
