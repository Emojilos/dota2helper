/**
 * Тесты установщика GSI-конфига (TASK-006).
 *
 * Покрывают test_steps задачи (headless-эквивалент — реальный запуск Dota
 * недостижим в этом окружении, см. progress.txt):
 *  - Шаг 1: install() на тестовом пути пишет файл с ожидаемым содержимым.
 *  - Шаг 3: uninstall() удаляет файл; повторный isInstalled()/preview() снова
 *    показывает "не установлено", т.е. следующий запуск снова предложил бы установку.
 * Плюс: findDotaCfgDir — поиск среди кандидатов, поведение при отсутствии Dota.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import {
  buildGsiConfigContent,
  cfgDirFromInstallRoot,
  findDotaCfgDir,
  GsiConfigInstaller,
  listCandidateDotaInstallRoots
} from '@main/gsiInstall'

describe('buildGsiConfigContent', () => {
  it('embeds uri (host:port) and auth token into the Valve-format cfg', () => {
    const content = buildGsiConfigContent({ host: '127.0.0.1', port: 3001, token: 'secret-token' })
    expect(content).toContain('"uri"           "http://127.0.0.1:3001/"')
    expect(content).toContain('"token"         "secret-token"')
    expect(content).toContain('"MidMind GSI Integration"')
  })

  it('allows a custom app name (debug label)', () => {
    const content = buildGsiConfigContent({ host: '127.0.0.1', port: 3000, token: 't', appName: 'Custom' })
    expect(content).toContain('"Custom"')
  })
})

describe('listCandidateDotaInstallRoots', () => {
  it('builds Windows candidates across common drive letters', () => {
    const roots = listCandidateDotaInstallRoots({ platform: 'win32' })
    expect(roots).toContain('C:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta\\game\\dota')
    expect(roots.some((root) => root.startsWith('D:\\'))).toBe(true)
  })

  it('builds a macOS candidate under the given home directory', () => {
    const roots = listCandidateDotaInstallRoots({ platform: 'darwin', homeDir: '/Users/tester' })
    expect(roots).toContain(
      join('/Users/tester', 'Library', 'Application Support', 'Steam', 'steamapps', 'common', 'dota 2 beta', 'game', 'dota')
    )
  })

  it('prepends extraSteamRoots (e.g. from libraryfolders.vdf) before defaults', () => {
    const roots = listCandidateDotaInstallRoots({ platform: 'win32', extraSteamRoots: ['E:\\Games\\Steam'] })
    expect(roots[0]).toBe(win32.join('E:\\Games\\Steam', 'steamapps', 'common', 'dota 2 beta', 'game', 'dota'))
  })
})

describe('findDotaCfgDir', () => {
  it('returns the first candidate that exists on disk', () => {
    const exists = (path: string): boolean => path === '/found/dota'
    const result = findDotaCfgDir(['/missing/dota', '/found/dota', '/also/missing'], exists)
    expect(result).toEqual({ installRoot: '/found/dota', cfgDir: join('/found/dota', 'cfg', 'gamestate_integration') })
  })

  it('returns null when no candidate exists (manual folder selection required)', () => {
    const result = findDotaCfgDir(['/missing/a', '/missing/b'], () => false)
    expect(result).toBeNull()
  })
})

let dir: string | null = null

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = null
  }
})

describe('GsiConfigInstaller', () => {
  it('preview() shows the path/content without writing to disk', () => {
    dir = mkdtempSync(join(tmpdir(), 'midmind-gsi-install-'))
    const location = cfgDirFromInstallRoot(dir)
    const installer = new GsiConfigInstaller()
    const content = buildGsiConfigContent({ host: '127.0.0.1', port: 3000, token: 'tok' })

    const preview = installer.preview(location.cfgDir, content)

    expect(preview.filePath).toBe(join(location.cfgDir, 'gamestate_integration_midmind.cfg'))
    expect(preview.content).toBe(content)
    expect(preview.alreadyInstalled).toBe(false)
    expect(existsSync(preview.filePath)).toBe(false)
  })

  it('install() creates cfgDir if missing and writes the exact previewed content', () => {
    dir = mkdtempSync(join(tmpdir(), 'midmind-gsi-install-'))
    const location = cfgDirFromInstallRoot(dir)
    const installer = new GsiConfigInstaller()
    const content = buildGsiConfigContent({ host: '127.0.0.1', port: 3000, token: 'tok' })

    const filePath = installer.install(location.cfgDir, content)

    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toBe(content)
    expect(installer.isInstalled(location.cfgDir)).toBe(true)
  })

  it('uninstall() removes the file, making the next isInstalled() check false again', () => {
    dir = mkdtempSync(join(tmpdir(), 'midmind-gsi-install-'))
    const location = cfgDirFromInstallRoot(dir)
    const installer = new GsiConfigInstaller()
    const content = buildGsiConfigContent({ host: '127.0.0.1', port: 3000, token: 'tok' })
    installer.install(location.cfgDir, content)

    const removed = installer.uninstall(location.cfgDir)

    expect(removed).toBe(true)
    expect(installer.isInstalled(location.cfgDir)).toBe(false)
    expect(installer.preview(location.cfgDir, content).alreadyInstalled).toBe(false)
  })

  it('uninstall() on a non-installed cfgDir is a no-op that returns false', () => {
    dir = mkdtempSync(join(tmpdir(), 'midmind-gsi-install-'))
    const location = cfgDirFromInstallRoot(dir)
    const installer = new GsiConfigInstaller()

    expect(installer.uninstall(location.cfgDir)).toBe(false)
  })
})
