/**
 * F6 Steam ID-привязка (TASK-030), renderer-часть. Тупая проекция (INV1):
 * подписывается на push steamId:detected (main решает, когда и что
 * обнаружено — см. main/steam/SteamIdDetector) и держит его как «предложение
 * подтвердить», не мутируя настройки сама. Подтверждение/ручной ввод идут
 * через settings:set (единственная мутация — settingsStore.setSettings).
 */
import { create } from 'zustand'

interface SteamIdDetectionState {
  detectedSteamId: string | null
  init: () => void
  dismiss: () => void
}

let initialized = false

export const useSteamIdDetectionStore = create<SteamIdDetectionState>((set) => ({
  detectedSteamId: null,
  init: () => {
    if (initialized) {
      return
    }
    initialized = true
    window.midmind.on('steamId:detected', ({ steamId }) => set({ detectedSteamId: steamId }))
  },
  dismiss: () => set({ detectedSteamId: null })
}))
