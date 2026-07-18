/**
 * Автоопределение Steam ID из первого GSI-пакета (F6, TASK-030): когда
 * профиль ещё не привязан (getBoundSteamId() === null) и приходит пакет с
 * player.steamId, один раз за сессию main-процесса вызывает onDetected —
 * оркестратор пробрасывает это push-каналом steamId:detected, а
 * подтверждение/отклонение остаётся за пользователем в renderer (ничего не
 * персистится автоматически — только предложение).
 *
 * notified — по дизайну сбрасывается только явным reset() (напр. если
 * пользователь позже отвязал Steam ID и хочет, чтобы обнаружение сработало
 * заново), а не автоматически на каждый тик — иначе баннер обнаружения
 * долбил бы renderer на каждый GSI-пакет (~2 Гц), пока пользователь не
 * отреагировал.
 *
 * INV1: живёт в main (принимает данные аргументом, без прямых electron-
 * зависимостей — тестируется юнит-тестами как чистый класс).
 */
export interface SteamIdDetectorOptions {
  getBoundSteamId: () => string | null
  onDetected: (steamId: string) => void
}

export class SteamIdDetector {
  private notified = false

  constructor(private readonly options: SteamIdDetectorOptions) {}

  /** Вызывать на каждое обновление GameState с текущим player.steamId (или null/undefined, если секции player нет). */
  onGameState(steamIdFromGsi: string | null | undefined): void {
    if (!steamIdFromGsi || this.notified) {
      return
    }
    if (this.options.getBoundSteamId() !== null) {
      return
    }
    this.notified = true
    this.options.onDetected(steamIdFromGsi)
  }

  /** Разрешает обнаружению снова сработать (напр. после того как пользователь отвязал Steam ID). */
  reset(): void {
    this.notified = false
  }
}
