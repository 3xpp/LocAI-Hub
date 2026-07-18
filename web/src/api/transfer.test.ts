import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_TRANSFER_BUNDLE_BYTES,
  MAX_TRANSFER_ISSUES,
  TransferHttpError,
  exportTransferBundle,
  importTransferBundle,
  previewTransferBundle,
  type TransferBundleV1,
  type TransferImportResponse,
  type TransferPreviewResponse,
} from './transfer'

const exportedAt = '2026-07-18T12:34:56Z'
const exportFilename = 'local-ai-workflow-hub-20260718T123456Z.json'

function validBundle(): TransferBundleV1 {
  return {
    application: 'local-ai-workflow-hub',
    format_version: 1,
    exported_at: exportedAt,
    records: [
      {
        type: 'prompt',
        title: 'Review this function',
        content: 'Review this function and identify edge cases.',
        tags: ['review', 'local'],
      },
      {
        type: 'workflow_link',
        title: 'Local workflow editor',
        url: 'http://localhost:5678/workflow/private-route?token=inert',
        description: 'Reference to a local workflow.',
        tags: ['n8n', 'local'],
      },
    ],
  }
}

function validPreview(): TransferPreviewResponse {
  return {
    valid: true,
    importable: true,
    format_version: 1,
    counts: { total: 2, prompts: 1, workflow_links: 1 },
    duplicates: { total: 0, prompts: 0, workflow_links: 0 },
    warnings: [],
  }
}

function validImport(): TransferImportResponse {
  return {
    imported: { total: 2, prompts: 1, workflow_links: 1 },
    duplicates_imported: { total: 0, prompts: 0, workflow_links: 0 },
  }
}

function jsonResponse(
  payload: unknown,
  options: { status?: number; disposition?: string } = {},
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (options.disposition !== undefined) {
    headers.set('Content-Disposition', options.disposition)
  }
  return new Response(JSON.stringify(payload), {
    status: options.status ?? 200,
    headers,
  })
}

function exportResponse(payload: unknown = validBundle()): Response {
  return jsonResponse(payload, {
    disposition: `attachment; filename="${exportFilename}"`,
  })
}

function paddedExportResponse(byteLength: number): Response {
  const raw = JSON.stringify(validBundle())
  if (raw.length > byteLength) throw new Error('test response target is too small')
  return new Response(raw + ' '.repeat(byteLength - raw.length), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${exportFilename}"`,
    },
  })
}

const invalidTransferResponse = async (request: Promise<unknown>) => {
  const error = await request.catch((reason: unknown) => reason)
  expect(error).toBeInstanceOf(TransferHttpError)
  expect(error).toMatchObject({
    detail: null,
    outcomeUncertain: false,
    message: 'Backend returned an invalid transfer response',
  })
}

describe('transfer API client', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('decodes a bounded export and derives counts without contacting a destination', async () => {
    fetchMock.mockResolvedValueOnce(exportResponse())

    const result = await exportTransferBundle()

    expect(result).toEqual({
      bundle: validBundle(),
      rawJson: JSON.stringify(validBundle()),
      filename: exportFilename,
      counts: { total: 2, prompts: 1, workflow_links: 1 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/transfer/export', {
      headers: { Accept: 'application/json' },
      signal: undefined,
    })
  })

  it('posts the selected JSON object text without stringifying it again', async () => {
    const rawJson = JSON.stringify(validBundle())
    fetchMock.mockResolvedValueOnce(jsonResponse(validPreview()))

    await expect(previewTransferBundle(rawJson)).resolves.toEqual(validPreview())

    expect(fetchMock).toHaveBeenCalledWith('/api/transfer/import/preview', {
      method: 'POST',
      body: rawJson,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: undefined,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('imports once with the raw body and exposes no AbortSignal or retry option', async () => {
    const rawJson = JSON.stringify(validBundle())
    fetchMock.mockResolvedValueOnce(jsonResponse(validImport(), { status: 201 }))

    await expect(importTransferBundle(rawJson)).resolves.toEqual(validImport())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/transfer/import', {
      method: 'POST',
      body: rawJson,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
  })

  it.each([
    ['an extra root key', { ...validBundle(), extra: true }],
    ['the wrong application', { ...validBundle(), application: 'another-app' }],
    ['a coerced version', { ...validBundle(), format_version: '1' }],
    ['a non-zero-UTC timestamp', { ...validBundle(), exported_at: '2026-07-18T14:34:56+02:00' }],
    ['an invalid calendar timestamp', { ...validBundle(), exported_at: '2026-02-30T12:00:00Z' }],
    [
      'a Prompt after a Workflow Link',
      { ...validBundle(), records: [...validBundle().records].reverse() },
    ],
    [
      'an extra Prompt field',
      {
        ...validBundle(),
        records: [{ ...validBundle().records[0], id: 1 }],
      },
    ],
    [
      'an unsafe Workflow Link URL',
      {
        ...validBundle(),
        records: [
          {
            ...validBundle().records[1],
            url: 'https://safe.example@private.example/workflow',
          },
        ],
      },
    ],
  ])('rejects an export containing %s', async (_label, payload) => {
    fetchMock.mockResolvedValueOnce(exportResponse(payload))
    await invalidTransferResponse(exportTransferBundle())
  })

  it('enforces Unicode field boundaries and canonical record values', async () => {
    const boundaryBundle = validBundle()
    boundaryBundle.records = [
      {
        type: 'prompt',
        title: '🙂'.repeat(200),
        content: ` ${'🙂'.repeat(49_999)}`,
        tags: ['code review'],
      },
      {
        type: 'workflow_link',
        title: 'Workflow',
        url: 'https://example.test/workflow',
        description: '🙂'.repeat(5_000),
        tags: [],
      },
    ]
    fetchMock.mockResolvedValueOnce(exportResponse(boundaryBundle))
    await expect(exportTransferBundle()).resolves.toMatchObject({ bundle: boundaryBundle })

    const invalidValues = [
      { ...validBundle().records[0], title: `x${'🙂'.repeat(200)}` },
      { ...validBundle().records[0], title: ' padded ' },
      { ...validBundle().records[0], content: ' \n\t ' },
      { ...validBundle().records[0], content: '🙂'.repeat(50_001) },
      { ...validBundle().records[0], tags: ['Code'] },
      { ...validBundle().records[0], tags: ['code', 'code'] },
      { ...validBundle().records[0], tags: Array.from({ length: 11 }, (_, index) => `t${index}`) },
      { ...validBundle().records[1], description: ' padded ' },
      { ...validBundle().records[1], description: '🙂'.repeat(5_001) },
    ]

    for (const record of invalidValues) {
      fetchMock.mockResolvedValueOnce(exportResponse({ ...validBundle(), records: [record] }))
      await invalidTransferResponse(exportTransferBundle())
    }
  })

  it('accepts 5,000 records and rejects 5,001 records', async () => {
    const prompt = validBundle().records[0]
    const atLimit = { ...validBundle(), records: Array.from({ length: 5_000 }, () => prompt) }
    const overLimit = { ...atLimit, records: [...atLimit.records, prompt] }
    fetchMock
      .mockResolvedValueOnce(exportResponse(atLimit))
      .mockResolvedValueOnce(exportResponse(overLimit))

    await expect(exportTransferBundle()).resolves.toMatchObject({
      counts: { total: 5_000, prompts: 5_000, workflow_links: 0 },
    })
    await invalidTransferResponse(exportTransferBundle())
  })

  it('accepts exactly 10 MiB of UTF-8 response text and rejects one byte more', async () => {
    fetchMock
      .mockResolvedValueOnce(paddedExportResponse(MAX_TRANSFER_BUNDLE_BYTES))
      .mockResolvedValueOnce(paddedExportResponse(MAX_TRANSFER_BUNDLE_BYTES + 1))

    await expect(exportTransferBundle()).resolves.toMatchObject({ filename: exportFilename })
    await invalidTransferResponse(exportTransferBundle())
  })

  it.each([
    [
      'inconsistent total counts',
      { ...validPreview(), counts: { total: 3, prompts: 1, workflow_links: 1 } },
    ],
    [
      'duplicate counts above the bundle counts',
      { ...validPreview(), duplicates: { total: 2, prompts: 2, workflow_links: 0 } },
    ],
    [
      'a missing duplicate warning',
      {
        ...validPreview(),
        duplicates: { total: 1, prompts: 1, workflow_links: 0 },
      },
    ],
    [
      'an unexpected empty warning',
      {
        ...validPreview(),
        warnings: [
          {
            code: 'empty_bundle',
            message: 'This bundle contains no records and cannot be imported.',
          },
        ],
      },
    ],
    ['an importable empty bundle', { ...validPreview(), importable: false, counts: { total: 2, prompts: 1, workflow_links: 1 } }],
    ['an extra response key', { ...validPreview(), raw: 'must stay private' }],
  ])('rejects a preview with %s', async (_label, payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await invalidTransferResponse(previewTransferBundle('{}'))
  })

  it('accepts the exact empty and duplicate preview warning contracts', async () => {
    const empty: TransferPreviewResponse = {
      valid: true,
      importable: false,
      format_version: 1,
      counts: { total: 0, prompts: 0, workflow_links: 0 },
      duplicates: { total: 0, prompts: 0, workflow_links: 0 },
      warnings: [
        {
          code: 'empty_bundle',
          message: 'This bundle contains no records and cannot be imported.',
        },
      ],
    }
    const duplicate: TransferPreviewResponse = {
      ...validPreview(),
      duplicates: { total: 1, prompts: 1, workflow_links: 0 },
      warnings: [
        {
          code: 'exact_duplicates',
          message: 'Exact duplicates will be imported as new records.',
        },
      ],
    }
    fetchMock
      .mockResolvedValueOnce(jsonResponse(empty))
      .mockResolvedValueOnce(jsonResponse(duplicate))

    await expect(previewTransferBundle('{}')).resolves.toEqual(empty)
    await expect(previewTransferBundle('{}')).resolves.toEqual(duplicate)
  })

  it.each([
    ['zero imported records', { ...validImport(), imported: { total: 0, prompts: 0, workflow_links: 0 } }],
    [
      'inconsistent imported counts',
      { ...validImport(), imported: { total: 2, prompts: 2, workflow_links: 1 } },
    ],
    [
      'impossible duplicate counts',
      {
        ...validImport(),
        duplicates_imported: { total: 3, prompts: 2, workflow_links: 1 },
      },
    ],
    ['an extra response key', { ...validImport(), records: [] }],
  ])('treats a 201 import response with %s as outcome uncertain', async (_label, payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload, { status: 201 }))
    const error = await importTransferBundle('{}').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(TransferHttpError)
    expect(error).toMatchObject({ status: 201, detail: null, outcomeUncertain: true })
  })

  it('decodes a bounded safe error envelope without reflecting submitted values', async () => {
    const marker = 'secret-record-value-never-reflect'
    const errorPayload = {
      detail: {
        code: 'invalid_bundle',
        message: marker,
        issues: [
          {
            location: ['records', 0, 'prompt', 'content'],
            record_index: 0,
            record_type: 'prompt',
            field: 'content',
            code: 'invalid_value',
            message: marker,
          },
        ],
        issues_truncated: false,
      },
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(errorPayload, { status: 422 }))

    const error = await previewTransferBundle('{}').catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(TransferHttpError)
    expect(error).toMatchObject({
      status: 422,
      outcomeUncertain: false,
      detail: {
        code: 'invalid_bundle',
        message: 'Bundle validation failed.',
        issues: [
          {
            location: ['records', 0, 'prompt', 'content'],
            record_index: 0,
            record_type: 'prompt',
            field: 'content',
            code: 'invalid_value',
            message: 'Field value is invalid.',
          },
        ],
        issues_truncated: false,
      },
    })
    expect(JSON.stringify(error)).not.toContain(marker)
    expect(String(error)).not.toContain(marker)
  })

  it.each([
    ['an unknown code', { detail: { code: 'private', message: 'x', issues: [], issues_truncated: false } }],
    [
      'an extra detail field',
      {
        detail: {
          code: 'invalid_bundle',
          message: 'x',
          issues: [],
          issues_truncated: false,
          raw: 'private',
        },
      },
    ],
    [
      'more than 100 issues',
      {
        detail: {
          code: 'invalid_bundle',
          message: 'x',
          issues: Array.from({ length: MAX_TRANSFER_ISSUES + 1 }, () => ({
            location: [],
            record_index: null,
            record_type: null,
            field: null,
            code: 'invalid_value',
            message: 'x',
          })),
          issues_truncated: true,
        },
      },
    ],
  ])('does not expose an error envelope containing %s', async (_label, payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload, { status: 422 }))
    const error = await previewTransferBundle('{}').catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 422, detail: null, outcomeUncertain: false })
  })

  it('requires exact success statuses and valid JSON', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(validPreview(), { status: 201 }))
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(validImport(), { status: 200 }))

    await invalidTransferResponse(previewTransferBundle('{}'))
    await invalidTransferResponse(previewTransferBundle('{}'))
    await invalidTransferResponse(importTransferBundle('{}'))
  })

  it('treats a malformed successful import response as outcome uncertain', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{', { status: 201 }))

    const error = await importTransferBundle('{}').catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 201, detail: null, outcomeUncertain: true })
  })

  it('uses fixed network errors and marks an import connection loss uncertain without retrying', async () => {
    const marker = 'private network detail'
    fetchMock
      .mockRejectedValueOnce(new TypeError(marker))
      .mockRejectedValueOnce(new TypeError(marker))

    await expect(previewTransferBundle('{}')).rejects.toThrow('Unable to reach the backend')
    const importError = await importTransferBundle('{}').catch((reason: unknown) => reason)
    expect(importError).toBeInstanceOf(TransferHttpError)
    expect(importError).toMatchObject({ status: 0, detail: null, outcomeUncertain: true })
    expect(String(importError)).not.toContain(marker)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('forwards export and preview aborts unchanged', async () => {
    const exportController = new AbortController()
    const previewController = new AbortController()
    const abortError = new DOMException('aborted', 'AbortError')
    fetchMock.mockRejectedValue(abortError)

    await expect(exportTransferBundle(exportController.signal)).rejects.toBe(abortError)
    await expect(previewTransferBundle('{}', previewController.signal)).rejects.toBe(abortError)
  })

  it.each([
    [undefined],
    ['inline; filename="local-ai-workflow-hub-20260718T123456Z.json"'],
    ['attachment; filename="../../private.json"'],
    ['attachment; filename="local-ai-workflow-hub-20260718T123456Z.json"; size=1'],
  ])('rejects an unsafe or missing Content-Disposition value: %s', async (disposition) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(validBundle(), { disposition }),
    )
    await invalidTransferResponse(exportTransferBundle())
  })
})
