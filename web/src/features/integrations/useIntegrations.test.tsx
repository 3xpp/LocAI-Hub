import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getN8nStatus, type N8nStatusResponse } from '../../api/integrations'
import { useIntegrations } from './useIntegrations'

vi.mock('../../api/integrations', () => ({
  getN8nStatus: vi.fn(),
}))

const getN8nStatusMock = vi.mocked(getN8nStatus)

const unconfigured: N8nStatusResponse = {
  state: 'unconfigured',
  base_url: null,
  liveness: 'not_checked',
  readiness: 'not_checked',
  error: null,
}

const online: N8nStatusResponse = {
  state: 'online',
  base_url: 'http://n8n.test',
  liveness: 'passed',
  readiness: 'passed',
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

describe('useIntegrations', () => {
  beforeEach(() => {
    getN8nStatusMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('makes zero requests while disabled and exactly one on entry', async () => {
    getN8nStatusMock.mockResolvedValueOnce(unconfigured)
    const { result, rerender } = renderHook(
      ({ enabled }) => useIntegrations(enabled),
      { initialProps: { enabled: false } },
    )

    expect(getN8nStatusMock).not.toHaveBeenCalled()
    expect(result.current.requestStatus).toBe('idle')

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.observation).toEqual(unconfigured))
    expect(getN8nStatusMock).toHaveBeenCalledTimes(1)
    expect(result.current.lastChecked).toBeInstanceOf(Date)
  })

  it('does not poll or retry when timers advance', async () => {
    vi.useFakeTimers()
    getN8nStatusMock.mockResolvedValueOnce(unconfigured)
    const { result } = renderHook(() => useIntegrations(true))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.observation).toEqual(unconfigured)

    act(() => vi.advanceTimersByTime(300_000))
    expect(getN8nStatusMock).toHaveBeenCalledTimes(1)
  })

  it('uses loading without a snapshot and refreshing with one', async () => {
    const first = deferred<N8nStatusResponse>()
    const second = deferred<N8nStatusResponse>()
    getN8nStatusMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useIntegrations(true))

    await waitFor(() =>
      expect(result.current.requestStatus).toBe('loading'),
    )
    expect(result.current.pending).toBe(true)
    expect(result.current.lastChecked).toBeNull()

    await act(async () => first.resolve(online))
    const checked = result.current.lastChecked
    expect(checked).toBeInstanceOf(Date)

    act(() => result.current.refreshN8n())
    expect(result.current.requestStatus).toBe('refreshing')
    expect(result.current.observation).toEqual(online)
    expect(result.current.lastChecked).toBe(checked)

    await act(async () => second.resolve(unconfigured))
    expect(result.current.requestStatus).toBe('idle')
    expect(result.current.observation).toEqual(unconfigured)
    expect(result.current.lastChecked).not.toBe(checked)
  })

  it('aborts and supersedes a programmatic refresh and ignores stale settlement', async () => {
    const first = deferred<N8nStatusResponse>()
    const second = deferred<N8nStatusResponse>()
    getN8nStatusMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useIntegrations(true))

    await waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(1))
    const firstSignal = getN8nStatusMock.mock.calls[0]?.[0]
    act(() => result.current.refreshN8n())
    expect(firstSignal?.aborted).toBe(true)

    await act(async () => second.resolve(online))
    await act(async () => first.resolve(unconfigured))
    expect(result.current.observation).toEqual(online)
    expect(getN8nStatusMock).toHaveBeenCalledTimes(2)
  })

  it('aborts on leave and unmount without publishing a late result', async () => {
    const first = deferred<N8nStatusResponse>()
    const second = deferred<N8nStatusResponse>()
    getN8nStatusMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useIntegrations(enabled),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(1))
    const firstSignal = getN8nStatusMock.mock.calls[0]?.[0]
    rerender({ enabled: false })
    expect(firstSignal?.aborted).toBe(true)
    await act(async () => first.resolve(online))
    expect(result.current.observation).toBeNull()

    rerender({ enabled: true })
    await waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(2))
    const secondSignal = getN8nStatusMock.mock.calls[1]?.[0]
    unmount()
    expect(secondSignal?.aborted).toBe(true)
  })

  it('ignores a stale settlement from an aborted prior entry after re-entry succeeds', async () => {
    const first = deferred<N8nStatusResponse>()
    const second = deferred<N8nStatusResponse>()
    getN8nStatusMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(
      ({ enabled }) => useIntegrations(enabled),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(1))
    const firstSignal = getN8nStatusMock.mock.calls[0]?.[0]
    rerender({ enabled: false })
    expect(firstSignal?.aborted).toBe(true)

    rerender({ enabled: true })
    await waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(2))
    await act(async () => second.resolve(online))
    const checked = result.current.lastChecked
    expect(checked).toBeInstanceOf(Date)

    await act(async () => first.resolve(unconfigured))
    expect(result.current.observation).toEqual(online)
    expect(result.current.lastChecked).toBe(checked)
  })

  it('preserves snapshot and checked time after re-entry refresh failure', async () => {
    const refresh = deferred<N8nStatusResponse>()
    getN8nStatusMock
      .mockResolvedValueOnce(online)
      .mockReturnValueOnce(refresh.promise)
    const { result, rerender } = renderHook(
      ({ enabled }) => useIntegrations(enabled),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => expect(result.current.observation).toEqual(online))
    const checked = result.current.lastChecked
    rerender({ enabled: false })
    rerender({ enabled: true })

    expect(result.current.observation).toEqual(online)
    await waitFor(() =>
      expect(result.current.requestStatus).toBe('refreshing'),
    )
    await act(async () => refresh.reject(new Error('private backend detail')))

    expect(result.current.observation).toEqual(online)
    expect(result.current.lastChecked).toBe(checked)
    expect(result.current.stale).toBe(true)
    expect(result.current.error).toBe(
      'Refresh failed. Showing the last n8n observation.',
    )
  })

  it('maps a first Hub failure to fixed copy without provider state', async () => {
    getN8nStatusMock.mockRejectedValueOnce(new Error('private backend detail'))
    const { result } = renderHook(() => useIntegrations(true))

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Unable to check n8n through the Hub.',
      ),
    )
    expect(getN8nStatusMock).toHaveBeenCalledTimes(1)
    expect(result.current.requestStatus).toBe('idle')
    expect(result.current.observation).toBeNull()
    expect(result.current.lastChecked).toBeNull()
    expect(result.current.stale).toBe(false)
    expect(result.current.error).toBe(
      'Unable to check n8n through the Hub.',
    )
    expect(JSON.stringify(result.current)).not.toContain('private backend detail')
  })

  it.each([
    unconfigured,
    online,
    {
      state: 'degraded',
      base_url: 'http://n8n.test',
      liveness: 'passed',
      readiness: 'failed',
      error: 'n8n is reachable but not ready',
    },
    {
      state: 'offline',
      base_url: 'http://n8n.test',
      liveness: 'failed',
      readiness: 'not_checked',
      error: 'n8n health check failed',
    },
  ] satisfies N8nStatusResponse[])(
    'accepts $state as a valid observation and updates checked time',
    async (observation) => {
      getN8nStatusMock.mockResolvedValueOnce(observation)
      const { result } = renderHook(() => useIntegrations(true))

      await waitFor(() =>
        expect(result.current.observation).toEqual(observation),
      )
      expect(result.current.lastChecked).toBeInstanceOf(Date)
      expect(result.current.error).toBeNull()
      expect(result.current.stale).toBe(false)
    },
  )

  it('coalesces StrictMode effect replay into one entry request', async () => {
    getN8nStatusMock.mockResolvedValueOnce(online)
    const { result } = renderHook(() => useIntegrations(true), {
      wrapper: StrictMode,
    })

    await waitFor(() => expect(result.current.observation).toEqual(online))
    expect(getN8nStatusMock).toHaveBeenCalledTimes(1)
  })

  it('ignores a body-decoding AbortError without publishing failure state', async () => {
    const request = deferred<N8nStatusResponse>()
    getN8nStatusMock.mockReturnValueOnce(request.promise)
    const { result } = renderHook(() => useIntegrations(true))

    await waitFor(() => expect(result.current.requestStatus).toBe('loading'))
    expect(getN8nStatusMock).toHaveBeenCalledTimes(1)
    await act(async () =>
      request.reject(new DOMException('private abort detail', 'AbortError')),
    )
    await waitFor(() => expect(result.current.requestStatus).toBe('idle'))
    expect(result.current.observation).toBeNull()
    expect(result.current.lastChecked).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.stale).toBe(false)
  })
})
