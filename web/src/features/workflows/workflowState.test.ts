import { describe, expect, it } from 'vitest'

import type { WorkflowLink, WorkflowLinkSummary } from '../../api/workflowLinks'
import {
  isWorkflowLinkDraftDirty,
  mergeWorkflowLinkPages,
  newWorkflowLinkDraft,
  normalizeWorkflowLinkTag,
  workflowLinkTextLength,
  workflowLinkToDraft,
} from './workflowState'

const timestamp = '2026-07-12T12:30:00Z'

const workflowLink: WorkflowLink = {
  id: 1,
  title: 'Repository summary flow',
  url: 'http://localhost:5678/workflow/repository-summary',
  description: 'Summarizes the active repository.\nKeep this raw.',
  tags: ['n8n', 'local'],
  created_at: timestamp,
  updated_at: timestamp,
}

const summary = (id: number, title: string): WorkflowLinkSummary => ({
  id,
  title,
  url: `http://localhost:5678/workflow/${id}`,
  description_preview: `${title} preview`,
  tags: ['local'],
  created_at: timestamp,
  updated_at: timestamp,
})

describe('workflow-link state helpers', () => {
  it('creates independent blank drafts and copies persisted data', () => {
    const first = newWorkflowLinkDraft()
    const second = newWorkflowLinkDraft()
    const persisted = workflowLinkToDraft(workflowLink)

    expect(first).toEqual({ title: '', url: '', description: '', tags: [] })
    expect(first).not.toBe(second)
    expect(persisted).toEqual({
      title: workflowLink.title,
      url: workflowLink.url,
      description: workflowLink.description,
      tags: workflowLink.tags,
    })
    expect(persisted.tags).not.toBe(workflowLink.tags)
  })

  it('uses server-style trimming and canonical tags for dirty comparison', () => {
    const baseline = workflowLinkToDraft(workflowLink)

    expect(
      isWorkflowLinkDraftDirty(
        {
          title: `  ${baseline.title}  `,
          url: ` ${baseline.url} `,
          description: `  ${baseline.description}  `,
          tags: [' N8N ', 'LOCAL', 'n8n'],
        },
        baseline,
      ),
    ).toBe(false)
    expect(
      isWorkflowLinkDraftDirty(
        { ...baseline, url: 'http://localhost:5678/workflow/a-different-route' },
        baseline,
      ),
    ).toBe(true)
    expect(
      isWorkflowLinkDraftDirty(
        { ...baseline, tags: ['straße', 'ﬀ', 'ſ'] },
        { ...baseline, tags: ['STRASSE', 'ff', 's'] },
      ),
    ).toBe(false)
  })

  it('shares canonical tag and Unicode code-point helpers', () => {
    expect(workflowLinkTextLength('A🤖')).toBe(2)
    expect(normalizeWorkflowLinkTag('  Straße   Review  ')).toBe('strasse review')
  })

  it('merges pages by ID while retaining order and fresh duplicate data', () => {
    const existing = [summary(3, 'Third'), summary(2, 'Second')]
    const incoming = [summary(2, 'Second refreshed'), summary(1, 'First')]

    expect(mergeWorkflowLinkPages(existing, incoming)).toEqual([
      existing[0],
      incoming[0],
      incoming[1],
    ])
  })
})
