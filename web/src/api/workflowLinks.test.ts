import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackendHttpError } from './client'
import {
  createWorkflowLink,
  deleteWorkflowLink,
  getWorkflowLink,
  listWorkflowLinks,
  updateWorkflowLink,
  type WorkflowLink,
  type WorkflowLinkListResponse,
} from './workflowLinks'

const timestamp = '2026-07-12T12:30:00Z'

const workflowLink: WorkflowLink = {
  id: 7,
  title: 'Nightly repository summary',
  url: 'http://localhost:5678/workflow/abc?view=full#node',
  description: 'Collects repository activity for the local dashboard.',
  tags: ['n8n', 'repository'],
  created_at: timestamp,
  updated_at: timestamp,
}

const workflowLinkList: WorkflowLinkListResponse = {
  items: [
    {
      id: workflowLink.id,
      title: workflowLink.title,
      url: workflowLink.url,
      description_preview: workflowLink.description,
      tags: workflowLink.tags,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 8,
      title: 'Documentation',
      url: 'https://docs.example.com/workflows',
      description_preview: '',
      tags: [],
      created_at: '2026-07-12T14:30:00+02:00',
      updated_at: '2026-07-12T14:30:00+02:00',
    },
  ],
  total: 2,
  limit: 50,
  offset: 0,
}

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('workflow-link API client', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses canonical list and full payloads, including an empty preview', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(workflowLinkList))
      .mockResolvedValueOnce(jsonResponse(workflowLink))

    await expect(listWorkflowLinks({})).resolves.toEqual(workflowLinkList)
    await expect(getWorkflowLink(workflowLink.id)).resolves.toEqual(workflowLink)
  })

  it.each([
    ['zero ID', { ...workflowLinkList, items: [{ ...workflowLinkList.items[0], id: 0 }] }],
    [
      'fractional ID',
      { ...workflowLinkList, items: [{ ...workflowLinkList.items[0], id: 1.5 }] },
    ],
    [
      'noncanonical title',
      { ...workflowLinkList, items: [{ ...workflowLinkList.items[0], title: ' Padded ' }] },
    ],
    [
      'unsafe URL',
      {
        ...workflowLinkList,
        items: [{ ...workflowLinkList.items[0], url: 'javascript:alert(1)' }],
      },
    ],
    [
      'browser-incompatible URL',
      {
        ...workflowLinkList,
        items: [{ ...workflowLinkList.items[0], url: 'https://xn--kybrm.example/docs' }],
      },
    ],
    [
      'noncanonical tag',
      { ...workflowLinkList, items: [{ ...workflowLinkList.items[0], tags: ['N8N'] }] },
    ],
    [
      'duplicate tag',
      {
        ...workflowLinkList,
        items: [{ ...workflowLinkList.items[0], tags: ['n8n', 'n8n'] }],
      },
    ],
    [
      'non-string tag',
      { ...workflowLinkList, items: [{ ...workflowLinkList.items[0], tags: [12] }] },
    ],
    [
      'naive timestamp',
      {
        ...workflowLinkList,
        items: [{ ...workflowLinkList.items[0], updated_at: '2026-07-12T12:30:00' }],
      },
    ],
    [
      'calendar-invalid timestamp',
      {
        ...workflowLinkList,
        items: [{ ...workflowLinkList.items[0], updated_at: '2026-02-30T00:00:00Z' }],
      },
    ],
    [
      'summary full description',
      { ...workflowLinkList, items: [{ ...workflowLinkList.items[0], description: 'leak' }] },
    ],
    [
      'unmarked oversized preview',
      {
        ...workflowLinkList,
        items: [{ ...workflowLinkList.items[0], description_preview: 'x'.repeat(161) }],
      },
    ],
    [
      'oversized marked preview',
      {
        ...workflowLinkList,
        items: [{ ...workflowLinkList.items[0], description_preview: `${'x'.repeat(161)}…` }],
      },
    ],
    ['negative total', { ...workflowLinkList, total: -1 }],
    ['oversized limit', { ...workflowLinkList, limit: 101 }],
    ['fractional offset', { ...workflowLinkList, offset: 0.5 }],
  ])('rejects an invalid list %s', async (_label, payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))

    await expect(listWorkflowLinks({})).rejects.toThrow(
      'Backend returned an invalid response',
    )
  })

  it.each([
    [
      'missing description',
      Object.fromEntries(
        Object.entries(workflowLink).filter(([field]) => field !== 'description'),
      ),
    ],
    ['summary preview on full record', { ...workflowLink, description_preview: 'preview' }],
    ['non-string description', { ...workflowLink, description: 42 }],
    ['noncanonical description', { ...workflowLink, description: ' padded ' }],
    ['oversized description', { ...workflowLink, description: 'x'.repeat(5001) }],
  ])('rejects an invalid full-record %s', async (_label, payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))

    await expect(getWorkflowLink(workflowLink.id)).rejects.toThrow(
      'Backend returned an invalid response',
    )
  })

  it('encodes list parameters in contract order and forwards AbortSignal', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(jsonResponse(workflowLinkList))

    await listWorkflowLinks(
      { q: 'nightly summary', tag: 'local ai', limit: 25, offset: 50 },
      controller.signal,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workflow-links?q=nightly+summary&tag=local+ai&limit=25&offset=50',
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    )
  })

  it('sends exact API paths and normalized JSON for detail, create, and update', async () => {
    const input = {
      title: workflowLink.title,
      url: workflowLink.url,
      description: workflowLink.description,
      tags: workflowLink.tags,
    }
    const controller = new AbortController()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(workflowLink))
      .mockResolvedValueOnce(jsonResponse(workflowLink, 201))
      .mockResolvedValueOnce(jsonResponse(workflowLink))

    await getWorkflowLink(workflowLink.id, controller.signal)
    await createWorkflowLink(input, controller.signal)
    await updateWorkflowLink(workflowLink.id, input, controller.signal)

    expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/workflow-links/${workflowLink.id}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/workflow-links', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/workflow-links/${workflowLink.id}`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
  })

  it('requires 204 deletion and never parses a response body', async () => {
    const json = vi.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json } as unknown as Response)

    await expect(deleteWorkflowLink(workflowLink.id)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(`/api/workflow-links/${workflowLink.id}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      signal: undefined,
    })
    expect(json).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }))
    await expect(deleteWorkflowLink(workflowLink.id)).rejects.toThrow(
      'Backend returned an invalid response',
    )
  })

  it('uses a safe typed HTTP error without decoding the error body', async () => {
    const json = vi.fn().mockResolvedValue({ detail: 'stored destination is secret' })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json } as unknown as Response)

    const error = await getWorkflowLink(workflowLink.id).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(BackendHttpError)
    expect(error).toMatchObject({
      status: 404,
      message: 'Backend returned HTTP 404',
    })
    expect(json).not.toHaveBeenCalled()
  })

  it('preserves invalid JSON, network, and abort semantics', async () => {
    const controller = new AbortController()
    const networkCause = new TypeError('private network detail')
    const abortError = new DOMException('aborted', 'AbortError')
    fetchMock
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockRejectedValueOnce(networkCause)
      .mockRejectedValueOnce(abortError)

    await expect(listWorkflowLinks({})).rejects.toThrow(
      'Backend returned an invalid response',
    )
    const networkError = await listWorkflowLinks({}).catch((reason: unknown) => reason)
    expect(networkError).toMatchObject({
      message: 'Unable to reach the backend',
      cause: networkCause,
    })
    await expect(listWorkflowLinks({}, controller.signal)).rejects.toBe(abortError)
  })

  it('preserves an abort raised while decoding JSON', async () => {
    const abortError = new DOMException('aborted while reading', 'AbortError')
    const json = vi.fn().mockRejectedValue(abortError)
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json } as unknown as Response)

    await expect(listWorkflowLinks({})).rejects.toBe(abortError)
  })

  it('never requests a stored destination while parsing records', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(workflowLinkList))

    await listWorkflowLinks({})

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/workflow-links')
    expect(fetchMock.mock.calls[0]?.[0]).not.toBe(workflowLink.url)
  })
})
