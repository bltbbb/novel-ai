import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ServerEnv } from '../config/env.js';

const DB_FILE_NAME = 'generation.sqlite';

let cachedDatabase: {
  filePath: string;
  db: DatabaseSync;
} | null = null;

function getDatabaseFilePath(env: ServerEnv) {
  return path.resolve(process.cwd(), env.generationDataDir, DB_FILE_NAME);
}

function ensureTableColumn(db: DatabaseSync, tableName: string, columnName: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function initializeSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL,
      current_step TEXT NOT NULL,
      completed_beat_count INTEGER NOT NULL,
      total_beat_count INTEGER NOT NULL,
      current_beat_index INTEGER,
      current_beat_label TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      review_rewrite_count INTEGER NOT NULL,
      review_gate_reason TEXT NOT NULL,
      rewrite_guidance TEXT NOT NULL,
      paused_at TEXT,
      request_json TEXT NOT NULL,
      outline_json TEXT,
      generated_text TEXT NOT NULL,
      style_json TEXT,
      review_json TEXT,
      polish_json TEXT,
      summary_json TEXT,
      state_changes_json TEXT NOT NULL,
      strand TEXT,
      error_message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_jobs_project ON generation_jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_updated_at ON generation_jobs(updated_at);

    CREATE TABLE IF NOT EXISTS generation_runtime_config (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_chapter_summaries (
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      summary TEXT NOT NULL,
      hook TEXT NOT NULL,
      foreshadowings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, chapter_id)
    );

    CREATE INDEX IF NOT EXISTS idx_generation_chapter_summaries_project
      ON generation_chapter_summaries(project_id);

    CREATE TABLE IF NOT EXISTS generation_state_changes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT NOT NULL,
      new_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_state_changes_project
      ON generation_state_changes(project_id);

    CREATE INDEX IF NOT EXISTS idx_generation_state_changes_chapter
      ON generation_state_changes(project_id, chapter_id);

    CREATE TABLE IF NOT EXISTS generation_review_metrics (
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      summary TEXT NOT NULL,
      overall_severity TEXT NOT NULL,
      needs_rewrite INTEGER NOT NULL,
      anti_ai_force_check TEXT NOT NULL,
      checker_results_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, chapter_id)
    );

    CREATE INDEX IF NOT EXISTS idx_generation_review_metrics_project
      ON generation_review_metrics(project_id);

    CREATE TABLE IF NOT EXISTS generation_entities (
      project_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      description TEXT NOT NULL,
      fields_json TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0,
      last_seen_chapter_id TEXT NOT NULL,
      last_seen_chapter_title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, entity_name)
    );

    CREATE INDEX IF NOT EXISTS idx_generation_entities_project
      ON generation_entities(project_id);

    CREATE TABLE IF NOT EXISTS generation_relationships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_entity_name TEXT NOT NULL,
      target_entity_name TEXT,
      relationship_type TEXT NOT NULL,
      source_kind TEXT NOT NULL DEFAULT 'unknown',
      description TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '',
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_relationships_project
      ON generation_relationships(project_id);

    CREATE INDEX IF NOT EXISTS idx_generation_relationships_chapter
      ON generation_relationships(project_id, chapter_id);

    CREATE TABLE IF NOT EXISTS generation_foreshadows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planted',
      source_chapter_id TEXT,
      source_chapter_title TEXT NOT NULL DEFAULT '',
      resolved_chapter_id TEXT,
      resolved_chapter_title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_foreshadows_project
      ON generation_foreshadows(project_id);

    CREATE TABLE IF NOT EXISTS generation_chapter_index (
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      chapter_order INTEGER NOT NULL DEFAULT 0,
      volume_title TEXT NOT NULL DEFAULT '',
      previous_chapter_id TEXT NOT NULL DEFAULT '',
      previous_chapter_title TEXT NOT NULL DEFAULT '',
      time_anchor TEXT NOT NULL,
      strand TEXT NOT NULL,
      entities_appeared_json TEXT NOT NULL,
      locations_json TEXT NOT NULL,
      summary_excerpt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, chapter_id)
    );

    CREATE INDEX IF NOT EXISTS idx_generation_chapter_index_project
      ON generation_chapter_index(project_id);

    CREATE TABLE IF NOT EXISTS generation_volume_recaps (
      project_id TEXT NOT NULL,
      volume_title TEXT NOT NULL,
      start_chapter_id TEXT NOT NULL DEFAULT '',
      start_chapter_order INTEGER NOT NULL DEFAULT 0,
      end_chapter_id TEXT NOT NULL DEFAULT '',
      end_chapter_order INTEGER NOT NULL DEFAULT 0,
      chapter_count INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      highlights_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, volume_title)
    );

    CREATE INDEX IF NOT EXISTS idx_generation_volume_recaps_project
      ON generation_volume_recaps(project_id);

    CREATE TABLE IF NOT EXISTS generation_memory_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      chapter_order INTEGER NOT NULL DEFAULT 0,
      volume_title TEXT NOT NULL DEFAULT '',
      chunk_kind TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      time_anchor TEXT NOT NULL DEFAULT '',
      summary_excerpt TEXT NOT NULL DEFAULT '',
      token_count INTEGER NOT NULL DEFAULT 0,
      entity_refs_json TEXT NOT NULL DEFAULT '[]',
      locations_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_memory_chunks_project
      ON generation_memory_chunks(project_id);

    CREATE INDEX IF NOT EXISTS idx_generation_memory_chunks_chapter
      ON generation_memory_chunks(project_id, chapter_id);

    CREATE INDEX IF NOT EXISTS idx_generation_memory_chunks_kind
      ON generation_memory_chunks(project_id, chunk_kind, source_kind);

    CREATE TABLE IF NOT EXISTS generation_memory_embeddings (
      chunk_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      backend_kind TEXT NOT NULL DEFAULT 'json_cache',
      embedding_model TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      vector_json TEXT NOT NULL,
      dimension INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_memory_embeddings_project
      ON generation_memory_embeddings(project_id);

    CREATE INDEX IF NOT EXISTS idx_generation_memory_embeddings_chapter
      ON generation_memory_embeddings(project_id, chapter_id);
  `);

  ensureTableColumn(db, 'generation_chapter_index', 'beat_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureTableColumn(db, 'generation_chapter_index', 'beats_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureTableColumn(db, 'generation_chapter_index', 'immutable_facts_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureTableColumn(db, 'generation_chapter_index', 'hook_type', "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(db, 'generation_chapter_index', 'hook_strength', "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(db, 'generation_chapter_index', 'chapter_order', 'INTEGER NOT NULL DEFAULT 0');
  ensureTableColumn(db, 'generation_chapter_index', 'volume_title', "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(db, 'generation_chapter_index', 'previous_chapter_id', "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(db, 'generation_chapter_index', 'previous_chapter_title', "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(db, 'generation_entities', 'tags_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureTableColumn(db, 'generation_entities', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
  ensureTableColumn(db, 'generation_relationships', 'source_kind', "TEXT NOT NULL DEFAULT 'unknown'");
  ensureTableColumn(db, 'generation_relationships', 'evidence', "TEXT NOT NULL DEFAULT ''");
  ensureTableColumn(db, 'generation_memory_embeddings', 'backend_kind', "TEXT NOT NULL DEFAULT 'json_cache'");
}

export function getGenerationDatabase(env: ServerEnv) {
  const filePath = getDatabaseFilePath(env);

  if (cachedDatabase && cachedDatabase.filePath === filePath) {
    return cachedDatabase.db;
  }

  const dataDir = path.dirname(filePath);

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const db = new DatabaseSync(filePath);
  initializeSchema(db);
  cachedDatabase = {
    filePath,
    db,
  };
  return db;
}
