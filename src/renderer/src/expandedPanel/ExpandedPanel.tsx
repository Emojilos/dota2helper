import { useEffect, useState, type JSX } from 'react'
import type { LanePlan, LanePlanTimingPoint } from '@shared/schemas/lanePlan'
import type { DataResult } from '@shared/types/dataResult'

/**
 * Расширенная панель F5 режим 3 (TASK-037): показывает план на лайн для
 * текущей пары (свой герой × вражеский мидер), собранный LanePlanBuilder
 * (TASK-036) на финализацию пиков — билд, карточку матчапа, план таймингов
 * силы обеих сторон, личную статистику этой конкретной пары.
 *
 * «Тупая» проекция (INV1): вся сборка плана — в main (LanePlanBuilder +
 * startLanePlanBuilder), сюда приходит только готовый LanePlan через invoke
 * lanePlan:get (окно открылось уже после финализации) и push lanePlan:update
 * (план готов, пока окно уже открыто, ИЛИ null на новый матч). Открывается/
 * закрывается по F9 самим main (OverlayWindow.show/hide) — этот компонент не
 * знает о своей видимости, просто всегда держит актуальный план.
 */

const DATA_SOURCE_LABELS_RU: Record<DataResult<unknown>['source'], string> = {
  stratz: 'STRATZ',
  opendota: 'OpenDota',
  cache: 'кэш',
  none: 'нет данных'
}

function DataFreshnessNote({ result }: { result: DataResult<unknown> }): JSX.Element | null {
  if (result.status === 'no-data') {
    return <span className="text-[10px] text-red-400">нет данных ({result.reason})</span>
  }
  if (!result.stale) {
    return null
  }
  return <span className="text-[10px] text-amber-300">устаревший кэш ({DATA_SOURCE_LABELS_RU[result.source]})</span>
}

function formatPercent(winrate: number): string {
  return `${Math.round(winrate * 100)}%`
}

function BuildSection({ build }: { build: LanePlan['build'] }): JSX.Element {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">Билд</span>
        <DataFreshnessNote result={build} />
      </div>
      {build.status !== 'ok' || !build.data ? (
        <span className="text-[11px] text-slate-500">Нет данных по билду</span>
      ) : (
        <div className="flex flex-col gap-0.5 text-[11px] text-slate-300">
          <span>Стартовые предметы: {build.data.startingItems.join(', ')}</span>
          <span>Скиллбилд: {build.data.skillBuild.join(' → ')}</span>
          <span className="text-slate-500">
            Винрейт билда: {formatPercent(build.data.winrate)} (n={build.data.sampleSize})
          </span>
        </div>
      )}
    </section>
  )
}

function MatchupSection({ matchup }: { matchup: LanePlan['matchup'] }): JSX.Element {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">Карточка матчапа</span>
        <DataFreshnessNote result={matchup} />
      </div>
      {matchup.status !== 'ok' || !matchup.data ? (
        <span className="text-[11px] text-slate-500">Нет статистики пары</span>
      ) : (
        <span className="text-[11px] text-slate-300">
          Винрейт пары: {formatPercent(matchup.data.winrate)} (n={matchup.data.sampleSize})
        </span>
      )}
    </section>
  )
}

function KnowledgeSection({ plan }: { plan: LanePlan }): JSX.Element {
  return (
    <section className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">Советы</span>
      {!plan.hasKnowledge || !plan.knowledge ? (
        <span className="text-[11px] text-slate-500">
          Пара вне базы знаний — только статистический fallback (без текстов)
        </span>
      ) : (
        <div className="flex flex-col gap-1 text-[11px]">
          <div>
            <span className="text-emerald-300">Делай:</span>
            <ul className="list-inside list-disc text-slate-300">
              {plan.knowledge.doTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="text-red-300">Избегай:</span>
            <ul className="list-inside list-disc text-slate-300">
              {plan.knowledge.avoidTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

const TIMING_KIND_LABELS_RU: Record<LanePlanTimingPoint['kind'], string> = {
  power_spike: 'Пик силы',
  kill_window: 'Окно убийства',
  level6: 'Ожидаемый 6 уровень'
}

function TimingSection({ timingPlan }: { timingPlan: LanePlanTimingPoint[] }): JSX.Element {
  return (
    <section className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">План таймингов</span>
      {timingPlan.length === 0 ? (
        <span className="text-[11px] text-slate-500">—</span>
      ) : (
        <div className="flex flex-col gap-0.5">
          {timingPlan.map((point, index) => (
            <span key={index} className="text-[11px] text-slate-300">
              <span className={point.side === 'my' ? 'text-emerald-300' : 'text-red-300'}>
                {point.side === 'my' ? 'Ты' : 'Враг'}
              </span>{' '}
              — {TIMING_KIND_LABELS_RU[point.kind]}: {point.value}
              {point.kind === 'level6' ? ' сек' : ' ур.'}
              {point.note ? ` — ${point.note}` : ''}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function PersonalMatchupSection({ personalMatchup }: { personalMatchup: LanePlan['personalMatchup'] }): JSX.Element {
  return (
    <section className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">Личная статистика пары</span>
      {!personalMatchup || personalMatchup.sampleSize === 0 ? (
        <span className="text-[11px] text-slate-500">Нет личной истории по этой паре</span>
      ) : (
        <span className="text-[11px] text-slate-300">
          {personalMatchup.wins}W / {personalMatchup.losses}L (n={personalMatchup.sampleSize})
        </span>
      )}
    </section>
  )
}

function ExpandedPanel(): JSX.Element {
  const [plan, setPlan] = useState<LanePlan | null>(null)

  useEffect(() => {
    window.midmind.invoke('lanePlan:get', undefined).then(setPlan).catch(console.error)
    return window.midmind.on('lanePlan:update', setPlan)
  }, [])

  return (
    <div className="flex h-screen w-screen min-h-0 flex-col gap-2 overflow-y-auto rounded-lg border border-white/10 bg-[rgba(10,12,16,0.85)] p-3 text-slate-100">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">План на лайн</span>
        {plan && (
          <span className="text-slate-400">
            #{plan.myHeroId} vs #{plan.enemyHeroId}
          </span>
        )}
      </div>
      {!plan ? (
        <span className="text-[11px] text-slate-500">Дождитесь финализации пиков</span>
      ) : (
        <>
          <BuildSection build={plan.build} />
          <MatchupSection matchup={plan.matchup} />
          <KnowledgeSection plan={plan} />
          <TimingSection timingPlan={plan.timingPlan} />
          <PersonalMatchupSection personalMatchup={plan.personalMatchup} />
        </>
      )}
    </div>
  )
}

export default ExpandedPanel
