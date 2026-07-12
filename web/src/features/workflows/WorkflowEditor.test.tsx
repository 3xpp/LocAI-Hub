import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const workflowLink = (
  id: number,
  title: string,
  {
    description = `${title} full local reference`,
    tags = ['local'],
    url = `http://localhost:5678/workflow/${id}`,
  }: { description?: string; tags?: string[]; url?: string } = {},
): WorkflowLink => ({
  id,
  title,
  url,
  description,
  tags,
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

async function openNewLink(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('No workflow links saved yet')
  await user.click(screen.getByRole('button', { name: 'New link' }))
  return {
    title: screen.getByRole('textbox', { name: /Link title/i }),
    url: screen.getByRole('textbox', { name: /Destination URL/i }),
    description: screen.getByRole('textbox', { name: /Description/i }),
    tags: screen.getByRole('textbox', { name: 'Workflow link tags' }),
  }
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
  vi.unstubAllGlobals()
})

describe('WorkflowEditor persistence and destination safety', () => {
  it('creates a valid draft with its pending canonical tag and adopts the complete response', async () => {
    const canonical = workflowLink(41, 'Canonical route', {
      url: 'http://127.0.0.1:5678/workflow/canonical',
      description: 'Canonical server description',
      tags: ['local ai'],
    })
    createWorkflowLinkMock.mockResolvedValueOnce(canonical)
    listWorkflowLinksMock.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([summary(canonical)]))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const fields = await openNewLink(user)

    expect(fields.title).toHaveFocus()
    expect(fields.url).toHaveAttribute('type', 'url')
    expect(fields.url).toHaveAttribute('inputmode', 'url')
    expect(fields.url).toHaveAttribute('autocapitalize', 'none')
    expect(fields.url).toHaveAttribute('autocorrect', 'off')
    expect(fields.url).toHaveAttribute('spellcheck', 'false')
    expect(screen.getByText('0/200')).toBeInTheDocument()
    expect(screen.getByText('0/2,048')).toBeInTheDocument()
    expect(screen.getByText('0/5,000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save link' })).toBeDisabled()

    await user.type(fields.title, '  Local helper  ')
    await user.type(fields.url, 'http://localhost:5678/workflow/draft')
    await user.type(fields.description, 'Draft description')
    await user.type(fields.tags, '  LOCAL   AI  ')
    await user.click(screen.getByRole('button', { name: 'Save link' }))

    await waitFor(() =>
      expect(createWorkflowLinkMock).toHaveBeenCalledWith(
        {
          title: '  Local helper  ',
          url: 'http://localhost:5678/workflow/draft',
          description: 'Draft description',
          tags: ['local ai'],
        },
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByDisplayValue('Canonical route')).toBeInTheDocument()
    expect(screen.getByDisplayValue(canonical.url)).toBeInTheDocument()
    expect(screen.getByDisplayValue(canonical.description)).toBeInTheDocument()
    expect(screen.getByText('Saved locally')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Canonical route/ })).toBeInTheDocument()
  })

  it('enforces required fields and code-point boundaries before Ctrl or Meta save', async () => {
    const canonical = workflowLink(10, 'Shortcut route', {
      description: '',
      tags: [],
      url: 'https://example.com/shortcut',
    })
    createWorkflowLinkMock.mockResolvedValueOnce(canonical)
    listWorkflowLinksMock.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([summary(canonical)]))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const fields = await openNewLink(user)

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(createWorkflowLinkMock).not.toHaveBeenCalled()
    expect(screen.getByText('A title is required.')).toBeInTheDocument()
    expect(screen.getByText('A destination URL is required.')).toBeInTheDocument()

    fireEvent.change(fields.title, { target: { value: `${'a'.repeat(199)}🤖` } })
    fireEvent.change(fields.url, { target: { value: 'https://example.com/shortcut' } })
    fireEvent.change(fields.description, { target: { value: `${'d'.repeat(4_999)}🤖` } })
    expect(screen.getByText('200/200')).toBeInTheDocument()
    expect(screen.getByText('5,000/5,000')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'S', metaKey: true })
    await waitFor(() => expect(createWorkflowLinkMock).toHaveBeenCalledOnce())
  })

  it('adopts the complete PUT response as draft, baseline, and visible list summary', async () => {
    const existing = workflowLink(7, 'Existing route', {
      description: 'Original description',
      url: 'http://localhost:5678/old',
    })
    const canonical = workflowLink(7, 'Server route title', {
      description: 'Server-normalized description',
      tags: ['updated'],
      url: 'https://example.com/server-route',
    })
    listWorkflowLinksMock
      .mockResolvedValueOnce(page([summary(existing)]))
      .mockResolvedValueOnce(page([summary(canonical)]))
    getWorkflowLinkMock.mockResolvedValueOnce(existing)
    updateWorkflowLinkMock.mockResolvedValueOnce(canonical)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const description = await screen.findByDisplayValue(existing.description)
    await user.clear(description)
    await user.type(description, 'Locally edited description')
    await user.click(screen.getByRole('button', { name: 'Save link' }))

    await waitFor(() =>
      expect(updateWorkflowLinkMock).toHaveBeenCalledWith(
        7,
        {
          title: existing.title,
          url: existing.url,
          description: 'Locally edited description',
          tags: existing.tags,
        },
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByDisplayValue(canonical.description)).toBeInTheDocument()
    expect(screen.getByDisplayValue(canonical.url)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Server route title/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save link' })).toBeDisabled()
  })

  it('aborts stale list ownership before a canonical save response is adopted', async () => {
    const staleList = deferred<WorkflowLinkListResponse>()
    const refreshedList = deferred<WorkflowLinkListResponse>()
    const canonical = workflowLink(81, 'Canonical adopted route', {
      description: 'Canonical response wins',
      tags: [],
      url: 'https://example.com/canonical-adopted',
    })
    listWorkflowLinksMock
      .mockReturnValueOnce(staleList.promise)
      .mockReturnValueOnce(refreshedList.promise)
    createWorkflowLinkMock.mockResolvedValueOnce(canonical)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(screen.getByRole('button', { name: 'New link' }))
    await user.type(screen.getByRole('textbox', { name: /Link title/i }), 'Local draft')
    await user.type(
      screen.getByRole('textbox', { name: /Destination URL/i }),
      'https://example.com/local-draft',
    )
    const staleSignal = listWorkflowLinksMock.mock.calls[0]?.[1]
    await user.click(screen.getByRole('button', { name: 'Save link' }))

    expect(await screen.findByDisplayValue(canonical.title)).toBeInTheDocument()
    expect(staleSignal?.aborted).toBe(true)
    await act(async () =>
      staleList.resolve(page([summary(workflowLink(99, 'Stale list overwrite'))])),
    )
    expect(screen.getByRole('button', { name: /Canonical adopted route/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stale list overwrite/ })).not.toBeInTheDocument()

    await act(async () => refreshedList.resolve(page([summary(canonical)])))
    expect(screen.getByRole('button', { name: /Canonical adopted route/ })).toBeInTheDocument()
  })

  it('preserves every field and the pending tag buffer after a save failure without retrying', async () => {
    createWorkflowLinkMock.mockRejectedValueOnce(new Error('Backend returned HTTP 503'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const fields = await openNewLink(user)
    await user.type(fields.title, 'Offline-safe route')
    await user.type(fields.url, 'http://localhost:5678/offline-safe')
    await user.type(fields.description, 'Do not lose this description')
    await user.type(fields.tags, 'committed{Enter}pending tag')
    await user.click(screen.getByRole('button', { name: 'Save link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend returned HTTP 503')
    expect(fields.title).toHaveValue('Offline-safe route')
    expect(fields.url).toHaveValue('http://localhost:5678/offline-safe')
    expect(fields.description).toHaveValue('Do not lose this description')
    expect(screen.getByText('committed')).toBeInTheDocument()
    expect(fields.tags).toHaveValue('pending tag')
    expect(createWorkflowLinkMock).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Save link' })).toBeEnabled()
  })

  it('reports clipboard failure without replacing or exposing the persisted URL draft', async () => {
    const persisted = workflowLink(11, 'Clipboard denied', {
      url: 'https://example.com/private-reference?opaque=value',
    })
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(persisted)]))
    getWorkflowLinkMock.mockResolvedValueOnce(persisted)
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('Denied'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const url = await screen.findByDisplayValue(persisted.url)
    await user.click(screen.getByRole('button', { name: 'Copy saved URL' }))

    expect(writeText).toHaveBeenCalledWith(persisted.url)
    expect(
      await screen.findByText('Copy failed; clipboard access was unavailable'),
    ).toBeInTheDocument()
    expect(url).toHaveValue(persisted.url)
  })

  it('renders only a safe persisted anchor and copies that exact URL while the draft differs', async () => {
    const persisted = workflowLink(3, 'Persisted destination', {
      url: 'http://127.0.0.1:43123/saved?token=local#step',
    })
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(persisted)]))
    getWorkflowLinkMock.mockResolvedValueOnce(persisted)
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const destinationFetch = vi.fn()
    vi.stubGlobal('fetch', destinationFetch)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const url = await screen.findByDisplayValue(persisted.url)
    const anchor = screen.getByRole('link', { name: /open saved link/i })
    expect(anchor).toHaveAttribute('href', persisted.url)
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(anchor).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
    expect(anchor).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(destinationFetch).not.toHaveBeenCalled()

    await user.clear(url)
    await user.type(url, 'https://example.com/unsaved')
    expect(screen.getByText(/open and copy still use the saved destination/i)).toBeInTheDocument()
    expect(anchor).toHaveAttribute('href', persisted.url)

    await user.click(screen.getByRole('button', { name: 'Copy saved URL' }))
    expect(writeText).toHaveBeenCalledWith(persisted.url)
    expect(await screen.findByText('Saved URL copied')).toBeInTheDocument()
    expect(destinationFetch).not.toHaveBeenCalled()
  })

  it('ignores a stale clipboard completion after selecting another record', async () => {
    const first = workflowLink(1, 'Route A')
    const second = workflowLink(2, 'Route B')
    const copy = deferred<void>()
    listWorkflowLinksMock.mockResolvedValueOnce(page([summary(first), summary(second)]))
    getWorkflowLinkMock.mockImplementation((id) => Promise.resolve(id === 1 ? first : second))
    vi.spyOn(navigator.clipboard, 'writeText').mockReturnValueOnce(copy.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByDisplayValue(first.url)
    await user.click(screen.getByRole('button', { name: 'Copy saved URL' }))
    await user.click(screen.getByRole('button', { name: /Route B/ }))
    await screen.findByDisplayValue(second.url)

    await act(async () => copy.resolve())
    expect(screen.queryByText('Saved URL copied')).not.toBeInTheDocument()
  })

  it('never dereferences stored destinations while selecting, searching, editing, or saving', async () => {
    const first = workflowLink(21, 'No request route A', {
      url: 'http://127.0.0.1:43124/target-a',
    })
    const second = workflowLink(22, 'No request route B', {
      url: 'http://127.0.0.1:43124/target-b',
    })
    const updated = { ...second, description: 'Updated without destination contact' }
    listWorkflowLinksMock.mockResolvedValue(page([summary(first), summary(second)]))
    getWorkflowLinkMock.mockImplementation((id) => Promise.resolve(id === first.id ? first : second))
    updateWorkflowLinkMock.mockResolvedValueOnce(updated)
    const destinationFetch = vi.fn()
    vi.stubGlobal('fetch', destinationFetch)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByDisplayValue(first.url)
    await user.click(screen.getByRole('button', { name: /No request route B/ }))
    const description = await screen.findByDisplayValue(second.description)
    await user.type(screen.getByRole('searchbox', { name: 'Search workflow links' }), 'route')
    await waitFor(() => expect(listWorkflowLinksMock).toHaveBeenCalledTimes(2))
    await user.clear(description)
    await user.type(description, updated.description)
    await user.click(screen.getByRole('button', { name: 'Save link' }))
    await screen.findByDisplayValue(updated.description)

    expect(destinationFetch).not.toHaveBeenCalled()
  })

  it('never creates Open or Copy controls for a new or unsafe stored destination', async () => {
    const user = userEvent.setup()
    const unsafe = workflowLink(9, 'Unsafe legacy route', { url: 'javascript:alert(1)' })

    const newView = render(<RegistryHarness />)
    await openNewLink(user)
    await user.type(screen.getByRole('textbox', { name: /Destination URL/i }), 'https://example.com')
    expect(screen.queryByRole('link', { name: /open saved link/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy saved URL' })).not.toBeInTheDocument()
    newView.unmount()

    listWorkflowLinksMock.mockReset().mockResolvedValueOnce(page([summary(unsafe)]))
    getWorkflowLinkMock.mockResolvedValueOnce(unsafe)
    render(<RegistryHarness />)
    await screen.findByDisplayValue(unsafe.url)
    expect(screen.queryByRole('link', { name: /open saved link/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy saved URL' })).not.toBeInTheDocument()
  })
})
