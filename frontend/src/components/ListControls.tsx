import { useEffect, useRef, useState } from 'react'
import type { ListSort, ReadFilter, Tag } from '../types'

interface ListControlsProps {
  id: string
  search: string
  readFilter: ReadFilter
  mailbox: string
  mailboxOptions: string[]
  tag: string
  tags: Tag[]
  dateFrom: string
  dateTo: string
  sort: ListSort
  searchLabel: string
  searchPlaceholder: string
  triggerLabel: string
  showTagFilter?: boolean
  showDateFilter?: boolean
  onSearchChange: (value: string) => void
  onReadFilterChange: (value: ReadFilter) => void
  onMailboxChange: (value: string) => void
  onTagChange: (value: string) => void
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onDateRangeClear: () => void
  onSortChange: (value: ListSort) => void
}

const sorts: Array<{ value: ListSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'largest', label: 'Largest first' },
  { value: 'smallest', label: 'Smallest first' },
]

const SortIcon = ({ value }: { value: ListSort }) => {
  const ascending = value === 'oldest' || value === 'smallest'
  const bySize = value === 'largest' || value === 'smallest'

  return (
    <svg
      className="list-filter-option-icon"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
    >
      {bySize ? (
        <path d="M4 5h7v12H4zM4 20h7" />
      ) : (
        <path d="M4 6h7M4 10h7M4 14h5" />
      )}
      <path d={ascending ? 'M17 20V4m-4 4 4-4 4 4' : 'M17 4v16m-4-4 4 4 4-4'} />
    </svg>
  )
}

export const ListControls = ({
  id,
  search,
  readFilter,
  mailbox,
  mailboxOptions,
  tag,
  tags,
  dateFrom,
  dateTo,
  sort,
  searchLabel,
  searchPlaceholder,
  triggerLabel,
  showTagFilter = true,
  showDateFilter = true,
  onSearchChange,
  onReadFilterChange,
  onMailboxChange,
  onTagChange,
  onDateFromChange,
  onDateToChange,
  onDateRangeClear,
  onSortChange,
}: ListControlsProps) => {
  const [open, setOpen] = useState(false)
  const controlRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = `${id}-filter-panel`

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const closeAndFocus = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <input
        type="search"
        aria-label={searchLabel}
        placeholder={searchPlaceholder}
        value={search}
        onChange={(event) => onSearchChange(event.currentTarget.value)}
      />
      <div
        ref={controlRef}
        className="list-filter-control"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) closeAndFocus()
        }}
      >
        <button
          ref={triggerRef}
          className="list-filter-trigger"
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          aria-expanded={open}
          aria-controls={panelId}
          data-active={
            readFilter !== 'all' ||
            mailbox ||
            tag ||
            dateFrom ||
            dateTo ||
            sort !== 'newest'
          }
          onClick={() => setOpen((value) => !value)}
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
        <div id={panelId} className="list-filter-popover" hidden={!open}>
          <div className="list-filter-popover-heading">
            <strong>Filter and sort</strong>
            <button
              className="list-filter-close"
              type="button"
              aria-label="Close filters"
              title="Close filters"
              onClick={closeAndFocus}
            >
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <fieldset className="list-filter-section">
            <legend>Filter</legend>
            <label className="list-filter-option">
              <input
                type="radio"
                name={`${id}-read-filter`}
                value="all"
                checked={readFilter === 'all'}
                onChange={() => onReadFilterChange('all')}
              />
              <span className="list-filter-option-content">All messages</span>
            </label>
            <label className="list-filter-option">
              <input
                type="radio"
                name={`${id}-read-filter`}
                value="read"
                checked={readFilter === 'read'}
                onChange={() => onReadFilterChange('read')}
              />
              <span className="list-filter-option-content">Read</span>
            </label>
            <label className="list-filter-option">
              <input
                type="radio"
                name={`${id}-read-filter`}
                value="unread"
                checked={readFilter === 'unread'}
                onChange={() => onReadFilterChange('unread')}
              />
              <span className="list-filter-option-content">Unread</span>
            </label>
          </fieldset>
          {mailboxOptions.length ? (
            <>
              <div className="list-filter-divider" />
              <fieldset className="list-filter-section">
                <legend>Mailbox</legend>
                <label className="list-filter-select">
                  <span>Show messages from</span>
                  <select
                    value={mailbox}
                    onChange={(event) =>
                      onMailboxChange(event.currentTarget.value)
                    }
                  >
                    <option value="">All mailboxes</option>
                    {mailboxOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            </>
          ) : null}
          {showTagFilter && tags.length ? (
            <>
              <div className="list-filter-divider" />
              <fieldset className="list-filter-section">
                <legend>Tags</legend>
                <label className="list-filter-select">
                  <span>Filter by tag</span>
                  <select
                    value={tag}
                    onChange={(event) => onTagChange(event.currentTarget.value)}
                  >
                    <option value="">All tags</option>
                    {tags.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            </>
          ) : null}
          {showDateFilter ? (
            <>
              <div className="list-filter-divider" />
              <fieldset className="list-filter-section">
                <legend>Date</legend>
                <div className="list-filter-dates">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(event) =>
                        onDateFromChange(event.currentTarget.value)
                      }
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(event) =>
                        onDateToChange(event.currentTarget.value)
                      }
                    />
                  </label>
                </div>
                <button
                  className="list-filter-clear"
                  type="button"
                  disabled={!dateFrom && !dateTo}
                  onClick={onDateRangeClear}
                >
                  Clear dates
                </button>
              </fieldset>
            </>
          ) : null}
          <div className="list-filter-divider" />
          <fieldset className="list-filter-section">
            <legend>Sort by</legend>
            {sorts.map((option) => (
              <label className="list-filter-option" key={option.value}>
                <input
                  type="radio"
                  name={`${id}-sort`}
                  value={option.value}
                  checked={sort === option.value}
                  onChange={() => onSortChange(option.value)}
                />
                <span className="list-filter-option-content">
                  <SortIcon value={option.value} />
                  {option.label}
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      </div>
    </>
  )
}
