import { requestJson } from './client'

const INVALID_RESPONSE_MESSAGE = 'Backend returned an invalid response'
const MAX_ORIGIN_LENGTH = 2_048
const EXACT_KEYS = ['state', 'base_url', 'liveness', 'readiness', 'error'] as const

export type N8nObservationState =
  | 'unconfigured'
  | 'online'
  | 'degraded'
  | 'offline'
export type N8nCheckState = 'passed' | 'failed' | 'not_checked'
export type N8nStatusResponse =
  | {
      state: 'unconfigured'
      base_url: null
      liveness: 'not_checked'
      readiness: 'not_checked'
      error: null
    }
  | {
      state: 'online'
      base_url: string
      liveness: 'passed'
      readiness: 'passed'
      error: null
    }
  | {
      state: 'degraded'
      base_url: string
      liveness: 'passed'
      readiness: 'failed'
      error: 'n8n is reachable but not ready'
    }
  | {
      state: 'offline'
      base_url: 'Invalid configuration'
      liveness: 'not_checked'
      readiness: 'not_checked'
      error: 'Invalid n8n base URL'
    }
  | {
      state: 'offline'
      base_url: string
      liveness: 'failed'
      readiness: 'not_checked'
      error: 'Connection failed' | 'n8n health check failed'
    }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasExactKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value)
  return (
    keys.length === EXACT_KEYS.length &&
    EXACT_KEYS.every((key) => Object.hasOwn(value, key))
  )
}

function isCanonicalOrigin(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Array.from(value).length > MAX_ORIGIN_LENGTH ||
    value.trim() !== value ||
    value === 'Invalid configuration'
  ) {
    return false
  }
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      url.port !== '0' &&
      !url.hostname.endsWith('.') &&
      url.origin === value
    )
  } catch {
    return false
  }
}

function isN8nStatusResponse(payload: unknown): payload is N8nStatusResponse {
  if (!isRecord(payload) || !hasExactKeys(payload)) return false

  if (payload.state === 'unconfigured') {
    return (
      payload.base_url === null &&
      payload.liveness === 'not_checked' &&
      payload.readiness === 'not_checked' &&
      payload.error === null
    )
  }
  if (
    payload.state === 'offline' &&
    payload.base_url === 'Invalid configuration'
  ) {
    return (
      payload.liveness === 'not_checked' &&
      payload.readiness === 'not_checked' &&
      payload.error === 'Invalid n8n base URL'
    )
  }
  if (!isCanonicalOrigin(payload.base_url)) return false
  if (payload.state === 'online') {
    return (
      payload.liveness === 'passed' &&
      payload.readiness === 'passed' &&
      payload.error === null
    )
  }
  if (payload.state === 'degraded') {
    return (
      payload.liveness === 'passed' &&
      payload.readiness === 'failed' &&
      payload.error === 'n8n is reachable but not ready'
    )
  }
  return (
    payload.state === 'offline' &&
    payload.liveness === 'failed' &&
    payload.readiness === 'not_checked' &&
    (payload.error === 'Connection failed' ||
      payload.error === 'n8n health check failed')
  )
}

function parseN8nStatusResponse(payload: unknown): N8nStatusResponse {
  if (!isN8nStatusResponse(payload)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return payload
}

export const getN8nStatus = (signal?: AbortSignal) =>
  requestJson(
    '/api/integrations/n8n/status',
    parseN8nStatusResponse,
    { signal },
  )
