import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

import App from './App'
import { listPrompts } from './api/prompts'
import { listWorkflowLinks } from './api/workflowLinks'

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
  getWorkflowLink: vi.fn(),
  listWorkflowLinks: vi.fn(),
}))

const listPromptsMock = vi.mocked(listPrompts)
const listWorkflowLinksMock = vi.mocked(listWorkflowLinks)

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
