import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { messagePage, messages, parsedInvoice, session } from './test/fixtures'
import { renderApp } from './test/renderApp'
import type { LiveMessageChange, MessageSummary } from './types'

const deferred = () => {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const change = (
  message: MessageSummary,
  values: Partial<LiveMessageChange> = {},
): LiveMessageChange => ({
  mailbox: message.mailbox,
  id: String(message.id),
  available: true,
  created: true,
  archived: false,
  message,
  ...values,
})

const baseHandlers = () => [
  http.get('*/v1/session', () => HttpResponse.json(session)),
  http.get('*/v1/inbucket/mailboxes', ({ request }) =>
    HttpResponse.json(
      new URL(request.url).searchParams.get('archived') === 'true'
        ? [{ name: 'cold', message_count: 1 }]
        : ['orders', 'support'],
    ),
  ),
  http.get('*/v1/inbucket/starred/messages', () =>
    HttpResponse.json(
      messages.map((message) => ({ ...message, starred: true })),
    ),
  ),
  http.get('*/v1/inbucket/mailboxes/:mailbox/messages/:id', () =>
    HttpResponse.json(parsedInvoice),
  ),
  http.get('*/v1/inbucket/mailboxes/:mailbox/messages/:id/attachments', () =>
    HttpResponse.json([]),
  ),
  http.patch(
    '*/v1/inbucket/mailboxes/:mailbox/messages/:id/read',
    () => new HttpResponse(null, { status: 204 }),
  ),
]

describe('Live Mailboxes', () => {
  it('merges arrivals in place and applies mailbox selection rules', async () => {
    const gate = deferred()
    let liveRefreshes = 0
    const orderShared = {
      ...messages[0],
      id: 'shared',
      subject: 'Orders live invoice',
      tags: [{ id: 1, name: 'Live', color: '#1D4ED8' }],
      starred: true,
    }
    const newShared = {
      ...orderShared,
      mailbox: 'newbox',
      subject: 'New mailbox invoice',
    }
    const supportArrival = {
      ...messages[1],
      id: 'support-live',
      subject: 'Support live invoice',
    }
    const archivedArrival = {
      ...messages[0],
      mailbox: 'cold',
      id: 'cold-live',
      subject: 'Archived live invoice',
    }
    const unloadedUpdate = {
      ...messages[0],
      id: 'unloaded-update',
      subject: 'Historical unloaded invoice',
    }
    const user = userEvent.setup()
    renderApp(
      [
        ...baseHandlers(),
        http.get('*/v1/inbucket/messages', () =>
          HttpResponse.json(messagePage([messages[0]], 'next-page', [], 2)),
        ),
        http.get('*/v1/inbucket/live/messages', async ({ request }) => {
          const cursor = new URL(request.url).searchParams.get('cursor')
          if (!cursor) {
            return HttpResponse.json({
              changes: [],
              active_mailboxes: ['orders', 'support'],
              cursor: 'c0',
              has_more: true,
            })
          }
          if (cursor === 'c0') {
            liveRefreshes += 1
            await gate.promise
            return HttpResponse.json({
              changes: [
                change(orderShared),
                change(orderShared, { created: false }),
                change(newShared),
                change(supportArrival),
                change(archivedArrival, { archived: true }),
                change(unloadedUpdate, { created: false }),
              ],
              cursor: 'c1',
              has_more: false,
            })
          }
          return HttpResponse.json({
            changes: [],
            cursor,
            has_more: false,
          })
        }),
      ],
      '/?mailbox=orders',
    )

    await screen.findByRole('button', { name: /^Unread: August invoice/ })
    await user.click(
      screen.getByRole('checkbox', { name: 'Live all active mailboxes' }),
    )
    expect(
      screen.getByRole('checkbox', { name: 'Live all active mailboxes' }),
    ).not.toBeChecked()
    const search = screen.getByRole('searchbox', { name: 'Search messages' })
    await user.type(search, 'invoice')
    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )
    await user.click(screen.getByRole('radio', { name: 'Oldest first' }))
    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )
    search.focus()
    const list = screen
      .getByRole('region', { name: 'Messages' })
      .querySelector('.message-list')
    if (!(list instanceof HTMLElement)) throw new Error('Message list missing')
    list.scrollTop = 37

    await act(async () => gate.resolve())
    await waitFor(() => expect(liveRefreshes).toBeGreaterThan(0))

    expect(
      await screen.findByRole('button', {
        name: /^Unread: Orders live invoice/,
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: /^Unread: New mailbox invoice/,
      }),
    ).toBeVisible()
    expect(
      screen.getAllByRole('button', {
        name: /^Unread: Orders live invoice/,
      }),
    ).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: /^Read: Support live invoice/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Unread: Archived live invoice/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /^Unread: Historical unloaded invoice/,
      }),
    ).not.toBeInTheDocument()
    expect(search).toHaveValue('invoice')
    expect(search).toHaveFocus()
    expect(list.scrollTop).toBe(37)
    expect(screen.getByText('Showing 3 of 4 messages')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Load more messages' }),
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )
    expect(screen.getByRole('radio', { name: 'Oldest first' })).toBeChecked()
    expect(
      screen.queryByRole('group', { name: 'Mailbox' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )

    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    const saved = screen.getByRole('group', { name: 'Saved mailboxes' })
    expect(
      within(saved).getByRole('checkbox', { name: 'orders' }),
    ).toBeChecked()
    expect(
      within(saved).getByRole('checkbox', { name: 'newbox' }),
    ).toBeChecked()
    expect(
      within(saved).getByRole('checkbox', { name: 'support' }),
    ).not.toBeChecked()
    expect(
      within(saved).queryByRole('checkbox', { name: 'cold' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Starred' }))
    await screen.findByRole('heading', { name: 'Starred messages' })
    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )
    expect(screen.getByRole('group', { name: 'Mailbox' })).toBeVisible()
    expect(
      screen.getByRole('option', { name: 'All mailboxes' }),
    ).toBeInTheDocument()
  })

  it('shows live arrivals from all active mailboxes by default', async () => {
    const gate = deferred()
    const supportArrival = change(
      {
        ...messages[0],
        mailbox: 'support',
        id: 'support-live',
        subject: 'Support live invoice',
        seen: false,
      },
      { created: false },
    )

    renderApp(
      [
        ...baseHandlers(),
        http.get('*/v1/inbucket/messages', () =>
          HttpResponse.json(messagePage([messages[0]], 'next-page', [], 2)),
        ),
        http.get('*/v1/inbucket/live/messages', async ({ request }) => {
          const cursor = new URL(request.url).searchParams.get('cursor')
          if (!cursor) {
            return HttpResponse.json({
              changes: [],
              active_mailboxes: ['orders', 'support'],
              cursor: 'toggle-0',
              has_more: true,
            })
          }
          await gate.promise
          return HttpResponse.json({
            changes: [supportArrival],
            cursor: 'toggle-1',
            has_more: false,
          })
        }),
      ],
      '/?mailbox=orders',
    )

    await screen.findByRole('button', { name: /^Unread: August invoice/ })
    expect(
      screen.queryByRole('button', { name: /^Unread: Support live invoice/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Live all active mailboxes' }),
    ).toBeChecked()

    await act(async () => gate.resolve())
    expect(
      await screen.findByRole('button', {
        name: /^Unread: Support live invoice/,
      }),
    ).toBeVisible()
    expect(screen.getByText('Showing 2 of 3 messages')).toBeVisible()
  })

  it('keeps the inspector selected and shows the unavailable outcome after deletion', async () => {
    const gate = deferred()
    renderApp(
      [
        ...baseHandlers(),
        http.get('*/v1/inbucket/messages', () =>
          HttpResponse.json(messagePage([messages[0]], 'next-page', [], 2)),
        ),
        http.get('*/v1/inbucket/live/messages', async ({ request }) => {
          const cursor = new URL(request.url).searchParams.get('cursor')
          if (!cursor) {
            return HttpResponse.json({
              changes: [],
              active_mailboxes: ['orders', 'support'],
              cursor: 'delete-0',
              has_more: true,
            })
          }
          await gate.promise
          return HttpResponse.json({
            changes: [
              change(messages[0], { available: false, created: false }),
            ],
            cursor: 'delete-1',
            has_more: false,
          })
        }),
      ],
      '/?mailbox=orders&message=invoice',
    )

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    const back = screen.getByRole('button', { name: 'Back to message list' })
    expect(back).toHaveFocus()

    await act(async () => gate.resolve())

    expect(await screen.findByText('The message was not found.')).toBeVisible()
    expect(screen.getByLabelText('Message inspector')).toBeVisible()
    expect(back).toHaveFocus()
    expect(window.location.search).toBe('?mailbox=orders&message=invoice')
  })

  it('preserves an open inspector when another message arrives', async () => {
    const gate = deferred()
    const user = userEvent.setup()
    const arrival = {
      ...messages[0],
      id: 'new-invoice',
      subject: 'New invoice beside inspector',
    }
    renderApp(
      [
        ...baseHandlers(),
        http.get('*/v1/inbucket/messages', () =>
          HttpResponse.json(messagePage([messages[0]])),
        ),
        http.get('*/v1/inbucket/live/messages', async ({ request }) => {
          const cursor = new URL(request.url).searchParams.get('cursor')
          if (!cursor) {
            return HttpResponse.json({
              changes: [],
              active_mailboxes: ['orders', 'support'],
              cursor: 'inspector-0',
              has_more: true,
            })
          }
          await gate.promise
          return HttpResponse.json({
            changes: [change(arrival)],
            cursor: 'inspector-1',
            has_more: false,
          })
        }),
      ],
      '/?mailbox=orders&message=invoice',
    )

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    const back = screen.getByRole('button', { name: 'Back to message list' })
    expect(back).toHaveFocus()

    await act(async () => gate.resolve())

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    expect(back).toHaveFocus()
    await user.click(back)
    expect(
      screen.getByRole('button', {
        name: /^Unread: New invoice beside inspector/,
      }),
    ).toBeVisible()
  })

  it('retains an arrival received while Mailboxes is hidden', async () => {
    const gate = deferred()
    const user = userEvent.setup()
    const arrival = {
      ...messages[0],
      id: 'while-away',
      subject: 'Arrived while archived was open',
    }
    renderApp(
      [
        ...baseHandlers(),
        http.get('*/v1/inbucket/messages', () =>
          HttpResponse.json(messagePage([messages[0]])),
        ),
        http.get('*/v1/inbucket/live/messages', async ({ request }) => {
          const cursor = new URL(request.url).searchParams.get('cursor')
          if (!cursor) {
            return HttpResponse.json({
              changes: [],
              active_mailboxes: ['orders', 'support'],
              cursor: 'away-0',
              has_more: true,
            })
          }
          await gate.promise
          return HttpResponse.json({
            changes: [change(arrival)],
            cursor: 'away-1',
            has_more: false,
          })
        }),
      ],
      '/?mailbox=orders',
    )

    await screen.findByRole('button', { name: /^Unread: August invoice/ })
    await user.click(screen.getByRole('button', { name: 'Archived' }))
    await screen.findByRole('heading', { name: 'Archived mailboxes' })
    await act(async () => gate.resolve())
    await user.click(screen.getByRole('button', { name: 'Mailboxes' }))

    expect(
      await screen.findByRole('button', {
        name: /^Unread: Arrived while archived was open/,
      }),
    ).toBeVisible()
  })

  it('keeps rows on retryable failure and expires on a later authorization failure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let refresh = 0
    renderApp(
      [
        ...baseHandlers(),
        http.get('*/v1/inbucket/messages', () =>
          HttpResponse.json(messagePage([messages[0]], 'next-page', [], 2)),
        ),
        http.get('*/v1/inbucket/live/messages', ({ request }) => {
          const cursor = new URL(request.url).searchParams.get('cursor')
          if (!cursor) {
            return HttpResponse.json({
              changes: [],
              active_mailboxes: ['orders', 'support'],
              cursor: 'failure-0',
              has_more: true,
            })
          }
          refresh += 1
          return refresh === 1
            ? HttpResponse.json({ error: 'unavailable' }, { status: 502 })
            : HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
        }),
      ],
      '/?mailbox=orders',
    )

    expect(
      await screen.findByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()
    expect(
      await screen.findByText('Live updates are temporarily unavailable.'),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(
      await screen.findByText(
        'Your session has expired. Sign in again to continue.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Username' })).toBeVisible()
    vi.useRealTimers()
  })

  it('does not start live refresh while signed out', async () => {
    let liveRequests = 0
    renderApp([
      http.get('*/v1/session', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
      http.get('*/v1/inbucket/live/messages', () => {
        liveRequests += 1
        return HttpResponse.json({
          changes: [],
          cursor: 'unused',
          has_more: false,
        })
      }),
    ])

    expect(
      await screen.findByText('Sign in to browse Inbucket mailboxes.'),
    ).toBeVisible()
    await waitFor(() => expect(liveRequests).toBe(0))
  })
})
