/**
 * GsiServer — локальный HTTP-сервер приёма Game State Integration (TASK-005).
 *
 * Легальность (INV3): ТОЛЬКО пассивный приём — Dota сама шлёт POST с JSON на
 * localhost по штатному механизму Valve. Никакого чтения памяти / инъекций.
 *
 * Обязанности:
 *  - слушать loopback (127.0.0.1) на порту 3000+ (с автоподбором свободного);
 *  - принимать POST JSON, валидировать shared auth-token из тела пакета (401,
 *    если токен отсутствует/неверен);
 *  - парсить raw → GameState (parseGameState, TASK-004);
 *  - класть результат в in-memory GameStateStore (источник правды main);
 *  - параллельно санитизировать тот же raw-пакет в WidgetGsiSnapshot
 *    (pickWidgetSnapshot, TASK-016) и класть в RawGsiSnapshotStore — конструктору
 *    виджетов F5 нужны поля шире типизированного GameState (aghanims_scepter,
 *    talent_N, debuff-флаги и т.п.), см. src/shared/schemas/gsiFieldCatalog.ts;
 *    оба стора обновляются В ОДНОМ flush(), чтобы не разъехаться по частоте;
 *  - коалесцировать поток уведомлений подписчиков до ≤2 Гц (leading + trailing),
 *    при этом getLatest() всегда возвращает самый свежий пакет.
 *
 * Модуль живёт в main — ему разрешены node:http/crypto (INV2 касается только
 * src/engine/** и src/shared/**).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { parseGameState } from '@shared/gsi/parseGameState'
import { pickWidgetSnapshot } from '@shared/gsi/pickWidgetSnapshot'
import type { GameState } from '@shared/schemas/gameState'
import type { WidgetGsiSnapshot } from '@shared/schemas/gsiRawSnapshot'
import { GameStateStore } from './GameStateStore'
import { RawGsiSnapshotStore } from './RawGsiSnapshotStore'

const DEFAULT_PORT = 3000
const DEFAULT_HOST = '127.0.0.1'
/** ≤ 2 Гц: не чаще одного flush в 500 мс. */
const DEFAULT_COALESCE_MS = 500
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024 // 1 МБ — GSI-пакеты много меньше
const DEFAULT_PORT_ATTEMPTS = 10

export interface GsiServerOptions {
  /** Shared-токен, который Dota кладёт в пакет (auth.token). Обязателен. */
  authToken: string
  /** Куда складывать состояние-правду. По умолчанию создаётся новый стор. */
  store?: GameStateStore
  /** Куда складывать санитизированный срез для конструктора виджетов (TASK-016). По умолчанию создаётся новый стор. */
  rawStore?: RawGsiSnapshotStore
  /** Стартовый порт (по умолчанию 3000); при занятости пробуются следующие. */
  port?: number
  /** Интерфейс прослушивания. По умолчанию только loopback 127.0.0.1 (INV3). */
  host?: string
  /** Окно коалесцирования уведомлений в мс (по умолчанию 500 → ≤2 Гц). */
  coalesceMs?: number
  /** Максимальный размер тела запроса в байтах (защита от мусора). */
  maxBodyBytes?: number
  /** Сколько последовательных портов пробовать при EADDRINUSE. */
  portAttempts?: number
  /** Логгер (по умолчанию no-op, чтобы стор оставался тестируемым тихо). */
  logger?: (message: string) => void
}

export class GsiServer {
  /** Источник правды main — доступен потребителям (IPC-мост TASK-007). */
  readonly store: GameStateStore
  /** Санитизированный срез сырого пакета для конструктора виджетов (TASK-016). */
  readonly rawStore: RawGsiSnapshotStore

  private readonly authToken: string
  private readonly host: string
  private readonly startPort: number
  private readonly coalesceMs: number
  private readonly maxBodyBytes: number
  private readonly portAttempts: number
  private readonly log: (message: string) => void

  private server: Server | null = null
  private boundPort: number | null = null
  private latest: GameState | null = null
  private latestRaw: WidgetGsiSnapshot | null = null

  // Состояние троттлинга (leading + trailing) для потока уведомлений.
  private lastFlush = 0
  private trailingTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: GsiServerOptions) {
    if (!options.authToken) {
      throw new Error('GsiServer: authToken обязателен и не может быть пустым')
    }
    this.authToken = options.authToken
    this.store = options.store ?? new GameStateStore()
    this.rawStore = options.rawStore ?? new RawGsiSnapshotStore()
    this.host = options.host ?? DEFAULT_HOST
    this.startPort = options.port ?? DEFAULT_PORT
    this.coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS
    this.maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
    this.portAttempts = options.portAttempts ?? DEFAULT_PORT_ATTEMPTS
    this.log = options.logger ?? ((): void => {})
  }

  /** Самый свежий валидный GameState (обновляется на каждом пакете, без задержки). */
  getLatest(): GameState | null {
    return this.latest
  }

  /** Фактический порт прослушивания после start() (иначе null). */
  get port(): number | null {
    return this.boundPort
  }

  /**
   * Поднимает сервер на loopback. При занятости стартового порта перебирает
   * следующие (3000, 3001, ...). Возвращает фактический порт.
   */
  async start(): Promise<number> {
    if (this.server) {
      return this.boundPort as number
    }
    // port=0 → эфемерный порт от ОС (используется в тестах): без перебора.
    const attempts = this.startPort === 0 ? 1 : this.portAttempts
    let lastError: unknown
    for (let i = 0; i < attempts; i++) {
      const candidate = this.startPort === 0 ? 0 : this.startPort + i
      try {
        const port = await this.listen(candidate)
        this.boundPort = port
        this.log(`GSI server listening on http://${this.host}:${port}`)
        return port
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          lastError = error
          continue
        }
        throw error
      }
    }
    throw lastError ?? new Error('GsiServer: не удалось занять ни один порт')
  }

  /** Останавливает сервер и снимает отложенный trailing-flush. */
  async stop(): Promise<void> {
    if (this.trailingTimer) {
      clearTimeout(this.trailingTimer)
      this.trailingTimer = null
    }
    const server = this.server
    this.server = null
    this.boundPort = null
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }

  private listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => this.handleRequest(req, res))
      const onError = (error: Error): void => {
        server.removeListener('listening', onListening)
        reject(error)
      }
      const onListening = (): void => {
        server.removeListener('error', onError)
        const address = server.address()
        const actual = typeof address === 'object' && address ? address.port : port
        this.server = server
        resolve(actual)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      // Биндимся ТОЛЬКО на указанный host (по умолчанию loopback) — INV3.
      server.listen(port, this.host)
    })
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== 'POST') {
      this.respond(res, 405, 'Method Not Allowed')
      return
    }

    const chunks: Buffer[] = []
    let size = 0
    let rejected = false

    req.on('data', (chunk: Buffer) => {
      if (rejected) return
      size += chunk.length
      if (size > this.maxBodyBytes) {
        rejected = true
        this.respond(res, 413, 'Payload Too Large')
        req.destroy()
      } else {
        chunks.push(chunk)
      }
    })

    req.on('error', () => {
      if (!rejected) {
        rejected = true
        this.respond(res, 400, 'Bad Request')
      }
    })

    req.on('end', () => {
      if (rejected) return

      let payload: unknown
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        this.respond(res, 400, 'Invalid JSON')
        return
      }

      // Проверка auth-token ДО парсинга полезной нагрузки.
      if (!this.isAuthorized(payload)) {
        this.respond(res, 401, 'Unauthorized')
        return
      }

      let state: GameState
      try {
        state = parseGameState(payload)
      } catch {
        // Структурно битый пакет (ZodError) — принят по токену, но нечитаем.
        this.respond(res, 422, 'Invalid GSI packet')
        return
      }

      this.latest = state
      this.latestRaw = pickWidgetSnapshot(payload)
      this.scheduleFlush()
      this.respond(res, 200, 'OK')
    })
  }

  /** Проверяет auth.token в теле пакета в постоянном времени. */
  private isAuthorized(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) return false
    const auth = (payload as { auth?: unknown }).auth
    if (typeof auth !== 'object' || auth === null) return false
    const token = (auth as { token?: unknown }).token
    return typeof token === 'string' && safeEqual(token, this.authToken)
  }

  /**
   * Троттлинг потока уведомлений подписчиков до ≤2 Гц (leading + trailing):
   * первый пакет в окне доставляется сразу, последний в окне — по его закрытии.
   * latest при этом всегда актуален независимо от flush.
   */
  private scheduleFlush(): void {
    const now = Date.now()
    const elapsed = now - this.lastFlush
    if (elapsed >= this.coalesceMs) {
      this.flush(now)
      return
    }
    if (!this.trailingTimer) {
      this.trailingTimer = setTimeout(() => {
        this.trailingTimer = null
        this.flush(Date.now())
      }, this.coalesceMs - elapsed)
      // Не держать процесс живым только ради trailing-таймера.
      this.trailingTimer.unref?.()
    }
  }

  private flush(now: number): void {
    this.lastFlush = now
    if (this.latest) {
      this.store.set(this.latest)
    }
    if (this.latestRaw) {
      this.rawStore.set(this.latestRaw)
    }
  }

  private respond(res: ServerResponse, status: number, body: string): void {
    if (res.writableEnded) return
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(body)
  }
}

/** Сравнение строк в постоянном времени (защита от timing-атаки на токен). */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}
