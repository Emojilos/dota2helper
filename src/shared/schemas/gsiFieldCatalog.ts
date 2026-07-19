/**
 * Zod-схема контентного конфига gsi-field-catalog.json (F5, TASK-009/016, INV4).
 *
 * Раздел 5.2 PRD: `{ field_path, label_ru, category, format, preset }` —
 * каталог для конструктора виджетов F5. Наполняется ТОЛЬКО полями, реально
 * подтверждёнными ревизией GSI (TASK-009, docs/gsi-fields.md) — никаких
 * предположений о составе пакетов.
 *
 * fieldPath — строка-путь к полю в СЫРОМ GSI-пакете (snake_case, как у Valve,
 * напр. 'hero.health_percent'), а не в типизированном camelCase GameState:
 * каталог служит конструктору виджетов (TASK-016/017), который читает сырой
 * пакет напрямую — многие поля каталога (aghanims_scepter, gold_from_*,
 * abilities.abilityN.*, items.slotN.*) шире текущего GameState (TASK-004),
 * который транслирует только подмножество, нужное чистому движку.
 *
 * preset пока везде false: составные виджеты (таймер руны, счётчик стаков)
 * проектируются в TASK-016 — это отдельная задача с собственной логикой
 * вычисления, а не сырое поле.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'

export const GsiFieldCategorySchema = z.enum(['hero', 'player', 'match', 'abilities', 'items'])
export type GsiFieldCategory = z.infer<typeof GsiFieldCategorySchema>

export const GsiFieldFormatSchema = z.enum(['int', 'percent', 'time', 'gold', 'bool', 'text'])
export type GsiFieldFormat = z.infer<typeof GsiFieldFormatSchema>

export const GsiFieldCatalogEntrySchema = z.object({
  fieldPath: z.string().min(1),
  labelRu: z.string().min(1),
  category: GsiFieldCategorySchema,
  format: GsiFieldFormatSchema,
  /** Составной виджет вместо сырого поля (напр. rune-timer) — пока везде false, см. заголовок файла. */
  preset: z.boolean()
})
export type GsiFieldCatalogEntry = z.infer<typeof GsiFieldCatalogEntrySchema>

export const GsiFieldCatalogConfigSchema = z
  .object({
    fields: z.array(GsiFieldCatalogEntrySchema).min(1)
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>()
    for (const [index, field] of config.fields.entries()) {
      if (seen.has(field.fieldPath)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate gsi field catalog fieldPath '${field.fieldPath}'`,
          path: ['fields', index, 'fieldPath']
        })
      }
      seen.add(field.fieldPath)
    }
  })
export type GsiFieldCatalogConfig = z.infer<typeof GsiFieldCatalogConfigSchema>
