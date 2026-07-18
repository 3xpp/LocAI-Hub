import {
  MAX_TRANSFER_BUNDLE_BYTES,
  type TransferPreviewResponse,
} from '../../api/transfer'

export interface TransferSelection {
  generation: number
  filename: string
  size: number
  rawJson: string | null
}

export interface FreshTransferPreview {
  selectionGeneration: number
  response: TransferPreviewResponse
}

export type TransferFileErrorCode = 'too_large' | 'unreadable' | 'invalid_utf8'

export class TransferFileError extends Error {
  readonly code: TransferFileErrorCode

  constructor(code: TransferFileErrorCode, message: string) {
    super(message)
    this.name = 'TransferFileError'
    this.code = code
  }
}

export const isTransferFileSizeAllowed = (size: number) =>
  Number.isSafeInteger(size) && size >= 0 && size <= MAX_TRANSFER_BUNDLE_BYTES

export async function readTransferFile(file: File): Promise<string> {
  if (!isTransferFileSizeAllowed(file.size)) {
    throw new TransferFileError('too_large', 'Selected bundle is larger than 10 MiB')
  }

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    throw new TransferFileError('unreadable', 'Selected bundle could not be read')
  }

  if (!isTransferFileSizeAllowed(buffer.byteLength)) {
    throw new TransferFileError('too_large', 'Selected bundle is larger than 10 MiB')
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new TransferFileError('invalid_utf8', 'Selected bundle is not valid UTF-8')
  }
}

export function hasFreshImportablePreview(
  selection: TransferSelection | null,
  preview: FreshTransferPreview | null,
): boolean {
  return (
    selection !== null &&
    preview !== null &&
    preview.selectionGeneration === selection.generation &&
    preview.response.importable
  )
}

export const requiresDiscardConfirmation = hasFreshImportablePreview
