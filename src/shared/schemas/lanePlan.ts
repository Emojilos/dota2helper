/**
 * Форма LanePlan (F2, TASK-036) — вынесена в shared (TASK-037), потому что
 * пересекает границу IPC: расширенная панель (F5 режим 3) — renderer-
 * потребитель, получающий готовый план через push-канал lanePlan:update
 * (main/index.ts собирает его в LanePlanBuilder, src/main/lane). INV1:
 * renderer читает этот тип напрямую (как DataResult/DraftContext), но не
 * импортирует src/main/**.
 *
 * Все поля уже состоят из shared-типов (BuildData/MatchupData/HeroProfile/
 * MatchupKnowledgeEntry/DataResult) — здесь только сама форма LanePlan,
 * без zod (main сам её собирает и никогда не парсит из внешнего сырого
 * ввода, тот же приём, что DraftRankingsPayload в types/ipc.ts).
 *
 * INV2: модуль чист (только type-only импорты shared-схем).
 */
import type { BuildData, MatchupData } from './stratzDto'
import type { HeroProfile } from './heroProfiles'
import type { MatchupKnowledgeEntry } from './matchupKnowledge'
import type { DataResult } from '../types/dataResult'

export type LanePlanTimingKind = 'power_spike' | 'kill_window' | 'level6'

export interface LanePlanTimingPoint {
  kind: LanePlanTimingKind
  side: 'my' | 'enemy'
  /** Уровень героя (power_spike/kill_window) либо секунды игрового времени (level6). */
  value: number
  /** Тезис с позиции своего героя — заполнен ТОЛЬКО когда пара есть в matchup-knowledge (power_spike/kill_window из карточки, не из статистического fallback). */
  note?: string
}

/**
 * Личная статистика конкретного матчапа (F2/F5, TASK-037) — count побед/
 * поражений на своём герое ПРОТИВ конкретного вражеского мидера, из
 * MatchHistory (TASK-033, hero_id+enemy_mid_hero_id). sampleSize=0 (не
 * отсутствие поля), если совпадений в истории нет — тот же приём, что
 * DraftCandidate.vsBreakdown (TASK-029): "нет данных" явно, а не пропуск.
 */
export interface PersonalMatchupRecord {
  wins: number
  losses: number
  sampleSize: number
}

export interface LanePlan {
  myHeroId: number
  enemyHeroId: number
  build: DataResult<BuildData | null>
  matchup: DataResult<MatchupData | null>
  /** Карточка матчапа с позиции myHeroId, если пара есть в базе знаний — иначе null (статистический fallback). */
  knowledge: MatchupKnowledgeEntry | null
  hasKnowledge: boolean
  timingPlan: LanePlanTimingPoint[]
  myHeroProfile: HeroProfile | null
  enemyHeroProfile: HeroProfile | null
  /** null — нет привязанного Steam ID или нет совпадений в MatchHistory для этой пары. */
  personalMatchup: PersonalMatchupRecord | null
}
