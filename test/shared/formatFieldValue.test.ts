/**
 * formatFieldValue (F5, TASK-016): дженерик-форматирование сырого GSI-поля по
 * format каталога — единственное место, определяющее display для каждого
 * format, независимо от конкретного fieldPath (INV4: новое поле того же
 * format форматируется без правки кода).
 */
import { describe, expect, it } from 'vitest'
import { formatFieldValue } from '@shared/gsi/formatFieldValue'

describe('formatFieldValue', () => {
  it('bool', () => {
    expect(formatFieldValue(true, 'bool')).toBe('да')
    expect(formatFieldValue(false, 'bool')).toBe('нет')
    expect(formatFieldValue(1, 'bool')).toBe('да')
    expect(formatFieldValue(0, 'bool')).toBe('нет')
  })

  it('int/gold округляют до целого', () => {
    expect(formatFieldValue(45, 'int')).toBe('45')
    expect(formatFieldValue(44.6, 'int')).toBe('45')
    expect(formatFieldValue(1234.4, 'gold')).toBe('1234')
  })

  it('percent добавляет знак %', () => {
    expect(formatFieldValue(87, 'percent')).toBe('87%')
    expect(formatFieldValue(87.5, 'percent')).toBe('88%')
  })

  it('time форматирует как MM:SS с сохранением знака', () => {
    expect(formatFieldValue(125, 'time')).toBe('2:05')
    expect(formatFieldValue(-30, 'time')).toBe('-0:30')
  })

  it('text отдаёт строку как есть', () => {
    expect(formatFieldValue('Radiant', 'text')).toBe('Radiant')
    expect(formatFieldValue(42, 'text')).toBe('42')
  })

  it('undefined/null → нет данных (—) для любого format', () => {
    expect(formatFieldValue(undefined, 'int')).toBe('—')
    expect(formatFieldValue(null, 'percent')).toBe('—')
    expect(formatFieldValue(undefined, 'bool')).toBe('—')
  })

  it('нечисловое значение для числовых format → —', () => {
    expect(formatFieldValue('not-a-number', 'int')).toBe('—')
    expect(formatFieldValue('not-a-number', 'time')).toBe('—')
  })
})
