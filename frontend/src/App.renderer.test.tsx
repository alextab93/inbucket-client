import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { messagePage, session } from './test/fixtures'
import { renderApp } from './test/renderApp'
import type { MessageSummary, ParsedMessage } from './types'

const frameDocument = (iframe: HTMLIFrameElement): Document => {
  const document = iframe.contentDocument
  if (!document) throw new Error('Email frame document is unavailable')
  document.open()
  document.write(
    '<!doctype html><html><head><style>html,body{margin:0}</style></head><body></body></html>',
  )
  document.close()
  iframe.dispatchEvent(new Event('load'))
  return document
}

const rendererHandlers = (summary: MessageSummary, message: ParsedMessage) => [
  http.get('*/v1/session', () => HttpResponse.json(session)),
  http.get('*/v1/inbucket/mailboxes', ({ request }) => {
    const archived =
      new URL(request.url).searchParams.get('archived') === 'true'
    return HttpResponse.json(archived ? [] : ['orders'])
  }),
  http.get('*/v1/inbucket/messages', () =>
    HttpResponse.json(messagePage([summary])),
  ),
  http.get('*/v1/inbucket/mailboxes/:mailbox/messages/:id', () =>
    HttpResponse.json(message),
  ),
  http.get('*/v1/inbucket/mailboxes/:mailbox/messages/:id/attachments', () =>
    HttpResponse.json([]),
  ),
  http.patch(
    '*/v1/inbucket/mailboxes/:mailbox/messages/:id/read',
    () => new HttpResponse(null, { status: 204 }),
  ),
]

describe('isolated received email output', () => {
  it('blocks unsafe content and remote images until explicit consent', async () => {
    const user = userEvent.setup()
    const summary: MessageSummary = {
      id: 'unsafe',
      mailbox: 'orders',
      subject: 'Layout message',
      from: 'sender@example.com',
      date: '2026-08-27T12:00:00Z',
      seen: false,
    }
    const message: ParsedMessage = {
      ...summary,
      body: {
        html: '<html><head><style>.card{width:480px;background-image:url(https://tracker.example/background.png)}</style></head><body id="email" class="layout" dir="ltr" style="color:#202124"><script>window.pwned=true</script><form action="https://attacker.example"><input name="secret"></form><table class="card"><tr><td><a id="safe-link" href="https://example.com/account">Open account</a><a id="bad-link" href="javascript:alert(1)">Bad</a><img id="cid" src="cid:logo%20one"><img id="safe-data" src="data:image/png;base64,AA=="><img id="unsafe-data" src="data:image/svg+xml;base64,AA=="><img id="remote" src="http://tracker.example/pixel.gif"></td></tr></table></body></html>',
      },
    }
    renderApp(
      rendererHandlers(summary, message),
      '/?mailbox=orders&message=unsafe',
    )

    let iframe = (await screen.findByTitle(
      'Email message body',
    )) as HTMLIFrameElement
    let document = frameDocument(iframe)

    await waitFor(() =>
      expect(document.body.textContent).toContain('Open account'),
    )
    expect(document.body.id).toBe('email')
    expect(document.body.className).toBe('layout')
    expect(document.body.dir).toBe('ltr')
    expect(document.querySelector('table.card')).not.toBeNull()
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('form')).toBeNull()
    expect(document.querySelector('input')).toBeNull()
    expect(document.querySelector('#bad-link')).toHaveAttribute('href', '#')
    expect(document.documentElement.innerHTML).not.toContain('javascript:')
    expect(document.querySelector('#safe-link')).toMatchObject({
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    expect(document.querySelector('#cid')).toHaveAttribute(
      'src',
      '/v1/inbucket/mailboxes/orders/messages/unsafe/inline-image?cid=logo%20one',
    )
    expect(document.querySelector('#safe-data')).toHaveAttribute(
      'src',
      'data:image/png;base64,AA==',
    )
    expect(document.querySelector('#unsafe-data')).toHaveAttribute(
      'src',
      'about:blank',
    )
    expect(document.documentElement.innerHTML).not.toContain(
      'tracker.example/background.png',
    )
    expect(document.querySelector('#remote')).toHaveAttribute(
      'src',
      'about:blank',
    )
    expect(
      screen.getByText('Remote images are blocked for privacy.'),
    ).toBeVisible()
    expect(iframe).toHaveAttribute(
      'sandbox',
      'allow-same-origin allow-popups allow-popups-to-escape-sandbox',
    )
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-forms')
    expect(iframe.referrerPolicy).toBe('no-referrer')
    expect(iframe).toHaveAttribute('src', '/v1/email-frame')

    await user.click(screen.getByRole('button', { name: 'Load remote images' }))
    iframe = screen.getByTitle('Email message body') as HTMLIFrameElement
    document = frameDocument(iframe)

    await waitFor(() =>
      expect(document.documentElement.innerHTML).toContain(
        'tracker.example/background.png',
      ),
    )
    expect(document.querySelector('#remote')).toHaveAttribute(
      'src',
      'http://tracker.example/pixel.gif',
    )
    expect(iframe).toHaveAttribute('src', '/v1/email-frame?remote_images=true')
    expect(
      screen.queryByText('Remote images are blocked for privacy.'),
    ).not.toBeInTheDocument()
  })

  it('renders plaintext as inert visible text with safe links', async () => {
    const summary: MessageSummary = {
      id: 'plain',
      mailbox: 'orders',
      subject: 'Plain message',
      from: 'sender@example.com',
      date: '2026-08-27T12:00:00Z',
      seen: true,
    }
    const message: ParsedMessage = {
      ...summary,
      body: {
        text: '<script>alert(1)</script>\nhttps://example.com/path\nmail@example.net',
      },
    }
    renderApp(
      rendererHandlers(summary, message),
      '/?mailbox=orders&message=plain',
    )

    const iframe = (await screen.findByTitle(
      'Email message body',
    )) as HTMLIFrameElement
    const document = frameDocument(iframe)

    await waitFor(() =>
      expect(document.body.textContent).toContain('<script>alert(1)</script>'),
    )
    expect(document.querySelector('script')).toBeNull()
    expect(
      [...document.querySelectorAll('a')].map((link) => link.href),
    ).toEqual(['https://example.com/path', 'mailto:mail@example.net'])
    expect(document.body.style.whiteSpace).toBe('pre-wrap')
  })
})
