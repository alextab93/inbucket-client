import { useEffect, useRef } from 'react'
import type { ViewName } from '../types'
import { NotificationMenu } from './NotificationMenu'

interface AppHeaderProps {
  authenticated: boolean
  username: string
  view: ViewName
  signingOut: boolean
  onViewChange: (view: ViewName) => void
  onSignOut: () => void
  onUnauthorized: () => void
}

const views: Array<{ value: ViewName; label: string }> = [
  { value: 'mailboxes', label: 'Mailboxes' },
  { value: 'starred', label: 'Starred' },
]

export const AppHeader = ({
  authenticated,
  username,
  view,
  signingOut,
  onViewChange,
  onSignOut,
  onUnauthorized,
}: AppHeaderProps) => {
  const accountMenuRef = useRef<HTMLDetailsElement>(null)
  const notificationMenuRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      for (const menu of [accountMenuRef.current, notificationMenuRef.current]) {
        if (menu?.open && !menu.contains(event.target as Node)) {
          menu.open = false
        }
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      for (const menu of [accountMenuRef.current, notificationMenuRef.current]) {
        if (!menu?.open) continue
        menu.open = false
        menu.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const changeMenuView = (nextView: ViewName) => {
    if (accountMenuRef.current) accountMenuRef.current.open = false
    onViewChange(nextView)
  }

  return (
    <header className="inbucket-header">
      <div className="container inbucket-header-content">
        <h1>Inbucket</h1>
        {authenticated ? (
          <>
            <nav className="inbucket-tabs" aria-label="Mailbox views">
              {views.map((option) => (
                <button
                  key={option.value}
                  className="inbucket-tab"
                  type="button"
                  aria-current={view === option.value ? 'page' : undefined}
                  onClick={() => onViewChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </nav>
            <div className="header-actions">
              <NotificationMenu
                ref={notificationMenuRef}
                active={authenticated}
                onUnauthorized={onUnauthorized}
                onOpen={() => {
                  if (accountMenuRef.current)
                    accountMenuRef.current.open = false
                }}
              />
              <details
                ref={accountMenuRef}
                className="account-menu"
                onToggle={(event) => {
                  if (
                    event.currentTarget.open &&
                    notificationMenuRef.current
                  )
                    notificationMenuRef.current.open = false
                }}
              >
                <summary>{username}</summary>
                <div className="account-menu-panel">
                  <button type="button" onClick={() => changeMenuView('rules')}>
                    Rules
                  </button>
                  <button type="button" onClick={() => changeMenuView('archive')}>
                    Archived
                  </button>
                  <button type="button" onClick={() => changeMenuView('trash')}>
                    Trash
                  </button>
                  <button type="button" disabled={signingOut} onClick={onSignOut}>
                    Sign out
                  </button>
                </div>
              </details>
            </div>
          </>
        ) : null}
      </div>
    </header>
  )
}
