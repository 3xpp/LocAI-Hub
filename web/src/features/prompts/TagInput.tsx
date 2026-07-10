import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { normalizePromptTag } from './promptState'

interface TagInputProps {
  tags: string[]
  value: string
  onChange: (tags: string[]) => void
  onValueChange: (value: string) => void
  disabled?: boolean
}

export function TagInput({
  tags,
  value,
  onChange,
  onValueChange,
  disabled = false,
}: TagInputProps) {
  const inputId = useId()
  const feedbackId = useId()
  const [feedback, setFeedback] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setFeedback(null), [tags])

  let validationFeedback: string | null = null
  if (value.length > 0) {
    if (tags.length >= 10) {
      validationFeedback = 'A prompt can contain at most 10 tags'
    } else {
      try {
        normalizePromptTag(value)
      } catch (error) {
        validationFeedback = error instanceof Error ? error.message : 'Tag is invalid'
      }
    }
  }
  const visibleFeedback = feedback ?? validationFeedback

  const commit = () => {
    try {
      const tag = normalizePromptTag(value)
      if (tags.includes(tag)) {
        setFeedback('That tag is already attached')
        onValueChange('')
        return
      }
      if (tags.length >= 10) {
        setFeedback('A prompt can contain at most 10 tags')
        return
      }
      onChange([...tags, tag])
      onValueChange('')
      setFeedback(null)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Tag is invalid')
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
      return
    }
    if (event.key === 'Backspace' && value.length === 0 && tags.length > 0) {
      event.preventDefault()
      onChange(tags.slice(0, -1))
      setFeedback(null)
    }
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((current) => current !== tag))
    setFeedback(null)
    inputRef.current?.focus()
  }

  return (
    <div className="tag-input">
      <label htmlFor={inputId}>Prompt tags</label>
      <div className="tag-input__control">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            <span>{tag}</span>
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              disabled={disabled}
              onClick={() => removeTag(tag)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          aria-describedby={feedbackId}
          aria-invalid={visibleFeedback !== null ? 'true' : undefined}
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => {
            onValueChange(event.target.value)
            setFeedback(null)
          }}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? 'Add tag, then Enter' : 'Add another tag'}
        />
      </div>
      <p id={feedbackId} className="tag-input__feedback" aria-live="polite">
        {visibleFeedback ?? `${tags.length} of 10 tags`}
      </p>
    </div>
  )
}
