import type { HeaderValue, ListSort, MessageSummary, ReadFilter } from './types'
import { withinDateRange } from './dateRange'

export const formatValue = (value: HeaderValue): string => {
  if (Array.isArray(value))
    return value.map(formatValue).filter(Boolean).join(', ')
  if (value && typeof value === 'object') {
    return value.address || value.email || value.name || ''
  }
  return value === undefined || value === null ? '' : String(value)
}

export const headerValue = (message: MessageSummary, name: string): string => {
  if (!message.header || typeof message.header !== 'object') return ''
  const key = Object.keys(message.header).find(
    (candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase(),
  )
  return key ? formatValue(message.header[key]) : ''
}

export const dateText = (value: HeaderValue): string => {
  const text = formatValue(value)
  if (!text) return 'Unknown date'
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime())
    ? text
    : new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(parsed)
}

export const compactDateText = (
  value: HeaderValue,
  now = new Date(),
): string => {
  const text = formatValue(value)
  if (!text) return 'Unknown date'
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text
  const today =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  const parts = new Intl.DateTimeFormat(
    today ? 'en-US' : 'en-GB',
    today
      ? { hour: 'numeric', minute: '2-digit', hour12: true }
      : { day: 'numeric', month: 'short' },
  ).formatToParts(parsed)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value || ''
  return today
    ? `${part('hour')}:${part('minute')} ${part('dayPeriod')}`
    : `${part('day')} ${part('month')}`
}

export const fileSizeText = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return ''
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB']
  let size = value / 1024
  let unit = units[0]
  for (let index = 1; size >= 1024 && index < units.length; index += 1) {
    size /= 1024
    unit = units[index]
  }
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(size)} ${unit}`
}

const timestamp = (message: MessageSummary): number | null => {
  if (message['posix-millis'] !== undefined) {
    const value = Number(message['posix-millis'])
    if (Number.isFinite(value)) return value
  }
  const value = Date.parse(formatValue(message.date))
  return Number.isFinite(value) ? value : null
}

const size = (message: MessageSummary): number | null => {
  if (
    message.size === undefined ||
    message.size === null ||
    message.size === ''
  ) {
    return null
  }
  const value = Number(message.size)
  return Number.isFinite(value) ? value : null
}

const compareKnown = (
  left: number | null,
  right: number | null,
  direction: 1 | -1,
): number => {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return (left - right) * direction
}

export const sortMessages = <T extends MessageSummary>(
  messages: readonly T[],
  sort: ListSort,
): T[] =>
  messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const comparison =
        sort === 'oldest'
          ? compareKnown(timestamp(left.message), timestamp(right.message), 1)
          : sort === 'largest'
            ? compareKnown(size(left.message), size(right.message), -1)
            : sort === 'smallest'
              ? compareKnown(size(left.message), size(right.message), 1)
              : compareKnown(
                  timestamp(left.message),
                  timestamp(right.message),
                  -1,
                )
      return comparison || left.index - right.index
    })
    .map(({ message }) => message)

export const messageSearchText = (message: MessageSummary): string =>
  [
    formatValue(message.subject) || '(No subject)',
    formatValue(message.from) || 'Unknown sender',
    formatValue(message.to),
    message.mailbox,
    dateText(message.date),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()

export const filterMessages = <T extends MessageSummary>(
  messages: readonly T[],
  search: string,
  readFilter: ReadFilter,
  mailbox = '',
  tag = '',
  dateFrom = '',
  dateTo = '',
): T[] => {
  const query = search.trim().toLocaleLowerCase()
  return messages.filter((message) => {
    const matchesSearch = messageSearchText(message).includes(query)
    const matchesRead =
      readFilter === 'all' ||
      (message.seen === true) === (readFilter === 'read')
    const matchesMailbox = !mailbox || message.mailbox === mailbox
    const matchesTag =
      !tag || message.tags?.some((candidate) => String(candidate.id) === tag)
    const matchesDate = withinDateRange(timestamp(message), dateFrom, dateTo)
    return (
      matchesSearch &&
      matchesRead &&
      matchesMailbox &&
      matchesTag &&
      matchesDate
    )
  })
}

export const emptyListText = (
  noun: string,
  query: string,
  readFilter: ReadFilter,
  mailbox = '',
  tag = '',
  dateFrom = '',
  dateTo = '',
): string => {
  const searched = Boolean(query.trim())
  const filtered =
    readFilter !== 'all' ||
    Boolean(mailbox) ||
    Boolean(tag) ||
    Boolean(dateFrom) ||
    Boolean(dateTo)
  if (searched && filtered) return `No ${noun} match your search and filters.`
  if (searched) return `No ${noun} match your search.`
  return `No ${noun} match the selected filters.`
}

export const accessibleSummary = (message: MessageSummary): string => {
  const tags = message.tags?.map((tag) => tag.name).join(', ')
  return `${formatValue(message.subject) || '(No subject)'}, ${formatValue(message.from) || 'Unknown sender'}, ${dateText(message.date)}${tags ? `, tags: ${tags}` : ''}`
}
