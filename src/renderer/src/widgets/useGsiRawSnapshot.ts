import { useEffect, useState } from 'react'
import type { WidgetGsiSnapshot } from '@shared/schemas/gsiRawSnapshot'

/**
 * Подписка на gsiRaw:update (F5, TASK-016) — санитизированный срез сырого GSI-
 * пакета для дженерик-рендерера сырых полей каталога. Тупая проекция (INV1):
 * main уже прислал санитизированный и коалесцированный (≤2 Гц) срез.
 */
export function useGsiRawSnapshot(): WidgetGsiSnapshot | null {
  const [snapshot, setSnapshot] = useState<WidgetGsiSnapshot | null>(null)

  useEffect(() => {
    return window.midmind.on('gsiRaw:update', setSnapshot)
  }, [])

  return snapshot
}
