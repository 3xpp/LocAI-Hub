import {
  useId,
  type ChangeEvent,
  type RefObject,
} from 'react'

import { ConfirmDialog } from '../shared/ConfirmDialog'
import { TransferPreview } from './TransferPreview'
import type { TransferController } from './useTransfer'

interface ImportPanelProps {
  controller: TransferController
  resultRef: RefObject<HTMLDivElement | null>
}

const noun = (count: number, singular: string, plural = singular + 's') =>
  count + ' ' + (count === 1 ? singular : plural)

const typeSummary = (prompts: number, workflows: number) =>
  noun(prompts, 'Prompt') + ' · ' + noun(workflows, 'Workflow Link')

export function ImportPanel({ controller, resultRef }: ImportPanelProps) {
  const inputId = useId()
  const fileHelpId = useId()
  const importHelpId = useId()
  const preview = controller.preview
  const previewCounts = preview?.counts ?? {
    total: 0,
    prompts: 0,
    workflow_links: 0,
  }
  const duplicates = preview?.duplicates.total ?? 0

  const selectFirstFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.item(0) ?? null
    input.value = ''
    if (file !== null) controller.selectFile(file)
  }

  return (
    <section
      className="transfer-panel transfer-panel--import"
      aria-labelledby="transfer-import-title"
    >
      <div className="transfer-panel__index" aria-hidden="true">
        IN
      </div>
      <p className="eyebrow">Validated intake · Inbound</p>
      <h2 id="transfer-import-title">Preview local bundle</h2>
      <p className="transfer-panel__copy">
        Select one local JSON bundle. Validation and duplicate analysis happen
        before the append-only import is available.
      </p>

      <div className="transfer-file-control">
        <label className="transfer-file-label" htmlFor={inputId}>
          Select JSON bundle
        </label>
        <input
          id={inputId}
          type="file"
          accept=".json,application/json"
          aria-describedby={fileHelpId}
          disabled={controller.pending}
          onChange={selectFirstFile}
        />
        <p id={fileHelpId}>
          Up to 10 MiB. Selected text stays in component memory and may contain
          sensitive prompts, descriptions, internal URLs, query strings and fragments.
        </p>
      </div>

      {controller.selection !== null ? (
        <div className="transfer-selection" aria-label="Selected bundle">
          <div>
            <span>Selected file</span>
            <strong>{controller.selection.filename}</strong>
            <small>{controller.selection.size} bytes</small>
          </div>
          <button
            className="transfer-action transfer-action--secondary"
            type="button"
            disabled={controller.pending}
            onClick={controller.clearSelection}
          >
            Clear selection
          </button>
        </div>
      ) : (
        <div className="transfer-drop-idle" aria-hidden="true">
          <span>JSON</span>
          <p>No bundle held in memory</p>
        </div>
      )}

      {controller.previewStatus === 'reading' ? (
        <p
          className="transfer-status"
          role="status"
          aria-live="polite"
          aria-label="Reading selected bundle"
        >
          Reading selected bytes…
        </p>
      ) : null}

      {controller.previewStatus === 'pending' ? (
        <p
          className="transfer-status"
          role="status"
          aria-live="polite"
          aria-label="Preview pending"
        >
          Validating manifest and checking exact duplicates…
        </p>
      ) : null}

      {controller.previewStatus === 'error' ? (
        <div
          className="transfer-alert"
          role="alert"
          aria-label="Import preview failed"
          tabIndex={-1}
        >
          <strong>Preview rejected</strong>
          <span>{controller.previewError ?? 'Preview failed.'}</span>
          <TransferPreview preview={null} issues={controller.previewIssues} />
        </div>
      ) : null}

      {controller.previewStatus === 'ready' && preview !== null ? (
        <TransferPreview preview={preview} issues={controller.previewIssues} />
      ) : null}

      {controller.selection !== null &&
      (controller.previewStatus === 'error' ||
        controller.importStatus === 'error') ? (
        <button
          className="transfer-action transfer-action--secondary"
          type="button"
          disabled={controller.pending}
          onClick={controller.previewAgain}
        >
          Preview again
        </button>
      ) : null}

      {controller.selection !== null ? (
        <div className="transfer-import-action">
          <p id={importHelpId}>
            A fresh non-empty preview is required. Every valid record is appended;
            existing records are never replaced.
          </p>
          <button
            className="transfer-action transfer-action--primary"
            type="button"
            aria-describedby={importHelpId}
            disabled={!controller.canImport}
            onClick={controller.openImportConfirmation}
          >
            Import records
          </button>
        </div>
      ) : null}

      {controller.importStatus === 'pending' ? (
        <p
          className="transfer-status"
          role="status"
          aria-live="polite"
          aria-label="Import pending"
        >
          Importing in one local transaction. Keep this view open until the
          outcome is known…
        </p>
      ) : null}

      {controller.importStatus === 'success' &&
      controller.importResult !== null ? (
        <div
          ref={resultRef}
          className="transfer-result"
          role="status"
          aria-live="polite"
          aria-label="Import complete"
          tabIndex={-1}
        >
          <strong>
            Imported {noun(controller.importResult.imported.total, 'record')}
          </strong>
          <span>
            {typeSummary(
              controller.importResult.imported.prompts,
              controller.importResult.imported.workflow_links,
            )}
          </span>
          {controller.importResult.duplicates_imported.total > 0 ? (
            <small>
              {noun(
                controller.importResult.duplicates_imported.total,
                'exact duplicate',
              )}{' '}
              appended as new records.
            </small>
          ) : null}
        </div>
      ) : null}

      {controller.importStatus === 'error' ? (
        <div
          ref={resultRef}
          className={[
            'transfer-alert',
            controller.importOutcomeUncertain
              ? 'transfer-alert--uncertain'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="alert"
          aria-label="Import failed"
          tabIndex={-1}
        >
          <strong>
            {controller.importOutcomeUncertain
              ? 'Outcome uncertain'
              : 'Import not committed'}
          </strong>
          <span>{controller.importError ?? 'Import failed.'}</span>
        </div>
      ) : null}

      <ConfirmDialog
        open={controller.confirmationOpen}
        eyebrow="Append-only boundary"
        heading="Confirm local import"
        subject={noun(previewCounts.total, 'record')}
        explanation={
          'will be added in one local transaction. This append-only operation keeps every saved record and does not replace or skip anything. ' +
          typeSummary(previewCounts.prompts, previewCounts.workflow_links) +
          '. ' +
          (duplicates > 0
            ? noun(duplicates, 'exact duplicate') +
              ' will also be appended as new local records.'
            : 'No exact duplicates were detected.')
        }
        confirmLabel="Confirm append-only import"
        pendingLabel="Importing records…"
        busy={controller.importStatus === 'pending'}
        onCancel={controller.cancelImportConfirmation}
        onConfirm={controller.confirmImport}
      />
    </section>
  )
}
