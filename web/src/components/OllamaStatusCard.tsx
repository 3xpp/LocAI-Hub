import type { OllamaStatusResponse } from '../api/client'

interface OllamaStatusCardProps {
  data: OllamaStatusResponse | null
  error: string | null
  loading: boolean
}

export function OllamaStatusCard({
  data,
  error,
  loading,
}: OllamaStatusCardProps) {
  const online = data?.online === true && data.error === null && error === null
  const label = loading ? 'Checking' : online ? 'Online' : 'Offline'
  const tone = loading ? 'pending' : online ? 'online' : 'offline'
  const detail = loading
    ? 'Contacting the configured model runtime.'
    : error ?? data?.error ?? (online ? 'Runtime is ready for local requests.' : 'Runtime is offline.')

  return (
    <section className="card status-card" aria-labelledby="ollama-title">
      <div className="card__index" aria-hidden="true">
        02
      </div>
      <div className="card__heading">
        <p className="eyebrow">Model runtime</p>
        <span className={`status status--${tone}`} role="status" aria-live="polite">
          <span className="status__dot" aria-hidden="true" />
          {label}
        </span>
      </div>
      <h2 id="ollama-title">Ollama</h2>
      <p className="card__copy">{detail}</p>
      <dl className="telemetry telemetry--single">
        <div>
          <dt>Endpoint</dt>
          <dd className="endpoint">{data?.base_url ?? 'http://localhost:11434'}</dd>
        </div>
      </dl>
    </section>
  )
}
