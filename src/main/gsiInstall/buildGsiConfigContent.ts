/**
 * Генерация содержимого gamestate_integration-конфига (TASK-006).
 *
 * Штатный формат Valve (VDF-подобный, см. раздел 4 PRD): секция "data" включает
 * категории пакетов, которые Dota будет присылать на uri. Секция "auth.token"
 * должна совпадать с authToken, которым GsiServer (TASK-005) проверяет пакеты.
 *
 * Чистая функция — без fs/electron (тестируется без временных файлов).
 */
export interface GsiConfigOptions {
  /** Хост GSI-сервера (обычно 127.0.0.1 — INV3, только loopback). */
  host: string
  /** Порт, на котором фактически поднялся GsiServer (после автоподбора). */
  port: number
  /** Shared auth-токен, который Dota обязана прислать в auth.token. */
  token: string
  /** Заголовок секции конфига (для отладки — какое приложение его установило). */
  appName?: string
}

const DEFAULT_APP_NAME = 'MidMind GSI Integration'

/** Строит текст .cfg-файла для `.../cfg/gamestate_integration/`. */
export function buildGsiConfigContent(options: GsiConfigOptions): string {
  const appName = options.appName ?? DEFAULT_APP_NAME
  const uri = `http://${options.host}:${options.port}/`
  return `"${appName}"
{
    "uri"           "${uri}"
    "timeout"       "5.0"
    "buffer"        "0.1"
    "throttle"      "0.1"
    "heartbeat"     "30.0"
    "data"
    {
        "provider"      "1"
        "map"           "1"
        "player"        "1"
        "hero"          "1"
        "abilities"     "1"
        "items"         "1"
    }
    "auth"
    {
        "token"         "${options.token}"
    }
}
`
}
