import type { Prompt, PromptSummary } from '../../api/prompts'
import { normalizeRegistryTagForComparison } from '../shared/registryState'

export {
  normalizeRegistryTag as normalizePromptTag,
  registryTextLength as promptTextLength,
} from '../shared/registryState'

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

const normalizeTagsForComparison = (tags: string[]) => {
  const seen = new Set<string>()
  return tags
    .map(normalizeRegistryTagForComparison)
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
