/**
 * Типы экспонируемого renderer-у API. Расширяется в TASK-007 по IpcContract.
 */
export interface MidmindApi {}

declare global {
  interface Window {
    midmind: MidmindApi
  }
}
