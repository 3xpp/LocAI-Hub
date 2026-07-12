import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getWorkflowLink,
  listWorkflowLinks,
  type WorkflowLink,
  type WorkflowLinkListResponse,
  type WorkflowLinkSummary,
} from '../../api/workflowLinks'
import { WorkflowRegistry } from './WorkflowRegistry'
import { useWorkflowRegistry } from './useWorkflowRegistry'

vi.mock('../../api/workflowLinks', () => ({
  getWorkflowLink: vi.fn(),
  listWorkflowLinks: vi.fn(),
}))

const timestamp = '2026-07-12T12:30:00Z'

const summary = (
  id: number,
  title: string,
  {
    description = `${title} preview`,
    tags = ['local'],
    url = `http://localhost:5678/workflow/${id}`,
  }: { description?: string; tags?: string[]; url?: string } = {},
): WorkflowLinkSummary => ({
  id,
  title,
  url,
  description_preview: description,
  tags,
  created_at: timestamp,
  updated_at: timestamp,
})

const workflowLink = (id: number, title: string): WorkflowLink => ({
  id,
  title,
  url: `http://localhost:5678/workflow/${id}`,
  description: `${title} full local reference`,
  tags: ['local'],
  created_at: timestamp,
  updated_at: timestamp,
})

const page = (
  items: WorkflowLinkSummary[],
  total = items.length,
  limit = 50,
  offset = 0,
): WorkflowLinkListResponse => ({ items, total, limit, offset })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function RegistryHarness({ enabled = true }: { enabled?: boolean }) {
  const controller = useWorkflowRegistry(enabled)
  return <WorkflowRegistry controller={controller} />
}

function DirtyGuardHarness() {
  const controller = useWorkflowRegistry(false)
  return (
    <>
      <output data-testid="dirty-state">{controller.dirty ? 'dirty' : 'clean'}</output>
      <button
        type="button"
        onClick={() => controller.updateDraft({ ...controller.draft, title: 'Unsaved route' })}
      >
        Change draft
      </button>
      <button type="button" onClick={() => controller.setPendingTag('pending')}>
        Buffer tag
      </button>
      <button type="button" onClick={() => controller.confirmDiscard()}>
        Guard
      </button>
    </>
  )
}

function StatefulRegistryHarness() {
  const controller = useWorkflowRegistry(true)
  return (
    <>
      <WorkflowRegistry controller={controller} />
      <output data-testid="draft-description">{controller.draft.description}</output>
      <output data-testid="pending-tag">{controller.pendingTag}</output>
      <button
        type="button"
        onClick={() =>
          controller.updateDraft({ ...controller.draft, description: 'Unsaved description' })
        }
      >
        Change description
      </button>
      <button type="button" onClick={() => controller.setPendingTag('pending route')}>
        Set pending tag
      </button>
    </>
  )
}

const listWorkflowLinksMock = vi.mocked(listWorkflowLinks)
const getWorkflowLinkMock = vi.mocked(getWorkflowLink)

const stubLayout = (desktop: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: desktop ? query.includes('min-width') : query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

beforeEach(() => {
  listWorkflowLinksMock.mockReset()
  getWorkflowLinkMock.mockReset()
  getWorkflowLinkMock.mockImplementation((id) =>
    Promise.resolve(workflowLink(id, `Workflow ${id}`)),
  )
  stubLayout(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Workflow Links directory', () => {
  it('shows initial loading, then preserves rows during a background refresh', async () => {
    const initial = deferred<WorkflowLinkListResponse>()
    const refresh = deferred<WorkflowLinkListResponse>()
    listWorkflowLinksMock.mockReturnValueOnce(initial.promise).mockReturnValueOnce(refresh.promise)

    const view = render(<RegistryHarness />)
    expect(screen.getByRole('status', { name: 'Loading workflow links' })).toBeInTheDocument()

    await act(async () => initial.resolve(page([summary(1, 'Repository summary')])))
    expect(screen.getByRole('button', { name: /Repository summary/ })).toBeInTheDocument()
    await screen.findByText('Workflow 1 full local reference')
    expect(listWorkflowLinksMock).toHaveBeenCalledTimes(1)

    view.rerender(<RegistryHarness enabled={false} />)
    view.rerender(<RegistryHarness enabled />)
    expect(screen.getByRole('button', { name: /Repository summary/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing')

    await act(async () => refresh.resolve(page([summary(1, 'Repository summary refreshed')])))
    expect(screen.getByRole('button', { name: /Repository summary refreshed/ })).toBeInTheDocument()
  })

  it('distinguishes the empty registry from a filtered empty view', async () => {
    listWorkflowLinksMock.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([]))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    expect(await screen.findByText('No workflow links saved yet')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search workflow links' }), 'missing')
    expect(await screen.findByText('No workflow links match this view')).toBeInTheDocument()
  })

  it('keeps loaded detail intact when a filtered list request fails and can retry', async () => {
    const first = summary(1, 'Repository summary', { tags: ['local', 'n8n'] })
    listWorkflowLinksMock
      .mockResolvedValueOnce(page([first]))
      .mockRejectedValueOnce(new Error('Backend returned HTTP 503'))
      .mockResolvedValueOnce(page([first]))
    getWorkflowLinkMock.mockResolvedValueOnce(workflowLink(1, 'Repository summary'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    expect(await screen.findByText('Repository summary full local reference')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filter by tag n8n' }))

    expect(await screen.findByText('Backend returned HTTP 503')).toBeInTheDocument()
    expect(screen.getByText('Repository summary full local reference')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry workflow link list' }))
    expect(await screen.findByRole('button', { name: /Repository summary/ })).toBeInTheDocument()
  })

  it('debounces search for 250 ms and clears whitespace to an omitted query', async () => {
    listWorkflowLinksMock.mockResolvedValue(page([]))
    render(<RegistryHarness />)
    await screen.findByText('No workflow links saved yet')
    vi.useFakeTimers()

    const search = screen.getByRole('searchbox', { name: 'Search workflow links' })
    fireEvent.change(search, { target: { value: 'review' } })
    act(() => vi.advanceTimersByTime(249))
    expect(listWorkflowLinksMock).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTime(1))
    expect(listWorkflowLinksMock).toHaveBeenLastCalledWith(
      { q: 'review', tag: undefined, limit: 50, offset: 0 },
      expect.any(AbortSignal),
    )

    fireEvent.change(search, { target: { value: '   ' } })
    await act(async () => vi.advanceTimersByTime(250))
    expect(listWorkflowLinksMock).toHaveBeenLastCalledWith(
      { q: undefined, tag: undefined, limit: 50, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it('does not blank or request when an empty filter gains only whitespace', async () => {
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(1, 'Stable route')]))
    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Stable route/ })
    vi.useFakeTimers()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search workflow links' }), {
      target: { value: '   ' },
    })
    await act(async () => vi.advanceTimersByTime(250))

    expect(listWorkflowLinksMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Stable route/ })).toBeInTheDocument()
  })

  it('deterministically reloads when a pending query returns to its committed value', async () => {
    listWorkflowLinksMock
      .mockResolvedValueOnce(page([summary(1, 'Initial route')]))
      .mockResolvedValueOnce(page([summary(2, 'Reloaded route')]))
    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Initial route/ })
    vi.useFakeTimers()

    const search = screen.getByRole('searchbox', { name: 'Search workflow links' })
    fireEvent.change(search, { target: { value: 'temporary' } })
    fireEvent.change(search, { target: { value: '' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })
    await act(async () => Promise.resolve())

    expect(screen.getByRole('button', { name: /Reloaded route/ })).toBeInTheDocument()
    expect(listWorkflowLinksMock).toHaveBeenLastCalledWith(
      { q: undefined, tag: undefined, limit: 50, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it('applies, combines, and clears an exact tag filter', async () => {
    const item = summary(1, 'Repository summary', { tags: ['n8n', 'local'] })
    listWorkflowLinksMock.mockResolvedValue(page([item]))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Repository summary/ })
    await user.click(screen.getByRole('button', { name: 'Filter by tag n8n' }))
    await screen.findByRole('button', { name: /Repository summary/ })
    await user.type(screen.getByRole('searchbox', { name: 'Search workflow links' }), 'summary')

    await waitFor(() =>
      expect(listWorkflowLinksMock).toHaveBeenLastCalledWith(
        { q: 'summary', tag: 'n8n', limit: 50, offset: 0 },
        expect.any(AbortSignal),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Clear tag filter n8n' }))
    await waitFor(() =>
      expect(listWorkflowLinksMock).toHaveBeenLastCalledWith(
        { q: 'summary', tag: undefined, limit: 50, offset: 0 },
        expect.any(AbortSignal),
      ),
    )
  })

  it('loads more, deduplicates by ID, and keeps the server total', async () => {
    const first = summary(2, 'Second')
    const refreshed = { ...first, title: 'Second refreshed' }
    const next = summary(1, 'First')
    listWorkflowLinksMock
      .mockResolvedValueOnce(page([first], 3, 1, 0))
      .mockResolvedValueOnce(page([refreshed, next], 3, 2, 1))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Second/ })
    await user.click(screen.getByRole('button', { name: 'Load more workflow links' }))

    expect(await screen.findByRole('button', { name: /Second refreshed/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /First/ })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
  })

  it('ignores stale searches and aborts their request ownership', async () => {
    vi.useFakeTimers()
    const oldRequest = deferred<WorkflowLinkListResponse>()
    const newRequest = deferred<WorkflowLinkListResponse>()
    listWorkflowLinksMock.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)

    render(<RegistryHarness />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search workflow links' }), {
      target: { value: 'new' },
    })
    expect(listWorkflowLinksMock.mock.calls[0]?.[1]?.aborted).toBe(true)

    await act(async () => oldRequest.resolve(page([summary(1, 'Stale route')])))
    expect(screen.queryByText('Stale route')).not.toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(250))
    await act(async () => newRequest.resolve(page([summary(2, 'Fresh route')])))
    expect(screen.getByRole('button', { name: /Fresh route/ })).toBeInTheDocument()
  })

  it('ignores a stale page after a replacement filter takes ownership', async () => {
    const nextPage = deferred<WorkflowLinkListResponse>()
    const filtered = deferred<WorkflowLinkListResponse>()
    const first = summary(2, 'First page', { tags: ['local'] })
    listWorkflowLinksMock
      .mockResolvedValueOnce(page([first], 2, 1, 0))
      .mockReturnValueOnce(nextPage.promise)
      .mockReturnValueOnce(filtered.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /First page/ })
    await user.click(screen.getByRole('button', { name: 'Load more workflow links' }))
    const pageSignal = listWorkflowLinksMock.mock.calls[1]?.[1]
    await user.click(screen.getByRole('button', { name: 'Filter by tag local' }))
    expect(pageSignal?.aborted).toBe(true)

    await act(async () => nextPage.resolve(page([summary(1, 'Stale page')], 2, 1, 1)))
    expect(screen.queryByText('Stale page')).not.toBeInTheDocument()
    await act(async () => filtered.resolve(page([summary(3, 'Filtered route', { tags: ['local'] })])))
    expect(screen.getByRole('button', { name: /Filtered route/ })).toBeInTheDocument()
  })

  it('ignores stale detail after a newer selection loads', async () => {
    const detailA = deferred<WorkflowLink>()
    const detailB = deferred<WorkflowLink>()
    const first = summary(1, 'Route A')
    const second = summary(2, 'Route B')
    listWorkflowLinksMock.mockResolvedValueOnce(page([first, second]))
    getWorkflowLinkMock.mockReturnValueOnce(detailA.promise).mockReturnValueOnce(detailB.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Route A/ })
    await user.click(screen.getByRole('button', { name: /Route B/ }))
    expect(getWorkflowLinkMock.mock.calls[0]?.[1]?.aborted).toBe(true)

    await act(async () => detailB.resolve(workflowLink(2, 'Route B')))
    expect(screen.getByText('Route B full local reference')).toBeInTheDocument()
    await act(async () => detailA.resolve(workflowLink(1, 'Route A')))
    expect(screen.queryByText('Route A full local reference')).not.toBeInTheDocument()
  })

  it('auto-selects on desktop only from true standby and never replaces a new draft', async () => {
    const firstPage = deferred<WorkflowLinkListResponse>()
    listWorkflowLinksMock.mockReturnValueOnce(firstPage.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(screen.getByRole('button', { name: 'New link' }))
    expect(screen.getByRole('heading', { name: 'New workflow link' })).toBeInTheDocument()

    await act(async () => firstPage.resolve(page([summary(1, 'Must remain unselected')])))
    expect(screen.getByRole('heading', { name: 'New workflow link' })).toBeInTheDocument()
    expect(getWorkflowLinkMock).not.toHaveBeenCalled()
  })

  it('does not auto-select on mobile', async () => {
    stubLayout(false)
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(1, 'Mobile route')]))

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Mobile route/ })

    expect(screen.getByText('Select a workflow link')).toBeInTheDocument()
    expect(getWorkflowLinkMock).not.toHaveBeenCalled()
  })

  it('moves mobile selection to the workbench and focuses the settled heading', async () => {
    stubLayout(false)
    const detail = deferred<WorkflowLink>()
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(1, 'Mobile focus route')]))
    getWorkflowLinkMock.mockReturnValueOnce(detail.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(await screen.findByRole('button', { name: /Mobile focus route/ }))
    const loadingHeading = screen.getByRole('heading', { name: 'Loading workflow link…' })
    expect(loadingHeading).toHaveFocus()

    await act(async () => detail.resolve(workflowLink(1, 'Mobile focus route')))
    expect(screen.getByRole('heading', { name: 'Mobile focus route' })).toHaveFocus()
  })

  it('does not auto-select when standby state has draft or pending-tag data', async () => {
    const firstPage = deferred<WorkflowLinkListResponse>()
    listWorkflowLinksMock.mockReturnValueOnce(firstPage.promise)
    const user = userEvent.setup()

    render(<StatefulRegistryHarness />)
    await user.click(screen.getByRole('button', { name: 'Change description' }))
    await user.click(screen.getByRole('button', { name: 'Set pending tag' }))
    await act(async () => firstPage.resolve(page([summary(1, 'Guarded route')])))

    expect(getWorkflowLinkMock).not.toHaveBeenCalled()
    expect(screen.getByText('Select a workflow link')).toBeInTheDocument()
  })

  it('preserves draft and pending-tag state across list invalidation and failure', async () => {
    const item = summary(1, 'Protected route', { tags: ['local'] })
    listWorkflowLinksMock
      .mockResolvedValueOnce(page([item]))
      .mockRejectedValueOnce(new Error('Filtered request failed'))
    getWorkflowLinkMock.mockResolvedValueOnce(workflowLink(1, 'Protected route'))
    const user = userEvent.setup()

    render(<StatefulRegistryHarness />)
    await waitFor(() =>
      expect(screen.getByTestId('draft-description')).toHaveTextContent(
        'Protected route full local reference',
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Change description' }))
    await user.click(screen.getByRole('button', { name: 'Set pending tag' }))
    await user.click(screen.getByRole('button', { name: 'Filter by tag local' }))

    expect(await screen.findByText('Filtered request failed')).toBeInTheDocument()
    expect(screen.getByTestId('draft-description')).toHaveTextContent('Unsaved description')
    expect(screen.getByTestId('pending-tag')).toHaveTextContent('pending route')
    expect(screen.getByRole('region', { name: 'Workflow link workbench' })).toHaveTextContent(
      'Protected route full local reference',
    )
  })

  it('renders semantic safe rows with origins, previews, tags, and timestamps', async () => {
    stubLayout(false)
    listWorkflowLinksMock.mockResolvedValueOnce(
      page([
        summary(1, 'Local route', {
          description: '',
          tags: ['n8n', 'local'],
          url: 'http://localhost:5678/workflow/one?token=hidden#node',
        }),
        summary(2, 'Remote route', {
          description: 'Build and release automation',
          tags: [],
          url: 'https://example.com:8443/path',
        }),
      ]),
    )

    render(<RegistryHarness />)
    const results = await screen.findByRole('list', { name: 'Workflow link results' })

    expect(results.querySelectorAll(':scope > li')).toHaveLength(2)
    expect(screen.getByText('http://localhost:5678')).toBeInTheDocument()
    expect(screen.getByText('https://example.com:8443')).toBeInTheDocument()
    expect(screen.getByText('No description recorded')).toBeInTheDocument()
    expect(screen.getByText('Build and release automation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter by tag n8n' })).toBeInTheDocument()
    expect(screen.getAllByRole('time')).toHaveLength(2)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('aborts list and detail requests on unmount', async () => {
    const listRequest = deferred<WorkflowLinkListResponse>()
    const detailRequest = deferred<WorkflowLink>()
    listWorkflowLinksMock.mockReturnValueOnce(listRequest.promise)

    const view = render(<RegistryHarness />)
    await waitFor(() => expect(listWorkflowLinksMock).toHaveBeenCalledTimes(1))
    const listSignal = listWorkflowLinksMock.mock.calls[0]?.[1]
    view.unmount()
    expect(listSignal?.aborted).toBe(true)

    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(1, 'Detail route')]))
    getWorkflowLinkMock.mockReturnValueOnce(detailRequest.promise)
    const secondView = render(<RegistryHarness />)
    await waitFor(() => expect(getWorkflowLinkMock).toHaveBeenCalledTimes(1))
    const detailSignal = getWorkflowLinkMock.mock.calls[0]?.[1]
    secondView.unmount()
    expect(detailSignal?.aborted).toBe(true)
  })

  it('aborts in-flight list and detail ownership when the registry is disabled', async () => {
    const listRequest = deferred<WorkflowLinkListResponse>()
    listWorkflowLinksMock.mockReturnValueOnce(listRequest.promise)

    const listView = render(<RegistryHarness />)
    await waitFor(() => expect(listWorkflowLinksMock).toHaveBeenCalledTimes(1))
    const listSignal = listWorkflowLinksMock.mock.calls[0]?.[1]
    listView.rerender(<RegistryHarness enabled={false} />)
    expect(listSignal?.aborted).toBe(true)

    await act(async () => listRequest.resolve(page([summary(1, 'Late disabled route')])))
    expect(screen.queryByText('Late disabled route')).not.toBeInTheDocument()
    listView.unmount()

    listWorkflowLinksMock.mockReset().mockResolvedValueOnce(
      page([summary(2, 'Detail disabled route')]),
    )
    const detailRequest = deferred<WorkflowLink>()
    getWorkflowLinkMock.mockReset().mockReturnValueOnce(detailRequest.promise)

    const detailView = render(<RegistryHarness />)
    await waitFor(() => expect(getWorkflowLinkMock).toHaveBeenCalledTimes(1))
    const detailSignal = getWorkflowLinkMock.mock.calls[0]?.[1]
    detailView.rerender(<RegistryHarness enabled={false} />)
    expect(detailSignal?.aborted).toBe(true)

    await act(async () => detailRequest.resolve(workflowLink(2, 'Late disabled detail')))
    expect(screen.queryByText('Late disabled detail full local reference')).not.toBeInTheDocument()
  })

  it('guards both draft edits and the pending-tag buffer', async () => {
    listWorkflowLinksMock.mockResolvedValue(page([]))
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    const user = userEvent.setup()

    render(<DirtyGuardHarness />)
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('clean')
    await user.click(screen.getByRole('button', { name: 'Change draft' }))
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('dirty')
    await user.click(screen.getByRole('button', { name: 'Guard' }))
    expect(confirm).toHaveBeenCalledWith('Discard unsaved workflow link changes?')
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('dirty')

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Guard' }))
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('clean')
    await user.click(screen.getByRole('button', { name: 'Buffer tag' }))
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('dirty')
  })
})
