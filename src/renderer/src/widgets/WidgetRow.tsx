import type { JSX } from 'react'

/**
 * Строка "лейбл — значение" (F5, TASK-016) — тот же визуальный примитив, что
 * Widget в CompactPanel.tsx (TASK-014), вынесен сюда, т.к. теперь его использует
 * и дженерик-рендерер сырых полей, и именованные пресеты.
 */
export function WidgetRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
      <span className="truncate text-slate-400">{label}</span>
      <span className="shrink-0 font-medium text-slate-100">{value}</span>
    </div>
  )
}
