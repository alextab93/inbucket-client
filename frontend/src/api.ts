import type {
  ArchivedMailbox,
  Attachment,
  LiveMessagePage,
  MessageListQuery,
  MessagePage,
  MessageSummary,
  NotificationDelivery,
  NotificationDestination,
  NotificationDestinationsResponse,
  NotificationDestinationMethod,
  NotificationDestinationTestResult,
  MessageRule,
  MessageRulesResponse,
  ParsedMessage,
  Session,
  Tag,
  TrashResult,
} from './types'
import { dateRangeInstants } from './dateRange'

type MessageRuleInput = Omit<
  MessageRule,
  'id' | 'summary' | 'last_error_code' | 'last_failed_at'
>

type NotificationDestinationInput = Omit<NotificationDestination, 'id'>

type ResponseType = 'json' | 'text' | 'empty' | 'blob'

export class ApiError extends Error {
  readonly status: number
  readonly fields?: Record<string, string[]>

  constructor(status: number, message = 'request_failed', fields?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

const assertRelativePath = (path: string): void => {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('API paths must be relative to the current origin')
  }
}

const request = async <T>(
  path: string,
  options: RequestInit = {},
  responseType: ResponseType = 'json',
): Promise<T> => {
  assertRelativePath(path)
  let response: Response
  try {
    response = await fetch(path, { credentials: 'include', ...options })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new ApiError(0, 'network_error')
  }
  if (!response.ok) {
    let message = 'request_failed'
    let fields: Record<string, string[]> | undefined
    try {
      const body = (await response.clone().json()) as { error?: unknown; fields?: Record<string, string[]> }
      if (typeof body.error === 'string') message = body.error
      fields = body.fields
    } catch {
      message = 'request_failed'
    }
    throw new ApiError(response.status, message, fields)
  }
  if (responseType === 'empty') return undefined as T
  if (responseType === 'text') return (await response.text()) as T
  if (responseType === 'blob') return (await response.blob()) as T
  return (await response.json()) as T
}

const jsonOptions = (
  method: string,
  body?: unknown,
  signal?: AbortSignal,
): RequestInit => ({
  method,
  signal,
  headers:
    body === undefined ? undefined : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const encode = (value: string | number): string =>
  encodeURIComponent(String(value))

const mailboxPath = (mailbox: string): string =>
  `/v1/inbucket/mailbox?name=${encode(mailbox)}`

const archiveMailboxPath = (mailbox: string, archived = true): string =>
  `/v1/inbucket/mailbox/archive?name=${encode(mailbox)}${archived ? '' : '&archived=false'}`

const messagePath = (
  mailbox: string,
  id: string | number,
  suffix = '',
): string =>
  `/v1/inbucket/mailboxes/${encode(mailbox)}/messages/${encode(id)}${suffix}`

const deleteMessagePath = (mailbox: string, id: string | number): string =>
  `/v1/inbucket/message?name=${encode(mailbox)}&id=${encode(id)}`

const messagesPath = (
  mailboxes: string[],
  query: MessageListQuery,
  cursor: string | null,
  refresh: boolean,
): string => {
  const params = new URLSearchParams()
  const requestedMailboxes = query.mailbox ? [query.mailbox] : mailboxes
  if (!requestedMailboxes.length) params.set('scope', 'recent')
  requestedMailboxes.forEach((mailbox) => params.append('mailboxes[]', mailbox))
  if (query.search.trim()) params.set('search', query.search.trim())
  if (query.read !== 'all') params.set('read', query.read)
  if (query.sort !== 'newest') params.set('sort', query.sort)
  if (query.tag) params.set('tag', query.tag)
  const range = dateRangeInstants(query.dateFrom, query.dateTo)
  if (range.receivedAfter) params.set('received_after', range.receivedAfter)
  if (range.receivedBefore) params.set('received_before', range.receivedBefore)
  if (cursor) params.set('cursor', cursor)
  if (refresh && requestedMailboxes.length) params.set('refresh', 'true')
  return `/v1/inbucket/messages?${params.toString()}`
}

const trashMessagesPath = (
  query: MessageListQuery,
  cursor: string | null,
): string => {
  const params = new URLSearchParams()
  if (query.search.trim()) params.set('search', query.search.trim())
  if (query.read !== 'all') params.set('read', query.read)
  if (query.mailbox) params.set('mailbox', query.mailbox)
  if (query.sort !== 'newest') params.set('sort', query.sort)
  if (cursor) params.set('cursor', cursor)
  return `/v1/inbucket/trash/messages?${params.toString()}`
}

export const visibleError = (error: unknown, subject: string): string => {
  if (error instanceof ApiError) {
    if (error.status === 404) return `${subject} was not found.`
    if (error.status === 422) return `${subject} response was invalid.`
    if (error.status === 502 || error.status === 0) {
      return 'Inbucket is temporarily unavailable. Please try again.'
    }
  }
  return `${subject} could not be loaded. Please try again.`
}

export const isUnauthorized = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401

export const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

export const api = {
  session: (signal?: AbortSignal) =>
    request<Session>('/v1/session', { signal }),
  login: (username: string, password: string, signal?: AbortSignal) =>
    request<Session>(
      '/v1/session',
      jsonOptions('POST', { username, password }, signal),
    ),
  logout: (signal?: AbortSignal) =>
    request<void>(
      '/v1/session',
      jsonOptions('DELETE', undefined, signal),
      'empty',
    ),
  activeMailboxes: (signal?: AbortSignal) =>
    request<string[]>('/v1/inbucket/mailboxes', { signal }),
  archivedMailboxes: (signal?: AbortSignal) =>
    request<ArchivedMailbox[]>('/v1/inbucket/mailboxes?archived=true', {
      signal,
    }),
  tags: (signal?: AbortSignal) => request<Tag[]>('/v1/tags', { signal }),
  createTag: (name: string, color: string, signal?: AbortSignal) =>
    request<Tag>('/v1/tags', jsonOptions('POST', { name, color }, signal)),
  updateTag: (id: number, name: string, color: string, signal?: AbortSignal) =>
    request<Tag>(
      `/v1/tags/${encode(id)}`,
      jsonOptions('PATCH', { name, color }, signal),
    ),
  deleteTag: (id: number, signal?: AbortSignal) =>
    request<void>(
      `/v1/tags/${encode(id)}`,
      jsonOptions('DELETE', undefined, signal),
      'empty',
    ),
  rules: (signal?: AbortSignal) =>
    request<MessageRulesResponse>('/v1/rules', { signal }),
  notificationDestinations: (signal?: AbortSignal) =>
    request<NotificationDestinationsResponse>(
      '/v1/notification_destinations',
      { signal },
    ),
  createNotificationDestination: (
    body: NotificationDestinationInput,
    signal?: AbortSignal,
  ) =>
    request<NotificationDestination>(
      '/v1/notification_destinations',
      jsonOptions('POST', body, signal),
    ),
  updateNotificationDestination: (
    id: number,
    body: NotificationDestinationInput,
    signal?: AbortSignal,
  ) =>
    request<NotificationDestination>(
      `/v1/notification_destinations/${encode(id)}`,
      jsonOptions('PATCH', body, signal),
    ),
  deleteNotificationDestination: (id: number, signal?: AbortSignal) =>
    request<void>(
      `/v1/notification_destinations/${encode(id)}`,
      jsonOptions('DELETE', undefined, signal),
      'empty',
    ),
  testNotificationDestination: (
    id: number,
    kind: NotificationDestinationMethod['kind'],
    signal?: AbortSignal,
  ) =>
    request<NotificationDestinationTestResult>(
      `/v1/notification_destinations/${encode(id)}/test`,
      jsonOptions('POST', { kind }, signal),
    ),
  createMessageRule: (body: MessageRuleInput, signal?: AbortSignal) =>
    request<MessageRule>(
      '/v1/rules',
      jsonOptions('POST', body, signal),
    ),
  updateMessageRule: (
    id: number,
    body: MessageRuleInput,
    signal?: AbortSignal,
  ) =>
    request<MessageRule>(
      `/v1/rules/${encode(id)}`,
      jsonOptions('PATCH', body, signal),
    ),
  duplicateMessageRule: (id: number, signal?: AbortSignal) =>
    request<MessageRule>(
      `/v1/rules/${encode(id)}/duplicate`,
      jsonOptions('POST', undefined, signal),
    ),
  deleteMessageRule: (id: number, signal?: AbortSignal) =>
    request<void>(
      `/v1/rules/${encode(id)}`,
      jsonOptions('DELETE', undefined, signal),
      'empty',
    ),
  previewMessageRule: (
    body: MessageRuleInput,
    signal?: AbortSignal,
  ) =>
    request<{ matches: Array<{ mailbox: string; message_id: string; subject?: string; sender?: string; recipients?: string[]; received_at?: string; size?: number }>; inspected: number; incomplete: boolean }>(
      '/v1/rules/preview',
      jsonOptions('POST', body, signal),
    ),
  notifications: (signal?: AbortSignal) =>
    request<NotificationDelivery[]>('/v1/notifications', { signal }),
  markNotificationRead: (id: number, signal?: AbortSignal) =>
    request<void>(
      `/v1/notifications/${encode(id)}/read`,
      jsonOptions('PATCH', undefined, signal),
      'empty',
    ),
  clearNotification: (id: number, signal?: AbortSignal) =>
    request<void>(
      `/v1/notifications/${encode(id)}/clear`,
      jsonOptions('PATCH', undefined, signal),
      'empty',
    ),
  markBrowserNotificationDelivered: (id: number, signal?: AbortSignal) =>
    request<void>(
      `/v1/notifications/${encode(id)}/browser-delivered`,
      jsonOptions('PATCH', undefined, signal),
      'empty',
    ),
  retryNotification: (id: number, signal?: AbortSignal) =>
    request<NotificationDelivery>(
      `/v1/notifications/${encode(id)}/retry`,
      jsonOptions('PATCH', undefined, signal),
    ),
  mailbox: (mailbox: string, signal?: AbortSignal) =>
    request<MessageSummary[]>(mailboxPath(mailbox), { signal }),
  messages: (
    mailboxes: string[],
    query: MessageListQuery,
    cursor: string | null,
    refresh: boolean,
    signal?: AbortSignal,
  ) =>
    request<MessagePage>(messagesPath(mailboxes, query, cursor, refresh), {
      signal,
    }),
  liveMessages: (cursor: string | null, signal?: AbortSignal) => {
    const query = cursor ? `?cursor=${encode(cursor)}` : ''
    return request<LiveMessagePage>(`/v1/inbucket/live/messages${query}`, {
      signal,
    })
  },
  archiveMailbox: (mailbox: string, signal?: AbortSignal) =>
    request<void>(
      archiveMailboxPath(mailbox),
      jsonOptions('PATCH', undefined, signal),
      'empty',
    ),
  restoreMailbox: (mailbox: string, signal?: AbortSignal) =>
    request<void>(
      archiveMailboxPath(mailbox, false),
      jsonOptions('PATCH', undefined, signal),
      'empty',
    ),
  purgeMailbox: (mailbox: string, signal?: AbortSignal) =>
    request<void>(
      mailboxPath(mailbox),
      jsonOptions('DELETE', undefined, signal),
      'empty',
    ),
  message: (mailbox: string, id: string | number, signal?: AbortSignal) =>
    request<ParsedMessage>(messagePath(mailbox, id), { signal }),
  markRead: (mailbox: string, id: string | number, signal?: AbortSignal) =>
    request<void>(
      messagePath(mailbox, id, '/read'),
      jsonOptions('PATCH', undefined, signal),
      'empty',
    ),
  starredMessages: (signal?: AbortSignal) =>
    request<MessageSummary[]>('/v1/inbucket/starred/messages', { signal }),
  trashMessages: (
    query: MessageListQuery,
    cursor: string | null,
    signal?: AbortSignal,
  ) => request<MessagePage>(trashMessagesPath(query, cursor), { signal }),
  setTrashed: (
    mailbox: string,
    id: string | number,
    trashed: boolean,
    signal?: AbortSignal,
  ) =>
    request<{
      trashed: boolean
      available?: boolean
      message?: MessageSummary
    }>(
      messagePath(mailbox, id, '/trashed'),
      jsonOptions('PATCH', { trashed }, signal),
    ),
  emptyTrash: (signal?: AbortSignal) =>
    request<{ results: TrashResult[] }>(
      '/v1/inbucket/trash',
      jsonOptions('DELETE', undefined, signal),
    ),
  setStarred: (
    mailbox: string,
    id: string | number,
    starred: boolean,
    signal?: AbortSignal,
  ) =>
    request<{ starred: boolean; message?: MessageSummary }>(
      messagePath(mailbox, id, '/starred'),
      jsonOptions('PATCH', { starred }, signal),
    ),
  setTag: (
    mailbox: string,
    id: string | number,
    tagId: number,
    assigned: boolean,
    signal?: AbortSignal,
  ) =>
    request<{ assigned: boolean; tags: Tag[] }>(
      messagePath(mailbox, id, `/tags/${encode(tagId)}`),
      jsonOptions('PATCH', { assigned }, signal),
    ),
  messageSource: (mailbox: string, id: string | number, signal?: AbortSignal) =>
    request<string>(messagePath(mailbox, id, '/source'), { signal }, 'text'),
  attachments: (mailbox: string, id: string | number, signal?: AbortSignal) =>
    request<Attachment[]>(messagePath(mailbox, id, '/attachments'), { signal }),
  attachmentUrl: (mailbox: string, id: string | number, index: number) =>
    messagePath(mailbox, id, `/attachments/${encode(index)}`),
  download: (path: string, signal?: AbortSignal) =>
    request<Blob>(path, { signal }, 'blob'),
  inlineImageUrl: (mailbox: string, id: string | number, cid: string) =>
    `${messagePath(mailbox, id, '/inline-image')}?cid=${encode(cid)}`,
  emailFrameUrl: (remoteImages = false) =>
    remoteImages ? '/v1/email-frame?remote_images=true' : '/v1/email-frame',
  deleteMessage: (mailbox: string, id: string | number, signal?: AbortSignal) =>
    request<void>(
      deleteMessagePath(mailbox, id),
      jsonOptions('DELETE', undefined, signal),
      'empty',
    ),
}
