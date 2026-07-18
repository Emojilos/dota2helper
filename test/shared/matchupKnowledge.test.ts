import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MatchupKnowledgeConfigSchema, findMatchupEntry } from '@shared/schemas/matchupKnowledge'

function loadConfig(): ReturnType<typeof MatchupKnowledgeConfigSchema.parse> {
  const raw: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../content/matchup-knowledge.json'), 'utf-8'))
  return MatchupKnowledgeConfigSchema.parse(raw)
}

describe('TASK-035: matchup-knowledge.json schema + content', () => {
  it('validates content/matchup-knowledge.json against the schema', () => {
    const config = loadConfig()
    expect(config.entries.length).toBeGreaterThan(0)
  })

  it('every entry meets the PRD minimum: >=3 do_tips, >=2 avoid_tips, timings for both sides', () => {
    const config = loadConfig()
    for (const entry of config.entries) {
      expect(entry.doTips.length).toBeGreaterThanOrEqual(3)
      expect(entry.avoidTips.length).toBeGreaterThanOrEqual(2)
      expect(entry.powerSpikes.some((s) => s.side === 'my')).toBe(true)
      expect(entry.powerSpikes.some((s) => s.side === 'enemy')).toBe(true)
    }
  })

  it('has no duplicate (heroId, vsHeroId) pair', () => {
    const config = loadConfig()
    const keys = config.entries.map((e) => `${e.heroId}:${e.vsHeroId}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('PRD example: Storm Spirit vs Viper and Huskar vs Viper are directionally distinct cards', () => {
    const config = loadConfig()
    const stormVsViper = findMatchupEntry(config, 17, 47)
    const huskarVsViper = findMatchupEntry(config, 59, 47)
    expect(stormVsViper).toBeDefined()
    expect(huskarVsViper).toBeDefined()
    // Same enemy (Viper), principally different advice for different own heroes (раздел F2 PRD).
    expect(stormVsViper!.doTips).not.toEqual(huskarVsViper!.doTips)
    expect(stormVsViper!.avoidTips).not.toEqual(huskarVsViper!.avoidTips)
    // Storm Spirit's PRD-quoted stance: play from experience until 6, don't trade.
    expect(stormVsViper!.avoidTips.some((tip) => tip.includes('Не разменивайся'))).toBe(true)
    // Huskar's PRD-quoted stance: aggress from level 1, Viper can't out-trade him.
    expect(huskarVsViper!.doTips.some((tip) => tip.includes('Агрессируй'))).toBe(true)
  })

  it('findMatchupEntry is directional: (Storm, Viper) is not the same record as (Viper, Storm)', () => {
    const config = loadConfig()
    const stormVsViper = findMatchupEntry(config, 17, 47)
    const viperVsStorm = findMatchupEntry(config, 47, 17)
    expect(stormVsViper).toBeDefined()
    expect(viperVsStorm).toBeDefined()
    expect(stormVsViper).not.toBe(viperVsStorm)
    expect(findMatchupEntry(config, 999, 1)).toBeUndefined()
  })

  it('rejects an entry with heroId === vsHeroId', () => {
    const selfMatch = {
      patch: '7.39',
      entries: [
        {
          heroId: 17,
          vsHeroId: 17,
          doTips: ['a', 'b', 'c'],
          avoidTips: ['x', 'y'],
          powerSpikes: [
            { side: 'my', level: 6, note: 'n1' },
            { side: 'enemy', level: 6, note: 'n2' }
          ]
        }
      ]
    }
    expect(MatchupKnowledgeConfigSchema.safeParse(selfMatch).success).toBe(false)
  })

  it('rejects fewer than 3 do_tips or fewer than 2 avoid_tips', () => {
    const tooFewDoTips = {
      patch: '7.39',
      entries: [
        {
          heroId: 17,
          vsHeroId: 47,
          doTips: ['a', 'b'],
          avoidTips: ['x', 'y'],
          powerSpikes: [
            { side: 'my', level: 6, note: 'n1' },
            { side: 'enemy', level: 6, note: 'n2' }
          ]
        }
      ]
    }
    expect(MatchupKnowledgeConfigSchema.safeParse(tooFewDoTips).success).toBe(false)

    const tooFewAvoidTips = {
      patch: '7.39',
      entries: [
        {
          heroId: 17,
          vsHeroId: 47,
          doTips: ['a', 'b', 'c'],
          avoidTips: ['x'],
          powerSpikes: [
            { side: 'my', level: 6, note: 'n1' },
            { side: 'enemy', level: 6, note: 'n2' }
          ]
        }
      ]
    }
    expect(MatchupKnowledgeConfigSchema.safeParse(tooFewAvoidTips).success).toBe(false)
  })

  it('rejects powerSpikes missing one of the two sides', () => {
    const onlyMySide = {
      patch: '7.39',
      entries: [
        {
          heroId: 17,
          vsHeroId: 47,
          doTips: ['a', 'b', 'c'],
          avoidTips: ['x', 'y'],
          powerSpikes: [
            { side: 'my', level: 6, note: 'n1' },
            { side: 'my', level: 7, note: 'n2' }
          ]
        }
      ]
    }
    expect(MatchupKnowledgeConfigSchema.safeParse(onlyMySide).success).toBe(false)
  })

  it('rejects duplicate (heroId, vsHeroId) pair within one config', () => {
    const entry = {
      heroId: 17,
      vsHeroId: 47,
      doTips: ['a', 'b', 'c'],
      avoidTips: ['x', 'y'],
      powerSpikes: [
        { side: 'my', level: 6, note: 'n1' },
        { side: 'enemy', level: 6, note: 'n2' }
      ]
    }
    const dup = { patch: '7.39', entries: [entry, entry] }
    expect(MatchupKnowledgeConfigSchema.safeParse(dup).success).toBe(false)
  })

  it('defaults killWindows to an empty array when omitted', () => {
    const parsed = MatchupKnowledgeConfigSchema.parse({
      patch: '7.39',
      entries: [
        {
          heroId: 17,
          vsHeroId: 47,
          doTips: ['a', 'b', 'c'],
          avoidTips: ['x', 'y'],
          powerSpikes: [
            { side: 'my', level: 6, note: 'n1' },
            { side: 'enemy', level: 6, note: 'n2' }
          ]
        }
      ]
    })
    expect(parsed.entries[0]?.killWindows).toEqual([])
  })
})
