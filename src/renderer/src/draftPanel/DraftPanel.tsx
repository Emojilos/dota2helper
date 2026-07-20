import { useEffect, useState, type JSX } from 'react'
import type { DraftContext, DraftManualAction } from '@shared/schemas/draft'
import { EMPTY_DRAFT_CONTEXT } from '@shared/schemas/draft'

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

function DraftPanel(): JSX.Element {
  const [context, setContext] = useState<DraftContext>(EMPTY_DRAFT_CONTEXT)

  useEffect(() => {
    window.midmind.invoke('draftContext:get', undefined).then(setContext).catch(console.error)
    const unsubscribe = window.midmind.on('draftContext:update', setContext)
    return unsubscribe
  }, [])

  function dispatch(action: DraftManualAction): void {
    window.midmind.invoke('draftContext:applyManualAction', action).then(setContext).catch(console.error)
  }

  return (
    <div className="flex h-screen w-screen flex-col gap-2 rounded-lg border border-white/10 bg-[rgba(10,12,16,0.85)] p-3 text-slate-100">
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
    </div>
  )
}

export default DraftPanel
