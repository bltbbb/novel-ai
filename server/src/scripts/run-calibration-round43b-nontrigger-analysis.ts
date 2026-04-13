import { loadServerEnv } from '../config/env.js';
import { getGenerationDebugContext } from '../services/generation-debug-store.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';
import type { GenerationDebugContext } from '../types/ai.js';

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

type NonTriggerCategory =
  | 'onehop_sufficient'
  | 'twohop_redundant'
  | 'sparse_history'
  | 'onehop_noise_without_twohop';

interface NonTriggerScenario {
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
  expectedCategory: NonTriggerCategory;
  chapters: ChapterSeed[];
  entities: EntitySeed[];
  relationships: RelationshipSeed[];
}

const CURRENT_TIME = new Date().toISOString();

const SCENARIOS: NonTriggerScenario[] = [
  {
    key: 'onehop-sufficient',
    label: '一度强信号已足够',
    projectId: 'calibration-project-relationship-2hop-nontrigger-onehop-sufficient',
    currentChapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-016',
    currentChapterTitle: '第16章：渡舟定案',
    currentChapterOrder: 16,
    previousChapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-012',
    previousChapterTitle: '第12章：旧谱归鞘',
    previousSummary: '陈渡舟已经把旧刀谱、旧观主和北河渡口三条线都捞出来了，现在更像是做定案而不是继续扩线。',
    volumeTitle: '第二卷',
    outline: {
      goal: '陈渡舟整理现成线索，做出明确判断',
      obstacle: '三条线都指向旧案，但彼此之间没有更多必要的间接推理',
      cost: '若判断失误，前面收束的三条线会一起崩掉',
      beats: ['复盘旧谱', '核对旧观主口供', '锁定渡口旧案责任'],
      immutableFacts: ['陈渡舟手里已经有足够直接关系'],
    },
    expectedCategory: 'onehop_sufficient',
    chapters: [
      {
        chapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-004',
        chapterTitle: '第4章：刀谱出匣',
        chapterOrder: 4,
        previousChapterId: '',
        previousChapterTitle: '',
        entitiesAppeared: ['陈渡舟', '断潮刀谱'],
        locations: ['旧兵库'],
      },
      {
        chapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-008',
        chapterTitle: '第8章：观主夜谈',
        chapterOrder: 8,
        previousChapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-004',
        previousChapterTitle: '第4章：刀谱出匣',
        entitiesAppeared: ['陈渡舟', '旧观主'],
        locations: ['破观'],
      },
      {
        chapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-012',
        chapterTitle: '第12章：旧谱归鞘',
        chapterOrder: 12,
        previousChapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-008',
        previousChapterTitle: '第8章：观主夜谈',
        entitiesAppeared: ['陈渡舟', '北河渡口'],
        locations: ['北河渡口'],
      },
      {
        chapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-016',
        chapterTitle: '第16章：渡舟定案',
        chapterOrder: 16,
        previousChapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-012',
        previousChapterTitle: '第12章：旧谱归鞘',
        entitiesAppeared: ['陈渡舟'],
        locations: ['议案房'],
      },
    ],
    entities: [
      { name: '陈渡舟', type: 'character', description: '当前追查旧案的主角。', pinned: 1 },
      { name: '断潮刀谱', type: 'item', description: '直接物证。', pinned: 0 },
      { name: '旧观主', type: 'character', description: '直接证人。', pinned: 0 },
      { name: '北河渡口', type: 'location', description: '直接案发地点。', pinned: 0 },
    ],
    relationships: [
      {
        id: 'rel2hop-nontrigger-onehop-sufficient-edge-1',
        sourceEntityName: '陈渡舟',
        targetEntityName: '断潮刀谱',
        relationshipType: '掌握物证',
        sourceKind: 'state_change',
        description: '陈渡舟已经掌握断潮刀谱。',
        evidence: '物证已到手',
        chapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-004',
        chapterTitle: '第4章：刀谱出匣',
      },
      {
        id: 'rel2hop-nontrigger-onehop-sufficient-edge-2',
        sourceEntityName: '陈渡舟',
        targetEntityName: '旧观主',
        relationshipType: '取得口供',
        sourceKind: 'state_change',
        description: '陈渡舟夜谈后拿到旧观主口供。',
        evidence: '证人口供被确认',
        chapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-008',
        chapterTitle: '第8章：观主夜谈',
      },
      {
        id: 'rel2hop-nontrigger-onehop-sufficient-edge-3',
        sourceEntityName: '陈渡舟',
        targetEntityName: '北河渡口',
        relationshipType: '锁定案发地',
        sourceKind: 'state_change',
        description: '陈渡舟已经锁定北河渡口就是旧案现场。',
        evidence: '案发地被确认',
        chapterId: 'rel2hop-nontrigger-onehop-sufficient-chapter-012',
        chapterTitle: '第12章：旧谱归鞘',
      },
    ],
  },
  {
    key: 'twohop-redundant',
    label: '二跳路径冗余未补充',
    projectId: 'calibration-project-relationship-2hop-nontrigger-redundant',
    currentChapterId: 'rel2hop-nontrigger-redundant-chapter-019',
    currentChapterTitle: '第19章：照夜试契',
    currentChapterOrder: 19,
    previousChapterId: 'rel2hop-nontrigger-redundant-chapter-011',
    previousChapterTitle: '第11章：井门旧印',
    previousSummary: '苏照夜已经摸到谢无咎和沉井遗迹两条直接线索，这一章只是做最后确认。',
    volumeTitle: '第三卷',
    outline: {
      goal: '苏照夜确认旧契线没有偏掉',
      obstacle: '旧契相关线索已经被摊开，新增二跳未必带来额外信息',
      cost: '若强行扩线，反而会干扰已有判断',
      beats: ['核对旧契', '确认线人', '确认入口'],
      immutableFacts: ['苏照夜已直接拿到关键一度关系'],
    },
    expectedCategory: 'twohop_redundant',
    chapters: [
      {
        chapterId: 'rel2hop-nontrigger-redundant-chapter-005',
        chapterTitle: '第5章：旧契留名',
        chapterOrder: 5,
        previousChapterId: '',
        previousChapterTitle: '',
        entitiesAppeared: ['苏照夜', '谢无咎'],
        locations: ['旧坊市'],
      },
      {
        chapterId: 'rel2hop-nontrigger-redundant-chapter-011',
        chapterTitle: '第11章：井门旧印',
        chapterOrder: 11,
        previousChapterId: 'rel2hop-nontrigger-redundant-chapter-005',
        previousChapterTitle: '第5章：旧契留名',
        entitiesAppeared: ['苏照夜', '沉井遗迹', '谢无咎'],
        locations: ['沉井遗迹'],
      },
      {
        chapterId: 'rel2hop-nontrigger-redundant-chapter-019',
        chapterTitle: '第19章：照夜试契',
        chapterOrder: 19,
        previousChapterId: 'rel2hop-nontrigger-redundant-chapter-011',
        previousChapterTitle: '第11章：井门旧印',
        entitiesAppeared: ['苏照夜'],
        locations: ['祖井外廊'],
      },
    ],
    entities: [
      { name: '苏照夜', type: 'character', description: '携带旧契血印的旁系后人。', pinned: 1 },
      { name: '谢无咎', type: 'character', description: '旧契线人。', pinned: 0 },
      { name: '沉井遗迹', type: 'location', description: '旧门入口。', pinned: 0 },
    ],
    relationships: [
      {
        id: 'rel2hop-nontrigger-redundant-edge-1',
        sourceEntityName: '苏照夜',
        targetEntityName: '谢无咎',
        relationshipType: '持契求证',
        sourceKind: 'state_change',
        description: '苏照夜拿旧契去找谢无咎求证。',
        evidence: '血印线被确认',
        chapterId: 'rel2hop-nontrigger-redundant-chapter-005',
        chapterTitle: '第5章：旧契留名',
      },
      {
        id: 'rel2hop-nontrigger-redundant-edge-2',
        sourceEntityName: '苏照夜',
        targetEntityName: '沉井遗迹',
        relationshipType: '已知入口位置',
        sourceKind: 'state_change',
        description: '苏照夜已经知道沉井遗迹就是下一步入口。',
        evidence: '入口已被明示',
        chapterId: 'rel2hop-nontrigger-redundant-chapter-011',
        chapterTitle: '第11章：井门旧印',
      },
      {
        id: 'rel2hop-nontrigger-redundant-edge-3',
        sourceEntityName: '谢无咎',
        targetEntityName: '沉井遗迹',
        relationshipType: '知晓入口封印',
        sourceKind: 'state_change',
        description: '谢无咎知道沉井遗迹的入口封印。',
        evidence: '入口封印关系被说明',
        chapterId: 'rel2hop-nontrigger-redundant-chapter-011',
        chapterTitle: '第11章：井门旧印',
      },
    ],
  },
  {
    key: 'sparse-history',
    label: '历史关系稀薄',
    projectId: 'calibration-project-relationship-2hop-nontrigger-sparse',
    currentChapterId: 'rel2hop-nontrigger-sparse-chapter-017',
    currentChapterTitle: '第17章：旧塔停步',
    currentChapterOrder: 17,
    previousChapterId: 'rel2hop-nontrigger-sparse-chapter-012',
    previousChapterTitle: '第12章：残灯照壁',
    previousSummary: '沈秋实只知道旧塔里可能藏过一段旧案，但还没有稳定关系可用。',
    volumeTitle: '第三卷',
    outline: {
      goal: '沈秋实确认旧塔线是否值得继续追',
      obstacle: '手里只有零散感知，没有形成稳定关系边',
      cost: '如果判断失误，会白白浪费一整条调查线',
      beats: ['回看旧塔', '对照残灯', '判断是否继续'],
      immutableFacts: ['沈秋实目前只掌握碎片线索'],
    },
    expectedCategory: 'sparse_history',
    chapters: [
      {
        chapterId: 'rel2hop-nontrigger-sparse-chapter-012',
        chapterTitle: '第12章：残灯照壁',
        chapterOrder: 12,
        previousChapterId: '',
        previousChapterTitle: '',
        entitiesAppeared: ['沈秋实', '旧钥塔'],
        locations: ['旧钥塔'],
      },
      {
        chapterId: 'rel2hop-nontrigger-sparse-chapter-017',
        chapterTitle: '第17章：旧塔停步',
        chapterOrder: 17,
        previousChapterId: 'rel2hop-nontrigger-sparse-chapter-012',
        previousChapterTitle: '第12章：残灯照壁',
        entitiesAppeared: ['沈秋实'],
        locations: ['塔外石坪'],
      },
    ],
    entities: [
      { name: '沈秋实', type: 'character', description: '当前焦点人物。', pinned: 1 },
      { name: '旧钥塔', type: 'location', description: '旧线索地点。', pinned: 0 },
      { name: '残灯壁纹', type: 'item', description: '模糊线索。', pinned: 0 },
    ],
    relationships: [],
  },
  {
    key: 'onehop-noise-no-twohop',
    label: '一度噪音高且二度不足',
    projectId: 'calibration-project-relationship-2hop-nontrigger-noise',
    currentChapterId: 'rel2hop-nontrigger-noise-chapter-020',
    currentChapterTitle: '第20章：楼下停步',
    currentChapterOrder: 20,
    previousChapterId: 'rel2hop-nontrigger-noise-chapter-013',
    previousChapterTitle: '第13章：借印复盘',
    previousSummary: '裴照夜面前全是传闻关系，但没有一条真正能继续往下推。',
    volumeTitle: '第四卷',
    outline: {
      goal: '裴照夜排除真假混杂的旧印线索',
      obstacle: '一度候选很多，但大多只是模糊关系',
      cost: '若误信任何一条传闻，都会把调查带偏',
      beats: ['收集传闻', '排除噪音', '确认没有必要继续追'],
      immutableFacts: ['裴照夜当前缺少稳定关系边'],
    },
    expectedCategory: 'onehop_noise_without_twohop',
    chapters: [
      {
        chapterId: 'rel2hop-nontrigger-noise-chapter-008',
        chapterTitle: '第8章：楼前耳报',
        chapterOrder: 8,
        previousChapterId: '',
        previousChapterTitle: '',
        entitiesAppeared: ['裴照夜', '散客甲'],
        locations: ['酒楼前街'],
      },
      {
        chapterId: 'rel2hop-nontrigger-noise-chapter-010',
        chapterTitle: '第10章：街角流言',
        chapterOrder: 10,
        previousChapterId: 'rel2hop-nontrigger-noise-chapter-008',
        previousChapterTitle: '第8章：楼前耳报',
        entitiesAppeared: ['裴照夜', '散客乙'],
        locations: ['街角'],
      },
      {
        chapterId: 'rel2hop-nontrigger-noise-chapter-011',
        chapterTitle: '第11章：铺前闲谈',
        chapterOrder: 11,
        previousChapterId: 'rel2hop-nontrigger-noise-chapter-010',
        previousChapterTitle: '第10章：街角流言',
        entitiesAppeared: ['裴照夜', '散客丙'],
        locations: ['旧铺前'],
      },
      {
        chapterId: 'rel2hop-nontrigger-noise-chapter-012',
        chapterTitle: '第12章：灯下碎语',
        chapterOrder: 12,
        previousChapterId: 'rel2hop-nontrigger-noise-chapter-011',
        previousChapterTitle: '第11章：铺前闲谈',
        entitiesAppeared: ['裴照夜', '散客丁'],
        locations: ['灯下'],
      },
      {
        chapterId: 'rel2hop-nontrigger-noise-chapter-013',
        chapterTitle: '第13章：借印复盘',
        chapterOrder: 13,
        previousChapterId: 'rel2hop-nontrigger-noise-chapter-012',
        previousChapterTitle: '第12章：灯下碎语',
        entitiesAppeared: ['裴照夜', '散客戊'],
        locations: ['旧印房'],
      },
      {
        chapterId: 'rel2hop-nontrigger-noise-chapter-020',
        chapterTitle: '第20章：楼下停步',
        chapterOrder: 20,
        previousChapterId: 'rel2hop-nontrigger-noise-chapter-013',
        previousChapterTitle: '第13章：借印复盘',
        entitiesAppeared: ['裴照夜'],
        locations: ['酒楼下'],
      },
    ],
    entities: [
      { name: '裴照夜', type: 'character', description: '当前焦点人物。', pinned: 1 },
      { name: '掌柜甲', type: 'character', description: '有限度可信的线人之一。', pinned: 0 },
      { name: '掌柜乙', type: 'character', description: '有限度可信的线人之一。', pinned: 0 },
      { name: '散客甲', type: 'character', description: '噪音人物之一。', pinned: 0 },
      { name: '散客乙', type: 'character', description: '噪音人物之一。', pinned: 0 },
      { name: '散客丙', type: 'character', description: '噪音人物之一。', pinned: 0 },
      { name: '散客丁', type: 'character', description: '噪音人物之一。', pinned: 0 },
      { name: '散客戊', type: 'character', description: '噪音人物之一。', pinned: 0 },
    ],
    relationships: [
      {
        id: 'rel2hop-nontrigger-noise-strong-1',
        sourceEntityName: '裴照夜',
        targetEntityName: '掌柜甲',
        relationshipType: '问过旧印来历',
        sourceKind: 'state_change',
        description: '裴照夜曾正式问过掌柜甲关于旧印来历的事情。',
        evidence: '可信线人口供被确认',
        chapterId: 'rel2hop-nontrigger-noise-chapter-008',
        chapterTitle: '第8章：楼前耳报',
      },
      {
        id: 'rel2hop-nontrigger-noise-strong-2',
        sourceEntityName: '裴照夜',
        targetEntityName: '掌柜乙',
        relationshipType: '核过旧印账册',
        sourceKind: 'state_change',
        description: '裴照夜已经核对过掌柜乙手里的旧印账册。',
        evidence: '账册线索被确认',
        chapterId: 'rel2hop-nontrigger-noise-chapter-010',
        chapterTitle: '第10章：街角流言',
      },
      {
        id: 'rel2hop-nontrigger-noise-edge-1',
        sourceEntityName: '裴照夜',
        targetEntityName: '散客甲',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '裴照夜与散客甲有些模糊牵扯。',
        evidence: '传闻',
        chapterId: 'rel2hop-nontrigger-noise-chapter-008',
        chapterTitle: '第8章：楼前耳报',
      },
      {
        id: 'rel2hop-nontrigger-noise-edge-2',
        sourceEntityName: '裴照夜',
        targetEntityName: '散客乙',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '裴照夜与散客乙有些模糊牵扯。',
        evidence: '传闻',
        chapterId: 'rel2hop-nontrigger-noise-chapter-010',
        chapterTitle: '第10章：街角流言',
      },
      {
        id: 'rel2hop-nontrigger-noise-edge-3',
        sourceEntityName: '裴照夜',
        targetEntityName: '散客丙',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '裴照夜与散客丙有些模糊牵扯。',
        evidence: '传闻',
        chapterId: 'rel2hop-nontrigger-noise-chapter-011',
        chapterTitle: '第11章：铺前闲谈',
      },
      {
        id: 'rel2hop-nontrigger-noise-edge-4',
        sourceEntityName: '裴照夜',
        targetEntityName: '散客丁',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '裴照夜与散客丁有些模糊牵扯。',
        evidence: '传闻',
        chapterId: 'rel2hop-nontrigger-noise-chapter-012',
        chapterTitle: '第12章：灯下碎语',
      },
      {
        id: 'rel2hop-nontrigger-noise-edge-5',
        sourceEntityName: '裴照夜',
        targetEntityName: '散客戊',
        relationshipType: '关系',
        sourceKind: 'sentence_pattern',
        description: '裴照夜与散客戊有些模糊牵扯。',
        evidence: '传闻',
        chapterId: 'rel2hop-nontrigger-noise-chapter-013',
        chapterTitle: '第13章：借印复盘',
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

function seedScenario(db: ReturnType<typeof getGenerationDatabase>, scenario: NonTriggerScenario) {
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
      `${scenario.label} / 4.3b 未命中归因样本`,
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
      scenario.currentChapterId,
      scenario.currentChapterTitle,
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

function classifyNonTrigger(context: GenerationDebugContext): NonTriggerCategory | 'unknown' {
  const debug = context.structuredRelationshipDebug;

  if (debug.mode === 'graph_1hop' && !debug.evaluatedTwoHop) {
    return 'onehop_sufficient';
  }

  if (
    debug.mode === 'graph_1hop'
    && debug.evaluatedTwoHop
    && !debug.hasTwoHopPathBlock
    && debug.secondaryEvaluation?.reason === 'ok'
    && debug.secondaryEvaluation.raw.includes('未形成新增实体链')
  ) {
    return 'twohop_redundant';
  }

  if (
    debug.mode === 'degraded'
    && debug.reason === 'no_historical_relationship'
    && debug.secondaryEvaluation?.reason === 'no_two_hop_relationship'
  ) {
    return 'sparse_history';
  }

  if (
    debug.mode === 'degraded'
    && debug.reason === 'high_noise'
    && debug.secondaryEvaluation?.reason === 'no_two_hop_relationship'
  ) {
    return 'onehop_noise_without_twohop';
  }

  return 'unknown';
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

  const categoryCount = new Map<NonTriggerCategory | 'unknown', number>();
  let passCount = 0;

  console.log('# 4.3b Nontrigger Analysis');

  for (const scenario of SCENARIOS) {
    const context = await getGenerationDebugContext(env, scenario.projectId, scenario.currentChapterId);

    if (!context) {
      console.log(`## ${scenario.label}`);
      console.log('context=null');
      console.log('');
      continue;
    }

    const category = classifyNonTrigger(context);
    categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);
    const passed = category === scenario.expectedCategory;

    if (passed) {
      passCount += 1;
    }

    console.log(`## ${scenario.label}`);
    console.log(`expectedCategory: ${scenario.expectedCategory}`);
    console.log(`actualCategory: ${category}`);
    console.log(`mode: ${context.structuredRelationshipDebug.mode}`);
    console.log(`reason: ${context.structuredRelationshipDebug.reason}`);
    console.log(`evaluatedTwoHop: ${context.structuredRelationshipDebug.evaluatedTwoHop ? 'yes' : 'no'}`);
    console.log(`hasTwoHopPathBlock: ${context.structuredRelationshipDebug.hasTwoHopPathBlock ? 'yes' : 'no'}`);
    console.log(`policy: ${context.structuredRelationshipDebug.policy || '暂无'}`);
    console.log(
      `secondaryEvaluation: ${
        context.structuredRelationshipDebug.secondaryEvaluation
          ? `${context.structuredRelationshipDebug.secondaryEvaluation.label}:${context.structuredRelationshipDebug.secondaryEvaluation.raw}`
          : 'null'
      }`,
    );
    console.log(`decision: ${passed ? 'pass' : 'hold'}`);
    console.log('');
  }

  console.log('## Category Summary');

  for (const [category, count] of categoryCount.entries()) {
    console.log(`- ${category}: ${count}`);
  }

  console.log(`pass=${passCount}/${SCENARIOS.length}`);
  console.log(`decision=${passCount === SCENARIOS.length ? 'pass' : 'hold'}`);

  if (passCount !== SCENARIOS.length) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`4.3b 未命中归因分析失败：${message}`);
  process.exitCode = 1;
});
