import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { filterMessages, sortMessages } from './formatting'
import { messagePage, messages, parsedInvoice, session } from './test/fixtures'
import { renderApp } from './test/renderApp'
import type { ListSort, MessageSummary, ReadFilter, TrashResult } from './types'

const catalogs = () =>
  http.get('*/v1/inbucket/mailboxes', ({ request }) =>
    HttpResponse.json(
      new URL(request.url).searchParams.get('archived') === 'true'
        ? []
        : ['orders', 'support'],
    ),
  )

const trashPage = (values: MessageSummary[]) => ({
  ...messagePage(values),
  mailboxes: [...new Set(values.map((message) => message.mailbox))].sort(),
})

const readerHandlers = () => [
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

describe('Trash', () => {
  it('keeps an opened message stable after its read state updates', async () => {
    const user = userEvent.setup()
    let finishRead = () => {}
    const readFinished = new Promise<void>((resolve) => {
      finishRead = resolve
    })
    renderApp(
      [
        http.get('*/v1/session', () => HttpResponse.json(session)),
        catalogs(),
        http.get('*/v1/inbucket/trash/messages', () =>
          HttpResponse.json(trashPage([{ ...messages[0], available: true }])),
        ),
        http.get('*/v1/inbucket/mailboxes/:mailbox/messages/:id', () =>
          HttpResponse.json(parsedInvoice),
        ),
        http.get(
          '*/v1/inbucket/mailboxes/:mailbox/messages/:id/attachments',
          () => HttpResponse.json([]),
        ),
        http.patch('*/v1/inbucket/mailboxes/:mailbox/messages/:id/read', () => {
          finishRead()
          return new HttpResponse(null, { status: 204 })
        }),
        http.get(
          '*/v1/inbucket/mailboxes/:mailbox/messages/:id/source',
          async () => {
            await readFinished
            return new HttpResponse('Stable message source', {
              headers: { 'Content-Type': 'text/plain' },
            })
          },
        ),
      ],
      '/?view=trash&mailbox=orders&message=invoice',
    )

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'View source' }))

    expect(await screen.findByText('Stable message source')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    expect(screen.queryByText('Loading message.')).toBeNull()
  })

  it('moves a starred unread message to Trash and restores it with focus returned to the list', async () => {
    const user = userEvent.setup()
    let trashed: MessageSummary[] = []
    const starred = { ...messages[0], starred: true }
    renderApp(
      [
        http.get('*/v1/session', () => HttpResponse.json(session)),
        catalogs(),
        http.get('*/v1/inbucket/messages', () =>
          HttpResponse.json(messagePage(trashed.length ? [] : [starred])),
        ),
        http.get('*/v1/inbucket/starred/messages', () =>
          HttpResponse.json(trashed.length ? [] : [starred]),
        ),
        http.get('*/v1/inbucket/trash/messages', () =>
          HttpResponse.json(trashPage(trashed)),
        ),
        http.patch(
          '*/v1/inbucket/mailboxes/:mailbox/messages/:id/trashed',
          async ({ request }) => {
            const body = (await request.json()) as { trashed: boolean }
            trashed = body.trashed ? [{ ...starred, available: true }] : []
            return HttpResponse.json({
              trashed: body.trashed,
              available: true,
              message: trashed[0],
            })
          },
        ),
        ...readerHandlers(),
      ],
      '/?mailbox=orders&message=invoice',
    )

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Move to trash' }))
    expect(await screen.findByText('Message moved to Trash.')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /August invoice/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Starred' }))
    expect(await screen.findByText('No starred messages yet.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Trash' }))
    const trashedMessage = await screen.findByRole('button', {
      name: /^Unread: August invoice/,
    })
    await user.click(trashedMessage)
    expect(await screen.findByRole('button', { name: 'Restore' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Remove star: August invoice' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Back to message list' }),
    ).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Restore' }))

    expect(await screen.findByText('Message restored.')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Trashed messages' }),
    ).toHaveFocus()
    expect(screen.getByText('Trash is empty.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Mailboxes' }))
    expect(
      await screen.findByRole('button', { name: /^Read: August invoice/ }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Remove star: August invoice' }),
    ).toBeVisible()
  })

  it('keeps permanent deletion behind confirmation and removes the message after success', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true)
    let deleted = false
    let deleteRequests = 0
    renderApp(
      [
        http.get('*/v1/session', () => HttpResponse.json(session)),
        catalogs(),
        http.get('*/v1/inbucket/trash/messages', () =>
          HttpResponse.json(
            trashPage(deleted ? [] : [{ ...messages[0], available: true }]),
          ),
        ),
        http.delete('*/v1/inbucket/message', () => {
          deleteRequests += 1
          deleted = true
          return new HttpResponse(null, { status: 204 })
        }),
        ...readerHandlers(),
      ],
      '/?view=trash&mailbox=orders&message=invoice',
    )

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    const action = screen.getByRole('button', { name: 'Delete permanently' })
    await user.click(action)
    expect(deleteRequests).toBe(0)
    expect(
      screen.getByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()

    await user.click(action)

    expect(
      await screen.findByText('Message deleted permanently.'),
    ).toBeVisible()
    expect(deleteRequests).toBe(1)
    expect(screen.getByText('Trash is empty.')).toBeVisible()
  })

  it('filters by search, read state, and mailbox and applies every Trash sort', async () => {
    const user = userEvent.setup()
    const values: MessageSummary[] = [
      { ...messages[0], id: 'small', subject: 'Invoice small', size: 100 },
      { ...messages[0], id: 'large', subject: 'Invoice large', size: 900 },
      { ...messages[1], id: 'support-read', subject: 'Invoice support' },
    ]
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      catalogs(),
      http.get('*/v1/inbucket/trash/messages', ({ request }) => {
        const params = new URL(request.url).searchParams
        const read = (params.get('read') || 'all') as ReadFilter
        const sort = (params.get('sort') || 'newest') as ListSort
        const mailbox = params.get('mailbox') || ''
        const found = filterMessages(
          values,
          params.get('search') || '',
          read,
          mailbox,
        )
        return HttpResponse.json({
          ...trashPage(sortMessages(found, sort)),
          mailboxes: ['orders', 'support'],
        })
      }),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByRole('button', { name: 'Trash' }))
    expect(await screen.findByText('Showing 3 of 3 messages')).toBeVisible()
    const search = screen.getByRole('searchbox', { name: 'Search messages' })
    await user.type(search, 'small')
    expect(
      await screen.findByRole('button', { name: /^Unread: Invoice small/ }),
    ).toBeVisible()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^Unread: Invoice large/ }),
      ).toBeNull(),
    )

    await user.clear(search)
    await user.click(
      screen.getByRole('button', { name: 'Filter and sort messages' }),
    )
    await user.click(screen.getByRole('radio', { name: 'Unread' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Show messages from' }),
      'orders',
    )
    await user.click(screen.getByRole('radio', { name: 'Largest first' }))
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', {
        name: /^Unread: Invoice/,
      })
      expect(buttons[0]).toHaveAccessibleName(/Invoice large/)
      expect(buttons[1]).toHaveAccessibleName(/Invoice small/)
    })

    for (const name of ['Newest first', 'Oldest first', 'Smallest first']) {
      await user.click(screen.getByRole('radio', { name }))
      await waitFor(() =>
        expect(screen.getByRole('radio', { name })).toBeChecked(),
      )
    }
    expect(screen.queryByRole('group', { name: 'Tags' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Date' })).toBeNull()
  })

  it('keeps failed items after partial Empty trash and reports one outcome per message', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    let emptyRequests = 0
    let values = [
      { ...messages[0], id: 'deleted', subject: 'Delete me', available: true },
      { ...messages[1], id: 'failed', subject: 'Retry me', available: true },
    ]
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      catalogs(),
      http.get('*/v1/inbucket/trash/messages', () =>
        HttpResponse.json(trashPage(values)),
      ),
      http.delete('*/v1/inbucket/trash', () => {
        emptyRequests += 1
        const results: TrashResult[] = [
          { mailbox: 'orders', id: 'deleted', deleted: true, error: null },
          {
            mailbox: 'support',
            id: 'failed',
            deleted: false,
            error: 'inbucket_error',
          },
        ]
        values = values.filter((message) => String(message.id) === 'failed')
        return HttpResponse.json({ results })
      }),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByRole('button', { name: 'Trash' }))
    await screen.findByRole('button', { name: /^Unread: Delete me/ })
    expect(screen.queryByRole('heading', { name: 'Trash' })).toBeNull()
    const trashList = screen.getByRole('region', {
      name: 'Trashed messages',
    })
    const emptyTrash = within(trashList).getByRole('button', {
      name: 'Empty trash',
    })
    await user.click(emptyTrash)
    expect(emptyRequests).toBe(0)
    expect(
      screen.getByRole('button', { name: /^Unread: Delete me/ }),
    ).toBeVisible()

    await user.click(emptyTrash)

    expect(await screen.findByText('1 message remains in Trash.')).toBeVisible()
    expect(emptyRequests).toBe(1)
    const results = screen.getByRole('list', { name: 'Empty trash results' })
    expect(within(results).getAllByRole('listitem')).toHaveLength(2)
    expect(results).toHaveTextContent('orders/deleted: Deleted permanently.')
    expect(results).toHaveTextContent(
      'support/failed: Could not be deleted. Retry is available.',
    )
    expect(
      screen.queryByRole('button', { name: /^Unread: Delete me/ }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: /^Read: Retry me/ }),
    ).toBeVisible()
  })

  it('shows loading and unavailable states and expires a rejected session', async () => {
    const user = userEvent.setup()
    let reject = false
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      catalogs(),
      http.get('*/v1/inbucket/trash/messages', async () => {
        await delay(100)
        if (reject)
          return HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
        return HttpResponse.json(
          trashPage([{ ...messages[0], available: false }]),
        )
      }),
      http.patch('*/v1/inbucket/mailboxes/:mailbox/messages/:id/trashed', () =>
        HttpResponse.json({ trashed: false, available: false }),
      ),
    ])

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByRole('button', { name: 'Trash' }))
    expect(await screen.findByText('Loading messages.')).toBeVisible()
    await user.click(
      await screen.findByRole('button', { name: /^Unread: August invoice/ }),
    )
    expect(await screen.findByText('The message was not found.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Delete permanently' }),
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Back to message list' }),
    )
    reject = true
    await user.type(
      screen.getByRole('searchbox', { name: 'Search messages' }),
      'x',
    )

    expect(
      await screen.findByText(
        'Your session has expired. Sign in again to continue.',
      ),
    ).toBeVisible()
    expect(window.location.search).toBe('')
  })
})
