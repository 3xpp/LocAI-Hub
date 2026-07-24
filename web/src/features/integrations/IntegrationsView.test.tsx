import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { N8nStatusResponse } from '../../api/integrations'
import { IntegrationsView } from './IntegrationsView'
import type { IntegrationsController } from './useIntegrations'

const online: N8nStatusResponse = {
  state: 'online',
  base_url: 'http://n8n.test:5678',
  liveness: 'passed',
  readiness: 'passed',
  error: null,
}

const makeController = (
  overrides: Partial<IntegrationsController> = {},
): IntegrationsController => ({
  observation: null,
  requestStatus: 'idle',
  pending: false,
  error: null,
  stale: false,
  lastChecked: null,
  refreshN8n: vi.fn(),
  ...overrides,
})

const politeRegion = (container: HTMLElement) => {
  const region = container.querySelector<HTMLElement>(
    '[aria-live="polite"][aria-atomic="true"]',
  )
  if (region === null) throw new Error('Polite live region is missing')
  return region
}

describe('IntegrationsView', () => {
  it('renders an inert initial loading state without moving focus', () => {
    const { container } = render(
      <IntegrationsView
        controller={makeController({
          requestStatus: 'loading',
          pending: true,
        })}
      />,
    )

    expect(screen.getAllByText('Checking n8n')).toHaveLength(2)
    const button = screen.getByRole('button', { name: 'Checking n8n' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByText('Online')).not.toBeInTheDocument()
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(document.body)
    expect(politeRegion(container)).toHaveTextContent('')
  })

  it('uses time semantics only after an observation has a checked time', () => {
    const initial = makeController()
    const checkedAt = new Date('2026-07-24T10:11:12.000Z')
    const { container, rerender } = render(
      <IntegrationsView controller={initial} />,
    )

    expect(screen.getByText('Not yet')).toHaveClass(
      'integrations-toolbar__checked',
    )
    expect(container.querySelector('time')).toBeNull()

    rerender(
      <IntegrationsView
        controller={{
          ...initial,
          observation: online,
          lastChecked: checkedAt,
        }}
      />,
    )

    const time = container.querySelector('time')
    expect(time).not.toBeNull()
    expect(time).toHaveClass('integrations-toolbar__checked')
    expect(time).toHaveAttribute('dateTime', checkedAt.toISOString())
  })

  it('renders unconfigured guidance without setup or credential controls', () => {
    const unconfigured: N8nStatusResponse = {
      state: 'unconfigured',
      base_url: null,
      liveness: 'not_checked',
      readiness: 'not_checked',
      error: null,
    }
    const { container } = render(
      <IntegrationsView
        controller={makeController({ observation: unconfigured })}
      />,
    )

    expect(screen.getAllByText('Not configured')).toHaveLength(2)
    expect(screen.getAllByText('Not checked')).toHaveLength(2)
    expect(
      screen.getByText(
        'Set N8N_BASE_URL in the API process environment, then restart the API.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /clipboard|copy/i }),
    ).not.toBeInTheDocument()
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByText(/credential copy/i)).not.toBeInTheDocument()
  })

  it.each([
    [
      'Online',
      online,
      'Both fixed health checks passed.',
      ['Passed', 'Passed'],
      null,
    ],
    [
      'Degraded',
      {
        state: 'degraded',
        base_url: 'http://n8n.test:5678',
        liveness: 'passed',
        readiness: 'failed',
        error: 'n8n is reachable but not ready',
      } satisfies N8nStatusResponse,
      'Liveness passed, but readiness did not.',
      ['Passed', 'Failed'],
      'n8n is reachable but not ready',
    ],
    [
      'Offline',
      {
        state: 'offline',
        base_url: 'http://n8n.test:5678',
        liveness: 'failed',
        readiness: 'not_checked',
        error: 'Connection failed',
      } satisfies N8nStatusResponse,
      'The fixed liveness check did not pass.',
      ['Failed', 'Not checked'],
      'Connection failed',
    ],
  ] as const)(
    'renders the %s observation as normalized inert data',
    (label, observation, explanation, checks, error) => {
      render(
        <IntegrationsView
          controller={makeController({ observation })}
        />,
      )

      const card = screen.getByRole('article', { name: 'n8n' })
      expect(within(card).getByText(label)).toBeInTheDocument()
      expect(within(card).getByText(explanation)).toBeInTheDocument()
      for (const check of new Set(checks)) {
        expect(within(card).getAllByText(check)).toHaveLength(
          checks.filter((value) => value === check).length,
        )
      }
      if (error !== null) {
        expect(within(card).getByText(error)).toBeInTheDocument()
      }
      const origin = within(card).getByText('http://n8n.test:5678')
      expect(origin).not.toHaveAttribute('href')
      expect(
        screen.queryByRole('link', { name: 'http://n8n.test:5678' }),
      ).not.toBeInTheDocument()
    },
  )

  it('renders only the safe invalid-configuration sentinel', () => {
    const rawInvalid = 'http://operator:private@n8n.test:5678/workflows'
    const invalid: N8nStatusResponse = {
      state: 'offline',
      base_url: 'Invalid configuration',
      liveness: 'not_checked',
      readiness: 'not_checked',
      error: 'Invalid n8n base URL',
    }

    render(
      <IntegrationsView
        controller={makeController({ observation: invalid })}
      />,
    )

    expect(screen.getByText('Invalid configuration')).toBeInTheDocument()
    expect(screen.getByText('Invalid n8n base URL')).toBeInTheDocument()
    expect(screen.queryByText(rawInvalid)).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(rawInvalid)
  })

  it('uses one assertive page alert for a first Hub failure', () => {
    const error = 'Unable to check n8n through the Hub.'
    const { container } = render(
      <IntegrationsView controller={makeController({ error })} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(error)
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(politeRegion(container)).toHaveTextContent('')
  })

  it('keeps a stale observation and announces refresh failure politely once', () => {
    const error = 'Refresh failed. Showing the last n8n observation.'
    const checkedAt = new Date('2026-07-24T10:11:12.000Z')
    const initial = makeController({
      observation: online,
      lastChecked: checkedAt,
    })
    const { container, rerender } = render(
      <IntegrationsView controller={initial} />,
    )
    const expectedTime = checkedAt.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    rerender(
      <IntegrationsView
        controller={{
          ...initial,
          error,
          stale: true,
        }}
      />,
    )

    expect(screen.getByRole('article', { name: 'n8n' })).toBeInTheDocument()
    expect(screen.getByText(expectedTime)).toHaveAttribute(
      'dateTime',
      checkedAt.toISOString(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(politeRegion(container)).toHaveTextContent(error)
    expect(
      within(politeRegion(container)).getAllByText(error),
    ).toHaveLength(1)
  })

  it('announces a completed observation politely without stealing focus', () => {
    const initial = makeController()
    const { container, rerender } = render(
      <IntegrationsView controller={initial} />,
    )

    rerender(
      <IntegrationsView
        controller={{
          ...initial,
          observation: online,
          lastChecked: new Date('2026-07-24T10:11:12.000Z'),
        }}
      />,
    )

    expect(politeRegion(container)).toHaveTextContent(
      'n8n observation updated: online.',
    )
    expect(document.activeElement).toBe(document.body)
  })

  it('re-announces identical successful states when the checked time changes', () => {
    const initial = makeController()
    const firstChecked = new Date('2026-07-24T10:11:12.000Z')
    const secondChecked = new Date('2026-07-24T10:12:13.000Z')
    const { container, rerender } = render(
      <IntegrationsView controller={initial} />,
    )

    rerender(
      <IntegrationsView
        controller={{
          ...initial,
          observation: online,
          lastChecked: firstChecked,
        }}
      />,
    )
    const region = politeRegion(container)
    const firstAnnouncement = region.firstElementChild
    expect(region).toHaveTextContent('n8n observation updated: online.')

    rerender(
      <IntegrationsView
        controller={{
          ...initial,
          observation: online,
          lastChecked: secondChecked,
        }}
      />,
    )

    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(region).toHaveTextContent('n8n observation updated: online.')
    expect(region.firstElementChild).not.toBe(firstAnnouncement)
  })

  it('re-announces an identical stale failure after another refresh attempt', () => {
    const error = 'Refresh failed. Showing the last n8n observation.'
    const initial = makeController({
      observation: online,
      lastChecked: new Date('2026-07-24T10:11:12.000Z'),
    })
    const { container, rerender } = render(
      <IntegrationsView controller={initial} />,
    )

    rerender(
      <IntegrationsView
        controller={{
          ...initial,
          error,
          stale: true,
        }}
      />,
    )
    const region = politeRegion(container)
    const firstAnnouncement = region.firstElementChild
    expect(region).toHaveTextContent(error)

    rerender(
      <IntegrationsView
        controller={{
          ...initial,
          requestStatus: 'refreshing',
          pending: true,
        }}
      />,
    )
    rerender(
      <IntegrationsView
        controller={{
          ...initial,
          error,
          stale: true,
        }}
      />,
    )

    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(region).toHaveTextContent(error)
    expect(region.firstElementChild).not.toBe(firstAnnouncement)
  })

  it('keeps refresh focus and guards pending pointer and keyboard activation', async () => {
    const user = userEvent.setup()
    const refreshN8n = vi.fn()
    const initial = makeController({ refreshN8n })
    const { rerender } = render(
      <IntegrationsView controller={initial} />,
    )
    const button = screen.getByRole('button', { name: 'Refresh n8n' })

    await user.click(button)
    expect(refreshN8n).toHaveBeenCalledTimes(1)
    expect(button).toHaveFocus()

    rerender(
      <IntegrationsView
        controller={{
          ...initial,
          requestStatus: 'refreshing',
          pending: true,
        }}
      />,
    )
    const pendingButton = screen.getByRole('button', {
      name: 'Checking n8n',
    })
    expect(pendingButton).toHaveAttribute('aria-disabled', 'true')
    expect(pendingButton).not.toBeDisabled()
    await user.click(pendingButton)
    await user.keyboard('{Enter}{Space}')

    expect(refreshN8n).toHaveBeenCalledTimes(1)
    expect(pendingButton).toHaveFocus()
  })

  it('renders a maximum-length origin as wrapped inert text only', () => {
    const origin = `http://${'a'.repeat(2_041)}`
    expect(Array.from(origin)).toHaveLength(2_048)
    const maximumOrigin: N8nStatusResponse = {
      ...online,
      base_url: origin,
    }
    const { container } = render(
      <IntegrationsView
        controller={makeController({ observation: maximumOrigin })}
      />,
    )

    const originNode = screen.getByText(origin)
    expect(originNode.closest('.integration-telemetry__origin')).not.toBeNull()
    expect(originNode).not.toHaveAttribute('href')
    expect(container.querySelector('[href]')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
    expect(
      [...container.querySelectorAll('*')].some((element) =>
        [...element.attributes].some((attribute) =>
          attribute.name.startsWith('data-'),
        ),
      ),
    ).toBe(false)
    expect(
      screen.queryByRole('button', { name: /clipboard|copy/i }),
    ).not.toBeInTheDocument()
    expect(container.querySelector(`[aria-label="${origin}"]`)).toBeNull()
  })
})
