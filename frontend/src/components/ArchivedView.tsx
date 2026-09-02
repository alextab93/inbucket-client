import { useState } from 'react'
import { isUnauthorized, visibleError } from '../api'
import type { ArchivedMailbox, StatusValue } from '../types'
import { StatusMessage } from './StatusMessage'

interface ArchivedViewProps {
  active: boolean
  mailboxes: ArchivedMailbox[]
  loading: boolean
  catalogError: string
  onRestore: (mailbox: string) => Promise<void>
  onDelete: (mailbox: string) => Promise<void>
  onUnauthorized: () => void
}

export const ArchivedView = ({
  active,
  mailboxes,
  loading,
  catalogError,
  onRestore,
  onDelete,
  onUnauthorized,
}: ArchivedViewProps) => {
  const [actingMailbox, setActingMailbox] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<StatusValue>({
    message: '',
  })

  const restore = async (mailbox: string) => {
    setActingMailbox(mailbox)
    setActionStatus({ message: `Restoring ${mailbox}.`, state: 'loading' })
    try {
      await onRestore(mailbox)
      setActionStatus({
        message: `Restored ${mailbox}.`,
        state: 'authenticated',
      })
    } catch (error) {
      if (isUnauthorized(error)) return onUnauthorized()
      setActionStatus({
        message: visibleError(error, `The mailbox ${mailbox}`),
        state: 'error',
      })
    } finally {
      setActingMailbox(null)
    }
  }

  const remove = async (mailbox: string) => {
    if (
      !window.confirm(
        `Permanently delete mailbox ${mailbox} and all of its messages?`,
      )
    ) {
      return
    }
    setActingMailbox(mailbox)
    setActionStatus({ message: `Deleting ${mailbox}.`, state: 'loading' })
    try {
      await onDelete(mailbox)
      setActionStatus({
        message: `Deleted ${mailbox}.`,
        state: 'authenticated',
      })
    } catch (error) {
      if (isUnauthorized(error)) return onUnauthorized()
      setActionStatus({
        message: visibleError(error, `The mailbox ${mailbox}`),
        state: 'error',
      })
    } finally {
      setActingMailbox(null)
    }
  }

  return (
    <section
      className="archive-view"
      aria-labelledby="archived-mailboxes-title"
      hidden={!active}
      aria-busy={loading}
    >
      <header className="archive-view-heading">
        <div className="archive-view-title">
          <h2 id="archived-mailboxes-title" tabIndex={-1}>
            Archived mailboxes
          </h2>
          <span className="archive-view-count" aria-live="polite">
            {`${mailboxes.length} ${mailboxes.length === 1 ? 'archived mailbox' : 'archived mailboxes'}`}
          </span>
        </div>
        <p>
          Restore a mailbox to return it to the main selector. Permanent
          deletion removes every message and requires confirmation.
        </p>
      </header>
      <StatusMessage
        value={{
          message:
            catalogError || (loading ? 'Loading archived mailboxes.' : ''),
          state: catalogError ? 'error' : loading ? 'loading' : undefined,
        }}
      />
      <StatusMessage value={actionStatus} />
      <div className="archived-mailbox-options">
        {!loading && !catalogError && !mailboxes.length ? (
          <p className="mailbox-options-empty">No archived mailboxes.</p>
        ) : null}
        {mailboxes.map((mailbox) => (
          <div className="archived-mailbox-option" key={mailbox.name}>
            <div>
              <strong>{mailbox.name}</strong>
              <p>
                {mailbox.message_count === null
                  ? 'Message count unavailable.'
                  : `${mailbox.message_count} ${
                      mailbox.message_count === 1 ? 'message' : 'messages'
                    }.`}
              </p>
            </div>
            <div className="archived-mailbox-actions">
              <button
                className="button button-secondary"
                type="button"
                aria-label={`Restore ${mailbox.name}`}
                disabled={actingMailbox === mailbox.name}
                onClick={() => void restore(mailbox.name)}
              >
                Restore
              </button>
              <button
                className="button button-danger"
                type="button"
                aria-label={`Delete ${mailbox.name} permanently`}
                disabled={actingMailbox === mailbox.name}
                onClick={() => void remove(mailbox.name)}
              >
                Delete mailbox
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
