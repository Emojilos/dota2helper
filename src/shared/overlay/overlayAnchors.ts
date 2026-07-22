/**
 * Резолвер калиброванной позиции оверлея по разрешению экрана (F5, TASK-040).
 * Чистая функция (INV2) — main передаёт width/height из electron.screen, здесь
 * только lookup по content/overlay-anchors.json + фолбэк на 'default', пока
 * конкретное разрешение владельца не откалибровано.
 */
import type { OverlayAnchorPosition, OverlayAnchorResolutionMap } from '@shared/schemas/overlayAnchors'

/** Ключ разрешения в overlay-anchors.json, напр. resolutionKey(1920, 1080) === '1920x1080'. */
export function resolutionKey(width: number, height: number): string {
  return `${width}x${height}`
}

/** Координата для разрешения, либо 'default' — если разрешение ещё не откалибровано. */
export function resolveOverlayAnchor(
  map: OverlayAnchorResolutionMap,
  width: number,
  height: number
): OverlayAnchorPosition {
  return map[resolutionKey(width, height)] ?? map.default
}
