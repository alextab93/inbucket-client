import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { messagePage, messages, parsedInvoice, session } from './test/fixtures'
import { renderApp } from './test/renderApp'

const mailboxCatalog = http.get('*/v1/inbucket/mailboxes', ({ request }) => {
  const archived = new URL(request.url).searchParams.get('archived') === 'true'
  return HttpResponse.json(archived ? [] : ['orders'])
})

describe('access flow', () => {
  it('reports incorrect credentials and then signs in through visible states', async () => {
    const user = userEvent.setup()
    renderApp([
      http.get('*/v1/session', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
      http.post('*/v1/session', async ({ request }) => {
        const credentials = (await request.json()) as {
          username: string
          password: string
        }
        return credentials.username.trim().toLocaleLowerCase() === 'admin' &&
          credentials.password === 'correct password'
          ? HttpResponse.json(session)
          : HttpResponse.json({ error: 'invalid_credentials' }, { status: 401 })
      }),
      mailboxCatalog,
    ])

    expect(
      await screen.findByText('Sign in to browse Inbucket mailboxes.'),
    ).toBeVisible()
    const username = screen.getByRole('textbox', { name: 'Username' })
    const password = screen.getByLabelText('Password')
    await user.type(username, 'admin')
    await user.type(password, 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByText('The username or password is incorrect.'),
    ).toBeVisible()
    expect(password).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()

    await user.type(password, 'correct password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('navigation', { name: 'Mailbox views' }),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Messages' })).toHaveFocus()
    expect(
      screen.queryByRole('textbox', { name: 'Username' }),
    ).not.toBeInTheDocument()
  })

  it('shows service unavailability without exposing authenticated controls', async () => {
    renderApp([
      http.get('*/v1/session', () =>
        HttpResponse.json({ error: 'unavailable' }, { status: 503 }),
      ),
    ])

    expect(
      await screen.findByText(
        'The application is unavailable. Please try again later.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('navigation', { name: 'Mailbox views' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument()
  })

  it('shows an expired session when a private catalog rejects restoration', async () => {
    renderApp([
      http.get('*/v1/session', () => HttpResponse.json(session)),
      http.get('*/v1/inbucket/mailboxes', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    ])

    expect(
      await screen.findByText(
        'Your session has expired. Sign in again to continue.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Username' })).toBeVisible()
  })

  it('signs out and clears the selected message URL', async () => {
    const user = userEvent.setup()
    renderApp(
      [
        http.get('*/v1/session', () => HttpResponse.json(session)),
        mailboxCatalog,
        http.get('*/v1/inbucket/messages', () =>
          HttpResponse.json(messagePage([])),
        ),
        http.delete(
          '*/v1/session',
          () => new HttpResponse(null, { status: 204 }),
        ),
      ],
      '/?mailbox=orders',
    )

    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('You have signed out.')).toBeVisible()
    expect(window.location.search).toBe('')
    expect(
      screen.queryByRole('navigation', { name: 'Mailbox views' }),
    ).not.toBeInTheDocument()
  })

  it('clears mailbox state when sign out finds an expired session', async () => {
    const user = userEvent.setup()
    renderApp(
      [
        http.get('*/v1/session', () => HttpResponse.json(session)),
        mailboxCatalog,
        http.get('*/v1/inbucket/messages', () =>
          HttpResponse.json(messagePage([messages[0]])),
        ),
        http.get('*/v1/inbucket/mailboxes/:mailbox/messages/:id', () =>
          HttpResponse.json(parsedInvoice),
        ),
        http.get(
          '*/v1/inbucket/mailboxes/:mailbox/messages/:id/attachments',
          () => HttpResponse.json([]),
        ),
        http.patch(
          '*/v1/inbucket/mailboxes/:mailbox/messages/:id/read',
          () => new HttpResponse(null, { status: 204 }),
        ),
        http.delete('*/v1/session', () =>
          HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
        ),
        http.post('*/v1/session', () => HttpResponse.json(session)),
      ],
      '/?mailbox=orders&message=invoice',
    )

    expect(
      await screen.findByRole('heading', { name: 'August invoice' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('You have signed out.')).toBeVisible()
    expect(window.location.search).toBe('')

    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'admin')
    await user.type(screen.getByLabelText('Password'), 'correct password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { name: 'Messages' }),
    ).toBeVisible()
    expect(screen.queryByLabelText('Message inspector')).not.toBeInTheDocument()
    expect(window.location.search).toBe('')
  })
})
