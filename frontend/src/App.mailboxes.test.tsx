import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { filterMessages, sortMessages } from './formatting'
import { messagePage, messages, parsedInvoice, session } from './test/fixtures'
import { renderApp } from './test/renderApp'
import type {
  ArchivedMailbox,
  ListSort,
  MessageSummary,
  ParsedMessage,
  ReadFilter,
} from './types'

const catalogHandlers = (active: () => string[], archived: () => unknown[]) => [
  http.get('*/v1/inbucket/mailboxes', ({ request }) => {
    const archivedRequested =
      new URL(request.url).searchParams.get('archived') === 'true'
    return HttpResponse.json(archivedRequested ? archived() : active())
  }),
]

const paginatedMessages = (
  request: Request,
  messagesFor: (mailbox: string) => MessageSummary[],
) => {
  const params = new URL(request.url).searchParams
  const requested = params.getAll('mailboxes[]')
  const read = (params.get('read') || 'all') as ReadFilter
  const sort = (params.get('sort') || 'newest') as ListSort
  const found = requested.flatMap(messagesFor)
  const receivedAfter = Date.parse(params.get('received_after') || '')
  const receivedBefore = Date.parse(params.get('received_before') || '')
  const dated = found.filter((message) => {
    const timestamp = Date.parse(String(message.date || ''))
    if (!Number.isFinite(timestamp)) {
      return !Number.isFinite(receivedAfter) && !Number.isFinite(receivedBefore)
    }
    return (
      (!Number.isFinite(receivedAfter) || timestamp >= receivedAfter) &&
      (!Number.isFinite(receivedBefore) || timestamp < receivedBefore)
    )
  })
  return messagePage(
    sortMessages(filterMessages(dated, params.get('search') || '', read), sort),
  )
}

const paginatedMessageHandler = (
  messagesFor: (mailbox: string) => MessageSummary[],
) =>
  http.get('*/v1/inbucket/messages', ({ request }) =>
    HttpResponse.json(paginatedMessages(request, messagesFor)),
  )

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('mailbox workspace', () => {
  it('closes mailbox and filter panels with focus restored', async () => {
    const user = userEvent.setup()
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders'],
        () => [],
      ),
      paginatedMessageHandler((name) =>
        messages.filter((message) => message.mailbox === name),
      ),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    const showControls = screen.getByRole('button', {
      name: 'Show mailbox controls',
    })
    expect(showControls).toHaveAttribute('aria-expanded', 'false')
    expect(showControls).toHaveAttribute('aria-controls', 'mailbox-controls')

    await user.click(showControls)
    const hideControls = screen.getByRole('button', {
      name: 'Hide mailbox controls',
    })
    expect(hideControls).toHaveAttribute('aria-expanded', 'true')

    await user.click(hideControls)
    expect(
      screen.getByRole('button', { name: 'Show mailbox controls' }),
    ).toHaveAttribute('aria-expanded', 'false')

    const filterTrigger = screen.getByRole('button', {
      name: 'Filter and sort messages',
    })
    await user.click(filterTrigger)
    await user.click(screen.getByRole('button', { name: 'Close filters' }))

    expect(filterTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(filterTrigger).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: 'Close filters' }),
    ).not.toBeInTheDocument()

    const manageMailboxes = screen.getByLabelText('Manage saved mailboxes')
    await user.click(manageMailboxes)
    expect(
      screen.getByRole('form', { name: 'Add mailbox' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Mailbox name' }),
    ).toHaveAttribute('placeholder', 'Mailbox name')
    expect(
      screen.getByRole('button', { name: 'Add and open mailbox' }),
    ).toHaveTextContent('Add')
    expect(screen.getByRole('button', { name: 'Select all' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Archive selected' }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: 'Close saved mailboxes' }),
    )
    expect(manageMailboxes).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: 'Close saved mailboxes' }),
    ).not.toBeInTheDocument()
  })

  it('combines mailboxes and filters and sorts visible messages', async () => {
    const user = userEvent.setup()
    const mailboxMessages: Record<string, MessageSummary[]> = {
      orders: [
        messages[0],
        {
          ...messages[0],
          id: 'invoice-copy',
          subject: 'August invoice copy',
        },
        {
          id: 'unknown',
          mailbox: 'orders',
          subject: 'Unknown values',
          from: 'unknown@example.com',
          date: 'not-a-date',
        },
      ],
      support: [messages[1]],
    }
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders', 'support'],
        () => [],
      ),
      paginatedMessageHandler((name) => mailboxMessages[name] || []),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    await user.click(screen.getByRole('checkbox', { name: 'orders' }))
    expect(
      await screen.findByRole('button', {
        name: /^Unread: August invoice, /,
      }),
    ).toBeVisible()
    await user.click(screen.getByRole('checkbox', { name: 'support' }))
    await waitFor(() =>
      expect(document.querySelector('.mailbox-status')).toHaveTextContent(
        '4 messages in 2 mailboxes.',
      ),
    )
    expect(
      await screen.findByRole('button', { name: /Read: Welcome aboard/ }),
    ).toBeVisible()

    const search = screen.getByRole('searchbox', { name: 'Search messages' })
    await user.type(search, 'ALEX@EXAMPLE.COM')
    expect(
      screen.getByRole('button', { name: /August invoice, / }),
    ).toBeVisible()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^Read: Welcome aboard/ }),
      ).not.toBeInTheDocument(),
    )

    await user.clear(search)
    await user.type(search, 'missing')
    expect(
      await screen.findByText('No messages match your search.'),
    ).toBeVisible()
    await user.clear(search)
    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )
    await user.click(screen.getByRole('radio', { name: 'Read' }))
    expect(
      await screen.findByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Unread: August invoice, / }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Unread' }))
    expect(screen.getByRole('radio', { name: 'Read' })).not.toBeChecked()
    expect(
      await screen.findByRole('button', { name: /^Unread: August invoice, / }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Read: Welcome aboard/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Largest first' }))
    const list = screen.getByRole('region', { name: 'Messages' })
    expect(
      within(list)
        .getAllByRole('button', { name: /Unread:/ })
        .map((button) => button.textContent),
    ).toEqual([
      expect.stringContaining('August invoice'),
      expect.stringContaining('August invoice copy'),
      expect.stringContaining('Unknown values'),
    ])

    await user.click(screen.getByRole('radio', { name: 'All messages' }))
    await user.click(screen.getByRole('radio', { name: 'Oldest first' }))
    expect(
      within(list)
        .getAllByRole('button', { name: /^(Read|Unread):/ })
        .map((button) => button.textContent),
    ).toEqual([
      expect.stringContaining('Welcome aboard'),
      expect.stringContaining('August invoice'),
      expect.stringContaining('August invoice copy'),
      expect.stringContaining('Unknown values'),
    ])

    await user.click(screen.getByRole('radio', { name: 'Smallest first' }))
    expect(
      within(list)
        .getAllByRole('button', { name: /^(Read|Unread):/ })
        .map((button) => button.textContent),
    ).toEqual([
      expect.stringContaining('Welcome aboard'),
      expect.stringContaining('August invoice'),
      expect.stringContaining('August invoice copy'),
      expect.stringContaining('Unknown values'),
    ])
  })

  it('restores multiple selected mailboxes and persists an explicit clear', async () => {
    const user = userEvent.setup()
    const handlers = [
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders', 'support'],
        () => [],
      ),
      paginatedMessageHandler((name) =>
        messages.filter((message) => message.mailbox === name),
      ),
    ]
    const firstRender = renderApp(handlers)

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    await user.click(screen.getByRole('checkbox', { name: 'orders' }))
    await user.click(screen.getByRole('checkbox', { name: 'support' }))
    expect(await screen.findByText('2 messages in 2 mailboxes.')).toBeVisible()

    const reloadPath = `${window.location.pathname}${window.location.search}`
    firstRender.unmount()
    const reloadedRender = renderApp(handlers, reloadPath)

    expect(await screen.findByText('2 messages in 2 mailboxes.')).toBeVisible()
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    expect(screen.getByRole('checkbox', { name: 'orders' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'support' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByText('No mailbox selected')).toBeVisible()
    expect(window.location.search).toBe('')

    reloadedRender.unmount()
    renderApp(handlers)
    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    expect(screen.getByRole('checkbox', { name: 'orders' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'support' })).not.toBeChecked()
  })

  it('persists one selected mailbox before its messages finish loading', async () => {
    const user = userEvent.setup()
    const pendingMessages = deferred<Response>()
    let messageRequests = 0
    const handlers = [
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders'],
        () => [],
      ),
      http.get('*/v1/inbucket/messages', () => {
        messageRequests += 1
        if (messageRequests === 1) return pendingMessages.promise
        return HttpResponse.json(messagePage([messages[0]]))
      }),
    ]
    const firstRender = renderApp(handlers)

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    await user.click(screen.getByRole('checkbox', { name: 'orders' }))
    expect(window.location.search).toBe('?mailbox=orders')

    const reloadPath = `${window.location.pathname}${window.location.search}`
    firstRender.unmount()
    renderApp(handlers, reloadPath)

    expect(await screen.findByText('1 message in orders.')).toBeVisible()
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    expect(screen.getByRole('checkbox', { name: 'orders' })).toBeChecked()
  })

  it('restores available selections after delayed startup across repeated reloads', async () => {
    const user = userEvent.setup()
    const pendingSession = deferred<typeof session>()
    const pendingCatalog = deferred<string[]>()
    const handlers = [
      http.get('*/v1/session', async () =>
        HttpResponse.json(await pendingSession.promise),
      ),
      http.get('*/v1/inbucket/mailboxes', async ({ request }) => {
        const archivedRequested =
          new URL(request.url).searchParams.get('archived') === 'true'
        return HttpResponse.json(
          archivedRequested ? [] : await pendingCatalog.promise,
        )
      }),
      paginatedMessageHandler((name) =>
        messages.filter((message) => message.mailbox === name),
      ),
    ]
    let currentRender = renderApp(
      handlers,
      '/?mailboxes=orders&mailboxes=missing&mailboxes=support',
    )

    expect(window.location.search).toBe(
      '?mailboxes=orders&mailboxes=missing&mailboxes=support',
    )
    await act(async () => pendingSession.resolve(session))
    expect(
      await screen.findByRole('heading', { name: 'Messages' }),
    ).toBeVisible()
    await act(async () => pendingCatalog.resolve(['orders', 'support']))

    expect(await screen.findByText('2 messages in 2 mailboxes.')).toBeVisible()
    expect(window.location.search).toBe('?mailboxes=orders&mailboxes=support')

    for (let reload = 0; reload < 2; reload += 1) {
      const reloadPath = `${window.location.pathname}${window.location.search}`
      currentRender.unmount()
      currentRender = renderApp(handlers, reloadPath)
      expect(
        await screen.findByText('2 messages in 2 mailboxes.'),
      ).toBeVisible()
    }

    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    expect(screen.getByRole('checkbox', { name: 'orders' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'support' })).toBeChecked()
    expect(
      screen.queryByRole('checkbox', { name: 'missing' }),
    ).not.toBeInTheDocument()
  })

  it('filters mailbox messages by one date or an inclusive date range', async () => {
    const user = userEvent.setup()
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders', 'support'],
        () => [],
      ),
      paginatedMessageHandler((name) =>
        messages.filter((message) => message.mailbox === name),
      ),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    await user.click(screen.getByRole('checkbox', { name: 'orders' }))
    await user.click(screen.getByRole('checkbox', { name: 'support' }))
    expect(
      await screen.findByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )
    const filters = document.getElementById('message-filter-panel')
    if (!(filters instanceof HTMLElement))
      throw new Error('Filters are missing')
    await user.type(within(filters).getByLabelText('From'), '2026-08-27')

    expect(
      await screen.findByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^Read: Welcome aboard/ }),
      ).not.toBeInTheDocument(),
    )

    await user.type(within(filters).getByLabelText('To'), '2026-08-27')
    expect(
      screen.getByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()

    await user.click(
      within(filters).getByRole('button', { name: 'Clear dates' }),
    )
    expect(
      await screen.findByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()
  })

  it('loads additional message pages without duplicates and allows retry after failure', async () => {
    const user = userEvent.setup()
    let loadMoreAttempts = 0
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders'],
        () => [],
      ),
      http.get('*/v1/inbucket/messages', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (!cursor)
          return HttpResponse.json(messagePage([messages[0]], 'next', [], 86))

        loadMoreAttempts += 1
        if (loadMoreAttempts === 1) {
          return HttpResponse.json({ error: 'inbucket_error' }, { status: 502 })
        }
        return HttpResponse.json(
          messagePage([messages[0], messages[1]], null, [], 86),
        )
      }),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    await user.click(screen.getByRole('checkbox', { name: 'orders' }))
    expect(
      await screen.findByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()
    expect(screen.getByText('86 messages in orders.')).toBeVisible()
    expect(screen.getByText('Showing 1 of 86 messages')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Load more messages' }))
    expect(
      await screen.findByText(
        'Inbucket is temporarily unavailable. Please try again.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()
    expect(screen.getByText('Showing 1 of 86 messages')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Load more messages' }))
    expect(
      await screen.findByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()
    expect(
      screen.getAllByRole('button', { name: /^Unread: August invoice/ }),
    ).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: 'Load more messages' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('86 messages in orders.')).toBeVisible()
    expect(screen.getByText('Showing 2 of 86 messages')).toBeVisible()
  })

  it('requires a new list scroll for each page and after mailbox reselection', async () => {
    const user = userEvent.setup()
    let intersect: IntersectionObserverCallback | null = null
    const pageOneMessage = {
      ...messages[0],
      id: 'page-one',
      subject: 'Page one message',
    }
    const pageTwoMessage = {
      ...messages[1],
      id: 'page-two',
      subject: 'Page two message',
    }
    const pageThreeMessage = {
      ...messages[0],
      id: 'page-three',
      subject: 'Page three message',
    }
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        readonly root = null
        readonly rootMargin = '0px'
        readonly thresholds = [0]

        constructor(callback: IntersectionObserverCallback) {
          intersect = callback
        }

        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      },
    )
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['amazon', 'cinepolis', 'gmail', 'realtime', 'shuless', 'start9'],
        () => [],
      ),
      http.get('*/v1/inbucket/messages', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (cursor === 'last') {
          return HttpResponse.json(messagePage([pageThreeMessage], null, [], 3))
        }
        return HttpResponse.json(
          cursor
            ? messagePage([pageTwoMessage], 'last', [], 3)
            : messagePage([pageOneMessage], 'next', [], 3),
        )
      }),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    const savedMailboxes = screen.getByRole('region', {
      name: 'Saved mailboxes',
    })
    await user.click(
      within(savedMailboxes).getByRole('button', { name: 'Select all' }),
    )
    expect(
      await screen.findByRole('button', { name: /^Unread: Page one message/ }),
    ).toBeVisible()
    const messageList = screen
      .getByRole('region', { name: 'Messages' })
      .querySelector<HTMLElement>('.message-list')
    expect(messageList).not.toBeNull()

    await act(async () => {
      intersect?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    expect(
      screen.queryByRole('button', { name: /^Read: Page two message/ }),
    ).not.toBeInTheDocument()

    if (!messageList) throw new Error('Messages list is unavailable')
    messageList.scrollTop = 900
    fireEvent.scroll(messageList)

    await act(async () => {
      intersect?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    expect(
      await screen.findByRole('button', { name: /^Read: Page two message/ }),
    ).toBeVisible()

    await act(async () => {
      intersect?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
      intersect?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    expect(
      screen.queryByRole('button', { name: /^Unread: Page three message/ }),
    ).not.toBeInTheDocument()

    messageList.scrollTop = 900
    await user.click(
      within(savedMailboxes).getByRole('button', { name: 'Clear' }),
    )
    expect(
      await screen.findByText('Select one or more mailboxes to read messages.'),
    ).toBeVisible()
    expect(messageList.scrollTop).toBe(0)

    await user.click(
      within(savedMailboxes).getByRole('button', { name: 'Select all' }),
    )
    expect(
      await screen.findByRole('button', { name: /^Unread: Page one message/ }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Read: Page two message/ }),
    ).not.toBeInTheDocument()

    await act(async () => {
      intersect?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(
      screen.queryByRole('button', { name: /^Read: Page two message/ }),
    ).not.toBeInTheDocument()

    messageList.scrollTop = 900
    fireEvent.scroll(messageList)
    await act(async () => {
      intersect?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(
      await screen.findByRole('button', {
        name: /^Read: Page two message/,
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Unread: Page three message/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Showing 2 of 3 messages')).toBeVisible()

    messageList.scrollTop = 1800
    fireEvent.scroll(messageList)
    await act(async () => {
      intersect?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(
      await screen.findByRole('button', {
        name: /^Unread: Page three message/,
      }),
    ).toBeVisible()
    expect(screen.getByText('Showing 3 of 3 messages')).toBeVisible()
  })

  it('ignores a stale page after the selected mailbox set changes', async () => {
    const user = userEvent.setup()
    const oldPage = deferred<Response>()
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders', 'support'],
        () => [],
      ),
      http.get('*/v1/inbucket/messages', ({ request }) => {
        const requested = new URL(request.url).searchParams.getAll(
          'mailboxes[]',
        )
        if (requested.length === 1 && requested[0] === 'orders') {
          return oldPage.promise
        }
        return HttpResponse.json(
          messagePage([
            {
              ...messages[1],
              id: 'current-selection',
              subject: 'Current selection message',
            },
          ]),
        )
      }),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    await user.click(screen.getByRole('checkbox', { name: 'orders' }))
    await user.click(screen.getByRole('checkbox', { name: 'support' }))
    expect(
      await screen.findByRole('button', {
        name: /^Read: Current selection message/,
      }),
    ).toBeVisible()

    await act(async () =>
      oldPage.resolve(
        HttpResponse.json(
          messagePage([
            {
              ...messages[0],
              id: 'stale-selection',
              subject: 'Stale selection message',
            },
          ]),
        ),
      ),
    )

    expect(
      screen.queryByRole('button', {
        name: /^Unread: Stale selection message/,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Read: Current selection message/ }),
    ).toBeVisible()
  })

  it('shows starred messages across mailboxes with mailbox, read, and sort controls', async () => {
    const user = userEvent.setup()
    let starredMessages = messages.map((message) => ({
      ...message,
      starred: true,
    }))
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders', 'support'],
        () => [],
      ),
      http.get('*/v1/inbucket/starred/messages', () =>
        HttpResponse.json(starredMessages),
      ),
      http.patch(
        '*/v1/inbucket/mailboxes/:mailbox/messages/:id/starred',
        async ({ params, request }) => {
          const body = (await request.json()) as { starred: boolean }
          if (!body.starred) {
            starredMessages = starredMessages.filter(
              (message) => String(message.id) !== String(params.id),
            )
          }
          return HttpResponse.json({ starred: body.starred })
        },
      ),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByRole('button', { name: 'Starred' }))
    expect(
      await screen.findByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()
    expect(screen.getByText('Showing 2 of 2 messages')).toBeVisible()
    expect(screen.queryByText('2 starred messages.')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Show messages from' }),
      'support',
    )
    expect(
      screen.getByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Unread: August invoice/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 2 messages')).toBeVisible()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Show messages from' }),
      '',
    )
    await user.click(screen.getByRole('radio', { name: 'Unread' }))
    expect(
      screen.getByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Read: Welcome aboard/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'All messages' }))
    await user.click(screen.getByRole('radio', { name: 'Oldest first' }))
    const list = screen.getByRole('region', { name: 'Starred messages' })
    expect(
      within(list)
        .getAllByRole('button', { name: /^(Read|Unread):/ })
        .map((button) => button.textContent),
    ).toEqual([
      expect.stringContaining('Welcome aboard'),
      expect.stringContaining('August invoice'),
    ])

    const filters = document.getElementById('starred-message-filter-panel')
    if (!(filters instanceof HTMLElement))
      throw new Error('Filters are missing')
    await user.type(within(filters).getByLabelText('From'), '2026-08-27')
    expect(
      screen.getByRole('button', { name: /^Unread: August invoice/ }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Read: Welcome aboard/ }),
    ).not.toBeInTheDocument()
    await user.click(
      within(filters).getByRole('button', { name: 'Clear dates' }),
    )
    expect(
      screen.getByRole('button', { name: /^Read: Welcome aboard/ }),
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', {
        name: 'Remove star: Welcome aboard',
      }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Starred messages' }),
    ).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: /^Read: Welcome aboard/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 1 message')).toBeVisible()
  })

  it('adds a star from a mailbox and restores its visible state after failure', async () => {
    const user = userEvent.setup()
    let shouldFail = false
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders'],
        () => [],
      ),
      paginatedMessageHandler(() => [{ ...messages[0], starred: false }]),
      http.patch(
        '*/v1/inbucket/mailboxes/:mailbox/messages/:id/starred',
        async ({ request }) => {
          if (shouldFail) {
            return HttpResponse.json(
              { error: 'inbucket_error' },
              { status: 502 },
            )
          }
          const body = (await request.json()) as { starred: boolean }
          return HttpResponse.json({
            starred: body.starred,
            message: { ...messages[0], starred: true },
          })
        },
      ),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    await user.click(screen.getByRole('checkbox', { name: 'orders' }))
    await user.click(
      screen.getByRole('button', {
        name: 'Add star: August invoice',
      }),
    )
    expect(
      await screen.findByRole('button', {
        name: 'Remove star: August invoice',
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    shouldFail = true
    await user.click(
      screen.getByRole('button', {
        name: 'Remove star: August invoice',
      }),
    )

    expect(
      await screen.findByText(
        'The star could not be updated. Please try again.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'Remove star: August invoice',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('adds and opens an archived mailbox through visible restored state', async () => {
    const user = userEvent.setup()
    let activeMailboxes: string[] = []
    let archivedMailboxes: unknown[] = [
      { name: 'old-orders', message_count: 1 },
    ]
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => activeMailboxes,
        () => archivedMailboxes,
      ),
      paginatedMessageHandler((name) => {
        activeMailboxes = [name]
        archivedMailboxes = []
        return [{ ...messages[0], mailbox: name }]
      }),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    const manageMailboxes = screen.getByLabelText('Manage saved mailboxes')
    await user.click(manageMailboxes)
    await user.type(
      screen.getByRole('textbox', { name: 'Mailbox name' }),
      ' old-orders ',
    )
    await user.click(
      screen.getByRole('button', { name: 'Add and open mailbox' }),
    )

    expect(
      await screen.findByRole('button', { name: /Unread: August invoice/ }),
    ).toBeVisible()
    expect(screen.getByText('1 message in old-orders.')).toBeVisible()
    expect(window.location.search).toBe('?mailbox=old-orders')
    expect(manageMailboxes).toHaveFocus()
    expect(
      screen.queryByRole('form', { name: 'Add mailbox' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Archived' }))
    expect(screen.getByText('No archived mailboxes.')).toBeVisible()
  })

  it('deletes an archived mailbox from the archive tab', async () => {
    const user = userEvent.setup()
    let archivedMailboxes: ArchivedMailbox[] = [
      { name: 'old-orders', message_count: 2 },
    ]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders'],
        () => archivedMailboxes,
      ),
      paginatedMessageHandler((name) =>
        messages.filter((message) => message.mailbox === name),
      ),
      http.delete('*/v1/inbucket/mailbox', ({ request }) => {
        const name = new URL(request.url).searchParams.get('name') || ''
        archivedMailboxes = archivedMailboxes.filter(
          (mailbox) => mailbox.name !== name,
        )
        return new HttpResponse(null, { status: 204 })
      }),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByRole('button', { name: 'Archived' }))
    expect(await screen.findByText('1 archived mailbox')).toBeVisible()
    expect(
      await screen.findByRole('button', {
        name: 'Delete old-orders permanently',
      }),
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', {
        name: 'Delete old-orders permanently',
      }),
    )
    expect(await screen.findByText('Deleted old-orders.')).toBeVisible()
    expect(screen.getByText('No archived mailboxes.')).toBeVisible()
  })

  it('restores a message URL and supports read, source, attachment, and deletion outcomes', async () => {
    const user = userEvent.setup()
    let mailboxMessages = [messages[0]]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp(
      [
        http.get('*/v1/session', () => HttpResponse.json(session)),
        ...catalogHandlers(
          () => ['orders'],
          () => [],
        ),
        paginatedMessageHandler(() => mailboxMessages),
        http.get('*/v1/inbucket/mailboxes/:mailbox/messages/:id', () =>
          HttpResponse.json(parsedInvoice),
        ),
        http.get(
          '*/v1/inbucket/mailboxes/:mailbox/messages/:id/attachments',
          () =>
            HttpResponse.json([
              {
                index: 0,
                filename: 'resume.pdf',
                content_type: 'application/pdf',
                size: 5,
              },
            ]),
        ),
        http.patch(
          '*/v1/inbucket/mailboxes/:mailbox/messages/:id/read',
          () => new HttpResponse(null, { status: 204 }),
        ),
        http.get(
          '*/v1/inbucket/mailboxes/:mailbox/messages/:id/source',
          () =>
            new HttpResponse('From: billing@example.com\r\n\r\nInvoice body', {
              headers: { 'Content-Type': 'text/plain' },
            }),
        ),
        http.delete('*/v1/inbucket/message', () => {
          mailboxMessages = []
          return new HttpResponse(null, { status: 204 })
        }),
      ],
      '/?mailbox=orders&message=invoice',
    )

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: 'Messages' }),
    ).not.toBeInTheDocument()
    expect(window.location.search).toBe('?mailbox=orders&message=invoice')
    const attachment = await screen.findByRole('link', {
      name: 'Download resume.pdf',
    })
    expect(attachment).toHaveAttribute(
      'href',
      '/v1/inbucket/mailboxes/orders/messages/invoice/attachments/0',
    )
    expect(attachment).toHaveTextContent('application/pdf')
    expect(attachment).toHaveTextContent('5 B')

    await user.click(screen.getByRole('button', { name: 'View source' }))
    expect(await screen.findByText(/From: billing@example.com/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Hide source' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    await user.click(
      screen.getByRole('button', { name: 'Back to message list' }),
    )
    expect(screen.queryByLabelText('Message inspector')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Messages' })).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Messages' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Read: August invoice/ }),
    ).toBeVisible()
    expect(window.location.search).toBe('?mailbox=orders')

    await user.click(
      screen.getByRole('button', { name: /Read: August invoice/ }),
    )
    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(
      await screen.findByText('Message deleted permanently.'),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /August invoice/ }),
    ).not.toBeInTheDocument()
    expect(window.location.search).toBe('?mailbox=orders')
  })

  it('keeps the upstream read state after a fresh app load', async () => {
    const user = userEvent.setup()
    let mailboxMessages = [messages[0]]
    const handlers = () => [
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders'],
        () => [],
      ),
      paginatedMessageHandler(() => mailboxMessages),
      http.get('*/v1/inbucket/mailboxes/:mailbox/messages/:id', () =>
        HttpResponse.json({ ...parsedInvoice, seen: mailboxMessages[0].seen }),
      ),
      http.get(
        '*/v1/inbucket/mailboxes/:mailbox/messages/:id/attachments',
        () => HttpResponse.json([]),
      ),
      http.patch('*/v1/inbucket/mailboxes/:mailbox/messages/:id/read', () => {
        mailboxMessages = mailboxMessages.map((message) => ({
          ...message,
          seen: true,
        }))
        return new HttpResponse(null, { status: 204 })
      }),
    ]

    const firstLoad = renderApp(handlers(), '/?mailbox=orders&message=invoice')

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Back to message list' }),
    )
    expect(
      await screen.findByRole('button', { name: /^Read: August invoice/ }),
    ).toBeVisible()

    firstLoad.unmount()
    renderApp(handlers(), '/?mailbox=orders')

    expect(
      await screen.findByRole('button', { name: /^Read: August invoice/ }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^Unread: August invoice/ }),
    ).not.toBeInTheDocument()
  })

  it('keeps a message visibly unread when the upstream read change fails', async () => {
    const user = userEvent.setup()
    renderApp(
      [
        http.get('*/v1/session', () => HttpResponse.json(session)),
        ...catalogHandlers(
          () => ['orders'],
          () => [],
        ),
        paginatedMessageHandler(() => [messages[0]]),
        http.get('*/v1/inbucket/mailboxes/:mailbox/messages/:id', () =>
          HttpResponse.json(parsedInvoice),
        ),
        http.get(
          '*/v1/inbucket/mailboxes/:mailbox/messages/:id/attachments',
          () => HttpResponse.json([]),
        ),
        http.patch('*/v1/inbucket/mailboxes/:mailbox/messages/:id/read', () =>
          HttpResponse.json({ error: 'inbucket_error' }, { status: 502 }),
        ),
      ],
      '/?mailbox=orders&message=invoice',
    )

    expect(
      await screen.findByText(
        'The message remains unread because its read state could not be updated.',
      ),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Back to message list' }),
    )
    expect(
      screen.getByRole('button', { name: /Unread: August invoice/ }),
    ).toBeVisible()
  })

  it('retains failed mailboxes after partial archive', async () => {
    const user = userEvent.setup()
    let activeMailboxes = ['orders', 'support']
    let archivedMailboxes: unknown[] = []
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => activeMailboxes,
        () => archivedMailboxes,
      ),
      paginatedMessageHandler((name) =>
        messages.filter((message) => message.mailbox === name),
      ),
      http.patch('*/v1/inbucket/mailbox/archive', ({ request }) => {
        const name = new URL(request.url).searchParams.get('name') || ''
        if (name === 'support') {
          return HttpResponse.json({ error: 'inbucket_error' }, { status: 502 })
        }
        activeMailboxes = activeMailboxes.filter((mailbox) => mailbox !== name)
        archivedMailboxes = [{ name, message_count: 1 }]
        return new HttpResponse(null, { status: 204 })
      }),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    const manage = screen.getByLabelText('Manage saved mailboxes')
    await user.click(manage)
    await user.keyboard('{Escape}')
    expect(manage).toHaveFocus()

    await user.click(manage)
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    expect(await screen.findByText('2 messages in 2 mailboxes.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Archive selected' }))
    expect(
      await screen.findByText(
        'Archived 1 mailboxes. 1 mailboxes could not be archived.',
      ),
    ).toBeVisible()
    const saved = screen.getByRole('group', { name: 'Saved mailboxes' })
    expect(
      within(saved).queryByRole('checkbox', { name: 'orders' }),
    ).not.toBeInTheDocument()
    expect(
      within(saved).getByRole('checkbox', { name: 'support' }),
    ).toBeChecked()
    expect(
      screen.queryByRole('button', { name: 'Delete selected' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Archived' }))
    expect(
      await screen.findByRole('button', {
        name: 'Delete orders permanently',
      }),
    ).toBeVisible()
  })

  it('ignores a stale message response after a newer selection', async () => {
    const user = userEvent.setup()
    const oldMessage: ParsedMessage = {
      ...messages[0],
      id: 'old',
      subject: 'Old subject',
      body: { text: 'Old body' },
    }
    const newMessage: ParsedMessage = {
      ...messages[0],
      id: 'new',
      subject: 'New subject',
      body: { text: 'New body' },
    }
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      ...catalogHandlers(
        () => ['orders'],
        () => [],
      ),
      paginatedMessageHandler(() => [
        { ...messages[0], id: 'old', subject: 'Old subject' },
        { ...messages[0], id: 'new', subject: 'New subject' },
      ]),
      http.get(
        '*/v1/inbucket/mailboxes/:mailbox/messages/:id',
        async ({ params }) => {
          if (params.id === 'old') await delay(80)
          return HttpResponse.json(
            params.id === 'old' ? oldMessage : newMessage,
          )
        },
      ),
      http.get(
        '*/v1/inbucket/mailboxes/:mailbox/messages/:id/attachments',
        () => HttpResponse.json([]),
      ),
      http.patch(
        '*/v1/inbucket/mailboxes/:mailbox/messages/:id/read',
        () => new HttpResponse(null, { status: 204 }),
      ),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByLabelText('Manage saved mailboxes'))
    await user.click(screen.getByRole('checkbox', { name: 'orders' }))
    await screen.findByRole('button', { name: /^Unread: Old subject/ })
    await user.click(
      screen.getByRole('button', { name: /^Unread: Old subject/ }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Back to message list' }),
    )
    await user.click(
      screen.getByRole('button', { name: /^Unread: New subject/ }),
    )

    expect(
      await screen.findByRole('heading', { name: 'New subject' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Old subject' }),
    ).not.toBeInTheDocument()
  })
})
