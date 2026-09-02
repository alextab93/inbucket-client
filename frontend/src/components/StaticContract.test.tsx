import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { messages } from '../test/fixtures'
import { MessageWorkspace } from './MessageWorkspace'

describe('typed authenticated workspace', () => {
  it('renders representative canonical data as visible message choices', () => {
    render(
      <StrictMode>
        <MessageWorkspace
          messages={messages}
          selected={null}
          loading={false}
          listEmptyMessage="This mailbox has no messages."
          inspectorEmptyMessage="Select a message to read it."
          onSelectMessage={vi.fn()}
          onCloseMessage={vi.fn()}
          onUnauthorized={vi.fn()}
          onRead={vi.fn()}
          starPending={() => false}
          onStarChange={async () => {}}
          onDeleted={async () => {}}
          tagPending={false}
          onTagChange={async () => []}
          onCreateTag={async () => ({ id: 1, name: 'Tag', color: '#1D4ED8' })}
          onUpdateTag={async (tag) => tag}
          onDeleteTag={async () => {}}
        />
      </StrictMode>,
    )

    const list = screen.getByRole('region', { name: 'Messages' })
    expect(
      within(list).getByRole('button', { name: /Unread: August invoice/ }),
    ).toBeVisible()
    expect(
      within(list).getByRole('button', { name: /Read: Welcome aboard/ }),
    ).toBeVisible()
    expect(within(list).getByText('orders')).toBeVisible()
    expect(within(list).getByText('support')).toBeVisible()
    expect(screen.queryByLabelText('Message inspector')).not.toBeInTheDocument()
  })
})
