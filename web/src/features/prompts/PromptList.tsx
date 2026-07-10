import type { PromptSummary } from '../../api/prompts'
import type { PromptRegistryController } from './usePromptRegistry'

interface PromptListProps {
  controller: PromptRegistryController
}

const updatedLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

function PromptRow({
  prompt,
  selected,
  disabled,
  onSelect,
  onTag,
}: {
  prompt: PromptSummary
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onTag: (tag: string) => void
}) {
  return (
    <li className={`prompt-row${selected ? ' prompt-row--selected' : ''}`}>
      <button
        type="button"
        className="prompt-row__select"
        data-prompt-id={prompt.id}
        aria-current={selected ? 'true' : undefined}
        disabled={disabled}
        onClick={onSelect}
      >
        <span className="prompt-row__heading">
          <strong>{prompt.title}</strong>
          <time dateTime={prompt.updated_at}>{updatedLabel(prompt.updated_at)}</time>
        </span>
        <span className="prompt-row__preview">{prompt.content_preview}</span>
      </button>
      {prompt.tags.length > 0 ? (
        <span className="prompt-row__tags" aria-label={`Tags for ${prompt.title}`}>
          {prompt.tags.map((tag) => (
            <button
              type="button"
              className="prompt-tag"
              key={tag}
              aria-label={`Filter by tag ${tag}`}
              onClick={() => onTag(tag)}
            >
              {tag}
            </button>
          ))}
        </span>
      ) : null}
    </li>
  )
}

export function PromptList({ controller }: PromptListProps) {
  const filtered = controller.query.trim().length > 0 || controller.activeTag !== null
  const showInitialLoading = controller.loading && controller.items.length === 0

  return (
    <aside className="registry-rail" aria-labelledby="registry-list-title">
      <div className="registry-rail__heading">
        <div>
          <p className="eyebrow">Registry rail · 01</p>
          <h2 id="registry-list-title">Prompts</h2>
        </div>
        <button
          type="button"
          className="registry-new"
          data-new-prompt
          disabled={controller.mutationStatus !== 'idle'}
          onClick={controller.startNewPrompt}
        >
          <span aria-hidden="true">＋</span> New prompt
        </button>
      </div>

      <label className="registry-search">
        <span>Search prompts</span>
        <span className="registry-search__field">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={controller.query}
            onChange={(event) => controller.setQuery(event.target.value)}
            placeholder="Title, content, or tag"
          />
        </span>
      </label>

      <div className="registry-meta">
        <p aria-live="polite">
          <strong>{controller.total}</strong> {controller.total === 1 ? 'record' : 'records'}
        </p>
        {controller.loading && controller.items.length > 0 ? (
          <span role="status">Refreshing</span>
        ) : null}
      </div>

      {controller.activeTag !== null ? (
        <div className="active-filter">
          <span>Exact tag</span>
          <button
            type="button"
            aria-label={`Clear tag filter ${controller.activeTag}`}
            onClick={controller.clearTag}
          >
            {controller.activeTag} <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}

      {showInitialLoading ? (
        <div className="registry-loading" role="status" aria-label="Loading prompts">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <p>Reading local registry…</p>
        </div>
      ) : null}

      {controller.error !== null ? (
        <div className="registry-error" role="alert">
          <p className="empty-state__code">Registry unavailable</p>
          <strong>Prompt list could not be loaded</strong>
          <span>{controller.error}</span>
          <button type="button" aria-label="Retry prompt list" onClick={controller.retry}>
            Retry
          </button>
        </div>
      ) : null}

      {!showInitialLoading && controller.error === null && controller.items.length === 0 ? (
        <div className="registry-empty">
          <span className="registry-empty__mark" aria-hidden="true">
            {filtered ? 'Ø' : '+'}
          </span>
          <strong>{filtered ? 'No prompts match this view' : 'No prompts saved yet'}</strong>
          <p>
            {filtered
              ? 'Clear or adjust the current search and exact-tag filter.'
              : 'Create the first reusable instruction for your local workflow stack.'}
          </p>
        </div>
      ) : null}

      {controller.items.length > 0 ? (
        <ul className="prompt-list" aria-label="Prompt results">
          {controller.items.map((prompt) => (
            <PromptRow
              key={prompt.id}
              prompt={prompt}
              selected={prompt.id === controller.selectedId}
              disabled={controller.mutationStatus !== 'idle'}
              onSelect={() => controller.selectPrompt(prompt.id)}
              onTag={controller.applyTag}
            />
          ))}
        </ul>
      ) : null}

      {controller.hasMore ? (
        <button
          type="button"
          className="registry-load-more"
          aria-label="Load more prompts"
          disabled={controller.loadingMore}
          onClick={controller.loadMore}
        >
          <span>{controller.loadingMore ? 'Loading next page' : 'Load more'}</span>
          <span aria-hidden="true">↓</span>
        </button>
      ) : null}
    </aside>
  )
}
