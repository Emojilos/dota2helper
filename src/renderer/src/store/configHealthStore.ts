/**
 * M6 UX редактирования конфигов (TASK-048), renderer-часть. Тупая проекция
 * (INV1): подписывается на push config:reloaded (main — ConfigLoader,
 * TASK-011/048) и держит два независимых состояния:
 *  - toast — последнее событие перезагрузки, авто-скрывается через
 *    TOAST_AUTO_DISMISS_MS (визуальное подтверждение hot-reload, тот же приём
 *    авто-исчезновения, что AdviceScheduler для уведомлений, TASK-013);
 *  - invalidConfigs — имена конфигов, которые ПРЯМО СЕЙЧАС работают на
 *    last-good (не авто-скрывается — держится, пока конфиг не станет валиден
 *    повторным reload; отражает реальное состояние, а не разовое событие).
 */
import { create } from 'zustand'
import type { ConfigReloadedPayload } from '@shared/types/ipc'

const TOAST_AUTO_DISMISS_MS = 5000

interface ConfigHealthState {
  toast: ConfigReloadedPayload | null
  invalidConfigs: Record<string, string | undefined>
  init: () => void
  dismissToast: () => void
}

let initialized = false
let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useConfigHealthStore = create<ConfigHealthState>((set, get) => ({
  toast: null,
  invalidConfigs: {},
  init: () => {
    if (initialized) {
      return
    }
    initialized = true
    window.midmind.on('config:reloaded', (payload) => {
      set((state) => {
        const invalidConfigs = { ...state.invalidConfigs }
        if (payload.status === 'ok') {
          delete invalidConfigs[payload.name]
        } else {
          invalidConfigs[payload.name] = payload.reason
        }
        return { toast: payload, invalidConfigs }
      })
      if (toastTimer) {
        clearTimeout(toastTimer)
      }
      toastTimer = setTimeout(() => {
        toastTimer = null
        get().dismissToast()
      }, TOAST_AUTO_DISMISS_MS)
    })
  },
  dismissToast: () => set({ toast: null })
}))
