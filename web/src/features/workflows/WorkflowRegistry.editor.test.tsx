import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackendHttpError } from '../../api/client'
import {
  createWorkflowLink,
  deleteWorkflowLink,
  getWorkflowLink,
  listWorkflowLinks,
  updateWorkflowLink,
  type WorkflowLink,
  type WorkflowLinkListResponse,
  type WorkflowLinkSummary,
} from '../../api/workflowLinks'
import { WorkflowRegistry } from './WorkflowRegistry'
import { useWorkflowRegistry } from './useWorkflowRegistry'

vi.mock('../../api/workflowLinks', () => ({
  createWorkflowLink: vi.fn(),
  deleteWorkflowLink: vi.fn(),
  getWorkflowLink: vi.fn(),
  listWorkflowLinks: vi.fn(),
  updateWorkflowLink: vi.fn(),
}))

const timestamp = '2026-07-12T12:30:00Z'

const workflowLink = (id: number, title: string): WorkflowLink => ({
  id,
  title,
  url: `http://localhost:5678/workflow/${id}`,
  description: `${title} full local reference`,
  tags: ['local'],
  created_at: timestamp,
  updated_at: timestamp,
})

const summary = (item: WorkflowLink): WorkflowLinkSummary => ({
  id: item.id,
  title: item.title,
  url: item.url,
  description_preview: item.description,
  tags: item.tags,
  created_at: item.created_at,
  updated_at: item.updated_at,
})

const page = (items: WorkflowLinkSummary[]): WorkflowLinkListResponse => ({
  items,
  total: items.length,
  limit: 50,
  offset: 0,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function RegistryHarness() {
  const controller = useWorkflowRegistry(true)
  return <WorkflowRegistry controller={controller} />
}

const listWorkflowLinksMock = vi.mocked(listWorkflowLinks)
const getWorkflowLinkMock = vi.mocked(getWorkflowLink)
const createWorkflowLinkMock = vi.mocked(createWorkflowLink)
const updateWorkflowLinkMock = vi.mocked(updateWorkflowLink)
const deleteWorkflowLinkMock = vi.mocked(deleteWorkflowLink)

function stubViewport(desktop: boolean) {
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
  listWorkflowLinksMock.mockReset().mockResolvedValue(page([]))
  getWorkflowLinkMock.mockReset()
  createWorkflowLinkMock.mockReset()
  updateWorkflowLinkMock.mockReset()
  deleteWorkflowLinkMock.mockReset().mockResolvedValue(undefined)
  stubViewport(true)
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Workflow Registry guarded mutations', () => {
  it('guards selection, New, mobile Back, and beforeunload without losing a canceled draft', async () => {
    stubViewport(false)
    const first = workflowLink(1, 'Route A')
    const second = workflowLink(2, 'Route B')
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(first), summary(second)]))
    getWorkflowLinkMock.mockImplementation((id) => Promise.resolve(id === 1 ? first : second))
    const confirmMock = vi.mocked(window.confirm).mockReturnValue(false)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const firstRow = await screen.findByRole('button', { name: /Route A/ })
    await user.click(firstRow)
    const description = await screen.findByDisplayValue(first.description)
    await user.type(description, ' dirty')

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: /Route B/ }))
    await user.click(screen.getByRole('button', { name: 'New link' }))
    await user.click(screen.getByRole('button', { name: '← Back to references' }))
    expect(confirmMock).toHaveBeenCalledTimes(3)
    expect(description).toHaveValue(`${first.description} dirty`)
    expect(document.querySelector('.registry-shell')).toHaveAttribute('data-mobile-pane', 'editor')

    confirmMock.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '← Back to references' }))
    expect(document.querySelector('.registry-shell')).toHaveAttribute('data-mobile-pane', 'list')
    await waitFor(() => expect(firstRow).toHaveFocus())
  })

  it('locks every abandonment path while a save is pending and never auto-retries', async () => {
    const pendingSave = deferred<WorkflowLink>()
    const saved = workflowLink(19, 'Pending save')
    createWorkflowLinkMock.mockReturnValueOnce(pendingSave.promise)
    listWorkflowLinksMock.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([summary(saved)]))
    const confirmMock = vi.mocked(window.confirm)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByText('No workflow links saved yet')
    await user.click(screen.getByRole('button', { name: 'New link' }))
    await user.type(screen.getByRole('textbox', { name: /Link title/i }), 'Pending save')
    await user.type(
      screen.getByRole('textbox', { name: /Destination URL/i }),
      'http://localhost:5678/workflow/19',
    )
    await user.click(screen.getByRole('button', { name: 'Save link' }))

    expect(screen.getByText('Saving locally…')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New link' }))
    await user.click(screen.getByRole('button', { name: '← Back to references' }))
    expect(confirmMock).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('Pending save')).toBeInTheDocument()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    await act(async () => pendingSave.resolve(saved))
    expect(await screen.findByText('Saved locally')).toBeInTheDocument()
    expect(createWorkflowLinkMock).toHaveBeenCalledOnce()
  })

  it('cancels and Escapes the title-bearing delete dialog without issuing DELETE', async () => {
    const target = workflowLink(4, 'Delete target')
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(target)]))
    getWorkflowLinkMock.mockResolvedValueOnce(target)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByDisplayValue(target.description)
    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    await user.click(deleteButton)
    expect(screen.getByRole('dialog', { name: 'Delete workflow link?' })).toHaveTextContent(target.title)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(deleteWorkflowLinkMock).not.toHaveBeenCalled()
    expect(deleteButton).toHaveFocus()

    await user.click(deleteButton)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(deleteWorkflowLinkMock).not.toHaveBeenCalled()
    expect(deleteButton).toHaveFocus()
  })

  it('deletes once, announces the title, and focuses the next adjacent row', async () => {
    stubViewport(false)
    const first = workflowLink(1, 'Delete first')
    const next = workflowLink(2, 'Keep next')
    listWorkflowLinksMock
      .mockResolvedValueOnce(page([summary(first), summary(next)]))
      .mockResolvedValueOnce(page([summary(next)]))
    getWorkflowLinkMock.mockResolvedValueOnce(first)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(await screen.findByRole('button', { name: /Delete first/ }))
    await screen.findByDisplayValue(first.description)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const confirm = screen.getByRole('button', { name: 'Delete workflow link' })
    await user.dblClick(confirm)

    await waitFor(() =>
      expect(deleteWorkflowLinkMock).toHaveBeenCalledWith(1, expect.any(AbortSignal)),
    )
    expect(deleteWorkflowLinkMock).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent('Delete first deleted from local registry')
    expect(document.querySelector('.registry-shell')).toHaveAttribute('data-mobile-pane', 'list')
    await waitFor(() => expect(screen.getByRole('button', { name: /Keep next/ })).toHaveFocus())
  })

  it.each([
    {
      label: 'previous row',
      items: [workflowLink(10, 'Keep previous'), workflowLink(11, 'Delete last')],
      targetId: 11,
      focusName: /Keep previous/,
    },
    {
      label: 'New link',
      items: [workflowLink(12, 'Delete only')],
      targetId: 12,
      focusName: 'New link',
    },
  ])('returns focus to $label when no next row exists', async ({ items, targetId, focusName }) => {
    stubViewport(false)
    const target = items.find((item) => item.id === targetId)
    if (target === undefined) throw new Error('test target is missing')
    const remaining = items.filter((item) => item.id !== targetId)
    listWorkflowLinksMock
      .mockResolvedValueOnce(page(items.map(summary)))
      .mockResolvedValueOnce(page(remaining.map(summary)))
    getWorkflowLinkMock.mockResolvedValueOnce(target)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(await screen.findByRole('button', { name: new RegExp(target.title) }))
    await screen.findByDisplayValue(target.description)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete workflow link' }))

    const focusTarget = await screen.findByRole('button', { name: focusName })
    await waitFor(() => expect(focusTarget).toHaveFocus())
  })

  it('aborts stale list ownership so a late completion cannot reintroduce a deleted row', async () => {
    const target = workflowLink(13, 'Do not resurrect')
    const staleFilter = deferred<WorkflowLinkListResponse>()
    const refreshedList = deferred<WorkflowLinkListResponse>()
    listWorkflowLinksMock
      .mockResolvedValueOnce(page([summary(target)]))
      .mockReturnValueOnce(staleFilter.promise)
      .mockReturnValueOnce(refreshedList.promise)
    getWorkflowLinkMock.mockResolvedValueOnce(target)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByDisplayValue(target.description)
    await user.type(screen.getByRole('searchbox', { name: 'Search workflow links' }), 'pending')
    await waitFor(() => expect(listWorkflowLinksMock).toHaveBeenCalledTimes(2))
    const staleSignal = listWorkflowLinksMock.mock.calls[1]?.[1]
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete workflow link' }))

    expect(
      await screen.findByText('Do not resurrect deleted from local registry'),
    ).toBeInTheDocument()
    expect(staleSignal?.aborted).toBe(true)
    await act(async () => staleFilter.resolve(page([summary(target)])))
    expect(screen.queryByRole('button', { name: /Do not resurrect/ })).not.toBeInTheDocument()

    await act(async () => refreshedList.resolve(page([])))
    expect(screen.queryByRole('button', { name: /Do not resurrect/ })).not.toBeInTheDocument()
  })

  it('locks Cancel and Escape while DELETE is pending, then preserves the record on failure', async () => {
    const target = workflowLink(5, 'Protected target')
    const pendingDelete = deferred<void>()
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(target)]))
    getWorkflowLinkMock.mockResolvedValueOnce(target)
    deleteWorkflowLinkMock.mockReturnValueOnce(pendingDelete.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByDisplayValue(target.description)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete workflow link' }))
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deleting link…' })).toBeDisabled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(dialog).toBeInTheDocument()

    await act(async () => pendingDelete.reject(new Error('Delete refused')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete refused')
    expect(screen.getByDisplayValue(target.description)).toBeInTheDocument()
    expect(listWorkflowLinksMock).toHaveBeenCalledTimes(1)
  })

  it('recovers a delete 404 to the directory with a fixed failure and no success claim', async () => {
    stubViewport(false)
    const target = workflowLink(6, 'Already removed')
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(target)])).mockResolvedValueOnce(page([]))
    getWorkflowLinkMock.mockResolvedValueOnce(target)
    deleteWorkflowLinkMock.mockRejectedValueOnce(new BackendHttpError(404))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(await screen.findByRole('button', { name: /Already removed/ }))
    await screen.findByDisplayValue(target.description)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete workflow link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Workflow link no longer exists; the directory was refreshed',
    )
    expect(screen.queryByText(/deleted from local registry/i)).not.toBeInTheDocument()
    expect(document.querySelector('.registry-shell')).toHaveAttribute('data-mobile-pane', 'list')
    await waitFor(() => expect(listWorkflowLinksMock).toHaveBeenCalledTimes(2))
  })

  it('preserves a complete dirty update after 404 until guarded recovery is confirmed', async () => {
    const target = workflowLink(7, 'Removed during edit')
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(target)])).mockResolvedValueOnce(page([]))
    getWorkflowLinkMock.mockResolvedValueOnce(target)
    updateWorkflowLinkMock.mockRejectedValueOnce(new BackendHttpError(404))
    const confirmMock = vi.mocked(window.confirm).mockReturnValue(false)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const title = await screen.findByDisplayValue(target.title)
    const url = screen.getByDisplayValue(target.url)
    const description = screen.getByDisplayValue(target.description)
    const tags = screen.getByRole('textbox', { name: 'Workflow link tags' })
    await user.clear(title)
    await user.type(title, 'Local title survives')
    await user.clear(url)
    await user.type(url, 'https://example.com/local-draft')
    await user.clear(description)
    await user.type(description, 'Local description survives')
    await user.type(tags, 'pending survives')
    await user.click(screen.getByRole('button', { name: 'Save link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend returned HTTP 404')
    await user.click(screen.getByRole('button', { name: 'Return to references' }))
    expect(confirmMock).toHaveBeenCalledWith('Discard unsaved workflow link changes?')
    expect(title).toHaveValue('Local title survives')
    expect(url).toHaveValue('https://example.com/local-draft')
    expect(description).toHaveValue('Local description survives')
    expect(tags).toHaveValue('pending survives')

    confirmMock.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Return to references' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Workflow link no longer exists; the directory was refreshed',
    )
  })

  it('focuses the new title and the settled selected heading on mobile', async () => {
    stubViewport(false)
    const target = workflowLink(8, 'Mobile route')
    const detail = deferred<WorkflowLink>()
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(target)]))
    getWorkflowLinkMock.mockReturnValueOnce(detail.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(screen.getByRole('button', { name: 'New link' }))
    expect(screen.getByRole('textbox', { name: /Link title/i })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '← Back to references' }))
    await user.click(await screen.findByRole('button', { name: /Mobile route/ }))
    expect(screen.getByRole('heading', { name: 'Loading workflow link…' })).toHaveFocus()
    await act(async () => detail.resolve(target))
    expect(screen.getByRole('heading', { name: target.title })).toHaveFocus()
  })

  it('ignores a late save completion after unmount', async () => {
    const pendingSave = deferred<WorkflowLink>()
    createWorkflowLinkMock.mockReturnValueOnce(pendingSave.promise)
    const user = userEvent.setup()
    const view = render(<RegistryHarness />)
    await screen.findByText('No workflow links saved yet')
    await user.click(screen.getByRole('button', { name: 'New link' }))
    await user.type(screen.getByRole('textbox', { name: /Link title/i }), 'Late save')
    await user.type(
      screen.getByRole('textbox', { name: /Destination URL/i }),
      'http://localhost:5678/late',
    )
    await user.click(screen.getByRole('button', { name: 'Save link' }))
    const signal = createWorkflowLinkMock.mock.calls[0]?.[1]

    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => pendingSave.resolve(workflowLink(77, 'Late save')))
    expect(document.body).not.toHaveTextContent('Saved locally')
  })

  it('ignores a late delete completion after unmount', async () => {
    const target = workflowLink(78, 'Late delete')
    const pendingDelete = deferred<void>()
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(target)]))
    getWorkflowLinkMock.mockResolvedValueOnce(target)
    deleteWorkflowLinkMock.mockReturnValueOnce(pendingDelete.promise)
    const user = userEvent.setup()
    const view = render(<RegistryHarness />)
    await screen.findByDisplayValue(target.description)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete workflow link' }))
    const signal = deleteWorkflowLinkMock.mock.calls[0]?.[1]

    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => pendingDelete.resolve())
    expect(document.body).not.toHaveTextContent('Late delete deleted from local registry')
  })
})
