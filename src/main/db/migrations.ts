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
