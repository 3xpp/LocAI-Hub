import { useId, type RefObject } from 'react'

import type { TransferController } from './useTransfer'

interface ExportPanelProps {
  controller: TransferController
  resultRef: RefObject<HTMLDivElement | null>
}

const recordSummary = (total: number, prompts: number, workflows: number) =>
  total +
  ' records · ' +
  prompts +
  (prompts === 1 ? ' Prompt' : ' Prompts') +
  ' · ' +
  workflows +
  (workflows === 1 ? ' Workflow Link' : ' Workflow Links')

export function ExportPanel({ controller, resultRef }: ExportPanelProps) {
  const warningId = useId()

  return (
    <section
      className="transfer-panel transfer-panel--export"
      aria-labelledby="transfer-export-title"
    >
      <div className="transfer-panel__index" aria-hidden="true">
        OUT
      </div>
      <p className="eyebrow">Portable copy · Outbound</p>
      <h2 id="transfer-export-title">Export local registries</h2>
      <p className="transfer-panel__copy">
        Download every prompt and workflow link as one versioned JSON bundle.
        Existing local data is never changed by export.
      </p>

      <div className="transfer-warning transfer-warning--sensitive" id={warningId}>
        <strong>Sensitive data boundary.</strong> The download can contain sensitive
        prompt text, internal hosts, query strings and fragments. Store and share it
        like private source material.
      </div>

      <button
        className="transfer-action transfer-action--primary"
        type="button"
        aria-describedby={warningId}
        disabled={controller.pending}
        onClick={controller.downloadBundle}
      >
        <span>
          {controller.exportStatus === 'pending'
            ? 'Preparing bundle…'
            : 'Download JSON bundle'}
        </span>
        <span aria-hidden="true">↗</span>
      </button>

      {controller.exportStatus === 'pending' ? (
        <p
          className="transfer-status"
          role="status"
          aria-live="polite"
          aria-label="Export pending"
        >
          Serializing validated local records…
        </p>
      ) : null}

      {controller.exportStatus === 'success' &&
      controller.exportResult !== null ? (
        <div
          ref={resultRef}
          className="transfer-result"
          role="status"
          aria-live="polite"
          aria-label="Export complete"
          tabIndex={-1}
        >
          <strong>Download ready</strong>
          <span>
            {recordSummary(
              controller.exportResult.total,
              controller.exportResult.prompts,
              controller.exportResult.workflow_links,
            )}
          </span>
        </div>
      ) : null}

      {controller.exportStatus === 'error' ? (
        <div
          ref={resultRef}
          className="transfer-alert"
          role="alert"
          aria-label="Export failed"
          tabIndex={-1}
        >
          <strong>Export failed</strong>
          <span>{controller.exportError ?? 'Export failed.'}</span>
        </div>
      ) : null}
    </section>
  )
}
