export type ViewName = 'mailboxes' | 'starred' | 'archive' | 'trash'

export type AuthenticationState =
  | 'checking'
  | 'signed-out'
  | 'authenticating'
  | 'authenticated'
  | 'expired'
  | 'unavailable'

export type ReadFilter = 'all' | 'read' | 'unread'

export type ListSort = 'newest' | 'oldest' | 'largest' | 'smallest'

export interface MessageListQuery {
  search: string
  read: ReadFilter
  mailbox: string
  tag: string
  dateFrom: string
  dateTo: string
  sort: ListSort
}

export interface Tag {
  id: number
  name: string
  color: string
}

export type HeaderValue =
  | string
  | number
  | null
  | undefined
  | HeaderValue[]
  | { address?: string; email?: string; name?: string }

export interface Session {
  authenticated: true
  username: string
  expires_at: string
}

export interface ArchivedMailbox {
  name: string
  message_count: number | null
}

export interface MessageBody {
  html?: HeaderValue
  text?: HeaderValue
}

export interface MessageSummary {
  id: string | number
  mailbox: string
  subject?: HeaderValue
  from?: HeaderValue
  to?: HeaderValue
  date?: HeaderValue
  size?: number | string | null
  seen?: boolean | unknown
  starred?: boolean | unknown
  tags?: Tag[]
  available?: boolean
  trashed_at?: string
  'posix-millis'?: number | string
  header?: Record<string, HeaderValue>
}

export interface MessagePage {
  messages: MessageSummary[]
  next_cursor: string | null
  partial_mailboxes: string[]
  total_count: number
  mailboxes?: string[]
  trash_count?: number
}

export interface TrashResult {
  mailbox: string
  id: string
  deleted: boolean
  error: string | null
}

export interface LiveMessageChange {
  mailbox: string
  id: string
  available: boolean
  created: boolean
  archived: boolean
  message: MessageSummary
}

export interface LiveMessagePage {
  changes: LiveMessageChange[]
  active_mailboxes?: string[]
  cursor: string
  has_more: boolean
}

export interface ParsedMessage extends MessageSummary {
  body?: MessageBody
}

export interface Attachment {
  index: number
  filename: string
  content_type: string
  size: number
}

export interface StatusValue {
  message: string
  state?: 'authenticated' | 'error' | 'loading' | 'expired' | 'signed-out'
}

export interface SelectedMessage {
  mailbox: string
  id: string
  unavailable?: boolean
}
