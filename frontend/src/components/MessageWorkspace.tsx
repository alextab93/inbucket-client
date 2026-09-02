import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  accessibleSummary,
  compactDateText,
  dateText,
  emptyListText,
  filterMessages,
  formatValue,
  sortMessages,
} from '../formatting'
import type {
  ListSort,
  MessageListQuery,
  MessageSummary,
  ReadFilter,
  SelectedMessage,
  StatusValue,
  Tag,
} from '../types'
import { ListControls } from './ListControls'
import { StarButton } from './StarButton'
import { MessageInspector } from './MessageInspector'
import { StatusMessage } from './StatusMessage'
import { TagBadges } from './MessageTags'

interface MessageWorkspaceProps {
  messages: MessageSummary[]
  selected: SelectedMessage | null
  loading: boolean
  listEmptyMessage: string
  inspectorEmptyMessage: string
  controlsId?: string
  headingId?: string
  heading?: string
  status?: StatusValue
  mailboxOptions?: string[]
  tags?: Tag[]
  query?: MessageListQuery
  hasMore?: boolean
  totalCount?: number
  loadingMore?: boolean
  paginationResetKey?: string
  mobileToolbarExpanded?: boolean
  onMobileToolbarToggle?: () => void
  toolbarAction?: ReactNode
  onQueryChange?: (query: MessageListQuery) => void
  onLoadMore?: () => void
  onSelectMessage: (mailbox: string, id: string) => void
  onCloseMessage: () => void
  onUnauthorized: () => void
  onRead: (mailbox: string, id: string) => void
  starPending: (mailbox: string, id: string) => boolean
  onStarChange: (mailbox: string, id: string, starred: boolean) => Promise<void>
  onDeleted: () => Promise<void>
  trashMode?: boolean
  onTrashed?: () => Promise<void>
  onRestored?: () => Promise<void>
  showTagFilter?: boolean
  showDateFilter?: boolean
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

export const MessageWorkspace = ({
  messages,
  selected,
  loading,
  listEmptyMessage,
  inspectorEmptyMessage,
  controlsId = 'message',
  headingId = 'mailbox-title',
  heading = 'Messages',
  status = { message: '' },
  mailboxOptions = [],
  tags = [],
  query,
  hasMore = false,
  totalCount,
  loadingMore = false,
  paginationResetKey = '',
  mobileToolbarExpanded = false,
  onMobileToolbarToggle,
  toolbarAction,
  onQueryChange,
  onLoadMore,
  onSelectMessage,
  onCloseMessage,
  onUnauthorized,
  onRead,
  starPending,
  onStarChange,
  onDeleted,
  trashMode = false,
  onTrashed,
  onRestored,
  showTagFilter = true,
  showDateFilter = true,
  tagPending,
  onTagChange,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: MessageWorkspaceProps) => {
  const [search, setSearch] = useState('')
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')
  const [mailbox, setMailbox] = useState('')
  const [tag, setTag] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<ListSort>('newest')
  const hadSelection = useRef(Boolean(selected))
  const messageListRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const scrollGeneration = useRef(0)
  const loadedScrollGeneration = useRef(0)
  const lastScrollTop = useRef(0)
  const activeQuery = query || {
    search,
    read: readFilter,
    mailbox,
    tag,
    dateFrom,
    dateTo,
    sort,
  }
  const hasActiveQuery = Boolean(
    activeQuery.search.trim() ||
    activeQuery.read !== 'all' ||
    activeQuery.mailbox ||
    activeQuery.tag ||
    activeQuery.dateFrom ||
    activeQuery.dateTo,
  )
  const visibleMessages = query
    ? messages
    : sortMessages(
        filterMessages(
          messages,
          search,
          readFilter,
          mailbox,
          tag,
          dateFrom,
          dateTo,
        ),
        sort,
      )
  const selectedMessage = selected
    ? messages.find(
        (message) =>
          message.mailbox === selected.mailbox &&
          String(message.id) === selected.id,
      )
    : undefined
  const showsMailbox =
    new Set(messages.map((message) => message.mailbox)).size > 1
  const layoutClass = [
    'mailbox-layout',
    selected ? 'message-inspector-open' : 'message-list-expanded',
    !selected && showsMailbox ? 'message-list-multi-mailbox' : '',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (hadSelection.current && !selected) {
      document.getElementById(headingId)?.focus()
    }
    hadSelection.current = Boolean(selected)
  }, [headingId, selected])

  useLayoutEffect(() => {
    const messageList = messageListRef.current
    if (messageList) messageList.scrollTop = 0
    lastScrollTop.current = 0
    scrollGeneration.current = 0
    loadedScrollGeneration.current = 0
  }, [paginationResetKey])

  useEffect(() => {
    if (
      !hasMore ||
      loadingMore ||
      !onLoadMore ||
      !messageListRef.current ||
      !loadMoreRef.current ||
      typeof IntersectionObserver === 'undefined'
    )
      return

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((entry) => entry.isIntersecting)
        if (
          !isIntersecting ||
          scrollGeneration.current <= loadedScrollGeneration.current
        )
          return
        loadedScrollGeneration.current = scrollGeneration.current
        onLoadMore()
      },
      { root: messageListRef.current },
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore])

  useEffect(() => {
    if (!query && tag && !tags.some((value) => String(value.id) === tag)) {
      setTag('')
    }
  }, [query, tag, tags])

  const updateQuery = (next: Partial<MessageListQuery>) => {
    const value = { ...activeQuery, ...next }
    if (onQueryChange) onQueryChange(value)
  }

  return (
    <div className={layoutClass}>
      <section
        className="message-list-panel"
        aria-labelledby={headingId}
        hidden={Boolean(selected)}
      >
        <div
          className={`message-list-heading${onMobileToolbarToggle ? ' has-mailbox-toolbar-trigger' : ''}${toolbarAction ? ' has-toolbar-action' : ''}`}
        >
          <h2 id={headingId} tabIndex={-1}>
            {heading}
          </h2>
          {onMobileToolbarToggle ? (
            <button
              className="mailbox-toolbar-trigger"
              type="button"
              aria-label={`${mobileToolbarExpanded ? 'Hide' : 'Show'} mailbox controls`}
              title={`${mobileToolbarExpanded ? 'Hide' : 'Show'} mailbox controls`}
              aria-expanded={mobileToolbarExpanded}
              aria-controls="mailbox-controls"
              onClick={onMobileToolbarToggle}
            >
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                <path
                  d={mobileToolbarExpanded ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'}
                />
              </svg>
            </button>
          ) : null}
          <ListControls
            id={controlsId}
            search={activeQuery.search}
            readFilter={activeQuery.read}
            mailbox={activeQuery.mailbox}
            mailboxOptions={mailboxOptions}
            tag={activeQuery.tag}
            tags={tags}
            dateFrom={activeQuery.dateFrom}
            dateTo={activeQuery.dateTo}
            sort={activeQuery.sort}
            searchLabel="Search messages"
            searchPlaceholder="Search messages"
            triggerLabel="Filter and sort messages"
            showTagFilter={showTagFilter}
            showDateFilter={showDateFilter}
            onSearchChange={(value) => {
              setSearch(value)
              updateQuery({ search: value })
            }}
            onReadFilterChange={(value) => {
              setReadFilter(value)
              updateQuery({ read: value })
            }}
            onMailboxChange={(value) => {
              setMailbox(value)
              updateQuery({ mailbox: value })
            }}
            onTagChange={(value) => {
              setTag(value)
              updateQuery({ tag: value })
            }}
            onDateFromChange={(value) => {
              setDateFrom(value)
              updateQuery({ dateFrom: value })
            }}
            onDateToChange={(value) => {
              setDateTo(value)
              updateQuery({ dateTo: value })
            }}
            onDateRangeClear={() => {
              setDateFrom('')
              setDateTo('')
              updateQuery({ dateFrom: '', dateTo: '' })
            }}
            onSortChange={(value) => {
              setSort(value)
              updateQuery({ sort: value })
            }}
          />
          {toolbarAction}
        </div>
        <StatusMessage value={status} className="message-list-status" />
        <div
          ref={messageListRef}
          className="message-list"
          onScroll={(event) => {
            const scrollTop = event.currentTarget.scrollTop
            if (scrollTop > lastScrollTop.current) {
              scrollGeneration.current += 1
            }
            lastScrollTop.current = scrollTop
          }}
        >
          {loading ? (
            <p className="message-list-empty">Loading messages.</p>
          ) : null}
          {!loading && !messages.length ? (
            <p className="message-list-empty">
              {query && hasActiveQuery
                ? emptyListText(
                    'messages',
                    activeQuery.search,
                    activeQuery.read,
                    activeQuery.mailbox,
                    activeQuery.tag,
                    activeQuery.dateFrom,
                    activeQuery.dateTo,
                  )
                : listEmptyMessage}
            </p>
          ) : null}
          {!loading && messages.length > 0 && !visibleMessages.length ? (
            <p className="message-list-empty">
              {emptyListText(
                'messages',
                activeQuery.search,
                activeQuery.read,
                activeQuery.mailbox,
                activeQuery.tag,
                activeQuery.dateFrom,
                activeQuery.dateTo,
              )}
            </p>
          ) : null}
          {!loading
            ? visibleMessages.map((message) => {
                const id = String(message.id)
                const read = message.seen === true
                const current =
                  selected?.mailbox === message.mailbox && selected.id === id
                const summary = accessibleSummary(message)
                const fullDate = dateText(message.date)
                return (
                  <div
                    key={`${message.mailbox}\u0000${id}`}
                    className={`message-summary ${read ? 'read' : 'unread'}${current ? ' selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="message-summary-open"
                      aria-label={`${read ? 'Read' : 'Unread'}: ${summary}`}
                      aria-current={current ? 'true' : undefined}
                      onClick={() => onSelectMessage(message.mailbox, id)}
                    >
                      <span className="message-summary-subject">
                        <TagBadges tags={message.tags || []} maxVisible={1} />
                        <strong>
                          {formatValue(message.subject) || '(No subject)'}
                        </strong>
                      </span>
                      <span className="message-summary-sender">
                        {formatValue(message.from) || 'Unknown sender'}
                      </span>
                      <span className="message-summary-mailbox">
                        {message.mailbox}
                      </span>
                      <time aria-label={fullDate}>
                        <span
                          className="message-summary-date-full"
                          aria-hidden="true"
                        >
                          {fullDate}
                        </span>
                        <span
                          className="message-summary-date-compact"
                          aria-hidden="true"
                        >
                          {compactDateText(message.date)}
                        </span>
                      </time>
                    </button>
                    <StarButton
                      starred={message.starred === true}
                      label={formatValue(message.subject) || '(No subject)'}
                      pending={starPending(message.mailbox, id)}
                      className="message-summary-star"
                      onChange={(starred) =>
                        void onStarChange(message.mailbox, id, starred)
                      }
                    />
                  </div>
                )
              })
            : null}
          {typeof totalCount === 'number' && totalCount > 0 ? (
            <div ref={loadMoreRef} className="message-list-progress">
              <p aria-live="polite">
                Showing {visibleMessages.length} of {totalCount}{' '}
                {totalCount === 1 ? 'message' : 'messages'}
              </p>
              {hasMore ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => {
                    loadedScrollGeneration.current = scrollGeneration.current
                    onLoadMore?.()
                  }}
                >
                  {loadingMore
                    ? 'Loading more messages.'
                    : 'Load more messages'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
      {selected ? (
        <MessageInspector
          selected={selected}
          emptyMessage={inspectorEmptyMessage}
          onUnauthorized={onUnauthorized}
          onRead={onRead}
          starred={selectedMessage?.starred === true}
          starPending={starPending(selected.mailbox, selected.id)}
          onClose={onCloseMessage}
          onStarChange={onStarChange}
          onDeleted={onDeleted}
          trashMode={trashMode}
          onTrashed={onTrashed}
          onRestored={onRestored}
          tags={tags}
          tagPending={tagPending}
          onTagChange={onTagChange}
          onCreateTag={onCreateTag}
          onUpdateTag={onUpdateTag}
          onDeleteTag={onDeleteTag}
        />
      ) : null}
    </div>
  )
}
