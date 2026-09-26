import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { api, isUnauthorized, visibleError } from '../api'
import { showToast } from '../toast'
import type { NotificationDelivery } from '../types'
import { InfoTooltip } from './InfoTooltip'

interface NotificationMenuProps {
  active: boolean
  onOpen: () => void
  onUnauthorized: () => void
}

const formatTime = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const browserNotificationsPreferenceKey = 'inbucket-browser-notifications'

const savedBrowserNotificationsPreference = (): boolean | null => {
  try {
    const value = window.localStorage.getItem(browserNotificationsPreferenceKey)
    return value === null ? null : value === 'true'
  } catch {
    return null
  }
}

export const NotificationMenu = forwardRef<
  HTMLDetailsElement,
  NotificationMenuProps
>(({ active, onOpen, onUnauthorized }, ref) => {
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof Notification === 'undefined'
      ? 'unsupported'
      : Notification.permission,
  )
  const [browserEnabled, setBrowserEnabled] = useState(() => {
    if (
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    )
      return false

    return savedBrowserNotificationsPreference() ?? true
  })
  const announcedBrowserDeliveries = useRef(new Set<number>())

  const load = useCallback(async () => {
    if (!active) return
    setLoading(true)
    try {
      setDeliveries(await api.notifications())
      setError('')
    } catch (loadError) {
      if (isUnauthorized(loadError)) return onUnauthorized()
      setError(visibleError(loadError, 'Notifications'))
    } finally {
      setLoading(false)
    }
  }, [active, onUnauthorized])

  useEffect(() => {
    if (active) {
      void load()
    } else {
      setDeliveries([])
      setError('')
      announcedBrowserDeliveries.current.clear()
    }
  }, [active, load])

  const pendingBrowserDeliveries = useMemo(
    () =>
      deliveries.filter(
        (delivery) =>
          delivery.kind === 'browser' && delivery.status === 'pending',
      ),
    [deliveries],
  )

  useEffect(() => {
    if (
      permission !== 'granted' ||
      !browserEnabled ||
      !pendingBrowserDeliveries.length
    )
      return

    const deliver = async () => {
      for (const delivery of pendingBrowserDeliveries) {
        if (announcedBrowserDeliveries.current.has(delivery.id)) continue

        announcedBrowserDeliveries.current.add(delivery.id)
        try {
          new Notification('Inbucket notification', {
            body: `${delivery.rule_name}: ${delivery.mailbox}`,
            tag: `inbucket-${delivery.id}`,
          })
          await api.markBrowserNotificationDelivered(delivery.id)
          setDeliveries((current) =>
            current.map((candidate) =>
              candidate.id === delivery.id
                ? {
                    ...candidate,
                    status: 'delivered',
                    delivered_at: new Date().toISOString(),
                  }
                : candidate,
            ),
          )
        } catch (deliveryError) {
          announcedBrowserDeliveries.current.delete(delivery.id)
          if (isUnauthorized(deliveryError)) return onUnauthorized()
          const message = visibleError(
            deliveryError,
            'The browser notification',
          )
          setError(message)
          showToast(message, 'error')
        }
      }
    }

    void deliver()
  }, [browserEnabled, permission, pendingBrowserDeliveries, onUnauthorized])

  const updateDelivery = (updated: NotificationDelivery) =>
    setDeliveries((current) =>
      current.map((delivery) =>
        delivery.id === updated.id ? updated : delivery,
      ),
    )

  const markRead = async (delivery: NotificationDelivery) => {
    try {
      await api.markNotificationRead(delivery.id)
      updateDelivery({ ...delivery, read_at: new Date().toISOString() })
    } catch (readError) {
      if (isUnauthorized(readError)) return onUnauthorized()
      const message = visibleError(readError, 'The notification')
      setError(message)
      showToast(message, 'error')
    }
  }

  const clear = async (delivery: NotificationDelivery) => {
    try {
      await api.clearNotification(delivery.id)
      setDeliveries((current) =>
        current.filter((candidate) => candidate.id !== delivery.id),
      )
    } catch (clearError) {
      if (isUnauthorized(clearError)) return onUnauthorized()
      const message = visibleError(clearError, 'The notification')
      setError(message)
      showToast(message, 'error')
    }
  }

  const retry = async (delivery: NotificationDelivery) => {
    try {
      updateDelivery(await api.retryNotification(delivery.id))
      showToast('Notification delivery queued for retry.', 'success')
    } catch (retryError) {
      if (isUnauthorized(retryError)) return onUnauthorized()
      const message = visibleError(retryError, 'The notification delivery')
      setError(message)
      showToast(message, 'error')
    }
  }

  const setBrowserNotificationPreference = (enabled: boolean) => {
    setBrowserEnabled(enabled)
    try {
      window.localStorage.setItem(
        browserNotificationsPreferenceKey,
        String(enabled),
      )
    } catch {
      return
    }
  }

  const updateBrowserNotifications = async (enabled: boolean) => {
    if (!enabled) return setBrowserNotificationPreference(false)
    if (typeof Notification === 'undefined') return
    if (permission === 'granted') return setBrowserNotificationPreference(true)
    if (permission !== 'default') return

    const nextPermission = await Notification.requestPermission()
    setPermission(nextPermission)
    if (nextPermission === 'granted') setBrowserNotificationPreference(true)
  }

  const unreadCount = deliveries.filter((delivery) => !delivery.read_at).length
  const canControlBrowserNotifications =
    permission === 'default' || permission === 'granted'
  const browserStatus =
    permission === 'granted'
      ? browserEnabled
        ? 'Enabled'
        : 'Off'
      : permission === 'denied'
        ? 'Blocked in browser settings'
        : permission === 'unsupported'
          ? 'Unavailable in this browser'
          : 'Off'

  return (
    <details
      ref={ref}
      className="notification-menu"
      onToggle={(event) => {
        if (!event.currentTarget.open) return
        onOpen()
        void load()
      }}
    >
      <summary
        role="button"
        aria-label={
          unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount ? (
          <span className="notification-menu-count">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </summary>
      <div className="notification-menu-panel">
        <div className="notification-menu-heading">
          <div>
            <h2>Notifications</h2>
            <p>
              {unreadCount ? `${unreadCount} unread` : 'You are all caught up'}
            </p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
        <section
          className="notification-browser-config"
          aria-labelledby="browser-notification-title"
        >
          <div className="notification-browser-label">
            <h3 id="browser-notification-title">Browser notifications</h3>
            <InfoTooltip label="Browser notifications">
              Show rule alerts through this browser while Inbucket is open. Turn
              this on to ask your browser for permission. You can turn alerts
              off here after permission is granted. Browser settings control the
              permission itself.
            </InfoTooltip>
          </div>
          <div className="notification-browser-switch">
            <label>
              <input
                type="checkbox"
                role="switch"
                aria-label="Browser notifications"
                checked={permission === 'granted' && browserEnabled}
                disabled={!canControlBrowserNotifications}
                onChange={(event) =>
                  void updateBrowserNotifications(event.target.checked)
                }
              />
              <span aria-hidden="true" />
            </label>
            <small>{browserStatus}</small>
          </div>
        </section>
        {error ? (
          <p className="notification-menu-error" role="alert">
            {error}
          </p>
        ) : null}
        {deliveries.length ? (
          <ul className="notification-delivery-list">
            {deliveries.map((delivery) => (
              <li
                key={delivery.id}
                className={delivery.read_at ? 'is-read' : ''}
              >
                <div>
                  <strong>{delivery.rule_name}</strong>
                  <span>
                    {delivery.mailbox} · {delivery.message_id}
                  </span>
                  <span>
                    {delivery.kind} · {delivery.status} ·{' '}
                    {formatTime(delivery.created_at)}
                  </span>
                  {delivery.error_code ? (
                    <span>Delivery needs attention.</span>
                  ) : null}
                </div>
                <div className="notification-delivery-actions">
                  {!delivery.read_at ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => void markRead(delivery)}
                    >
                      Read
                    </button>
                  ) : null}
                  {['email', 'ntfy', 'webhook'].includes(delivery.kind) &&
                  (delivery.status === 'failed' ||
                    delivery.status === 'disabled') ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => void retry(delivery)}
                    >
                      Retry
                    </button>
                  ) : null}
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void clear(delivery)}
                  >
                    Clear
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : loading ? (
          <p className="notification-menu-empty">Loading notifications.</p>
        ) : (
          <p className="notification-menu-empty">No notifications yet.</p>
        )}
      </div>
    </details>
  )
})

NotificationMenu.displayName = 'NotificationMenu'
