import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GsiFieldCatalogConfigSchema } from '@shared/schemas/gsiFieldCatalog'

function loadConfig(): ReturnType<typeof GsiFieldCatalogConfigSchema.parse> {
  const raw: unknown = JSON.parse(
    readFileSync(resolve(__dirname, '../../content/gsi-field-catalog.json'), 'utf-8')
  )
  return GsiFieldCatalogConfigSchema.parse(raw)
}

/** Реальный IN_PROGRESS-пакет ranked-1 (TASK-009): герой выбран, способности/предметы заполнены. */
function loadRankedSample(): unknown {
  return JSON.parse(
    readFileSync(
      resolve(__dirname, '../fixtures/gsi/raw/ranked-1/00612_20260719_183841.json'),
      'utf-8'
    )
  )
}

/** Разбирает fieldPath ('hero.health_percent') по сырому GSI-пакету; undefined, если пути нет. */
function resolveFieldPath(packet: unknown, fieldPath: string): unknown {
  return fieldPath.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key]
  }, packet)
}

describe('TASK-009: gsi-field-catalog.json schema + content', () => {
  it('validates content/gsi-field-catalog.json against the schema', () => {
    const config = loadConfig()
    expect(config.fields.length).toBeGreaterThan(0)
  })

  it('has no duplicate fieldPath entries', () => {
    const config = loadConfig()
    const paths = config.fields.map((field) => field.fieldPath)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('rejects an entry with unknown category or format', () => {
    expect(
      GsiFieldCatalogConfigSchema.safeParse({
        fields: [{ fieldPath: 'hero.level', labelRu: 'Уровень', category: 'draft', format: 'int', preset: false }]
      }).success
    ).toBe(false)
    expect(
      GsiFieldCatalogConfigSchema.safeParse({
        fields: [{ fieldPath: 'hero.level', labelRu: 'Уровень', category: 'hero', format: 'enum', preset: false }]
      }).success
    ).toBe(false)
  })

  it('rejects duplicate fieldPath within one config', () => {
    const dup = {
      fields: [
        { fieldPath: 'hero.level', labelRu: 'Уровень', category: 'hero', format: 'int', preset: false },
        { fieldPath: 'hero.level', labelRu: 'Уровень (дубль)', category: 'hero', format: 'int', preset: false }
      ]
    }
    expect(GsiFieldCatalogConfigSchema.safeParse(dup).success).toBe(false)
  })

  it('every cataloged fieldPath resolves to a defined value in a real captured GSI packet (ranked-1)', () => {
    const config = loadConfig()
    const packet = loadRankedSample()
    for (const field of config.fields) {
      const value = resolveFieldPath(packet, field.fieldPath)
      expect(value, `fieldPath '${field.fieldPath}' not found in captured fixture`).toBeDefined()
    }
  })
})
