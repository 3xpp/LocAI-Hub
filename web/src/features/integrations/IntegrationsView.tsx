import { useEffect, useRef, useState } from 'react'

import { N8nStatusCard } from './N8nStatusCard'
import { N8nWorkflowInventory } from './N8nWorkflowInventory'
import type { IntegrationsController } from './useIntegrations'
import type { N8nWorkflowInventoryController } from './useN8nWorkflowInventory'

interface IntegrationsViewProps {
  controller: IntegrationsController
  inventoryController: N8nWorkflowInventoryController
}

interface Announcement {
  message: string
  sequence: number
}

const checkedLabel = (value: Date | null) =>
  value?.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) ?? 'Not yet'

export function IntegrationsView({
  controller,
  inventoryController,
}: IntegrationsViewProps) {
  const [announcement, setAnnouncement] = useState<Announcement>({
    message: '',
    sequence: 0,
  })
  const previousObservation = useRef(controller.observation)
  const previousError = useRef(controller.error)
  const previousLastChecked = useRef(controller.lastChecked)

  useEffect(() => {
    let message: string | null = null
    if (
      controller.observation !== null &&
      (previousObservation.current === null ||
        controller.lastChecked !== previousLastChecked.current)
    ) {
      message = `n8n observation updated: ${controller.observation.state}.`
    } else if (
      controller.stale &&
      controller.error !== null &&
      controller.error !== previousError.current
    ) {
      message = controller.error
    }

    if (message !== null) {
      setAnnouncement((current) => ({
        message,
        sequence: current.sequence + 1,
      }))
    }
    previousObservation.current = controller.observation
    previousError.current = controller.error
    previousLastChecked.current = controller.lastChecked
  }, [
    controller.error,
    controller.lastChecked,
    controller.observation,
    controller.stale,
  ])

  return (
    <section
      className="registry-view integrations-view"
      aria-labelledby="integrations-title"
    >
      <header className="registry-header integrations-header">
        <div>
          <p className="kicker">Service observation · Integration control 04</p>
          <h1 id="integrations-title">Integrations</h1>
        </div>
        <p>
          Observe fixed credential-free n8n health endpoints and explicitly
          load one bounded workflow summary through the backend-only inventory
          boundary.
        </p>
      </header>

      <div
        className="integration-boundary"
        aria-label="Integration safety boundary"
      >
        <span aria-hidden="true">READ ONLY</span>
        <p>
          Health uses fixed credential-free liveness and readiness endpoints.
          Workflow inventory uses a backend-only key with one fixed list
          endpoint only after explicit operator action.
        </p>
        <span aria-hidden="true">FIXED PATHS</span>
      </div>

      <div className="integrations-toolbar">
        <button
          type="button"
          className="integration-refresh"
          onClick={() => {
            if (!controller.pending) controller.refreshN8n()
          }}
          aria-disabled={controller.pending}
        >
          <span>
            {controller.pending ? 'Checking health' : 'Refresh health'}
          </span>
          <span aria-hidden="true">{controller.pending ? '···' : '↻'}</span>
        </button>
        <p>
          Last checked
          {controller.lastChecked === null ? (
            <span className="integrations-toolbar__checked">Not yet</span>
          ) : (
            <time
              className="integrations-toolbar__checked"
              dateTime={controller.lastChecked.toISOString()}
            >
              {checkedLabel(controller.lastChecked)}
            </time>
          )}
        </p>
      </div>

      {controller.error !== null ? (
        <p
          className={`integration-alert${controller.stale ? ' integration-alert--stale' : ''}`}
          role={controller.stale ? undefined : 'alert'}
        >
          {controller.error}
        </p>
      ) : null}

      {controller.observation !== null ? (
        <N8nStatusCard observation={controller.observation} />
      ) : controller.requestStatus === 'loading' ? (
        <div className="integration-loading" role="status">
          <span aria-hidden="true" />
          <strong>Checking health</strong>
          <p>Requesting one observation through the local Hub.</p>
        </div>
      ) : controller.error === null ? (
        <div className="integration-loading">
          <strong>No observation yet</strong>
          <p>
            Use Refresh health to request one credential-free observation.
          </p>
        </div>
      ) : null}

      <N8nWorkflowInventory controller={inventoryController} />

      <p
        className="sr-only"
        aria-label="n8n health announcements"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement.message === '' ? null : (
          <span key={announcement.sequence}>{announcement.message}</span>
        )}
      </p>

      <footer className="footer registry-footer">
        <span>Private by default</span>
        <span aria-hidden="true">//</span>
        <span>Running on your machine · Observation only</span>
        <span className="footer__rule" aria-hidden="true" />
        <span>Phase 02B</span>
      </footer>
    </section>
  )
}
