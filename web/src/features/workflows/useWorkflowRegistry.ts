import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BackendHttpError } from '../../api/client'
import { isSafeWorkflowLinkUrl } from '../../api/workflowLinkUrl'
import {
  createWorkflowLink,
  deleteWorkflowLink,
  getWorkflowLink,
  listWorkflowLinks,
  updateWorkflowLink,
  type WorkflowLink,
  type WorkflowLinkListQuery,
  type WorkflowLinkSummary,
} from '../../api/workflowLinks'
import {
  isWorkflowLinkDraftDirty,
  mergeWorkflowLinkPages,
  newWorkflowLinkDraft,
  normalizeWorkflowLinkTag,
  workflowLinkTextLength,
  workflowLinkToDraft,
  type WorkflowEditorMode,
  type WorkflowLinkDraft,
} from './workflowState'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250
const MAX_DESCRIPTION_PREVIEW = 160
const MISSING_WORKFLOW_LINK_MESSAGE =
  'Workflow link no longer exists; the directory was refreshed'

const messageFrom = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred'

const wasAborted = (error: unknown, signal: AbortSignal) =>
  signal.aborted || (error instanceof DOMException && error.name === 'AbortError')

const desktopLayoutMatches = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 601px)').matches

const cloneDraft = (draft: WorkflowLinkDraft): WorkflowLinkDraft => ({
  title: draft.title,
  url: draft.url,
  description: draft.description,
  tags: [...draft.tags],
})

const descriptionPreview = (description: string) => {
  const collapsed = description.trim().replace(/\s+/gu, ' ')
  const characters = Array.from(collapsed)
  return characters.length <= MAX_DESCRIPTION_PREVIEW
    ? collapsed
    : `${characters.slice(0, MAX_DESCRIPTION_PREVIEW).join('')}…`
}

const workflowLinkToSummary = (item: WorkflowLink): WorkflowLinkSummary => ({
  id: item.id,
  title: item.title,
  url: item.url,
  description_preview: descriptionPreview(item.description),
  tags: [...item.tags],
  created_at: item.created_at,
  updated_at: item.updated_at,
})

interface SelectionState {
  id: number | null
  mode: WorkflowEditorMode
}

export type WorkflowMutationStatus = 'idle' | 'saving' | 'deleting'
export type WorkflowRegistryPane = 'list' | 'editor'

export interface WorkflowRegistryController {
  query: string
  activeTag: string | null
  items: WorkflowLinkSummary[]
  total: number
  selectedId: number | null
  editorMode: WorkflowEditorMode
  selectedWorkflowLink: WorkflowLink | null
  draft: WorkflowLinkDraft
  dirty: boolean
  canSave: boolean
  pendingTag: string
  mobilePane: WorkflowRegistryPane
  editorFocusVersion: number
  detailLoading: boolean
  detailError: string | null
  mutationStatus: WorkflowMutationStatus
  mutationError: string | null
  saveMessage: string | null
  copyMessage: string | null
  copyPending: boolean
  registryMessage: string | null
  registryError: string | null
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  setQuery: (query: string) => void
  applyTag: (tag: string) => void
  clearTag: () => void
  selectWorkflowLink: (id: number) => void
  startNewWorkflowLink: () => void
  loadMore: () => void
  retry: () => void
  retryDetail: () => void
  refreshList: () => void
  recoverMissingWorkflowLink: () => void
  updateDraft: (draft: WorkflowLinkDraft) => void
  setPendingTag: (value: string) => void
  saveWorkflowLink: () => Promise<boolean>
  copySavedUrl: () => Promise<void>
  deleteCurrentWorkflowLink: () => Promise<boolean>
  confirmDiscard: () => boolean
  backToList: () => void
}

export function useWorkflowRegistry(enabled: boolean): WorkflowRegistryController {
  const [query, setQueryState] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [items, setItems] = useState<WorkflowLinkSummary[]>([])
  const [total, setTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editorMode, setEditorMode] = useState<WorkflowEditorMode>('empty')
  const [selectedWorkflowLink, setSelectedWorkflowLink] = useState<WorkflowLink | null>(null)
  const [draft, setDraft] = useState<WorkflowLinkDraft>(newWorkflowLinkDraft)
  const [baseline, setBaseline] = useState<WorkflowLinkDraft>(newWorkflowLinkDraft)
  const [pendingTag, setPendingTagState] = useState('')
  const [mobilePane, setMobilePane] = useState<WorkflowRegistryPane>('list')
  const [editorFocusVersion, setEditorFocusVersion] = useState(0)
  const [listFocusVersion, setListFocusVersion] = useState(0)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailRefreshVersion, setDetailRefreshVersion] = useState(0)
  const [mutationStatus, setMutationStatus] = useState<WorkflowMutationStatus>('idle')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const [copyPending, setCopyPending] = useState(false)
  const [registryMessage, setRegistryMessage] = useState<string | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const activeListRequest = useRef<AbortController | null>(null)
  const listGeneration = useRef(0)
  const detailRequest = useRef<AbortController | null>(null)
  const detailGeneration = useRef(0)
  const mutationRequest = useRef<AbortController | null>(null)
  const mutationGeneration = useRef(0)
  const copyGeneration = useRef(0)
  const debouncedQueryRef = useRef('')
  const pendingQueryCommit = useRef(false)
  const selection = useRef<SelectionState>({ id: null, mode: 'empty' })
  const autoSelectionEligible = useRef(true)
  const selectedWorkflowLinkRef = useRef<WorkflowLink | null>(null)
  const baselineRef = useRef(baseline)
  const dirtyRef = useRef(false)
  const pendingTagRef = useRef('')
  const mutationStatusRef = useRef<WorkflowMutationStatus>('idle')
  const mobileReturnTarget = useRef<number | 'new' | null>(null)
  const listFocusTarget = useRef<number | 'new' | null>(null)
  const focusHandoffTimers = useRef<Set<number>>(new Set())

  const dirty = useMemo(
    () => isWorkflowLinkDraftDirty(draft, baseline) || pendingTag.length > 0,
    [baseline, draft, pendingTag],
  )

  const normalizedTitle = draft.title.trim()
  const normalizedUrl = draft.url.trim()
  const normalizedDescription = draft.description.trim()
  let normalizedPendingTag: string | null = null
  if (pendingTag.length > 0) {
    try {
      normalizedPendingTag = normalizeWorkflowLinkTag(pendingTag)
    } catch {
      normalizedPendingTag = null
    }
  }
  const pendingTagValid = pendingTag.length === 0 || normalizedPendingTag !== null
  const saveTags = useMemo(
    () =>
      normalizedPendingTag !== null && !draft.tags.includes(normalizedPendingTag)
        ? [...draft.tags, normalizedPendingTag]
        : [...draft.tags],
    [draft.tags, normalizedPendingTag],
  )
  const canonicalTagsValid = (() => {
    if (saveTags.length > 10) return false
    const seen = new Set<string>()
    try {
      for (const tag of saveTags) {
        const canonical = normalizeWorkflowLinkTag(tag)
        if (canonical !== tag || seen.has(canonical)) return false
        seen.add(canonical)
      }
      return true
    } catch {
      return false
    }
  })()
  const draftValid =
    normalizedTitle.length > 0 &&
    workflowLinkTextLength(normalizedTitle) <= 200 &&
    normalizedUrl.length > 0 &&
    workflowLinkTextLength(normalizedUrl) <= 2_048 &&
    isSafeWorkflowLinkUrl(normalizedUrl) &&
    workflowLinkTextLength(normalizedDescription) <= 5_000 &&
    pendingTagValid &&
    canonicalTagsValid
  const canSave =
    dirty &&
    draftValid &&
    mutationStatus === 'idle' &&
    !detailLoading &&
    detailError === null &&
    (editorMode === 'new' || (editorMode === 'selected' && selectedWorkflowLink !== null))

  baselineRef.current = baseline
  dirtyRef.current = dirty
  pendingTagRef.current = pendingTag
  mutationStatusRef.current = mutationStatus
  selectedWorkflowLinkRef.current = selectedWorkflowLink

  const invalidateCopy = useCallback(() => {
    copyGeneration.current += 1
    setCopyPending(false)
    setCopyMessage(null)
  }, [])

  const requestListFocus = useCallback((target: number | 'new' | null) => {
    listFocusTarget.current = target
    setListFocusVersion((version) => version + 1)
  }, [])

  const deferListFocus = useCallback(
    (target: number | 'new' | null) => {
      const timer = window.setTimeout(() => {
        focusHandoffTimers.current.delete(timer)
        requestListFocus(target)
      }, 0)
      focusHandoffTimers.current.add(timer)
    },
    [requestListFocus],
  )

  const stopListRequest = useCallback(() => {
    listGeneration.current += 1
    activeListRequest.current?.abort()
    activeListRequest.current = null
    setLoadingMore(false)
  }, [])

  const invalidateForFilter = useCallback(() => {
    stopListRequest()
    setItems([])
    setTotal(0)
    setNextOffset(0)
    setLoading(true)
    setError(null)
  }, [stopListRequest])

  const confirmDiscard = useCallback(() => {
    if (mutationStatusRef.current !== 'idle') return false
    if (!dirtyRef.current) {
      invalidateCopy()
      return true
    }
    if (!window.confirm('Discard unsaved workflow link changes?')) return false
    dirtyRef.current = false
    pendingTagRef.current = ''
    invalidateCopy()
    setDraft(cloneDraft(baselineRef.current))
    setPendingTagState('')
    setMutationError(null)
    setSaveMessage(null)
    return true
  }, [invalidateCopy])

  const updateQuery = useCallback(
    (value: string) => {
      if (value === query) return
      if (value.trim() !== query.trim()) {
        pendingQueryCommit.current = true
        invalidateForFilter()
      }
      setQueryState(value)
    },
    [invalidateForFilter, query],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!pendingQueryCommit.current) return
      pendingQueryCommit.current = false
      const normalizedQuery = query.trim()
      if (normalizedQuery === debouncedQueryRef.current) {
        setRefreshVersion((version) => version + 1)
      } else {
        debouncedQueryRef.current = normalizedQuery
        setDebouncedQuery(normalizedQuery)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const requestQuery = useCallback(
    (offset: number): WorkflowLinkListQuery => ({
      q: debouncedQuery || undefined,
      tag: activeTag ?? undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [activeTag, debouncedQuery],
  )

  useEffect(() => {
    if (!enabled) {
      stopListRequest()
      setLoading(false)
      return
    }

    activeListRequest.current?.abort()
    const controller = new AbortController()
    const generation = ++listGeneration.current
    activeListRequest.current = controller
    setLoading(true)
    setLoadingMore(false)
    setError(null)

    void listWorkflowLinks(requestQuery(0), controller.signal)
      .then((response) => {
        if (controller.signal.aborted || listGeneration.current !== generation) return
        setItems(response.items)
        setTotal(response.total)
        setNextOffset(response.offset + response.items.length)

        const first = response.items[0]
        if (
          autoSelectionEligible.current &&
          first !== undefined &&
          desktopLayoutMatches() &&
          selection.current.mode === 'empty' &&
          selection.current.id === null &&
          !dirtyRef.current &&
          pendingTagRef.current.length === 0 &&
          selectedWorkflowLinkRef.current === null &&
          detailRequest.current === null
        ) {
          selection.current = { id: first.id, mode: 'selected' }
          setSelectedId(first.id)
          setEditorMode('selected')
          setSelectedWorkflowLink(null)
          setDetailError(null)
        }
        autoSelectionEligible.current = false
      })
      .catch((requestError: unknown) => {
        if (!wasAborted(requestError, controller.signal) && listGeneration.current === generation) {
          setError(messageFrom(requestError))
        }
      })
      .finally(() => {
        if (listGeneration.current !== generation) return
        setLoading(false)
        if (activeListRequest.current === controller) activeListRequest.current = null
      })

    return () => controller.abort()
  }, [enabled, refreshVersion, requestQuery, stopListRequest])

  useEffect(() => {
    if (!enabled || editorMode !== 'selected' || selectedId === null) {
      detailGeneration.current += 1
      detailRequest.current?.abort()
      detailRequest.current = null
      setDetailLoading(false)
      return
    }
    if (selectedWorkflowLink?.id === selectedId) return

    detailRequest.current?.abort()
    const controller = new AbortController()
    const generation = ++detailGeneration.current
    detailRequest.current = controller
    const blank = newWorkflowLinkDraft()
    dirtyRef.current = false
    pendingTagRef.current = ''
    baselineRef.current = blank
    setSelectedWorkflowLink(null)
    setDraft(blank)
    setBaseline(blank)
    setPendingTagState('')
    setDetailLoading(true)
    setDetailError(null)
    setMutationError(null)
    setSaveMessage(null)
    invalidateCopy()

    void getWorkflowLink(selectedId, controller.signal)
      .then((item) => {
        if (controller.signal.aborted || detailGeneration.current !== generation) return
        const nextDraft = workflowLinkToDraft(item)
        dirtyRef.current = false
        pendingTagRef.current = ''
        baselineRef.current = nextDraft
        setSelectedWorkflowLink(item)
        setDraft(nextDraft)
        setBaseline(nextDraft)
        setPendingTagState('')
      })
      .catch((requestError: unknown) => {
        if (
          !wasAborted(requestError, controller.signal) &&
          detailGeneration.current === generation
        ) {
          setDetailError(messageFrom(requestError))
        }
      })
      .finally(() => {
        if (detailGeneration.current !== generation) return
        setDetailLoading(false)
        if (detailRequest.current === controller) detailRequest.current = null
      })

    return () => controller.abort()
  }, [
    detailRefreshVersion,
    editorMode,
    enabled,
    invalidateCopy,
    selectedId,
    selectedWorkflowLink?.id,
  ])

  useEffect(
    () => () => {
      listGeneration.current += 1
      activeListRequest.current?.abort()
      detailGeneration.current += 1
      detailRequest.current?.abort()
      mutationGeneration.current += 1
      mutationRequest.current?.abort()
      copyGeneration.current += 1
      for (const timer of focusHandoffTimers.current) window.clearTimeout(timer)
      focusHandoffTimers.current.clear()
    },
    [],
  )

  useEffect(() => {
    if (!dirty && mutationStatus === 'idle') return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty, mutationStatus])

  useEffect(() => {
    if (listFocusVersion === 0) return
    const timer = window.setTimeout(() => {
      const target = listFocusTarget.current
      const selector =
        target === 'new' || target === null
          ? '[data-new-workflow-link]'
          : `[data-workflow-link-id="${target}"]`
      const element =
        document.querySelector<HTMLElement>(selector) ??
        document.querySelector<HTMLElement>('[data-new-workflow-link]') ??
        document.querySelector<HTMLElement>('[data-workflow-registry-heading]')
      element?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [listFocusVersion])

  const applyTag = useCallback(
    (tag: string) => {
      if (tag === activeTag) return
      invalidateForFilter()
      setActiveTag(tag)
    },
    [activeTag, invalidateForFilter],
  )

  const clearTag = useCallback(() => {
    if (activeTag === null) return
    invalidateForFilter()
    setActiveTag(null)
  }, [activeTag, invalidateForFilter])

  const selectWorkflowLink = useCallback(
    (id: number) => {
      if (mutationStatusRef.current !== 'idle') return
      if (selection.current.mode === 'selected' && selection.current.id === id) {
        mobileReturnTarget.current = id
        setMobilePane('editor')
        setEditorFocusVersion((version) => version + 1)
        return
      }
      if (!confirmDiscard()) return
      autoSelectionEligible.current = false
      detailGeneration.current += 1
      detailRequest.current?.abort()
      detailRequest.current = null
      invalidateCopy()
      selection.current = { id, mode: 'selected' }
      mobileReturnTarget.current = id
      setSelectedId(id)
      setEditorMode('selected')
      setSelectedWorkflowLink(null)
      setDetailError(null)
      setMutationError(null)
      setSaveMessage(null)
      setRegistryMessage(null)
      setRegistryError(null)
      setMobilePane('editor')
      setEditorFocusVersion((version) => version + 1)
    },
    [confirmDiscard, invalidateCopy],
  )

  const startNewWorkflowLink = useCallback(() => {
    if (!confirmDiscard()) return
    autoSelectionEligible.current = false
    detailGeneration.current += 1
    detailRequest.current?.abort()
    detailRequest.current = null
    const blank = newWorkflowLinkDraft()
    dirtyRef.current = false
    pendingTagRef.current = ''
    baselineRef.current = blank
    invalidateCopy()
    selection.current = { id: null, mode: 'new' }
    mobileReturnTarget.current = 'new'
    setSelectedId(null)
    setEditorMode('new')
    setSelectedWorkflowLink(null)
    setDraft(blank)
    setBaseline(blank)
    setPendingTagState('')
    setDetailLoading(false)
    setDetailError(null)
    setMutationError(null)
    setSaveMessage(null)
    setRegistryMessage(null)
    setRegistryError(null)
    setMobilePane('editor')
    setEditorFocusVersion((version) => version + 1)
  }, [confirmDiscard, invalidateCopy])

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || nextOffset >= total) return

    activeListRequest.current?.abort()
    const controller = new AbortController()
    const generation = ++listGeneration.current
    activeListRequest.current = controller
    setLoadingMore(true)
    setError(null)

    void listWorkflowLinks(requestQuery(nextOffset), controller.signal)
      .then((response) => {
        if (controller.signal.aborted || listGeneration.current !== generation) return
        setItems((current) => mergeWorkflowLinkPages(current, response.items))
        setTotal(response.total)
        setNextOffset(response.offset + response.items.length)
      })
      .catch((requestError: unknown) => {
        if (!wasAborted(requestError, controller.signal) && listGeneration.current === generation) {
          setError(messageFrom(requestError))
        }
      })
      .finally(() => {
        if (listGeneration.current !== generation) return
        setLoadingMore(false)
        if (activeListRequest.current === controller) activeListRequest.current = null
      })
  }, [enabled, loading, loadingMore, nextOffset, requestQuery, total])

  const retry = useCallback(() => {
    stopListRequest()
    setLoading(true)
    setError(null)
    setRefreshVersion((version) => version + 1)
  }, [stopListRequest])
  const refreshList = retry

  const retryDetail = useCallback(() => {
    detailGeneration.current += 1
    detailRequest.current?.abort()
    detailRequest.current = null
    setDetailError(null)
    setDetailRefreshVersion((version) => version + 1)
    setEditorFocusVersion((version) => version + 1)
  }, [])

  const recoverMissingWorkflowLink = useCallback(() => {
    if (!confirmDiscard()) return
    stopListRequest()
    detailGeneration.current += 1
    detailRequest.current?.abort()
    detailRequest.current = null
    const blank = newWorkflowLinkDraft()
    const missingId = selection.current.id
    selection.current = { id: null, mode: 'empty' }
    baselineRef.current = blank
    dirtyRef.current = false
    pendingTagRef.current = ''
    mobileReturnTarget.current = 'new'
    invalidateCopy()
    setSelectedId(null)
    setEditorMode('empty')
    setSelectedWorkflowLink(null)
    setDraft(blank)
    setBaseline(blank)
    setPendingTagState('')
    setDetailLoading(false)
    setDetailError(null)
    setMutationError(null)
    setSaveMessage(null)
    setRegistryMessage(null)
    setRegistryError(MISSING_WORKFLOW_LINK_MESSAGE)
    setItems((current) => current.filter((item) => item.id !== missingId))
    setMobilePane('list')
    setRefreshVersion((version) => version + 1)
    deferListFocus('new')
  }, [confirmDiscard, deferListFocus, invalidateCopy, stopListRequest])

  const updateDraft = useCallback(
    (nextDraft: WorkflowLinkDraft) => {
      invalidateCopy()
      setDraft(cloneDraft(nextDraft))
      setMutationError(null)
      setSaveMessage(null)
    },
    [invalidateCopy],
  )

  const setPendingTag = useCallback(
    (value: string) => {
      invalidateCopy()
      setPendingTagState(value)
      setMutationError(null)
      setSaveMessage(null)
    },
    [invalidateCopy],
  )

  const saveWorkflowLink = useCallback(async () => {
    if (!canSave || mutationStatusRef.current !== 'idle') return false
    if (editorMode !== 'new' && (editorMode !== 'selected' || selectedId === null)) return false

    const controller = new AbortController()
    mutationRequest.current?.abort()
    mutationRequest.current = controller
    const generation = ++mutationGeneration.current
    mutationStatusRef.current = 'saving'
    setMutationStatus('saving')
    setMutationError(null)
    setSaveMessage(null)
    setRegistryMessage(null)
    setRegistryError(null)
    invalidateCopy()

    const input = {
      title: draft.title,
      url: draft.url,
      description: draft.description,
      tags: [...saveTags],
    }

    try {
      const item =
        editorMode === 'new'
          ? await createWorkflowLink(input, controller.signal)
          : await updateWorkflowLink(selectedId as number, input, controller.signal)
      if (
        controller.signal.aborted ||
        mutationRequest.current !== controller ||
        mutationGeneration.current !== generation
      ) {
        return false
      }

      stopListRequest()
      const nextDraft = workflowLinkToDraft(item)
      const itemSummary = workflowLinkToSummary(item)
      const created = editorMode === 'new'
      autoSelectionEligible.current = false
      selection.current = { id: item.id, mode: 'selected' }
      mobileReturnTarget.current = item.id
      baselineRef.current = nextDraft
      dirtyRef.current = false
      pendingTagRef.current = ''
      selectedWorkflowLinkRef.current = item
      setSelectedId(item.id)
      setEditorMode('selected')
      setSelectedWorkflowLink(item)
      setDraft(nextDraft)
      setBaseline(nextDraft)
      setPendingTagState('')
      setDetailError(null)
      setMutationError(null)
      setSaveMessage('Saved locally')
      setItems((current) => [itemSummary, ...current.filter((entry) => entry.id !== item.id)])
      if (created) {
        setTotal((current) => current + 1)
        setNextOffset((current) => current + 1)
      }
      setRefreshVersion((version) => version + 1)
      return true
    } catch (requestError) {
      if (
        !wasAborted(requestError, controller.signal) &&
        mutationRequest.current === controller &&
        mutationGeneration.current === generation
      ) {
        setMutationError(messageFrom(requestError))
      }
      return false
    } finally {
      if (
        mutationRequest.current === controller &&
        mutationGeneration.current === generation
      ) {
        mutationRequest.current = null
        mutationStatusRef.current = 'idle'
        setMutationStatus('idle')
      }
    }
  }, [
    canSave,
    draft.description,
    draft.title,
    draft.url,
    editorMode,
    invalidateCopy,
    saveTags,
    selectedId,
    stopListRequest,
  ])

  const copySavedUrl = useCallback(async () => {
    const persisted = selectedWorkflowLinkRef.current
    if (persisted === null || !isSafeWorkflowLinkUrl(persisted.url)) return
    const generation = ++copyGeneration.current
    const persistedId = persisted.id
    const persistedUrl = persisted.url
    setCopyPending(true)
    setCopyMessage(null)

    try {
      await navigator.clipboard.writeText(persistedUrl)
      const current = selectedWorkflowLinkRef.current
      if (
        copyGeneration.current !== generation ||
        current?.id !== persistedId ||
        current.url !== persistedUrl
      ) {
        return
      }
      setCopyMessage('Saved URL copied')
    } catch {
      const current = selectedWorkflowLinkRef.current
      if (
        copyGeneration.current !== generation ||
        current?.id !== persistedId ||
        current.url !== persistedUrl
      ) {
        return
      }
      setCopyMessage('Copy failed; clipboard access was unavailable')
    } finally {
      if (copyGeneration.current === generation) setCopyPending(false)
    }
  }, [])

  const deleteCurrentWorkflowLink = useCallback(async () => {
    const persisted = selectedWorkflowLinkRef.current
    if (
      editorMode !== 'selected' ||
      selectedId === null ||
      persisted === null ||
      mutationStatusRef.current !== 'idle'
    ) {
      return false
    }

    const deletingId = selectedId
    const deletingTitle = persisted.title
    const deletingIndex = items.findIndex((item) => item.id === deletingId)
    const focusTarget =
      deletingIndex >= 0
        ? (items[deletingIndex + 1]?.id ?? items[deletingIndex - 1]?.id ?? 'new')
        : 'new'
    const controller = new AbortController()
    mutationRequest.current?.abort()
    mutationRequest.current = controller
    const generation = ++mutationGeneration.current
    mutationStatusRef.current = 'deleting'
    setMutationStatus('deleting')
    setMutationError(null)
    setSaveMessage(null)
    setRegistryMessage(null)
    setRegistryError(null)
    invalidateCopy()

    const recoverToDirectory = (missing: boolean) => {
      stopListRequest()
      const blank = newWorkflowLinkDraft()
      detailGeneration.current += 1
      detailRequest.current?.abort()
      detailRequest.current = null
      selection.current = { id: null, mode: 'empty' }
      baselineRef.current = blank
      dirtyRef.current = false
      pendingTagRef.current = ''
      selectedWorkflowLinkRef.current = null
      mobileReturnTarget.current = focusTarget
      setSelectedId(null)
      setEditorMode('empty')
      setSelectedWorkflowLink(null)
      setDraft(blank)
      setBaseline(blank)
      setPendingTagState('')
      setDetailLoading(false)
      setDetailError(null)
      setMutationError(null)
      setSaveMessage(null)
      setItems((current) => current.filter((item) => item.id !== deletingId))
      if (deletingIndex >= 0) {
        setTotal((current) => Math.max(0, current - 1))
        setNextOffset((current) => Math.max(0, current - 1))
      }
      setRegistryMessage(missing ? null : `${deletingTitle} deleted from local registry`)
      setRegistryError(missing ? MISSING_WORKFLOW_LINK_MESSAGE : null)
      setMobilePane('list')
      setRefreshVersion((version) => version + 1)
      deferListFocus(focusTarget)
    }

    try {
      await deleteWorkflowLink(deletingId, controller.signal)
      if (
        controller.signal.aborted ||
        mutationRequest.current !== controller ||
        mutationGeneration.current !== generation
      ) {
        return false
      }
      recoverToDirectory(false)
      return true
    } catch (requestError) {
      if (
        wasAborted(requestError, controller.signal) ||
        mutationRequest.current !== controller ||
        mutationGeneration.current !== generation
      ) {
        return false
      }
      if (requestError instanceof BackendHttpError && requestError.status === 404) {
        recoverToDirectory(true)
      } else {
        setMutationError(messageFrom(requestError))
      }
      return false
    } finally {
      if (
        mutationRequest.current === controller &&
        mutationGeneration.current === generation
      ) {
        mutationRequest.current = null
        mutationStatusRef.current = 'idle'
        setMutationStatus('idle')
      }
    }
  }, [
    deferListFocus,
    editorMode,
    invalidateCopy,
    items,
    selectedId,
    stopListRequest,
  ])

  const backToList = useCallback(() => {
    if (!confirmDiscard()) return
    const returnTarget = mobileReturnTarget.current
    invalidateCopy()
    if (selection.current.mode === 'new') {
      const blank = newWorkflowLinkDraft()
      selection.current = { id: null, mode: 'empty' }
      baselineRef.current = blank
      dirtyRef.current = false
      pendingTagRef.current = ''
      setSelectedId(null)
      setEditorMode('empty')
      setSelectedWorkflowLink(null)
      setDraft(blank)
      setBaseline(blank)
      setPendingTagState('')
    }
    setMobilePane('list')
    requestListFocus(returnTarget)
  }, [confirmDiscard, invalidateCopy, requestListFocus])

  return useMemo(
    () => ({
      query,
      activeTag,
      items,
      total,
      selectedId,
      editorMode,
      selectedWorkflowLink,
      draft,
      dirty,
      canSave,
      pendingTag,
      mobilePane,
      editorFocusVersion,
      detailLoading,
      detailError,
      mutationStatus,
      mutationError,
      saveMessage,
      copyMessage,
      copyPending,
      registryMessage,
      registryError,
      loading,
      loadingMore,
      error,
      hasMore: nextOffset < total,
      setQuery: updateQuery,
      applyTag,
      clearTag,
      selectWorkflowLink,
      startNewWorkflowLink,
      loadMore,
      retry,
      retryDetail,
      refreshList,
      recoverMissingWorkflowLink,
      updateDraft,
      setPendingTag,
      saveWorkflowLink,
      copySavedUrl,
      deleteCurrentWorkflowLink,
      confirmDiscard,
      backToList,
    }),
    [
      activeTag,
      applyTag,
      backToList,
      canSave,
      clearTag,
      confirmDiscard,
      copyMessage,
      copyPending,
      copySavedUrl,
      deleteCurrentWorkflowLink,
      detailError,
      detailLoading,
      dirty,
      draft,
      editorFocusVersion,
      editorMode,
      error,
      items,
      loadMore,
      loading,
      loadingMore,
      mobilePane,
      mutationError,
      mutationStatus,
      nextOffset,
      pendingTag,
      query,
      recoverMissingWorkflowLink,
      refreshList,
      registryError,
      registryMessage,
      retry,
      retryDetail,
      saveMessage,
      saveWorkflowLink,
      selectWorkflowLink,
      selectedId,
      selectedWorkflowLink,
      setPendingTag,
      startNewWorkflowLink,
      total,
      updateDraft,
      updateQuery,
    ],
  )
}
