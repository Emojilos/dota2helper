/**
 * Идемпотентный migration-runner (TASK-010). Применённые миграции трекаются в
 * служебной таблице schema_migrations по id — повторный запуск на уже
 * мигрированной БД не выполняет SQL повторно и не падает.
 */
import type { DatabaseInstance } from './openDatabase'

export interface Migration {
  id: string
  up: string
}

const migrations: Migration[] = [
  {
    id: '0001_user_profile',
    up: `
      CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        steam_id TEXT,
        verbosity TEXT NOT NULL,
        hotkey_expanded_panel TEXT NOT NULL,
        draft_ranking_mode TEXT NOT NULL,
        silent_mode INTEGER NOT NULL,
        overlay_positions TEXT NOT NULL,
        notifications_config TEXT NOT NULL,
        widgets_config TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `
  },
  {
    id: '0002_data_cache',
    up: `
      CREATE TABLE IF NOT EXISTS matchup_cache (
        hero_id INTEGER NOT NULL,
        other_hero_id INTEGER NOT NULL,
        relation TEXT NOT NULL,
        winrate REAL NOT NULL,
        sample_size INTEGER NOT NULL,
        patch TEXT NOT NULL,
        rank_bracket TEXT NOT NULL,
        builds TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (hero_id, other_hero_id, relation, patch, rank_bracket)
      );

      CREATE TABLE IF NOT EXISTS hero_pool_stats (
        steam_id TEXT NOT NULL,
        hero_id INTEGER NOT NULL,
        matches_count INTEGER NOT NULL,
        winrate REAL NOT NULL,
        last_synced TEXT NOT NULL,
        PRIMARY KEY (steam_id, hero_id)
      );

      CREATE TABLE IF NOT EXISTS match_history (
        match_id TEXT PRIMARY KEY,
        hero_id INTEGER NOT NULL,
        enemy_mid_hero_id INTEGER,
        result TEXT NOT NULL,
        kda TEXT NOT NULL,
        played_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hero_pool_stats_steam_id ON hero_pool_stats (steam_id);
      CREATE INDEX IF NOT EXISTS idx_match_history_played_at ON match_history (played_at);
    `
  },
  {
    id: '0003_hotkey_silent_mode',
    up: `
      ALTER TABLE user_profile ADD COLUMN hotkey_silent_mode TEXT NOT NULL DEFAULT 'F10';
    `
  },
  {
    id: '0004_build_cache_and_app_state',
    up: `
      CREATE TABLE IF NOT EXISTS build_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hero_id INTEGER NOT NULL,
        vs_hero_id INTEGER NOT NULL,
        patch TEXT NOT NULL,
        rank_bracket TEXT NOT NULL,
        ability_ids TEXT NOT NULL,
        starting_item_ids TEXT NOT NULL,
        winrate REAL NOT NULL,
        sample_size INTEGER NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_build_cache_group
        ON build_cache (hero_id, vs_hero_id, patch, rank_bracket);

      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `
  },
  {
    id: '0005_auto_launch',
    up: `
      ALTER TABLE user_profile ADD COLUMN auto_launch INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    id: '0006_hotkey_click_through_toggle',
    up: `
      ALTER TABLE user_profile ADD COLUMN hotkey_click_through_toggle TEXT NOT NULL DEFAULT 'F8';
    `
  }
]

export function runMigrations(db: DatabaseInstance): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    db
      .prepare<[], { id: string }>('SELECT id FROM schema_migrations')
      .all()
      .map((row) => row.id)
  )

  const insertMigration = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue
    }
    db.transaction(() => {
      db.exec(migration.up)
      insertMigration.run(migration.id, new Date().toISOString())
    })()
  }
}
