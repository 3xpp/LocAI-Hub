import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { listPrompts, type PromptListQuery, type PromptSummary } from '../../api/prompts'
import { mergePromptPages, type PromptEditorMode } from './promptState'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250

const messageFrom = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred'

const wasAborted = (error: unknown, signal: AbortSignal) =>
  signal.aborted || (error instanceof DOMException && error.name === 'AbortError')

const desktopLayoutMatches = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 601px)').matches

interface SelectionState {
  id: number | null
  mode: PromptEditorMode
}

export interface PromptRegistryController {
  query: string
  activeTag: string | null
  items: PromptSummary[]
  total: number
  selectedId: number | null
  editorMode: PromptEditorMode
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  setQuery: (query: string) => void
  applyTag: (tag: string) => void
  clearTag: () => void
  selectPrompt: (id: number) => void
  startNewPrompt: () => void
  loadMore: () => void
  retry: () => void
}

export function usePromptRegistry(enabled: boolean): PromptRegistryController {
  const [query, setQueryState] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [items, setItems] = useState<PromptSummary[]>([])
  const [total, setTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editorMode, setEditorMode] = useState<PromptEditorMode>('empty')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const activeRequest = useRef<AbortController | null>(null)
  const requestGeneration = useRef(0)
  const debouncedQueryRef = useRef('')
  const pendingQueryCommit = useRef(false)
  const selection = useRef<SelectionState>({ id: null, mode: 'empty' })
  const autoSelectionEligible = useRef(true)

  const invalidateForFilter = useCallback(() => {
    requestGeneration.current += 1
    activeRequest.current?.abort()
    activeRequest.current = null
    setItems([])
    setTotal(0)
    setNextOffset(0)
    setLoading(true)
    setLoadingMore(false)
    setError(null)
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
    (offset: number): PromptListQuery => ({
      q: debouncedQuery || undefined,
      tag: activeTag ?? undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [activeTag, debouncedQuery],
  )

  useEffect(() => {
    if (!enabled) {
      requestGeneration.current += 1
      activeRequest.current?.abort()
      activeRequest.current = null
      setLoading(false)
      setLoadingMore(false)
      return
    }

    activeRequest.current?.abort()
    const controller = new AbortController()
    const generation = ++requestGeneration.current
    activeRequest.current = controller
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setItems([])
    setTotal(0)
    setNextOffset(0)

    void listPrompts(requestQuery(0), controller.signal)
      .then((response) => {
        if (controller.signal.aborted || requestGeneration.current !== generation) return
        setItems(response.items)
        setTotal(response.total)
        setNextOffset(response.offset + response.items.length)

        const first = response.items[0]
        if (
          autoSelectionEligible.current &&
          first !== undefined &&
          desktopLayoutMatches() &&
          selection.current.mode === 'empty' &&
          selection.current.id === null
        ) {
          selection.current = { id: first.id, mode: 'selected' }
          setSelectedId(first.id)
          setEditorMode('selected')
        }
        autoSelectionEligible.current = false
      })
      .catch((requestError: unknown) => {
        if (
          !wasAborted(requestError, controller.signal) &&
          requestGeneration.current === generation
        ) {
          setError(messageFrom(requestError))
        }
      })
      .finally(() => {
        if (requestGeneration.current === generation) {
          setLoading(false)
          if (activeRequest.current === controller) activeRequest.current = null
        }
      })

    return () => controller.abort()
  }, [enabled, refreshVersion, requestQuery])

  useEffect(
    () => () => {
      requestGeneration.current += 1
      activeRequest.current?.abort()
    },
    [],
  )

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

  const selectPrompt = useCallback((id: number) => {
    autoSelectionEligible.current = false
    selection.current = { id, mode: 'selected' }
    setSelectedId(id)
    setEditorMode('selected')
  }, [])

  const startNewPrompt = useCallback(() => {
    autoSelectionEligible.current = false
    selection.current = { id: null, mode: 'new' }
    setSelectedId(null)
    setEditorMode('new')
  }, [])

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || nextOffset >= total) return

    activeRequest.current?.abort()
    const controller = new AbortController()
    const generation = ++requestGeneration.current
    activeRequest.current = controller
    setLoadingMore(true)
    setError(null)

    void listPrompts(requestQuery(nextOffset), controller.signal)
      .then((response) => {
        if (controller.signal.aborted || requestGeneration.current !== generation) return
        setItems((current) => mergePromptPages(current, response.items))
        setTotal(response.total)
        setNextOffset(response.offset + response.items.length)
      })
      .catch((requestError: unknown) => {
        if (
          !wasAborted(requestError, controller.signal) &&
          requestGeneration.current === generation
        ) {
          setError(messageFrom(requestError))
        }
      })
      .finally(() => {
        if (requestGeneration.current === generation) {
          setLoadingMore(false)
          if (activeRequest.current === controller) activeRequest.current = null
        }
      })
  }, [enabled, loading, loadingMore, nextOffset, requestQuery, total])

  const retry = useCallback(() => setRefreshVersion((version) => version + 1), [])

  return useMemo(
    () => ({
      query,
      activeTag,
      items,
      total,
      selectedId,
      editorMode,
      loading,
      loadingMore,
      error,
      hasMore: nextOffset < total,
      setQuery: updateQuery,
      applyTag,
      clearTag,
      selectPrompt,
      startNewPrompt,
      loadMore,
      retry,
    }),
    [
      activeTag,
      applyTag,
      clearTag,
      editorMode,
      error,
      items,
      loadMore,
      loading,
      loadingMore,
      nextOffset,
      query,
      retry,
      selectPrompt,
      selectedId,
      startNewPrompt,
      total,
      updateQuery,
    ],
  )
}
