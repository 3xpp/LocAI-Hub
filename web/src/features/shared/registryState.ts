function unicodeCaseFold(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    const isCherokee =
      (codePoint >= 0x13a0 && codePoint <= 0x13ff) ||
      (codePoint >= 0xab70 && codePoint <= 0xabbf)
    if (character === 'ı') return character
    if (isCherokee) return character.toUpperCase()
    return character.toUpperCase().toLowerCase().replaceAll('ß', 'ss').replaceAll('ς', 'σ')
  }).join('')
}

export const registryTextLength = (value: string) => Array.from(value).length

export const normalizeRegistryTagForComparison = (value: string) =>
  value.trim().replace(/\s+/gu, ' ').split(' ').map(unicodeCaseFold).join(' ')

export function normalizeRegistryTag(value: string): string {
  if (value.includes(',')) throw new Error('Tags cannot contain commas')
  if (/\p{C}/u.test(value)) throw new Error('Tags cannot contain control characters')
  const normalized = normalizeRegistryTagForComparison(value)
  if (normalized.length === 0) throw new Error('Enter a tag first')
  if (registryTextLength(normalized) > 30) {
    throw new Error('Tags can contain at most 30 characters')
  }
  return normalized
}
