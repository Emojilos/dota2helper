import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { StratzClient, createStratzClient, STRATZ_ENDPOINT } from '@main/data/StratzClient'
import { RateLimiter } from '@main/data/RateLimiter'

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, `../fixtures/stratz/${name}`), 'utf-8')) as T
}

/** fetch-заглушка: возвращает фикстуру как {data: ...} и запоминает, чем её вызвали. */
function fakeFetch(data: unknown): typeof fetch {
  const fn = vi.fn(async () => {
    return new Response(JSON.stringify({ data }), { status: 200 })
  })
  return fn as unknown as typeof fetch
}

describe('TASK-021: StratzClient', () => {
  afterEach(() => {
    delete process.env['STRATZ_API_TOKEN']
  })

  it('getHeroMatchups maps the STRATZ response to internal MatchupData[]', async () => {
    const fixture = loadFixture('heroMatchups.json')
    const fetchFn = fakeFetch(fixture)
    const client = new StratzClient({
      apiToken: 'test-token',
      fetchFn,
      rateLimiter: new RateLimiter({ maxPerWindow: 100, windowMs: 1000, minIntervalMs: 0, sleep: async () => undefined })
    })

    const dtos = await client.getHeroMatchups(1, { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' })

    expect(dtos).toHaveLength(3)
    expect(dtos.find((d) => d.relation === 'vs' && d.otherHeroId === 11)).toMatchObject({
      heroId: 1,
      winrate: 120 / 250,
      sampleSize: 250
    })

    // Authorization-заголовок содержит токен, но нигде не логируется.
    const [, requestInit] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(requestInit.headers).toMatchObject({ Authorization: 'Bearer test-token' })
  })

  it('getHeroPool maps the STRATZ response to internal HeroPoolEntry[]', async () => {
    const fixture = loadFixture('heroPool.json')
    const client = new StratzClient({ apiToken: 'test-token', fetchFn: fakeFetch(fixture) })

    const dtos = await client.getHeroPool(12345)

    expect(dtos).toHaveLength(2)
    expect(dtos[0]).toMatchObject({ heroId: 1, matchesCount: 42 })
  })

  it('getHeroBuilds maps the STRATZ response to internal BuildData[]', async () => {
    const fixture = loadFixture('heroBuilds.json')
    const client = new StratzClient({ apiToken: 'test-token', fetchFn: fakeFetch(fixture) })

    const dtos = await client.getHeroBuilds(1, { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' }, 11)

    expect(dtos).toHaveLength(2)
    expect(dtos[0]).toMatchObject({ heroId: 1, vsHeroId: 11, patch: '7.39' })
  })

  it('getRecentMatches maps the STRATZ response to internal MatchSummary[]', async () => {
    const fixture = loadFixture('recentMatches.json')
    const client = new StratzClient({ apiToken: 'test-token', fetchFn: fakeFetch(fixture) })

    const dtos = await client.getRecentMatches(12345, 10)

    expect(dtos).toHaveLength(2)
    expect(dtos[0]).toMatchObject({ matchId: '7412345678', result: 'win' })
  })

  it('throws a descriptive error on non-OK HTTP response, without leaking the token', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 401 })) as unknown as typeof fetch
    const client = new StratzClient({ apiToken: 'secret-token', fetchFn })

    await expect(client.getHeroPool(1)).rejects.toThrow('HTTP 401')
  })

  it('throws on GraphQL-level errors in the response body', async () => {
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({ errors: [{ message: 'invalid steamAccountId' }] }), { status: 200 })
    ) as unknown as typeof fetch
    const client = new StratzClient({ apiToken: 'test-token', fetchFn })

    await expect(client.getHeroPool(1)).rejects.toThrow('invalid steamAccountId')
  })

  it('serializes requests through the injected RateLimiter (throttling)', async () => {
    const fixture = loadFixture('heroPool.json')
    const schedule = vi.fn((task: () => Promise<unknown>) => task())
    const rateLimiter = { schedule } as unknown as RateLimiter
    const client = new StratzClient({ apiToken: 'test-token', fetchFn: fakeFetch(fixture), rateLimiter })

    await client.getHeroPool(1)
    await client.getHeroPool(2)

    expect(schedule).toHaveBeenCalledTimes(2)
  })

  describe('createStratzClient', () => {
    it('returns null and logs (without the token) when STRATZ_API_TOKEN is unset', () => {
      delete process.env['STRATZ_API_TOKEN']
      const logger = vi.fn()

      const client = createStratzClient(logger)

      expect(client).toBeNull()
      expect(logger).toHaveBeenCalledTimes(1)
      expect(logger.mock.calls[0]?.[0]).not.toContain('undefined')
    })

    it('creates a working client when STRATZ_API_TOKEN is set', () => {
      process.env['STRATZ_API_TOKEN'] = 'env-token'
      const client = createStratzClient()
      expect(client).toBeInstanceOf(StratzClient)
    })
  })

  it('exposes the STRATZ endpoint constant used for requests', () => {
    expect(STRATZ_ENDPOINT).toBe('https://api.stratz.com/graphql')
  })
})
