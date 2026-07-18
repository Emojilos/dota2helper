/**
 * M6 смена патча (TASK-047), renderer-часть. Тупая проекция (INV1):
 * подписывается на push patch:changed (main решает, когда патч реально
 * сменился — см. main/patch/PatchWatcher) и держит его как баннер "данные
 * обновляются" до явного dismiss пользователем. Ничего не мутирует сама.
 */
import { create } from 'zustand'

interface PatchState {
  changedToPatch: string | null
  init: () => void
  dismiss: () => void
}

let initialized = false

export const usePatchStore = create<PatchState>((set) => ({
  changedToPatch: null,
  init: () => {
    if (initialized) {
      return
    }
    initialized = true
    window.midmind.on('patch:changed', ({ patch }) => set({ changedToPatch: patch }))
  },
  dismiss: () => set({ changedToPatch: null })
}))
