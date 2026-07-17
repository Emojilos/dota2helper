/**
 * Открывает better-sqlite3-соединение (TASK-010). Путь подаётся аргументом
 * (userData-путь резолвит main/index.ts, ':memory:' — для тестов), сам модуль
 * не знает про electron (кроме зависимости от нативного better-sqlite3,
 * которая допустима в main — INV2 запрещает её только в engine/shared).
 */
import Database from 'better-sqlite3'

export type DatabaseInstance = Database.Database

export function openDatabase(path: string): DatabaseInstance {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
