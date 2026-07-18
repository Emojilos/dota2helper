import { describe, expect, it } from 'vitest'
import {
  buildBenchmarkPoints,
  fetchHeroRates,
  pickPercentileValue
} from '../../tools/generate-benchmarks.ts'

describe('pickPercentileValue', () => {
  it('returns the exact value when the target percentile is present', () => {
    const entries = [
      { percentile: 0.1, value: 10 },
      { percentile: 0.5, value: 50 },
      { percentile: 0.9, value: 90 }
    ]
    expect(pickPercentileValue(entries, 0.5)).toBe(50)
  })

  it('linearly interpolates between neighboring percentiles when the target is absent', () => {
    const entries = [
      { percentile: 0.7, value: 70 },
      { percentile: 0.8, value: 80 }
    ]
    expect(pickPercentileValue(entries, 0.75)).toBeCloseTo(75)
  })

  it('falls back to the nearest bound when the target is outside the known range', () => {
    const entries = [
      { percentile: 0.1, value: 10 },
      { percentile: 0.9, value: 90 }
    ]
    expect(pickPercentileValue(entries, 0.99)).toBe(90)
    expect(pickPercentileValue(entries, 0.01)).toBe(10)
  })
})

describe('buildBenchmarkPoints', () => {
  it('builds a minute-by-minute curve as rate * minute, all flagged approximate', () => {
    const points = buildBenchmarkPoints(
      1,
      {
        lhPerMin: { p50: 9, p75: 10 },
        goldPerMin: { p50: 600, p75: 700 },
        xpPerMin: { p50: 800, p75: 900 }
      },
      { patch: '7.39', rankBracket: 'ARCHON_TO_ANCIENT' },
      5
    )

    expect(points).toHaveLength(6)
    expect(points[0]).toMatchObject({ minute: 0, lh_p50: 0, networth_p50: 0, xp_p50: 0 })
    expect(points[5]).toMatchObject({
      hero_id: 1,
      minute: 5,
      lh_p50: 45,
      lh_p75: 50,
      networth_p50: 3000,
      networth_p75: 3500,
      xp_p50: 4000,
      xp_p75: 4500,
      rank_bracket: 'ARCHON_TO_ANCIENT',
      patch: '7.39',
      approximate: true
    })
    expect(points.every((point) => point.approximate)).toBe(true)
  })
})

describe('fetchHeroRates', () => {
  it('maps an OpenDota /benchmarks response to p50/p75 rates', async () => {
    const fakeResponse = {
      ok: true,
      json: async () => ({
        hero_id: 1,
        result: {
          gold_per_min: [
            { percentile: 0.5, value: 600 },
            { percentile: 0.75, value: 700 }
          ],
          xp_per_min: [
            { percentile: 0.5, value: 800 },
            { percentile: 0.75, value: 900 }
          ],
          last_hits_per_min: [
            { percentile: 0.5, value: 9 },
            { percentile: 0.75, value: 10 }
          ]
        }
      })
    }
    const fetchFn = (async () => fakeResponse) as unknown as typeof fetch

    const rates = await fetchHeroRates(1, fetchFn)

    expect(rates).toEqual({
      lhPerMin: { p50: 9, p75: 10 },
      goldPerMin: { p50: 600, p75: 700 },
      xpPerMin: { p50: 800, p75: 900 }
    })
  })

  it('throws a descriptive error on a non-ok HTTP response', async () => {
    const fetchFn = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch
    await expect(fetchHeroRates(1, fetchFn)).rejects.toThrow(/HTTP 500/)
  })
})
