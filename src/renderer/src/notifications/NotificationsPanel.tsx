import { useEffect, useRef, useState, type JSX } from 'react'
import type { Advice, AdviceSeverity } from '@shared/schemas/advice'
import { ADVICE_VISIBLE_MS, NOTIFICATIONS_MAX_VISIBLE } from '@shared/overlay/notifications'

/**
 * Окно всплывающих уведомлений F5 режим 2 (TASK-015): всегда click-through
 * (клики уходят в игру — окно ни разу не переключается в интерактивный режим,
 * в отличие от компактной панели), зона над панелью героя со смещением вверх
 * (раздел 6 PRD, координаты — src/shared/overlay/notifications.ts).
 *
 * «Тупая» проекция (INV1): очередь/лимит «≤2 на экране»/cooldown уже решены в
 * main (AdviceScheduler, TASK-013) — сюда приходит только то, что реально
 * нужно показать. Но САМ момент dismiss main не транслирует отдельным каналом
 * (см. комментарий AdviceScheduler.show) — renderer держит свою карточку
 * ADVICE_VISIBLE_MS (приближение к середине диапазона 5-8с) и убирает её сам,
 * анимируя исчезновение (fade+slide ≤200мс, раздел 6 PRD).
 */

const SEVERITY_STYLES: Record<AdviceSeverity, { accent: string; label: string }> = {
  opportunity: { accent: '#4caf7d', label: 'Возможность' },
  timing: { accent: '#e6b74a', label: 'Тайминг' },
  danger: { accent: '#e05252', label: 'Опасность' }
}

interface VisibleAdvice extends Advice {
  entering: boolean
}

function AdviceCard({ advice }: { advice: VisibleAdvice }): JSX.Element {
  const style = SEVERITY_STYLES[advice.severity]
  return (
    <div
      className="rounded-lg border-l-4 bg-[rgba(10,12,16,0.85)] px-4 py-2 text-slate-100 shadow-lg transition-all duration-200 ease-out"
      style={{
        borderLeftColor: style.accent,
        opacity: advice.entering ? 0 : 1,
        transform: advice.entering ? 'translateY(8px)' : 'translateY(0)'
      }}
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {style.label}
        {advice.estimated ? ' · вероятно' : ''}
      </div>
      <div className="text-base font-semibold leading-snug">{advice.message}</div>
    </div>
  )
}

function NotificationsPanel(): JSX.Element {
  const [items, setItems] = useState<VisibleAdvice[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const activeTimers = timers.current
    const unsubscribe = window.midmind.on('advice:push', (advice) => {
      setItems((current) => [...current.filter((item) => item.id !== advice.id), { ...advice, entering: true }])

      // Следующий тик — снять entering, чтобы сработал CSS-переход появления.
      requestAnimationFrame(() => {
        setItems((current) => current.map((item) => (item.id === advice.id ? { ...item, entering: false } : item)))
      })

      const timer = setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== advice.id))
        activeTimers.delete(advice.id)
      }, ADVICE_VISIBLE_MS)
      activeTimers.set(advice.id, timer)
    })

    return () => {
      unsubscribe()
      for (const timer of activeTimers.values()) {
        clearTimeout(timer)
      }
      activeTimers.clear()
    }
  }, [])

  const visible = items.slice(-NOTIFICATIONS_MAX_VISIBLE)

  return (
    <div className="flex h-screen w-screen flex-col justify-end gap-2 p-2">
      {visible.map((advice) => (
        <AdviceCard key={advice.id} advice={advice} />
      ))}
    </div>
  )
}

export default NotificationsPanel
