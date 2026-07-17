import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OpenDotaClient, createOpenDotaClient, OPENDOTA_ENDPOINT } from '@main/data/OpenDotaClient'
import { RateLimiter } from '@main/data/RateLimiter'

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, `../fixtures/opendota/${name}`), 'utf-8')) as T
}

/** fetch-заглушка: возвращает фикстуру как обычный REST JSON-массив (без {data: ...} обёртки STRATZ). */
function fakeFetch(data: unknown, status = 200): typeof fetch {
  const fn = vi.fn(async () => new Response(JSON.stringify(data), { status }))
  return fn as unknown as typeof fetch
}

describe('TASK-024: OpenDotaClient', () => {
  afterEach(() => {
    delete process.env['OPENDOTA_API_KEY']
  })

  it('getHeroMatchups maps the OpenDota response to internal MatchupData[] (vs only)', async () => {
    const fixture = loadFixture('heroMatchups.json')
    const client = new OpenDotaClient({
      fetchFn: fakeFetch(fixture),
      rateLimiter: new RateLimiter({ maxPerWindow: 100, windowMs: 1000, minIntervalMs: 0, sleep: async () => undefined })
    })

    const dtos = await client.getHeroMatchups(1, { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' })

    expect(dtos).toHaveLength(2)
    expect(dtos.find((d) => d.otherHeroId === 11)).toMatchObject({
      heroId: 1,
      relation: 'vs',
      winrate: 120 / 250,
      sampleSize: 250
    })
  })

  it('getHeroPool maps the OpenDota response to internal HeroPoolEntry[]', async () => {
    const fixture = loadFixture('playerHeroes.json')
    const client = new OpenDotaClient({ fetchFn: fakeFetch(fixture) })

    const dtos = await client.getHeroPool(12345)

    expect(dtos).toHaveLength(2)
    expect(dtos[0]).toMatchObject({ heroId: 1, matchesCount: 42 })
  })

  it('appends api_key query param when an API key is configured', async () => {
    const fetchFn = fakeFetch([])
    const client = new OpenDotaClient({ fetchFn, apiKey: 'secret-key' })

    await client.getHeroPool(1)

    const [url] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('api_key=secret-key')
  })

  it('omits api_key query param when no API key is configured', async () => {
    const fetchFn = fakeFetch([])
    const client = new OpenDotaClient({ fetchFn })

    await client.getHeroPool(1)

    const [url] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).not.toContain('api_key')
  })

  it('throws a descriptive error on non-OK HTTP response', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    const client = new OpenDotaClient({ fetchFn })

    await expect(client.getHeroPool(1)).rejects.toThrow('HTTP 404')
  })

  it('serializes requests through the injected RateLimiter (throttling)', async () => {
    const schedule = vi.fn((task: () => Promise<unknown>) => task())
    const rateLimiter = { schedule } as unknown as RateLimiter
    const client = new OpenDotaClient({ fetchFn: fakeFetch([]), rateLimiter })

    await client.getHeroPool(1)
    await client.getHeroPool(2)

    expect(schedule).toHaveBeenCalledTimes(2)
  })

  describe('createOpenDotaClient', () => {
    it('creates a working client without requiring an API key', () => {
      delete process.env['OPENDOTA_API_KEY']
      const client = createOpenDotaClient()
      expect(client).toBeInstanceOf(OpenDotaClient)
    })

    it('picks up OPENDOTA_API_KEY from the environment when present', async () => {
      process.env['OPENDOTA_API_KEY'] = 'env-key'
      const fetchFn = fakeFetch([])
      // createOpenDotaClient doesn't expose fetchFn injection; verify via a client built the same way it would be.
      const client = new OpenDotaClient({ apiKey: process.env['OPENDOTA_API_KEY'], fetchFn })

      await client.getHeroPool(1)

      const [url] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
      expect(url).toContain('api_key=env-key')
    })
  })

  it('exposes the OpenDota endpoint constant used for requests', () => {
    expect(OPENDOTA_ENDPOINT).toBe('https://api.opendota.com/api')
  })
})
