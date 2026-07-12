import { requestJson, requestNoContent } from './client'
import { isSafeWorkflowLinkUrl } from './workflowLinkUrl'

const INVALID_RESPONSE_MESSAGE = 'Backend returned an invalid response'
const MAX_TITLE_LENGTH = 200
const MAX_URL_LENGTH = 2_048
const MAX_DESCRIPTION_LENGTH = 5_000
const MAX_PREVIEW_LENGTH = 160
const MAX_TAG_COUNT = 10
const MAX_TAG_LENGTH = 30

export interface WorkflowLinkSummary {
  id: number
  title: string
  url: string
  description_preview: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface WorkflowLink {
  id: number
  title: string
  url: string
  description: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface WorkflowLinkListResponse {
  items: WorkflowLinkSummary[]
  total: number
  limit: number
  offset: number
}

export interface WorkflowLinkWriteInput {
  title: string
  url: string
  description: string
  tags: string[]
}

export interface WorkflowLinkListQuery {
  q?: string
  tag?: string
  limit?: number
  offset?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const textLength = (value: string) => Array.from(value).length

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function isCanonicalTitle(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    textLength(value) <= MAX_TITLE_LENGTH
  )
}

function unicodeCaseFold(character: string): string {
  const codePoint = character.codePointAt(0) ?? 0
  const isCherokee =
    (codePoint >= 0x13a0 && codePoint <= 0x13ff) ||
    (codePoint >= 0xab70 && codePoint <= 0xabbf)
  if (character === 'ı') return character
  if (isCherokee) return character.toUpperCase()
  return character.toUpperCase().toLowerCase().replaceAll('ß', 'ss').replaceAll('ς', 'σ')
}

function normalizedTag(value: string): string | null {
  if (value.includes(',') || /\p{C}/u.test(value)) return null
  const normalized = value
    .trim()
    .replace(/\s+/gu, ' ')
    .split(' ')
    .map(unicodeCaseFold)
    .join(' ')
  if (normalized.length === 0 || textLength(normalized) > MAX_TAG_LENGTH) return null
  return normalized
}

function isCanonicalTags(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_TAG_COUNT) return false
  const seen = new Set<string>()

  for (const candidate of value) {
    if (typeof candidate !== 'string') return false
    const normalized = normalizedTag(candidate)
    if (normalized === null || normalized !== candidate || seen.has(candidate)) return false
    seen.add(candidate)
  }
  return true
}

const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/

function isAwareIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = isoTimestampPattern.exec(value)
  if (match === null) return false

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zoneHourText, zoneMinuteText] =
    match
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
  const zoneHour = zoneHourText === undefined ? 0 : Number(zoneHourText)
  const zoneMinute = zoneMinuteText === undefined ? 0 : Number(zoneMinuteText)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const maximumDay = daysInMonth[month - 1]

  return (
    year >= 1 &&
    maximumDay !== undefined &&
    day >= 1 &&
    day <= maximumDay &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    zoneHour <= 23 &&
    zoneMinute <= 59 &&
    !Number.isNaN(Date.parse(value))
  )
}

function isDescriptionPreview(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const collapsed = value.trim().replace(/\s+/gu, ' ')
  if (collapsed !== value) return false
  const length = textLength(value)
  return length <= MAX_PREVIEW_LENGTH || (length === MAX_PREVIEW_LENGTH + 1 && value.endsWith('…'))
}

function isCanonicalDescription(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    textLength(value) <= MAX_DESCRIPTION_LENGTH
  )
}

function hasCanonicalSharedFields(payload: Record<string, unknown>): boolean {
  return (
    isPositiveInteger(payload.id) &&
    isCanonicalTitle(payload.title) &&
    typeof payload.url === 'string' &&
    textLength(payload.url) <= MAX_URL_LENGTH &&
    isSafeWorkflowLinkUrl(payload.url) &&
    isCanonicalTags(payload.tags) &&
    isAwareIsoTimestamp(payload.created_at) &&
    isAwareIsoTimestamp(payload.updated_at)
  )
}

function isWorkflowLinkSummary(payload: unknown): payload is WorkflowLinkSummary {
  return (
    isRecord(payload) &&
    !('description' in payload) &&
    hasCanonicalSharedFields(payload) &&
    isDescriptionPreview(payload.description_preview)
  )
}

function isWorkflowLink(payload: unknown): payload is WorkflowLink {
  return (
    isRecord(payload) &&
    !('description_preview' in payload) &&
    hasCanonicalSharedFields(payload) &&
    isCanonicalDescription(payload.description)
  )
}

function parseWorkflowLink(payload: unknown): WorkflowLink {
  if (!isWorkflowLink(payload)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return payload
}

function isWorkflowLinkListResponse(payload: unknown): payload is WorkflowLinkListResponse {
  return (
    isRecord(payload) &&
    Array.isArray(payload.items) &&
    payload.items.every(isWorkflowLinkSummary) &&
    isNonNegativeInteger(payload.total) &&
    isPositiveInteger(payload.limit) &&
    payload.limit <= 100 &&
    isNonNegativeInteger(payload.offset) &&
    payload.items.length <= payload.limit &&
    payload.items.length <= payload.total
  )
}

function parseWorkflowLinkList(payload: unknown): WorkflowLinkListResponse {
  if (!isWorkflowLinkListResponse(payload)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return payload
}

function workflowLinkListPath(query: WorkflowLinkListQuery): string {
  const parameters = new URLSearchParams()
  if (query.q !== undefined) parameters.set('q', query.q)
  if (query.tag !== undefined) parameters.set('tag', query.tag)
  if (query.limit !== undefined) parameters.set('limit', String(query.limit))
  if (query.offset !== undefined) parameters.set('offset', String(query.offset))
  const encoded = parameters.toString()
  return encoded ? `/api/workflow-links?${encoded}` : '/api/workflow-links'
}

export const listWorkflowLinks = (
  query: WorkflowLinkListQuery,
  signal?: AbortSignal,
) => requestJson(workflowLinkListPath(query), parseWorkflowLinkList, { signal })

export const getWorkflowLink = (id: number, signal?: AbortSignal) =>
  requestJson(`/api/workflow-links/${id}`, parseWorkflowLink, { signal })

export const createWorkflowLink = (
  input: WorkflowLinkWriteInput,
  signal?: AbortSignal,
) =>
  requestJson('/api/workflow-links', parseWorkflowLink, {
    method: 'POST',
    body: input,
    signal,
  })

export const updateWorkflowLink = (
  id: number,
  input: WorkflowLinkWriteInput,
  signal?: AbortSignal,
) =>
  requestJson(`/api/workflow-links/${id}`, parseWorkflowLink, {
    method: 'PUT',
    body: input,
    signal,
  })

export const deleteWorkflowLink = (id: number, signal?: AbortSignal) =>
  requestNoContent(`/api/workflow-links/${id}`, signal)
