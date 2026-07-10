import type { Prompt, PromptSummary } from '../../api/prompts'

export type PromptEditorMode = 'empty' | 'new' | 'selected'

export interface PromptDraft {
  title: string
  content: string
  tags: string[]
}

export const newPromptDraft = (): PromptDraft => ({
  title: '',
  content: '',
  tags: [],
})

export const promptToDraft = (prompt: Prompt): PromptDraft => ({
  title: prompt.title,
  content: prompt.content,
  tags: [...prompt.tags],
})

function unicodeCaseFold(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    const isCherokee =
      (codePoint >= 0x13a0 && codePoint <= 0x13ff) ||
      (codePoint >= 0xab70 && codePoint <= 0xabbf)
    if (character === 'ı') return character
    if (isCherokee) return character.toUpperCase()
    return character.toUpperCase().toLowerCase().replaceAll('ß', 'ss').replaceAll('ς', 'σ')
  }).join('')
}

export const promptTextLength = (value: string) => Array.from(value).length

export function normalizePromptTag(value: string): string {
  if (value.includes(',')) throw new Error('Tags cannot contain commas')
  if (/\p{C}/u.test(value)) throw new Error('Tags cannot contain control characters')
  const normalized = value.trim().replace(/\s+/gu, ' ').split(' ').map(unicodeCaseFold).join(' ')
  if (normalized.length === 0) throw new Error('Enter a tag first')
  if (promptTextLength(normalized) > 30) throw new Error('Tags can contain at most 30 characters')
  return normalized
}

const normalizeTagForComparison = (tag: string) =>
  tag.trim().replace(/\s+/gu, ' ').split(' ').map(unicodeCaseFold).join(' ')

const normalizeTagsForComparison = (tags: string[]) => {
  const seen = new Set<string>()
  return tags
    .map(normalizeTagForComparison)
    .filter((tag) => {
      if (tag.length === 0 || seen.has(tag)) return false
      seen.add(tag)
      return true
    })
}

export function isPromptDraftDirty(draft: PromptDraft, baseline: PromptDraft): boolean {
  const draftTags = normalizeTagsForComparison(draft.tags)
  const baselineTags = normalizeTagsForComparison(baseline.tags)
  return (
    draft.title.trim() !== baseline.title.trim() ||
    draft.content !== baseline.content ||
    draftTags.length !== baselineTags.length ||
    draftTags.some((tag, index) => tag !== baselineTags[index])
  )
}

export function mergePromptPages(
  existing: PromptSummary[],
  incoming: PromptSummary[],
): PromptSummary[] {
  const merged = [...existing]
  const indexes = new Map(merged.map((prompt, index) => [prompt.id, index]))

  for (const prompt of incoming) {
    const index = indexes.get(prompt.id)
    if (index === undefined) {
      indexes.set(prompt.id, merged.length)
      merged.push(prompt)
    } else {
      merged[index] = prompt
    }
  }
  return merged
}
