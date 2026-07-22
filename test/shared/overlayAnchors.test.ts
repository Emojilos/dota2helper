/**
 * overlayAnchors (F5, TASK-040): резолвер калиброванной позиции по разрешению
 * экрана + Zod-схема content/overlay-anchors.json.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolutionKey, resolveOverlayAnchor } from '@shared/overlay/overlayAnchors'
import { OverlayAnchorsConfigSchema } from '@shared/schemas/overlayAnchors'

describe('resolutionKey', () => {
  it('строит ключ вида ширинаxвысота', () => {
    expect(resolutionKey(1920, 1080)).toBe('1920x1080')
    expect(resolutionKey(2560, 1440)).toBe('2560x1440')
  })
})

describe('resolveOverlayAnchor', () => {
  const map = {
    default: { x: 0, y: 88 },
    '1920x1080': { x: 0, y: 90 }
  }

  it('возвращает координату для точного совпадения разрешения', () => {
    expect(resolveOverlayAnchor(map, 1920, 1080)).toEqual({ x: 0, y: 90 })
  })

  it('падает на default для неоткалиброванного разрешения', () => {
    expect(resolveOverlayAnchor(map, 2560, 1440)).toEqual({ x: 0, y: 88 })
  })
})

describe('content/overlay-anchors.json', () => {
  it('валидируется схемой и содержит default-анкер для standardPanel', () => {
    const raw: unknown = JSON.parse(readFileSync(resolve(__dirname, '../../content/overlay-anchors.json'), 'utf-8'))
    const config = OverlayAnchorsConfigSchema.parse(raw)
    expect(config.standardPanel.default).toBeDefined()
  })
})
