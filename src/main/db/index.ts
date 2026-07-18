/** Барель БД-подсистемы main (TASK-010). */
export { openDatabase, type DatabaseInstance } from './openDatabase'
export { runMigrations, type Migration } from './migrations'
export { UserProfileRepository } from './UserProfileRepository'
export { AppStateStore } from './AppStateStore'
