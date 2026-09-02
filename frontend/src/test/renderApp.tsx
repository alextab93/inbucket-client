import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import type { RequestHandler } from 'msw'
import { http, HttpResponse } from 'msw'
import { App } from '../App'
import { server } from './server'

export const renderApp = (handlers: RequestHandler[], initialPath = '/') => {
  window.history.replaceState(null, '', initialPath)
  server.use(
    ...handlers,
    http.get('*/v1/tags', () => HttpResponse.json([])),
    http.get('*/v1/inbucket/live/messages', ({ request }) =>
      HttpResponse.json({
        changes: [],
        cursor:
          new URL(request.url).searchParams.get('cursor') || 'test-cursor',
        has_more: false,
      }),
    ),
  )
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
