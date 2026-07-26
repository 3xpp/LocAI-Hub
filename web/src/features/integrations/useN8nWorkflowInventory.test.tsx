import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  N8nWorkflowInventoryContractError,
  getN8nWorkflowInventory,
  type N8nWorkflowInventoryFailure,
  type N8nWorkflowInventoryResponse,
  type N8nWorkflowInventorySnapshot,
} from '../../api/n8nWorkflowInventory'
import { useN8nWorkflowInventory } from './useN8nWorkflowInventory'

vi.mock('../../api/n8nWorkflowInventory', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../api/n8nWorkflowInventory')>()
  return { ...actual, getN8nWorkflowInventory: vi.fn() }
})

const getInventoryMock = vi.mocked(getN8nWorkflowInventory)

const available: Extract<
  N8nWorkflowInventorySnapshot,
  { state: 'available' }
> = {
  state: 'available',
  items: [
    {
      name: 'Daily local backup',
      active: true,
      updated_at: '2026-07-26T08:30:00Z',
    },
  ],
  truncated: false,
  error: null,
}

const unconfigured: Extract<
  N8nWorkflowInventorySnapshot,
  { state: 'unconfigured' }
> = {
  state: 'unconfigured',
  items: [],
  truncated: false,
  error: null,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useN8nWorkflowInventory', () => {
  beforeEach(() => {
    getInventoryMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('makes no request on mount, enable, re-entry, or StrictMode replay', () => {
    const { rerender } = renderHook(
      ({ enabled }) => useN8nWorkflowInventory(enabled),
      {
        initialProps: { enabled: false },
        wrapper: StrictMode,
      },
    )

    rerender({ enabled: true })
    rerender({ enabled: false })
    rerender({ enabled: true })

    expect(getInventoryMock).not.toHaveBeenCalled()
  })

  it('starts exactly one explicit load and ignores pending actions', async () => {
    const request = deferred<N8nWorkflowInventoryResponse>()
    getInventoryMock.mockReturnValueOnce(request.promise)
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => {
      result.current.load()
      result.current.load()
      result.current.refresh()
    })

    expect(getInventoryMock).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    expect(result.current.requestStatus).toBe('loading')
    await act(async () => request.resolve(available))
    expect(result.current.snapshot).toEqual(available)
    expect(result.current.requestStatus).toBe('ready')
    expect(result.current.lastLoaded).toBeInstanceOf(Date)
  })

  it.each([
    {
      state: 'invalid_configuration',
      items: [],
      truncated: false,
      error: 'Invalid n8n inventory configuration',
    },
    {
      state: 'access_denied',
      items: [],
      truncated: false,
      error: 'n8n denied workflow inventory access',
    },
    {
      state: 'unavailable',
      items: [],
      truncated: false,
      error: 'n8n workflow inventory is unavailable',
    },
    {
      state: 'timeout',
      items: [],
      truncated: false,
      error: 'n8n workflow inventory timed out',
    },
    {
      state: 'invalid_response',
      items: [],
      truncated: false,
      error: 'n8n returned an invalid workflow inventory',
    },
  ] satisfies N8nWorkflowInventoryFailure[])(
    'maps normalized $state without exposing another error',
    async (failure) => {
      getInventoryMock.mockResolvedValueOnce(failure)
      const { result } = renderHook(() => useN8nWorkflowInventory(true))

      act(() => result.current.load())
      await waitFor(() => expect(result.current.requestStatus).toBe('error'))

      expect(result.current.snapshot).toBeNull()
      expect(result.current.error).toBe(failure.error)
      expect(result.current.stale).toBe(false)
      expect(result.current.lastLoaded).toBeNull()
    },
  )

  it('retains an available snapshot and time after any failed refresh', async () => {
    getInventoryMock
      .mockResolvedValueOnce(available)
      .mockRejectedValueOnce(new Error('private backend detail'))
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => result.current.load())
    await waitFor(() => expect(result.current.snapshot).toEqual(available))
    const snapshot = result.current.snapshot
    const loaded = result.current.lastLoaded
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.stale).toBe(true))

    expect(result.current.snapshot).toBe(snapshot)
    expect(result.current.lastLoaded).toBe(loaded)
    expect(result.current.error).toBe(
      'Refresh failed. Showing the last workflow inventory.',
    )
    expect(JSON.stringify(result.current)).not.toContain(
      'private backend detail',
    )
  })

  it.each([
    {
      state: 'available',
      items: [],
      truncated: false,
      error: null,
    },
    available,
    {
      ...available,
      truncated: true,
    },
  ] satisfies N8nWorkflowInventoryResponse[])(
    'publishes a successful available snapshot',
    async (response) => {
      getInventoryMock.mockResolvedValueOnce(response)
      const { result } = renderHook(() => useN8nWorkflowInventory(true))

      act(() => result.current.load())
      await waitFor(() => expect(result.current.snapshot).toEqual(response))

      expect(result.current.requestStatus).toBe('ready')
      expect(result.current.pending).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.stale).toBe(false)
      expect(result.current.lastLoaded).toBeInstanceOf(Date)
      expect(result.current.settlementSequence).toBe(1)
    },
  )

  it('unconfigured success clears an earlier available snapshot', async () => {
    getInventoryMock
      .mockResolvedValueOnce(available)
      .mockResolvedValueOnce(unconfigured)
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => result.current.load())
    await waitFor(() => expect(result.current.snapshot).toEqual(available))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.snapshot).toEqual(unconfigured))

    expect(result.current.requestStatus).toBe('ready')
    expect(result.current.snapshot?.items).toEqual([])
    expect(result.current.stale).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.settlementSequence).toBe(2)
  })

  it('preserves the successful load time when refresh fails after unconfigured', async () => {
    getInventoryMock
      .mockResolvedValueOnce(unconfigured)
      .mockResolvedValueOnce({
        state: 'unavailable',
        items: [],
        truncated: false,
        error: 'n8n workflow inventory is unavailable',
      })
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => result.current.load())
    await waitFor(() => expect(result.current.snapshot).toEqual(unconfigured))
    const loaded = result.current.lastLoaded
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.requestStatus).toBe('error'))

    expect(result.current.snapshot).toBeNull()
    expect(result.current.lastLoaded).toBe(loaded)
    expect(result.current.stale).toBe(false)
    expect(result.current.error).toBe(
      'n8n workflow inventory is unavailable',
    )
  })

  it.each([
    [
      new N8nWorkflowInventoryContractError(),
      'The Hub returned an invalid workflow inventory response.',
    ],
    [
      new Error('private transport detail'),
      'Unable to load workflow inventory through the Hub.',
    ],
  ] as const)(
    'maps a first Hub failure to fixed copy',
    async (failure, message) => {
      getInventoryMock.mockRejectedValueOnce(failure)
      const { result } = renderHook(() => useN8nWorkflowInventory(true))

      act(() => result.current.load())
      await waitFor(() => expect(result.current.requestStatus).toBe('error'))

      expect(result.current.error).toBe(message)
      expect(result.current.snapshot).toBeNull()
      expect(result.current.lastLoaded).toBeNull()
      expect(JSON.stringify(result.current)).not.toContain(
        'private transport detail',
      )
    },
  )

  it('successful refresh replaces stale state and advances settlement', async () => {
    const replacement: N8nWorkflowInventoryResponse = {
      state: 'available',
      items: [
        {
          name: 'Replacement',
          active: false,
          updated_at: '2026-07-26T09:30:00Z',
        },
      ],
      truncated: false,
      error: null,
    }
    getInventoryMock
      .mockResolvedValueOnce(available)
      .mockRejectedValueOnce(new Error('private failure'))
      .mockResolvedValueOnce(replacement)
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => result.current.load())
    await waitFor(() => expect(result.current.snapshot).toEqual(available))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.stale).toBe(true))
    const staleLoaded = result.current.lastLoaded
    expect(result.current.settlementSequence).toBe(2)
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.snapshot).toEqual(replacement))

    expect(result.current.error).toBeNull()
    expect(result.current.stale).toBe(false)
    expect(result.current.lastLoaded).not.toBe(staleLoaded)
    expect(result.current.settlementSequence).toBe(3)
  })

  it('restores the exact settled state when a refresh is aborted on leave', async () => {
    const refresh = deferred<N8nWorkflowInventoryResponse>()
    getInventoryMock
      .mockResolvedValueOnce(available)
      .mockReturnValueOnce(refresh.promise)
    const { result, rerender } = renderHook(
      ({ enabled }) => useN8nWorkflowInventory(enabled),
      { initialProps: { enabled: true } },
    )

    act(() => result.current.load())
    await waitFor(() => expect(result.current.snapshot).toEqual(available))
    const settled = {
      snapshot: result.current.snapshot,
      requestStatus: result.current.requestStatus,
      error: result.current.error,
      stale: result.current.stale,
      lastLoaded: result.current.lastLoaded,
      settlementSequence: result.current.settlementSequence,
    }
    act(() => result.current.refresh())
    const signal = getInventoryMock.mock.calls[1]?.[0]
    rerender({ enabled: false })

    expect(signal?.aborted).toBe(true)
    expect(result.current).toMatchObject(settled)
    expect(result.current.pending).toBe(false)
    await act(async () => refresh.resolve(unconfigured))
    expect(result.current.snapshot).toBe(settled.snapshot)
  })

  it('restores idle after a first-load navigation abort', async () => {
    const request = deferred<N8nWorkflowInventoryResponse>()
    getInventoryMock.mockReturnValueOnce(request.promise)
    const { result, rerender } = renderHook(
      ({ enabled }) => useN8nWorkflowInventory(enabled),
      { initialProps: { enabled: true } },
    )

    act(() => result.current.load())
    const signal = getInventoryMock.mock.calls[0]?.[0]
    rerender({ enabled: false })

    expect(signal?.aborted).toBe(true)
    expect(result.current).toMatchObject({
      snapshot: null,
      requestStatus: 'idle',
      pending: false,
      error: null,
      stale: false,
      lastLoaded: null,
      settlementSequence: 0,
    })
  })

  it('restores a prior error when its retry aborts', async () => {
    const retry = deferred<N8nWorkflowInventoryResponse>()
    getInventoryMock
      .mockRejectedValueOnce(new Error('first failure'))
      .mockReturnValueOnce(retry.promise)
    const { result, rerender } = renderHook(
      ({ enabled }) => useN8nWorkflowInventory(enabled),
      { initialProps: { enabled: true } },
    )

    act(() => result.current.load())
    await waitFor(() => expect(result.current.requestStatus).toBe('error'))
    const priorError = result.current.error
    const priorSequence = result.current.settlementSequence
    act(() => result.current.load())
    rerender({ enabled: false })

    expect(result.current.requestStatus).toBe('error')
    expect(result.current.error).toBe(priorError)
    expect(result.current.settlementSequence).toBe(priorSequence)
  })

  it('aborts on unmount and ignores late completion', async () => {
    const request = deferred<N8nWorkflowInventoryResponse>()
    getInventoryMock.mockReturnValueOnce(request.promise)
    const { result, unmount } = renderHook(() =>
      useN8nWorkflowInventory(true),
    )

    act(() => result.current.load())
    const signal = getInventoryMock.mock.calls[0]?.[0]
    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => request.resolve(available))
  })

  it('preserves memory on re-entry and lets only a new manual generation win', async () => {
    const oldRequest = deferred<N8nWorkflowInventoryResponse>()
    const newRequest = deferred<N8nWorkflowInventoryResponse>()
    getInventoryMock
      .mockResolvedValueOnce(available)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise)
    const { result, rerender } = renderHook(
      ({ enabled }) => useN8nWorkflowInventory(enabled),
      { initialProps: { enabled: true } },
    )

    act(() => result.current.load())
    await waitFor(() => expect(result.current.snapshot).toEqual(available))
    act(() => result.current.refresh())
    rerender({ enabled: false })
    rerender({ enabled: true })
    expect(getInventoryMock).toHaveBeenCalledTimes(2)
    expect(result.current.snapshot).toEqual(available)
    act(() => result.current.refresh())
    const replacement = {
      ...available,
      items: [{ ...available.items[0], name: 'Newest manual result' }],
    }
    await act(async () => newRequest.resolve(replacement))
    await act(async () => oldRequest.resolve(unconfigured))

    expect(result.current.snapshot).toEqual(replacement)
    expect(getInventoryMock).toHaveBeenCalledTimes(3)
  })

  it('never polls or retries when time advances', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => vi.advanceTimersByTime(300_000))

    expect(result.current.requestStatus).toBe('idle')
    expect(getInventoryMock).not.toHaveBeenCalled()
  })

  it('writes no browser persistence, worker, or clipboard state', async () => {
    const localSet = vi.spyOn(Storage.prototype, 'setItem')
    const historyPush = vi.spyOn(history, 'pushState')
    const historyReplace = vi.spyOn(history, 'replaceState')
    const cacheOpen = vi.fn()
    const indexedOpen = vi.fn()
    const workerRegister = vi.fn()
    const clipboardWrite = vi.fn()
    const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'serviceWorker',
    )
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    )
    vi.stubGlobal('caches', { open: cacheOpen })
    vi.stubGlobal('indexedDB', { open: indexedOpen })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: workerRegister },
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    })
    getInventoryMock.mockResolvedValueOnce(available)
    const { result } = renderHook(() => useN8nWorkflowInventory(true))

    act(() => result.current.load())
    await waitFor(() => expect(result.current.snapshot).toEqual(available))

    expect(localSet).not.toHaveBeenCalled()
    expect(historyPush).not.toHaveBeenCalled()
    expect(historyReplace).not.toHaveBeenCalled()
    expect(cacheOpen).not.toHaveBeenCalled()
    expect(indexedOpen).not.toHaveBeenCalled()
    expect(workerRegister).not.toHaveBeenCalled()
    expect(clipboardWrite).not.toHaveBeenCalled()
    if (serviceWorkerDescriptor === undefined) {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    } else {
      Object.defineProperty(
        navigator,
        'serviceWorker',
        serviceWorkerDescriptor,
      )
    }
    if (clipboardDescriptor === undefined) {
      Reflect.deleteProperty(navigator, 'clipboard')
    } else {
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    }
  })
})
