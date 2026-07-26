import { useEffect, useRef, useState } from 'react'

import type { N8nWorkflowInventoryController } from './useN8nWorkflowInventory'

interface N8nWorkflowInventoryProps {
  controller: N8nWorkflowInventoryController
}

interface Announcement {
  message: string
  sequence: number
}

const loadedLabel = (value: Date) =>
  value.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const workflowTimeLabel = (value: string) =>
  new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

export function N8nWorkflowInventory({
  controller,
}: N8nWorkflowInventoryProps) {
  const [announcement, setAnnouncement] = useState<Announcement>({
    message: '',
    sequence: 0,
  })
  const previousSettlement = useRef(controller.settlementSequence)

  useEffect(() => {
    if (
      controller.settlementSequence === previousSettlement.current ||
      controller.pending
    ) {
      return
    }
    previousSettlement.current = controller.settlementSequence

    let message = ''
    if (controller.stale && controller.error !== null) {
      message = controller.error
    } else if (controller.snapshot?.state === 'available') {
      const count = controller.snapshot.items.length
      message = `${count} n8n workflow${count === 1 ? '' : 's'} loaded${
        controller.snapshot.truncated
          ? '; the bounded result is truncated.'
          : '.'
      }`
    } else if (controller.snapshot?.state === 'unconfigured') {
      message = 'n8n workflow inventory is not configured.'
    }

    setAnnouncement((current) => ({
      message,
      sequence: current.sequence + 1,
    }))
  }, [
    controller.error,
    controller.pending,
    controller.settlementSequence,
    controller.snapshot,
    controller.stale,
  ])

  const settled = controller.snapshot !== null
  const actionLabel = settled ? 'Refresh inventory' : 'Load workflows'
  const action = settled ? controller.refresh : controller.load
  const available =
    controller.snapshot?.state === 'available'
      ? controller.snapshot
      : null

  return (
    <section
      className="n8n-inventory"
      aria-labelledby="n8n-inventory-title"
      aria-busy={controller.pending}
    >
      <header className="n8n-inventory__header">
        <div>
          <p className="kicker">Explicit provider summary</p>
          <h2 id="n8n-inventory-title">n8n workflow inventory</h2>
        </div>
        <button
          type="button"
          className="n8n-inventory__action"
          aria-disabled={controller.pending}
          onClick={() => {
            if (!controller.pending) action()
          }}
        >
          {controller.pending
            ? settled
              ? 'Refreshing inventory'
              : 'Loading workflows'
            : actionLabel}
        </button>
      </header>

      {controller.error !== null ? (
        <p
          className={`n8n-inventory__alert${
            controller.stale ? ' n8n-inventory__alert--stale' : ''
          }`}
          role={controller.stale ? undefined : 'alert'}
        >
          {controller.error}
        </p>
      ) : null}

      {controller.snapshot?.state === 'unconfigured' ? (
        <div className="n8n-inventory__empty">
          <strong>Inventory not configured</strong>
          <p>
            Configure the n8n origin and API key in the API process, then
            restart the API.
          </p>
        </div>
      ) : available !== null ? (
        <div className="n8n-inventory__results">
          <div className="n8n-inventory__summary">
            <strong>{available.items.length} loaded</strong>
            {controller.lastLoaded !== null ? (
              <p>
                Last loaded{' '}
                <time dateTime={controller.lastLoaded.toISOString()}>
                  {loadedLabel(controller.lastLoaded)}
                </time>
              </p>
            ) : null}
          </div>
          {available.truncated ? (
            <p className="n8n-inventory__notice">
              Showing a bounded workflow summary. More workflows may exist in
              n8n.
            </p>
          ) : null}
          {available.items.length === 0 ? (
            <p className="n8n-inventory__empty">No workflows returned</p>
          ) : (
            <ul className="n8n-inventory__list" aria-label="n8n workflows">
              {available.items.map((workflow, index) => (
                <li className="n8n-inventory__row" key={index}>
                  <strong className="n8n-inventory__name">
                    {workflow.name}
                  </strong>
                  <span className="n8n-inventory__state">
                    {workflow.active ? 'Active' : 'Inactive'}
                  </span>
                  <time dateTime={workflow.updated_at}>
                    {workflowTimeLabel(workflow.updated_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : controller.pending ? (
        <p className="n8n-inventory__empty">Loading workflow inventory</p>
      ) : controller.error === null ? (
        <div className="n8n-inventory__empty">
          <strong>Workflow inventory not loaded</strong>
          <p>Use Load workflows to request one bounded local summary.</p>
        </div>
      ) : null}

      <p
        className="sr-only"
        aria-label="n8n workflow inventory announcements"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement.message === '' ? null : (
          <span key={announcement.sequence}>{announcement.message}</span>
        )}
      </p>
    </section>
  )
}
