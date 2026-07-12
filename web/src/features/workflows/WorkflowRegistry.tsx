import { WorkflowEditor } from './WorkflowEditor'
import { WorkflowList } from './WorkflowList'
import type { WorkflowRegistryController } from './useWorkflowRegistry'

interface WorkflowRegistryProps {
  controller: WorkflowRegistryController
}

export function WorkflowRegistry({ controller }: WorkflowRegistryProps) {
  return (
    <section className="registry-view workflow-registry" aria-labelledby="workflow-registry-title">
      <header className="registry-header">
        <div>
          <p className="kicker">Local map · Reference control 02</p>
          <h1 id="workflow-registry-title" data-workflow-registry-heading tabIndex={-1}>
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
          {controller.editorMode !== 'empty' ? <WorkflowEditor controller={controller} /> : null}
          {controller.editorMode === 'empty' ? (
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
          ) : null}
        </section>
      </div>

      {controller.registryMessage !== null ? (
        <p className="registry-announcement workflow-registry__announcement" role="status" aria-live="polite">
          {controller.registryMessage}
        </p>
      ) : null}
      {controller.registryError !== null ? (
        <p className="registry-announcement registry-announcement--error" role="alert">
          {controller.registryError}
        </p>
      ) : null}

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
