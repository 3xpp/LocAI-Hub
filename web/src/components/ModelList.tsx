import type { OllamaModel, OllamaModelsResponse } from '../api/client'

interface ModelListProps {
  data: OllamaModelsResponse | null
  error: string | null
  loading: boolean
}

function formatSize(size: number | null): string {
  if (size === null || size < 0) return 'Size unknown'

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = size
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatModified(value: string | null): string {
  if (value === null) return 'Date unknown'

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unknown'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function ModelRow({ model, index }: { model: OllamaModel; index: number }) {
  return (
    <li className="model-row">
      <span className="model-row__index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="model-row__name">
        <h3>{model.name}</h3>
        <p>Modified {formatModified(model.modified_at)}</p>
      </div>
      <span className="model-size">{formatSize(model.size)}</span>
    </li>
  )
}

export function ModelList({ data, error, loading }: ModelListProps) {
  const payloadError = data?.error ?? null
  const message = error ?? payloadError
  const modelCount = data?.models.length ?? 0

  return (
    <section className="card models-card" aria-labelledby="models-title">
      <div className="card__index" aria-hidden="true">
        03
      </div>
      <div className="models-card__heading">
        <div>
          <p className="eyebrow">Local inventory</p>
          <h2 id="models-title">Installed models</h2>
        </div>
        <div className="model-total" aria-label={`${modelCount} models`}>
          <span>{String(modelCount).padStart(2, '0')}</span>
          <small>Total</small>
        </div>
      </div>

      {loading ? (
        <div className="skeleton-list" role="status" aria-label="Loading installed models">
          {[0, 1, 2].map((item) => (
            <span className="skeleton" key={item} aria-hidden="true" />
          ))}
        </div>
      ) : message ? (
        <div className="empty-state empty-state--error" role="status">
          <span className="empty-state__code" aria-hidden="true">
            ERR / INVENTORY
          </span>
          <strong>Model inventory unavailable</strong>
          <span>{message}</span>
        </div>
      ) : data && data.models.length > 0 ? (
        <ul className="model-list">
          {data.models.map((model, index) => (
            <ModelRow
              key={`${model.name}-${model.modified_at ?? 'unknown'}-${index}`}
              model={model}
              index={index}
            />
          ))}
        </ul>
      ) : (
        <div className="empty-state" role="status">
          <span className="empty-state__code" aria-hidden="true">
            00 / CLEAR
          </span>
          <strong>No local models found</strong>
          <span>Install a model with Ollama, then refresh this control room.</span>
        </div>
      )}
    </section>
  )
}
