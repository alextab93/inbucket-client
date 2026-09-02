import { useEffect, useRef, useState } from 'react'
import type { Tag } from '../types'

export const TAG_PRESETS = [
  ['Blue', '#1D4ED8'],
  ['Indigo', '#4338CA'],
  ['Violet', '#6D28D9'],
  ['Magenta', '#A21CAF'],
  ['Rose', '#BE123C'],
  ['Red', '#B91C1C'],
  ['Orange', '#C2410C'],
  ['Amber', '#A16207'],
  ['Green', '#15803D'],
  ['Teal', '#0F766E'],
] as const

const canonicalColor = /^#[0-9A-F]{6}$/

export const TagSwatch = ({ tag }: { tag: Pick<Tag, 'name' | 'color'> }) => (
  <svg
    className="tag-swatch"
    aria-label={`${tag.name} color`}
    role="img"
    viewBox="0 0 16 16"
  >
    <rect
      x="1"
      y="1"
      width="14"
      height="14"
      rx="4"
      fill={canonicalColor.test(tag.color) ? tag.color : '#64748B'}
    />
  </svg>
)

export const TagBadges = ({
  tags,
  maxVisible = Number.POSITIVE_INFINITY,
}: {
  tags: Tag[]
  maxVisible?: number
}) => {
  if (!tags.length) return null

  const visibleTags = tags.slice(0, Math.max(0, Math.floor(maxVisible)))
  const hiddenTags = tags.slice(visibleTags.length)
  const hiddenLabel = hiddenTags.map((tag) => tag.name).join(', ')

  return (
    <span className="tag-badges" role="list" aria-label="Message tags">
      {visibleTags.map((tag) => (
        <span className="tag-badge" role="listitem" key={tag.id}>
          <TagSwatch tag={tag} />
          <span>{tag.name}</span>
        </span>
      ))}
      {hiddenTags.length ? (
        <span
          className="tag-badge tag-badge-more"
          role="listitem"
          aria-label={`${hiddenTags.length} more ${hiddenTags.length === 1 ? 'tag' : 'tags'}: ${hiddenLabel}`}
          title={hiddenLabel}
        >
          <span>+{hiddenTags.length}</span>
        </span>
      ) : null}
    </span>
  )
}

interface TagEditorProps {
  initial?: Tag
  submitLabel: string
  onSubmit: (name: string, color: string) => Promise<void>
  onCancel?: () => void
}

const TagEditor = ({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: TagEditorProps) => {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || TAG_PRESETS[0][1])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedName = name.trim().replace(/\s+/g, ' ')
    if (!normalizedName || normalizedName.length > 40) {
      setError('Tag names must contain 1 to 40 characters.')
      return
    }
    if (!canonicalColor.test(color)) {
      setError('Choose a valid tag color.')
      return
    }
    setPending(true)
    setError('')
    try {
      await onSubmit(normalizedName, color)
    } catch {
      setError('The tag could not be saved. Check for a duplicate name.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="tag-editor" onSubmit={submit}>
      <label>
        <span>Tag name</span>
        <input
          value={name}
          maxLength={40}
          required
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <fieldset>
        <legend>Preset color</legend>
        <div className="tag-preset-grid">
          {TAG_PRESETS.map(([label, value]) => (
            <label key={value}>
              <input
                type="radio"
                name={`tag-color-${initial?.id || 'new'}`}
                value={value}
                checked={color === value}
                onChange={() => setColor(value)}
              />
              <span>
                <TagSwatch tag={{ name: label, color: value }} />
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span>Custom color</span>
        <span className="tag-custom-color">
          <input
            type="color"
            value={color.toLowerCase()}
            onChange={(event) =>
              setColor(event.currentTarget.value.toUpperCase())
            }
          />
          <TagSwatch tag={{ name: 'Tag preview', color }} />
          <output>{color}</output>
        </span>
      </label>
      {error ? <p className="tag-error">{error}</p> : null}
      <div className="tag-editor-actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Saving tag.' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}

interface TagActionProps {
  tags: Tag[]
  assigned: Tag[]
  pending: boolean
  onToggle: (tag: Tag, assigned: boolean) => Promise<void>
  onCreate: (name: string, color: string) => Promise<Tag>
  onUpdate: (tag: Tag, name: string, color: string) => Promise<Tag>
  onDelete: (tag: Tag) => Promise<void>
}

export const TagAction = ({
  tags,
  assigned,
  pending,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
}: TagActionProps) => {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'assign' | 'create' | 'manage'>('assign')
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setOpen(false)
    setMode('assign')
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close()
        window.setTimeout(() => triggerRef.current?.focus(), 0)
      }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return (
    <div
      className="tag-action"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) close()
      }}
    >
      <button
        ref={triggerRef}
        className="message-action-button"
        type="button"
        aria-label="Tag message"
        title="Tag message"
        aria-expanded={open}
        aria-controls="message-tag-popover"
        onClick={() => setOpen((value) => !value)}
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M4 5h9l7 7-8 8-8-8zM9 9h.01" />
        </svg>
      </button>
      <section
        id="message-tag-popover"
        className="tag-popover"
        aria-label="Message tags"
        hidden={!open}
      >
        {mode === 'assign' ? (
          <>
            <h3>Tags</h3>
            {tags.length ? (
              <div className="tag-assignment-list">
                {tags.map((tag) => {
                  const checked = assigned.some((value) => value.id === tag.id)
                  return (
                    <label key={tag.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={async () => {
                          setError('')
                          try {
                            await onToggle(tag, !checked)
                          } catch {
                            setError('The message tags could not be updated.')
                          }
                        }}
                      />
                      <TagSwatch tag={tag} />
                      <span>{tag.name}</span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <p>No tags yet.</p>
            )}
            {error ? <p className="tag-error">{error}</p> : null}
            <div className="tag-popover-actions">
              <button type="button" onClick={() => setMode('create')}>
                Create tag
              </button>
              <button type="button" onClick={() => setMode('manage')}>
                Manage tags
              </button>
            </div>
          </>
        ) : null}
        {mode === 'create' ? (
          <>
            <h3>Create tag</h3>
            <TagEditor
              submitLabel="Create tag"
              onCancel={() => setMode('assign')}
              onSubmit={async (name, color) => {
                await onCreate(name, color)
                setMode('assign')
              }}
            />
          </>
        ) : null}
        {mode === 'manage' ? (
          <>
            <h3>Manage tags</h3>
            <div className="tag-management-list">
              {tags.map((tag) => (
                <details key={tag.id}>
                  <summary>
                    <TagSwatch tag={tag} />
                    {tag.name}
                  </summary>
                  <TagEditor
                    initial={tag}
                    submitLabel="Save tag"
                    onSubmit={async (name, color) => {
                      await onUpdate(tag, name, color)
                    }}
                  />
                  <button
                    className="tag-delete"
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Delete tag ${tag.name}?`)) return
                      await onDelete(tag)
                    }}
                  >
                    Delete tag
                  </button>
                </details>
              ))}
            </div>
            <button type="button" onClick={() => setMode('assign')}>
              Done
            </button>
          </>
        ) : null}
      </section>
    </div>
  )
}
