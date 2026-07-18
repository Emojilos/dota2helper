/**
 * LanePlanBuilder (F2, TASK-036): собирает план на лайн для пары
 * (свой герой, вражеский мидер) после финализации пиков — стартовую закупку
 * и скиллбилд (DataService.getHeroBuilds, TASK-021/026), карточку матчапа из
 * matchup-knowledge.json (F2, TASK-035, findMatchupEntry — направленный
 * ключ heroId→vsHeroId, тексты с позиции своего героя) и план таймингов,
 * собранный из пиков силы обеих сторон (hero-profiles.json, TASK-034).
 *
 * Для пар ВНЕ базы знаний (findMatchupEntry возвращает undefined) — раздел F2
 * PRD прямо требует статистический fallback: билд + винрейт пары
 * (matchup.winrate) + пики силы из hero-profiles, БЕЗ текстов — doTips/
 * avoidTips/notes из matchup-knowledge для такой пары не существуют и не
 * подставляются (см. LanePlan.knowledge=null, timingPlan без поля `note`).
 *
 * INV1: живёт в main. Узкий срез DataService (LanePlanDataSource) — тот же
 * приём, что StratzDataSource/CacheWarmerDataSource (TASK-021/025): тестируется
 * фейком, без реального STRATZ/SQLite. Никогда не бросает исключение вызывающему
 * — билд/матчап это DataResult<T> (INV5), а конфиги (hero-profiles/
 * matchup-knowledge) читаются через ConfigLoader-геттеры, отсутствие данных —
 * null, не exception.
 *
 * ИЗВЕСТНЫЙ РИСК ДАННЫХ (см. DataService.ts, комментарий getHeroBuilds):
 * билды сейчас ТОЛЬКО STRATZ — нет ни OpenDota-фолбэка, ни SQLite-кэша под
 * builds. При недоступном STRATZ build.status будет 'no-data' без stale-
 * деградации; это касается ТОЛЬКО билд-части плана — matchup-часть
 * (винрейт пары) полноценно деградирует STRATZ→OpenDota→SQLite-кэш через
 * DataService.getHeroMatchups. Отмечено в progress.txt как открытый вопрос
 * для владельца, вне объёма этой задачи — расширять кэш билдов.
 *
 * "План готов ≤5 сек после финализации пиков" (acceptance criteria) —
 * архитектурное свойство: build() параллелит два сетевых вызова
 * (Promise.all) и после них делает только синхронную локальную композицию
 * (конфиги уже в памяти через ConfigLoader). Верхняя граница задержки
 * целиком определяется STRATZ/OpenDota HTTP-запросами внутри DataService, не
 * логикой этого модуля — измерить живьём нечем, пока нет триггера
 * финализации пиков (TASK-027, ещё pending), см. progress.txt.
 */
import type { StratzQueryScope } from '@shared/types/stratz'
import type { DataResult } from '@shared/types/dataResult'
import type { BuildData, MatchupData } from '@shared/schemas/stratzDto'
import type { HeroProfile, HeroProfilesConfig } from '@shared/schemas/heroProfiles'
import {
  findMatchupEntry,
  type MatchupKnowledgeConfig,
  type MatchupKnowledgeEntry
} from '@shared/schemas/matchupKnowledge'

/** Узкий срез DataService, нужный билдеру — легко подменяется фейком в тестах. */
export interface LanePlanDataSource {
  getHeroBuilds(heroId: number, scope: StratzQueryScope, vsHeroId?: number): Promise<DataResult<BuildData[]>>
  getHeroMatchups(heroId: number, scope: StratzQueryScope): Promise<DataResult<MatchupData[]>>
}

export type LanePlanTimingKind = 'power_spike' | 'kill_window' | 'level6'

export interface LanePlanTimingPoint {
  kind: LanePlanTimingKind
  side: 'my' | 'enemy'
  /** Уровень героя (power_spike/kill_window) либо секунды игрового времени (level6). */
  value: number
  /** Тезис с позиции своего героя — заполнен ТОЛЬКО когда пара есть в matchup-knowledge (power_spike/kill_window из карточки, не из статистического fallback). */
  note?: string
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
}

export interface LanePlanBuilderOptions {
  logger?: (message: string) => void
}

export class LanePlanBuilder {
  private readonly logger: (message: string) => void

  constructor(
    private readonly dataSource: LanePlanDataSource,
    private readonly getHeroProfiles: () => HeroProfilesConfig | null,
    private readonly getMatchupKnowledge: () => MatchupKnowledgeConfig | null,
    options: LanePlanBuilderOptions = {}
  ) {
    this.logger = options.logger ?? ((): void => {})
  }

  /**
   * Собирает план на лайн для (myHeroId, enemyHeroId). Никогда не бросает —
   * при отказе источника данных соответствующее поле становится
   * DataResult{status:'no-data'}, не exception (см. заголовок модуля).
   */
  async build(myHeroId: number, enemyHeroId: number, scope: StratzQueryScope): Promise<LanePlan> {
    const [buildsResult, matchupsResult] = await Promise.all([
      this.safeGetBuilds(myHeroId, scope, enemyHeroId),
      this.safeGetMatchups(myHeroId, scope)
    ])

    const build = pickBestBuild(buildsResult)
    const matchup = pickVsMatchup(matchupsResult, enemyHeroId)

    const profiles = this.getHeroProfiles()
    const myHeroProfile = findHeroProfile(profiles, myHeroId)
    const enemyHeroProfile = findHeroProfile(profiles, enemyHeroId)

    const knowledge = findMatchupEntry(this.getMatchupKnowledge(), myHeroId, enemyHeroId) ?? null

    return {
      myHeroId,
      enemyHeroId,
      build,
      matchup,
      knowledge,
      hasKnowledge: knowledge !== null,
      timingPlan: buildTimingPlan(myHeroProfile, enemyHeroProfile, knowledge),
      myHeroProfile,
      enemyHeroProfile
    }
  }

  private async safeGetBuilds(
    heroId: number,
    scope: StratzQueryScope,
    vsHeroId: number
  ): Promise<DataResult<BuildData[]>> {
    try {
      return await this.dataSource.getHeroBuilds(heroId, scope, vsHeroId)
    } catch (error) {
      this.logger(`[lane-plan] getHeroBuilds failed for hero ${heroId}: ${String(error)}`)
      return { status: 'no-data', source: 'none', fetchedAt: null, stale: true, reason: String(error) }
    }
  }

  private async safeGetMatchups(heroId: number, scope: StratzQueryScope): Promise<DataResult<MatchupData[]>> {
    try {
      return await this.dataSource.getHeroMatchups(heroId, scope)
    } catch (error) {
      this.logger(`[lane-plan] getHeroMatchups failed for hero ${heroId}: ${String(error)}`)
      return { status: 'no-data', source: 'none', fetchedAt: null, stale: true, reason: String(error) }
    }
  }
}

function findHeroProfile(config: HeroProfilesConfig | null, heroId: number): HeroProfile | null {
  return config?.profiles.find((profile) => profile.heroId === heroId) ?? null
}

/** Билды — массив кандидатов (напр. несколько популярных сборок); берём с наибольшей выборкой, при равенстве — с большим винрейтом. DataService сам не выбирает (см. research). */
function pickBestBuild(result: DataResult<BuildData[]>): DataResult<BuildData | null> {
  if (result.status !== 'ok') {
    return result
  }
  const best = result.data.reduce<BuildData | null>((acc, candidate) => {
    if (!acc) {
      return candidate
    }
    if (candidate.sampleSize !== acc.sampleSize) {
      return candidate.sampleSize > acc.sampleSize ? candidate : acc
    }
    return candidate.winrate > acc.winrate ? candidate : acc
  }, null)
  return { ...result, data: best }
}

/** getHeroMatchups отдаёт матчапы против ВСЕХ героев (vs и with) — фильтруем направленную пару 'vs' enemyHeroId. */
function pickVsMatchup(result: DataResult<MatchupData[]>, enemyHeroId: number): DataResult<MatchupData | null> {
  if (result.status !== 'ok') {
    return result
  }
  const match = result.data.find((row) => row.relation === 'vs' && row.otherHeroId === enemyHeroId) ?? null
  return { ...result, data: match }
}

/**
 * Пики силы/окна убийства: если пара есть в базе знаний — берём ИЗ карточки
 * (точнее, с тезисом note); иначе — статистический fallback из hero-profiles
 * (голые уровни, без note — раздел F2 PRD acceptance criteria "без текстов").
 * typical_level6_time_sec всегда добавляется отдельно (не зависит от наличия
 * карточки — это статистика, не текст).
 */
function buildTimingPlan(
  myProfile: HeroProfile | null,
  enemyProfile: HeroProfile | null,
  knowledge: MatchupKnowledgeEntry | null
): LanePlanTimingPoint[] {
  const points: LanePlanTimingPoint[] = []

  if (myProfile) {
    points.push({ kind: 'level6', side: 'my', value: myProfile.typicalLevel6TimeSec })
  }
  if (enemyProfile) {
    points.push({ kind: 'level6', side: 'enemy', value: enemyProfile.typicalLevel6TimeSec })
  }

  if (knowledge) {
    for (const spike of knowledge.powerSpikes) {
      points.push({ kind: 'power_spike', side: spike.side, value: spike.level, note: spike.note })
    }
    for (const level of knowledge.killWindows) {
      points.push({ kind: 'kill_window', side: 'my', value: level })
    }
    return points
  }

  if (myProfile) {
    for (const level of myProfile.powerSpikeLevels) {
      points.push({ kind: 'power_spike', side: 'my', value: level })
    }
  }
  if (enemyProfile) {
    for (const level of enemyProfile.powerSpikeLevels) {
      points.push({ kind: 'power_spike', side: 'enemy', value: level })
    }
  }
  return points
}
