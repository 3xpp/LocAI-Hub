import { describe, expect, it } from 'vitest'

import {
  normalizeRegistryTag,
  normalizeRegistryTagForComparison,
  registryTextLength,
} from './registryState'

describe('shared registry state helpers', () => {
  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect(registryTextLength('A🤖')).toBe(2)
    expect(registryTextLength('e\u0301')).toBe(2)
  })

  it('canonicalizes whitespace and the established Unicode case-fold cases', () => {
    expect(normalizeRegistryTag('  Local   AI  ')).toBe('local ai')
    expect(normalizeRegistryTag('straße ﬀ ſ ς')).toBe('strasse ff s σ')
    expect(normalizeRegistryTag('ı')).toBe('ı')
    expect(normalizeRegistryTag('Ꭰ')).toBe('Ꭰ')
    expect(normalizeRegistryTag('ꭰ')).toBe('Ꭰ')
  })

  it('retains comparison canonicalization for already persisted tag arrays', () => {
    expect(normalizeRegistryTagForComparison('  CODE   Review  ')).toBe('code review')
    expect(normalizeRegistryTagForComparison('   ')).toBe('')
  })

  it('rejects the established empty, comma, control, and length boundaries', () => {
    expect(() => normalizeRegistryTag('   ')).toThrow('Enter a tag first')
    expect(() => normalizeRegistryTag('bad,tag')).toThrow('Tags cannot contain commas')
    expect(() => normalizeRegistryTag('bad\u0000tag')).toThrow(
      'Tags cannot contain control characters',
    )
    expect(normalizeRegistryTag('🤖'.repeat(30))).toBe('🤖'.repeat(30))
    expect(() => normalizeRegistryTag('🤖'.repeat(31))).toThrow(
      'Tags can contain at most 30 characters',
    )
  })
})
