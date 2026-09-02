import type {
  ArchivedMailbox,
  MessagePage,
  MessageSummary,
  ParsedMessage,
  Session,
} from '../types'

export const messagePage = (
  pageMessages: MessageSummary[],
  nextCursor: string | null = null,
  partialMailboxes: string[] = [],
  totalCount = pageMessages.length,
): MessagePage => ({
  messages: pageMessages,
  next_cursor: nextCursor,
  partial_mailboxes: partialMailboxes,
  total_count: totalCount,
})

export const session: Session = {
  authenticated: true,
  username: 'admin',
  expires_at: '2026-08-29T12:00:00Z',
}

export const messages: MessageSummary[] = [
  {
    id: 'invoice',
    mailbox: 'orders',
    subject: 'August invoice',
    from: 'billing@example.com',
    to: 'alex@example.com',
    date: '2026-08-27T12:00:00Z',
    size: 300,
    seen: false,
  },
  {
    id: 'welcome',
    mailbox: 'support',
    subject: 'Welcome aboard',
    from: 'hello@example.com',
    to: 'team@example.com',
    date: '2026-08-26T12:00:00Z',
    size: 100,
    seen: true,
  },
]

export const parsedInvoice: ParsedMessage = {
  ...messages[0],
  body: {
    html: '<p>Invoice body</p>',
    text: 'Invoice body',
  },
  header: { To: ['alex@example.com'] },
}

export const archived: ArchivedMailbox[] = [
  { name: 'old-orders', message_count: 2 },
  { name: 'unknown-count', message_count: null },
]
