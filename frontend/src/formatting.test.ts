import { describe, expect, it } from 'vitest'
import { compactDateText, fileSizeText } from './formatting'

describe('compactDateText', () => {
  const now = new Date(2026, 7, 30, 18, 0)

  it('shows the time for a message received today', () => {
    const received = new Date(2026, 7, 30, 15, 25)

    expect(compactDateText(received.toISOString(), now)).toBe('3:25 PM')
  })

  it('shows the day and month for a message from another date', () => {
    const received = new Date(2026, 7, 5, 15, 25)

    expect(compactDateText(received.toISOString(), now)).toBe('5 Aug')
  })

  it('preserves unknown and invalid date outcomes', () => {
    expect(compactDateText('', now)).toBe('Unknown date')
    expect(compactDateText('Pending delivery', now)).toBe('Pending delivery')
  })
})

describe('fileSizeText', () => {
  it('formats attachment sizes with compact units', () => {
    expect(fileSizeText(5)).toBe('5 B')
    expect(fileSizeText(1536)).toBe('1.5 KB')
    expect(fileSizeText(2 * 1024 * 1024)).toBe('2 MB')
  })

  it('hides invalid attachment sizes', () => {
    expect(fileSizeText(-1)).toBe('')
    expect(fileSizeText(Number.NaN)).toBe('')
  })
})
