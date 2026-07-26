import { useCallback, useEffect, useRef, useState } from 'react'

import {
  N8nWorkflowInventoryContractError,
  getN8nWorkflowInventory,
  type N8nWorkflowInventoryFailure,
  type N8nWorkflowInventorySnapshot,
} from '../../api/n8nWorkflowInventory'

export type N8nWorkflowInventoryRequestStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'

export interface N8nWorkflowInventoryController {
  snapshot: N8nWorkflowInventorySnapshot | null
  requestStatus: N8nWorkflowInventoryRequestStatus
  pending: boolean
  error: string | null
  stale: boolean
  lastLoaded: Date | null
  settlementSequence: number
  load: () => void
  refresh: () => void
}

interface ControllerState {
  snapshot: N8nWorkflowInventorySnapshot | null
  requestStatus: N8nWorkflowInventoryRequestStatus
  pending: boolean
  error: string | null
  stale: boolean
  lastLoaded: Date | null
  settlementSequence: number
}

interface ActiveRequest {
  controller: AbortController
  previous: ControllerState
}

const INITIAL_STATE: ControllerState = {
  snapshot: null,
  requestStatus: 'idle',
  pending: false,
  error: null,
  stale: false,
  lastLoaded: null,
  settlementSequence: 0,
}

const HUB_UNAVAILABLE_ERROR =
  'Unable to load workflow inventory through the Hub.'
const HUB_INVALID_RESPONSE_ERROR =
  'The Hub returned an invalid workflow inventory response.'
export const N8N_INVENTORY_STALE_WARNING =
  'Refresh failed. Showing the last workflow inventory.'

const wasAborted = (error: unknown, signal: AbortSignal) =>
  signal.aborted ||
  (error instanceof DOMException && error.name === 'AbortError')

function firstFailureMessage(
  failure: N8nWorkflowInventoryFailure,
): string {
  return failure.error
}

export function useN8nWorkflowInventory(
  enabled: boolean,
): N8nWorkflowInventoryController {
  const [state, setState] = useState<ControllerState>(INITIAL_STATE)
  const stateRef = useRef(state)
  const mounted = useRef(false)
  const enabledRef = useRef(enabled)
  const generation = useRef(0)
  const activeRequest = useRef<ActiveRequest | null>(null)
  enabledRef.current = enabled

  const publish = useCallback((next: ControllerState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const start = useCallback(() => {
    if (
      !mounted.current ||
      !enabledRef.current ||
      stateRef.current.pending
    ) {
      return
    }

    const previous = { ...stateRef.current, pending: false }
    const controller = new AbortController()
    const requestGeneration = ++generation.current
    const request: ActiveRequest = {
      controller,
      previous,
    }
    activeRequest.current = request
    publish({
      ...previous,
      requestStatus: 'loading',
      pending: true,
      error: null,
      stale: false,
    })

    const ownsRequest = () =>
      mounted.current &&
      enabledRef.current &&
      generation.current === requestGeneration &&
      activeRequest.current === request
    const releaseRequest = () => {
      if (activeRequest.current === request) {
        activeRequest.current = null
      }
    }

    const publishFailure = (message: string) => {
      const availableSnapshot =
        previous.snapshot?.state === 'available'
          ? previous.snapshot
          : null
      const nextSequence = previous.settlementSequence + 1
      if (availableSnapshot !== null) {
        publish({
          snapshot: availableSnapshot,
          requestStatus: 'error',
          pending: false,
          error: N8N_INVENTORY_STALE_WARNING,
          stale: true,
          lastLoaded: previous.lastLoaded,
          settlementSequence: nextSequence,
        })
        return
      }
      publish({
        snapshot: null,
        requestStatus: 'error',
        pending: false,
        error: message,
        stale: false,
        lastLoaded: previous.lastLoaded,
        settlementSequence: nextSequence,
      })
    }

    void getN8nWorkflowInventory(controller.signal)
      .then((result) => {
        if (!ownsRequest()) return
        releaseRequest()
        if (
          result.state !== 'available' &&
          result.state !== 'unconfigured'
        ) {
          publishFailure(firstFailureMessage(result))
          return
        }
        publish({
          snapshot: result,
          requestStatus: 'ready',
          pending: false,
          error: null,
          stale: false,
          lastLoaded: new Date(),
          settlementSequence: previous.settlementSequence + 1,
        })
      })
      .catch((error: unknown) => {
        if (wasAborted(error, controller.signal)) {
          if (ownsRequest()) {
            releaseRequest()
            publish(previous)
          }
          return
        }
        if (!ownsRequest()) return
        releaseRequest()
        publishFailure(
          error instanceof N8nWorkflowInventoryContractError
            ? HUB_INVALID_RESPONSE_ERROR
            : HUB_UNAVAILABLE_ERROR,
        )
      })
  }, [publish])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      activeRequest.current?.controller.abort()
      activeRequest.current = null
    }
  }, [])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled && activeRequest.current !== null) {
      const request = activeRequest.current
      generation.current += 1
      activeRequest.current = null
      request.controller.abort()
      publish(request.previous)
    }
  }, [enabled, publish])

  return {
    ...state,
    load: start,
    refresh: start,
  }
}
