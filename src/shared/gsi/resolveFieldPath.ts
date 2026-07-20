/**
 * resolveFieldPath — читает значение по dot-path (напр. 'hero.health_percent',
 * как в content/gsi-field-catalog.json, TASK-009) из WidgetGsiSnapshot (F5,
 * TASK-016). Используется конструктором виджетов (WidgetRegistry, renderer) для
 * дженерик-рендера сырых полей каталога без знания их конкретных имён в коде
 * (INV4 — новое поле каталога становится доступным без правки кода).
 *
 * INV2: модуль чист (без electron/react/fs/сети).
 */

export function resolveFieldPath(snapshot: unknown, fieldPath: string): unknown {
  return fieldPath.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') {
      return undefined
    }
    return (node as Record<string, unknown>)[key]
  }, snapshot)
}
