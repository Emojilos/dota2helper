import type { JSX } from 'react'
import { resolveFieldPath } from '@shared/gsi/resolveFieldPath'
import { formatKda, formatLhDn, formatGpmXpm } from '@shared/widgets/formatCompositeStatWidgets'
import { useGsiRawSnapshot } from './useGsiRawSnapshot'
import { WidgetRow } from './WidgetRow'

/**
 * Композитные виджеты пресета 'standardPanel' (F5, TASK-040): KDA/LH-DN/GPM-XPM
 * в одну строку каждый — дефолтный набор панели, когда она позиционирована
 * поверх родной панели статистики Dota (см. @shared/overlay/compactPanel,
 * STANDARD_PANEL_WIDGET_IDS). Читают те же сырые поля player.*, что и
 * RawFieldWidget (useGsiRawSnapshot + resolveFieldPath), форматирование —
 * чистые функции @shared/widgets/formatCompositeStatWidgets.
 */
export function KdaWidget(): JSX.Element {
  const snapshot = useGsiRawSnapshot()
  const value = snapshot
    ? formatKda(
        resolveFieldPath(snapshot, 'player.kills'),
        resolveFieldPath(snapshot, 'player.deaths'),
        resolveFieldPath(snapshot, 'player.assists')
      )
    : '—'
  return <WidgetRow label="KDA" value={value} />
}

export function LhDnWidget(): JSX.Element {
  const snapshot = useGsiRawSnapshot()
  const value = snapshot
    ? formatLhDn(resolveFieldPath(snapshot, 'player.last_hits'), resolveFieldPath(snapshot, 'player.denies'))
    : '—'
  return <WidgetRow label="LH/DN" value={value} />
}

export function GpmXpmWidget(): JSX.Element {
  const snapshot = useGsiRawSnapshot()
  const value = snapshot
    ? formatGpmXpm(resolveFieldPath(snapshot, 'player.gpm'), resolveFieldPath(snapshot, 'player.xpm'))
    : '—'
  return <WidgetRow label="GPM/XPM" value={value} />
}
