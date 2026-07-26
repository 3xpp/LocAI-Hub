export interface HealthResponse {
  status: string
  service: string
  version: string
}

export interface OllamaStatusResponse {
  online: boolean
  base_url: string
  error: string | null
}

export interface OllamaModel {
  name: string
  modified_at: string | null
  size: number | null
}

export interface OllamaModelsResponse {
  models: OllamaModel[]
  error: string | null
}

type ResponseParser<T> = (payload: unknown) => T

const INVALID_RESPONSE_MESSAGE = 'Backend returned an invalid response'

export class BackendHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Backend returned HTTP ${status}`)
    this.name = 'BackendHttpError'
    this.status = status
  }
}

export interface JsonRequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
  signal?: AbortSignal
  expectedStatus?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

function isHealthResponse(payload: unknown): payload is HealthResponse {
  return (
    isRecord(payload) &&
    typeof payload.status === 'string' &&
    typeof payload.service === 'string' &&
    typeof payload.version === 'string'
  )
}

function isOllamaStatusResponse(payload: unknown): payload is OllamaStatusResponse {
  return (
    isRecord(payload) &&
    typeof payload.online === 'boolean' &&
    typeof payload.base_url === 'string' &&
    isNullableString(payload.error)
  )
}

function isOllamaModel(payload: unknown): payload is OllamaModel {
  return (
    isRecord(payload) &&
    typeof payload.name === 'string' &&
    isNullableString(payload.modified_at) &&
    (payload.size === null ||
      (typeof payload.size === 'number' && Number.isInteger(payload.size)))
  )
}

function isOllamaModelsResponse(payload: unknown): payload is OllamaModelsResponse {
  return (
    isRecord(payload) &&
    Array.isArray(payload.models) &&
    payload.models.every(isOllamaModel) &&
    isNullableString(payload.error)
  )
}

function parseHealthResponse(payload: unknown): HealthResponse {
  if (!isHealthResponse(payload)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return payload
}

function parseOllamaStatusResponse(payload: unknown): OllamaStatusResponse {
  if (!isOllamaStatusResponse(payload)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return payload
}

function parseOllamaModelsResponse(payload: unknown): OllamaModelsResponse {
  if (!isOllamaModelsResponse(payload)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return payload
}

interface BackendRequestOptions extends Omit<JsonRequestOptions, 'method'> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
}

const isAbortError = (error: unknown, signal?: AbortSignal) =>
  signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')

async function fetchBackend(
  path: string,
  options: BackendRequestOptions = {},
): Promise<Response> {
  let response: Response
  const headers: Record<string, string> = { Accept: 'application/json' }
  const request: RequestInit = { headers, signal: options.signal }

  if (options.method !== undefined && options.method !== 'GET') {
    request.method = options.method
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    request.body = JSON.stringify(options.body)
  }

  try {
    response = await fetch(path, request)
  } catch (error) {
    if (isAbortError(error, options.signal)) {
      throw error
    }

    throw new Error('Unable to reach the backend', { cause: error })
  }

  if (!response.ok) {
    throw new BackendHttpError(response.status)
  }

  return response
}

export async function requestJson<T>(
  path: string,
  parse: ResponseParser<T>,
  options?: JsonRequestOptions,
): Promise<T> {
  const response = await fetchBackend(path, options)
  if (
    options?.expectedStatus !== undefined &&
    response.status !== options.expectedStatus
  ) {
    throw new BackendHttpError(response.status)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    if (isAbortError(error, options?.signal)) {
      throw error
    }
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }

  return parse(payload)
}

export async function requestNoContent(
  path: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetchBackend(path, { method: 'DELETE', signal })
  if (response.status !== 204) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
}

export const getHealth = (signal?: AbortSignal) =>
  requestJson('/health', parseHealthResponse, { signal })

export const getOllamaStatus = (signal?: AbortSignal) =>
  requestJson('/api/ollama/status', parseOllamaStatusResponse, { signal })

export const getOllamaModels = (signal?: AbortSignal) =>
  requestJson('/api/ollama/models', parseOllamaModelsResponse, { signal })
