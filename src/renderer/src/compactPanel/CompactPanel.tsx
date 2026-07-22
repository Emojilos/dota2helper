import { useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react'
import type { GameState } from '@shared/schemas/gameState'
import type { CompactPanelTimersPayload } from '@shared/types/ipc'
import {
  DEFAULT_COMPACT_PANEL_WIDGET_IDS,
  STANDARD_PANEL_WIDGET_IDS,
  type CompactPanelWidgetId
} from '@shared/overlay/compactPanel'
import { rawFieldWidgetId } from '@shared/widgets/widgetId'
import { mergeWidgetsConfig, knownWidgetIds } from '@shared/widgets/widgetsConfigOps'
import { useSettingsStore } from '../store/settingsStore'
import { useGsiFieldCatalog } from '../widgets/useGsiFieldCatalog'
import { renderWidget } from '../widgets/WidgetRegistry'

/**
 * Компактная панель F5 режим 1 (TASK-014): постоянный оверлей в углу экрана с
 * дефолтным набором виджетов (раздел F5 PRD) — таймер ближайшего события, фаза
 * игры, индикатор ближайшей руны. «Тупая» проекция (INV1): весь расчёт
 * (nextEvent/nextRune) уже сделан в main (engine/timings.selectCompactPanelTimers,
 * push-канал compactPanel:timers), здесь только форматирование под display.
 *
 * Дефолтные 3 виджета зависят от пресета (AppSettings.compactPanelPreset,
 * TASK-040): 'default' — таймер/фаза/руна (хардкод ниже, завязан на push-канал
 * compactPanel:timers, не входит в конструктор TASK-016/017); 'standardPanel' —
 * KDA/LH-DN/GPM-XPM (обычные именованные пресеты конструктора,
 * STANDARD_PANEL_WIDGET_IDS, рендерятся через тот же renderWidget, что и
 * extraWidgetIds). ПОСЛЕ дефолтного блока панель дополнительно рендерит
 * виджеты, включённые пользователем в конструкторе (TASK-017,
 * AppSettings.widgetsConfig) — через WidgetRegistry, тот же реестр, что
 * показывает превью-галерея (WidgetGallery) и меню конструктора
 * (WidgetConstructor) в окне настроек. mergeWidgetsConfig отбрасывает id,
 * которых больше нет в каталоге (см. widgetsConfigOps) — панель никогда не
 * пытается отрендерить виджет несуществующего поля.
 *
 * Перетаскивание — нативное, через -webkit-app-region:drag на всём контейнере
 * (внутри нет кликабельных элементов, конфликтовать не с чем); работает только
 * когда main.ts переключил окно в интерактивный режим (F8), иначе оно
 * click-through и мышь до контента не доходит вовсе.
 */

const GAME_PHASE_LABELS_RU: Record<string, string> = {
  DOTA_GAMERULES_STATE_INIT: 'Инициализация',
  DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD: 'Ожидание игроков',
  DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD: 'Загрузка карты',
  DOTA_GAMERULES_STATE_HERO_SELECTION: 'Пик героев',
  DOTA_GAMERULES_STATE_STRATEGY_TIME: 'Стратегия',
  DOTA_GAMERULES_STATE_TEAM_SHOWCASE: 'Показ команд',
  DOTA_GAMERULES_STATE_PRE_GAME: 'Перед стартом',
  DOTA_GAMERULES_STATE_GAME_IN_PROGRESS: 'Матч идёт',
  DOTA_GAMERULES_STATE_POST_GAME: 'Матч завершён'
}

function gamePhaseLabel(gameState: string | undefined): string {
  if (!gameState) {
    return '—'
  }
  return GAME_PHASE_LABELS_RU[gameState] ?? gameState
}

function formatCountdown(secondsUntil: number): string {
  const totalSec = Math.max(0, Math.round(secondsUntil))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Пробрасывается стандартной проверкой типов React как обычный CSS-объект. */
const dragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties

function Widget({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
      <span className="truncate text-slate-400">{label}</span>
      <span className="shrink-0 font-medium text-slate-100">{value}</span>
    </div>
  )
}

function CompactPanel(): JSX.Element {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [timers, setTimers] = useState<CompactPanelTimersPayload>({ nextEvent: null, nextRune: null })
  const settings = useSettingsStore((state) => state.settings)
  const initSettings = useSettingsStore((state) => state.init)
  const catalog = useGsiFieldCatalog()

  useEffect(() => {
    initSettings()
  }, [initSettings])

  useEffect(() => {
    const unsubscribeGameState = window.midmind.on('gameState:update', setGameState)
    const unsubscribeTimers = window.midmind.on('compactPanel:timers', setTimers)
    return () => {
      unsubscribeGameState()
      unsubscribeTimers()
    }
  }, [])

  const knownIds = useMemo(
    () => knownWidgetIds(catalog.fields.map((field) => rawFieldWidgetId(field.fieldPath))),
    [catalog.fields]
  )
  const extraWidgetIds = useMemo(
    () => mergeWidgetsConfig(settings?.widgetsConfig ?? [], knownIds).filter((entry) => entry.enabled),
    [settings, knownIds]
  )

  const widgetContent: Record<CompactPanelWidgetId, JSX.Element> = {
    nextEvent: (
      <Widget
        key="nextEvent"
        label={timers.nextEvent?.labelRu ?? 'Ближайшее событие'}
        value={timers.nextEvent ? formatCountdown(timers.nextEvent.secondsUntil) : '—'}
      />
    ),
    phase: <Widget key="phase" label="Фаза" value={gamePhaseLabel(gameState?.map?.gameState)} />,
    nextRune: (
      <Widget
        key="nextRune"
        label={timers.nextRune?.labelRu ?? 'Ближайшая руна'}
        value={timers.nextRune ? formatCountdown(timers.nextRune.secondsUntil) : '—'}
      />
    )
  }

  const preset = settings?.compactPanelPreset ?? 'default'
  const defaultBlock =
    preset === 'standardPanel'
      ? STANDARD_PANEL_WIDGET_IDS.map((id) => renderWidget(id, catalog.fields))
      : DEFAULT_COMPACT_PANEL_WIDGET_IDS.map((id) => widgetContent[id])

  return (
    <div
      style={dragRegionStyle}
      className="h-screen w-screen overflow-hidden divide-y divide-white/5 rounded-lg border border-white/10 bg-[rgba(10,12,16,0.85)] text-slate-100"
    >
      {defaultBlock}
      {extraWidgetIds.map((entry) => renderWidget(entry.id, catalog.fields))}
    </div>
  )
}

export default CompactPanel
