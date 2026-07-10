import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDialog } from './ConfirmDialog'
import { TagInput } from './TagInput'

function TagHarness({ initialTags = [] }: { initialTags?: string[] }) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [value, setValue] = useState('')
  return (
    <TagInput tags={tags} value={value} onChange={setTags} onValueChange={setValue} />
  )
}

function DialogHarness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open delete
      </button>
      <ConfirmDialog
        open={open}
        promptTitle="Sensitive local prompt"
        busy={false}
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  )
}

describe('TagInput', () => {
  it('adds canonical tags with Enter/comma and collapses duplicates', async () => {
    const user = userEvent.setup()
    render(<TagHarness />)
    const input = screen.getByRole('textbox', { name: 'Prompt tags' })

    await user.type(input, '  Code   Review  {Enter}')
    expect(screen.getByText('code review')).toBeInTheDocument()

    await user.type(input, 'CODE REVIEW{Enter}')
    expect(screen.getAllByText('code review')).toHaveLength(1)

    await user.type(input, 'local ai,')
    expect(screen.getByText('local ai')).toBeInTheDocument()
  })

  it('removes the last tag with empty-input Backspace and explicit buttons', async () => {
    const user = userEvent.setup()
    render(<TagHarness />)
    const input = screen.getByRole('textbox', { name: 'Prompt tags' })

    await user.type(input, 'one{Enter}two{Enter}{Backspace}')
    expect(screen.getByText('one')).toBeInTheDocument()
    expect(screen.queryByText('two')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove tag one' }))
    expect(screen.queryByText('one')).not.toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('keeps removal available at the ten-tag limit and reports invalid input', async () => {
    const tags = Array.from({ length: 10 }, (_, index) => `tag-${index}`)
    const user = userEvent.setup()
    render(<TagHarness initialTags={tags} />)
    const input = screen.getByRole('textbox', { name: 'Prompt tags' })

    expect(input).toBeEnabled()
    await user.type(input, 'overflow{Enter}')
    expect(screen.getByText('A prompt can contain at most 10 tags')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'bad,tag' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Tags cannot contain commas')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '{Backspace}')
    expect(screen.queryByText('tag-9')).not.toBeInTheDocument()
  })

  it('does not commit a delimiter while an IME composition is active', () => {
    render(<TagHarness />)
    const input = screen.getByRole('textbox', { name: 'Prompt tags' })

    fireEvent.change(input, { target: { value: '構成中' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(input).toHaveValue('構成中')
    expect(screen.queryByRole('button', { name: 'Remove tag 構成中' })).not.toBeInTheDocument()
  })
})

describe('ConfirmDialog', () => {
  it('cancels without confirming and restores focus', async () => {
    const confirm = vi.fn()
    const user = userEvent.setup()
    render(<DialogHarness onConfirm={confirm} />)
    const opener = screen.getByRole('button', { name: 'Open delete' })

    await user.click(opener)
    expect(screen.getByRole('dialog')).toHaveTextContent('Sensitive local prompt')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(confirm).not.toHaveBeenCalled()
    expect(opener).toHaveFocus()
  })

  it('confirms explicitly and handles the native cancel event', async () => {
    const confirm = vi.fn()
    const user = userEvent.setup()
    render(<DialogHarness onConfirm={confirm} />)
    const opener = screen.getByRole('button', { name: 'Open delete' })

    await user.click(opener)
    await user.click(screen.getByRole('button', { name: 'Delete prompt' }))
    expect(confirm).toHaveBeenCalledOnce()

    await user.click(opener)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(opener).toHaveFocus()
  })

  it('uses the native modal API when available and exposes the irreversible warning', async () => {
    const nativeShowModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: nativeShowModal,
    })

    try {
      const user = userEvent.setup()
      render(<DialogHarness onConfirm={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Open delete' }))

      const dialog = screen.getByRole('dialog', { name: 'Delete prompt?' })
      expect(nativeShowModal).toHaveBeenCalledOnce()
      expect(dialog).toHaveAccessibleDescription(/permanently removed.*cannot be undone/i)
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    } finally {
      delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal
    }
  })

  it('blocks native cancellation and duplicate actions while deletion is busy', () => {
    const cancel = vi.fn()
    const confirm = vi.fn()
    render(
      <ConfirmDialog
        open
        promptTitle="Busy prompt"
        busy
        onCancel={cancel}
        onConfirm={confirm}
      />,
    )

    const dialog = screen.getByRole('dialog')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))

    expect(cancel).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
  })
})
