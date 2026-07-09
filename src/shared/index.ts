/**
 * Общие константы и чистые утилиты приложения.
 *
 * INV2: модуль НЕ импортирует electron / react / better-sqlite3 / fs / сеть.
 * Всё здесь должно оставаться чистым и тестируемым.
 */

export * from './types'
export * from './gsi/parseGameState'

export const APP_NAME = 'MidMind'
export const APP_ID = 'com.midmind.app'

/**
 * Форматирует игровое время в секундах как MM:SS.
 * Отрицательное время (обратный отсчёт до события) сохраняет знак.
 */
export function formatClockTime(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(totalSeconds))
  const minutes = Math.floor(abs / 60)
  const seconds = abs % 60
  return `${sign}${minutes}:${seconds.toString().padStart(2, '0')}`
}
