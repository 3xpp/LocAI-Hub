import type { WorkflowLink, WorkflowLinkSummary } from '../../api/workflowLinks'
import { normalizeRegistryTagForComparison } from '../shared/registryState'

export {
  normalizeRegistryTag as normalizeWorkflowLinkTag,
  registryTextLength as workflowLinkTextLength,
} from '../shared/registryState'

export type WorkflowEditorMode = 'empty' | 'new' | 'selected'

export interface WorkflowLinkDraft {
  title: string
  url: string
  description: string
  tags: string[]
}

export const newWorkflowLinkDraft = (): WorkflowLinkDraft => ({
  title: '',
  url: '',
  description: '',
  tags: [],
})

export const workflowLinkToDraft = (item: WorkflowLink): WorkflowLinkDraft => ({
  title: item.title,
  url: item.url,
  description: item.description,
  tags: [...item.tags],
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

export function isWorkflowLinkDraftDirty(
  draft: WorkflowLinkDraft,
  baseline: WorkflowLinkDraft,
): boolean {
  const draftTags = normalizeTagsForComparison(draft.tags)
  const baselineTags = normalizeTagsForComparison(baseline.tags)
  return (
    draft.title.trim() !== baseline.title.trim() ||
    draft.url.trim() !== baseline.url.trim() ||
    draft.description.trim() !== baseline.description.trim() ||
    draftTags.length !== baselineTags.length ||
    draftTags.some((tag, index) => tag !== baselineTags[index])
  )
}

export function mergeWorkflowLinkPages(
  existing: WorkflowLinkSummary[],
  incoming: WorkflowLinkSummary[],
): WorkflowLinkSummary[] {
  const merged = [...existing]
  const indexes = new Map(merged.map((item, index) => [item.id, index]))

  for (const item of incoming) {
    const index = indexes.get(item.id)
    if (index === undefined) {
      indexes.set(item.id, merged.length)
      merged.push(item)
    } else {
      merged[index] = item
    }
  }
  return merged
}
