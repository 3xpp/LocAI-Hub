import { useEffect, useRef, type SyntheticEvent } from 'react'

interface ConfirmDialogProps {
  open: boolean
  promptTitle: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  promptTitle,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
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
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
      onCancel={handleCancel}
    >
      <div className="confirm-dialog__body">
        <p className="eyebrow">Permanent action</p>
        <h2 id="delete-dialog-title">Delete prompt?</h2>
        <p id="delete-dialog-description">
          <strong>{promptTitle}</strong> will be permanently removed from this local registry. This
          action cannot be undone.
        </p>
        <div className="confirm-dialog__actions">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Deleting…' : 'Delete prompt'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
