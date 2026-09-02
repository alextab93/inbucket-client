import { useEffect, useRef, useState, type FormEvent } from 'react'

const CloseIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

interface MailboxToolsProps {
  mailboxes: string[]
  selectedMailboxes: string[]
  liveAllMailboxes: boolean
  actionPending: boolean
  onAdd: (mailbox: string) => Promise<void>
  onSelectionChange: (mailboxes: string[]) => void
  onLiveAllMailboxesChange: (enabled: boolean) => void
  onArchive: () => void
}

export const MailboxTools = ({
  mailboxes,
  selectedMailboxes,
  liveAllMailboxes,
  actionPending,
  onAdd,
  onSelectionChange,
  onLiveAllMailboxesChange,
  onArchive,
}: MailboxToolsProps) => {
  const [manageOpen, setManageOpen] = useState(false)
  const [mailboxName, setMailboxName] = useState('')
  const manageRef = useRef<HTMLDetailsElement>(null)
  const hasMailboxes = mailboxes.length > 0
  const hasSelection = selectedMailboxes.length > 0
  const allSelected =
    hasMailboxes &&
    mailboxes.every((mailbox) => selectedMailboxes.includes(mailbox))

  useEffect(() => {
    if (!manageOpen) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (manageRef.current?.contains(target)) return
      setManageOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setManageOpen(false)
      manageRef.current?.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [manageOpen])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const mailbox = mailboxName.trim()
    if (!mailbox) return
    setMailboxName('')
    setManageOpen(false)
    await onAdd(mailbox)
    manageRef.current?.querySelector('summary')?.focus()
  }

  const closeTool = () => {
    setManageOpen(false)
    manageRef.current?.querySelector('summary')?.focus()
  }

  const toggleMailbox = (mailbox: string, selected: boolean) => {
    const next = new Set(selectedMailboxes)
    if (selected) next.add(mailbox)
    else next.delete(mailbox)
    onSelectionChange([...next])
  }

  return (
    <>
      <label className="mailbox-live-toggle">
        <input
          type="checkbox"
          checked={liveAllMailboxes}
          disabled={actionPending}
          onChange={(event) =>
            onLiveAllMailboxesChange(event.currentTarget.checked)
          }
        />
        <span>Live all active mailboxes</span>
      </label>
      <details
        ref={manageRef}
        className="mailbox-tool mailbox-manage-tool"
        open={manageOpen}
        onToggle={(event) => setManageOpen(event.currentTarget.open)}
      >
        <summary aria-label="Manage saved mailboxes">Mailboxes</summary>
        {manageOpen ? (
          <section
            className="mailbox-selector"
            aria-labelledby="saved-mailboxes-title"
          >
            <div className="mailbox-tool-dialog-heading">
              <h2 id="saved-mailboxes-title">Saved mailboxes</h2>
              <button
                className="list-filter-close mailbox-tool-close"
                type="button"
                aria-label="Close saved mailboxes"
                title="Close saved mailboxes"
                onClick={closeTool}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mailbox-selector-controls">
              <div className="mailbox-selector-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={actionPending || !hasMailboxes || allSelected}
                  onClick={() => onSelectionChange(mailboxes)}
                >
                  Select all
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={actionPending || !hasSelection}
                  onClick={() => onSelectionChange([])}
                >
                  Clear
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={actionPending || !hasSelection}
                  onClick={onArchive}
                >
                  Archive selected
                </button>
              </div>
              <form
                className="mailbox-selector-add"
                aria-label="Add mailbox"
                onSubmit={submit}
              >
                <input
                  id="mailbox-name"
                  name="mailbox"
                  aria-label="Mailbox name"
                  placeholder="Mailbox name"
                  autoComplete="off"
                  required
                  value={mailboxName}
                  onChange={(event) =>
                    setMailboxName(event.currentTarget.value)
                  }
                />
                <button
                  className="button button-primary"
                  type="submit"
                  aria-label="Add and open mailbox"
                >
                  Add
                </button>
              </form>
            </div>
            <div
              className="mailbox-options"
              role="group"
              aria-labelledby="saved-mailboxes-title"
            >
              {mailboxes.length ? (
                mailboxes.map((mailbox) => (
                  <label className="mailbox-option" key={mailbox}>
                    <input
                      type="checkbox"
                      value={mailbox}
                      checked={selectedMailboxes.includes(mailbox)}
                      disabled={actionPending}
                      onChange={(event) =>
                        toggleMailbox(mailbox, event.currentTarget.checked)
                      }
                    />
                    <span title={mailbox}>{mailbox}</span>
                  </label>
                ))
              ) : (
                <p className="mailbox-options-empty">
                  No saved mailboxes yet. Enter a mailbox name above to open it.
                </p>
              )}
            </div>
          </section>
        ) : null}
      </details>
    </>
  )
}
