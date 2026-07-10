import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../App'
import {
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  updatePrompt,
  type Prompt,
  type PromptListResponse,
  type PromptSummary,
} from '../../api/prompts'
import { PromptRegistry } from './PromptRegistry'
import { usePromptRegistry } from './usePromptRegistry'

vi.mock('../../api/prompts', () => ({
  createPrompt: vi.fn(),
  deletePrompt: vi.fn(),
  getPrompt: vi.fn(),
  listPrompts: vi.fn(),
  updatePrompt: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  getHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    service: 'local-ai-workflow-hub',
    version: '0.1.0',
  }),
  getOllamaStatus: vi.fn().mockResolvedValue({
    online: false,
    base_url: 'http://localhost:11434',
    error: 'Connection failed',
  }),
  getOllamaModels: vi.fn().mockResolvedValue({ models: [], error: 'Connection failed' }),
}))

const timestamp = '2026-07-10T12:30:00Z'

const summary = (id: number, title: string, tags = ['code']): PromptSummary => ({
  id,
  title,
  content_preview: `${title} preview`,
  tags,
  created_at: timestamp,
  updated_at: timestamp,
})

const prompt = (id: number, title: string, content = `${title} full content`): Prompt => ({
  id,
  title,
  content,
  tags: ['code'],
  created_at: timestamp,
  updated_at: timestamp,
})

const page = (
  items: PromptSummary[],
  total = items.length,
  limit = 50,
  offset = 0,
): PromptListResponse => ({ items, total, limit, offset })

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
  const controller = usePromptRegistry(true)
  return <PromptRegistry controller={controller} />
}

const listPromptsMock = vi.mocked(listPrompts)
const getPromptMock = vi.mocked(getPrompt)
const createPromptMock = vi.mocked(createPrompt)
const updatePromptMock = vi.mocked(updatePrompt)
const deletePromptMock = vi.mocked(deletePrompt)

beforeEach(() => {
  listPromptsMock.mockReset()
  getPromptMock.mockReset()
  createPromptMock.mockReset()
  updatePromptMock.mockReset()
  deletePromptMock.mockReset()
  getPromptMock.mockImplementation((id) => Promise.resolve(prompt(id, `Prompt ${id}`)))
  createPromptMock.mockResolvedValue(prompt(10, 'Created prompt'))
  updatePromptMock.mockResolvedValue(prompt(1, 'Updated prompt'))
  deletePromptMock.mockResolvedValue(undefined)
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Prompt Registry list', () => {
  it('navigates from Overview, shows loading, renders the first page, and returns', async () => {
    const firstPage = deferred<PromptListResponse>()
    listPromptsMock.mockReturnValueOnce(firstPage.promise)
    const user = userEvent.setup()

    render(<App />)
    expect(screen.getByRole('heading', { name: /local stack/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Prompts' }))
    expect(screen.getByRole('status', { name: 'Loading prompts' })).toBeInTheDocument()

    firstPage.resolve(page([summary(1, 'Code review')]))
    expect(await screen.findByRole('button', { name: /Code review/ })).toBeInTheDocument()
    expect(await screen.findByText('Selected record')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(screen.getByRole('heading', { name: /local stack/i })).toBeInTheDocument()
  })

  it('distinguishes an empty registry from no matching results', async () => {
    listPromptsMock
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([], 0, 50, 0))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    expect(await screen.findByText('No prompts saved yet')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search prompts' }), 'missing')
    expect(await screen.findByText('No prompts match this view')).toBeInTheDocument()
  })

  it('debounces search by 250 ms', async () => {
    listPromptsMock.mockResolvedValue(page([]))
    render(<RegistryHarness />)
    await screen.findByText('No prompts saved yet')
    expect(listPromptsMock).toHaveBeenCalledTimes(1)
    vi.useFakeTimers()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search prompts' }), {
      target: { value: 'review' },
    })
    act(() => vi.advanceTimersByTime(249))
    expect(listPromptsMock).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTime(1))
    expect(listPromptsMock).toHaveBeenLastCalledWith(
      { q: 'review', tag: undefined, limit: 50, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it('keeps results stable when raw search whitespace does not change the filter', async () => {
    listPromptsMock.mockResolvedValueOnce(page([summary(1, 'Stable result')]))
    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Stable result/ })
    vi.useFakeTimers()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search prompts' }), {
      target: { value: '   ' },
    })
    await act(async () => vi.advanceTimersByTime(250))

    expect(listPromptsMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Stable result/ })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading prompts' })).not.toBeInTheDocument()
  })

  it('reloads when a pending search returns to the committed filter', async () => {
    listPromptsMock
      .mockResolvedValueOnce(page([summary(1, 'Initial result')]))
      .mockResolvedValueOnce(page([summary(2, 'Reloaded result')]))
    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Initial result/ })
    vi.useFakeTimers()

    const search = screen.getByRole('searchbox', { name: 'Search prompts' })
    fireEvent.change(search, { target: { value: 'a' } })
    fireEvent.change(search, { target: { value: '' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })
    await act(async () => Promise.resolve())

    expect(screen.getByRole('button', { name: /Reloaded result/ })).toBeInTheDocument()
    expect(listPromptsMock).toHaveBeenLastCalledWith(
      { q: undefined, tag: undefined, limit: 50, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it('applies an exact tag filter from a result chip', async () => {
    const tagged = summary(1, 'Code review', ['code', 'review'])
    listPromptsMock
      .mockResolvedValueOnce(page([tagged]))
      .mockResolvedValueOnce(page([tagged]))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Code review/ })
    await user.click(screen.getByRole('button', { name: 'Filter by tag review' }))

    await waitFor(() =>
      expect(listPromptsMock).toHaveBeenLastCalledWith(
        { q: undefined, tag: 'review', limit: 50, offset: 0 },
        expect.any(AbortSignal),
      ),
    )
    expect(screen.getByRole('button', { name: 'Clear tag filter review' })).toBeInTheDocument()
  })

  it('loads and deduplicates the next page', async () => {
    const first = summary(2, 'Second')
    const refreshed = { ...first, title: 'Second refreshed' }
    const next = summary(1, 'First')
    listPromptsMock
      .mockResolvedValueOnce(page([first], 2, 1, 0))
      .mockResolvedValueOnce(page([refreshed, next], 2, 1, 1))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Second/ })
    await user.click(screen.getByRole('button', { name: 'Load more prompts' }))

    expect(await screen.findByRole('button', { name: /Second refreshed/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /First/ })).toBeInTheDocument()
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
  })

  it('ignores a stale first-page completion after a newer search', async () => {
    vi.useFakeTimers()
    const oldRequest = deferred<PromptListResponse>()
    const newRequest = deferred<PromptListResponse>()
    listPromptsMock
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise)

    render(<RegistryHarness />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search prompts' }), {
      target: { value: 'new' },
    })
    expect(listPromptsMock.mock.calls[0]?.[1]?.aborted).toBe(true)

    await act(async () => oldRequest.resolve(page([summary(1, 'Stale result')])))
    expect(screen.queryByText('Stale result')).not.toBeInTheDocument()
    expect(screen.queryByText('Selected record')).not.toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(250))

    await act(async () => newRequest.resolve(page([summary(2, 'New result')])))
    expect(screen.getByRole('button', { name: /New result/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New result/ })).toBeInTheDocument()
  })

  it('cannot paginate stale rows after a replacement filter fails', async () => {
    const oldPage = summary(1, 'Old page', ['review'])
    listPromptsMock
      .mockResolvedValueOnce(page([oldPage], 2, 50, 0))
      .mockRejectedValueOnce(new Error('Filtered request failed'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Old page/ })
    expect(screen.getByRole('button', { name: 'Load more prompts' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Filter by tag review' }))
    expect(await screen.findByText('Filtered request failed')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /Old page/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more prompts' })).not.toBeInTheDocument()
  })

  it('shows a list error and retries without losing the view', async () => {
    listPromptsMock
      .mockRejectedValueOnce(new Error('Backend returned HTTP 503'))
      .mockResolvedValueOnce(page([summary(1, 'Recovered')]))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    expect(await screen.findByText('Backend returned HTTP 503')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry prompt list' }))
    expect(await screen.findByRole('button', { name: /Recovered/ })).toBeInTheDocument()
  })

  it('auto-selects only while the editor is safely empty', async () => {
    const firstPage = deferred<PromptListResponse>()
    listPromptsMock.mockReturnValueOnce(firstPage.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(screen.getByRole('button', { name: 'New prompt' }))
    expect(screen.getByRole('heading', { name: 'New prompt' })).toBeInTheDocument()

    await act(async () => firstPage.resolve(page([summary(1, 'Should not select')])))
    expect(screen.getByRole('heading', { name: 'New prompt' })).toBeInTheDocument()
    expect(screen.queryByText('Selected record')).not.toBeInTheDocument()
  })

  it('keeps mobile results in list mode until the operator selects one', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    listPromptsMock.mockResolvedValueOnce(page([summary(1, 'Mobile result')]))

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Mobile result/ })

    expect(screen.getByText('Select a prompt')).toBeInTheDocument()
    expect(screen.queryByText('Selected record')).not.toBeInTheDocument()
  })

  it('aborts the active list request when the registry unmounts', async () => {
    const pending = deferred<PromptListResponse>()
    listPromptsMock.mockReturnValueOnce(pending.promise)

    const view = render(<RegistryHarness />)
    await waitFor(() => expect(listPromptsMock).toHaveBeenCalledTimes(1))
    const signal = listPromptsMock.mock.calls[0]?.[1]

    view.unmount()

    expect(signal?.aborted).toBe(true)
  })
})
