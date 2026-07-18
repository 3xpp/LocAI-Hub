import { useEffect, useRef } from 'react'

import { ExportPanel } from './ExportPanel'
import { ImportPanel } from './ImportPanel'
import type { TransferController } from './useTransfer'

interface TransferViewProps {
  controller: TransferController
}

export function TransferView({ controller }: TransferViewProps) {
  const exportResultRef = useRef<HTMLDivElement>(null)
  const importResultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (
      controller.exportStatus !== 'success' &&
      controller.exportStatus !== 'error'
    ) {
      return
    }
    const timer = window.setTimeout(() => exportResultRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [controller.exportStatus])

  useEffect(() => {
    if (
      controller.importStatus !== 'success' &&
      controller.importStatus !== 'error'
    ) {
      return
    }
    const timer = window.setTimeout(() => importResultRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [controller.importStatus])

  return (
    <section
      className="registry-view transfer-view"
      aria-labelledby="transfer-title"
    >
      <header className="registry-header transfer-header">
        <div>
          <p className="kicker">Portable state · Transfer control 03</p>
          <h1 id="transfer-title" data-transfer-heading tabIndex={-1}>
            Data transfer
          </h1>
        </div>
        <p>
          Move prompts and workflow references between local Hub installations
          without replacing anything already saved.
        </p>
      </header>

      <div className="transfer-boundary" aria-label="Local transfer boundary">
        <span aria-hidden="true">LOCAL</span>
        <p>
          Files cross the Hub boundary only after an explicit operator action.
          Workflow destinations remain inert text throughout preview and import.
        </p>
        <span aria-hidden="true">JSON / V1</span>
      </div>

      <div className="transfer-grid">
        <ExportPanel controller={controller} resultRef={exportResultRef} />
        <ImportPanel controller={controller} resultRef={importResultRef} />
      </div>

      <footer className="footer registry-footer">
        <span>Portable JSON</span>
        <span aria-hidden="true">//</span>
        <span>Append only</span>
        <span className="footer__rule" aria-hidden="true" />
        <span>Phase 01C</span>
      </footer>
    </section>
  )
}
