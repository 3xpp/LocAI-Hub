import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  updatePrompt,
  type Prompt,
  type PromptListResponse,
} from './prompts'

const timestamp = '2026-07-10T12:30:00Z'

const prompt: Prompt = {
  id: 7,
  title: 'Review code',
  content: 'Review this code carefully.',
  tags: ['code', 'review'],
  created_at: timestamp,
  updated_at: timestamp,
}

const promptList: PromptListResponse = {
  items: [
    {
      id: prompt.id,
      title: prompt.title,
      content_preview: 'Review this code carefully.',
      tags: prompt.tags,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
}

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('prompt API client', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses valid list and detail payloads', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(promptList))
      .mockResolvedValueOnce(jsonResponse(prompt))

    await expect(listPrompts({ limit: 50, offset: 0 })).resolves.toEqual(promptList)
    await expect(getPrompt(prompt.id)).resolves.toEqual(prompt)
  })

  it('counts preview limits in Unicode code points like the backend', async () => {
    const unicodeList = {
      ...promptList,
      items: [{ ...promptList.items[0], content_preview: '🙂'.repeat(100) }],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(unicodeList))

    await expect(listPrompts({})).resolves.toEqual(unicodeList)
  })

  it.each([
    ['nested tag', { ...promptList, items: [{ ...promptList.items[0], tags: [12] }] }],
    [
      'timestamp',
      { ...promptList, items: [{ ...promptList.items[0], updated_at: 'not-an-iso-date' }] },
    ],
    [
      'calendar-invalid timestamp',
      { ...promptList, items: [{ ...promptList.items[0], updated_at: '2026-02-30T00:00:00Z' }] },
    ],
    ['count', { ...promptList, total: -1 }],
    ['limit', { ...promptList, limit: 101 }],
    ['offset', { ...promptList, offset: 1.5 }],
    ['id', { ...promptList, items: [{ ...promptList.items[0], id: 0 }] }],
    ['summary content', { ...promptList, items: [{ ...promptList.items[0], content: 'leak' }] }],
    [
      'oversized preview',
      { ...promptList, items: [{ ...promptList.items[0], content_preview: 'x'.repeat(162) }] },
    ],
    [
      'unmarked truncated preview',
      { ...promptList, items: [{ ...promptList.items[0], content_preview: 'x'.repeat(161) }] },
    ],
    ['detail content', { ...prompt, content: 42 }],
  ])('rejects an invalid %s field', async (_label, payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))

    const request = 'content' in payload ? getPrompt(prompt.id) : listPrompts({})

    await expect(request).rejects.toThrow('Backend returned an invalid response')
  })

  it('preserves shared HTTP, network, and invalid JSON errors', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'offline' }, 503))
      .mockRejectedValueOnce(new TypeError('network detail'))
      .mockResolvedValueOnce(new Response('{', { status: 200 }))

    await expect(listPrompts({})).rejects.toThrow('Backend returned HTTP 503')
    await expect(listPrompts({})).rejects.toThrow('Unable to reach the backend')
    await expect(listPrompts({})).rejects.toThrow('Backend returned an invalid response')
  })

  it('sends normalized JSON request options for create and update', async () => {
    const input = { title: 'Review code', content: 'Raw content', tags: ['code'] }
    fetchMock
      .mockResolvedValueOnce(jsonResponse(prompt, 201))
      .mockResolvedValueOnce(jsonResponse(prompt))

    await createPrompt(input)
    await updatePrompt(prompt.id, input)

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/prompts', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: undefined,
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/prompts/${prompt.id}`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: undefined,
    })
  })

  it('accepts only a 204 response for delete and never parses JSON', async () => {
    const json = vi.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json } as unknown as Response)

    await expect(deletePrompt(prompt.id)).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }))
    await expect(deletePrompt(prompt.id)).rejects.toThrow(
      'Backend returned an invalid response',
    )
  })

  it('forwards AbortSignal and encodes list query parameters', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(jsonResponse(promptList))

    await listPrompts(
      { q: 'error review', tag: 'local ai', limit: 25, offset: 50 },
      controller.signal,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/prompts?q=error+review&tag=local+ai&limit=25&offset=50',
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    )
  })

  it('rethrows an abort instead of converting it to an offline error', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('aborted', 'AbortError')
    fetchMock.mockRejectedValueOnce(abortError)

    await expect(listPrompts({}, controller.signal)).rejects.toBe(abortError)
  })

  it('preserves an abort raised while decoding the response body', async () => {
    const abortError = new DOMException('aborted while reading', 'AbortError')
    const json = vi.fn().mockRejectedValue(abortError)
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json } as unknown as Response)

    await expect(listPrompts({})).rejects.toBe(abortError)
  })
})
