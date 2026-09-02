import { useCallback, useEffect, useRef, useState } from 'react'
import { api, isAbort, isUnauthorized, visibleError } from '../api'
import { readLocation, writeLocation } from '../location'
import type {
  MessageListQuery,
  MessageSummary,
  SelectedMessage,
  StatusValue,
  Tag,
  TrashResult,
} from '../types'
import { MessageWorkspace } from './MessageWorkspace'
import { StatusMessage } from './StatusMessage'

interface TrashViewProps {
  active: boolean
  onUnauthorized: () => void
  onRead: (mailbox: string, id: string) => void
  onRestoredMessage: (message: MessageSummary) => void
  starPending: (mailbox: string, id: string) => boolean
  onStarChange: (mailbox: string, id: string, starred: boolean) => Promise<void>
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

const defaultQuery: MessageListQuery = {
  search: '',
  read: 'all',
  mailbox: '',
  tag: '',
  dateFrom: '',
  dateTo: '',
  sort: 'newest',
}

const validResults = (value: unknown): value is TrashResult[] =>
  Array.isArray(value) &&
  value.every(
    (result) =>
      result &&
      typeof result.mailbox === 'string' &&
      typeof result.id === 'string' &&
      typeof result.deleted === 'boolean' &&
      (result.error === null || typeof result.error === 'string'),
  )

export const TrashView = ({
  active,
  onUnauthorized,
  onRead,
  onRestoredMessage,
  starPending,
  onStarChange,
  tags,
  tagPending,
  onTagChange,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: TrashViewProps) => {
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [mailboxes, setMailboxes] = useState<string[]>([])
  const [selected, setSelected] = useState<SelectedMessage | null>(null)
  const [query, setQuery] = useState(defaultQuery)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [trashCount, setTrashCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [emptying, setEmptying] = useState(false)
  const [status, setStatus] = useState<StatusValue>({ message: '' })
  const [outcomes, setOutcomes] = useState<string[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  const markRead = useCallback(
    (mailbox: string, id: string) => {
      setMessages((current) =>
        current.map((message) =>
          message.mailbox === mailbox && String(message.id) === id
            ? { ...message, seen: true }
            : message,
        ),
      )
      onRead(mailbox, id)
    },
    [onRead],
  )

  useEffect(() => {
    if (!active) return
    const restoreSelection = () => {
      const location = readLocation()
      setSelected(
        location.view === 'trash' && location.mailbox && location.message
          ? { mailbox: location.mailbox, id: location.message }
          : null,
      )
    }
    restoreSelection()
    window.addEventListener('popstate', restoreSelection)
    return () => window.removeEventListener('popstate', restoreSelection)
  }, [active])

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => {
      const controller = new AbortController()
      controllerRef.current?.abort()
      controllerRef.current = controller
      setLoading(true)
      setOutcomes([])
      void api
        .trashMessages(query, null, controller.signal)
        .then((page) => {
          if (!Array.isArray(page.messages)) throw new Error('invalid_response')
          setMessages(page.messages)
          setMailboxes(Array.isArray(page.mailboxes) ? page.mailboxes : [])
          setNextCursor(page.next_cursor)
          setTotalCount(page.total_count)
          setTrashCount(
            typeof page.trash_count === 'number'
              ? page.trash_count
              : page.total_count,
          )
          setSelected((current) => {
            if (!current) return null
            const summary = page.messages.find(
              (message) =>
                message.mailbox === current.mailbox &&
                String(message.id) === current.id,
            )
            return summary?.available === false
              ? { ...current, unavailable: true }
              : current
          })
          setStatus({ message: '' })
        })
        .catch((error: unknown) => {
          if (isAbort(error)) return
          if (isUnauthorized(error)) return onUnauthorized()
          setStatus({
            message: visibleError(error, 'Trash'),
            state: 'error',
          })
        })
        .finally(() => {
          if (controllerRef.current === controller) {
            controllerRef.current = null
            setLoading(false)
          }
        })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [active, onUnauthorized, query])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const removeSelected = (message: string) => {
    if (!selected) return
    const removed = selected
    setMessages((current) =>
      current.filter(
        (value) =>
          value.mailbox !== removed.mailbox || String(value.id) !== removed.id,
      ),
    )
    setTotalCount((current) => Math.max(0, current - 1))
    setTrashCount((current) => Math.max(0, current - 1))
    setSelected(null)
    setStatus({ message, state: 'authenticated' })
    writeLocation({ view: 'trash', mailbox: '', message: '' })
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await api.trashMessages(query, nextCursor)
      setMessages((current) => [...current, ...page.messages])
      setNextCursor(page.next_cursor)
      setTotalCount(page.total_count)
    } catch (error) {
      if (isUnauthorized(error)) return onUnauthorized()
      setStatus({
        message: 'More Trash messages could not be loaded. Please try again.',
        state: 'error',
      })
    } finally {
      setLoadingMore(false)
    }
  }

  const emptyTrash = async () => {
    if (
      trashCount === 0 ||
      !window.confirm('Permanently delete every message in Trash?')
    )
      return
    setEmptying(true)
    setOutcomes([])
    setStatus({ message: 'Emptying Trash.', state: 'loading' })
    try {
      const result = await api.emptyTrash()
      if (!validResults(result.results)) throw new Error('invalid_response')
      const deletedKeys = new Set(
        result.results
          .filter((item) => item.deleted)
          .map((item) => `${item.mailbox}\u0000${item.id}`),
      )
      setMessages((current) =>
        current.filter(
          (message) =>
            !deletedKeys.has(`${message.mailbox}\u0000${String(message.id)}`),
        ),
      )
      setTotalCount((current) => Math.max(0, current - deletedKeys.size))
      setTrashCount((current) => Math.max(0, current - deletedKeys.size))
      setOutcomes(
        result.results.map((item) =>
          item.deleted
            ? `${item.mailbox}/${item.id}: Deleted permanently.`
            : `${item.mailbox}/${item.id}: Could not be deleted. Retry is available.`,
        ),
      )
      const failed = result.results.filter((item) => !item.deleted).length
      setStatus({
        message: failed
          ? `${failed} ${failed === 1 ? 'message remains' : 'messages remain'} in Trash.`
          : 'Trash emptied.',
        state: failed ? 'error' : 'authenticated',
      })
      if (
        selected &&
        deletedKeys.has(`${selected.mailbox}\u0000${selected.id}`)
      ) {
        setSelected(null)
        writeLocation({ view: 'trash', mailbox: '', message: '' })
      }
    } catch (error) {
      if (isUnauthorized(error)) return onUnauthorized()
      setStatus({
        message: 'Trash could not be emptied. No success was assumed.',
        state: 'error',
      })
    } finally {
      setEmptying(false)
    }
  }

  return (
    <div className="trash-view" hidden={!active}>
      <StatusMessage value={status} />
      {outcomes.length ? (
        <ul className="trash-outcomes" aria-label="Empty trash results">
          {outcomes.map((outcome) => (
            <li key={outcome}>{outcome}</li>
          ))}
        </ul>
      ) : null}
      <MessageWorkspace
        messages={messages}
        selected={selected}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={Boolean(nextCursor)}
        totalCount={totalCount}
        query={query}
        mailboxOptions={mailboxes}
        tags={tags}
        controlsId="trash"
        headingId="trash-list-title"
        heading="Trashed messages"
        listEmptyMessage="Trash is empty."
        inspectorEmptyMessage="Select a trashed message to read it."
        status={{ message: '' }}
        trashMode
        showTagFilter={false}
        showDateFilter={false}
        toolbarAction={
          <button
            className="button button-danger trash-empty-action"
            type="button"
            disabled={emptying || trashCount === 0}
            onClick={() => void emptyTrash()}
          >
            Empty trash
          </button>
        }
        onQueryChange={setQuery}
        onLoadMore={() => void loadMore()}
        onSelectMessage={(mailbox, id) => {
          const summary = messages.find(
            (message) =>
              message.mailbox === mailbox && String(message.id) === id,
          )
          setSelected({
            mailbox,
            id,
            unavailable: summary?.available === false,
          })
          writeLocation({ view: 'trash', mailbox, message: id }, 'push')
        }}
        onCloseMessage={() => {
          setSelected(null)
          writeLocation({ view: 'trash', mailbox: '', message: '' })
        }}
        onUnauthorized={onUnauthorized}
        onRead={markRead}
        starPending={starPending}
        onStarChange={onStarChange}
        onTrashed={async () => {}}
        onRestored={async () => {
          const restored = selected
            ? messages.find(
                (message) =>
                  message.mailbox === selected.mailbox &&
                  String(message.id) === selected.id,
              )
            : undefined
          removeSelected('Message restored.')
          if (restored && restored.available !== false)
            onRestoredMessage(restored)
        }}
        onDeleted={async () => removeSelected('Message deleted permanently.')}
        tagPending={tagPending}
        onTagChange={onTagChange}
        onCreateTag={onCreateTag}
        onUpdateTag={onUpdateTag}
        onDeleteTag={onDeleteTag}
      />
    </div>
  )
}
