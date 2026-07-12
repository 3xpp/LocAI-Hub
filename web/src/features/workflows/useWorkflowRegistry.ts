import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  getWorkflowLink,
  listWorkflowLinks,
  type WorkflowLink,
  type WorkflowLinkListQuery,
  type WorkflowLinkSummary,
} from '../../api/workflowLinks'
import {
  isWorkflowLinkDraftDirty,
  mergeWorkflowLinkPages,
  newWorkflowLinkDraft,
  workflowLinkToDraft,
  type WorkflowEditorMode,
  type WorkflowLinkDraft,
} from './workflowState'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250

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

interface SelectionState {
  id: number | null
  mode: WorkflowEditorMode
}

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
  pendingTag: string
  mobilePane: WorkflowRegistryPane
  editorFocusVersion: number
  detailLoading: boolean
  detailError: string | null
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
  recoverMissingWorkflowLink: () => void
  updateDraft: (draft: WorkflowLinkDraft) => void
  setPendingTag: (value: string) => void
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
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const activeListRequest = useRef<AbortController | null>(null)
  const listGeneration = useRef(0)
  const detailRequest = useRef<AbortController | null>(null)
  const detailGeneration = useRef(0)
  const debouncedQueryRef = useRef('')
  const pendingQueryCommit = useRef(false)
  const selection = useRef<SelectionState>({ id: null, mode: 'empty' })
  const autoSelectionEligible = useRef(true)
  const selectedWorkflowLinkRef = useRef<WorkflowLink | null>(null)
  const baselineRef = useRef(baseline)
  const dirtyRef = useRef(false)
  const pendingTagRef = useRef('')
  const mobileReturnTarget = useRef<number | 'new' | null>(null)
  const listFocusTarget = useRef<number | 'new' | null>(null)

  const dirty = useMemo(
    () => isWorkflowLinkDraftDirty(draft, baseline) || pendingTag.length > 0,
    [baseline, draft, pendingTag],
  )
  baselineRef.current = baseline
  dirtyRef.current = dirty
  pendingTagRef.current = pendingTag
  selectedWorkflowLinkRef.current = selectedWorkflowLink

  const requestListFocus = useCallback((target: number | 'new' | null) => {
    listFocusTarget.current = target
    setListFocusVersion((version) => version + 1)
  }, [])

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
    if (!dirtyRef.current) return true
    if (!window.confirm('Discard unsaved workflow link changes?')) return false
    dirtyRef.current = false
    pendingTagRef.current = ''
    setDraft(cloneDraft(baselineRef.current))
    setPendingTagState('')
    return true
  }, [])

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
  }, [detailRefreshVersion, editorMode, enabled, selectedId, selectedWorkflowLink?.id])

  useEffect(
    () => () => {
      listGeneration.current += 1
      activeListRequest.current?.abort()
      detailGeneration.current += 1
      detailRequest.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (!dirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty])

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
      selection.current = { id, mode: 'selected' }
      mobileReturnTarget.current = id
      setSelectedId(id)
      setEditorMode('selected')
      setSelectedWorkflowLink(null)
      setDetailError(null)
      setMobilePane('editor')
      setEditorFocusVersion((version) => version + 1)
    },
    [confirmDiscard],
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
    setMobilePane('editor')
    setEditorFocusVersion((version) => version + 1)
  }, [confirmDiscard])

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

  const retryDetail = useCallback(() => {
    detailGeneration.current += 1
    detailRequest.current?.abort()
    detailRequest.current = null
    setDetailRefreshVersion((version) => version + 1)
    setEditorFocusVersion((version) => version + 1)
  }, [])

  const recoverMissingWorkflowLink = useCallback(() => {
    if (!confirmDiscard()) return
    detailGeneration.current += 1
    detailRequest.current?.abort()
    detailRequest.current = null
    const blank = newWorkflowLinkDraft()
    selection.current = { id: null, mode: 'empty' }
    baselineRef.current = blank
    dirtyRef.current = false
    pendingTagRef.current = ''
    mobileReturnTarget.current = 'new'
    setSelectedId(null)
    setEditorMode('empty')
    setSelectedWorkflowLink(null)
    setDraft(blank)
    setBaseline(blank)
    setPendingTagState('')
    setDetailLoading(false)
    setDetailError(null)
    setMobilePane('list')
    setRefreshVersion((version) => version + 1)
    requestListFocus('new')
  }, [confirmDiscard, requestListFocus])

  const updateDraft = useCallback((nextDraft: WorkflowLinkDraft) => {
    setDraft(cloneDraft(nextDraft))
  }, [])

  const setPendingTag = useCallback((value: string) => {
    setPendingTagState(value)
  }, [])

  const backToList = useCallback(() => {
    if (!confirmDiscard()) return
    const returnTarget = mobileReturnTarget.current
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
  }, [confirmDiscard, requestListFocus])

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
      pendingTag,
      mobilePane,
      editorFocusVersion,
      detailLoading,
      detailError,
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
      recoverMissingWorkflowLink,
      updateDraft,
      setPendingTag,
      confirmDiscard,
      backToList,
    }),
    [
      activeTag,
      applyTag,
      backToList,
      clearTag,
      confirmDiscard,
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
      nextOffset,
      pendingTag,
      query,
      recoverMissingWorkflowLink,
      retry,
      retryDetail,
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
