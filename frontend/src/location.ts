import type { ViewName } from './types'

export interface AppLocation {
  view: ViewName
  mailbox: string
  message: string
  selectedMailboxes?: string[]
}

export type HistoryMode = 'push' | 'replace'

const viewNames: ViewName[] = ['mailboxes', 'starred', 'trash', 'archive']

export const readLocation = (): AppLocation => {
  const url = new URL(window.location.href)
  const requestedView = url.searchParams.get('view')
  const legacyMonitor = requestedView === 'monitor'
  const view = viewNames.includes(requestedView as ViewName)
    ? (requestedView as ViewName)
    : 'mailboxes'
  const supportsMessage =
    view === 'mailboxes' || view === 'starred' || view === 'trash'
  let mailbox =
    supportsMessage && !legacyMonitor
      ? url.searchParams.get('mailbox')?.trim() || ''
      : ''
  let message = mailbox ? url.searchParams.get('message')?.trim() || '' : ''
  if ((view === 'starred' || view === 'trash') && !message) {
    mailbox = ''
    message = ''
  }

  const selectedMailboxes =
    view === 'mailboxes' && !legacyMonitor
      ? [
          ...new Set(
            url.searchParams
              .getAll('mailboxes')
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ]
      : []
  if (view === 'mailboxes' && mailbox && !selectedMailboxes.includes(mailbox)) {
    selectedMailboxes.push(mailbox)
  }

  return { view, mailbox, message, selectedMailboxes }
}

export const writeLocation = (
  location: AppLocation,
  mode: HistoryMode = 'replace',
) => {
  const url = new URL(window.location.href)
  url.hash = ''
  if (location.view === 'mailboxes') url.searchParams.delete('view')
  else url.searchParams.set('view', location.view)

  const supportsMessage =
    location.view === 'mailboxes' ||
    location.view === 'starred' ||
    location.view === 'trash'
  const selectedMailboxes =
    location.view === 'mailboxes'
      ? [
          ...new Set(
            (location.selectedMailboxes || [])
              .map((mailbox) => mailbox.trim())
              .filter(Boolean),
          ),
        ]
      : []
  const mailbox =
    location.view === 'mailboxes' &&
    !location.mailbox &&
    selectedMailboxes.length === 1
      ? selectedMailboxes[0]
      : location.mailbox
  url.searchParams.delete('mailboxes')
  if (location.view === 'mailboxes' && selectedMailboxes.length > 1) {
    selectedMailboxes.forEach((selected) =>
      url.searchParams.append('mailboxes', selected),
    )
  }
  if (supportsMessage && mailbox) url.searchParams.set('mailbox', mailbox)
  else url.searchParams.delete('mailbox')
  if (supportsMessage && mailbox && location.message)
    url.searchParams.set('message', location.message)
  else url.searchParams.delete('message')

  const target = `${url.pathname}${url.search}`
  if (mode === 'push') window.history.pushState(null, '', target)
  else window.history.replaceState(null, '', target)
}
