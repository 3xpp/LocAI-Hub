import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

const stylesheet = readFileSync('src/styles.css', 'utf8')

function declarationBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(
    stylesheet,
  )
  expect(match, `missing ${selector} rule`).not.toBeNull()
  return match?.[1] ?? ''
}

it('does not force root elements wider than a scrollbar-reduced 320px viewport', () => {
  expect(declarationBlock('html')).not.toMatch(/min-width:\s*320px/)
  expect(declarationBlock('body')).not.toMatch(/min-width:\s*320px/)
})
