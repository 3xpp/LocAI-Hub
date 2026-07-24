import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import App from './App'
import {
  getN8nStatus,
  type N8nStatusResponse,
} from './api/integrations'
import { listPrompts } from './api/prompts'
import {
  TransferHttpError,
  exportTransferBundle,
  importTransferBundle,
  previewTransferBundle,
  type TransferExportResult,
  type TransferImportResponse,
  type TransferPreviewResponse,
} from './api/transfer'
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

vi.mock('./api/integrations', () => ({
  getN8nStatus: vi.fn(),
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

vi.mock('./api/transfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/transfer')>()
  return {
    ...actual,
    exportTransferBundle: vi.fn(),
    importTransferBundle: vi.fn(),
    previewTransferBundle: vi.fn(),
  }
})

const listPromptsMock = vi.mocked(listPrompts)
const getN8nStatusMock = vi.mocked(getN8nStatus)
const listWorkflowLinksMock = vi.mocked(listWorkflowLinks)
const getWorkflowLinkMock = vi.mocked(getWorkflowLink)
const createWorkflowLinkMock = vi.mocked(createWorkflowLink)
const deleteWorkflowLinkMock = vi.mocked(deleteWorkflowLink)

const exportTransferBundleMock = vi.mocked(exportTransferBundle)
const previewTransferBundleMock = vi.mocked(previewTransferBundle)
const importTransferBundleMock = vi.mocked(importTransferBundle)
const timestamp = '2026-07-12T12:30:00Z'

const n8nUnconfigured: N8nStatusResponse = {
  state: 'unconfigured',
  base_url: null,
  liveness: 'not_checked',
  readiness: 'not_checked',
  error: null,
}

const n8nOnline: N8nStatusResponse = {
  state: 'online',
  base_url: 'http://n8n.test:5678',
  liveness: 'passed',
  readiness: 'passed',
  error: null,
}

const n8nDegraded: N8nStatusResponse = {
  state: 'degraded',
  base_url: 'http://n8n.test:5678',
  liveness: 'passed',
  readiness: 'failed',
  error: 'n8n is reachable but not ready',
}

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

const transferRaw =
  '{"application":"local-ai-workflow-hub","format_version":1,"exported_at":"2026-07-18T12:00:00Z","records":[]}'

const transferPreview: TransferPreviewResponse = {
  valid: true,
  importable: true,
  format_version: 1,
  counts: { total: 2, prompts: 1, workflow_links: 1 },
  duplicates: { total: 0, prompts: 0, workflow_links: 0 },
  warnings: [],
}

const emptyTransferPreview: TransferPreviewResponse = {
  valid: true,
  importable: false,
  format_version: 1,
  counts: { total: 0, prompts: 0, workflow_links: 0 },
  duplicates: { total: 0, prompts: 0, workflow_links: 0 },
  warnings: [
    {
      code: 'empty_bundle',
      message: 'This bundle contains no records and cannot be imported.',
    },
  ],
}

const transferImportResult: TransferImportResponse = {
  imported: { total: 2, prompts: 1, workflow_links: 1 },
  duplicates_imported: { total: 0, prompts: 0, workflow_links: 0 },
}

const transferExportResult: TransferExportResult = {
  bundle: {
    application: 'local-ai-workflow-hub',
    format_version: 1,
    exported_at: '2026-07-18T12:00:00Z',
    records: [],
  },
  rawJson: transferRaw,
  filename: 'local-ai-workflow-hub-20260718T120000Z.json',
  counts: { total: 0, prompts: 0, workflow_links: 0 },
}

function transferFile(filename = 'portable.json'): File {
  const bytes = new TextEncoder().encode(transferRaw)
  const file = new File([bytes], filename, { type: 'application/json' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn().mockResolvedValue(bytes.buffer),
  })
  return file
}

beforeEach(() => {
  getN8nStatusMock.mockReset().mockResolvedValue(n8nUnconfigured)
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
  exportTransferBundleMock.mockReset().mockResolvedValue(transferExportResult)
  previewTransferBundleMock.mockReset().mockResolvedValue(transferPreview)
  importTransferBundleMock.mockReset().mockResolvedValue(transferImportResult)
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

it('navigates among Overview, Prompts, Workflows, Transfer, and Integrations through one masthead', async () => {
  const user = userEvent.setup()
  render(<App />)

  expect(screen.getByRole('navigation', { name: 'Dashboard views' })).toBeInTheDocument()
  expect(getN8nStatusMock).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Workflows' }))
  expect(await screen.findByRole('heading', { name: 'Workflow links' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Prompts' }))
  expect(await screen.findByRole('heading', { name: 'Prompt registry' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Transfer' }))
  expect(await screen.findByRole('heading', { name: 'Data transfer' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Integrations' }))
  expect(await screen.findByRole('heading', { name: 'Integrations' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Overview' }))
  expect(screen.getByRole('heading', { name: /local stack/i })).toBeInTheDocument()
})

it.each(['Workflows', 'Transfer', 'Integrations'])(
  'keeps Prompts active when its dirty-state guard cancels %s navigation',
  async (target) => {
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Prompts' }))
    await screen.findByText('No prompts saved yet')
    await user.click(screen.getByRole('button', { name: 'New prompt' }))
    await user.type(screen.getByLabelText(/Prompt title/i), 'Unsaved prompt')
    await user.click(screen.getByRole('button', { name: target }))

    expect(confirm).toHaveBeenCalledWith('Discard unsaved prompt changes?')
    expect(
      screen.getByRole('heading', { name: 'Prompt registry' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Prompt title/i)).toHaveValue(
      'Unsaved prompt',
    )
    expect(listWorkflowLinksMock).not.toHaveBeenCalled()
    expect(getN8nStatusMock).not.toHaveBeenCalled()
  },
)

it.each(['Overview', 'Prompts', 'Transfer', 'Integrations'])(
  'keeps Workflows active when its dirty guard cancels %s navigation',
  async (target) => {
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

    expect(confirm).toHaveBeenCalledWith(
      'Discard unsaved workflow link changes?',
    )
    expect(
      screen.getByRole('heading', { name: 'Workflow links' }),
    ).toBeInTheDocument()
    expect(title).toHaveValue('Unsaved workflow link')
    expect(getN8nStatusMock).not.toHaveBeenCalled()
  },
)

it('blocks every other view while a workflow save is pending', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
  expect(screen.getByRole('heading', { name: 'Workflow links' })).toBeInTheDocument()
  expect(confirm).not.toHaveBeenCalled()
  expect(getN8nStatusMock).not.toHaveBeenCalled()
})

it('blocks every other view while workflow deletion is pending', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
  expect(screen.getByRole('heading', { name: 'Workflow links' })).toBeInTheDocument()
  expect(confirm).not.toHaveBeenCalled()
  expect(getN8nStatusMock).not.toHaveBeenCalled()
})

it('shows Phase 01 and enters Transfer without starting a request', async () => {
  const user = userEvent.setup()
  render(<App />)

  expect(screen.getByText('Phase 01')).toBeInTheDocument()
  const transferButton = screen.getByRole('button', { name: 'Transfer' })
  await user.click(transferButton)

  expect(await screen.findByRole('heading', { name: 'Data transfer' })).toBeInTheDocument()
  expect(transferButton).toHaveAttribute('aria-current', 'page')
  expect(exportTransferBundleMock).not.toHaveBeenCalled()
  expect(previewTransferBundleMock).not.toHaveBeenCalled()
  expect(importTransferBundleMock).not.toHaveBeenCalled()
})

it('keeps Prompts active when its dirty guard cancels Transfer navigation', async () => {
  const confirm = vi.fn().mockReturnValue(false)
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Prompts' }))
  await screen.findByText('No prompts saved yet')
  await user.click(screen.getByRole('button', { name: 'New prompt' }))
  await user.type(screen.getByLabelText(/Prompt title/i), 'Unsaved transfer target')
  await user.click(screen.getByRole('button', { name: 'Transfer' }))

  expect(confirm).toHaveBeenCalledWith('Discard unsaved prompt changes?')
  expect(screen.getByRole('heading', { name: 'Prompt registry' })).toBeInTheDocument()
  expect(previewTransferBundleMock).not.toHaveBeenCalled()
})

it.each(['Overview', 'Integrations'])(
  'keeps Transfer active when prepared-import discard is cancelled for %s navigation',
  async (target) => {
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Transfer' }))
    await user.upload(
      screen.getByLabelText('Select JSON bundle'),
      transferFile(),
    )
    expect(
      await screen.findByRole('button', { name: 'Import records' }),
    ).toBeEnabled()
    await user.click(screen.getByRole('button', { name: target }))

    expect(confirm).toHaveBeenCalledWith(
      'Discard prepared import and selected bundle?',
    )
    expect(
      screen.getByRole('heading', { name: 'Data transfer' }),
    ).toBeInTheDocument()
    expect(screen.getByText('portable.json')).toBeInTheDocument()
    expect(getN8nStatusMock).not.toHaveBeenCalled()
  },
)

it('discards a prepared bundle only after confirmation and then navigates', async () => {
  const confirm = vi.fn().mockReturnValue(true)
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Transfer' }))
  await user.upload(screen.getByLabelText('Select JSON bundle'), transferFile())
  expect(await screen.findByRole('button', { name: 'Import records' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Prompts' }))

  expect(confirm).toHaveBeenCalledWith('Discard prepared import and selected bundle?')
  expect(await screen.findByRole('heading', { name: 'Prompt registry' })).toBeInTheDocument()
})

it.each(['empty', 'invalid'])(
  'leaves Transfer without confirmation for an %s selection',
  async (outcome) => {
    if (outcome === 'empty') {
      previewTransferBundleMock.mockResolvedValueOnce(emptyTransferPreview)
    } else {
      previewTransferBundleMock.mockRejectedValueOnce(
        new TransferHttpError(422, {
          code: 'invalid_bundle',
          message: 'Bundle validation failed.',
          issues: [],
          issues_truncated: false,
        }),
      )
    }
    const confirm = vi.fn()
    vi.stubGlobal('confirm', confirm)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Transfer' }))
    await user.upload(screen.getByLabelText('Select JSON bundle'), transferFile())
    if (outcome === 'empty') {
      await screen.findByText('No records to import')
    } else {
      await screen.findByRole('alert', { name: 'Import preview failed' })
    }
    await user.click(screen.getByRole('button', { name: 'Overview' }))

    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /local stack/i })).toBeInTheDocument()
  },
)

it('blocks navigation without prompting while a preview is pending', async () => {
  const request = deferred<TransferPreviewResponse>()
  previewTransferBundleMock.mockReturnValueOnce(request.promise)
  const confirm = vi.fn()
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Transfer' }))
  await user.upload(screen.getByLabelText('Select JSON bundle'), transferFile())
  await screen.findByRole('status', { name: 'Preview pending' })
  fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))

  expect(confirm).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'Data transfer' })).toBeInTheDocument()
  expect(getN8nStatusMock).not.toHaveBeenCalled()
})

it('blocks navigation without prompting while export is pending', async () => {
  const request = deferred<TransferExportResult>()
  exportTransferBundleMock.mockReturnValueOnce(request.promise)
  const confirm = vi.fn()
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Transfer' }))
  await user.click(screen.getByRole('button', { name: 'Download JSON bundle' }))
  await screen.findByRole('status', { name: 'Export pending' })
  fireEvent.click(screen.getByRole('button', { name: 'Prompts' }))
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))

  expect(confirm).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'Data transfer' })).toBeInTheDocument()
  expect(getN8nStatusMock).not.toHaveBeenCalled()
})

it('blocks navigation and exposes no cancel while import is pending', async () => {
  const request = deferred<TransferImportResponse>()
  importTransferBundleMock.mockReturnValueOnce(request.promise)
  const confirm = vi.fn()
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Transfer' }))
  await user.upload(screen.getByLabelText('Select JSON bundle'), transferFile())
  await screen.findByRole('button', { name: 'Import records' })
  await user.click(screen.getByRole('button', { name: 'Import records' }))
  await user.click(screen.getByRole('button', { name: 'Confirm append-only import' }))
  await screen.findByRole('status', { name: 'Import pending' })
  fireEvent.click(screen.getByRole('button', { name: 'Workflows' }))
  fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))

  expect(confirm).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Data transfer' })).toBeInTheDocument()
  expect(getN8nStatusMock).not.toHaveBeenCalled()
})

it('starts one observation per Integrations entry and aborts on leave', async () => {
  const pending = deferred<N8nStatusResponse>()
  getN8nStatusMock.mockReturnValueOnce(pending.promise)
  const confirm = vi.fn()
  vi.stubGlobal('confirm', confirm)
  const user = userEvent.setup()
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  expect(getN8nStatusMock).not.toHaveBeenCalled()
  const integrationsButton = screen.getByRole('button', {
    name: 'Integrations',
  })
  await user.click(integrationsButton)
  await vi.waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(1))
  expect(integrationsButton).toHaveAttribute('aria-current', 'page')
  expect(
    screen.getAllByRole('button').filter((button) =>
      button.hasAttribute('aria-current'),
    ),
  ).toEqual([integrationsButton])
  const signal = getN8nStatusMock.mock.calls[0]?.[0]
  expect(signal?.aborted).toBe(false)

  const overviewButton = screen.getByRole('button', { name: 'Overview' })
  await user.click(overviewButton)
  expect(signal?.aborted).toBe(true)
  expect(confirm).not.toHaveBeenCalled()
  expect(overviewButton).toHaveAttribute('aria-current', 'page')

  await user.click(integrationsButton)
  await vi.waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(2))
  expect(integrationsButton).toHaveAttribute('aria-current', 'page')
})

it('keeps the newer Integrations observation after an earlier entry settles late', async () => {
  const earlier = deferred<N8nStatusResponse>()
  const newer = deferred<N8nStatusResponse>()
  getN8nStatusMock
    .mockReturnValueOnce(earlier.promise)
    .mockReturnValueOnce(newer.promise)
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Integrations' }))
  await vi.waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(1))
  await user.click(screen.getByRole('button', { name: 'Overview' }))
  await user.click(screen.getByRole('button', { name: 'Integrations' }))
  await vi.waitFor(() => expect(getN8nStatusMock).toHaveBeenCalledTimes(2))

  newer.resolve(n8nOnline)
  expect(
    await screen.findByText('Both fixed health checks passed.'),
  ).toBeInTheDocument()
  await act(async () => {
    earlier.resolve(n8nDegraded)
    await earlier.promise
  })
  expect(
    screen.getByText('Both fixed health checks passed.'),
  ).toBeInTheDocument()
  expect(
    screen.queryByText('Liveness passed, but readiness did not.'),
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Degraded')).not.toBeInTheDocument()
})

it('reloads both registries on entry after a successful import', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Prompts' }))
  await screen.findByText('No prompts saved yet')
  expect(listPromptsMock).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Workflows' }))
  await screen.findByText('No workflow links saved yet')
  expect(listWorkflowLinksMock).toHaveBeenCalledTimes(1)

  await user.click(screen.getByRole('button', { name: 'Transfer' }))
  await user.upload(screen.getByLabelText('Select JSON bundle'), transferFile())
  await screen.findByRole('button', { name: 'Import records' })
  await user.click(screen.getByRole('button', { name: 'Import records' }))
  await user.click(screen.getByRole('button', { name: 'Confirm append-only import' }))
  await screen.findByRole('status', { name: 'Import complete' })

  await user.click(screen.getByRole('button', { name: 'Prompts' }))
  await screen.findByRole('heading', { name: 'Prompt registry' })
  await vi.waitFor(() => expect(listPromptsMock).toHaveBeenCalledTimes(2))
  await user.click(screen.getByRole('button', { name: 'Workflows' }))
  await screen.findByRole('heading', { name: 'Workflow links' })
  await vi.waitFor(() => expect(listWorkflowLinksMock).toHaveBeenCalledTimes(2))
})
