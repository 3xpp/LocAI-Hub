import { requestJson, requestNoContent } from './client'

const INVALID_RESPONSE_MESSAGE = 'Backend returned an invalid response'

export interface PromptSummary {
  id: number
  title: string
  content_preview: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface Prompt {
  id: number
  title: string
  content: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface PromptListResponse {
  items: PromptSummary[]
  total: number
  limit: number
  offset: number
}

export interface PromptWriteInput {
  title: string
  content: string
  tags: string[]
}

export interface PromptListQuery {
  q?: string
  tag?: string
  limit?: number
  offset?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/

function isValidCalendarDate(value: string): boolean {
  const match = isoTimestampPattern.exec(value)
  if (match === null) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined
  ) {
    return false
  }
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const maximumDay = daysInMonth[month - 1]
  return (
    maximumDay !== undefined &&
    day >= 1 &&
    day <= maximumDay &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
  )
}

const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  isValidCalendarDate(value) &&
  !Number.isNaN(Date.parse(value))

function isContentPreview(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false
  const codePointLength = Array.from(value).length
  return codePointLength <= 160 || (codePointLength === 161 && value.endsWith('…'))
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmptyString)

function isPromptSummary(payload: unknown): payload is PromptSummary {
  return (
    isRecord(payload) &&
    !('content' in payload) &&
    isPositiveInteger(payload.id) &&
    isNonEmptyString(payload.title) &&
    isContentPreview(payload.content_preview) &&
    isStringArray(payload.tags) &&
    isIsoTimestamp(payload.created_at) &&
    isIsoTimestamp(payload.updated_at)
  )
}

function isPrompt(payload: unknown): payload is Prompt {
  return (
    isRecord(payload) &&
    isPositiveInteger(payload.id) &&
    isNonEmptyString(payload.title) &&
    isNonEmptyString(payload.content) &&
    isStringArray(payload.tags) &&
    isIsoTimestamp(payload.created_at) &&
    isIsoTimestamp(payload.updated_at)
  )
}

function parsePrompt(payload: unknown): Prompt {
  if (!isPrompt(payload)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return payload
}

function isPromptListResponse(payload: unknown): payload is PromptListResponse {
  return (
    isRecord(payload) &&
    Array.isArray(payload.items) &&
    payload.items.every(isPromptSummary) &&
    isNonNegativeInteger(payload.total) &&
    isPositiveInteger(payload.limit) &&
    payload.limit <= 100 &&
    isNonNegativeInteger(payload.offset)
  )
}

function parsePromptList(payload: unknown): PromptListResponse {
  if (!isPromptListResponse(payload)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return payload
}

function promptListPath(query: PromptListQuery): string {
  const parameters = new URLSearchParams()
  if (query.q !== undefined) parameters.set('q', query.q)
  if (query.tag !== undefined) parameters.set('tag', query.tag)
  if (query.limit !== undefined) parameters.set('limit', String(query.limit))
  if (query.offset !== undefined) parameters.set('offset', String(query.offset))
  const encoded = parameters.toString()
  return encoded ? `/api/prompts?${encoded}` : '/api/prompts'
}

export const listPrompts = (query: PromptListQuery, signal?: AbortSignal) =>
  requestJson(promptListPath(query), parsePromptList, { signal })

export const getPrompt = (id: number, signal?: AbortSignal) =>
  requestJson(`/api/prompts/${id}`, parsePrompt, { signal })

export const createPrompt = (input: PromptWriteInput, signal?: AbortSignal) =>
  requestJson('/api/prompts', parsePrompt, { method: 'POST', body: input, signal })

export const updatePrompt = (
  id: number,
  input: PromptWriteInput,
  signal?: AbortSignal,
) =>
  requestJson(`/api/prompts/${id}`, parsePrompt, {
    method: 'PUT',
    body: input,
    signal,
  })

export const deletePrompt = (id: number, signal?: AbortSignal) =>
  requestNoContent(`/api/prompts/${id}`, signal)
