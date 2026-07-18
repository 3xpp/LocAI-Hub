import { isSafeWorkflowLinkUrl } from './workflowLinkUrl'

export const MAX_TRANSFER_BUNDLE_BYTES = 10_485_760
export const MAX_TRANSFER_RECORDS = 5_000
export const MAX_TRANSFER_ISSUES = 100

const MAX_TITLE_LENGTH = 200
const MAX_CONTENT_LENGTH = 50_000
const MAX_URL_LENGTH = 2_048
const MAX_DESCRIPTION_LENGTH = 5_000
const MAX_TAG_COUNT = 10
const MAX_TAG_LENGTH = 30

export interface TransferCounts {
  total: number
  prompts: number
  workflow_links: number
}

export interface PromptTransferRecord {
  type: 'prompt'
  title: string
  content: string
  tags: string[]
}

export interface WorkflowLinkTransferRecord {
  type: 'workflow_link'
  title: string
  url: string
  description: string
  tags: string[]
}

export type TransferRecord = PromptTransferRecord | WorkflowLinkTransferRecord
export type TransferRecordType = TransferRecord['type']

export interface TransferBundleV1 {
  application: 'local-ai-workflow-hub'
  format_version: 1
  exported_at: string
  records: TransferRecord[]
}

export type TransferWarningCode = 'empty_bundle' | 'exact_duplicates'

export interface TransferWarning {
  code: TransferWarningCode
  message: string
}

export interface TransferPreviewResponse {
  valid: true
  importable: boolean
  format_version: 1
  counts: TransferCounts
  duplicates: TransferCounts
  warnings: TransferWarning[]
}

export interface TransferImportResponse {
  imported: TransferCounts
  duplicates_imported: TransferCounts
}

export interface TransferExportResult {
  bundle: TransferBundleV1
  rawJson: string
  filename: string
  counts: TransferCounts
}

export type TransferErrorCode =
  | 'unsupported_media_type'
  | 'malformed_json'
  | 'bundle_too_large'
  | 'export_too_large'
  | 'too_many_records'
  | 'invalid_application'
  | 'unsupported_format_version'
  | 'invalid_bundle'
  | 'empty_bundle'
  | 'export_failed'
  | 'preview_failed'
  | 'import_failed'

export type TransferIssueCode =
  | 'missing_field'
  | 'unexpected_field'
  | 'invalid_type'
  | 'unknown_record_type'
  | 'invalid_value'

export type TransferIssueField =
  | 'application'
  | 'format_version'
  | 'exported_at'
  | 'records'
  | 'type'
  | 'title'
  | 'content'
  | 'tags'
  | 'url'
  | 'description'

export interface TransferIssue {
  location: Array<string | number>
  record_index: number | null
  record_type: TransferRecordType | null
  field: TransferIssueField | null
  code: TransferIssueCode
  message: string
}

export interface TransferErrorDetail {
  code: TransferErrorCode
  message: string
  issues: TransferIssue[]
  issues_truncated: boolean
}

const ERROR_MESSAGES: Record<TransferErrorCode, string> = {
  unsupported_media_type: 'Content-Type must be UTF-8 JSON.',
  malformed_json: 'Bundle is not valid UTF-8 JSON.',
  bundle_too_large: 'Bundle is too large.',
  export_too_large: 'Export is too large.',
  too_many_records: 'Bundle contains too many records.',
  invalid_application: 'Bundle application is not supported.',
  unsupported_format_version: 'Bundle format version is not supported.',
  invalid_bundle: 'Bundle validation failed.',
  empty_bundle: 'Bundle contains no records.',
  export_failed: 'Export failed.',
  preview_failed: 'Preview failed.',
  import_failed: 'Import failed.',
}

const ISSUE_MESSAGES: Record<TransferIssueCode, string> = {
  missing_field: 'Required field is missing.',
  unexpected_field: 'Bundle contains an unexpected field.',
  invalid_type: 'Field has an invalid type.',
  unknown_record_type: 'Record type is not supported.',
  invalid_value: 'Field value is invalid.',
}

const WARNING_MESSAGES: Record<TransferWarningCode, string> = {
  empty_bundle: 'This bundle contains no records and cannot be imported.',
  exact_duplicates: 'Exact duplicates will be imported as new records.',
}

export class TransferHttpError extends Error {
  readonly status: number
  readonly detail: TransferErrorDetail | null
  readonly outcomeUncertain: boolean

  constructor(
    status: number,
    detail: TransferErrorDetail | null,
    outcomeUncertain = false,
  ) {
    super(detail?.message ?? 'Backend returned an invalid transfer response')
    this.name = 'TransferHttpError'
    this.status = status
    this.detail = detail
    this.outcomeUncertain = outcomeUncertain
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value)
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
}

const textLength = (value: string) => Array.from(value).length

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

function isCanonicalContent(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    textLength(value) <= MAX_CONTENT_LENGTH
  )
}

function isCanonicalDescription(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    textLength(value) <= MAX_DESCRIPTION_LENGTH
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

const zeroUtcTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|\+00:00)$/

function isZeroUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = zeroUtcTimestampPattern.exec(value)
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
    year >= 1 &&
    maximumDay !== undefined &&
    day >= 1 &&
    day <= maximumDay &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
  )
}

function isPromptTransferRecord(value: unknown): value is PromptTransferRecord {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['type', 'title', 'content', 'tags']) &&
    value.type === 'prompt' &&
    isCanonicalTitle(value.title) &&
    isCanonicalContent(value.content) &&
    isCanonicalTags(value.tags)
  )
}

function isWorkflowLinkTransferRecord(
  value: unknown,
): value is WorkflowLinkTransferRecord {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['type', 'title', 'url', 'description', 'tags']) &&
    value.type === 'workflow_link' &&
    isCanonicalTitle(value.title) &&
    typeof value.url === 'string' &&
    textLength(value.url) <= MAX_URL_LENGTH &&
    isSafeWorkflowLinkUrl(value.url) &&
    isCanonicalDescription(value.description) &&
    isCanonicalTags(value.tags)
  )
}

function parseTransferBundle(payload: unknown): TransferBundleV1 | null {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['application', 'format_version', 'exported_at', 'records']) ||
    payload.application !== 'local-ai-workflow-hub' ||
    payload.format_version !== 1 ||
    !isZeroUtcTimestamp(payload.exported_at) ||
    !Array.isArray(payload.records) ||
    payload.records.length > MAX_TRANSFER_RECORDS
  ) {
    return null
  }

  let workflowLinksStarted = false
  for (const record of payload.records) {
    if (isPromptTransferRecord(record)) {
      if (workflowLinksStarted) return null
      continue
    }
    if (!isWorkflowLinkTransferRecord(record)) return null
    workflowLinksStarted = true
  }
  return payload as unknown as TransferBundleV1
}

function transferCounts(records: TransferRecord[]): TransferCounts {
  const prompts = records.filter((record) => record.type === 'prompt').length
  return {
    total: records.length,
    prompts,
    workflow_links: records.length - prompts,
  }
}

function parseCounts(value: unknown): TransferCounts | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['total', 'prompts', 'workflow_links']) ||
    !isNonNegativeInteger(value.total) ||
    !isNonNegativeInteger(value.prompts) ||
    !isNonNegativeInteger(value.workflow_links) ||
    value.total !== value.prompts + value.workflow_links ||
    value.total > MAX_TRANSFER_RECORDS
  ) {
    return null
  }
  return value as unknown as TransferCounts
}

function countsFitWithin(candidate: TransferCounts, maximum: TransferCounts): boolean {
  return (
    candidate.total <= maximum.total &&
    candidate.prompts <= maximum.prompts &&
    candidate.workflow_links <= maximum.workflow_links
  )
}

function expectedWarnings(
  counts: TransferCounts,
  duplicates: TransferCounts,
): TransferWarning[] {
  const warnings: TransferWarning[] = []
  if (counts.total === 0) {
    warnings.push({ code: 'empty_bundle', message: WARNING_MESSAGES.empty_bundle })
  }
  if (duplicates.total > 0) {
    warnings.push({
      code: 'exact_duplicates',
      message: WARNING_MESSAGES.exact_duplicates,
    })
  }
  return warnings
}

function isExactWarnings(
  value: unknown,
  counts: TransferCounts,
  duplicates: TransferCounts,
): value is TransferWarning[] {
  if (!Array.isArray(value)) return false
  const expected = expectedWarnings(counts, duplicates)
  return (
    value.length === expected.length &&
    value.every((warning, index) => {
      const contract = expected[index]
      return (
        contract !== undefined &&
        isRecord(warning) &&
        hasExactKeys(warning, ['code', 'message']) &&
        warning.code === contract.code &&
        warning.message === contract.message
      )
    })
  )
}

function parseTransferPreview(payload: unknown): TransferPreviewResponse | null {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      'valid',
      'importable',
      'format_version',
      'counts',
      'duplicates',
      'warnings',
    ]) ||
    payload.valid !== true ||
    typeof payload.importable !== 'boolean' ||
    payload.format_version !== 1
  ) {
    return null
  }
  const counts = parseCounts(payload.counts)
  const duplicates = parseCounts(payload.duplicates)
  if (
    counts === null ||
    duplicates === null ||
    !countsFitWithin(duplicates, counts) ||
    payload.importable !== (counts.total > 0) ||
    !isExactWarnings(payload.warnings, counts, duplicates)
  ) {
    return null
  }
  return payload as unknown as TransferPreviewResponse
}

function parseTransferImport(payload: unknown): TransferImportResponse | null {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['imported', 'duplicates_imported'])
  ) {
    return null
  }
  const imported = parseCounts(payload.imported)
  const duplicates = parseCounts(payload.duplicates_imported)
  if (
    imported === null ||
    imported.total === 0 ||
    duplicates === null ||
    !countsFitWithin(duplicates, imported)
  ) {
    return null
  }
  return payload as unknown as TransferImportResponse
}

const errorCodes = new Set<TransferErrorCode>(
  Object.keys(ERROR_MESSAGES) as TransferErrorCode[],
)
const issueCodes = new Set<TransferIssueCode>(
  Object.keys(ISSUE_MESSAGES) as TransferIssueCode[],
)
const issueFields = new Set<TransferIssueField>([
  'application',
  'format_version',
  'exported_at',
  'records',
  'type',
  'title',
  'content',
  'tags',
  'url',
  'description',
])
const locationNames = new Set<string>([
  ...issueFields,
  'prompt',
  'workflow_link',
])

function isTransferRecordType(value: unknown): value is TransferRecordType {
  return value === 'prompt' || value === 'workflow_link'
}

function parseTransferIssue(value: unknown): TransferIssue | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'location',
      'record_index',
      'record_type',
      'field',
      'code',
      'message',
    ]) ||
    !Array.isArray(value.location) ||
    value.location.length > 8 ||
    !value.location.every(
      (segment) =>
        (typeof segment === 'string' && locationNames.has(segment)) ||
        (isNonNegativeInteger(segment) && segment < MAX_TRANSFER_RECORDS),
    ) ||
    !(
      value.record_index === null ||
      (isNonNegativeInteger(value.record_index) &&
        value.record_index < MAX_TRANSFER_RECORDS)
    ) ||
    !(value.record_type === null || isTransferRecordType(value.record_type)) ||
    !(
      value.field === null ||
      (typeof value.field === 'string' &&
        issueFields.has(value.field as TransferIssueField))
    ) ||
    typeof value.code !== 'string' ||
    !issueCodes.has(value.code as TransferIssueCode) ||
    typeof value.message !== 'string' ||
    textLength(value.message) > 200
  ) {
    return null
  }
  const code = value.code as TransferIssueCode
  return {
    location: value.location as Array<string | number>,
    record_index: value.record_index as number | null,
    record_type: value.record_type as TransferRecordType | null,
    field: value.field as TransferIssueField | null,
    code,
    message: ISSUE_MESSAGES[code],
  }
}

function parseTransferError(payload: unknown): TransferErrorDetail | null {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['detail']) ||
    !isRecord(payload.detail) ||
    !hasExactKeys(payload.detail, ['code', 'message', 'issues', 'issues_truncated']) ||
    typeof payload.detail.code !== 'string' ||
    !errorCodes.has(payload.detail.code as TransferErrorCode) ||
    typeof payload.detail.message !== 'string' ||
    textLength(payload.detail.message) > 200 ||
    !Array.isArray(payload.detail.issues) ||
    payload.detail.issues.length > MAX_TRANSFER_ISSUES ||
    typeof payload.detail.issues_truncated !== 'boolean'
  ) {
    return null
  }
  const code = payload.detail.code as TransferErrorCode
  if (
    (code !== 'invalid_bundle' && payload.detail.issues.length > 0) ||
    (payload.detail.issues_truncated &&
      (code !== 'invalid_bundle' ||
        payload.detail.issues.length !== MAX_TRANSFER_ISSUES))
  ) {
    return null
  }
  const issues: TransferIssue[] = []
  for (const issueValue of payload.detail.issues) {
    const issue = parseTransferIssue(issueValue)
    if (issue === null) return null
    issues.push(issue)
  }
  return {
    code,
    message: ERROR_MESSAGES[code],
    issues,
    issues_truncated: payload.detail.issues_truncated,
  }
}

const isAbortError = (error: unknown, signal: AbortSignal | null | undefined) =>
  signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')

async function transferRequest(
  path: string,
  expectedStatus: number,
  options: RequestInit,
  outcomeUncertain: boolean,
): Promise<{ response: Response; text: string; payload: unknown }> {
  let response: Response
  try {
    response = await fetch(path, options)
  } catch (error) {
    if (isAbortError(error, options.signal)) throw error
    if (outcomeUncertain) throw new TransferHttpError(0, null, true)
    throw new Error('Unable to reach the backend', { cause: error })
  }

  let text: string
  try {
    text = await response.text()
  } catch (error) {
    if (isAbortError(error, options.signal)) throw error
    if (outcomeUncertain) {
      throw new TransferHttpError(response.status, null, true)
    }
    throw new Error('Unable to read the backend response', { cause: error })
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    if (response.status === expectedStatus && outcomeUncertain) {
      throw new TransferHttpError(response.status, null, true)
    }
    throw new TransferHttpError(response.status, null)
  }
  if (response.status !== expectedStatus) {
    throw new TransferHttpError(response.status, parseTransferError(payload))
  }
  return { response, text, payload }
}

function safeExportFilename(value: string | null): string | null {
  if (value === null) return null
  const match =
    /^attachment;\s*filename=(?:"([^"]+)"|([^";\s]+))$/i.exec(value)
  const filename = match?.[1] ?? match?.[2]
  return filename !== undefined &&
    /^local-ai-workflow-hub-\d{8}T\d{6}Z\.json$/.test(filename)
    ? filename
    : null
}

export async function exportTransferBundle(
  signal?: AbortSignal,
): Promise<TransferExportResult> {
  const { response, text, payload } = await transferRequest(
    '/api/transfer/export',
    200,
    { headers: { Accept: 'application/json' }, signal },
    false,
  )
  if (new TextEncoder().encode(text).byteLength > MAX_TRANSFER_BUNDLE_BYTES) {
    throw new TransferHttpError(response.status, null)
  }
  const bundle = parseTransferBundle(payload)
  const filename = safeExportFilename(response.headers.get('Content-Disposition'))
  if (bundle === null || filename === null) {
    throw new TransferHttpError(response.status, null)
  }
  return {
    bundle,
    rawJson: text,
    filename,
    counts: transferCounts(bundle.records),
  }
}

export async function previewTransferBundle(
  rawJson: string,
  signal?: AbortSignal,
): Promise<TransferPreviewResponse> {
  const { response, payload } = await transferRequest(
    '/api/transfer/import/preview',
    200,
    {
      method: 'POST',
      body: rawJson,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal,
    },
    false,
  )
  const preview = parseTransferPreview(payload)
  if (preview === null) throw new TransferHttpError(response.status, null)
  return preview
}

export async function importTransferBundle(
  rawJson: string,
): Promise<TransferImportResponse> {
  const { response, payload } = await transferRequest(
    '/api/transfer/import',
    201,
    {
      method: 'POST',
      body: rawJson,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
    true,
  )
  const result = parseTransferImport(payload)
  if (result === null) throw new TransferHttpError(response.status, null, true)
  return result
}
