/**
 * mirrorContentDir — копирует контентные конфиги из встроенного `content/`
 * (read-only внутри упакованного приложения) в записываемый каталог userData,
 * чтобы правки пользователя переживали обновление приложения и работал fs.watch
 * (TASK-011). Копирует только отсутствующие файлы — существующие (уже правленые
 * пользователем) НЕ перезатирает.
 *
 * В dev main может указывать ConfigLoader прямо на `content/`; mirror нужен в
 * проде, где `content/` лежит внутри asar/ресурсов и недоступен на запись.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Гарантирует наличие каталога `targetDir` и копирует в него *.json из
 * `sourceDir`, которых там ещё нет. Возвращает имена скопированных файлов.
 */
export function mirrorContentDir(sourceDir: string, targetDir: string): string[] {
  mkdirSync(targetDir, { recursive: true })
  const copied: string[] = []
  for (const fileName of readdirSync(sourceDir)) {
    if (!fileName.endsWith('.json')) {
      continue
    }
    const target = join(targetDir, fileName)
    if (!existsSync(target)) {
      copyFileSync(join(sourceDir, fileName), target)
      copied.push(fileName)
    }
  }
  return copied
}
