/**
 * formatCompositeStatWidgets (F5, TASK-040): KDA/LH-DN/GPM-XPM в одну строку
 * для дефолтного набора виджетов пресета 'standardPanel'.
 */
import { describe, expect, it } from 'vitest'
import { formatKda, formatLhDn, formatGpmXpm } from '@shared/widgets/formatCompositeStatWidgets'

describe('formatKda', () => {
  it('форматирует K/D/A через слэш', () => {
    expect(formatKda(5, 2, 8)).toBe('5/2/8')
  })

  it('округляет нецелые значения', () => {
    expect(formatKda(5.4, 2.6, 8)).toBe('5/3/8')
  })

  it('подставляет — вместо отсутствующего значения', () => {
    expect(formatKda(undefined, 2, 8)).toBe('—/2/8')
  })
})

describe('formatLhDn', () => {
  it('форматирует LH/DN через слэш', () => {
    expect(formatLhDn(120, 4)).toBe('120/4')
  })

  it('подставляет — вместо отсутствующего значения', () => {
    expect(formatLhDn(null, undefined)).toBe('—/—')
  })
})

describe('formatGpmXpm', () => {
  it('форматирует GPM/XPM через слэш', () => {
    expect(formatGpmXpm(450, 520)).toBe('450/520')
  })
})
