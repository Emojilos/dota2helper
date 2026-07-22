/**
 * invoke-канал benchmarks:get (F5, TASK-039): отдаёт актуальный
 * content/benchmarks.json (TASK-038) бенчмарк-виджетам (LH/networth/XP,
 * live-сравнение с эталонными кривыми). Тонкий wrapper над ConfigHandle — та
 * же схема, что registerGsiFieldCatalogHandlers (TASK-016): last-good значение
 * уже поддерживает ConfigLoader (TASK-011), здесь только прокидка в IPC. Если
 * конфиг ещё ни разу не загрузился валидно, отдаёт пустой список вместо
 * падения invoke.
 *
 * INV1: живёт в main.
 */
import { ipcMain } from 'electron'
import type { BenchmarksConfig } from '@shared/schemas/benchmarks'
import type { ConfigHandle } from '../config'

const EMPTY_BENCHMARKS: BenchmarksConfig = []

/** Регистрирует ipcMain.handle для benchmarks:get. Идемпотентно. */
export function registerBenchmarksHandlers(handle: ConfigHandle<BenchmarksConfig>): void {
  ipcMain.handle('benchmarks:get', (): BenchmarksConfig => {
    return handle.get() ?? EMPTY_BENCHMARKS
  })
}
