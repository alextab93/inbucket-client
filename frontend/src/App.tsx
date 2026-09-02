import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, isAbort, isUnauthorized, visibleError } from './api'
import { AccessScreen } from './components/AccessScreen'
import { AppHeader } from './components/AppHeader'
import { ArchivedView } from './components/ArchivedView'
import { MailboxTools } from './components/MailboxTools'
import { MessageWorkspace } from './components/MessageWorkspace'
import { StatusMessage } from './components/StatusMessage'
import { StarredView } from './components/StarredView'
import { TrashView } from './components/TrashView'
import { filterMessages, sortMessages } from './formatting'
import { readLocation, writeLocation, type AppLocation } from './location'
import type {
  ArchivedMailbox,
  AuthenticationState,
  LiveMessagePage,
  MessageListQuery,
  MessagePage,
  MessageSummary,
  SelectedMessage,
  Session,
  StatusValue,
  Tag,
  ViewName,
} from './types'

const defaultMailboxStatus: StatusValue = {
  message: 'Select one or more saved mailboxes, or add a mailbox name.',
  state: 'authenticated',
}

const defaultMessageQuery: MessageListQuery = {
  search: '',
  read: 'all',
  mailbox: '',
  tag: '',
  dateFrom: '',
  dateTo: '',
  sort: 'newest',
}

const normalizeMailboxNames = (mailboxes: string[]): string[] => [
  ...new Set(mailboxes.map((mailbox) => mailbox.trim()).filter(Boolean)),
]

const restoreAvailableMailboxes = (
  location: AppLocation,
  availableMailboxes: string[] | null,
): AppLocation => {
  if (location.view !== 'mailboxes' || availableMailboxes === null) {
    return location
  }

  const available = new Set(availableMailboxes)
  const selectedMailboxes = normalizeMailboxNames(
    location.selectedMailboxes || [],
  ).filter((mailbox) => available.has(mailbox))
  const selectedMessageMailbox = selectedMailboxes.includes(location.mailbox)
    ? location.mailbox
    : ''

  return {
    ...location,
    selectedMailboxes,
    mailbox:
      selectedMessageMailbox ||
      (selectedMailboxes.length === 1 ? selectedMailboxes[0] : ''),
    message: selectedMessageMailbox ? location.message : '',
  }
}

const messageKey = (mailbox: string, id: string): string =>
  `${mailbox}\u0000${id}`

const validActiveMailboxes = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((mailbox) => typeof mailbox === 'string')

const validArchivedMailboxes = (value: unknown): value is ArchivedMailbox[] =>
  Array.isArray(value) &&
  value.every(
    (mailbox) =>
      mailbox &&
      typeof mailbox === 'object' &&
      typeof mailbox.name === 'string' &&
      (typeof mailbox.message_count === 'number' ||
        mailbox.message_count === null),
  )

const validMessagePage = (value: unknown): value is MessagePage =>
  Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as MessagePage).messages) &&
    ((value as MessagePage).next_cursor === null ||
      typeof (value as MessagePage).next_cursor === 'string') &&
    Array.isArray((value as MessagePage).partial_mailboxes) &&
    (value as MessagePage).partial_mailboxes.every(
      (mailbox) => typeof mailbox === 'string',
    ) &&
    Number.isInteger((value as MessagePage).total_count) &&
    (value as MessagePage).total_count >= 0,
  )

const validLiveMessagePage = (value: unknown): value is LiveMessagePage =>
  Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as LiveMessagePage).changes) &&
    (value as LiveMessagePage).changes.every(
      (change) =>
        change &&
        typeof change.mailbox === 'string' &&
        typeof change.id === 'string' &&
        typeof change.available === 'boolean' &&
        typeof change.created === 'boolean' &&
        typeof change.archived === 'boolean' &&
        change.message &&
        typeof change.message === 'object',
    ) &&
    ((value as LiveMessagePage).active_mailboxes === undefined ||
      validActiveMailboxes((value as LiveMessagePage).active_mailboxes)) &&
    typeof (value as LiveMessagePage).cursor === 'string' &&
    typeof (value as LiveMessagePage).has_more === 'boolean',
  )

export const App = () => {
  const [authentication, setAuthentication] =
    useState<AuthenticationState>('checking')
  const [accessStatus, setAccessStatus] = useState<StatusValue>({
    message: 'Checking for an active session.',
    state: 'loading',
  })
  const [session, setSession] = useState<Session | null>(null)
  const [view, setView] = useState<ViewName>('mailboxes')
  const [signingOut, setSigningOut] = useState(false)
  const [mailboxes, setMailboxes] = useState<string[]>([])
  const [archivedMailboxes, setArchivedMailboxes] = useState<ArchivedMailbox[]>(
    [],
  )
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [liveError, setLiveError] = useState('')
  const [archivedCatalogError, setArchivedCatalogError] = useState('')
  const [selectedMailboxes, setSelectedMailboxes] = useState<string[]>([])
  const [liveAllMailboxes, setLiveAllMailboxes] = useState(true)
  const [mobileToolbarExpanded, setMobileToolbarExpanded] = useState(false)
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [mailboxLoading, setMailboxLoading] = useState(false)
  const [mailboxLoadingMore, setMailboxLoadingMore] = useState(false)
  const [messageQuery, setMessageQuery] =
    useState<MessageListQuery>(defaultMessageQuery)
  const [nextMessageCursor, setNextMessageCursor] = useState<string | null>(
    null,
  )
  const [messageTotalCount, setMessageTotalCount] = useState(0)
  const [messageListResetKey, setMessageListResetKey] = useState(0)
  const [mailboxStatus, setMailboxStatus] =
    useState<StatusValue>(defaultMailboxStatus)
  const [selectedMessage, setSelectedMessage] =
    useState<SelectedMessage | null>(null)
  const [inspectorEmptyMessage, setInspectorEmptyMessage] = useState(
    'Select a message to read it.',
  )
  const [mailboxActionPending, setMailboxActionPending] = useState(false)
  const [starredMessages, setStarredMessages] = useState<MessageSummary[]>([])
  const [starredSelectedMessage, setStarredSelectedMessage] =
    useState<SelectedMessage | null>(null)
  const [starredLoading, setStarredLoading] = useState(false)
  const [starredStatus, setStarredStatus] = useState<StatusValue>({
    message: '',
  })
  const [starPendingKeys, setStarPendingKeys] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [tagPendingKeys, setTagPendingKeys] = useState<string[]>([])
  const mainRef = useRef<HTMLElement>(null)
  const mailboxLoadController = useRef<AbortController | null>(null)
  const messageQueryTimer = useRef<number | null>(null)
  const messageQueryRef = useRef<MessageListQuery>(defaultMessageQuery)
  const messagesRef = useRef<MessageSummary[]>([])
  const mailboxesRef = useRef<string[]>([])
  const selectedMailboxesRef = useRef<string[]>([])
  const knownMailboxesRef = useRef<Set<string>>(new Set())
  const liveController = useRef<AbortController | null>(null)
  const starredLoadController = useRef<AbortController | null>(null)
  const liveAllMailboxesRef = useRef(true)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    mailboxesRef.current = mailboxes
  }, [mailboxes])

  useEffect(() => {
    selectedMailboxesRef.current = selectedMailboxes
  }, [selectedMailboxes])

  useEffect(() => {
    liveAllMailboxesRef.current = liveAllMailboxes
  }, [liveAllMailboxes])

  const expireSession = useCallback(() => {
    mailboxLoadController.current?.abort()
    starredLoadController.current?.abort()
    liveController.current?.abort()
    if (messageQueryTimer.current !== null) {
      window.clearTimeout(messageQueryTimer.current)
      messageQueryTimer.current = null
    }
    setSession(null)
    setAuthentication('expired')
    setAccessStatus({
      message: 'Your session has expired. Sign in again to continue.',
      state: 'expired',
    })
    setView('mailboxes')
    setSelectedMailboxes([])
    selectedMailboxesRef.current = []
    setLiveAllMailboxes(true)
    setMessages([])
    messagesRef.current = []
    setNextMessageCursor(null)
    setMessageTotalCount(0)
    setLiveError('')
    knownMailboxesRef.current = new Set()
    setStarredMessages([])
    setStarredSelectedMessage(null)
    setStarPendingKeys([])
    setTags([])
    setTagPendingKeys([])
    setSelectedMessage(null)
    setInspectorEmptyMessage('Select a message to read it.')
    writeLocation({ view: 'mailboxes', mailbox: '', message: '' })
  }, [])

  const loadTags = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await api.tags(signal)
        if (!Array.isArray(result)) throw new ApiError(422, 'invalid_response')
        setTags(result)
      } catch (error) {
        if (isAbort(error)) return
        if (isUnauthorized(error)) return expireSession()
        setMailboxStatus({
          message: 'Tags could not be loaded. Please try again.',
          state: 'error',
        })
      }
    },
    [expireSession],
  )

  const loadStarred = useCallback(async () => {
    starredLoadController.current?.abort()
    const controller = new AbortController()
    starredLoadController.current = controller
    setStarredLoading(true)
    setStarredStatus({ message: 'Loading starred messages.', state: 'loading' })
    try {
      const result = await api.starredMessages(controller.signal)
      if (!Array.isArray(result)) throw new ApiError(422, 'invalid_response')
      setStarredMessages(result)
      setStarredStatus({ message: '' })
    } catch (error) {
      if (isAbort(error)) return
      if (isUnauthorized(error)) return expireSession()
      setStarredStatus({
        message: 'Starred messages could not be loaded. Please try again.',
        state: 'error',
      })
    } finally {
      if (starredLoadController.current === controller) {
        starredLoadController.current = null
        setStarredLoading(false)
      }
    }
  }, [expireSession])

  const refreshCatalogs = useCallback(
    async (signal?: AbortSignal, showLoading = false) => {
      if (showLoading) setCatalogLoading(true)
      let activeMailboxes: string[] | null = null
      const [activeResult, archivedResult] = await Promise.allSettled([
        api.activeMailboxes(signal),
        api.archivedMailboxes(signal),
      ])
      if (signal?.aborted) return

      for (const result of [activeResult, archivedResult]) {
        if (result.status === 'rejected' && isUnauthorized(result.reason)) {
          expireSession()
          return
        }
      }

      if (
        activeResult.status === 'fulfilled' &&
        validActiveMailboxes(activeResult.value)
      ) {
        activeMailboxes = activeResult.value
        setMailboxes(activeResult.value)
        mailboxesRef.current = activeResult.value
        activeResult.value.forEach((mailbox) =>
          knownMailboxesRef.current.add(mailbox),
        )
        setCatalogError('')
      } else if (
        activeResult.status === 'rejected' &&
        !isAbort(activeResult.reason)
      ) {
        setCatalogError(
          'The saved mailbox catalog could not be loaded. Please try again.',
        )
      } else if (activeResult.status === 'fulfilled') {
        setCatalogError('The saved mailbox catalog response was invalid.')
      }

      if (
        archivedResult.status === 'fulfilled' &&
        validArchivedMailboxes(archivedResult.value)
      ) {
        setArchivedMailboxes(archivedResult.value)
        setArchivedCatalogError('')
      } else if (
        archivedResult.status === 'rejected' &&
        !isAbort(archivedResult.reason)
      ) {
        setArchivedCatalogError(
          'The archived mailbox catalog could not be loaded. Please try again.',
        )
      } else if (archivedResult.status === 'fulfilled') {
        setArchivedCatalogError(
          'The archived mailbox catalog response was invalid.',
        )
      }

      if (showLoading) setCatalogLoading(false)
      return activeMailboxes
    },
    [expireSession],
  )

  const requestMessagePage = useCallback(
    async (
      names: string[],
      query: MessageListQuery,
      cursor: string | null,
      refresh: boolean,
      requestedMessage: SelectedMessage | null = null,
    ) => {
      mailboxLoadController.current?.abort()
      const controller = new AbortController()
      mailboxLoadController.current = controller
      const appending = Boolean(cursor)
      if (appending) setMailboxLoadingMore(true)
      else {
        setMailboxLoading(true)
        setMessages([])
        setNextMessageCursor(null)
        setMessageTotalCount(0)
      }
      setMailboxStatus({ message: 'Loading messages.', state: 'loading' })

      try {
        const page = await api.messages(
          names,
          query,
          cursor,
          refresh,
          controller.signal,
        )
        if (!validMessagePage(page)) throw new ApiError(422, 'invalid_response')
        if (
          controller.signal.aborted ||
          mailboxLoadController.current !== controller
        )
          return

        const loadedMessages = appending
          ? [
              ...messagesRef.current,
              ...page.messages.filter(
                (message) =>
                  !messagesRef.current.some(
                    (existing) =>
                      existing.mailbox === message.mailbox &&
                      String(existing.id) === String(message.id),
                  ),
              ),
            ]
          : page.messages
        setMessages(loadedMessages)
        messagesRef.current = loadedMessages
        setNextMessageCursor(page.next_cursor)
        setMessageTotalCount(page.total_count)
        const location =
          query.mailbox ||
          (names.length === 1 ? names[0] : `${names.length} mailboxes`)
        const summary = `${page.total_count} ${
          page.total_count === 1 ? 'message' : 'messages'
        } in ${location}.`
        setMailboxStatus({
          message: page.partial_mailboxes.length
            ? `${summary} Cached results are shown because ${page.partial_mailboxes.join(', ')} could not be refreshed.`
            : summary,
          state: page.partial_mailboxes.length ? 'error' : 'authenticated',
        })

        if (requestedMessage) {
          const selected = loadedMessages.find(
            (message) =>
              message.mailbox === requestedMessage.mailbox &&
              String(message.id) === requestedMessage.id,
          )
          setSelectedMessage({
            mailbox: selected?.mailbox || requestedMessage.mailbox,
            id: requestedMessage.id,
          })
        }
        if (refresh) void refreshCatalogs()
      } catch (error) {
        if (isAbort(error)) return
        if (isUnauthorized(error)) return expireSession()
        setMailboxStatus({
          message: visibleError(error, 'Messages'),
          state: 'error',
        })
      } finally {
        if (mailboxLoadController.current === controller) {
          mailboxLoadController.current = null
          setMailboxLoading(false)
          setMailboxLoadingMore(false)
        }
      }
    },
    [expireSession, refreshCatalogs],
  )

  const loadMailboxes = useCallback(
    async (
      requestedMailboxes: string[],
      requestedMessageId = '',
      historyMode: 'push' | 'replace' | null = 'replace',
      requestedMessageMailbox = '',
    ) => {
      const names = normalizeMailboxNames(requestedMailboxes)
      if (messageQueryTimer.current !== null) {
        window.clearTimeout(messageQueryTimer.current)
        messageQueryTimer.current = null
      }
      mailboxLoadController.current?.abort()
      setMessageListResetKey((current) => current + 1)
      setSelectedMailboxes(names)
      selectedMailboxesRef.current = names
      setSelectedMessage(null)
      setInspectorEmptyMessage('Select a message to read it.')
      if (historyMode) {
        writeLocation(
          {
            view: 'mailboxes',
            selectedMailboxes: names,
            mailbox:
              requestedMessageId && names.length
                ? requestedMessageMailbox || names[0]
                : names.length === 1
                  ? names[0]
                  : '',
            message: requestedMessageId,
          },
          historyMode,
        )
      }

      if (!names.length) {
        setMessages([])
        messagesRef.current = []
        setNextMessageCursor(null)
        setMessageTotalCount(0)
        setMailboxLoading(false)
        setMailboxStatus(defaultMailboxStatus)
        setInspectorEmptyMessage(
          'Select one or more mailboxes to read messages.',
        )
        return
      }

      const currentQuery = messageQueryRef.current
      const query =
        !currentQuery.mailbox || names.includes(currentQuery.mailbox)
          ? currentQuery
          : { ...currentQuery, mailbox: '' }
      setMessageQuery(query)
      messageQueryRef.current = query
      await requestMessagePage(
        names,
        query,
        null,
        true,
        requestedMessageId
          ? {
              mailbox: requestedMessageMailbox || names[0],
              id: requestedMessageId,
            }
          : null,
      )
    },
    [requestMessagePage],
  )

  const changeMessageQuery = useCallback(
    (query: MessageListQuery) => {
      const searchChanged = query.search !== messageQueryRef.current.search
      setMessageListResetKey((current) => current + 1)
      setMessageQuery(query)
      messageQueryRef.current = query
      if (messageQueryTimer.current !== null) {
        window.clearTimeout(messageQueryTimer.current)
      }
      if (!selectedMailboxes.length) return

      messageQueryTimer.current = window.setTimeout(
        () => {
          messageQueryTimer.current = null
          void requestMessagePage(selectedMailboxes, query, null, false)
        },
        searchChanged ? 250 : 0,
      )
    },
    [requestMessagePage, selectedMailboxes],
  )

  const replaceTagInMessages = useCallback((updated: Tag) => {
    const replace = (items: MessageSummary[]) =>
      items.map((message) => ({
        ...message,
        tags: message.tags?.map((tag) =>
          tag.id === updated.id ? updated : tag,
        ),
      }))
    setMessages(replace)
    setStarredMessages(replace)
  }, [])

  const createTag = useCallback(async (name: string, color: string) => {
    const created = await api.createTag(name, color)
    setTags((current) =>
      [...current, created].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    )
    return created
  }, [])

  const updateTag = useCallback(
    async (tag: Tag, name: string, color: string) => {
      const updated = await api.updateTag(tag.id, name, color)
      setTags((current) =>
        current
          .map((value) => (value.id === updated.id ? updated : value))
          .sort((left, right) => left.name.localeCompare(right.name)),
      )
      replaceTagInMessages(updated)
      return updated
    },
    [replaceTagInMessages],
  )

  const deleteTag = useCallback(
    async (tag: Tag) => {
      await api.deleteTag(tag.id)
      setTags((current) => current.filter((value) => value.id !== tag.id))
      const remove = (items: MessageSummary[]) =>
        items.map((message) => ({
          ...message,
          tags: message.tags?.filter((value) => value.id !== tag.id),
        }))
      setMessages(remove)
      setStarredMessages(remove)
      if (messageQueryRef.current.tag === String(tag.id)) {
        const query = { ...messageQueryRef.current, tag: '' }
        changeMessageQuery(query)
      }
    },
    [changeMessageQuery],
  )

  const loadMoreMessages = useCallback(() => {
    if (!nextMessageCursor || mailboxLoading || mailboxLoadingMore) return
    void requestMessagePage(
      selectedMailboxes,
      messageQuery,
      nextMessageCursor,
      false,
    )
  }, [
    mailboxLoading,
    mailboxLoadingMore,
    messageQuery,
    nextMessageCursor,
    requestMessagePage,
    selectedMailboxes,
  ])

  useEffect(() => {
    const controller = new AbortController()
    const restore = async () => {
      try {
        const restoredSession = await api.session(controller.signal)
        if (controller.signal.aborted) return
        setSession(restoredSession)
        setAuthentication('authenticated')
        setAccessStatus({ message: '' })
        const [availableMailboxes] = await Promise.all([
          refreshCatalogs(controller.signal, true),
          loadTags(controller.signal),
        ])
        if (controller.signal.aborted) return
        const location = restoreAvailableMailboxes(
          readLocation(),
          availableMailboxes || null,
        )
        setView(location.view)
        setStarredSelectedMessage(
          location.view === 'starred' && location.mailbox && location.message
            ? { mailbox: location.mailbox, id: location.message }
            : null,
        )
        writeLocation(location)
        const restoredMailboxes = location.selectedMailboxes || []
        if (location.view === 'mailboxes' && restoredMailboxes.length) {
          await loadMailboxes(
            restoredMailboxes,
            location.message,
            'replace',
            location.mailbox,
          )
        }
      } catch (error) {
        if (isAbort(error)) return
        if (isUnauthorized(error)) {
          setAuthentication('signed-out')
          setAccessStatus({
            message: 'Sign in to browse Inbucket mailboxes.',
            state: 'signed-out',
          })
        } else {
          setAuthentication('unavailable')
          setAccessStatus({
            message: 'The application is unavailable. Please try again later.',
            state: 'error',
          })
        }
      }
    }
    void restore()
    return () => {
      controller.abort()
      mailboxLoadController.current?.abort()
      starredLoadController.current?.abort()
      if (messageQueryTimer.current !== null) {
        window.clearTimeout(messageQueryTimer.current)
        messageQueryTimer.current = null
      }
    }
  }, [loadMailboxes, loadTags, refreshCatalogs])

  useEffect(() => {
    if (authentication !== 'authenticated') return

    const restoreHistory = () => {
      const location = restoreAvailableMailboxes(
        readLocation(),
        mailboxesRef.current,
      )
      setView(location.view)
      if (location.view === 'mailboxes') {
        setStarredSelectedMessage(null)
        void loadMailboxes(
          location.selectedMailboxes || [],
          location.message,
          null,
          location.mailbox,
        )
      } else if (location.view === 'starred') {
        setStarredSelectedMessage(
          location.mailbox && location.message
            ? { mailbox: location.mailbox, id: location.message }
            : null,
        )
      }
      writeLocation(location)
    }

    window.addEventListener('popstate', restoreHistory)
    return () => window.removeEventListener('popstate', restoreHistory)
  }, [authentication, loadMailboxes])

  useEffect(() => {
    if (authentication !== 'authenticated') return

    let stopped = false
    let cursor: string | null = null
    let timer: number | null = null

    const schedule = (delay: number) => {
      if (!stopped) timer = window.setTimeout(() => void poll(), delay)
    }

    const poll = async () => {
      const controller = new AbortController()
      liveController.current?.abort()
      liveController.current = controller
      try {
        const page = await api.liveMessages(cursor, controller.signal)
        if (!validLiveMessagePage(page))
          throw new ApiError(422, 'invalid_response')
        if (controller.signal.aborted || stopped) return

        if (page.active_mailboxes) {
          knownMailboxesRef.current = new Set(page.active_mailboxes)
          mailboxesRef.current = page.active_mailboxes
          setMailboxes(page.active_mailboxes)
        } else if (!cursor) {
          knownMailboxesRef.current = new Set(mailboxesRef.current)
        }

        let nextMailboxes = mailboxesRef.current
        let nextSelected = selectedMailboxesRef.current
        const countedMailboxes = new Set(nextSelected)
        for (const change of page.changes) {
          const known = knownMailboxesRef.current.has(change.mailbox)
          knownMailboxesRef.current.add(change.mailbox)
          if (change.archived) {
            nextMailboxes = nextMailboxes.filter(
              (mailbox) => mailbox !== change.mailbox,
            )
            nextSelected = nextSelected.filter(
              (mailbox) => mailbox !== change.mailbox,
            )
            continue
          }
          if (!nextMailboxes.includes(change.mailbox)) {
            nextMailboxes = [...nextMailboxes, change.mailbox].sort()
          }
          if (!known && !nextSelected.includes(change.mailbox)) {
            nextSelected = [...nextSelected, change.mailbox]
          }
        }
        if (nextMailboxes !== mailboxesRef.current) {
          mailboxesRef.current = nextMailboxes
          setMailboxes(nextMailboxes)
        }
        if (nextSelected !== selectedMailboxesRef.current) {
          selectedMailboxesRef.current = nextSelected
          setSelectedMailboxes(nextSelected)
          const location = readLocation()
          if (location.view === 'mailboxes') {
            writeLocation({ ...location, selectedMailboxes: nextSelected })
          }
        }

        const selectedSet = new Set(
          liveAllMailboxesRef.current ? mailboxesRef.current : nextSelected,
        )
        const query = messageQueryRef.current
        let nextMessages = messagesRef.current
        let totalDelta = 0
        for (const change of page.changes) {
          const key = messageKey(change.mailbox, change.id)
          const index = nextMessages.findIndex(
            (message) =>
              messageKey(message.mailbox, String(message.id)) === key,
          )
          const matches =
            !change.archived &&
            selectedSet.has(change.mailbox) &&
            filterMessages(
              [change.message],
              query.search,
              query.read,
              '',
              query.tag,
              query.dateFrom,
              query.dateTo,
            ).length === 1
          if (!change.available || !matches) {
            if (index >= 0) {
              nextMessages = nextMessages.filter(
                (message) =>
                  messageKey(message.mailbox, String(message.id)) !== key,
              )
              totalDelta -= 1
            } else if (!change.available && matches) {
              totalDelta -= 1
            }
          } else if (index >= 0) {
            nextMessages = nextMessages.map((message, messageIndex) =>
              messageIndex === index ? change.message : message,
            )
          } else if (change.created || !countedMailboxes.has(change.mailbox)) {
            nextMessages = [...nextMessages, change.message]
            totalDelta += 1
          }

          if (!change.available) {
            setSelectedMessage((current) =>
              current?.mailbox === change.mailbox && current.id === change.id
                ? { ...current, unavailable: true }
                : current,
            )
          }
        }
        nextMessages = sortMessages(nextMessages, query.sort)
        if (nextMessages !== messagesRef.current) {
          messagesRef.current = nextMessages
          setMessages(nextMessages)
        }
        if (totalDelta)
          setMessageTotalCount((current) => Math.max(0, current + totalDelta))
        cursor = page.cursor
        setLiveError('')
        schedule(page.has_more ? 0 : 3000)
      } catch (error) {
        if (isAbort(error) || stopped) return
        if (isUnauthorized(error)) return expireSession()
        setLiveError('Live updates are temporarily unavailable.')
        schedule(3000)
      } finally {
        if (liveController.current === controller) {
          liveController.current = null
        }
      }
    }

    void poll()
    return () => {
      stopped = true
      if (timer !== null) window.clearTimeout(timer)
      liveController.current?.abort()
      liveController.current = null
    }
  }, [authentication, expireSession])

  useEffect(() => {
    if (authentication === 'authenticated' && view === 'starred') {
      void loadStarred()
    }
  }, [authentication, loadStarred, view])

  useEffect(() => {
    if (authentication !== 'authenticated') return
    const targetId =
      view === 'starred'
        ? 'starred-messages-title'
        : view === 'trash'
          ? 'trash-messages-title'
          : view === 'archive'
            ? 'archived-mailboxes-title'
            : 'mailbox-title'
    document.getElementById(targetId)?.focus()
  }, [authentication, view])

  const login = async (username: string, password: string) => {
    setAuthentication('authenticating')
    setAccessStatus({ message: 'Signing in.', state: 'loading' })
    try {
      const authenticatedSession = await api.login(username, password)
      setSession(authenticatedSession)
      setAuthentication('authenticated')
      setAccessStatus({ message: '' })
      const [availableMailboxes] = await Promise.all([
        refreshCatalogs(undefined, true),
        loadTags(),
      ])
      const location = restoreAvailableMailboxes(
        readLocation(),
        availableMailboxes || null,
      )
      setView(location.view)
      setStarredSelectedMessage(
        location.view === 'starred' && location.mailbox && location.message
          ? { mailbox: location.mailbox, id: location.message }
          : null,
      )
      writeLocation(location)
      const restoredMailboxes = location.selectedMailboxes || []
      if (location.view === 'mailboxes' && restoredMailboxes.length) {
        await loadMailboxes(
          restoredMailboxes,
          location.message,
          'replace',
          location.mailbox,
        )
      }
      mainRef.current?.focus()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthentication('signed-out')
        setAccessStatus({
          message: 'The username or password is incorrect.',
          state: 'error',
        })
      } else {
        setAuthentication('unavailable')
        setAccessStatus({
          message: 'Sign-in is temporarily unavailable. Please try again.',
          state: 'error',
        })
      }
    }
  }

  const signOut = async () => {
    setSigningOut(true)
    try {
      await api.logout()
      setSession(null)
      setAuthentication('signed-out')
      setAccessStatus({ message: 'You have signed out.', state: 'signed-out' })
      setView('mailboxes')
      setSelectedMailboxes([])
      setMessages([])
      messagesRef.current = []
      setNextMessageCursor(null)
      setMessageTotalCount(0)
      setStarredMessages([])
      setStarredSelectedMessage(null)
      setStarPendingKeys([])
      setTags([])
      setTagPendingKeys([])
      setSelectedMessage(null)
      writeLocation({ view: 'mailboxes', mailbox: '', message: '' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSession(null)
        setAuthentication('signed-out')
        setAccessStatus({
          message: 'You have signed out.',
          state: 'signed-out',
        })
        setView('mailboxes')
        setSelectedMailboxes([])
        setMessages([])
        messagesRef.current = []
        setNextMessageCursor(null)
        setMessageTotalCount(0)
        setStarredMessages([])
        setStarredSelectedMessage(null)
        setStarPendingKeys([])
        setTags([])
        setTagPendingKeys([])
        setSelectedMessage(null)
        writeLocation({ view: 'mailboxes', mailbox: '', message: '' })
      } else {
        setMailboxStatus({
          message: 'Sign-out could not be completed. Please try again.',
          state: 'error',
        })
      }
    } finally {
      setSigningOut(false)
    }
  }

  const selectMessage = (mailbox: string, id: string) => {
    const selected = { mailbox, id }
    setSelectedMessage(selected)
    setInspectorEmptyMessage('Select a message to read it.')
    writeLocation(
      {
        view: 'mailboxes',
        selectedMailboxes,
        mailbox,
        message: id,
      },
      'push',
    )
  }

  const closeMessage = () => {
    setSelectedMessage(null)
    writeLocation({
      view: 'mailboxes',
      selectedMailboxes,
      mailbox: selectedMailboxes.length === 1 ? selectedMailboxes[0] : '',
      message: '',
    })
  }

  const markRead = useCallback((mailbox: string, id: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.mailbox === mailbox && String(message.id) === id
          ? { ...message, seen: true }
          : message,
      ),
    )
    setStarredMessages((current) =>
      current.map((message) =>
        message.mailbox === mailbox && String(message.id) === id
          ? { ...message, seen: true }
          : message,
      ),
    )
  }, [])

  const changeStarred = useCallback(
    async (mailbox: string, id: string, starred: boolean) => {
      const key = messageKey(mailbox, id)
      if (starPendingKeys.includes(key)) return
      setStarPendingKeys((current) =>
        current.includes(key) ? current : [...current, key],
      )
      setMessages((current) =>
        current.map((message) =>
          message.mailbox === mailbox && String(message.id) === id
            ? { ...message, starred }
            : message,
        ),
      )
      try {
        const result = await api.setStarred(mailbox, id, starred)
        if (result.starred !== starred || (starred && !result.message)) {
          throw new ApiError(422, 'invalid_response')
        }
        if (starred && result.message) {
          setStarredMessages((current) => [
            result.message as MessageSummary,
            ...current.filter(
              (message) =>
                message.mailbox !== mailbox || String(message.id) !== id,
            ),
          ])
        } else {
          if (view === 'starred')
            document.getElementById('starred-messages-title')?.focus()
          setStarredMessages((current) =>
            current.filter(
              (message) =>
                message.mailbox !== mailbox || String(message.id) !== id,
            ),
          )
          setStarredSelectedMessage((current) =>
            current?.mailbox === mailbox && current.id === id ? null : current,
          )
          const location = readLocation()
          if (
            location.view === 'starred' &&
            location.mailbox === mailbox &&
            location.message === id
          ) {
            writeLocation({ view: 'starred', mailbox: '', message: '' })
          }
        }
        setMailboxStatus((current) =>
          current.message === 'The star could not be updated. Please try again.'
            ? { message: 'Star updated.', state: 'authenticated' }
            : current,
        )
        if (view === 'starred') {
          setStarredStatus({
            message: starred
              ? 'Message starred.'
              : 'Message removed from Starred.',
            state: 'authenticated',
          })
        }
      } catch (error) {
        setMessages((current) =>
          current.map((message) =>
            message.mailbox === mailbox && String(message.id) === id
              ? { ...message, starred: !starred }
              : message,
          ),
        )
        if (isUnauthorized(error)) expireSession()
        else {
          const status = {
            message: 'The star could not be updated. Please try again.',
            state: 'error',
          } as const
          if (view === 'starred') setStarredStatus(status)
          else setMailboxStatus(status)
        }
      } finally {
        setStarPendingKeys((current) =>
          current.filter((candidate) => candidate !== key),
        )
      }
    },
    [expireSession, starPendingKeys, view],
  )

  const starPending = useCallback(
    (mailbox: string, id: string) =>
      starPendingKeys.includes(messageKey(mailbox, id)),
    [starPendingKeys],
  )

  const changeTag = useCallback(
    async (mailbox: string, id: string, tag: Tag, assigned: boolean) => {
      const key = `${messageKey(mailbox, id)}\u0000${tag.id}`
      if (tagPendingKeys.includes(key)) throw new Error('tag_pending')
      setTagPendingKeys((current) => [...current, key])
      try {
        const result = await api.setTag(mailbox, id, tag.id, assigned)
        if (result.assigned !== assigned || !Array.isArray(result.tags)) {
          throw new ApiError(422, 'invalid_response')
        }
        const update = (items: MessageSummary[]) =>
          items.map((message) =>
            message.mailbox === mailbox && String(message.id) === id
              ? { ...message, tags: result.tags }
              : message,
          )
        setMessages(update)
        setStarredMessages(update)
        return result.tags
      } catch (error) {
        if (isUnauthorized(error)) expireSession()
        throw error
      } finally {
        setTagPendingKeys((current) => current.filter((value) => value !== key))
      }
    },
    [expireSession, tagPendingKeys],
  )

  const tagPending = tagPendingKeys.length > 0

  const messageDeleted = async () => {
    const location = readLocation()
    setSelectedMessage(null)
    if (location.view === 'mailboxes') {
      writeLocation({
        view: 'mailboxes',
        selectedMailboxes,
        mailbox: selectedMailboxes.length === 1 ? selectedMailboxes[0] : '',
        message: '',
      })
    }
    await loadMailboxes(
      selectedMailboxes,
      '',
      location.view === 'mailboxes' ? 'replace' : null,
    )
    setMailboxStatus({
      message: 'Message deleted permanently.',
      state: 'authenticated',
    })
  }

  const messageTrashed = async () => {
    if (!selectedMessage) return
    const trashed = selectedMessage
    setSelectedMessage(null)
    setMessages((current) =>
      current.filter(
        (message) =>
          message.mailbox !== trashed.mailbox ||
          String(message.id) !== trashed.id,
      ),
    )
    setStarredMessages((current) =>
      current.filter(
        (message) =>
          message.mailbox !== trashed.mailbox ||
          String(message.id) !== trashed.id,
      ),
    )
    setMessageTotalCount((current) => Math.max(0, current - 1))
    setMailboxStatus({
      message: 'Message moved to Trash.',
      state: 'authenticated',
    })
    writeLocation({
      view: 'mailboxes',
      selectedMailboxes,
      mailbox: selectedMailboxes.length === 1 ? selectedMailboxes[0] : '',
      message: '',
    })
  }

  const starredMessageDeleted = async () => {
    if (!starredSelectedMessage) return
    const deleted = starredSelectedMessage
    setStarredSelectedMessage(null)
    setStarredMessages((current) =>
      current.filter(
        (message) =>
          message.mailbox !== deleted.mailbox ||
          String(message.id) !== deleted.id,
      ),
    )
    setStarredStatus({
      message: 'Message deleted permanently.',
      state: 'authenticated',
    })
    if (readLocation().view === 'starred') {
      writeLocation({ view: 'starred', mailbox: '', message: '' })
    }
  }

  const starredMessageTrashed = async () => {
    if (!starredSelectedMessage) return
    const trashed = starredSelectedMessage
    setStarredSelectedMessage(null)
    setStarredMessages((current) =>
      current.filter(
        (message) =>
          message.mailbox !== trashed.mailbox ||
          String(message.id) !== trashed.id,
      ),
    )
    setMessages((current) =>
      current.filter(
        (message) =>
          message.mailbox !== trashed.mailbox ||
          String(message.id) !== trashed.id,
      ),
    )
    if (
      messagesRef.current.some(
        (message) =>
          message.mailbox === trashed.mailbox &&
          String(message.id) === trashed.id,
      )
    ) {
      setMessageTotalCount((current) => Math.max(0, current - 1))
    }
    setStarredStatus({
      message: 'Message moved to Trash.',
      state: 'authenticated',
    })
    writeLocation({ view: 'starred', mailbox: '', message: '' })
  }

  const archiveSelectedMailboxes = async () => {
    if (!selectedMailboxes.length) {
      setMailboxStatus({
        message: 'Select at least one mailbox to archive.',
        state: 'error',
      })
      return
    }

    setMailboxActionPending(true)
    const results = await Promise.all(
      selectedMailboxes.map(async (mailbox) => {
        try {
          await api.archiveMailbox(mailbox)
          return { mailbox, completed: true as const }
        } catch (error) {
          return { mailbox, completed: false as const, error }
        }
      }),
    )
    const unauthorized = results.find(
      (result) => !result.completed && isUnauthorized(result.error),
    )
    if (unauthorized) {
      setMailboxActionPending(false)
      expireSession()
      return
    }

    const completed = results.filter((result) => result.completed)
    const failed = results.filter((result) => !result.completed)
    const remaining = failed.map((result) => result.mailbox)
    setSelectedMailboxes(remaining)
    await refreshCatalogs(undefined, true)
    await loadMailboxes(remaining)
    setMailboxStatus({
      message: failed.length
        ? `Archived ${completed.length} mailboxes. ${failed.length} mailboxes could not be archived.`
        : `Archived ${completed.length} mailboxes.`,
      state: failed.length ? 'error' : 'authenticated',
    })
    setMailboxActionPending(false)
  }

  const restoreMailbox = async (mailbox: string) => {
    await api.restoreMailbox(mailbox)
    await refreshCatalogs(undefined, true)
  }

  const selectStarredMessage = (mailbox: string, id: string) => {
    setStarredSelectedMessage({ mailbox, id })
    writeLocation({ view: 'starred', mailbox, message: id }, 'push')
  }

  const closeStarredMessage = () => {
    setStarredSelectedMessage(null)
    writeLocation({ view: 'starred', mailbox: '', message: '' })
  }

  const changeView = (nextView: ViewName) => {
    if (nextView === view) return
    setView(nextView)
    if (nextView === 'mailboxes') {
      writeLocation(
        {
          view: nextView,
          selectedMailboxes,
          mailbox:
            selectedMessage?.mailbox ||
            (selectedMailboxes.length === 1 ? selectedMailboxes[0] : ''),
          message: selectedMessage?.id || '',
        },
        'push',
      )
    } else if (nextView === 'starred') {
      writeLocation(
        {
          view: nextView,
          mailbox: starredSelectedMessage?.mailbox || '',
          message: starredSelectedMessage?.id || '',
        },
        'push',
      )
    } else {
      writeLocation({ view: nextView, mailbox: '', message: '' }, 'push')
    }
  }

  const authenticated = authentication === 'authenticated' && Boolean(session)
  const activeMailboxSummary =
    selectedMailboxes.length === 0
      ? 'No mailbox selected'
      : selectedMailboxes.length === 1
        ? selectedMailboxes[0]
        : `${selectedMailboxes.length} mailboxes`
  const displayedMailboxStatus: StatusValue = catalogError
    ? { message: catalogError, state: 'error' }
    : liveError
      ? { message: liveError, state: 'error' }
      : catalogLoading
        ? { message: 'Loading saved mailboxes.', state: 'loading' }
        : mailboxStatus

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppHeader
        authenticated={authenticated}
        view={view}
        signingOut={signingOut}
        onViewChange={changeView}
        onSignOut={() => void signOut()}
      />
      <main
        ref={mainRef}
        id="main-content"
        className="container inbucket-main"
        tabIndex={-1}
      >
        {!authenticated ? (
          <AccessScreen
            authentication={authentication}
            status={accessStatus}
            onLogin={login}
          />
        ) : (
          <div>
            <StarredView
              active={view === 'starred'}
              messages={starredMessages}
              selected={starredSelectedMessage}
              loading={starredLoading}
              status={starredStatus}
              onSelectMessage={selectStarredMessage}
              onCloseMessage={closeStarredMessage}
              onUnauthorized={expireSession}
              onRead={markRead}
              starPending={starPending}
              onStarChange={changeStarred}
              onDeleted={starredMessageDeleted}
              onTrashed={starredMessageTrashed}
              tags={tags}
              tagPending={tagPending}
              onTagChange={changeTag}
              onCreateTag={createTag}
              onUpdateTag={updateTag}
              onDeleteTag={deleteTag}
            />
            <TrashView
              active={view === 'trash'}
              onUnauthorized={expireSession}
              onRead={markRead}
              onRestoredMessage={(restored) => {
                const visible =
                  selectedMailboxesRef.current.includes(restored.mailbox) &&
                  filterMessages(
                    [restored],
                    messageQueryRef.current.search,
                    messageQueryRef.current.read,
                    '',
                    messageQueryRef.current.tag,
                    messageQueryRef.current.dateFrom,
                    messageQueryRef.current.dateTo,
                  ).length === 1
                if (visible) {
                  setMessages((current) =>
                    sortMessages(
                      [
                        restored,
                        ...current.filter(
                          (message) =>
                            message.mailbox !== restored.mailbox ||
                            String(message.id) !== String(restored.id),
                        ),
                      ],
                      messageQueryRef.current.sort,
                    ),
                  )
                  setMessageTotalCount((current) => current + 1)
                }
                if (restored.starred === true) {
                  setStarredMessages((current) => [
                    restored,
                    ...current.filter(
                      (message) =>
                        message.mailbox !== restored.mailbox ||
                        String(message.id) !== String(restored.id),
                    ),
                  ])
                }
              }}
              starPending={starPending}
              onStarChange={changeStarred}
              tags={tags}
              tagPending={tagPending}
              onTagChange={changeTag}
              onCreateTag={createTag}
              onUpdateTag={updateTag}
              onDeleteTag={deleteTag}
            />
            <ArchivedView
              active={view === 'archive'}
              mailboxes={archivedMailboxes}
              loading={catalogLoading}
              catalogError={archivedCatalogError}
              onRestore={restoreMailbox}
              onDelete={async (mailbox) => {
                await api.purgeMailbox(mailbox)
                await refreshCatalogs(undefined, true)
              }}
              onUnauthorized={expireSession}
            />
            <div className="mailbox-view" hidden={view !== 'mailboxes'}>
              <div
                id="mailbox-controls"
                className="mailbox-toolbar"
                data-mobile-collapsed={!mobileToolbarExpanded}
              >
                <div className="mailbox-context">
                  <strong>{activeMailboxSummary}</strong>
                  <StatusMessage
                    value={displayedMailboxStatus}
                    className="mailbox-status"
                  />
                </div>
                <MailboxTools
                  mailboxes={mailboxes}
                  selectedMailboxes={selectedMailboxes}
                  liveAllMailboxes={liveAllMailboxes}
                  actionPending={mailboxActionPending}
                  onAdd={async (mailbox) =>
                    loadMailboxes(
                      normalizeMailboxNames([...selectedMailboxes, mailbox]),
                    )
                  }
                  onSelectionChange={(names) => void loadMailboxes(names)}
                  onLiveAllMailboxesChange={setLiveAllMailboxes}
                  onArchive={() => void archiveSelectedMailboxes()}
                />
              </div>
              <MessageWorkspace
                messages={messages}
                selected={selectedMessage}
                loading={mailboxLoading}
                loadingMore={mailboxLoadingMore}
                paginationResetKey={String(messageListResetKey)}
                hasMore={Boolean(nextMessageCursor)}
                totalCount={messageTotalCount}
                mobileToolbarExpanded={mobileToolbarExpanded}
                onMobileToolbarToggle={() =>
                  setMobileToolbarExpanded((expanded) => !expanded)
                }
                query={messageQuery}
                tags={tags}
                listEmptyMessage={
                  selectedMailboxes.length
                    ? 'This mailbox has no messages.'
                    : 'Select one or more mailboxes to read messages.'
                }
                inspectorEmptyMessage={inspectorEmptyMessage}
                onQueryChange={changeMessageQuery}
                onLoadMore={loadMoreMessages}
                onSelectMessage={selectMessage}
                onCloseMessage={closeMessage}
                onUnauthorized={expireSession}
                onRead={markRead}
                starPending={starPending}
                onStarChange={changeStarred}
                onDeleted={messageDeleted}
                onTrashed={messageTrashed}
                tagPending={tagPending}
                onTagChange={changeTag}
                onCreateTag={createTag}
                onUpdateTag={updateTag}
                onDeleteTag={deleteTag}
              />
            </div>
          </div>
        )}
      </main>
    </>
  )
}
