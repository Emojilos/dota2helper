import type { JSX } from 'react'
import { resolveFieldPath } from '@shared/gsi/resolveFieldPath'
import { formatFieldValue } from '@shared/gsi/formatFieldValue'
import type { GsiFieldCatalogEntry } from '@shared/schemas/gsiFieldCatalog'
import { useGsiRawSnapshot } from './useGsiRawSnapshot'
import { WidgetRow } from './WidgetRow'

/**
 * Дженерик-рендерер сырого поля каталога (F5, TASK-016): читает значение по
 * entry.fieldPath из последнего gsiRaw:update и форматирует его по entry.format
 * (formatFieldValue) — не знает НИЧЕГО о конкретных полях (INV4: новое поле
 * каталога рендерится этим же компонентом без правки кода).
 */
export function RawFieldWidget({ entry }: { entry: GsiFieldCatalogEntry }): JSX.Element {
  const snapshot = useGsiRawSnapshot()
  const value = snapshot ? resolveFieldPath(snapshot, entry.fieldPath) : undefined
  return <WidgetRow label={entry.labelRu} value={formatFieldValue(value, entry.format)} />
}
