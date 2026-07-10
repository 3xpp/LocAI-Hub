import { PromptList } from './PromptList'
import type { PromptRegistryController } from './usePromptRegistry'

interface PromptRegistryProps {
  controller: PromptRegistryController
}

export function PromptRegistry({ controller }: PromptRegistryProps) {
  const selected = controller.items.find((prompt) => prompt.id === controller.selectedId)

  return (
    <section className="registry-view" aria-labelledby="prompt-registry-title">
      <header className="registry-header">
        <div>
          <p className="kicker">Local knowledge · Prompt control 01</p>
          <h1 id="prompt-registry-title">Prompt registry</h1>
        </div>
        <p>
          Search, inspect, and organize reusable local instructions. Prompt execution remains out
          of scope.
        </p>
      </header>

      <div className="registry-shell">
        <PromptList controller={controller} />

        <section className="registry-workbench" aria-label="Prompt editor workspace">
          <span className="workbench-grid" aria-hidden="true" />
          {controller.editorMode === 'new' ? (
            <div className="workbench-placeholder">
              <p className="eyebrow">Draft mode · Unsaved</p>
              <h2>New draft</h2>
              <p>The full prompt editor is the next verified milestone.</p>
            </div>
          ) : null}
          {controller.editorMode === 'selected' ? (
            <div className="workbench-placeholder">
              <p className="eyebrow">Selected record</p>
              <h2>{selected?.title ?? 'Prompt selected'}</h2>
              <p>The full record editor is the next verified milestone.</p>
            </div>
          ) : null}
          {controller.editorMode === 'empty' ? (
            <div className="workbench-placeholder">
              <p className="eyebrow">Workbench · Standby</p>
              <h2>Select a prompt</h2>
              <p>Choose a registry record or start a new local prompt.</p>
            </div>
          ) : null}
        </section>
      </div>

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
