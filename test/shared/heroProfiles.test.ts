import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HeroProfilesConfigSchema } from '@shared/schemas/heroProfiles'

function loadConfig(): ReturnType<typeof HeroProfilesConfigSchema.parse> {
  const raw: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../content/hero-profiles.json'), 'utf-8'))
  return HeroProfilesConfigSchema.parse(raw)
}

describe('TASK-034: hero-profiles.json schema + content', () => {
  it('validates content/hero-profiles.json against the schema', () => {
    const config = loadConfig()
    expect(config.profiles.length).toBeGreaterThanOrEqual(20)
  })

  it('covers at least top-20 mid heroes with no duplicate heroId', () => {
    const config = loadConfig()
    const ids = config.profiles.map((profile) => profile.heroId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(20)
  })

  it('matches PRD example: Storm Spirit ult_is_kill_window=true, power_spike_levels=[6,7]', () => {
    const config = loadConfig()
    const stormSpirit = config.profiles.find((profile) => profile.heroId === 17)
    expect(stormSpirit).toBeDefined()
    expect(stormSpirit!.ultIsKillWindow).toBe(true)
    expect(stormSpirit!.powerSpikeLevels).toEqual([6, 7])
  })

  it('matches PRD example: Shadow Fiend power_spike_levels includes [2,3]', () => {
    const config = loadConfig()
    const shadowFiend = config.profiles.find((profile) => profile.heroId === 11)
    expect(shadowFiend).toBeDefined()
    expect(shadowFiend!.powerSpikeLevels).toEqual(expect.arrayContaining([2, 3]))
  })

  it('matches PRD example: Templar Assassin and Invoker have ult_is_kill_window=false', () => {
    const config = loadConfig()
    const templarAssassin = config.profiles.find((profile) => profile.heroId === 46)
    const invoker = config.profiles.find((profile) => profile.heroId === 74)
    expect(templarAssassin?.ultIsKillWindow).toBe(false)
    expect(invoker?.ultIsKillWindow).toBe(false)
  })

  it('rejects a profile missing required fields', () => {
    const missingAggressionPattern = {
      patch: '7.39',
      profiles: [{ heroId: 17, ultIsKillWindow: true, powerSpikeLevels: [6, 7], typicalLevel6TimeSec: 360 }]
    }
    expect(HeroProfilesConfigSchema.safeParse(missingAggressionPattern).success).toBe(false)

    const emptyPowerSpikes = {
      patch: '7.39',
      profiles: [
        {
          heroId: 17,
          ultIsKillWindow: true,
          powerSpikeLevels: [],
          aggressionPattern: 'all_in',
          typicalLevel6TimeSec: 360
        }
      ]
    }
    expect(HeroProfilesConfigSchema.safeParse(emptyPowerSpikes).success).toBe(false)
  })

  it('rejects duplicate heroId within one config', () => {
    const dup = {
      patch: '7.39',
      profiles: [
        {
          heroId: 17,
          ultIsKillWindow: true,
          powerSpikeLevels: [6],
          aggressionPattern: 'all_in',
          typicalLevel6TimeSec: 360
        },
        {
          heroId: 17,
          ultIsKillWindow: true,
          powerSpikeLevels: [7],
          aggressionPattern: 'all_in',
          typicalLevel6TimeSec: 360
        }
      ]
    }
    expect(HeroProfilesConfigSchema.safeParse(dup).success).toBe(false)
  })

  it('defaults notes to an empty string when omitted', () => {
    const parsed = HeroProfilesConfigSchema.parse({
      patch: '7.39',
      profiles: [
        {
          heroId: 1,
          ultIsKillWindow: false,
          powerSpikeLevels: [6],
          aggressionPattern: 'trade',
          typicalLevel6TimeSec: 360
        }
      ]
    })
    expect(parsed.profiles[0]?.notes).toBe('')
  })
})
