import { useEffect, useRef } from 'react'

import { workflowLinkOrigin } from '../../api/workflowLinkUrl'
import { WorkflowList } from './WorkflowList'
import type { WorkflowRegistryController } from './useWorkflowRegistry'

interface WorkflowRegistryProps {
  controller: WorkflowRegistryController
}

const timestampLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

function WorkflowWorkbench({ controller }: WorkflowRegistryProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const handledFocusVersion = useRef(-1)

  useEffect(() => {
    if (handledFocusVersion.current === controller.editorFocusVersion) return
    const mobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 600px)').matches
    if (!mobile || controller.editorMode === 'empty') {
      handledFocusVersion.current = controller.editorFocusVersion
      return
    }
    const heading = headingRef.current
    if (heading === null) return
    heading.focus()
    if (!controller.detailLoading) {
      handledFocusVersion.current = controller.editorFocusVersion
    }
  }, [
    controller.detailError,
    controller.detailLoading,
    controller.editorFocusVersion,
    controller.editorMode,
    controller.selectedWorkflowLink,
  ])

  if (controller.editorMode === 'empty') {
    return (
      <div className="workbench-placeholder workflow-workbench__placeholder">
        <span className="route-map" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <p className="eyebrow">Route workbench · Standby</p>
        <h2>Select a workflow link</h2>
        <p>Choose a saved reference or plot a new local automation destination.</p>
      </div>
    )
  }

  if (controller.detailLoading) {
    return (
      <div className="editor-state workflow-detail-state" role="status" aria-label="Loading workflow link detail">
        <button type="button" className="editor-back" onClick={controller.backToList}>
          ← Back to references
        </button>
        <span className="editor-state__pulse" aria-hidden="true" />
        <p className="eyebrow">Resolving local record</p>
        <h2 ref={headingRef} tabIndex={-1}>
          Loading workflow link…
        </h2>
      </div>
    )
  }

  if (controller.detailError !== null) {
    const missing = controller.detailError.includes('HTTP 404')
    return (
      <div className="editor-state editor-state--error workflow-detail-state" role="alert">
        <button type="button" className="editor-back" onClick={controller.backToList}>
          ← Back to references
        </button>
        <p className="eyebrow">{missing ? 'Reference no longer exists' : 'Reference unavailable'}</p>
        <h2 ref={headingRef} tabIndex={-1}>
          Workflow link could not be opened
        </h2>
        <p>{controller.detailError}</p>
        <div className="editor-state__actions">
          <button type="button" onClick={controller.retryDetail}>
            Retry detail
          </button>
          {missing ? (
            <button type="button" onClick={controller.recoverMissingWorkflowLink}>
              Return to references
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (controller.editorMode === 'new') {
    return (
      <div className="workflow-route-card workflow-route-card--new">
        <button type="button" className="editor-back" onClick={controller.backToList}>
          ← Back to references
        </button>
        <div className="workflow-route-card__station" aria-hidden="true">
          <span>NEW</span>
        </div>
        <p className="eyebrow">Draft route · Unsaved</p>
        <h2 ref={headingRef} tabIndex={-1}>
          New workflow link
        </h2>
        <p className="workflow-route-card__copy">
          A blank reference is ready. The editing controls arrive in the next workbench step;
          nothing has been contacted or saved.
        </p>
      </div>
    )
  }

  const item = controller.selectedWorkflowLink
  if (item === null) return null
  const origin = workflowLinkOrigin(item.url)

  return (
    <article className="workflow-route-card">
      <button type="button" className="editor-back" onClick={controller.backToList}>
        ← Back to references
      </button>
      <div className="workflow-route-card__station" aria-hidden="true">
        <span>{String(item.id).padStart(2, '0')}</span>
      </div>
      <p className="eyebrow">Selected reference · Stored locally</p>
      <h2 ref={headingRef} tabIndex={-1}>
        {item.title}
      </h2>
      <p className="workflow-route-card__origin">
        <span>Validated origin</span>
        <strong>{origin ?? 'Destination unavailable'}</strong>
      </p>
      <p className="workflow-route-card__copy">
        {item.description || 'No description recorded for this reference.'}
      </p>
      {item.tags.length > 0 ? (
        <div className="workflow-route-card__tags" aria-label={`Tags for ${item.title}`}>
          {item.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
      <dl className="workflow-route-card__telemetry">
        <div>
          <dt>Created</dt>
          <dd>
            <time dateTime={item.created_at}>{timestampLabel(item.created_at)}</time>
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>
            <time dateTime={item.updated_at}>{timestampLabel(item.updated_at)}</time>
          </dd>
        </div>
      </dl>
      <p className="workflow-route-card__notice">Reference only · destination not requested</p>
    </article>
  )
}

export function WorkflowRegistry({ controller }: WorkflowRegistryProps) {
  return (
    <section className="registry-view workflow-registry" aria-labelledby="workflow-registry-title">
      <header className="registry-header">
        <div>
          <p className="kicker">Local map · Reference control 02</p>
          <h1
            id="workflow-registry-title"
            data-workflow-registry-heading
            tabIndex={-1}
          >
            Workflow links
          </h1>
        </div>
        <p>
          Index the places your local automation lives. The Hub stores references only—it does not
          inspect, execute, or modify them.
        </p>
      </header>

      <div className="registry-shell workflow-registry__shell" data-mobile-pane={controller.mobilePane}>
        <WorkflowList controller={controller} />
        <section className="registry-workbench workflow-workbench" aria-label="Workflow link workbench">
          <span className="workbench-grid workflow-workbench__grid" aria-hidden="true" />
          <WorkflowWorkbench controller={controller} />
        </section>
      </div>

      <footer className="footer registry-footer">
        <span>Local SQLite registry</span>
        <span aria-hidden="true">//</span>
        <span>Reference only</span>
        <span className="footer__rule" aria-hidden="true" />
        <span>Phase 01B</span>
      </footer>
    </section>
  )
}
