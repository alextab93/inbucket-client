import { useEffect, useRef, useState } from 'react'
import { api, isAbort, isUnauthorized, visibleError } from '../api'
import { dateText, fileSizeText, formatValue, headerValue } from '../formatting'
import type {
  Attachment,
  ParsedMessage,
  SelectedMessage,
  StatusValue,
  Tag,
} from '../types'
import { EmailRenderer } from './EmailRenderer'
import { TagAction, TagBadges } from './MessageTags'
import { StarButton } from './StarButton'
import { StatusMessage } from './StatusMessage'

interface MessageInspectorProps {
  selected: SelectedMessage | null
  emptyMessage: string
  onUnauthorized: () => void
  onRead: (mailbox: string, id: string) => void
  starred: boolean
  starPending: boolean
  onClose: () => void
  onStarChange: (mailbox: string, id: string, starred: boolean) => Promise<void>
  onDeleted: () => Promise<void>
  trashMode?: boolean
  onTrashed?: () => Promise<void>
  onRestored?: () => Promise<void>
  tags: Tag[]
  tagPending: boolean
  onTagChange: (
    mailbox: string,
    id: string,
    tag: Tag,
    assigned: boolean,
  ) => Promise<Tag[]>
  onCreateTag: (name: string, color: string) => Promise<Tag>
  onUpdateTag: (tag: Tag, name: string, color: string) => Promise<Tag>
  onDeleteTag: (tag: Tag) => Promise<void>
}

export const MessageInspector = ({
  selected,
  emptyMessage,
  onUnauthorized,
  onRead,
  starred,
  starPending,
  onClose,
  onStarChange,
  onDeleted,
  trashMode = false,
  onTrashed,
  onRestored,
  tags,
  tagPending,
  onTagChange,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: MessageInspectorProps) => {
  const [message, setMessage] = useState<ParsedMessage | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loadMessage, setLoadMessage] = useState(emptyMessage)
  const [messageStatus, setMessageStatus] = useState<StatusValue>({
    message: '',
  })
  const [source, setSource] = useState('')
  const [sourceVisible, setSourceVisible] = useState(false)
  const [sourcePending, setSourcePending] = useState(false)
  const [sourceStatus, setSourceStatus] = useState<StatusValue>({ message: '' })
  const [deletePending, setDeletePending] = useState(false)
  const [trashPending, setTrashPending] = useState(false)
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const sourceController = useRef<AbortController | null>(null)

  useEffect(() => {
    if (selected) backButtonRef.current?.focus()
  }, [selected?.mailbox, selected?.id])

  useEffect(() => {
    sourceController.current?.abort()
    sourceController.current = null
    setMessage(null)
    setAttachments([])
    setMessageStatus({ message: '' })
    setSource('')
    setSourceVisible(false)
    setSourcePending(false)
    setSourceStatus({ message: '' })
    if (!selected) {
      setLoadMessage(emptyMessage)
      return
    }
    if (selected.unavailable) {
      setLoadMessage('The message was not found.')
      return
    }

    const controller = new AbortController()
    const mailbox = selected.mailbox
    const id = selected.id
    setLoadMessage('Loading message.')

    const load = async () => {
      try {
        const parsed = await api.message(mailbox, id, controller.signal)
        setMessage(parsed)
        setLoadMessage('')

        void api
          .attachments(mailbox, id, controller.signal)
          .then((items) => {
            if (Array.isArray(items)) setAttachments(items)
            else {
              setMessageStatus({
                message: 'The attachment list response was invalid.',
                state: 'error',
              })
            }
          })
          .catch((error: unknown) => {
            if (isAbort(error)) return
            if (isUnauthorized(error)) return onUnauthorized()
            setMessageStatus({
              message: visibleError(error, 'The attachments'),
              state: 'error',
            })
          })

        try {
          await api.markRead(mailbox, id, controller.signal)
          onRead(mailbox, id)
        } catch (error) {
          if (isAbort(error)) return
          if (isUnauthorized(error)) return onUnauthorized()
          setMessageStatus({
            message:
              'The message remains unread because its read state could not be updated.',
            state: 'error',
          })
        }
      } catch (error) {
        if (isAbort(error)) return
        if (isUnauthorized(error)) return onUnauthorized()
        setLoadMessage(visibleError(error, 'The message'))
      }
    }

    void load()
    return () => controller.abort()
  }, [
    selected?.mailbox,
    selected?.id,
    selected?.unavailable,
    emptyMessage,
    onRead,
    onUnauthorized,
  ])

  useEffect(
    () => () => {
      sourceController.current?.abort()
    },
    [],
  )

  const toggleSource = async () => {
    if (!selected) return
    if (sourceVisible) {
      setSourceVisible(false)
      return
    }
    if (source) {
      setSourceVisible(true)
      return
    }
    const controller = new AbortController()
    sourceController.current?.abort()
    sourceController.current = controller
    setSourcePending(true)
    setSourceStatus({ message: 'Loading message source.', state: 'loading' })
    try {
      const value = await api.messageSource(
        selected.mailbox,
        selected.id,
        controller.signal,
      )
      setSource(value)
      setSourceVisible(true)
      setSourceStatus({ message: '' })
    } catch (error) {
      if (isAbort(error)) return
      if (isUnauthorized(error)) return onUnauthorized()
      setSourceStatus({
        message: visibleError(error, 'The message source'),
        state: 'error',
      })
    } finally {
      if (sourceController.current === controller) {
        sourceController.current = null
        setSourcePending(false)
      }
    }
  }

  const deleteMessage = async () => {
    if (!selected || !window.confirm('Delete this message permanently?')) return
    setDeletePending(true)
    setMessageStatus({ message: 'Deleting message.', state: 'loading' })
    try {
      await api.deleteMessage(selected.mailbox, selected.id)
      setMessage(null)
      setAttachments([])
      setLoadMessage('Message deleted.')
      setMessageStatus({ message: '' })
      await onDeleted()
    } catch (error) {
      if (isUnauthorized(error)) return onUnauthorized()
      setMessageStatus({
        message: visibleError(error, 'The message'),
        state: 'error',
      })
    } finally {
      setDeletePending(false)
    }
  }

  const changeTrashed = async (trashed: boolean) => {
    if (!selected) return
    setTrashPending(true)
    setMessageStatus({
      message: trashed ? 'Moving message to Trash.' : 'Restoring message.',
      state: 'loading',
    })
    try {
      const result = await api.setTrashed(
        selected.mailbox,
        selected.id,
        trashed,
      )
      if (result.trashed !== trashed) throw new Error('invalid_response')
      setMessageStatus({ message: '' })
      if (trashed) await onTrashed?.()
      else await onRestored?.()
    } catch (error) {
      if (isUnauthorized(error)) return onUnauthorized()
      setMessageStatus({
        message: trashed
          ? 'The message could not be moved to Trash. Please try again.'
          : 'The message could not be restored. Please try again.',
        state: 'error',
      })
    } finally {
      setTrashPending(false)
    }
  }

  const html = message?.body ? formatValue(message.body.html) : ''
  const text = message?.body ? formatValue(message.body.text) : ''
  const subject = message
    ? formatValue(message.subject) || '(No subject)'
    : '(No subject)'

  const changeTag = async (tag: Tag, assigned: boolean) => {
    if (!selected) return
    const nextTags = await onTagChange(
      selected.mailbox,
      selected.id,
      tag,
      assigned,
    )
    setMessage((current) =>
      current ? { ...current, tags: nextTags } : current,
    )
  }

  return (
    <article className="message-panel" aria-label="Message inspector">
      {selected ? (
        <div
          className="message-action-bar"
          role="toolbar"
          aria-label="Message actions"
        >
          <button
            ref={backButtonRef}
            className="message-action-button"
            type="button"
            aria-label="Back to message list"
            title="Back to message list"
            onClick={onClose}
          >
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
              <path d="m14 6-6 6 6 6M8 12h11" />
            </svg>
          </button>
          {message || trashMode ? (
            <div className="message-action-group">
              {message ? (
                <>
                  <TagAction
                    tags={tags}
                    assigned={message.tags || []}
                    pending={tagPending}
                    onToggle={changeTag}
                    onCreate={onCreateTag}
                    onUpdate={async (tag, name, color) => {
                      const updated = await onUpdateTag(tag, name, color)
                      setMessage((current) =>
                        current
                          ? {
                              ...current,
                              tags: current.tags?.map((value) =>
                                value.id === updated.id ? updated : value,
                              ),
                            }
                          : current,
                      )
                      return updated
                    }}
                    onDelete={async (tag) => {
                      await onDeleteTag(tag)
                      setMessage((current) =>
                        current
                          ? {
                              ...current,
                              tags: current.tags?.filter(
                                (value) => value.id !== tag.id,
                              ),
                            }
                          : current,
                      )
                    }}
                  />
                  <StarButton
                    starred={starred}
                    label={subject}
                    pending={starPending}
                    className="message-inspector-star"
                    onChange={(value) =>
                      void onStarChange(selected.mailbox, selected.id, value)
                    }
                  />
                </>
              ) : null}
              <button
                className="message-action-button message-text-action"
                type="button"
                disabled={trashPending || deletePending}
                onClick={() => void changeTrashed(!trashMode)}
              >
                {trashMode ? 'Restore' : 'Move to trash'}
              </button>
              <button
                className="message-action-button message-delete-action"
                type="button"
                aria-label="Delete permanently"
                title="Delete permanently"
                disabled={deletePending || trashPending}
                onClick={deleteMessage}
              >
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <StatusMessage value={messageStatus} />
      {!message ? <div className="message-empty">{loadMessage}</div> : null}
      {message && selected ? (
        <div className="message-inspector-content">
          <header className="message-header">
            <h2 title={subject}>{subject}</h2>
            <div className="message-header-details">
              <dl>
                <div>
                  <dt>From</dt>
                  <dd>
                    {formatValue(message.from) ||
                      headerValue(message, 'from') ||
                      'Unknown sender'}
                  </dd>
                </div>
                <div>
                  <dt>To</dt>
                  <dd>
                    {formatValue(message.to) ||
                      headerValue(message, 'to') ||
                      'Unknown recipient'}
                  </dd>
                </div>
              </dl>
              <div className="message-header-aside">
                <time className="message-header-date">
                  {dateText(message.date || headerValue(message, 'date'))}
                </time>
                <TagBadges tags={message.tags || []} />
              </div>
            </div>
          </header>
          <EmailRenderer
            html={html}
            text={text}
            mailbox={selected.mailbox}
            messageId={selected.id}
          />
          {attachments.length ? (
            <section
              className="message-attachments"
              aria-labelledby="message-attachments-title"
            >
              <div className="message-attachments-heading">
                <h3 id="message-attachments-title">Attachments</h3>
                <span>{attachments.length}</span>
              </div>
              <ul>
                {attachments.map((attachment) => {
                  const filename = attachment.filename || 'attachment'
                  const contentType =
                    attachment.content_type || 'application/octet-stream'
                  const size = fileSizeText(attachment.size)
                  return (
                    <li key={attachment.index}>
                      <a
                        href={api.attachmentUrl(
                          selected.mailbox,
                          selected.id,
                          attachment.index,
                        )}
                        aria-label={`Download ${filename}`}
                      >
                        <span
                          className="message-attachment-icon"
                          aria-hidden="true"
                        >
                          <svg focusable="false" viewBox="0 0 24 24">
                            <path d="M7 3h7l4 4v14H7zM14 3v5h5" />
                          </svg>
                        </span>
                        <span className="message-attachment-details">
                          <strong>{filename}</strong>
                          <span className="message-attachment-metadata">
                            <span>{contentType}</span>
                            {size ? <span>{size}</span> : null}
                          </span>
                        </span>
                        <span
                          className="message-attachment-download"
                          aria-hidden="true"
                        >
                          <svg focusable="false" viewBox="0 0 24 24">
                            <path d="M12 4v11M8 11l4 4 4-4M5 20h14" />
                          </svg>
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
          <button
            className="source-toggle"
            type="button"
            aria-expanded={sourceVisible}
            disabled={sourcePending}
            onClick={toggleSource}
          >
            {sourceVisible ? 'Hide source' : 'View source'}
          </button>
          <StatusMessage value={sourceStatus} />
          {sourceVisible ? (
            <pre className="message-source">{source}</pre>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
