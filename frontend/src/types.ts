export type ViewName = 'mailboxes' | 'starred' | 'archive' | 'trash' | 'rules'

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

export interface NotificationTimeWindow {
  days: number[]
  start: string
  finish: string
}

export interface RuleConditions {
  mailboxes: string[]
  senders: string[]
  recipients: string[]
  subject?: string
  minimum_size?: number
  maximum_size?: number
  has_attachments?: boolean
  tag_ids: number[]
  time_windows: NotificationTimeWindow[]
}

export interface RuleActions {
  in_app: boolean
  browser: boolean
  destination_ids: number[]
  star: boolean
  mark_read: boolean
  tag_ids: number[]
  move_to_trash: boolean
}

export interface NotificationEmailMethod {
  kind: 'email'
  recipients: string[]
}

export interface NotificationNtfyMethod {
  kind: 'ntfy'
  host: string
  topic: string
  token?: string
}

export interface NotificationWebhookHeader {
  name: string
  value: string
}

export interface NotificationWebhookMethod {
  kind: 'webhook'
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers: NotificationWebhookHeader[]
  body: string
}

export type NotificationDestinationMethod =
  NotificationEmailMethod | NotificationNtfyMethod | NotificationWebhookMethod

export interface NotificationDestination {
  id: number
  name: string
  methods: NotificationDestinationMethod[]
}

export interface NotificationDestinationDefaults {
  ntfy_host?: string
  webhook_url?: string
}

export interface NotificationDestinationsResponse {
  destinations: NotificationDestination[]
  defaults: NotificationDestinationDefaults
}

export interface NotificationDestinationTestResult {
  kind: NotificationDestinationMethod['kind']
  message: string
}

export interface MessageRule {
  id: number
  name: string
  enabled: boolean
  priority: number
  cooldown_seconds: number
  schema_version: number
  conditions: RuleConditions
  actions: RuleActions
  last_error_code: string | null
  last_failed_at: string | null
  summary: string
}

export interface RuleLuaState {
  desired_revision: string
  active_revision: string | null
  active: boolean
  last_error_code: string | null
  last_failed_at: string | null
}

export interface MessageRulesResponse {
  rules: MessageRule[]
  lua: RuleLuaState
}

export interface NotificationDelivery {
  id: number
  rule_name: string
  mailbox: string
  message_id: string
  kind: 'in_app' | 'browser' | 'email' | 'ntfy' | 'webhook'
  status: string
  recipient: string | null
  created_at: string
  delivered_at: string | null
  read_at: string | null
  error_code: string | null
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
