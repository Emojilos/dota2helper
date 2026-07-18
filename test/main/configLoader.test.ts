/**
 * Тесты универсального config-loader (TASK-011).
 *
 * Покрывают test_steps задачи:
 *  - Шаг 1: конфиг загружается и валидируется своей Zod-схемой; подписка.
 *  - Шаг 2: валидная правка файла применяется без рестарта (hot-reload) —
 *    подписчик получает новую версию, поднимается config:reloaded status=ok.
 *  - Шаг 3: битый JSON НЕ роняет loader — остаётся last-good, статус invalid,
 *    поднимается config:reloaded status=invalid.
 * Дополнительно: провал схемы (не только JSON), невалидный первичный файл без
 * краха, отсутствие файла, mirrorContentDir (копирование недостающих конфигов).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { ConfigLoader, mirrorContentDir } from '@main/config'
import type { ConfigReloadedPayload } from '@shared/types/ipc'

/** Мини-схема «тайминга» для проверки валидации без привязки к реальному контенту. */
const timingsSchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      at_sec: z.number(),
      warn_before_sec: z.number()
    })
  )
})

const validConfig = {
  events: [{ id: 'water_rune', at_sec: 120, warn_before_sec: 10 }]
}

let dir: string
let loader: ConfigLoader | null = null

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'midmind-cfg-'))
}

function write(name: string, content: unknown | string): void {
  const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  writeFileSync(join(dir, `${name}.json`), body, 'utf-8')
}

/** Ждёт следующего события config:reloaded по имени (с таймаутом). */
function waitForReload(
  events: ConfigReloadedPayload[],
  name: string,
  timeoutMs = 2000
): Promise<ConfigReloadedPayload> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const seen = events.filter((e) => e.name === name).length
    const tick = setInterval(() => {
      const matches = events.filter((e) => e.name === name)
      if (matches.length > seen) {
        clearInterval(tick)
        resolve(matches[matches.length - 1]!)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(tick)
        reject(new Error(`timeout waiting for config:reloaded '${name}'`))
      }
    }, 10)
  })
}

afterEach(() => {
  loader?.stop()
  loader = null
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('TASK-011: ConfigLoader', () => {
  it('loads and validates a config with its Zod schema on register', () => {
    dir = makeDir()
    write('timings', validConfig)

    loader = new ConfigLoader({ dir, debounceMs: 20 })
    const handle = loader.register('timings', timingsSchema)

    expect(handle.status()).toBe('ok')
    expect(handle.get()).toEqual(validConfig)
    expect(handle.get()?.events[0]?.id).toBe('water_rune')
  })

  it('hot-reloads a valid edit without restart and notifies consumers', async () => {
    dir = makeDir()
    write('timings', validConfig)

    const reloaded: ConfigReloadedPayload[] = []
    loader = new ConfigLoader({ dir, debounceMs: 20, onReloaded: (p) => reloaded.push(p) })
    const handle = loader.register('timings', timingsSchema)

    const received: unknown[] = []
    handle.subscribe((value) => received.push(value))

    // Валидная правка файла на диске.
    const edited = { events: [{ id: 'power_rune', at_sec: 360, warn_before_sec: 15 }] }
    write('timings', edited)

    const event = await waitForReload(reloaded, 'timings')
    expect(event.status).toBe('ok')
    expect(handle.get()).toEqual(edited)
    expect(handle.get()?.events[0]?.id).toBe('power_rune')
    expect(received.at(-1)).toEqual(edited)
  })

  it('keeps last-good on broken JSON and reports invalid with a line/column reason (no crash)', async () => {
    dir = makeDir()
    write('timings', validConfig)

    const reloaded: ConfigReloadedPayload[] = []
    loader = new ConfigLoader({ dir, debounceMs: 20, onReloaded: (p) => reloaded.push(p) })
    const handle = loader.register('timings', timingsSchema)

    // Портим файл — не валидный JSON (висячая запятая перед закрывающей скобкой).
    write('timings', '{ "events": [], }')

    const event = await waitForReload(reloaded, 'timings')
    expect(event.status).toBe('invalid')
    // TASK-048: понятная причина — где именно в файле ошибка, а не сырой JSON.stringify.
    expect(event.reason).toMatch(/invalid JSON.*line \d+.*column \d+/)
    // last-good сохранён, приложение живо.
    expect(handle.status()).toBe('invalid')
    expect(handle.get()).toEqual(validConfig)
  })

  it('keeps last-good on schema violation (valid JSON, wrong shape) and names the offending field', async () => {
    dir = makeDir()
    write('timings', validConfig)

    const reloaded: ConfigReloadedPayload[] = []
    loader = new ConfigLoader({ dir, debounceMs: 20, onReloaded: (p) => reloaded.push(p) })
    const handle = loader.register('timings', timingsSchema)

    // Валидный JSON, но не проходит схему (at_sec — строка).
    write('timings', { events: [{ id: 'x', at_sec: 'soon', warn_before_sec: 1 }] })

    const event = await waitForReload(reloaded, 'timings')
    expect(event.status).toBe('invalid')
    // TASK-048: сообщение называет конкретное поле, которое нужно поправить.
    expect(event.reason).toContain('events.0.at_sec')
    expect(handle.get()).toEqual(validConfig)
  })

  it('does not attach a reason to config:reloaded on a successful reload', async () => {
    dir = makeDir()
    write('timings', validConfig)

    const reloaded: ConfigReloadedPayload[] = []
    loader = new ConfigLoader({ dir, debounceMs: 20, onReloaded: (p) => reloaded.push(p) })
    loader.register('timings', timingsSchema)

    write('timings', { events: [{ id: 'power_rune', at_sec: 360, warn_before_sec: 15 }] })

    const event = await waitForReload(reloaded, 'timings')
    expect(event.status).toBe('ok')
    expect(event.reason).toBeUndefined()
  })

  it('does not crash when the initial file is invalid (value stays null)', () => {
    dir = makeDir()
    write('timings', '{ broken')

    loader = new ConfigLoader({ dir, debounceMs: 20 })
    const handle = loader.register('timings', timingsSchema)

    expect(handle.status()).toBe('invalid')
    expect(handle.get()).toBeNull()
  })

  it('does not crash when the config file is missing', () => {
    dir = makeDir()
    loader = new ConfigLoader({ dir, debounceMs: 20 })
    const handle = loader.register('timings', timingsSchema)

    expect(handle.status()).toBe('invalid')
    expect(handle.get()).toBeNull()
  })

  it('mirrorContentDir copies only missing json files', () => {
    dir = makeDir()
    const source = join(dir, 'src')
    const target = join(dir, 'dst')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'timings.json'), JSON.stringify(validConfig), 'utf-8')
    writeFileSync(join(source, 'rules.json'), '{}', 'utf-8')
    writeFileSync(join(source, 'notes.txt'), 'ignore me', 'utf-8')

    // Первый прогон — копирует оба json.
    const first = mirrorContentDir(source, target)
    expect(first.sort()).toEqual(['rules.json', 'timings.json'])
    expect(readdirSync(target).sort()).toEqual(['rules.json', 'timings.json'])

    // Пользователь правит timings в target — повторный mirror НЕ перезатирает.
    writeFileSync(join(target, 'timings.json'), JSON.stringify({ events: [] }), 'utf-8')
    const second = mirrorContentDir(source, target)
    expect(second).toEqual([]) // ничего не скопировано — оба уже есть
    expect(JSON.parse(readFileSync(join(target, 'timings.json'), 'utf-8'))).toEqual({ events: [] })
  })
})
