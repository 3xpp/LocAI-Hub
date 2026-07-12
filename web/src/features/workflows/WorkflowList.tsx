import { workflowLinkOrigin } from '../../api/workflowLinkUrl'
import type { WorkflowLinkSummary } from '../../api/workflowLinks'
import type { WorkflowRegistryController } from './useWorkflowRegistry'

interface WorkflowListProps {
  controller: WorkflowRegistryController
}

const updatedLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

function WorkflowRow({
  item,
  selected,
  onSelect,
  onTag,
}: {
  item: WorkflowLinkSummary
  selected: boolean
  onSelect: () => void
  onTag: (tag: string) => void
}) {
  const origin = workflowLinkOrigin(item.url)

  return (
    <li className={`workflow-row${selected ? ' workflow-row--selected' : ''}`}>
      <span className="workflow-row__node" aria-hidden="true" />
      <button
        type="button"
        className="workflow-row__select"
        data-workflow-link-id={item.id}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
      >
        <span className="workflow-row__heading">
          <strong>{item.title}</strong>
          <time dateTime={item.updated_at}>{updatedLabel(item.updated_at)}</time>
        </span>
        <span className="workflow-row__origin">
          <span aria-hidden="true">↳</span> {origin ?? 'Destination unavailable'}
        </span>
        <span
          className={`workflow-row__preview${item.description_preview.length === 0 ? ' workflow-row__preview--empty' : ''}`}
        >
          {item.description_preview || 'No description recorded'}
        </span>
      </button>
      {item.tags.length > 0 ? (
        <span className="workflow-row__tags" aria-label={`Tags for ${item.title}`}>
          {item.tags.map((tag) => (
            <button
              type="button"
              className="workflow-tag"
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

export function WorkflowList({ controller }: WorkflowListProps) {
  const filtered = controller.query.trim().length > 0 || controller.activeTag !== null
  const showInitialLoading =
    controller.loading && controller.items.length === 0 && controller.error === null

  return (
    <aside className="registry-rail workflow-rail" aria-labelledby="workflow-registry-list-title">
      <div className="registry-rail__heading">
        <div>
          <p className="eyebrow">Route index · 02</p>
          <h2 id="workflow-registry-list-title">References</h2>
        </div>
        <button
          type="button"
          className="registry-new"
          data-new-workflow-link
          onClick={controller.startNewWorkflowLink}
        >
          <span aria-hidden="true">＋</span> New link
        </button>
      </div>

      <label className="registry-search">
        <span>Search workflow links</span>
        <span className="registry-search__field">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={controller.query}
            onChange={(event) => controller.setQuery(event.target.value)}
            placeholder="Title, URL, description, or tag"
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
        <div className="registry-loading" role="status" aria-label="Loading workflow links">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <p>Plotting local references…</p>
        </div>
      ) : null}

      {controller.error !== null ? (
        <div className="registry-error" role="alert">
          <p className="empty-state__code">Route index unavailable</p>
          <strong>Workflow link list could not be loaded</strong>
          <span>{controller.error}</span>
          <button
            type="button"
            aria-label="Retry workflow link list"
            onClick={controller.retry}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!showInitialLoading &&
      controller.error === null &&
      controller.items.length === 0 ? (
        <div className="registry-empty">
          <span className="registry-empty__mark" aria-hidden="true">
            {filtered ? 'Ø' : '⌖'}
          </span>
          <strong>
            {filtered ? 'No workflow links match this view' : 'No workflow links saved yet'}
          </strong>
          <p>
            {filtered
              ? 'Clear or adjust the current search and exact-tag filter.'
              : 'Index the first local automation destination without connecting to it.'}
          </p>
        </div>
      ) : null}

      {controller.items.length > 0 ? (
        <ul className="workflow-list" aria-label="Workflow link results">
          {controller.items.map((item) => (
            <WorkflowRow
              key={item.id}
              item={item}
              selected={item.id === controller.selectedId}
              onSelect={() => controller.selectWorkflowLink(item.id)}
              onTag={controller.applyTag}
            />
          ))}
        </ul>
      ) : null}

      {controller.hasMore ? (
        <button
          type="button"
          className="registry-load-more"
          aria-label="Load more workflow links"
          disabled={controller.loadingMore}
          onClick={controller.loadMore}
        >
          <span>{controller.loadingMore ? 'Loading next routes' : 'Load more'}</span>
          <span aria-hidden="true">↓</span>
        </button>
      ) : null}
    </aside>
  )
}
