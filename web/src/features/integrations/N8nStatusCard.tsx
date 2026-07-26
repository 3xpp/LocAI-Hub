import type { N8nStatusResponse } from '../../api/integrations'

const presentation = {
  unconfigured: {
    label: 'Not configured',
    tone: 'unconfigured',
    detail:
      'Set N8N_BASE_URL in the API process environment, then restart the API.',
  },
  online: {
    label: 'Online',
    tone: 'online',
    detail: 'Both fixed health checks passed.',
  },
  degraded: {
    label: 'Degraded',
    tone: 'degraded',
    detail: 'Liveness passed, but readiness did not.',
  },
  offline: {
    label: 'Offline',
    tone: 'offline',
    detail: 'The fixed liveness check did not pass.',
  },
} as const

const checkLabel = {
  passed: 'Passed',
  failed: 'Failed',
  not_checked: 'Not checked',
} as const

interface N8nStatusCardProps {
  observation: N8nStatusResponse
}

export function N8nStatusCard({ observation }: N8nStatusCardProps) {
  const state = presentation[observation.state]

  return (
    <article
      className={`integration-card integration-card--${state.tone}`}
      aria-labelledby="n8n-integration-title"
    >
      <span className="integration-card__index" aria-hidden="true">
        01
      </span>
      <div className="integration-card__heading">
        <div>
          <p className="eyebrow">Automation runtime</p>
          <h2 id="n8n-integration-title">n8n</h2>
        </div>
        <span className={`status status--${state.tone}`}>
          <span className="status__dot" aria-hidden="true" />
          {state.label}
        </span>
      </div>
      <p className="integration-card__copy">{state.detail}</p>
      {observation.error !== null ? (
        <p className="integration-card__error">{observation.error}</p>
      ) : null}
      <dl className="integration-telemetry">
        <div className="integration-telemetry__origin">
          <dt>Configured origin</dt>
          <dd>{observation.base_url ?? 'Not configured'}</dd>
        </div>
        <div>
          <dt>Liveness</dt>
          <dd>{checkLabel[observation.liveness]}</dd>
        </div>
        <div>
          <dt>Readiness</dt>
          <dd>{checkLabel[observation.readiness]}</dd>
        </div>
      </dl>
      <p className="integration-card__boundary">
        Credential-free health only · No provider data or container access
      </p>
    </article>
  )
}
