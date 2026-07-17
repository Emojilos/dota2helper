/**
 * Типы экспонируемого renderer-у API (TASK-007). window.midmind реализует
 * MidMindBridge из IpcContract (@shared/types/ipc) — единственный источник
 * правды для набора каналов и их payload'ов.
 */
import type { MidMindBridge } from '@shared/types/ipc'

declare global {
  interface Window {
    midmind: MidMindBridge
  }
}
