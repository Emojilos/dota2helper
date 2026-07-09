import { contextBridge } from 'electron'

/**
 * Заготовка типизированного моста renderer <-> main.
 * Реальные каналы IPC (window.midmind) наполняются в TASK-007 по IpcContract.
 */
const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('midmind', api)
  } catch (error) {
    console.error(error)
  }
}
