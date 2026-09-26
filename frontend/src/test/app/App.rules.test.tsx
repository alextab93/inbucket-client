import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { session } from '../fixtures'
import { renderApp } from '../renderApp'
import type {
  NotificationDelivery,
  NotificationDestination,
  NotificationDestinationDefaults,
  MessageRule,
} from '../../types'

const rule: MessageRule = {
  id: 9,
  name: 'Order alerts',
  enabled: true,
  priority: 10,
  cooldown_seconds: 60,
  schema_version: 4,
  conditions: {
    mailboxes: ['orders'],
    senders: ['sales@example.com'],
    recipients: [],
    tag_ids: [],
    time_windows: [],
  },
  actions: {
    in_app: true,
    browser: false,
    destination_ids: [],
    star: false,
    mark_read: false,
    tag_ids: [],
    move_to_trash: false,
  },
  last_error_code: null,
  last_failed_at: null,
  summary: 'When mailbox, sender matches, notify by in-app, email.',
}

const handlers = (
  deliveries: NotificationDelivery[] = [
    {
      id: 4,
      rule_name: 'Order alerts',
      mailbox: 'orders',
      message_id: 'invoice-4',
      kind: 'in_app',
      status: 'delivered',
      recipient: null,
      created_at: '2026-09-24T12:00:00.000000Z',
      delivered_at: '2026-09-24T12:00:00.000000Z',
      read_at: null,
      error_code: null,
    },
  ],
  destinations: NotificationDestination[] = [],
  defaults: NotificationDestinationDefaults = {},
) => [
  http.get('*/v1/session', () => HttpResponse.json(session)),
  http.get('*/v1/tags', () => HttpResponse.json([])),
  http.get('*/v1/inbucket/mailboxes', () =>
    HttpResponse.json(['orders', 'support']),
  ),
  http.get('*/v1/notification_destinations', () =>
    HttpResponse.json({ destinations, defaults }),
  ),
  http.get('*/v1/rules', () =>
    HttpResponse.json({
      rules: [rule],
      lua: {
        desired_revision: 'revision',
        active_revision: 'revision',
        active: true,
        last_error_code: null,
        last_failed_at: null,
      },
    }),
  ),
  http.get('*/v1/notifications', () => HttpResponse.json(deliveries)),
  http.patch(
    '*/v1/notifications/:id/read',
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.patch(
    '*/v1/notifications/:id/clear',
    () => new HttpResponse(null, { status: 204 }),
  ),
]

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage?.clear()
  document.body.style.overflow = ''
  window.innerWidth = 1024
})

describe('Rules', () => {
  it('shows durable notifications in the global bell menu and keeps Rules focused on configuration', async () => {
    const user = userEvent.setup()
    renderApp(handlers(), '/?view=rules')

    expect(await screen.findByRole('heading', { name: 'Rules' })).toBeVisible()
    expect(
      await screen.findByRole('heading', { name: 'Order alerts' }),
    ).toBeVisible()
    expect(screen.queryByText('Generated Inbucket Lua')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Notification center' }),
    ).not.toBeInTheDocument()

    const bell = await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    })
    await user.click(bell)
    const menu = bell.closest('details')
    expect(menu).not.toBeNull()
    expect(await within(menu!).findByText(/invoice-4/)).toBeVisible()

    await user.click(within(menu!).getByRole('button', { name: 'Read' }))

    expect(bell).toHaveAccessibleName('Notifications')
    await user.click(within(menu!).getByRole('button', { name: 'Clear' }))

    expect(
      await within(menu!).findByText('No notifications yet.'),
    ).toBeVisible()
  })

  it('requests browser permission only after the user enables browser notifications', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    const shown = vi.fn()
    class BrowserNotification {
      static permission: NotificationPermission = 'default'
      static requestPermission = requestPermission

      constructor(...args: unknown[]) {
        shown(...args)
      }
    }
    vi.stubGlobal('Notification', BrowserNotification)
    const user = userEvent.setup()
    renderApp(
      handlers([
        {
          id: 5,
          rule_name: 'Order alerts',
          mailbox: 'orders',
          message_id: 'invoice-browser',
          kind: 'browser',
          status: 'pending',
          recipient: null,
          created_at: '2026-09-24T12:00:00.000000Z',
          delivered_at: null,
          read_at: null,
          error_code: null,
        },
      ]),
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    expect(requestPermission).not.toHaveBeenCalled()

    const bell = screen.getByRole('button', { name: /Notifications/ })
    await user.click(bell)
    await waitFor(() =>
      expect(bell).toHaveAccessibleName('Notifications, 1 unread'),
    )
    const browserSwitch = screen.getByRole('switch', {
      name: 'Browser notifications',
    })
    expect(browserSwitch).not.toBeChecked()
    await user.click(
      screen.getByRole('button', { name: 'About Browser notifications' }),
    )
    expect(
      screen.getByRole('tooltip', {
        name: /Show rule alerts through this browser/,
      }),
    ).toBeVisible()
    await user.click(browserSwitch)

    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(shown).toHaveBeenCalledTimes(1))
    expect(browserSwitch).toBeChecked()
    await user.click(browserSwitch)
    expect(browserSwitch).not.toBeChecked()
    expect(screen.getByText('Off')).toBeVisible()
  })

  it('keeps a browser delivery pending and shows a visible error when the browser rejects it', async () => {
    class BrowserNotification {
      static permission: NotificationPermission = 'granted'

      constructor() {
        throw new Error('browser rejected notification')
      }
    }
    vi.stubGlobal('Notification', BrowserNotification)
    const user = userEvent.setup()
    renderApp(
      handlers([
        {
          id: 6,
          rule_name: 'Order alerts',
          mailbox: 'orders',
          message_id: 'invoice-browser-failure',
          kind: 'browser',
          status: 'pending',
          recipient: null,
          created_at: '2026-09-24T12:00:00.000000Z',
          delivered_at: null,
          read_at: null,
          error_code: null,
        },
      ]),
      '/?view=rules',
    )

    expect(
      await screen.findAllByText(
        'The browser notification could not be loaded. Please try again.',
      ),
    ).not.toHaveLength(0)
    const bell = screen.getByRole('button', {
      name: 'Notifications, 1 unread',
    })
    await user.click(bell)
    expect(
      within(bell.closest('details')!).getByText(/invoice-browser-failure/),
    ).toBeVisible()
  })

  it('cancels a rule edit without keeping the draft', async () => {
    const user = userEvent.setup()
    renderApp(handlers(), '/?view=rules')

    await screen.findByRole('heading', { name: 'Order alerts' })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Discard this draft')
    await user.click(screen.getByRole('button', { name: 'Cancel edit' }))

    expect(screen.getByRole('heading', { name: 'New rule' })).toBeVisible()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByRole('heading', { name: 'Order alerts' })).toBeVisible()
  })

  it('advances an edited rule to Actions without resetting its draft', async () => {
    const user = userEvent.setup()
    renderApp(handlers(), '/?view=rules')

    await screen.findByRole('heading', { name: 'Order alerts' })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('group', { name: 'Match conditions' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('group', { name: 'Actions' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Edit rule' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Basics$/ }))
    expect(screen.getByLabelText('Name')).toHaveValue('Order alerts')
  })

  it('builds a rule through keyboard-operable steps and tokenized filters', async () => {
    const submitted: unknown[] = []
    const created: Array<Record<string, unknown>> = []
    const user = userEvent.setup()
    window.innerWidth = 390
    renderApp(
      [
        ...handlers(),
        http.post('*/v1/rules/preview', async ({ request }) => {
          submitted.push(await request.json())
          return HttpResponse.json({
            matches: [],
            inspected: 12,
            incomplete: false,
          })
        }),
        http.post('*/v1/rules', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          created.push(body)
          return HttpResponse.json(
            {
              id: 10,
              ...body,
              last_error_code: null,
              last_failed_at: null,
              summary: 'When mailbox and sender match, star the message.',
            },
            { status: 201 },
          )
        }),
      ],
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    await user.type(screen.getByLabelText('Name'), 'Sales alert')
    await user.click(screen.getByRole('button', { name: 'About Cooldown' }))
    expect(
      screen.getByRole('tooltip', { name: /Minimum seconds after this rule/ }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(created).toHaveLength(0)
    await user.click(
      screen.getByText('Mailboxes', {
        selector: '.rule-condition-accordions strong',
      }),
    )
    const mailbox = screen.getByRole('checkbox', { name: 'orders' })
    mailbox.focus()
    await user.keyboard(' ')
    expect(mailbox).toBeChecked()
    await user.click(screen.getByText('Addresses'))
    await user.type(screen.getByLabelText('Senders'), 'sales@example.com,')

    expect(
      screen.getByRole('list', { name: 'Senders values' }),
    ).toHaveTextContent('sales@example.com')
    const removeSender = screen.getByRole('button', {
      name: 'Remove sales@example.com',
    })
    removeSender.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.queryByRole('list', { name: 'Senders values' }),
    ).not.toBeInTheDocument()
    await user.type(
      screen.getByLabelText('Senders'),
      'sales@example.com{Enter}',
    )

    await user.click(
      screen.getByText('Schedule', {
        selector: '.rule-condition-accordions strong',
      }),
    )
    expect(
      screen.getByText(/Times use UTC. Select the days on which each window/),
    ).toBeVisible()
    expect(screen.getByText(/Browser timezone:/)).toBeVisible()
    expect(screen.getByLabelText('Start')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '14:00' },
    })
    expect(screen.getByText(/Local:/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Preview matches' }))

    await waitFor(() => expect(submitted).toHaveLength(1))
    expect(submitted[0]).toMatchObject({
      name: 'Sales alert',
      conditions: { mailboxes: ['orders'], senders: ['sales@example.com'] },
    })
    const previewDialog = screen.getByRole('dialog', {
      name: 'Matching messages',
    })
    expect(previewDialog).toBeVisible()
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(
      within(previewDialog).getByRole('button', {
        name: 'Close matching messages',
      }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    await user.click(screen.getByRole('button', { name: 'Preview matches' }))
    const reopenedPreview = await screen.findByRole('dialog', {
      name: 'Matching messages',
    })
    fireEvent.mouseDown(reopenedPreview.parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(created).toHaveLength(0)
    expect(screen.getByRole('group', { name: 'Actions' })).toBeVisible()
    expect(screen.getByText('Send a notification')).toBeVisible()
    expect(screen.getByText('Star the message')).toBeVisible()
    expect(screen.getByText('Mark as read')).toBeVisible()
    expect(screen.getByText('Move to Trash')).toBeVisible()
    expect(
      screen.getByRole('checkbox', { name: /Send a notification/ }),
    ).not.toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: /Move to Trash/ }))
    await user.click(screen.getByRole('button', { name: 'Save rule' }))

    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({
      actions: {
        in_app: false,
        browser: false,
        destination_ids: [],
        star: false,
        mark_read: false,
        tag_ids: [],
        move_to_trash: true,
      },
    })
  })

  it('saves a rule with no match conditions for every new message', async () => {
    const created: Array<Record<string, unknown>> = []
    const user = userEvent.setup()
    renderApp(
      [
        ...handlers(),
        http.post('*/v1/rules', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          created.push(body)
          return HttpResponse.json(
            {
              id: 10,
              ...body,
              last_error_code: null,
              last_failed_at: null,
              summary: 'When any message matches, send a notification.',
            },
            { status: 201 },
          )
        }),
      ],
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    await user.type(screen.getByLabelText('Name'), 'Every new message')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(
      screen.getByText(/Leave every group empty to match every new message/),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(
      screen.getByRole('checkbox', { name: /Send a notification/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Save rule' }))

    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({
      name: 'Every new message',
      conditions: {
        mailboxes: [],
        senders: [],
        recipients: [],
        tag_ids: [],
        time_windows: [],
      },
    })
  })

  it('previews conditions without requiring a rule name', async () => {
    const submitted: unknown[] = []
    const user = userEvent.setup()
    renderApp(
      [
        ...handlers(),
        http.post('*/v1/rules/preview', async ({ request }) => {
          submitted.push(await request.json())
          return HttpResponse.json({
            matches: [],
            inspected: 12,
            incomplete: false,
          })
        }),
      ],
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    await user.click(
      screen.getByRole('button', { name: '2 Match messages' }),
    )
    const previewButton = screen.getByRole('button', {
      name: 'Preview matches',
    })
    expect(previewButton).toBeEnabled()
    await user.click(previewButton)

    await waitFor(() => expect(submitted).toHaveLength(1))
    expect(submitted[0]).toMatchObject({
      name: '',
      conditions: {
        mailboxes: [],
        senders: [],
        recipients: [],
        tag_ids: [],
        time_windows: [],
      },
    })
  })

  it('shows a field validation error when a rule name is already in use', async () => {
    const user = userEvent.setup()
    renderApp(
      [
        ...handlers(),
        http.post('*/v1/rules', () =>
          HttpResponse.json(
            { error: 'invalid_rule', fields: { name: ['has already been taken'] } },
            { status: 422 },
          ),
        ),
      ],
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    await user.type(screen.getByLabelText('Name'), 'Order alerts')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(
      screen.getByRole('checkbox', { name: /Send a notification/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Save rule' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'name: has already been taken',
    )
  })

  it('creates a reusable destination with multiple delivery methods', async () => {
    const submitted: Array<Record<string, unknown>> = []
    const user = userEvent.setup()
    renderApp(
      [
        ...handlers(),
        http.post('*/v1/notification_destinations', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          submitted.push(body)
          return HttpResponse.json({ id: 8, ...body }, { status: 201 })
        }),
      ],
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    expect(
      screen.queryByRole('button', { name: 'New destination' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '3 Actions' }))
    await user.click(
      screen.getByRole('checkbox', { name: /Send a notification/ }),
    )
    await user.click(screen.getByRole('button', { name: 'New destination' }))
    expect(
      screen.getByRole('dialog', { name: 'New destination' }),
    ).toBeVisible()
    expect(screen.getByLabelText('ntfy host')).toHaveValue('')
    await user.type(screen.getByLabelText('Destination name'), 'Operations')
    await user.clear(screen.getByLabelText('ntfy host'))
    await user.type(
      screen.getByLabelText('ntfy host'),
      'https://ntfy.example.com',
    )
    await user.type(screen.getByLabelText('Topic'), 'alerts')
    await user.type(screen.getByLabelText('ntfy access token'), 'tk_test')
    await user.click(
      screen.getByRole('button', { name: 'Add or replace method' }),
    )
    await user.selectOptions(
      screen.getByLabelText('Delivery method'),
      'webhook',
    )
    await user.type(
      screen.getByLabelText('Webhook URL'),
      'https://hooks.example.com/inbucket',
    )
    await user.click(
      screen.getByRole('button', { name: 'Add or replace method' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save destination' }))

    await waitFor(() => expect(submitted).toHaveLength(1))
    expect(submitted[0]).toMatchObject({
      name: 'Operations',
      methods: [{ kind: 'ntfy', token: 'tk_test' }, { kind: 'webhook' }],
    })
    await user.click(screen.getByRole('button', { name: 'New destination' }))
    expect(screen.getByLabelText('ntfy host')).toHaveValue(
      'https://ntfy.example.com',
    )
    await user.selectOptions(
      screen.getByLabelText('Delivery method'),
      'webhook',
    )
    expect(screen.getByLabelText('Webhook URL')).toHaveValue(
      'https://hooks.example.com/inbucket',
    )
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New destination' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('prefills the most recently saved ntfy host and webhook URL', async () => {
    const user = userEvent.setup()
    renderApp(
      handlers(undefined, [], {
        ntfy_host: 'https://ntfy.recent.example.com',
        webhook_url: 'https://hooks.recent.example.com/inbucket',
      }),
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    await user.click(screen.getByRole('button', { name: '3 Actions' }))
    await user.click(
      screen.getByRole('checkbox', { name: /Send a notification/ }),
    )
    await user.click(screen.getByRole('button', { name: 'New destination' }))
    expect(await screen.findByLabelText('ntfy host')).toHaveValue(
      'https://ntfy.recent.example.com',
    )

    await user.selectOptions(
      screen.getByLabelText('Delivery method'),
      'webhook',
    )

    expect(screen.getByLabelText('Webhook URL')).toHaveValue(
      'https://hooks.recent.example.com/inbucket',
    )
  })

  it('loads each configured method when editing a destination', async () => {
    const user = userEvent.setup()
    const updates: Array<Record<string, unknown>> = []
    const destination: NotificationDestination = {
      id: 8,
      name: 'Operations',
      methods: [
        {
          kind: 'ntfy',
          host: 'https://ntfy.example.com',
          topic: 'alerts',
        },
        {
          kind: 'webhook',
          url: 'https://hooks.example.com/inbucket',
          method: 'PATCH',
          headers: [{ name: 'Authorization', value: 'Bearer private' }],
          body: '{"source":"inbucket"}',
        },
      ],
    }
    renderApp(
      [
        ...handlers(undefined, [destination]),
        http.patch(
          '*/v1/notification_destinations/:id',
          async ({ request }) => {
            const body = (await request.json()) as Record<string, unknown>
            updates.push(body)
            return HttpResponse.json({ id: destination.id, ...body })
          },
        ),
      ],
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    await user.click(screen.getByRole('button', { name: '3 Actions' }))
    await user.click(
      screen.getByRole('checkbox', { name: /Send a notification/ }),
    )
    const destinationItem = (await screen.findByText('Operations')).closest(
      'li',
    )
    expect(destinationItem).not.toBeNull()
    await user.click(
      within(destinationItem!).getByRole('button', { name: 'Edit' }),
    )

    expect(
      screen.getByRole('dialog', { name: 'Edit destination' }),
    ).toBeVisible()

    expect(screen.getByLabelText('Destination name')).toHaveValue('Operations')
    expect(screen.getByLabelText('ntfy host')).toHaveValue(
      'https://ntfy.example.com',
    )
    expect(screen.getByLabelText('Topic')).toHaveValue('alerts')
    expect(
      screen.getByPlaceholderText(
        'Enter a replacement token, or leave blank to keep the saved token',
      ),
    ).toHaveValue('')
    expect(
      screen.getByRole('tooltip', {
        name: 'Saved access tokens are never shown.',
      }),
    ).toBeInTheDocument()

    await user.selectOptions(
      screen.getByLabelText('Delivery method'),
      'webhook',
    )

    expect(screen.getByLabelText('Webhook URL')).toHaveValue(
      'https://hooks.example.com/inbucket',
    )
    expect(screen.getByLabelText('HTTP method')).toHaveValue('PATCH')
    expect(
      (screen.getByLabelText('Headers as JSON') as HTMLTextAreaElement).value,
    ).toContain('Bearer private')
    expect(screen.getByLabelText('Request body')).toHaveValue(
      '{"source":"inbucket"}',
    )
    fireEvent.change(screen.getByLabelText('Request body'), {
      target: { value: '{"source":"rules"}' },
    })
    await user.click(screen.getByRole('button', { name: 'Save destination' }))

    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toMatchObject({
      name: 'Operations',
      methods: [
        { kind: 'ntfy', host: 'https://ntfy.example.com', topic: 'alerts' },
        {
          kind: 'webhook',
          url: 'https://hooks.example.com/inbucket',
          method: 'PATCH',
          body: '{"source":"rules"}',
        },
      ],
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selects compact destination rows and sends tests from the edit dialog', async () => {
    const user = userEvent.setup()
    const tested: string[] = []
    const destination: NotificationDestination = {
      id: 12,
      name: 'Alex',
      methods: [
        { kind: 'email', recipients: ['alex@example.com'] },
        {
          kind: 'ntfy',
          host: 'https://ntfy.example.com',
          topic: 'alex-alerts',
        },
        {
          kind: 'webhook',
          url: 'https://hooks.example.com/inbucket?token=private',
          method: 'POST',
          headers: [{ name: 'Authorization', value: 'Bearer private' }],
          body: '',
        },
      ],
    }
    renderApp(
      [
        ...handlers(undefined, [destination]),
        http.post(
          '*/v1/notification_destinations/:id/test',
          async ({ request }) => {
            const body = (await request.json()) as { kind: string }
            tested.push(body.kind)
            const label =
              body.kind === 'ntfy'
                ? 'ntfy'
                : body.kind[0].toUpperCase() + body.kind.slice(1)
            return HttpResponse.json({
              kind: body.kind,
              message: `Test ${label} notification sent.`,
            })
          },
        ),
      ],
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    await user.click(screen.getByRole('button', { name: '3 Actions' }))
    await user.click(
      screen.getByRole('checkbox', { name: /Send a notification/ }),
    )
    await screen.findByText('Alex')
    expect(screen.queryByLabelText('Destination name')).not.toBeInTheDocument()
    const selection = screen.getByRole('checkbox', {
      name: 'Use Alex destination',
    })
    expect(selection).not.toBeChecked()
    await user.click(selection)
    expect(selection).toBeChecked()
    const destinationItem = screen.getByText('Alex').closest('li')
    expect(destinationItem).not.toBeNull()
    expect(within(destinationItem!).getByText('Email')).toBeVisible()
    expect(within(destinationItem!).getByText('ntfy')).toBeVisible()
    expect(within(destinationItem!).getByText('Webhook')).toBeVisible()
    await user.click(
      within(destinationItem!).getByRole('button', { name: 'Edit' }),
    )
    const editor = screen.getByRole('dialog', { name: 'Edit destination' })

    for (const label of ['Email', 'ntfy', 'Webhook']) {
      await user.click(
        within(editor).getByRole('button', { name: `Send ${label} test` }),
      )
      await waitFor(() => expect(tested).toContain(label.toLowerCase()))
    }

    expect(tested).toEqual(['email', 'ntfy', 'webhook'])
    expect(
      await screen.findByText('Test Webhook notification sent.'),
    ).toBeVisible()
  })

  it('explains when ntfy denies a test publish', async () => {
    const user = userEvent.setup()
    const destination: NotificationDestination = {
      id: 12,
      name: 'Protected ntfy',
      methods: [
        {
          kind: 'ntfy',
          host: 'https://ntfy.example.com',
          topic: 'protected',
        },
      ],
    }
    renderApp(
      [
        ...handlers(undefined, [destination]),
        http.post('*/v1/notification_destinations/:id/test', () =>
          HttpResponse.json({ error: 'ntfy_forbidden' }, { status: 502 }),
        ),
      ],
      '/?view=rules',
    )

    await screen.findByRole('heading', { name: 'Rules' })
    await user.click(screen.getByRole('button', { name: '3 Actions' }))
    await user.click(
      screen.getByRole('checkbox', { name: /Send a notification/ }),
    )
    await screen.findByText('Protected ntfy')
    const destinationItem = screen.getByText('Protected ntfy').closest('li')
    expect(destinationItem).not.toBeNull()
    await user.click(
      within(destinationItem!).getByRole('button', { name: 'Edit' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Send ntfy test' }),
    )

    expect(
      await screen.findByText(
        'ntfy rejected this test. Check that its access token can publish to this topic.',
      ),
    ).toBeVisible()
  })
})
