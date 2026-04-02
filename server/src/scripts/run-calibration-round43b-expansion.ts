import { loadServerEnv } from '../config/env.js';
import { getGenerationDebugStructuredRelationshipQueryTwoHop } from '../services/generation-debug-store.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';

interface ChapterSeed {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  entitiesAppeared: string[];
  locations: string[];
}

interface EntitySeed {
  name: string;
  type: string;
  description: string;
  pinned?: boolean;
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

interface PositiveScenario {
  key: string;
  label: string;
  projectId: string;
  chapterId: string;
  focusEntityName: string;
  expectedPath: [string, string, string];
  chapters: ChapterSeed[];
  entities: EntitySeed[];
  relationships: RelationshipSeed[];
}

const SCENARIOS: PositiveScenario[] = [
  {
    key: 'master-enemy',
    label: '师承敌对链',
    projectId: 'calibration-project-relationship-2hop-master-enemy',
    chapterId: 'rel2hop-master-enemy-chapter-031',
    focusEntityName: '林冲',
    expectedPath: ['林冲', '药老残魂', '韩枫'],
    chapters: [
      {
        chapterId: 'rel2hop-master-enemy-chapter-011',
        chapterTitle: '第11章：残魂借火',
        chapterOrder: 11,
        entitiesAppeared: ['林冲', '药老残魂', '黑铁片'],
        locations: ['废炉台'],
      },
      {
        chapterId: 'rel2hop-master-enemy-chapter-020',
        chapterTitle: '第20章：旧仇暗录',
        chapterOrder: 20,
        entitiesAppeared: ['药老残魂', '韩枫', '焚骨阁'],
        locations: ['焚骨阁'],
      },
      {
        chapterId: 'rel2hop-master-enemy-chapter-031',
        chapterTitle: '第31章：灰火试锋',
        chapterOrder: 31,
        entitiesAppeared: ['林冲', '韩枫'],
        locations: ['灰火台'],
      },
    ],
    entities: [
      { name: '林冲', type: 'character', description: '主角，正在追查旧时代火脉遗产。', pinned: true },
      { name: '药老残魂', type: 'character', description: '林冲暂时借力的残魂导师。', pinned: false },
      { name: '韩枫', type: 'character', description: '药老旧敌，图谋火脉传承。', pinned: false },
      { name: '焚骨阁', type: 'faction', description: '韩枫所在势力。', pinned: false },
    ],
    relationships: [
      {
        id: 'master-enemy-edge-1',
        sourceEntityName: '林冲',
        targetEntityName: '药老残魂',
        relationshipType: '暂时拜师',
        sourceKind: 'state_change',
        description: '林冲在废炉台向药老残魂求教火脉旧术。',
        evidence: '师承关系暂时建立',
        chapterId: 'rel2hop-master-enemy-chapter-011',
        chapterTitle: '第11章：残魂借火',
      },
      {
        id: 'master-enemy-edge-2',
        sourceEntityName: '药老残魂',
        targetEntityName: '韩枫',
        relationshipType: '旧日死敌',
        sourceKind: 'state_change',
        description: '药老残魂在旧仇暗录中提到韩枫是自己当年的死敌。',
        evidence: '旧敌关系被明确揭示',
        chapterId: 'rel2hop-master-enemy-chapter-020',
        chapterTitle: '第20章：旧仇暗录',
      },
      {
        id: 'master-enemy-noise-1',
        sourceEntityName: '韩枫',
        targetEntityName: '焚骨阁',
        relationshipType: '统领势力',
        sourceKind: 'sentence_pattern',
        description: '韩枫长期掌控焚骨阁。',
        evidence: '势力背景补充',
        chapterId: 'rel2hop-master-enemy-chapter-020',
        chapterTitle: '第20章：旧仇暗录',
      },
    ],
  },
  {
    key: 'lineage-gate',
    label: '血脉守门链',
    projectId: 'calibration-project-relationship-2hop-lineage-gate',
    chapterId: 'rel2hop-lineage-gate-chapter-029',
    focusEntityName: '苏照夜',
    expectedPath: ['苏照夜', '谢无咎', '沉井遗迹'],
    chapters: [
      {
        chapterId: 'rel2hop-lineage-gate-chapter-009',
        chapterTitle: '第9章：旧契留名',
        chapterOrder: 9,
        entitiesAppeared: ['苏照夜', '谢无咎'],
        locations: ['旧坊市'],
      },
      {
        chapterId: 'rel2hop-lineage-gate-chapter-017',
        chapterTitle: '第17章：井门留印',
        chapterOrder: 17,
        entitiesAppeared: ['谢无咎', '沉井遗迹'],
        locations: ['沉井遗迹'],
      },
      {
        chapterId: 'rel2hop-lineage-gate-chapter-029',
        chapterTitle: '第29章：照夜试印',
        chapterOrder: 29,
        entitiesAppeared: ['苏照夜', '沉井遗迹'],
        locations: ['井门前廊'],
      },
    ],
    entities: [
      { name: '苏照夜', type: 'character', description: '携带旧契血印的旁系后人。', pinned: true },
      { name: '谢无咎', type: 'character', description: '掌握井门旧契线索。', pinned: false },
      { name: '沉井遗迹', type: 'location', description: '旧门封闭入口。', pinned: false },
      { name: '井门前廊', type: 'location', description: '沉井遗迹外廊。', pinned: false },
    ],
    relationships: [
      {
        id: 'lineage-gate-edge-1',
        sourceEntityName: '苏照夜',
        targetEntityName: '谢无咎',
        relationshipType: '持契求证',
        sourceKind: 'state_change',
        description: '苏照夜拿旧契残印向谢无咎求证血脉来源。',
        evidence: '血印与线人建立联系',
        chapterId: 'rel2hop-lineage-gate-chapter-009',
        chapterTitle: '第9章：旧契留名',
      },
      {
        id: 'lineage-gate-edge-2',
        sourceEntityName: '谢无咎',
        targetEntityName: '沉井遗迹',
        relationshipType: '知晓入口封印',
        sourceKind: 'state_change',
        description: '谢无咎确认沉井遗迹的入口封印与旧契相关。',
        evidence: '入口封印关系被说明',
        chapterId: 'rel2hop-lineage-gate-chapter-017',
        chapterTitle: '第17章：井门留印',
      },
      {
        id: 'lineage-gate-noise-1',
        sourceEntityName: '苏照夜',
        targetEntityName: '井门前廊',
        relationshipType: '暂时停留',
        sourceKind: 'sentence_pattern',
        description: '苏照夜曾在井门前廊停留整夜。',
        evidence: '位置补充',
        chapterId: 'rel2hop-lineage-gate-chapter-029',
        chapterTitle: '第29章：照夜试印',
      },
    ],
  },
  {
    key: 'map-trail',
    label: '地图追索链',
    projectId: 'calibration-project-relationship-2hop-map-trail',
    chapterId: 'rel2hop-map-trail-chapter-033',
    focusEntityName: '顾沉舟',
    expectedPath: ['顾沉舟', '灰手甲', '锈门令'],
    chapters: [
      {
        chapterId: 'rel2hop-map-trail-chapter-006',
        chapterTitle: '第6章：借印灰手',
        chapterOrder: 6,
        entitiesAppeared: ['顾沉舟', '灰手甲'],
        locations: ['灰市'],
      },
      {
        chapterId: 'rel2hop-map-trail-chapter-014',
        chapterTitle: '第14章：锈令旧闻',
        chapterOrder: 14,
        entitiesAppeared: ['灰手甲', '锈门令', '旧门地图'],
        locations: ['旧典铺'],
      },
      {
        chapterId: 'rel2hop-map-trail-chapter-033',
        chapterTitle: '第33章：回灯追索',
        chapterOrder: 33,
        entitiesAppeared: ['顾沉舟', '锈门令'],
        locations: ['回灯廊'],
      },
    ],
    entities: [
      { name: '顾沉舟', type: 'character', description: '追查旧令牌下落的调查者。', pinned: true },
      { name: '灰手甲', type: 'character', description: '掌握旧令牌流转线索。', pinned: false },
      { name: '锈门令', type: 'item', description: '旧门令牌。', pinned: false },
      { name: '旧门地图', type: 'item', description: '记录旧门路线的残图。', pinned: false },
    ],
    relationships: [
      {
        id: 'map-trail-edge-1',
        sourceEntityName: '顾沉舟',
        targetEntityName: '灰手甲',
        relationshipType: '通过借印接触',
        sourceKind: 'state_change',
        description: '顾沉舟通过借印线索接触灰手甲。',
        evidence: '第一手接触线索',
        chapterId: 'rel2hop-map-trail-chapter-006',
        chapterTitle: '第6章：借印灰手',
      },
      {
        id: 'map-trail-edge-2',
        sourceEntityName: '灰手甲',
        targetEntityName: '锈门令',
        relationshipType: '掌握旧令去向',
        sourceKind: 'state_change',
        description: '灰手甲知道锈门令真正去向。',
        evidence: '令牌去向被披露',
        chapterId: 'rel2hop-map-trail-chapter-014',
        chapterTitle: '第14章：锈令旧闻',
      },
      {
        id: 'map-trail-noise-1',
        sourceEntityName: '灰手甲',
        targetEntityName: '旧门地图',
        relationshipType: '曾持有残图',
        sourceKind: 'sentence_pattern',
        description: '灰手甲曾短暂持有旧门地图。',
        evidence: '背景信息',
        chapterId: 'rel2hop-map-trail-chapter-014',
        chapterTitle: '第14章：锈令旧闻',
      },
    ],
  },
] as const;

function nowIsoString() {
  return new Date().toISOString();
}

function clearProject(db: ReturnType<typeof getGenerationDatabase>, projectId: string) {
  db.prepare('DELETE FROM generation_relationships WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM generation_entities WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM generation_chapter_index WHERE project_id = ?').run(projectId);
}

function seedScenario(db: ReturnType<typeof getGenerationDatabase>, scenario: PositiveScenario) {
  const currentTime = nowIsoString();
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

  for (const [index, chapter] of scenario.chapters.entries()) {
    const previousChapter = index > 0 ? scenario.chapters[index - 1] : null;

    insertChapter.run(
      scenario.projectId,
      chapter.chapterId,
      chapter.chapterTitle,
      chapter.chapterOrder,
      '第四卷',
      previousChapter?.chapterId ?? '',
      previousChapter?.chapterTitle ?? '',
      '深夜',
      'quest',
      JSON.stringify(chapter.entitiesAppeared),
      JSON.stringify(chapter.locations),
      '4.3b 正样本扩样校准',
      currentTime,
      currentTime,
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
      JSON.stringify({ 状态: '扩样校准' }),
      JSON.stringify([]),
      entity.pinned ? 1 : 0,
      scenario.chapterId,
      scenario.chapters[scenario.chapters.length - 1].chapterTitle,
      currentTime,
      currentTime,
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
      currentTime,
      currentTime,
    );
  }
}

function printScenarioResult(scenario: PositiveScenario, result: NonNullable<ReturnType<typeof getGenerationDebugStructuredRelationshipQueryTwoHop>>) {
  console.log(`## ${scenario.label}`);
  console.log(`projectId: ${scenario.projectId}`);
  console.log(`chapterId: ${scenario.chapterId}`);
  console.log(`focusEntity: ${scenario.focusEntityName}`);
  console.log(`mode: ${result.mode}`);
  console.log(`reason: ${result.reason}`);
  console.log(`pathCount: ${result.paths.length}`);
  console.log(`edgeCount: ${result.edges.length}`);
  console.log(`candidatePaths=${result.stats.candidatePaths} acceptedPaths=${result.stats.acceptedPaths} droppedNoisyPaths=${result.stats.droppedNoisyPaths}`);

  for (const path of result.paths) {
    console.log(
      `- path: ${path.focusEntityName} -> ${path.viaEntityName} -> ${path.targetEntityName} | confidence=${path.confidence.toFixed(3)} | sourceKinds=${path.sourceKinds.join('、')}`,
    );
  }

  console.log('');
}

async function main() {
  const env = loadServerEnv();
  const db = getGenerationDatabase(env);

  db.exec('BEGIN');

  try {
    for (const scenario of SCENARIOS) {
      clearProject(db, scenario.projectId);
      seedScenario(db, scenario);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  console.log('# 4.3b positive expansion seeded');

  for (const scenario of SCENARIOS) {
    const result = getGenerationDebugStructuredRelationshipQueryTwoHop(env, scenario.projectId, {
      chapterId: scenario.chapterId,
      entityName: scenario.focusEntityName,
    });

    if (!result) {
      console.log(`## ${scenario.label}`);
      console.log(`projectId: ${scenario.projectId}`);
      console.log('result: null');
      console.log('');
      continue;
    }

    printScenarioResult(scenario, result);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`4.3b 正样本扩样失败：${message}`);
  process.exitCode = 1;
});
