/**
 * Разбор и валидация ручного ввода Steam ID (F6, TASK-030): принимает либо
 * «голый» 64-bit SteamID, либо ссылку на профиль вида
 * .../profiles/<64-bit id>. Vanity-ссылки (.../id/<name>) не резолвятся —
 * это потребовало бы сетевого запроса к Steam Web API, вне объёма задачи
 * (пользователь может открыть свой профиль и скопировать ссылку с /profiles/,
 * которую Steam всегда показывает в адресной строке для самого себя).
 *
 * Диапазон валидных Steam64 ID — individual-аккаунты (universe=1, type=1):
 * [76561197960265728, 76561197960265728 + 0xFFFFFFFF].
 *
 * INV2: модуль чист (без electron/react/сети), используется и main, и renderer.
 */
const STEAM64_INDIVIDUAL_BASE = 76561197960265728n
const STEAM64_INDIVIDUAL_MAX = STEAM64_INDIVIDUAL_BASE + 0xffffffffn

const PROFILE_URL_PATTERN = /profiles\/(\d+)/i

export interface ParseSteamIdSuccess {
  ok: true
  steamId: string
}

export interface ParseSteamIdFailure {
  ok: false
  error: 'empty' | 'not-a-number' | 'out-of-range'
}

export type ParseSteamIdResult = ParseSteamIdSuccess | ParseSteamIdFailure

/** Извлекает и валидирует Steam64 ID из голого ID или ссылки на профиль. */
export function parseSteamId64Input(input: string): ParseSteamIdResult {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: 'empty' }
  }

  const urlMatch = trimmed.match(PROFILE_URL_PATTERN)
  const candidate = urlMatch ? urlMatch[1] : trimmed

  if (!candidate || !/^\d+$/.test(candidate)) {
    return { ok: false, error: 'not-a-number' }
  }

  const value = BigInt(candidate)
  if (value < STEAM64_INDIVIDUAL_BASE || value > STEAM64_INDIVIDUAL_MAX) {
    return { ok: false, error: 'out-of-range' }
  }

  return { ok: true, steamId: candidate }
}
