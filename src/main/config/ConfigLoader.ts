/**
 * ConfigLoader — универсальный загрузчик контентных JSON-конфигов (TASK-011, INV4).
 *
 * Живёт в main (INV1): читает файлы из каталога `content/` (в проде — из копии в
 * userData, чтобы правки переживали обновление приложения и работал watch),
 * валидирует каждый конфиг его Zod-схемой и держит last-good значение в памяти.
 *
 * Гарантии:
 *  - Любой конфиг загружается и валидируется своей схемой (register()).
 *  - Правка файла применяется без перезапуска: watch каталога + debounce +
 *    атомарный swap значения in-memory (hot-reload).
 *  - Битый JSON / провал схемы НЕ роняют приложение: сохраняется предыдущее
 *    last-good значение, ошибка логируется, поднимается событие reload со
 *    статусом 'invalid'.
 *  - Потребители подписываются на КОНКРЕТНЫЙ конфиг (ConfigHandle.subscribe) и
 *    получают уведомление о его перезагрузке; глобальный onReloaded пробрасывает
 *    ConfigReloadedPayload в IPC (config:reloaded, TASK-007).
 *
 * Каталог watch'ится целиком одним fs.watch — это устойчиво к атомарным
 * сохранениям редакторами (temp-файл + rename меняет inode; пофайловый watch бы
 * «отвалился», а по-каталожный продолжает видеть события по имени файла).
 *
 * INV2 к этому модулю не относится (он в main); зависимости — только node:fs/path
 * и zod. Electron сюда не тянется намеренно, чтобы loader был юнит-тестируемым на
 * временном каталоге без поднятия Electron.
 */
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import type { ZodType, ZodTypeDef } from 'zod'
import type { ConfigReloadedPayload } from '@shared/types/ipc'

/** Статус последней попытки загрузки конфига. */
export type ConfigStatus = 'ok' | 'invalid'

/** Подписчик на изменения одного конфига: получает актуальное last-good значение. */
export type ConfigListener<T> = (value: T, status: ConfigStatus) => void

export interface ConfigLoaderOptions {
  /** Каталог с JSON-конфигами (content/ или его копия в userData). */
  dir: string
  /** Лог диагностики (по умолчанию no-op). */
  logger?: (message: string) => void
  /** Debounce перед перезагрузкой после события файловой системы, мс. */
  debounceMs?: number
  /** Пробрасывает событие перезагрузки конкретного конфига (в IPC config:reloaded). */
  onReloaded?: (payload: ConfigReloadedPayload) => void
}

/**
 * Публичный дескриптор одного зарегистрированного конфига. Потребители держат
 * его и читают текущее значение / подписываются на обновления.
 */
export interface ConfigHandle<T> {
  /** Имя конфига (например 'timings'); совпадает с ключом в config:reloaded. */
  readonly name: string
  /** Текущее last-good значение (null, если ни разу не загрузился валидно). */
  get(): T | null
  /** Статус последней попытки загрузки. */
  status(): ConfigStatus
  /** Подписка на обновления этого конфига. Возвращает функцию отписки. */
  subscribe(listener: ConfigListener<T>): () => void
}

interface RegisteredConfig<T> {
  readonly name: string
  readonly fileName: string
  readonly schema: ZodType<T>
  value: T | null
  status: ConfigStatus
  readonly listeners: Set<ConfigListener<T>>
  debounceTimer: ReturnType<typeof setTimeout> | null
}

const DEFAULT_DEBOUNCE_MS = 150

export class ConfigLoader {
  private readonly dir: string
  private readonly logger: (message: string) => void
  private readonly debounceMs: number
  private readonly onReloaded?: (payload: ConfigReloadedPayload) => void
  /** Реестр по имени файла — для быстрой маршрутизации событий watch'а. */
  private readonly byFileName = new Map<string, RegisteredConfig<unknown>>()
  private watcher: FSWatcher | null = null

  constructor(options: ConfigLoaderOptions) {
    this.dir = options.dir
    this.logger = options.logger ?? (() => {})
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.onReloaded = options.onReloaded
  }

  /**
   * Регистрирует конфиг `<name>.json` со схемой и загружает его СИНХРОННО один
   * раз, чтобы потребитель имел значение сразу. При невалидном первичном файле
   * значение остаётся null (last-good ещё нет), статус — 'invalid'; приложение
   * не падает. Идемпотентно поднимает watch каталога при первой регистрации.
   */
  // Input-параметр схемы намеренно `any`: у схем с `.default()`/`.transform()`
  // тип входа расходится с выходом, и `ZodType<T>` (Input=Output) не даёт вывести
  // T как ВЫХОДНОЙ тип. `any` в контравариантной позиции входа связывает T с
  // выходным типом схемы (то, что get() и вернёт).
  register<T>(name: string, schema: ZodType<T, ZodTypeDef, any>): ConfigHandle<T> {
    const fileName = `${name}.json`
    if (this.byFileName.has(fileName)) {
      throw new Error(`ConfigLoader: config '${name}' is already registered`)
    }

    const entry: RegisteredConfig<T> = {
      name,
      fileName,
      schema,
      value: null,
      status: 'invalid',
      listeners: new Set(),
      debounceTimer: null
    }
    this.byFileName.set(fileName, entry as RegisteredConfig<unknown>)

    // Первичная синхронная загрузка (без notify/emit — подписчиков ещё нет).
    this.applyLoad(entry, this.readSync(entry), { notify: false })
    this.ensureWatching()

    return this.makeHandle(entry)
  }

  /** Снимает watch и все debounce-таймеры. Вызывать на завершении приложения. */
  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    for (const entry of this.byFileName.values()) {
      if (entry.debounceTimer) {
        clearTimeout(entry.debounceTimer)
        entry.debounceTimer = null
      }
    }
  }

  private makeHandle<T>(entry: RegisteredConfig<T>): ConfigHandle<T> {
    return {
      name: entry.name,
      get: () => entry.value,
      status: () => entry.status,
      subscribe: (listener: ConfigListener<T>) => {
        entry.listeners.add(listener)
        return () => {
          entry.listeners.delete(listener)
        }
      }
    }
  }

  /** Синхронно читает + парсит + валидирует файл. Возвращает результат попытки. */
  private readSync<T>(entry: RegisteredConfig<T>): LoadResult<T> {
    try {
      const raw = readFileSync(join(this.dir, entry.fileName), 'utf-8')
      return this.parseAndValidate(entry, raw)
    } catch (error) {
      return { ok: false, reason: describeError(error) }
    }
  }

  /** Асинхронно перечитывает файл (используется из watch'а). */
  private async readAsync<T>(entry: RegisteredConfig<T>): Promise<LoadResult<T>> {
    try {
      const raw = await readFile(join(this.dir, entry.fileName), 'utf-8')
      return this.parseAndValidate(entry, raw)
    } catch (error) {
      return { ok: false, reason: describeError(error) }
    }
  }

  private parseAndValidate<T>(entry: RegisteredConfig<T>, raw: string): LoadResult<T> {
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch (error) {
      return { ok: false, reason: `invalid JSON: ${describeError(error)}` }
    }
    const parsed = entry.schema.safeParse(json)
    if (!parsed.success) {
      return { ok: false, reason: `schema validation failed: ${parsed.error.message}` }
    }
    return { ok: true, value: parsed.data }
  }

  /**
   * Применяет результат загрузки: при успехе — атомарный swap значения и
   * статус 'ok'; при провале — сохраняет last-good, статус 'invalid'. Логирует и
   * (если notify) уведомляет подписчиков + поднимает config:reloaded.
   */
  private applyLoad<T>(
    entry: RegisteredConfig<T>,
    result: LoadResult<T>,
    { notify }: { notify: boolean }
  ): void {
    if (result.ok) {
      entry.value = result.value // атомарный swap ссылки
      entry.status = 'ok'
      this.logger(`config '${entry.name}' loaded`)
    } else {
      entry.status = 'invalid'
      const kept = entry.value === null ? 'no last-good yet' : 'keeping last-good'
      this.logger(`config '${entry.name}' invalid (${result.reason}); ${kept}`)
    }

    if (notify) {
      if (result.ok) {
        for (const listener of entry.listeners) {
          listener(entry.value as T, entry.status)
        }
      }
      this.onReloaded?.({ name: entry.name, status: entry.status })
    }
  }

  private ensureWatching(): void {
    if (this.watcher) {
      return
    }
    try {
      this.watcher = watch(this.dir, (_eventType, fileName) => {
        if (!fileName) {
          return
        }
        const entry = this.byFileName.get(basename(fileName.toString()))
        if (entry) {
          this.scheduleReload(entry)
        }
      })
    } catch (error) {
      this.logger(`failed to watch config dir '${this.dir}': ${describeError(error)}`)
    }
  }

  /** Debounce: fs.watch часто эмитит несколько событий на одно сохранение. */
  private scheduleReload<T>(entry: RegisteredConfig<T>): void {
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer)
    }
    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null
      void this.readAsync(entry).then((result) => {
        this.applyLoad(entry, result, { notify: true })
      })
    }, this.debounceMs)
    // Таймер не должен держать процесс живым.
    entry.debounceTimer.unref?.()
  }
}

type LoadResult<T> = { ok: true; value: T } | { ok: false; reason: string }

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
