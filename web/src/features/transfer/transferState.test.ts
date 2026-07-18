import { describe, expect, it, vi } from 'vitest'

import { MAX_TRANSFER_BUNDLE_BYTES, type TransferPreviewResponse } from '../../api/transfer'
import {
  hasFreshImportablePreview,
  isTransferFileSizeAllowed,
  readTransferFile,
  requiresDiscardConfirmation,
  type FreshTransferPreview,
  type TransferSelection,
} from './transferState'

const preview = (importable: boolean): TransferPreviewResponse => ({
  valid: true,
  importable,
  format_version: 1,
  counts: importable
    ? { total: 1, prompts: 1, workflow_links: 0 }
    : { total: 0, prompts: 0, workflow_links: 0 },
  duplicates: { total: 0, prompts: 0, workflow_links: 0 },
  warnings: importable
    ? []
    : [
        {
          code: 'empty_bundle',
          message: 'This bundle contains no records and cannot be imported.',
        },
      ],
})

const selection: TransferSelection = {
  generation: 4,
  filename: 'bundle.json',
  size: 12,
  rawJson: '{}',
}

const freshPreview = (importable = true): FreshTransferPreview => ({
  selectionGeneration: selection.generation,
  response: preview(importable),
})

describe('transfer file boundary', () => {
  it('accepts the exact byte limit and valid finite sizes only', () => {
    expect(isTransferFileSizeAllowed(MAX_TRANSFER_BUNDLE_BYTES)).toBe(true)
    expect(isTransferFileSizeAllowed(MAX_TRANSFER_BUNDLE_BYTES + 1)).toBe(false)
    expect(isTransferFileSizeAllowed(-1)).toBe(false)
    expect(isTransferFileSizeAllowed(0.5)).toBe(false)
  })

  it('decodes UTF-8 fatally', async () => {
    const raw = '{"title":"Straße"}'
    const bytes = new TextEncoder().encode(raw)
    const file = {
      size: bytes.byteLength,
      arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
    } as unknown as File

    await expect(readTransferFile(file)).resolves.toBe(raw)
  })

  it('rejects one byte over before reading', async () => {
    const file = {
      size: MAX_TRANSFER_BUNDLE_BYTES + 1,
      arrayBuffer: vi.fn(),
    } as unknown as File

    await expect(readTransferFile(file)).rejects.toMatchObject({ code: 'too_large' })
    expect(file.arrayBuffer).not.toHaveBeenCalled()
  })

  it('rechecks the exact buffer length after reading', async () => {
    const buffer = new ArrayBuffer(MAX_TRANSFER_BUNDLE_BYTES + 1)
    const file = {
      size: MAX_TRANSFER_BUNDLE_BYTES,
      arrayBuffer: vi.fn().mockResolvedValue(buffer),
    } as unknown as File

    await expect(readTransferFile(file)).rejects.toMatchObject({ code: 'too_large' })
  })

  it('maps a read failure without reflecting its details', async () => {
    const file = {
      size: 1,
      arrayBuffer: vi.fn().mockRejectedValue(new Error('private path marker')),
    } as unknown as File

    await expect(readTransferFile(file)).rejects.toMatchObject({
      code: 'unreadable',
      message: 'Selected bundle could not be read',
    })
  })

  it('rejects invalid UTF-8 rather than replacing it', async () => {
    const bytes = new Uint8Array([0xff])
    const file = {
      size: 1,
      arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
    } as unknown as File

    await expect(readTransferFile(file)).rejects.toMatchObject({ code: 'invalid_utf8' })
  })
})

describe('transfer preview freshness', () => {
  it('prepares only the current non-empty preview', () => {
    expect(hasFreshImportablePreview(selection, freshPreview())).toBe(true)
    expect(hasFreshImportablePreview(selection, freshPreview(false))).toBe(false)
    expect(
      hasFreshImportablePreview(selection, {
        ...freshPreview(),
        selectionGeneration: selection.generation - 1,
      }),
    ).toBe(false)
    expect(hasFreshImportablePreview(null, freshPreview())).toBe(false)
    expect(hasFreshImportablePreview(selection, null)).toBe(false)
  })

  it('requires a discard warning only for a fresh prepared import', () => {
    expect(requiresDiscardConfirmation(selection, freshPreview())).toBe(true)
    expect(requiresDiscardConfirmation(selection, freshPreview(false))).toBe(false)
    expect(requiresDiscardConfirmation({ ...selection, generation: 5 }, freshPreview())).toBe(
      false,
    )
    expect(requiresDiscardConfirmation(selection, null)).toBe(false)
  })
})
