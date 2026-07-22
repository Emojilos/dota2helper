/**
 * Константы окна расширенной панели F5 режим 3 (TASK-037). Общие для main
 * (создание окна) и renderer (рендер) — тот же приём, что overlay/draftPanel.ts
 * и overlay/compactPanel.ts (INV1: renderer читает shared-константы, но не
 * main/engine напрямую).
 *
 * В отличие от компактной панели (TASK-014) окно НЕ перетаскивается и не
 * участвует в overlayPositions — открывается/закрывается по F9
 * (hotkeyExpandedPanel), а не позиционируется вручную пользователем. Дефолт —
 * центр экрана: показывается только ПОСЛЕ финализации пиков, когда панель
 * драфта (правый верхний угол, TASK-027) уже не нужна, поэтому пересечение
 * зон не критично. Точная калибровка под реальный HUD (не перекрывать
 * сетку/HUD Dota) ждёт Windows-машины владельца (см. CLAUDE.md §1), как и
 * остальные overlay-окна.
 *
 * INV2: модуль чист (только константы).
 */

export const EXPANDED_PANEL_WIDTH = 420
export const EXPANDED_PANEL_HEIGHT = 560
export const EXPANDED_PANEL_POSITION = { x: Math.round((1920 - EXPANDED_PANEL_WIDTH) / 2), y: 120 }
