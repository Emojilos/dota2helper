/**
 * Сырые типы ответов OpenDota REST API (https://docs.opendota.com/) — fallback-
 * источник (TASK-024), используется, когда STRATZ недоступен/лимитирован (INV5).
 * Поля названы по фактической схеме OpenDota (snake_case, как отдаёт сам API).
 *
 * INV2: модуль чист — только типы, без electron / react / fs / сети.
 */

/** GET /heroes/{hero_id}/matchups — контрпик-статистика (vs) героя hero_id против каждого встреченного героя. */
export interface OpenDotaHeroMatchupEntry {
  hero_id: number
  games_played: number
  wins: number
}
export type OpenDotaHeroMatchupsResponse = OpenDotaHeroMatchupEntry[]

/** GET /players/{account_id}/heroes — пул героев игрока (matches/winrate по каждому герою). */
export interface OpenDotaPlayerHeroEntry {
  hero_id: number
  last_played: number
  games: number
  win: number
}
export type OpenDotaPlayerHeroesResponse = OpenDotaPlayerHeroEntry[]
