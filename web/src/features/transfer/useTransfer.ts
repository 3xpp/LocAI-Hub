import { useCallback, useEffect, useRef, useState } from 'react'

import {
  TransferHttpError,
  exportTransferBundle,
  importTransferBundle,
  previewTransferBundle,
  type TransferCounts,
  type TransferImportResponse,
  type TransferIssue,
  type TransferPreviewResponse,
} from '../../api/transfer'
import {
  TransferFileError,
  hasFreshImportablePreview,
  readTransferFile,
  requiresDiscardConfirmation,
  type FreshTransferPreview,
  type TransferSelection,
} from './transferState'

export type TransferRequestStatus = 'idle' | 'pending' | 'success' | 'error'
export type TransferPreviewStatus = 'idle' | 'reading' | 'pending' | 'ready' | 'error'

export interface TransferController {
  selection: { filename: string; size: number } | null
  exportStatus: TransferRequestStatus
  exportResult: TransferCounts | null
  exportError: string | null
  previewStatus: TransferPreviewStatus
  preview: TransferPreviewResponse | null
  previewError: string | null
  previewIssues: TransferIssue[]
  importStatus: TransferRequestStatus
  importResult: TransferImportResponse | null
  importError: string | null
  importOutcomeUncertain: boolean
  confirmationOpen: boolean
  pending: boolean
  canImport: boolean
  hasPreparedImport: boolean
  selectFile: (file: File | null) => void
  clearSelection: () => void
  previewAgain: () => void
  downloadBundle: () => void
  openImportConfirmation: () => void
  cancelImportConfirmation: () => void
  confirmImport: () => void
  confirmDiscard: () => boolean
}

type TransferActivity = 'idle' | 'reading' | 'preview' | 'export' | 'import'

const fixedMessage = (error: unknown, fallback: string): string => {
  if (error instanceof TransferFileError || error instanceof TransferHttpError) {
    return error.message
  }
  if (
    error instanceof Error &&
    (error.message === 'Unable to reach the backend' ||
      error.message === 'Unable to read the backend response')
  ) {
    return error.message
  }
  return fallback
}

const wasAborted = (error: unknown, signal: AbortSignal) =>
  signal.aborted || (error instanceof DOMException && error.name === 'AbortError')

const safeCounts = (counts: TransferCounts): TransferCounts => ({
  total: counts.total,
  prompts: counts.prompts,
  workflow_links: counts.workflow_links,
})

const safeImportResult = (result: TransferImportResponse): TransferImportResponse => ({
  imported: safeCounts(result.imported),
  duplicates_imported: safeCounts(result.duplicates_imported),
})

export function useTransfer(enabled: boolean): TransferController {
  const [selectionMetadata, setSelectionMetadata] = useState<{
    filename: string
    size: number
  } | null>(null)
  const [freshPreview, setFreshPreviewState] = useState<FreshTransferPreview | null>(null)
  const [exportStatus, setExportStatus] = useState<TransferRequestStatus>('idle')
  const [exportResult, setExportResult] = useState<TransferCounts | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<TransferPreviewStatus>('idle')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewIssues, setPreviewIssues] = useState<TransferIssue[]>([])
  const [importStatus, setImportStatus] = useState<TransferRequestStatus>('idle')
  const [importResult, setImportResult] = useState<TransferImportResponse | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importOutcomeUncertain, setImportOutcomeUncertain] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const mounted = useRef(true)
  const enabledRef = useRef(enabled)
  const activity = useRef<TransferActivity>('idle')
  const selection = useRef<TransferSelection | null>(null)
  const preview = useRef<FreshTransferPreview | null>(null)
  const confirmationOpenRef = useRef(false)
  const selectionGeneration = useRef(0)
  const exportGeneration = useRef(0)
  const importGeneration = useRef(0)
  const previewRequest = useRef<AbortController | null>(null)
  const exportRequest = useRef<AbortController | null>(null)
  enabledRef.current = enabled

  const setFreshPreview = useCallback((value: FreshTransferPreview | null) => {
    preview.current = value
    setFreshPreviewState(value)
  }, [])

  const setConfirmation = useCallback((value: boolean) => {
    confirmationOpenRef.current = value
    setConfirmationOpen(value)
  }, [])

  const finishActivity = useCallback((expected: TransferActivity) => {
    if (activity.current !== expected) return
    activity.current = 'idle'
    if (mounted.current) setPending(false)
  }, [])

  const resetResultState = useCallback(() => {
    setExportStatus('idle')
    setExportResult(null)
    setExportError(null)
    setImportStatus('idle')
    setImportResult(null)
    setImportError(null)
    setImportOutcomeUncertain(false)
  }, [])

  const releaseSelection = useCallback(() => {
    selectionGeneration.current += 1
    selection.current = null
    setSelectionMetadata(null)
    setFreshPreview(null)
    setPreviewStatus('idle')
    setPreviewError(null)
    setPreviewIssues([])
    setConfirmation(false)
  }, [setConfirmation, setFreshPreview])

  const requestPreview = useCallback(
    (selected: TransferSelection) => {
      const rawJson = selected.rawJson
      if (rawJson === null || !enabledRef.current || !mounted.current) return

      const controller = new AbortController()
      previewRequest.current = controller
      activity.current = 'preview'
      setPending(true)
      setPreviewStatus('pending')
      setPreviewError(null)
      setPreviewIssues([])
      setFreshPreview(null)

      void previewTransferBundle(rawJson, controller.signal)
        .then((response) => {
          if (
            controller.signal.aborted ||
            !mounted.current ||
            !enabledRef.current ||
            selection.current !== selected ||
            selectionGeneration.current !== selected.generation
          ) {
            return
          }
          setFreshPreview({
            selectionGeneration: selected.generation,
            response,
          })
          setPreviewStatus('ready')
        })
        .catch((error: unknown) => {
          if (
            wasAborted(error, controller.signal) ||
            !mounted.current ||
            !enabledRef.current ||
            selection.current !== selected ||
            selectionGeneration.current !== selected.generation
          ) {
            return
          }
          setFreshPreview(null)
          setPreviewStatus('error')
          setPreviewError(fixedMessage(error, 'Preview failed.'))
          setPreviewIssues(
            error instanceof TransferHttpError && error.detail !== null
              ? [...error.detail.issues]
              : [],
          )
        })
        .finally(() => {
          if (previewRequest.current === controller) previewRequest.current = null
          if (
            mounted.current &&
            selection.current === selected &&
            selectionGeneration.current === selected.generation
          ) {
            finishActivity('preview')
          }
        })
    },
    [finishActivity, setFreshPreview],
  )

  const selectFile = useCallback(
    (file: File | null) => {
      if (!enabledRef.current || activity.current !== 'idle') return
      if (file === null) {
        releaseSelection()
        resetResultState()
        return
      }

      previewRequest.current?.abort()
      const generation = ++selectionGeneration.current
      const selected: TransferSelection = {
        generation,
        filename: file.name,
        size: file.size,
        rawJson: null,
      }
      selection.current = selected
      setSelectionMetadata({ filename: file.name, size: file.size })
      setFreshPreview(null)
      setPreviewStatus('reading')
      setPreviewError(null)
      setPreviewIssues([])
      setConfirmation(false)
      resetResultState()
      activity.current = 'reading'
      setPending(true)

      void readTransferFile(file)
        .then((rawJson) => {
          if (
            !mounted.current ||
            !enabledRef.current ||
            selection.current !== selected ||
            selectionGeneration.current !== generation
          ) {
            return
          }
          selected.rawJson = rawJson
          requestPreview(selected)
        })
        .catch((error: unknown) => {
          if (
            !mounted.current ||
            !enabledRef.current ||
            selection.current !== selected ||
            selectionGeneration.current !== generation
          ) {
            return
          }
          setPreviewStatus('error')
          setPreviewError(fixedMessage(error, 'Selected bundle could not be read'))
          setPreviewIssues([])
        })
        .finally(() => {
          if (
            mounted.current &&
            selection.current === selected &&
            selectionGeneration.current === generation
          ) {
            finishActivity('reading')
          }
        })
    },
    [finishActivity, releaseSelection, requestPreview, resetResultState, setConfirmation, setFreshPreview],
  )

  const clearSelection = useCallback(() => {
    if (!enabledRef.current || activity.current !== 'idle') return
    releaseSelection()
    resetResultState()
  }, [releaseSelection, resetResultState])

  const previewAgain = useCallback(() => {
    const selected = selection.current
    if (
      !enabledRef.current ||
      activity.current !== 'idle' ||
      selected === null ||
      selected.rawJson === null
    ) {
      return
    }
    setImportStatus('idle')
    setImportResult(null)
    setImportError(null)
    setImportOutcomeUncertain(false)
    setConfirmation(false)
    requestPreview(selected)
  }, [requestPreview, setConfirmation])

  const downloadBundle = useCallback(() => {
    if (!enabledRef.current || activity.current !== 'idle') return

    const generation = ++exportGeneration.current
    const controller = new AbortController()
    exportRequest.current = controller
    activity.current = 'export'
    setPending(true)
    setExportStatus('pending')
    setExportResult(null)
    setExportError(null)

    void exportTransferBundle(controller.signal)
      .then((result) => {
        if (
          controller.signal.aborted ||
          !mounted.current ||
          !enabledRef.current ||
          exportGeneration.current !== generation
        ) {
          return
        }

        const blob = new Blob([result.rawJson], {
          type: 'application/json;charset=utf-8',
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = result.filename
        anchor.hidden = true
        document.body.append(anchor)
        try {
          anchor.click()
        } finally {
          anchor.remove()
          URL.revokeObjectURL(url)
        }
        setExportResult(safeCounts(result.counts))
        setExportStatus('success')
      })
      .catch((error: unknown) => {
        if (
          wasAborted(error, controller.signal) ||
          !mounted.current ||
          !enabledRef.current ||
          exportGeneration.current !== generation
        ) {
          return
        }
        setExportStatus('error')
        setExportError(fixedMessage(error, 'Export failed.'))
      })
      .finally(() => {
        if (exportRequest.current === controller) exportRequest.current = null
        if (mounted.current && exportGeneration.current === generation) {
          finishActivity('export')
        }
      })
  }, [finishActivity])

  const openImportConfirmation = useCallback(() => {
    if (
      !enabledRef.current ||
      activity.current !== 'idle' ||
      !hasFreshImportablePreview(selection.current, preview.current)
    ) {
      return
    }
    setConfirmation(true)
  }, [setConfirmation])

  const cancelImportConfirmation = useCallback(() => {
    if (activity.current === 'import') return
    setConfirmation(false)
  }, [setConfirmation])

  const confirmImport = useCallback(() => {
    const selected = selection.current
    if (
      !enabledRef.current ||
      activity.current !== 'idle' ||
      !confirmationOpenRef.current ||
      selected === null ||
      selected.rawJson === null ||
      !hasFreshImportablePreview(selected, preview.current)
    ) {
      return
    }

    const rawJson = selected.rawJson
    const generation = ++importGeneration.current
    setConfirmation(false)
    setImportStatus('pending')
    setImportResult(null)
    setImportError(null)
    setImportOutcomeUncertain(false)
    activity.current = 'import'
    setPending(true)

    void importTransferBundle(rawJson)
      .then((result) => {
        if (
          !mounted.current ||
          !enabledRef.current ||
          importGeneration.current !== generation
        ) {
          return
        }
        selectionGeneration.current += 1
        selection.current = null
        setSelectionMetadata(null)
        setFreshPreview(null)
        setPreviewStatus('idle')
        setPreviewError(null)
        setPreviewIssues([])
        setImportResult(safeImportResult(result))
        setImportStatus('success')
      })
      .catch((error: unknown) => {
        if (
          !mounted.current ||
          !enabledRef.current ||
          importGeneration.current !== generation
        ) {
          return
        }
        const uncertain = error instanceof TransferHttpError && error.outcomeUncertain
        setFreshPreview(null)
        setPreviewStatus('idle')
        setPreviewError(null)
        setPreviewIssues([])
        setImportStatus('error')
        setImportOutcomeUncertain(uncertain)
        setImportError(
          uncertain
            ? 'The import outcome is uncertain. Refresh the registries and preview again before retrying.'
            : fixedMessage(error, 'Import failed.'),
        )
      })
      .finally(() => {
        if (mounted.current && importGeneration.current === generation) {
          finishActivity('import')
        }
      })
  }, [finishActivity, setConfirmation, setFreshPreview])

  const confirmDiscard = useCallback((): boolean => {
    if (activity.current !== 'idle') return false
    if (
      requiresDiscardConfirmation(selection.current, preview.current) &&
      !window.confirm('Discard the prepared import and leave Transfer?')
    ) {
      return false
    }
    releaseSelection()
    resetResultState()
    return true
  }, [releaseSelection, resetResultState])

  const forceRelease = useCallback(() => {
    selectionGeneration.current += 1
    exportGeneration.current += 1
    importGeneration.current += 1
    previewRequest.current?.abort()
    previewRequest.current = null
    exportRequest.current?.abort()
    exportRequest.current = null
    selection.current = null
    preview.current = null
    confirmationOpenRef.current = false
    activity.current = 'idle'
  }, [])

  useEffect(() => {
    if (enabled) return
    forceRelease()
    setSelectionMetadata(null)
    setFreshPreviewState(null)
    setExportStatus('idle')
    setExportResult(null)
    setExportError(null)
    setPreviewStatus('idle')
    setPreviewError(null)
    setPreviewIssues([])
    setImportStatus('idle')
    setImportResult(null)
    setImportError(null)
    setImportOutcomeUncertain(false)
    setConfirmationOpen(false)
    setPending(false)
  }, [enabled, forceRelease])

  const hasPreparedImport = hasFreshImportablePreview(selection.current, freshPreview)
  const canImport = enabled && !pending && hasPreparedImport

  useEffect(() => {
    if (!pending && !hasPreparedImport) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasPreparedImport, pending])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      forceRelease()
    }
  }, [forceRelease])

  return {
    selection: selectionMetadata,
    exportStatus,
    exportResult,
    exportError,
    previewStatus,
    preview: freshPreview?.response ?? null,
    previewError,
    previewIssues,
    importStatus,
    importResult,
    importError,
    importOutcomeUncertain,
    confirmationOpen,
    pending,
    canImport,
    hasPreparedImport,
    selectFile,
    clearSelection,
    previewAgain,
    downloadBundle,
    openImportConfirmation,
    cancelImportConfirmation,
    confirmImport,
    confirmDiscard,
  }
}
