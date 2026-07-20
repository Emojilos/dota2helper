import { useEffect, useState, type JSX } from 'react'
import type { DraftContext, DraftManualAction } from '@shared/schemas/draft'
import { EMPTY_DRAFT_CONTEXT } from '@shared/schemas/draft'
import type { DraftCandidate } from '@shared/schemas/advice'
import type { DraftRankingsPayload } from '@shared/types/ipc'
import type { DraftRankingMode } from '@shared/schemas/settings'
import { useSettingsStore } from '../store/settingsStore'

/**
 * Панель драфта F1 (TASK-027): показывает автоопределённую стадию драфта и
 * собственного героя (map.gameState/hero.id из GSI) и даёт ручной ввод пиков
 * врага/союзников + роль вражеского мидера — GSI НЕ отдаёт пики команд игроку
 * ни в одной из трёх захваченных сессий (docs/gsi-fields.md, TASK-009),
 * поэтому это единственный источник для DraftContext.enemyHeroIds/
 * allyHeroIds/enemyMidHeroId.
 *
 * «Тупая» проекция (INV1): вся логика стадии/reducer ручного ввода — в
 * engine/draft (main), сюда приходит только готовый DraftContext
 * (draftContext:get на монтирование + draftContext:update на каждое реальное
 * изменение) и уходят действия (draftContext:applyManualAction).
 *
 * В отличие от компактной панели/уведомлений (TASK-014/015) окно интерактивно
 * ВСЕГДА (нужны клики по кнопкам "+"/"−"), а не только в режиме F8 — ввод
 * пиков происходит на экране выбора героя, где не нужно кликать по игровому
 * полю. Ввод героев — по числовому ID (hero.id из GSI/OpenDota/STRATZ);
 * человекочитаемый список имён — TASK-016 (каталог GSI-полей уже покрывает
 * своего героя, но не готовый справочник ID→имя для ВСЕХ героев).
 *
 * TASK-029 добавляет список кандидатов на пик: подписка на push-канал
 * draft:update (DraftService.computeRankings, TASK-028 — оба ранжирования,
 * Meta и Personal, приходят вместе за один пуш) и переключатель режима,
 * который читает/пишет ЕДИНЫЙ источник правды — AppSettings.draftRankingMode
 * (settingsStore, TASK-018) — а не локальный React-state, поэтому режим
 * переживает перезапуск панели и остаётся синхронным с остальными окнами.
 * Переключение мгновенно: оба массива уже посчитаны в main, выбор режима —
 * чистый рендер без похода за данными. dataSource/dataStale — агрегированная
 * метка давности (INV5) по всем кандидатам этого пуша.
 */

const STAGE_LABELS_RU: Record<DraftContext['stage'], string> = {
  idle: 'Ожидание матча',
  picking: 'Идёт пик героев',
  finalized: 'Пики завершены'
}

function HeroChip({ heroId, isMid, onRemove, onToggleMid }: {
  heroId: number
  isMid?: boolean
  onRemove: () => void
  onToggleMid?: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs">
      <span className={isMid ? 'font-semibold text-amber-300' : 'text-slate-200'}>#{heroId}</span>
      {onToggleMid && (
        <button
          type="button"
          onClick={onToggleMid}
          className="text-[10px] text-slate-400 hover:text-amber-300"
          title="Отметить мидером"
        >
          {isMid ? '★' : '☆'}
        </button>
      )}
      <button type="button" onClick={onRemove} className="text-slate-500 hover:text-red-400">
        ×
      </button>
    </div>
  )
}

function HeroIdForm({ onSubmit }: { onSubmit: (heroId: number) => void }): JSX.Element {
  const [value, setValue] = useState('')
  return (
    <form
      className="flex gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        const heroId = Number.parseInt(value, 10)
        if (Number.isInteger(heroId) && heroId > 0) {
          onSubmit(heroId)
          setValue('')
        }
      }}
    >
      <input
        type="number"
        min={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="ID героя"
        className="w-20 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-xs text-slate-100 outline-none focus:border-amber-300"
      />
      <button type="submit" className="rounded bg-white/10 px-2 text-xs text-slate-100 hover:bg-white/20">
        +
      </button>
    </form>
  )
}

function formatPercent(winrate: number): string {
  return `${Math.round(winrate * 100)}%`
}

const DATA_SOURCE_LABELS_RU: Record<DraftRankingsPayload['dataSource'], string> = {
  stratz: 'STRATZ',
  opendota: 'OpenDota',
  cache: 'кэш',
  mixed: 'смешанный источник',
  none: 'нет данных'
}

function DataFreshnessBadge({ rankings }: { rankings: DraftRankingsPayload }): JSX.Element | null {
  if (rankings.dataSource === 'none') {
    return <span className="text-[10px] text-red-400">нет данных по матчапам</span>
  }
  if (!rankings.dataStale) {
    return null
  }
  return (
    <span className="text-[10px] text-amber-300">
      устаревший кэш ({DATA_SOURCE_LABELS_RU[rankings.dataSource]})
    </span>
  )
}

function BreakdownList({ label, entries }: { label: string; entries: DraftCandidate['vsBreakdown'] }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      {entries.length === 0 ? (
        <span className="text-[11px] text-slate-500">—</span>
      ) : (
        entries.map((entry) => (
          <span key={entry.heroId} className="text-[11px] text-slate-300">
            #{entry.heroId}: {formatPercent(entry.winrate)}
            {entry.sampleSize > 0 ? ` (n=${entry.sampleSize})` : ' (нет данных)'}
          </span>
        ))
      )}
    </div>
  )
}

function CandidateRow({
  rank,
  candidate,
  expanded,
  onToggle
}: {
  rank: number
  candidate: DraftCandidate
  expanded: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <div className="rounded border border-white/10 bg-white/5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs hover:bg-white/5"
      >
        <span className="text-slate-400">{rank}.</span>
        <span className="flex-1 truncate text-slate-100">{candidate.heroName}</span>
        <span className="font-semibold text-emerald-300">{formatPercent(candidate.score)}</span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-1.5 border-t border-white/10 px-2 py-1.5">
          <BreakdownList label="Counter (vs)" entries={candidate.vsBreakdown} />
          <BreakdownList label="Synergy (with)" entries={candidate.withBreakdown} />
          <span className="text-[11px] text-slate-400">
            Личный винрейт: {candidate.personalWinrate === null ? '— (Steam ID не привязан)' : formatPercent(candidate.personalWinrate)}
          </span>
          <span className="text-[10px] text-slate-500">Всего наблюдений: {candidate.sampleSize}</span>
        </div>
      )}
    </div>
  )
}

function DraftCandidateList({ rankings }: { rankings: DraftRankingsPayload | null }): JSX.Element {
  const settings = useSettingsStore((state) => state.settings)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const [expandedHeroId, setExpandedHeroId] = useState<number | null>(null)

  useEffect(() => {
    useSettingsStore.getState().init()
  }, [])

  const mode: DraftRankingMode = settings?.draftRankingMode ?? 'meta'
  const candidates = rankings ? (mode === 'meta' ? rankings.meta : rankings.personal) : []

  function setMode(next: DraftRankingMode): void {
    void setSettings({ draftRankingMode: next })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => setMode('meta')}
            className={`rounded px-2 py-0.5 ${mode === 'meta' ? 'bg-amber-300/20 text-amber-200' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Meta
          </button>
          <button
            type="button"
            onClick={() => setMode('personal')}
            className={`rounded px-2 py-0.5 ${mode === 'personal' ? 'bg-amber-300/20 text-amber-200' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Personal
          </button>
        </div>
        {rankings && <DataFreshnessBadge rankings={rankings} />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {candidates.length === 0 ? (
          <span className="text-[11px] text-slate-500">Кандидаты появятся во время пика</span>
        ) : (
          candidates.map((candidate, index) => (
            <CandidateRow
              key={candidate.heroId}
              rank={index + 1}
              candidate={candidate}
              expanded={expandedHeroId === candidate.heroId}
              onToggle={() => setExpandedHeroId(expandedHeroId === candidate.heroId ? null : candidate.heroId)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function DraftPanel(): JSX.Element {
  const [context, setContext] = useState<DraftContext>(EMPTY_DRAFT_CONTEXT)
  const [rankings, setRankings] = useState<DraftRankingsPayload | null>(null)

  useEffect(() => {
    window.midmind.invoke('draftContext:get', undefined).then(setContext).catch(console.error)
    const unsubscribeContext = window.midmind.on('draftContext:update', setContext)
    const unsubscribeRankings = window.midmind.on('draft:update', setRankings)
    return () => {
      unsubscribeContext()
      unsubscribeRankings()
    }
  }, [])

  function dispatch(action: DraftManualAction): void {
    window.midmind.invoke('draftContext:applyManualAction', action).then(setContext).catch(console.error)
  }

  return (
    <div className="flex h-screen w-screen min-h-0 flex-col gap-2 rounded-lg border border-white/10 bg-[rgba(10,12,16,0.85)] p-3 text-slate-100">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">{STAGE_LABELS_RU[context.stage]}</span>
        <span className="text-slate-400">Ты: {context.ownHeroId ?? '—'}</span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">Союзники</div>
        <div className="flex flex-wrap gap-1">
          {context.allyHeroIds.map((heroId) => (
            <HeroChip key={heroId} heroId={heroId} onRemove={() => dispatch({ type: 'removeAlly', heroId })} />
          ))}
        </div>
        <HeroIdForm onSubmit={(heroId) => dispatch({ type: 'addAlly', heroId })} />
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">Враги (★ — мидер)</div>
        <div className="flex flex-wrap gap-1">
          {context.enemyHeroIds.map((heroId) => (
            <HeroChip
              key={heroId}
              heroId={heroId}
              isMid={context.enemyMidHeroId === heroId}
              onRemove={() => dispatch({ type: 'removeEnemy', heroId })}
              onToggleMid={() =>
                dispatch({ type: 'setEnemyMid', heroId: context.enemyMidHeroId === heroId ? null : heroId })
              }
            />
          ))}
        </div>
        <HeroIdForm onSubmit={(heroId) => dispatch({ type: 'addEnemy', heroId })} />
      </div>

      <DraftCandidateList rankings={rankings} />
    </div>
  )
}

export default DraftPanel
