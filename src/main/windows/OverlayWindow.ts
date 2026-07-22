/**
 * Базовое overlay-окно (TASK-008): прозрачное, безрамочное, always-on-top
 * поверх игры, по умолчанию click-through (клики проходят в Dota), не
 * ворует фокус при показе. Дженерик-обёртка над BrowserWindow — конкретный
 * контент (компактная панель/уведомления/расширенная панель) добавят
 * TASK-014/015/037, создавая свои инстансы этого класса с разными
 * route/размерами; здесь только механика окна.
 *
 * setInteractive(true) включает клики по окну (напр. чтобы перетащить
 * панель) — переключается глобальным хоткеем через HotkeyManager
 * (роль 'clickThrough', см. main/hotkeys). Состояние interactive
 * эфемерно, не персистится (дефолт всегда click-through).
 *
 * macOS: hasShadow:false + backgroundColor:'#00000000' обязательны для
 * прозрачности без артефактов; setVisibleOnAllWorkspaces с
 * visibleOnFullScreen:true нужен, чтобы оверлей не исчезал при
 * переключении Space/полноэкранной Dota; showInactive() (не show()) —
 * чтобы не отбирать фокус у игры.
 *
 * INV1: живёт в main (зависит от electron.BrowserWindow).
 */
import { BrowserWindow } from 'electron'

export interface OverlayWindowOptions {
  width: number
  height: number
  x?: number
  y?: number
}

export class OverlayWindow {
  private readonly window: BrowserWindow
  private interactive = false

  constructor(options: OverlayWindowOptions) {
    this.window = new BrowserWindow({
      width: options.width,
      height: options.height,
      x: options.x,
      y: options.y,
      transparent: true,
      frame: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      show: false,
      skipTaskbar: true,
      resizable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    this.window.setIgnoreMouseEvents(true, { forward: true })
  }

  /** Показывает окно always-on-top поверх игры, без кражи фокуса. */
  show(): void {
    this.window.setAlwaysOnTop(true, 'screen-saver')
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.window.showInactive()
  }

  /** Скрывает окно целиком (тихий режим F5, TASK-019) — в отличие от click-through (клики сквозь окно), здесь оверлей не рисуется вовсе. show() возвращает его обратно в прежней позиции/размере. */
  hide(): void {
    this.window.hide()
  }

  /** true — окно кликабельно (интерактивно); false — клики проходят в игру (click-through). */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive
    this.window.setIgnoreMouseEvents(!interactive, { forward: true })
  }

  /** Переключает интерактивность и возвращает новое состояние (для лога хоткея). */
  toggleInteractive(): boolean {
    this.setInteractive(!this.interactive)
    return this.interactive
  }

  isInteractive(): boolean {
    return this.interactive
  }

  loadURL(url: string): Promise<void> {
    return this.window.loadURL(url)
  }

  /** Пробрасывает BrowserWindow.loadFile (напр. с ?window=compact-panel через options.query, TASK-014). */
  loadFile(filePath: string, options?: Electron.LoadFileOptions): Promise<void> {
    return this.window.loadFile(filePath, options)
  }

  /** Подписка на перемещение окна (TASK-014: перетаскивание компактной панели, персист позиции). */
  onMoved(listener: () => void): void {
    this.window.on('moved', listener)
  }

  getPosition(): [number, number] {
    return this.window.getPosition() as [number, number]
  }

  /** Программный ресайз (TASK-017: высота компактной панели меняется вместе с набором виджетов) — работает и при resizable:false, тот флаг блокирует только ручной ресайз пользователем. */
  setSize(width: number, height: number): void {
    this.window.setSize(width, height)
  }

  get browserWindow(): BrowserWindow {
    return this.window
  }
}
