import { PromptEditor } from './PromptEditor'
import { PromptList } from './PromptList'
import type { PromptRegistryController } from './usePromptRegistry'

interface PromptRegistryProps {
  controller: PromptRegistryController
}

export function PromptRegistry({ controller }: PromptRegistryProps) {
  return (
    <section className="registry-view" aria-labelledby="prompt-registry-title">
      <header className="registry-header">
        <div>
          <p className="kicker">Local knowledge · Prompt control 01</p>
          <h1 id="prompt-registry-title" data-registry-heading tabIndex={-1}>
            Prompt registry
          </h1>
        </div>
        <p>
          Search, inspect, and organize reusable local instructions. Prompt execution remains out
          of scope.
        </p>
      </header>

      <div className="registry-shell" data-mobile-pane={controller.mobilePane}>
        <PromptList controller={controller} />

        <section className="registry-workbench" aria-label="Prompt editor workspace">
          <span className="workbench-grid" aria-hidden="true" />
          {controller.editorMode !== 'empty' ? <PromptEditor controller={controller} /> : null}
          {controller.editorMode === 'empty' ? (
            <div className="workbench-placeholder">
              <p className="eyebrow">Workbench · Standby</p>
              <h2>Select a prompt</h2>
              <p>Choose a registry record or start a new local prompt.</p>
            </div>
          ) : null}
        </section>
      </div>

      {controller.registryMessage !== null ? (
        <p className="registry-announcement" role="status" aria-live="polite">
          {controller.registryMessage}
        </p>
      ) : null}

      <footer className="footer registry-footer">
        <span>Local SQLite registry</span>
        <span aria-hidden="true">//</span>
        <span>Explicit save</span>
        <span className="footer__rule" aria-hidden="true" />
        <span>Phase 01A</span>
      </footer>
    </section>
  )
}
