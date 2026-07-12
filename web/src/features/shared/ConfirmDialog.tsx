import { useEffect, useId, useRef, type SyntheticEvent } from 'react'

interface ConfirmDialogProps {
  open: boolean
  eyebrow: string
  heading: string
  subject: string
  explanation: string
  confirmLabel: string
  pendingLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  eyebrow,
  heading,
  subject,
  explanation,
  confirmLabel,
  pendingLabel,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const headingId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return

    if (open) {
      previousFocus.current = document.activeElement as HTMLElement | null
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal()
      else dialog.setAttribute('open', '')
      cancelRef.current?.focus()
      return
    }

    if (typeof dialog.close === 'function' && dialog.open) dialog.close()
    else dialog.removeAttribute('open')
    previousFocus.current?.focus()
  }, [open])

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    if (!busy) onCancel()
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={handleCancel}
    >
      <div className="confirm-dialog__body">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId}>{heading}</h2>
        <p id={descriptionId}>
          <strong>{subject}</strong> {explanation}
        </p>
        <div className="confirm-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={() => {
              if (!busy) onCancel()
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={() => {
              if (!busy) onConfirm()
            }}
          >
            {busy ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
