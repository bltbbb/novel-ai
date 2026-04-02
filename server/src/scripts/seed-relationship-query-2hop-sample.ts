import { loadServerEnv } from '../config/env.js';
import { getGenerationDatabase } from '../services/generation-sqlite.js';

const PROJECT_ID = 'calibration-project-relationship-2hop';
const CHAPTERS = [
  {
    chapterId: 'rel2hop-chapter-011',
    chapterTitle: '第11章：外门旧档',
    chapterOrder: 11,
    entitiesAppeared: ['林冲', '谢无咎', '炼器宗'],
  },
  {
    chapterId: 'rel2hop-chapter-019',
    chapterTitle: '第19章：灰市借印',
    chapterOrder: 19,
    entitiesAppeared: ['谢无咎', '沈藏锋', '沉井遗迹'],
  },
  {
    chapterId: 'rel2hop-chapter-027',
    chapterTitle: '第27章：井口回声',
    chapterOrder: 27,
    entitiesAppeared: ['林冲', '沉井遗迹', '沈藏锋'],
  },
] as const;

const ENTITIES = [
  { name: '林冲', type: 'character', description: '主角，正在追查旧宗门遗产。', pinned: 1 },
  { name: '谢无咎', type: 'character', description: '旧宗门线人，掌握中间线索。', pinned: 0 },
  { name: '沈藏锋', type: 'character', description: '沉井遗迹的前守印人。', pinned: 0 },
  { name: '炼器宗', type: 'faction', description: '失落宗门。', pinned: 0 },
  { name: '沉井遗迹', type: 'location', description: '旧宗门遗留入口。', pinned: 0 },
  { name: '韩山舟', type: 'character', description: '噪音侧线人物。', pinned: 0 },
  { name: '雾盐帮', type: 'faction', description: '噪音侧线势力。', pinned: 0 },
  { name: '铜鸦账册', type: 'item', description: '噪音侧线账簿。', pinned: 0 },
] as const;

const RELATIONSHIPS = [
  {
    id: 'rel2hop-edge-1',
    sourceEntityName: '林冲',
    targetEntityName: '谢无咎',
    relationshipType: '通过线报合作',
    sourceKind: 'state_change',
    description: '林冲通过谢无咎掌握旧宗门入口情报。',
    evidence: '合作关系已建立',
    chapterId: 'rel2hop-chapter-011',
    chapterTitle: '第11章：外门旧档',
  },
  {
    id: 'rel2hop-edge-2',
    sourceEntityName: '谢无咎',
    targetEntityName: '沈藏锋',
    relationshipType: '知晓藏印人身份',
    sourceKind: 'state_change',
    description: '谢无咎知道沈藏锋曾负责沉井遗迹的守印。',
    evidence: '掌握守印人情报',
    chapterId: 'rel2hop-chapter-019',
    chapterTitle: '第19章：灰市借印',
  },
  {
    id: 'rel2hop-edge-3',
    sourceEntityName: '沈藏锋',
    targetEntityName: '沉井遗迹',
    relationshipType: '曾守护入口',
    sourceKind: 'sentence_pattern',
    description: '沈藏锋曾长期守护沉井遗迹入口。',
    evidence: '守护井口多年',
    chapterId: 'rel2hop-chapter-019',
    chapterTitle: '第19章：灰市借印',
  },
  {
    id: 'rel2hop-noise-1',
    sourceEntityName: '韩山舟',
    targetEntityName: '雾盐帮',
    relationshipType: '账目对峙',
    sourceKind: 'sentence_pattern',
    description: '韩山舟与雾盐帮围绕税印旧账对峙。',
    evidence: '税印旧账冲突',
    chapterId: 'rel2hop-chapter-019',
    chapterTitle: '第19章：灰市借印',
  },
  {
    id: 'rel2hop-noise-2',
    sourceEntityName: '雾盐帮',
    targetEntityName: '铜鸦账册',
    relationshipType: '争夺账册',
    sourceKind: 'sentence_pattern',
    description: '雾盐帮试图夺回铜鸦账册。',
    evidence: '争抢账簿',
    chapterId: 'rel2hop-chapter-027',
    chapterTitle: '第27章：井口回声',
  },
  {
    id: 'rel2hop-noise-3',
    sourceEntityName: '林冲',
    targetEntityName: '炼器宗',
    relationshipType: '接触旧遗产',
    sourceKind: 'sentence_pattern',
    description: '林冲确认自己已接触炼器宗遗产。',
    evidence: '旧宗门线索被确认',
    chapterId: 'rel2hop-chapter-027',
    chapterTitle: '第27章：井口回声',
  },
] as const;

function nowIsoString() {
  return new Date().toISOString();
}

async function main() {
  const env = loadServerEnv();
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();

  db.exec('BEGIN');

  try {
    db.prepare('DELETE FROM generation_relationships WHERE project_id = ?').run(PROJECT_ID);
    db.prepare('DELETE FROM generation_entities WHERE project_id = ?').run(PROJECT_ID);
    db.prepare('DELETE FROM generation_chapter_index WHERE project_id = ?').run(PROJECT_ID);

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

    for (const [index, chapter] of CHAPTERS.entries()) {
      const previousChapter = index > 0 ? CHAPTERS[index - 1] : null;

      insertChapter.run(
        PROJECT_ID,
        chapter.chapterId,
        chapter.chapterTitle,
        chapter.chapterOrder,
        '第二卷',
        previousChapter?.chapterId ?? '',
        previousChapter?.chapterTitle ?? '',
        '深夜',
        'quest',
        JSON.stringify(chapter.entitiesAppeared),
        JSON.stringify(['沉井遗迹']),
        '关系查询 2hop 校准样本',
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

    for (const entity of ENTITIES) {
      insertEntity.run(
        PROJECT_ID,
        entity.name,
        entity.type,
        entity.description,
        JSON.stringify({ 状态: '已收录' }),
        JSON.stringify([]),
        entity.pinned,
        'rel2hop-chapter-027',
        '第27章：井口回声',
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

    for (const relationship of RELATIONSHIPS) {
      insertRelationship.run(
        relationship.id,
        PROJECT_ID,
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

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  console.log('# 4.3b relationship sample seeded');
  console.log(`projectId: ${PROJECT_ID}`);
  console.log('chapterIds:');
  for (const chapter of CHAPTERS) {
    console.log(`- ${chapter.chapterId} (${chapter.chapterTitle})`);
  }
  console.log('focusPath: 林冲 -> 谢无咎 -> 沈藏锋');
  console.log('targetPathExtension: 谢无咎 -> 沈藏锋 -> 沉井遗迹');
  console.log('noiseEdges: 韩山舟 -> 雾盐帮, 雾盐帮 -> 铜鸦账册, 林冲 -> 炼器宗');
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`seed 4.3b relationship sample 失败：${message}`);
  process.exitCode = 1;
});
