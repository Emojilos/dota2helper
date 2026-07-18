/**
 * Детект завершения матча (F6, TASK-033): следит за потоком GameState и один
 * раз за матч (edge-triggered по переходу в DOTA_GAMERULES_STATE_POST_GAME
 * для НОВОГО matchId — тот же приём, что SteamIdDetector с notified/reset,
 * см. src/main/steam/SteamIdDetector.ts) строит MatchSummary и уведомляет
 * подписчика. enemyMidHeroId подаётся геттером — сейчас всегда null, т.к.
 * детект драфта (TASK-027) ещё не реализован; когда появится, оркестратор
 * (main/index.ts) сможет прокинуть реальное значение без изменений здесь.
 *
 * INV1/INV2: чистый класс без electron/db-зависимостей — принимает и отдаёт
 * только данные, тестируется юнит-тестами как SteamIdDetector.
 */
import type { GameState } from '@shared/schemas/gameState'
import type { MatchResult, MatchSummary } from '@shared/schemas/stratzDto'

export const POST_GAME_STATE = 'DOTA_GAMERULES_STATE_POST_GAME'

/**
 * Строит сводку завершённого матча из текущего GameState. Возвращает null,
 * если данных недостаточно для ОДНОЗНАЧНОГО результата — matchId/hero/player
 * отсутствуют, либо map.winTeam/player.team ещё не 'radiant'/'dire'
 * (win_team/team_name не встречались в верифицированных фикстурах, открытый
 * вопрос TASK-009). MatchResultSchema допускает только 'win'/'loss', поэтому
 * лучше пропустить запись, чем угадать результат.
 */
export function buildMatchSummary(
  state: GameState,
  enemyMidHeroId: number | null,
  playedAtMs: number
): MatchSummary | null {
  const { map, player, hero } = state
  if (!map?.matchId || !player || !hero) {
    return null
  }
  if (!map.winTeam || !player.team) {
    return null
  }
  const result: MatchResult = map.winTeam === player.team ? 'win' : 'loss'
  return {
    matchId: map.matchId,
    heroId: hero.id,
    enemyMidHeroId,
    result,
    kda: { kills: player.kills, deaths: player.deaths, assists: player.assists },
    playedAtMs
  }
}

export interface MatchCompletionDetectorOptions {
  getEnemyMidHeroId: () => number | null
  onMatchCompleted: (summary: MatchSummary) => void
  now?: () => number
  logger?: (message: string) => void
}

export class MatchCompletionDetector {
  private readonly now: () => number
  private readonly logger: (message: string) => void
  private notifiedMatchId: string | null = null

  constructor(private readonly options: MatchCompletionDetectorOptions) {
    this.now = options.now ?? Date.now
    this.logger = options.logger ?? ((): void => {})
  }

  /** Вызывать на каждое обновление GameState. */
  onGameState(state: GameState): void {
    const map = state.map
    if (!map || map.gameState !== POST_GAME_STATE) {
      return
    }
    if (!map.matchId || map.matchId === this.notifiedMatchId) {
      return
    }
    // Помечаем матч обработанным ДО построения сводки — иначе неопределённый
    // результат (winTeam/team ещё не пришли) переспамил бы лог на каждый тик
    // (~2 Гц), пока держится экран post-game.
    this.notifiedMatchId = map.matchId

    const summary = buildMatchSummary(state, this.options.getEnemyMidHeroId(), this.now())
    if (!summary) {
      this.logger(`[match-history] post-game reached for match ${map.matchId} but result is undetermined — skipping`)
      return
    }
    this.options.onMatchCompleted(summary)
  }

  /** Разрешает детекту снова сработать для текущего matchId (напр. в тестах). */
  reset(): void {
    this.notifiedMatchId = null
  }
}
