import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackendHttpError } from './client'
import {
  getN8nStatus,
  type N8nStatusResponse,
} from './integrations'

const maxCanonicalOrigin = `http://${'a'.repeat(2_041)}`
const overlongCanonicalOrigin = `http://${'a'.repeat(2_042)}`

const validStates: N8nStatusResponse[] = [
  {
    state: 'unconfigured',
    base_url: null,
    liveness: 'not_checked',
    readiness: 'not_checked',
    error: null,
  },
  {
    state: 'online',
    base_url: 'http://n8n.test',
    liveness: 'passed',
    readiness: 'passed',
    error: null,
  },
  {
    state: 'degraded',
    base_url: 'http://n8n.test',
    liveness: 'passed',
    readiness: 'failed',
    error: 'n8n is reachable but not ready',
  },
  {
    state: 'offline',
    base_url: 'http://n8n.test',
    liveness: 'failed',
    readiness: 'not_checked',
    error: 'Connection failed',
  },
  {
    state: 'offline',
    base_url: 'Invalid configuration',
    liveness: 'not_checked',
    readiness: 'not_checked',
    error: 'Invalid n8n base URL',
  },
  {
    state: 'offline',
    base_url: 'http://n8n.test',
    liveness: 'failed',
    readiness: 'not_checked',
    error: 'n8n health check failed',
  },
  {
    state: 'online',
    base_url: maxCanonicalOrigin,
    liveness: 'passed',
    readiness: 'passed',
    error: null,
  },
  {
    state: 'online',
    base_url: 'http://192.168.1.12:5678',
    liveness: 'passed',
    readiness: 'passed',
    error: null,
  },
  {
    state: 'online',
    base_url: 'http://[::1]:5678',
    liveness: 'passed',
    readiness: 'passed',
    error: null,
  },
  {
    state: 'online',
    base_url: 'http://dead.beef:5678',
    liveness: 'passed',
    readiness: 'passed',
    error: null,
  },
  {
    state: 'online',
    base_url: 'http://[::ffff:c0a8:101]:5678',
    liveness: 'passed',
    readiness: 'passed',
    error: null,
  },
]

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('Integrations API', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests only the relative Hub path and forwards AbortSignal', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(jsonResponse(validStates[0]))

    await expect(getN8nStatus(controller.signal)).resolves.toEqual(validStates[0])

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/n8n/status', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
  })

  it.each(validStates)('accepts normalized state $state', async (payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await expect(getN8nStatus()).resolves.toEqual(payload)
  })

  it.each([
    { ...validStates[0], private: 'no' },
    {
      state: 'unconfigured',
      base_url: null,
      liveness: 'not_checked',
      readiness: 'not_checked',
    },
    { ...validStates[0], state: 'warming' },
    { ...validStates[0], liveness: 'unknown' },
    { ...validStates[0], base_url: 'http://n8n.test' },
    { ...validStates[1], readiness: 'failed' },
    { ...validStates[1], base_url: null },
    { ...validStates[1], base_url: 12 },
    { ...validStates[1], liveness: null },
    { ...validStates[1], error: false },
    { ...validStates[1], base_url: 'http://n8n.test/' },
    { ...validStates[1], base_url: 'HTTP://N8N.TEST:80/' },
    { ...validStates[1], base_url: 'http://admin:private@n8n.test' },
    { ...validStates[1], base_url: 'http://n8n.test/private' },
    { ...validStates[1], base_url: overlongCanonicalOrigin },
    { ...validStates[1], base_url: 'http://[0:0:0:0:0:0:0:1]:5678' },
    { ...validStates[1], base_url: 'http://[::ffff:192.168.1.1]:5678' },
    { ...validStates[1], base_url: 'http://[fe80::1%25eth0]:5678' },
    { ...validStates[1], base_url: 'http://127.1:5678' },
    { ...validStates[1], base_url: 'http://2130706433:5678' },
    { ...validStates[1], base_url: 'http://0x7f000001:5678' },
    { ...validStates[1], base_url: 'http://127.000.000.001:5678' },
    { ...validStates[1], base_url: 'http://example.1:5678' },
    { ...validStates[1], base_url: 'http://example.0001:5678' },
    { ...validStates[1], base_url: 'http://example.0x1:5678' },
    { ...validStates[1], base_url: 'http://example.0X:5678' },
    { ...validStates[1], base_url: 'http://n8n.test.' },
    { ...validStates[1], base_url: 'http://127.1.' },
    { ...validStates[1], base_url: 'http://2130706433.' },
    { ...validStates[1], base_url: 'http://0x7f000001.' },
    { ...validStates[1], base_url: 'http://127.000.000.001.' },
    { ...validStates[1], base_url: 'http://example.1.' },
    { ...validStates[1], base_url: 'http://example.0x1.' },
    { ...validStates[1], base_url: 'http://%65xample.com' },
    { ...validStates[1], base_url: 'http://example%2ecom' },
    { ...validStates[1], base_url: 'http://a%20b' },
    { ...validStates[1], base_url: 'http://a\\b' },
    { ...validStates[1], base_url: 'http://a|b' },
    { ...validStates[1], base_url: 'http://a%5eb' },
    { ...validStates[1], base_url: 'http://n8n.test:0' },
    { ...validStates[2], error: 'private detail' },
    { ...validStates[3], liveness: 'passed' },
    { ...validStates[3], error: 'unknown error' },
    { ...validStates[4], base_url: 'http://n8n.test' },
    [],
    null,
    'not an object',
  ])('rejects malformed or impossible payload %#', async (payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await expect(getN8nStatus()).rejects.toThrow(
      'Backend returned an invalid response',
    )
  })

  it('preserves fixed HTTP, network, invalid JSON, and abort behavior', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('aborted', 'AbortError')
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ private: 'no' }, 503))
      .mockRejectedValueOnce(new TypeError('private network detail'))
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockRejectedValueOnce(abortError)

    const httpError = await getN8nStatus().catch((error: unknown) => error)
    expect(httpError).toBeInstanceOf(BackendHttpError)
    expect(httpError).toMatchObject({
      status: 503,
      message: 'Backend returned HTTP 503',
    })
    await expect(getN8nStatus()).rejects.toThrow('Unable to reach the backend')
    await expect(getN8nStatus()).rejects.toThrow(
      'Backend returned an invalid response',
    )
    await expect(getN8nStatus(controller.signal)).rejects.toBe(abortError)
  })

  it('propagates an abort raised during body decoding', async () => {
    const abortError = new DOMException('aborted while decoding', 'AbortError')
    const json = vi.fn().mockRejectedValue(abortError)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json,
    } as unknown as Response)

    await expect(getN8nStatus()).rejects.toBe(abortError)
  })

  it('never fetches the returned provider origin', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(validStates[1]))
    await getN8nStatus()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).not.toBe('http://n8n.test')
  })
})
