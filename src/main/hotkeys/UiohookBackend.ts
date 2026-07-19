/**
 * Win32-бэкенд глобальных хоткеев поверх uiohook-napi (низкоуровневый
 * WH_KEYBOARD_LL-хук; TASK-008/018). Появился из живой находки гейта
 * TASK-008: RegisterHotKey (globalShortcut) не срабатывает, когда в фокусе
 * Dota — raw-input игры перехватывают ввод до системного матчинга хоткеев.
 *
 * ЛЕГАЛЬНОСТЬ (INV3): хук observe-only и out-of-process — libuiohook НЕ
 * подавляет событие (клавиша доходит и до игры) и НЕ инжектится в процесс
 * игры (LL-хуки исполняются в нашем процессе). Никакого синтеза ввода.
 * Это тот же механизм, что у Discord/OBS/Steam overlay. Событие
 * подавлять НЕЛЬЗЯ — не добавлять сюда suppress ни под каким предлогом.
 *
 * ЛАТЕНТНОСТЬ: native-колбэк libuiohook кладёт событие в очередь и сразу
 * возвращается; наш JS-слушатель исполняется уже на libuv-петле, отвязанно
 * от hook-потока ОС. Тем не менее в keydown-слушателе — только матчинг
 * чисел/булей и вызов handler'а, ничего блокирующего.
 *
 * Native-модуль загружается ЛЕНИВО при первой регистрации: на darwin-dev
 * этот бэкенд не создаётся вовсе (createHotkeyBackends), а значит addon не
 * грузится и Accessibility permission не запрашивается. Загрузчик модуля
 * инжектируем — юнит-тесты подставляют фейк без native.
 *
 * Автоповтор клавиш: keydown при удержании приходит повторно, а хоткеи у
 * нас toggle-семантики — повтор подавляем, требуя keyup между
 * срабатываниями (downKeycodes).
 */
import { parseAccelerator, type HotkeyPlatform } from '@shared/hotkeys/parseAccelerator'
import { matchChord, type HookKeyboardEventLike, type ResolvedChord } from '@shared/hotkeys/matchChord'
import { buildUiohookKeymap } from './uiohookKeymap'
import type { HotkeyBackend } from './HotkeyBackend'

/** Структурный минимум uiohook-napi, который использует бэкенд. */
export interface UiohookApi {
  uIOhook: {
    on(event: 'keydown' | 'keyup', listener: (e: HookKeyboardEventLike) => void): unknown
    off(event: 'keydown' | 'keyup', listener: (e: HookKeyboardEventLike) => void): unknown
    start(): void
    stop(): void
  }
  UiohookKey: Record<string, number | undefined>
}

function defaultLoadModule(): UiohookApi {
  // Ленивый require вместо статического import: addon не должен грузиться
  // ни на этапе бандлинга Mac-петли, ни до первой реальной регистрации.
  return require('uiohook-napi') as UiohookApi
}

export class UiohookBackend implements HotkeyBackend {
  private readonly registered = new Map<string, { chord: ResolvedChord; handler: () => void }>()
  private readonly downKeycodes = new Set<number>()
  private module: UiohookApi | null = null
  private keymap: Map<string, number> | null = null
  private hookStarted = false
  private onKeydown: ((event: HookKeyboardEventLike) => void) | null = null
  private onKeyup: ((event: HookKeyboardEventLike) => void) | null = null

  constructor(
    private readonly logger?: (message: string) => void,
    private readonly loadModule: () => UiohookApi = defaultLoadModule
  ) {}

  register(accelerator: string, handler: () => void): boolean {
    const platform: HotkeyPlatform =
      process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : 'win32'
    const parsed = parseAccelerator(accelerator, platform)
    if (!parsed.ok) {
      this.logger?.(`uiohook: cannot parse accelerator '${accelerator}': ${parsed.error}`)
      return false
    }

    let module: UiohookApi
    try {
      module = this.ensureModule()
    } catch (error) {
      this.logger?.(`uiohook: failed to load native module: ${String(error)}`)
      return false
    }

    const keycode = this.keymap?.get(parsed.chord.key)
    if (keycode === undefined) {
      this.logger?.(`uiohook: key '${parsed.chord.key}' has no keycode mapping`)
      return false
    }

    this.registered.set(accelerator, {
      chord: {
        keycode,
        ctrl: parsed.chord.ctrl,
        alt: parsed.chord.alt,
        shift: parsed.chord.shift,
        meta: parsed.chord.meta
      },
      handler
    })
    this.ensureHookStarted(module)
    return true
  }

  unregister(accelerator: string): void {
    this.registered.delete(accelerator)
  }

  stop(): void {
    this.registered.clear()
    this.downKeycodes.clear()
    if (this.hookStarted && this.module) {
      if (this.onKeydown) {
        this.module.uIOhook.off('keydown', this.onKeydown)
      }
      if (this.onKeyup) {
        this.module.uIOhook.off('keyup', this.onKeyup)
      }
      this.module.uIOhook.stop()
      this.hookStarted = false
    }
  }

  private ensureModule(): UiohookApi {
    if (!this.module) {
      this.module = this.loadModule()
      this.keymap = buildUiohookKeymap(this.module.UiohookKey)
    }
    return this.module
  }

  private ensureHookStarted(module: UiohookApi): void {
    if (this.hookStarted) {
      return
    }
    this.onKeydown = (event) => {
      if (this.downKeycodes.has(event.keycode)) {
        return // автоповтор удержания — уже сработали на первом keydown
      }
      this.downKeycodes.add(event.keycode)
      for (const { chord, handler } of this.registered.values()) {
        if (matchChord(event, chord)) {
          handler()
        }
      }
    }
    this.onKeyup = (event) => {
      this.downKeycodes.delete(event.keycode)
    }
    module.uIOhook.on('keydown', this.onKeydown)
    module.uIOhook.on('keyup', this.onKeyup)
    module.uIOhook.start()
    this.hookStarted = true
  }
}
