import type { HealthResponse } from '../api/client'

interface HealthCardProps {
  data: HealthResponse | null
  error: string | null
  loading: boolean
}

export function HealthCard({ data, error, loading }: HealthCardProps) {
  const healthy = data?.status.toLowerCase() === 'ok' && error === null
  const label = loading ? 'Checking' : healthy ? 'Online' : 'Offline'
  const tone = loading ? 'pending' : healthy ? 'online' : 'offline'
  const detail = loading
    ? 'Polling the local API gateway.'
    : error
      ? error
      : healthy
        ? `${data.service} v${data.version} is responding.`
        : `Backend reported ${data?.status ?? 'an unknown state'}.`

  return (
    <section className="card status-card" aria-labelledby="backend-title">
      <div className="card__index" aria-hidden="true">
        01
      </div>
      <div className="card__heading">
        <p className="eyebrow">Core service</p>
        <span className={`status status--${tone}`} role="status" aria-live="polite">
          <span className="status__dot" aria-hidden="true" />
          {label}
        </span>
      </div>
      <h2 id="backend-title">Backend</h2>
      <p className="card__copy">{detail}</p>
      <dl className="telemetry">
        <div>
          <dt>Service</dt>
          <dd>{data?.service ?? 'Awaiting signal'}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{data?.version ?? '—'}</dd>
        </div>
      </dl>
    </section>
  )
}
