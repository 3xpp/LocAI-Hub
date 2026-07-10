import { describe, expect, it } from 'vitest'

import type { Prompt, PromptSummary } from '../../api/prompts'
import {
  isPromptDraftDirty,
  mergePromptPages,
  newPromptDraft,
  promptToDraft,
} from './promptState'

const timestamp = '2026-07-10T12:30:00Z'

const prompt: Prompt = {
  id: 1,
  title: 'Review code',
  content: 'Keep spacing.\n',
  tags: ['code', 'review'],
  created_at: timestamp,
  updated_at: timestamp,
}

const summary = (id: number, title: string): PromptSummary => ({
  id,
  title,
  content_preview: `${title} preview`,
  tags: ['code'],
  created_at: timestamp,
  updated_at: timestamp,
})

describe('prompt state helpers', () => {
  it('creates blank independent drafts and copies persisted prompt data', () => {
    const first = newPromptDraft()
    const second = newPromptDraft()
    const persisted = promptToDraft(prompt)

    expect(first).toEqual({ title: '', content: '', tags: [] })
    expect(first).not.toBe(second)
    expect(persisted).toEqual({
      title: prompt.title,
      content: prompt.content,
      tags: prompt.tags,
    })
    expect(persisted.tags).not.toBe(prompt.tags)
  })

  it('compares normalized title and tags while preserving raw content semantics', () => {
    const baseline = promptToDraft(prompt)

    expect(
      isPromptDraftDirty(
        { title: '  Review code  ', content: prompt.content, tags: [' Code ', 'review'] },
        baseline,
      ),
    ).toBe(false)
    expect(isPromptDraftDirty({ ...baseline, content: ` ${baseline.content}` }, baseline)).toBe(
      true,
    )
    expect(
      isPromptDraftDirty(
        { ...baseline, tags: ['straße', 'ﬀ', 'ſ', 'review'] },
        { ...baseline, tags: ['STRASSE', 'ff', 's', 'review'] },
      ),
    ).toBe(false)
  })

  it('merges pages by ID, preserves order, and adopts fresher duplicate values', () => {
    const existing = [summary(3, 'Third'), summary(2, 'Second')]
    const incoming = [summary(2, 'Second refreshed'), summary(1, 'First')]

    expect(mergePromptPages(existing, incoming)).toEqual([
      existing[0],
      incoming[0],
      incoming[1],
    ])
  })
})
