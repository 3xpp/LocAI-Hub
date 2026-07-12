import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { isSafeWorkflowLinkUrl, workflowLinkOrigin } from '../../api/workflowLinkUrl'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { TagInput } from '../shared/TagInput'
import { workflowLinkTextLength } from './workflowState'
import type { WorkflowRegistryController } from './useWorkflowRegistry'

interface WorkflowEditorProps {
  controller: WorkflowRegistryController
}

const timestampLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const counter = (value: number, maximum: number) =>
  `${value.toLocaleString()}/${maximum.toLocaleString()}`

export function WorkflowEditor({ controller }: WorkflowEditorProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const titleHelpId = useId()
  const urlHelpId = useId()
  const descriptionHelpId = useId()
  const savedDestinationId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const handledFocusVersion = useRef(-1)
  const deleteRequested = useRef(false)
  const { canSave, saveWorkflowLink } = controller

  useEffect(() => {
    if (handledFocusVersion.current === controller.editorFocusVersion) return
    if (controller.editorMode === 'new' && !controller.detailLoading) {
      titleRef.current?.focus()
      handledFocusVersion.current = controller.editorFocusVersion
      return
    }
    if (controller.editorMode !== 'selected') return

    const mobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 600px)').matches
    if (controller.detailLoading) {
      if (mobile) headingRef.current?.focus()
      if (!mobile) handledFocusVersion.current = controller.editorFocusVersion
      return
    }
    if (controller.selectedWorkflowLink !== null || controller.detailError !== null) {
      if (mobile) headingRef.current?.focus()
      handledFocusVersion.current = controller.editorFocusVersion
    }
  }, [
    controller.detailError,
    controller.detailLoading,
    controller.editorFocusVersion,
    controller.editorMode,
    controller.selectedWorkflowLink,
  ])

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      if (canSave && !deleteOpen) void saveWorkflowLink()
    }
    window.addEventListener('keydown', saveShortcut)
    return () => window.removeEventListener('keydown', saveShortcut)
  }, [canSave, deleteOpen, saveWorkflowLink])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (canSave) void saveWorkflowLink()
  }

  const confirmDelete = () => {
    if (deleteRequested.current || controller.mutationStatus !== 'idle') return
    deleteRequested.current = true
    void controller.deleteCurrentWorkflowLink().finally(() => {
      deleteRequested.current = false
      setDeleteOpen(false)
    })
  }

  if (controller.detailLoading) {
    return (
      <div className="editor-state workflow-detail-state" role="status" aria-label="Loading workflow link detail">
        <button type="button" className="editor-back" onClick={controller.backToList}>
          ← Back to references
        </button>
        <span className="editor-state__pulse" aria-hidden="true" />
        <p className="eyebrow">Resolving local record</p>
        <h2 ref={headingRef} tabIndex={-1}>
          Loading workflow link…
        </h2>
      </div>
    )
  }

  if (controller.detailError !== null) {
    const missing = controller.detailError.includes('HTTP 404')
    return (
      <div className="editor-state editor-state--error workflow-detail-state" role="alert">
        <button type="button" className="editor-back" onClick={controller.backToList}>
          ← Back to references
        </button>
        <p className="eyebrow">{missing ? 'Reference no longer exists' : 'Reference unavailable'}</p>
        <h2 ref={headingRef} tabIndex={-1}>
          Workflow link could not be opened
        </h2>
        <p>{controller.detailError}</p>
        <div className="editor-state__actions">
          <button type="button" onClick={controller.retryDetail}>
            Retry detail
          </button>
          {missing ? (
            <button type="button" onClick={controller.recoverMissingWorkflowLink}>
              Return to references
            </button>
          ) : (
            <button type="button" onClick={controller.refreshList}>
              Refresh references
            </button>
          )}
        </div>
      </div>
    )
  }

  const persisted =
    controller.editorMode === 'selected' ? controller.selectedWorkflowLink : null
  if (controller.editorMode === 'selected' && persisted === null) return null

  const normalizedTitle = controller.draft.title.trim()
  const normalizedUrl = controller.draft.url.trim()
  const normalizedDescription = controller.draft.description.trim()
  const titleLength = workflowLinkTextLength(normalizedTitle)
  const urlLength = workflowLinkTextLength(normalizedUrl)
  const descriptionLength = workflowLinkTextLength(normalizedDescription)
  const titleError =
    normalizedTitle.length === 0
      ? 'A title is required.'
      : titleLength > 200
        ? 'Title must contain at most 200 characters.'
        : null
  const urlError =
    normalizedUrl.length === 0
      ? 'A destination URL is required.'
      : urlLength > 2_048
        ? 'URL must contain at most 2,048 characters.'
        : !isSafeWorkflowLinkUrl(normalizedUrl)
          ? 'Use an absolute HTTP(S) URL without credentials, spaces, or an invalid host.'
          : null
  const descriptionError =
    descriptionLength > 5_000
      ? 'Description must contain at most 5,000 characters.'
      : null
  const saving = controller.mutationStatus === 'saving'
  const deleting = controller.mutationStatus === 'deleting'
  const busy = saving || deleting
  const persistedUrlIsSafe = persisted !== null && isSafeWorkflowLinkUrl(persisted.url)
  const persistedOrigin =
    persisted !== null && persistedUrlIsSafe ? workflowLinkOrigin(persisted.url) : null
  const destinationChanged =
    persisted !== null && normalizedUrl !== persisted.url

  return (
    <div className="prompt-editor workflow-editor">
      <div className="prompt-editor__heading workflow-editor__heading">
        <div>
          <p className="eyebrow">
            {controller.editorMode === 'new' ? 'Draft route · Unsaved' : 'Selected reference · Stored locally'}
          </p>
          <h2 ref={headingRef} tabIndex={-1}>
            {controller.editorMode === 'new' ? 'New workflow link' : persisted?.title}
          </h2>
        </div>
        <button type="button" className="editor-back" onClick={controller.backToList}>
          ← Back to references
        </button>
      </div>

      <form onSubmit={submit}>
        <label className="editor-field">
          <span>
            Link title <small>{counter(titleLength, 200)}</small>
          </span>
          <input
            ref={titleRef}
            value={controller.draft.title}
            aria-describedby={titleHelpId}
            aria-invalid={titleError !== null}
            disabled={busy}
            onChange={(event) =>
              controller.updateDraft({ ...controller.draft, title: event.target.value })
            }
            placeholder="e.g. Nightly repository summary"
          />
          <small id={titleHelpId} className="editor-field__feedback">
            {titleError ?? 'Saved titles are trimmed at both ends.'}
          </small>
        </label>

        <label className="editor-field editor-field--url">
          <span>
            Destination URL <small>{counter(urlLength, 2_048)}</small>
          </span>
          <input
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={controller.draft.url}
            aria-describedby={urlHelpId}
            aria-invalid={urlError !== null}
            disabled={busy}
            onChange={(event) =>
              controller.updateDraft({ ...controller.draft, url: event.target.value })
            }
            placeholder="http://localhost:5678/workflow/example"
          />
          <small id={urlHelpId} className="editor-field__feedback">
            {urlError ?? 'The Hub stores this reference and does not contact it automatically.'}
          </small>
        </label>

        <label className="editor-field editor-field--workflow-description">
          <span>
            Description <small>{counter(descriptionLength, 5_000)}</small>
          </span>
          <textarea
            value={controller.draft.description}
            aria-describedby={descriptionHelpId}
            aria-invalid={descriptionError !== null}
            disabled={busy}
            onChange={(event) =>
              controller.updateDraft({ ...controller.draft, description: event.target.value })
            }
            placeholder="Record what this destination is for. Text is stored without rendering."
          />
          <small id={descriptionHelpId} className="editor-field__feedback">
            {descriptionError ?? 'Optional raw text; no Markdown or remote preview is rendered.'}
          </small>
        </label>

        <TagInput
          label="Workflow link tags"
          subjectName="workflow link"
          tags={controller.draft.tags}
          value={controller.pendingTag}
          disabled={busy}
          onChange={(tags) => controller.updateDraft({ ...controller.draft, tags })}
          onValueChange={controller.setPendingTag}
        />

        {persisted !== null ? (
          <section className="saved-destination" aria-labelledby={savedDestinationId}>
            <div>
              <p className="eyebrow" id={savedDestinationId}>Saved destination</p>
              <strong>{persistedOrigin ?? 'Destination unavailable'}</strong>
              <span>{persisted.url}</span>
            </div>
            {persistedUrlIsSafe ? (
              <div className="saved-destination__actions">
                <a
                  href={persisted.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  Open saved link <span aria-hidden="true">↗</span>
                </a>
                <button
                  type="button"
                  disabled={controller.copyPending || busy}
                  onClick={() => void controller.copySavedUrl()}
                >
                  {controller.copyPending ? 'Copying…' : 'Copy saved URL'}
                </button>
              </div>
            ) : (
              <p className="saved-destination__warning" role="alert">
                This stored destination did not pass the browser safety check, so Open and Copy are unavailable.
              </p>
            )}
            {destinationChanged ? (
              <p className="saved-destination__notice">
                Open and Copy still use the saved destination. Save this URL change before those actions use it.
              </p>
            ) : (
              <p className="saved-destination__notice">
                Open and Copy always use this last saved URL, never an unsaved field value.
              </p>
            )}
          </section>
        ) : (
          <p className="saved-destination__empty">
            Open and Copy become available only after this link has been saved and validated by the backend.
          </p>
        )}

        {persisted !== null ? (
          <dl className="editor-timestamps">
            <div>
              <dt>Created</dt>
              <dd>
                <time dateTime={persisted.created_at}>{timestampLabel(persisted.created_at)}</time>
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>
                <time dateTime={persisted.updated_at}>{timestampLabel(persisted.updated_at)}</time>
              </dd>
            </div>
          </dl>
        ) : null}

        <div className="editor-status" aria-live="polite">
          <span>
            {saving
              ? 'Saving locally…'
              : deleting
                ? 'Deleting permanently…'
                : controller.dirty
                  ? 'Unsaved changes'
                  : (controller.saveMessage ?? 'No unsaved changes')}
          </span>
          {controller.copyMessage !== null ? <span>{controller.copyMessage}</span> : null}
        </div>

        {controller.mutationError !== null ? (
          <div className="editor-error" role="alert">
            <span>{controller.mutationError}</span>
            {controller.mutationError.includes('HTTP 404') ? (
              <button type="button" onClick={controller.recoverMissingWorkflowLink}>
                Return to references
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="editor-actions workflow-editor__actions">
          {persisted !== null ? (
            <button
              type="button"
              className="editor-delete"
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div>
            <span className="save-hint">Ctrl / ⌘ + S</span>
            <button type="submit" className="editor-save" disabled={!controller.canSave}>
              {saving ? 'Saving…' : 'Save link'}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={deleteOpen}
        eyebrow="Permanent action"
        heading="Delete workflow link?"
        subject={persisted?.title ?? 'This workflow link'}
        explanation="will be permanently removed from this local registry. This action cannot be undone. The destination itself will not be contacted or changed."
        confirmLabel="Delete workflow link"
        pendingLabel="Deleting link…"
        busy={busy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
