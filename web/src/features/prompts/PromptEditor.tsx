import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { ConfirmDialog } from './ConfirmDialog'
import { promptTextLength } from './promptState'
import { TagInput } from './TagInput'
import type { PromptRegistryController } from './usePromptRegistry'

interface PromptEditorProps {
  controller: PromptRegistryController
}

const timestampLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

export function PromptEditor({ controller }: PromptEditorProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const titleHelpId = useId()
  const contentHelpId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const handledFocusVersion = useRef(-1)
  const deleteRequested = useRef(false)
  const { canSave, savePrompt } = controller

  useEffect(() => {
    if (handledFocusVersion.current === controller.editorFocusVersion) return
    if (controller.editorMode === 'new' && !controller.detailLoading) {
      titleRef.current?.focus()
      handledFocusVersion.current = controller.editorFocusVersion
    } else if (controller.editorMode === 'selected') {
      const mobile =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 600px)').matches
      if (controller.detailLoading) {
        if (mobile) headingRef.current?.focus()
        if (!mobile) handledFocusVersion.current = controller.editorFocusVersion
      } else if (controller.selectedPrompt !== null || controller.detailError !== null) {
        if (mobile) {
          headingRef.current?.focus()
        }
        handledFocusVersion.current = controller.editorFocusVersion
      }
    }
  }, [
    controller.detailError,
    controller.detailLoading,
    controller.editorFocusVersion,
    controller.editorMode,
    controller.selectedPrompt,
  ])

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      if (canSave && !deleteOpen) void savePrompt()
    }
    window.addEventListener('keydown', saveShortcut)
    return () => window.removeEventListener('keydown', saveShortcut)
  }, [canSave, deleteOpen, savePrompt])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (canSave) void savePrompt()
  }

  const confirmDelete = () => {
    if (deleteRequested.current || controller.mutationStatus !== 'idle') return
    deleteRequested.current = true
    void controller.deleteCurrentPrompt().finally(() => {
      deleteRequested.current = false
      setDeleteOpen(false)
    })
  }

  if (controller.detailLoading) {
    return (
      <div className="editor-state" role="status" aria-label="Loading prompt detail">
        <button type="button" className="editor-back" onClick={controller.backToList}>
          ← Back to registry
        </button>
        <span className="editor-state__pulse" aria-hidden="true" />
        <p className="eyebrow">Reading local record</p>
        <h2 ref={headingRef} tabIndex={-1}>
          Loading prompt…
        </h2>
      </div>
    )
  }

  if (controller.detailError !== null) {
    const missing = controller.detailError.includes('HTTP 404')
    return (
      <div className="editor-state editor-state--error" role="alert">
        <button type="button" className="editor-back" onClick={controller.backToList}>
          ← Back to registry
        </button>
        <p className="eyebrow">{missing ? 'Record no longer exists' : 'Detail unavailable'}</p>
        <h2 ref={headingRef} tabIndex={-1}>
          Prompt could not be opened
        </h2>
        <p>{controller.detailError}</p>
        <div className="editor-state__actions">
          <button type="button" onClick={controller.retryDetail}>
            Retry detail
          </button>
          {missing ? (
            <button type="button" onClick={controller.recoverMissingPrompt}>
              Return to registry
            </button>
          ) : (
            <button type="button" onClick={controller.refreshList}>
              Refresh registry
            </button>
          )}
        </div>
      </div>
    )
  }

  const persisted = controller.editorMode === 'selected' ? controller.selectedPrompt : null
  if (controller.editorMode === 'selected' && persisted === null) return null

  const contentLength = promptTextLength(controller.draft.content)
  const titleLength = promptTextLength(controller.draft.title.trim())
  const titleError =
    controller.draft.title.trim().length === 0
      ? 'A title is required.'
      : titleLength > 200
        ? 'Title must contain at most 200 characters.'
        : null
  const contentError =
    controller.draft.content.trim().length === 0
      ? 'Prompt content is required.'
      : contentLength > 50_000
        ? 'Content must contain at most 50,000 characters.'
        : null
  const saving = controller.mutationStatus === 'saving'
  const deleting = controller.mutationStatus === 'deleting'
  const busy = saving || deleting

  return (
    <div className="prompt-editor">
      <div className="prompt-editor__heading">
        <div>
          <p className="eyebrow">
            {controller.editorMode === 'new' ? 'Draft mode · Unsaved' : 'Selected record'}
          </p>
          <h2 ref={headingRef} tabIndex={-1}>
            {controller.editorMode === 'new' ? 'New prompt' : persisted?.title}
          </h2>
        </div>
        <button type="button" className="editor-back" onClick={controller.backToList}>
          ← Back to registry
        </button>
      </div>

      <form onSubmit={submit}>
        <label className="editor-field">
          <span>
            Prompt title <small>{titleLength}/200</small>
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
            placeholder="e.g. Review code for hidden edge cases"
          />
          <small id={titleHelpId} className="editor-field__feedback">
            {titleError ?? 'Saved titles are trimmed at both ends.'}
          </small>
        </label>

        <label className="editor-field editor-field--content">
          <span>
            Prompt content <small>{contentLength.toLocaleString()}/50,000</small>
          </span>
          <textarea
            value={controller.draft.content}
            aria-describedby={contentHelpId}
            aria-invalid={contentError !== null}
            disabled={busy}
            onChange={(event) =>
              controller.updateDraft({ ...controller.draft, content: event.target.value })
            }
            placeholder="Write the raw prompt text. Markdown is not rendered in Phase 1A."
          />
          <small id={contentHelpId} className="editor-field__feedback">
            {contentError ?? 'Raw text is stored exactly as entered.'}
          </small>
        </label>

        <TagInput
          tags={controller.draft.tags}
          value={controller.pendingTag}
          disabled={busy}
          onChange={(tags) => controller.updateDraft({ ...controller.draft, tags })}
          onValueChange={controller.setPendingTag}
        />

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
              <button type="button" onClick={controller.recoverMissingPrompt}>
                Return to registry
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="editor-actions">
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
            <button
              type="button"
              disabled={busy || controller.draft.content.length === 0}
              onClick={() => void controller.copyPrompt()}
            >
              Copy content
            </button>
            <button type="submit" className="editor-save" disabled={!controller.canSave}>
              {saving ? 'Saving…' : 'Save prompt'}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={deleteOpen}
        promptTitle={persisted?.title ?? 'this prompt'}
        busy={busy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
