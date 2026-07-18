/**
 * Оффлайн-инструмент (TASK-038, F5): генерирует content/benchmarks.json —
 * эталонные кривые LH/networth/XP по герою и минуте для бенчмарк-виджетов
 * (TASK-039). Читает список героев/патч/ранг из content/meta-mid-heroes.json
 * (INV4 — переиспользуем существующие данные, без дублирования списка героев).
 *
 * Источник — публичный OpenDota `/benchmarks?hero_id=` (не требует ключа,
 * см. src/main/data/OpenDotaClient.ts createOpenDotaClient()). Проверено вживую
 * (см. progress.txt): этот эндпоинт отдаёт ТОЛЬКО средние ставки за матч по
 * перцентилям (gold_per_min, xp_per_min, last_hits_per_min), а не реальную
 * поминутную дистрибуцию — истинных поминутных данных нет ни там, ни в STRATZ
 * (нет подтверждённой схемы/токена, см. заголовок src/main/data/stratzQueries.ts).
 * Это и есть ответ на open_question #3 (tasks.json): используем честную линейную
 * интерполяцию rate*minute, каждая точка помечена `approximate: true`
 * (src/shared/schemas/benchmarks.ts) — потребитель обязан показать пометку
 * "приблизительно", а не выдавать кривую за точную поминутную статистику.
 *
 * Запуск: `npm run generate:benchmarks` (из корня репозитория; node 22+ с
 * нативной поддержкой TS type-stripping, без сборки).
 *
 * Инструмент — не часть src/engine|shared (INV2 на них не распространяется),
 * ему можно использовать сеть/fs напрямую.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BenchmarksConfigSchema, type BenchmarkPoint } from '../src/shared/schemas/benchmarks.ts'

const META_MID_HEROES_PATH = resolve(process.cwd(), 'content/meta-mid-heroes.json')
const OUTPUT_PATH = resolve(process.cwd(), 'content/benchmarks.json')
const OPENDOTA_BENCHMARKS_ENDPOINT = 'https://api.opendota.com/api/benchmarks'

/** Верхняя граница минут: дальше линейная экстраполяция rate*minute становится нереалистичной (нет замедления к позднему фарму). */
const MAX_MINUTE = 40
/** Публичный лимит OpenDota без ключа — ~60/мин; берём запас. */
const REQUEST_DELAY_MS = 1100

interface PercentileEntry {
  percentile: number
  value: number
}

interface OpenDotaBenchmarksResponse {
  hero_id: number
  result: {
    gold_per_min: PercentileEntry[]
    xp_per_min: PercentileEntry[]
    last_hits_per_min: PercentileEntry[]
  }
}

interface MetaMidHeroesConfig {
  patch: string
  rankBracket: string
  heroIds: number[]
}

export interface HeroRates {
  lhPerMin: { p50: number; p75: number }
  goldPerMin: { p50: number; p75: number }
  xpPerMin: { p50: number; p75: number }
}

/**
 * OpenDota отдаёт фиксированный набор перцентилей (0.1..0.99), в котором может не
 * быть ровно 0.5/0.75 — линейно интерполируем между соседними известными точками.
 */
export function pickPercentileValue(entries: PercentileEntry[], target: number): number {
  const sorted = [...entries].sort((a, b) => a.percentile - b.percentile)
  const exact = sorted.find((entry) => Math.abs(entry.percentile - target) < 1e-9)
  if (exact) return exact.value

  const lower = [...sorted].reverse().find((entry) => entry.percentile < target)
  const upper = sorted.find((entry) => entry.percentile > target)
  if (!lower) return upper ? upper.value : 0
  if (!upper) return lower.value

  const span = upper.percentile - lower.percentile
  const t = (target - lower.percentile) / span
  return lower.value + (upper.value - lower.value) * t
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Строит поминутную кривую (0..maxMinute) линейной интерполяцией ставок — все точки approximate:true. */
export function buildBenchmarkPoints(
  heroId: number,
  rates: HeroRates,
  scope: { patch: string; rankBracket: string },
  maxMinute: number
): BenchmarkPoint[] {
  const points: BenchmarkPoint[] = []
  for (let minute = 0; minute <= maxMinute; minute += 1) {
    points.push({
      hero_id: heroId,
      minute,
      lh_p50: round(rates.lhPerMin.p50 * minute),
      lh_p75: round(rates.lhPerMin.p75 * minute),
      networth_p50: round(rates.goldPerMin.p50 * minute),
      networth_p75: round(rates.goldPerMin.p75 * minute),
      xp_p50: round(rates.xpPerMin.p50 * minute),
      xp_p75: round(rates.xpPerMin.p75 * minute),
      rank_bracket: scope.rankBracket,
      patch: scope.patch,
      approximate: true
    })
  }
  return points
}

export async function fetchHeroRates(heroId: number, fetchFn: typeof fetch = fetch): Promise<HeroRates> {
  const response = await fetchFn(`${OPENDOTA_BENCHMARKS_ENDPOINT}?hero_id=${heroId}`)
  if (!response.ok) {
    throw new Error(`OpenDota benchmarks request failed for hero ${heroId}: HTTP ${response.status}`)
  }
  const payload = (await response.json()) as OpenDotaBenchmarksResponse
  return {
    lhPerMin: {
      p50: pickPercentileValue(payload.result.last_hits_per_min, 0.5),
      p75: pickPercentileValue(payload.result.last_hits_per_min, 0.75)
    },
    goldPerMin: {
      p50: pickPercentileValue(payload.result.gold_per_min, 0.5),
      p75: pickPercentileValue(payload.result.gold_per_min, 0.75)
    },
    xpPerMin: {
      p50: pickPercentileValue(payload.result.xp_per_min, 0.5),
      p75: pickPercentileValue(payload.result.xp_per_min, 0.75)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function main(): Promise<void> {
  const meta = JSON.parse(readFileSync(META_MID_HEROES_PATH, 'utf-8')) as MetaMidHeroesConfig

  const allPoints: BenchmarkPoint[] = []
  let completed = 0
  for (const heroId of meta.heroIds) {
    try {
      const rates = await fetchHeroRates(heroId)
      allPoints.push(...buildBenchmarkPoints(heroId, rates, meta, MAX_MINUTE))
      completed += 1
      console.log(`[generate-benchmarks] hero ${heroId}: ok (${completed}/${meta.heroIds.length})`)
    } catch (error) {
      console.warn(`[generate-benchmarks] hero ${heroId}: failed — ${String(error)}`)
    }
    await sleep(REQUEST_DELAY_MS)
  }

  const parsed = BenchmarksConfigSchema.safeParse(allPoints)
  if (!parsed.success) {
    console.error('[generate-benchmarks] generated data failed schema validation:', parsed.error.format())
    process.exitCode = 1
    return
  }

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(parsed.data, null, 2)}\n`, 'utf-8')
  console.log(
    `[generate-benchmarks] wrote ${parsed.data.length} points (${completed}/${meta.heroIds.length} heroes) to ${OUTPUT_PATH}`
  )
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().catch((error) => {
    console.error('[generate-benchmarks] fatal:', error)
    process.exitCode = 1
  })
}
