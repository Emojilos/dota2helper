/**
 * Константы компактной панели F5 режим 1 (TASK-014). Общие для main (создание
 * окна, расчёт размера, ключ в overlayPositions) и renderer (рендер дефолтного
 * набора виджетов) — живут в shared, чтобы обе стороны не рассинхронизировались
 * по магическим строкам/числам (INV1: renderer не тянет main/engine напрямую,
 * но shared-константы читать можно).
 *
 * INV2: модуль чист (только константы, без electron/react).
 */

/** Ключ компактной панели в AppSettings.overlayPositions. */
export const COMPACT_PANEL_WINDOW_ID = 'compactPanel'

/**
 * Дефолтный набор виджетов (раздел F5 PRD): таймер ближайшего события, фаза
 * игры, индикатор ближайшей руны. Пока не настраиваемый — полный конструктор
 * по каталогу GSI-полей появится в TASK-016/017.
 */
export const DEFAULT_COMPACT_PANEL_WIDGET_IDS = ['nextEvent', 'phase', 'nextRune'] as const
export type CompactPanelWidgetId = (typeof DEFAULT_COMPACT_PANEL_WIDGET_IDS)[number]

/**
 * Дефолтный набор виджетов пресета 'standardPanel' (TASK-040): повторяет
 * родную панель статистики Dota (KDA / LH-DN / GPM-XPM), которую панель
 * визуально накрывает в этом пресете. Это обычные именованные пресеты
 * конструктора (@shared/widgets/widgetId, WIDGET_PRESET_IDS) — рендерятся
 * тем же renderWidget, что и extraWidgetIds, а не отдельным хардкодом, в
 * отличие от DEFAULT_COMPACT_PANEL_WIDGET_IDS (те завязаны на push-канал
 * compactPanel:timers, а не на generic GSI-снапшот).
 */
export const STANDARD_PANEL_WIDGET_IDS = ['kda', 'lh-dn', 'gpm-xpm'] as const

/** Дефолтный блок виджетов панели по пресету (TASK-040) — оба блока фиксированной длины 3, см. compactPanelWidgetCount. */
export const COMPACT_PANEL_PRESET_DEFAULT_WIDGET_IDS: Record<'default' | 'standardPanel', readonly string[]> = {
  default: DEFAULT_COMPACT_PANEL_WIDGET_IDS,
  standardPanel: STANDARD_PANEL_WIDGET_IDS
}

/**
 * Дефолтная позиция — верхний левый угол ниже топ-бара счёта (раздел 6 PRD:
 * зоны, свободные от HUD Dota). Используется, пока пользователь ни разу не
 * перетаскивал панель (AppSettings.overlayPositions[COMPACT_PANEL_WINDOW_ID]
 * отсутствует). y=160, а не сразу под топ-баром, — чтобы дефолтно не
 * перекрывать базовое overlay-окно TASK-008 (placeholder-плашка при x:24,
 * y:24, высота 120).
 */
export const COMPACT_PANEL_DEFAULT_POSITION = { x: 24, y: 160 }

/** Ширина фиксирована; высота растёт с числом виджетов (тема — раздел 6 PRD). */
export const COMPACT_PANEL_WIDTH = 220
const COMPACT_PANEL_HEADER_HEIGHT = 20
const COMPACT_PANEL_WIDGET_HEIGHT = 34
const COMPACT_PANEL_PADDING = 16

/** Высота окна как функция числа виджетов (TASK-014: «размер адаптируется к набору виджетов»). */
export function compactPanelHeight(widgetCount: number): number {
  return COMPACT_PANEL_HEADER_HEIGHT + COMPACT_PANEL_WIDGET_HEIGHT * widgetCount + COMPACT_PANEL_PADDING
}
