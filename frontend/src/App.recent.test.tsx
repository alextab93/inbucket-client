import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { messagePage, messages, parsedInvoice, session } from './test/fixtures'
import { renderApp } from './test/renderApp'
import type { MessageSummary } from './types'

const baseHandlers = () => [
  http.get('*/v1/session', () => HttpResponse.json(session)),
  http.get('*/v1/inbucket/mailboxes', ({ request }) =>
    HttpResponse.json(
      new URL(request.url).searchParams.get('archived') === 'true'
        ? []
        : ['orders', 'support'],
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

const historyHandler = (
  summaries: MessageSummary[] = messages,
  pageSize = summaries.length,
) =>
  http.get('*/v1/inbucket/messages', ({ request }) => {
    const params = new URL(request.url).searchParams
    const mailboxes = params.getAll('mailboxes[]')
    const search = (params.get('search') || '').toLowerCase()
    const read = params.get('read')
    const found = summaries.filter(
      (message) =>
        (params.get('scope') === 'recent' ||
          mailboxes.includes(message.mailbox)) &&
        String(message.subject).toLowerCase().includes(search) &&
        (read !== 'read' || message.seen === true) &&
        (read !== 'unread' || message.seen !== true),
    )
    const start = Number(params.get('cursor') || '0')
    const end = start + pageSize
    return HttpResponse.json(
      messagePage(
        found.slice(start, end),
        end < found.length ? String(end) : null,
        [],
        found.length,
      ),
    )
  })

const deferred = () => {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('recent messages', () => {
  it('shows recent history on startup without selecting saved mailboxes', async () => {
    const user = userEvent.setup()
    renderApp([...baseHandlers(), historyHandler()])

    expect(
      await screen.findByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()
    expect(screen.getByText('Recent messages')).toBeVisible()
    expect(screen.getByText('Showing 2 of 2 messages')).toBeVisible()
    expect(
      screen.getByRole('checkbox', { name: 'Live all active mailboxes' }),
    ).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Live all active mailboxes' }),
    ).toBeDisabled()

    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    const saved = screen.getByRole('group', { name: 'Saved mailboxes' })
    expect(
      within(saved).getByRole('checkbox', { name: 'orders' }),
    ).not.toBeChecked()
    expect(
      within(saved).getByRole('checkbox', { name: 'support' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Archive selected' }),
    ).toBeDisabled()
    expect(window.location.search).toBe('')
  })

  it('shows selected mailbox history and restores recent history after clearing it', async () => {
    const user = userEvent.setup()
    renderApp([...baseHandlers(), historyHandler()])

    await screen.findByRole('button', { name: /^Read: Welcome aboard/ })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    await user.click(screen.getByRole('checkbox', { name: 'orders' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^Read: Welcome aboard/ }),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()
    expect(screen.getByText('Showing 1 of 1 message')).toBeVisible()
    expect(new URLSearchParams(window.location.search).get('mailbox')).toBe(
      'orders',
    )
    expect(new URLSearchParams(window.location.search).has('scope')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(
      await screen.findByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()
    expect(screen.getByText('Recent messages')).toBeVisible()
    expect(screen.getByText('Showing 2 of 2 messages')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'orders' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'support' })).not.toBeChecked()
    expect(window.location.search).toBe('')
  })

  it('paginates and filters recent history across mailboxes', async () => {
    const user = userEvent.setup()
    const olderInvoice = {
      ...messages[1],
      id: 'older-invoice',
      subject: 'Older invoice',
    }
    renderApp([
      ...baseHandlers(),
      historyHandler([messages[0], messages[1], olderInvoice], 1),
    ])

    await screen.findByRole('button', { name: /^Unread: August invoice/ })
    expect(screen.getByText('Showing 1 of 3 messages')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Load more messages' }))
    expect(
      await screen.findByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()
    expect(screen.getByText('Showing 2 of 3 messages')).toBeVisible()

    await user.type(
      screen.getByRole('searchbox', { name: 'Search messages' }),
      'invoice',
    )
    expect(await screen.findByText('Showing 1 of 2 messages')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Read: Welcome aboard/ }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load more messages' }))
    expect(
      await screen.findByRole('button', { name: /^Read: Older invoice/ }),
    ).toBeVisible()
    expect(screen.getByText('Showing 2 of 2 messages')).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )
    await user.click(screen.getByRole('radio', { name: 'Read' }))

    expect(await screen.findByText('Showing 1 of 1 message')).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Read: Older invoice/ }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Unread: August invoice/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Load more messages' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Recent messages')).toBeVisible()
  })

  it('keeps recent scope and unselected mailboxes when reopening a message URL', async () => {
    const user = userEvent.setup()
    const handlers = [...baseHandlers(), historyHandler()]
    const firstRender = renderApp(handlers)

    await user.click(
      await screen.findByRole('button', { name: /^Unread: August invoice/ }),
    )
    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    const params = new URLSearchParams(window.location.search)
    expect(params.get('scope')).toBe('recent')
    expect(params.get('mailbox')).toBe('orders')
    expect(params.get('message')).toBe('invoice')
    expect(params.getAll('mailboxes')).toEqual([])

    const reloadPath = `${window.location.pathname}${window.location.search}`
    firstRender.unmount()
    renderApp(handlers, reloadPath)

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    expect(new URLSearchParams(window.location.search).get('scope')).toBe(
      'recent',
    )
    await user.click(
      screen.getByRole('button', { name: 'Back to message list' }),
    )
    expect(
      await screen.findByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()
    expect(screen.getByText('Recent messages')).toBeVisible()
    expect(window.location.search).toBe('')
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    expect(screen.getByRole('checkbox', { name: 'orders' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'support' })).not.toBeChecked()
  })

  it('shows a live arrival from a new mailbox without selecting any mailbox', async () => {
    const user = userEvent.setup()
    const gate = deferred()
    const arrival = {
      ...messages[0],
      mailbox: 'alerts',
      id: 'alert',
      subject: 'New mailbox notification',
    }
    renderApp([
      ...baseHandlers(),
      historyHandler(),
      http.get('*/v1/inbucket/live/messages', async ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (!cursor) {
          return HttpResponse.json({
            changes: [],
            active_mailboxes: ['orders', 'support'],
            cursor: 'recent-start',
            has_more: true,
          })
        }
        if (cursor === 'recent-start') {
          await gate.promise
          return HttpResponse.json({
            changes: [
              {
                mailbox: arrival.mailbox,
                id: arrival.id,
                available: true,
                created: true,
                archived: false,
                message: arrival,
              },
            ],
            cursor: 'recent-arrival',
            has_more: false,
          })
        }
        return HttpResponse.json({ changes: [], cursor, has_more: false })
      }),
    ])

    await screen.findByRole('button', { name: /^Unread: August invoice/ })
    await act(async () => gate.resolve())

    expect(
      await screen.findByRole('button', {
        name: /^Unread: New mailbox notification/,
      }),
    ).toBeVisible()
    expect(screen.getByText('Showing 3 of 3 messages')).toBeVisible()
    expect(screen.getByText('Recent messages')).toBeVisible()
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    const saved = screen.getByRole('group', { name: 'Saved mailboxes' })
    for (const mailbox of ['orders', 'support', 'alerts']) {
      expect(
        within(saved).getByRole('checkbox', { name: mailbox }),
      ).not.toBeChecked()
    }
    expect(window.location.search).toBe('')
  })

  it('includes a restored mailbox in recent history without selecting it', async () => {
    const user = userEvent.setup()
    let restored = false
    const restoredMessage = {
      ...messages[0],
      mailbox: 'old-orders',
      id: 'old-invoice',
      subject: 'Restored invoice',
    }
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      http.get('*/v1/inbucket/mailboxes', ({ request }) => {
        const archived =
          new URL(request.url).searchParams.get('archived') === 'true'
        return HttpResponse.json(
          archived
            ? restored
              ? []
              : [{ name: 'old-orders', message_count: 1 }]
            : restored
              ? ['orders', 'support', 'old-orders']
              : ['orders', 'support'],
        )
      }),
      http.patch('*/v1/inbucket/mailbox/archive', ({ request }) => {
        const params = new URL(request.url).searchParams
        if (
          params.get('name') !== 'old-orders' ||
          params.get('archived') !== 'false'
        ) {
          return HttpResponse.json(
            { error: 'invalid_mailbox' },
            { status: 422 },
          )
        }
        restored = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('*/v1/inbucket/messages', ({ request }) => {
        const params = new URL(request.url).searchParams
        const available = restored ? [...messages, restoredMessage] : messages
        return HttpResponse.json(
          messagePage(
            params.get('scope') === 'recent'
              ? available
              : available.filter((message) =>
                  params.getAll('mailboxes[]').includes(message.mailbox),
                ),
          ),
        )
      }),
    ])

    await screen.findByRole('button', { name: /^Unread: August invoice/ })
    expect(
      screen.queryByRole('button', { name: /^Unread: Restored invoice/ }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Archived' }))
    await user.click(
      await screen.findByRole('button', { name: 'Restore old-orders' }),
    )
    expect(await screen.findByText('Restored old-orders.')).toBeVisible()
    expect(screen.getByText('No archived mailboxes.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Mailboxes' }))

    expect(
      await screen.findByRole('button', { name: /^Unread: Restored invoice/ }),
    ).toBeVisible()
    expect(screen.getByText('Showing 3 of 3 messages')).toBeVisible()
    expect(screen.getByText('Recent messages')).toBeVisible()
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    const saved = screen.getByRole('group', { name: 'Saved mailboxes' })
    for (const mailbox of ['orders', 'support', 'old-orders']) {
      expect(
        within(saved).getByRole('checkbox', { name: mailbox }),
      ).not.toBeChecked()
    }
    expect(window.location.search).toBe('')
  })

  it('includes arrivals received before the live cursor is established', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const bootstrapResponse = deferred()
    let available = [messages[0]]
    try {
      renderApp([
        ...baseHandlers(),
        http.get('*/v1/inbucket/messages', async () => {
          const snapshot = [...available]
          await bootstrapResponse.promise
          return HttpResponse.json(messagePage(snapshot))
        }),
        http.get('*/v1/inbucket/live/messages', async ({ request }) => {
          const cursor = new URL(request.url).searchParams.get('cursor')
          await bootstrapResponse.promise
          return HttpResponse.json({
            changes: [],
            ...(cursor ? {} : { active_mailboxes: ['orders', 'support'] }),
            cursor: 'after-welcome',
            has_more: false,
          })
        }),
      ])

      await screen.findByRole('heading', { name: 'Messages' })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      available = [...messages]
      await act(async () => bootstrapResponse.resolve())

      expect(
        await screen.findByRole('button', { name: /^Read: Welcome aboard/ }),
      ).toBeVisible()
      expect(
        screen.getByRole('button', { name: /^Unread: August invoice/ }),
      ).toBeVisible()
      expect(screen.getByText('Showing 2 of 2 messages')).toBeVisible()
      expect(screen.getByText('Recent messages')).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })

  it('retains arrivals received while the initial history response is pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const historyPending = deferred()
    const historyResponse = deferred()
    const arrival = {
      ...messages[0],
      id: 'during-startup',
      subject: 'Arrived during startup',
    }
    try {
      renderApp([
        ...baseHandlers(),
        http.get('*/v1/inbucket/messages', async () => {
          historyPending.resolve()
          await historyResponse.promise
          return HttpResponse.json(messagePage(messages))
        }),
        http.get('*/v1/inbucket/live/messages', ({ request }) => {
          const cursor = new URL(request.url).searchParams.get('cursor')
          if (!cursor) {
            return HttpResponse.json({
              changes: [],
              active_mailboxes: ['orders', 'support'],
              cursor: 'before-history',
              has_more: true,
            })
          }
          return HttpResponse.json({
            changes:
              cursor === 'before-history'
                ? [
                    {
                      mailbox: arrival.mailbox,
                      id: arrival.id,
                      available: true,
                      created: true,
                      archived: false,
                      message: arrival,
                    },
                  ]
                : [],
            cursor: 'after-arrival',
            has_more: false,
          })
        }),
      ])

      await act(async () => historyPending.promise)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      await act(async () => historyResponse.resolve())

      expect(
        await screen.findByRole('button', {
          name: /^Unread: Arrived during startup/,
        }),
      ).toBeVisible()
      expect(
        screen.getByRole('button', { name: /^Unread: August invoice/ }),
      ).toBeVisible()
      expect(
        screen.getByRole('button', { name: /^Read: Welcome aboard/ }),
      ).toBeVisible()
      expect(screen.getByText('Showing 3 of 3 messages')).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })
})
