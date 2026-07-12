import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import App from './App'
import { listPrompts } from './api/prompts'
import {
  createWorkflowLink,
  deleteWorkflowLink,
  getWorkflowLink,
  listWorkflowLinks,
  type WorkflowLink,
} from './api/workflowLinks'

vi.mock('./api/client', () => ({
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

vi.mock('./api/prompts', () => ({
  createPrompt: vi.fn(),
  deletePrompt: vi.fn(),
  getPrompt: vi.fn(),
  listPrompts: vi.fn(),
  updatePrompt: vi.fn(),
}))

vi.mock('./api/workflowLinks', () => ({
  createWorkflowLink: vi.fn(),
  deleteWorkflowLink: vi.fn(),
  getWorkflowLink: vi.fn(),
  listWorkflowLinks: vi.fn(),
  updateWorkflowLink: vi.fn(),
}))

const listPromptsMock = vi.mocked(listPrompts)
const listWorkflowLinksMock = vi.mocked(listWorkflowLinks)
const getWorkflowLinkMock = vi.mocked(getWorkflowLink)
const createWorkflowLinkMock = vi.mocked(createWorkflowLink)
const deleteWorkflowLinkMock = vi.mocked(deleteWorkflowLink)

const timestamp = '2026-07-12T12:30:00Z'

const workflowLink = (id: number, title: string): WorkflowLink => ({
  id,
  title,
  url: `http://localhost:5678/workflow/${id}`,
  description: `${title} description`,
  tags: ['local'],
  created_at: timestamp,
  updated_at: timestamp,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

beforeEach(() => {
  listPromptsMock.mockReset().mockResolvedValue({
    items: [],
    total: 0,
    limit: 50,
    offset: 0,
  })
  listWorkflowLinksMock.mockReset().mockResolvedValue({
    items: [],
    total: 0,
    limit: 50,
    offset: 0,
  })
  getWorkflowLinkMock.mockReset()
  createWorkflowLinkMock.mockReset()
  deleteWorkflowLinkMock.mockReset()
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
  vi.unstubAllGlobals()
})

it('navigates among Overview, Prompts, and Workflows through one masthead', async () => {
  const user = userEvent.setup()
  render(<App />)

  expect(screen.getByRole('navigation', { name: 'Dashboard views' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Workflows' }))
  expect(await screen.findByRole('heading', { name: 'Workflow links' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Prompts' }))
  expect(await screen.findByRole('heading', { name: 'Prompt registry' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Overview' }))
  expect(screen.getByRole('heading', { name: /local stack/i })).toBeInTheDocument()
})

it('keeps Prompts active when its dirty-state guard cancels Workflows navigation', async () => {
  const confirm = vi.fn().mockReturnValue(false)
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Prompts' }))
  await screen.findByText('No prompts saved yet')
  await user.click(screen.getByRole('button', { name: 'New prompt' }))
  await user.type(screen.getByLabelText(/Prompt title/i), 'Unsaved prompt')
  await user.click(screen.getByRole('button', { name: 'Workflows' }))

  expect(confirm).toHaveBeenCalledWith('Discard unsaved prompt changes?')
  expect(screen.getByRole('heading', { name: 'Prompt registry' })).toBeInTheDocument()
  expect(screen.getByLabelText(/Prompt title/i)).toHaveValue('Unsaved prompt')
  expect(listWorkflowLinksMock).not.toHaveBeenCalled()
})

it.each(['Overview', 'Prompts'])('keeps Workflows active when its dirty guard cancels %s navigation', async (target) => {
  const confirm = vi.fn().mockReturnValue(false)
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Workflows' }))
  await screen.findByText('No workflow links saved yet')
  await user.click(screen.getByRole('button', { name: 'New link' }))
  const title = screen.getByRole('textbox', { name: /Link title/i })
  await user.type(title, 'Unsaved workflow link')
  await user.click(screen.getByRole('button', { name: target }))

  expect(confirm).toHaveBeenCalledWith('Discard unsaved workflow link changes?')
  expect(screen.getByRole('heading', { name: 'Workflow links' })).toBeInTheDocument()
  expect(title).toHaveValue('Unsaved workflow link')
})

it('blocks Overview and Prompts while a workflow save is pending', async () => {
  const pendingSave = deferred<WorkflowLink>()
  createWorkflowLinkMock.mockReturnValueOnce(pendingSave.promise)
  const confirm = vi.fn()
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Workflows' }))
  await screen.findByText('No workflow links saved yet')
  await user.click(screen.getByRole('button', { name: 'New link' }))
  await user.type(screen.getByRole('textbox', { name: /Link title/i }), 'Pending navigation')
  await user.type(
    screen.getByRole('textbox', { name: /Destination URL/i }),
    'http://localhost:5678/pending-navigation',
  )
  await user.click(screen.getByRole('button', { name: 'Save link' }))
  expect(screen.getByText('Saving locally…')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Prompts' }))
  expect(screen.getByRole('heading', { name: 'Workflow links' })).toBeInTheDocument()
  expect(confirm).not.toHaveBeenCalled()
})

it('blocks Overview and Prompts while workflow deletion is pending', async () => {
  const target = workflowLink(4, 'Pending delete navigation')
  const pendingDelete = deferred<void>()
  listWorkflowLinksMock.mockResolvedValueOnce({
    items: [
      {
        id: target.id,
        title: target.title,
        url: target.url,
        description_preview: target.description,
        tags: target.tags,
        created_at: target.created_at,
        updated_at: target.updated_at,
      },
    ],
    total: 1,
    limit: 50,
    offset: 0,
  })
  getWorkflowLinkMock.mockResolvedValueOnce(target)
  deleteWorkflowLinkMock.mockReturnValueOnce(pendingDelete.promise)
  const confirm = vi.fn()
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Workflows' }))
  await screen.findByDisplayValue(target.description)
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  await user.click(screen.getByRole('button', { name: 'Delete workflow link' }))
  expect(screen.getByText('Deleting permanently…')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Prompts' }))
  expect(screen.getByRole('heading', { name: 'Workflow links' })).toBeInTheDocument()
  expect(confirm).not.toHaveBeenCalled()
})
