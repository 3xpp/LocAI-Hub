import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { N8nWorkflowInventorySnapshot } from '../../api/n8nWorkflowInventory'
import { N8nWorkflowInventory } from './N8nWorkflowInventory'
import type { N8nWorkflowInventoryController } from './useN8nWorkflowInventory'

const makeController = (
  overrides: Partial<N8nWorkflowInventoryController> = {},
): N8nWorkflowInventoryController => ({
  snapshot: null,
  requestStatus: 'idle',
  pending: false,
  error: null,
  stale: false,
  lastLoaded: null,
  settlementSequence: 0,
  load: vi.fn(),
  refresh: vi.fn(),
  ...overrides,
})

const available: Extract<
  N8nWorkflowInventorySnapshot,
  { state: 'available' }
> = {
  state: 'available',
  items: [
    {
      name: 'Daily local backup',
      active: true,
      updated_at: '2026-07-26T08:30:00Z',
    },
    {
      name: 'Draft document pipeline',
      active: false,
      updated_at: '2026-07-25T18:15:00Z',
    },
  ],
  truncated: false,
  error: null,
}

describe('N8nWorkflowInventory', () => {
  it('renders idle state and makes one explicit load', async () => {
    const user = userEvent.setup()
    const load = vi.fn()
    render(
      <N8nWorkflowInventory controller={makeController({ load })} />,
    )

    const section = screen.getByRole('region', {
      name: 'n8n workflow inventory',
    })
    expect(section).toHaveAttribute('aria-busy', 'false')
    expect(
      within(section).getByText('Workflow inventory not loaded'),
    ).toBeInTheDocument()
    await user.click(
      within(section).getByRole('button', { name: 'Load workflows' }),
    )
    expect(load).toHaveBeenCalledOnce()
  })

  it('renders semantic inert rows and approved fields only', () => {
    const loaded = new Date('2026-07-26T09:00:00Z')
    render(
      <N8nWorkflowInventory
        controller={makeController({
          snapshot: available,
          requestStatus: 'ready',
          lastLoaded: loaded,
          settlementSequence: 1,
        })}
      />,
    )

    const list = screen.getByRole('list', { name: 'n8n workflows' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('Daily local backup')).toBeInTheDocument()
    expect(within(list).getByText('Active')).toBeInTheDocument()
    expect(within(list).getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('2 loaded')).toBeInTheDocument()
    expect(document.querySelector('[href]')).toBeNull()
    expect(document.querySelector('input')).toBeNull()
    expect(
      screen.queryByText(/cursor|workflow id|total/i),
    ).not.toBeInTheDocument()
  })

  it('keeps the pending action focusable and ignores all pending activation', async () => {
    const user = userEvent.setup()
    const load = vi.fn()
    const refresh = vi.fn()
    const initial = makeController({ load, refresh })
    const { rerender } = render(
      <N8nWorkflowInventory controller={initial} />,
    )
    const button = screen.getByRole('button', { name: 'Load workflows' })
    await user.click(button)
    expect(load).toHaveBeenCalledOnce()
    expect(button).toHaveFocus()

    rerender(
      <N8nWorkflowInventory
        controller={{
          ...initial,
          requestStatus: 'loading',
          pending: true,
        }}
      />,
    )
    const pendingButton = screen.getByRole('button', {
      name: 'Loading workflows',
    })
    const section = screen.getByRole('region', {
      name: 'n8n workflow inventory',
    })
    expect(section).toHaveAttribute('aria-busy', 'true')
    expect(pendingButton).toHaveAttribute('aria-disabled', 'true')
    expect(pendingButton).not.toBeDisabled()
    expect(pendingButton).toHaveFocus()
    await user.click(pendingButton)
    await user.keyboard('{Enter}{Space}')
    expect(load).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('renders neutral unconfigured guidance without credential controls', () => {
    const { container } = render(
      <N8nWorkflowInventory
        controller={makeController({
          snapshot: {
            state: 'unconfigured',
            items: [],
            truncated: false,
            error: null,
          },
          requestStatus: 'ready',
          lastLoaded: new Date('2026-07-26T09:00:00Z'),
          settlementSequence: 1,
        })}
      />,
    )

    expect(screen.getByText('Inventory not configured')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Configure the n8n origin and API key in the API process/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Refresh inventory' }),
    ).toBeInTheDocument()
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('[href]')).toBeNull()
    expect(
      screen.queryByRole('button', { name: /copy|clipboard/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/key present|key missing/i),
    ).not.toBeInTheDocument()
  })

  it('renders empty and truncated available results without a provider total', () => {
    const { rerender } = render(
      <N8nWorkflowInventory
        controller={makeController({
          snapshot: {
            state: 'available',
            items: [],
            truncated: false,
            error: null,
          },
          requestStatus: 'ready',
          lastLoaded: new Date('2026-07-26T09:00:00Z'),
          settlementSequence: 1,
        })}
      />,
    )
    expect(screen.getByText('0 loaded')).toBeInTheDocument()
    expect(screen.getByText('No workflows returned')).toBeInTheDocument()

    rerender(
      <N8nWorkflowInventory
        controller={makeController({
          snapshot: { ...available, truncated: true },
          requestStatus: 'ready',
          lastLoaded: new Date('2026-07-26T09:01:00Z'),
          settlementSequence: 2,
        })}
      />,
    )
    expect(
      screen.getByText(
        'Showing a bounded workflow summary. More workflows may exist in n8n.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/provider total/i)).not.toBeInTheDocument()
  })

  it('uses one assertive first error and no polite duplicate', () => {
    render(
      <N8nWorkflowInventory
        controller={makeController({
          requestStatus: 'error',
          error: 'n8n denied workflow inventory access',
          settlementSequence: 1,
        })}
      />,
    )

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'n8n denied workflow inventory access',
    )
    expect(
      screen.getByLabelText('n8n workflow inventory announcements'),
    ).toHaveTextContent('')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('clears an earlier polite result when a later first error is assertive', () => {
    const initial = makeController()
    const { rerender } = render(
      <N8nWorkflowInventory controller={initial} />,
    )
    rerender(
      <N8nWorkflowInventory
        controller={{
          ...initial,
          snapshot: {
            state: 'unconfigured',
            items: [],
            truncated: false,
            error: null,
          },
          requestStatus: 'ready',
          settlementSequence: 1,
        }}
      />,
    )
    const region = screen.getByLabelText(
      'n8n workflow inventory announcements',
    )
    expect(region).toHaveTextContent(
      'n8n workflow inventory is not configured.',
    )

    rerender(
      <N8nWorkflowInventory
        controller={{
          ...initial,
          requestStatus: 'error',
          error: 'n8n denied workflow inventory access',
          settlementSequence: 2,
        }}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'n8n denied workflow inventory access',
    )
    expect(region).toHaveTextContent('')
    expect(region.childElementCount).toBe(0)
  })

  it('retains stale rows and announces one warning politely', () => {
    const initial = makeController({
      snapshot: available,
      requestStatus: 'ready',
      lastLoaded: new Date('2026-07-26T09:00:00Z'),
      settlementSequence: 1,
    })
    const { rerender } = render(
      <N8nWorkflowInventory controller={initial} />,
    )
    rerender(
      <N8nWorkflowInventory
        controller={{
          ...initial,
          requestStatus: 'error',
          error: 'Refresh failed. Showing the last workflow inventory.',
          stale: true,
          settlementSequence: 2,
        }}
      />,
    )

    expect(
      screen.getByRole('list', { name: 'n8n workflows' }),
    ).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('n8n workflow inventory announcements'),
    ).toHaveTextContent(
      'Refresh failed. Showing the last workflow inventory.',
    )
  })

  it('emits one replaceable combined success announcement per settlement', () => {
    const initial = makeController()
    const { rerender } = render(
      <N8nWorkflowInventory controller={initial} />,
    )
    rerender(
      <N8nWorkflowInventory
        controller={makeController({
          snapshot: { ...available, truncated: true },
          requestStatus: 'ready',
          lastLoaded: new Date('2026-07-26T09:00:00Z'),
          settlementSequence: 1,
        })}
      />,
    )
    const region = screen.getByLabelText(
      'n8n workflow inventory announcements',
    )
    const firstMessage = region.firstElementChild
    expect(region).toHaveTextContent(
      '2 n8n workflows loaded; the bounded result is truncated.',
    )

    rerender(
      <N8nWorkflowInventory
        controller={makeController({
          snapshot: { ...available, truncated: true },
          requestStatus: 'ready',
          lastLoaded: new Date('2026-07-26T09:01:00Z'),
          settlementSequence: 2,
        })}
      />,
    )
    expect(region.firstElementChild).not.toBe(firstMessage)
    expect(region.childElementCount).toBe(1)
  })

  it('renders duplicate and hostile maximum names as inert text', () => {
    const suffix = '<script>$(rm) https://private \u202E'
    const hostile = `${'🧠'.repeat(
      256 - Array.from(suffix).length,
    )}${suffix}`
    expect(Array.from(hostile)).toHaveLength(256)
    const hostileAvailable = {
      ...available,
      items: [
        { ...available.items[0], name: hostile },
        { ...available.items[0], name: hostile },
      ],
    }
    const { container } = render(
      <N8nWorkflowInventory
        controller={makeController({
          snapshot: hostileAvailable,
          requestStatus: 'ready',
          lastLoaded: new Date('2026-07-26T09:00:00Z'),
          settlementSequence: 1,
        })}
      />,
    )

    expect(screen.getAllByText(hostile)).toHaveLength(2)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[href]')).toBeNull()
    expect(container.querySelector('[data-workflow-id]')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: /copy|open|search|filter|detail|execute|activate|archive|delete/i,
      }),
    ).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(
      /\bcursor\b|\bworkflow id\b/i,
    )
  })
})
