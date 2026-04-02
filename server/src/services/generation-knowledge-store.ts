import type { ServerEnv } from '../config/env.js';
import type {
  ChapterOutlineDraft,
  ChapterSummaryDraft,
  GenerationEntitySnapshot,
  StateChangeDraft,
  StrandType,
} from '../types/ai.js';
import { getGenerationDatabase } from './generation-sqlite.js';

function nowIsoString() {
  return new Date().toISOString();
}

function parseFieldsJson(rawText: string | null | undefined) {
  if (!rawText) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

function parseStringArrayJson(rawText: string | null | undefined) {
  if (!rawText) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [];
  } catch {
    return [] as string[];
  }
}

function extractLocations(stateChanges: StateChangeDraft[]) {
  return Array.from(
    new Set(
      stateChanges
        .filter((change) => /位置|地点|location|所在地/i.test(change.field))
        .map((change) => change.newValue.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function looksLikeRelationshipField(field: string) {
  return /关系|盟友|敌人|仇人|师徒|师父|徒弟|父子|母子|兄弟|姐妹|情侣|婚约|同伴|上下级|从属|主仆|队友|合作/i.test(field);
}

function looksLikeRelationshipText(value: string) {
  return /关系|盟友|敌人|仇人|师父|徒弟|父亲|母亲|兄弟|姐妹|恋人|婚约|同伴|队友|搭档|上下级|从属|效忠/i.test(value);
}

function splitSentences(text: string) {
  return text
    .split(/[\r\n]+|(?<=[。！？!?；;])/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function inferRelationshipType(text: string) {
  if (/师父|师徒|徒弟|师兄|师姐|弟子/i.test(text)) {
    return '师徒';
  }

  if (/父亲|母亲|儿子|女儿|兄弟|姐妹|家人|亲属/i.test(text)) {
    return '亲属';
  }

  if (/恋人|情侣|婚约|夫妻|爱人/i.test(text)) {
    return '情感';
  }

  if (/盟友|结盟|合作|同伴|队友|搭档/i.test(text)) {
    return '盟友';
  }

  if (/敌人|仇人|对立|死敌|追杀/i.test(text)) {
    return '敌对';
  }

  if (/上下级|属下|上司|从属|效忠|听命于/i.test(text)) {
    return '从属';
  }

  return '关系';
}

function extractEntityMentions(sentence: string, candidateNames: string[]) {
  const normalizedSentence = normalizeText(sentence);
  const matches = candidateNames
    .map((name) => ({
      name,
      index: normalizedSentence.indexOf(normalizeText(name)),
    }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);

  return Array.from(new Set(matches.map((item) => item.name)));
}

function buildRelationshipId(
  projectId: string,
  chapterId: string,
  sourceEntityName: string,
  targetEntityName: string,
  relationshipType: string,
) {
  return [
    'rel',
    projectId,
    chapterId,
    sourceEntityName.trim().toLowerCase(),
    targetEntityName.trim().toLowerCase(),
    relationshipType.trim().toLowerCase(),
  ].join(':');
}

type RelationshipCandidate = {
  id: string;
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: string;
  sourceKind: 'state_change' | 'sentence_pattern';
  description: string;
  evidence: string;
};

export function upsertGenerationEntitiesFromStateChanges(
  env: ServerEnv,
  input: {
    projectId: string;
    chapterId: string;
    chapterTitle: string;
    stateChanges: StateChangeDraft[];
  },
) {
  if (input.stateChanges.length === 0) {
    return;
  }

  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();
  const selectStatement = db.prepare(
    'SELECT fields_json, created_at FROM generation_entities WHERE project_id = ? AND entity_name = ?',
  );
  const upsertStatement = db.prepare(`
    INSERT INTO generation_entities (
      project_id,
      entity_name,
      entity_type,
      description,
      fields_json,
      last_seen_chapter_id,
      last_seen_chapter_title,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, entity_name) DO UPDATE SET
      entity_type = excluded.entity_type,
      description = excluded.description,
      fields_json = excluded.fields_json,
      last_seen_chapter_id = excluded.last_seen_chapter_id,
      last_seen_chapter_title = excluded.last_seen_chapter_title,
      updated_at = excluded.updated_at
  `);

  const groupedChanges = new Map<string, StateChangeDraft[]>();

  for (const change of input.stateChanges) {
    const key = change.entityName.trim();

    if (!key) {
      continue;
    }

    const changes = groupedChanges.get(key) ?? [];
    changes.push(change);
    groupedChanges.set(key, changes);
  }

  db.exec('BEGIN');

  try {
    for (const [entityName, changes] of groupedChanges.entries()) {
      const currentRow = selectStatement.get(input.projectId, entityName) as
        | { fields_json?: string; created_at?: string }
        | undefined;
      const nextFields = parseFieldsJson(currentRow?.fields_json);

      for (const change of changes) {
        nextFields[change.field] = change.newValue;
      }

      upsertStatement.run(
        input.projectId,
        entityName,
        'unknown',
        '',
        JSON.stringify(nextFields),
        input.chapterId,
        input.chapterTitle,
        currentRow?.created_at ?? currentTime,
        currentTime,
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function upsertGenerationEntitiesSnapshot(
  env: ServerEnv,
  input: {
    projectId: string;
    chapterId: string;
    chapterTitle: string;
    entities: GenerationEntitySnapshot[];
  },
) {
  if (input.entities.length === 0) {
    return;
  }

  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();
  const selectStatement = db.prepare(`
    SELECT
      fields_json,
      tags_json,
      pinned,
      entity_type,
      description,
      created_at
    FROM generation_entities
    WHERE project_id = ? AND entity_name = ?
  `);
  const upsertStatement = db.prepare(`
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
    ON CONFLICT(project_id, entity_name) DO UPDATE SET
      entity_type = excluded.entity_type,
      description = excluded.description,
      fields_json = excluded.fields_json,
      tags_json = excluded.tags_json,
      pinned = excluded.pinned,
      last_seen_chapter_id = excluded.last_seen_chapter_id,
      last_seen_chapter_title = excluded.last_seen_chapter_title,
      updated_at = excluded.updated_at
  `);

  db.exec('BEGIN');

  try {
    for (const entity of input.entities) {
      const entityName = entity.name.trim();

      if (!entityName) {
        continue;
      }

      const currentRow = selectStatement.get(input.projectId, entityName) as
        | {
            fields_json?: string;
            tags_json?: string;
            pinned?: number;
            entity_type?: string;
            description?: string;
            created_at?: string;
          }
        | undefined;
      const existingFields = parseFieldsJson(currentRow?.fields_json);
      const nextFields = {
        ...(entity.fields ?? {}),
        ...existingFields,
      };
      const mergedTags = Array.from(
        new Set([
          ...(Array.isArray(entity.tags) ? entity.tags : []),
          ...parseStringArrayJson(currentRow?.tags_json),
        ].map((tag) => tag.trim()).filter(Boolean)),
      );

      upsertStatement.run(
        input.projectId,
        entityName,
        entity.type?.trim() || currentRow?.entity_type || 'unknown',
        entity.description?.trim() || currentRow?.description || '',
        JSON.stringify(nextFields),
        JSON.stringify(mergedTags),
        entity.pinned || Number(currentRow?.pinned ?? 0) > 0 ? 1 : 0,
        input.chapterId,
        input.chapterTitle,
        currentRow?.created_at ?? currentTime,
        currentTime,
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function upsertGenerationChapterIndex(
  env: ServerEnv,
  input: {
    projectId: string;
    chapterId: string;
    chapterTitle: string;
    chapterOrder?: number;
    volumeTitle?: string;
    previousChapterId?: string;
    previousChapterTitle?: string;
    outline: ChapterOutlineDraft | null;
    summary: ChapterSummaryDraft;
    strand: StrandType;
    stateChanges: StateChangeDraft[];
  },
) {
  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();
  const entitiesAppeared = Array.from(
    new Set(
      input.stateChanges
        .map((change) => change.entityName.trim())
        .filter(Boolean),
    ),
  );
  const locations = extractLocations(input.stateChanges);

  db.prepare(`
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
      beat_count,
      beats_json,
      immutable_facts_json,
      hook_type,
      hook_strength,
      entities_appeared_json,
      locations_json,
      summary_excerpt,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, chapter_id) DO UPDATE SET
      chapter_title = excluded.chapter_title,
      chapter_order = excluded.chapter_order,
      volume_title = excluded.volume_title,
      previous_chapter_id = excluded.previous_chapter_id,
      previous_chapter_title = excluded.previous_chapter_title,
      time_anchor = excluded.time_anchor,
      strand = excluded.strand,
      beat_count = excluded.beat_count,
      beats_json = excluded.beats_json,
      immutable_facts_json = excluded.immutable_facts_json,
      hook_type = excluded.hook_type,
      hook_strength = excluded.hook_strength,
      entities_appeared_json = excluded.entities_appeared_json,
      locations_json = excluded.locations_json,
      summary_excerpt = excluded.summary_excerpt,
      updated_at = excluded.updated_at
  `).run(
    input.projectId,
    input.chapterId,
    input.chapterTitle,
    input.chapterOrder ?? 0,
    input.volumeTitle ?? '',
    input.previousChapterId ?? '',
    input.previousChapterTitle ?? '',
    input.outline?.timeAnchor ?? '',
    input.strand,
    input.outline?.beats.length ?? 0,
    JSON.stringify(input.outline?.beats ?? []),
    JSON.stringify(input.outline?.immutableFacts ?? []),
    input.outline?.hookType ?? '',
    input.outline?.hookStrength ?? '',
    JSON.stringify(entitiesAppeared),
    JSON.stringify(locations),
    input.summary.summary,
    currentTime,
    currentTime,
  );
}

export function replaceGenerationRelationshipsFromStateChanges(
  env: ServerEnv,
  input: {
    projectId: string;
    chapterId: string;
    chapterTitle: string;
    stateChanges: StateChangeDraft[];
    content?: string;
    summary?: string;
  },
) {
  if (input.stateChanges.length === 0 && !input.content?.trim() && !input.summary?.trim()) {
    return;
  }

  const db = getGenerationDatabase(env);
  const currentTime = nowIsoString();
  const existingEntityRows = db.prepare(
    'SELECT entity_name FROM generation_entities WHERE project_id = ?',
  ).all(input.projectId) as Array<{ entity_name?: string }>;
  const candidateNames = Array.from(
    new Set(
      [
        ...existingEntityRows.map((row) => row.entity_name ?? ''),
        ...input.stateChanges.map((change) => change.entityName),
      ]
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  );
  const insertStatement = db.prepare(`
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
  const relationships = new Map<
    string,
    RelationshipCandidate
  >();

  db.exec('BEGIN');

  try {
    db.prepare('DELETE FROM generation_relationships WHERE project_id = ? AND chapter_id = ?').run(
      input.projectId,
      input.chapterId,
    );

    for (const change of input.stateChanges) {
      if (!looksLikeRelationshipField(change.field) && !looksLikeRelationshipText(change.newValue)) {
        continue;
      }

      const sourceEntityName = change.entityName.trim();

      if (!sourceEntityName) {
        continue;
      }

      const normalizedValue = normalizeText(change.newValue);
      const targetNames = candidateNames.filter((candidateName) => {
        if (!candidateName || normalizeText(candidateName) === normalizeText(sourceEntityName)) {
          return false;
        }

        return normalizedValue.includes(normalizeText(candidateName));
      });

      for (const targetEntityName of targetNames) {
        const relationshipType = inferRelationshipType(`${change.field} ${change.newValue}`) || change.field.trim() || '关系';
        const id = buildRelationshipId(input.projectId, input.chapterId, sourceEntityName, targetEntityName, relationshipType);

        relationships.set(id, {
          id,
          sourceEntityName,
          targetEntityName,
          relationshipType,
          sourceKind: 'state_change',
          description: change.newValue,
          evidence: `${change.field}：${change.oldValue || '空'} → ${change.newValue}`,
        });
      }
    }

    const sentenceSources = [
      ...splitSentences(input.summary ?? ''),
      ...splitSentences(input.content ?? ''),
    ];

    for (const sentence of sentenceSources) {
      if (!looksLikeRelationshipText(sentence)) {
        continue;
      }

      const mentions = extractEntityMentions(sentence, candidateNames);

      if (mentions.length !== 2) {
        continue;
      }

      const [sourceEntityName, targetEntityName] = mentions;
      const relationshipType = inferRelationshipType(sentence);
      const id = buildRelationshipId(
        input.projectId,
        input.chapterId,
        sourceEntityName,
        targetEntityName,
        relationshipType,
      );

      relationships.set(id, {
        id,
        sourceEntityName,
        targetEntityName,
        relationshipType,
        sourceKind: 'sentence_pattern',
        description: sentence,
        evidence: sentence,
      });
    }

    for (const relationship of relationships.values()) {
      insertStatement.run(
        relationship.id,
        input.projectId,
        relationship.sourceEntityName,
        relationship.targetEntityName,
        relationship.relationshipType,
        relationship.sourceKind,
        relationship.description,
        relationship.evidence,
        input.chapterId,
        input.chapterTitle,
        currentTime,
        currentTime,
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
