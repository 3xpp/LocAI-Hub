import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getHealth,
  getOllamaModels,
  getOllamaStatus,
  type HealthResponse,
  type OllamaModelsResponse,
  type OllamaStatusResponse,
} from './api/client'
import { HealthCard } from './components/HealthCard'
import { ModelList } from './components/ModelList'
import { OllamaStatusCard } from './components/OllamaStatusCard'

interface Resource<T> {
  data: T | null
  error: string | null
  loading: boolean
}

const initialResource = <T,>(): Resource<T> => ({
  data: null,
  error: null,
  loading: true,
})

const messageFrom = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred'

const wasAborted = (error: unknown, signal: AbortSignal) =>
  signal.aborted || (error instanceof DOMException && error.name === 'AbortError')

export default function App() {
  const [health, setHealth] = useState(initialResource<HealthResponse>)
  const [ollama, setOllama] = useState(initialResource<OllamaStatusResponse>)
  const [models, setModels] = useState(initialResource<OllamaModelsResponse>)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const activeRequest = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    const { signal } = controller
    activeRequest.current = controller

    setHealth((state) => ({ ...state, error: null, loading: true }))
    setOllama((state) => ({ ...state, error: null, loading: true }))
    setModels((state) => ({ ...state, error: null, loading: true }))

    const healthTask = getHealth(signal)
      .then((data) => setHealth({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (!wasAborted(error, signal)) {
          setHealth({ data: null, error: messageFrom(error), loading: false })
        }
      })

    const ollamaTask = getOllamaStatus(signal)
      .then((data) => setOllama({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (!wasAborted(error, signal)) {
          setOllama({ data: null, error: messageFrom(error), loading: false })
        }
      })

    const modelsTask = getOllamaModels(signal)
      .then((data) => setModels({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (!wasAborted(error, signal)) {
          setModels({ data: null, error: messageFrom(error), loading: false })
        }
      })

    await Promise.allSettled([healthTask, ollamaTask, modelsTask])

    if (!signal.aborted) {
      setLastChecked(new Date())
    }

    if (activeRequest.current === controller) {
      activeRequest.current = null
    }
  }, [])

  useEffect(() => {
    void refresh()

    return () => {
      activeRequest.current?.abort()
    }
  }, [refresh])

  const refreshing = health.loading || ollama.loading || models.loading

  return (
    <main className="dashboard">
      <header className="masthead">
        <div className="brand-lockup" aria-label="Local AI Workflow Hub">
          <span className="brand-mark" aria-hidden="true">
            LH
          </span>
          <span>Local AI Workflow Hub</span>
        </div>
        <p className="node-label">
          <span aria-hidden="true" /> Local node / read only
        </p>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <div>
          <p className="kicker">System overview · Control room 00</p>
          <h1 id="page-title">
            Local stack,
            <br />
            under watch.
          </h1>
          <p className="hero__copy">
            Local-first dashboard for Ollama, prompts, workflows, and homelab automation.
          </p>
        </div>

        <div className="hero__actions">
          <button type="button" onClick={() => void refresh()} disabled={refreshing}>
            <span>{refreshing ? 'Checking systems' : 'Refresh systems'}</span>
            <span className="button-glyph" aria-hidden="true">
              {refreshing ? '···' : '↻'}
            </span>
          </button>
          <p aria-live="polite">
            Last checked
            <time dateTime={lastChecked?.toISOString()}>
              {lastChecked?.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }) ?? 'Not yet'}
            </time>
          </p>
        </div>
      </section>

      <section className="control-grid" aria-label="Local service status">
        <div className="status-grid">
          <HealthCard {...health} />
          <OllamaStatusCard {...ollama} />
        </div>
        <ModelList {...models} />
      </section>

      <footer className="footer">
        <span>Private by default</span>
        <span aria-hidden="true">//</span>
        <span>Running on your machine</span>
        <span className="footer__rule" aria-hidden="true" />
        <span>Phase 00</span>
      </footer>
    </main>
  )
}
