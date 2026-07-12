const HTTP_PREFIX = /^https?:\/\//i
const DNS_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/
const WHATWG_NUMERIC_LABEL = /^(?:[0-9]+|0[xX][0-9A-Fa-f]*)$/

const codePointLength = (value: string) => Array.from(value).length

const containsUnsafeLiteralCharacter = (value: string) =>
  value.includes('\\') || /[\s\p{C}]/u.test(value)

const isAscii = (value: string) =>
  Array.from(value).every((character) => (character.codePointAt(0) ?? 128) <= 127)

function rawAuthority(value: string, prefixLength: number): string | null {
  const remainder = value.slice(prefixLength)
  const boundaries = ['/', '?', '#']
    .map((delimiter) => remainder.indexOf(delimiter))
    .filter((position) => position >= 0)
  const boundary = boundaries.length === 0 ? remainder.length : Math.min(...boundaries)
  const authority = remainder.slice(0, boundary)

  if (authority.length === 0 || authority.includes('@') || authority.includes('%')) return null
  return authority
}

function isValidPort(rawPort: string | null): boolean {
  if (rawPort === null) return true
  if (!/^[0-9]+$/.test(rawPort)) return false
  const port = Number(rawPort)
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535
}

function isCanonicalIpv4(rawHost: string): boolean {
  const octets = rawHost.split('.')
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      if (!/^[0-9]+$/.test(octet)) return false
      const value = Number(octet)
      return value >= 0 && value <= 255 && String(value) === octet
    })
  )
}

function isBrowserSafeAceLabel(label: string): boolean {
  if (!label.toLowerCase().startsWith('xn--')) return true

  try {
    return new URL(`http://${label}/`).hostname.toLowerCase() === label.toLowerCase()
  } catch {
    return false
  }
}

function isValidIpv6Authority(authority: string, parsed: URL): boolean {
  const closingBracket = authority.indexOf(']')
  if (closingBracket <= 1) return false

  const rawHost = authority.slice(1, closingBracket)
  const remainder = authority.slice(closingBracket + 1)
  let rawPort: string | null = null

  if (remainder.length > 0) {
    if (!remainder.startsWith(':') || remainder.slice(1).includes(':')) return false
    rawPort = remainder.slice(1)
  }

  return (
    /^[0-9A-Fa-f:.]+$/.test(rawHost) &&
    parsed.hostname.startsWith('[') &&
    parsed.hostname.endsWith(']') &&
    isValidPort(rawPort)
  )
}

function isValidDnsOrIpv4Authority(authority: string, parsed: URL): boolean {
  if (authority.includes('[') || authority.includes(']')) return false
  if (authority.split(':').length > 2) return false

  const separator = authority.lastIndexOf(':')
  const rawHost = separator >= 0 ? authority.slice(0, separator) : authority
  const rawPort = separator >= 0 ? authority.slice(separator + 1) : null

  if (
    rawHost.length === 0 ||
    !isAscii(rawHost) ||
    parsed.hostname.toLowerCase() !== rawHost.toLowerCase() ||
    !isValidPort(rawPort)
  ) {
    return false
  }

  if (/^[0-9.]+$/.test(rawHost)) return isCanonicalIpv4(rawHost)

  const labels = rawHost.split('.')
  const finalLabel = labels.at(-1)
  return (
    rawHost.length <= 253 &&
    labels.every((label) => DNS_LABEL.test(label) && isBrowserSafeAceLabel(label)) &&
    finalLabel !== undefined &&
    !WHATWG_NUMERIC_LABEL.test(finalLabel)
  )
}

function safeParsedWorkflowLinkUrl(value: string): URL | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    codePointLength(value) > 2_048 ||
    containsUnsafeLiteralCharacter(value)
  ) {
    return null
  }

  const prefix = HTTP_PREFIX.exec(value)
  if (prefix === null) return null
  const authority = rawAuthority(value, prefix[0].length)
  if (authority === null) return null

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.hostname.length === 0 ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.origin === 'null' ||
    containsUnsafeLiteralCharacter(parsed.href)
  ) {
    return null
  }

  const authorityIsValid = authority.startsWith('[')
    ? isValidIpv6Authority(authority, parsed)
    : isValidDnsOrIpv4Authority(authority, parsed)
  return authorityIsValid ? parsed : null
}

export const isSafeWorkflowLinkUrl = (value: string): boolean =>
  safeParsedWorkflowLinkUrl(value) !== null

export const workflowLinkOrigin = (value: string): string | null =>
  safeParsedWorkflowLinkUrl(value)?.origin ?? null
