/**
 * GsiConfigInstaller — установка/откат gamestate_integration-конфига (TASK-006).
 *
 * Штатный механизм Valve (INV3): кладём/удаляем ОДИН .cfg-файл в папке Dota,
 * которую сама игра вычитывает при старте. Никаких инъекций в процесс игры.
 *
 * Разделение preview/install НЕ случайно: preview() не трогает диск и
 * используется UI (TASK-007+) для показа пути и содержимого ДО подтверждения
 * пользователем (acceptance criteria TASK-006). install() пишет файл только
 * после явного вызова — вызывающая сторона обязана получить подтверждение
 * заранее.
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_GSI_CONFIG_FILE_NAME = 'gamestate_integration_midmind.cfg'

export interface GsiConfigInstallerOptions {
  fileName?: string
  logger?: (message: string) => void
}

export interface GsiConfigPreview {
  filePath: string
  content: string
  /** Уже установлен ли файл по этому пути (для UX «переустановить»/«откатить»). */
  alreadyInstalled: boolean
}

export class GsiConfigInstaller {
  private readonly fileName: string
  private readonly log: (message: string) => void

  constructor(options: GsiConfigInstallerOptions = {}) {
    this.fileName = options.fileName ?? DEFAULT_GSI_CONFIG_FILE_NAME
    this.log = options.logger ?? ((): void => {})
  }

  filePath(cfgDir: string): string {
    return join(cfgDir, this.fileName)
  }

  /** Показывает путь/содержимое без записи на диск — вызывать перед подтверждением. */
  preview(cfgDir: string, content: string): GsiConfigPreview {
    const filePath = this.filePath(cfgDir)
    return { filePath, content, alreadyInstalled: existsSync(filePath) }
  }

  isInstalled(cfgDir: string): boolean {
    return existsSync(this.filePath(cfgDir))
  }

  /** Создаёт cfgDir при необходимости и пишет файл. Вызывать ТОЛЬКО после подтверждения. */
  install(cfgDir: string, content: string): string {
    mkdirSync(cfgDir, { recursive: true })
    const filePath = this.filePath(cfgDir)
    writeFileSync(filePath, content, 'utf-8')
    this.log(`GSI config installed at ${filePath}`)
    return filePath
  }

  /** Откат: удаляет установленный файл, если он есть. Возвращает, был ли он удалён. */
  uninstall(cfgDir: string): boolean {
    const filePath = this.filePath(cfgDir)
    if (!existsSync(filePath)) {
      return false
    }
    unlinkSync(filePath)
    this.log(`GSI config removed from ${filePath}`)
    return true
  }
}
