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

const prompt = (
  id: number,
  title: string,
  content = `${title} full content`,
  tags = ['code'],
): Prompt => ({
  id,
  title,
  content,
  tags,
  created_at: timestamp,
  updated_at: timestamp,
})

const page = (items: PromptSummary[], total = items.length): PromptListResponse => ({
  items,
  total,
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
  const controller = usePromptRegistry(true)
  return <PromptRegistry controller={controller} />
}

const listPromptsMock = vi.mocked(listPrompts)
const getPromptMock = vi.mocked(getPrompt)
const createPromptMock = vi.mocked(createPrompt)
const updatePromptMock = vi.mocked(updatePrompt)
const deletePromptMock = vi.mocked(deletePrompt)

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

async function openNewPrompt(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('No prompts saved yet')
  await user.click(screen.getByRole('button', { name: 'New prompt' }))
  return {
    title: screen.getByRole('textbox', { name: /Prompt title/ }),
    content: screen.getByRole('textbox', { name: /Prompt content/ }),
    tags: screen.getByRole('textbox', { name: 'Prompt tags' }),
  }
}

beforeEach(() => {
  listPromptsMock.mockReset()
  getPromptMock.mockReset()
  createPromptMock.mockReset()
  updatePromptMock.mockReset()
  deletePromptMock.mockReset()

  listPromptsMock.mockResolvedValue(page([]))
  getPromptMock.mockImplementation((id) => Promise.resolve(prompt(id, `Prompt ${id}`)))
  createPromptMock.mockResolvedValue(prompt(10, 'Created prompt'))
  updatePromptMock.mockImplementation((id) =>
    Promise.resolve(prompt(id, `Updated prompt ${id}`)),
  )
  deletePromptMock.mockResolvedValue(undefined)
  stubViewport(true)
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Prompt Registry editor integration', () => {
  it('focuses a new title and creates with a canonical pending tag before adopting the response', async () => {
    const canonical = prompt(
      41,
      'Canonical server title',
      'Canonical server content',
      ['local ai'],
    )
    createPromptMock.mockResolvedValueOnce(canonical)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const fields = await openNewPrompt(user)

    expect(fields.title).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Save prompt' })).toBeDisabled()

    await user.type(fields.title, '  Local helper  ')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await user.type(fields.content, 'Draft content')
    await user.type(fields.tags, '  LOCAL   AI  ')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save prompt' }))

    await waitFor(() =>
      expect(createPromptMock).toHaveBeenCalledWith(
        {
          title: '  Local helper  ',
          content: 'Draft content',
          tags: ['local ai'],
        },
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByDisplayValue('Canonical server title')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Canonical server content')).toBeInTheDocument()
    expect(screen.getByText('local ai')).toBeInTheDocument()
    expect(screen.getByText('Saved locally')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save prompt' })).toBeDisabled()
  })

  it('loads a selected record and adopts the canonical update response', async () => {
    const existing = prompt(7, 'Existing prompt', 'Original body', ['review'])
    const canonical = prompt(7, 'Existing prompt', 'Server-normalized body', ['review'])
    listPromptsMock.mockResolvedValue(page([summary(7, existing.title, existing.tags)]))
    getPromptMock.mockResolvedValueOnce(existing)
    updatePromptMock.mockResolvedValueOnce(canonical)
    const user = userEvent.setup()

    render(<RegistryHarness />)

    const content = await screen.findByDisplayValue('Original body')
    expect(getPromptMock).toHaveBeenCalledWith(7, expect.any(AbortSignal))
    await user.clear(content)
    await user.type(content, 'Locally edited body')
    await user.click(screen.getByRole('button', { name: 'Save prompt' }))

    await waitFor(() =>
      expect(updatePromptMock).toHaveBeenCalledWith(
        7,
        { title: 'Existing prompt', content: 'Locally edited body', tags: ['review'] },
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByDisplayValue('Server-normalized body')).toBeInTheDocument()
    expect(screen.getByText('Saved locally')).toBeInTheDocument()
  })

  it('preserves a dirty draft and allows retry after a save failure', async () => {
    createPromptMock.mockRejectedValueOnce(new Error('Backend returned HTTP 503'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const fields = await openNewPrompt(user)
    await user.type(fields.title, 'Offline-safe draft')
    await user.type(fields.content, 'Do not lose this text')
    await user.click(screen.getByRole('button', { name: 'Save prompt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend returned HTTP 503')
    expect(fields.title).toHaveValue('Offline-safe draft')
    expect(fields.content).toHaveValue('Do not lose this text')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save prompt' })).toBeEnabled()
  })

  it('preserves a dirty selection and offers registry recovery after update 404', async () => {
    listPromptsMock.mockResolvedValue(page([summary(14, 'Removed during edit')]))
    getPromptMock.mockResolvedValueOnce(prompt(14, 'Removed during edit', 'Original text'))
    updatePromptMock.mockRejectedValueOnce(new Error('Backend returned HTTP 404'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const content = await screen.findByDisplayValue('Original text')
    await user.clear(content)
    await user.type(content, 'Keep this local draft')
    await user.click(screen.getByRole('button', { name: 'Save prompt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend returned HTTP 404')
    expect(content).toHaveValue('Keep this local draft')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    const recover = screen.getByRole('button', { name: 'Return to registry' })
    expect(recover).toBeInTheDocument()

    await user.click(recover)
    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved prompt changes?')
    expect(await screen.findByText('Select a prompt')).toBeInTheDocument()
  })

  it('runs Ctrl+S and Meta+S only for valid dirty drafts', async () => {
    createPromptMock.mockResolvedValueOnce(prompt(10, 'Shortcut draft', 'Shortcut body', []))
    updatePromptMock.mockResolvedValueOnce(prompt(10, 'Shortcut draft', 'Updated by Meta', []))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const fields = await openNewPrompt(user)
    await user.type(fields.title, 'Shortcut draft')

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(createPromptMock).not.toHaveBeenCalled()

    await user.type(fields.content, 'Shortcut body')
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await waitFor(() => expect(createPromptMock).toHaveBeenCalledOnce())
    expect(await screen.findByText('Saved locally')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 's', metaKey: true })
    expect(updatePromptMock).not.toHaveBeenCalled()

    const content = screen.getByRole('textbox', { name: /Prompt content/ })
    await user.clear(content)
    await user.type(content, 'Updated by Meta')
    fireEvent.keyDown(window, { key: 'S', metaKey: true })
    await waitFor(() => expect(updatePromptMock).toHaveBeenCalledOnce())
  })

  it('copies the exact prompt content and reports clipboard failure without mutating it', async () => {
    const exactContent = '  Preserve leading space\n\nAnd trailing space  '
    listPromptsMock.mockResolvedValue(page([summary(3, 'Clipboard prompt')]))
    getPromptMock.mockResolvedValueOnce(prompt(3, 'Clipboard prompt', exactContent))
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)

    render(<RegistryHarness />)
    const content = await screen.findByRole('textbox', { name: /Prompt content/ })
    expect(content).toHaveValue(exactContent)

    await user.click(screen.getByRole('button', { name: 'Copy content' }))
    expect(writeText).toHaveBeenCalledWith(exactContent)
    expect(screen.getByText('Prompt content copied')).toBeInTheDocument()

    writeText.mockRejectedValueOnce(new Error('Denied'))
    await user.click(screen.getByRole('button', { name: 'Copy content' }))
    expect(await screen.findByText('Copy failed; clipboard access was unavailable')).toBeInTheDocument()
    expect(content).toHaveValue(exactContent)
  })

  it('guards selection and New with cancel, then discards only after acceptance', async () => {
    const first = prompt(1, 'First prompt', 'First body')
    const second = prompt(2, 'Second prompt', 'Second body')
    listPromptsMock.mockResolvedValue(
      page([summary(1, first.title), summary(2, second.title)]),
    )
    getPromptMock.mockImplementation((id) => Promise.resolve(id === 1 ? first : second))
    const confirmMock = vi.mocked(window.confirm)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const title = await screen.findByDisplayValue('First prompt')
    await user.clear(title)
    await user.type(title, 'Dirty first prompt')

    confirmMock.mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: /Second prompt/ }))
    await user.click(screen.getByRole('button', { name: 'New prompt' }))
    expect(screen.getByDisplayValue('Dirty first prompt')).toBeInTheDocument()
    expect(getPromptMock).toHaveBeenCalledTimes(1)

    confirmMock.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: /Second prompt/ }))
    expect(await screen.findByDisplayValue('Second prompt')).toBeInTheDocument()

    const secondContent = screen.getByRole('textbox', { name: /Prompt content/ })
    await user.type(secondContent, ' dirty')
    await user.click(screen.getByRole('button', { name: 'New prompt' }))
    expect(screen.getByRole('heading', { name: 'New prompt' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Prompt title/ })).toHaveValue('')
  })

  it('guards App navigation to Overview while a prompt is dirty', async () => {
    const confirmMock = vi.mocked(window.confirm)
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Prompts' }))
    const fields = await openNewPrompt(user)
    await user.type(fields.title, 'Stay on this draft')

    confirmMock.mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(screen.getByRole('heading', { name: 'Prompt registry' })).toBeInTheDocument()
    expect(fields.title).toHaveValue('Stay on this draft')

    confirmMock.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(screen.getByRole('heading', { name: /Local stack/ })).toBeInTheDocument()
  })

  it('registers beforeunload only while dirty and removes it after save', async () => {
    createPromptMock.mockResolvedValueOnce(prompt(13, 'Unload draft', 'Unload body', ['local']))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByText('No prompts saved yet')
    const initiallyClean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(initiallyClean)
    expect(initiallyClean.defaultPrevented).toBe(false)

    const fields = await openNewPrompt(user)
    await user.type(fields.title, 'Unload draft')
    await user.type(fields.content, 'Unload body')
    await user.type(fields.tags, 'LOCAL')
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Save prompt' }))
    await screen.findByText('Saved locally')
    const savedEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(savedEvent)
    expect(savedEvent.defaultPrevented).toBe(false)
  })

  it('protects a visible whitespace-only tag buffer as invalid unsaved work', async () => {
    stubViewport(false)
    const confirmMock = vi.mocked(window.confirm).mockReturnValue(false)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const fields = await openNewPrompt(user)
    await user.type(fields.tags, '   ')

    expect(screen.getByText('Enter a tag first')).toBeInTheDocument()
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: '← Back to registry' }))
    expect(confirmMock).toHaveBeenCalledWith('Discard unsaved prompt changes?')
    expect(document.querySelector('.registry-shell')).toHaveAttribute('data-mobile-pane', 'editor')
    expect(fields.tags).toHaveValue('   ')
  })

  it('focuses the visible mobile loading heading while prompt detail is pending', async () => {
    stubViewport(false)
    const pending = deferred<Prompt>()
    listPromptsMock.mockResolvedValue(page([summary(8, 'Slow prompt')]))
    getPromptMock.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(await screen.findByRole('button', { name: /Slow prompt/ }))

    const heading = await screen.findByRole('heading', { name: 'Loading prompt…' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('ignores stale detail A after B has loaded', async () => {
    stubViewport(false)
    const detailA = deferred<Prompt>()
    const detailB = deferred<Prompt>()
    listPromptsMock.mockResolvedValue(
      page([summary(1, 'Prompt A'), summary(2, 'Prompt B')]),
    )
    getPromptMock
      .mockReturnValueOnce(detailA.promise)
      .mockReturnValueOnce(detailB.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByRole('button', { name: /Prompt A/ })
    await user.click(screen.getByRole('button', { name: /Prompt A/ }))
    expect(screen.getByRole('status', { name: 'Loading prompt detail' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Prompt B/ }))
    expect(getPromptMock.mock.calls[0]?.[1]?.aborted).toBe(true)

    await act(async () => detailB.resolve(prompt(2, 'Prompt B', 'Fresh B body')))
    expect(screen.getByDisplayValue('Fresh B body')).toBeInTheDocument()

    await act(async () => detailA.resolve(prompt(1, 'Prompt A', 'Stale A body')))
    expect(screen.getByDisplayValue('Fresh B body')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Stale A body')).not.toBeInTheDocument()
  })

  it('does not publish a late clipboard result into a different prompt', async () => {
    stubViewport(false)
    const copyA = deferred<void>()
    const first = prompt(1, 'Prompt A', 'Private A body')
    const second = prompt(2, 'Prompt B', 'Public B body')
    listPromptsMock.mockResolvedValue(page([summary(1, first.title), summary(2, second.title)]))
    getPromptMock.mockImplementation((id) => Promise.resolve(id === 1 ? first : second))
    vi.spyOn(navigator.clipboard, 'writeText').mockReturnValueOnce(copyA.promise)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(await screen.findByRole('button', { name: /Prompt A/ }))
    await screen.findByDisplayValue('Private A body')
    await user.click(screen.getByRole('button', { name: 'Copy content' }))
    await user.click(screen.getByRole('button', { name: /Prompt B/ }))
    await screen.findByDisplayValue('Public B body')

    await act(async () => copyA.resolve())
    expect(screen.queryByText('Prompt content copied')).not.toBeInTheDocument()
  })

  it('recovers from a missing detail and refreshes the registry', async () => {
    stubViewport(false)
    listPromptsMock.mockResolvedValue(page([summary(9, 'Removed elsewhere')]))
    getPromptMock.mockRejectedValueOnce(new Error('Backend returned HTTP 404'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(await screen.findByRole('button', { name: /Removed elsewhere/ }))
    expect(await screen.findByText('Prompt could not be opened')).toBeInTheDocument()
    expect(screen.getByText('Backend returned HTTP 404')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Return to registry' }))
    await waitFor(() => expect(listPromptsMock).toHaveBeenCalledTimes(2))
    expect(document.querySelector('.registry-shell')).toHaveAttribute('data-mobile-pane', 'list')
    expect(screen.getByRole('button', { name: 'New prompt' })).toHaveFocus()
  })

  it('cancels deletion without a request and deletes only after explicit confirmation', async () => {
    listPromptsMock.mockResolvedValue(page([summary(4, 'Delete target')]))
    getPromptMock.mockResolvedValueOnce(prompt(4, 'Delete target', 'Keep until confirmed'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByDisplayValue('Keep until confirmed')
    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    await user.click(deleteButton)
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete target')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(deletePromptMock).not.toHaveBeenCalled()
    expect(deleteButton).toHaveFocus()

    await user.click(deleteButton)
    await user.click(screen.getByRole('button', { name: 'Delete prompt' }))
    await waitFor(() =>
      expect(deletePromptMock).toHaveBeenCalledWith(4, expect.any(AbortSignal)),
    )
    expect(await screen.findByText('Select a prompt')).toBeInTheDocument()
    await waitFor(() => expect(listPromptsMock).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toHaveTextContent('Prompt deleted from local registry')
    await waitFor(() => expect(screen.getByRole('button', { name: 'New prompt' })).toHaveFocus())
  })

  it('preserves the selected prompt and reports a failed deletion', async () => {
    listPromptsMock.mockResolvedValue(page([summary(5, 'Protected target')]))
    getPromptMock.mockResolvedValueOnce(prompt(5, 'Protected target', 'Must remain'))
    deletePromptMock.mockRejectedValueOnce(new Error('Delete refused'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await screen.findByDisplayValue('Must remain')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete prompt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Delete refused')
    expect(screen.getByDisplayValue('Must remain')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(listPromptsMock).toHaveBeenCalledTimes(1)
  })

  it('guards mobile Back and restores focus to the selected row after acceptance', async () => {
    stubViewport(false)
    listPromptsMock.mockResolvedValue(page([summary(6, 'Mobile prompt')]))
    getPromptMock.mockResolvedValueOnce(prompt(6, 'Mobile prompt', 'Mobile body'))
    const confirmMock = vi.mocked(window.confirm)
    const user = userEvent.setup()

    render(<RegistryHarness />)
    const row = await screen.findByRole('button', { name: /Mobile prompt/ })
    await user.click(row)
    const content = await screen.findByDisplayValue('Mobile body')
    await user.type(content, ' dirty')

    confirmMock.mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: '← Back to registry' }))
    expect(document.querySelector('.registry-shell')).toHaveAttribute('data-mobile-pane', 'editor')
    expect(content).toHaveValue('Mobile body dirty')

    confirmMock.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: '← Back to registry' }))
    expect(document.querySelector('.registry-shell')).toHaveAttribute('data-mobile-pane', 'list')
    await waitFor(() => expect(row).toHaveFocus())
  })

  it('falls back to New when mobile Back cannot restore a filtered-out row', async () => {
    stubViewport(false)
    listPromptsMock
      .mockResolvedValueOnce(page([summary(12, 'Filtered prompt')]))
      .mockResolvedValueOnce(page([]))
    getPromptMock.mockResolvedValueOnce(prompt(12, 'Filtered prompt', 'Original body'))
    updatePromptMock.mockResolvedValueOnce(prompt(12, 'Filtered prompt', 'Updated body'))
    const user = userEvent.setup()

    render(<RegistryHarness />)
    await user.click(await screen.findByRole('button', { name: /Filtered prompt/ }))
    const content = await screen.findByDisplayValue('Original body')
    await user.clear(content)
    await user.type(content, 'Updated body')
    await user.click(screen.getByRole('button', { name: 'Save prompt' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Filtered prompt/ })).toBeNull())

    await user.click(screen.getByRole('button', { name: '← Back to registry' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'New prompt' })).toHaveFocus())
  })
})
