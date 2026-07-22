/**
 * Форматтеры композитных виджетов пресета 'standardPanel' (F5, TASK-040):
 * KDA / LH-DN / GPM-XPM в одну строку, повторяя компактный вид родной панели
 * статистики Dota — чистые функции (INV2), используются рендер-компонентами
 * в renderer (CompositeStatWidgets.tsx), сами не знают ничего про React/GSI.
 */

const NO_VALUE = '—'

function formatStatPart(value: unknown): string {
  if (value === undefined || value === null) {
    return NO_VALUE
  }
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? String(Math.round(num)) : NO_VALUE
}

export function formatKda(kills: unknown, deaths: unknown, assists: unknown): string {
  return `${formatStatPart(kills)}/${formatStatPart(deaths)}/${formatStatPart(assists)}`
}

export function formatLhDn(lastHits: unknown, denies: unknown): string {
  return `${formatStatPart(lastHits)}/${formatStatPart(denies)}`
}

export function formatGpmXpm(gpm: unknown, xpm: unknown): string {
  return `${formatStatPart(gpm)}/${formatStatPart(xpm)}`
}
