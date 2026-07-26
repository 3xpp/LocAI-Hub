import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackendHttpError } from './client'
import {
  N8nWorkflowInventoryContractError,
  getN8nWorkflowInventory,
  type N8nWorkflowInventoryResponse,
} from './n8nWorkflowInventory'

const available: N8nWorkflowInventoryResponse = {
  state: 'available',
  items: [
    {
      name: 'Daily local backup',
      active: true,
      updated_at: '2026-07-26T08:30:00Z',
    },
  ],
  truncated: false,
  error: null,
}

const validStates: N8nWorkflowInventoryResponse[] = [
  available,
  {
    state: 'unconfigured',
    items: [],
    truncated: false,
    error: null,
  },
  {
    state: 'invalid_configuration',
    items: [],
    truncated: false,
    error: 'Invalid n8n inventory configuration',
  },
  {
    state: 'access_denied',
    items: [],
    truncated: false,
    error: 'n8n denied workflow inventory access',
  },
  {
    state: 'unavailable',
    items: [],
    truncated: false,
    error: 'n8n workflow inventory is unavailable',
  },
  {
    state: 'timeout',
    items: [],
    truncated: false,
    error: 'n8n workflow inventory timed out',
  },
  {
    state: 'invalid_response',
    items: [],
    truncated: false,
    error: 'n8n returned an invalid workflow inventory',
  },
]

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('n8n workflow inventory API', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests only the fixed relative Hub path and forwards AbortSignal', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(jsonResponse(validStates[1]))

    await expect(
      getN8nWorkflowInventory(controller.signal),
    ).resolves.toEqual(validStates[1])

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/n8n/workflows',
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    )
  })

  it.each(validStates)('accepts normalized state $state', async (payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await expect(getN8nWorkflowInventory()).resolves.toEqual(payload)
  })

  it('accepts bounds, duplicates, astral text, and inert hostile names', async () => {
    const maximumName = '🧠'.repeat(256)
    const items = Array.from({ length: 200 }, (_, index) => ({
      name: index === 0 ? maximumName : '<script>& $(url) \u202E',
      active: index % 2 === 0,
      updated_at: '2026-07-26T08:30:00.123456Z',
    }))
    items[199] = { ...items[0] }
    const payload = {
      state: 'available',
      items,
      truncated: true,
      error: null,
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))

    await expect(getN8nWorkflowInventory()).resolves.toEqual(payload)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    { ...available, private: 'no' },
    { state: 'available', items: [], truncated: false },
    { ...available, state: 'unknown' },
    { ...available, items: [{ ...available.items[0], id: 'private-id' }] },
    { ...available, items: [{ ...available.items[0], name: '' }] },
    {
      ...available,
      items: [{ ...available.items[0], name: 'x'.repeat(257) }],
    },
    {
      ...available,
      items: [{ ...available.items[0], name: 'control\u0000name' }],
    },
    {
      ...available,
      items: [{ ...available.items[0], name: '\ud800' }],
    },
    {
      ...available,
      items: [{ ...available.items[0], active: 1 }],
    },
    {
      ...available,
      items: [{ ...available.items[0], updated_at: '2026-07-26T08:30:00' }],
    },
    {
      ...available,
      items: [
        { ...available.items[0], updated_at: '2026-07-26T10:30:00+02:00' },
      ],
    },
    {
      ...available,
      items: [{ ...available.items[0], updated_at: '2026-02-30T00:00:00Z' }],
    },
    {
      ...available,
      items: Array.from({ length: 201 }, () => available.items[0]),
    },
    {
      state: 'unconfigured',
      items: available.items,
      truncated: false,
      error: null,
    },
    {
      state: 'access_denied',
      items: [],
      truncated: false,
      error: 'private provider detail',
    },
    {
      state: 'timeout',
      items: [],
      truncated: true,
      error: 'n8n workflow inventory timed out',
    },
    [],
    null,
    'not an object',
  ])('rejects malformed inventory contract %#', async (payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await expect(getN8nWorkflowInventory()).rejects.toBeInstanceOf(
      N8nWorkflowInventoryContractError,
    )
  })

  it('preserves HTTP, network, contract, and abort distinctions', async () => {
    const abortError = new DOMException('aborted', 'AbortError')
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockRejectedValueOnce(new TypeError('private network detail'))
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockRejectedValueOnce(abortError)

    const httpError = await getN8nWorkflowInventory().catch(
      (error: unknown) => error,
    )
    expect(httpError).toBeInstanceOf(BackendHttpError)
    expect(httpError).toMatchObject({ status: 503 })
    await expect(getN8nWorkflowInventory()).rejects.toThrow(
      'Unable to reach the backend',
    )
    await expect(getN8nWorkflowInventory()).rejects.toBeInstanceOf(
      N8nWorkflowInventoryContractError,
    )
    await expect(getN8nWorkflowInventory()).rejects.toBe(abortError)
  })

  it('rejects a non-200 success status before reading its body', async () => {
    const json = vi.fn().mockResolvedValue(available)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json,
    } as unknown as Response)

    const error = await getN8nWorkflowInventory().catch(
      (requestError: unknown) => requestError,
    )

    expect(error).toBeInstanceOf(BackendHttpError)
    expect(error).toMatchObject({ status: 201 })
    expect(json).not.toHaveBeenCalled()
  })

  it('preserves abort identity when its message matches the contract error', async () => {
    const abortError = new DOMException(
      'Backend returned an invalid response',
      'AbortError',
    )
    const controller = new AbortController()
    const signalAbortError = new Error('Backend returned an invalid response')
    controller.abort()
    fetchMock
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(signalAbortError)

    await expect(getN8nWorkflowInventory()).rejects.toBe(abortError)
    await expect(
      getN8nWorkflowInventory(controller.signal),
    ).rejects.toBe(signalAbortError)
  })

  it('propagates body-read AbortError', async () => {
    const abortError = new DOMException('aborted while decoding', 'AbortError')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(abortError),
    } as unknown as Response)

    await expect(getN8nWorkflowInventory()).rejects.toBe(abortError)
  })

  it('never treats a workflow name as a URL or makes a second request', async () => {
    const providerLookingName = 'https://n8n.test/api/v1/workflows/private'
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...available,
        items: [{ ...available.items[0], name: providerLookingName }],
      }),
    )

    const result = await getN8nWorkflowInventory()

    expect(result.items[0]?.name).toBe(providerLookingName)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/integrations/n8n/workflows',
    )
  })
})
