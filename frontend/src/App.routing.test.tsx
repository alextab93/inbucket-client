import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  archived,
  messagePage,
  messages,
  parsedInvoice,
  session,
} from './test/fixtures'
import { renderApp } from './test/renderApp'

const routingHandlers = () => [
  http.get('*/v1/session', () => HttpResponse.json(session)),
  http.get('*/v1/inbucket/mailboxes', ({ request }) => {
    const archivedRequested =
      new URL(request.url).searchParams.get('archived') === 'true'
    return HttpResponse.json(archivedRequested ? archived : ['orders'])
  }),
  http.get('*/v1/inbucket/messages', () =>
    HttpResponse.json(
      messagePage(messages.filter(({ mailbox }) => mailbox === 'orders')),
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

describe('URL navigation', () => {
  it('exposes exactly four views and clears message state between them', async () => {
    const user = userEvent.setup()
    renderApp(routingHandlers(), '/?mailbox=orders&message=invoice')

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    expect(
      screen.getByRole('navigation', { name: 'Mailbox views' }),
    ).toHaveTextContent('MailboxesStarredArchivedTrash')
    expect(screen.getAllByRole('button', { name: 'Sign out' })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Starred' }))
    expect(
      await screen.findByRole('heading', { name: 'Starred messages' }),
    ).toBeVisible()
    expect(window.location.search).toBe('?view=starred')

    await user.click(screen.getByRole('button', { name: 'Archived' }))
    expect(
      await screen.findByRole('heading', { name: 'Archived mailboxes' }),
    ).toBeVisible()
    expect(window.location.search).toBe('?view=archive')

    await user.click(screen.getByRole('button', { name: 'Mailboxes' }))
    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    expect(window.location.search).toBe('?mailbox=orders&message=invoice')
  })

  it.each([
    ['/?view=starred', 'Starred', 'Starred messages'],
    ['/?view=archive', 'Archived', 'Archived mailboxes'],
  ])('restores %s after a reload', async (path, activeTab, visibleHeading) => {
    renderApp(routingHandlers(), path)

    expect(
      await screen.findByRole('heading', { name: visibleHeading }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: activeTab })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(window.location.search).toBe(
      new URL(path, window.location.origin).search,
    )
  })

  it('canonicalizes a legacy Monitor URL to Mailboxes at the root', async () => {
    renderApp(
      routingHandlers(),
      '/?view=monitor&mailbox=orders&message=invoice',
    )

    expect(
      await screen.findByRole('heading', { name: 'Messages' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mailboxes' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen.queryByRole('button', { name: 'Monitor' }),
    ).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('')
  })

  it('restores remaining views and a selected message through popstate', async () => {
    const user = userEvent.setup()
    renderApp(routingHandlers(), '/?view=archive')

    expect(
      await screen.findByRole('heading', { name: 'Archived mailboxes' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Mailboxes' }))
    expect(
      await screen.findByRole('heading', { name: 'Messages' }),
    ).toBeVisible()

    act(() => {
      window.history.replaceState(null, '', '/?mailbox=orders&message=invoice')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    expect(window.location.search).toBe('?mailbox=orders&message=invoice')

    act(() => {
      window.history.replaceState(null, '', '/?view=starred')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(
      await screen.findByRole('heading', { name: 'Starred messages' }),
    ).toBeVisible()
    expect(window.location.search).toBe('?view=starred')
  })
})
