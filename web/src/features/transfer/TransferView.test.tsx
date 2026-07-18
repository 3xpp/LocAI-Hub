import { act, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TransferHttpError,
  exportTransferBundle,
  importTransferBundle,
  previewTransferBundle,
  type TransferExportResult,
  type TransferImportResponse,
  type TransferPreviewResponse,
} from '../../api/transfer'
import { useTransfer, type TransferController } from './useTransfer'

vi.mock('../../api/transfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/transfer')>()
  return {
    ...actual,
    exportTransferBundle: vi.fn(),
    importTransferBundle: vi.fn(),
    previewTransferBundle: vi.fn(),
  }
})

const rawBundle =
  '{"application":"local-ai-workflow-hub","format_version":1,"exported_at":"2026-07-18T12:34:56Z","records":[]}'

const readyPreview = (duplicates = 0): TransferPreviewResponse => ({
  valid: true,
  importable: true,
  format_version: 1,
  counts: { total: 2, prompts: 1, workflow_links: 1 },
  duplicates: {
    total: duplicates,
    prompts: duplicates > 0 ? 1 : 0,
    workflow_links: Math.max(0, duplicates - 1),
  },
  warnings:
    duplicates > 0
      ? [
          {
            code: 'exact_duplicates',
            message: 'Exact duplicates will be imported as new records.',
          },
        ]
      : [],
})

const emptyPreview: TransferPreviewResponse = {
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

const importResult: TransferImportResponse = {
  imported: { total: 2, prompts: 1, workflow_links: 1 },
  duplicates_imported: { total: 0, prompts: 0, workflow_links: 0 },
}

const exportResult: TransferExportResult = {
  bundle: {
    application: 'local-ai-workflow-hub',
    format_version: 1,
    exported_at: '2026-07-18T12:34:56Z',
    records: [],
  },
  rawJson: rawBundle,
  filename: 'local-ai-workflow-hub-20260718T123456Z.json',
  counts: { total: 2, prompts: 1, workflow_links: 1 },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function testFile(
  raw = rawBundle,
  filename = 'bundle.json',
): File & { arrayBuffer: ReturnType<typeof vi.fn> } {
  const bytes = new TextEncoder().encode(raw)
  return {
    name: filename,
    size: bytes.byteLength,
    arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
  } as unknown as File & { arrayBuffer: ReturnType<typeof vi.fn> }
}

let latestController: TransferController | null = null

function HookHarness({ enabled }: { enabled: boolean }) {
  latestController = useTransfer(enabled)
  return null
}

const controller = () => {
  if (latestController === null) throw new Error('Hook controller is not mounted')
  return latestController
}

const exportMock = vi.mocked(exportTransferBundle)
const previewMock = vi.mocked(previewTransferBundle)
const importMock = vi.mocked(importTransferBundle)

describe('transfer controller', () => {
  const createObjectURL = vi.fn((blob: Blob) => {
    void blob
    return 'blob:transfer-test'
  })
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    latestController = null
    exportMock.mockReset().mockResolvedValue(exportResult)
    previewMock.mockReset().mockResolvedValue(readyPreview())
    importMock.mockReset().mockResolvedValue(importResult)
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('makes no request on mount and ignores selection while disabled', async () => {
    render(<HookHarness enabled={false} />)

    act(() => controller().selectFile(testFile()))
    await Promise.resolve()

    expect(exportMock).not.toHaveBeenCalled()
    expect(previewMock).not.toHaveBeenCalled()
    expect(importMock).not.toHaveBeenCalled()
    expect(controller().selection).toBeNull()
  })

  it('continues working after StrictMode replays the lifecycle effect', async () => {
    render(
      <StrictMode>
        <HookHarness enabled />
      </StrictMode>,
    )

    act(() => controller().selectFile(testFile()))

    await waitFor(() => expect(controller().previewStatus).toBe('ready'))
    expect(previewMock).toHaveBeenCalledWith(rawBundle, expect.any(AbortSignal))
    expect(controller().canImport).toBe(true)
  })

  it('reads a selected file, previews the same raw text, and exposes no raw data', async () => {
    render(<HookHarness enabled />)
    const file = testFile(rawBundle, 'portable.json')

    act(() => controller().selectFile(file))

    expect(controller().previewStatus).toBe('reading')
    await waitFor(() => expect(controller().previewStatus).toBe('ready'))
    expect(previewMock).toHaveBeenCalledWith(rawBundle, expect.any(AbortSignal))
    expect(controller().selection).toEqual({ filename: 'portable.json', size: file.size })
    expect(controller().preview).toEqual(readyPreview())
    expect(controller().canImport).toBe(true)
    expect(controller()).not.toHaveProperty('rawJson')
  })

  it('rejects every competing action while reading or requesting', async () => {
    const read = deferred<ArrayBuffer>()
    const first = testFile()
    first.arrayBuffer.mockReturnValue(read.promise)
    const second = testFile('{}', 'second.json')
    render(<HookHarness enabled />)

    act(() => {
      controller().selectFile(first)
      controller().selectFile(second)
      controller().clearSelection()
      controller().previewAgain()
      controller().downloadBundle()
      controller().openImportConfirmation()
      controller().confirmImport()
    })

    expect(controller().pending).toBe(true)
    expect(second.arrayBuffer).not.toHaveBeenCalled()
    expect(exportMock).not.toHaveBeenCalled()
    expect(importMock).not.toHaveBeenCalled()
    act(() => read.resolve(new TextEncoder().encode(rawBundle).buffer))
    await waitFor(() => expect(controller().previewStatus).toBe('ready'))
  })

  it('aborts a preview on disable and ignores its stale completion after re-enable', async () => {
    const stale = deferred<TransferPreviewResponse>()
    previewMock.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(readyPreview(1))
    const { rerender } = render(<HookHarness enabled />)

    act(() => controller().selectFile(testFile('{}', 'old.json')))
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1))
    const staleSignal = previewMock.mock.calls[0]?.[1]
    rerender(<HookHarness enabled={false} />)
    expect(staleSignal?.aborted).toBe(true)
    expect(controller().selection).toBeNull()

    rerender(<HookHarness enabled />)
    act(() => controller().selectFile(testFile(rawBundle, 'new.json')))
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(2))
    act(() => stale.resolve(emptyPreview))
    await waitFor(() => expect(controller().preview).toEqual(readyPreview(1)))
    expect(controller().selection?.filename).toBe('new.json')
  })

  it('keeps empty and invalid previews selected but unprepared for import', async () => {
    previewMock.mockResolvedValueOnce(emptyPreview)
    const { unmount } = render(<HookHarness enabled />)
    act(() => controller().selectFile(testFile()))
    await waitFor(() => expect(controller().previewStatus).toBe('ready'))
    expect(controller().selection).not.toBeNull()
    expect(controller().canImport).toBe(false)
    expect(controller().hasPreparedImport).toBe(false)

    unmount()
    render(<HookHarness enabled />)
    previewMock.mockRejectedValueOnce(
      new TransferHttpError(422, {
        code: 'invalid_bundle',
        message: 'Bundle validation failed.',
        issues: [
          {
            location: ['records', 0, 'title'],
            record_index: 0,
            record_type: 'prompt',
            field: 'title',
            code: 'invalid_value',
            message: 'Field value is invalid.',
          },
        ],
        issues_truncated: false,
      }),
    )
    act(() => controller().selectFile(testFile()))
    await waitFor(() => expect(controller().previewStatus).toBe('error'))
    expect(controller().selection).not.toBeNull()
    expect(controller().previewIssues).toHaveLength(1)
    expect(controller().previewError).toBe('Bundle validation failed.')
    expect(controller().hasPreparedImport).toBe(false)
  })

  it('confirms prepared discards, preserves canceled state, and clears safe state directly', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<HookHarness enabled />)
    act(() => controller().selectFile(testFile()))
    await waitFor(() => expect(controller().hasPreparedImport).toBe(true))

    expect(controller().confirmDiscard()).toBe(false)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(controller().selection).not.toBeNull()
    confirm.mockReturnValue(true)
    act(() => expect(controller().confirmDiscard()).toBe(true))
    expect(controller().selection).toBeNull()

    previewMock.mockResolvedValueOnce(emptyPreview)
    act(() => controller().selectFile(testFile()))
    await waitFor(() => expect(controller().previewStatus).toBe('ready'))
    act(() => expect(controller().confirmDiscard()).toBe(true))
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('blocks pending navigation without opening a discard prompt', async () => {
    const request = deferred<TransferExportResult>()
    exportMock.mockReturnValueOnce(request.promise)
    const confirm = vi.spyOn(window, 'confirm')
    render(<HookHarness enabled />)
    act(() => controller().downloadBundle())

    expect(controller().pending).toBe(true)
    expect(controller().confirmDiscard()).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
    act(() => request.resolve(exportResult))
    await waitFor(() => expect(controller().exportStatus).toBe('success'))
  })

  it('registers beforeunload only while pending or prepared', async () => {
    const request = deferred<TransferPreviewResponse>()
    previewMock.mockReturnValueOnce(request.promise)
    render(<HookHarness enabled />)

    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    act(() => controller().selectFile(testFile()))
    await waitFor(() => expect(controller().previewStatus).toBe('pending'))
    const pending = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(pending)
    expect(pending.defaultPrevented).toBe(true)

    act(() => request.resolve(readyPreview()))
    await waitFor(() => expect(controller().hasPreparedImport).toBe(true))
    const prepared = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(prepared)
    expect(prepared.defaultPrevented).toBe(true)

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    act(() => controller().confirmDiscard())
    const cleared = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleared)
    expect(cleared.defaultPrevented).toBe(false)
  })

  it('downloads through one temporary Blob URL and cleans the anchor and URL', async () => {
    const click = vi.mocked(HTMLAnchorElement.prototype.click)
    render(<HookHarness enabled />)

    act(() => controller().downloadBundle())
    await waitFor(() => expect(controller().exportStatus).toBe('success'))

    expect(exportMock).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    expect(click).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:transfer-test')
    expect(controller().exportResult).toEqual(exportResult.counts)
  })

  it('aborts preview and export controllers on unmount without canceling imports', async () => {
    const exportRequest = deferred<TransferExportResult>()
    exportMock.mockReturnValueOnce(exportRequest.promise)
    const first = render(<HookHarness enabled />)
    act(() => controller().downloadBundle())
    const exportSignal = exportMock.mock.calls[0]?.[0]
    first.unmount()
    expect(exportSignal?.aborted).toBe(true)

    const previewRequest = deferred<TransferPreviewResponse>()
    previewMock.mockReturnValueOnce(previewRequest.promise)
    const second = render(<HookHarness enabled />)
    act(() => controller().selectFile(testFile()))
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1))
    const previewSignal = previewMock.mock.calls[0]?.[1]
    second.unmount()
    expect(previewSignal?.aborted).toBe(true)
  })

  it('imports exactly once without an AbortSignal, then releases selected data', async () => {
    render(<HookHarness enabled />)
    act(() => controller().selectFile(testFile()))
    await waitFor(() => expect(controller().canImport).toBe(true))
    act(() => controller().openImportConfirmation())
    expect(controller().confirmationOpen).toBe(true)
    act(() => controller().confirmImport())

    await waitFor(() => expect(controller().importStatus).toBe('success'))
    expect(importMock).toHaveBeenCalledTimes(1)
    expect(importMock).toHaveBeenCalledWith(rawBundle)
    expect(controller().selection).toBeNull()
    expect(controller().preview).toBeNull()
    expect(controller().importResult).toEqual(importResult)
  })

  it('marks a lost or malformed success uncertain and requires explicit re-preview', async () => {
    importMock.mockRejectedValueOnce(new TransferHttpError(201, null, true))
    render(<HookHarness enabled />)
    act(() => controller().selectFile(testFile()))
    await waitFor(() => expect(controller().canImport).toBe(true))
    act(() => {
      controller().openImportConfirmation()
      controller().confirmImport()
      controller().confirmImport()
    })

    await waitFor(() => expect(controller().importStatus).toBe('error'))
    expect(importMock).toHaveBeenCalledTimes(1)
    expect(controller().importOutcomeUncertain).toBe(true)
    expect(controller().canImport).toBe(false)
    expect(controller().selection).not.toBeNull()
    expect(controller().importError).toContain('outcome is uncertain')

    act(() => controller().previewAgain())
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(controller().canImport).toBe(true))
    expect(importMock).toHaveBeenCalledTimes(1)
  })
})
