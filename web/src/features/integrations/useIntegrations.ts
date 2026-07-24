import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getN8nStatus,
  type N8nStatusResponse,
} from '../../api/integrations'

export type IntegrationsRequestStatus = 'idle' | 'loading' | 'refreshing'

export interface IntegrationsController {
  observation: N8nStatusResponse | null
  requestStatus: IntegrationsRequestStatus
  pending: boolean
  error: string | null
  stale: boolean
  lastChecked: Date | null
  refreshN8n: () => void
}

const HUB_ERROR = 'Unable to check n8n through the Hub.'
const STALE_ERROR = 'Refresh failed. Showing the last n8n observation.'

const wasAborted = (error: unknown, signal: AbortSignal) =>
  signal.aborted ||
  (error instanceof DOMException && error.name === 'AbortError')

export function useIntegrations(enabled: boolean): IntegrationsController {
  const [observation, setObservation] = useState<N8nStatusResponse | null>(null)
  const [requestStatus, setRequestStatus] =
    useState<IntegrationsRequestStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const mounted = useRef(false)
  const enabledRef = useRef(enabled)
  const observationRef = useRef<N8nStatusResponse | null>(null)
  const generation = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)
  enabledRef.current = enabled

  const startObservation = useCallback(() => {
    if (!mounted.current || !enabledRef.current) return

    activeRequest.current?.abort()
    const controller = new AbortController()
    const requestGeneration = ++generation.current
    const hasSnapshot = observationRef.current !== null
    activeRequest.current = controller

    setRequestStatus(hasSnapshot ? 'refreshing' : 'loading')
    setError(null)
    setStale(false)

    void getN8nStatus(controller.signal)
      .then((result) => {
        if (
          controller.signal.aborted ||
          !mounted.current ||
          !enabledRef.current ||
          generation.current !== requestGeneration
        ) {
          return
        }
        observationRef.current = result
        setObservation(result)
        setLastChecked(new Date())
        setError(null)
        setStale(false)
      })
      .catch((requestError: unknown) => {
        if (
          wasAborted(requestError, controller.signal) ||
          !mounted.current ||
          !enabledRef.current ||
          generation.current !== requestGeneration
        ) {
          return
        }
        if (hasSnapshot) {
          setError(STALE_ERROR)
          setStale(true)
        } else {
          setError(HUB_ERROR)
          setStale(false)
        }
      })
      .finally(() => {
        if (
          mounted.current &&
          enabledRef.current &&
          generation.current === requestGeneration
        ) {
          setRequestStatus('idle')
        }
        if (activeRequest.current === controller) {
          activeRequest.current = null
        }
      })
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      activeRequest.current?.abort()
      activeRequest.current = null
    }
  }, [])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) {
      generation.current += 1
      activeRequest.current?.abort()
      activeRequest.current = null
      setRequestStatus('idle')
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) startObservation()
    })
    return () => {
      cancelled = true
      generation.current += 1
      activeRequest.current?.abort()
      activeRequest.current = null
    }
  }, [enabled, startObservation])

  return {
    observation,
    requestStatus,
    pending: requestStatus !== 'idle',
    error,
    stale,
    lastChecked,
    refreshN8n: startObservation,
  }
}
