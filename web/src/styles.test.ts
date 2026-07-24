import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

const stylesheet = readFileSync('src/styles.css', 'utf8')

function declarationBlock(selector: string): string {
  return declarationBlockFrom(stylesheet, selector)
}

function declarationBlockFrom(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(
    source,
  )
  expect(match, `missing ${selector} rule`).not.toBeNull()
  return match?.[1] ?? ''
}

function mediaSlice(maxWidth: number, nextMaxWidth?: number): string {
  const start = stylesheet.indexOf(`@media (max-width: ${maxWidth}px)`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = nextMaxWidth
    ? stylesheet.indexOf(
        `@media (max-width: ${nextMaxWidth}px)`,
        start + 1,
      )
    : stylesheet.indexOf('@media (prefers-reduced-motion', start + 1)
  expect(end).toBeGreaterThan(start)
  return stylesheet.slice(start, end)
}

it('does not force root elements wider than a scrollbar-reduced 320px viewport', () => {
  expect(declarationBlock('html')).not.toMatch(/min-width:\s*320px/)
  expect(declarationBlock('body')).not.toMatch(/min-width:\s*320px/)
})

it('uses an exact five-column base navigation with accessible button geometry', () => {
  expect(declarationBlock('.view-switcher')).toMatch(/display:\s*grid/)
  expect(declarationBlock('.view-switcher')).toMatch(
    /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
  )
  expect(declarationBlock('.view-switcher button')).toMatch(/min-width:\s*0/)
  expect(declarationBlock('.view-switcher button')).toMatch(
    /min-height:\s*44px/,
  )
})

it('moves all five navigation labels to a dedicated tablet row at 1080px', () => {
  const tablet = mediaSlice(1080, 880)
  const narrower = mediaSlice(880, 600)

  expect(declarationBlockFrom(tablet, '.masthead__controls')).toMatch(
    /display:\s*contents/,
  )
  expect(declarationBlockFrom(tablet, '.view-switcher')).toMatch(
    /grid-column:\s*1\s*\/\s*-1/,
  )
  expect(declarationBlockFrom(tablet, '.view-switcher')).toMatch(
    /grid-row:\s*2/,
  )
  expect(declarationBlockFrom(tablet, '.view-switcher')).toMatch(
    /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
  )
  expect(narrower).not.toMatch(/\.masthead__controls\s*\{/)
})

it('uses an exact three-plus-two six-track navigation grid on mobile', () => {
  const mobile = mediaSlice(600)

  expect(declarationBlockFrom(mobile, '.view-switcher')).toMatch(
    /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/,
  )
  expect(
    declarationBlockFrom(
      mobile,
      '.view-switcher button:nth-child(-n + 3)',
    ),
  ).toMatch(/grid-column:\s*span\s+2/)
  expect(
    declarationBlockFrom(
      mobile,
      '.view-switcher button:nth-child(n + 4)',
    ),
  ).toMatch(/grid-column:\s*span\s+3/)
  expect(declarationBlockFrom(mobile, '.integration-boundary')).toMatch(
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  )
  expect(declarationBlockFrom(mobile, '.integration-boundary')).toMatch(
    /align-items:\s*start/,
  )
  const integrationsGrid =
    /\.integrations-toolbar,\s*\.integration-telemetry\s*\{([^}]*)\}/.exec(
      mobile,
    )
  expect(integrationsGrid).not.toBeNull()
  expect(integrationsGrid?.[1]).toMatch(
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  )
  expect(declarationBlockFrom(mobile, '.integration-refresh')).toMatch(
    /width:\s*100%/,
  )
})

it('keeps layout boundaries shrinkable without fixed minimum widths', () => {
  for (const selector of [
    'html',
    'body',
    '.dashboard',
    '.masthead',
    '.masthead__controls',
    '.view-switcher',
  ]) {
    expect(declarationBlock(selector)).not.toMatch(
      /min-width:\s*(?!0(?:[;\s]|$))\d+(?:\.\d+)?(?:px|rem|em)/,
    )
  }
})

it('keeps every mobile navigation label visible in normal flow', () => {
  const mobile = mediaSlice(600)
  const navigationRules = [
    declarationBlockFrom(mobile, '.view-switcher'),
    declarationBlockFrom(mobile, '.view-switcher button'),
    declarationBlockFrom(
      mobile,
      '.view-switcher button:nth-child(-n + 3)',
    ),
    declarationBlockFrom(
      mobile,
      '.view-switcher button:nth-child(n + 4)',
    ),
  ].join('\n')

  expect(navigationRules).not.toMatch(
    /(?:display:\s*none|visibility:\s*hidden|overflow:\s*hidden|text-overflow|white-space:\s*nowrap|position:\s*absolute)/,
  )
})
