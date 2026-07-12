import { describe, expect, it } from 'vitest'

import urlCases from '../test/fixtures/workflowLinkUrlCases.json'
import { isSafeWorkflowLinkUrl, workflowLinkOrigin } from './workflowLinkUrl'

describe('workflow-link URL safety', () => {
  it.each(urlCases.accepted)('accepts $name', ({ value }) => {
    expect(isSafeWorkflowLinkUrl(value.trim())).toBe(true)
  })

  it.each(urlCases.rejected)('rejects $name', ({ value }) => {
    expect(isSafeWorkflowLinkUrl(value)).toBe(false)
  })

  it('derives an origin only from a browser-safe URL', () => {
    expect(workflowLinkOrigin('HTTPS://EXAMPLE.COM:443/path?query=yes#fragment')).toBe(
      'https://example.com',
    )
    expect(workflowLinkOrigin('http://[0:0:0:0:0:0:0:1]:5678/workflow')).toBe(
      'http://[::1]:5678',
    )
    expect(workflowLinkOrigin('javascript:alert(1)')).toBeNull()
    expect(workflowLinkOrigin('http://127.1/workflow')).toBeNull()
  })

  it.each([
    'http://localhost:1/path',
    'http://localhost:65535/path',
    'http://0.0.0.0/path',
    'http://255.255.255.255/path',
    'https://xn--v43d.example/docs',
  ])('accepts an additional browser-safe boundary: %s', (value) => {
    expect(isSafeWorkflowLinkUrl(value)).toBe(true)
  })

  it.each([
    'http://localhost:0/path',
    'http://localhost:65536/path',
    'http://localhost:/path',
    'http://localhost:+80/path',
    'http://localhost:abc/path',
    'http://127.000.000.001/path',
    'http://256.0.0.1/path',
    'http://1.2.3/path',
    'http://example.0X/path',
    'http://localhost/path\u200bsegment',
  ])('rejects an additional unsafe boundary: %s', (value) => {
    expect(isSafeWorkflowLinkUrl(value)).toBe(false)
  })
})
