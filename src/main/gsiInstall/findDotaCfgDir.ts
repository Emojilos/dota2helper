/**
 * Поиск папки установки Dota 2 (TASK-006) для установки gamestate_integration
 * конфига в `.../dota 2 beta/game/dota/cfg/gamestate_integration/`.
 *
 * MidMind — приложение для Windows (раздел 2 PRD), поэтому в приоритете
 * Windows-пути Steam на разных дисках; macOS/Linux добавлены для dev-окружения
 * и на случай будущего кросс-платформенного использования.
 *
 * Поиск сначала строит список путей-кандидатов чисто (без fs — тестируемо без
 * временных файлов), затем findDotaCfgDir проверяет их на диске.
 */
import { existsSync } from 'node:fs'
import { join, posix, win32 } from 'node:path'

const DOTA_RELATIVE_PATH = ['steamapps', 'common', 'dota 2 beta', 'game', 'dota']
const WINDOWS_DRIVE_LETTERS = ['C', 'D', 'E', 'F']

export interface CandidateRootsOptions {
  platform?: NodeJS.Platform
  homeDir?: string
  /**
   * Дополнительные корни Steam-библиотек (напр. распарсенные из
   * steamapps/libraryfolders.vdf) — добавляются перед дефолтными путями.
   */
  extraSteamRoots?: string[]
}

/**
 * Строит список путей-кандидатов до `.../dota 2 beta/game/dota` в порядке
 * приоритета. Чистая функция — path.join не трогает диск.
 */
export function listCandidateDotaInstallRoots(options: CandidateRootsOptions = {}): string[] {
  const platform = options.platform ?? process.platform
  const homeDir = options.homeDir ?? ''
  const steamRoots: string[] = [...(options.extraSteamRoots ?? [])]
  // Путь строится под ЦЕЛЕВУЮ platform, а не под platform хост-машины,
  // где реально выполняется код (важно для headless-тестов на macOS/Linux,
  // проверяющих Windows-кандидатов с обратными слэшами).
  const pathImpl = platform === 'win32' ? win32 : posix

  if (platform === 'win32') {
    for (const drive of WINDOWS_DRIVE_LETTERS) {
      steamRoots.push(`${drive}:\\Program Files (x86)\\Steam`)
      steamRoots.push(`${drive}:\\Steam`)
      steamRoots.push(`${drive}:\\SteamLibrary`)
    }
  } else if (platform === 'darwin') {
    steamRoots.push(pathImpl.join(homeDir, 'Library', 'Application Support', 'Steam'))
  } else {
    steamRoots.push(pathImpl.join(homeDir, '.local', 'share', 'Steam'))
    steamRoots.push(pathImpl.join(homeDir, '.steam', 'steam'))
  }

  return steamRoots.map((root) => pathImpl.join(root, ...DOTA_RELATIVE_PATH))
}

export interface DotaCfgLocation {
  /** `.../dota 2 beta/game/dota` — реально найденный на диске корень установки. */
  installRoot: string
  /** `.../dota 2 beta/game/dota/cfg/gamestate_integration` — куда класть .cfg. */
  cfgDir: string
}

/**
 * Проверяет кандидатов на диске и возвращает первый существующий (по наличию
 * `game/dota` — самой папки gamestate_integration может ещё не быть, её создаст
 * install()). Возвращает null, если Dota не найдена ни по одному пути —
 * вызывающий код должен предложить ручной выбор папки.
 */
export function findDotaCfgDir(
  candidateRoots: string[],
  exists: (path: string) => boolean = existsSync
): DotaCfgLocation | null {
  for (const installRoot of candidateRoots) {
    if (exists(installRoot)) {
      return { installRoot, cfgDir: join(installRoot, 'cfg', 'gamestate_integration') }
    }
  }
  return null
}

/** Строит cfgDir для вручную выбранного пользователем корня установки Dota. */
export function cfgDirFromInstallRoot(installRoot: string): DotaCfgLocation {
  return { installRoot, cfgDir: join(installRoot, 'cfg', 'gamestate_integration') }
}
