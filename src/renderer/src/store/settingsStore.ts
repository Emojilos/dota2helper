/**
 * Zustand-проекция настроек (TASK-018). Renderer — тупая проекция (INV1):
 * никогда не читает UserProfileRepository напрямую, только window.midmind.
 *
 * init() один раз запрашивает settings:get и подписывается на push-канал
 * settings:update — main рассылает его после ЛЮБОЙ мутации (renderer-
 * инициированной через settings:set ИЛИ main-инициированной, напр. хоткей
 * тихого режима), так что стор остаётся в реальном времени синхронным с
 * main вне зависимости от того, кто изменил настройки.
 */
import { create } from 'zustand'
import type { AppSettings } from '@shared/schemas/settings'

interface SettingsState {
  settings: AppSettings | null
  init: () => void
  setSettings: (patch: Partial<AppSettings>) => Promise<void>
}

let initialized = false

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  init: () => {
    if (initialized) {
      return
    }
    initialized = true
    window.midmind
      .invoke('settings:get', undefined)
      .then((settings) => set({ settings }))
      .catch(console.error)
    window.midmind.on('settings:update', (settings) => set({ settings }))
  },
  setSettings: async (patch) => {
    const settings = await window.midmind.invoke('settings:set', patch)
    set({ settings })
  }
}))
