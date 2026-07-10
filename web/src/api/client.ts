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

async function request<T>(
  path: string,
  parse: ResponseParser<T>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw error
    }

    throw new Error('Unable to reach the backend', { cause: error })
  }

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }

  return parse(payload)
}

export const getHealth = (signal?: AbortSignal) =>
  request('/health', parseHealthResponse, signal)

export const getOllamaStatus = (signal?: AbortSignal) =>
  request('/api/ollama/status', parseOllamaStatusResponse, signal)

export const getOllamaModels = (signal?: AbortSignal) =>
  request('/api/ollama/models', parseOllamaModelsResponse, signal)
