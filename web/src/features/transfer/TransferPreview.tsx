import { useId } from 'react'

import type {
  TransferIssue,
  TransferPreviewResponse,
} from '../../api/transfer'

interface TransferPreviewProps {
  preview: TransferPreviewResponse | null
  issues: TransferIssue[]
}

const noun = (count: number, singular: string, plural = singular + 's') =>
  count + ' ' + (count === 1 ? singular : plural)

export function TransferPreview({ preview, issues }: TransferPreviewProps) {
  const headingId = useId()

  if (preview === null && issues.length === 0) return null

  return (
    <section className="transfer-preview" aria-labelledby={headingId}>
      <div className="transfer-preview__heading">
        <p className="eyebrow">Validation manifest</p>
        <h3 id={headingId}>
          {preview?.importable === false ? 'No records to import' : 'Bundle preview'}
        </h3>
      </div>

      {preview !== null ? (
        <>
          <dl className="transfer-counts" aria-label="Bundle record counts">
            <div>
              <dt>Total</dt>
              <dd>{preview.counts.total}</dd>
            </div>
            <div>
              <dt>Prompts</dt>
              <dd>{preview.counts.prompts}</dd>
            </div>
            <div>
              <dt>Workflow links</dt>
              <dd>{preview.counts.workflow_links}</dd>
            </div>
          </dl>

          {preview.duplicates.total > 0 ? (
            <p className="transfer-warning transfer-warning--duplicate">
              <strong>
                {noun(preview.duplicates.total, 'exact duplicate')}
              </strong>{' '}
              will still be appended as new local records.
            </p>
          ) : preview.importable ? (
            <p className="transfer-preview__clear">No exact duplicates detected.</p>
          ) : null}

          {preview.warnings.map((warning) => (
            <p className="transfer-warning" key={warning.code}>
              {warning.message}
            </p>
          ))}
        </>
      ) : null}

      {issues.length > 0 ? (
        <div className="transfer-issues">
          <p className="transfer-issues__label">
            {noun(issues.length, 'safe validation issue')}
          </p>
          <ol>
            {issues.map((issue, index) => (
              <li
                key={[
                  issue.record_index ?? 'bundle',
                  issue.field ?? 'manifest',
                  issue.code,
                  index,
                ].join('-')}
              >
                <p>
                  <strong>
                    {issue.record_index === null
                      ? 'Bundle'
                      : 'Record ' + (issue.record_index + 1)}
                  </strong>
                  <span aria-hidden="true"> / </span>
                  {issue.record_type !== null ? (
                    <span>{issue.record_type.replace('_', ' ')}</span>
                  ) : null}
                  {issue.field !== null ? (
                    <>
                      <span aria-hidden="true"> / </span>
                      <span>{issue.field}</span>
                    </>
                  ) : null}
                </p>
                <code>{issue.code}</code>
                <span>{issue.message}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
