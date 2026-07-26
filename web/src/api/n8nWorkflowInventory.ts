import { requestJson } from './client'

const INVALID_RESPONSE_MESSAGE = 'Backend returned an invalid response'
const MAX_ITEMS = 200
const MAX_NAME_LENGTH = 256
const MAX_TIMESTAMP_LENGTH = 64
const ROOT_KEYS = ['state', 'items', 'truncated', 'error'] as const
const ITEM_KEYS = ['name', 'active', 'updated_at'] as const

export interface N8nWorkflowSummary {
  name: string
  active: boolean
  updated_at: string
}

export type N8nWorkflowInventorySnapshot =
  | {
      state: 'available'
      items: N8nWorkflowSummary[]
      truncated: boolean
      error: null
    }
  | {
      state: 'unconfigured'
      items: []
      truncated: false
      error: null
    }

export type N8nWorkflowInventoryFailure =
  | {
      state: 'invalid_configuration'
      items: []
      truncated: false
      error: 'Invalid n8n inventory configuration'
    }
  | {
      state: 'access_denied'
      items: []
      truncated: false
      error: 'n8n denied workflow inventory access'
    }
  | {
      state: 'unavailable'
      items: []
      truncated: false
      error: 'n8n workflow inventory is unavailable'
    }
  | {
      state: 'timeout'
      items: []
      truncated: false
      error: 'n8n workflow inventory timed out'
    }
  | {
      state: 'invalid_response'
      items: []
      truncated: false
      error: 'n8n returned an invalid workflow inventory'
    }

export type N8nWorkflowInventoryResponse =
  | N8nWorkflowInventorySnapshot
  | N8nWorkflowInventoryFailure

const FAILURE_ERRORS = {
  invalid_configuration: 'Invalid n8n inventory configuration',
  access_denied: 'n8n denied workflow inventory access',
  unavailable: 'n8n workflow inventory is unavailable',
  timeout: 'n8n workflow inventory timed out',
  invalid_response: 'n8n returned an invalid workflow inventory',
} as const

export class N8nWorkflowInventoryContractError extends Error {
  constructor(cause?: unknown) {
    super(INVALID_RESPONSE_MESSAGE, { cause })
    this.name = 'N8nWorkflowInventoryContractError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  )
}

function isSafeProjectedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  if (typeof value !== 'string') return false
  const characters = Array.from(value)
  if (characters.length < minimum || characters.length > maximum) return false
  return characters.every((character) => {
    const point = character.codePointAt(0)
    return (
      point !== undefined &&
      !(point <= 0x1f || (point >= 0x7f && point <= 0x9f)) &&
      !(point >= 0xd800 && point <= 0xdfff)
    )
  })
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (
    !isSafeProjectedString(value, 1, MAX_TIMESTAMP_LENGTH) ||
    !value.endsWith('Z')
  ) {
    return false
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/u.exec(
      value,
    )
  if (match === null) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (year < 1) return false
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  )
}

function isWorkflowSummary(value: unknown): value is N8nWorkflowSummary {
  return (
    isRecord(value) &&
    hasExactKeys(value, ITEM_KEYS) &&
    isSafeProjectedString(value.name, 1, MAX_NAME_LENGTH) &&
    typeof value.active === 'boolean' &&
    isCanonicalUtcTimestamp(value.updated_at)
  )
}

function isInventoryResponse(
  payload: unknown,
): payload is N8nWorkflowInventoryResponse {
  if (!isRecord(payload) || !hasExactKeys(payload, ROOT_KEYS)) return false
  if (!Array.isArray(payload.items) || payload.items.length > MAX_ITEMS) {
    return false
  }
  if (payload.state === 'available') {
    return (
      typeof payload.truncated === 'boolean' &&
      payload.error === null &&
      payload.items.every(isWorkflowSummary)
    )
  }
  if (payload.state === 'unconfigured') {
    return (
      payload.items.length === 0 &&
      payload.truncated === false &&
      payload.error === null
    )
  }
  if (typeof payload.state !== 'string') return false
  const expected =
    FAILURE_ERRORS[payload.state as keyof typeof FAILURE_ERRORS]
  return (
    expected !== undefined &&
    payload.items.length === 0 &&
    payload.truncated === false &&
    payload.error === expected
  )
}

function parseInventoryResponse(
  payload: unknown,
): N8nWorkflowInventoryResponse {
  if (!isInventoryResponse(payload)) {
    throw new N8nWorkflowInventoryContractError()
  }
  return payload
}

const wasAborted = (error: unknown, signal?: AbortSignal) =>
  signal?.aborted ||
  (error instanceof DOMException && error.name === 'AbortError')

export async function getN8nWorkflowInventory(
  signal?: AbortSignal,
): Promise<N8nWorkflowInventoryResponse> {
  try {
    return await requestJson(
      '/api/integrations/n8n/workflows',
      parseInventoryResponse,
      { signal, expectedStatus: 200 },
    )
  } catch (error) {
    if (error instanceof N8nWorkflowInventoryContractError) throw error
    if (wasAborted(error, signal)) throw error
    if (
      error instanceof Error &&
      error.message === INVALID_RESPONSE_MESSAGE
    ) {
      throw new N8nWorkflowInventoryContractError(error)
    }
    throw error
  }
}
