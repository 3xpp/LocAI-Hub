import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  updatePrompt,
  type Prompt,
  type PromptListQuery,
  type PromptSummary,
} from '../../api/prompts'
import {
  isPromptDraftDirty,
  mergePromptPages,
  newPromptDraft,
  normalizePromptTag,
  promptTextLength,
  promptToDraft,
  type PromptDraft,
  type PromptEditorMode,
} from './promptState'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250

const messageFrom = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred'

const wasAborted = (error: unknown, signal: AbortSignal) =>
  signal.aborted || (error instanceof DOMException && error.name === 'AbortError')

const desktopLayoutMatches = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 601px)').matches

const cloneDraft = (draft: PromptDraft): PromptDraft => ({
  title: draft.title,
  content: draft.content,
  tags: [...draft.tags],
})

interface SelectionState {
  id: number | null
  mode: PromptEditorMode
}

export type PromptMutationStatus = 'idle' | 'saving' | 'deleting'
export type MobileRegistryPane = 'list' | 'editor'

export interface PromptRegistryController {
  query: string
  activeTag: string | null
  items: PromptSummary[]
  total: number
  selectedId: number | null
  editorMode: PromptEditorMode
  selectedPrompt: Prompt | null
  draft: PromptDraft
  dirty: boolean
  canSave: boolean
  detailLoading: boolean
  detailError: string | null
  mutationStatus: PromptMutationStatus
  mutationError: string | null
  saveMessage: string | null
  copyMessage: string | null
  registryMessage: string | null
  pendingTag: string
  mobilePane: MobileRegistryPane
  editorFocusVersion: number
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
  retryDetail: () => void
  refreshList: () => void
  updateDraft: (draft: PromptDraft) => void
  setPendingTag: (value: string) => void
  savePrompt: () => Promise<boolean>
  copyPrompt: () => Promise<void>
  deleteCurrentPrompt: () => Promise<boolean>
  confirmDiscard: () => boolean
  recoverMissingPrompt: () => void
  backToList: () => void
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
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [draft, setDraft] = useState<PromptDraft>(newPromptDraft)
  const [baseline, setBaseline] = useState<PromptDraft>(newPromptDraft)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailRefreshVersion, setDetailRefreshVersion] = useState(0)
  const [mutationStatus, setMutationStatus] = useState<PromptMutationStatus>('idle')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const [registryMessage, setRegistryMessage] = useState<string | null>(null)
  const [pendingTag, setPendingTagState] = useState('')
  const [mobilePane, setMobilePane] = useState<MobileRegistryPane>('list')
  const [editorFocusVersion, setEditorFocusVersion] = useState(0)
  const [listFocusVersion, setListFocusVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const activeRequest = useRef<AbortController | null>(null)
  const detailRequest = useRef<AbortController | null>(null)
  const detailGeneration = useRef(0)
  const mutationRequest = useRef<AbortController | null>(null)
  const requestGeneration = useRef(0)
  const debouncedQueryRef = useRef('')
  const pendingQueryCommit = useRef(false)
  const selection = useRef<SelectionState>({ id: null, mode: 'empty' })
  const autoSelectionEligible = useRef(true)
  const baselineRef = useRef(baseline)
  const dirtyRef = useRef(false)
  const mutationStatusRef = useRef<PromptMutationStatus>('idle')
  const mobileReturnTarget = useRef<number | 'new' | null>(null)
  const listFocusTarget = useRef<number | 'new' | null>(null)
  const copyGeneration = useRef(0)

  const requestListFocus = useCallback((target: number | 'new' | null) => {
    listFocusTarget.current = target
    setListFocusVersion((version) => version + 1)
  }, [])

  const dirty = useMemo(
    () => isPromptDraftDirty(draft, baseline) || pendingTag.length > 0,
    [baseline, draft, pendingTag],
  )
  const pendingTagHasText = pendingTag.length > 0
  let normalizedPendingTag: string | null = null
  if (pendingTagHasText) {
    try {
      normalizedPendingTag = normalizePromptTag(pendingTag)
    } catch {
      normalizedPendingTag = null
    }
  }
  const pendingTagValid = !pendingTagHasText || normalizedPendingTag !== null
  const saveTags = useMemo(
    () =>
      normalizedPendingTag !== null && !draft.tags.includes(normalizedPendingTag)
        ? [...draft.tags, normalizedPendingTag]
        : draft.tags,
    [draft.tags, normalizedPendingTag],
  )
  const draftValid =
    draft.title.trim().length > 0 &&
    promptTextLength(draft.title.trim()) <= 200 &&
    draft.content.trim().length > 0 &&
    promptTextLength(draft.content) <= 50_000 &&
    pendingTagValid &&
    saveTags.length <= 10 &&
    saveTags.every((tag) => promptTextLength(tag) > 0 && promptTextLength(tag) <= 30)
  const canSave =
    dirty &&
    draftValid &&
    mutationStatus === 'idle' &&
    !detailLoading &&
    (editorMode === 'new' || selectedPrompt !== null)

  baselineRef.current = baseline
  dirtyRef.current = dirty
  mutationStatusRef.current = mutationStatus

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

  const confirmDiscard = useCallback(() => {
    if (mutationStatusRef.current !== 'idle') return false
    if (!dirtyRef.current) {
      copyGeneration.current += 1
      setCopyMessage(null)
      return true
    }
    if (!window.confirm('Discard unsaved prompt changes?')) return false
    dirtyRef.current = false
    copyGeneration.current += 1
    setDraft(cloneDraft(baselineRef.current))
    setPendingTagState('')
    setMutationError(null)
    setSaveMessage(null)
    setCopyMessage(null)
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
          setSelectedPrompt(null)
          setDetailError(null)
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

  useEffect(() => {
    if (!enabled || editorMode !== 'selected' || selectedId === null) {
      detailGeneration.current += 1
      detailRequest.current?.abort()
      detailRequest.current = null
      setDetailLoading(false)
      return
    }
    if (selectedPrompt?.id === selectedId) return

    detailRequest.current?.abort()
    const controller = new AbortController()
    const generation = ++detailGeneration.current
    detailRequest.current = controller
    const blank = newPromptDraft()
    dirtyRef.current = false
    baselineRef.current = blank
    setSelectedPrompt(null)
    setDraft(blank)
    setBaseline(blank)
    setPendingTagState('')
    setDetailLoading(true)
    setDetailError(null)
    setMutationError(null)
    setSaveMessage(null)
    setCopyMessage(null)
    copyGeneration.current += 1

    void getPrompt(selectedId, controller.signal)
      .then((prompt) => {
        if (controller.signal.aborted || detailGeneration.current !== generation) return
        const nextDraft = promptToDraft(prompt)
        dirtyRef.current = false
        baselineRef.current = nextDraft
        setSelectedPrompt(prompt)
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
        if (detailGeneration.current === generation) {
          setDetailLoading(false)
          if (detailRequest.current === controller) detailRequest.current = null
        }
      })

    return () => controller.abort()
  }, [detailRefreshVersion, editorMode, enabled, selectedId, selectedPrompt?.id])

  useEffect(
    () => () => {
      requestGeneration.current += 1
      activeRequest.current?.abort()
      detailGeneration.current += 1
      detailRequest.current?.abort()
      mutationRequest.current?.abort()
      copyGeneration.current += 1
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
          ? '[data-new-prompt]'
          : `[data-prompt-id="${target}"]`
      const element =
        document.querySelector<HTMLElement>(selector) ??
        document.querySelector<HTMLElement>('[data-new-prompt]') ??
        document.querySelector<HTMLElement>('[data-registry-heading]')
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

  const selectPrompt = useCallback(
    (id: number) => {
      if (selection.current.mode === 'selected' && selection.current.id === id) {
        mobileReturnTarget.current = id
        setMobilePane('editor')
        setEditorFocusVersion((version) => version + 1)
        return
      }
      if (!confirmDiscard()) return
      mobileReturnTarget.current = id
      copyGeneration.current += 1
      autoSelectionEligible.current = false
      detailGeneration.current += 1
      detailRequest.current?.abort()
      selection.current = { id, mode: 'selected' }
      setSelectedId(id)
      setEditorMode('selected')
      setSelectedPrompt(null)
      setPendingTagState('')
      setDetailError(null)
      setRegistryMessage(null)
      setMobilePane('editor')
      setEditorFocusVersion((version) => version + 1)
    },
    [confirmDiscard],
  )

  const startNewPrompt = useCallback(() => {
    if (!confirmDiscard()) return
    autoSelectionEligible.current = false
    detailGeneration.current += 1
    detailRequest.current?.abort()
    const blank = newPromptDraft()
    dirtyRef.current = false
    baselineRef.current = blank
    mobileReturnTarget.current = 'new'
    copyGeneration.current += 1
    selection.current = { id: null, mode: 'new' }
    setSelectedId(null)
    setEditorMode('new')
    setSelectedPrompt(null)
    setDraft(blank)
    setBaseline(blank)
    setPendingTagState('')
    setDetailLoading(false)
    setDetailError(null)
    setMutationError(null)
    setSaveMessage(null)
    setCopyMessage(null)
    setRegistryMessage(null)
    setMobilePane('editor')
    setEditorFocusVersion((version) => version + 1)
  }, [confirmDiscard])

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
  const refreshList = retry
  const retryDetail = useCallback(() => {
    setEditorFocusVersion((version) => version + 1)
    setDetailRefreshVersion((version) => version + 1)
  }, [])

  const updateDraft = useCallback((nextDraft: PromptDraft) => {
    copyGeneration.current += 1
    setDraft(cloneDraft(nextDraft))
    setMutationError(null)
    setSaveMessage(null)
    setCopyMessage(null)
  }, [])

  const setPendingTag = useCallback((value: string) => {
    copyGeneration.current += 1
    setPendingTagState(value)
    setMutationError(null)
    setSaveMessage(null)
    setCopyMessage(null)
  }, [])

  const savePrompt = useCallback(async () => {
    if (!canSave || mutationStatusRef.current !== 'idle') return false
    if (editorMode !== 'new' && (editorMode !== 'selected' || selectedId === null)) return false
    const controller = new AbortController()
    mutationRequest.current?.abort()
    mutationRequest.current = controller
    mutationStatusRef.current = 'saving'
    setMutationStatus('saving')
    setMutationError(null)
    setSaveMessage(null)
    setRegistryMessage(null)
    copyGeneration.current += 1
    setCopyMessage(null)
    const input = { title: draft.title, content: draft.content, tags: [...saveTags] }

    try {
      let prompt: Prompt
      if (editorMode === 'new') {
        prompt = await createPrompt(input, controller.signal)
      } else {
        if (selectedId === null) return false
        prompt = await updatePrompt(selectedId, input, controller.signal)
      }
      if (controller.signal.aborted || mutationRequest.current !== controller) return false
      const nextDraft = promptToDraft(prompt)
      autoSelectionEligible.current = false
      selection.current = { id: prompt.id, mode: 'selected' }
      baselineRef.current = nextDraft
      dirtyRef.current = false
      setSelectedId(prompt.id)
      setEditorMode('selected')
      setSelectedPrompt(prompt)
      setDraft(nextDraft)
      setBaseline(nextDraft)
      setPendingTagState('')
      setDetailError(null)
      setMutationError(null)
      setSaveMessage('Saved locally')
      setRefreshVersion((version) => version + 1)
      return true
    } catch (requestError) {
      if (!wasAborted(requestError, controller.signal)) {
        setMutationError(messageFrom(requestError))
      }
      return false
    } finally {
      if (mutationRequest.current === controller) {
        mutationRequest.current = null
        mutationStatusRef.current = 'idle'
        setMutationStatus('idle')
      }
    }
  }, [canSave, draft.content, draft.title, editorMode, saveTags, selectedId])

  const copyPrompt = useCallback(async () => {
    if (draft.content.length === 0) return
    const generation = ++copyGeneration.current
    const content = draft.content
    setCopyMessage(null)
    try {
      await navigator.clipboard.writeText(content)
      if (copyGeneration.current !== generation) return
      setCopyMessage('Prompt content copied')
    } catch {
      if (copyGeneration.current !== generation) return
      setCopyMessage('Copy failed; clipboard access was unavailable')
    }
  }, [draft.content])

  const deleteCurrentPrompt = useCallback(async () => {
    if (
      editorMode !== 'selected' ||
      selectedId === null ||
      mutationStatusRef.current !== 'idle'
    ) {
      return false
    }
    const controller = new AbortController()
    mutationRequest.current?.abort()
    mutationRequest.current = controller
    mutationStatusRef.current = 'deleting'
    setMutationStatus('deleting')
    setMutationError(null)
    setRegistryMessage(null)
    copyGeneration.current += 1
    setCopyMessage(null)

    try {
      await deletePrompt(selectedId, controller.signal)
      if (controller.signal.aborted || mutationRequest.current !== controller) return false
      const blank = newPromptDraft()
      detailGeneration.current += 1
      detailRequest.current?.abort()
      selection.current = { id: null, mode: 'empty' }
      baselineRef.current = blank
      dirtyRef.current = false
      setSelectedId(null)
      setEditorMode('empty')
      setSelectedPrompt(null)
      setDraft(blank)
      setBaseline(blank)
      setPendingTagState('')
      setDetailError(null)
      setMutationError(null)
      setSaveMessage(null)
      setCopyMessage(null)
      setRegistryMessage('Prompt deleted from local registry')
      setMobilePane('list')
      setRefreshVersion((version) => version + 1)
      requestListFocus('new')
      return true
    } catch (requestError) {
      if (!wasAborted(requestError, controller.signal)) {
        setMutationError(messageFrom(requestError))
      }
      return false
    } finally {
      if (mutationRequest.current === controller) {
        mutationRequest.current = null
        mutationStatusRef.current = 'idle'
        setMutationStatus('idle')
      }
    }
  }, [editorMode, requestListFocus, selectedId])

  const recoverMissingPrompt = useCallback(() => {
    if (!confirmDiscard()) return
    const blank = newPromptDraft()
    detailGeneration.current += 1
    detailRequest.current?.abort()
    selection.current = { id: null, mode: 'empty' }
    baselineRef.current = blank
    dirtyRef.current = false
    mobileReturnTarget.current = 'new'
    copyGeneration.current += 1
    setSelectedId(null)
    setEditorMode('empty')
    setSelectedPrompt(null)
    setDraft(blank)
    setBaseline(blank)
    setPendingTagState('')
    setDetailLoading(false)
    setDetailError(null)
    setMutationError(null)
    setSaveMessage(null)
    setCopyMessage(null)
    setRegistryMessage(null)
    setMobilePane('list')
    setRefreshVersion((version) => version + 1)
    requestListFocus('new')
  }, [confirmDiscard, requestListFocus])

  const backToList = useCallback(() => {
    if (!confirmDiscard()) return
    const returnTarget = mobileReturnTarget.current
    copyGeneration.current += 1
    if (selection.current.mode === 'new') {
      const blank = newPromptDraft()
      selection.current = { id: null, mode: 'empty' }
      baselineRef.current = blank
      dirtyRef.current = false
      setEditorMode('empty')
      setSelectedId(null)
      setSelectedPrompt(null)
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
      selectedPrompt,
      draft,
      dirty,
      canSave,
      detailLoading,
      detailError,
      mutationStatus,
      mutationError,
      saveMessage,
      copyMessage,
      registryMessage,
      pendingTag,
      mobilePane,
      editorFocusVersion,
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
      retryDetail,
      refreshList,
      updateDraft,
      setPendingTag,
      savePrompt,
      copyPrompt,
      deleteCurrentPrompt,
      confirmDiscard,
      recoverMissingPrompt,
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
      copyPrompt,
      deleteCurrentPrompt,
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
      recoverMissingPrompt,
      registryMessage,
      refreshList,
      retry,
      retryDetail,
      saveMessage,
      savePrompt,
      selectPrompt,
      selectedId,
      selectedPrompt,
      setPendingTag,
      startNewPrompt,
      total,
      updateDraft,
      updateQuery,
    ],
  )
}
