/**
 * Константы окна всплывающих уведомлений F5 режим 2 (TASK-015). Общие для
 * main (создание окна) и renderer (авто-скрытие карточки, раз main не шлёт
 * отдельный сигнал dismiss — см. AdviceScheduler) — живут в shared, чтобы обе
 * стороны не расходились по магическим числам (INV1: renderer читает
 * shared-константы напрямую, но не main/engine).
 *
 * INV2: модуль чист (только константы, без electron/react).
 */

/** Ключ окна уведомлений (не персистится в overlayPositions — окно не перетаскивается, зона фиксирована разделом 6 PRD). */
export const NOTIFICATIONS_WINDOW_ID = 'notifications'

/**
 * Референсное разрешение, под которое калибрована зона (раздел 6 PRD:
 * «уведомления — над панелью героя со смещением вверх», не перекрывая
 * миникарту/HUD). Точная калибровка под произвольное разрешение — задача
 * пресетов позиционирования (TASK-040); здесь фиксированная зона для 1920x1080
 * достаточна для MVP (сам режим — click-through overlay без перетаскивания).
 */
export const NOTIFICATIONS_REFERENCE_RESOLUTION = { width: 1920, height: 1080 }

/** Ширина зоны уведомлений — под «крупный тайминг + мелкий контекст», максимум 2 карточки одновременно (раздел 6 PRD). */
export const NOTIFICATIONS_WIDTH = 480
/** Высота зоны — 2 карточки (auto-dismiss ≤2 на экране, TASK-013) плюс зазор между ними. */
export const NOTIFICATIONS_HEIGHT = 170

/**
 * Позиция окна: по центру экрана горизонтально, со смещением вверх от панели
 * героя (низ по центру, раздел 6 PRD). Панель героя в 1080p занимает нижние
 * ~130px экрана — зона уведомлений заканчивается на y=780, оставляя зазор.
 */
export const NOTIFICATIONS_POSITION = {
  x: Math.round((NOTIFICATIONS_REFERENCE_RESOLUTION.width - NOTIFICATIONS_WIDTH) / 2),
  y: NOTIFICATIONS_REFERENCE_RESOLUTION.height - 340
}

/**
 * Сколько карточка держится на экране в renderer (визуально, TASK-015).
 * AdviceScheduler (TASK-013, main) — источник правды о видимости и сам решает
 * реальный момент dismiss случайно в диапазоне 5000–8000мс; renderer не
 * получает точное значение (нет отдельного канала dismiss) и анимирует
 * исчезновение к СЕРЕДИНЕ того же диапазона — приближение, а не точная
 * синхронизация (см. комментарий AdviceScheduler.show).
 */
export const ADVICE_VISIBLE_MS = 6500

/** Максимум карточек одновременно в renderer — зеркалит AdviceScheduler.maxVisible (TASK-013), на случай гонки push/dismiss. */
export const NOTIFICATIONS_MAX_VISIBLE = 2
