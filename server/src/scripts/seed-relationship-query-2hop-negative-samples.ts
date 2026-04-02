import { loadServerEnv } from '../config/env.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';

const PROJECT_NO_TWO_HOP = 'calibration-project-relationship-2hop-negative-empty';
const PROJECT_HIGH_NOISE = 'calibration-project-relationship-2hop-negative-noise';

function nowIsoString() {
  return new Date().toISOString();
}

function clearProject(db: ReturnType<typeof getGenerationDatabase>, projectId: string) {
  db.prepare('DELETE FROM generation_relationships WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM generation_entities WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM generation_chapter_index WHERE project_id = ?').run(projectId);
}

function seedNoTwoHopProject(db: ReturnType<typeof getGenerationDatabase>) {
  const currentTime = nowIsoString();
  const chapters = [
    {
      chapterId: 'rel2hop-empty-chapter-012',
      chapterTitle: '第12章：旧塔残影',
      chapterOrder: 12,
      previousChapterId: '',
      previousChapterTitle: '',
      entitiesAppeared: ['顾沉舟', '旧钥塔'],
    },
    {
      chapterId: 'rel2hop-empty-chapter-018',
      chapterTitle: '第18章：灰灯停步',
      chapterOrder: 18,
      previousChapterId: 'rel2hop-empty-chapter-012',
      previousChapterTitle: '第12章：旧塔残影',
      entitiesAppeared: ['顾沉舟'],
    },
  ] as const;

  const entities = [
    { name: '顾沉舟', type: 'character', description: '当前焦点人物。', lastSeenChapterId: 'rel2hop-empty-chapter-012', lastSeenChapterTitle: '第12章：旧塔残影' },
    { name: '旧钥塔', type: 'location', description: '一跳终点，但没有后续关系。', lastSeenChapterId: 'rel2hop-empty-chapter-012', lastSeenChapterTitle: '第12章：旧塔残影' },
    { name: '韩山舟', type: 'character', description: '无关噪音人物。', lastSeenChapterId: 'rel2hop-empty-chapter-012', lastSeenChapterTitle: '第12章：旧塔残影' },
    { name: '雾盐帮', type: 'faction', description: '无关噪音势力。', lastSeenChapterId: 'rel2hop-empty-chapter-012', lastSeenChapterTitle: '第12章：旧塔残影' },
  ] as const;

  const relationships = [
    {
      id: 'rel2hop-empty-edge-1',
      sourceEntityName: '顾沉舟',
      targetEntityName: '旧钥塔',
      relationshipType: '曾进入旧塔',
      sourceKind: 'state_change',
      description: '顾沉舟曾进入旧钥塔调查残印。',
      evidence: '进入旧塔调查',
      chapterId: 'rel2hop-empty-chapter-012',
      chapterTitle: '第12章：旧塔残影',
    },
    {
      id: 'rel2hop-empty-noise-1',
      sourceEntityName: '韩山舟',
      targetEntityName: '雾盐帮',
      relationshipType: '旧账对峙',
      sourceKind: 'sentence_pattern',
      description: '韩山舟与雾盐帮围绕旧账对峙。',
      evidence: '旧账争执',
      chapterId: 'rel2hop-empty-chapter-012',
      chapterTitle: '第12章：旧塔残影',
    },
  ] as const;

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

  for (const chapter of chapters) {
    insertChapter.run(
      PROJECT_NO_TWO_HOP,
      chapter.chapterId,
      chapter.chapterTitle,
      chapter.chapterOrder,
      '第三卷',
      chapter.previousChapterId,
      chapter.previousChapterTitle,
      '深夜',
      'quest',
      JSON.stringify(chapter.entitiesAppeared),
      JSON.stringify(['旧钥塔']),
      '4.3b no_two_hop_relationship 校准样本',
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

  for (const entity of entities) {
    insertEntity.run(
      PROJECT_NO_TWO_HOP,
      entity.name,
      entity.type,
      entity.description,
      JSON.stringify({ 状态: '校准样本' }),
      JSON.stringify([]),
      entity.name === '顾沉舟' ? 1 : 0,
      entity.lastSeenChapterId,
      entity.lastSeenChapterTitle,
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

  for (const relationship of relationships) {
    insertRelationship.run(
      relationship.id,
      PROJECT_NO_TWO_HOP,
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

function seedHighNoiseProject(db: ReturnType<typeof getGenerationDatabase>) {
  const currentTime = nowIsoString();
  const chapters = [
    {
      chapterId: 'rel2hop-noise-chapter-008',
      chapterTitle: '第8章：旧印转手',
      chapterOrder: 8,
      previousChapterId: '',
      previousChapterTitle: '',
      entitiesAppeared: ['顾沉舟', '灰手甲', '锈门令'],
    },
    {
      chapterId: 'rel2hop-noise-chapter-011',
      chapterTitle: '第11章：灰市借印',
      chapterOrder: 11,
      previousChapterId: 'rel2hop-noise-chapter-008',
      previousChapterTitle: '第8章：旧印转手',
      entitiesAppeared: ['顾沉舟', '灰手甲', '锈门令'],
    },
    {
      chapterId: 'rel2hop-noise-chapter-013',
      chapterTitle: '第13章：旧门封签',
      chapterOrder: 13,
      previousChapterId: 'rel2hop-noise-chapter-011',
      previousChapterTitle: '第11章：灰市借印',
      entitiesAppeared: ['顾沉舟', '灰手甲', '锈门令'],
    },
    {
      chapterId: 'rel2hop-noise-chapter-020',
      chapterTitle: '第20章：灯下止步',
      chapterOrder: 20,
      previousChapterId: 'rel2hop-noise-chapter-013',
      previousChapterTitle: '第13章：旧门封签',
      entitiesAppeared: ['顾沉舟'],
    },
  ] as const;

  const entities = [
    { name: '顾沉舟', type: 'character', description: '当前焦点人物。', lastSeenChapterId: 'rel2hop-noise-chapter-013', lastSeenChapterTitle: '第13章：旧门封签' },
    { name: '灰手甲', type: 'character', description: '中继人物。', lastSeenChapterId: 'rel2hop-noise-chapter-013', lastSeenChapterTitle: '第13章：旧门封签' },
    { name: '锈门令', type: 'item', description: '二跳目标。', lastSeenChapterId: 'rel2hop-noise-chapter-013', lastSeenChapterTitle: '第13章：旧门封签' },
  ] as const;

  const relationships = [
    {
      id: 'rel2hop-noise-edge-a1',
      sourceEntityName: '顾沉舟',
      targetEntityName: '灰手甲',
      relationshipType: '通过借印接触',
      sourceKind: 'state_change',
      description: '顾沉舟通过借印线接触到灰手甲。',
      evidence: '第一次接触',
      chapterId: 'rel2hop-noise-chapter-008',
      chapterTitle: '第8章：旧印转手',
    },
    {
      id: 'rel2hop-noise-edge-a2',
      sourceEntityName: '顾沉舟',
      targetEntityName: '灰手甲',
      relationshipType: '再次通过借印联系',
      sourceKind: 'state_change',
      description: '顾沉舟再次通过借印线联系灰手甲。',
      evidence: '第二次接触',
      chapterId: 'rel2hop-noise-chapter-011',
      chapterTitle: '第11章：灰市借印',
    },
    {
      id: 'rel2hop-noise-edge-a3',
      sourceEntityName: '顾沉舟',
      targetEntityName: '灰手甲',
      relationshipType: '继续追查借印人',
      sourceKind: 'state_change',
      description: '顾沉舟继续通过旧线索追查灰手甲。',
      evidence: '第三次接触',
      chapterId: 'rel2hop-noise-chapter-013',
      chapterTitle: '第13章：旧门封签',
    },
    {
      id: 'rel2hop-noise-edge-b1',
      sourceEntityName: '灰手甲',
      targetEntityName: '锈门令',
      relationshipType: '掌握旧令牌去向',
      sourceKind: 'state_change',
      description: '灰手甲掌握锈门令的去向。',
      evidence: '第一次口供',
      chapterId: 'rel2hop-noise-chapter-008',
      chapterTitle: '第8章：旧印转手',
    },
    {
      id: 'rel2hop-noise-edge-b2',
      sourceEntityName: '灰手甲',
      targetEntityName: '锈门令',
      relationshipType: '重复提及旧令牌',
      sourceKind: 'state_change',
      description: '灰手甲再次提及锈门令。',
      evidence: '第二次口供',
      chapterId: 'rel2hop-noise-chapter-011',
      chapterTitle: '第11章：灰市借印',
    },
    {
      id: 'rel2hop-noise-edge-b3',
      sourceEntityName: '灰手甲',
      targetEntityName: '锈门令',
      relationshipType: '仍掌握旧令牌消息',
      sourceKind: 'state_change',
      description: '灰手甲仍掌握锈门令消息。',
      evidence: '第三次口供',
      chapterId: 'rel2hop-noise-chapter-013',
      chapterTitle: '第13章：旧门封签',
    },
  ] as const;

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

  for (const chapter of chapters) {
    insertChapter.run(
      PROJECT_HIGH_NOISE,
      chapter.chapterId,
      chapter.chapterTitle,
      chapter.chapterOrder,
      '第三卷',
      chapter.previousChapterId,
      chapter.previousChapterTitle,
      '深夜',
      'quest',
      JSON.stringify(chapter.entitiesAppeared),
      JSON.stringify(['灰市']),
      '4.3b high_noise 校准样本',
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

  for (const entity of entities) {
    insertEntity.run(
      PROJECT_HIGH_NOISE,
      entity.name,
      entity.type,
      entity.description,
      JSON.stringify({ 状态: '校准样本' }),
      JSON.stringify([]),
      entity.name === '顾沉舟' ? 1 : 0,
      entity.lastSeenChapterId,
      entity.lastSeenChapterTitle,
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

  for (const relationship of relationships) {
    insertRelationship.run(
      relationship.id,
      PROJECT_HIGH_NOISE,
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

async function main() {
  const env = loadServerEnv();
  const db = getGenerationDatabase(env);

  db.exec('BEGIN');

  try {
    clearProject(db, PROJECT_NO_TWO_HOP);
    clearProject(db, PROJECT_HIGH_NOISE);
    seedNoTwoHopProject(db);
    seedHighNoiseProject(db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  console.log('# 4.3b negative samples seeded');
  console.log(`noTwoHop.projectId: ${PROJECT_NO_TWO_HOP}`);
  console.log('noTwoHop.chapterId: rel2hop-empty-chapter-018');
  console.log(`highNoise.projectId: ${PROJECT_HIGH_NOISE}`);
  console.log('highNoise.chapterId: rel2hop-noise-chapter-020');
  console.log('suggestedFocusEntity: 顾沉舟');
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`seed 4.3b negative samples 失败：${message}`);
  process.exitCode = 1;
});
